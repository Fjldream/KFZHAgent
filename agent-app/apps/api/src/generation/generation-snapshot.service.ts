// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { Injectable, NotFoundException } from "@nestjs/common";
import { canonicalServerHash, canonicalTrustedNativeMaterializationHash, canonicalCreativeBuildArtifactHash, ServerPlanEnvelopeSchema } from "@kf/contracts";
import { buildGenerationSnapshotContent } from "@kf/domain-client";
import { currentAgentRunExecution } from "@kf/build-jobs";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

export type GenerationSnapshotInput = {
  tenantId: string; workspaceId: string; runId: string; stepKey: string; baseRevisionId: string; changePlanId: string;
  artifact: unknown; materialization: unknown; assetManifest: unknown; visual: unknown;
};

@Injectable()
export class GenerationSnapshotService {
  constructor(private readonly prisma: PrismaService) {}
  create(input: GenerationSnapshotInput) {
    return this.prisma.$transaction(tx => this.createInTransaction(tx, input));
  }
  async createInTransaction(tx: Prisma.TransactionClient, input: GenerationSnapshotInput) {
    const scope = currentAgentRunExecution();
    if (scope === undefined || scope.runId !== input.runId || scope.tenantId !== input.tenantId) throw new Error("GENERATION_RUN_REQUIRED");
    scope.signal.throwIfAborted();
    if (!/^[a-z][a-z0-9-]{0,99}$/.test(input.stepKey)) throw new Error("GENERATION_STEP_INVALID");
    const content = buildGenerationSnapshotContent(input);
    if (Buffer.byteLength(JSON.stringify(content), "utf8") > 16 * 1024 * 1024) throw new Error("GENERATION_CONTENT_TOO_LARGE");
    await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`kf-run-control:${input.runId}`}, 0))`;
    const active = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "AgentRun" WHERE "id"=${input.runId}
      AND "tenantId"=${input.tenantId} AND "workspaceId"=${input.workspaceId} AND "baseRevisionId"=${input.baseRevisionId}
      AND "status"='RUNNING' AND "leaseOwner"=${scope.ownerId} AND "fence"=${scope.fence}
      AND "cancelRequestedAt" IS NULL AND "leaseExpiresAt">(clock_timestamp() AT TIME ZONE 'UTC') FOR UPDATE`;
    if (active.length !== 1) throw new Error("GENERATION_RUN_NOT_ACTIVE");
    const plan = await tx.changePlan.findFirst({ where: { id: input.changePlanId, tenantId: input.tenantId, workspaceId: input.workspaceId } });
    const envelope = ServerPlanEnvelopeSchema.parse(plan?.plan);
    const creativeArtifactHash = canonicalCreativeBuildArtifactHash(content.artifact);
    const nativeMaterializationHash = canonicalTrustedNativeMaterializationHash(content.materialization);
    if (envelope.revisionId !== input.baseRevisionId || plan?.planHash !== envelope.planHash
      || envelope.creativeArtifactHash !== creativeArtifactHash || envelope.nativeMaterializationHash !== nativeMaterializationHash) throw new Error("GENERATION_PLAN_MISMATCH");
    if (content.visual !== null) {
      const analysis = await tx.visualReferenceAnalysis.findFirst({ where: { id: content.visual.analysisId, tenantId: input.tenantId, workspaceId: input.workspaceId, status: "VALID" } });
      if (analysis === null || analysis.specHash !== content.visual.specHash || canonicalServerHash(analysis.spec) !== content.visual.specHash) throw new Error("GENERATION_VISUAL_ANALYSIS_MISMATCH");
    }
    const contentHash = canonicalServerHash(content);
    const existing = await tx.generationSnapshot.findUnique({ where: { runId_stepKey: { runId: input.runId, stepKey: input.stepKey } } });
    if (existing !== null) {
      if (existing.contentHash !== contentHash || canonicalServerHash(existing.content) !== contentHash || existing.changePlanId !== input.changePlanId
        || existing.tenantId !== input.tenantId || existing.workspaceId !== input.workspaceId) throw new Error("GENERATION_SNAPSHOT_CONFLICT");
      return { id: existing.id, contentHash };
    }
    scope.signal.throwIfAborted();
    const stored = await tx.generationSnapshot.create({ data: { tenantId: input.tenantId, workspaceId: input.workspaceId, runId: input.runId,
      stepKey: input.stepKey, baseRevisionId: input.baseRevisionId, changePlanId: input.changePlanId, visualSpecId: content.visual?.analysisId ?? null,
      content: content as unknown as Prisma.InputJsonValue, contentHash, creativeArtifactHash, nativeMaterializationHash } });
    return { id: stored.id, contentHash };
  }
  async get(tenantId: string, id: string) {
    const snapshot = await this.prisma.generationSnapshot.findFirst({ where: { tenantId, id } });
    if (snapshot === null) throw new NotFoundException("snapshot");
    if (canonicalServerHash(snapshot.content) !== snapshot.contentHash) throw new Error("GENERATION_SNAPSHOT_CORRUPT");
    return snapshot;
  }
  /** Normal binding is done inside BuildJobService's successful commit, never post-publication. */
  async bindRevision(tenantId: string, id: string, revisionId: string, buildJobId: string): Promise<void> {
    const snapshot = await this.get(tenantId, id);
    const job = await this.prisma.buildJob.findFirst({ where: { id: buildJobId, tenantId, status: "SUCCEEDED", workspaceId: snapshot.workspaceId,
      changePlanId: snapshot.changePlanId, baseRevisionId: snapshot.baseRevisionId, agentRunId: snapshot.runId } });
    if (job === null || snapshot.revisionId !== revisionId || snapshot.buildJobId !== buildJobId) throw new Error("GENERATION_BUILD_BINDING_MISMATCH");
  }
}
// end
