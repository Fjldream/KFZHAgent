process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@127.0.0.1:5432/kf_agent_test";

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Logger } from "@nestjs/common";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ConversationController } from "./conversation.controller.js";
import { ConversationService } from "./conversation.service.js";
import {
  ConversationTurnBusyError,
  PostgresConversationTurnLeaseManager,
} from "./conversation-turn-lease.js";

describe("Postgres conversation turn lease", () => {
  let checkpointPool: pg.Pool;
  let saver: PostgresSaver;

  beforeAll(async () => {
    checkpointPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
    saver = new PostgresSaver(checkpointPool);
    await saver.setup();
  });

  afterAll(async () => {
    await checkpointPool.end();
  });

  it("fails fast for the same conversation without starving a one-client checkpoint pool", async () => {
    const manager = leaseManager(2);
    const conversationId = `same-${randomUUID()}`;
    try {
      const winner = await manager.acquire(conversationId);
      const startedAt = Date.now();
      await expect(manager.acquire(conversationId)).rejects.toBeInstanceOf(ConversationTurnBusyError);
      expect(Date.now() - startedAt).toBeLessThan(750);

      await expect(within(
        saver.getTuple({ configurable: { thread_id: conversationId } }),
        750,
      )).resolves.toBeUndefined();

      await winner.dispose();
      await (await manager.acquire(conversationId)).dispose();
    } finally {
      await manager.onModuleDestroy();
    }
  });

  it("bounds a different-conversation burst while the checkpoint pool keeps progressing", async () => {
    const manager = leaseManager(2);
    const conversationIds = Array.from({ length: 4 }, () => `burst-${randomUUID()}`);
    try {
      const attempts = await Promise.allSettled(
        conversationIds.map((conversationId) => manager.acquire(conversationId)),
      );
      const winners = attempts.flatMap((attempt) => attempt.status === "fulfilled" ? [attempt.value] : []);
      const losers = attempts.flatMap((attempt) => attempt.status === "rejected" ? [attempt.reason] : []);
      expect(winners).toHaveLength(2);
      expect(losers).toHaveLength(2);
      expect(losers).toEqual([
        expect.any(ConversationTurnBusyError),
        expect.any(ConversationTurnBusyError),
      ]);

      await expect(within(
        saver.getTuple({ configurable: { thread_id: `checkpoint-${randomUUID()}` } }),
        750,
      )).resolves.toBeUndefined();
      await Promise.all(winners.map((lease) => lease.dispose()));
    } finally {
      await manager.onModuleDestroy();
    }
  });

  it("retains the real lease across delayed active SSE abort cancellation", async () => {
    const manager = leaseManager(2);
    const conversationId = `abort-${randomUUID()}`;
    await insertConversationRows(checkpointPool, [conversationId]);
    let resolveNext!: (value: IteratorResult<unknown>) => void;
    let finishCancellation!: () => void;
    const cancellation = new Promise<void>((resolve) => { finishCancellation = resolve; });
    const source = {
      next: vi.fn(() => new Promise<IteratorResult<unknown>>((resolve) => { resolveNext = resolve; })),
      return: vi.fn(async () => {
        await cancellation;
        resolveNext({ done: true, value: undefined });
        return { done: true as const, value: undefined };
      }),
      [Symbol.asyncIterator]() { return this; },
    };
    const graph = {
      getState: vi.fn().mockResolvedValue({ values: { stage: "design-review" }, tasks: [] }),
      stream: vi.fn().mockResolvedValue(source),
    };
    const prisma = {
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: conversationId, tenantId: "tenant", workspaceId: "workspace" }) },
      message: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = new ConversationService(
      prisma as never,
      {} as never,
      {} as never,
      checkpointPool,
      manager,
      {} as never,
      {} as never,
      { compile: vi.fn() },
      {} as never,
      {} as never,
      {} as never,
      { retrieve: vi.fn() },
    );
    (service as unknown as { getGraph(): Promise<unknown> }).getGraph = async () => graph;
    const controller = new ConversationController(service);
    const req = Object.assign(new EventEmitter(), {
      principal: { userId: "user", tenantId: "tenant", role: "member", sessionId: "session" },
    });
    let markFlushed!: () => void;
    const flushed = new Promise<void>((resolve) => { markFlushed = resolve; });
    const res = Object.assign(new EventEmitter(), {
      setHeader: vi.fn(),
      flushHeaders: vi.fn(() => markFlushed()),
      write: vi.fn(),
      end: vi.fn(),
      writableEnded: false,
    });

    try {
      const sending = controller.sendMessage(
        conversationId,
        req as never,
        { content: "确认设计" },
        res as never,
      );
      await within(flushed, 750);
      res.emit("close");
      await within(sending, 750);

      expect(source.return).toHaveBeenCalledTimes(1);
      await expect(manager.acquire(conversationId)).rejects.toBeInstanceOf(ConversationTurnBusyError);

      finishCancellation();
      await (await within(acquireEventually(manager, conversationId), 750)).dispose();
    } finally {
      await manager.onModuleDestroy();
      await deleteConversationRows(checkpointPool, [conversationId]);
    }
  });

  it("keeps unrelated conversations available after hanging aborts exceed the lease pool", async () => {
    const rig = leaseRig(2);
    const { manager } = rig;
    const hangingConversationIds = Array.from(
      { length: 4 },
      () => `hanging-${randomUUID()}`,
    );
    const unrelatedConversationId = `unrelated-${randomUUID()}`;
    const conversationIds = [...hangingConversationIds, unrelatedConversationId];
    await insertConversationRows(checkpointPool, conversationIds);
    const sources = new Map<string, AsyncGenerator<unknown>>();
    const graph = {
      getState: vi.fn().mockResolvedValue({ values: { stage: "design-review" }, tasks: [] }),
      stream: vi.fn(async (input: { conversationId: string }) => {
        const source = input.conversationId === unrelatedConversationId
          ? completedSource()
          : hangingSource();
        sources.set(input.conversationId, source);
        return source;
      }),
    };
    const prisma = {
      conversation: {
        findFirst: vi.fn(async ({ where }: { where: { id: string } }) => ({
          id: where.id,
          tenantId: "tenant",
          workspaceId: "workspace",
        })),
      },
      message: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = conversationService(manager, graph, prisma, checkpointPool);

    try {
      for (const conversationId of hangingConversationIds) {
        const events = await service.startTurn(principal(), conversationId, "确认设计");
        void events.next().catch(() => {});
        await within(events.dispose(), 750);
      }

      const unrelated = await within(
        service.startTurn(principal(), unrelatedConversationId, "确认设计"),
        750,
      );
      await unrelated.dispose();
      expect(sources.size).toBe(hangingConversationIds.length + 1);
      expect(rig.leasePool.waitingCount).toBe(0);
      await vi.waitFor(() => {
        expect(rig.leasePool.idleCount).toBe(rig.leasePool.totalCount);
      });
      expect(rig.ownerPool.totalCount).toBe(1);
    } finally {
      await manager.onModuleDestroy();
      await deleteConversationRows(checkpointPool, conversationIds);
    }
    expect(rig.leasePool.totalCount).toBe(0);
    expect(rig.ownerPool.totalCount).toBe(0);
  });

  it("keeps a live-owner fence across API managers and clears it on shutdown", async () => {
    const first = leaseRig(2);
    const second = leaseRig(2);
    const conversationId = `live-owner-${randomUUID()}`;
    const unrelatedConversationId = `live-owner-unrelated-${randomUUID()}`;
    const conversationIds = [conversationId, unrelatedConversationId];
    await insertConversationRows(checkpointPool, conversationIds);

    try {
      const stuck = await first.manager.acquire(conversationId);
      await stuck.quarantine();

      await expect(first.manager.acquire(conversationId)).rejects.toBeInstanceOf(ConversationTurnBusyError);
      await expect(second.manager.acquire(conversationId)).rejects.toBeInstanceOf(ConversationTurnBusyError);
      await (await second.manager.acquire(unrelatedConversationId)).dispose();
      expect(await fenceCount(checkpointPool, conversationId)).toBe(1);

      await first.manager.onModuleDestroy();
      expect(await fenceCount(checkpointPool, conversationId)).toBe(0);
      await (await second.manager.acquire(conversationId)).dispose();
    } finally {
      await first.manager.onModuleDestroy();
      await second.manager.onModuleDestroy();
      await deleteConversationRows(checkpointPool, conversationIds);
    }
  });

  it("recovers a stale fence only after the owning API session dies", async () => {
    const errorLog = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const ownerApplicationName = `turn-owner-${randomUUID()}`;
    const first = leaseRig(2, ownerApplicationName);
    const second = leaseRig(2);
    const conversationId = `dead-owner-${randomUUID()}`;
    await insertConversationRows(checkpointPool, [conversationId]);

    try {
      const stuck = await first.manager.acquire(conversationId);
      await stuck.quarantine();
      await expect(second.manager.acquire(conversationId)).rejects.toBeInstanceOf(ConversationTurnBusyError);

      await terminateOwnerSession(checkpointPool, ownerApplicationName);
      const recovered = await within(second.manager.acquire(conversationId), 750);
      expect(await fenceCount(checkpointPool, conversationId)).toBe(0);
      await recovered.dispose();
    } finally {
      await first.manager.onModuleDestroy();
      await second.manager.onModuleDestroy();
      await deleteConversationRows(checkpointPool, [conversationId]);
      errorLog.mockRestore();
    }
  });
});

