-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代
ALTER TABLE "BuildJob" ADD COLUMN "agentRunId" TEXT;
ALTER TABLE "BuildJob" ADD COLUMN "cancelRequestedAt" TIMESTAMP(3);
ALTER TABLE "BuildJob" ADD COLUMN "terminalReason" TEXT;
CREATE UNIQUE INDEX "BuildJob_agentRunId_key" ON "BuildJob"("agentRunId");
-- end
