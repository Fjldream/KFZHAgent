// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import "reflect-metadata";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({ url: process.env.DATABASE_URL, allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET, expectedPrefix: "kf_agent_test_" });
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ConflictException } from "@nestjs/common";
import { ConversationHistoryService } from "./conversation-history.service.js";

let prisma: PrismaClient;
let tenantId: string;
let otherTenantId: string;
let userId: string;
let workspaceId: string;
let conversationId: string;
let initialId: string;
let revisionId: string;
let runId: string;
let jobId: string;
let artifactId: string;
let anchorId: string;
let service: ConversationHistoryService;
const verify = vi.fn<(tenantId: string, artifactId: string) => Promise<void>>(async () => {});
beforeAll(() => { prisma = new PrismaClient(); });
beforeEach(async () => {
  verify.mockClear(); verify.mockImplementation(async () => {});
  tenantId = (await prisma.tenant.create({ data: { name: "history-" + randomUUID() } })).id;
  otherTenantId = (await prisma.tenant.create({ data: { name: "history-other-" + randomUUID() } })).id;
  userId = (await prisma.user.create({ data: { tenantId, username: "history-user", passwordHash: "session-only", mustChangePassword: false, role: "member" } })).id;
  workspaceId = (await prisma.solutionWorkspace.create({ data: { tenantId, name: "History", generationWorkflow: "creative-v2" } })).id;
  conversationId = (await prisma.conversation.create({ data: { tenantId, workspaceId, title: "原始对话" } })).id;
  initialId = (await prisma.solutionRevision.create({ data: { tenantId, workspaceId, revisionNumber: 1, kind: "initial" } })).id;
  const plan = await prisma.changePlan.create({ data: { tenantId, workspaceId, planHash: "a".repeat(64) } });
  revisionId = (await prisma.solutionRevision.create({ data: { tenantId, workspaceId, revisionNumber: 2, kind: "built", changePlanId: plan.id, parentRevisionId: initialId } })).id;
  runId = (await prisma.agentRun.create({ data: { tenantId, workspaceId, conversationId, requestedByUserId: userId,
    clientRequestId: randomUUID(), requestHash: "b".repeat(64), mode: "build", action: { type: "message", text: "构建" }, status: "SUCCEEDED", resultRevisionId: revisionId } })).id;
  jobId = (await prisma.buildJob.create({ data: { tenantId, workspaceId, baseRevisionId: initialId, changePlanId: plan.id, planHash: plan.planHash,
    domainKind: "kingclient", idempotencyKey: randomUUID(), status: "SUCCEEDED", agentRunId: runId } })).id;
  await prisma.agentRun.update({ where: { id: runId }, data: { buildJobId: jobId } });
  artifactId = (await prisma.artifact.create({ data: { tenantId, buildJobId: jobId, solutionRevisionId: revisionId,
    kind: "client-package", storageKey: "private-storage-key", sha256: "c".repeat(64) } })).id;
  await prisma.validationReport.create({ data: { tenantId, buildJobId: jobId, outcome: "pass" } });
  await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: revisionId } });
  await prisma.message.create({ data: { tenantId, conversationId, role: "user", runId, content: "保留需求", createdAt: new Date("2026-10-27T00:00:01Z") } });
  await prisma.message.create({ data: { tenantId, conversationId, role: "assistant", runId,
    content: JSON.stringify({ schema: "kf-server-plan-envelope/v1", signature: "private-receipt", plan: {} }), createdAt: new Date("2026-10-27T00:00:02Z") } });
  anchorId = (await prisma.message.create({ data: { tenantId, conversationId, role: "assistant", runId, content: "版本二完成", createdAt: new Date("2026-10-27T00:00:03Z") } })).id;
  await prisma.message.create({ data: { tenantId, conversationId, role: "user", content: "之后的消息不能复制", createdAt: new Date("2026-10-27T00:00:04Z") } });
  service = new ConversationHistoryService(prisma, { assertArtifactDeliverable: verify });
});
afterEach(async () => {
  const tenants = [tenantId, otherTenantId];
  await prisma.auditLog.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.message.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.artifact.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.validationReport.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.agentRun.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.buildJob.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.conversation.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.solutionRevision.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.changePlan.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.solutionWorkspace.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.user.deleteMany({ where: { tenantId: { in: tenants } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenants } } });
});
afterAll(async () => { await prisma.$disconnect(); });
const input = () => ({ clientRequestId: randomUUID(), messageId: anchorId, revisionId });

