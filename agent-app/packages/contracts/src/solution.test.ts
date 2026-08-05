import { describe, expect, it } from "vitest";
import { solutionIdSchema, solutionIRSchema } from "./solution.js";
import type { SolutionIR } from "./solution.js";

const validIRInput = {
  schema: "kf-solution-ir/v1",
  solutionId: "solution-1",
  displayName: "示例方案",
  projects: [{ id: "p1", name: "客户端", domain: "kingclient" }],
  dependencies: [{ from: "p1", to: "p2" }],
  pendingRequirements: [{ text: "需要告警工程", requestedDomains: ["kingalarm"] }]
};

describe("solutionIRSchema", () => {
  it("parses a valid solution IR with a branded solution id", () => {
    const ir = solutionIRSchema.parse(validIRInput);
    expect(ir.solutionId).toBe("solution-1");
  });

  it("parse output is directly assignable to SolutionIR without a cast", () => {
    // 编译期验证：tsc 若 parse 输出不可赋值给 SolutionIR 此处会报错。
    const ir: SolutionIR = solutionIRSchema.parse(validIRInput);
    expect(ir.schema).toBe("kf-solution-ir/v1");
    expect(ir.projects[0]?.domain).toBe("kingclient");
  });

  it("rejects an empty solution id", () => {
    expect(() => solutionIRSchema.parse({ ...validIRInput, solutionId: "" })).toThrow(
      "solution id is required"
    );
  });

  it("rejects a blank solution id", () => {
    expect(() => solutionIRSchema.parse({ ...validIRInput, solutionId: "   " })).toThrow(
      "solution id is required"
    );
  });
});

describe("solutionIdSchema", () => {
  it("outputs a branded SolutionId", () => {
    const id = solutionIdSchema.parse("solution-1");
    expect(id).toBe("solution-1");
  });

  it("rejects an empty value", () => {
    expect(() => solutionIdSchema.parse("")).toThrow("solution id is required");
  });
});
