-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代
-- T07 持久 run/event/step：新增三表 + Conversation/Message 可空列 + 复合唯一键与外键。
-- 不改 generationWorkflow，不回填任何虚构历史进度。
-- AlterTable
ALTER TABLE "Conversation" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "forkedFromConversationId" TEXT,
ADD COLUMN     "forkedFromMessageId" TEXT,
ADD COLUMN     "forkedFromRevisionId" TEXT,
ADD COLUMN     "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Message" ADD COLUMN     "clientMessageId" TEXT,
ADD COLUMN     "parts" JSONB,
ADD COLUMN     "runId" TEXT;

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "clientRequestId" TEXT NOT NULL,
    "requestHash" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "action" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "baseRevisionId" TEXT,
    "inputSnapshot" JSONB,
    "checkpointRef" TEXT,
    "buildJobId" TEXT,
    "resultRevisionId" TEXT,
    "configSnapshot" JSONB,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "fence" INTEGER NOT NULL DEFAULT 0,
    "cancelRequestedAt" TIMESTAMP(3),
    "failureCode" TEXT,
    "lastSeq" INTEGER NOT NULL DEFAULT 0,
    "predecessorRunId" TEXT,
    "retryOfRunId" TEXT,
    "supersededByRunId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRunEvent" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentRunEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentRunStep" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stepKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "outputRef" TEXT,
    "providerAttemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AgentRunStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRun_status_leaseExpiresAt_createdAt_idx" ON "AgentRun"("status", "leaseExpiresAt", "createdAt");

-- CreateIndex
CREATE INDEX "AgentRun_tenantId_conversationId_createdAt_id_idx" ON "AgentRun"("tenantId", "conversationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRun_tenantId_conversationId_clientRequestId_key" ON "AgentRun"("tenantId", "conversationId", "clientRequestId");

-- CreateIndex
CREATE INDEX "AgentRunEvent_tenantId_runId_seq_idx" ON "AgentRunEvent"("tenantId", "runId", "seq");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRunEvent_runId_seq_key" ON "AgentRunEvent"("runId", "seq");

-- CreateIndex
CREATE INDEX "AgentRunStep_tenantId_runId_idx" ON "AgentRunStep"("tenantId", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "AgentRunStep_runId_stepKey_inputHash_key" ON "AgentRunStep"("runId", "stepKey", "inputHash");

-- CreateIndex
CREATE INDEX "Conversation_tenantId_workspaceId_archivedAt_lastActivityAt_idx" ON "Conversation"("tenantId", "workspaceId", "archivedAt", "lastActivityAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_tenantId_id_key" ON "Conversation"("tenantId", "id");

-- CreateIndex
CREATE INDEX "Message_tenantId_conversationId_createdAt_id_idx" ON "Message"("tenantId", "conversationId", "createdAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "Message_tenantId_conversationId_clientMessageId_key" ON "Message"("tenantId", "conversationId", "clientMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "SolutionWorkspace_tenantId_id_key" ON "SolutionWorkspace"("tenantId", "id");

-- AddForeignKey
ALTER TABLE "ModelInvocation" ADD CONSTRAINT "ModelInvocation_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_tenantId_conversationId_fkey" FOREIGN KEY ("tenantId", "conversationId") REFERENCES "Conversation"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRun" ADD CONSTRAINT "AgentRun_tenantId_workspaceId_fkey" FOREIGN KEY ("tenantId", "workspaceId") REFERENCES "SolutionWorkspace"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunEvent" ADD CONSTRAINT "AgentRunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentRunStep" ADD CONSTRAINT "AgentRunStep_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- end
