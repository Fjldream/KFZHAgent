import { Logger, type OnModuleDestroy } from "@nestjs/common";
import pg from "pg";

export const CONVERSATION_TURN_LEASE = Symbol("CONVERSATION_TURN_LEASE");

const DEFAULT_POOL_MAX = 4;
const DEFAULT_CONNECTION_TIMEOUT_MS = 250;
const DEFAULT_STATEMENT_TIMEOUT_MS = 1_000;

export interface ConversationTurnLease {
  dispose(): Promise<void>;
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
  private closing = false;

  constructor(private readonly pool: pg.Pool) {}

  async acquire(conversationId: string): Promise<ConversationTurnLease> {
    if (this.closing) throw new ConversationTurnBusyError();
    let client: pg.PoolClient;
    try {
      client = await this.pool.connect();
    } catch {
      throw new ConversationTurnBusyError();
    }

    try {
      const result = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtextextended($1, 0)) AS acquired",
        [conversationId],
      );
      if (result.rows[0]?.acquired !== true) {
        client.release();
        throw new ConversationTurnBusyError();
      }
    } catch (error) {
      if (!(error instanceof ConversationTurnBusyError)) client.release(true);
      throw error instanceof ConversationTurnBusyError
        ? error
        : new Error("CONVERSATION_TURN_LEASE_UNAVAILABLE");
    }

    let disposed = false;
    const lease: ConversationTurnLease = {
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        this.active.delete(lease);
        try {
          const result = await client.query<{ released: boolean }>(
            "SELECT pg_advisory_unlock(hashtextextended($1, 0)) AS released",
            [conversationId],
          );
          client.release(result.rows[0]?.released !== true);
        } catch {
          // Destroying the session releases an advisory lock even when the
          // explicit unlock result is unknown.
          client.release(true);
          this.logger.warn("Conversation turn lease connection was destroyed during cleanup");
        }
      },
    };
    this.active.add(lease);
    return lease;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    await Promise.allSettled([...this.active].map((lease) => lease.dispose()));
    await this.pool.end();
  }
}

export function createConversationTurnLeaseManagerFromEnvironment(
  env: NodeJS.ProcessEnv = process.env,
): PostgresConversationTurnLeaseManager {
  const connectionString = env.DATABASE_URL;
  if (typeof connectionString !== "string" || connectionString.length === 0) {
    throw new Error("DATABASE_URL is required for conversation turn leases");
  }
  return new PostgresConversationTurnLeaseManager(new pg.Pool({
    connectionString,
    max: positiveInteger(env.KF_CONVERSATION_TURN_LEASE_POOL_MAX, DEFAULT_POOL_MAX),
    connectionTimeoutMillis: positiveInteger(
      env.KF_CONVERSATION_TURN_LEASE_CONNECTION_TIMEOUT_MS,
      DEFAULT_CONNECTION_TIMEOUT_MS,
    ),
    statement_timeout: positiveInteger(
      env.KF_CONVERSATION_TURN_LEASE_STATEMENT_TIMEOUT_MS,
      DEFAULT_STATEMENT_TIMEOUT_MS,
    ),
    query_timeout: positiveInteger(
      env.KF_CONVERSATION_TURN_LEASE_STATEMENT_TIMEOUT_MS,
      DEFAULT_STATEMENT_TIMEOUT_MS,
    ),
  }));
}

function positiveInteger(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) return fallback;
  return parsed;
}
