import type {
  CapabilityCandidateBundle,
  ControlNode,
  SemanticValue,
  SolutionImplementationPlan,
  SolutionNode,
} from "@kf/contracts";

export interface TabPaneOwnershipBinding {
  readonly semanticPageId: string;
  readonly sourceBlueprintPageId: string;
  readonly ownerSemanticControlId: string;
  readonly paneSemanticControlId: string;
  readonly tabId: string;
  readonly label: string;
  readonly sourceBlueprintRegionId: string;
}

export class TabPaneOwnershipError extends Error {
  readonly code: string;
  readonly nodeId: string;

  constructor(code: string, nodeId: string, detail: string) {
    super(`${code} at ${nodeId}: ${detail}`);
    this.name = "TabPaneOwnershipError";
    this.code = code;
    this.nodeId = nodeId;
  }
}

interface IndexedNode {
  readonly node: SolutionNode;
  readonly semanticPageId: string;
  readonly sourceBlueprintPageId: string;
  readonly parentId?: string;
}

interface OwnedTabDefinition {
  readonly id: string;
  readonly label: string;
  readonly regionId: string;
  readonly paneNodeId: string;
}

function fail(code: string, nodeId: string, detail: string): never {
  throw new TabPaneOwnershipError(code, nodeId, detail);
}

function literalSemanticValue(value: SemanticValue, ownerId: string): unknown {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value.kind === "repeater-field") fail("COMPONENT_TAB_LITERAL_REQUIRED", ownerId, `${value.itemAlias}.${value.field}`);
  if (value.kind === "list") return value.items.map((item) => literalSemanticValue(item, ownerId));
  return Object.fromEntries(value.fields.map((field) => [field.name, literalSemanticValue(field.value, ownerId)]));
}

function ownedTabs(node: ControlNode): readonly OwnedTabDefinition[] | undefined {
  const tabProperties = node.properties.filter((property) => property.name === "tabs");
  if (tabProperties.length !== 1) fail("COMPONENT_TAB_CONTENT_REQUIRED", node.id, `${tabProperties.length} tabs properties`);
  const decoded = literalSemanticValue(tabProperties[0]!.value, node.id);
  if (!Array.isArray(decoded) || decoded.length === 0) fail("COMPONENT_TAB_CONTENT_REQUIRED", node.id, "tabs list is empty");
  const records = decoded.map((entry, index) => {
    if (entry === null || typeof entry !== "object" || Array.isArray(entry)) {
      return fail("COMPONENT_TAB_CONTENT_REQUIRED", node.id, `tabs.${index} is not a record`);
    }
    return entry as Record<string, unknown>;
  });
  const hasOwnership = records.some((record) => record["regionId"] !== undefined || record["paneNodeId"] !== undefined);
  if (!hasOwnership) return undefined;
  if (records.length < 2) fail("COMPONENT_TAB_PANE_COUNT_INVALID", node.id, "at least two owned panes are required");
  return records.map((record, index) => {
    const id = record["id"];
    const label = record["label"];
    const regionId = record["regionId"];
    const paneNodeId = record["paneNodeId"];
    if (typeof id !== "string" || typeof label !== "string" || typeof regionId !== "string" || typeof paneNodeId !== "string") {
      return fail("COMPONENT_TAB_OWNERSHIP_REQUIRED", node.id, `tabs.${index}`);
    }
    return { id, label, regionId, paneNodeId };
  });
}

function indexPlanNodes(plan: SolutionImplementationPlan): readonly IndexedNode[] {
  const indexed: IndexedNode[] = [];
  const visit = (
    node: SolutionNode,
    semanticPageId: string,
    sourceBlueprintPageId: string,
    parentId?: string,
  ): void => {
    indexed.push({ node, semanticPageId, sourceBlueprintPageId, ...(parentId === undefined ? {} : { parentId }) });
    if (node.kind === "layout") node.children.forEach((child) => visit(child, semanticPageId, sourceBlueprintPageId, node.id));
    else if (node.kind === "registered-module") node.slots.forEach((slot) =>
      slot.children.forEach((child) => visit(child, semanticPageId, sourceBlueprintPageId, node.id)));
    else if (node.kind === "repeater") visit(node.template, semanticPageId, sourceBlueprintPageId, node.id);
  };
  plan.pages.forEach((page) => visit(page.root, page.id, page.sourceBlueprintPageId));
  return indexed;
}

/**
 * Re-derives native Tabs pane ownership from validated semantic ids and exact
 * blueprint-region provenance. No model-authored native parent/region is read.
 */
