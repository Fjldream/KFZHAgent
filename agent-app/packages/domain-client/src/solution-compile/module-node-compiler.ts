import {
  LEGACY_MODULE_PLAN_CANDIDATE_BUNDLE_HASH,
  ApprovedAssetFactsSchema,
  UIComponentSpecSchema,
  UIImplementationControlV2Schema,
  modelAssetIdToWorkspaceAssetId,
  type ApprovedAssetFacts,
  type ComponentStyleSpec,
  type ControlCapability,
  type ModulePlanModule,
  type RegisteredModuleNode,
  type ResolvedAsset,
  type SemanticValue,
  type SolutionImplementationPlan,
  type SolutionPage,
  type UIImplementationControlV2,
} from "@kf/contracts";
import { validateCreateComponentProperties } from "../implementation/component-properties.js";
import type { ModuleRegistry } from "../modules/module-registry.js";
import type { ModuleDefinition } from "../modules/types.js";
import { getControlCapability, listControlCapabilities } from "../style/control-capability-registry.js";
import type { CompiledLayoutNode } from "./layout-compiler.js";

export type SemanticData = string | number | boolean | null | SemanticData[] | SemanticDataRecord;
export interface SemanticDataRecord { readonly [key: string]: SemanticData }

type CompilePath = readonly (string | number)[];

export class ModuleNodeCompileError extends Error {
  readonly code: string;
  readonly path: CompilePath;

  constructor(code: string, path: CompilePath, detail: string, options?: ErrorOptions) {
    super(`${code} at ${formatPath(path)}: ${detail}`, options);
    this.name = "ModuleNodeCompileError";
    this.code = code;
    this.path = Object.freeze([...path]);
  }
}

export interface RegisteredModuleNodeCompileInput {
  readonly plan: SolutionImplementationPlan;
  readonly page: SolutionPage;
  readonly node: RegisteredModuleNode;
  readonly layoutNode: CompiledLayoutNode;
  readonly moduleRegistry: ModuleRegistry;
  readonly approvedAssets: readonly ApprovedAssetFacts[];
  readonly currentRecords: ReadonlyMap<string, SemanticDataRecord>;
  readonly parentId?: string;
  readonly depth: number;
}

export interface RegisteredModuleDefinitionReplayInput {
  readonly plan: SolutionImplementationPlan;
  readonly node: RegisteredModuleNode;
  readonly layoutNode: Pick<CompiledLayoutNode, "id" | "kind" | "layout" | "geometry">;
  readonly moduleRegistry: ModuleRegistry;
  readonly currentRecords: ReadonlyMap<string, SemanticDataRecord>;
  readonly resolvedAsset?: ResolvedAsset;
}

interface SemanticDataBudget {
  nodes: number;
  readonly active: WeakSet<object>;
}

const MAX_DATA_DEPTH = 8;
const MAX_DATA_NODES = 1_000;
const MAX_DATA_ITEMS = 100;
const SAFE_DATA_KEY = /^[A-Za-z][A-Za-z0-9_-]{0,99}$/;
const SAFE_LOCAL_ID = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const CONFIGURATION_ONLY_NATIVE_CAPABILITIES = new Set(["easyui.1"]);
const STYLE_ROOT_KEYS = new Set(["role", "declarations", "states"]);
const STYLE_STATE_KEYS = ["hover", "active", "focus", "disabled", "selected", "error"] as const;
const STYLE_STATE_KEY_SET = new Set<string>(STYLE_STATE_KEYS);
const CONTENT_FIELDS: Readonly<Record<string, string>> = Object.freeze({
  button: "text",
  text: "text",
  richtext: "text",
  "easyui.2": "text",
});

function formatPath(path: CompilePath): string {
  return path.length === 0 ? "$" : path.map(String).join(".");
}

function fail(code: string, path: CompilePath, detail: string, cause?: Error): never {
  throw new ModuleNodeCompileError(code, path, detail, cause === undefined ? undefined : { cause });
}

function safeKey(key: string, path: CompilePath): void {
  if (!SAFE_DATA_KEY.test(key) || FORBIDDEN_KEYS.has(key.toLowerCase())) {
    fail("SEMANTIC_DATA_UNSAFE_KEY", path, key);
  }
}

