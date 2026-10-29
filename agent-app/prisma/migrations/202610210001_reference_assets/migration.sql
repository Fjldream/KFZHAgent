-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代
-- Expand only. Reference inputs never become compilation materials implicitly.
CREATE TABLE "ReferenceAsset" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL, "mimeType" TEXT NOT NULL, "sourceHash" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL, "byteSize" INTEGER NOT NULL,
    "width" INTEGER NOT NULL, "height" INTEGER NOT NULL, "totalBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferenceAsset_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReferenceAsset_workspace_fkey" FOREIGN KEY ("tenantId", "workspaceId") REFERENCES "SolutionWorkspace"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ReferenceAsset_tenantId_workspaceId_sourceHash_key" ON "ReferenceAsset"("tenantId", "workspaceId", "sourceHash");
CREATE UNIQUE INDEX "ReferenceAsset_tenantId_workspaceId_id_sourceHash_key" ON "ReferenceAsset"("tenantId", "workspaceId", "id", "sourceHash");
CREATE INDEX "ReferenceAsset_tenantId_idx" ON "ReferenceAsset"("tenantId");
CREATE TABLE "ReferenceAssetDerivative" (
    "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "assetId" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL, "derivativeHash" TEXT NOT NULL, "mimeType" TEXT NOT NULL,
    "width" INTEGER NOT NULL, "height" INTEGER NOT NULL, "storageKey" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL, "transform" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReferenceAssetDerivative_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ReferenceAssetDerivative_asset_fkey" FOREIGN KEY ("tenantId", "workspaceId", "assetId", "sourceHash") REFERENCES "ReferenceAsset"("tenantId", "workspaceId", "id", "sourceHash") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "ReferenceAssetDerivative_assetId_key" ON "ReferenceAssetDerivative"("assetId");
CREATE UNIQUE INDEX "ReferenceAssetDerivative_owner_source_key" ON "ReferenceAssetDerivative"("tenantId", "workspaceId", "assetId", "sourceHash");
CREATE INDEX "ReferenceAssetDerivative_tenantId_workspaceId_idx" ON "ReferenceAssetDerivative"("tenantId", "workspaceId");
-- end
