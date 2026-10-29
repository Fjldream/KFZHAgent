// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({ url: process.env.DATABASE_URL, allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET, expectedPrefix: "kf_agent_test_" });

import { randomUUID } from "node:crypto";
import type { AgentRun, Prisma } from "@prisma/client";
import { VISUAL_RUN_PLAN_VERSION } from "@kf/contracts";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { RunControlService } from "./run-control.service.js";
import { PrismaRunQueries } from "./run-query.service.js";
import { createRunTestFixture, type RunTestFixture } from "./run-test-fixture.js";

let fixture: RunTestFixture;
let controls: RunControlService;
beforeAll(async () => {
  fixture = await createRunTestFixture();
  controls = new RunControlService(fixture.prisma, fixture.store, new PrismaRunQueries(fixture.prisma));
});
beforeEach(async () => {
  await fixture.resetRuns();
  await fixture.prisma.conversation.update({ where: { id: fixture.conversationA }, data: { archivedAt: null } });
});
afterAll(async () => { await fixture.cleanup(); });

async function record(overrides: Partial<Prisma.AgentRunUncheckedCreateInput> = {}) {
  return fixture.prisma.agentRun.create({ data: {
    tenantId: fixture.tenantA, workspaceId: fixture.workspaceA, conversationId: fixture.conversationA,
    requestedByUserId: "user-a", clientRequestId: randomUUID(), requestHash: "context-fixture",
    action: { type: "message", text: "生成设备概览页面，正文显示设备A正常" }, mode: "build", status: "FAILED",
    failureCode: "INVALID_MODEL_OUTPUT", ...overrides,
  } });
}
async function confirmation(text = "生成设备概览页面，正文显示设备A正常") {
  const original = await record({ status: "CANCELLED", action: { type: "message", text } });
  const confirmed = await record({ action: { type: "confirm_blueprint", expectedRunId: original.id, receipt: "consumed-blueprint-receipt" }, predecessorRunId: original.id });
  await fixture.prisma.agentRun.update({ where: { id: original.id }, data: { supersededByRunId: confirmed.id } });
  return { original, confirmed };
}
const retry = (run: AgentRun, requestId = randomUUID()) => controls.retry(fixture.tenantA, run.id, "user-a", requestId);

