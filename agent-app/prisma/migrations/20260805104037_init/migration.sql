-- 创建枚举
CREATE TYPE "UserRole" AS ENUM ('platform_admin', 'tenant_admin', 'member');

-- 创建枚举
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'VALIDATING', 'SUCCEEDED', 'FAILED');

-- 创建表
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- 创建表
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL,
    "mustChangePassword" BOOLEAN NOT NULL DEFAULT true,
    "lockedUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- 创建表
CREATE TABLE "UserSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "UserSession_pkey" PRIMARY KEY ("id")
);

-- 创建表
CREATE TABLE "SolutionWorkspace" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SolutionWorkspace_pkey" PRIMARY KEY ("id")
);

-- 创建表
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- 创建表
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);

-- 创建表
CREATE TABLE "ChangeRequest" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangeRequest_pkey" PRIMARY KEY ("id")
);

-- 创建表
CREATE TABLE "ChangePlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "changeRequestId" TEXT,
    "planHash" TEXT NOT NULL,
    "plan" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChangePlan_pkey" PRIMARY KEY ("id")
);

-- 创建表
CREATE TABLE "SolutionRevision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "changePlanId" TEXT,
    "revisionNumber" INTEGER NOT NULL DEFAULT 1,
    "state" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SolutionRevision_pkey" PRIMARY KEY ("id")
);

-- 创建表
CREATE TABLE "DomainProjectRevision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "solutionRevisionId" TEXT NOT NULL,
    "domainKind" TEXT NOT NULL,
    "packageHash" TEXT,
    "packageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainProjectRevision_pkey" PRIMARY KEY ("id")
);

-- 创建表
CREATE TABLE "BuildJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "baseRevisionId" TEXT NOT NULL,
    "changePlanId" TEXT NOT NULL,
    "planHash" TEXT NOT NULL,
    "domainKind" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL,
    "leaseOwner" TEXT,
    "leaseExpiresAt" TIMESTAMP(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BuildJob_pkey" PRIMARY KEY ("id")
);

-- 创建表
CREATE TABLE "Artifact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildJobId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER,
    "sha256" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Artifact_pkey" PRIMARY KEY ("id")
);

-- 创建表
CREATE TABLE "ValidationReport" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "buildJobId" TEXT,
    "changePlanId" TEXT,
    "outcome" TEXT NOT NULL,
    "summary" TEXT,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ValidationReport_pkey" PRIMARY KEY ("id")
);

-- 创建表
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- 创建索引
CREATE UNIQUE INDEX "Tenant_name_key" ON "Tenant"("name");

-- 创建索引
CREATE UNIQUE INDEX "User_tenantId_username_key" ON "User"("tenantId", "username");

-- 创建索引
CREATE UNIQUE INDEX "UserSession_tokenHash_key" ON "UserSession"("tokenHash");

-- 创建索引
CREATE INDEX "UserSession_userId_idx" ON "UserSession"("userId");

-- 创建索引
CREATE INDEX "UserSession_expiresAt_idx" ON "UserSession"("expiresAt");

-- 创建索引
CREATE UNIQUE INDEX "SolutionWorkspace_tenantId_name_key" ON "SolutionWorkspace"("tenantId", "name");

-- 创建索引
CREATE INDEX "Conversation_tenantId_workspaceId_idx" ON "Conversation"("tenantId", "workspaceId");

-- 创建索引
CREATE INDEX "Message_tenantId_conversationId_idx" ON "Message"("tenantId", "conversationId");

-- 创建索引
CREATE INDEX "ChangeRequest_tenantId_workspaceId_idx" ON "ChangeRequest"("tenantId", "workspaceId");

-- 创建索引
CREATE INDEX "ChangePlan_tenantId_workspaceId_idx" ON "ChangePlan"("tenantId", "workspaceId");

-- 创建索引
CREATE INDEX "SolutionRevision_tenantId_workspaceId_idx" ON "SolutionRevision"("tenantId", "workspaceId");

-- 创建索引
CREATE INDEX "DomainProjectRevision_tenantId_solutionRevisionId_idx" ON "DomainProjectRevision"("tenantId", "solutionRevisionId");

-- 创建索引
CREATE UNIQUE INDEX "BuildJob_idempotencyKey_key" ON "BuildJob"("idempotencyKey");

-- 创建索引
CREATE INDEX "BuildJob_status_leaseExpiresAt_idx" ON "BuildJob"("status", "leaseExpiresAt");

-- 创建索引
CREATE INDEX "BuildJob_tenantId_workspaceId_idx" ON "BuildJob"("tenantId", "workspaceId");

-- 创建索引
CREATE INDEX "Artifact_tenantId_buildJobId_idx" ON "Artifact"("tenantId", "buildJobId");

-- 创建索引
CREATE INDEX "ValidationReport_tenantId_buildJobId_idx" ON "ValidationReport"("tenantId", "buildJobId");

-- 创建索引
CREATE INDEX "AuditLog_tenantId_createdAt_idx" ON "AuditLog"("tenantId", "createdAt");

-- 添加外键
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 添加外键
ALTER TABLE "UserSession" ADD CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 添加外键
ALTER TABLE "SolutionWorkspace" ADD CONSTRAINT "SolutionWorkspace_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
