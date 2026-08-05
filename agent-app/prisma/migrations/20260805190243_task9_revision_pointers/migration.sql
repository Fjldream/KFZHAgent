-- Task 9: workspace/revision durability pointers.
-- - SolutionWorkspace.currentRevisionId: advanced only after validation passes.
-- - SolutionWorkspace.mode: "new" (generative) vs "upload" (imported source).
-- - SolutionRevision.kind: initial | source | built | rollback (immutable chain).
-- - SolutionRevision.parentRevisionId: rollback references the historical revision.
-- - DomainProjectRevision.kind: source-package vs client-package.

-- AlterTable
ALTER TABLE "SolutionWorkspace" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'new';
ALTER TABLE "SolutionWorkspace" ADD COLUMN "currentRevisionId" TEXT;

-- AlterTable
ALTER TABLE "SolutionRevision" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'built';
ALTER TABLE "SolutionRevision" ADD COLUMN "parentRevisionId" TEXT;

-- AlterTable
ALTER TABLE "DomainProjectRevision" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'client-package';
