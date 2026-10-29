// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({ url: process.env.DATABASE_URL, allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET, expectedPrefix: "kf_agent_test_" });
import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { withAgentRunExecution } from "@kf/build-jobs";
import type { ArtifactStorage } from "@kf/artifact-storage";
import { createGraphPorts } from "../conversations/graph-ports.js";
import { createRunTestFixture, messageInput, type RunTestFixture } from "./run-test-fixture.js";
import { PrismaRunQueries } from "./run-query.service.js";
import { RunControlService } from "./run-control.service.js";
import type { PrismaService } from "../prisma/prisma.service.js";
import { BuildJobService } from "@kf/build-jobs";

let fixture: RunTestFixture;
let conversationId: string;
beforeAll(async () => { fixture = await createRunTestFixture(); });
beforeEach(async () => { await fixture.resetRuns(); conversationId = await fixture.newConversation(); });
afterAll(async () => { await fixture.cleanup(); });
const input = (id: string, text = id) => messageInput(fixture, id, text, { conversationId, mode: "discuss" });
const claim = async () => {
  const lease = await fixture.store.claim("queue-worker", fixture.tenantA, new Date());
  if (!lease) throw new Error("missing claim");
  return lease;
};
const queryPort = () => createGraphPorts(fixture.prisma as PrismaService, {} as ArtifactStorage).workspaceQuery;
const inScope = async <T>(runId: string, execute: () => Promise<T>) => withAgentRunExecution({ runId, tenantId: fixture.tenantA, ownerId: "queue-worker", fence: 1, signal: new AbortController().signal }, execute);

it("accepts concurrent follow-up messages as a single FIFO chain without cancelling the executing run", async () => {
  const first = await fixture.store.create(input("first"));
  const lease = await claim();
  const queued = await Promise.all([fixture.store.create(input("second")), fixture.store.create(input("third"))]);
  const rows = await fixture.prisma.agentRun.findMany({ where: { conversationId, status: "QUEUED" } });
  const head = rows.find(row => row.predecessorRunId === first.id)!;
  const tail = rows.find(row => row.predecessorRunId === head.id)!;
  expect([head.id, tail.id].sort()).toEqual(queued.map(row => row.id).sort());
  expect(await fixture.prisma.agentRun.findUnique({ where: { id: first.id } })).toMatchObject({ status: "RUNNING", supersededByRunId: null });
  expect(await fixture.store.claim("other-worker", fixture.tenantA, new Date())).toBeNull();
  await fixture.store.finish(lease, fixture.tenantA, "SUCCEEDED");
  const next = await claim();
  expect(next.runId).toBe(head.id);
  await fixture.store.finish(next, fixture.tenantA, "SUCCEEDED");
  expect((await claim()).runId).toBe(tail.id);
});

it("excludes future queued inputs from model context and binds assistant replies to their actual run", async () => {
  const first = await fixture.store.create(input("current", "当前需求"));
  const lease = await claim();
  await fixture.store.create(input("future", "未来需求，当前模型不得读取"));
  const port = queryPort();
  const visible = await inScope(first.id, () => port.listRecentMessages({ tenantId: fixture.tenantA, conversationId, limit: 20 }));
  expect(visible).toEqual([{ role: "user", content: "当前需求" }]);
  await inScope(first.id, () => port.appendMessage({ tenantId: fixture.tenantA, conversationId, role: "assistant", content: "当前答复" }));
  expect(await fixture.prisma.message.findFirst({ where: { conversationId, content: "当前答复" } })).toMatchObject({ runId: first.id });
  await fixture.store.finish(lease, fixture.tenantA, "SUCCEEDED");
});

