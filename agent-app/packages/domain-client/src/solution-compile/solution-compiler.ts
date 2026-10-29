import {
  ApprovedAssetFactsSchema,
  CapabilityCandidateBundleSchema,
  canonicalServerHash,
  LEGACY_MODULE_PLAN_CANDIDATE_BUNDLE_HASH,
  SolutionImplementationPlanSchema,
  UIImplementationSpecV2Schema,
  type ApprovedAssetFacts,
  type CapabilityCandidateBundle,
  type MockDataSet,
  type SemanticScalar,
  type SemanticValue,
  type SolutionImplementationPlan,
  type SolutionNode,
  type SolutionPage,
  type UIImplementationControlV2,
  type UIImplementationSpecV2,
} from "@kf/contracts";
import { requireControlDesignProfile } from "../design-knowledge/control-design-registry.js";
import { deriveTabPaneOwnership } from "../implementation/tab-pane-ownership.js";
import type { ModuleRegistry } from "../modules/module-registry.js";
import { assertSolutionPlanUsesCandidates } from "../planning/capability-retrieval.js";
import { KF36_RUNTIME_PROFILE } from "../style/runtime-profile.js";
import {
  assertPersistedStyleHandoffComplete,
  compileResolvedStyle,
} from "../style/style-engine.js";
import { resolveStyle } from "../style/theme-resolver.js";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { expandLayoutIntrinsic, resolveLayoutContentInsets, type LayoutContentInsets } from "./layout-surface.js";
// end
import { compileComponents, compileOverlay } from "./component-compiler.js";
import {
  measureIntrinsic,
  type IntrinsicSize,
} from "./intrinsic-measure.js";
import {
  assertImplementationMatchesCompiledLayout,
  compileLayout,
  type CompiledLayoutTree,
} from "./layout-compiler.js";
import type { SemanticDataRecord } from "./module-node-compiler.js";
import { normalizeSolutionRepeaterKey, solutionModuleRegistryHash } from "./solution-provenance.js";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { validateSolutionControlSemanticProjection } from "./solution-provenance.js";
// end

export interface SolutionCompileInput {
  readonly plan: SolutionImplementationPlan;
  readonly candidateBundle?: CapabilityCandidateBundle;
  readonly moduleRegistry: ModuleRegistry;
  readonly approvedAssets: readonly ApprovedAssetFacts[];
  readonly activeCatalogVersion: string;
}

// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
export interface SemanticComponentProvenance { readonly nodeId: string; readonly expandedNodeId: string; readonly componentId: string; readonly capabilityId: string }
declare const semanticProvenanceBrand: unique symbol;
export interface SemanticCompilationProvenance { readonly [semanticProvenanceBrand]: true }
const semanticProvenanceRecords = new WeakMap<SemanticCompilationProvenance, {
  planHash: string; entries: readonly SemanticComponentProvenance[];
}>();
export function compileSolutionImplementationWithProvenance(input: SolutionCompileInput) {
  const safeInput = preflightInput(input);
  const implementation = compileSolutionImplementation(safeInput);
  const plan = SolutionImplementationPlanSchema.parse(safeInput.plan);
  const entries: SemanticComponentProvenance[] = [];
  for (const page of implementation.pages) {
    if (page.compatibility !== "native") throw new Error("SEMANTIC_PROVENANCE_NATIVE_REQUIRED");
    const sourcePage = plan.pages.find(source => source.id === page.id)!;
    const byId = new Map(page.controls.map(control => [control.id, control]));
    const overlayOwner = (control: UIImplementationControlV2): string | undefined => {
      const seen = new Set<string>();
      let current: UIImplementationControlV2 | undefined = control;
      while (current !== undefined) {
        if (seen.has(current.id)) throw new Error("SEMANTIC_PROVENANCE_PARENT_CYCLE");
        seen.add(current.id);
        if (current.overlayHost !== undefined) return current.overlayHost.overlayId;
        current = current.parentId === undefined ? undefined : byId.get(current.parentId);
      }
      return undefined;
    };
    const owners = new Map(page.controls.map(control => [control.id, overlayOwner(control)]));
    const surfaces = [{ root: sourcePage.root, controls: page.controls.filter(control => owners.get(control.id) === undefined) },
      ...plan.overlays.filter(overlay => overlay.hostPageId === page.id).map(overlay => ({ root: overlay.root,
        controls: page.controls.filter(control => owners.get(control.id) === overlay.id) }))];
    for (const surface of surfaces) {
      const expected = validateSolutionControlSemanticProjection({ plan, root: surface.root,
        controls: surface.controls, moduleRegistry: safeInput.moduleRegistry });
      for (const control of surface.controls) {
        const source = expected.get(control.id);
        if (source === undefined) throw new Error("SEMANTIC_PROVENANCE_COMPONENT_MISSING");
        entries.push(Object.freeze({ nodeId: source.sourceNode.id, expandedNodeId: control.sourceSolutionNodeId,
          componentId: control.id, capabilityId: control.capabilityId }));
      }
    }
  }
  const provenance = Object.freeze({}) as SemanticCompilationProvenance;
  semanticProvenanceRecords.set(provenance, { planHash: canonicalServerHash(plan),
    entries: Object.freeze(entries.sort((left, right) => compareCodePoints(left.componentId, right.componentId))) });
  return Object.freeze({ implementation, provenance });
}
export function readSemanticCompilationProvenance(handle: SemanticCompilationProvenance, plan: SolutionImplementationPlan): readonly SemanticComponentProvenance[] {
  const record = semanticProvenanceRecords.get(handle);
  if (record === undefined) throw new Error("SEMANTIC_PROVENANCE_REQUIRED");
  if (record.planHash !== canonicalServerHash(plan)) throw new Error("SEMANTIC_PROVENANCE_PLAN_MISMATCH");
  return record.entries;
}
// end

