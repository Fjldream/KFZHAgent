// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { RunAborted } from "./run-executor.js";

/** 图的最小可用接口：只用到 stream / getState，便于测试替身。 */
export type GraphLike = {
  stream: (input: unknown, config: unknown) => Promise<AsyncIterable<unknown>>;
  getState: (config: unknown) => Promise<{
    tasks?: ReadonlyArray<{ interrupts?: ReadonlyArray<unknown> }>;
    values?: Record<string, unknown>;
  }>;
};

export type GraphRunOutcome =
  | { kind: "completed"; stage: string | null }
  | { kind: "interrupted" };

export const threadConfig = (conversationId: string) => ({
  configurable: { thread_id: conversationId },
});

const hasPendingInterrupt = (snapshot: { tasks?: ReadonlyArray<{ interrupts?: ReadonlyArray<unknown> }> }): boolean =>
  (snapshot.tasks ?? []).some((task) => (task.interrupts ?? []).length > 0);

/**
 * 跑完一次图调用并判定它是否停在中断点。
 *
 * 只消费 stream 不解释每个 chunk：事件内容由 run 的 step 记录承载，
 * 这里只关心「跑完了」还是「停在审批」——后者必须让 run 进入等待态而不是成功态。
 */
export async function runGraphOnce(options: {
  graph: GraphLike;
  input: unknown;
  conversationId: string;
  signal?: AbortSignal;
}): Promise<GraphRunOutcome> {
  const config = threadConfig(options.conversationId);
  const stream = await options.graph.stream(options.input, config);

  for await (const _chunk of stream) {
    if (options.signal?.aborted === true) throw new RunAborted();
  }

  const snapshot = await options.graph.getState(config);
  if (hasPendingInterrupt(snapshot)) return { kind: "interrupted" };

  const stage = snapshot.values?.stage;
  return { kind: "completed", stage: typeof stage === "string" ? stage : null };
}
// end