it("keeps approval ahead of queued messages and rejects an invalid resume without consuming the barrier", async () => {
  const first = await fixture.store.create(input("approval"));
  const lease = await claim();
  const queued = await fixture.store.create(input("after-approval"));
  await fixture.store.append(lease, fixture.tenantA, { type: "approval.required", payload: { planHash: "trusted-hash" } });
  await fixture.store.pause(lease, fixture.tenantA, "WAITING_APPROVAL");
  expect((await new PrismaRunQueries(fixture.prisma).latest(fixture.tenantA, conversationId))?.id).toBe(first.id);
  expect(await fixture.store.claim("blocked", fixture.tenantA, new Date())).toBeNull();
  await expect(fixture.store.create(input("cannot-overwrite"))).rejects.toThrow("APPROVAL_RESUME_REQUIRED");
  const resume = { ...input("resume"), mode: "build" as const, action: { type: "resume_approval" as const, expectedRunId: first.id, action: "approve" as const, planHash: "wrong" } };
  await expect(fixture.store.create(resume)).rejects.toThrow("PLAN_HASH_MISMATCH");
  expect(await fixture.prisma.agentRun.findUnique({ where: { id: first.id } })).toMatchObject({ status: "WAITING_APPROVAL", supersededByRunId: null });
  const continued = await fixture.store.create({ ...resume, action: { ...resume.action, planHash: "trusted-hash" } });
  expect(await fixture.prisma.agentRun.findUnique({ where: { id: queued.id } })).toMatchObject({ predecessorRunId: continued.id });
  expect((await claim()).runId).toBe(continued.id);
});

it("orders model history by execution lineage when a clarification overtakes an older queued input", async () => {
  await fixture.store.create(input("question", "第一轮"));
  const lease = await claim();
  const queued = await fixture.store.create(input("later", "排队的下一轮"));
  await fixture.store.append(lease, fixture.tenantA, { type: "input.required", payload: { question: "请补充" } });
  await fixture.store.pause(lease, fixture.tenantA, "WAITING_INPUT");
  expect(await fixture.store.claim("blocked", fixture.tenantA, new Date())).toBeNull();
  const continued = await fixture.store.create(input("clarification", "本轮补充"));
  const continuationLease = await claim();
  expect(continuationLease.runId).toBe(continued.id);
  const port = queryPort();
  expect(await inScope(continued.id, () => port.listRecentMessages({ tenantId: fixture.tenantA, conversationId, limit: 20 }))).toEqual([{ role: "user", content: "第一轮" }, { role: "user", content: "本轮补充" }]);
  await inScope(continued.id, () => port.appendMessage({ tenantId: fixture.tenantA, conversationId, role: "assistant", content: "补充已处理" }));
  await fixture.store.finish(continuationLease, fixture.tenantA, "SUCCEEDED");
  expect((await claim()).runId).toBe(queued.id);
  expect(await inScope(queued.id, () => port.listRecentMessages({ tenantId: fixture.tenantA, conversationId, limit: 20 }))).toEqual([
    { role: "user", content: "第一轮" }, { role: "user", content: "本轮补充" }, { role: "assistant", content: "补充已处理" }, { role: "user", content: "排队的下一轮" },
  ]);
});

async function advancedWorkspace(predecessor: string, workspaceId = fixture.workspaceA) {
  const workspace = await fixture.prisma.solutionWorkspace.findUniqueOrThrow({ where: { id: workspaceId } });
  const revision = await fixture.prisma.solutionRevision.create({ data: { tenantId: fixture.tenantA, workspaceId, parentRevisionId: workspace.currentRevisionId, revisionNumber: 2 } });
  await fixture.prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: revision.id } });
  if (predecessor) await fixture.prisma.agentRun.update({ where: { id: predecessor }, data: { resultRevisionId: revision.id } });
  return revision.id;
}

it("rebases a queued message only onto the successful same-conversation predecessor and records it once", async () => {
  const first = await fixture.store.create(input("build"));
  const lease = await claim();
  const second = await fixture.store.create(input("next"));
  const revisionId = await advancedWorkspace(first.id);
  await fixture.store.finish(lease, fixture.tenantA, "SUCCEEDED");
  expect((await claim()).runId).toBe(second.id);
  expect(await fixture.prisma.agentRun.findUnique({ where: { id: second.id } })).toMatchObject({ baseRevisionId: revisionId });
  const events = await fixture.prisma.agentRunEvent.findMany({ where: { runId: second.id, type: "baseline.changed" } });
  expect(events).toHaveLength(1);
  expect(events[0]!.payload).toEqual({ fromRevisionId: first.baseRevisionId || null, toRevisionId: revisionId });
});

