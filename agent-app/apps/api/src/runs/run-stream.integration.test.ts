// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import "reflect-metadata";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({ url: process.env.DATABASE_URL, allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET, expectedPrefix: "kf_agent_test_" });

import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import cookieParser from "cookie-parser";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module.js";
import { SessionService } from "../auth/session.service.js";
import { createRunTestFixture, messageInput, type RunTestFixture } from "./run-test-fixture.js";

let app: INestApplication;
let fixture: RunTestFixture;
let sessions: SessionService;
let baseUrl: string;
beforeAll(async () => {
  fixture = await createRunTestFixture();
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  app.use(cookieParser());
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();
  sessions = app.get(SessionService);
});
beforeEach(async () => { await fixture.resetRuns(); });
afterAll(async () => {
  await app?.close();
  if (!fixture) return;
  await fixture.prisma.userSession.deleteMany({ where: { user: { tenantId: { in: [fixture.tenantA, fixture.tenantB] } } } });
  await fixture.prisma.user.deleteMany({ where: { tenantId: { in: [fixture.tenantA, fixture.tenantB] } } });
  await fixture.cleanup();
});

const identity = async (tenantId = fixture.tenantA) => {
  const user = await fixture.prisma.user.create({ data: { tenantId, username: `stream-${randomUUID()}`, passwordHash: "session-only-fixture", role: "member", mustChangePassword: false } });
  const session = await sessions.createSession(user.id);
  return { user, session, cookie: `kf_session=${session.token}` };
};
const seed = async () => {
  const input = messageInput(fixture, randomUUID(), "stream lifecycle");
  const run = await fixture.store.create(input);
  const lease = await fixture.store.claim("stream-worker", fixture.tenantA, new Date());
  if (!lease || lease.runId !== run.id) throw new Error("fixture lease not found");
  return { run, lease };
};
const connect = async (runId: string, cookie: string, after = 0) => {
  const controller = new AbortController();
  const response = await fetch(`${baseUrl}/api/runs/${runId}/events?after=${after}`, { headers: { Cookie: cookie }, signal: controller.signal });
  return { response, controller };
};

