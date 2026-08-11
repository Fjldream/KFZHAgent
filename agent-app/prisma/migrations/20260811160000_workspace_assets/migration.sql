-- CreateTable
CREATE TABLE "WorkspaceAsset" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "tags" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkspaceAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceAsset_tenantId_workspaceId_sha256_key"
ON "WorkspaceAsset"("tenantId", "workspaceId", "sha256");

-- CreateIndex
CREATE INDEX "WorkspaceAsset_tenantId_workspaceId_idx"
ON "WorkspaceAsset"("tenantId", "workspaceId");

-- AddForeignKey
ALTER TABLE "WorkspaceAsset"
ADD CONSTRAINT "WorkspaceAsset_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "SolutionWorkspace"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
