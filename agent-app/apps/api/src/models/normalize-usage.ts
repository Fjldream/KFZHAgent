// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { NormalizedUsage, ProviderUsage } from "@kf/contracts";

/**
 * 只接受非负安全整数；负数、浮点、溢出和字符串一律视为「未提供」。
 * 不从百分比、字符数或历史均值反推 token，避免把估算冒充账单。
 */
const count = (value: unknown): number | null =>
  Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : null;

/**
 * 把 provider 原始 usage 归一成统一的记账结构。
 *
 * - 全部字段缺失 → source=unknown（费用必须记为未知，不能当 0）
 * - input 与 hit+miss 同时已知但不等 → inconsistent=true，费用停止精确计算
 * - reasoning 单独暴露；DeepSeek 的 completion_tokens 已包含推理 token，
 *   调用方不得把它再加到 output 上（否则重复计费）
 */
export function normalizeUsage(raw: ProviderUsage | undefined): NormalizedUsage {
  if (raw === undefined) {
    return {
      inputTokens: null,
      outputTokens: null,
      cacheHitTokens: null,
      cacheMissTokens: null,
      reasoningTokens: null,
      source: "unknown",
      inconsistent: false,
    };
  }

  const inputTokens = count(raw.prompt_tokens);
  const outputTokens = count(raw.completion_tokens);
  const cacheHitTokens = count(raw.prompt_cache_hit_tokens);
  const cacheMissTokens = count(raw.prompt_cache_miss_tokens);
  const reasoningTokens = count(raw.completion_tokens_details?.reasoning_tokens);

  const known = [inputTokens, outputTokens, cacheHitTokens, cacheMissTokens, reasoningTokens]
    .some((value) => value !== null);
  const inputAndCacheKnown = inputTokens !== null && cacheHitTokens !== null && cacheMissTokens !== null;
  const inconsistent = inputAndCacheKnown && inputTokens !== cacheHitTokens + cacheMissTokens;

  return {
    inputTokens,
    outputTokens,
    cacheHitTokens,
    cacheMissTokens,
    reasoningTokens,
    source: known ? "provider" : "unknown",
    inconsistent,
  };
}
// end
