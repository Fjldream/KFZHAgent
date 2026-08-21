import {
  CapabilityCandidateBundleSchema,
  LEGACY_MODULE_PLAN_CANDIDATE_BUNDLE_HASH,
  ApprovedAssetFactsSchema,
  UIImplementationSpecV2Schema,
  canonicalServerHash,
  modelAssetIdToWorkspaceAssetId,
  type ApprovedAssetFacts,
  type CapabilityCandidateBundle,
  type ControlNode,
  type LayoutNode,
  type MockDataSet,
  type OverlayPlan,
  type RepeaterNode,
  type SemanticScalar,
  type SolutionImplementationPlan,
  type SolutionNode,
  type SolutionPage,
  type UIImplementationControlV2,
} from "@kf/contracts";
import { parseTableData } from "../modules/definitions/native-data-adapters.js";
import type { ModuleRegistry } from "../modules/module-registry.js";
import { layoutCapabilityIdsFor } from "../planning/capability-retrieval.js";
import { listControlCapabilities } from "../style/control-capability-registry.js";
import {
  adaptReviewedComponentProperties,
  compileRegisteredModuleNode,
  ModuleNodeCompileError,
  semanticValueToData,
  type SemanticData,
  type SemanticDataRecord,
} from "./module-node-compiler.js";
import {
  assertImplementationMatchesCompiledLayout,
  type CompiledLayoutNode,
  type CompiledLayoutTree,
} from "./layout-compiler.js";

type CompilePath = readonly (string | number)[];

export class ComponentCompileError extends Error {
  readonly code: string;
  readonly path: CompilePath;

  constructor(code: string, path: CompilePath, detail: string, options?: ErrorOptions) {
    super(`${code} at ${path.length === 0 ? "$" : path.map(String).join(".")}: ${detail}`, options);
    this.name = "ComponentCompileError";
    this.code = code;
    this.path = Object.freeze([...path]);
  }
}

export interface ComponentCompileInput {
  readonly plan: SolutionImplementationPlan;
  readonly bundle?: CapabilityCandidateBundle;
  readonly layout: CompiledLayoutTree;
  readonly moduleRegistry: ModuleRegistry;
  readonly approvedAssets: readonly ApprovedAssetFacts[];
}

export interface OverlayCompileInput extends ComponentCompileInput {
  readonly overlayId: string;
}

export interface CompiledOverlay {
  readonly overlayId: string;
  readonly hostPageId: string;
  readonly controls: readonly UIImplementationControlV2[];
}

interface CompileContext {
  readonly input: ComponentCompileInput;
  readonly page: SolutionPage;
  readonly sourcePageId: string;
  readonly mockDataById: ReadonlyMap<string, MockDataSet>;
  readonly controls: UIImplementationControlV2[];
  readonly controlIds: Set<string>;
  readonly overlay?: OverlayPlan;
}

interface WalkContext {
  readonly parentId?: string;
  readonly depth: number;
  readonly idPrefix?: string;
  readonly sourceRepeaterId?: string;
  readonly currentRecords: ReadonlyMap<string, SemanticDataRecord>;
}

interface MutableSemanticDataRecord { [key: string]: SemanticData }

