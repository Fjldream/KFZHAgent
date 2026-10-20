-- 绑定每个构建和项目修订到一个稳定的项目身份。遗留行domainKind 作为其隐含的单个项目身份，使现有 kingclient 工作空间地址不变，无需重写包。

ALTER TABLE "BuildJob" ADD COLUMN "projectKey" TEXT;
UPDATE "BuildJob" SET "projectKey" = "domainKind" WHERE "projectKey" IS NULL;
ALTER TABLE "BuildJob" ALTER COLUMN "projectKey" SET NOT NULL;
ALTER TABLE "BuildJob" ALTER COLUMN "projectKey" SET DEFAULT 'kingclient';

ALTER TABLE "DomainProjectRevision" ADD COLUMN "projectKey" TEXT;
UPDATE "DomainProjectRevision"
SET "projectKey" = "domainKind"
WHERE "projectKey" IS NULL;
ALTER TABLE "DomainProjectRevision" ALTER COLUMN "projectKey" SET NOT NULL;
ALTER TABLE "DomainProjectRevision" ALTER COLUMN "projectKey" SET DEFAULT 'kingclient';

CREATE UNIQUE INDEX "DomainProjectRevision_tenantId_solutionRevisionId_projectKey_key"
ON "DomainProjectRevision"("tenantId", "solutionRevisionId", "projectKey");
