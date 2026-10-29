// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import type { PrismaClient, Prisma } from "@prisma/client";
import { projectKeySchema } from "@kf/contracts";

type ProjectIdentityDatabase = Pick<PrismaClient | Prisma.TransactionClient, "solutionRevision" | "domainProjectRevision">;

/** Resolve metadata from the admitted immutable base, never from the model or the latest workspace revision. */
export async function resolveCreativeProjectKey(prisma: ProjectIdentityDatabase, input: {
  tenantId: string; workspaceId: string; revisionId: string; domainKind: string; defaultProjectKey: string;
}): Promise<string> {
  const revision = await prisma.solutionRevision.findFirst({ where: {
    id: input.revisionId, tenantId: input.tenantId, workspaceId: input.workspaceId,
  }, select: { id: true, kind: true } });
  if (!revision) throw new Error("CREATIVE_BASE_REVISION_EVIDENCE_MISSING");
  const projects = await prisma.domainProjectRevision.findMany({ where: {
    tenantId: input.tenantId, solutionRevisionId: input.revisionId, domainKind: input.domainKind,
  }, select: { projectKey: true }, take: 2 });
  if (projects.length > 1) throw new Error("CREATIVE_BASE_REVISION_EVIDENCE_AMBIGUOUS");
  if (!projects.length && revision.kind !== "initial") throw new Error("CREATIVE_BASE_REVISION_EVIDENCE_MISSING");
  const value = projects[0]?.projectKey ?? input.defaultProjectKey;
  const parsed = projectKeySchema.safeParse(value);
  if (!parsed.success || parsed.data !== value) throw new Error("CREATIVE_PROJECT_IDENTITY_INVALID");
  return parsed.data;
}
// end
