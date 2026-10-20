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
  imports: [PrismaModule, ArtifactsModule, AssetsModule, DeliveryModule],
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
      useFactory: () => {
        if (process.env.MODEL_PORT_MODE === "deepseek") {
          const apiKey = process.env.DEEPSEEK_API_KEY;
          if (apiKey === undefined || apiKey === "") {
            throw new Error(
              "MODEL_PORT_MODE=deepseek requires DEEPSEEK_API_KEY environment variable",
            );
          }
          return new DeepSeekModelPort({
            apiKey,
            ...(process.env.DEEPSEEK_BASE_URL !== undefined
              ? { baseUrl: process.env.DEEPSEEK_BASE_URL }
              : {}),
            ...(process.env.DEEPSEEK_MODEL !== undefined ? { model: process.env.DEEPSEEK_MODEL } : {}),
          });
        }
        return process.env.MODEL_PORT_MODE === "fake"
          ? new DeterministicFakeModelPort()
          : DEFAULT_MODEL_PORT;
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
