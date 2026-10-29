// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({ url: process.env.DATABASE_URL, allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET, expectedPrefix: "kf_agent_test_" });

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PrismaClient, type Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { encodeBlueprintConfirmation } from "@kf/agent-orchestrator";
import { BuildJobService, withAgentRunExecution, type CompleteBuildInput } from "@kf/build-jobs";
import { createRunTestFixture, messageInput, runTestPolicy, type RunTestFixture } from "./run-test-fixture.js";
import { PrismaRunStore, type ClaimedRunLease } from "./run-store.js";
import { PrismaRunStepStore } from "./run-step-store.js";
import { RunControlService } from "./run-control.service.js";
import { PrismaRunQueries } from "./run-query.service.js";

let fixture: RunTestFixture;
beforeEach(async () => { fixture = await createRunTestFixture(); });
afterEach(async () => {
  if (!fixture) return;
  const where = { tenantId: { in: [fixture.tenantA, fixture.tenantB] } };
  await fixture.prisma.auditLog.deleteMany({ where });
  await fixture.prisma.artifact.deleteMany({ where });
  await fixture.prisma.validationReport.deleteMany({ where });
  await fixture.prisma.agentRun.updateMany({ where, data: { buildJobId: null, resultRevisionId: null, baseRevisionId: null } });
  await fixture.prisma.buildJob.deleteMany({ where });
  await fixture.prisma.domainProjectRevision.deleteMany({ where });
  await fixture.prisma.solutionWorkspace.updateMany({ where, data: { currentRevisionId: null } });
  await fixture.prisma.solutionRevision.deleteMany({ where });
  await fixture.prisma.changePlan.deleteMany({ where });
  await fixture.prisma.changeRequest.deleteMany({ where });
  await fixture.cleanup();
});

// 只注入审计存储故障；事务、状态变更和回滚仍由真实 PostgreSQL 执行。
const rejectAudit = (prisma: PrismaClient, action: string): PrismaClient => new Proxy(prisma, {
  get(target, property) {
    if (property !== "$transaction") return Reflect.get(target, property, target);
    return (execute: (tx: Prisma.TransactionClient) => Promise<unknown>) => target.$transaction(tx => execute(new Proxy(tx, {
      get(transaction, key) {
        if (key !== "auditLog") return Reflect.get(transaction, key, transaction);
        return new Proxy(transaction.auditLog, { get(delegate, method) {
          if (method !== "create" && method !== "upsert") return Reflect.get(delegate, method, delegate);
          return (args: { data?: { action?: string }; create?: { action?: string } }) => {
            if ((args.data ?? args.create)?.action === action) throw new Error("AUDIT_STORAGE_UNAVAILABLE");
            return Reflect.apply(Reflect.get(delegate, method), delegate, [args]);
          };
        } });
      },
    })));
  },
});

const claimed = async (text = "private requirement not for audit") => {
  const run = await fixture.store.create(messageInput(fixture, "initial", text));
  const lease = await fixture.store.claim("audit-agent", fixture.tenantA, new Date());
  if (!lease || lease.runId !== run.id) throw new Error("missing fixture lease");
  return lease;
};
const approval = async (action: "approve" | "revise" | "cancel") => {
  const initial = await claimed();
  await fixture.store.append(initial, fixture.tenantA, { type: "approval.required", payload: { planHash: "approved-plan-hash" } });
  await fixture.store.pause(initial, fixture.tenantA, "WAITING_APPROVAL");
  const input = messageInput(fixture, "decision", "", { action: { type: "resume_approval", expectedRunId: initial.runId, action, planHash: "approved-plan-hash" } });
  const run = await fixture.store.create(input);
  const lease = await fixture.store.claim("decision-agent", fixture.tenantA, new Date());
  if (!lease || lease.runId !== run.id) throw new Error("missing decision lease");
  return { input, lease };
};
const completeApproval = (lease: ClaimedRunLease, action: "approve" | "revise" | "cancel", prisma = fixture.prisma) => new PrismaRunStepStore(prisma).complete({
  lease, tenantId: fixture.tenantA, stepKey: "approval-decision", inputHash: "approval-input",
  output: { resumeAction: action, stage: action === "approve" ? "building" : action === "revise" ? "planning" : "idle" },
});
const logs = (runId: string, action: string) => fixture.prisma.auditLog.findMany({ where: { tenantId: fixture.tenantA, action, resourceId: runId } });

