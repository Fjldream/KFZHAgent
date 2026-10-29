// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { CustomerSolutionBlueprintSchema, type CustomerSolutionBlueprint, type VisualPlanningContext } from "@kf/contracts";
import { getDesignKnowledgeSnapshot, retrieveCapabilities, validateVisualPlanningContext } from "@kf/domain-client";
import { MAX_BLUEPRINT_REPAIR_DRAFT_BYTES, MAX_BLUEPRINT_REPAIR_ISSUES } from "./visual-blueprint-limits.js";

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { resolveVisualBlueprintSources } from "@kf/contracts";
import { inspectVisualBlueprintObservations } from "./visual-blueprint-observations.js";

const sourceFailureCodes = new Set(["VISUAL_BLUEPRINT_SOURCES_REQUIRED", "VISUAL_BLUEPRINT_SOURCE_MISSING",
  "VISUAL_BLUEPRINT_SOURCE_UNKNOWN", "VISUAL_BLUEPRINT_SOURCE_DUPLICATE", "VISUAL_BLUEPRINT_SOURCE_OMITTED"]);
const blueprintPages = CustomerSolutionBlueprintSchema.shape.pages;
/** Validate only the existing pages schema; never fill invalid journeys or approve a partial blueprint. */
function inspectBlueprintPageSources(raw: unknown, reference: VisualPlanningContext): BlueprintOutputIssue[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const pages = blueprintPages.safeParse((raw as Record<string, unknown>).pages);
  if (!pages.success) return [];
  try { resolveVisualBlueprintSources({ pages: pages.data }, reference, true); }
  catch (error) {
    const code = error instanceof Error ? error.message.split(":", 1)[0]! : "";
    if (!sourceFailureCodes.has(code)) return [];
    const assigned = new Set(pages.data.flatMap(page => page.regions.flatMap(region => region.visualRegionIds ?? [])));
    const omitted = new Set(reference.acceptedDifferences.filter(item => item.disposition === "omit").map(item => item.regionId));
    const missing = reference.spec.regions.filter(region => !omitted.has(region.id) && !assigned.has(region.id)).map(region => region.id);
    return [{ code, ...(missing.length ? { regionIds: missing.slice(0, 100) } : {}) }];
  }
  return [];
}
// end

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
export type BlueprintOutputIssue = { code: string; path?: string; regionIds?: string[]; blueprintPageId?: string; blueprintRegionId?: string;
  expectedTextIndexes?: number[]; availableTextRegionIds?: string[]; availableTextRegionCount?: number; detail?: string };
// end
export type BlueprintOutputInspection = { ok: true; blueprint: CustomerSolutionBlueprint }
  | { ok: false; repairable: boolean; issues: BlueprintOutputIssue[] };

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
function duplicateObservationIssue(raw: unknown, path: readonly PropertyKey[]): BlueprintOutputIssue | null {
  if (path.length !== 5 || path[0] !== "journeys" || path[2] !== "steps" || path[4] !== "expectedTexts"
    || typeof path[1] !== "number" || typeof path[3] !== "number") return null;
  let value = raw;
  for (const key of path) {
    if (!value || typeof value !== "object") return null;
    value = (value as Record<PropertyKey, unknown>)[key];
  }
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) return null;
  const seen = new Set<string>();
  const duplicateIndexes: number[] = [];
  value.forEach((text: string, index) => {
    const normalized = text.trim();
    if (seen.has(normalized) && duplicateIndexes.length < 12) duplicateIndexes.push(index);
    seen.add(normalized);
  });
  if (!duplicateIndexes.length) return null;
  return { code: "BLUEPRINT_OBSERVATION_TEXT_DUPLICATE", path: path.join("."), expectedTextIndexes: duplicateIndexes,
    detail: "In this unapproved proposal keep each unique expected text once. Revise only repeated entries at the listed indexes; retain every approved visual source and legitimate reading requirement. Repeated visible instances still need their own implementation; do not delete source regions or invent interactions." };
}
// end