const OVERLAY_Z_BASE = 100_000;
const MAX_CONTROL_ID_LENGTH = 100;
const FORBIDDEN_REPEATER_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function fail(code: string, path: CompilePath, detail: string, cause?: Error): never {
  throw new ComponentCompileError(code, path, detail, cause === undefined ? undefined : { cause });
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

function isLegacy(plan: SolutionImplementationPlan): boolean {
  return plan.candidateBundleHash === LEGACY_MODULE_PLAN_CANDIDATE_BUNDLE_HASH;
}

function verifiedBundle(input: ComponentCompileInput): CapabilityCandidateBundle | undefined {
  if (isLegacy(input.plan)) return undefined;
  if (input.bundle === undefined) fail("CAPABILITY_CANDIDATE_BUNDLE_REQUIRED", ["bundle"], "native compilation requires exact candidate evidence");
  const parsed = CapabilityCandidateBundleSchema.safeParse(input.bundle);
  if (!parsed.success) fail("CAPABILITY_CANDIDATE_BUNDLE_INVALID", ["bundle"], parsed.error.issues[0]?.message ?? "invalid candidate bundle");
  if (input.plan.blueprintHash !== parsed.data.blueprintHash) {
    fail("CANDIDATE_BLUEPRINT_HASH_MISMATCH", ["plan", "blueprintHash"], `${input.plan.blueprintHash} != ${parsed.data.blueprintHash}`);
  }
  const hash = canonicalServerHash(parsed.data);
  if (input.plan.candidateBundleHash !== hash) {
    fail("CANDIDATE_BUNDLE_HASH_MISMATCH", ["plan", "candidateBundleHash"], `${input.plan.candidateBundleHash} != ${hash}`);
  }
  return parsed.data;
}

function pageForRoot(plan: SolutionImplementationPlan, rootId: string): SolutionPage {
  const pages = plan.pages.filter((page) => page.root.id === rootId);
  if (pages.length !== 1) fail("COMPONENT_PAGE_CORRELATION_INVALID", ["pages"], `${rootId}: ${pages.length}`);
  return pages[0]!;
}

function technicalCapabilityIds(): ReadonlySet<string> {
  return new Set(listControlCapabilities()
    .filter((capability) => capability.generation.status !== "unsupported" && capability.generation.status !== "preserve-only")
    .map((capability) => capability.id));
}

function exactCandidateRegions(
  bundle: CapabilityCandidateBundle,
  sourcePageId: string,
  sourceRegionIds: readonly string[],
  path: CompilePath,
): readonly CapabilityCandidateBundle["regions"][number][] {
  return sourceRegionIds.map((regionId) => {
    const matches = bundle.regions.filter((region) => region.pageId === sourcePageId && region.regionId === regionId);
    if (matches.length !== 1) fail("CANDIDATE_PROVENANCE_MISMATCH", path, `${sourcePageId}/${regionId}`);
    return matches[0]!;
  });
}

function validateCandidateVersion(
  candidate: CapabilityCandidateBundle["regions"][number]["controls"][number],
  bundle: CapabilityCandidateBundle,
  path: CompilePath,
): void {
  if (candidate.knowledgeVersion !== bundle.knowledgeCatalogVersion) {
    fail("CANDIDATE_VERSION_MISMATCH", path, `${candidate.id}@${candidate.knowledgeVersion} != ${bundle.knowledgeCatalogVersion}`);
  }
}

function controlCapability(
  context: CompileContext,
  node: ControlNode,
  path: CompilePath,
): string {
  const bundle = verifiedBundle(context.input);
  if (bundle === undefined) fail("LEGACY_CONTROL_UNSUPPORTED", path, node.capabilityId);
  const regions = exactCandidateRegions(bundle, context.sourcePageId, node.sourceBlueprintRegionIds, path);
  for (const region of regions) {
    const candidate = region.controls.find((entry) => entry.id === node.capabilityId);
    if (candidate === undefined) fail("CONTROL_CAPABILITY_CANDIDATE_MISSING", path, node.capabilityId);
    validateCandidateVersion(candidate, bundle, path);
  }
  if (!technicalCapabilityIds().has(node.capabilityId)) fail("CONTROL_CAPABILITY_TECHNICALLY_UNAVAILABLE", path, node.capabilityId);
  return node.capabilityId;
}

function layoutCapability(
  context: CompileContext,
  kind: LayoutNode["layout"],
  sourceRegionIds: readonly string[],
  path: CompilePath,
): string {
  const compatible = layoutCapabilityIdsFor(kind);
  const available = technicalCapabilityIds();
  const bundle = verifiedBundle(context.input);
  if (bundle === undefined) {
    const selected = compatible.find((id) => available.has(id));
    if (selected === undefined) fail("LAYOUT_CAPABILITY_TECHNICALLY_UNAVAILABLE", path, kind);
    return selected;
  }
  const regions = exactCandidateRegions(bundle, context.sourcePageId, sourceRegionIds, path);
  const ranked = compatible.flatMap((id) => {
    if (!available.has(id)) return [];
    const positions: number[] = [];
    for (const region of regions) {
      const index = region.layouts.findIndex((candidate) => candidate.id === id);
      if (index < 0) return [];
      validateCandidateVersion(region.layouts[index]!, bundle, path);
      positions.push(index);
    }
    return [{ id, maximumOrder: Math.max(...positions), totalOrder: positions.reduce((sum, value) => sum + value, 0) }];
  }).sort((left, right) => left.maximumOrder - right.maximumOrder
    || left.totalOrder - right.totalOrder
    || compareCodePoints(left.id, right.id));
  const selected = ranked[0]?.id;
  if (selected === undefined) fail("LAYOUT_CAPABILITY_CANDIDATE_MISSING", path, kind);
  return selected;
}

function compiledGeometry(context: CompileContext, id: string, path: CompilePath): CompiledLayoutNode {
  const compiled = context.input.layout.byId.get(id);
  if (compiled === undefined) fail("COMPILED_LAYOUT_NODE_MISSING", path, id);
  return compiled;
}

function expandedId(nodeId: string, prefix: string | undefined): string {
  const id = prefix === undefined ? nodeId : `${prefix}--${nodeId}`;
  if (id.length > MAX_CONTROL_ID_LENGTH) fail("COMPONENT_ID_TOO_LONG", [nodeId, "id"], id);
  return id;
}

function pushControl(context: CompileContext, control: UIImplementationControlV2, path: CompilePath): void {
  if (context.controlIds.has(control.id)) fail("COMPONENT_ID_DUPLICATE", path, control.id);
  context.controlIds.add(control.id);
  context.controls.push(control);
}

function compiledLayoutMetadata(node: LayoutNode, compiled: CompiledLayoutNode) {
  if (node.layout === "scroll-region") {
    if (compiled.scrollContentExtent === undefined) fail("COMPILED_SCROLL_EXTENT_MISSING", [node.id, "scrollContentExtent"], node.id);
    return {
      kind: node.layout,
      overflow: "local-scroll" as const,
      scrollContentExtent: { ...compiled.scrollContentExtent },
    };
  }
  return { kind: node.layout, overflow: "visible" as const };
}

function reviewedLayoutNativeProperties(
  capabilityId: string,
  parentId: string | undefined,
): UIImplementationControlV2["nativeProperties"] {
  return adaptReviewedComponentProperties(capabilityId, {}, undefined, parentId, undefined).nativeProperties;
}

function sourceFields(node: SolutionNode, context: CompileContext) {
  return {
    sourceSolutionNodeId: node.id,
    sourceBlueprintPageId: context.sourcePageId,
    sourceBlueprintRegionIds: [...node.sourceBlueprintRegionIds],
    eventBindings: [] as [],
  };
}

function emitLayout(context: CompileContext, node: LayoutNode, walk: WalkContext): void {
  const id = expandedId(node.id, walk.idPrefix);
  const compiled = compiledGeometry(context, id, [id, "geometry"]);
  const capabilityId = layoutCapability(context, node.layout, node.sourceBlueprintRegionIds, [id, "capabilityId"]);
  pushControl(context, {
    id,
    ...(walk.parentId === undefined ? {} : { parentId: walk.parentId }),
    role: "layout",
    capabilityId,
    depth: walk.depth,
    zIndex: compiled.zIndex + (context.overlay === undefined ? 0 : OVERLAY_Z_BASE),
    geometry: { ...compiled.geometry },
    compiledLayout: compiledLayoutMetadata(node, compiled),
    nativeProperties: reviewedLayoutNativeProperties(capabilityId, walk.parentId),
    ...(node.layout === "scroll-region" ? { style: { declarations: { overflow: "auto" as const }, states: {} } } : {}),
    ...(walk.sourceRepeaterId === undefined ? {} : { sourceRepeaterId: walk.sourceRepeaterId }),
    ...sourceFields({ ...node, id }, context),
  }, [id]);
  node.children.forEach((child) => walkNode(context, child, {
    ...walk,
    parentId: id,
    depth: walk.depth + 1,
  }));
}

function componentSemanticData(
  value: Parameters<typeof semanticValueToData>[0],
  records: ReadonlyMap<string, SemanticDataRecord>,
  path: CompilePath,
): SemanticData {
  try {
    return semanticValueToData(value, records, path);
  } catch (error) {
    if (error instanceof ModuleNodeCompileError) {
      fail(error.code, error.path, error.message, error);
    }
    throw error;
  }
}

function semanticProperties(node: ControlNode, walk: WalkContext, path: CompilePath): MutableSemanticDataRecord {
  const converted = componentSemanticData(
    { kind: "record", fields: node.properties },
    walk.currentRecords,
    [...path, "properties"],
  );
  if (converted === null || Array.isArray(converted) || typeof converted !== "object") {
    fail("COMPONENT_PROPERTIES_INVALID", [...path, "properties"], "semantic property record required");
  }
  return { ...converted };
}

function mockRecord(record: MockDataSet["records"][number], path: CompilePath): SemanticDataRecord {
  const result: { [key: string]: SemanticData } = {};
  record.values.forEach((entry, index) => {
    if (Object.hasOwn(result, entry.field)) fail("MOCK_DATA_FIELD_DUPLICATE", [...path, index, "field"], entry.field);
    result[entry.field] = entry.value;
  });
  return result;
}

function tableBinding(context: CompileContext, node: ControlNode, properties: MutableSemanticDataRecord, path: CompilePath) {
  if (node.mockDataId === undefined) return {};
  if (node.capabilityId !== "easyui.1") fail("MOCK_DATA_CAPABILITY_UNSUPPORTED", [...path, "mockDataId"], node.capabilityId);
  const dataSet = context.mockDataById.get(node.mockDataId);
  if (dataSet === undefined) fail("MOCK_DATA_NOT_FOUND", [...path, "mockDataId"], node.mockDataId);
  const rows = dataSet.records.map((record, index) => mockRecord(record, [...path, "mockData", index, "values"]));
  const tableData = {
    columns: dataSet.fields.map((field) => ({ key: field.key, label: field.label, align: "left" as const })),
    rows,
    pageSize: Math.min(20, rows.length),
  };
  try {
    parseTableData(tableData);
  } catch (error) {
    fail("MOCK_DATA_ADAPTER_INVALID", [...path, "mockDataId"], node.mockDataId, error instanceof Error ? error : undefined);
  }
  properties.tableData = tableData;
  properties.pageSize = tableData.pageSize;
  properties.pagination = rows.length > tableData.pageSize;
  return {
    dataBinding: {
      mockDataId: node.mockDataId,
      records: rows,
    },
  };
}

function approvedAsset(context: CompileContext, modelId: string, path: CompilePath): ApprovedAssetFacts {
  let workspaceId: string;
  try {
    workspaceId = modelAssetIdToWorkspaceAssetId(modelId);
  } catch (error) {
    fail("COMPONENT_ASSET_ID_INVALID", path, modelId, error instanceof Error ? error : undefined);
  }
  const matches = context.input.approvedAssets.filter((candidate) => candidate.workspaceAssetId === workspaceId!);
  if (matches.length !== 1) fail("COMPONENT_ASSET_NOT_APPROVED", path, modelId);
  const parsed = ApprovedAssetFactsSchema.safeParse(matches[0]);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    fail("COMPONENT_ASSET_FACTS_INVALID", [...path, ...(issue?.path.map(String) ?? [])], issue?.message ?? modelId);
  }
  return parsed.data;
}

