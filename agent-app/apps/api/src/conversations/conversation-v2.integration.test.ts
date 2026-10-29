// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/kf_agent_test_visual_binding_20261026_1015";
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({ url: process.env.DATABASE_URL, allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET, expectedPrefix: "kf_agent_test_" });
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { PrismaClient } from "@prisma/client";
import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createRunTestFixture, messageInput, type RunTestFixture } from "../runs/run-test-fixture.js";
import { ConversationQueryService } from "./conversation-query.service.js";
import { ConversationV2Controller } from "./conversation-v2.controller.js";
import { TenantGuard } from "../auth/tenant.guard.js";

let fixture: RunTestFixture;
let queries: ConversationQueryService;
let app: INestApplication;
beforeAll(async () => {
  process.env.AGENT_ALLOWED_ORIGINS = "http://localhost:5173";
  fixture = await createRunTestFixture();
  queries = new ConversationQueryService(fixture.prisma);
  const module = await Test.createTestingModule({ controllers: [ConversationV2Controller], providers: [{ provide: ConversationQueryService, useValue: queries }] })
    .overrideGuard(TenantGuard).useValue({ canActivate(context: { switchToHttp(): { getRequest(): { principal: unknown } } }) {
      context.switchToHttp().getRequest().principal = { tenantId: fixture.tenantA }; return true;
    } }).compile();
  app = module.createNestApplication();
  await app.init();
});
afterAll(async () => { await app?.close(); await fixture?.cleanup(); });

const fresh = () => fixture.newConversation();
const start = (conversationId: string) => fixture.store.create(messageInput(fixture, randomUUID(), "建立页面", { conversationId }));

