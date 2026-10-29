// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { VisualReviewRevisionSchema } from "./visual-review-revision.js";

const editable = { role: "text", text: ["用户补充"], box: { x: 0.1, y: 0.1, width: 0.5, height: 0.2 } };
const base = { clientRequestId: "00000000-0000-4000-8000-000000000001", receipt: `vref1:${"a".repeat(64)}:${"b".repeat(64)}`,
  analysisId: "analysis", analysisHash: "c".repeat(64), regions: [] };
describe("bounded visual review structural corrections", () => {
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("accepts workspace-field selection and explicit clearing, without accepting resolved values or unsaved additions", () => {
    const requirement = { kind: "workspace-field", field: "name" };
    for (const dataRequirement of [requirement, null]) {
      const input = { ...base, regions: [{ ...editable, regionId: "content", dataRequirement }] };
      expect(VisualReviewRevisionSchema.parse(input)).toEqual(input);
    }
    expect(VisualReviewRevisionSchema.safeParse({ ...base, regions: [{ ...editable, regionId: "content", dataRequirement: { ...requirement, value: "forged" } }] }).success).toBe(false);
    expect(VisualReviewRevisionSchema.safeParse({ ...base, additions: [{ ...editable, dataRequirement: requirement }] }).success).toBe(false);
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("preserves explicit semantic feedback requirements, null clearing and absent legacy shapes", () => {
    for (const interactionRequirement of [{ kind: "click-feedback", message: "本地提示", level: "info" }, null]) {
      const input = { ...base, regions: [{ ...editable, regionId: "action", role: "action", interactionRequirement }] };
      expect(VisualReviewRevisionSchema.parse(input)).toEqual(input);
    }
    const old = { ...base, regions: [{ ...editable, regionId: "content" }] };
    expect(VisualReviewRevisionSchema.parse(old)).toEqual(old);
    expect(VisualReviewRevisionSchema.safeParse({ ...base, additions: [{ ...editable,
      interactionRequirement: { kind: "click-feedback", message: "本地提示", level: "info" } }] }).success).toBe(false);
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("accepts bounded clarification text and explicit clearing without injecting defaults into old corrections", () => {
    for (const clarifications of [{ interaction: "仅作为补充说明", dataSource: "数据来源待确认" }, { interaction: null, dataSource: null }]) {
      const input = { ...base, regions: [{ ...editable, regionId: "content", clarifications }] };
      expect(VisualReviewRevisionSchema.parse(input)).toEqual(input);
    }
    const old = { ...base, regions: [{ ...editable, regionId: "content" }] };
    expect(VisualReviewRevisionSchema.parse(old)).toEqual(old);
  });
  it("rejects empty/oversized notes, resolution flags, endpoint/credential/native fields and notes on unsaved additions", () => {
    for (const clarifications of [
      { interaction: "", dataSource: null }, { interaction: " ", dataSource: null }, { interaction: "x".repeat(1001), dataSource: null },
      { interaction: null, dataSource: null, resolved: true }, { interaction: null, dataSource: null, endpoint: "https://example.invalid" },
      { interaction: null, dataSource: null, credentials: "secret" }, { interaction: null, dataSource: null, nativeId: "native" },
    ]) expect(VisualReviewRevisionSchema.safeParse({ ...base, regions: [{ ...editable, regionId: "content", clarifications }] }).success).toBe(false);
    expect(VisualReviewRevisionSchema.safeParse({ ...base, additions: [{ ...editable, clarifications: { interaction: "new", dataSource: null } }] }).success).toBe(false);
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("accepts an explicit same-analysis parent or root while preserving the shape of absent parent corrections", () => {
    for (const parentId of ["heading", null]) {
      const input = { ...base, regions: [{ ...editable, regionId: "child", parentId }] };
      expect(VisualReviewRevisionSchema.parse(input)).toEqual(input);
    }
    const old = { ...base, regions: [{ ...editable, regionId: "child" }] };
    expect(VisualReviewRevisionSchema.parse(old)).toEqual(old);
    expect(VisualReviewRevisionSchema.parse(old).regions[0]).not.toHaveProperty("parentId");
  });
  it("rejects malformed parent identities and authority smuggling on hierarchy corrections", () => {
    for (const parentId of ["", "../region", "https://example.invalid", 42]) {
      expect(VisualReviewRevisionSchema.safeParse({ ...base, regions: [{ ...editable, regionId: "child", parentId }] }).success).toBe(false);
    }
    expect(VisualReviewRevisionSchema.safeParse({ ...base, regions: [{ ...editable, regionId: "child", parentId: null, nativeId: "native" }] }).success).toBe(false);
  });
  // end
  it("accepts add-only, remove-only and mixed corrections without changing the old update-only shape", () => {
    for (const body of [{ ...base, additions: [editable] }, { ...base, removals: ["heading"] },
      { ...base, regions: [{ ...editable, regionId: "heading" }], additions: [editable], removals: ["noise"] }]) {
      expect(VisualReviewRevisionSchema.parse(body)).toEqual(body);
    }
    const old = { ...base, regions: [{ ...editable, regionId: "heading" }] };
    expect(VisualReviewRevisionSchema.parse(old)).toEqual(old);
  });
  it.each(["id", "regionId", "parentId", "confidence", "interactionHint", "nativeId"])("rejects caller authority field %s on additions", field => {
    expect(VisualReviewRevisionSchema.safeParse({ ...base, additions: [{ ...editable, [field]: "invented" }] }).success).toBe(false);
  });
  it("rejects empty, duplicate, conflicting, unknown and over-limit operations", () => {
    for (const input of [base, { ...base, removals: [] }, { ...base, additions: [] }, { ...base, removals: ["x", "x"] },
      { ...base, regions: [{ ...editable, regionId: "x" }], removals: ["x"] }, { ...base, operations: [{ type: "native" }] },
      { ...base, additions: Array.from({ length: 100 }, () => editable), removals: ["x"] }]) {
      expect(VisualReviewRevisionSchema.safeParse(input).success).toBe(false);
    }
  });
  it("enforces normalized boxes, text bounds and the same UTF-8 bound for additions", () => {
    for (const addition of [{ ...editable, box: { x: 0.9, y: 0, width: 1, height: 1 } },
      { ...editable, text: ["x".repeat(2001)] }, { ...editable, text: Array.from({ length: 20 }, () => "中".repeat(1100)) }]) {
      expect(VisualReviewRevisionSchema.safeParse({ ...base, additions: [addition] }).success).toBe(false);
    }
  });
});
// end
