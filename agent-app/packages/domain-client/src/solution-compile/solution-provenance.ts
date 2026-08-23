import {
  canonicalServerHash,
  type MockDataSet,
  type ModulePlanModule,
  type SemanticScalar,
  type SolutionImplementationPlan,
  type SolutionNode,
  type UIImplementationControlV2,
} from "@kf/contracts";
import type { ModuleRegistry } from "../modules/module-registry.js";
import { semanticValueToData, type SemanticDataRecord } from "./module-node-compiler.js";

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

function moduleInstance(node: Extract<PlanNode, { kind: "registered-module" }>, definition: ReturnType<ModuleRegistry["require"]>, content: SemanticDataRecord): ModulePlanModule {
  return {
    id: node.id,
    kind: node.moduleKind,
    templateVersion: node.templateVersion,
    variant: node.variant,
    title: node.title,
    content: JSON.stringify(content),
    placement: {
      region: definition.layout.regions[0]!,
      order: Math.min(100, node.intent.readingOrder),
      columnSpan: definition.layout.maxColumnSpan,
      preferredHeight: definition.layout.preferredHeights[0]!,
      alignment: node.intent.align,
      emphasis: node.intent.importance === "primary" ? "primary" : node.intent.importance === "secondary" ? "secondary" : "subtle",
    },
    interactions: [],
    ...(node.assetId === undefined ? {} : { assetId: node.assetId }),
    sourceBlueprintModuleIds: [...node.sourceBlueprintRegionIds],
  };
}

export function validateSolutionControlProvenance(input: Readonly<{
  plan: SolutionImplementationPlan;
  root: PlanNode;
  controls: readonly UIImplementationControlV2[];
  moduleRegistry: ModuleRegistry;
}>): ReadonlyMap<string, ExpectedControlProvenance> {
  const dataSets = new Map(input.plan.mockData.map((dataSet) => [dataSet.id, dataSet]));
  const expected = new Map<string, ExpectedControlProvenance>();
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
    if (node.kind === "layout") node.children.forEach((child) => visit(child, prefix, id, sourceRepeaterId, records));
  };
  visit(input.root, undefined, undefined, undefined, new Map());

  const actualById = new Map(input.controls.map((control) => [control.id, control]));
  const validated = new Map<string, ExpectedControlProvenance>();
  for (const id of expected.keys()) {
    if (!actualById.has(id)) throw new SolutionProvenanceError(id, "expected expanded control is missing");
  }
  for (const control of input.controls.filter((candidate) => candidate.sourceModuleId === undefined)) {
    const provenance = expected.get(control.id);
    if (provenance === undefined
      || control.sourceSolutionNodeId !== control.id
      || !sameOptional(control.parentId, provenance.parentId)
      || !sameOptional(control.sourceRepeaterId, provenance.sourceRepeaterId)) {
      throw new SolutionProvenanceError(control.id, "expanded source, repeater, or parent correlation mismatch");
    }
    if (provenance.kind === "control" && provenance.sourceNode.kind === "control") {
      if (control.capabilityId !== provenance.sourceNode.capabilityId) throw new SolutionProvenanceError(control.id, "control capability mismatch");
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
      if (control.role !== "repeater-item" || !control.capabilityId.startsWith("layout.") || control.compiledLayout?.kind !== "column") {
        throw new SolutionProvenanceError(control.id, "repeater item layout mismatch");
      }
    } else if (provenance.sourceNode.kind === "layout") {
      if (!control.capabilityId.startsWith("layout.") || control.compiledLayout?.kind !== provenance.sourceNode.layout) {
        throw new SolutionProvenanceError(control.id, "layout capability mismatch");
      }
    }
    validated.set(control.id, provenance);
  }

  for (const [moduleId, module] of modules) {
    const controls = input.controls.filter((control) => control.sourceModuleId === moduleId);
    if (controls.length === 0) throw new SolutionProvenanceError(moduleId, "registered-module output is missing");
    const definition = input.moduleRegistry.require(module.sourceNode.moduleKind, module.sourceNode.templateVersion);
    const contentValue = module.sourceNode.content === undefined
      ? {}
      : semanticValueToData(module.sourceNode.content, module.records, [moduleId, "content"]);
    if (contentValue === null || Array.isArray(contentValue) || typeof contentValue !== "object") {
      throw new SolutionProvenanceError(moduleId, "registered-module content is not a record");
    }
    const content = definition.contentSchema.parse(contentValue);
    const instance = moduleInstance({ ...module.sourceNode, id: moduleId }, definition, content as SemanticDataRecord);
    const roots = controls.filter((control) => control.parentId === module.parentId);
    if (roots.length !== 1) throw new SolutionProvenanceError(moduleId, "registered-module must have one external root");
    const root = roots[0]!;
    const output = definition.compile({ context: {
      definition,
      instance,
      content,
      asset: module.sourceNode.assetId === undefined ? undefined : { assetId: module.sourceNode.assetId, status: "resolved", resolvedName: module.sourceNode.title },
      validationContext: { availableKfCapabilities: [...definition.requiredKfCapabilities], approvedAuthorizationRefs: [] },
      bounds: { x: 0, y: 0, width: root.geometry.width, height: root.geometry.height },
    } });
    if (output.components.length !== controls.length) throw new SolutionProvenanceError(moduleId, "registered-module output count mismatch");
    for (const component of output.components) {
      const id = `${moduleId}--${component.id}`;
      const control = actualById.get(id);
      const localParent = component.properties.parentId;
      const expectedParent = typeof localParent === "string" ? `${moduleId}--${localParent}` : module.parentId;
      if (control === undefined || control.sourceSolutionNodeId !== moduleId || control.sourceModuleId !== moduleId
        || !sameOptional(control.sourceRepeaterId, module.sourceRepeaterId) || control.parentId !== expectedParent
        || control.capabilityId !== component.capabilityId || control.role !== component.role || control.critical !== component.critical) {
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
