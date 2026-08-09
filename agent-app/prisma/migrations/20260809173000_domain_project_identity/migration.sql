-- Bind every build and project revision to a stable project identity. Legacy
-- rows used domainKind as their implicit single-project identity, which keeps
-- existing kingclient workspaces addressable without rewriting packages.

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
