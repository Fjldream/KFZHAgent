// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { Module } from "@nestjs/common";
import { ChangePlanController } from "./change-plan.controller.js";
import { ConversationController } from "./conversation.controller.js";
import { ConversationService } from "./conversation.service.js";
import { ConversationRuntimeModule } from "./conversation-runtime.module.js";

@Module({
  // 图相关 providers 已迁到 ConversationRuntimeModule，API 与 worker 共用同一套；
  // 依赖方向固定为 ConversationsModule → RuntimeModule，后者不反向依赖。
  imports: [ConversationRuntimeModule],
  controllers: [ConversationController, ChangePlanController],
  providers: [ConversationService],
  exports: [ConversationService],
})
export class ConversationsModule {}
// end
