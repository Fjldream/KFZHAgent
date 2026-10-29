-- 现有工作区和检查点必须保留遗留的路由合同。
ALTER TABLE "SolutionWorkspace"
ADD COLUMN "generationWorkflow" TEXT NOT NULL DEFAULT 'legacy';
