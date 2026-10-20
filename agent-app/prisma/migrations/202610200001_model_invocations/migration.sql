-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代
-- T02 模型调用账本：只新增 ModelInvocation 表与索引，不改动任何既有表。
-- 注意：prisma migrate diff 同时报出 BuildSchedulerCursor.updatedAt 删默认值与三条索引重命名，
-- 那些属于 schema.prisma 既有漂移，与本任务无关，故未纳入本迁移。
CREATE TABLE "ModelInvocation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT,
    "runId" TEXT,
    "task" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "requestedModel" TEXT NOT NULL,
    "actualModel" TEXT,
    "promptVersion" TEXT NOT NULL,
    "schemaVersion" TEXT NOT NULL,
    "prefixHash" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RUNNING',
    "attempt" INTEGER NOT NULL,
    "parentInvocationId" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "cacheHitTokens" INTEGER,
    "cacheMissTokens" INTEGER,
    "reasoningTokens" INTEGER,
    "usageSource" TEXT,
    "costMicros" BIGINT,
    "currency" TEXT,
    "pricingVersion" TEXT,
    "latencyMs" INTEGER,
    "providerRequestId" TEXT,
    "failureCode" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "ModelInvocation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ModelInvocation_tenantId_workspaceId_startedAt_idx" ON "ModelInvocation"("tenantId", "workspaceId", "startedAt");

CREATE INDEX "ModelInvocation_tenantId_conversationId_startedAt_idx" ON "ModelInvocation"("tenantId", "conversationId", "startedAt");

CREATE INDEX "ModelInvocation_tenantId_status_startedAt_idx" ON "ModelInvocation"("tenantId", "status", "startedAt");
-- end
