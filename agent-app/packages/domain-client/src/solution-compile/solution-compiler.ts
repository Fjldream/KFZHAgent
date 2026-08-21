import {
  ApprovedAssetFactsSchema,
  CapabilityCandidateBundleSchema,
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
import type { ModuleRegistry } from "../modules/module-registry.js";
import { assertSolutionPlanUsesCandidates } from "../planning/capability-retrieval.js";
import { KF36_RUNTIME_PROFILE } from "../style/runtime-profile.js";
import {
  assertPersistedStyleHandoffComplete,
  compileResolvedStyle,
} from "../style/style-engine.js";
import { resolveStyle } from "../style/theme-resolver.js";
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

export interface SolutionCompileInput {
  readonly plan: SolutionImplementationPlan;
  readonly candidateBundle?: CapabilityCandidateBundle;
  readonly moduleRegistry: ModuleRegistry;
  readonly approvedAssets: readonly ApprovedAssetFacts[];
  readonly activeCatalogVersion: string;
}

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
  readonly prefix?: string;
  readonly sourceRepeaterId?: string;
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
type ComponentStyleSpecV2 = NonNullable<UIImplementationControlV2["style"]>;

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
  if (value === null || typeof value === "boolean") fail("expansion", nodeId, "REPEATER_KEY_UNSAFE", String(value));
  if (typeof value === "number" && (!Number.isFinite(value) || value < 0)) {
    fail("expansion", nodeId, "REPEATER_KEY_UNSAFE", String(value));
  }
  const raw = String(value).normalize("NFKC").trim();
  if (raw.length === 0 || raw.length > 48 || FORBIDDEN_KEYS.has(raw.toLowerCase())
    || !/^[A-Za-z0-9][A-Za-z0-9 _-]*$/.test(raw)) {
    fail("expansion", nodeId, "REPEATER_KEY_UNSAFE", raw || "empty");
  }
  const normalized = raw.toLowerCase().replace(/[ _]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (normalized.length === 0) fail("expansion", nodeId, "REPEATER_KEY_UNSAFE", raw);
  return normalized;
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
    return dataSet.records.map((_, index) => {
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
      const children = expandNode(node.template, { dataSets: context.dataSets, records, prefix: itemId, sourceRepeaterId: node.id });
      return {
        kind: "layout",
        id: itemId,
        layout: "column",
        sourceBlueprintRegionIds: [...node.sourceBlueprintRegionIds],
        intent: node.intent,
        children,
      };
    });
  }

  const id = expandedId(node.id, context.prefix);
  if (node.kind === "layout") {
    return [{
      ...node,
      id,
      children: node.children.flatMap((child) => expandNode(child, context)),
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
  return [{
    ...node,
    id,
    ...(node.content === undefined ? {} : { content: resolveValue(node.content, context.records, id) }),
    slots: node.slots.map((slot) => ({
      slotId: slot.slotId,
      children: slot.children.flatMap((child) => expandNode(child, context)),
    })),
  }];
}

function expandRoot(root: SolutionNode, dataSets: ReadonlyMap<string, MockDataSet>): SolutionNode {
  const expanded = expandNode(root, { dataSets, records: new Map() });
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

function roleDeclarations(plan: SolutionImplementationPlan, role: string) {
  return plan.roleStyles.find((candidate) => candidate.role === role)?.declarations ?? {};
}

function measureTreeUnsafe(
  node: SolutionNode,
  plan: SolutionImplementationPlan,
  moduleRegistry: ModuleRegistry,
  available: number,
  output: Map<string, IntrinsicSize>,
): IntrinsicSize {
  const declarations = node.kind === "control"
    ? { ...roleDeclarations(plan, node.styleRole), ...(node.styleOverride?.declarations ?? {}) }
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
      padding: { horizontal: paddingHorizontal, vertical: paddingVertical },
      border: { horizontal: borderHorizontal, vertical: borderVertical },
    },
  } as const;

  let measured: IntrinsicSize;
  if (node.kind === "layout") {
    const children = node.children.map((child) => measureTree(child, plan, moduleRegistry, available, output));
    measured = measureIntrinsic({ ...base, kind: "layout", node, childMeasures: children, gap: plan.theme.spacingUnit });
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
): IntrinsicSize {
  return boundary("measurement", node.id, () =>
    measureTreeUnsafe(node, plan, moduleRegistry, available, output));
}

function compilePageLayout(
  page: SolutionPage,
  expandedRoot: SolutionNode,
  plan: SolutionImplementationPlan,
  moduleRegistry: ModuleRegistry,
): CompiledLayoutTree {
  const available = page.canvas === "large-display" ? 1808 : 1360;
  const intrinsic = new Map<string, IntrinsicSize>();
  boundary("measurement", expandedRoot.id, () => measureTree(expandedRoot, plan, moduleRegistry, available, intrinsic));
  return boundary("layout", expandedRoot.id, () => compileLayout({ page: { ...page, root: expandedRoot }, expandedRoot, intrinsicByNodeId: intrinsic }));
}

function withPageHeight(layout: CompiledLayoutTree, pageHeight: number): CompiledLayoutTree {
  return pageHeight === layout.pageHeight ? layout : Object.freeze({ ...layout, pageHeight });
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
      styleDataNew: compiled.persistedStyleHandoff.styleDataNew,
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
  const parsed = parseInput(input);
  const dataSets = new Map(parsed.plan.mockData.map((dataSet) => [dataSet.id, dataSet]));
  const pageCompilations: PageCompilation[] = parsed.plan.pages.map((page) => {
    const expandedRoot = boundary("expansion", page.root.id, () => expandRoot(page.root, dataSets));
    const layout = compilePageLayout(page, expandedRoot, parsed.plan, input.moduleRegistry);
    return { page, expandedRoot, layout };
  });
  const overlayCompilations = parsed.plan.overlays.map((overlay) => {
    const hostPage = parsed.plan.pages.find((page) => page.id === overlay.hostPageId);
    if (hostPage === undefined) fail("layout", overlay.id, "OVERLAY_HOST_PAGE_MISSING", overlay.hostPageId);
    const expandedRoot = boundary("expansion", overlay.root.id, () => expandRoot(overlay.root, dataSets));
    const overlayPage: SolutionPage = { ...hostPage, root: expandedRoot };
    const layout = compilePageLayout(overlayPage, expandedRoot, parsed.plan, input.moduleRegistry);
    return { overlay, hostPage, expandedRoot, layout };
  });

  const pages: MutableNativePage[] = pageCompilations.map((compiledPage) => {
    const ownedOverlays = overlayCompilations.filter((entry) => entry.overlay.hostPageId === compiledPage.page.id);
    const pageHeight = Math.max(compiledPage.layout.pageHeight, ...ownedOverlays.map((entry) => entry.layout.pageHeight));
    const pageLayout = withPageHeight(compiledPage.layout, pageHeight);
    const controls = boundary("component", compiledPage.page.root.id, () => compileComponents({
      plan: parsed.plan,
      ...(parsed.bundle === undefined ? {} : { bundle: parsed.bundle }),
      layout: pageLayout,
      moduleRegistry: input.moduleRegistry,
      approvedAssets: parsed.approvedAssets,
    }));
    const overlayControls = ownedOverlays.flatMap((entry) => boundary("component", entry.overlay.id, () => compileOverlay({
      plan: parsed.plan,
      ...(parsed.bundle === undefined ? {} : { bundle: parsed.bundle }),
      layout: withPageHeight(entry.layout, pageHeight),
      moduleRegistry: input.moduleRegistry,
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
      .map((entry) => withPageHeight(entry.layout, implementation.pages.find((page) => page.id === compiledPage.page.id)!.height));
    const page = implementation.pages.find((entry) => entry.id === compiledPage.page.id);
    if (page === undefined) fail("validation", compiledPage.page.id, "IMPLEMENTATION_PAGE_MISSING", compiledPage.page.id);
    const correlated = mergeLayoutTrees(withPageHeight(compiledPage.layout, page.height), overlays);
    boundary("validation", compiledPage.page.id, () => assertImplementationMatchesCompiledLayout(implementation, compiledPage.page.id, correlated));
  });
  return deepFreeze(implementation);
}
