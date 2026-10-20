// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json.js";
import { buildTaskPrompt } from "./task-prompts.js";

describe("canonicalJson", () => {
  it("sorts object keys recursively and keeps array order", () => {
    expect(canonicalJson({ b: 2, a: { d: 4, c: 3 }, list: [2, 1] }))
      .toBe(canonicalJson({ list: [2, 1], a: { c: 3, d: 4 }, b: 2 }));
    expect(canonicalJson({ list: [2, 1] })).toBe("{\"list\":[2,1]}");
  });

  it("drops undefined members instead of emitting null", () => {
    expect(canonicalJson({ a: 1, b: undefined })).toBe("{\"a\":1}");
  });
});

describe("buildTaskPrompt", () => {
  const base = {
    task: "repair" as const,
    schemaVersion: "1",
    capabilityPack: { b: 2, a: 1 },
    history: [],
  };

  it("keeps the stable prefix identical when only the dynamic input changes", () => {
    const first = buildTaskPrompt({ ...base, instruction: "fix A", repairFeedback: "E1" });
    const second = buildTaskPrompt({ ...base, capabilityPack: { a: 1, b: 2 }, instruction: "fix B", repairFeedback: "E2" });

    expect(first.messages[0]).toEqual(second.messages[0]);
    expect(first.prefixHash).toBe(second.prefixHash);
    expect(first.promptVersion).toBe(second.promptVersion);
    expect(first.messages.at(-1)).not.toEqual(second.messages.at(-1));
  });

  it("changes the prefix hash when schema or capability pack changes", () => {
    const basePrompt = buildTaskPrompt({ ...base, instruction: "x" });
    expect(buildTaskPrompt({ ...base, schemaVersion: "2", instruction: "x" }).prefixHash)
      .not.toBe(basePrompt.prefixHash);
    expect(buildTaskPrompt({ ...base, capabilityPack: { a: 1 }, instruction: "x" }).prefixHash)
      .not.toBe(basePrompt.prefixHash);
  });

  it("keeps history order and roles between the system prefix and the instruction", () => {
    const built = buildTaskPrompt({
      ...base,
      task: "implementation",
      history: [
        { role: "user", content: "上一轮需求" },
        { role: "assistant", content: "上一轮答复" },
      ],
      instruction: "本轮指令",
    });
    expect(built.messages.map((message) => message.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(built.messages[1]?.content).toBe("上一轮需求");
    expect(built.messages[3]?.content).toBe("本轮指令");
  });

  it("does not leak a capability registry into the intent prompt", () => {
    const built = buildTaskPrompt({ task: "intent", schemaVersion: "1", instruction: "用户想做什么" });
    const serialized = JSON.stringify(built.messages);
    expect(serialized).not.toContain("capabilityRegistry");
    expect(serialized).not.toContain("controlRegistry");
    expect(built.messages).toHaveLength(2);
  });

  it("keeps the caller-provided system prompt byte-identical for equivalence rollout", () => {
    const systemPrompt = "既有 SYSTEM_PROMPT 原文";
    const built = buildTaskPrompt({ ...base, systemPrompt, instruction: "原始用户提示" });
    expect(built.messages[0]).toEqual({ role: "system", content: systemPrompt });
    expect(built.messages.at(-1)).toEqual({ role: "user", content: "原始用户提示" });
  });
});
// end
