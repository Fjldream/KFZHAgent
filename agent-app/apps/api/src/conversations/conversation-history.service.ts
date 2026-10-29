// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException, PayloadTooLargeException } from "@nestjs/common";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import type { Prisma, PrismaClient } from "@prisma/client";
// end
import { canonicalServerHash, ConversationForkInputSchema, type ConversationListItem, type RevisionDetail } from "@kf/contracts";
import { PrismaService } from "../prisma/prisma.service.js";
import { DeliverySnapshotService } from "../delivery/delivery-snapshot.service.js";
import { ConversationQueryService } from "./conversation-query.service.js";
import { sanitizeConversationMessage } from "./conversation.service.js";

@Injectable()
export class ConversationHistoryService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaClient,
    @Inject(DeliverySnapshotService) private readonly delivery: Pick<DeliverySnapshotService, "assertArtifactDeliverable">) {}

  async revision(tenantId: string, workspaceId: string, revisionId: string): Promise<RevisionDetail> {
    const [workspace, revision] = await Promise.all([
      this.prisma.solutionWorkspace.findFirst({ where: { tenantId, id: workspaceId } }),
      this.prisma.solutionRevision.findFirst({ where: { tenantId, workspaceId, id: revisionId } }),
    ]);
    if (!workspace || !revision) throw new NotFoundException("revision");
    const result: RevisionDetail = { id: revision.id, workspaceId, revisionNumber: revision.revisionNumber,
      parentRevisionId: revision.parentRevisionId, kind: revision.kind, createdAt: revision.createdAt.toISOString(),
      current: workspace.currentRevisionId === revision.id, delivery: null, forkAnchor: null,
      verification: { compiled: "unknown", runtime: "not_performed", visual: "not_performed" } };
    const artifacts = await this.prisma.artifact.findMany({ where: { tenantId, solutionRevisionId: revisionId, kind: "client-package" }, take: 2 });
    if (!artifacts.length) return result;
    if (artifacts.length !== 1) throw new ConflictException("REVISION_DELIVERY_AMBIGUOUS");
    const artifact = artifacts[0]!;
    const job = await this.prisma.buildJob.findFirst({ where: { tenantId, workspaceId, id: artifact.buildJobId, status: "SUCCEEDED",
      changePlanId: revision.changePlanId ?? "", baseRevisionId: revision.parentRevisionId ?? "" } });
    if (!job || !artifact.sha256 || !/^[a-f0-9]{64}$/.test(artifact.sha256)) throw new ConflictException("REVISION_DELIVERY_INVALID");
    // The existing download verifier validates the persisted plan/native/package hash chain.
    // It is deliberately outside a Prisma transaction: it uses its own bounded queries.
    await this.delivery.assertArtifactDeliverable(tenantId, artifact.id);
    const run = job.agentRunId ? await this.prisma.agentRun.findFirst({ where: { id: job.agentRunId, tenantId, workspaceId,
      buildJobId: job.id, resultRevisionId: revisionId, status: "SUCCEEDED" } }) : null;
    const anchor = run ? await this.prisma.message.findFirst({ where: { tenantId, conversationId: run.conversationId, runId: run.id },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }] }) : null;
    const validation = await this.prisma.validationReport.findFirst({ where: { tenantId, buildJobId: job.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    result.delivery = { artifactId: artifact.id, sha256: artifact.sha256, buildJobId: job.id, runId: run?.id ?? null };
    result.forkAnchor = anchor && run ? { conversationId: run.conversationId, messageId: anchor.id } : null;
    result.verification.compiled = validation?.outcome === "pass" ? "passed" : "unknown";
    return result;
  }

  async fork(tenantId: string, userId: string, conversationId: string, body: unknown): Promise<ConversationListItem> {
    const parsed = ConversationForkInputSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("FORK_INPUT_INVALID");
    const input = parsed.data;
    const source = await this.prisma.conversation.findFirst({ where: { id: conversationId, tenantId } });
    if (!source || !await this.prisma.user.findFirst({ where: { id: userId, tenantId }, select: { id: true } })) throw new NotFoundException("conversation");
    const requestHash = canonicalServerHash({ tenantId, userId, conversationId, ...input });
    const key = { tenantId_sourceConversationId_clientRequestId: { tenantId, sourceConversationId: conversationId, clientRequestId: input.clientRequestId } };
    const prior = await this.prisma.conversationForkRequest.findUnique({ where: key });
    if (prior) {
      if (prior.requestHash !== requestHash) throw new ConflictException("FORK_REQUEST_CONFLICT");
      return new ConversationQueryService(this.prisma).get(tenantId, prior.resultConversationId);
    }
    const revision = await this.revision(tenantId, source.workspaceId, input.revisionId);
    if (!revision.delivery || !revision.forkAnchor || revision.forkAnchor.conversationId !== conversationId) throw new ConflictException("FORK_SOURCE_UNVERIFIED");
    const anchor = await this.prisma.message.findFirst({ where: { tenantId, conversationId, id: input.messageId, runId: revision.delivery.runId } });
    if (!anchor) throw new ConflictException("FORK_MESSAGE_REVISION_MISMATCH");
    const resultId = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1 FROM pg_advisory_xact_lock(hashtextextended(${`kf-fork:${tenantId}:${conversationId}:${input.clientRequestId}`},0))`;
      const replay = await tx.conversationForkRequest.findUnique({ where: key });
      if (replay) { if (replay.requestHash !== requestHash) throw new ConflictException("FORK_REQUEST_CONFLICT"); return replay.resultConversationId; }
      const stillBound = await tx.artifact.findFirst({ where: { id: revision.delivery!.artifactId, tenantId,
        solutionRevisionId: input.revisionId, buildJobId: revision.delivery!.buildJobId, sha256: revision.delivery!.sha256 } });
      const stillSource = await tx.conversation.findFirst({ where: { id: conversationId, tenantId, workspaceId: source.workspaceId } });
      if (!stillBound || !stillSource) throw new ConflictException("FORK_SOURCE_CHANGED");
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      const messages = await this.anchoredMessages(tx, { tenantId, workspaceId: source.workspaceId, conversationId,
        runId: revision.delivery!.runId!, messageId: anchor.id, createdAt: anchor.createdAt });
      // end
      if (messages.length > 4096 || messages.reduce((bytes, message) => bytes + Buffer.byteLength(message.content, "utf8"), 0) > 8 * 1024 * 1024) {
        throw new PayloadTooLargeException("FORK_HISTORY_TOO_LARGE");
      }
      const title = input.title ?? Array.from(`${source.title} · 分支`).slice(0, 100).join("");
      const created = await tx.conversation.create({ data: { tenantId, workspaceId: source.workspaceId, title,
        forkedFromConversationId: conversationId, forkedFromMessageId: anchor.id, forkedFromRevisionId: input.revisionId } });
      // New identities and monotonic snapshot order; no run IDs, parts, receipts, checkpoints or leases are copied.
      const timestamp = Date.now() - messages.length - 1;
      if (messages.length) await tx.message.createMany({ data: messages.map((message, index) => ({ tenantId, conversationId: created.id,
        role: message.role, content: sanitizeConversationMessage(message).content, createdAt: new Date(timestamp + index) })) });
      await tx.message.create({ data: { tenantId, conversationId: created.id, role: "assistant",
        content: `从版本 v${revision.revisionNumber} 的历史消息开始新对话。历史版本仅作参考，后续生成仍以当前工程版本为基线并重新确认。` } });
      await tx.conversationForkRequest.create({ data: { tenantId, sourceConversationId: conversationId, clientRequestId: input.clientRequestId,
        requestHash, resultConversationId: created.id } });
      await tx.auditLog.create({ data: { tenantId, actorUserId: userId, action: "CONVERSATION_FORKED", resourceType: "CONVERSATION", resourceId: created.id,
        detail: { sourceConversationId: conversationId, sourceMessageId: anchor.id, sourceRevisionId: input.revisionId, copiedMessages: messages.length } } });
      return created.id;
    });
    return new ConversationQueryService(this.prisma).get(tenantId, resultId);
  }

  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  private async anchoredMessages(tx: Prisma.TransactionClient, input: {
    tenantId: string; workspaceId: string; conversationId: string; runId: string; messageId: string; createdAt: Date;
  }) {
    // Execution order is authoritative: queued input can have an earlier timestamp than the build's reply.
    const lineage = await tx.$queryRaw<Array<{ id: string; predecessorRunId: string | null; createdAt: Date; startedAt: Date | null; depth: number }>>`
      WITH RECURSIVE lineage AS (
        SELECT "id", "predecessorRunId", "createdAt", "startedAt", 0 AS depth, ARRAY["id"] AS path
        FROM "AgentRun" WHERE "id"=${input.runId} AND "tenantId"=${input.tenantId}
          AND "workspaceId"=${input.workspaceId} AND "conversationId"=${input.conversationId}
        UNION ALL
        SELECT parent."id", parent."predecessorRunId", parent."createdAt", parent."startedAt", child.depth+1, child.path || parent."id"
        FROM "AgentRun" parent JOIN lineage child ON parent."id"=child."predecessorRunId"
        WHERE parent."tenantId"=${input.tenantId} AND parent."workspaceId"=${input.workspaceId}
          AND parent."conversationId"=${input.conversationId} AND child.depth < 255 AND NOT parent."id"=ANY(child.path)
      ) SELECT "id", "predecessorRunId", "createdAt", "startedAt", depth FROM lineage ORDER BY depth
    `;
    const last = lineage.at(-1);
    if (!last || (last.predecessorRunId !== null && (last.depth < 255 || lineage.some(row => row.id === last.predecessorRunId)))) {
      throw new ConflictException("FORK_HISTORY_LINEAGE_INVALID");
    }
    if (last.predecessorRunId !== null) throw new PayloadTooLargeException("FORK_HISTORY_TOO_LARGE");
    const earliest = new Date(Math.min(...lineage.map(row => row.createdAt.getTime())));
    const cursor = [{ createdAt: { lt: input.createdAt } }, { createdAt: input.createdAt, id: { lte: input.messageId } }];
    const executedPredecessors = lineage.filter(row => row.depth > 0 && row.startedAt !== null).map(row => row.id);
    const messages = await tx.message.findMany({ where: { tenantId: input.tenantId, conversationId: input.conversationId, OR: [
      { runId: input.runId, OR: cursor },
      { runId: { in: executedPredecessors } },
      { runId: null, createdAt: { lt: earliest }, OR: cursor },
    ] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 4097 });
    const depth = new Map(lineage.map(row => [row.id, row.depth]));
    return messages.sort((left, right) => {
      const leftDepth = left.runId === null ? 256 : depth.get(left.runId)!;
      const rightDepth = right.runId === null ? 256 : depth.get(right.runId)!;
      return rightDepth - leftDepth || left.createdAt.getTime() - right.createdAt.getTime()
        || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
    });
  }
  // end
}
// end
