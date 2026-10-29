// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { GenerationSnapshotContentSchema, VisualGenerationReferenceSchema, TrustedNativeMaterializationSchema, SourceMapEntrySchema,
  canonicalServerHash, canonicalCreativeBuildArtifactHash, type GenerationSnapshotContent, type SourceMapEntry,
  type TrustedNativeMaterialization, type VisualGenerationReference } from "@kf/contracts";
import type { RegionMapping } from "./region-mapping.js";
import { deriveGuid } from "../compile/guid-factory.js";
import { getVisualCapabilitySurface } from "../design-knowledge/design-knowledge-catalog.js";
import type { VisualPlanningContext, VisualSemanticBinding, SolutionImplementationPlan } from "@kf/contracts";
import { AcceptedVisualPlanningInputSchema, VisualPlanningContextSchema, VisualSemanticBindingSchema, type AcceptedVisualPlanningInput } from "@kf/contracts";
import { readSemanticCompilationProvenance, type SemanticCompilationProvenance } from "../solution-compile/solution-compiler.js";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { resolveVisualBlueprintSources, type CustomerSolutionBlueprint, type SolutionNode, type LayoutNode } from "@kf/contracts";
import { layoutCapabilityIdsFor } from "../planning/capability-retrieval.js";
// end

// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
/** Structural coverage only; values must originate from a signed server review, never this validator. */
export function validateVisualDataSnapshots(context: Pick<VisualPlanningContext, "spec" | "dataSnapshots">): void {
  const required = context.spec.regions.filter(region => region.dataRequirement !== undefined);
  const snapshots = context.dataSnapshots ?? [];
  if (required.length !== snapshots.length || new Set(snapshots.map(snapshot => snapshot.regionId)).size !== snapshots.length
    || snapshots.some(snapshot => !required.some(region => region.id === snapshot.regionId && region.role === "text"
      && region.dataRequirement?.kind === snapshot.kind && region.dataRequirement.field === snapshot.field))) {
    throw new Error("VISUAL_DATA_SNAPSHOT_MISMATCH");
  }
}
// end

/** Structural integrity only; callers must load this from a trusted server confirmation. */
export function validateAcceptedVisualPlanningInput(raw: unknown): AcceptedVisualPlanningInput {
  const accepted = AcceptedVisualPlanningInputSchema.parse(raw);
  validateVisualPlanningContext(accepted.reference);
  if (accepted.confirmationHash !== canonicalServerHash({ reviewHash: accepted.reviewHash, reference: accepted.reference })) {
    throw new Error("VISUAL_CONFIRMATION_HASH_MISMATCH");
  }
  return accepted;
}

/** Validates review structure, not user authority; public admission must supply its own trusted receipt. */
export function validateVisualPlanningContext(raw: unknown): VisualPlanningContext {
  const context = VisualPlanningContextSchema.parse(raw);
  if (context.specHash !== canonicalServerHash(context.spec)) throw new Error("VISUAL_SPEC_HASH_MISMATCH");
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  validateVisualDataSnapshots(context);
  // end
  validateVisualPlanReferences({ regionIds: context.spec.regions.map(region => region.id), mappings: context.mappings, sourceMap: [] });
  const byRegion = new Map(context.acceptedDifferences.map(difference => [difference.regionId, difference]));
  if (byRegion.size !== context.acceptedDifferences.length) throw new Error("VISUAL_DIFFERENCE_DUPLICATE");
  if (context.acceptedDifferences.some(difference => !context.spec.regions.some(region => region.id === difference.regionId))) throw new Error("UNKNOWN_VISUAL_REGION");
  for (const mapping of context.mappings) {
    const difference = byRegion.get(mapping.regionId);
    if (mapping.support === "supported_unverified" && difference?.disposition !== "omit" && difference?.disposition !== "accept-unverified") throw new Error("VISUAL_ACKNOWLEDGEMENT_REQUIRED");
    if (mapping.support === "unsupported" && (difference === undefined || difference.disposition === "accept-unverified")) throw new Error("VISUAL_DIFFERENCE_REQUIRED");
    if (difference?.disposition === "omit") {
      if (difference.capabilityId !== null) throw new Error("VISUAL_CAPABILITY_MISMATCH");
    } else {
      const capabilityId = difference?.disposition === "substitute" ? difference.capabilityId : mapping.capabilityId;
      if (capabilityId === null || getVisualCapabilitySurface(capabilityId)?.eligible !== true) throw new Error("VISUAL_CAPABILITY_UNSUPPORTED");
      if (difference !== undefined && difference.capabilityId !== capabilityId) throw new Error("VISUAL_CAPABILITY_MISMATCH");
    }
  }
  return context;
}

// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
/** Mirrors the compiler's grouping preconditions without changing or repairing any model-authored edge. */
export function validateVisualSiblingGrouping(nodes: readonly { id: string; groupWith: readonly string[] }[]): void {
  const fail = (nodeId: string, reason: string): never => { throw new Error(`VISUAL_LAYOUT_GROUP_INVALID: ${nodeId} (${reason})`); };
  const byId = new Map(nodes.map(node => [node.id, node]));
  for (const node of nodes) {
    const seen = new Set<string>();
    for (const target of node.groupWith) {
      if (target === node.id) fail(node.id, "self");
      if (seen.has(target)) fail(node.id, "duplicate");
      if (!byId.has(target)) fail(node.id, "not-sibling");
      seen.add(target);
    }
  }
  const states = new Map<string, "active" | "done">();
  const visitEdges = (node: { id: string; groupWith: readonly string[] }): void => {
    if (states.get(node.id) === "active") fail(node.id, "cycle");
    if (states.get(node.id) === "done") return;
    states.set(node.id, "active");
    node.groupWith.forEach(target => visitEdges(byId.get(target)!));
    states.set(node.id, "done");
  };
  nodes.forEach(visitEdges);
}

export function validateVisualLayoutGrouping(root: SolutionNode): void {
  const visitGroup = (nodes: readonly SolutionNode[]): void => {
    validateVisualSiblingGrouping(nodes.map(node => ({ id: node.id, groupWith: node.intent.groupWith })));
    for (const node of nodes) {
      if (node.kind === "layout") visitGroup(node.children);
      else if (node.kind === "repeater") visitGroup([node.template]);
      else if (node.kind === "registered-module") node.slots.forEach(slot => visitGroup(slot.children));
    }
  };
  visitGroup([root]);
}

export function validateVisualNodeCapability(node: { kind: "layout"; layout: LayoutNode["layout"] } | { kind: "control"; capabilityId: string }
  | { kind: "repeater" | "registered-module" }, source: { visualRegionId: string; capabilityId: string }): void {
  if (node.kind === "layout" && !layoutCapabilityIdsFor(node.layout).includes(source.capabilityId)) {
    throw new Error(`VISUAL_BLUEPRINT_LAYOUT_CAPABILITY_MISMATCH: ${source.visualRegionId}`);
  }
  if (node.kind === "control" && node.capabilityId !== source.capabilityId) {
    throw new Error(`VISUAL_BLUEPRINT_CONTROL_CAPABILITY_MISMATCH: ${source.visualRegionId}`);
  }
}

