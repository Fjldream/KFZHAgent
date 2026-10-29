// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@127.0.0.1:5432/kf_agent_test_agent_next";

// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({
  url: process.env.DATABASE_URL,
  allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET,
  expectedPrefix: "kf_agent_test_",
});
// end

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { Logger } from "@nestjs/common";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { LegacyConversationController as ConversationController } from "../../test-support/legacy-conversation-controller.js";
// end
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { LegacyConversationDriver as ConversationService } from "../../test-support/legacy-conversation-driver.js";
// end
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
    await insertConversationRows(checkpointPool, [conversationId]);
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
      await deleteConversationRows(checkpointPool, [conversationId]);
    }
  });

  it("bounds a different-conversation burst while the checkpoint pool keeps progressing", async () => {
    const manager = leaseManager(2);
    const conversationIds = Array.from({ length: 4 }, () => `burst-${randomUUID()}`);
    await insertConversationRows(checkpointPool, conversationIds);
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
      await deleteConversationRows(checkpointPool, conversationIds);
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

  it("keeps an unconfirmed fence across API managers and owner shutdown", async () => {
    const first = leaseRig(2);
    const second = leaseRig(2);
    const conversationId = `live-owner-${randomUUID()}`;
    const unrelatedConversationId = `live-owner-unrelated-${randomUUID()}`;
    const conversationIds = [conversationId, unrelatedConversationId];
    await insertConversationRows(checkpointPool, conversationIds);

    try {
      await first.manager.acquire(conversationId);

      await expect(first.manager.acquire(conversationId)).rejects.toBeInstanceOf(ConversationTurnBusyError);
      await expect(second.manager.acquire(conversationId)).rejects.toBeInstanceOf(ConversationTurnBusyError);
      await (await second.manager.acquire(unrelatedConversationId)).dispose();
      expect(await fenceCount(checkpointPool, conversationId)).toBe(1);

      await first.manager.onModuleDestroy();
      expect(await fenceCount(checkpointPool, conversationId)).toBe(1);
      await expect(second.manager.acquire(conversationId)).rejects.toBeInstanceOf(ConversationTurnBusyError);
    } finally {
      await first.manager.onModuleDestroy();
      await second.manager.onModuleDestroy();
      await deleteConversationRows(checkpointPool, conversationIds);
    }
  });

  it("keeps a live graph fenced across instances when its actual turn backend is lost", async () => {
    const leaseApplicationName = `turn-lease-${randomUUID()}`;
    const first = leaseRig(2, undefined, leaseApplicationName);
    const second = leaseRig(2);
    const conversationId = `active-backend-loss-${randomUUID()}`;
    const unrelatedConversationId = `active-backend-loss-unrelated-${randomUUID()}`;
    const conversationIds = [conversationId, unrelatedConversationId];
    await insertConversationRows(checkpointPool, conversationIds);
    let markGraphStarted!: () => void;
    const graphStarted = new Promise<void>((resolve) => { markGraphStarted = resolve; });
    const source = {
      next: vi.fn(() => {
        markGraphStarted();
        return new Promise<IteratorResult<unknown>>(() => {});
      }),
      return: vi.fn(() => new Promise<IteratorReturnResult<unknown>>(() => {})),
      [Symbol.asyncIterator]() { return this; },
    };
    const graph = {
      getState: vi.fn().mockResolvedValue({ values: { stage: "design-review" }, tasks: [] }),
      stream: vi.fn().mockResolvedValue(source),
    };
    const prisma = {
      conversation: {
        findFirst: vi.fn().mockResolvedValue({
          id: conversationId,
          tenantId: "tenant",
          workspaceId: "workspace",
        }),
      },
      message: { create: vi.fn().mockResolvedValue({}) },
    };
    const service = conversationService(first.manager, graph, prisma, checkpointPool);

    try {
      const events = await service.startTurn(principal(), conversationId, "确认设计");
      void events.next();
      await within(graphStarted, 750);

      await terminateNamedSessions(checkpointPool, leaseApplicationName);

      await expect(second.manager.acquire(conversationId)).rejects.toBeInstanceOf(
        ConversationTurnBusyError,
      );
      expect(await fenceCount(checkpointPool, conversationId)).toBe(1);
      await (await second.manager.acquire(unrelatedConversationId)).dispose();
    } finally {
      await within(first.manager.onModuleDestroy(), 750);
      await second.manager.onModuleDestroy();
      await deleteConversationRows(checkpointPool, conversationIds);
    }
  });

  it("releases its checked-out client and bounds shutdown when durable fence insertion fails", async () => {
    const rig = leaseRig(1);
    const conversationId = `forced-fence-insert-failure-${randomUUID()}`;
    await insertConversationRows(checkpointPool, [conversationId]);
    await installRejectingFenceTrigger(checkpointPool);
    let unexpectedLease: Awaited<ReturnType<PostgresConversationTurnLeaseManager["acquire"]>> | undefined;

    try {
      let acquisitionError: unknown;
      try {
        unexpectedLease = await rig.manager.acquire(conversationId);
      } catch (error) {
        acquisitionError = error;
      }
      expect(acquisitionError).toMatchObject({
        message: "CONVERSATION_TURN_LEASE_UNAVAILABLE",
      });
      await expect(within(rig.manager.onModuleDestroy(), 750)).resolves.toBeUndefined();
      expect(rig.leasePool.totalCount).toBe(0);
      expect(rig.ownerPool.totalCount).toBe(0);
    } finally {
      await removeRejectingFenceTrigger(checkpointPool);
      await unexpectedLease?.dispose().catch(() => {});
      await within(rig.manager.onModuleDestroy(), 750);
      await deleteConversationRows(checkpointPool, [conversationId]);
    }
  });

  it("closes admission while acquire is in flight and bounds shutdown without returning a lease", async () => {
    const rig = leaseRig(1);
    const conversationId = `slow-fence-insert-${randomUUID()}`;
    await insertConversationRows(checkpointPool, [conversationId]);
    await installSlowFenceTrigger(checkpointPool);
    try {
      const acquiring = rig.manager.acquire(conversationId);
      await new Promise<void>((resolve) => setTimeout(resolve, 50));
      const shuttingDown = rig.manager.onModuleDestroy();

      await expect(within(acquiring, 1_000)).rejects.toBeInstanceOf(ConversationTurnBusyError);
      await expect(within(shuttingDown, 1_000)).resolves.toBeUndefined();
      expect(rig.leasePool.totalCount).toBe(0);
      expect(rig.ownerPool.totalCount).toBe(0);
      expect(await fenceCount(checkpointPool, conversationId)).toBe(0);
    } finally {
      await removeSlowFenceTrigger(checkpointPool);
      await rig.manager.onModuleDestroy();
      await deleteConversationRows(checkpointPool, [conversationId]);
    }
  });

  it("recovers only a never-admitted PENDING fence whose owner session is gone", async () => {
    const rig = leaseRig(1);
    const conversationId = `pending-recovery-${randomUUID()}`;
    await insertConversationRows(checkpointPool, [conversationId]);
    await checkpointPool.query(
      `INSERT INTO "ConversationTurnFence" ("conversationId", "ownerId", "leaseId", "state")
       VALUES ($1, $2, $3, 'PENDING')`,
      [conversationId, `dead-owner-${randomUUID()}`, randomUUID()],
    );
    try {
      const recovered = await rig.manager.acquire(conversationId);
      await recovered.dispose();
      expect(await fenceCount(checkpointPool, conversationId)).toBe(0);
    } finally {
      await rig.manager.onModuleDestroy();
      await deleteConversationRows(checkpointPool, [conversationId]);
    }
  });

  it.each(["approve", "revise", "cancel"] as const)(
    "uses the same cross-instance writer fence for %s resume and an ordinary message",
    async (action) => {
      const first = leaseRig(2);
      const second = leaseRig(2);
      const conversationId = `resume-message-race-${action}-${randomUUID()}`;
      await insertConversationRows(checkpointPool, [conversationId]);
      const planHash = "a".repeat(64);
      let pending = true;
      let finishResume!: () => void;
      const resumeGate = new Promise<void>((resolve) => { finishResume = resolve; });
      let markResumeStarted!: () => void;
      const resumeStarted = new Promise<void>((resolve) => { markResumeStarted = resolve; });
      let writerEffects = 0;
      const graph = {
        getState: vi.fn(async () => pending
          ? {
              values: { stage: "approval", planHash },
              tasks: [{ interrupts: [{ value: { type: "plan-approval", planHash } }] }],
            }
          : {
              values: {
                stage: "idle",
                planHash,
                activeChangeRequestId: "change-request",
                changePlanId: "change-plan",
              },
              tasks: [],
            }),
        stream: vi.fn(async () => {
          async function* resumeSource() {
            // Reproduce the dangerous checkpoint window: the interrupt has
            // been cleared, but the resume graph is still draining effects.
            pending = false;
            markResumeStarted();
            await resumeGate;
            writerEffects += 1;
            yield { resumed: true };
          }
          return resumeSource();
        }),
      };
      const messageCreate = vi.fn().mockResolvedValue({});
      const auditRecord = vi.fn().mockResolvedValue(undefined);
      const transaction = vi.fn(async (work: (tx: object) => Promise<unknown>) => work({
        $executeRaw: vi.fn().mockResolvedValue(1),
      }));
      const prisma = {
        conversation: {
          findFirst: vi.fn().mockResolvedValue({
            id: conversationId,
            tenantId: "tenant",
            workspaceId: "workspace",
          }),
        },
        message: { create: messageCreate },
        $transaction: transaction,
      };
      const firstService = conversationService(
        first.manager,
        graph,
        prisma,
        checkpointPool,
        { record: auditRecord },
      );
      const secondService = conversationService(
        second.manager,
        graph,
        prisma,
        checkpointPool,
        { record: auditRecord },
      );
      const resuming = firstService.resume(principal(), conversationId, { action, planHash });

      try {
        await within(resumeStarted, 750);
        await expect(
          secondService.startTurn(principal(), conversationId, "并发普通消息"),
        ).rejects.toBeInstanceOf(ConversationTurnBusyError);

        finishResume();
        await within(resuming, 750);
        expect(writerEffects).toBe(1);
        expect(messageCreate).not.toHaveBeenCalled();
        expect(graph.stream).toHaveBeenCalledTimes(1);
        expect(auditRecord).toHaveBeenCalledTimes(1);
        expect(await fenceCount(checkpointPool, conversationId)).toBe(0);
      } finally {
        finishResume();
        await resuming.catch(() => {});
        await first.manager.onModuleDestroy();
        await second.manager.onModuleDestroy();
        await deleteConversationRows(checkpointPool, [conversationId]);
      }
    },
  );

  it("keeps the conversation fenced when its owner session dies but graph work may remain", async () => {
    const errorLog = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    const ownerApplicationName = `turn-owner-${randomUUID()}`;
    const first = leaseRig(2, ownerApplicationName);
    const second = leaseRig(2);
    const conversationId = `dead-owner-${randomUUID()}`;
    const unrelatedConversationId = `dead-owner-unrelated-${randomUUID()}`;
    const conversationIds = [conversationId, unrelatedConversationId];
    await insertConversationRows(checkpointPool, conversationIds);

    try {
      const stuck = await first.manager.acquire(conversationId);
      await stuck.quarantine();
      await expect(second.manager.acquire(conversationId)).rejects.toBeInstanceOf(ConversationTurnBusyError);

      await terminateOwnerSession(checkpointPool, ownerApplicationName);
      await expect(second.manager.acquire(conversationId)).rejects.toBeInstanceOf(ConversationTurnBusyError);
      expect(await fenceCount(checkpointPool, conversationId)).toBe(1);
      await (await second.manager.acquire(unrelatedConversationId)).dispose();
    } finally {
      await first.manager.onModuleDestroy();
      await second.manager.onModuleDestroy();
      await deleteConversationRows(checkpointPool, conversationIds);
      errorLog.mockRestore();
    }
  });
});