function styleAssetIds(context: CompileContext, node: ControlNode, path: CompilePath): string[] {
  const ids: string[] = [];
  const visit = (declarations: NonNullable<ControlNode["styleOverride"]>["declarations"]): void => {
    declarations.advanced?.forEach((declaration) => {
      if (declaration.kind !== "background-image") return;
      approvedAsset(context, declaration.assetId, [...path, "style", "assetId"]);
      ids.push(declaration.assetId);
    });
  };
  if (node.styleOverride !== undefined) {
    visit(node.styleOverride.declarations);
    Object.values(node.styleOverride.states).forEach((declarations) => {
      if (declarations !== undefined) visit(declarations);
    });
  }
  return ids;
}

function emitControl(context: CompileContext, node: ControlNode, walk: WalkContext): void {
  const id = expandedId(node.id, walk.idPrefix);
  const compiled = compiledGeometry(context, id, [id, "geometry"]);
  const capabilityId = controlCapability(context, node, [id, "capabilityId"]);
  const properties = semanticProperties(node, walk, [id]);
  const assetIds = styleAssetIds(context, node, [id]);
  if (typeof properties.src === "string" && properties.src.startsWith("asset-")) {
    const modelId = properties.src;
    properties.src = approvedAsset(context, modelId, [id, "properties", "src"]).targetPath;
    assetIds.push(modelId);
  }
  const dataBinding = tableBinding(context, node, properties, [id]);
  const semanticContent = componentSemanticData(node.content, walk.currentRecords, [id, "content"]);
  if (semanticContent !== null && typeof semanticContent !== "string") {
    fail("COMPONENT_CONTENT_INVALID", [id, "content"], capabilityId);
  }
  let adapted: ReturnType<typeof adaptReviewedComponentProperties>;
  try {
    adapted = adaptReviewedComponentProperties(
      capabilityId,
      properties,
      typeof semanticContent === "string" ? semanticContent : undefined,
      walk.parentId,
      undefined,
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : "reviewed component adapter rejected properties";
    fail("COMPONENT_PROPERTY_INVALID", [id, "properties"], detail, error instanceof Error ? error : undefined);
  }
  pushControl(context, {
    id,
    ...(walk.parentId === undefined ? {} : { parentId: walk.parentId }),
    role: node.styleRole,
    capabilityId,
    ...adapted,
    depth: walk.depth,
    zIndex: compiled.zIndex + (context.overlay === undefined ? 0 : OVERLAY_Z_BASE),
    geometry: { ...compiled.geometry },
    ...(node.styleOverride === undefined ? {} : { style: {
      role: node.styleRole,
      declarations: node.styleOverride.declarations,
      states: node.styleOverride.states,
    } }),
    ...dataBinding,
    ...(assetIds.length === 0 ? {} : { assetIds: [...new Set(assetIds)].sort(compareCodePoints) }),
    ...(walk.sourceRepeaterId === undefined ? {} : { sourceRepeaterId: walk.sourceRepeaterId }),
    ...sourceFields({ ...node, id }, context),
  }, [id]);
}

function normalizeRepeaterKey(value: SemanticScalar, path: CompilePath): Readonly<{ raw: string; normalized: string }> {
  if (value === null) fail("REPEATER_KEY_MISSING", path, "null");
  if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) fail("REPEATER_KEY_UNSAFE", path, String(value));
  const raw = String(value).normalize("NFKC").trim();
  if (raw.length === 0 || raw.length > 48 || FORBIDDEN_REPEATER_KEYS.has(raw.toLowerCase())) {
    fail("REPEATER_KEY_UNSAFE", path, raw || "empty");
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(raw)) fail("REPEATER_KEY_UNSAFE", path, raw);
  const normalized = raw.toLowerCase().replace(/[ _]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(normalized)) fail("REPEATER_KEY_UNSAFE", path, raw);
  return { raw: `${typeof value}:${raw}`, normalized };
}