export function validateVisualSemanticBindings(context: VisualPlanningContext, plan: SolutionImplementationPlan, bindings: VisualSemanticBinding[], blueprint?: CustomerSolutionBlueprint): void {
  plan.pages.forEach(page => validateVisualLayoutGrouping(page.root));
  plan.overlays.forEach(overlay => validateVisualLayoutGrouping(overlay.root));
  const sources = blueprint === undefined ? [] : resolveVisualBlueprintSources(blueprint, context);
  const sourceByVisualId = new Map(sources.map((source) => [source.visualRegionId, source]));
  const pageByNode = new Map<string, string>();
// end
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  validateVisualDataSnapshots(context);
  // end
  const nodeIds = new Set<string>();
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  const nodesById = new Map<string, SolutionImplementationPlan["pages"][number]["root"]>();
  // end
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  const visit = (node: SolutionImplementationPlan["pages"][number]["root"], pageId: string): void => {
    pageByNode.set(node.id, pageId);
  // end
    nodeIds.add(node.id);
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    nodesById.set(node.id, node);
    // end
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    if (node.kind === "layout") node.children.forEach(child => visit(child, pageId));
    else if (node.kind === "repeater") visit(node.template, pageId);
    else if (node.kind === "registered-module") node.slots.forEach(slot => slot.children.forEach(child => visit(child, pageId)));
    // end
  };
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  plan.pages.forEach(page => visit(page.root, page.sourceBlueprintPageId)); plan.overlays.forEach(overlay => visit(overlay.root, overlay.sourceBlueprintPageId));
  // end
  const seen = new Set<string>();
  for (const binding of bindings) {
    if (!context.mappings.some(mapping => mapping.regionId === binding.regionId)) throw new Error("UNKNOWN_VISUAL_REGION");
    if (!nodeIds.has(binding.nodeId)) throw new Error("VISUAL_SEMANTIC_NODE_MISSING");
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    if (sources.length) {
      const source = sourceByVisualId.get(binding.regionId);
      const node = nodesById.get(binding.nodeId)!;
      if (!source || pageByNode.get(node.id) !== source.pageId || !node.sourceBlueprintRegionIds.includes(source.regionId)) {
        throw new Error("VISUAL_BLUEPRINT_SEMANTIC_SOURCE_MISMATCH");
      }
      validateVisualNodeCapability(node, source);
    }
    // end
    const key = `${binding.regionId}\u0000${binding.nodeId}`;
    if (seen.has(key)) throw new Error("VISUAL_SEMANTIC_BINDING_DUPLICATE");
    seen.add(key);
  }
  for (const region of context.spec.regions) {
    const omitted = context.acceptedDifferences.some(difference => difference.regionId === region.id && difference.disposition === "omit");
    const bound = bindings.some(binding => binding.regionId === region.id);
    if (omitted && bound) throw new Error("VISUAL_OMITTED_REGION_HAS_COMPONENTS");
    if (!omitted && !bound) throw new Error("VISUAL_REGION_WITHOUT_COMPONENTS");
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    if (!omitted && region.dataRequirement !== undefined) {
      const regionBindings = bindings.filter(binding => binding.regionId === region.id);
      const node = regionBindings.length === 1 ? nodesById.get(regionBindings[0]!.nodeId) : undefined;
      const snapshot = context.dataSnapshots!.find(item => item.regionId === region.id)!;
      if (node?.kind !== "control" || node.capabilityId !== "text" || node.content !== snapshot.value
        || node.properties.length !== 0 || node.eventBindings.length !== 0 || node.tabIds.length !== 0 || node.mockDataId !== undefined) {
        throw new Error("VISUAL_DATA_REQUIREMENT_MISMATCH");
      }
    }
    // end
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    if (!omitted && region.interactionRequirement !== undefined) {
      const requirement = region.interactionRequirement;
      const regionBindings = bindings.filter(binding => binding.regionId === region.id);
      const node = regionBindings.length === 1 ? nodesById.get(regionBindings[0]!.nodeId) : undefined;
      const events = node?.kind === "control" ? node.eventBindings : [];
      const event = events.length === 1 ? events[0] : undefined;
      const action = event?.actionIds.length === 1 ? plan.actions.find(item => item.id === event.actionIds[0]) : undefined;
      // Require the actual bound button's sole direct, unconditional effect; a sibling, script or DAG dependency is not equivalent.
      if (region.role !== "action" || node?.kind !== "control" || node.capabilityId !== "button"
        || event?.semanticEvent !== "click" || action?.kind !== "show-feedback"
        || action.message !== requirement.message || action.level !== requirement.level
        || (action.conditions?.length ?? 0) !== 0 || action.afterActionIds.length !== 0
        || plan.actions.some(item => item.afterActionIds.includes(action.id))) {
        throw new Error("VISUAL_INTERACTION_REQUIREMENT_MISMATCH");
      }
    }
    // end
  }
}

export function resolveVisualSemanticBindings(input: { context: VisualPlanningContext; bindings: VisualSemanticBinding[];
  plan: SolutionImplementationPlan; provenance: SemanticCompilationProvenance; materialization: TrustedNativeMaterialization;
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  blueprint?: CustomerSolutionBlueprint;
  // end
}): VisualGenerationReference {
  const context = validateVisualPlanningContext(input.context);
  const bindings = VisualSemanticBindingSchema.array().max(5000).parse(input.bindings);
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  validateVisualSemanticBindings(context, input.plan, bindings, input.blueprint);
  // end
  const provenance = readSemanticCompilationProvenance(input.provenance, input.plan);
  const controls = new Map(input.materialization.controls.map(control => [control.semanticControlId, control]));
  const seen = new Set<string>();
  const compiledBindings = bindings.flatMap(binding => {
    const key = `${binding.regionId}\u0000${binding.nodeId}`;
    if (seen.has(key)) throw new Error("VISUAL_SEMANTIC_BINDING_DUPLICATE");
    seen.add(key);
    const mapping = context.mappings.find(mapping => mapping.regionId === binding.regionId);
    if (mapping === undefined) throw new Error("UNKNOWN_VISUAL_REGION");
    const difference = context.acceptedDifferences.find(difference => difference.regionId === binding.regionId);
    if (difference?.disposition === "omit") throw new Error("VISUAL_OMITTED_REGION_HAS_COMPONENTS");
    const capabilityId = difference?.disposition === "substitute" ? difference.capabilityId : mapping.capabilityId;
    const emitted = provenance.filter(entry => entry.nodeId === binding.nodeId);
    if (emitted.length === 0) throw new Error("VISUAL_SEMANTIC_NODE_MISSING");
    const matching = emitted.filter(entry => entry.capabilityId === capabilityId);
    if (matching.length === 0) throw new Error("VISUAL_CAPABILITY_MISMATCH");
    return matching.map(entry => {
      const control = controls.get(entry.componentId);
      if (control === undefined || control.capabilityId !== entry.capabilityId || control.sourceSolutionNodeId !== entry.expandedNodeId) {
        throw new Error("VISUAL_SEMANTIC_PROJECTION_MISMATCH");
      }
      return { regionId: binding.regionId, componentId: entry.componentId };
    });
  });
  const visual: VisualGenerationReference = { ...context, bindings: compiledBindings.sort((left, right) => left.regionId < right.regionId ? -1 : left.regionId > right.regionId ? 1
    : left.componentId < right.componentId ? -1 : left.componentId > right.componentId ? 1 : 0) };
  buildVisualSourceMap({ visual, materialization: input.materialization });
  return visual;
}

