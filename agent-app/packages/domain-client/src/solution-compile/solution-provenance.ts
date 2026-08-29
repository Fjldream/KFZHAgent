import {
  canonicalServerHash,
  type MockDataSet,
  type SemanticScalar,
  type SolutionImplementationPlan,
  type SolutionNode,
  type UIImplementationControlV2,
} from "@kf/contracts";
import type { ModuleRegistry } from "../modules/module-registry.js";
import { layoutCapabilityIdsFor } from "../planning/capability-retrieval.js";
import {
  replayRegisteredModuleDefinition,
  semanticValueToData,
  type SemanticDataRecord,
} from "./module-node-compiler.js";
import { deriveSemanticTabPaneOwnership, TabPaneOwnershipError } from "../implementation/tab-pane-ownership.js";

type PlanNode = SolutionNode;

export class SolutionProvenanceError extends Error {
  constructor(readonly nodeId: string, detail: string) {
    super(`SOLUTION_PROVENANCE_INVALID: ${nodeId} (${detail})`);
    this.name = "SolutionProvenanceError";
  }
}

export interface ExpectedControlProvenance {
  readonly sourceNode: PlanNode;
  readonly parentId?: string;
  readonly sourceRepeaterId?: string;
  readonly kind: "layout" | "control" | "repeater-item" | "registered-module";
}

const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

/** Correlation only, not authentication; consumers must still replay the trusted semantic projection. */
export function solutionModuleRegistryHash(plan: SolutionImplementationPlan, registry: ModuleRegistry): string {
  const identities = new Map<string, Readonly<{
    kind: string;
    version: string;
    compilerFingerprint: string;
    layoutFingerprint: string;
  }>>();
  const visit = (node: PlanNode): void => {
    if (node.kind === "layout") node.children.forEach(visit);
    else if (node.kind === "repeater") visit(node.template);
    else if (node.kind === "registered-module") {
      const definition = registry.require(node.moduleKind, node.templateVersion);
      const key = `${definition.kind}@${definition.version}`;
      identities.set(key, {
        kind: definition.kind,
        version: definition.version,
        compilerFingerprint: definition.compilerFingerprint!,
        layoutFingerprint: definition.layoutFingerprint!,
      });
      node.slots.forEach((slot) => slot.children.forEach(visit));
    }
  };
  plan.pages.forEach((page) => visit(page.root));
  plan.overlays.forEach((overlay) => visit(overlay.root));
  return canonicalServerHash([...identities.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([, identity]) => identity));
}

export function normalizeSolutionRepeaterKey(value: SemanticScalar): string {
  if (value === null || typeof value === "boolean") throw new SolutionProvenanceError("repeater-key", `unsafe key: ${String(value)}`);
  if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
    throw new SolutionProvenanceError("repeater-key", `unsafe key: ${String(value)}`);
  }
  const raw = String(value).normalize("NFKC").trim();
  if (raw.length === 0 || raw.length > 48 || FORBIDDEN_KEYS.has(raw.toLowerCase())
    || !/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(raw)) {
    throw new SolutionProvenanceError("repeater-key", `unsafe key: ${raw || "empty"}`);
  }
  const normalized = raw.toLowerCase().replace(/[ _]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalized)) throw new SolutionProvenanceError("repeater-key", `unsafe key: ${raw}`);
  return normalized;
}

function recordOf(dataSet: MockDataSet, index: number): SemanticDataRecord {
  return Object.fromEntries(dataSet.records[index]!.values.map((entry) => [entry.field, entry.value]));
}

function expandedId(prefix: string | undefined, nodeId: string): string {
  const id = prefix === undefined ? nodeId : `${prefix}--${nodeId}`;
  if (id.length > 100) throw new SolutionProvenanceError(nodeId, "expanded id exceeds 100 characters");
  return id;
}

function sameOptional(left: string | undefined, right: string | undefined): boolean {
  return left === right;
}

function sameStrings(left: readonly string[] | undefined, right: readonly string[]): boolean {
  return left !== undefined && left.length === right.length && left.every((value, index) => value === right[index]);
}