function conversationService(
  manager: PostgresConversationTurnLeaseManager,
  graph: object,
  prisma: object,
  checkpointPool: pg.Pool,
  audit: object = {},
): ConversationService {
  const service = new ConversationService(
    prisma as never,
    audit as never,
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

function leaseRig(
  max: number,
  ownerApplicationName?: string,
  leaseApplicationName?: string,
): {
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
    ...(leaseApplicationName === undefined ? {} : { application_name: leaseApplicationName }),
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
  await terminateNamedSessions(pool, applicationName);
}

async function terminateNamedSessions(pool: pg.Pool, applicationName: string): Promise<void> {
  const result = await pool.query<{ terminated: boolean }>(
    `SELECT pg_terminate_backend(pid) AS terminated
     FROM pg_stat_activity
     WHERE application_name = $1
       AND pid <> pg_backend_pid()`,
    [applicationName],
  );
  expect(result.rows.length).toBeGreaterThan(0);
  expect(result.rows.every(({ terminated }) => terminated)).toBe(true);
}

async function installRejectingFenceTrigger(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE OR REPLACE FUNCTION reject_test_conversation_turn_fence()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF NEW."conversationId" LIKE 'forced-fence-insert-failure-%' THEN
        RAISE EXCEPTION 'forced conversation turn fence insertion failure';
      END IF;
      RETURN NEW;
    END;
    $function$;
    DROP TRIGGER IF EXISTS reject_test_conversation_turn_fence
      ON "ConversationTurnFence";
    CREATE TRIGGER reject_test_conversation_turn_fence
      BEFORE INSERT ON "ConversationTurnFence"
      FOR EACH ROW EXECUTE FUNCTION reject_test_conversation_turn_fence();
  `);
}

async function removeRejectingFenceTrigger(pool: pg.Pool): Promise<void> {
  await pool.query(`
    DROP TRIGGER IF EXISTS reject_test_conversation_turn_fence
      ON "ConversationTurnFence";
    DROP FUNCTION IF EXISTS reject_test_conversation_turn_fence();
  `);
}

async function installSlowFenceTrigger(pool: pg.Pool): Promise<void> {
  await pool.query(`
    CREATE OR REPLACE FUNCTION slow_test_conversation_turn_fence()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $function$
    BEGIN
      IF NEW."conversationId" LIKE 'slow-fence-insert-%' THEN
        PERFORM pg_sleep(0.25);
      END IF;
      RETURN NEW;
    END;
    $function$;
    DROP TRIGGER IF EXISTS slow_test_conversation_turn_fence
      ON "ConversationTurnFence";
    CREATE TRIGGER slow_test_conversation_turn_fence
      BEFORE INSERT ON "ConversationTurnFence"
      FOR EACH ROW EXECUTE FUNCTION slow_test_conversation_turn_fence();
  `);
}

async function removeSlowFenceTrigger(pool: pg.Pool): Promise<void> {
  await pool.query(`
    DROP TRIGGER IF EXISTS slow_test_conversation_turn_fence
      ON "ConversationTurnFence";
    DROP FUNCTION IF EXISTS slow_test_conversation_turn_fence();
  `);
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
// end