function emitRepeater(context: CompileContext, node: RepeaterNode, walk: WalkContext): void {
  const dataSet = context.mockDataById.get(node.mockDataId);
  if (dataSet === undefined) fail("REPEATER_DATA_NOT_FOUND", [node.id, "mockDataId"], node.mockDataId);
  if (dataSet.records.length > node.maxItems) fail("REPEATER_MAX_ITEMS_EXCEEDED", [node.id, "records"], `${dataSet.records.length} > ${node.maxItems}`);
  const baseId = expandedId(node.id, walk.idPrefix);
  const rawKeys = new Set<string>();
  const normalizedKeys = new Map<string, string>();
  dataSet.records.forEach((record, recordIndex) => {
    const current = mockRecord(record, [node.id, "records", recordIndex, "values"]);
    if (!Object.hasOwn(current, node.keyField)) fail("REPEATER_KEY_MISSING", [node.id, "records", recordIndex, node.keyField], node.keyField);
    const key = normalizeRepeaterKey(current[node.keyField] as SemanticScalar, [node.id, "records", recordIndex, node.keyField]);
    if (rawKeys.has(key.raw)) fail("REPEATER_KEY_DUPLICATE", [node.id, "records", recordIndex, node.keyField], key.raw);
    rawKeys.add(key.raw);
    const prior = normalizedKeys.get(key.normalized);
    if (prior !== undefined) fail("REPEATER_KEY_COLLISION", [node.id, "records", recordIndex, node.keyField], `${prior} / ${key.raw}`);
    normalizedKeys.set(key.normalized, key.raw);
    const itemId = `${baseId}--${key.normalized}`;
    if (itemId.length > MAX_CONTROL_ID_LENGTH) fail("COMPONENT_ID_TOO_LONG", [node.id, "records", recordIndex, node.keyField], itemId);
    const compiled = compiledGeometry(context, itemId, [itemId, "geometry"]);
    const capabilityId = layoutCapability(context, "column", node.sourceBlueprintRegionIds, [itemId, "capabilityId"]);
    const itemNode: LayoutNode = {
      kind: "layout",
      id: itemId,
      layout: "column",
      sourceBlueprintRegionIds: [...node.sourceBlueprintRegionIds],
      intent: node.intent,
      children: [node.template],
    };
    pushControl(context, {
      id: itemId,
      ...(walk.parentId === undefined ? {} : { parentId: walk.parentId }),
      role: "repeater-item",
      capabilityId,
      depth: walk.depth,
      zIndex: compiled.zIndex + (context.overlay === undefined ? 0 : OVERLAY_Z_BASE),
      geometry: { ...compiled.geometry },
      compiledLayout: compiledLayoutMetadata(itemNode, compiled),
      nativeProperties: reviewedLayoutNativeProperties(capabilityId, walk.parentId),
      sourceRepeaterId: node.id,
      ...sourceFields(itemNode, context),
    }, [itemId]);
    const records = new Map(walk.currentRecords);
    records.set(node.itemAlias, current);
    walkNode(context, node.template, {
      parentId: itemId,
      depth: walk.depth + 1,
      idPrefix: itemId,
      sourceRepeaterId: node.id,
      currentRecords: records,
    });
  });
}