export function deriveSemanticTabPaneOwnership(
  plan: SolutionImplementationPlan,
): readonly TabPaneOwnershipBinding[] {
  const indexed = indexPlanNodes(plan);
  const nodesById = new Map<string, IndexedNode[]>();
  indexed.forEach((entry) => nodesById.set(entry.node.id, [...(nodesById.get(entry.node.id) ?? []), entry]));
  const result: TabPaneOwnershipBinding[] = [];
  for (const owner of indexed) {
    if (owner.node.kind !== "control" || owner.node.capabilityId !== "tabs") continue;
    const tabs = ownedTabs(owner.node);
    if (tabs === undefined) continue; // Explicit compatibility for direct/legacy label-only Tabs.
    if (owner.node.tabIds.length !== tabs.length || owner.node.tabIds.some((id, index) => id !== tabs[index]!.id)) {
      fail("COMPONENT_TAB_ID_MISMATCH", owner.node.id, `${owner.node.tabIds.join(",")} != ${tabs.map((tab) => tab.id).join(",")}`);
    }
    const activeProperties = owner.node.properties.filter((property) => property.name === "activeId");
    if (activeProperties.length > 1) fail("COMPONENT_TAB_ACTIVE_ID_INVALID", owner.node.id, "duplicate activeId");
    const activeId = activeProperties.length === 0
      ? tabs[0]!.id
      : literalSemanticValue(activeProperties[0]!.value, owner.node.id);
    if (typeof activeId !== "string" || !owner.node.tabIds.includes(activeId)) {
      fail("COMPONENT_TAB_ACTIVE_ID_INVALID", owner.node.id, String(activeId));
    }
    const tabIds = new Set<string>();
    const regions = new Set<string>();
    const panes = new Set<string>();
    for (const tab of tabs) {
      if (tabIds.has(tab.id)) fail("COMPONENT_TAB_ID_MISMATCH", owner.node.id, `duplicate ${tab.id}`);
      if (regions.has(tab.regionId)) fail("COMPONENT_TAB_REGION_DUPLICATE", owner.node.id, tab.regionId);
      if (panes.has(tab.paneNodeId)) fail("COMPONENT_TAB_PANE_DUPLICATE", owner.node.id, tab.paneNodeId);
      tabIds.add(tab.id); regions.add(tab.regionId); panes.add(tab.paneNodeId);
      const paneMatches = nodesById.get(tab.paneNodeId) ?? [];
      if (paneMatches.length === 0) fail("COMPONENT_TAB_PANE_MISSING", owner.node.id, tab.paneNodeId);
      const pane = paneMatches.find((entry) => entry.semanticPageId === owner.semanticPageId);
      if (pane === undefined) fail("COMPONENT_TAB_PANE_CROSS_PAGE", owner.node.id, tab.paneNodeId);
      if (paneMatches.length !== 1 || pane.node.id === owner.node.id) {
        fail("COMPONENT_TAB_PANE_DUPLICATE", owner.node.id, tab.paneNodeId);
      }
      if (pane.parentId !== owner.parentId) {
        fail("COMPONENT_TAB_PANE_OWNER_INVALID", owner.node.id, `${tab.paneNodeId} is not an owner sibling`);
      }
      if (!pane.node.sourceBlueprintRegionIds.includes(tab.regionId)) {
        fail("COMPONENT_TAB_PANE_REGION_MISMATCH", owner.node.id, `${tab.paneNodeId}/${tab.regionId}`);
      }
      result.push(Object.freeze({
        semanticPageId: owner.semanticPageId,
        sourceBlueprintPageId: owner.sourceBlueprintPageId,
        ownerSemanticControlId: owner.node.id,
        paneSemanticControlId: pane.node.id,
        tabId: tab.id,
        label: tab.label,
        sourceBlueprintRegionId: tab.regionId,
      }));
    }
  }
  return Object.freeze(result);
}

export function deriveTabPaneOwnership(
  plan: SolutionImplementationPlan,
  bundle: CapabilityCandidateBundle,
): readonly TabPaneOwnershipBinding[] {
  const bindings = deriveSemanticTabPaneOwnership(plan);
  for (const binding of bindings) {
    const samePageRegions = bundle.regions.filter((region) =>
      region.pageId === binding.sourceBlueprintPageId
      && region.regionId === binding.sourceBlueprintRegionId);
    if (samePageRegions.length !== 1) {
      const elsewhere = bundle.regions.some((region) =>
        region.regionId === binding.sourceBlueprintRegionId
        && region.pageId !== binding.sourceBlueprintPageId);
      fail(
        elsewhere ? "COMPONENT_TAB_REGION_CROSS_PAGE" : "COMPONENT_TAB_REGION_MISSING",
        binding.ownerSemanticControlId,
        binding.sourceBlueprintRegionId,
      );
    }
  }
  return bindings;
}
