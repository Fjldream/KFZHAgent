// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalServerHash, CustomerSolutionBlueprintSchema, VisualPlanningContextSchema } from "@kf/contracts";
import { inspectVisualBlueprintOutput } from "./visual-blueprint-output.js";
import { inspectVisualBlueprintObservations, visualBlueprintObservationContract } from "./visual-blueprint-observations.js";

function sample(directory = "live-full-journey-binding") {
  const root = new URL(`../../../../tests/fixtures/energy-overview-20261023/${directory}/`, import.meta.url);
  const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, root), "utf8"));
  const reference = VisualPlanningContextSchema.parse({ ...(read("reference-review.json") as object), acceptedDifferences: read("accepted-differences.json") });
  return { reference, blueprint: CustomerSolutionBlueprintSchema.parse(read("blueprint.json")) };
}

describe("reviewed visual observation text", () => {
  it("rejects the exact real layout-description observation before independent approval without changing the proposal", () => {
    const { blueprint, reference } = sample(); const before = canonicalServerHash({ blueprint, reference });
    const result = inspectVisualBlueprintOutput(blueprint, reference);
    expect(result).toMatchObject({ ok: false, repairable: true, issues: [expect.objectContaining({
      code: "VISUAL_BLUEPRINT_OBSERVATION_TEXT_UNSUPPORTED", path: "journeys.0.steps.2.expectedTexts",
      blueprintPageId: "overview-page", blueprintRegionId: "content-shell", expectedTextIndexes: [0], availableTextRegionIds: [],
    })] });
    expect(canonicalServerHash({ blueprint, reference })).toBe(before);
  });

  it.each(["live-binding-node-metadata-success", "live-full-observations-success"])("retains the actual successful blueprint %s", directory => {
    const { blueprint, reference } = sample(directory);
    expect(inspectVisualBlueprintOutput(blueprint, reference)).toMatchObject({ ok: true, blueprint });
  });

  it("accepts only an explicitly reauthored proposal that preserves the layout intent and all reviewed source ownership", () => {
    const { blueprint, reference } = sample(); const before = canonicalServerHash(blueprint);
    const corrected = structuredClone(blueprint);
    const step = corrected.journeys[0]!.steps[2]!;
    if (step.kind !== "observe") throw new Error("observation fixture required");
    corrected.acceptanceScenarios.push(...step.expectedTexts);
    corrected.journeys[0]!.steps.splice(2, 1);
    expect(inspectVisualBlueprintOutput(corrected, reference)).toMatchObject({ ok: true });
    expect(corrected.pages).toEqual(blueprint.pages);
    expect(canonicalServerHash(blueprint)).toBe(before);
  });

  it("uses the authenticated regional field snapshot instead of stale OCR without accepting unrelated snapshot text", () => {
    const { blueprint, reference } = sample("live-binding-node-metadata-success");
    const source = reference.spec.regions.find(region => region.text.includes("能源管理系统"))!;
    source.dataRequirement = { kind: "workspace-field", field: "name" };
    reference.dataSnapshots = [{ regionId: source.id, kind: "workspace-field", field: "name", value: "当前审核工作区" }];
    const mapping = reference.mappings.find(item => item.regionId === source.id)!;
    mapping.capabilityId = "text"; mapping.controlType = "text";
    reference.acceptedDifferences.find(item => item.regionId === source.id)!.capabilityId = "text";
    reference.specHash = canonicalServerHash(reference.spec);
    const step = blueprint.journeys[0]!.steps[0]!;
    if (step.kind !== "observe") throw new Error("observation fixture required");
    step.expectedTexts[0] = "当前审核工作区";
    expect(inspectVisualBlueprintOutput(blueprint, reference)).toMatchObject({ ok: true });
    step.expectedTexts[0] = "能源管理系统";
    expect(inspectVisualBlueprintOutput(blueprint, reference)).toMatchObject({ ok: false, issues: [expect.objectContaining({
      code: "VISUAL_BLUEPRINT_OBSERVATION_TEXT_UNSUPPORTED", expectedTextIndexes: [0],
    })] });
  });

  it("does not normalize case, invent separators or compose text from different visual sources", () => {
    const { blueprint, reference } = sample("live-binding-node-metadata-success");
    const step = blueprint.journeys[0]!.steps.find(step => step.regionId === "kpi-cards")!;
    if (step.kind !== "observe") throw new Error("observation fixture required");
    step.expectedTexts = ["kwh", "今日用电量 12,480", "12,480kWh"];
    expect(inspectVisualBlueprintOutput(blueprint, reference)).toMatchObject({ ok: false, issues: [expect.objectContaining({
      code: "VISUAL_BLUEPRINT_OBSERVATION_TEXT_UNSUPPORTED", expectedTextIndexes: [0, 1, 2],
    })] });
  });

  it("does not borrow matching text from a different region or inherited descendants", () => {
    const { blueprint, reference } = sample();
    const step = blueprint.journeys[0]!.steps[2]!;
    if (step.kind !== "observe") throw new Error("observation fixture required");
    step.expectedTexts = ["能源管理系统", "今日用电量"];
    expect(inspectVisualBlueprintOutput(blueprint, reference)).toMatchObject({ ok: false, issues: [expect.objectContaining({
      code: "VISUAL_BLUEPRINT_OBSERVATION_TEXT_UNSUPPORTED", expectedTextIndexes: [0, 1], availableTextRegionIds: [],
    })] });
  });

  it("reports a missing regional source beside an independently invalid observation", () => {
    const { blueprint, reference } = sample();
    const header = blueprint.pages[0]!.regions[0]!; header.visualRegionIds = header.visualRegionIds!.filter(id => id !== "header-divider");
    const result = inspectVisualBlueprintOutput(blueprint, reference);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toEqual(expect.arrayContaining([
      { code: "VISUAL_BLUEPRINT_SOURCE_MISSING", regionIds: ["header-divider"] },
      expect.objectContaining({ code: "VISUAL_BLUEPRINT_OBSERVATION_TEXT_UNSUPPORTED", blueprintRegionId: "content-shell" }),
    ]));
  });

  it("requires explicit sources for an observation in the visual channel rather than trusting blueprint prose", () => {
    const { blueprint, reference } = sample();
    delete blueprint.pages[0]!.regions.find(region => region.id === "content-shell")!.visualRegionIds;
    const result = inspectVisualBlueprintOutput(blueprint, reference);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "VISUAL_BLUEPRINT_OBSERVATION_SOURCES_REQUIRED", blueprintRegionId: "content-shell" }),
    ]));
  });

  it("validates a good step even if another step is invalid and keeps untrusted text out of feedback", () => {
    const { blueprint, reference } = sample();
    const step = blueprint.journeys[0]!.steps[2]!;
    if (step.kind !== "observe") throw new Error("observation fixture required");
    step.expectedTexts = ["private-source-value-do-not-repeat"];
    const invalid = { ...blueprint, journeys: [{ ...blueprint.journeys[0], steps: [null, step] }] };
    const result = inspectVisualBlueprintOutput(invalid, reference);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues[0]?.code).toMatch(/^SCHEMA_/);
      expect(result.issues).toEqual(expect.arrayContaining([expect.objectContaining({ code: "VISUAL_BLUEPRINT_OBSERVATION_TEXT_UNSUPPORTED", path: "journeys.0.steps.1.expectedTexts" })]));
      expect(JSON.stringify(result.issues)).not.toContain("private-source-value-do-not-repeat");
      expect(result.issues.length).toBeLessThanOrEqual(8);
    }
  });

  it("bounds feedback groups, text indexes and known source IDs without echoing rejected values", () => {
    const { blueprint, reference } = sample();
    const source = reference.spec.regions.find(region => region.text.length > 0)!;
    reference.spec.regions = Array.from({ length: 25 }, (_, index) => ({ ...source, id: `bounded-${index}`, parentId: null, text: [`已审核文案${index}`] }));
    reference.spec.uncertainties = [];
    reference.specHash = canonicalServerHash(reference.spec);
    reference.mappings = reference.spec.regions.map(source => ({ regionId: source.id, controlType: "richtext", capabilityId: "richtext",
      support: "supported_unverified", reason: "测试已审核来源", evidenceIds: [], fallback: null }));
    reference.acceptedDifferences = reference.spec.regions.map(source => ({ regionId: source.id, disposition: "accept-unverified", capabilityId: "richtext", reason: "测试明确接受" }));
    const region = blueprint.pages[0]!.regions[0]!;
    region.visualRegionIds = reference.spec.regions.map(source => source.id);
    blueprint.pages = [{ ...blueprint.pages[0]!, regions: [region], readingOrder: [region.id] }];
    blueprint.journeys = [{ ...blueprint.journeys[0]!, steps: Array.from({ length: 6 }, () => ({ kind: "observe" as const,
      pageId: blueprint.pages[0]!.id, regionId: region.id, action: "阅读已审核内容", result: "看到文案", expectedTexts: Array.from({ length: 12 }, (_, index) => `private-rejected-${index}`) })) }];
    const before = canonicalServerHash({ blueprint, reference });
    const issues = inspectVisualBlueprintObservations(blueprint, reference);
    expect(issues).toHaveLength(4);
    for (const issue of issues) {
      expect(issue.expectedTextIndexes).toHaveLength(12);
      expect(issue.availableTextRegionIds).toHaveLength(20);
      expect(issue.availableTextRegionCount).toBe(25);
    }
    expect(JSON.stringify(issues)).not.toContain("private-rejected");
    expect(canonicalServerHash({ blueprint, reference })).toBe(before);
    expect(visualBlueprintObservationContract().textMatch).toBe("exact-item-or-source-space-join");
  });
});
// end
