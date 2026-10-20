-- 源包是ZIP容器。早期的元数据行继承了遗留的gzip扩展默认值，尽管它们的媒体类型已经是ZIP。只正确了那个明确的组合，这样客户端包的历史记录是不受影响的。

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
