// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { isAllowedMutationOrigin } from "./mutation-origin.guard.js";

const allowed = ["https://agent.example", "http://localhost:5173"];

describe("isAllowedMutationOrigin", () => {
  it("accepts only exact configured origins", () => {
    expect(isAllowedMutationOrigin("https://agent.example", allowed)).toBe(true);
    expect(isAllowedMutationOrigin("http://localhost:5173", allowed)).toBe(true);
  });

  it("rejects missing, malformed and lookalike origins", () => {
    expect(isAllowedMutationOrigin(undefined, allowed)).toBe(false);
    expect(isAllowedMutationOrigin("", allowed)).toBe(false);
    expect(isAllowedMutationOrigin("https://evil.example", allowed)).toBe(false);
    expect(isAllowedMutationOrigin("not a url", allowed)).toBe(false);
    // 后缀/子域/端口不同都不算同一 origin
    expect(isAllowedMutationOrigin("https://agent.example.evil.com", allowed)).toBe(false);
    expect(isAllowedMutationOrigin("https://sub.agent.example", allowed)).toBe(false);
    expect(isAllowedMutationOrigin("https://agent.example:8443", allowed)).toBe(false);
  });

  it("normalizes case and default ports via URL parsing", () => {
    expect(isAllowedMutationOrigin("HTTPS://AGENT.EXAMPLE", allowed)).toBe(true);
    expect(isAllowedMutationOrigin("https://agent.example:443", allowed)).toBe(true);
  });
});
// end
