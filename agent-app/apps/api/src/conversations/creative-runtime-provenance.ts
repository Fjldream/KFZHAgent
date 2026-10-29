// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import type { PrismaClient } from "@prisma/client";
import {
  GenerationSnapshotContentSchema,
  canonicalServerHash,
  canonicalCreativeBuildArtifactHash,
  canonicalTrustedNativeMaterializationHash,
  type UIImplementationSpecV2,
  type SolutionImplementationPlan,
} from "@kf/contracts";
import { resolveStoredPlan, type ServerPlanAuthority, type VerifiedCreativeMaterialization } from "@kf/build-jobs";
import {
  MAX_NATIVE_DEVELOPMENT_NAME_LENGTH,
  attachRuntimeCorrelation,
  verifyExistingRuntimeCorrelation,
  type InspectResult,
  type VerifiedExistingRuntimeCorrelationHandle,
} from "@kf/domain-client";

type RuntimeProvenanceDatabase = Pick<PrismaClient,
  "generationSnapshot" | "solutionRevision" | "buildJob" | "agentRun" | "changePlan" | "artifact" | "domainProjectRevision">;
export type CreativeRuntimeBase = {
  tenantId: string; workspaceId: string; revisionId: string; projectKey: string; domainKind: string;
  storageKey: string; packageHash: string; packageSize: number;
};
export type GeneratedRuntimeProvenance = { implementation: UIImplementationSpecV2; semanticPlan: SolutionImplementationPlan;
  visualOrigin: boolean; verifiedMaterialization: VerifiedCreativeMaterialization };
const invalid = (): never => { throw new Error("CREATIVE_RUNTIME_PROVENANCE_INVALID"); };

/** Resolve only a signed, successfully published generation for this exact inspected base package. */
export async function readGeneratedRuntimeProvenance(
  prisma: RuntimeProvenanceDatabase,
  authority: Pick<ServerPlanAuthority, "verify">,
  base: CreativeRuntimeBase,
): Promise<GeneratedRuntimeProvenance | undefined> {
  const rows = await prisma.generationSnapshot.findMany({ where: {
    tenantId: base.tenantId, workspaceId: base.workspaceId, revisionId: base.revisionId,
  }, take: 2 });
  if (!rows.length) return undefined;
  if (rows.length !== 1) throw new Error("CREATIVE_RUNTIME_PROVENANCE_AMBIGUOUS");
  const snapshot = rows[0]!;
  try {
    if (snapshot.tenantId !== base.tenantId || snapshot.workspaceId !== base.workspaceId || snapshot.revisionId !== base.revisionId) return invalid();
    if (!snapshot.buildJobId || Buffer.byteLength(JSON.stringify(snapshot.content), "utf8") > 16 * 1024 * 1024) return invalid();
    const content = GenerationSnapshotContentSchema.parse(snapshot.content);
    if (canonicalServerHash(content) !== snapshot.contentHash
      || canonicalCreativeBuildArtifactHash(content.artifact) !== snapshot.creativeArtifactHash
      || canonicalTrustedNativeMaterializationHash(content.materialization) !== snapshot.nativeMaterializationHash
      || content.artifact.semanticPlan.projectKey !== base.projectKey || content.materialization.workspaceId !== base.workspaceId
      || content.materialization.baseRevisionId !== snapshot.baseRevisionId) return invalid();
    const [revision, job, run, project] = await Promise.all([
      prisma.solutionRevision.findFirst({ where: { id: base.revisionId, tenantId: base.tenantId,
        workspaceId: base.workspaceId, kind: "built", changePlanId: snapshot.changePlanId, parentRevisionId: snapshot.baseRevisionId } }),
      prisma.buildJob.findFirst({ where: { id: snapshot.buildJobId, tenantId: base.tenantId,
        workspaceId: base.workspaceId, status: "SUCCEEDED", changePlanId: snapshot.changePlanId,
        baseRevisionId: snapshot.baseRevisionId, agentRunId: snapshot.runId, projectKey: base.projectKey, domainKind: base.domainKind } }),
      prisma.agentRun.findFirst({ where: { id: snapshot.runId, tenantId: base.tenantId, workspaceId: base.workspaceId,
        status: "SUCCEEDED", buildJobId: snapshot.buildJobId, resultRevisionId: base.revisionId } }),
      prisma.domainProjectRevision.findFirst({ where: { tenantId: base.tenantId, solutionRevisionId: base.revisionId,
        projectKey: base.projectKey, domainKind: base.domainKind, packageUrl: base.storageKey, packageHash: base.packageHash } }),
    ]);
    if (!revision || !job || !run || !project) return invalid();
    const [plan, artifacts] = await Promise.all([
      prisma.changePlan.findFirst({ where: { id: snapshot.changePlanId, tenantId: base.tenantId,
        workspaceId: base.workspaceId, planHash: job.planHash } }),
      prisma.artifact.findMany({ where: { tenantId: base.tenantId, buildJobId: job.id,
        solutionRevisionId: base.revisionId, kind: "client-package" }, take: 2 }),
    ]);
    const artifact = artifacts[0];
    if (!plan || artifacts.length !== 1 || !artifact || artifact.storageKey !== base.storageKey
      || artifact.sha256 !== base.packageHash || artifact.sizeBytes !== base.packageSize
      || artifact.creativeArtifactHash !== snapshot.creativeArtifactHash
      || artifact.nativeMaterializationHash !== snapshot.nativeMaterializationHash) return invalid();
    const verified = authority.verify(plan.plan, { expectedRevisionId: snapshot.baseRevisionId, expectedPlanHash: job.planHash,
      expectedCreativeArtifactHash: snapshot.creativeArtifactHash, expectedNativeMaterializationHash: snapshot.nativeMaterializationHash });
    if (!verified.creativeArtifact || !verified.trustedNativeMaterialization
      || canonicalServerHash(verified.creativeArtifact) !== canonicalServerHash(content.artifact)
      || canonicalServerHash(verified.trustedNativeMaterialization) !== canonicalServerHash(content.materialization)
      || content.artifact.implementation.compatibility !== "native" || !content.artifact.implementation.runtimeCorrelation) return invalid();
    const resolved = resolveStoredPlan(verified, { expectedPlanHash: job.planHash, expectedRevisionId: snapshot.baseRevisionId }, authority);
    if (!resolved.creativeMaterialization) return invalid();
    return { implementation: content.artifact.implementation, semanticPlan: content.artifact.semanticPlan,
      visualOrigin: content.visual !== null || snapshot.visualSpecId != null, verifiedMaterialization: resolved.creativeMaterialization };
  } catch { return invalid(); }
}