function emitModule(context: CompileContext, node: Extract<SolutionNode, { kind: "registered-module" }>, walk: WalkContext): void {
  const id = expandedId(node.id, walk.idPrefix);
  const compiled = compiledGeometry(context, id, [id, "geometry"]);
  const controls = compileRegisteredModuleNode({
    plan: context.input.plan,
    page: { ...context.page, sourceBlueprintPageId: context.sourcePageId },
    node: { ...node, id },
    layoutNode: compiled,
    moduleRegistry: context.input.moduleRegistry,
    approvedAssets: context.input.approvedAssets,
    currentRecords: walk.currentRecords,
    ...(walk.parentId === undefined ? {} : { parentId: walk.parentId }),
    depth: walk.depth,
  });
  controls.forEach((control) => pushControl(context, {
    ...control,
    zIndex: control.zIndex + (context.overlay === undefined ? 0 : OVERLAY_Z_BASE),
    ...(walk.sourceRepeaterId === undefined ? {} : { sourceRepeaterId: walk.sourceRepeaterId }),
  }, [id, control.id]));
}

function walkNode(context: CompileContext, node: SolutionNode, walk: WalkContext): void {
  if (node.kind === "layout") emitLayout(context, node, walk);
  else if (node.kind === "control") emitControl(context, node, walk);
  else if (node.kind === "repeater") emitRepeater(context, node, walk);
  else emitModule(context, node, walk);
}

