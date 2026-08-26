CREATE TABLE "BuildSchedulerCursor" (
    "id" INTEGER NOT NULL,
    "lastTenantId" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BuildSchedulerCursor_pkey" PRIMARY KEY ("id")
);

DROP INDEX IF EXISTS "BuildJob_status_leaseExpiresAt_idx";
CREATE INDEX "BuildJob_status_leaseExpiresAt_createdAt_tenantId_workspaceId_idx"
ON "BuildJob"("status", "leaseExpiresAt", "createdAt", "tenantId", "workspaceId");

CREATE INDEX "BuildJob_tenantId_status_leaseExpiresAt_createdAt_workspaceId_idx"
ON "BuildJob"("tenantId", "status", "leaseExpiresAt", "createdAt", "workspaceId");

CREATE INDEX "BuildJob_runnable_tenant_created_idx"
ON "BuildJob"("tenantId", "createdAt", "id", "leaseExpiresAt", "workspaceId")
WHERE "status" IN ('QUEUED', 'RUNNING', 'VALIDATING');