describe("historical revision and fork persistence", () => {
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("copies executed predecessor history instead of queued, later or sibling inputs with earlier timestamps", async () => {
    const createRun = (data: { predecessorRunId?: string; status: string; startedAt?: Date; createdAt: Date }) => prisma.agentRun.create({ data: {
      tenantId, workspaceId, conversationId, requestedByUserId: userId, clientRequestId: randomUUID(), requestHash: "d".repeat(64),
      mode: "discuss", action: { type: "message", text: "history fixture" }, ...data,
    } });
    const predecessor = await createRun({ status: "SUCCEEDED", createdAt: new Date("2026-10-27T00:00:00Z"), startedAt: new Date("2026-10-27T00:00:01Z") });
    await prisma.agentRun.update({ where: { id: runId }, data: { predecessorRunId: predecessor.id, createdAt: new Date("2026-10-27T00:00:04Z") } });
    await prisma.message.update({ where: { id: anchorId }, data: { createdAt: new Date("2026-10-27T00:00:08Z") } });
    const queued = await createRun({ status: "QUEUED", createdAt: new Date("2026-10-27T00:00:02Z") });
    const sibling = await createRun({ status: "SUCCEEDED", startedAt: new Date("2026-10-27T00:00:02Z"), createdAt: new Date("2026-10-27T00:00:01Z") });
    const later = await createRun({ predecessorRunId: runId, status: "SUCCEEDED", startedAt: new Date("2026-10-27T00:00:06Z"), createdAt: new Date("2026-10-27T00:00:05Z") });
    await prisma.message.createMany({ data: [
      { tenantId, conversationId, role: "user", content: "最早的无运行历史", createdAt: new Date("2026-10-26T23:59:59Z") },
      { tenantId, conversationId, role: "assistant", runId: predecessor.id, content: "已执行的前序，即使时间晚于锚点", createdAt: new Date("2026-10-27T00:00:10Z") },
      { tenantId, conversationId, role: "user", runId: queued.id, content: "排队输入不能提前复制", createdAt: new Date("2026-10-27T00:00:02Z") },
      { tenantId, conversationId, role: "user", runId: sibling.id, content: "旁支输入不能复制", createdAt: new Date("2026-10-27T00:00:02Z") },
      { tenantId, conversationId, role: "user", runId: later.id, content: "后继输入不能复制", createdAt: new Date("2026-10-27T00:00:07Z") },
    ] });
    const fork = await service.fork(tenantId, userId, conversationId, input());
    const rows = await prisma.message.findMany({ where: { conversationId: fork.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    expect(rows.slice(0, 2).map(row => row.content)).toEqual(["最早的无运行历史", "已执行的前序，即使时间晚于锚点"]);
    expect(rows.some(row => /排队输入|旁支输入|后继输入|之后的消息/.test(row.content))).toBe(false);
    expect(rows.every(row => row.runId === null)).toBe(true);
  });
  it("fails closed on a missing, cyclic or foreign-conversation predecessor without copying records", async () => {
    const other = await prisma.conversation.create({ data: { tenantId, workspaceId, title: "foreign lineage" } });
    const foreign = await prisma.agentRun.create({ data: { tenantId, workspaceId, conversationId: other.id, requestedByUserId: userId,
      clientRequestId: randomUUID(), requestHash: "d".repeat(64), mode: "discuss", action: { type: "message", text: "foreign" }, status: "SUCCEEDED" } });
    for (const predecessorRunId of [randomUUID(), "", runId, foreign.id]) {
      await prisma.agentRun.update({ where: { id: runId }, data: { predecessorRunId } });
      await expect(service.fork(tenantId, userId, conversationId, input())).rejects.toMatchObject({ status: 409 });
    }
    expect(await prisma.conversationForkRequest.count({ where: { tenantId } })).toBe(0);
  });
  it("rejects an overlong execution lineage instead of silently omitting old history", async () => {
    const ids = Array.from({ length: 256 }, () => randomUUID());
    await prisma.agentRun.createMany({ data: ids.map((id, index) => ({ id, tenantId, workspaceId, conversationId,
      requestedByUserId: userId, clientRequestId: randomUUID(), requestHash: "d".repeat(64), mode: "discuss", status: "SUCCEEDED",
      action: { type: "message", text: "bounded history" }, predecessorRunId: ids[index + 1] ?? null, startedAt: new Date(),
    })) });
    await prisma.agentRun.update({ where: { id: runId }, data: { predecessorRunId: ids[0]! } });
    await expect(service.fork(tenantId, userId, conversationId, input())).rejects.toMatchObject({ status: 413 });
    expect(await prisma.conversationForkRequest.count({ where: { tenantId } })).toBe(0);
  });
  // end
  it("returns exact historical artifact evidence while preserving the current revision", async () => {
    const latest = await prisma.solutionRevision.create({ data: { tenantId, workspaceId, revisionNumber: 3, kind: "built", parentRevisionId: revisionId } });
    await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: latest.id } });
    const detail = await service.revision(tenantId, workspaceId, revisionId);
    expect(detail).toMatchObject({ current: false, revisionNumber: 2, parentRevisionId: initialId,
      delivery: { artifactId, sha256: "c".repeat(64), buildJobId: jobId, runId },
      forkAnchor: { conversationId, messageId: anchorId }, verification: { compiled: "passed", runtime: "not_performed", visual: "not_performed" } });
    expect(verify).toHaveBeenCalledWith(tenantId, artifactId);
    expect(JSON.stringify(detail)).not.toContain("private-storage-key");
    expect((await prisma.solutionWorkspace.findUniqueOrThrow({ where: { id: workspaceId } })).currentRevisionId).toBe(latest.id);
  });
  it("forks once under concurrent replays, copies only safe anchored history and never copies execution authority", async () => {
    const body = input();
    const results = await Promise.all(Array.from({ length: 6 }, () => service.fork(tenantId, userId, conversationId, body)));
    expect(new Set(results.map(result => result.id)).size).toBe(1);
    const id = results[0]!.id;
    expect(id).not.toBe(conversationId);
    expect(await prisma.conversation.findUniqueOrThrow({ where: { id } })).toMatchObject({ forkedFromConversationId: conversationId,
      forkedFromMessageId: anchorId, forkedFromRevisionId: revisionId, memory: null, summary: null });
    const messages = await prisma.message.findMany({ where: { conversationId: id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    expect(messages).toHaveLength(4);
    expect(messages[0]!.content).toBe("保留需求");
    expect(messages[1]!.content).not.toContain("private-receipt");
    expect(messages[2]!.content).toBe("版本二完成");
    expect(messages.every(message => message.runId === null && message.clientMessageId === null && message.parts === null)).toBe(true);
    expect(messages.some(message => message.content === "之后的消息不能复制")).toBe(false);
    expect(await prisma.agentRun.count({ where: { conversationId: id } })).toBe(0);
    expect(await prisma.auditLog.count({ where: { tenantId, resourceId: id, action: "CONVERSATION_FORKED" } })).toBe(1);
    expect((await prisma.solutionWorkspace.findUniqueOrThrow({ where: { id: workspaceId } })).currentRevisionId).toBe(revisionId);
  });
  it("rejects conflicting idempotency content and replays an accepted fork after original artifact removal", async () => {
    const body = input(); const first = await service.fork(tenantId, userId, conversationId, body);
    await expect(service.fork(tenantId, userId, conversationId, { ...body, title: "不同标题" })).rejects.toMatchObject({ status: 409 });
    await prisma.artifact.delete({ where: { id: artifactId } });
    expect((await service.fork(tenantId, userId, conversationId, body)).id).toBe(first.id);
  });
  it("rejects foreign tenant, workspace, actor and message/revision combinations", async () => {
    await expect(service.revision(otherTenantId, workspaceId, revisionId)).rejects.toMatchObject({ status: 404 });
    await expect(service.revision(tenantId, "different-workspace", revisionId)).rejects.toMatchObject({ status: 404 });
    await expect(service.fork(otherTenantId, userId, conversationId, input())).rejects.toMatchObject({ status: 404 });
    await expect(service.fork(tenantId, "foreign-user", conversationId, input())).rejects.toMatchObject({ status: 404 });
    const another = await prisma.conversation.create({ data: { tenantId, workspaceId, title: "其他会话" } });
    const message = await prisma.message.create({ data: { tenantId, conversationId: another.id, role: "assistant", content: "其他会话" } });
    await expect(service.fork(tenantId, userId, conversationId, { ...input(), messageId: message.id })).rejects.toMatchObject({ status: 409 });
    await expect(service.fork(tenantId, userId, another.id, input())).rejects.toMatchObject({ status: 409 });
  });
  it("keeps old unbound revisions read-only and refuses invalid or rejected package bindings", async () => {
    expect(await service.revision(tenantId, workspaceId, initialId)).toMatchObject({ delivery: null, forkAnchor: null, verification: { compiled: "unknown" } });
    await expect(service.fork(tenantId, userId, conversationId, { ...input(), revisionId: initialId })).rejects.toMatchObject({ status: 409 });
    verify.mockRejectedValueOnce(new ConflictException("binding rejected"));
    await expect(service.revision(tenantId, workspaceId, revisionId)).rejects.toMatchObject({ status: 409 });
    await prisma.buildJob.update({ where: { id: jobId }, data: { status: "FAILED" } });
    await expect(service.revision(tenantId, workspaceId, revisionId)).rejects.toMatchObject({ status: 409 });
  });
  it("validates fork inputs and creates no records on rejected requests", async () => {
    for (const body of [{ ...input(), clientRequestId: "x" }, { ...input(), title: " " }, { ...input(), receipt: "forged" }, { ...input(), title: "a".repeat(101) }]) {
      await expect(service.fork(tenantId, userId, conversationId, body)).rejects.toMatchObject({ status: 400 });
    }
    expect(await prisma.conversationForkRequest.count({ where: { tenantId } })).toBe(0);
  });
});
// end
