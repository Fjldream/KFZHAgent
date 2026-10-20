// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { expect, it } from "vitest";
import { normalizeUsage } from "./normalize-usage.js";
import { estimateCostMicros, type PriceRates } from "./pricing.js";

const RATES: PriceRates = { version: "test", currency: "TEST",
  hitMicrosPerMillion: 1000000n, missMicrosPerMillion: 2000000n,
  outputMicrosPerMillion: 3000000n };

it("prices weighted input and excludes double-counted reasoning", () => {
  const usage = normalizeUsage({ prompt_tokens: 1000, completion_tokens: 100,
    prompt_cache_hit_tokens: 800, prompt_cache_miss_tokens: 200,
    completion_tokens_details: { reasoning_tokens: 50 } });
  expect(estimateCostMicros(usage, RATES)).toBe(1500n);
  expect(estimateCostMicros(normalizeUsage(undefined), null)).toBeNull();
});

it("returns null instead of guessing when the price table is missing or invalid", () => {
  const usage = normalizeUsage({ prompt_tokens: 10, completion_tokens: 5,
    prompt_cache_hit_tokens: 4, prompt_cache_miss_tokens: 6 });
  expect(estimateCostMicros(usage, null)).toBeNull();
  expect(estimateCostMicros(usage, { ...RATES, missMicrosPerMillion: -1n })).toBeNull();
});

it("returns null for incomplete or contradictory usage", () => {
  expect(estimateCostMicros(normalizeUsage({ prompt_tokens: 10 }), RATES)).toBeNull();
  expect(estimateCostMicros(normalizeUsage({ prompt_tokens: 10, completion_tokens: 5,
    prompt_cache_hit_tokens: 4, prompt_cache_miss_tokens: 1 }), RATES)).toBeNull();
});

it("rounds up to a single micro unit and keeps exact bigint math", () => {
  const tiny = normalizeUsage({ prompt_tokens: 1, completion_tokens: 0,
    prompt_cache_hit_tokens: 1, prompt_cache_miss_tokens: 0 });
  expect(estimateCostMicros(tiny, { ...RATES, hitMicrosPerMillion: 1n,
    missMicrosPerMillion: 0n, outputMicrosPerMillion: 0n })).toBe(1n);

  const zero = normalizeUsage({ prompt_tokens: 0, completion_tokens: 0,
    prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 });
  expect(estimateCostMicros(zero, RATES)).toBe(0n);

  const huge = normalizeUsage({ prompt_tokens: 1000000000, completion_tokens: 0,
    prompt_cache_hit_tokens: 1000000000, prompt_cache_miss_tokens: 0 });
  expect(estimateCostMicros(huge, { ...RATES, hitMicrosPerMillion: 1n,
    missMicrosPerMillion: 0n, outputMicrosPerMillion: 0n })).toBe(1000n);
});
// end
