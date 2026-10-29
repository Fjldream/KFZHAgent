-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代
ALTER TABLE "Tenant" ADD COLUMN "imageEgressAllowed" BOOLEAN NOT NULL DEFAULT false;
CREATE TABLE "VisualReferenceAnalysis" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "assetId" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL, "derivativeHash" TEXT NOT NULL, "analysisVersion" TEXT NOT NULL,
  "modelConfigHash" TEXT NOT NULL, "instructionHash" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'VALID', "spec" JSONB NOT NULL, "specHash" TEXT NOT NULL,
  "parentId" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VisualReferenceAnalysis_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "VisualReferenceAnalysis_asset_fkey" FOREIGN KEY ("tenantId", "workspaceId", "assetId", "sourceHash") REFERENCES "ReferenceAsset"("tenantId", "workspaceId", "id", "sourceHash") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VisualReferenceAnalysis_parentId_key" ON "VisualReferenceAnalysis"("parentId");
CREATE UNIQUE INDEX "VisualReferenceAnalysis_tenantId_workspaceId_id_key" ON "VisualReferenceAnalysis"("tenantId", "workspaceId", "id");
CREATE INDEX "VisualReferenceAnalysis_tenantId_workspaceId_assetId_idx" ON "VisualReferenceAnalysis"("tenantId", "workspaceId", "assetId");
ALTER TABLE "VisualReferenceAnalysis" ADD CONSTRAINT "VisualReferenceAnalysis_parent_fkey" FOREIGN KEY ("tenantId", "workspaceId", "parentId") REFERENCES "VisualReferenceAnalysis"("tenantId", "workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE;
CREATE TABLE "VisualAnalysisCacheEntry" (
  "cacheKey" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "analysisId" TEXT,
  "leaseOwner" TEXT, "leaseExpiresAt" TIMESTAMP(3),
  CONSTRAINT "VisualAnalysisCacheEntry_pkey" PRIMARY KEY ("cacheKey"),
  CONSTRAINT "VisualAnalysisCacheEntry_workspace_fkey" FOREIGN KEY ("tenantId", "workspaceId") REFERENCES "SolutionWorkspace"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "VisualAnalysisCacheEntry_analysis_fkey" FOREIGN KEY ("tenantId", "workspaceId", "analysisId") REFERENCES "VisualReferenceAnalysis"("tenantId", "workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE INDEX "VisualAnalysisCacheEntry_tenantId_workspaceId_idx" ON "VisualAnalysisCacheEntry"("tenantId", "workspaceId");
-- end