/** A prior image consent does not authorize a new text run to send its derived content again. */
export function assertGeneratedStructureCanBeSent(input: { visualOrigin: boolean; implementation?: UIImplementationSpecV2 }): void {
  if (input.visualOrigin) throw new Error("VISUAL_EXISTING_CONTENT_RECONSENT_REQUIRED");
  if (input.implementation?.runtimeCorrelation?.controls.some(control => control.instanceName.length > MAX_NATIVE_DEVELOPMENT_NAME_LENGTH)) {
    throw new Error("CREATIVE_GENERATED_NATIVE_NAME_REGENERATION_REQUIRED");
  }
}

/** Existing selectors come from the verified prior generation, never from native-looking model IDs. */
export function correlateGeneratedRuntime(input: {
  workspaceId: string; baseRevisionId: string; implementation: UIImplementationSpecV2; semanticStateIds: readonly string[];
  previous: UIImplementationSpecV2; inspection: InspectResult;
}): { implementation: UIImplementationSpecV2; verifiedExisting: VerifiedExistingRuntimeCorrelationHandle } {
  if (input.previous.compatibility !== "native" || !input.previous.runtimeCorrelation) return invalid();
  assertGeneratedStructureCanBeSent({ visualOrigin: false, implementation: input.previous });
  if (input.previous.runtimeCorrelation.pages.some(page => {
    const existing = input.inspection.index.pages[page.pageGuid];
    return existing !== undefined && existing.name.length > MAX_NATIVE_DEVELOPMENT_NAME_LENGTH;
  })) throw new Error("CREATIVE_GENERATED_NATIVE_NAME_REGENERATION_REQUIRED");
  const derived = attachRuntimeCorrelation({ workspaceId: input.workspaceId, baseRevisionId: input.baseRevisionId,
    implementation: input.implementation, semanticStateIds: input.semanticStateIds });
  const priorPages = new Map(input.previous.runtimeCorrelation.pages.map(page => [page.semanticPageId, page]));
  const priorControls = new Map(input.previous.runtimeCorrelation.controls.map(control => [control.semanticControlId, control]));
  const previousOwners = new Map(input.previous.pages.flatMap(page => page.compatibility === "native"
    ? page.controls.map(control => [control.id, page.id] as const) : []));
  const nextOwners = new Map(input.implementation.pages.flatMap(page => page.compatibility === "native"
    ? page.controls.map(control => [control.id, page.id] as const) : []));
  const pages = derived.runtimeCorrelation!.pages.map(page => {
    const previous = priorPages.get(page.semanticPageId);
    return previous ? { source: "uploaded-existing" as const, semanticPageId: page.semanticPageId, pageGuid: previous.pageGuid }
      : { source: "workspace-derived" as const, ...page };
  });
  const controls = derived.runtimeCorrelation!.controls.map(control => {
    const previous = priorControls.get(control.semanticControlId);
    if (previous && previousOwners.get(control.semanticControlId) === nextOwners.get(control.semanticControlId)) {
      return { source: "uploaded-existing" as const, semanticControlId: control.semanticControlId, instanceName: previous.instanceName };
    }
    return { source: "workspace-derived" as const, ...control };
  });
  // "uploaded-existing" is the existing inspector's selector class, including a prior server-built package.
  // New entries must still be genuinely derived and may not collide with unrelated existing entities.
  const pageGuids = new Set(Object.values(input.inspection.index.pages).map(page => page.guid.toLowerCase()));
  const pageNames = new Set(Object.values(input.inspection.index.pages).map(page => page.name.toLowerCase()));
  const controlNames = new Set(Object.values(input.inspection.index.controls).map(control => (control.name ?? control.id).toLowerCase()));
  if (pages.some(page => page.source === "workspace-derived"
    && (pageGuids.has(page.pageGuid.toLowerCase()) || pageNames.has(page.semanticPageId.toLowerCase())))
    || controls.some(control => control.source === "workspace-derived" && controlNames.has(control.instanceName.toLowerCase()))) {
    throw new Error("CREATIVE_RUNTIME_IDENTITY_COLLISION");
  }
  const verifiedExisting = verifyExistingRuntimeCorrelation({ workspaceId: input.workspaceId,
    baseRevisionId: input.baseRevisionId, inspection: input.inspection, correlations: { pages, controls } });
  return { verifiedExisting, implementation: attachRuntimeCorrelation({ workspaceId: input.workspaceId,
    baseRevisionId: input.baseRevisionId, implementation: input.implementation, semanticStateIds: input.semanticStateIds, verifiedExisting }) };
}
// end
