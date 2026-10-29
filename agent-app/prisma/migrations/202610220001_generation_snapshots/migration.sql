-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代
CREATE UNIQUE INDEX "AgentRun_generation_scope_key" ON "AgentRun"("tenantId", "workspaceId", "id");
CREATE UNIQUE INDEX "SolutionRevision_generation_scope_key" ON "SolutionRevision"("tenantId", "workspaceId", "id");
CREATE UNIQUE INDEX "ChangePlan_generation_scope_key" ON "ChangePlan"("tenantId", "workspaceId", "id");
CREATE UNIQUE INDEX "BuildJob_generation_scope_key" ON "BuildJob"("tenantId", "workspaceId", "id");
CREATE TABLE "GenerationSnapshot" (
  "id" TEXT NOT NULL, "tenantId" TEXT NOT NULL, "workspaceId" TEXT NOT NULL, "runId" TEXT NOT NULL,
  "stepKey" TEXT NOT NULL, "baseRevisionId" TEXT NOT NULL, "changePlanId" TEXT NOT NULL, "visualSpecId" TEXT,
  "content" JSONB NOT NULL, "contentHash" TEXT NOT NULL, "creativeArtifactHash" TEXT NOT NULL,
  "nativeMaterializationHash" TEXT NOT NULL, "revisionId" TEXT, "buildJobId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GenerationSnapshot_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GenerationSnapshot_run_fkey" FOREIGN KEY ("tenantId", "workspaceId", "runId") REFERENCES "AgentRun"("tenantId", "workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT "GenerationSnapshot_base_fkey" FOREIGN KEY ("tenantId", "workspaceId", "baseRevisionId") REFERENCES "SolutionRevision"("tenantId", "workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT "GenerationSnapshot_result_fkey" FOREIGN KEY ("tenantId", "workspaceId", "revisionId") REFERENCES "SolutionRevision"("tenantId", "workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT "GenerationSnapshot_plan_fkey" FOREIGN KEY ("tenantId", "workspaceId", "changePlanId") REFERENCES "ChangePlan"("tenantId", "workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT "GenerationSnapshot_build_fkey" FOREIGN KEY ("tenantId", "workspaceId", "buildJobId") REFERENCES "BuildJob"("tenantId", "workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE,
  CONSTRAINT "GenerationSnapshot_visual_fkey" FOREIGN KEY ("tenantId", "workspaceId", "visualSpecId") REFERENCES "VisualReferenceAnalysis"("tenantId", "workspaceId", "id") ON DELETE NO ACTION ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GenerationSnapshot_runId_stepKey_key" ON "GenerationSnapshot"("runId", "stepKey");
CREATE INDEX "GenerationSnapshot_tenantId_workspaceId_idx" ON "GenerationSnapshot"("tenantId", "workspaceId");
-- Only the nullable successful delivery binding can change, exactly once.
CREATE FUNCTION kf_generation_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'revisionId' - 'buildJobId') IS DISTINCT FROM (to_jsonb(OLD) - 'revisionId' - 'buildJobId')
    OR ((OLD."revisionId" IS NOT NULL OR OLD."buildJobId" IS NOT NULL)
      AND ROW(NEW."revisionId", NEW."buildJobId") IS DISTINCT FROM ROW(OLD."revisionId", OLD."buildJobId"))
    OR ((NEW."revisionId" IS NULL) <> (NEW."buildJobId" IS NULL)) THEN
    RAISE EXCEPTION 'GENERATION_SNAPSHOT_IMMUTABLE';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "GenerationSnapshot_immutable" BEFORE UPDATE ON "GenerationSnapshot"
FOR EACH ROW EXECUTE FUNCTION kf_generation_snapshot_immutable();
-- end
