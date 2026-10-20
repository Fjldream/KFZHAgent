-- Creative-v2 交付绑定。可空列会保留所有现有旧版/模块制品，不会对其进行静默分类或迁移。
ALTER TABLE "Artifact"
ADD COLUMN "solutionRevisionId" TEXT,
ADD COLUMN "creativeArtifactHash" TEXT,
ADD COLUMN "nativeMaterializationHash" TEXT;

CREATE INDEX "Artifact_tenantId_solutionRevisionId_idx"
ON "Artifact"("tenantId", "solutionRevisionId");