export type SolutionCompilePhase =
  | "parse"
  | "candidate-validation"
  | "expansion"
  | "measurement"
  | "layout"
  | "component"
  | "style"
  | "assembly"
  | "validation";

export class SolutionCompileError extends Error {
  readonly code = "SOLUTION_COMPILE_FAILED" as const;
  readonly phase: SolutionCompilePhase;
  readonly nodeId: string;
  readonly alternatives: readonly string[];
  readonly reasonCode: string;

  constructor(
    phase: SolutionCompilePhase,
    nodeId: string,
    reasonCode: string,
    detail: string,
    alternatives: readonly string[] = [],
    options?: ErrorOptions,
  ) {
    const stableAlternatives = [...new Set(alternatives)].sort(compareCodePoints).slice(0, 5);
    super(`SOLUTION_COMPILE_FAILED [${phase}/${reasonCode}] ${nodeId}: ${detail}`, options);
    this.name = "SolutionCompileError";
    this.phase = phase;
    this.nodeId = nodeId;
    this.reasonCode = reasonCode;
    this.alternatives = Object.freeze(stableAlternatives);
  }
}

interface ExpansionContext {
  readonly dataSets: ReadonlyMap<string, MockDataSet>;
  readonly records: ReadonlyMap<string, SemanticDataRecord>;
  readonly budget: ExpansionBudget;
  readonly prefix?: string;
  readonly sourceRepeaterId?: string;
}

interface ExpansionBudget {
  remaining: number;
}

interface PageCompilation {
  readonly page: SolutionPage;
  readonly expandedRoot: SolutionNode;
  readonly layout: CompiledLayoutTree;
}

interface MutableNativePage {
  compatibility: "native";
  id: string;
  width: number;
  height: number;
  sourceBlueprintPageId: string;
  controls: UIImplementationControlV2[];
}

const EMPTY_STYLE = Object.freeze({ declarations: Object.freeze({}), states: Object.freeze({}) });
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const MAX_EXPANDED_SOLUTION_NODES = 500;
const MAX_INPUT_STRUCTURE_DEPTH = 64;
const MAX_INPUT_STRUCTURE_VALUES = 50_000;
type ComponentStyleSpecV2 = NonNullable<UIImplementationControlV2["style"]>;
type StructuredBoundaryValue = null | string | number | boolean | object;

interface StructureFrame {
  readonly value: StructuredBoundaryValue;
  readonly depth: number;
  readonly exiting: boolean;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function dependencyReason(error: Error): string {
  const match = /\b([A-Z][A-Z0-9_]{2,})\b/.exec(error.message);
  return match?.[1] ?? error.name.replace(/[^A-Za-z0-9]+/g, "_").toUpperCase();
}

function stableDetail(error: Error): string {
  return error.message.replace(/\s+/g, " ").trim().slice(0, 500);
}

function fail(
  phase: SolutionCompilePhase,
  nodeId: string,
  reasonCode: string,
  detail: string,
  alternatives: readonly string[] = [],
  cause?: Error,
): never {
  throw new SolutionCompileError(
    phase,
    nodeId,
    reasonCode,
    detail,
    alternatives,
    cause === undefined ? undefined : { cause },
  );
}

function boundary<T>(phase: SolutionCompilePhase, nodeId: string, run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof SolutionCompileError) throw error;
    if (error instanceof Error) {
      fail(phase, nodeId, dependencyReason(error), stableDetail(error), [], error);
    }
    fail(phase, nodeId, "NON_ERROR_THROWN", "dependency threw a non-Error value");
  }
}

function inspectInput<T>(run: () => T): T {
  try {
    return run();
  } catch (error) {
    if (error instanceof SolutionCompileError) throw error;
    fail("parse", "$", "INPUT_INSPECTION_FAILED", "structured input could not be inspected safely");
  }
}

function ownInputField(
  input: object,
  key: keyof SolutionCompileInput,
  required: boolean,
): StructuredBoundaryValue | undefined {
  const descriptor = inspectInput(() => Object.getOwnPropertyDescriptor(input, key));
  if (descriptor === undefined) {
    if (required) fail("parse", "$", "INPUT_FIELD_MISSING", String(key));
    return undefined;
  }
  if (!("value" in descriptor)) {
    fail("parse", "$", "INPUT_ACCESSOR_FORBIDDEN", String(key));
  }
  return descriptor.value as StructuredBoundaryValue;
}

