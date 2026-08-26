import { randomUUID } from "node:crypto";
import { Logger, type OnModuleDestroy } from "@nestjs/common";
import pg from "pg";

export const CONVERSATION_TURN_LEASE = Symbol("CONVERSATION_TURN_LEASE");

const DEFAULT_POOL_MAX = 4;
const DEFAULT_CONNECTION_TIMEOUT_MS = 250;
const DEFAULT_STATEMENT_TIMEOUT_MS = 1_000;
const SHUTDOWN_ACQUIRE_WAIT_MS = 2_000;

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
  private readonly inFlight = new Set<Promise<void>>();
  private readonly provisioning = new Set<ManagedTurnClient>();
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
    let markSettled!: () => void;
    const settled = new Promise<void>((resolve) => { markSettled = resolve; });
    this.inFlight.add(settled);
    try {
      return await this.acquireLease(conversationId);
    } finally {
      this.inFlight.delete(settled);
      markSettled();
    }
  }

  private async acquireLease(conversationId: string): Promise<ConversationTurnLease> {
    await this.ensureOwnerSession();
    if (this.closing) throw new ConversationTurnBusyError();
    let client: pg.PoolClient;
    try {
      client = await this.pool.connect();
    } catch {
      throw new ConversationTurnBusyError();
    }

    const managedClient = manageTurnClient(client, this.logger);
    this.provisioning.add(managedClient);
    const leaseId = randomUUID();
    let turnLocked = false;
    let fenceAttempted = false;
    try {
      const result = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
        [turnLockKey(conversationId)],
      );
      if (result.rows[0]?.acquired !== true) {
        throw new ConversationTurnBusyError();
      }
      turnLocked = true;
      await this.assertNoDurableFence(client, conversationId);
      fenceAttempted = true;
      const fenced = await client.query(
        `INSERT INTO "ConversationTurnFence"
           ("conversationId", "ownerId", "leaseId", "state")
         VALUES ($1, $2, $3, 'PENDING')
         RETURNING "conversationId"`,
        [conversationId, this.ownerId, leaseId],
      );
      if (fenced.rowCount !== 1) {
        throw new Error("CONVERSATION_TURN_FENCE_CREATE_FAILED");
      }
      if (this.closing) throw new ConversationTurnBusyError();
      const admitted = await client.query(
        `UPDATE "ConversationTurnFence"
         SET "state" = 'ADMITTED'
         WHERE "conversationId" = $1
           AND "ownerId" = $2
           AND "leaseId" = $3
           AND "state" = 'PENDING'`,
        [conversationId, this.ownerId, leaseId],
      );
      if (admitted.rowCount !== 1 || this.closing) {
        throw this.closing
          ? new ConversationTurnBusyError()
          : new Error("CONVERSATION_TURN_FENCE_ADMISSION_FAILED");
      }
    } catch (error) {
      if (fenceAttempted) {
        await this.cleanupNeverAdmittedFence(client, conversationId, leaseId);
      }
      if (turnLocked) {
        await managedClient.release(conversationId);
      } else {
        managedClient.destroy();
      }
      this.provisioning.delete(managedClient);
      throw error instanceof ConversationTurnBusyError
        ? error
        : new Error("CONVERSATION_TURN_LEASE_UNAVAILABLE");
    }

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
        try {
          await client.query(
            `UPDATE "ConversationTurnFence"
             SET "state" = 'QUARANTINED'
             WHERE "conversationId" = $1
               AND "ownerId" = $2
               AND "leaseId" = $3`,
            [conversationId, this.ownerId, leaseId],
          );
        } catch {
          // ADMITTED is already fail-closed; releasing the session remains safe.
        }
        await managedClient.release(conversationId);
        state = "quarantined";
      }),
      dispose: () => serial(async () => {
        if (state === "released") return;
        try {
          const cleared = await (state === "active" && !managedClient.released
            ? client.query(
              `DELETE FROM "ConversationTurnFence"
               WHERE "conversationId" = $1
                 AND "ownerId" = $2
                 AND "leaseId" = $3`,
              [conversationId, this.ownerId, leaseId],
            )
            : this.pool.query(
            `DELETE FROM "ConversationTurnFence"
             WHERE "conversationId" = $1
               AND "ownerId" = $2
               AND "leaseId" = $3`,
            [conversationId, this.ownerId, leaseId],
            ));
          if (cleared.rowCount !== 1) {
            throw new Error("CONVERSATION_TURN_FENCE_RELEASE_FAILED");
          }
        } catch (error) {
          if (state === "active") {
            await managedClient.release(conversationId);
            state = "quarantined";
          }
          throw error;
        }
        if (state === "active") {
          await managedClient.release(conversationId);
        }
        state = "released";
        this.active.delete(lease);
      }),
    };
    this.active.add(lease);
    this.provisioning.delete(managedClient);
    return lease;
  }

  async onModuleDestroy(): Promise<void> {
    this.destroyPromise ??= this.destroy();
    return this.destroyPromise;
  }

  private async assertNoDurableFence(
    client: pg.PoolClient,
    conversationId: string,
  ): Promise<void> {
    const fence = await client.query<{ ownerId: string; leaseId: string; state: string }>(
      `SELECT "ownerId", "leaseId", "state"
       FROM "ConversationTurnFence"
       WHERE "conversationId" = $1`,
      [conversationId],
    );
    // Only PENDING means the lease was never handed to graph execution. It is
    // recoverable after the exact owner session is proven gone. ADMITTED and
    // QUARANTINED remain fail-closed because graph work may have started.
    const row = fence.rows[0];
    if (row === undefined) return;
    if (row.state === "PENDING") {
      const owner = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
        [ownerLockKey(row.ownerId)],
      );
      if (owner.rows[0]?.acquired === true) {
        try {
          await client.query(
            `DELETE FROM "ConversationTurnFence"
             WHERE "conversationId" = $1
               AND "ownerId" = $2
               AND "leaseId" = $3
               AND "state" = 'PENDING'`,
            [conversationId, row.ownerId, row.leaseId],
          );
          return;
        } finally {
          await client.query(
            "SELECT pg_advisory_unlock(hashtextextended($1, 0))",
            [ownerLockKey(row.ownerId)],
          );
        }
      }
    }
    throw new ConversationTurnBusyError();
  }

  private async cleanupNeverAdmittedFence(
    client: pg.PoolClient,
    conversationId: string,
    leaseId: string,
  ): Promise<void> {
    const query = `DELETE FROM "ConversationTurnFence"
      WHERE "conversationId" = $1 AND "ownerId" = $2 AND "leaseId" = $3`;
    try {
      await client.query(query, [conversationId, this.ownerId, leaseId]);
      return;
    } catch {
      // A lost INSERT response can still mean the row committed. Destroy the
      // uncertain session, then reconcile the exact never-returned token.
      try { client.release(true); } catch { /* already removed */ }
    }
    try {
      await this.pool.query(query, [conversationId, this.ownerId, leaseId]);
    } catch {
      // A PENDING row is explicitly recoverable once this owner is no longer live.
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
    const acquisitions = Promise.allSettled([...this.inFlight]);
    await Promise.race([
      acquisitions,
      new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_ACQUIRE_WAIT_MS)),
    ]);
    for (const client of this.provisioning) client.destroy();
    this.provisioning.clear();
    // This manager cannot prove that every graph iterator stopped merely
    // because Nest shutdown began. Convert active session locks to durable
    // fences and retain existing quarantines; only confirmed graph cleanup
    // may call dispose() and delete its exact lease token.
    await Promise.allSettled([...this.active].map((lease) => lease.quarantine()));

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