function conversationService(
  manager: PostgresConversationTurnLeaseManager,
  graph: object,
  prisma: object,
  checkpointPool: pg.Pool,
): ConversationService {
  const service = new ConversationService(
    prisma as never,
    {} as never,
    {} as never,
    checkpointPool,
    manager,
    {} as never,
    {} as never,
    { compile: vi.fn() },
    {} as never,
    {} as never,
    {} as never,
    { retrieve: vi.fn() },
  );
  (service as unknown as { getGraph(): Promise<unknown> }).getGraph = async () => graph;
  return service;
}

function principal() {
  return { userId: "user", tenantId: "tenant", role: "member" as const, sessionId: "session" };
}

async function* hangingSource(): AsyncGenerator<unknown> {
  await new Promise<void>(() => {});
  yield* [];
}

async function* completedSource(): AsyncGenerator<unknown> {
  yield* [];
}

function leaseManager(max: number): PostgresConversationTurnLeaseManager {
  return leaseRig(max).manager;
}

function leaseRig(max: number, ownerApplicationName?: string): {
  manager: PostgresConversationTurnLeaseManager;
  leasePool: pg.Pool;
  ownerPool: pg.Pool;
} {
  const leasePool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max,
    connectionTimeoutMillis: 150,
    statement_timeout: 500,
    query_timeout: 500,
  });
  const ownerPool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 150,
    statement_timeout: 500,
    query_timeout: 500,
    ...(ownerApplicationName === undefined ? {} : { application_name: ownerApplicationName }),
  });
  return {
    manager: new PostgresConversationTurnLeaseManager(leasePool, ownerPool),
    leasePool,
    ownerPool,
  };
}

