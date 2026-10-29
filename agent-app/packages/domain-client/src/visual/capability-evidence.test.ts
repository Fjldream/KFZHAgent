// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { evaluateCapabilityEvidence, type CapabilityEvidence } from "./capability-evidence.js";

const evidence: CapabilityEvidence = {
  id: "button-click-36", controlType: "button", properties: ["property:text", "style:root.fontSize"],
  interactions: ["click"], runtimeVersion: "3.6", status: "verified",
  artifactHash: "a".repeat(64), reportId: "runtime-report-1",
};
const request = {
  controlType: "button", properties: ["property:text"], interactions: ["click"],
  targetRuntimeVersion: "3.6", evidence: [evidence],
};

describe("visual capability evidence", () => {
  it("requires a single scoped report covering the complete requested surface", () => {
    expect(evaluateCapabilityEvidence(request)).toMatchObject({ support: "verified", evidenceIds: [evidence.id] });
    const split = [
      { ...evidence, id: "text-only", interactions: [] },
      { ...evidence, id: "click-only", properties: [] },
    ];
    expect(evaluateCapabilityEvidence({ ...request, evidence: split }).support).toBe("supported_unverified");
  });

  it.each([
    { runtimeVersion: "3.5" }, { controlType: "image" }, { properties: [] }, { interactions: [] },
    { artifactHash: null }, { artifactHash: "not-a-hash" }, { reportId: null }, { reportId: "" },
    { status: "failed" as const }, { status: "unverified" as const },
  ])("does not promote incomplete, failed or differently scoped evidence: %j", (change) => {
    expect(evaluateCapabilityEvidence({ ...request, evidence: [{ ...evidence, ...change }] }).support)
      .toBe("supported_unverified");
  });

  it("keeps a matching failure visible even alongside a positive report", () => {
    const result = evaluateCapabilityEvidence({ ...request, evidence: [evidence, { ...evidence, id: "failure", status: "failed" }] });
    expect(result.support).toBe("supported_unverified");
    expect(result.reason).toContain("失败");
    expect(result.evidenceIds).toEqual(["failure"]);
  });

  it("returns deterministic report identities and never mutates the evidence", () => {
    const reports = [evidence, { ...evidence, id: "aaa" }];
    expect(evaluateCapabilityEvidence({ ...request, evidence: reports }).evidenceIds).toEqual(["aaa", evidence.id]);
    expect(evaluateCapabilityEvidence({ ...request, evidence: [...reports].reverse() }))
      .toEqual(evaluateCapabilityEvidence({ ...request, evidence: reports }));
    expect(reports[0]).toBe(evidence);
  });
});
// end
