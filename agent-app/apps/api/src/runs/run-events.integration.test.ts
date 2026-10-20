// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/kf_agent_test_agent_next";

import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({
  url: process.env.DATABASE_URL,
  allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET,
  expectedPrefix: "kf_agent_test_",
});

import type { RunEvent } from "@kf/contracts";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  PrismaRunQueries,
  RUN_EVENT_CURSOR_INVALID,
  RUN_EVENT_LIMIT_INVALID,
  RUN_NOT_FOUND,
  serializeRunEvent,
} from "./run-query.service.js";
import { createRunTestFixture, messageInput, type RunTestFixture } from "./run-test-fixture.js";

let fixture: RunTestFixture;
let queries: PrismaRunQueries;

beforeAll(async () => {
  fixture = await createRunTestFixture();
  queries = new PrismaRunQueries(fixture.prisma);
});

afterAll(async () => {
  await fixture.cleanup();
});

const startRunWithEvents = async (clientRequestId: string) => {
  await fixture.resetRuns();
  const conversationId = await fixture.newConversation();
  const created = await fixture.store.create(
    messageInput(fixture, clientRequestId, "生成页面", { conversationId }),
  );
  const lease = await fixture.store.claim("worker-t10", fixture.tenantA, new Date());
  if (lease === null || lease.runId !== created.id) throw new Error("lease mismatch");
  await fixture.store.append(lease, fixture.tenantA, {
    type: "step.started", payload: { stepKey: "plan", label: "规划中", attempt: 1 },
  });
  await fixture.store.append(lease, fixture.tenantA, {
    type: "step.completed", payload: { stepKey: "plan", label: "规划中", attempt: 1, durationMs: 12 },
  });
  return created;
};

describe("serializeRunEvent", () => {
  it("emits an SSE frame whose id is the sequence number", () => {
    const event: RunEvent = {
      schemaVersion: 1, runId: "r1", seq: 2, type: "step.started",
      createdAt: "2026-10-20T00:00:00.000Z",
      payload: { stepKey: "implementation", label: "生成组件方案", attempt: 1 },
    };
    expect(serializeRunEvent(event)).toBe(
      `id: 2\nevent: step.started\ndata: ${JSON.stringify(event)}\n\n`,
    );
  });
});

describe("run queries", () => {
  it("replays events after a cursor in ascending order", async () => {
    const created = await startRunWithEvents("query-1");

    const all = await queries.eventsAfter(fixture.tenantA, created.id, 0, 100);
    expect(all.map((event) => event.seq)).toEqual([1, 2, 3]);
    expect(all[0]?.type).toBe("run.queued");

    const afterFirst = await queries.eventsAfter(fixture.tenantA, created.id, 1, 100);
    expect(afterFirst.map((event) => event.seq)).toEqual([2, 3]);

    const paged = await queries.eventsAfter(fixture.tenantA, created.id, 1, 1);
    expect(paged).toHaveLength(1);
    expect(paged[0]?.seq).toBe(2);
  });

  it("rejects invalid cursors and limits instead of returning empty pages", async () => {
    const created = await startRunWithEvents("query-2");

    await expect(queries.eventsAfter(fixture.tenantA, created.id, -1, 10))
      .rejects.toThrow(RUN_EVENT_CURSOR_INVALID);
    await expect(queries.eventsAfter(fixture.tenantA, created.id, 1.5, 10))
      .rejects.toThrow(RUN_EVENT_CURSOR_INVALID);
    await expect(queries.eventsAfter(fixture.tenantA, created.id, 999, 10))
      .rejects.toThrow(RUN_EVENT_CURSOR_INVALID);
    await expect(queries.eventsAfter(fixture.tenantA, created.id, 0, 0))
      .rejects.toThrow(RUN_EVENT_LIMIT_INVALID);
    await expect(queries.eventsAfter(fixture.tenantA, created.id, 0, 1_001))
      .rejects.toThrow(RUN_EVENT_LIMIT_INVALID);
  });

  it("hides runs from other tenants", async () => {
    const created = await startRunWithEvents("query-3");
    await expect(queries.eventsAfter(fixture.tenantB, created.id, 0, 10))
      .rejects.toThrow(RUN_NOT_FOUND);
    await expect(queries.snapshot(fixture.tenantB, created.id)).rejects.toThrow(RUN_NOT_FOUND);
  });

  it("returns a snapshot with the current lastSeq and status", async () => {
    const created = await startRunWithEvents("query-4");
    const snapshot = await queries.snapshot(fixture.tenantA, created.id);
    expect(snapshot).toMatchObject({
      id: created.id,
      tenantId: fixture.tenantA,
      status: "RUNNING",
      lastSeq: 3,
    });
  });
});
// end
