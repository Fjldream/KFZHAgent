-- 任务 9：工作空间/修订的持久化指针。
-- - SolutionWorkspace.currentRevisionId：仅在校验通过后推进。
-- - SolutionWorkspace.mode：“new”（生成源）与 “upload”（导入源）。
-- - SolutionRevision.kind：initial | source | built | rollback（不可变链）。
-- - SolutionRevision.parentRevisionId：回滚会引用历史修订。
-- - DomainProjectRevision.kind：source-package 与 client-package。

-- 修改表
ALTER TABLE "SolutionWorkspace" ADD COLUMN "mode" TEXT NOT NULL DEFAULT 'new';
ALTER TABLE "SolutionWorkspace" ADD COLUMN "currentRevisionId" TEXT;

-- 修改表
ALTER TABLE "SolutionRevision" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'built';
ALTER TABLE "SolutionRevision" ADD COLUMN "parentRevisionId" TEXT;

-- 修改表
ALTER TABLE "DomainProjectRevision" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'client-package';