describe("real HTTP Run subscription lifecycle", () => {
  it("drains terminal event pages in sequence and marks the cookie stream private/non-cacheable", async () => {
    const { run, lease } = await seed();
    const { cookie } = await identity();
    for (let index = 0; index < 3; index++) await fixture.store.append(lease, fixture.tenantA, { type: "decision.summary", payload: { summary: `page-${index}` } });
    await fixture.store.finish(lease, fixture.tenantA, "SUCCEEDED");
    const response = await fetch(`${baseUrl}/api/runs/${run.id}/events?after=0&limit=1`, { headers: { Cookie: cookie } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("vary")).toMatch(/Cookie/);
    const text = await response.text();
    expect([...text.matchAll(/^id: (\d+)$/gm)].map(match => Number(match[1]))).toEqual([1, 2, 3, 4, 5]);
    expect(text).toContain("event: run.completed");
  });
  it("does not renew idle activity merely because a subscription is open", async () => {
    const { run, lease } = await seed();
    const { cookie, session } = await identity();
    const connected = await connect(run.id, cookie);
    const reader = connected.response.body!.getReader();
    try {
      await reader.read();
      const before = await fixture.prisma.userSession.findUniqueOrThrow({ where: { id: session.sessionId } });
      await delay(1100);
      await fixture.store.finish(lease, fixture.tenantA, "SUCCEEDED");
      while (!(await reader.read()).done) { /* drain */ }
      const after = await fixture.prisma.userSession.findUniqueOrThrow({ where: { id: session.sessionId } });
      expect(after.lastUsedAt).toEqual(before.lastUsedAt);
    } finally { connected.controller.abort(); await reader.cancel().catch(() => undefined); }
  }, 5000);

  it("handles one hundred detached subscriptions without exhausting database access or mutating the Run", async () => {
    const { run, lease } = await seed();
    const { cookie } = await identity();
    const subscriptions: Awaited<ReturnType<typeof connect>>[] = [];
    try {
      await Promise.all(Array.from({ length: 100 }, async () => {
        const connected = await connect(run.id, cookie);
        subscriptions.push(connected);
        const reader = connected.response.body!.getReader();
        try {
          expect(connected.response.status).toBe(200);
          expect(new TextDecoder().decode((await reader.read()).value)).toContain("run.queued");
        } finally { connected.controller.abort(); await reader.cancel().catch(() => undefined); }
      }));
      expect(await fixture.prisma.$queryRaw`SELECT 1 AS available`).toEqual([{ available: 1 }]);
      expect(await fixture.prisma.agentRun.findUnique({ where: { id: run.id } })).toMatchObject({ status: "RUNNING", leaseOwner: lease.ownerId, fence: lease.fence });
      await fixture.store.finish(lease, fixture.tenantA, "SUCCEEDED");
    } finally { for (const connected of subscriptions) connected.controller.abort(); }
  }, 15000);
  it.each(["revoked", "expired", "idle", "password-restricted", "tenant-changed", "role-changed"])("does not send new events after the subscriber becomes %s", async state => {
    const { run, lease } = await seed();
    const { user, session, cookie } = await identity();
    const { response, controller } = await connect(run.id, cookie);
    const reader = response.body!.getReader();
    try {
      expect(response.status).toBe(200);
      const first = new TextDecoder().decode((await reader.read()).value);
      expect(first).toContain("run.queued");
      if (state === "revoked") await sessions.revokeByToken(session.token);
      if (state === "expired") await fixture.prisma.userSession.update({ where: { id: session.sessionId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      if (state === "idle") await fixture.prisma.userSession.update({ where: { id: session.sessionId }, data: { lastUsedAt: new Date(Date.now() - 31 * 60_000) } });
      if (state === "password-restricted") await fixture.prisma.user.update({ where: { id: user.id }, data: { mustChangePassword: true } });
      if (state === "tenant-changed") await fixture.prisma.user.update({ where: { id: user.id }, data: { tenantId: fixture.tenantB } });
      if (state === "role-changed") await fixture.prisma.user.update({ where: { id: user.id }, data: { role: "tenant_admin" } });
      await fixture.store.append(lease, fixture.tenantA, { type: "decision.summary", payload: { summary: "after-permission-loss" } });
      await fixture.store.finish(lease, fixture.tenantA, "SUCCEEDED");
      let remaining = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        remaining += new TextDecoder().decode(chunk.value);
      }
      expect(remaining).not.toContain("after-permission-loss");
      expect(await fixture.prisma.agentRun.findUnique({ where: { id: run.id } })).toMatchObject({ status: "SUCCEEDED" });
    } finally { controller.abort(); await reader.cancel().catch(() => undefined); }
  }, 5000);

  it("keeps a detached Run executable and replays its final event through another connection", async () => {
    const { run, lease } = await seed();
    const { cookie } = await identity();
    const { response, controller } = await connect(run.id, cookie);
    const reader = response.body!.getReader();
    const initial = new TextDecoder().decode((await reader.read()).value);
    expect(initial).toContain("id: 1");
    controller.abort();
    await reader.cancel().catch(() => undefined);
    expect(await fixture.prisma.agentRun.findUnique({ where: { id: run.id } })).toMatchObject({ status: "RUNNING", leaseOwner: lease.ownerId, fence: lease.fence });
    await fixture.store.finish(lease, fixture.tenantA, "SUCCEEDED");
    const next = await connect(run.id, cookie, 1);
    try {
      expect(next.response.status).toBe(200);
      expect(await next.response.text()).toContain("event: run.completed");
    } finally { next.controller.abort(); }
    expect(await fixture.prisma.agentRun.count({ where: { tenantId: fixture.tenantA } })).toBe(1);
    expect(await fixture.prisma.buildJob.count({ where: { tenantId: fixture.tenantA } })).toBe(0);
  });

  it("rejects unauthenticated and cross-tenant subscriptions before any event bytes", async () => {
    const { run } = await seed();
    const foreign = await identity(fixture.tenantB);
    const unauth = await fetch(`${baseUrl}/api/runs/${run.id}/events`);
    expect(unauth.status).toBe(401);
    expect(await unauth.text()).not.toContain("run.queued");
    const other = await connect(run.id, foreign.cookie);
    try { expect(other.response.status).toBe(404); expect(await other.response.text()).not.toContain("run.queued"); }
    finally { other.controller.abort(); }
  });
});
// end