function enterData(value: object, path: CompilePath, depth: number, budget: SemanticDataBudget): void {
  if (depth > MAX_DATA_DEPTH) fail("SEMANTIC_DATA_DEPTH_EXCEEDED", path, String(depth));
  budget.nodes += 1;
  if (budget.nodes > MAX_DATA_NODES) fail("SEMANTIC_DATA_BUDGET_EXCEEDED", path, String(MAX_DATA_NODES));
  if (budget.active.has(value)) fail("SEMANTIC_DATA_CYCLE", path, "cyclic semantic value");
  const prototype = Reflect.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== Array.prototype) {
    fail("SEMANTIC_DATA_PROTOTYPE_UNSAFE", path, "non-plain semantic value");
  }
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") fail("SEMANTIC_DATA_UNSAFE_KEY", path, "symbol key");
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor?.get !== undefined || descriptor?.set !== undefined) {
      fail("SEMANTIC_DATA_ACCESSOR_UNSAFE", [...path, key], "accessor property");
    }
  }
  budget.active.add(value);
}

function leaveData(value: object, budget: SemanticDataBudget): void {
  budget.active.delete(value);
}

function convertSemanticValue(
  value: SemanticValue,
  currentRecords: ReadonlyMap<string, SemanticDataRecord>,
  path: CompilePath,
  depth: number,
  budget: SemanticDataBudget,
): SemanticData {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (typeof value === "string" && value.length > 2_000) fail("SEMANTIC_DATA_STRING_TOO_LONG", path, String(value.length));
    if (typeof value === "number" && !Number.isFinite(value)) fail("SEMANTIC_DATA_NUMBER_INVALID", path, String(value));
    budget.nodes += 1;
    if (budget.nodes > MAX_DATA_NODES) fail("SEMANTIC_DATA_BUDGET_EXCEEDED", path, String(MAX_DATA_NODES));
    return value;
  }

  enterData(value, path, depth, budget);
  try {
    if (value.kind === "repeater-field") {
      const record = currentRecords.get(value.itemAlias);
      if (record === undefined || !Object.hasOwn(record, value.field)) {
        fail("REPEATER_FIELD_UNRESOLVED", path, `${value.itemAlias}.${value.field}`);
      }
      return record[value.field]!;
    }
    if (value.kind === "list") {
      if (!Array.isArray(value.items) || value.items.length > MAX_DATA_ITEMS) {
        fail("SEMANTIC_DATA_ITEM_LIMIT", [...path, "items"], String(MAX_DATA_ITEMS));
      }
      return value.items.map((item, index) => convertSemanticValue(item, currentRecords, [...path, "items", index], depth + 1, budget));
    }
    if (!Array.isArray(value.fields) || value.fields.length > MAX_DATA_ITEMS) {
      fail("SEMANTIC_DATA_ITEM_LIMIT", [...path, "fields"], String(MAX_DATA_ITEMS));
    }
    const record: { [key: string]: SemanticData } = {};
    for (const [index, field] of value.fields.entries()) {
      safeKey(field.name, [...path, "fields", index, "name"]);
      if (Object.hasOwn(record, field.name)) fail("SEMANTIC_DATA_FIELD_DUPLICATE", [...path, "fields", index, "name"], field.name);
      record[field.name] = convertSemanticValue(field.value, currentRecords, [...path, "fields", index, "value"], depth + 1, budget);
    }
    return record;
  } finally {
    leaveData(value, budget);
  }
}

/** Converts only the bounded semantic union; repeater references read one current record per in-scope alias. */
export function semanticValueToData(
  value: SemanticValue,
  currentRecords: ReadonlyMap<string, SemanticDataRecord> = new Map(),
  path: CompilePath = [],
): SemanticData {
  return convertSemanticValue(value, currentRecords, path, 0, { nodes: 0, active: new WeakSet() });
}

function validateJsonData(
  value: SemanticData,
  path: CompilePath,
  depth: number,
  budget: SemanticDataBudget,
): void {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    if (typeof value === "string" && value.length > 2_000) fail("MODULE_LEGACY_JSON_INVALID", path, "string exceeds 2000 characters");
    if (typeof value === "number" && !Number.isFinite(value)) fail("MODULE_LEGACY_JSON_INVALID", path, "non-finite number");
    budget.nodes += 1;
    if (budget.nodes > MAX_DATA_NODES) fail("MODULE_LEGACY_JSON_INVALID", path, "semantic value budget exceeded");
    return;
  }
  enterData(value, path, depth, budget);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_DATA_ITEMS) fail("MODULE_LEGACY_JSON_INVALID", path, "array exceeds 100 items");
      value.forEach((item, index) => validateJsonData(item, [...path, index], depth + 1, budget));
      return;
    }
    const entries = Object.entries(value);
    if (entries.length > MAX_DATA_ITEMS) fail("MODULE_LEGACY_JSON_INVALID", path, "record exceeds 100 fields");
    entries.forEach(([key, item]) => {
      safeKey(key, [...path, key]);
      validateJsonData(item, [...path, key], depth + 1, budget);
    });
  } finally {
    leaveData(value, budget);
  }
}

