import { describe, expect, it } from "vitest";
import { ClassifyIntentResultSchema, intentValues } from "./intent.js";

describe("intent schema v2", () => {
  it("adds CLARIFY to the intent enum", () => {
    expect(intentValues).toContain("CLARIFY");
  });
  it("accepts a clarifying question with options (≤5)", () => {
    const ok = ClassifyIntentResultSchema.safeParse({
      intent: "CLARIFY",
      requestedDomains: ["kingclient"],
      needsClarification: true,
      clarifyingQuestion: { question: "主题是哪种？", options: ["①生产监控", "②设备状态", "③能源管理"] },
    });
    expect(ok.success).toBe(true);
  });
  it("rejects CLARIFY without a clarifyingQuestion", () => {
    const bad = ClassifyIntentResultSchema.safeParse({
      intent: "CLARIFY",
      requestedDomains: ["kingclient"],
    });
    expect(bad.success).toBe(false);
  });
  it("rejects clarifyingQuestion when intent is not CLARIFY", () => {
    const bad = ClassifyIntentResultSchema.safeParse({
      intent: "NEW_REQUIREMENT",
      requestedDomains: ["kingclient"],
      clarifyingQuestion: { question: "?" },
    });
    expect(bad.success).toBe(false);
  });
  it("accepts exactly 5 options (upper bound)", () => {
    const ok = ClassifyIntentResultSchema.safeParse({
      intent: "CLARIFY",
      requestedDomains: ["kingclient"],
      clarifyingQuestion: { question: "?", options: ["1", "2", "3", "4", "5"] },
    });
    expect(ok.success).toBe(true);
  });
  it("accepts a clarifying question without options", () => {
    const ok = ClassifyIntentResultSchema.safeParse({
      intent: "CLARIFY",
      requestedDomains: ["kingclient"],
      clarifyingQuestion: { question: "请补充主题" },
    });
    expect(ok.success).toBe(true);
  });
  it("rejects >5 options", () => {
    const bad = ClassifyIntentResultSchema.safeParse({
      intent: "CLARIFY",
      requestedDomains: ["kingclient"],
      clarifyingQuestion: { question: "?", options: ["1", "2", "3", "4", "5", "6"] },
    });
    expect(bad.success).toBe(false);
  });
});
