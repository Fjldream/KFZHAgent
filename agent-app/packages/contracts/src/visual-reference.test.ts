// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { VisualReferenceSpecSchema } from "./visual-reference.js";

const region = { id: "content", parentId: null, role: "content", box: { x: 0, y: 0, width: 1, height: 1 },
  text: ["工厂总览"], confidence: 0.9, interactionHint: null };
const valid = { schemaVersion: 1, sourceAssetId: "asset-1", sourceHash: "a".repeat(64),
  viewport: { width: 1440, height: 900 }, regions: [region],
  designTokens: { background: "#001122", foreground: "#ffffff", accent: "#00AACC", spacing: [8, 16], radius: [0, 8] }, uncertainties: [] };
describe("untrusted visual reference contract", () => {
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("accepts only a read-only current-workspace name requirement on text regions, never caller values or sources", () => {
    const dataRequirement = { kind: "workspace-field", field: "name" };
    const input = { ...valid, regions: [{ ...region, role: "text", dataRequirement }] };
    expect(VisualReferenceSpecSchema.parse(input)).toEqual(input);
    expect(VisualReferenceSpecSchema.parse(valid)).toEqual(valid);
    for (const requirement of [{ ...dataRequirement, value: "伪造名称" }, { ...dataRequirement, workspaceId: "other" },
      { ...dataRequirement, field: "credentials" }, { ...dataRequirement, kind: "http" }, { ...dataRequirement, endpoint: "https://example.invalid" }]) {
      expect(VisualReferenceSpecSchema.safeParse({ ...input, regions: [{ ...input.regions[0], dataRequirement: requirement }] }).success).toBe(false);
    }
    expect(VisualReferenceSpecSchema.safeParse({ ...input, regions: [{ ...input.regions[0], role: "action" }] }).success).toBe(false);
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("accepts only bounded literal click-feedback requirements on action regions without inventing old defaults", () => {
    const interactionRequirement = { kind: "click-feedback", message: "本地操作提示", level: "info" };
    const input = { ...valid, regions: [{ ...region, role: "action", interactionRequirement }] };
    expect(VisualReferenceSpecSchema.parse(input)).toEqual(input);
    expect(VisualReferenceSpecSchema.parse(valid)).toEqual(valid);
    for (const requirement of [{ ...interactionRequirement, message: " " }, { ...interactionRequirement, message: "x".repeat(401) },
      { ...interactionRequirement, kind: "http-request" }, { ...interactionRequirement, script: "arbitrary" },
      { ...interactionRequirement, message: "fetch('/secret')" }, { ...interactionRequirement, level: "fatal" }]) {
      expect(VisualReferenceSpecSchema.safeParse({ ...input, regions: [{ ...input.regions[0], interactionRequirement: requirement }] }).success).toBe(false);
    }
    expect(VisualReferenceSpecSchema.safeParse({ ...input, regions: [{ ...input.regions[0], role: "text" }] }).success).toBe(false);
  });
  // end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  it("preserves optional unverified clarification text without changing old structures or source confidence", () => {
    const input = { ...valid, regions: [{ ...region, clarifications: { interaction: "待核对交互", dataSource: "来源尚未知" } }] };
    expect(VisualReferenceSpecSchema.parse(input)).toEqual(input);
    expect(VisualReferenceSpecSchema.parse(valid)).toEqual(valid);
  });
  it("rejects execution, native, binding and resolution fields in clarification objects", () => {
    for (const field of ["nativeId", "resolved", "endpoint", "credentials", "bindings"]) {
      expect(VisualReferenceSpecSchema.safeParse({ ...valid, regions: [{ ...region,
        clarifications: { interaction: null, dataSource: null, [field]: "untrusted" } }] }).success).toBe(false);
    }
  });
  // end
  it("accepts normalized visual structure without execution or native configuration", () => {
    expect(VisualReferenceSpecSchema.parse(valid)).toEqual(valid);
  });
  it.each([
    { x: 0.9, y: 0, width: 0.2, height: 1 }, { x: 0, y: -0.1, width: 1, height: 1 },
    { x: 0, y: 0, width: 0, height: 1 }, { x: 0, y: 0, width: 1, height: Infinity },
  ])("rejects invalid normalized boxes %j", box => {
    expect(VisualReferenceSpecSchema.safeParse({ ...valid, regions: [{ ...region, box }] }).success).toBe(false);
  });
  it("rejects duplicate/unknown/self/cyclic parents and unknown uncertainty references", () => {
    for (const regions of [[region, region], [{ ...region, parentId: "absent" }], [{ ...region, parentId: region.id }],
      [{ ...region, id: "a", parentId: "b" }, { ...region, id: "b", parentId: "a" }]]) {
      expect(VisualReferenceSpecSchema.safeParse({ ...valid, regions }).success).toBe(false);
    }
    expect(VisualReferenceSpecSchema.safeParse({ ...valid, uncertainties: [{ regionId: "absent", question: "数据源？" }] }).success).toBe(false);
  });
  it("bounds region/text/token lists, pixel facts, colors and confidence", () => {
    const invalid = [
      { ...valid, regions: Array.from({ length: 101 }, (_, index) => ({ ...region, id: `r${index}` })) },
      { ...valid, regions: [{ ...region, text: ["x".repeat(2001)] }] },
      { ...valid, regions: [{ ...region, confidence: 1.1 }] },
      { ...valid, viewport: { width: 0, height: 900 } },
      { ...valid, designTokens: { ...valid.designTokens, accent: "url(javascript:alert(1))" } },
      { ...valid, designTokens: { ...valid.designTokens, spacing: [-1] } },
    ];
    for (const spec of invalid) expect(VisualReferenceSpecSchema.safeParse(spec).success).toBe(false);
  });
  it("rejects source URLs/paths and extra native/tool/execution authority at every level", () => {
    for (const sourceAssetId of ["https://example.invalid/a", "../file.png", "C:\\private.png", "data:image/png;base64,x"]) {
      expect(VisualReferenceSpecSchema.safeParse({ ...valid, sourceAssetId }).success).toBe(false);
    }
    for (const spec of [{ ...valid, tool: "shell" }, { ...valid, regions: [{ ...region, nativePath: "/tmp/x" }] },
      { ...valid, designTokens: { ...valid.designTokens, css: "position:fixed" } }]) {
      expect(VisualReferenceSpecSchema.safeParse(spec).success).toBe(false);
    }
  });
});
// end