function dataRecord(value: SemanticData, code: string, path: CompilePath): SemanticDataRecord {
  if (value === null || Array.isArray(value) || typeof value !== "object") fail(code, path, "record content required");
  return value;
}

function moduleContent(input: RegisteredModuleDefinitionReplayInput): SemanticDataRecord {
  const content = input.node.content;
  if (content === undefined) return {};
  const path: CompilePath = [input.node.id, "content"];
  if (input.plan.candidateBundleHash === LEGACY_MODULE_PLAN_CANDIDATE_BUNDLE_HASH) {
    if (typeof content !== "string") fail("MODULE_LEGACY_JSON_INVALID", path, "legacy module content must be JSON text");
    let parsed: SemanticData;
    try {
      parsed = JSON.parse(content) as SemanticData;
    } catch (error) {
      fail("MODULE_LEGACY_JSON_INVALID", path, "JSON parse failed", error instanceof Error ? error : undefined);
    }
    validateJsonData(parsed, path, 0, { nodes: 0, active: new WeakSet() });
    return dataRecord(parsed, "MODULE_CONTENT_INVALID", path);
  }
  if (typeof content === "string") fail("MODULE_CONTENT_INVALID", path, "native module content must be a semantic record");
  return dataRecord(semanticValueToData(content, input.currentRecords, path), "MODULE_CONTENT_INVALID", path);
}

function registryDefinition(input: RegisteredModuleDefinitionReplayInput): ModuleDefinition {
  let definition: ModuleDefinition;
  try {
    definition = input.moduleRegistry.require(input.node.moduleKind, input.node.templateVersion);
  } catch (error) {
    const detail = error instanceof Error ? error.message : "module registry rejected the definition";
    const code = /^([A-Z][A-Z0-9_]+)/.exec(detail)?.[1] ?? "MODULE_DEFINITION_NOT_FOUND";
    fail(code, [input.node.id, "moduleKind"], detail, error instanceof Error ? error : undefined);
  }
  if (definition.maturity === "unsupported") fail("MODULE_UNSUPPORTED", [input.node.id, "moduleKind"], `${definition.kind}@${definition.version}`);
  if (!definition.variants.includes(input.node.variant)) {
    fail("MODULE_VARIANT_UNSUPPORTED", [input.node.id, "variant"], input.node.variant);
  }
  return definition;
}

function unavailableNativeCreateDimension(
  capability: ControlCapability,
): Readonly<{ dimension: "generation" | "style"; status: "preserve-only" | "unsupported" }> | undefined {
  if (CONFIGURATION_ONLY_NATIVE_CAPABILITIES.has(capability.id)) return undefined;
  if (capability.generation.status === "unsupported" || capability.generation.status === "preserve-only") {
    return { dimension: "generation", status: capability.generation.status };
  }
  if (capability.style.status === "unsupported" || capability.style.status === "preserve-only") {
    return { dimension: "style", status: capability.style.status };
  }
  return undefined;
}

function technicallyAvailableCapabilityIds(): ReadonlySet<string> {
  return new Set(listControlCapabilities()
    .filter((capability) => unavailableNativeCreateDimension(capability) === undefined)
    .map((capability) => capability.id));
}

function isPlainRecord(value: object): boolean {
  return Reflect.getPrototypeOf(value) === Object.prototype && !Array.isArray(value);
}

function hasOnlyDataKeys(value: object, allowed: ReadonlySet<string>): boolean {
  return Reflect.ownKeys(value).every((key) => {
    if (typeof key !== "string" || !allowed.has(key)) return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    return descriptor?.get === undefined && descriptor?.set === undefined;
  });
}

