import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import pg from "pg";

/**
 * 用于共享的PostgreSQL连接池的注入令牌，由LangGraph PostgresSaver检查点器使用。池保持在请求和进程重启期间可恢复的图线程（任务10步骤7）。
 */
export const PG_POOL = Symbol("PG_POOL");

/** 从DATABASE_URL创建一个pg Pool。 */
export function createPgPool(): pg.Pool {
  const url = process.env.DATABASE_URL;
  if (typeof url !== "string" || url.length === 0) {
    throw new Error("DATABASE_URL is required for the graph checkpointer pool");
  }
  return new pg.Pool({ connectionString: url });
}

/** 已确保检查点表存在的 PostgresSaver（幂等）。 */
export async function createCheckpointSaver(pool: pg.Pool): Promise<PostgresSaver> {
  const saver = new PostgresSaver(pool);
  await saver.setup();
  return saver;
}
