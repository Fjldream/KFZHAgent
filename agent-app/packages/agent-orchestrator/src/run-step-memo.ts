// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { createHash } from "node:crypto";
import type { AgentGraphStateValue, AgentGraphUpdate } from "./state.js";

/**
 * 图节点级幂等端口。由持有租约的执行器提供，绑定到具体 run；
 * 未接线（或 state 无 runId）时节点行为与改造前完全一致。
 */
export interface RunStepMemo {
  find(stepKey: string, inputHash: string): Promise<unknown>;
  save(stepKey: string, inputHash: string, output: unknown): Promise<void>;
}

const canonicalize = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === "object") {
    const source = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(source).sort()) {
      if (source[key] === undefined) continue;
      sorted[key] = canonicalize(source[key]);
    }
    return sorted;
  }
  return value;
};

/** 节点输入哈希：只覆盖真正影响该节点输出的字段。 */
export function stepInputHash(stepKey: string, planVersion: string, inputs: unknown): string {
  return createHash("sha256")
    .update(`${planVersion}|${stepKey}|${JSON.stringify(canonicalize(inputs))}`, "utf8")
    .digest("hex");
}

export type MemoOptions = {
  /**
   * 按 runId 解析该 run 的幂等端口。图是进程级单例，而 memo 绑定具体租约，
   * 因此只能运行期解析，不能作为编译期依赖注入。
   */
  resolveMemo?: ((runId: string) => RunStepMemo | undefined) | undefined;
  planVersion?: string;
};

/**
 * 用 step 级幂等包裹节点。
 *
 * - 未提供 memo 或 state 无 runId：直接执行，行为不变（旧调用零影响）
 * - 命中已完成输出：直接返回，跳过模型调用
 * - 失败结果不写入：`lastErrorCode` 存在时不缓存，避免把一次偶发失败固化
 */
export function withStepMemo(
  stepKey: string,
  node: (state: AgentGraphStateValue) => Promise<AgentGraphUpdate>,
  options: MemoOptions,
  selectInputs: (state: AgentGraphStateValue) => unknown,
): (state: AgentGraphStateValue) => Promise<AgentGraphUpdate> {
  return async (state) => {
    const runId = state.runId;
    const memo = options.resolveMemo?.(runId ?? "");
    if (memo === undefined || runId === undefined || runId.length === 0) return node(state);

    const inputHash = stepInputHash(stepKey, options.planVersion ?? state.planVersion ?? "graph@1", selectInputs(state));
    const cached = await memo.find(stepKey, inputHash);
    if (cached !== null) return cached as AgentGraphUpdate;

    const output = await node(state);
    const failed = typeof output === "object" && output !== null
      && "lastErrorCode" in output && (output as { lastErrorCode?: unknown }).lastErrorCode !== undefined;
    if (!failed) await memo.save(stepKey, inputHash, output);
    return output;
  };
}
// end