function isPlainComponentItem(value: object): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  try {
    if (Reflect.getPrototypeOf(value) !== Object.prototype) return false;
    return Reflect.ownKeys(value).every((key) => {
      if (typeof key !== "string") return false;
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor?.get === undefined && descriptor?.set === undefined;
    });
  } catch {
    return false;
  }
}

function isSemanticallyEmptyConfigurationStyle(style: ComponentStyleSpec | undefined): boolean {
  if (style === undefined) return true;
  if (style === null || typeof style !== "object") return false;
  if (!isPlainRecord(style) || !hasOnlyDataKeys(style, STYLE_ROOT_KEYS) || style.role !== undefined) return false;
  const declarations = style.declarations;
  if (declarations !== undefined && (declarations === null || typeof declarations !== "object"
    || !isPlainRecord(declarations) || Reflect.ownKeys(declarations).length > 0)) return false;
  const states = style.states;
  if (states === undefined) return true;
  if (states === null || typeof states !== "object"
    || !isPlainRecord(states) || !hasOnlyDataKeys(states, STYLE_STATE_KEY_SET)) return false;
  return STYLE_STATE_KEYS.every((state) => {
    const declaration = states[state];
    return declaration === undefined
      || (declaration !== null && typeof declaration === "object"
        && isPlainRecord(declaration) && Reflect.ownKeys(declaration).length === 0);
  });
}

function assertConfigurationOnlyStyle(
  nodeId: string,
  outputId: string,
  capabilityId: string,
  style: ComponentStyleSpec | undefined,
): void {
  if (!CONFIGURATION_ONLY_NATIVE_CAPABILITIES.has(capabilityId)
    || isSemanticallyEmptyConfigurationStyle(style)) return;
  fail(
    "MODULE_COMPONENT_CAPABILITY_PRESERVE_ONLY",
    [nodeId, "components", outputId, "capabilityId", capabilityId, "style"],
    "configuration-only native capability requires semantically empty style",
  );
}

function assertOutputCapability(nodeId: string, outputId: string, capabilityId: string): void {
  const path: CompilePath = [nodeId, "components", outputId, "capabilityId", capabilityId];
  const capability = getControlCapability(capabilityId);
  if (capability === undefined) fail("MODULE_COMPONENT_CAPABILITY_MISSING", path, capabilityId);
  const unavailable = unavailableNativeCreateDimension(capability);
  if (unavailable === undefined) return;
  const code = unavailable.status === "preserve-only"
    ? "MODULE_COMPONENT_CAPABILITY_PRESERVE_ONLY"
    : "MODULE_COMPONENT_CAPABILITY_UNSUPPORTED";
  fail(code, path, `${unavailable.dimension} is ${unavailable.status}`);
}

function assertRequiredCapabilities(definition: ModuleDefinition, nodeId: string): void {
  if (definition.requiredKfCapabilities.includes("webcontainer")) {
    fail(
      "MODULE_WEBCONTAINER_UNAUTHORIZED",
      [nodeId, "requiredKfCapabilities", "webcontainer"],
      "creative compilation has no WebContainer authorization input",
    );
  }
  const available = technicallyAvailableCapabilityIds();
  const missing = definition.requiredKfCapabilities.filter((capability) => !available.has(capability));
  if (missing.length > 0) fail("MODULE_KF_CAPABILITY_MISSING", [nodeId, "requiredKfCapabilities"], missing.join(", "));
}

function approvedModuleAsset(
  input: RegisteredModuleNodeCompileInput,
  definition: ModuleDefinition,
): Readonly<{ modelId: string; facts: ApprovedAssetFacts; resolved: ResolvedAsset }> | undefined {
  const slot = definition.assetSlots[0];
  if (slot === undefined) {
    if (input.node.assetId !== undefined) fail("MODULE_ASSET_SLOT_UNEXPECTED", [input.node.id, "assetId"], input.node.assetId);
    return undefined;
  }
  const required = slot.required || slot.requiredForVariants?.includes(input.node.variant) === true;
  if (input.node.assetId === undefined) {
    if (required) fail("MODULE_ASSET_SLOT_REQUIRED", [input.node.id, "assetId"], slot.id);
    return undefined;
  }
  if (!slot.allowedKinds.includes("image")) fail("MODULE_ASSET_SLOT_INVALID", [input.node.id, "assetId"], slot.id);
  let workspaceAssetId: string;
  try {
    workspaceAssetId = modelAssetIdToWorkspaceAssetId(input.node.assetId);
  } catch (error) {
    fail("MODULE_ASSET_ID_INVALID", [input.node.id, "assetId"], input.node.assetId, error instanceof Error ? error : undefined);
  }
  const matches = input.approvedAssets.filter((candidate) => candidate.workspaceAssetId === workspaceAssetId!);
  if (matches.length !== 1) fail("MODULE_ASSET_NOT_APPROVED", [input.node.id, "assetId"], input.node.assetId);
  const parsedFacts = ApprovedAssetFactsSchema.safeParse(matches[0]);
  if (!parsedFacts.success) {
    const issue = parsedFacts.error.issues[0];
    fail(
      "MODULE_ASSET_FACTS_INVALID",
      [input.node.id, "assetId", ...(issue?.path.map(String) ?? [])],
      issue?.message ?? input.node.assetId,
    );
  }
  const facts = parsedFacts.data;
  return Object.freeze({
    modelId: input.node.assetId,
    facts,
    resolved: Object.freeze({ assetId: input.node.assetId, status: "resolved" as const }),
  });
}

