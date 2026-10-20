// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { NormalizedUsage } from "@kf/contracts";

export type UsageSummary = {
  /** 按 token 加权的缓存命中率；没有可信分母时为 null，不允许编造 0 或 100%。 */
  hitRatio: number | null;
  knownInputTokens: number;
  unknownCount: number;
};

/**
 * 汇总一批调用的 usage。
 *
 * - 命中率按 token 加权，不对每次请求做不加权平均
 * - 缺 usage 或自相矛盾的调用只进 unknownCount，不进分母
 * - 单个 provider 计量不可信时宁可少算，也不做「估算修正」
 */
export function aggregateUsage(rows: readonly NormalizedUsage[]): UsageSummary {
  let hitTokens = 0;
  let missTokens = 0;
  let knownInputTokens = 0;
  let unknownCount = 0;

  for (const row of rows) {
    const trustworthy = row.source !== "unknown" && !row.inconsistent && row.inputTokens !== null;
    if (!trustworthy) {
      unknownCount += 1;
      continue;
    }
    knownInputTokens += row.inputTokens ?? 0;
    hitTokens += row.cacheHitTokens ?? 0;
    missTokens += row.cacheMissTokens ?? 0;
  }

  const denominator = hitTokens + missTokens;
  return {
    hitRatio: denominator === 0 ? null : hitTokens / denominator,
    knownInputTokens,
    unknownCount,
  };
}
// end