export function validateVisualPlanReferences(input: { regionIds: string[]; mappings: RegionMapping[]; sourceMap: SourceMapEntry[] }): void {
  const allowed = new Set(input.regionIds);
  if (allowed.size !== input.regionIds.length) throw new Error("VISUAL_REGION_DUPLICATE");
  for (const entry of [...input.sourceMap, ...input.mappings]) {
    if (!allowed.has(entry.regionId)) throw new Error("UNKNOWN_VISUAL_REGION");
  }
  const mappings = new Set(input.mappings.map(mapping => mapping.regionId));
  if (mappings.size !== input.mappings.length) throw new Error("VISUAL_MAPPING_DUPLICATE");
  for (const regionId of allowed) if (!mappings.has(regionId)) throw new Error("VISUAL_REGION_UNMAPPED");
  const components = new Set<string>();
  const nativeIds = new Set<string>();
  for (const value of input.sourceMap) {
    const entry = SourceMapEntrySchema.parse(value);
    if (components.has(entry.componentId)) throw new Error("VISUAL_COMPONENT_OWNERSHIP_CONFLICT");
    components.add(entry.componentId);
    for (const nativeId of entry.nativeIds) {
      if (nativeIds.has(nativeId)) throw new Error("VISUAL_NATIVE_OWNERSHIP_CONFLICT");
      nativeIds.add(nativeId);
    }
  }
}