function preferredHeight(definition: ModuleDefinition, height: number): ModulePlanModule["placement"]["preferredHeight"] {
  return [...definition.layout.preferredHeights].sort((left, right) => {
    const difference = Math.abs(definition.layout.height.preferred[left] - height)
      - Math.abs(definition.layout.height.preferred[right] - height);
    return difference || compareCodePoints(left, right);
  })[0]!;
}

function moduleInstance(
  input: RegisteredModuleDefinitionReplayInput,
  definition: ModuleDefinition,
  content: SemanticDataRecord,
): ModulePlanModule {
  const emphasis = input.node.intent.importance === "primary" ? "primary"
    : input.node.intent.importance === "secondary" ? "secondary" : "subtle";
  return {
    id: input.node.id,
    kind: input.node.moduleKind,
    templateVersion: input.node.templateVersion,
    variant: input.node.variant,
    title: input.node.title,
    content: JSON.stringify(content),
    placement: {
      region: definition.layout.regions[0]!,
      order: Math.min(100, input.node.intent.readingOrder),
      columnSpan: definition.layout.maxColumnSpan,
      preferredHeight: preferredHeight(definition, input.layoutNode.geometry.height),
      alignment: input.node.intent.align,
      emphasis,
    },
    interactions: [],
    ...(input.node.assetId === undefined ? {} : { assetId: input.node.assetId }),
    sourceBlueprintModuleIds: [...input.node.sourceBlueprintRegionIds],
  };
}

export function replayRegisteredModuleDefinition(input: RegisteredModuleDefinitionReplayInput) {
  const definition = registryDefinition(input);
  assertRequiredCapabilities(definition, input.node.id);
  const semanticContent = moduleContent(input);
  const parsedContent = definition.contentSchema.safeParse(semanticContent);
  if (!parsedContent.success) fail("MODULE_CONTENT_INVALID", [input.node.id, "content"], parsedContent.error.issues[0]?.message ?? "schema rejected content");
  const instance = moduleInstance(input, definition, semanticContent);
  const localBounds = Object.freeze({
    x: 0,
    y: 0,
    width: Math.floor(input.layoutNode.geometry.width),
    height: Math.floor(input.layoutNode.geometry.height),
  });
  const output = definition.compile({ context: Object.freeze({
    definition,
    instance,
    content: parsedContent.data,
    asset: input.resolvedAsset,
    validationContext: Object.freeze({
      availableKfCapabilities: Object.freeze([...technicallyAvailableCapabilityIds()]),
      approvedAuthorizationRefs: Object.freeze([]),
    }),
    bounds: localBounds,
  }) });
  const blockingGap = output.deliveryGaps.find((gap) => gap.severity === "blocking" && gap.status === "unresolved");
  if (blockingGap !== undefined) fail("MODULE_COMPILE_BLOCKED", [input.node.id, "deliveryGaps"], blockingGap.reason);
  if (output.components.length === 0) fail("MODULE_COMPILE_EMPTY", [input.node.id, "components"], `${definition.kind}@${definition.version}`);
  return Object.freeze({ definition, components: output.components, bounds: localBounds });
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index]!.codePointAt(0)! - rightPoints[index]!.codePointAt(0)!;
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return leftPoints.length === rightPoints.length ? 0 : leftPoints.length < rightPoints.length ? -1 : 1;
}