function assertPlainStructuredData(root: StructuredBoundaryValue, rootName: string): void {
  const stack: StructureFrame[] = [{ value: root, depth: 0, exiting: false }];
  const active = new WeakSet<object>();
  const visited = new WeakSet<object>();
  let valueCount = 0;
  while (stack.length > 0) {
    const frame = stack.pop()!;
    if (frame.exiting) {
      if (typeof frame.value === "object" && frame.value !== null) {
        active.delete(frame.value);
        visited.add(frame.value);
      }
      continue;
    }
    valueCount += 1;
    if (valueCount > MAX_INPUT_STRUCTURE_VALUES) {
      fail("parse", rootName, "INPUT_SIZE_EXCEEDED", `structured input exceeds ${MAX_INPUT_STRUCTURE_VALUES} values`);
    }
    if (frame.depth > MAX_INPUT_STRUCTURE_DEPTH) {
      fail("parse", rootName, "INPUT_DEPTH_EXCEEDED", `structured input exceeds depth ${MAX_INPUT_STRUCTURE_DEPTH}`);
    }
    const valueType: string = typeof frame.value;
    if (valueType !== "object" && valueType !== "string" && valueType !== "number" && valueType !== "boolean") {
      fail("parse", rootName, "INPUT_NON_PLAIN_DATA", "structured input contains a non-data value");
    }
    if (valueType === "number" && !Number.isFinite(frame.value)) {
      fail("parse", rootName, "INPUT_NON_PLAIN_DATA", "structured input numbers must be finite");
    }
    if (typeof frame.value !== "object" || frame.value === null) continue;
    const objectValue = frame.value;
    if (active.has(objectValue)) fail("parse", rootName, "INPUT_CYCLE", "structured input contains a cycle");
    if (visited.has(objectValue)) continue;
    const prototype: object | null = inspectInput(() => Object.getPrototypeOf(objectValue) as object | null);
    const isArray = Array.isArray(objectValue);
    if ((!isArray && prototype !== Object.prototype) || (isArray && prototype !== Array.prototype)) {
      fail("parse", rootName, "INPUT_NON_PLAIN_DATA", "structured input must contain only plain objects and arrays");
    }
    active.add(objectValue);
    stack.push({ value: objectValue, depth: frame.depth, exiting: true });
    const keys = inspectInput(() => Reflect.ownKeys(objectValue));
    if (isArray) {
      const lengthDescriptor = inspectInput(() => Object.getOwnPropertyDescriptor(objectValue, "length"));
      const arrayLength = lengthDescriptor?.value as number;
      if (!Number.isSafeInteger(arrayLength) || arrayLength < 0) {
        fail("parse", rootName, "INPUT_NON_PLAIN_DATA", "structured array length is invalid");
      }
      if (arrayLength > MAX_INPUT_STRUCTURE_VALUES) {
        fail("parse", rootName, "INPUT_SIZE_EXCEEDED", `structured array exceeds ${MAX_INPUT_STRUCTURE_VALUES} values`);
      }
      const elementKeys = keys.filter((key) => key !== "length");
      if (elementKeys.length !== arrayLength || elementKeys.some((key) =>
        typeof key !== "string" || !/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= arrayLength)) {
        fail("parse", rootName, "INPUT_NON_PLAIN_DATA", "structured arrays must be dense and index-only");
      }
    }
    for (let index = keys.length - 1; index >= 0; index -= 1) {
      const key = keys[index]!;
      if (isArray && key === "length") continue;
      if (typeof key !== "string") {
        fail("parse", rootName, "INPUT_NON_PLAIN_DATA", "structured input cannot contain symbol properties");
      }
      const descriptor = inspectInput(() => Object.getOwnPropertyDescriptor(objectValue, key));
      if (descriptor === undefined) fail("parse", rootName, "INPUT_INSPECTION_FAILED", "input property disappeared during inspection");
      if (!("value" in descriptor)) fail("parse", rootName, "INPUT_ACCESSOR_FORBIDDEN", key);
      if (descriptor.enumerable !== true) fail("parse", rootName, "INPUT_NON_PLAIN_DATA", "structured properties must be enumerable");
      stack.push({ value: descriptor.value as StructuredBoundaryValue, depth: frame.depth + 1, exiting: false });
    }
  }
}

function preflightInput(input: SolutionCompileInput): SolutionCompileInput {
  const plan = ownInputField(input, "plan", true)!;
  const candidateBundle = ownInputField(input, "candidateBundle", false);
  const moduleRegistry = ownInputField(input, "moduleRegistry", true)!;
  const approvedAssets = ownInputField(input, "approvedAssets", true)!;
  const activeCatalogVersion = ownInputField(input, "activeCatalogVersion", true)!;
  assertPlainStructuredData(plan, "plan");
  if (candidateBundle !== undefined) assertPlainStructuredData(candidateBundle, "candidateBundle");
  assertPlainStructuredData(approvedAssets, "approvedAssets");
  assertPlainStructuredData(activeCatalogVersion, "activeCatalogVersion");
  if (typeof plan !== "object" || plan === null
    || typeof moduleRegistry !== "object" || moduleRegistry === null
    || !Array.isArray(approvedAssets)
    || typeof activeCatalogVersion !== "string") {
    fail("parse", "$", "INPUT_SHAPE_INVALID", "compile input fields have invalid top-level types");
  }
  return {
    plan: plan as SolutionImplementationPlan,
    ...(candidateBundle === undefined ? {} : { candidateBundle: candidateBundle as CapabilityCandidateBundle }),
    moduleRegistry: moduleRegistry as ModuleRegistry,
    approvedAssets: approvedAssets as readonly ApprovedAssetFacts[],
    activeCatalogVersion,
  };
}

