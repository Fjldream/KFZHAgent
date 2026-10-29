// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canonicalServerHash, VisualPlanningContextSchema } from "@kf/contracts";
import { inspectVisualBlueprintOutput } from "./visual-blueprint-output.js";

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
const duplicateObservationIssue = {
  code: "BLUEPRINT_OBSERVATION_TEXT_DUPLICATE", path: "journeys.1.steps.0.expectedTexts", expectedTextIndexes: [4],
  detail: "In this unapproved proposal keep each unique expected text once. Revise only repeated entries at the listed indexes; retain every approved visual source and legitimate reading requirement. Repeated visible instances still need their own implementation; do not delete source regions or invent interactions.",
};
// end

function fixture() {
  const directory = new URL("../../../../tests/fixtures/energy-overview-20261023/live-blueprint-joint-feedback/", import.meta.url);
  const read = (name: string) => JSON.parse(readFileSync(new URL(name, directory), "utf8")) as Record<string, unknown>;
  const reference = VisualPlanningContextSchema.parse({ ...read("reference-review.json"), acceptedDifferences: read("accepted-differences.json") });
  const draft = JSON.parse(read("initial-blueprint-provider-reply.json").content as string) as { pages: { id: string; regions: { visualRegionIds?: string[] }[] }[] };
  return { reference, draft, read };
}

describe("independent blueprint source feedback", () => {
  it("reports both real schema and missing-root defects without adopting a partial blueprint", () => {
    const { reference, draft } = fixture(); const before = canonicalServerHash(draft);
    expect(inspectVisualBlueprintOutput(draft, reference)).toEqual({ ok: false, repairable: true, issues: [
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      duplicateObservationIssue,
      // end
      { code: "VISUAL_BLUEPRINT_SOURCE_MISSING", regionIds: ["app"] },
    ] });
    expect(canonicalServerHash(draft)).toBe(before);
  });

  it("does not report a known missing source after it was explicitly assigned, while the original schema defect still rejects", () => {
    const { reference, draft } = fixture(); draft.pages[0]!.regions[0]!.visualRegionIds!.push("app");
    const result = inspectVisualBlueprintOutput(draft, reference);
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    expect(result).toEqual({ ok: false, repairable: true, issues: [duplicateObservationIssue] });
    // end
  });

  it("does not traverse invalid page structures or accept corrupted reviewed facts", () => {
    const { reference, draft } = fixture();
    const invalid = inspectVisualBlueprintOutput({ ...draft, pages: [{ id: "invalid" }] }, reference);
    expect(invalid.ok).toBe(false);
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    if (!invalid.ok) {
      expect(invalid.issues).toContainEqual(duplicateObservationIssue);
      expect(invalid.issues.some(issue => issue.code.startsWith("SCHEMA_"))).toBe(true);
      expect(invalid.issues.some(issue => issue.code.startsWith("VISUAL_BLUEPRINT_SOURCE_"))).toBe(false);
    }
    // end
    reference.specHash = "0".repeat(64);
    expect(inspectVisualBlueprintOutput(draft, reference)).toEqual({ ok: false, repairable: false,
      issues: [{ code: "VISUAL_BLUEPRINT_TRUSTED_CONTEXT_INVALID" }] });
  });

  it("reserves one bounded source issue when schema errors fill the feedback allowance", () => {
    const { reference, draft } = fixture();
    const result = inspectVisualBlueprintOutput({ ...draft, audiences: Array.from({ length: 20 }, () => null) }, reference);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues).toHaveLength(8);
      expect(result.issues[0]?.code).toBe("SCHEMA_invalid_type");
      expect(result.issues.at(-1)).toEqual({ code: "VISUAL_BLUEPRINT_SOURCE_MISSING", regionIds: ["app"] });
    }
  });

  it("keeps the actual repaired reply as a strict missing-source failure", () => {
    const { reference, read } = fixture();
    const draft = JSON.parse(read("repair-blueprint-provider-reply.json").content as string) as unknown;
    expect(inspectVisualBlueprintOutput(draft, reference)).toEqual({ ok: false, repairable: true,
      issues: [{ code: "VISUAL_BLUEPRINT_SOURCE_MISSING", regionIds: ["app"] }] });
  });
});
// end