/** Proposal validation only. A successful result still requires the original independent blueprint approval. */
export function inspectVisualBlueprintOutput(raw: unknown, reference: VisualPlanningContext): BlueprintOutputInspection {
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  try { validateVisualPlanningContext(reference); }
  catch { return { ok: false, repairable: false, issues: [{ code: "VISUAL_BLUEPRINT_TRUSTED_CONTEXT_INVALID" }] }; }
  // end
  const parsed = CustomerSolutionBlueprintSchema.safeParse(raw);
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  if (!parsed.success) {
    const sources = inspectBlueprintPageSources(raw, reference);
    const observations = inspectVisualBlueprintObservations(raw, reference);
    return { ok: false, repairable: true, issues: [...parsed.error.issues.slice(0, MAX_BLUEPRINT_REPAIR_ISSUES - sources.length - observations.length)
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      .map(issue => (issue.code === "custom" && issue.message === "duplicate expected text"
        ? duplicateObservationIssue(raw, issue.path) : null)
        ?? { code: `SCHEMA_${issue.code}`, path: issue.path.join(".").slice(0, 256) }), ...sources, ...observations] };
      // end
  }
  // end
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  const observations = inspectVisualBlueprintObservations(parsed.data, reference);
  // end
  try {
    retrieveCapabilities({ blueprint: parsed.data, knowledge: getDesignKnowledgeSnapshot(), visualReference: reference });
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    if (observations.length) return { ok: false, repairable: true, issues: observations };
    // end
    return { ok: true, blueprint: parsed.data };
  } catch (error) {
    const code = error instanceof Error ? error.message.split(":")[0]! : "BLUEPRINT_UNKNOWN_FAILURE";
    const repairable = ["VISUAL_BLUEPRINT_SOURCES_REQUIRED", "VISUAL_BLUEPRINT_SOURCE_MISSING", "VISUAL_BLUEPRINT_SOURCE_UNKNOWN",
      "VISUAL_BLUEPRINT_SOURCE_DUPLICATE", "VISUAL_BLUEPRINT_SOURCE_OMITTED", "VISUAL_BLUEPRINT_REGION_TOO_BROAD"].includes(code);
    const assigned = new Set(parsed.data.pages.flatMap(page => page.regions.flatMap(region => region.visualRegionIds ?? [])));
    const omitted = new Set(reference.acceptedDifferences.filter(item => item.disposition === "omit").map(item => item.regionId));
    const missing = reference.spec.regions.filter(region => !omitted.has(region.id) && !assigned.has(region.id)).map(region => region.id);
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    return { ok: false, repairable, issues: [{ code, ...(missing.length ? { regionIds: missing.slice(0, 100) } : {}) }, ...observations].slice(0, MAX_BLUEPRINT_REPAIR_ISSUES) };
    // end
  }
}

/** Inspection only: syntax repair consumes the existing one-shot allowance, never guesses missing syntax. */
export function inspectVisualBlueprintResponse(response: { text: string; finishReason: string | null },
  reference: VisualPlanningContext): { raw: unknown; inspection: BlueprintOutputInspection } {
  try { validateVisualPlanningContext(reference); }
  catch { return { raw: null, inspection: { ok: false, repairable: false, issues: [{ code: "VISUAL_BLUEPRINT_TRUSTED_CONTEXT_INVALID" }] } }; }
  if (response.finishReason !== "stop") {
    return { raw: null, inspection: { ok: false, repairable: false,
      issues: [{ code: response.finishReason === "length" ? "BLUEPRINT_RESPONSE_TRUNCATED" : "BLUEPRINT_RESPONSE_NOT_STOPPED" }] } };
  }
  let raw: unknown;
  try { raw = JSON.parse(response.text) as unknown; }
  catch {
    const frame = response.text.trim();
    return { raw: response.text, inspection: { ok: false, repairable: response.finishReason === "stop"
      && frame.startsWith("{") && frame.endsWith("}")
      && Buffer.byteLength(JSON.stringify(response.text), "utf8") <= MAX_BLUEPRINT_REPAIR_DRAFT_BYTES,
    issues: [{ code: "BLUEPRINT_JSON_SYNTAX_INVALID" }] } };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { raw, inspection: { ok: false, repairable: false, issues: [{ code: "BLUEPRINT_OBJECT_REQUIRED" }] } };
  }
  return { raw, inspection: inspectVisualBlueprintOutput(raw, reference) };
}
// end