describe("retry reconstructs a fresh text request from its owned origin", () => {
  it("retries a failed blueprint confirmation from the exact bounded requirement without its consumed receipt", async () => {
    const text = "生成" + "设".repeat(19_998);
    const { confirmed } = await confirmation(text);
    const clientRequestId = randomUUID();
    const accepted = await retry(confirmed, clientRequestId);
    expect(accepted.id).not.toBe(confirmed.id);
    expect(await fixture.prisma.agentRun.findUniqueOrThrow({ where: { id: accepted.id } })).toMatchObject({
      action: { type: "message", text }, retryOfRunId: confirmed.id, mode: "build", status: "QUEUED",
    });
    expect((await retry(confirmed, clientRequestId)).id).toBe(accepted.id);
    expect(await fixture.prisma.message.findMany({ where: { runId: accepted.id } })).toMatchObject([{ role: "user", content: text }]);
  });

  it("recovers the original intent through legacy generic retry actions and repeated retries", async () => {
    const { confirmed, original } = await confirmation();
    const generic = await record({ retryOfRunId: confirmed.id, action: { type: "message", text: "重新生成工程" } });
    const accepted = await retry(generic);
    expect((await fixture.prisma.agentRun.findUniqueOrThrow({ where: { id: accepted.id } })).action).toEqual(original.action);
    await fixture.prisma.agentRun.update({ where: { id: accepted.id }, data: { status: "FAILED", failureCode: "MODEL_TIMEOUT" } });
    const again = await controls.retry(fixture.tenantA, accepted.id, "user-a", randomUUID());
    expect((await fixture.prisma.agentRun.findUniqueOrThrow({ where: { id: again.id } })).action).toEqual(original.action);
  });

  it("regenerates a fresh request after a failed approval instead of copying its old approval decision", async () => {
    const { confirmed, original } = await confirmation();
    const approved = await record({ action: { type: "resume_approval", expectedRunId: confirmed.id, action: "approve", planHash: "old-plan-hash" }, predecessorRunId: confirmed.id });
    await fixture.prisma.agentRun.update({ where: { id: confirmed.id }, data: { supersededByRunId: approved.id } });
    const accepted = await retry(approved);
    expect((await fixture.prisma.agentRun.findUniqueOrThrow({ where: { id: accepted.id } })).action).toEqual(original.action);
  });

  it.each(["tenant", "workspace", "conversation"] as const)("rejects an original request outside the same %s scope", async scope => {
    let tenantId = fixture.tenantA; let workspaceId = fixture.workspaceA; let conversationId = fixture.conversationA;
    if (scope === "tenant") {
      const foreign = await fixture.prisma.conversation.findUniqueOrThrow({ where: { id: fixture.conversationB } });
      tenantId = foreign.tenantId; workspaceId = foreign.workspaceId; conversationId = foreign.id;
    } else {
      if (scope === "workspace") workspaceId = (await fixture.prisma.solutionWorkspace.create({ data: { tenantId, name: "retry-foreign-workspace" } })).id;
      conversationId = (await fixture.prisma.conversation.create({ data: { tenantId, workspaceId, title: "retry-foreign-conversation" } })).id;
    }
    const foreign = await record({ tenantId, workspaceId, conversationId, status: "CANCELLED" });
    const source = await record({ action: { type: "confirm_blueprint", expectedRunId: foreign.id, receipt: "foreign-receipt" }, predecessorRunId: foreign.id });
    await expect(retry(source)).rejects.toThrow("RUN_NOT_RETRYABLE");
    expect(await fixture.prisma.agentRun.count({ where: { retryOfRunId: source.id } })).toBe(0);
  });

  it.each(["missing", "wrong-predecessor", "wrong-successor"] as const)("rejects %s confirmation ancestry", async damage => {
    const { original, confirmed } = await confirmation();
    if (damage === "missing") await fixture.prisma.agentRun.delete({ where: { id: original.id } });
    if (damage === "wrong-predecessor") await fixture.prisma.agentRun.update({ where: { id: confirmed.id }, data: { predecessorRunId: randomUUID() } });
    if (damage === "wrong-successor") await fixture.prisma.agentRun.update({ where: { id: original.id }, data: { supersededByRunId: randomUUID() } });
    await expect(retry(confirmed)).rejects.toThrow("RUN_NOT_RETRYABLE");
  });

  it.each(["cycle", "limit"] as const)("bounds %s retry ancestry without creating a new run", async damage => {
    let source = await record();
    if (damage === "cycle") await fixture.prisma.agentRun.update({ where: { id: source.id }, data: { retryOfRunId: source.id } });
    else for (let index = 0; index < 32; index++) source = await record({ retryOfRunId: source.id });
    const count = await fixture.prisma.agentRun.count();
    await expect(retry(source)).rejects.toThrow("RUN_NOT_RETRYABLE");
    expect(await fixture.prisma.agentRun.count()).toBe(count);
  });

  it.each(["config", "visualAdmission", "visualContinuation", "visualEngineering", "attachmentIds", "action"] as const)("rejects a visual %s ancestor even behind a text retry", async marker => {
    const source = await record(marker === "config" ? { configSnapshot: { planVersion: VISUAL_RUN_PLAN_VERSION } }
      : marker === "action" ? { action: { type: "accept_visual_reference", expectedRunId: "image", analysisId: "analysis", analysisHash: "hash" } }
      : { inputSnapshot: { [marker]: marker === "attachmentIds" ? ["image-attachment"] : {} } });
    const textRetry = await record({ retryOfRunId: source.id, action: { type: "message", text: "重新生成工程" } });
    await expect(retry(textRetry)).rejects.toThrow("VISUAL_RETRY_NOT_ENABLED");
    expect(await fixture.prisma.agentRun.count({ where: { retryOfRunId: textRetry.id } })).toBe(0);
  });
});
// end