function expectedControlAssetIds(
  node: Extract<PlanNode, { kind: "control" }>,
  records: ReadonlyMap<string, SemanticDataRecord>,
): readonly string[] {
  const ids: string[] = [];
  const source = node.properties.find((property) => property.name === "src");
  if (source !== undefined) {
    const value = semanticValueToData(source.value, records, [node.id, "properties", "src"]);
    if (typeof value === "string" && value.startsWith("asset-")) ids.push(value);
  }
  const visit = (declarations: NonNullable<typeof node.styleOverride>["declarations"]): void => {
    declarations.advanced?.forEach((declaration) => {
      if (declaration.kind === "background-image") ids.push(declaration.assetId);
    });
  };
  if (node.styleOverride !== undefined) {
    visit(node.styleOverride.declarations);
    Object.values(node.styleOverride.states).forEach((declarations) => {
      if (declarations !== undefined) visit(declarations);
    });
  }
  return [...new Set(ids)].sort();
}

function exactAssetIds(control: UIImplementationControlV2, expected: readonly string[]): boolean {
  return expected.length === 0 ? control.assetIds === undefined : sameStrings(control.assetIds, expected);
}

/** Checks kind compatibility only; candidate ranking remains owned by the solution compiler. */
function isLayoutCapabilityFor(
  control: UIImplementationControlV2,
  kind: Extract<PlanNode, { kind: "layout" }>["layout"],
): boolean {
  return layoutCapabilityIdsFor(kind).includes(control.capabilityId);
}

/**
 * Validates only the compiler projection that can change semantic script API
 * target resolution. Visual/content fields remain owned by the UI compiler.
 */
