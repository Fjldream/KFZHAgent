-- modified by jinlong.feng at 2026-10-20 Agent工作台迭代
-- T06 预算与预占：仅新增两张表，不改既有表；runId 外键待 T07 添加。
-- CreateTable
CREATE TABLE "RunBudget" (
    "runId" TEXT NOT NULL,
    "maxInvocations" INTEGER NOT NULL,
    "reservedInvocations" INTEGER NOT NULL DEFAULT 0,
    "usedInvocations" INTEGER NOT NULL DEFAULT 0,
    "maxInputTokens" INTEGER NOT NULL,
    "maxOutputTokens" INTEGER NOT NULL,
    "reservedTokenUpperBound" INTEGER NOT NULL DEFAULT 0,
    "usedKnownTokens" INTEGER NOT NULL DEFAULT 0,
    "unknownUsageCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RunBudget_pkey" PRIMARY KEY ("runId")
);

-- CreateTable
CREATE TABLE "BudgetReservation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "invocationId" TEXT NOT NULL,
    "reservedInput" INTEGER NOT NULL,
    "reservedOutput" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'RESERVED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "settledAt" TIMESTAMP(3),

    CONSTRAINT "BudgetReservation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BudgetReservation_tenantId_runId_idx" ON "BudgetReservation"("tenantId", "runId");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetReservation_tenantId_invocationId_key" ON "BudgetReservation"("tenantId", "invocationId");

-- end
