import { randomUUID } from "node:crypto";
import { Logger, type OnModuleDestroy } from "@nestjs/common";
import pg from "pg";

export const CONVERSATION_TURN_LEASE = Symbol("CONVERSATION_TURN_LEASE");

const DEFAULT_POOL_MAX = 4;
const DEFAULT_CONNECTION_TIMEOUT_MS = 250;
const DEFAULT_STATEMENT_TIMEOUT_MS = 1_000;

export interface ConversationTurnLease {
  dispose(): Promise<void>;
  quarantine(): Promise<void>;
}

export interface ConversationTurnLeasePort {
  acquire(conversationId: string): Promise<ConversationTurnLease>;
}

export class ConversationTurnBusyError extends Error {
  readonly code = "CONVERSATION_TURN_IN_PROGRESS";

  constructor() {
    super("Another turn is already in progress for this conversation");
    this.name = "ConversationTurnBusyError";
  }
}

/**
 * Owns a small pool used only for session-scoped turn leases. It must never be
 * shared with PostgresSaver: a turn holds its lease while the graph needs
 * checkpoint connections.
 */
export class PostgresConversationTurnLeaseManager
implements ConversationTurnLeasePort, OnModuleDestroy {
  private readonly logger = new Logger(PostgresConversationTurnLeaseManager.name);
  private readonly active = new Set<ConversationTurnLease>();
  private readonly ownerId: string;
  private ownerClient: pg.PoolClient | undefined;
  private ownerConnection: Promise<pg.PoolClient> | undefined;
  private destroyPromise: Promise<void> | undefined;
  private closing = false;

  constructor(
    private readonly pool: pg.Pool,
    private readonly ownerPool: pg.Pool,
    ownerId = randomUUID(),
  ) {
    this.ownerId = ownerId;
  }

  async acquire(conversationId: string): Promise<ConversationTurnLease> {
    if (this.closing) throw new ConversationTurnBusyError();
    await this.ensureOwnerSession();
    let client: pg.PoolClient;
    try {
      client = await this.pool.connect();
    } catch {
      throw new ConversationTurnBusyError();
    }

    let turnLocked = false;
    try {
      const result = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
        [turnLockKey(conversationId)],
      );
      if (result.rows[0]?.acquired !== true) {
        client.release();
        throw new ConversationTurnBusyError();
      }
      turnLocked = true;
      await this.clearDeadOwnerFenceOrThrow(client, conversationId);
    } catch (error) {
      if (turnLocked) {
        await releaseTurnClient(client, conversationId, this.logger);
      } else if (!(error instanceof ConversationTurnBusyError)) {
        client.release(true);
      }
      throw error instanceof ConversationTurnBusyError
        ? error
        : new Error("CONVERSATION_TURN_LEASE_UNAVAILABLE");
    }

    const leaseId = randomUUID();
    let state: "active" | "quarantined" | "released" = "active";
    let operation = Promise.resolve();
    const serial = <T>(work: () => Promise<T>): Promise<T> => {
      const result = operation.then(work, work);
      operation = result.then(() => undefined, () => undefined);
      return result;
    };
    const lease: ConversationTurnLease = {
      quarantine: () => serial(async () => {
        if (state !== "active") return;
        const fenced = await client.query(
          `INSERT INTO "ConversationTurnFence"
             ("conversationId", "ownerId", "leaseId")
           VALUES ($1, $2, $3)
           ON CONFLICT ("conversationId") DO NOTHING
           RETURNING "conversationId"`,
          [conversationId, this.ownerId, leaseId],
        );
        if (fenced.rowCount !== 1) {
          throw new Error("CONVERSATION_TURN_FENCE_CONFLICT");
        }
        await releaseTurnClient(client, conversationId, this.logger);
        state = "quarantined";
      }),
      dispose: () => serial(async () => {
        if (state === "released") return;
        if (state === "active") {
          await releaseTurnClient(client, conversationId, this.logger);
        } else {
          const cleared = await this.pool.query(
            `DELETE FROM "ConversationTurnFence"
             WHERE "conversationId" = $1
               AND "ownerId" = $2
               AND "leaseId" = $3`,
            [conversationId, this.ownerId, leaseId],
          );
          if (cleared.rowCount !== 1) {
            throw new Error("CONVERSATION_TURN_FENCE_RELEASE_FAILED");
          }
        }
        state = "released";
        this.active.delete(lease);
      }),
    };
    this.active.add(lease);
    return lease;
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyPromise ??= this.destroy();
    return this.destroyPromise;
  }

  private async clearDeadOwnerFenceOrThrow(
    client: pg.PoolClient,
    conversationId: string,
  ): Promise<void> {
    for (;;) {
      const fence = (await client.query<{ ownerId: string; leaseId: string }>(
        `SELECT "ownerId", "leaseId"
         FROM "ConversationTurnFence"
         WHERE "conversationId" = $1`,
        [conversationId],
      )).rows[0];
      if (fence === undefined) return;
      if (fence.ownerId === this.ownerId) throw new ConversationTurnBusyError();

      const ownerLock = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
        [ownerLockKey(fence.ownerId)],
      );
      if (ownerLock.rows[0]?.acquired !== true) throw new ConversationTurnBusyError();
      try {
        await client.query(
          `DELETE FROM "ConversationTurnFence"
           WHERE "conversationId" = $1
             AND "ownerId" = $2
             AND "leaseId" = $3`,
          [conversationId, fence.ownerId, fence.leaseId],
        );
      } finally {
        await client.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
          [ownerLockKey(fence.ownerId)],
        );
      }
    }
  }

  private async ensureOwnerSession(): Promise<pg.PoolClient> {
    if (this.ownerClient !== undefined) return this.ownerClient;
    this.ownerConnection ??= (async () => {
      const client = await this.ownerPool.connect();
      try {
        const result = await client.query<{ acquired: boolean }>(
          "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
          [ownerLockKey(this.ownerId)],
        );
        if (result.rows[0]?.acquired !== true) {
          throw new Error("owner lock unavailable");
        }
        client.on("error", () => {
          this.closing = true;
          this.ownerClient = undefined;
          this.ownerConnection = undefined;
          try {
            client.release(true);
          } catch { /* the pool may already have removed the failed client */ }
          this.logger.error("Conversation turn fence owner session was lost");
        });
        this.ownerClient = client;
        return client;
      } catch (error) {
        client.release(true);
        throw error;
      }
    })();
    try {
      return await this.ownerConnection;
    } catch {
      this.closing = true;
      throw new Error("CONVERSATION_TURN_LEASE_UNAVAILABLE");
    }
  }

  private async destroy(): Promise<void> {
    this.closing = true;
    await Promise.allSettled([...this.active].map((lease) => lease.dispose()));
    await this.pool.query(
      `DELETE FROM "ConversationTurnFence" WHERE "ownerId" = $1`,
      [this.ownerId],
    ).catch(() => {});

    const ownerClient = this.ownerClient;
    this.ownerClient = undefined;
    if (ownerClient !== undefined) {
      try {
        await ownerClient.query(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
          [ownerLockKey(this.ownerId)],
        );
        ownerClient.release();
      } catch {
        ownerClient.release(true);
      }
    }
    await Promise.allSettled([this.pool.end(), this.ownerPool.end()]);
  }
}

export function createConversationTurnLeaseManagerFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): PostgresConversationTurnLeaseManager {
  const connectionString = env.DATABASE_URL;
  if (typeof connectionString !== "string" || connectionString.length === 0) {
    throw new Error("DATABASE_URL is required for conversation turn leases");
  }
  const connectionTimeoutMillis = positiveInteger(
    env.KF_CONVERSATION_TURN_LEASE_CONNECTION_TIMEOUT_MS,
    DEFAULT_CONNECTION_TIMEOUT_MS,
  );
  const statementTimeout = positiveInteger(
    env.KF_CONVERSATION_TURN_LEASE_STATEMENT_TIMEOUT_MS,
    DEFAULT_STATEMENT_TIMEOUT_MS,
  );
  return new PostgresConversationTurnLeaseManager(new pg.Pool({
    connectionString,
    max: positiveInteger(env.KF_CONVERSATION_TURN_LEASE_POOL_MAX, DEFAULT_POOL_MAX),
    connectionTimeoutMillis,
    statement_timeout: statementTimeout,
    query_timeout: statementTimeout,
  }), new pg.Pool({
    connectionString,
    max: 1,
    connectionTimeoutMillis,
    statement_timeout: statementTimeout,
    query_timeout: statementTimeout,
  }));
}

async function releaseTurnClient(
  client: pg.PoolClient,
  conversationId: string,
  logger: Logger,
): Promise<void> {
  try {
    const result = await client.query<{ released: boolean }>(
      "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released",
      [turnLockKey(conversationId)],
    );
    client.release(result.rows[0]?.released !== true);
  } catch {
    client.release(true);
    logger.warn("Conversation turn lease connection was destroyed during cleanup");
  }
}

function turnLockKey(conversationId: string): string {
  return `kf-turn:${conversationId}`;
}

function ownerLockKey(ownerId: string): string {
  return `kf-turn-owner:${ownerId}`;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}