function isLegacy(plan: SolutionImplementationPlan): boolean {
  return plan.candidateBundleHash === LEGACY_MODULE_PLAN_CANDIDATE_BUNDLE_HASH;
}

function parseInput(input: SolutionCompileInput): Readonly<{
  plan: SolutionImplementationPlan;
  bundle?: CapabilityCandidateBundle;
  approvedAssets: readonly ApprovedAssetFacts[];
}> {
  const parsedPlan = SolutionImplementationPlanSchema.safeParse(input.plan);
  if (!parsedPlan.success) {
    const issue = parsedPlan.error.issues[0];
    fail("parse", issue?.path.map(String).join(".") || "$", "PLAN_INVALID", issue?.message ?? "invalid plan");
  }
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(input.activeCatalogVersion)) {
    fail("parse", "$", "CATALOG_VERSION_INVALID", input.activeCatalogVersion);
  }
  const approvedAssets = input.approvedAssets.map((asset, index) => {
    const parsed = ApprovedAssetFactsSchema.safeParse(asset);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      fail("parse", `approvedAssets.${index}`, "APPROVED_ASSET_INVALID", issue?.message ?? "invalid asset facts");
    }
    return parsed.data;
  });
  if (isLegacy(parsedPlan.data)) {
    if (input.candidateBundle !== undefined) {
      fail("parse", "$", "LEGACY_CANDIDATE_BUNDLE_FORBIDDEN", "reserved legacy plans cannot accept candidate evidence");
    }
    return { plan: parsedPlan.data, approvedAssets };
  }
  if (input.candidateBundle === undefined) {
    fail("candidate-validation", "$", "CANDIDATE_BUNDLE_REQUIRED", "native plans require exact candidate evidence");
  }
  const parsedBundle = CapabilityCandidateBundleSchema.safeParse(input.candidateBundle);
  if (!parsedBundle.success) {
    const issue = parsedBundle.error.issues[0];
    fail("candidate-validation", issue?.path.map(String).join(".") || "$", "CANDIDATE_BUNDLE_INVALID", issue?.message ?? "invalid candidate bundle");
  }
  if (parsedBundle.data.knowledgeCatalogVersion !== input.activeCatalogVersion) {
    fail(
      "candidate-validation",
      "$",
      "CATALOG_VERSION_MISMATCH",
      `${parsedBundle.data.knowledgeCatalogVersion} != ${input.activeCatalogVersion}`,
    );
  }
  boundary("candidate-validation", "$", () => assertSolutionPlanUsesCandidates(parsedPlan.data, parsedBundle.data));
  return { plan: parsedPlan.data, bundle: parsedBundle.data, approvedAssets };
}

function recordFor(dataSet: MockDataSet, index: number): SemanticDataRecord {
  const record = dataSet.records[index];
  if (record === undefined) fail("expansion", dataSet.id, "REPEATER_RECORD_MISSING", String(index));
  const result: { [key: string]: SemanticScalar } = {};
  record.values.forEach((entry) => {
    if (FORBIDDEN_KEYS.has(entry.field.toLowerCase()) || Object.hasOwn(result, entry.field)) {
      fail("expansion", dataSet.id, "REPEATER_RECORD_FIELD_INVALID", entry.field);
    }
    result[entry.field] = entry.value;
  });
  return result;
}

function resolveValue(value: SemanticValue, records: ReadonlyMap<string, SemanticDataRecord>, nodeId: string): SemanticValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value.kind === "repeater-field") {
    const record = records.get(value.itemAlias);
    if (record === undefined || !Object.hasOwn(record, value.field)) {
      fail("expansion", nodeId, "REPEATER_SCOPE_ESCAPE", `${value.itemAlias}.${value.field}`);
    }
    const resolved = record[value.field];
    if (resolved === null || typeof resolved === "string" || typeof resolved === "number" || typeof resolved === "boolean") {
      return resolved;
    }
    fail("expansion", nodeId, "REPEATER_FIELD_NON_SCALAR", `${value.itemAlias}.${value.field}`);
  }
  if (value.kind === "list") {
    return { kind: "list", items: value.items.map((item) => resolveValue(item, records, nodeId)) };
  }
  return {
    kind: "record",
    fields: value.fields.map((field) => ({ name: field.name, value: resolveValue(field.value, records, nodeId) })),
  };
}

function expandedId(id: string, prefix: string | undefined): string {
  const expanded = prefix === undefined ? id : `${prefix}--${id}`;
  if (expanded.length > 100) fail("expansion", id, "EXPANDED_ID_TOO_LONG", expanded);
  return expanded;
}

function repeaterKey(value: SemanticScalar, nodeId: string): string {
  try {
    return normalizeSolutionRepeaterKey(value);
  } catch (error) {
    fail("expansion", nodeId, "REPEATER_KEY_UNSAFE", String(value), [], error instanceof Error ? error : undefined);
  }
}

function saturatedAdd(left: number, right: number, limit: number): number {
  return left > limit - right ? limit + 1 : left + right;
}

function saturatedMultiply(left: number, right: number, limit: number): number {
  if (left === 0 || right === 0) return 0;
  return left > Math.floor(limit / right) ? limit + 1 : left * right;
}

