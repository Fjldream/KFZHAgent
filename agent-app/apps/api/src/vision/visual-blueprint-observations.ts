// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { BlueprintJourneyStepSchema, CustomerSolutionBlueprintSchema, type VisualPlanningContext } from "@kf/contracts";
import type { BlueprintOutputIssue } from "./visual-blueprint-output.js";

export function visualBlueprintObservationContract() {
  return { version: "kf-visual-blueprint-observation/v1", scope: "explicit-page-region-sources", textMatch: "exact-item-or-source-space-join",
    dataText: "frozen-regional-snapshot", requireSources: true, maxGroups: 4, maxTextIndexes: 12, maxSourceIds: 20 } as const;
}

/** Feedback only. The caller must authenticate the reviewed context; no defaults, text or steps are adopted. */
export function inspectVisualBlueprintObservations(raw: unknown, reference: VisualPlanningContext): BlueprintOutputIssue[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const payload = raw as Record<string, unknown>;
  const pages = CustomerSolutionBlueprintSchema.shape.pages.safeParse(payload.pages);
  if (!pages.success || !Array.isArray(payload.journeys) || payload.journeys.length > 12) return [];
  const pageCounts = new Map<string, number>();
  const regionCounts = new Map<string, number>();
  const sourceCounts = new Map<string, number>();
  const identity = (pageId: string, regionId: string) => JSON.stringify([pageId, regionId]);
  for (const page of pages.data) {
    pageCounts.set(page.id, (pageCounts.get(page.id) ?? 0) + 1);
    for (const region of page.regions) {
      const key = identity(page.id, region.id); regionCounts.set(key, (regionCounts.get(key) ?? 0) + 1);
      for (const id of region.visualRegionIds ?? []) sourceCounts.set(id, (sourceCounts.get(id) ?? 0) + 1);
    }
  }
  const known = new Map(reference.spec.regions.map(region => [region.id, region]));
  const omitted = new Set(reference.acceptedDifferences.filter(item => item.disposition === "omit").map(item => item.regionId));
  const snapshots = new Map(reference.dataSnapshots?.map(item => [item.regionId, item.value]));
  const issues: BlueprintOutputIssue[] = [];
  const contract = visualBlueprintObservationContract();
  payload.journeys.forEach((journey: unknown, journeyIndex) => {
    if (!journey || typeof journey !== "object" || Array.isArray(journey)) return;
    const steps: unknown = (journey as Record<string, unknown>).steps;
    if (!Array.isArray(steps) || steps.length > 12) return;
    steps.forEach((rawStep: unknown, stepIndex) => {
      if (issues.length >= contract.maxGroups) return;
      const parsed = BlueprintJourneyStepSchema.safeParse(rawStep);
      if (!parsed.success || parsed.data.kind !== "observe") return;
      const step = parsed.data;
      if (pageCounts.get(step.pageId) !== 1 || regionCounts.get(identity(step.pageId, step.regionId)) !== 1) return;
      const region = pages.data.find(page => page.id === step.pageId)!.regions.find(region => region.id === step.regionId)!;
      const sourceIds = region.visualRegionIds;
      const location = { path: `journeys.${journeyIndex}.steps.${stepIndex}.expectedTexts`, blueprintPageId: step.pageId, blueprintRegionId: step.regionId };
      if (!sourceIds?.length) {
        issues.push({ code: "VISUAL_BLUEPRINT_OBSERVATION_SOURCES_REQUIRED", ...location,
          expectedTextIndexes: step.expectedTexts.map((_, index) => index), availableTextRegionIds: [], availableTextRegionCount: 0,
          detail: "A visual observation needs explicit reviewed source ownership. Keep layout prose in visualIntent or acceptanceScenarios; explicitly author a reading step for actual mapped text." });
        return;
      }
      // Ambiguous, unknown or omitted ownership is handled by the existing strict source check, never borrowed here.
      if (sourceIds.some(id => !known.has(id) || omitted.has(id) || sourceCounts.get(id) !== 1)) return;
      const witnesses = sourceIds.map(id => {
        const source = known.get(id)!;
        const value = snapshots.get(id);
        const texts = source.dataRequirement === undefined ? source.text : value === undefined ? [] : [value];
        const items = texts.filter(text => text.trim().length > 0);
        return { id, texts: items.length > 1 ? [...items, items.join(" ")] : items };
      });
      const allowed = new Set(witnesses.flatMap(witness => witness.texts));
      const unsupported = step.expectedTexts.flatMap((text, index) => allowed.has(text) ? [] : [index]);
      if (!unsupported.length) return;
      const available = witnesses.filter(witness => witness.texts.length > 0).map(witness => witness.id);
      issues.push({ code: "VISUAL_BLUEPRINT_OBSERVATION_TEXT_UNSUPPORTED", ...location,
        expectedTextIndexes: unsupported.slice(0, contract.maxTextIndexes), availableTextRegionIds: available.slice(0, contract.maxSourceIds), availableTextRegionCount: available.length,
        detail: "Use an exact reviewed text item, or all items of one source joined in order with single spaces, or its frozen field value. Parent/descendant and other regions cannot supply text. Keep layout descriptions as design intent; explicitly revise the unapproved step without dropping legitimate visible-text requirements." });
    });
  });
  return issues;
}
// end
