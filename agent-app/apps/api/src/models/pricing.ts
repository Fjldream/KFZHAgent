// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { NormalizedUsage } from "@kf/contracts";

/** 部署配置里的价格表版本；单位是「每百万 token 的 micro 货币单位」。 */
export type PriceRates = {
  version: string;
  currency: string;
  hitMicrosPerMillion: bigint;
  missMicrosPerMillion: bigint;
  outputMicrosPerMillion: bigint;
};

const MICROS_PER_MILLION_TOKENS = 1_000_000n;

/**
 * 计算一次调用的费用（micro 单位，向上取整）。
 *
 * 返回 null 的三种情况，调用方必须记为「未知费用」而不是 0：
 * - 价格表未配置或含负费率（配置不可信，不猜单价）
 * - usage 不完整（拿不到 hit/miss/output 任一项就无权加权）
 * - usage 自相矛盾（hit+miss ≠ input，provider 计量不可信）
 *
 * reasoning token 不在这里加价：DeepSeek 的 completion_tokens 已包含它。
 */
export function estimateCostMicros(usage: NormalizedUsage, rates: PriceRates | null): bigint | null {
  if (rates === null) return null;
  if (rates.hitMicrosPerMillion < 0n || rates.missMicrosPerMillion < 0n || rates.outputMicrosPerMillion < 0n) {
    return null;
  }
  if (usage.inconsistent) return null;

  const { cacheHitTokens, cacheMissTokens, outputTokens } = usage;
  if (cacheHitTokens === null || cacheMissTokens === null || outputTokens === null) return null;

  const numerator = BigInt(cacheHitTokens) * rates.hitMicrosPerMillion
    + BigInt(cacheMissTokens) * rates.missMicrosPerMillion
    + BigInt(outputTokens) * rates.outputMicrosPerMillion;
  return (numerator + MICROS_PER_MILLION_TOKENS - 1n) / MICROS_PER_MILLION_TOKENS;
}
// end
