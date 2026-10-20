// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { expect, it } from "vitest";
import { normalizeUsage } from "./normalize-usage.js";
import { aggregateUsage } from "./usage-summary.js";

it("returns null hit ratio without a denominator and counts unknowns separately", () => {
  expect(aggregateUsage([]).hitRatio).toBeNull();
  const empty = aggregateUsage([normalizeUsage(undefined)]);
  expect(empty).toMatchObject({ hitRatio: null, knownInputTokens: 0, unknownCount: 1 });
});

it("weights the hit ratio by tokens, not by request count", () => {
  const small = normalizeUsage({ prompt_tokens: 100, completion_tokens: 1,
    prompt_cache_hit_tokens: 100, prompt_cache_miss_tokens: 0 });
  const large = normalizeUsage({ prompt_tokens: 900, completion_tokens: 1,
    prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 900 });
  const summary = aggregateUsage([small, large]);
  expect(summary.knownInputTokens).toBe(1000);
  expect(summary.hitRatio).toBeCloseTo(0.1, 5);
  expect(summary.unknownCount).toBe(0);
});
// end