describe("v2 conversation management over PostgreSQL", () => {
  it("paginates 101 same-millisecond messages without gaps, defaults to newest 50 in chronological order", async () => {
    const id = await fresh();
    const timestamp = new Date("2026-10-27T01:00:00.000Z");
    const ids = Array.from({ length: 101 }, (_, index) => `same-time-${String(index).padStart(3, "0")}-${id}`);
    await fixture.prisma.message.createMany({ data: ids.map(messageId => ({ id: messageId, tenantId: fixture.tenantA, conversationId: id, role: "assistant", content: messageId, createdAt: timestamp })) });
    const first = await queries.messages(fixture.tenantA, id);
    expect(first.items.map(row => row.id)).toEqual(ids.slice(51));
    const second = await queries.messages(fixture.tenantA, id, first.nextCursor);
    const third = await queries.messages(fixture.tenantA, id, second.nextCursor);
    expect(second.items.map(row => row.id)).toEqual(ids.slice(1, 51));
    expect(third.items.map(row => row.id)).toEqual(ids.slice(0, 1));
    expect(third.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items, ...third.items].map(row => row.id)).size).toBe(101);
    await expect(queries.messages(fixture.tenantA, await fresh(), first.nextCursor)).rejects.toMatchObject({ status: 400 });
    await expect(queries.messages(fixture.tenantB, id)).rejects.toMatchObject({ status: 404 });
    for (const cursor of ["", "not-json", "=", Buffer.from(JSON.stringify({ version: 1, scope: "x", timestamp: timestamp.toISOString(), id })).toString("base64url")]) {
      await expect(queries.messages(fixture.tenantA, id, cursor)).rejects.toMatchObject({ status: 400 });
    }
  });

  it("paginates equal activity timestamps and rejects cursor reuse across workspace, archive and endpoint", async () => {
    const workspace = await fixture.prisma.solutionWorkspace.create({ data: { tenantId: fixture.tenantA, name: randomUUID() } });
    try {
      const ids = Array.from({ length: 11 }, () => randomUUID()).sort();
      await fixture.prisma.conversation.createMany({ data: ids.map(id => ({ id, tenantId: fixture.tenantA, workspaceId: workspace.id, title: id, lastActivityAt: new Date("2026-01-01") })) });
      let cursor: string | null = null;
      const found: string[] = [];
      do { const page = await queries.list(fixture.tenantA, workspace.id, cursor, 3, false); found.push(...page.items.map(row => row.id)); cursor = page.nextCursor; } while (cursor);
      expect(found).toEqual([...ids].reverse());
      const first = await queries.list(fixture.tenantA, workspace.id, null, 3, false);
      await expect(queries.list(fixture.tenantA, fixture.workspaceA, first.nextCursor, 3, false)).rejects.toMatchObject({ status: 400 });
      await expect(queries.list(fixture.tenantA, workspace.id, first.nextCursor, 3, true)).rejects.toMatchObject({ status: 400 });
      await expect(queries.messages(fixture.tenantA, fixture.conversationA, first.nextCursor)).rejects.toMatchObject({ status: 400 });
      await expect(queries.list(fixture.tenantB, workspace.id)).rejects.toMatchObject({ status: 404 });
    } finally {
      await fixture.prisma.conversation.deleteMany({ where: { workspaceId: workspace.id } });
      await fixture.prisma.solutionWorkspace.delete({ where: { id: workspace.id } });
    }
  });

  it("rejects invalid HTTP limits, titles, archive booleans and unknown write fields; requires Origin", async () => {
    const id = await fresh();
    for (const limit of ["0", "101", "-1", "1.5", "NaN", "1e1", "", "01"]) {
      await request(app.getHttpServer()).get(`/api/v2/conversations/${id}/messages`).query({ limit }).expect(400);
    }
    for (const body of [{ title: " " }, { title: "a".repeat(101) }, { title: 2 }, { archived: "false" }, {}, { unknown: true }]) {
      await request(app.getHttpServer()).patch(`/api/v2/conversations/${id}`).set("Origin", "http://localhost:5173").send(body).expect(400);
    }
    await request(app.getHttpServer()).patch(`/api/v2/conversations/${id}`).send({ title: "合法" }).expect(403);
    await request(app.getHttpServer()).get("/api/v2/conversations").query({ workspaceId: fixture.workspaceA, archived: "1" }).expect(400);
    for (const limit of [0, -1, 1.5, 101, NaN]) await expect(queries.messages(fixture.tenantA, id, null, limit)).rejects.toMatchObject({ status: 400 });
    await expect(queries.rename(fixture.tenantB, id, "foreign")).rejects.toMatchObject({ status: 404 });
    await expect(queries.archive(fixture.tenantB, id, true)).rejects.toMatchObject({ status: 404 });
    await expect(queries.create(fixture.tenantB, { workspaceId: fixture.workspaceA })).rejects.toMatchObject({ status: 404 });
  });

  it("creates, renames, archives and restores through real routes while preserving activity", async () => {
    const created = await request(app.getHttpServer()).post("/api/v2/conversations").set("Origin", "http://localhost:5173").send({ workspaceId: fixture.workspaceA }).expect(201);
    expect(created.body.title).toBe("新对话");
    const renamed = await request(app.getHttpServer()).patch(`/api/v2/conversations/${created.body.id}`).set("Origin", "http://localhost:5173").send({ title: "  自定义会话  ", archived: true }).expect(200);
    expect(renamed.body).toMatchObject({ title: "自定义会话", lastActivityAt: created.body.lastActivityAt, activeRunId: null });
    expect(renamed.body.archivedAt).toEqual(expect.any(String));
    await expect(start(created.body.id)).rejects.toThrow("CONVERSATION_ARCHIVED");
    expect((await queries.list(fixture.tenantA, fixture.workspaceA, null, 100, true)).items.some(row => row.id === created.body.id)).toBe(true);
    await queries.archive(fixture.tenantA, created.body.id, false);
    await start(created.body.id);
    expect((await fixture.prisma.conversation.findUniqueOrThrow({ where: { id: created.body.id } })).title).toBe("自定义会话");
  });

  it("maps archived admission to 409 and permits idempotent replay without another message", async () => {
    const { RunService } = await import("../runs/run.service.js");
    const { PrismaRunQueries } = await import("../runs/run-query.service.js");
    const id = await fresh();
    const input = messageInput(fixture, randomUUID(), "原始输入", { conversationId: id });
    const run = await fixture.store.create(input);
    await fixture.prisma.agentRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED" } });
    await queries.archive(fixture.tenantA, id, true);
    expect((await fixture.store.create(input)).id).toBe(run.id);
    expect(await fixture.prisma.message.count({ where: { conversationId: id } })).toBe(1);
    const runs = new RunService(fixture.store, new PrismaRunQueries(fixture.prisma));
    await expect(runs.start({ tenantId: fixture.tenantA, userId: input.userId }, id, {
      clientRequestId: randomUUID(), clientMessageId: randomUUID(), mode: "discuss", action: { type: "message", text: "新的输入" },
    })).rejects.toMatchObject({ status: 409 });
  });

  it("blocks every active/waiting run status and keeps combined rename/archive atomic", async () => {
    for (const status of ["QUEUED", "RUNNING", "WAITING_INPUT", "WAITING_APPROVAL", "BUILDING", "CANCEL_REQUESTED"]) {
      const id = await fresh(); const run = await start(id);
      await fixture.prisma.agentRun.update({ where: { id: run.id }, data: { status } });
      const before = await fixture.prisma.conversation.findUniqueOrThrow({ where: { id } });
      await expect(queries.patch(fixture.tenantA, id, { title: "must rollback", archived: true })).rejects.toMatchObject({ status: 409 });
      expect((await fixture.prisma.conversation.findUniqueOrThrow({ where: { id } })).title).toBe(before.title);
      await fixture.prisma.agentRun.update({ where: { id: run.id }, data: { status: "SUCCEEDED" } });
      expect((await queries.archive(fixture.tenantA, id, true)).archivedAt).not.toBeNull();
    }
  });

  it("refuses turn ownership and durable quarantine even without an active run", async () => {
    const id = await fresh();
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL }); await client.connect();
    try {
      await client.query("SELECT pg_advisory_lock(hashtextextended($1,0))", [`kf-turn:${id}`]);
      await expect(queries.archive(fixture.tenantA, id, true)).rejects.toMatchObject({ status: 409 });
      await client.query("SELECT pg_advisory_unlock(hashtextextended($1,0))", [`kf-turn:${id}`]);
      await fixture.prisma.conversationTurnFence.create({ data: { conversationId: id, ownerId: randomUUID(), leaseId: randomUUID() } });
      await expect(queries.archive(fixture.tenantA, id, true)).rejects.toMatchObject({ status: 409 });
      await fixture.prisma.conversationTurnFence.delete({ where: { conversationId: id } });
    } finally { await client.end(); }
  });

  it("serializes simultaneous archive/admission with exactly one winner", async () => {
    for (let index = 0; index < 12; index += 1) {
      const id = await fresh();
      const actions = index % 2 ? [start(id), queries.archive(fixture.tenantA, id, true)] : [queries.archive(fixture.tenantA, id, true), start(id)];
      const results = await Promise.allSettled(actions);
      expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
      const row = await fixture.prisma.conversation.findUniqueOrThrow({ where: { id } });
      const runs = await fixture.prisma.agentRun.count({ where: { conversationId: id } });
      expect(row.archivedAt ? runs === 0 : runs === 1).toBe(true);
    }
  });

  it("generates first-message title, preserves manual default title, and updates completion activity", async () => {
    const created = await queries.create(fixture.tenantA, { workspaceId: fixture.workspaceA });
    const text = "这是一个用于测试自动标题长度的自然语言消息abcdefghijklmnop";
    const run = await fixture.store.create(messageInput(fixture, randomUUID(), text, { conversationId: created.id }));
    let row = await fixture.prisma.conversation.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.title).toBe(Array.from(text).slice(0, 24).join(""));
    const manual = await queries.create(fixture.tenantA, { workspaceId: fixture.workspaceA });
    await queries.rename(fixture.tenantA, manual.id, "新对话"); await start(manual.id);
    expect((await fixture.prisma.conversation.findUniqueOrThrow({ where: { id: manual.id } })).title).toBe("新对话");
    // Isolate the completion claim from queued runs created in other examples.
    await fixture.prisma.agentRun.updateMany({ where: { tenantId: fixture.tenantA, id: { not: run.id }, status: "QUEUED" }, data: { status: "CANCELLED" } });
    const lease = await fixture.store.claim("activity-worker", fixture.tenantA, new Date());
    expect(lease?.runId).toBe(run.id);
    await fixture.prisma.conversation.update({ where: { id: created.id }, data: { lastActivityAt: new Date("2020-01-01") } });
    await fixture.store.finish(lease!, fixture.tenantA, "SUCCEEDED");
    row = await fixture.prisma.conversation.findUniqueOrThrow({ where: { id: created.id } });
    expect(row.lastActivityAt.getTime()).toBeGreaterThan(Date.parse("2026-01-01"));
  });

  it("appends assistant messages and activity atomically under execution fencing", async () => {
    const { createGraphPorts } = await import("./graph-ports.js");
    const { withAgentRunExecution } = await import("@kf/build-jobs");
    const id = await fresh();
    await fixture.prisma.agentRun.updateMany({ where: { tenantId: fixture.tenantA, status: "QUEUED" }, data: { status: "CANCELLED" } });
    const run = await start(id);
    const lease = await fixture.store.claim("append-worker", fixture.tenantA, new Date());
    expect(lease?.runId).toBe(run.id);
    const port = createGraphPorts(fixture.prisma as never, {} as never).workspaceQuery;
    const oldActivity = new Date("2020-01-01");
    await fixture.prisma.conversation.update({ where: { id }, data: { lastActivityAt: oldActivity } });
    const inScope = (fence: number) => withAgentRunExecution({ runId: run.id, tenantId: fixture.tenantA, ownerId: lease!.ownerId, fence, signal: new AbortController().signal }, () => port.appendMessage({ tenantId: fixture.tenantA, conversationId: id, role: "assistant", content: "已完成" }));
    await expect(inScope(lease!.fence + 1)).rejects.toThrow();
    expect(await fixture.prisma.message.count({ where: { conversationId: id, role: "assistant" } })).toBe(0);
    expect((await fixture.prisma.conversation.findUniqueOrThrow({ where: { id } })).lastActivityAt).toEqual(oldActivity);
    await inScope(lease!.fence);
    expect(await fixture.prisma.message.count({ where: { conversationId: id, role: "assistant", runId: run.id } })).toBe(1);
    expect((await fixture.prisma.conversation.findUniqueOrThrow({ where: { id } })).lastActivityAt.getTime()).toBeGreaterThan(oldActivity.getTime());
  });

  it("fenced append completes with a single-connection pool", async () => {
    const { createGraphPorts } = await import("./graph-ports.js");
    const { withAgentRunExecution } = await import("@kf/build-jobs");
    const id = await fresh();
    await fixture.prisma.agentRun.updateMany({ where: { tenantId: fixture.tenantA, status: "QUEUED" }, data: { status: "CANCELLED" } });
    const run = await start(id);
    const lease = await fixture.store.claim("single-connection-worker", fixture.tenantA, new Date());
    expect(lease?.runId).toBe(run.id);
    const url = new URL(process.env.DATABASE_URL!);
    url.searchParams.set("connection_limit", "1");
    url.searchParams.set("pool_timeout", "1");
    const singleConnection = new PrismaClient({ datasourceUrl: url.toString() });
    try {
      const port = createGraphPorts(singleConnection as never, {} as never).workspaceQuery;
      await withAgentRunExecution({ runId: run.id, tenantId: fixture.tenantA, ownerId: lease!.ownerId, fence: lease!.fence, signal: new AbortController().signal },
        () => port.appendMessage({ tenantId: fixture.tenantA, conversationId: id, role: "assistant", content: "单连接完成" }));
      expect(await singleConnection.message.count({ where: { conversationId: id, runId: run.id, content: "单连接完成" } })).toBe(1);
    } finally { await singleConnection.$disconnect(); }
  });

  it("reuses existing technical assistant sanitization and text-only parts", async () => {
    const id = await fresh();
    await fixture.prisma.message.createMany({ data: [
      { tenantId: fixture.tenantA, conversationId: id, role: "assistant", content: '{"schema":"kf-module-plan/v1"}', parts: [{ internal: "private" }] },
      { tenantId: fixture.tenantA, conversationId: id, role: "user", content: '{"schema":"kf-module-plan/v1"}' },
    ] });
    const page = await queries.messages(fixture.tenantA, id);
    expect(page.items.find(row => row.role === "assistant")?.content).toBe("工程正在按已确认的效果蓝图生成，技术实施细节由系统自动校验。");
    expect(page.items.find(row => row.role === "user")?.content).toBe('{"schema":"kf-module-plan/v1"}');
    expect(page.items.every(row => row.parts.length === 0)).toBe(true);
  });
});
// end
