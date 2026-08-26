-- Creative-v2 delivery binding. Nullable columns preserve every existing
-- legacy/module artifact without silently classifying or migrating it.
ALTER TABLE "Artifact"
ADD COLUMN "solutionRevisionId" TEXT,
ADD COLUMN "creativeArtifactHash" TEXT,
ADD COLUMN "nativeMaterializationHash" TEXT;

CREATE INDEX "Artifact_tenantId_solutionRevisionId_idx"
ON "Artifact"("tenantId", "solutionRevisionId");
