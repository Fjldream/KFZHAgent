process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@127.0.0.1:5432/kf_agent_test";

import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
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
    }
  });
});

function leaseManager(max: number): PostgresConversationTurnLeaseManager {
  return new PostgresConversationTurnLeaseManager(new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max,
    connectionTimeoutMillis: 150,
    statement_timeout: 500,
    query_timeout: 500,
  }));
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
