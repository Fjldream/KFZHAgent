-- Persist the packaging metadata emitted by DomainPack so downloads do not
-- infer every artifact as gzip. Defaults preserve rows produced before this
-- migration and source-package download behavior.

ALTER TABLE "DomainProjectRevision"
  ADD COLUMN "mediaType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  ADD COLUMN "fileExtension" TEXT NOT NULL DEFAULT '.gz';

ALTER TABLE "Artifact"
  ADD COLUMN "mediaType" TEXT NOT NULL DEFAULT 'application/octet-stream',
  ADD COLUMN "fileExtension" TEXT NOT NULL DEFAULT '.gz';