export function buildVisualSourceMap(input: { visual: VisualGenerationReference; materialization: TrustedNativeMaterialization }): SourceMapEntry[] {
  const visual = VisualGenerationReferenceSchema.parse(input.visual);
  const materialization = TrustedNativeMaterializationSchema.parse(input.materialization);
  if (visual.specHash !== canonicalServerHash(visual.spec)) throw new Error("VISUAL_SPEC_HASH_MISMATCH");
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  validateVisualDataSnapshots(visual);
  // end
  const allowed = new Set(visual.spec.regions.map(region => region.id));
  const differences = new Map(visual.acceptedDifferences.map(difference => [difference.regionId, difference]));
  if (differences.size !== visual.acceptedDifferences.length) throw new Error("VISUAL_DIFFERENCE_DUPLICATE");
  for (const difference of visual.acceptedDifferences) if (!allowed.has(difference.regionId)) throw new Error("UNKNOWN_VISUAL_REGION");
  const controls = new Map(materialization.controls.map(control => [control.semanticControlId, control]));
  const sourceMap = visual.bindings.map(binding => {
    const control = controls.get(binding.componentId);
    if (control === undefined) throw new Error("VISUAL_COMPONENT_MISSING");
    return { ...binding, nativeIds: [control.nativeGuid ?? deriveGuid({ seed: materialization.workspaceId }, control.instanceName)] };
  });
  validateVisualPlanReferences({ regionIds: [...allowed], mappings: visual.mappings, sourceMap });
  for (const mapping of visual.mappings) {
    const difference = differences.get(mapping.regionId);
    const entries = sourceMap.filter(entry => entry.regionId === mapping.regionId);
    if (mapping.support === "unsupported") {
      if (difference === undefined || difference.disposition === "accept-unverified") throw new Error("VISUAL_DIFFERENCE_REQUIRED");
    } else if (mapping.support === "supported_unverified" && difference?.disposition !== "omit" && difference?.disposition !== "accept-unverified") {
      throw new Error("VISUAL_ACKNOWLEDGEMENT_REQUIRED");
    }
    if (difference?.disposition === "omit") {
      if (difference.capabilityId !== null || entries.length > 0) throw new Error("VISUAL_OMITTED_REGION_HAS_COMPONENTS");
      continue;
    }
    if (entries.length === 0) throw new Error("VISUAL_REGION_WITHOUT_COMPONENTS");
    const capabilityId = difference?.disposition === "substitute" ? difference.capabilityId : mapping.capabilityId;
    if (capabilityId === null || getVisualCapabilitySurface(capabilityId)?.eligible !== true) throw new Error("VISUAL_CAPABILITY_UNSUPPORTED");
    if (difference !== undefined && difference.capabilityId !== capabilityId) throw new Error("VISUAL_CAPABILITY_MISMATCH");
    if (entries.some(entry => controls.get(entry.componentId)!.capabilityId !== capabilityId)) throw new Error("VISUAL_CAPABILITY_MISMATCH");
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    const dataRequirement = visual.spec.regions.find(region => region.id === mapping.regionId)!.dataRequirement;
    if (dataRequirement !== undefined) {
      const control = entries.length === 1 ? controls.get(entries[0]!.componentId) : undefined;
      const snapshot = visual.dataSnapshots!.find(item => item.regionId === mapping.regionId)!;
      if (control?.capabilityId !== "text" || control.nativeProperties.text !== snapshot.value
        || materialization.interactions.eventBindings.some(event => event.ownerInstanceName === control.instanceName)) {
        throw new Error("VISUAL_NATIVE_DATA_REQUIREMENT_MISMATCH");
      }
    }
    // end
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    const requirement = visual.spec.regions.find(region => region.id === mapping.regionId)!.interactionRequirement;
    if (requirement !== undefined) {
      const control = entries.length === 1 ? controls.get(entries[0]!.componentId) : undefined;
      const events = materialization.interactions.eventBindings.filter(event => event.ownerInstanceName === control?.instanceName);
      const event = events.length === 1 ? events[0] : undefined;
      const action = event?.nativeActionIds.length === 1
        ? materialization.interactions.actions.find(item => item.id === event.nativeActionIds[0]) : undefined;
      if (control?.capabilityId !== "button" || event?.kfEvent !== "onClick" || event.phase !== "event" || event.scriptModuleIds.length !== 0
        || action?.kind !== "show-feedback" || action.ownerInstanceName !== control.instanceName
        || action.message !== requirement.message || action.level !== requirement.level) {
        throw new Error("VISUAL_NATIVE_INTERACTION_REQUIREMENT_MISMATCH");
      }
    }
    // end
  }
  return sourceMap.sort((left, right) => left.regionId < right.regionId ? -1 : left.regionId > right.regionId ? 1
    : left.componentId < right.componentId ? -1 : left.componentId > right.componentId ? 1 : 0);
}

export function buildGenerationSnapshotContent(input: { workspaceId: string; baseRevisionId: string; artifact: unknown; materialization: unknown; assetManifest: unknown; visual: unknown }): GenerationSnapshotContent {
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  const visual = input.visual === null ? null : VisualGenerationReferenceSchema.parse(input.visual);
  const materialization = TrustedNativeMaterializationSchema.parse(input.materialization);
  const content = GenerationSnapshotContentSchema.parse({ schema: "kf-generation-snapshot/v1", artifact: input.artifact,
    materialization, assetManifest: input.assetManifest, visual, sourceMap: visual === null ? [] : buildVisualSourceMap({ visual, materialization }) });
  // end
  if (content.materialization.workspaceId !== input.workspaceId || content.materialization.baseRevisionId !== input.baseRevisionId) throw new Error("GENERATION_SCOPE_MISMATCH");
  if (content.materialization.creativeArtifactHash !== canonicalCreativeBuildArtifactHash(content.artifact)) throw new Error("GENERATION_ARTIFACT_HASH_MISMATCH");
  const verifiedAssets = content.artifact.evidence.verifiedAssets.map(asset => asset.approvedAsset);
  const byAssetId = new Map(content.assetManifest.map(asset => [asset.workspaceAssetId, asset]));
  if (byAssetId.size !== content.assetManifest.length || verifiedAssets.length !== content.assetManifest.length
    || verifiedAssets.some(asset => canonicalServerHash(asset) !== canonicalServerHash(byAssetId.get(asset.workspaceAssetId)))) {
    throw new Error("GENERATION_ASSET_MANIFEST_MISMATCH");
  }
  content.assetManifest.sort((left, right) => left.workspaceAssetId < right.workspaceAssetId ? -1 : left.workspaceAssetId > right.workspaceAssetId ? 1 : 0);
  content.sourceMap = content.visual === null ? [] : buildVisualSourceMap({ visual: content.visual, materialization: content.materialization });
  // No clock, random IDs or mutable native drafts participate in this content hash.
  return content;
}
// end
