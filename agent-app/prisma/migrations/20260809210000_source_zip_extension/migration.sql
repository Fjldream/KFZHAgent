-- Source packages are ZIP containers. Early metadata rows inherited the
-- legacy gzip extension default even though their media type was already ZIP.
-- Correct only that explicit combination so built client-package history is
-- untouched.

UPDATE "DomainProjectRevision"
SET "fileExtension" = '.zip'
WHERE "kind" = 'source-package'
  AND "mediaType" = 'application/zip'
  AND "fileExtension" = '.gz';

UPDATE "Artifact"
SET "fileExtension" = '.zip'
WHERE "kind" = 'source-package'
  AND "mediaType" = 'application/zip'
  AND "fileExtension" = '.gz';