async function insertConversationRows(pool: pg.Pool, conversationIds: string[]): Promise<void> {
  await pool.query(
    `INSERT INTO "Conversation" ("id", "tenantId", "workspaceId", "title", "updatedAt")
     SELECT id, 'tenant', 'workspace', 'turn lease test', CURRENT_TIMESTAMP
     FROM unnest($1::text[]) AS id
     ON CONFLICT ("id") DO NOTHING`,
    [conversationIds],
  );
}

async function deleteConversationRows(pool: pg.Pool, conversationIds: string[]): Promise<void> {
  await pool.query(`DELETE FROM "Conversation" WHERE "id" = ANY($1::text[])`, [conversationIds]);
}

async function fenceCount(pool: pg.Pool, conversationId: string): Promise<number> {
  const result = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM "ConversationTurnFence"
     WHERE "conversationId" = $1`,
    [conversationId],
  );
  return Number(result.rows[0]?.count ?? "0");
}

async function terminateOwnerSession(pool: pg.Pool, applicationName: string): Promise<void> {
  const result = await pool.query<{ terminated: boolean }>(
    `SELECT pg_terminate_backend(pid) AS terminated
     FROM pg_stat_activity
     WHERE application_name = $1
       AND pid <> pg_backend_pid()`,
    [applicationName],
  );
  expect(result.rows).toEqual([{ terminated: true }]);
}

async function within<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`operation exceeded ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function acquireEventually(
  manager: PostgresConversationTurnLeaseManager,
  conversationId: string,
): ReturnType<PostgresConversationTurnLeaseManager["acquire"]> {
  for (;;) {
    try {
      return await manager.acquire(conversationId);
    } catch (error) {
      if (!(error instanceof ConversationTurnBusyError)) throw error;
      await new Promise<void>((resolve) => setTimeout(resolve, 10));
    }
  }
}