export function validateSolutionControlSemanticProjection(input: Readonly<{
  plan: SolutionImplementationPlan;
  root: PlanNode;
  controls: readonly UIImplementationControlV2[];
  moduleRegistry: ModuleRegistry;
}>): ReadonlyMap<string, ExpectedControlProvenance> {
  const dataSets = new Map(input.plan.mockData.map((dataSet) => [dataSet.id, dataSet]));
  const expected = new Map<string, ExpectedControlProvenance>();
  const recordsByControl = new Map<string, ReadonlyMap<string, SemanticDataRecord>>();
  const modules = new Map<string, Readonly<{
    sourceNode: Extract<PlanNode, { kind: "registered-module" }>;
    parentId?: string;
    sourceRepeaterId?: string;
    records: ReadonlyMap<string, SemanticDataRecord>;
  }>>();

  const visit = (
    node: PlanNode,
    prefix: string | undefined,
    parentId: string | undefined,
    sourceRepeaterId: string | undefined,
    records: ReadonlyMap<string, SemanticDataRecord>,
  ): void => {
    if (node.kind === "repeater") {
      const dataSet = dataSets.get(node.mockDataId);
      if (dataSet === undefined) throw new SolutionProvenanceError(node.id, `unknown mock data: ${node.mockDataId}`);
      const baseId = expandedId(prefix, node.id);
      const keys = new Set<string>();
      dataSet.records.forEach((_record, index) => {
        const record = recordOf(dataSet, index);
        const keyValue = record[node.keyField];
        if (keyValue === undefined || Array.isArray(keyValue) || typeof keyValue === "object") {
          throw new SolutionProvenanceError(node.id, `missing scalar key field: ${node.keyField}`);
        }
        const key = normalizeSolutionRepeaterKey(keyValue);
        if (keys.has(key)) throw new SolutionProvenanceError(node.id, `normalized key collision: ${key}`);
        keys.add(key);
        const itemId = `${baseId}--${key}`;
        expected.set(itemId, {
          sourceNode: node,
          ...(parentId === undefined ? {} : { parentId }),
          sourceRepeaterId: node.id,
          kind: "repeater-item",
        });
        recordsByControl.set(itemId, records);
        const nestedRecords = new Map(records);
        nestedRecords.set(node.itemAlias, record);
        visit(node.template, itemId, itemId, node.id, nestedRecords);
      });
      return;
    }

    const id = expandedId(prefix, node.id);
    if (node.kind === "registered-module") {
      modules.set(id, {
        sourceNode: node,
        ...(parentId === undefined ? {} : { parentId }),
        ...(sourceRepeaterId === undefined ? {} : { sourceRepeaterId }),
        records,
      });
      return;
    }
    expected.set(id, {
      sourceNode: node,
      ...(parentId === undefined ? {} : { parentId }),
      ...(sourceRepeaterId === undefined ? {} : { sourceRepeaterId }),
      kind: node.kind,
    });
    recordsByControl.set(id, records);
    if (node.kind === "layout") node.children.forEach((child) => visit(child, prefix, id, sourceRepeaterId, records));
  };
  visit(input.root, undefined, undefined, undefined, new Map());

  let tabPaneBySourceNodeId: ReadonlyMap<string, ReturnType<typeof deriveSemanticTabPaneOwnership>[number]>;
  try {
    tabPaneBySourceNodeId = new Map(deriveSemanticTabPaneOwnership(input.plan)
      .map((binding) => [binding.paneSemanticControlId, binding] as const));
  } catch (error) {
    if (error instanceof TabPaneOwnershipError) throw new SolutionProvenanceError(error.nodeId, error.code);
    throw error;
  }

  const surface = [
    ...input.plan.pages.map((page) => ({ rootId: page.root.id, sourceBlueprintPageId: page.sourceBlueprintPageId })),
    ...input.plan.overlays.map((overlay) => ({ rootId: overlay.root.id, sourceBlueprintPageId: overlay.sourceBlueprintPageId })),
  ].find((candidate) => candidate.rootId === input.root.id);
  if (surface === undefined) throw new SolutionProvenanceError(input.root.id, "surface is not owned by the authoritative plan");

  const actualById = new Map(input.controls.map((control) => [control.id, control]));
  const validated = new Map<string, ExpectedControlProvenance>();
  for (const id of expected.keys()) {
    if (!actualById.has(id)) throw new SolutionProvenanceError(id, "expected expanded control is missing");
  }
  for (const control of input.controls.filter((candidate) => candidate.sourceModuleId === undefined)) {
    const provenance = expected.get(control.id);
    const tabPane = tabPaneBySourceNodeId.get(control.sourceSolutionNodeId);
    const expectedParentId = tabPane?.ownerSemanticControlId ?? provenance?.parentId;
    if (provenance === undefined
      || control.sourceSolutionNodeId !== control.id
      || !sameOptional(control.parentId, expectedParentId)
      || (tabPane === undefined) !== (control.tabPane === undefined)
      || (tabPane !== undefined && (control.tabPane?.ownerSemanticControlId !== tabPane.ownerSemanticControlId
        || control.tabPane.tabId !== tabPane.tabId
        || control.tabPane.sourceBlueprintRegionId !== tabPane.sourceBlueprintRegionId))
      || !sameOptional(control.sourceRepeaterId, provenance.sourceRepeaterId)
      || control.sourceBlueprintPageId !== surface.sourceBlueprintPageId
      || !sameStrings(control.sourceBlueprintRegionIds, provenance.sourceNode.sourceBlueprintRegionIds)
      || control.fallbackCapabilityId !== undefined) {
      throw new SolutionProvenanceError(control.id, "expanded source, repeater, or parent correlation mismatch");
    }
    if (provenance.kind === "control" && provenance.sourceNode.kind === "control") {
      const reviewedInteractiveText = provenance.sourceNode.capabilityId === "text"
        && control.capabilityId === "button"
        && control.role === "interactive-text"
        && provenance.sourceNode.eventBindings.some((binding) => binding.semanticEvent === "click");
      if (control.capabilityId !== provenance.sourceNode.capabilityId && !reviewedInteractiveText) {
        throw new SolutionProvenanceError(control.id, "control capability mismatch");
      }
      if (!exactAssetIds(control, expectedControlAssetIds(provenance.sourceNode, recordsByControl.get(control.id)!))) {
        throw new SolutionProvenanceError(control.id, "control asset ownership mismatch");
      }
      const mockDataId = provenance.sourceNode.mockDataId;
      if (mockDataId === undefined) {
        if (control.dataBinding !== undefined) throw new SolutionProvenanceError(control.id, "unexpected data binding");
      } else {
        const dataSet = dataSets.get(mockDataId);
        const records = dataSet?.records.map((_record, index) => recordOf(dataSet, index));
        if (dataSet === undefined || control.dataBinding?.mockDataId !== mockDataId
          || control.dataBinding.recordKey !== undefined || !Array.isArray(control.dataBinding.records)
          || canonicalServerHash(control.dataBinding.records) !== canonicalServerHash(records)) {
          throw new SolutionProvenanceError(control.id, "mock-data binding mismatch");
        }
      }
    } else if (provenance.kind === "repeater-item") {
      if (control.role !== "repeater-item" || !isLayoutCapabilityFor(control, "column") || control.compiledLayout?.kind !== "column"
        || control.dataBinding !== undefined || control.assetIds !== undefined) {
        throw new SolutionProvenanceError(control.id, "repeater item layout mismatch");
      }
    } else if (provenance.sourceNode.kind === "layout") {
      if (!isLayoutCapabilityFor(control, provenance.sourceNode.layout) || control.compiledLayout?.kind !== provenance.sourceNode.layout
        || control.dataBinding !== undefined || control.assetIds !== undefined) {
        throw new SolutionProvenanceError(control.id, "layout capability mismatch");
      }
    }
    validated.set(control.id, provenance);
  }

  for (const [moduleId, module] of modules) {
    const controls = input.controls.filter((control) => control.sourceModuleId === moduleId);
    if (controls.length === 0) throw new SolutionProvenanceError(moduleId, "registered-module output is missing");
    const roots = controls.filter((control) => control.parentId === module.parentId);
    if (roots.length !== 1) throw new SolutionProvenanceError(moduleId, "registered-module must have one external root");
    const root = roots[0]!;
    const replay = replayRegisteredModuleDefinition({
      plan: input.plan,
      node: { ...module.sourceNode, id: moduleId },
      layoutNode: { id: moduleId, kind: "registered-module", layout: undefined, geometry: root.geometry },
      moduleRegistry: input.moduleRegistry,
      currentRecords: module.records,
      ...(module.sourceNode.assetId === undefined ? {} : { resolvedAsset: { assetId: module.sourceNode.assetId, status: "resolved" } }),
    });
    if (replay.components.length !== controls.length) throw new SolutionProvenanceError(moduleId, "registered-module output count mismatch");
    for (const component of replay.components) {
      const id = `${moduleId}--${component.id}`;
      const control = actualById.get(id);
      const localParent = component.properties.parentId;
      const expectedParent = typeof localParent === "string" ? `${moduleId}--${localParent}` : module.parentId;
      if (control === undefined || control.sourceSolutionNodeId !== moduleId || control.sourceModuleId !== moduleId
        || !sameOptional(control.sourceRepeaterId, module.sourceRepeaterId) || control.parentId !== expectedParent
        || control.capabilityId !== component.capabilityId || control.role !== component.role || control.critical !== component.critical
        || control.sourceBlueprintPageId !== surface.sourceBlueprintPageId
        || !sameStrings(control.sourceBlueprintRegionIds, module.sourceNode.sourceBlueprintRegionIds)
        || control.fallbackCapabilityId !== component.fallbackCapabilityId
        || control.dataBinding !== undefined
        || !exactAssetIds(control, module.sourceNode.assetId !== undefined && component.capabilityId === "image" ? [module.sourceNode.assetId] : [])) {
        throw new SolutionProvenanceError(id, "registered-module output provenance mismatch");
      }
      const provenance: ExpectedControlProvenance = {
        sourceNode: module.sourceNode,
        ...(expectedParent === undefined ? {} : { parentId: expectedParent }),
        ...(module.sourceRepeaterId === undefined ? {} : { sourceRepeaterId: module.sourceRepeaterId }),
        kind: "registered-module",
      };
      validated.set(id, provenance);
    }
  }

  if (validated.size !== input.controls.length) {
    const unknown = input.controls.find((control) => !validated.has(control.id));
    throw new SolutionProvenanceError(unknown?.id ?? input.root.id, "unexpected compiled control provenance");
  }
  return validated;
}
