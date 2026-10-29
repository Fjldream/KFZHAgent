// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({ url: process.env.DATABASE_URL, allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET, expectedPrefix: "kf_agent_test_" });
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { VISUAL_RUN_PLAN_VERSION } from "@kf/contracts";
import { createRunTestFixture, messageInput, type RunTestFixture } from "../runs/run-test-fixture.js";
import { hasVisualConversationSource, listRunMessages } from "./run-message-context.js";
let fixture: RunTestFixture;
beforeAll(async () => { fixture = await createRunTestFixture(); });
afterAll(async () => { await fixture.cleanup(); });
async function sourceConversation() {
  await fixture.resetRuns(); const conversationId = await fixture.newConversation();
  const source = await fixture.store.create(messageInput(fixture, "visual-source", "分析图片", { conversationId }));
  await fixture.prisma.agentRun.update({ where: { id: source.id }, data: { status: "CANCELLED", startedAt: new Date(),
    configSnapshot: { schemaVersion: 1, planVersion: VISUAL_RUN_PLAN_VERSION } } });
  await fixture.prisma.message.create({ data: { tenantId: fixture.tenantA, conversationId, runId: source.id, role: "assistant", content: "private OCR marker" } });
  return conversationId;
}
async function ordinary(conversationId: string) {
  const run = await fixture.store.create(messageInput(fixture, "ordinary-" + conversationId, "只生成普通静态文字", { conversationId }));
  const lease = await fixture.store.claim("context-worker", fixture.tenantA, new Date());
  if (!lease || lease.runId !== run.id) throw new Error("exact lease required");
  return { runId: run.id, tenantId: fixture.tenantA, ownerId: lease.ownerId, fence: lease.fence, signal: new AbortController().signal };
}
describe("model-visible visual history isolation", () => {
  it("removes canceled visual source messages from a new ordinary run while retaining its new input", async () => {
    const conversationId = await sourceConversation(); const scope = await ordinary(conversationId);
    expect(await hasVisualConversationSource(fixture.prisma, fixture.tenantA, conversationId)).toBe(true);
    const messages = await listRunMessages(fixture.prisma, scope, fixture.tenantA, conversationId, 20);
    expect(messages).toContainEqual({ role: "user", content: "只生成普通静态文字" });
    expect(JSON.stringify(messages)).not.toContain("private OCR"); expect(JSON.stringify(messages)).not.toContain("分析图片");
    await fixture.prisma.agentRun.update({ where: { id: scope.runId }, data: { configSnapshot: { schemaVersion: 1, planVersion: VISUAL_RUN_PLAN_VERSION } } });
    expect(JSON.stringify(await listRunMessages(fixture.prisma, scope, fixture.tenantA, conversationId, 20))).toContain("private OCR marker");
  });
  it("does not let a historical fork or fork of a fork launder copied runId=null visual text", async () => {
    const source = await sourceConversation(); let parent = source;
    for (let depth = 0; depth < 2; depth++) {
      const fork = await fixture.prisma.conversation.create({ data: { tenantId: fixture.tenantA, workspaceId: fixture.workspaceA,
        title: "historical fork", forkedFromConversationId: parent } });
      await fixture.prisma.message.create({ data: { tenantId: fixture.tenantA, conversationId: fork.id, role: "assistant",
        content: "private OCR orphan marker", createdAt: new Date(Date.now() - 100000) } });
      parent = fork.id;
    }
    const scope = await ordinary(parent);
    const messages = await listRunMessages(fixture.prisma, scope, fixture.tenantA, parent, 20);
    expect(messages).toContainEqual({ role: "user", content: "只生成普通静态文字" }); expect(JSON.stringify(messages)).not.toContain("private OCR");
  });
  it("preserves known ordinary fork history and rejects foreign execution scope", async () => {
    await fixture.resetRuns(); const source = await fixture.newConversation();
    const fork = await fixture.prisma.conversation.create({ data: { tenantId: fixture.tenantA, workspaceId: fixture.workspaceA,
      title: "ordinary fork", forkedFromConversationId: source } });
    await fixture.prisma.message.create({ data: { tenantId: fixture.tenantA, conversationId: fork.id, role: "assistant", content: "safe ordinary history", createdAt: new Date(Date.now() - 100000) } });
    const scope = await ordinary(fork.id);
    expect(await listRunMessages(fixture.prisma, scope, fixture.tenantA, fork.id, 20)).toContainEqual({ role: "assistant", content: "safe ordinary history" });
    await expect(listRunMessages(fixture.prisma, scope, fixture.tenantB, fork.id, 20)).rejects.toThrow("RUN_SCOPE_MISMATCH");
  });
});
// end
