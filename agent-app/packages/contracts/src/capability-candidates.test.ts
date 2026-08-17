import { describe, expect, it } from "vitest";
import { CapabilityCandidateBundleSchema } from "./capability-candidates.js";

const sorted = (ids: readonly string[]): string[] => [...ids].sort((left, right) => (left < right ? -1 : left > right ? 1 : 0));

function candidate(id: string) {
  return {
    id,
    score: 87.5,
    reasons: ["Matches the region's structured record-selection need."],
    limitations: ["Requires enough horizontal space for visible columns."],
    knowledgeVersion: "1.2.3",
  };
}

function region(options: {
  pageId?: string;
  regionId?: string;
  controls?: readonly string[];
  layouts?: readonly string[];
  recipes?: readonly string[];
} = {}) {
  return {
    pageId: options.pageId ?? "workspace",
    regionId: options.regionId ?? "record-list",
    controls: (options.controls ?? ["button", "easyui.1", "easyui.2"]).map(candidate),
    layouts: (options.layouts ?? ["layout.2"]).map(candidate),
    recipes: (options.recipes ?? ["recipe.filtered-workspace"]).map(candidate),
  };
}

function detailsFor(regions: readonly ReturnType<typeof region>[]): string[] {
  return sorted([...new Set(regions.flatMap((entry) => [
    ...entry.controls.map((item) => item.id),
    ...entry.layouts.map((item) => item.id),
  ]))]);
}

function detailsAtSize(requiredIds: readonly string[], size: number): string[] {
  const details = new Set(requiredIds);
  let index = 0;
  while (details.size < size) {
    details.add(`capability.${String(index).padStart(2, "0")}`);
    index += 1;
  }
  return sorted([...details]);
}

function bundle(regions: readonly ReturnType<typeof region>[], detailedCapabilityIds = detailsFor(regions)) {
  return {
    schema: "kf-capability-candidates/v1" as const,
    knowledgeCatalogVersion: "1.2.3",
    blueprintHash: "a".repeat(64),
    regions,
    detailedCapabilityIds,
    generatedAtPolicy: "deterministic-no-timestamp" as const,
  };
}

const bundleFixture = bundle([region()]);

describe("CapabilityCandidateBundleSchema", () => {
  it("accepts real Phase 1 dotted capability IDs while keeping blueprint IDs separate", () => {
    expect(CapabilityCandidateBundleSchema.safeParse(bundleFixture).success).toBe(true);
    expect(CapabilityCandidateBundleSchema.safeParse(bundle([region({ pageId: "workspace.1" })])).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse(bundle([region({ regionId: "record.list" })])).success).toBe(false);
  });

  it("enforces lower candidate and detail bounds", () => {
    expect(CapabilityCandidateBundleSchema.safeParse(bundle([region({ controls: [] })])).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse(bundle([region({ layouts: [] })])).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse(bundle([region({ recipes: [] })])).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse(bundle([region()], [])).success).toBe(false);
  });

  it("accepts every candidate maximum and rejects one over with valid details", () => {
    const controlsAtMax = region({ controls: ["button", "easyui.1", "easyui.2", "easyui.3", "easyui.4"] });
    const controlsOneOver = region({ controls: ["button", "easyui.1", "easyui.2", "easyui.3", "easyui.4", "easyui.5"] });
    expect(CapabilityCandidateBundleSchema.safeParse(bundle([controlsAtMax]))).toMatchObject({ success: true });
    expect(CapabilityCandidateBundleSchema.safeParse(bundle([controlsOneOver]))).toMatchObject({ success: false });

    const layoutsAtMax = region({ layouts: ["layout.2", "layout.3", "layout.4"] });
    const layoutsOneOver = region({ layouts: ["layout.2", "layout.3", "layout.4", "layout.5"] });
    expect(CapabilityCandidateBundleSchema.safeParse(bundle([layoutsAtMax]))).toMatchObject({ success: true });
    expect(CapabilityCandidateBundleSchema.safeParse(bundle([layoutsOneOver]))).toMatchObject({ success: false });

    const recipesAtMax = region({ recipes: ["recipe.filtered-workspace", "recipe.summary", "recipe.detail"] });
    const recipesOneOver = region({ recipes: ["recipe.filtered-workspace", "recipe.summary", "recipe.detail", "recipe.chart"] });
    expect(CapabilityCandidateBundleSchema.safeParse(bundle([recipesAtMax]))).toMatchObject({ success: true });
    expect(CapabilityCandidateBundleSchema.safeParse(bundle([recipesOneOver]))).toMatchObject({ success: false });
  });

  it("accepts 25 sorted detailed IDs and rejects 26 while retaining every required profile", () => {
    const required = detailsFor(bundleFixture.regions);
    expect(CapabilityCandidateBundleSchema.safeParse(bundle(bundleFixture.regions, detailsAtSize(required, 25))).success).toBe(true);
    expect(CapabilityCandidateBundleSchema.safeParse(bundle(bundleFixture.regions, detailsAtSize(required, 26))).success).toBe(false);
  });

  it("accepts 96 unique page-region pairs and rejects 97", () => {
    const regionsAtMax = Array.from({ length: 96 }, (_, index) => region({ pageId: `page-${index}`, regionId: `region-${index}` }));
    const regionsOneOver = Array.from({ length: 97 }, (_, index) => region({ pageId: `page-${index}`, regionId: `region-${index}` }));
    expect(CapabilityCandidateBundleSchema.safeParse(bundle(regionsAtMax)).success).toBe(true);
    expect(CapabilityCandidateBundleSchema.safeParse(bundle(regionsOneOver)).success).toBe(false);
  });

  it("rejects duplicate page-region pairs and candidates in a category", () => {
    expect(CapabilityCandidateBundleSchema.safeParse(bundle([region(), region()])).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse(bundle([region({ controls: ["button", "button", "easyui.1"] })])).success).toBe(false);
  });

  it("requires sorted unique detailed IDs and membership for controls and layouts but not recipes", () => {
    expect(CapabilityCandidateBundleSchema.safeParse(bundle(bundleFixture.regions, ["layout.2", "button", "easyui.1", "easyui.2"])).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse(bundle(bundleFixture.regions, ["button", "easyui.1", "easyui.1", "layout.2"])).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse(bundle(bundleFixture.regions, ["button", "easyui.1", "easyui.2"])).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse(bundleFixture).success).toBe(true);
  });

  it("rejects undeclared implementation fields and invalid ranked candidate values", () => {
    expect(CapabilityCandidateBundleSchema.safeParse({ ...bundleFixture, css: "body { color: red; }" }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      regions: [{ ...bundleFixture.regions[0]!, controls: [
        { ...candidate("button"), score: 1000.1 }, candidate("easyui.1"), candidate("easyui.2"),
      ] }],
    })).toMatchObject({ success: false });
    expect(CapabilityCandidateBundleSchema.safeParse({
      ...bundleFixture,
      regions: [{ ...bundleFixture.regions[0]!, controls: [
        { ...candidate("button"), knowledgeVersion: "v1.2.3" }, candidate("easyui.1"), candidate("easyui.2"),
      ] }],
    })).toMatchObject({ success: false });
    expect(CapabilityCandidateBundleSchema.safeParse({ ...bundleFixture, blueprintHash: "A".repeat(64) }).success).toBe(false);
    expect(CapabilityCandidateBundleSchema.safeParse({ ...bundleFixture, schema: "kf-capability-candidates/v2" }).success).toBe(false);
  });
});
