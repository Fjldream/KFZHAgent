import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import pg from "pg";

/**
 * Injection token for the shared PostgreSQL connection pool used by the
 * LangGraph PostgresSaver checkpointer. The pool keeps graph threads resumable
 * across requests and process restarts (Task 10 Step 7).
 */
export const PG_POOL = Symbol("PG_POOL");

/** Creates a pg Pool from DATABASE_URL. */
export function createPgPool(): pg.Pool {
  const url = process.env.DATABASE_URL;
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("DATABASE_URL is required for the graph checkpointer pool");
  }
  return new pg.Pool({ connectionString: url });
}

/** PostgresSaver with the checkpoint tables ensured (idempotent). */
export async function createCheckpointSaver(pool: pg.Pool): Promise<PostgresSaver> {
  const saver = new PostgresSaver(pool);
  await saver.setup();
  return saver;
}
