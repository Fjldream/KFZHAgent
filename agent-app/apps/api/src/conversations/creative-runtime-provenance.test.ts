// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { canonicalServerHash, canonicalCreativeBuildArtifactHash, canonicalTrustedNativeMaterializationHash,
  CustomerSolutionBlueprintSchema, SolutionImplementationPlanSchema } from "@kf/contracts";
import { createHmacCreativeBuildFacade, createHmacServerPlanAuthority } from "@kf/build-jobs";
import { attachRuntimeCorrelation, buildGenerationSnapshotContent, compileInteractions, compileSolutionImplementation,
  createCreativeUIImplementationV2Compiler, createDefaultModuleRegistry, getDesignKnowledgeSnapshot, retrieveCapabilities } from "@kf/domain-client";
import { assertGeneratedStructureCanBeSent, correlateGeneratedRuntime, readGeneratedRuntimeProvenance } from "./creative-runtime-provenance.js";
const raw = JSON.parse(await readFile(new URL("../../../../tests/fixtures/creative-goldens/industrial-dashboard.json", import.meta.url), "utf8")) as { blueprint: unknown; plan: unknown };
function fixture() {
  const blueprint = CustomerSolutionBlueprintSchema.parse(raw.blueprint);
  const candidates = retrieveCapabilities({ blueprint, knowledge: getDesignKnowledgeSnapshot() });
  const plan = SolutionImplementationPlanSchema.parse({ ...SolutionImplementationPlanSchema.parse(raw.plan),
    blueprintHash: canonicalServerHash(blueprint), candidateBundleHash: canonicalServerHash(candidates) });
  const implementation = attachRuntimeCorrelation({ workspaceId: "workspace", baseRevisionId: "initial", semanticStateIds: plan.localState.map(state => state.id),
    implementation: compileSolutionImplementation({ plan, candidateBundle: candidates, moduleRegistry: createDefaultModuleRegistry(), approvedAssets: [], activeCatalogVersion: candidates.knowledgeCatalogVersion }) });
  const facade = createHmacCreativeBuildFacade(Buffer.alloc(32, 0x73), createCreativeUIImplementationV2Compiler);
  const compiled = facade.compiler.compiler.compile({ workspaceId: "workspace", baseRevisionId: "initial", blueprint,
    candidateBundle: candidates, semanticPlan: plan, implementation: compileInteractions({ blueprint, plan, implementation }).implementation,
    compilerVersion: "1.0.0", evidenceVersion: "1.0.0" });
  const envelope = facade.authority.sign({ plan: compiled.plan, revisionId: "initial", semanticOperations: compiled.semanticOperations, creative: compiled.trustedCreativePayload });
  const content = buildGenerationSnapshotContent({ workspaceId: "workspace", baseRevisionId: "initial", artifact: compiled.artifact,
    materialization: compiled.materialization, assetManifest: [], visual: null });
  const snapshot = { tenantId: "tenant", workspaceId: "workspace", revisionId: "built", baseRevisionId: "initial", runId: "run",
    changePlanId: "plan", buildJobId: "job", content, contentHash: canonicalServerHash(content),
    creativeArtifactHash: canonicalCreativeBuildArtifactHash(content.artifact), nativeMaterializationHash: canonicalTrustedNativeMaterializationHash(content.materialization) };
  const artifact = { storageKey: "packet", sha256: "a".repeat(64), sizeBytes: 123,
    creativeArtifactHash: snapshot.creativeArtifactHash, nativeMaterializationHash: snapshot.nativeMaterializationHash };
  const prisma = { generationSnapshot: { findMany: vi.fn().mockResolvedValue([snapshot]) }, solutionRevision: { findFirst: vi.fn().mockResolvedValue({ id: "built" }) },
    buildJob: { findFirst: vi.fn().mockResolvedValue({ id: "job", planHash: envelope.planHash }) }, agentRun: { findFirst: vi.fn().mockResolvedValue({ id: "run" }) },
    domainProjectRevision: { findFirst: vi.fn().mockResolvedValue({ id: "project" }) }, changePlan: { findFirst: vi.fn().mockResolvedValue({ plan: envelope }) },
    artifact: { findMany: vi.fn().mockResolvedValue([artifact]) } };
  const base = { tenantId: "tenant", workspaceId: "workspace", revisionId: "built", projectKey: plan.projectKey,
    domainKind: "kingclient", storageKey: "packet", packageHash: artifact.sha256, packageSize: 123 };
  return { prisma, base, snapshot, artifact, envelope, facade, read: () => readGeneratedRuntimeProvenance(prisma as never, facade.authority, base) };
}
describe("generated runtime provenance", () => {
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("requires regeneration for a proven generated base with legacy long control names before sending its structure", () => {
    const value = fixture();
    const implementation = structuredClone(value.snapshot.content.artifact.implementation);
    implementation.runtimeCorrelation!.controls[0]!.instanceName = "Text" + "1".repeat(40);
    expect(() => assertGeneratedStructureCanBeSent({ visualOrigin: false, implementation }))
      .toThrow("CREATIVE_GENERATED_NATIVE_NAME_REGENERATION_REQUIRED");
    expect(() => assertGeneratedStructureCanBeSent({ visualOrigin: false, implementation: value.snapshot.content.artifact.implementation })).not.toThrow();
  });
  it("requires regeneration only for a correlated generated page with a legacy long physical name", () => {
    const value = fixture();
    const implementation = value.snapshot.content.artifact.implementation;
    const ownPageGuid = implementation.runtimeCorrelation!.pages[0]!.pageGuid;
    const inspection = { index: { pages: { [ownPageGuid]: { name: "Page" + "a".repeat(64) } } } };
    expect(() => correlateGeneratedRuntime({ workspaceId: "workspace", baseRevisionId: "built", implementation,
      semanticStateIds: [], previous: implementation, inspection: inspection as never }))
      .toThrow("CREATIVE_GENERATED_NATIVE_NAME_REGENERATION_REQUIRED");
  });
  // end
  it("reads only the exact successful signed generated base and preserves semantic data", async () => {
    const value = fixture();
    await expect(value.read()).resolves.toMatchObject({ implementation: value.snapshot.content.artifact.implementation, semanticPlan: value.snapshot.content.artifact.semanticPlan, visualOrigin: false, verifiedMaterialization: expect.any(Object) });
    expect(value.prisma.generationSnapshot.findMany).toHaveBeenCalledWith({ where: { tenantId: "tenant", workspaceId: "workspace", revisionId: "built" }, take: 2 });
    expect(value.prisma.agentRun.findFirst).toHaveBeenCalledWith({ where: { id: "run", tenantId: "tenant", workspaceId: "workspace", status: "SUCCEEDED", buildJobId: "job", resultRevisionId: "built" } });
  });
  it("requires fresh consent before projecting prior image-derived content into a new text run", () => {
    expect(() => assertGeneratedStructureCanBeSent({ visualOrigin: true })).toThrow("VISUAL_EXISTING_CONTENT_RECONSENT_REQUIRED");
    expect(() => assertGeneratedStructureCanBeSent({ visualOrigin: false })).not.toThrow();
  });
  it("does not fabricate ownership when an exact base has no generation proof", async () => {
    const value = fixture(); value.prisma.generationSnapshot.findMany.mockResolvedValue([]);
    await expect(value.read()).resolves.toBeUndefined();
  });
  it("rejects multiple exact generation proofs instead of taking the newest", async () => {
    const value = fixture(); value.prisma.generationSnapshot.findMany.mockResolvedValue([value.snapshot, value.snapshot]);
    await expect(value.read()).rejects.toThrow("CREATIVE_RUNTIME_PROVENANCE_AMBIGUOUS");
  });
  it.each(["tenantId", "workspaceId", "revisionId", "contentHash", "creativeArtifactHash", "nativeMaterializationHash"] as const)("rejects a changed %s", async field => {
    const value = fixture(); value.snapshot[field] = "foreign-or-corrupt";
    await expect(value.read()).rejects.toThrow("CREATIVE_RUNTIME_PROVENANCE_INVALID");
  });
  it("requires the corresponding successful job, run and result revision", async () => {
    for (const target of ["buildJob", "agentRun", "solutionRevision", "domainProjectRevision", "changePlan"] as const) {
      const value = fixture(); value.prisma[target].findFirst.mockResolvedValue(null);
      await expect(value.read()).rejects.toThrow("CREATIVE_RUNTIME_PROVENANCE_INVALID");
    }
  });
  it("rejects substituted bytes, ambiguous artifacts and mismatched HMAC authorities", async () => {
    const value = fixture(); value.base.packageHash = "b".repeat(64);
    await expect(value.read()).rejects.toThrow("CREATIVE_RUNTIME_PROVENANCE_INVALID");
    const ambiguous = fixture(); ambiguous.prisma.artifact.findMany.mockResolvedValue([ambiguous.artifact, ambiguous.artifact]);
    await expect(ambiguous.read()).rejects.toThrow("CREATIVE_RUNTIME_PROVENANCE_INVALID");
    const wrongSigner = fixture();
    await expect(readGeneratedRuntimeProvenance(wrongSigner.prisma as never, createHmacServerPlanAuthority(Buffer.alloc(32, 0x74)), wrongSigner.base)).rejects.toThrow("CREATIVE_RUNTIME_PROVENANCE_INVALID");
  });
});
// end
