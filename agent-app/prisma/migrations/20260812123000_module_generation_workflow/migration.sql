-- Existing workspaces and checkpoints must retain the legacy routing contract.
ALTER TABLE "SolutionWorkspace"
ADD COLUMN "generationWorkflow" TEXT NOT NULL DEFAULT 'legacy';