function validateNativePage(
  context: CompileContext,
  controls: UIImplementationControlV2[],
): readonly UIImplementationControlV2[] {
  const parsed = UIImplementationSpecV2Schema.safeParse({
    schema: "kf-ui-implementation/v2",
    compatibility: "native",
    theme: context.input.plan.theme,
    compiledRoleStyles: {},
    pages: [{
      compatibility: "native",
      id: context.page.id,
      width: context.input.layout.pageWidth,
      height: context.input.layout.pageHeight,
      sourceBlueprintPageId: context.sourcePageId,
      controls,
    }],
    compiledActions: [],
    compiledScripts: [],
  });
  if (!parsed.success) fail("UI_IMPLEMENTATION_V2_INVALID", [context.page.id], parsed.error.issues[0]?.message ?? "invalid native implementation");
  assertImplementationMatchesCompiledLayout(parsed.data, context.page.id, context.input.layout);
  const nativePage = parsed.data.pages[0]!;
  if (nativePage.compatibility !== "native") fail("UI_IMPLEMENTATION_V2_INVALID", [context.page.id], "native page required");
  return nativePage.controls;
}

function compileRoot(
  input: ComponentCompileInput,
  page: SolutionPage,
  root: SolutionNode,
  overlay?: OverlayPlan,
): readonly UIImplementationControlV2[] {
  verifiedBundle(input);
  const context: CompileContext = {
    input,
    page,
    sourcePageId: overlay?.sourceBlueprintPageId ?? page.sourceBlueprintPageId,
    mockDataById: new Map(input.plan.mockData.map((dataSet) => [dataSet.id, dataSet])),
    controls: [],
    controlIds: new Set(),
    ...(overlay === undefined ? {} : { overlay }),
  };
  walkNode(context, root, { depth: 0, currentRecords: new Map() });
  if (overlay !== undefined) {
    const rootControl = context.controls.find((control) => control.id === root.id);
    if (rootControl === undefined) fail("OVERLAY_ROOT_CONTROL_MISSING", [overlay.id, "root"], root.id);
    rootControl.overlayHost = {
      overlayId: overlay.id,
      hostPageId: overlay.hostPageId,
      presentation: overlay.presentation,
      visibleStateId: overlay.visibleStateId,
      dismissible: overlay.dismissible,
      initiallyVisible: false,
    };
  }
  return validateNativePage(context, context.controls);
}