const queuedBuild = async () => {
  const revision = await fixture.prisma.solutionRevision.create({ data: { tenantId: fixture.tenantA, workspaceId: fixture.workspaceA, revisionNumber: 1 } });
  await fixture.prisma.solutionWorkspace.update({ where: { id: fixture.workspaceA }, data: { currentRevisionId: revision.id } });
  const request = await fixture.prisma.changeRequest.create({ data: { tenantId: fixture.tenantA, workspaceId: fixture.workspaceA, title: "audit build" } });
  const plan = await fixture.prisma.changePlan.create({ data: { tenantId: fixture.tenantA, workspaceId: fixture.workspaceA, changeRequestId: request.id, planHash: "build-hash" } });
  const lease = await claimed();
  const input = { tenantId: fixture.tenantA, workspaceId: fixture.workspaceA, baseRevisionId: revision.id, changePlanId: plan.id, planHash: plan.planHash, domainKind: "kingclient", idempotencyKey: `audit-build:${lease.runId}` };
  const enqueue = (prisma: PrismaClient = fixture.prisma, scopeLease = lease) => withAgentRunExecution({
    runId: lease.runId, tenantId: fixture.tenantA, ownerId: scopeLease.ownerId, fence: scopeLease.fence, signal: new AbortController().signal,
  }, () => new BuildJobService(prisma).enqueue(input));
  return { lease, enqueue, revision };
};
const leasedBuild = async () => {
  const seed = await queuedBuild();
  const job = await seed.enqueue();
  await fixture.prisma.buildJob.update({ where: { id: job.id }, data: { status: "RUNNING", leaseOwner: "audit-builder", attemptCount: 1, leaseExpiresAt: new Date(Date.now() + 30_000) } });
  const input: CompleteBuildInput = {
    jobId: job.id, tenantId: fixture.tenantA, leaseOwner: "audit-builder", leaseAttempt: 1, status: "SUCCEEDED",
    validationReport: { outcome: "pass", summary: "fixture complete", details: {} },
    result: { kind: "fixture", state: {}, domainKind: "kingclient", domainProjectKind: "fixture", mediaType: "application/zip", fileExtension: ".zip", packageHash: "a".repeat(64), packageUrl: "private-package-url",
      artifact: { kind: "package", mediaType: "application/zip", fileExtension: ".zip", storageKey: "private-storage-key", sizeBytes: 1, sha256: "a".repeat(64) } },
  };
  return { ...seed, job, input };
};

