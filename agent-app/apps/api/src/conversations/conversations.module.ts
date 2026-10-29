// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { Module } from "@nestjs/common";
import { ChangePlanController } from "./change-plan.controller.js";
import { ConversationController } from "./conversation.controller.js";
import { ConversationService } from "./conversation.service.js";
import { ConversationRuntimeModule } from "./conversation-runtime.module.js";

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { ConversationV2Controller } from "./conversation-v2.controller.js";
import { ConversationQueryService } from "./conversation-query.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ConversationHistoryService } from "./conversation-history.service.js";
import { ConversationForkController, RevisionHistoryController } from "./conversation-history.controller.js";
// end

@Module({
  // 图相关 providers 已迁到 ConversationRuntimeModule，API 与 worker 共用同一套；
  // 依赖方向固定为 ConversationsModule → RuntimeModule，后者不反向依赖。
  imports: [ConversationRuntimeModule],
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  controllers: [ConversationController, ConversationV2Controller, ConversationForkController, RevisionHistoryController, ChangePlanController],
  // end
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  providers: [ConversationService, ConversationHistoryService, { provide: ConversationQueryService, inject: [PrismaService], useFactory: (prisma: PrismaService) => new ConversationQueryService(prisma) }],
  // end
  exports: [ConversationService],
})
export class ConversationsModule {}
// end
