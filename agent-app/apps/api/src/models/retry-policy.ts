// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
export type RetryDecision = "retry_transport" | "repair_semantic" | "stop";

/** 传输层可重试：限流与瞬时故障。认证/配额/协议错误重试只会浪费额度。 */
const TRANSPORT_RETRYABLE = new Set(["MODEL_RATE_LIMIT", "MODEL_TRANSIENT"]);

/** 语义可修复：模型输出结构不合格，允许带着错误摘要再要一次。 */
const SEMANTIC_REPAIRABLE = new Set(["SCHEMA_INVALID", "JOURNEY_INVALID", "JSON_INVALID"]);

/**
 * 唯一的重试决策点。transport 重试由网关负责，语义修复由编排层负责，
 * 两边都从这里取结论，避免「嵌套修复」把实际请求数放大到不可解释。
 *
 * 硬性上限：传输重试 1 次、语义修复 1 次，且必须还有剩余调用额度。
 */
export function decideRetry(input: {
  code: string;
  transportRetries: number;
  semanticRepairs: number;
  remainingInvocations: number;
  aborted: boolean;
}): RetryDecision {
  if (input.aborted || input.remainingInvocations <= 0) return "stop";
  if (TRANSPORT_RETRYABLE.has(input.code) && input.transportRetries < 1) return "retry_transport";
  if (SEMANTIC_REPAIRABLE.has(input.code) && input.semanticRepairs < 1) return "repair_semantic";
  return "stop";
}
// end
