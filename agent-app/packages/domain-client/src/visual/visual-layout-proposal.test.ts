// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalServerHash, VisualPlanningContextSchema, type VisualRegion } from "@kf/contracts";
import { getDesignKnowledgeSnapshot } from "../design-knowledge/design-knowledge-catalog.js";
import { retrieveVisualCapabilities } from "../planning/capability-retrieval.js";
import { mapVisualRegions, type MappingCandidate } from "./region-mapping.js";

const container = (id: string, parentId: string | null = null, box = { x: 0, y: 0, width: 1, height: 1 }): VisualRegion =>
  ({ id, parentId, box, role: "card", text: [], confidence: 0.9, interactionHint: null });
const candidates: MappingCandidate[] = ["layout.2", "layout.4"].map(capabilityId =>
  ({ capabilityId, controlType: capabilityId, supportedRoles: ["card"], evidence: [], fallback: null, score: 1 }));
const propose = (regions: VisualRegion[], proposed = candidates) => mapVisualRegions({ regions, candidates: proposed, targetRuntimeVersion: "3.6" });

describe("new visual layout proposals", () => {
  it("suggests columns for the real vertical cards while preserving the reviewed historical facts", () => {
    const directory = new URL("../../../../tests/fixtures/energy-overview-20261023/live-semantic-graph-layout-constraints/", import.meta.url);
    const reference = JSON.parse(readFileSync(new URL("reference-review.json", directory), "utf8")) as Record<string, unknown>;
    const accepted = JSON.parse(readFileSync(new URL("accepted-differences.json", directory), "utf8"));
    const original = VisualPlanningContextSchema.parse({ ...reference, acceptedDifferences: accepted });
    const before = canonicalServerHash(original);
    const mappings = propose(original.spec.regions, retrieveVisualCapabilities({ regions: original.spec.regions, knowledge: getDesignKnowledgeSnapshot() }));
    for (const regionId of ["content", "kpi-energy", "kpi-power", "kpi-online", "devices-card", "summary-card"]) {
      expect(mappings.find(mapping => mapping.regionId === regionId)).toMatchObject({ capabilityId: "layout.4", support: "supported_unverified" });
      expect(mappings.find(mapping => mapping.regionId === regionId)!.reason).toContain("纵向");
      expect(original.mappings.find(mapping => mapping.regionId === regionId)!.capabilityId).toBe("layout.2");
    }
    for (const regionId of ["header", "kpi-row"]) expect(mappings.find(mapping => mapping.regionId === regionId)!.capabilityId).toBe("layout.2");
    expect(canonicalServerHash(original)).toBe(before);
  });
  it("does not borrow a higher score or role admission from another queried region", () => {
    const local: MappingCandidate[] = [
      { ...candidates[0]!, score: 100, regionScores: { first: 1, second: 100 } },
      { ...candidates[1]!, score: 2, regionScores: { first: 2 } },
    ];
    const mappings = propose([container("first"), container("second"), container("not-queried")], local);
    expect(mappings.map(mapping => mapping.capabilityId)).toEqual(["layout.4", "layout.2", null]);
  });
  it("proposes a clear child axis independently of source and candidate order", () => {
    const regions = [container("parent"), container("top", "parent", { x: 0.1, y: 0.1, width: 0.8, height: 0.2 }),
      container("bottom", "parent", { x: 0.1, y: 0.6, width: 0.8, height: 0.2 })];
    expect(propose(regions)[0]!.capabilityId).toBe("layout.4");
    expect(propose([...regions].reverse(), [...candidates].reverse()).find(item => item.regionId === "parent")).toEqual(propose(regions)[0]);
  });
  it.each(["one-child", "overlap", "grid", "outside"] as const)("leaves ambiguous %s geometry to existing ranking", scenario => {
    const boxes = scenario === "one-child" ? [{ x: 0.1, y: 0.1, width: 0.8, height: 0.2 }]
      : scenario === "overlap" ? [{ x: 0.1, y: 0.1, width: 0.8, height: 0.8 }, { x: 0.2, y: 0.2, width: 0.6, height: 0.6 }]
      : scenario === "outside" ? [{ x: 0.1, y: 0.1, width: 0.8, height: 0.2 }, { x: 0.1, y: 0.7, width: 0.8, height: 0.2 }]
      : [0.1, 0.6].flatMap(x => [0.1, 0.6].map(y => ({ x, y, width: 0.2, height: 0.2 })));
    const mapping = propose([container("parent", null, { x: 0, y: 0, width: 1, height: scenario === "outside" ? 0.8 : 1 }),
      ...boxes.map((box, index) => container(`child-${index}`, "parent", box))])[0]!;
    expect(mapping.capabilityId).toBe("layout.2");
    expect(mapping.reason).not.toContain("子区域几何");
  });
  it("never manufactures an unavailable layout or executable interaction from geometry", () => {
    const regions = [container("parent"), container("top", "parent", { x: 0, y: 0, width: 1, height: 0.2 }),
      container("bottom", "parent", { x: 0, y: 0.6, width: 1, height: 0.2 })];
    expect(propose(regions, [candidates[0]!])[0]!.capabilityId).toBe("layout.2");
    expect(propose([{ ...regions[0]!, interactionHint: "点击后访问未确认地址" }, ...regions.slice(1)])[0]!.support).toBe("unsupported");
  });
});
// end