export function adaptReviewedComponentProperties(
  capabilityId: string,
  properties: SemanticDataRecord,
  content: string | undefined,
  parentId: string | undefined,
  asset: Readonly<{ facts: ApprovedAssetFacts }> | undefined,
): Readonly<{ nativeProperties: UIImplementationControlV2["nativeProperties"]; content?: string }> {
  const candidate: { [key: string]: SemanticData } = { ...properties };
  // These fields are authoritative interaction-design metadata consumed by
  // reviewed intent lowering. They are deliberately not native KF component
  // properties and must never be forwarded to the native property adapter.
  const interactionMetadata = capabilityId === "select"
    ? ["filterField", "filterMode"]
    : capabilityId === "easyui.1"
      ? ["filterCombine"]
      : capabilityId === "input"
        ? ["required", "validationMessage"]
        : capabilityId === "button"
          ? ["successMessage", "feedbackMessage", "feedbackLevel"]
          : [];
  interactionMetadata.forEach((key) => { delete candidate[key]; });
  if (candidate.src === "asset") {
    if (asset === undefined) fail("MODULE_ASSET_NOT_APPROVED", [capabilityId, "src"], "asset marker has no approved binding");
    candidate.src = asset.facts.targetPath;
  }
  const contentField = CONTENT_FIELDS[capabilityId];
  if (content !== undefined) {
    if (contentField === undefined) fail("MODULE_COMPONENT_CONTENT_UNSUPPORTED", [capabilityId, "content"], capabilityId);
    candidate[contentField] = content;
  }
  if (parentId !== undefined) candidate.parentId = parentId;
  let nativeProperties: UIImplementationControlV2["nativeProperties"];
  try {
    nativeProperties = UIImplementationControlV2Schema.shape.nativeProperties.parse(
      validateCreateComponentProperties(capabilityId, candidate),
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "property validation failed";
    fail("MODULE_COMPONENT_PROPERTY_INVALID", [capabilityId, "properties"], detail, error instanceof Error ? error : undefined);
  }
  return { nativeProperties, ...(content === undefined ? {} : { content }) };
}

function contains(
  outer: Readonly<{ x: number; y: number; width: number; height: number }>,
  inner: Readonly<{ x: number; y: number; width: number; height: number }>,
): boolean {
  return inner.x >= outer.x && inner.y >= outer.y
    && inner.x + inner.width <= outer.x + outer.width
    && inner.y + inner.height <= outer.y + outer.height;
}

export function compileRegisteredModuleNode(input: RegisteredModuleNodeCompileInput): UIImplementationControlV2[] {
  if (input.node.slots.length > 0) fail("MODULE_CHILD_SLOT_UNSUPPORTED", [input.node.id, "slots", 0], input.node.slots[0]!.slotId);
  if (input.layoutNode.id !== input.node.id || input.layoutNode.kind !== "registered-module" || input.layoutNode.layout !== undefined) {
    fail("MODULE_LAYOUT_CORRELATION_INVALID", [input.node.id, "layoutNode"], input.layoutNode.id);
  }
  const definition = registryDefinition(input);
  const asset = approvedModuleAsset(input, definition);
  const replay = replayRegisteredModuleDefinition({ ...input, ...(asset === undefined ? {} : { resolvedAsset: asset.resolved }) });

  const components = replay.components.map((component, index) => {
    if (!isPlainComponentItem(component)) {
      fail("MODULE_COMPONENT_INVALID", [input.node.id, "components", index], "plain component record required");
    }
    assertConfigurationOnlyStyle(input.node.id, component.id, component.capabilityId, component.style);
    const parsed = UIComponentSpecSchema.safeParse(
      component.capabilityId === "easyui.1" && component.style === undefined
        ? { ...component, style: {} }
        : component,
    );
    if (!parsed.success) fail("MODULE_COMPONENT_INVALID", [input.node.id, "components", index], parsed.error.issues[0]?.message ?? "schema rejected component");
    assertOutputCapability(input.node.id, parsed.data.id, parsed.data.capabilityId);
    return parsed.data;
  });
  const localById = new Map<string, (typeof components)[number]>();
  components.forEach((component, index) => {
    if (!SAFE_LOCAL_ID.test(component.id)) fail("MODULE_COMPONENT_ID_UNSAFE", [input.node.id, "components", index, "id"], component.id);
    if (localById.has(component.id)) fail("MODULE_COMPONENT_ID_DUPLICATE", [input.node.id, "components", index, "id"], component.id);
    if (`${input.node.id}--${component.id}`.length > 100) fail("MODULE_COMPONENT_ID_TOO_LONG", [input.node.id, "components", index, "id"], component.id);
    if (!contains(replay.bounds, component.geometry)) fail("MODULE_COMPONENT_OUT_OF_BOUNDS", [input.node.id, "components", index, "geometry"], component.id);
    localById.set(component.id, component);
  });

  const localParentById = new Map<string, string | undefined>();
  components.forEach((component, index) => {
    const parent = component.properties.parentId;
    if (parent !== undefined && typeof parent !== "string") fail("MODULE_COMPONENT_PARENT_INVALID", [input.node.id, "components", index, "properties", "parentId"], component.id);
    if (typeof parent === "string" && !localById.has(parent)) fail("MODULE_COMPONENT_PARENT_MISSING", [input.node.id, "components", index, "properties", "parentId"], parent);
    if (typeof parent === "string" && !localById.get(parent)!.capabilityId.startsWith("layout.")) {
      fail("MODULE_COMPONENT_PARENT_NOT_LAYOUT", [input.node.id, "components", index, "properties", "parentId"], parent);
    }
    localParentById.set(component.id, typeof parent === "string" ? parent : undefined);
  });

  const localDepthById = new Map<string, number>();
  const depthFor = (id: string, active: ReadonlySet<string>): number => {
    const known = localDepthById.get(id);
    if (known !== undefined) return known;
    if (active.has(id)) fail("MODULE_COMPONENT_PARENT_CYCLE", [input.node.id, "components", id], id);
    const parent = localParentById.get(id);
    const nextActive = new Set(active);
    nextActive.add(id);
    const depth = parent === undefined ? input.depth : depthFor(parent, nextActive) + 1;
    localDepthById.set(id, depth);
    return depth;
  };

  const translated = components.map((component, index): UIImplementationControlV2 => {
    const localParentId = localParentById.get(component.id);
    if (localParentId !== undefined && !contains(localById.get(localParentId)!.geometry, component.geometry)) {
      fail("MODULE_COMPONENT_PARENT_BOUNDS", [input.node.id, "components", index, "geometry"], component.id);
    }
    const parentId = localParentId === undefined ? input.parentId : `${input.node.id}--${localParentId}`;
    const properties: { [key: string]: SemanticData } = {};
    Object.entries(component.properties).forEach(([key, value]) => {
      if (key !== "parentId") properties[key] = value as SemanticData;
    });
    const adapted = adaptReviewedComponentProperties(component.capabilityId, properties, component.content, parentId, asset);
    const control = {
      id: `${input.node.id}--${component.id}`,
      ...(parentId === undefined ? {} : { parentId }),
      role: component.role,
      sourceModuleId: input.node.id,
      capabilityId: component.capabilityId,
      critical: component.critical,
      ...(component.fallbackCapabilityId === undefined ? {} : { fallbackCapabilityId: component.fallbackCapabilityId }),
      ...adapted,
      depth: depthFor(component.id, new Set()),
      zIndex: input.layoutNode.zIndex + depthFor(component.id, new Set()),
      geometry: {
        x: input.layoutNode.geometry.x + component.geometry.x,
        y: input.layoutNode.geometry.y + component.geometry.y,
        width: component.geometry.width,
        height: component.geometry.height,
      },
      style: component.style,
      ...(asset === undefined || component.capabilityId !== "image" ? {} : { assetIds: [asset.modelId] }),
      sourceSolutionNodeId: input.node.id,
      sourceBlueprintPageId: input.page.sourceBlueprintPageId,
      sourceBlueprintRegionIds: [...input.node.sourceBlueprintRegionIds],
      eventBindings: [],
    };
    const parsed = UIImplementationControlV2Schema.safeParse(control);
    if (!parsed.success) fail("MODULE_CONTROL_V2_INVALID", [input.node.id, "components", index], parsed.error.issues[0]?.message ?? "v2 control rejected");
    return parsed.data;
  });
  const ids = new Set<string>();
  translated.forEach((control, index) => {
    if (ids.has(control.id)) fail("MODULE_COMPONENT_ID_DUPLICATE", [input.node.id, "components", index, "id"], control.id);
    ids.add(control.id);
  });
  return translated;
}
