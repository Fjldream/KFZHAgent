import { describe, expect, it } from "vitest";
import { CapabilityCandidateBundleSchema } from "./capability-candidates.js";

const candidate = {
  id: "control-primary",
  score: 87.5,
  reasons: ["Matches the region's structured record-selection need."],
  limitations: ["Requires enough horizontal space for visible columns."],
  knowledgeVersion: "1.2.3",
} as const;

const bundleFixture = {
  schema: "kf-capability-candidates/v1",
  knowledgeCatalogVersion: "1.2.3",
  blueprintHash: "a".repeat(64),
  regions: [{
    pageId: "workspace",
    regionId: "record-list",
    controls: [candidate, { ...candidate, id: "control-secondary" }, { ...candidate, id: "control-tertiary" }],
    layouts: [{ ...candidate, id: "layout-table" }],
    recipes: [{ ...candidate, id: "recipe-record-workspace" }],
  }],
  detailedCapabilityIds: ["control-primary", "control-secondary", "control-tertiary", "layout-table"],
  generatedAtPolicy: "deterministic-no-timestamp",
} as const;

describe("CapabilityCandidateBundleSchema", () => {
  it("accepts bounded ranked candidates linked to detailed control and layout profiles", () => {
    const parsed = CapabilityCandidateBundleSchema.parse(bundleFixture);

    expect(parsed.regions[0]?.controls).toHaveLength(3);
    expect(parsed.regions[0]?.layouts.length).toBeGreaterThanOrEqual(1);
    expect(parsed.detailedCapabilityIds.length).toBeLessThanOrEqual(25);
  });

  it("enforces the lower and upper candidate and detail bounds", () => {
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      regions: [{ ...bundleFixture.regions[0], controls: [] }],
    }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      regions: [{ ...bundleFixture.regions[0], controls: [
        ...bundleFixture.regions[0].controls,
        { ...candidate, id: "control-fourth" },
        { ...candidate, id: "control-fifth" },
        { ...candidate, id: "control-sixth" },
      ] }],
    }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      regions: [{ ...bundleFixture.regions[0], layouts: [] }],
    }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      regions: [{ ...bundleFixture.regions[0], layouts: [
        { ...candidate, id: "layout-one" },
        { ...candidate, id: "layout-two" },
        { ...candidate, id: "layout-three" },
        { ...candidate, id: "layout-four" },
      ] }],
    }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      regions: [{ ...bundleFixture.regions[0], recipes: [] }],
    }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      regions: [{ ...bundleFixture.regions[0], recipes: [
        { ...candidate, id: "recipe-one" },
        { ...candidate, id: "recipe-two" },
        { ...candidate, id: "recipe-three" },
        { ...candidate, id: "recipe-four" },
      ] }],
    }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      detailedCapabilityIds: [],
    }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      detailedCapabilityIds: Array.from({ length: 26 }, (_, index) => `capability-${index}`),
    }).success).toBe(false);
  });

  it("rejects duplicate page-region pairs and candidates in a category", () => {
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      regions: [...bundleFixture.regions, bundleFixture.regions[0]],
    }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      regions: [{ ...bundleFixture.regions[0], controls: [candidate, candidate, { ...candidate, id: "control-tertiary" }] }],
    }).success).toBe(false);
  });

  it("requires sorted unique detailed IDs and membership for control and layout candidates", () => {
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      detailedCapabilityIds: ["layout-table", "control-primary", "control-secondary", "control-tertiary"],
    }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      detailedCapabilityIds: ["control-primary", "control-primary", "control-tertiary", "layout-table"],
    }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      detailedCapabilityIds: ["control-primary", "control-secondary", "control-tertiary"],
    }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      detailedCapabilityIds: ["control-primary", "control-secondary", "control-tertiary", "layout-table", "recipe-record-workspace"],
    }).success).toBe(true);
  });

  it("rejects undeclared implementation fields and invalid ranked candidate values", () => {
    expect(CapabilityCandidateBundleSchema.safeParse({ ...bundleFixture, css: "body { color: red; }" }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      regions: [{ ...bundleFixture.regions[0], controls: [
        { ...candidate, score: 1000.1 },
        { ...candidate, id: "control-secondary" },
        { ...candidate, id: "control-tertiary" },
      ] }],
    }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      regions: [{ ...bundleFixture.regions[0], controls: [
        { ...candidate, knowledgeVersion: "v1.2.3" },
        { ...candidate, id: "control-secondary" },
        { ...candidate, id: "control-tertiary" },
      ] }],
    }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({ ...bundleFixture, blueprintHash: "A".repeat(64) }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({ ...bundleFixture, schema: "kf-capability-candidates/v2" }).success).toBe(false);
  });
});