it("fails a queued run instead of silently accepting another conversation's baseline advancement", async () => {
  await fixture.store.create(input("old"));
  const lease = await claim();
  const queued = await fixture.store.create(input("conflict"));
  await advancedWorkspace("");
  await fixture.store.finish(lease, fixture.tenantA, "SUCCEEDED");
  expect(await fixture.store.claim("stale-worker", fixture.tenantA, new Date())).toBeNull();
  expect(await fixture.prisma.agentRun.findUnique({ where: { id: queued.id } })).toMatchObject({ status: "FAILED", failureCode: "BASE_REVISION_CONFLICT", leaseOwner: null });
  expect(await fixture.prisma.agentRunEvent.findMany({ where: { runId: queued.id }, orderBy: { seq: "asc" } })).toMatchObject([{ seq: 1, type: "run.queued" }, { seq: 2, type: "run.failed" }]);
});

it("does not accept another tenant's run scope when reading conversation context", async () => {
  const run = await fixture.store.create(input("isolated"));
  const port = queryPort();
  await expect(inScope(run.id, () => port.listRecentMessages({ tenantId: fixture.tenantB, conversationId: fixture.conversationB, limit: 20 }))).rejects.toThrow("RUN_SCOPE_MISMATCH");
});

it("keeps an explicit base revision fixed even when this conversation's predecessor succeeds", async () => {
  const baseRevisionId = await advancedWorkspace("");
  const first = await fixture.store.create(input("fixed-parent"));
  const lease = await claim();
  const queued = await fixture.store.create({ ...input("fixed-child"), expectedBaseRevisionId: baseRevisionId });
  await advancedWorkspace(first.id);
  await fixture.store.finish(lease, fixture.tenantA, "SUCCEEDED");
  expect(await fixture.store.claim("fixed-worker", fixture.tenantA, new Date())).toBeNull();
  expect(await fixture.prisma.agentRun.findUnique({ where: { id: queued.id } })).toMatchObject({ status: "FAILED", failureCode: "BASE_REVISION_CONFLICT", baseRevisionId });
});

it("does not strand a successor when an intermediate queued entry is cancelled", async () => {
  const first = await fixture.store.create(input("cancel-parent"));
  const lease = await claim();
  const skipped = await fixture.store.create(input("skip-me", "不应进入模型历史"));
  const queued = await fixture.store.create(input("after-cancel", "应执行的后继"));
  const control = new RunControlService(fixture.prisma, fixture.store, new PrismaRunQueries(fixture.prisma));
  expect(await control.cancel(fixture.tenantA, skipped.id, "user-a")).toMatchObject({ status: "CANCELLED" });
  const revisionId = await advancedWorkspace(first.id);
  await fixture.store.finish(lease, fixture.tenantA, "SUCCEEDED");
  expect((await claim()).runId).toBe(queued.id);
  expect(await fixture.prisma.agentRun.findUnique({ where: { id: queued.id } })).toMatchObject({ baseRevisionId: revisionId });
  const messages = await inScope(queued.id, () => queryPort().listRecentMessages({ tenantId: fixture.tenantA, conversationId, limit: 20 }));
  expect(messages.map(message => message.content)).toEqual(["cancel-parent", "应执行的后继"]);
});

it("bounds queued messages while preserving idempotent replay and an available approval continuation", async () => {
  const first = await fixture.store.create(input("bounded"));
  const lease = await claim();
  for (let index = 0; index < 20; index++) await fixture.store.create(input(`queued-${index}`));
  await expect(fixture.store.create(input("overflow"))).rejects.toThrow("RUN_QUEUE_FULL");
  const original = await fixture.store.create(input("queued-0"));
  expect(await fixture.store.create(input("queued-0"))).toMatchObject({ id: original.id });
  await fixture.store.append(lease, fixture.tenantA, { type: "approval.required", payload: { planHash: "hash" } });
  await fixture.store.pause(lease, fixture.tenantA, "WAITING_APPROVAL");
  const continued = await fixture.store.create({ ...input("bounded-resume"), mode: "build", action: { type: "resume_approval", expectedRunId: first.id, action: "cancel", planHash: "hash" } });
  expect((await claim()).runId).toBe(continued.id);
});

