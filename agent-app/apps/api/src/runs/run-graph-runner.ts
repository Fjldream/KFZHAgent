// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { RunAborted } from "./run-executor.js";

/** 图的最小可用接口：只用到 stream / getState，便于测试替身。 */
export type GraphLike = {
  stream: (input: unknown, config: unknown) => Promise<AsyncIterable<unknown>>;
  getState: (config: unknown) => Promise<{
    tasks?: ReadonlyArray<{ interrupts?: ReadonlyArray<unknown> }>;
    values?: Record<string, unknown>;
    next?: readonly string[];
  }>;
};

export type GraphRunOutcome =
  | { kind: "completed"; stage: string | null; values: Record<string, unknown> }
  | { kind: "interrupted"; values: Record<string, unknown>; interrupt: Record<string, unknown> };

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
  onNode?: (name: string) => Promise<void>;
  completedSnapshot?: Awaited<ReturnType<GraphLike["getState"]>>;
}): Promise<GraphRunOutcome> {
  if (options.signal?.aborted) throw new RunAborted();
  const config = { ...threadConfig(options.conversationId), streamMode: "updates" };
  if (!options.completedSnapshot) {
    const stream = await options.graph.stream(options.input, config);

    for await (const chunk of stream) {
      if (options.signal?.aborted === true) throw new RunAborted();
      if (chunk !== null && typeof chunk === "object") {
        for (const name of Object.keys(chunk)) {
          if (name !== "__interrupt__") await options.onNode?.(name);
        }
      }
    }
  }

  const snapshot = options.completedSnapshot ?? await options.graph.getState(config);
  const values = snapshot.values ?? {};
  if (hasPendingInterrupt(snapshot)) {
    const raw = snapshot.tasks?.flatMap(task => task.interrupts ?? [])[0];
    const interrupt = raw !== null && typeof raw === "object" && "value" in raw ? raw.value : raw;
    return { kind: "interrupted", values, interrupt: (interrupt ?? {}) as Record<string, unknown> };
  }

  const stage = snapshot.values?.stage;
  return { kind: "completed", stage: typeof stage === "string" ? stage : null, values };
}
// end
