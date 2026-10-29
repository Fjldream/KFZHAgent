// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { canonicalServerHash, resolveVisualBlueprintSources } from "@kf/contracts";
import { approvedEnergyVisualBlueprint } from "../../../../tests/helpers/visual-blueprint-sources.js";
import { getDesignKnowledgeSnapshot } from "../design-knowledge/design-knowledge-catalog.js";
import { retrieveCapabilities } from "./capability-retrieval.js";
import { getVisualCapabilitySurface } from "../design-knowledge/design-knowledge-catalog.js";
import { listControlCapabilities } from "../style/control-capability-registry.js";
import { readFileSync } from "node:fs";
import { CustomerSolutionBlueprintSchema, VisualPlanningContextSchema } from "@kf/contracts";

describe("reviewed visual blueprint source candidates", () => {
  it("advertises details only for final selected candidates after reviewed controls displace provisional minimum reservations", () => {
    const directory = new URL("../../../../tests/fixtures/energy-overview-20261023/live-detail-reservation/", import.meta.url);
    const read = (name: string): unknown => JSON.parse(readFileSync(new URL(name, directory), "utf8")) as unknown;
    const blueprint = CustomerSolutionBlueprintSchema.parse(read("blueprint.json"));
    const visualReference = VisualPlanningContextSchema.parse({ ...(read("reference-review.json") as Record<string, unknown>), acceptedDifferences: read("accepted-differences.json") });
    const input = { blueprint, visualReference, knowledge: getDesignKnowledgeSnapshot() };
    const bundle = retrieveCapabilities(input);
    const advertised = [...new Set(bundle.regions.flatMap(region => [...region.controls, ...region.layouts]).map(candidate => candidate.id))].sort();
    expect(advertised).not.toContain("easyui.18");
    expect(bundle.detailedCapabilityIds).toEqual(advertised);
    expect(bundle.detailedCapabilityIds).toHaveLength(14);
    expect(bundle.regions.every(region => region.controls.length <= 5 && region.layouts.length <= 3)).toBe(true);
    expect(retrieveCapabilities(input)).toEqual(bundle);
  });
  it("reserves the approved sidebar button and rich text in their exact confirmed groups", () => {
    const { blueprint, visual } = approvedEnergyVisualBlueprint();
    const input = { blueprint, knowledge: getDesignKnowledgeSnapshot(), visualReference: visual };
    const bundle = retrieveCapabilities(input);
    expect(bundle.regions.find((region) => region.regionId === "sideNav")!.controls.map((item) => item.id)).toContain("button");
    expect(bundle.regions.find((region) => region.regionId === "appHeader")!.controls.map((item) => item.id)).toContain("richtext");
    expect(bundle.blueprintHash).toBe(canonicalServerHash(blueprint));
    expect(canonicalServerHash(retrieveCapabilities(input))).toBe(canonicalServerHash(bundle));
    expect(bundle.detailedCapabilityIds.length).toBeLessThanOrEqual(25);
  });
  it("does not add visual capabilities to an unrelated region", () => {
    const { blueprint, visual } = approvedEnergyVisualBlueprint();
    const bundle = retrieveCapabilities({ blueprint, knowledge: getDesignKnowledgeSnapshot(), visualReference: visual });
    const legacy = structuredClone(blueprint);
    legacy.pages.forEach((page) => page.regions.forEach((region) => { delete region.visualRegionIds; }));
    const baseline = retrieveCapabilities({ blueprint: legacy, knowledge: getDesignKnowledgeSnapshot() });
    const originalIds = new Set(baseline.regions.find((region) => region.regionId === "pageFootnote")!.controls.map((item) => item.id));
    const added = bundle.regions.find((region) => region.regionId === "pageFootnote")!.controls.filter((item) => !originalIds.has(item.id)).map((item) => item.id);
    expect(added.every((id) => id === "richtext")).toBe(true);
  });
  it("does not silently ignore confirmed source IDs without the matching reviewed context", () => {
    const { blueprint } = approvedEnergyVisualBlueprint();
    expect(() => retrieveCapabilities({ blueprint, knowledge: getDesignKnowledgeSnapshot() })).toThrow("VISUAL_BLUEPRINT_CONTEXT_REQUIRED");
  });
  it.each(["unknown", "duplicate", "missing", "omitted"])("rejects invalid approved associations: %s", (failure) => {
    const { blueprint, visual } = approvedEnergyVisualBlueprint();
    const first = blueprint.pages[0]!.regions[0]!;
    if (failure === "unknown") first.visualRegionIds!.push("not-a-reviewed-region");
    if (failure === "duplicate") blueprint.pages[0]!.regions[1]!.visualRegionIds!.push(first.visualRegionIds![0]!);
    if (failure === "missing") first.visualRegionIds!.pop();
    if (failure === "omitted") visual.acceptedDifferences = [...visual.acceptedDifferences.filter((item) => item.regionId !== first.visualRegionIds![0]),
      { regionId: first.visualRegionIds![0]!, disposition: "omit", capabilityId: null, reason: "测试明确省略" }];
    expect(() => resolveVisualBlueprintSources(blueprint, visual, true)).toThrow("VISUAL_BLUEPRINT_SOURCE_");
  });
  it.each(["hash", "unaccepted", "wrong-accepted-capability", "mapping-duplicate"])("rejects inconsistent reviewed input: %s", (failure) => {
    const { blueprint, visual } = approvedEnergyVisualBlueprint();
    if (failure === "hash") visual.specHash = "0".repeat(64);
    if (failure === "unaccepted") visual.acceptedDifferences = [];
    if (failure === "wrong-accepted-capability") visual.acceptedDifferences[0]!.capabilityId = "text";
    if (failure === "mapping-duplicate") visual.mappings.push(visual.mappings[0]!);
    expect(() => resolveVisualBlueprintSources(blueprint, visual, true)).toThrow("VISUAL_BLUEPRINT_");
  });
  it("rejects an over-broad approved group rather than raising the five-control limit or dropping accepted controls", () => {
    const { blueprint, visual } = approvedEnergyVisualBlueprint();
    const caps = listControlCapabilities().filter((cap) => cap.category !== "layout" && getVisualCapabilitySurface(cap.id)?.eligible === true).slice(0, 6);
    expect(caps).toHaveLength(6);
    visual.spec.regions = caps.map((_, index) => ({ ...visual.spec.regions[0]!, id: `approved-${index}`, parentId: null }));
    visual.spec.uncertainties = [];
    visual.specHash = canonicalServerHash(visual.spec);
    visual.mappings = caps.map((cap, index) => ({ regionId: `approved-${index}`, controlType: cap.id, capabilityId: cap.id, support: "supported_unverified", reason: "测试明确接受", evidenceIds: [], fallback: null }));
    visual.acceptedDifferences = caps.map((cap, index) => ({ regionId: `approved-${index}`, disposition: "accept-unverified", capabilityId: cap.id, reason: "测试明确接受" }));
    blueprint.pages.forEach((page) => page.regions.forEach((region) => { delete region.visualRegionIds; }));
    blueprint.pages[0]!.regions[0]!.visualRegionIds = visual.spec.regions.map((region) => region.id);
    expect(() => retrieveCapabilities({ blueprint, visualReference: visual, knowledge: getDesignKnowledgeSnapshot() })).toThrow("VISUAL_BLUEPRINT_REGION_TOO_BROAD");
  });
});
// end
