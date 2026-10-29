// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import type { AgentRun, Prisma } from "@prisma/client";
import { currentAgentRunExecution, type ServerPlanAuthority } from "@kf/build-jobs";
import { canonicalServerHash } from "@kf/contracts";
import { buildGenerationSnapshotContent, validateAcceptedVisualPlanningInput } from "@kf/domain-client";
import type { VisualReviewService } from "../vision/visual-review.service.js";
import { lockActiveVisualRun } from "../vision/visual-analysis-input.js";
import { freezeVisualSemanticModel } from "../vision/visual-semantic-request.js";

export type VisualEngineeringRuntime = {
  reviews: Pick<VisualReviewService, "readEngineeringInTransaction" | "readEngineeringReceiptInTransaction">;
  verifier: Pick<ServerPlanAuthority, "verify">;
};

/** The only relaxed branch requires an already committed exact Run→job→signed snapshot binding. */
export async function readVisualEngineeringInput(tx: Prisma.TransactionClient, runtime: VisualEngineeringRuntime, discovered: AgentRun) {
  const scope = { tenantId: discovered.tenantId, workspaceId: discovered.workspaceId, conversationId: discovered.conversationId, userId: discovered.requestedByUserId };
  if (!discovered.buildJobId) {
    const restored = await runtime.reviews.readEngineeringInTransaction(tx, scope, discovered.id);
    const run = await lockActiveVisualRun(tx, { tenantId: scope.tenantId, workspaceId: scope.workspaceId, runId: discovered.id });
    const model = restored.snapshot.content.semanticModel;
    if (!model) throw new Error("VISUAL_SEMANTIC_CONFIG_REQUIRED");
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    if (canonicalServerHash(freezeVisualSemanticModel(model.route, model.repairPolicy)) !== canonicalServerHash(model)) throw new Error("VISUAL_SEMANTIC_CONFIG_CHANGED");
    // end
    if (await tx.agentRunStep.count({ where: { tenantId: run.tenantId, runId: run.id, stepKey: "visual-engineering", status: "COMPLETED" } })) throw new Error("RUN_STEP_CACHE_INVALID");
    return { run, snapshot: restored.snapshot, job: null };
  }
  const restored = await runtime.reviews.readEngineeringReceiptInTransaction(tx, scope, discovered.id);
  const { run, snapshot } = restored;
  const execution = currentAgentRunExecution(); execution?.signal.throwIfAborted();
  const [clock] = await tx.$queryRaw<{ active: boolean }[]>`SELECT "leaseExpiresAt" > (clock_timestamp() AT TIME ZONE 'UTC') AS active FROM "AgentRun" WHERE "id"=${run.id}`;
  if (!execution || execution.runId !== run.id || execution.tenantId !== run.tenantId || run.leaseOwner !== execution.ownerId
    || run.fence !== execution.fence || clock?.active !== true
    || !["BUILDING", "CANCEL_REQUESTED"].includes(run.status) || run.supersededByRunId || run.buildJobId !== discovered.buildJobId) throw new Error("VISUAL_RUN_NOT_ACTIVE");
  validateAcceptedVisualPlanningInput(snapshot.content.accepted);
  const jobs = await tx.buildJob.findMany({ where: { tenantId: run.tenantId, agentRunId: run.id }, take: 2 });
  const job = jobs[0];
  if (jobs.length !== 1 || !job || job.id !== run.buildJobId || job.workspaceId !== run.workspaceId || job.baseRevisionId !== run.baseRevisionId
    || job.domainKind !== "kingclient") throw new Error("VISUAL_BUILD_BINDING_INVALID");
  const stored = await tx.generationSnapshot.findUnique({ where: { runId_stepKey: { runId: run.id, stepKey: "compile-creative-solution" } } });
  if (!stored || stored.tenantId !== run.tenantId || stored.workspaceId !== run.workspaceId || stored.baseRevisionId !== run.baseRevisionId
    || stored.changePlanId !== job.changePlanId || canonicalServerHash(stored.content) !== stored.contentHash) throw new Error("VISUAL_BUILD_BINDING_INVALID");
  const raw = stored.content as Record<string, unknown>;
  const content = buildGenerationSnapshotContent({ workspaceId: run.workspaceId, baseRevisionId: job.baseRevisionId,
    artifact: raw.artifact, materialization: raw.materialization, assetManifest: raw.assetManifest, visual: raw.visual });
  const visual = content.visual;
  if (!visual || canonicalServerHash(content) !== stored.contentHash || content.artifact.semanticPlan.projectKey !== job.projectKey
    || canonicalServerHash(content.artifact.blueprint) !== canonicalServerHash(snapshot.content.blueprintReview.content.blueprint)
    || canonicalServerHash({ ...visual, bindings: undefined }) !== canonicalServerHash(snapshot.content.accepted.reference)
    || stored.visualSpecId !== visual.analysisId) throw new Error("VISUAL_BUILD_BINDING_INVALID");
  const plan = await tx.changePlan.findFirst({ where: { id: job.changePlanId, tenantId: run.tenantId, workspaceId: run.workspaceId } });
  const signed = runtime.verifier.verify(plan?.plan, { expectedPlanHash: job.planHash, expectedRevisionId: job.baseRevisionId,
    expectedCreativeArtifactHash: stored.creativeArtifactHash, expectedNativeMaterializationHash: stored.nativeMaterializationHash });
  if (plan?.planHash !== job.planHash || signed.plan.workspaceId !== run.workspaceId
    || canonicalServerHash(signed.creativeArtifact) !== canonicalServerHash(content.artifact)
    || canonicalServerHash(signed.trustedNativeMaterialization) !== canonicalServerHash(content.materialization)) throw new Error("VISUAL_BUILD_BINDING_INVALID");
  const workspace = await tx.solutionWorkspace.findFirst({ where: { id: run.workspaceId, tenantId: run.tenantId } });
  if (job.status === "SUCCEEDED") {
    const revisions = await tx.solutionRevision.findMany({ where: { tenantId: run.tenantId, workspaceId: run.workspaceId,
      changePlanId: job.changePlanId, parentRevisionId: job.baseRevisionId }, take: 2 });
    const revision = revisions[0];
    const artifacts = await tx.artifact.findMany({ where: { tenantId: run.tenantId, buildJobId: job.id, kind: "client-package" }, take: 2 });
    const artifact = artifacts[0];
    const project = revision && await tx.domainProjectRevision.findFirst({ where: { tenantId: run.tenantId, solutionRevisionId: revision.id, projectKey: job.projectKey, domainKind: job.domainKind } });
    if (revisions.length !== 1 || !revision || artifacts.length !== 1 || !artifact || !project
      || project.packageUrl !== artifact.storageKey || project.packageHash !== artifact.sha256 || stored.buildJobId !== job.id
      || stored.revisionId !== revision.id || workspace?.currentRevisionId !== revision.id
      || (run.resultRevisionId !== null && run.resultRevisionId !== revision.id)) throw new Error("BUILD_DELIVERY_BINDING_INVALID");
  } else if (workspace?.currentRevisionId !== run.baseRevisionId || stored.buildJobId || stored.revisionId || run.resultRevisionId) {
    throw new Error("VISUAL_BUILD_BINDING_INVALID");
  }
  if (await tx.agentRunStep.count({ where: { tenantId: run.tenantId, runId: run.id, stepKey: "visual-engineering", status: "COMPLETED" } })
    && (job.status !== "SUCCEEDED" || !run.resultRevisionId)) throw new Error("RUN_STEP_CACHE_INVALID");
  return { run, snapshot, job };
}
// end
