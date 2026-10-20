// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { expect, it } from "vitest";
import { normalizeUsage } from "./normalize-usage.js";

it("keeps missing usage unknown and counts hit/miss independently", () => {
  expect(normalizeUsage(undefined).inputTokens).toBeNull();
  const usage = normalizeUsage({ prompt_tokens: 1000, completion_tokens: 30,
    prompt_cache_hit_tokens: 800, prompt_cache_miss_tokens: 200 });
  expect(usage).toMatchObject({ inputTokens: 1000, outputTokens: 30,
    cacheHitTokens: 800, cacheMissTokens: 200, source: "provider", inconsistent: false });
});

it("treats negative, fractional and overflowing counters as not provided", () => {
  const usage = normalizeUsage({
    prompt_tokens: -1,
    completion_tokens: 1.5,
    prompt_cache_hit_tokens: Number.MAX_SAFE_INTEGER + 2,
  });
  expect(usage).toMatchObject({
    inputTokens: null,
    outputTokens: null,
    cacheHitTokens: null,
    cacheMissTokens: null,
    source: "unknown",
    inconsistent: false,
  });
  expect(normalizeUsage({})).toMatchObject({ source: "unknown", inputTokens: null, outputTokens: null });
});

it("keeps raw numbers but flags inconsistent cache accounting", () => {
  const usage = normalizeUsage({
    prompt_tokens: 1000,
    completion_tokens: 30,
    prompt_cache_hit_tokens: 800,
    prompt_cache_miss_tokens: 100,
  });
  expect(usage).toMatchObject({
    inputTokens: 1000,
    cacheHitTokens: 800,
    cacheMissTokens: 100,
    inconsistent: true,
    source: "provider",
  });
});

it("never adds reasoning tokens on top of output tokens", () => {
  const usage = normalizeUsage({
    prompt_tokens: 500,
    completion_tokens: 100,
    completion_tokens_details: { reasoning_tokens: 60 },
  });
  expect(usage.outputTokens).toBe(100);
  expect(usage.reasoningTokens).toBe(60);
});

it("reports partial usage as provider-sourced without inventing zeros", () => {
  const usage = normalizeUsage({ prompt_tokens: 12 });
  expect(usage).toMatchObject({
    inputTokens: 12,
    outputTokens: null,
    cacheHitTokens: null,
    cacheMissTokens: null,
    source: "provider",
    inconsistent: false,
  });
});
// end
