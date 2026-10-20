// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { describe, expect, it } from "vitest";
import {
  CONTEXT_BUDGET_EXCEEDED,
  buildContext,
  type ContextMessage,
  type ConversationMemory,
} from "./context-builder.js";

const memory = (overrides: Partial<ConversationMemory> = {}): ConversationMemory => ({
  schemaVersion: 1,
  throughMessageId: "m2",
  requirements: ["需要一个设备总览页"],
  acceptedDecisions: ["已确认蓝色主题"],
  openQuestions: [],
  baseRevisionId: "r1",
  generatedAt: "2026-10-20T00:00:00.000Z",
  ...overrides,
});

const msg = (id: string, role: "user" | "assistant", content: string): ContextMessage => ({ id, role, content });

describe("buildContext budget", () => {
  it("drops the oldest messages but keeps the current instruction and recent history", () => {
    const result = buildContext({
      messages: [msg("m1", "user", "x".repeat(5000)), msg("m2", "assistant", "已确认蓝色主题")],
      memory: null,
      baseRevisionId: "r1",
      instruction: "只修改表头",
      budgetTokens: 1000,
    });

    expect(result.droppedMessageIds).toContain("m1");
    expect(result.history.some((message) => message.content === "已确认蓝色主题")).toBe(true);
    expect(result.estimatedTokens).toBeLessThanOrEqual(1000);
    expect(result.estimateKind).toBe("upper_bound");
  });

  it("refuses to run when the mandatory content alone exceeds the budget", () => {
    expect(() => buildContext({
      messages: [],
      memory: null,
      baseRevisionId: "r1",
      instruction: "x".repeat(4000),
      budgetTokens: 500,
    })).toThrow(CONTEXT_BUDGET_EXCEEDED);
  });

  it("counts multi-byte text by UTF-8 bytes, not characters", () => {
    const ascii = buildContext({ messages: [msg("m1", "user", "a".repeat(300))], memory: null,
      baseRevisionId: "r1", instruction: "", budgetTokens: 10_000 });
    const chinese = buildContext({ messages: [msg("m1", "user", "中".repeat(300))], memory: null,
      baseRevisionId: "r1", instruction: "", budgetTokens: 10_000 });
    expect(chinese.estimatedTokens).toBeGreaterThan(ascii.estimatedTokens);
  });

  it("returns an empty history for an empty conversation", () => {
    const result = buildContext({ messages: [], memory: null, baseRevisionId: "r1", instruction: "hi", budgetTokens: 1000 });
    expect(result.history).toEqual([]);
    expect(result.memoryText).toBeNull();
    expect(result.droppedMessageIds).toEqual([]);
  });
});

describe("buildContext memory", () => {
  it("injects memory only when it was generated against the current base revision", () => {
    const valid = buildContext({ messages: [], memory: memory(), baseRevisionId: "r1",
      instruction: "继续", budgetTokens: 1000 });
    expect(valid.memoryText).toContain("已确认蓝色主题");
    expect(valid.memoryText).toContain("设备总览页");

    const stale = buildContext({ messages: [], memory: memory({ baseRevisionId: "r0" }), baseRevisionId: "r1",
      instruction: "继续", budgetTokens: 1000 });
    expect(stale.memoryText).toBeNull();
    expect(stale.estimatedTokens).toBeLessThan(valid.estimatedTokens);
  });

  it("ignores memory with an unknown schema version instead of guessing", () => {
    const result = buildContext({ messages: [], memory: { ...memory(), schemaVersion: 2 as unknown as 1 },
      baseRevisionId: "r1", instruction: "继续", budgetTokens: 1000 });
    expect(result.memoryText).toBeNull();
  });

  it("keeps repair stacks and build logs out of long-term memory text", () => {
    const result = buildContext({ messages: [], memory: memory(), baseRevisionId: "r1",
      instruction: "继续", budgetTokens: 1000 });
    expect(result.memoryText).not.toContain("Error:");
    expect(result.memoryText).not.toContain("stack");
  });
});
// end
