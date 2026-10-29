// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { LayoutNodeSchema, readAddressableVisualSemanticGraph, type CapabilityCandidateBundle, type CustomerSolutionBlueprint,
  type VisualPlanningContext, resolveVisualBlueprintSources } from "@kf/contracts";
import { layoutCapabilityIdsFor, suggestVisualContainerArrangement } from "@kf/domain-client";

/** Only this source region's candidate layouts may provide inner row/column arrangements. */
export function visualLayoutAdmission(requiredCapabilityId: string, region: CapabilityCandidateBundle["regions"][number] | undefined) {
  const allowed = new Set(region?.layouts.map(layout => layout.id));
  const directLayoutKinds = LayoutNodeSchema.shape.layout.options.filter(kind => {
    const ids = layoutCapabilityIdsFor(kind); return ids.length === 1 && ids[0] === requiredCapabilityId;
  });
  return {
    directLayoutKinds,
    availableInnerLayoutKinds: directLayoutKinds.length ? (["row", "column"] as const).filter(kind => layoutCapabilityIdsFor(kind).every(id => allowed.has(id))) : [],
  };
}

/** Approved obligations and explicitly labelled draft observations; never rewrites either input. */
export function visualBindingObligations(visual: VisualPlanningContext, blueprint: CustomerSolutionBlueprint,
  candidates: CapabilityCandidateBundle, draft?: unknown) {
  const proposal = draft === undefined ? null : readAddressableVisualSemanticGraph(draft);
  const nodes = new Map(proposal?.nodes.map(node => [node.id, node]) ?? []);
  return resolveVisualBlueprintSources(blueprint, visual).map(source => {
    const region = visual.spec.regions.find(item => item.id === source.visualRegionId)!;
    const admission = visualLayoutAdmission(source.capabilityId, candidates.regions.find(item => item.pageId === source.pageId && item.regionId === source.regionId));
    const { directLayoutKinds } = admission;
    const arrangement = suggestVisualContainerArrangement(region, visual.spec.regions);
    const boundNodes = proposal?.bindings.filter(binding => binding.regionId === source.visualRegionId).map(binding => nodes.get(binding.nodeId));
    return { regionId: source.visualRegionId, pageId: source.pageId, blueprintRegionId: source.regionId, requiredCapabilityId: source.capabilityId,
      ...(directLayoutKinds.length ? { directLayoutKinds } : {}),
      ...(directLayoutKinds.length ? { availableInnerLayoutKinds: admission.availableInnerLayoutKinds } : {}),
      ...(arrangement && directLayoutKinds.length && !directLayoutKinds.includes(arrangement.axis)
        ? { contentArrangementHint: { axis: arrangement.axis } } : {}),
      ...(boundNodes ? { proposalBindingCount: boundNodes.length, proposalBoundNodes: boundNodes.slice(0, 4).map(node => {
        if (!node) return { missing: true };
        const payload: Record<string, unknown> = node;
        const layout = LayoutNodeSchema.shape.layout.safeParse(payload.layout);
        return { nodeId: node.id, kind: node.kind, ...(node.kind === "layout" && layout.success ? { layout: layout.data } : {}) };
      }) } : {}),
    };
  });
}
// end
// end