function estimateExpandedNodeCount(
  node: SolutionNode,
  dataSets: ReadonlyMap<string, MockDataSet>,
  limit: number,
): number {
  if (node.kind === "repeater") {
    const dataSet = dataSets.get(node.mockDataId);
    if (dataSet === undefined) fail("expansion", node.id, "REPEATER_DATA_NOT_FOUND", node.mockDataId);
    if (dataSet.records.length > node.maxItems) {
      fail("expansion", node.id, "REPEATER_MAX_ITEMS_EXCEEDED", `${dataSet.records.length} > ${node.maxItems}`);
    }
    const templateCount = estimateExpandedNodeCount(node.template, dataSets, limit);
    return saturatedMultiply(dataSet.records.length, saturatedAdd(1, templateCount, limit), limit);
  }
  if (node.kind === "control") return 1;
  const children = node.kind === "layout"
    ? node.children
    : node.slots.flatMap((slot) => slot.children);
  let count = 1;
  for (const child of children) {
    count = saturatedAdd(count, estimateExpandedNodeCount(child, dataSets, limit), limit);
    if (count > limit) return count;
  }
  return count;
}

function consumeExpansionNode(context: ExpansionContext, nodeId: string): void {
  if (context.budget.remaining <= 0) {
    fail("expansion", nodeId, "EXPANSION_BUDGET_EXCEEDED", `global expanded-node budget ${MAX_EXPANDED_SOLUTION_NODES} exceeded`);
  }
  context.budget.remaining -= 1;
}

function expandNode(node: SolutionNode, context: ExpansionContext): SolutionNode[] {
  if (node.kind === "repeater") {
    const dataSet = context.dataSets.get(node.mockDataId);
    if (dataSet === undefined) fail("expansion", node.id, "REPEATER_DATA_NOT_FOUND", node.mockDataId);
    if (dataSet.records.length > node.maxItems) {
      fail("expansion", node.id, "REPEATER_MAX_ITEMS_EXCEEDED", `${dataSet.records.length} > ${node.maxItems}`);
    }
    const baseId = expandedId(node.id, context.prefix);
    const keys = new Set<string>();
    const output: SolutionNode[] = [];
    for (let index = 0; index < dataSet.records.length; index += 1) {
      const record = recordFor(dataSet, index);
      const rawKey = record[node.keyField];
      if (rawKey === undefined || Array.isArray(rawKey) || (typeof rawKey === "object" && rawKey !== null)) {
        fail("expansion", node.id, "REPEATER_KEY_MISSING", node.keyField);
      }
      const key = repeaterKey(rawKey, node.id);
      if (keys.has(key)) fail("expansion", node.id, "REPEATER_KEY_COLLISION", key);
      keys.add(key);
      const itemId = `${baseId}--${key}`;
      if (itemId.length > 100) fail("expansion", node.id, "EXPANDED_ID_TOO_LONG", itemId);
      const records = new Map(context.records);
      records.set(node.itemAlias, record);
      consumeExpansionNode(context, itemId);
      const children = expandNode(node.template, {
        dataSets: context.dataSets,
        records,
        budget: context.budget,
        prefix: itemId,
        sourceRepeaterId: node.id,
      });
      output.push({
        kind: "layout",
        id: itemId,
        layout: "column",
        sourceBlueprintRegionIds: [...node.sourceBlueprintRegionIds],
        intent: node.intent,
        children,
      });
    }
    return output;
  }

  const id = expandedId(node.id, context.prefix);
  consumeExpansionNode(context, id);
  if (node.kind === "layout") {
    const children: SolutionNode[] = [];
    for (const child of node.children) children.push(...expandNode(child, context));
    return [{
      ...node,
      id,
      children,
    }];
  }
  if (node.kind === "control") {
    return [{
      ...node,
      id,
      content: resolveValue(node.content, context.records, id),
      properties: node.properties.map((property) => ({
        name: property.name,
        value: resolveValue(property.value, context.records, id),
      })),
    }];
  }
  const slots = node.slots.map((slot) => {
    const children: SolutionNode[] = [];
    for (const child of slot.children) children.push(...expandNode(child, context));
    return { slotId: slot.slotId, children };
  });
  return [{
    ...node,
    id,
    ...(node.content === undefined ? {} : { content: resolveValue(node.content, context.records, id) }),
    slots,
  }];
}

function expandRoot(
  root: SolutionNode,
  dataSets: ReadonlyMap<string, MockDataSet>,
  budget: ExpansionBudget,
): SolutionNode {
  const estimated = estimateExpandedNodeCount(root, dataSets, budget.remaining);
  if (estimated > budget.remaining) {
    fail("expansion", root.id, "EXPANSION_BUDGET_EXCEEDED", `global expanded-node budget ${MAX_EXPANDED_SOLUTION_NODES} exceeded`);
  }
  const expanded = expandNode(root, { dataSets, records: new Map(), budget });
  if (expanded.length !== 1) fail("expansion", root.id, "REPEATER_ROOT_UNSUPPORTED", String(expanded.length));
  return expanded[0]!;
}

function widthConstraint(node: SolutionNode, available: number) {
  const width = node.intent.width;
  return {
    available,
    ...(width.min === undefined ? {} : { min: width.min }),
    ...(width.max === undefined ? {} : { max: width.max }),
  };
}

