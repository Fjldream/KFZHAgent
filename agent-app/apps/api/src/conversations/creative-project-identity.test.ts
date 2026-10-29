// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { describe, expect, it, vi } from "vitest";
import { resolveCreativeProjectKey } from "./creative-project-identity.js";

const input = { tenantId: "tenant", workspaceId: "workspace", revisionId: "revision", domainKind: "kingclient", defaultProjectKey: "kingclient" };
function fixture(kind = "change", projects: Array<{ projectKey: string }> = [{ projectKey: "device-overview-status" }]) {
  const prisma = { solutionRevision: { findFirst: vi.fn().mockResolvedValue({ id: "revision", kind }) },
    domainProjectRevision: { findMany: vi.fn().mockResolvedValue(projects) } };
  return prisma;
}
describe("server-owned creative project identity", () => {
  it("uses only the unique client project on the exact tenant/workspace/base revision", async () => {
    const prisma = fixture();
    await expect(resolveCreativeProjectKey(prisma as never, input)).resolves.toBe("device-overview-status");
    expect(prisma.solutionRevision.findFirst).toHaveBeenCalledWith({ where: { id: "revision", tenantId: "tenant", workspaceId: "workspace" }, select: { id: true, kind: true } });
    expect(prisma.domainProjectRevision.findMany).toHaveBeenCalledWith({ where: { tenantId: "tenant", solutionRevisionId: "revision", domainKind: "kingclient" }, select: { projectKey: true }, take: 2 });
  });
  it("allows the configured default only for a verified initial revision with no client project", async () => {
    await expect(resolveCreativeProjectKey(fixture("initial", []) as never, input)).resolves.toBe("kingclient");
    await expect(resolveCreativeProjectKey(fixture("change", []) as never, input)).rejects.toThrow("CREATIVE_BASE_REVISION_EVIDENCE_MISSING");
    await expect(resolveCreativeProjectKey(fixture("source", []) as never, input)).rejects.toThrow("CREATIVE_BASE_REVISION_EVIDENCE_MISSING");
  });
  it("rejects a foreign/missing baseline before reading project records", async () => {
    const prisma = fixture(); prisma.solutionRevision.findFirst.mockResolvedValue(null);
    await expect(resolveCreativeProjectKey(prisma as never, input)).rejects.toThrow("CREATIVE_BASE_REVISION_EVIDENCE_MISSING");
    expect(prisma.domainProjectRevision.findMany).not.toHaveBeenCalled();
  });
  it("fails closed on multiple projects and invalid persisted identity", async () => {
    await expect(resolveCreativeProjectKey(fixture("change", [{ projectKey: "one" }, { projectKey: "two" }]) as never, input)).rejects.toThrow("CREATIVE_BASE_REVISION_EVIDENCE_AMBIGUOUS");
    await expect(resolveCreativeProjectKey(fixture("change", [{ projectKey: "invalid/path" }]) as never, input)).rejects.toThrow("CREATIVE_PROJECT_IDENTITY_INVALID");
    await expect(resolveCreativeProjectKey(fixture("initial", []) as never, { ...input, defaultProjectKey: "invalid/path" })).rejects.toThrow("CREATIVE_PROJECT_IDENTITY_INVALID");
  });
});
// end
