// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { AsyncLocalStorage } from "node:async_hooks";

/** 仅服务器异步上下文持有租约与取消信号，不写入模型提示词或公共事件。 */
export type AgentRunExecutionScope = {
  runId: string;
  tenantId: string;
  ownerId: string;
  fence: number;
  signal: AbortSignal;
  assertActive?: () => Promise<void>;
};
type InternalExecutionScope = AgentRunExecutionScope & { pending: Set<Promise<unknown>>; closed: boolean };
const executionScopes = new AsyncLocalStorage<InternalExecutionScope>();
export async function withAgentRunExecution<T>(scope: AgentRunExecutionScope, execute: () => Promise<T>): Promise<T> {
  const internal: InternalExecutionScope = { ...scope, pending: new Set(), closed: false };
  return executionScopes.run(internal, async () => {
    try { return await execute(); }
    finally {
      internal.closed = true;
      // 图取消不能先释放会话锁、后让未完成的模型/编译任务继续写库。
      while (internal.pending.size) await Promise.allSettled([...internal.pending]);
    }
  });
}
export function currentAgentRunExecution(): AgentRunExecutionScope | undefined {
  return executionScopes.getStore();
}

export async function withAgentRunNode<T>(execute: () => T): Promise<Awaited<T>> {
  const scope = executionScopes.getStore();
  if (!scope) return await execute();
  if (scope.closed) throw new Error("RUN_EXECUTION_SCOPE_CLOSED");
  const pending = (async () => {
    scope.signal.throwIfAborted();
    await scope.assertActive?.();
    const result = await execute();
    await scope.assertActive?.();
    scope.signal.throwIfAborted();
    return result;
  })();
  scope.pending.add(pending);
  try { return await pending; }
  finally { scope.pending.delete(pending); }
}
// end
