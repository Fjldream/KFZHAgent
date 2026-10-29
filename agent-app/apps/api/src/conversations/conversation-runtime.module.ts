// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { Module } from "@nestjs/common";
import { ArtifactsModule } from "../artifacts/artifacts.module.js";
import { AssetsModule } from "../assets/assets.module.js";
import { DeliveryModule } from "../delivery/delivery.module.js";
import { PrismaModule } from "../prisma/prisma.module.js";
import { AssetService } from "../assets/asset.service.js";
import { ARTIFACT_STORAGE } from "../artifacts/artifact-storage.js";
import { PrismaService } from "../prisma/prisma.service.js";
import type { ArtifactStorage } from "@kf/artifact-storage";
import { DeepSeekModelPort } from "./deepseek-model.js";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { resolveModelRoutes } from "../models/model-config.js";
// end
import { DeterministicFakeModelPort } from "./fake-model.js";
import { DEFAULT_MODEL_PORT, MODEL_PORT } from "./model-port.js";
import {
  CAPABILITY_RETRIEVAL_PORT,
  CREATIVE_SOLUTION_COMPILER_PORT,
  LOCAL_CAPABILITY_RETRIEVAL_PORT,
  createCreativeSolutionCompilerFromEnvironment,
} from "./graph-ports.js";
import {
  CONVERSATION_TURN_LEASE,
  createConversationTurnLeaseManagerFromEnvironment,
} from "./conversation-turn-lease.js";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { ReferenceAssetsModule } from "../vision/reference-assets.module.js";
import { VISUAL_PLANNING_RUNTIME, composeVisualBlueprintModel, type VisualPlanningRuntime } from "../vision/visual-blueprint-runtime.js";
import type { ModelPort } from "@kf/agent-orchestrator";
// end

/**
 * 图运行所需的可复用 providers（不含 HTTP controller）。
 *
 * 拆分目的：API 进程与独立的 agent worker 进程需要同一套图依赖，
 * 但 worker 不启动 controller、也不轮询 build-job。依赖方向固定为
 * ConversationsModule → ConversationRuntimeModule，runtime 不反向依赖前者，
 * 避免循环依赖与「worker 里意外起 HTTP」。
 */
@Module({
    // PrismaModule 是 @Global，但只在注册它的根模块内全局；worker 用独立上下文启动，
  // 必须显式 import，否则 DeliverySnapshotService 解析不到 PrismaService。
  imports: [PrismaModule, ArtifactsModule, AssetsModule, DeliveryModule, ReferenceAssetsModule],
  providers: [
    {
      provide: CONVERSATION_TURN_LEASE,
      useFactory: createConversationTurnLeaseManagerFromEnvironment,
    },
    {
      provide: CAPABILITY_RETRIEVAL_PORT,
      useValue: LOCAL_CAPABILITY_RETRIEVAL_PORT,
    },
    {
      provide: CREATIVE_SOLUTION_COMPILER_PORT,
      inject: [PrismaService, ARTIFACT_STORAGE, AssetService],
      useFactory: (
        prisma: PrismaService,
        storage: ArtifactStorage,
        assets: AssetService,
      ) => createCreativeSolutionCompilerFromEnvironment(prisma, storage, assets),
    },
    {
      provide: MODEL_PORT,
      // 默认 stub 抛 ModelPortNotConfiguredError（不产生任何计划）；
      // `MODEL_PORT_MODE=fake` 注入确定性演示模型（E2E / 演示环境）；
      // `MODEL_PORT_MODE=deepseek` 注入真实 DeepSeek LLM（需 DEEPSEEK_API_KEY）。
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      inject: [VISUAL_PLANNING_RUNTIME],
      useFactory: (visual: VisualPlanningRuntime) => {
        let base: ModelPort;
      // end
        if (process.env.MODEL_PORT_MODE === "deepseek") {
          const apiKey = process.env.DEEPSEEK_API_KEY;
          if (apiKey === undefined || apiKey === "") {
            throw new Error(
              "MODEL_PORT_MODE=deepseek requires DEEPSEEK_API_KEY environment variable",
            );
          }
          base = new DeepSeekModelPort({
            apiKey,
            // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
            timeoutMs: resolveModelRoutes(process.env).implementation.timeoutMs,
            semanticPlanningThinking: resolveModelRoutes(process.env).implementation.supportsThinking,
            // end
            ...(process.env.DEEPSEEK_BASE_URL !== undefined
              ? { baseUrl: process.env.DEEPSEEK_BASE_URL }
              : {}),
            ...(process.env.DEEPSEEK_MODEL !== undefined ? { model: process.env.DEEPSEEK_MODEL } : {}),
          });
        } else {
          base = process.env.MODEL_PORT_MODE === "fake" ? new DeterministicFakeModelPort() : DEFAULT_MODEL_PORT;
        }
        // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
        return composeVisualBlueprintModel(base, visual.blueprints, visual.semantics);
        // end
      },
    },
  ],
  exports: [
    // 透出被 import 的模块：ConversationService 仍依赖其中的 PG_POOL / ARTIFACT_STORAGE 等 token，
    // 拆分后若不 re-export，ConversationsModule 会解析不到这些依赖。
    ArtifactsModule,
    AssetsModule,
    DeliveryModule,
    CONVERSATION_TURN_LEASE,
    CAPABILITY_RETRIEVAL_PORT,
    CREATIVE_SOLUTION_COMPILER_PORT,
    MODEL_PORT,
  ],
})
export class ConversationRuntimeModule {}
// end