describe("real Run audit boundaries", () => {
  it("audits admission once under concurrent replay without storing request content", async () => {
    const input = messageInput(fixture, "admission", "secret prompt and image data");
    const results = await Promise.all(Array.from({ length: 5 }, () => fixture.store.create(input)));
    expect(new Set(results.map(run => run.id)).size).toBe(1);
    const audit = await logs(results[0]!.id, "RUN_ACTION_ACCEPTED");
    expect(audit).toMatchObject([{ actorUserId: "user-a", resourceType: "AGENT_RUN", detail: { actionType: "message", phase: "accepted", conversationId: fixture.conversationA, workspaceId: fixture.workspaceA } }]);
    expect(JSON.stringify(audit)).not.toContain(input.action.type === "message" ? input.action.text : "unexpected");
    await expect(fixture.store.create({ ...input, action: { type: "message", text: "changed" } })).rejects.toThrow("IDEMPOTENCY_CONFLICT");
    expect(await logs(results[0]!.id, "RUN_ACTION_ACCEPTED")).toHaveLength(1);
  });

  it("rolls back message and Run admission when audit storage fails", async () => {
    const store = new PrismaRunStore(rejectAudit(fixture.prisma, "RUN_ACTION_ACCEPTED"), 30000, runTestPolicy([fixture.tenantA]));
    await expect(store.create(messageInput(fixture, "audit-fail", "do not persist"))).rejects.toThrow("AUDIT_STORAGE_UNAVAILABLE");
    expect(await fixture.prisma.agentRun.count({ where: { tenantId: fixture.tenantA } })).toBe(0);
    expect(await fixture.prisma.message.count({ where: { tenantId: fixture.tenantA } })).toBe(0);
  });

  it("binds accepted blueprint audit to the exact server-issued revision and hash", async () => {
    const initial = await claimed();
    const receipt = encodeBlueprintConfirmation(2, "b".repeat(64));
    await fixture.store.append(initial, fixture.tenantA, { type: "input.required", payload: { receipt } });
    await fixture.store.pause(initial, fixture.tenantA, "WAITING_INPUT");
    const input = messageInput(fixture, "confirm", "", { action: { type: "confirm_blueprint", expectedRunId: initial.runId, receipt } });
    const run = await fixture.store.create(input);
    expect(await logs(run.id, "RUN_ACTION_ACCEPTED")).toMatchObject([
      { detail: { actionType: "confirm_blueprint", phase: "accepted", expectedRunId: initial.runId, blueprintRevision: 2, blueprintHash: "b".repeat(64) } },
    ]);
    const bad = messageInput(fixture, "bad-blueprint", "", { action: { type: "confirm_blueprint", expectedRunId: initial.runId, receipt: encodeBlueprintConfirmation(3, "c".repeat(64)) } });
    await expect(fixture.store.create(bad)).rejects.toThrow("RUN_ACTION_STALE");
    expect(await fixture.prisma.auditLog.count({ where: { tenantId: fixture.tenantA, action: "RUN_ACTION_ACCEPTED" } })).toBe(2);
  });

  it.each([
    ["approve", "PLAN_CONFIRMED"], ["revise", "PLAN_REVISED"], ["cancel", "PLAN_CANCELLED"],
  ] as const)("audits consumed %s once with the completed node output", async (action, expected) => {
    const { lease } = await approval(action);
    expect(await logs(lease.runId, expected)).toHaveLength(0);
    await Promise.all([completeApproval(lease, action), completeApproval(lease, action)]);
    expect(await logs(lease.runId, expected)).toMatchObject([{ actorUserId: "user-a", detail: { phase: "approval_consumed", planHash: "approved-plan-hash", approvalAction: action } }]);
    expect(await fixture.prisma.agentRunStep.count({ where: { runId: lease.runId, stepKey: "approval-decision", status: "COMPLETED" } })).toBe(1);
  });

  it("rolls back the completed approval output if its audit cannot commit", async () => {
    const { lease } = await approval("approve");
    await expect(completeApproval(lease, "approve", rejectAudit(fixture.prisma, "PLAN_CONFIRMED"))).rejects.toThrow("AUDIT_STORAGE_UNAVAILABLE");
    expect(await fixture.prisma.agentRunStep.count({ where: { runId: lease.runId } })).toBe(0);
    expect(await logs(lease.runId, "PLAN_CONFIRMED")).toHaveLength(0);
  });

  it("attributes automatic native cancellation to the authenticated stopper, not the original requester", async () => {
    const initial = await claimed();
    await fixture.store.append(initial, fixture.tenantA, { type: "approval.required", payload: { planHash: "approved-plan-hash" } });
    const control = new RunControlService(fixture.prisma, fixture.store, new PrismaRunQueries(fixture.prisma));
    await control.cancel(fixture.tenantA, initial.runId, "authenticated-stopper");
    await fixture.store.pause(initial, fixture.tenantA, "WAITING_APPROVAL");
    const successor = await fixture.store.claim("cancel-reconciler", fixture.tenantA, new Date());
    expect(successor?.runId).not.toBe(initial.runId);
    expect(successor).not.toBeNull();
    await completeApproval(successor!, "cancel");
    expect(await logs(successor!.runId, "RUN_ACTION_ACCEPTED")).toMatchObject([{ actorUserId: "authenticated-stopper" }]);
    expect(await logs(successor!.runId, "PLAN_CANCELLED")).toMatchObject([{ actorUserId: "authenticated-stopper" }]);
  });

  it("does not invent a cancellation actor when the durable stop audit is missing", async () => {
    const initial = await claimed();
    await fixture.store.append(initial, fixture.tenantA, { type: "approval.required", payload: { planHash: "approved-plan-hash" } });
    const control = new RunControlService(fixture.prisma, fixture.store, new PrismaRunQueries(fixture.prisma));
    await control.cancel(fixture.tenantA, initial.runId, "authenticated-stopper");
    await fixture.store.pause(initial, fixture.tenantA, "WAITING_APPROVAL");
    await fixture.prisma.auditLog.deleteMany({ where: { tenantId: fixture.tenantA, resourceId: initial.runId, action: "RUN_CANCEL_REQUESTED" } });
    await expect(fixture.store.claim("cancel-reconciler", fixture.tenantA, new Date())).rejects.toThrow("CANCEL_REQUEST_ACTOR_MISSING");
    expect(await fixture.prisma.agentRun.count({ where: { tenantId: fixture.tenantA } })).toBe(1);
    expect(await fixture.prisma.agentRun.findUnique({ where: { id: initial.runId } })).toMatchObject({ status: "WAITING_APPROVAL", supersededByRunId: null });
  });

  it("rejects an output claiming a different approval decision without caching or auditing it", async () => {
    const { lease } = await approval("approve");
    await expect(completeApproval(lease, "cancel")).rejects.toThrow("APPROVAL_AUDIT_MISMATCH");
    expect(await fixture.prisma.agentRunStep.count({ where: { runId: lease.runId } })).toBe(0);
    expect(await logs(lease.runId, "PLAN_CANCELLED")).toHaveLength(0);
  });

  it.each(["old-fence", "expired"])("does not audit approval under an %s lease", async scenario => {
    const { lease } = await approval("approve");
    if (scenario === "expired") await fixture.prisma.$executeRaw`UPDATE "AgentRun" SET "leaseExpiresAt" = ${new Date(Date.now() - 1000)} WHERE "id" = ${lease.runId}`;
    const stale = scenario === "old-fence" ? { ...lease, fence: lease.fence - 1 } : lease;
    await expect(completeApproval(stale, "approve")).rejects.toThrow("FENCE_REJECTED");
    expect(await logs(lease.runId, "PLAN_CONFIRMED")).toHaveLength(0);
  });

  it("rejects approval audit when its lease expires while waiting for the Run row lock", async () => {
    const { lease } = await approval("approve");
    const expiry = new Date(Date.now() + 500);
    await fixture.prisma.$executeRaw`UPDATE "AgentRun" SET "leaseExpiresAt" = ${expiry} WHERE "id" = ${lease.runId}`;
    const applicationName = `audit-lock-${randomUUID()}`;
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set("application_name", applicationName);
    const waitingPrisma = new PrismaClient({ datasourceUrl: url.toString() });
    let locked!: () => void;
    let unlock!: () => void;
    const ready = new Promise<void>(resolve => { locked = resolve; });
    const release = new Promise<void>(resolve => { unlock = resolve; });
    const blocker = fixture.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "AgentRun" WHERE "id" = ${lease.runId} FOR UPDATE`;
      locked();
      await release;
    });
    await ready;
    const completion = completeApproval(lease, "approve", waitingPrisma);
    const result = completion.then(() => null, error => error as Error);
    try {
      let waiting = false;
      for (let attempt = 0; attempt < 100; attempt++) {
        const [row] = await fixture.prisma.$queryRaw<Array<{ waiting: boolean }>>`SELECT EXISTS (SELECT 1 FROM pg_stat_activity WHERE application_name = ${applicationName} AND wait_event_type = 'Lock') AS waiting`;
        if (row?.waiting) { waiting = true; break; }
        await delay(5);
      }
      expect(waiting).toBe(true);
      await delay(Math.max(1, expiry.getTime() - Date.now() + 30));
      unlock();
      await blocker;
      expect(await result).toMatchObject({ message: "FENCE_REJECTED" });
    } finally { unlock(); await blocker; await result; await waitingPrisma.$disconnect(); }
    expect(await logs(lease.runId, "PLAN_CONFIRMED")).toHaveLength(0);
  });

  it("audits bound build enqueue once under concurrent replay", async () => {
    const { enqueue, lease } = await queuedBuild();
    const [first, second] = await Promise.all([enqueue(), enqueue()]);
    expect(second.id).toBe(first.id);
    const audit = await fixture.prisma.auditLog.findMany({ where: { tenantId: fixture.tenantA, action: "BUILD_START", resourceId: first.id } });
    expect(audit).toMatchObject([{ actorUserId: "user-a", resourceType: "BUILD_JOB", detail: { runId: lease.runId, phase: "enqueued", planHash: "build-hash" } }]);
    expect(await fixture.prisma.buildJob.count({ where: { tenantId: fixture.tenantA } })).toBe(1);
  });

  it("rolls back enqueue and Run binding when build audit storage fails", async () => {
    const { enqueue, lease } = await queuedBuild();
    await expect(enqueue(rejectAudit(fixture.prisma, "BUILD_START"))).rejects.toThrow("AUDIT_STORAGE_UNAVAILABLE");
    expect(await fixture.prisma.buildJob.count({ where: { tenantId: fixture.tenantA } })).toBe(0);
    expect(await fixture.prisma.agentRun.findUnique({ where: { id: lease.runId } })).toMatchObject({ status: "RUNNING", buildJobId: null });
  });

  it.each(["success", "failure", "cancelled", "stale-base"])("audits the actual %s build result once in its terminal transaction", async outcome => {
    const { job, lease, input } = await leasedBuild();
    if (outcome === "failure") { input.status = "FAILED"; delete input.result; input.validationReport.outcome = "fail"; }
    if (outcome === "cancelled") await fixture.prisma.buildJob.update({ where: { id: job.id }, data: { cancelRequestedAt: new Date() } });
    if (outcome === "stale-base") {
      const revision = await fixture.prisma.solutionRevision.create({ data: { tenantId: fixture.tenantA, workspaceId: fixture.workspaceA, revisionNumber: 2 } });
      await fixture.prisma.solutionWorkspace.update({ where: { id: fixture.workspaceA }, data: { currentRevisionId: revision.id } });
    }
    const builds = new BuildJobService(fixture.prisma);
    const [result, replay] = await Promise.all([builds.completeBuild(input), builds.completeBuild(input)]);
    const expectedStatus = outcome === "success" ? "SUCCEEDED" : "FAILED";
    expect(result.status).toBe(expectedStatus);
    expect(replay.status).toBe(expectedStatus);
    const audit = await fixture.prisma.auditLog.findMany({ where: { tenantId: fixture.tenantA, action: "BUILD_RESULT", resourceId: job.id } });
    expect(audit).toMatchObject([{ actorUserId: "user-a", detail: { runId: lease.runId, phase: "completed", status: expectedStatus, terminalReason: outcome === "cancelled" ? "CANCELLED" : null } }]);
    expect(JSON.stringify(audit)).not.toContain("private-package-url");
    expect(JSON.stringify(audit)).not.toContain("private-storage-key");
  });

  it("audits queued build cancellation in the control transaction without waiting for a worker", async () => {
    const { enqueue, lease } = await queuedBuild();
    const job = await enqueue();
    const control = new RunControlService(fixture.prisma, fixture.store, new PrismaRunQueries(fixture.prisma));
    await control.cancel(fixture.tenantA, lease.runId, "stop-user");
    await control.cancel(fixture.tenantA, lease.runId, "stop-user");
    expect(await fixture.prisma.auditLog.findMany({ where: { tenantId: fixture.tenantA, action: "BUILD_RESULT", resourceId: job.id } })).toMatchObject([
      { detail: { runId: lease.runId, status: "FAILED", terminalReason: "CANCELLED" } },
    ]);
  });

  it("does not publish a result or audit under a stale build attempt", async () => {
    const { job, input } = await leasedBuild();
    await expect(new BuildJobService(fixture.prisma).completeBuild({ ...input, leaseAttempt: 0 })).rejects.toThrow("lease was lost");
    expect(await fixture.prisma.artifact.count({ where: { buildJobId: job.id } })).toBe(0);
    expect(await fixture.prisma.auditLog.count({ where: { tenantId: fixture.tenantA, action: "BUILD_RESULT", resourceId: job.id } })).toBe(0);
  });

  it("rolls back successful revision, artifact and terminal status if result audit fails", async () => {
    const { job, input, revision } = await leasedBuild();
    await expect(new BuildJobService(rejectAudit(fixture.prisma, "BUILD_RESULT")).completeBuild(input)).rejects.toThrow("AUDIT_STORAGE_UNAVAILABLE");
    expect(await fixture.prisma.buildJob.findUnique({ where: { id: job.id } })).toMatchObject({ status: "RUNNING", leaseOwner: "audit-builder" });
    expect(await fixture.prisma.solutionWorkspace.findUnique({ where: { id: fixture.workspaceA } })).toMatchObject({ currentRevisionId: revision.id });
    expect(await fixture.prisma.artifact.count({ where: { buildJobId: job.id } })).toBe(0);
    expect(await fixture.prisma.solutionRevision.count({ where: { tenantId: fixture.tenantA } })).toBe(1);
  });
});
// end
