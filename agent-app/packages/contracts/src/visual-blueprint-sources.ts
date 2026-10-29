// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import type { CustomerSolutionBlueprint } from "./solution-blueprint.js";
import type { VisualPlanningContext, SourceMapEntry } from "./generation-snapshot.js";
import type { UIImplementationSpecV2 } from "./ui-style.js";
import { canonicalServerHash } from "./server-plan-envelope.js";

export interface VisualBlueprintSource {
  readonly visualRegionId: string;
  readonly pageId: string;
  readonly regionId: string;
  readonly capabilityId: string;
}

/** Structural correlation only, not approval. Callers must authenticate the reviewed visual input and blueprint separately. */
export function resolveVisualBlueprintSources(
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  blueprint: Pick<CustomerSolutionBlueprint, "pages">,
  // end
  visual: VisualPlanningContext,
  required = false,
): readonly VisualBlueprintSource[] {
  const regions = blueprint.pages.flatMap((page) => page.regions.map((region) => ({ pageId: page.id, region })));
  if (!regions.some(({ region }) => region.visualRegionIds !== undefined)) {
    if (required) throw new Error("VISUAL_BLUEPRINT_SOURCES_REQUIRED");
    return [];
  }
  if (canonicalServerHash(visual.spec) !== visual.specHash) throw new Error("VISUAL_BLUEPRINT_CONTEXT_INVALID");
  const known = new Set(visual.spec.regions.map((region) => region.id));
  const mappings = new Map(visual.mappings.map((mapping) => [mapping.regionId, mapping]));
  const differences = new Map(visual.acceptedDifferences.map((difference) => [difference.regionId, difference]));
  if (known.size !== visual.spec.regions.length || mappings.size !== visual.mappings.length || mappings.size !== known.size
    || [...mappings.keys()].some((id) => !known.has(id)) || differences.size !== visual.acceptedDifferences.length
    || [...differences.keys()].some((id) => !known.has(id))) throw new Error("VISUAL_BLUEPRINT_CONTEXT_INVALID");
  const sources = new Map<string, VisualBlueprintSource>();
  for (const { pageId, region } of regions) {
    for (const visualRegionId of region.visualRegionIds ?? []) {
      if (!known.has(visualRegionId) || !mappings.has(visualRegionId)) throw new Error("VISUAL_BLUEPRINT_SOURCE_UNKNOWN");
      if (sources.has(visualRegionId)) throw new Error("VISUAL_BLUEPRINT_SOURCE_DUPLICATE");
      const mapping = mappings.get(visualRegionId)!;
      const difference = differences.get(visualRegionId);
      if (difference?.disposition === "omit") throw new Error("VISUAL_BLUEPRINT_SOURCE_OMITTED");
      if (mapping.support === "unsupported" && difference?.disposition !== "substitute"
        || mapping.support === "supported_unverified" && difference?.disposition !== "accept-unverified" && difference?.disposition !== "substitute") {
        throw new Error("VISUAL_BLUEPRINT_SOURCE_UNACCEPTED");
      }
      const capabilityId = difference?.disposition === "substitute" ? difference.capabilityId : mapping.capabilityId;
      if (capabilityId === null || capabilityId === undefined) throw new Error("VISUAL_BLUEPRINT_SOURCE_UNACCEPTED");
      if (difference !== undefined && difference.capabilityId !== capabilityId) throw new Error("VISUAL_BLUEPRINT_SOURCE_UNACCEPTED");
      sources.set(visualRegionId, { visualRegionId, pageId, regionId: region.id, capabilityId });
    }
  }
  for (const id of known) {
    if (differences.get(id)?.disposition !== "omit" && !sources.has(id)) throw new Error("VISUAL_BLUEPRINT_SOURCE_MISSING");
  }
  return [...sources.values()];
}

/** Exact compiled ownership check; no model-supplied native identity is accepted. */
export function validateVisualBlueprintNativeSources(input: { blueprint: CustomerSolutionBlueprint; visual: VisualPlanningContext;
  implementation: UIImplementationSpecV2; sourceMap: readonly SourceMapEntry[] }): void {
  const sources = resolveVisualBlueprintSources(input.blueprint, input.visual);
  if (!sources.length) return;
  const byRegion = new Map(sources.map((source) => [source.visualRegionId, source]));
  const controls = new Map(input.implementation.pages.flatMap((page) => page.compatibility === "native"
    ? page.controls.map((control) => [control.id, control] as const) : []));
  const covered = new Set<string>();
  for (const entry of input.sourceMap) {
    const source = byRegion.get(entry.regionId);
    const control = controls.get(entry.componentId);
    if (source === undefined || control === undefined || control.sourceBlueprintPageId !== source.pageId
      || !control.sourceBlueprintRegionIds.includes(source.regionId) || control.capabilityId !== source.capabilityId) {
      throw new Error("VISUAL_BLUEPRINT_NATIVE_SOURCE_MISMATCH");
    }
    covered.add(source.visualRegionId);
  }
  if (sources.some((source) => !covered.has(source.visualRegionId))) throw new Error("VISUAL_BLUEPRINT_SOURCE_MISSING");
}
// end