function resolvedRootDeclarations(
  plan: SolutionImplementationPlan,
  node: Extract<SolutionNode, { kind: "control" }>,
) {
  return resolveStyle(
    plan.theme,
    styleSpecForRole(plan, node.styleRole),
    node.styleOverride === undefined
      ? EMPTY_STYLE
      : {
          role: node.styleRole,
          declarations: node.styleOverride.declarations,
          states: node.styleOverride.states,
        },
  ).declarations;
}

function compilerLayoutGap(node: Extract<SolutionNode, { kind: "layout" }>): number {
  const tokens = node.intent.density === "compact"
    ? { section: 16, control: 8 }
    : node.intent.density === "spacious"
      ? { section: 32, control: 16 }
      : { section: 24, control: 12 };
  return node.children.some((child) => child.kind === "layout") ? tokens.section : tokens.control;
}

function measureTreeUnsafe(
  node: SolutionNode,
  plan: SolutionImplementationPlan,
  moduleRegistry: ModuleRegistry,
  available: number,
  output: Map<string, IntrinsicSize>,
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  layoutInsets: Map<string, LayoutContentInsets>,
  // end
): IntrinsicSize {
  const declarations = node.kind === "control"
    ? resolvedRootDeclarations(plan, node)
    : {};
  const fontSize = typeof declarations.fontSize === "number" ? declarations.fontSize : 16;
  const lineHeight = typeof declarations.lineHeight === "number" ? declarations.lineHeight : 1.5;
  const paddingHorizontal = typeof declarations.paddingHorizontal === "number"
    ? declarations.paddingHorizontal
    : typeof declarations.padding === "number" ? declarations.padding : 0;
  const paddingVertical = typeof declarations.paddingVertical === "number"
    ? declarations.paddingVertical
    : typeof declarations.padding === "number" ? declarations.padding : 0;
  const borderHorizontal = ((typeof declarations.borderLeftWidth === "number" ? declarations.borderLeftWidth : 0)
    + (typeof declarations.borderRightWidth === "number" ? declarations.borderRightWidth : 0)) / 2;
  const borderVertical = ((typeof declarations.borderTopWidth === "number" ? declarations.borderTopWidth : 0)
    + (typeof declarations.borderBottomWidth === "number" ? declarations.borderBottomWidth : 0)) / 2;
  const base = {
    density: node.intent.density,
    width: widthConstraint(node, available),
    font: {
      fontSize,
      lineHeight,
      ...(typeof declarations.letterSpacing === "number" ? { letterSpacing: declarations.letterSpacing } : {}),
      padding: { horizontal: paddingHorizontal, vertical: paddingVertical },
      border: { horizontal: borderHorizontal, vertical: borderVertical },
    },
  } as const;

  let measured: IntrinsicSize;
  if (node.kind === "layout") {
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    const insets = resolveLayoutContentInsets(plan, node);
    layoutInsets.set(node.id, insets);
    const horizontal = insets.left + insets.right;
    const innerAvailable = available - horizontal;
    if (innerAvailable <= 0) throw new Error(`LAYOUT_SURFACE_CONTENT_EMPTY: ${node.id}`);
    const width = widthConstraint(node, available);
    const innerWidth = {
      available: innerAvailable,
      ...(width.min === undefined ? {} : { min: Math.max(0, width.min - horizontal) }),
      ...(width.max === undefined ? {} : { max: Math.max(0, width.max - horizontal) }),
    };
    const children = node.children.map((child) => measureTree(child, plan, moduleRegistry, innerAvailable, output, layoutInsets));
    measured = expandLayoutIntrinsic(measureIntrinsic({ ...base, width: innerWidth, kind: "layout", node, childMeasures: children, gap: compilerLayoutGap(node) }), insets);
    // end
  } else if (node.kind === "registered-module") {
    const definition = moduleRegistry.require(node.moduleKind, node.templateVersion);
    measured = measureIntrinsic({ ...base, kind: "registered-module", node, layoutContract: definition.layout });
  } else if (node.kind === "control") {
    const profile = requireControlDesignProfile(node.capabilityId === "datagrid" ? "easyui.1" : node.capabilityId);
    const style = declarations.truncate === undefined ? {} : { truncate: declarations.truncate };
    if (node.capabilityId === "easyui.1" || node.capabilityId === "datagrid") {
      const recordCount = node.mockDataId === undefined
        ? 0
        : plan.mockData.find((dataSet) => dataSet.id === node.mockDataId)?.records.length ?? 0;
      measured = measureIntrinsic({ ...base, kind: "control", family: "datagrid", node, profile, style, dataGrid: { recordCount } });
    } else if (node.capabilityId === "image") {
      measured = measureIntrinsic({ ...base, kind: "control", family: "image", node, profile, style, image: { aspectRatio: { width: 16, height: 9 } } });
    } else {
      measured = measureIntrinsic({ ...base, kind: "control", family: "generic", node, profile, style });
    }
  } else {
    fail("measurement", node.id, "UNEXPANDED_REPEATER", node.id);
  }
  output.set(node.id, measured);
  return measured;
}

function measureTree(
  node: SolutionNode,
  plan: SolutionImplementationPlan,
  moduleRegistry: ModuleRegistry,
  available: number,
  output: Map<string, IntrinsicSize>,
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  layoutInsets: Map<string, LayoutContentInsets>,
  // end
): IntrinsicSize {
  return boundary("measurement", node.id, () =>
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    measureTreeUnsafe(node, plan, moduleRegistry, available, output, layoutInsets));
    // end
}

