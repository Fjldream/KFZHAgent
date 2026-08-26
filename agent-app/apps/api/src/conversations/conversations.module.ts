import { Module } from "@nestjs/common";
import { ChangePlanController } from "./change-plan.controller.js";
import { ConversationController } from "./conversation.controller.js";
import { ConversationService } from "./conversation.service.js";
import { DEFAULT_MODEL_PORT, MODEL_PORT } from "./model-port.js";
import { DeterministicFakeModelPort } from "./fake-model.js";
import { DeepSeekModelPort } from "./deepseek-model.js";
import { ArtifactsModule } from "../artifacts/artifacts.module.js";
import { AssetsModule } from "../assets/assets.module.js";
import { DeliveryModule } from "../delivery/delivery.module.js";
import {
  CAPABILITY_RETRIEVAL_PORT,
  CREATIVE_SOLUTION_COMPILER_PORT,
  LOCAL_CAPABILITY_RETRIEVAL_PORT,
  createCreativeSolutionCompilerFromEnvironment,
} from "./graph-ports.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ARTIFACT_STORAGE } from "../artifacts/artifact-storage.js";
import type { ArtifactStorage } from "@kf/artifact-storage";
import { AssetService } from "../assets/asset.service.js";
import {
  CONVERSATION_TURN_LEASE,
  createConversationTurnLeaseManagerFromEnvironment,
} from "./conversation-turn-lease.js";

@Module({
  imports: [ArtifactsModule, AssetsModule, DeliveryModule],
  controllers: [ConversationController, ChangePlanController],
  providers: [
    ConversationService,
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
  exports: [ConversationService],
})
export class ConversationsModule {}
