-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代
-- T07：老会话的 lastActivityAt 不能用迁移时间冒充活动时间。
-- 有消息的取最后一条消息时间，没有消息的退回会话创建时间。纯数据回填，不改结构。
UPDATE "Conversation" AS c
SET "lastActivityAt" = COALESCE(
  (SELECT MAX(m."createdAt") FROM "Message" AS m WHERE m."conversationId" = c."id"),
  c."createdAt"
);
-- end