function compilePageLayout(
  page: SolutionPage,
  expandedRoot: SolutionNode,
  plan: SolutionImplementationPlan,
  moduleRegistry: ModuleRegistry,
): CompiledLayoutTree {
  const available = page.canvas === "large-display" ? 1808 : 1360;
  const intrinsic = new Map<string, IntrinsicSize>();
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  const layoutInsets = new Map<string, LayoutContentInsets>();
  boundary("measurement", expandedRoot.id, () => measureTree(expandedRoot, plan, moduleRegistry, available, intrinsic, layoutInsets));
  return boundary("layout", expandedRoot.id, () => compileLayout({ page: { ...page, root: expandedRoot }, expandedRoot, intrinsicByNodeId: intrinsic, layoutInsetsByNodeId: layoutInsets }));
  // end
}

function styleSpecForRole(plan: SolutionImplementationPlan, role: string): ComponentStyleSpecV2 {
  const style = plan.roleStyles.find((candidate) => candidate.role === role);
  return style === undefined
    ? { role, declarations: {}, states: {} }
    : { role, declarations: style.declarations, states: style.states };
}

function styleControl(
  control: UIImplementationControlV2,
  plan: SolutionImplementationPlan,
  approvedAssets: readonly ApprovedAssetFacts[],
): UIImplementationControlV2 {
  const styleRole = control.style?.role ?? control.role;
  const instanceOverride: ComponentStyleSpecV2 = control.style === undefined
    ? EMPTY_STYLE
    : control.style;
  const compiled = boundary("style", control.id, () => compileResolvedStyle({
    componentId: control.id,
    capabilityId: control.capabilityId,
    theme: plan.theme,
    styleRole,
    roleStyle: styleSpecForRole(plan, styleRole),
    instanceOverride,
    approvedAssets,
    runtimeProfile: KF36_RUNTIME_PROFILE,
  }));
  boundary("style", control.id, () => assertPersistedStyleHandoffComplete(compiled.persistedStyleHandoff));
  const styleAssetIds = compiled.cssFragments.flatMap((fragment) =>
    fragment.declarations.advanced
      ?.filter((declaration) => declaration.kind === "background-image")
      .map((declaration) => declaration.assetId) ?? []);
  const assetIds = [...new Set([...(control.assetIds ?? []), ...styleAssetIds])].sort(compareCodePoints);
  if (assetIds.length > 1) {
    fail(
      "style",
      control.id,
      "COMPONENT_ASSET_BUDGET_EXCEEDED",
      `component references ${assetIds.length} distinct assets; KF supports at most one`,
    );
  }
  return {
    ...control,
    nativeProperties: {
      ...control.nativeProperties,
      ...compiled.nativeFields,
    },
    compiledStyle: {
      nativeFields: { ...compiled.nativeFields },
      cssFragments: compiled.cssFragments.map((fragment) => ({
        selectorToken: fragment.selectorToken,
        state: fragment.state,
        declarations: fragment.declarations,
      })),
      warnings: compiled.warnings.map((warning) => ({ code: warning.code, message: warning.message })),
    },
    ...(assetIds.length === 0 ? {} : { assetIds }),
  };
}

function mergeLayoutTrees(base: CompiledLayoutTree, overlays: readonly CompiledLayoutTree[]): CompiledLayoutTree {
  const byId = new Map(base.byId);
  overlays.forEach((overlay) => overlay.byId.forEach((node, id) => {
    if (byId.has(id)) fail("assembly", id, "LAYOUT_ID_DUPLICATE", id);
    byId.set(id, node);
  }));
  return Object.freeze({ ...base, byId });
}

function assertSourceIntegrity(page: MutableNativePage): void {
  const ids = new Set(page.controls.map((control) => control.id));
  page.controls.forEach((control) => {
    if (control.parentId !== undefined && !ids.has(control.parentId)) {
      fail("validation", control.id, "PARENT_SOURCE_MISSING", control.parentId);
    }
    if (control.sourceBlueprintPageId !== page.sourceBlueprintPageId) {
      fail("validation", control.id, "BLUEPRINT_PAGE_SOURCE_MISMATCH", control.sourceBlueprintPageId);
    }
    if (control.sourceBlueprintRegionIds.length === 0) {
      fail("validation", control.id, "BLUEPRINT_REGION_SOURCE_MISSING", control.id);
    }
  });
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Reflect.ownKeys(value).forEach((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor !== undefined && "value" in descriptor) deepFreeze(descriptor.value);
    });
    Object.freeze(value);
  }
  return value;
}

