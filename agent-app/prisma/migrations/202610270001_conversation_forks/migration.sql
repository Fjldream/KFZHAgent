-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代
CREATE TABLE "ConversationForkRequest" (
  "id" TEXT NOT NULL,
  "tenantId" TEXT NOT NULL,
  "sourceConversationId" TEXT NOT NULL,
  "clientRequestId" TEXT NOT NULL,
  "requestHash" TEXT NOT NULL,
  "resultConversationId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConversationForkRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConversationForkRequest_scope_request_key"
  ON "ConversationForkRequest"("tenantId", "sourceConversationId", "clientRequestId");
CREATE INDEX "ConversationForkRequest_tenantId_resultConversationId_idx"
  ON "ConversationForkRequest"("tenantId", "resultConversationId");
ALTER TABLE "ConversationForkRequest" ADD CONSTRAINT "ConversationForkRequest_source_fkey"
  FOREIGN KEY ("tenantId", "sourceConversationId") REFERENCES "Conversation"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConversationForkRequest" ADD CONSTRAINT "ConversationForkRequest_result_fkey"
  FOREIGN KEY ("tenantId", "resultConversationId") REFERENCES "Conversation"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
-- end
