-- 持久化 DomainPack 生成的打包元数据，使下载流程不会把每个制品都推断为 gzip。默认值会保留本次迁移前生成的记录以及 source-package 下载行为。

ALTER TABLE "DomainProjectRevision"
  ADD COLUMN "mediaType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  ADD COLUMN "fileExtension" TEXT NOT NULL DEFAULT '.gz';

ALTER TABLE "Artifact"
  ADD COLUMN "mediaType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  ADD COLUMN "fileExtension" TEXT NOT NULL DEFAULT '.gz';