/** Deterministically compiles a parsed semantic solution into the strict native KF v2 handoff. */
export function compileSolutionImplementation(input: SolutionCompileInput): UIImplementationSpecV2 {
  const safeInput = preflightInput(input);
  const parsed = boundary("parse", "$", () => parseInput(safeInput));
  const tabPaneOwnership = parsed.bundle === undefined
    ? []
    : boundary("candidate-validation", "$", () => deriveTabPaneOwnership(parsed.plan, parsed.bundle!));
  const dataSets = new Map(parsed.plan.mockData.map((dataSet) => [dataSet.id, dataSet]));
  const expansionBudget: ExpansionBudget = { remaining: MAX_EXPANDED_SOLUTION_NODES };
  const expandedPages = parsed.plan.pages.map((page) => {
    const expandedRoot = boundary("expansion", page.root.id, () => expandRoot(page.root, dataSets, expansionBudget));
    return { page, expandedRoot };
  });
  const expandedOverlays = parsed.plan.overlays.map((overlay) => {
    const hostPage = parsed.plan.pages.find((page) => page.id === overlay.hostPageId);
    if (hostPage === undefined) fail("layout", overlay.id, "OVERLAY_HOST_PAGE_MISSING", overlay.hostPageId);
    const expandedRoot = boundary("expansion", overlay.root.id, () => expandRoot(overlay.root, dataSets, expansionBudget));
    return { overlay, hostPage, expandedRoot };
  });
  const pageCompilations: PageCompilation[] = expandedPages.map(({ page, expandedRoot }) => ({
    page,
    expandedRoot,
    layout: compilePageLayout(page, expandedRoot, parsed.plan, safeInput.moduleRegistry),
  }));
  const overlayCompilations = expandedOverlays.map(({ overlay, hostPage, expandedRoot }) => {
    const overlayPage: SolutionPage = { ...hostPage, root: expandedRoot };
    const layout = compilePageLayout(overlayPage, expandedRoot, parsed.plan, safeInput.moduleRegistry);
    return { overlay, hostPage, expandedRoot, layout };
  });

  const pages: MutableNativePage[] = pageCompilations.map((compiledPage) => {
    const ownedOverlays = overlayCompilations.filter((entry) => entry.overlay.hostPageId === compiledPage.page.id);
    ownedOverlays.forEach((entry) => {
      if (entry.layout.pageHeight > compiledPage.layout.pageHeight) {
        fail(
          "layout",
          entry.overlay.id,
          "OVERLAY_EXCEEDS_HOST_VIEWPORT",
          `${entry.layout.pageHeight} > ${compiledPage.layout.pageHeight}; use a bounded overlay scroll-region`,
        );
      }
    });
    const pageHeight = compiledPage.layout.pageHeight;
    const pageLayout = compiledPage.layout;
    const controls = boundary("component", compiledPage.page.root.id, () => compileComponents({
      plan: parsed.plan,
      ...(parsed.bundle === undefined ? {} : { bundle: parsed.bundle }),
      layout: pageLayout,
      moduleRegistry: safeInput.moduleRegistry,
      approvedAssets: parsed.approvedAssets,
    }));
    const overlayControls = ownedOverlays.flatMap((entry) => boundary("component", entry.overlay.id, () => compileOverlay({
      plan: parsed.plan,
      ...(parsed.bundle === undefined ? {} : { bundle: parsed.bundle }),
      layout: entry.layout,
      moduleRegistry: safeInput.moduleRegistry,
      approvedAssets: parsed.approvedAssets,
      overlayId: entry.overlay.id,
    }).controls));
    const styledControls = [...controls, ...overlayControls]
      .map((control) => styleControl(control, parsed.plan, parsed.approvedAssets));
    return {
      compatibility: "native",
      id: compiledPage.page.id,
      width: pageLayout.pageWidth,
      height: pageHeight,
      sourceBlueprintPageId: compiledPage.page.sourceBlueprintPageId,
      controls: styledControls,
    };
  });

  pages.forEach(assertSourceIntegrity);
  const candidate = {
    schema: "kf-ui-implementation/v2" as const,
    compatibility: "native" as const,
    sourceSolutionPlanHash: canonicalServerHash(parsed.plan),
    sourceModuleRegistryHash: solutionModuleRegistryHash(parsed.plan, safeInput.moduleRegistry),
    theme: parsed.plan.theme,
    compiledRoleStyles: Object.fromEntries(parsed.plan.roleStyles.map((style) => [style.role,
      boundary("style", style.role, () => resolveStyle(parsed.plan.theme, {
        role: style.role,
        declarations: style.declarations,
        states: style.states,
      }, EMPTY_STYLE)),
    ])),
    pages,
    compiledActions: [],
    compiledScripts: [],
  };
  const implementation = boundary("validation", "$", () => UIImplementationSpecV2Schema.parse(candidate));
  pageCompilations.forEach((compiledPage) => {
    const overlays = overlayCompilations
      .filter((entry) => entry.overlay.hostPageId === compiledPage.page.id)
      .map((entry) => entry.layout);
    const page = implementation.pages.find((entry) => entry.id === compiledPage.page.id);
    if (page === undefined) fail("validation", compiledPage.page.id, "IMPLEMENTATION_PAGE_MISSING", compiledPage.page.id);
    const correlated = mergeLayoutTrees(compiledPage.layout, overlays);
    const tabPaneRelocations = tabPaneOwnership
      .filter((binding) => binding.semanticPageId === compiledPage.page.id)
      .map((binding) => ({ ownerNodeId: binding.ownerSemanticControlId, paneNodeId: binding.paneSemanticControlId }));
    boundary("validation", compiledPage.page.id, () => assertImplementationMatchesCompiledLayout(
      implementation,
      compiledPage.page.id,
      correlated,
      tabPaneRelocations,
    ));
  });
  return deepFreeze(implementation);
}