interface ManagedTurnClient {
  readonly released: boolean;
  destroy(): void;
  release(conversationId: string): Promise<void>;
}

function manageTurnClient(
  client: pg.PoolClient,
  logger: Logger,
): ManagedTurnClient {
  let released = false;
  let warned = false;
  const warnOnce = () => {
    if (warned) return;
    warned = true;
    logger.warn("Conversation turn lease connection was destroyed during cleanup");
  };
  const onError = () => {
    if (!released) {
      released = true;
      try {
        client.release(true);
      } catch { /* the pool may already have removed the failed client */ }
    }
    // Keep this listener attached to a destroyed client: pg may emit a fatal
    // backend error followed by a connection-terminated error.
    warnOnce();
  };
  client.on("error", onError);

  return {
    get released() {
      return released;
    },
    destroy() {
      if (released) return;
      released = true;
      try {
        client.release(true);
      } catch { /* the pool may already have removed the failed client */ }
    },
    async release(conversationId: string) {
      if (released) return;
      try {
        const result = await client.query<{ released: boolean }>(
          "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released",
          [turnLockKey(conversationId)],
        );
        if (released) return;
        released = true;
        client.off("error", onError);
        client.release(result.rows[0]?.released !== true);
      } catch {
        if (!released) {
          released = true;
          try {
            client.release(true);
          } catch { /* the pool may already have removed the failed client */ }
        }
        warnOnce();
      }
    },
  };
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
