-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代
-- T05 会话长期记忆：纯新增可空列，旧行不受影响；summary 旧字段保留。
ALTER TABLE "Conversation" ADD COLUMN     "memory" JSONB,
ADD COLUMN     "memoryThroughMessageId" TEXT;
-- end