export function compileComponents(input: ComponentCompileInput): UIImplementationControlV2[] {
  const page = pageForRoot(input.plan, input.layout.root.id);
  return [...compileRoot(input, page, page.root)];
}

export function compileOverlay(input: OverlayCompileInput): CompiledOverlay {
  const matches = input.plan.overlays.filter((overlay) => overlay.id === input.overlayId);
  if (matches.length !== 1) fail("OVERLAY_NOT_FOUND", ["overlays", input.overlayId], String(matches.length));
  const overlay = matches[0]!;
  const pageMatches = input.plan.pages.filter((page) => page.id === overlay.hostPageId);
  if (pageMatches.length !== 1) fail("OVERLAY_HOST_PAGE_INVALID", [overlay.id, "hostPageId"], overlay.hostPageId);
  if (overlay.sourceBlueprintPageId !== pageMatches[0]!.sourceBlueprintPageId) {
    fail(
      "OVERLAY_HOST_PROVENANCE_MISMATCH",
      [overlay.id, "sourceBlueprintPageId"],
      `${overlay.sourceBlueprintPageId} != ${pageMatches[0]!.sourceBlueprintPageId}`,
    );
  }
  const stateMatches = input.plan.localState.filter((state) => state.id === overlay.visibleStateId);
  if (stateMatches.length !== 1 || stateMatches[0]!.type !== "boolean") {
    fail("OVERLAY_VISIBLE_STATE_INVALID", [overlay.id, "visibleStateId"], overlay.visibleStateId);
  }
  if (stateMatches[0]!.initialValue !== false) {
    fail("OVERLAY_INITIAL_STATE_VISIBLE", [overlay.id, "visibleStateId"], overlay.visibleStateId);
  }
  if (input.layout.root.id !== overlay.root.id) fail("OVERLAY_LAYOUT_CORRELATION_INVALID", [overlay.id, "root"], input.layout.root.id);
  const controls = compileRoot(input, pageMatches[0]!, overlay.root, overlay);
  return Object.freeze({ overlayId: overlay.id, hostPageId: overlay.hostPageId, controls });
}