it("rejects a build whose submitted base differs from its durable run before consulting the plan", async () => {
  const first = await fixture.store.create(input("bound-base"));
  await claim();
  await expect(inScope(first.id, () => new BuildJobService(fixture.prisma).enqueue({ tenantId: fixture.tenantA, workspaceId: fixture.workspaceA,
    baseRevisionId: "wrong-revision", changePlanId: "must-not-look-up", planHash: "a".repeat(64), domainKind: "kingclient", idempotencyKey: "wrong-run-base",
  }))).rejects.toThrow("RUN_BASE_REVISION_MISMATCH");
});

it("still permits cancelling a stale approval but never approving it on an unconfirmed new base", async () => {
  const first = await fixture.store.create(input("stale-approval"));
  const lease = await claim();
  await fixture.store.append(lease, fixture.tenantA, { type: "approval.required", payload: { planHash: "old-hash" } });
  await fixture.store.pause(lease, fixture.tenantA, "WAITING_APPROVAL");
  await advancedWorkspace("");
  await expect(fixture.store.create({ ...input("stale-approve"), mode: "build", action: { type: "resume_approval", expectedRunId: first.id, action: "approve", planHash: "old-hash" } })).rejects.toThrow("STALE_BASE_REVISION");
  const control = new RunControlService(fixture.prisma, fixture.store, new PrismaRunQueries(fixture.prisma));
  const cancelled = await control.cancel(fixture.tenantA, first.id, "user-a");
  expect(cancelled).toMatchObject({ status: "QUEUED", baseRevisionId: first.baseRevisionId });
  expect((await claim()).runId).toBe(cancelled.id);
});

it("does not launder an external revision through a newer successful clarification", async () => {
  await fixture.store.create(input("before-external"));
  const lease = await claim();
  const queued = await fixture.store.create(input("old-admission"));
  await fixture.store.append(lease, fixture.tenantA, { type: "input.required", payload: { question: "请补充" } });
  await fixture.store.pause(lease, fixture.tenantA, "WAITING_INPUT");
  await advancedWorkspace("");
  await fixture.store.create(input("new-clarification"));
  const continued = await claim();
  await fixture.store.finish(continued, fixture.tenantA, "SUCCEEDED");
  expect(await fixture.store.claim("cannot-rebase-external", fixture.tenantA, new Date())).toBeNull();
  expect(await fixture.prisma.agentRun.findUnique({ where: { id: queued.id } })).toMatchObject({ status: "FAILED", failureCode: "BASE_REVISION_CONFLICT" });
});

it("follows several owned revisions without losing the original queued admission baseline", async () => {
  const first = await fixture.store.create(input("owned-first"));
  const firstLease = await claim();
  const second = await fixture.store.create(input("owned-second"));
  const third = await fixture.store.create(input("owned-third"));
  const revision1 = await advancedWorkspace(first.id);
  await fixture.store.finish(firstLease, fixture.tenantA, "SUCCEEDED");
  const secondLease = await claim();
  expect(secondLease.runId).toBe(second.id);
  expect(await fixture.prisma.agentRun.findUnique({ where: { id: second.id } })).toMatchObject({ baseRevisionId: revision1 });
  const revision2 = await advancedWorkspace(second.id);
  await fixture.store.finish(secondLease, fixture.tenantA, "SUCCEEDED");
  expect((await claim()).runId).toBe(third.id);
  expect(await fixture.prisma.agentRun.findUnique({ where: { id: third.id } })).toMatchObject({ baseRevisionId: revision2 });
});
// end
