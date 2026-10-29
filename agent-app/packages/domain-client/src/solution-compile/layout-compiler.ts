import {
  MAX_COMPILED_LAYOUT_EXTENT,
  type LayoutNode,
  type NodeIntent,
  type SolutionNode,
  type SolutionPage,
  type UIImplementationSpecV2,
} from "@kf/contracts";
import type { IntrinsicSize } from "./intrinsic-measure.js";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { EMPTY_LAYOUT_INSETS, type LayoutContentInsets } from "./layout-surface.js";
// end

const MAX_DIMENSION = MAX_COMPILED_LAYOUT_EXTENT;
const GRID_COLUMN_LIMIT = 12;
const LAYOUT_KINDS: readonly LayoutKind[] = ["row", "column", "grid", "asymmetric-grid", "split", "stack", "dock", "sidebar-content", "master-detail", "scroll-region", "overlay-anchor"];
const NODE_KINDS: readonly SolutionNode["kind"][] = ["layout", "registered-module", "control", "repeater"];
const DENSITIES: readonly Density[] = ["compact", "comfortable", "spacious"];
const IMPORTANCE: readonly Importance[] = ["primary", "secondary", "supporting"];
const ALIGNMENTS: readonly NodeIntent["align"][] = ["start", "center", "end", "stretch"];

const DENSITY = {
  compact: { pagePadding: 24, sectionGap: 16, controlGap: 8 },
  comfortable: { pagePadding: 40, sectionGap: 24, controlGap: 12 },
  spacious: { pagePadding: 56, sectionGap: 32, controlGap: 16 },
} as const;

type Axis = "width" | "height";
type LayoutKind = LayoutNode["layout"];
type Density = NodeIntent["density"];
type Importance = NodeIntent["importance"];
type SizeIntent = NodeIntent["width"] | NodeIntent["height"];

export interface LayoutGeometry {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface CompiledLayoutNode {
  readonly id: string;
  readonly kind: SolutionNode["kind"];
  readonly layout: LayoutKind | undefined;
  readonly geometry: LayoutGeometry;
  readonly zIndex: number;
  readonly overflow: "visible" | "local-scroll";
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  readonly contentInsets?: LayoutContentInsets;
  // end
  readonly scrollContentExtent?: Readonly<{ width: number; height: number }>;
  readonly children: readonly CompiledLayoutNode[];
}

export interface LayoutCompileInput {
  readonly page: SolutionPage;
  readonly expandedRoot: SolutionNode;
  readonly intrinsicByNodeId: ReadonlyMap<string, IntrinsicSize>;
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  readonly layoutInsetsByNodeId?: ReadonlyMap<string, LayoutContentInsets>;
  // end
}

export interface CompiledLayoutTree {
  readonly pageWidth: 1440 | 1920;
  readonly pageHeight: number;
  readonly root: CompiledLayoutNode;
  readonly byId: ReadonlyMap<string, CompiledLayoutNode>;
}

export interface CompilerOwnedTabPaneRelocation {
  readonly ownerNodeId: string;
  readonly paneNodeId: string;
}

export type LayoutCompileErrorCode = "LAYOUT_INPUT_INVALID" | "LAYOUT_UNSATISFIABLE";

export interface LayoutCompileErrorDetails {
  readonly nodeId: string;
  readonly minimumRequired: Readonly<{ width: number; height: number }>;
  readonly available: Readonly<{ width: number; height: number }>;
  readonly attemptedColumns: readonly number[];
  readonly scrollAllowed: boolean;
}

export class LayoutCompileError extends Error {
  readonly code: LayoutCompileErrorCode;
  readonly details: LayoutCompileErrorDetails;

  constructor(code: LayoutCompileErrorCode, details: LayoutCompileErrorDetails) {
    super(`${code}: ${details.nodeId}; minimum ${details.minimumRequired.width}x${details.minimumRequired.height}; available ${details.available.width}x${details.available.height}`);
    this.name = "LayoutCompileError";
    this.code = code;
    this.details = Object.freeze({
      ...details,
      minimumRequired: Object.freeze({ ...details.minimumRequired }),
      available: Object.freeze({ ...details.available }),
      attemptedColumns: Object.freeze([...details.attemptedColumns]),
    });
  }
}

export type LayoutImplementationMismatchField =
  | "page"
  | "correlation"
  | "compiledLayout"
  | "kind"
  | "overflow"
  | "geometry"
  | "scrollContentExtent";

export interface LayoutImplementationMismatchDetails {
  readonly pageId: string;
  readonly nodeId: string;
  readonly field: LayoutImplementationMismatchField;
  readonly expected: string;
  readonly actual: string;
}

export class LayoutImplementationMismatchError extends Error {
  readonly code = "LAYOUT_IMPLEMENTATION_MISMATCH" as const;
  readonly details: LayoutImplementationMismatchDetails;

  constructor(details: LayoutImplementationMismatchDetails) {
    super(`${details.field} mismatch for ${details.nodeId} on page ${details.pageId}: expected ${details.expected}; actual ${details.actual}`);
    this.name = "LayoutImplementationMismatchError";
    this.details = Object.freeze({ ...details });
  }
}

/** Correlates each compiled layout node id to exactly one control.sourceSolutionNodeId on the target page. */
export function assertImplementationMatchesCompiledLayout(
  implementation: UIImplementationSpecV2,
  pageId: string,
  layout: CompiledLayoutTree,
  tabPaneRelocations: readonly CompilerOwnedTabPaneRelocation[] = [],
): void {
  const matchingPages = implementation.pages.filter((candidate) => candidate.id === pageId);
  const page = matchingPages[0];
  if (implementation.compatibility !== "native" || matchingPages.length !== 1 || page === undefined || page.compatibility !== "native") {
    implementationMismatch(pageId, pageId, "page", "exactly one native implementation page", `${matchingPages.length} matching pages`);
  }
  if (page.width !== layout.pageWidth || page.height !== layout.pageHeight) {
    implementationMismatch(pageId, pageId, "page", `${layout.pageWidth}x${layout.pageHeight}`, `${page.width}x${page.height}`);
  }
  const controlsBySourceNodeId = new Map<string, typeof page.controls>();
  page.controls.forEach((control) => {
    const controls = controlsBySourceNodeId.get(control.sourceSolutionNodeId) ?? [];
    controls.push(control);
    controlsBySourceNodeId.set(control.sourceSolutionNodeId, controls);
  });
  const relocatedGeometry = deriveCompilerOwnedTabPaneGeometry(layout, pageId, tabPaneRelocations);
  const trustedLayoutNodes = [...layout.byId.values()].filter((node) => node.layout !== undefined);
  const trustedLayoutNodeIds = new Set(trustedLayoutNodes.map((node) => node.id));
  page.controls.forEach((control) => {
    if (control.compiledLayout !== undefined && !trustedLayoutNodeIds.has(control.sourceSolutionNodeId)) {
      implementationMismatch(pageId, control.sourceSolutionNodeId, "correlation", "trusted semantic layout node", control.id);
    }
  });
  trustedLayoutNodes.forEach((node) => {
    const controls = controlsBySourceNodeId.get(node.id) ?? [];
    if (controls.length !== 1) {
      implementationMismatch(pageId, node.id, "correlation", "exactly one layout control", `${controls.length} controls`);
    }
    const metadata = controls[0]!.compiledLayout;
    if (metadata === undefined) {
      implementationMismatch(pageId, node.id, "compiledLayout", "compiler-owned metadata", "missing");
    }
    if (metadata.kind !== node.layout) {
      implementationMismatch(pageId, node.id, "kind", node.layout!, metadata.kind);
    }
    if (metadata.overflow !== node.overflow) {
      implementationMismatch(pageId, node.id, "overflow", node.overflow, metadata.overflow);
    }
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    if ((metadata.contentInsets === undefined) !== (node.contentInsets === undefined)
      || (metadata.contentInsets !== undefined && node.contentInsets !== undefined
        && (["left", "right", "top", "bottom"] as const).some(side => metadata.contentInsets![side] !== node.contentInsets![side]))) {
      implementationMismatch(pageId, node.id, "compiledLayout", JSON.stringify(node.contentInsets) ?? "absent insets", JSON.stringify(metadata.contentInsets) ?? "absent insets");
    }
    // end
    const expectedGeometry = relocatedGeometry.get(node.id) ?? node.geometry;
    if (!sameGeometry(controls[0]!.geometry, expectedGeometry)) {
      implementationMismatch(pageId, node.id, "geometry", formatGeometry(expectedGeometry), formatGeometry(controls[0]!.geometry));
    }
    if (node.scrollContentExtent !== undefined) {
      if (metadata.kind !== "scroll-region") {
        implementationMismatch(pageId, node.id, "scrollContentExtent", formatExtent(node.scrollContentExtent), "missing");
      }
      if (metadata.scrollContentExtent.width !== node.scrollContentExtent.width
        || metadata.scrollContentExtent.height !== node.scrollContentExtent.height) {
        implementationMismatch(pageId, node.id, "scrollContentExtent", formatExtent(node.scrollContentExtent), formatExtent(metadata.scrollContentExtent));
      }
    } else if ("scrollContentExtent" in metadata) {
      implementationMismatch(pageId, node.id, "scrollContentExtent", "absent", "present");
    }
  });
}

/**
 * Derives the only layout exception used by native Tabs from the trusted
 * compiled layout and compiler-validated semantic owner/pane ids. It never
 * reads implementation geometry or model-authored native parent/region data.
 */
export function deriveCompilerOwnedTabPaneGeometry(
  layout: CompiledLayoutTree,
  pageId: string,
  relocations: readonly CompilerOwnedTabPaneRelocation[],
): ReadonlyMap<string, LayoutGeometry> {
  const geometryById = new Map(
    [...layout.byId].map(([id, node]) => [id, { ...node.geometry }] as const),
  );
  const relocated = new Map<string, LayoutGeometry>();
  const paneIds = new Set<string>();
  for (const relocation of relocations) {
    if (paneIds.has(relocation.paneNodeId)) {
      implementationMismatch(pageId, relocation.paneNodeId, "correlation", "one compiler-owned Tabs pane relocation", "duplicate relocation");
    }
    paneIds.add(relocation.paneNodeId);
    const owner = layout.byId.get(relocation.ownerNodeId);
    const pane = layout.byId.get(relocation.paneNodeId);
    if (owner === undefined || owner.kind !== "control") {
      implementationMismatch(pageId, relocation.ownerNodeId, "correlation", "compiled Tabs control node", owner === undefined ? "missing" : owner.kind);
    }
    if (pane === undefined || pane.layout === undefined) {
      implementationMismatch(pageId, relocation.paneNodeId, "correlation", "compiled layout pane node", pane === undefined ? "missing" : pane.kind);
    }
    const ownerGeometry = geometryById.get(owner.id)!;
    const paneGeometry = geometryById.get(pane.id)!;
    const deltaX = ownerGeometry.x - paneGeometry.x;
    const deltaY = ownerGeometry.y - paneGeometry.y;
    const pending = [pane];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (visited.has(current.id)) {
        implementationMismatch(pageId, relocation.paneNodeId, "correlation", "acyclic compiled Tabs pane subtree", current.id);
      }
      visited.add(current.id);
      const currentGeometry = geometryById.get(current.id)!;
      const nextGeometry = current.id === pane.id
        ? { ...ownerGeometry }
        : { ...currentGeometry, x: currentGeometry.x + deltaX, y: currentGeometry.y + deltaY };
      geometryById.set(current.id, nextGeometry);
      relocated.set(current.id, nextGeometry);
      pending.push(...current.children);
    }
  }
  return relocated;
}

interface CompileContext {
  readonly intrinsic: ReadonlyMap<string, IntrinsicSize>;
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  readonly layoutInsets: ReadonlyMap<string, LayoutContentInsets>;
  // end
  readonly byId: Map<string, CompiledLayoutNode>;
}

interface GridTracks {
  readonly columns: number;
  readonly gap: number;
  readonly widths: readonly number[];
}

interface AxisAllocation {
  readonly gap: number;
  readonly sizes: readonly number[];
}

interface AxisBounds {
  readonly minimum: number;
  readonly preferred: number;
  readonly maximum: number;
}

export function compileLayout(input: LayoutCompileInput): CompiledLayoutTree {
  const nodes = validateInput(input);
  const pageWidth = input.page.canvas === "large-display" ? 1920 : 1440;
  const density = densityTokens(input.expandedRoot.intent.density);
  const pageContentWidth = pageWidth - density.pagePadding * 2;
  const pageContentHeight = MAX_DIMENSION - density.pagePadding * 2;
  const rootIntrinsic = requireIntrinsic(input.intrinsicByNodeId, input.expandedRoot.id);
  const rootWidthBounds = axisBoundsFromMeasured(input.expandedRoot, rootIntrinsic, "width");
  const rootOwnsGridAttempts = input.expandedRoot.kind === "layout"
    && (input.expandedRoot.layout === "grid" || input.expandedRoot.layout === "asymmetric-grid");
  if (rootWidthBounds.minimum > pageContentWidth && !rootOwnsGridAttempts) {
    unsatisfiable(input.expandedRoot.id, rootWidthBounds.minimum, rootIntrinsic.minHeight, pageContentWidth, pageContentHeight, [], false);
  }
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  const context: CompileContext = { intrinsic: input.intrinsicByNodeId, layoutInsets: input.layoutInsetsByNodeId ?? new Map(), byId: new Map() };
  // end
  const rootWidth = Math.min(pageContentWidth, rootUsesAvailableWidth(input.expandedRoot) ? rootWidthBounds.maximum : rootWidthBounds.preferred);
  const rootHeight = preferredHeight(context, input.expandedRoot, rootWidth, false);
  const root = compileNode(context, input.expandedRoot, {
    x: alignedOffset(density.pagePadding, pageContentWidth, rootWidth, input.expandedRoot.intent.align),
    y: density.pagePadding,
    width: rootWidth,
    height: rootHeight,
  }, 0, false);
  const pageHeight = round(root.geometry.y + root.geometry.height + density.pagePadding);
  if (!finiteNonnegative(pageHeight) || pageHeight > MAX_DIMENSION) {
    unsatisfiable(root.id, root.geometry.width, root.geometry.height, pageContentWidth, pageContentHeight, [], root.overflow === "local-scroll");
  }
  const result: CompiledLayoutTree = Object.freeze({ pageWidth, pageHeight, root, byId: context.byId });
  auditResult(result, nodes.length);
  return result;
}

function validateInput(input: LayoutCompileInput): readonly SolutionNode[] {
  const rootId = input.expandedRoot.id;
  if (input.page.root.id !== rootId) inputInvalid(rootId);
  if (input.page.canvas !== "responsive" && input.page.canvas !== "desktop" && input.page.canvas !== "large-display") inputInvalid(rootId);
  const nodes: SolutionNode[] = [];
  const ids = new Set<string>();
  const visited = new Set<SolutionNode>();
  const active = new Set<SolutionNode>();
  const visit = (node: SolutionNode, siblingIds: ReadonlySet<string> | undefined): void => {
    if (active.has(node) || visited.has(node)) inputInvalid(node.id);
    active.add(node);
    visited.add(node);
    if (typeof node.id !== "string" || node.id.length === 0 || ids.has(node.id)) inputInvalid(node.id);
    if (!NODE_KINDS.includes(node.kind)) inputInvalid(node.id);
    ids.add(node.id);
    nodes.push(node);
    validateIntent(node);
    validateGroupReferences(node, siblingIds);
    if (node.kind === "layout") {
      validateLayoutShape(node);
      const childIds = new Set(node.children.map((child) => child.id));
      if (childIds.size !== node.children.length) {
        const duplicate = node.children.find((child, index) => node.children.findIndex((candidate) => candidate.id === child.id) !== index);
        inputInvalid(duplicate?.id ?? node.id);
      }
      node.children.forEach(validateGroupShape);
      validateGroupCycles(node.children, childIds);
      node.children.forEach((child) => visit(child, childIds));
    } else if (node.kind === "registered-module" && node.slots.some((slot) => slot.children.length > 0)) {
      inputInvalid(node.id);
    } else if (node.kind === "repeater") {
      inputInvalid(node.id);
    }
    active.delete(node);
  };
  visit(input.expandedRoot, undefined);
  for (const node of nodes) {
    const measured = input.intrinsicByNodeId.get(node.id);
    if (measured === undefined) inputInvalid(node.id);
    validateIntrinsic(node.id, measured);
    validateIntentAgainstIntrinsic(node, measured);
  }
  for (const id of input.intrinsicByNodeId.keys()) {
    if (!ids.has(id)) inputInvalid(id);
  }
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  for (const [id, insets] of input.layoutInsetsByNodeId ?? []) {
    if (nodes.find(node => node.id === id)?.kind !== "layout"
      || [insets.left, insets.right, insets.top, insets.bottom].some(value => !finiteNonnegative(value) || value > 400 || round(value) !== value)) inputInvalid(id);
  }
  // end
  return Object.freeze(nodes);
}

function validateLayoutShape(node: LayoutNode): void {
  const count = node.children.length;
  if (!LAYOUT_KINDS.includes(node.layout)) inputInvalid(node.id);
  if (count === 0) inputInvalid(node.id);
  if ((node.layout === "split" || node.layout === "sidebar-content" || node.layout === "master-detail") && count !== 2) inputInvalid(node.id);
  if (node.layout === "dock" && (count < 2 || count > 5)) inputInvalid(node.id);
}

function validateGroupReferences(node: SolutionNode, siblingIds: ReadonlySet<string> | undefined): void {
  const seen = new Set<string>();
  for (const target of node.intent.groupWith) {
    if (seen.has(target) || target === node.id || siblingIds === undefined || !siblingIds.has(target)) inputInvalid(node.id);
    seen.add(target);
  }
}

function validateGroupCycles(children: readonly SolutionNode[], siblingIds: ReadonlySet<string>): void {
  const byId = new Map(children.map((child) => [child.id, child]));
  const state = new Map<string, "active" | "done">();
  const visit = (node: SolutionNode): void => {
    const current = state.get(node.id);
    if (current === "active") inputInvalid(node.id);
    if (current === "done") return;
    state.set(node.id, "active");
    node.intent.groupWith.forEach((target) => {
      if (!siblingIds.has(target)) return;
      const targetNode = byId.get(target);
      if (targetNode !== undefined) visit(targetNode);
    });
    state.set(node.id, "done");
  };
  children.forEach(visit);
}

function validateIntent(node: SolutionNode): void {
  if (!DENSITIES.includes(node.intent.density) || !IMPORTANCE.includes(node.intent.importance) || !ALIGNMENTS.includes(node.intent.align)) inputInvalid(node.id);
  if (!Number.isInteger(node.intent.visualWeight) || node.intent.visualWeight < 1 || node.intent.visualWeight > 5) inputInvalid(node.id);
  if (!Number.isInteger(node.intent.readingOrder) || node.intent.readingOrder < 0 || node.intent.readingOrder > 1_000) inputInvalid(node.id);
  validateGroupShape(node);
  validateSizeIntent(node.id, node.intent.width, "width");
  validateSizeIntent(node.id, node.intent.height, "height");
}

function validateGroupShape(node: SolutionNode): void {
  if (!Array.isArray(node.intent.groupWith)
    || node.intent.groupWith.some((target) => typeof target !== "string" || target.length === 0 || target.length > 100)) inputInvalid(node.id);
}

function validateSizeIntent(nodeId: string, size: SizeIntent, axis: Axis): void {
  const modes: readonly SizeIntent["mode"][] = axis === "width"
    ? ["content", "fixed", "fill", "ratio", "minmax"]
    : ["content", "fixed", "fill", "viewport", "ratio", "minmax"];
  if (!modes.includes(size.mode)) inputInvalid(nodeId);
  for (const value of [size.value, size.min, size.max]) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0 || value > MAX_DIMENSION)) inputInvalid(nodeId);
  }
  if ((size.mode === "fixed" || size.mode === "ratio") && size.value === undefined) inputInvalid(nodeId);
  if (size.mode === "minmax" && (size.min === undefined || size.max === undefined)) inputInvalid(nodeId);
  if (size.min !== undefined && size.max !== undefined && size.min > size.max) inputInvalid(nodeId);
}

function validateIntrinsic(nodeId: string, value: IntrinsicSize): void {
  const dimensions = [value.minWidth, value.preferredWidth, value.maxWidth, value.minHeight, value.preferredHeight, value.maxHeight];
  if (dimensions.some((dimension) => !finiteNonnegative(dimension) || dimension > MAX_DIMENSION)
    || value.minWidth > value.preferredWidth || value.preferredWidth > value.maxWidth
    || value.minHeight > value.preferredHeight || value.preferredHeight > value.maxHeight
    || (value.overflow !== "wrap" && value.overflow !== "clip" && value.overflow !== "scroll")) inputInvalid(nodeId);
}

function validateIntentAgainstIntrinsic(node: SolutionNode, measured: IntrinsicSize): void {
  const width = axisRangeFromMeasured(node, measured, "width");
  const height = axisRangeFromMeasured(node, measured, "height");
  if (width.minimum > width.maximum || height.minimum > height.maximum) {
    unsatisfiable(node.id, width.minimum, height.minimum, width.maximum, height.maximum, [], false);
  }
  for (const axis of ["width", "height"] as const) {
    const intent = node.intent[axis];
    if ((intent.mode === "fixed" || intent.mode === "viewport") && intent.value !== undefined) {
      const bounds = axis === "width" ? width : height;
      if (intent.value < bounds.minimum || intent.value > bounds.maximum) {
        const exceedsMaximum = intent.value > bounds.maximum;
        unsatisfiable(
          node.id,
          axis === "width" && exceedsMaximum ? intent.value : width.minimum,
          axis === "height" && exceedsMaximum ? intent.value : height.minimum,
          axis === "width" ? (exceedsMaximum ? bounds.maximum : intent.value) : width.preferred,
          axis === "height" ? (exceedsMaximum ? bounds.maximum : intent.value) : height.preferred,
          [],
          false,
        );
      }
    }
  }
}

function compileNode(
  context: CompileContext,
  node: SolutionNode,
  geometry: LayoutGeometry,
  zIndex: number,
  scrollAllowed: boolean,
): CompiledLayoutNode {
  const box = freezeGeometry(geometry);
  assertGeometryWithinBounds(context, node, box, scrollAllowed);
  let children: readonly CompiledLayoutNode[] = Object.freeze([]);
  if (node.kind === "layout") {
    const ordered = orderedChildren(node);
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    const insets = context.layoutInsets.get(node.id) ?? EMPTY_LAYOUT_INSETS;
    const contentBox = freezeGeometry({ x: box.x + insets.left, y: box.y + insets.top,
      width: box.width - insets.left - insets.right, height: box.height - insets.top - insets.bottom });
    if (contentBox.width <= 0 || contentBox.height < 0) {
      unsatisfiable(node.id, insets.left + insets.right, insets.top + insets.bottom, box.width, box.height, [], scrollAllowed);
    }
    // end
    const childScrollAllowed = scrollAllowed || node.layout === "scroll-region";
    if (node.layout === "row" || node.layout === "split" || node.layout === "sidebar-content" || node.layout === "master-detail") {
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      children = compileRow(context, node, ordered, contentBox, zIndex, childScrollAllowed);
      // end
    } else if (node.layout === "column" || node.layout === "scroll-region") {
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      children = compileColumn(context, node, ordered, contentBox, zIndex, childScrollAllowed);
      // end
    } else if (node.layout === "grid" || node.layout === "asymmetric-grid") {
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      children = compileGrid(context, node, ordered, contentBox, zIndex, childScrollAllowed);
      // end
    } else if (node.layout === "stack" || node.layout === "overlay-anchor") {
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      children = compileStack(context, node, ordered, contentBox, zIndex, childScrollAllowed);
      // end
    } else {
      // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
      children = compileDock(context, node, ordered, contentBox, zIndex, childScrollAllowed);
      // end
    }
  }
  const scrollContentExtent = node.kind === "layout" && node.layout === "scroll-region"
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    ? contentExtent(box, children, context.layoutInsets.get(node.id) ?? EMPTY_LAYOUT_INSETS)
    // end
    : undefined;
  if (scrollContentExtent !== undefined
    && (scrollContentExtent.width > MAX_COMPILED_LAYOUT_EXTENT || scrollContentExtent.height > MAX_COMPILED_LAYOUT_EXTENT)) {
    unsatisfiable(
      node.id,
      scrollContentExtent.width,
      scrollContentExtent.height,
      MAX_COMPILED_LAYOUT_EXTENT,
      MAX_COMPILED_LAYOUT_EXTENT,
      [],
      true,
    );
  }
  const compiled: CompiledLayoutNode = Object.freeze({
    id: node.id,
    kind: node.kind,
    layout: node.kind === "layout" ? node.layout : undefined,
    geometry: box,
    zIndex,
    overflow: node.kind === "layout" && node.layout === "scroll-region" ? "local-scroll" : "visible",
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    ...(context.layoutInsets.has(node.id) && Object.values(context.layoutInsets.get(node.id)!).some(value => value > 0)
      ? { contentInsets: context.layoutInsets.get(node.id)! } : {}),
    // end
    ...(scrollContentExtent === undefined ? {} : { scrollContentExtent }),
    children,
  });
  context.byId.set(node.id, compiled);
  return compiled;
}

function compileStack(
  context: CompileContext,
  parent: LayoutNode,
  children: readonly SolutionNode[],
  box: LayoutGeometry,
  zIndex: number,
  scrollAllowed: boolean,
): readonly CompiledLayoutNode[] {
  const width = sharedAxisSize(context, parent, children, "width", box, scrollAllowed);
  const heightBounds = stackHeightBounds(context, parent, children, width, scrollAllowed);
  const height = Math.min(box.height, heightBounds.maximum);
  if (height < heightBounds.minimum) {
    unsatisfiable(parent.id, width, heightBounds.minimum, width, box.height, [], scrollAllowed);
  }
  const shared = {
    x: alignedOffset(box.x, box.width, width, parent.intent.align),
    y: alignedOffset(box.y, box.height, height, parent.intent.align),
    width,
    height,
  };
  return Object.freeze(children.map((child, index) => compileNode(context, child, shared, zIndex + index + 1, scrollAllowed)));
}

function stackHeightBounds(
  context: CompileContext,
  parent: LayoutNode,
  children: readonly SolutionNode[],
  width: number,
  scrollAllowed: boolean,
): AxisBounds {
  const minimum = Math.max(...children.map((child) => minimumHeight(context, child, width, scrollAllowed)));
  const maximum = Math.min(...children.map((child) => axisMaximum(context, child, "height")));
  if (minimum > maximum) {
    unsatisfiable(parent.id, width, minimum, width, maximum, [], scrollAllowed);
  }
  const preferred = clamp(Math.max(...children.map((child) => preferredHeight(context, child, width, scrollAllowed))), minimum, maximum);
  return Object.freeze({ minimum, preferred, maximum });
}

function sharedWidthForMeasurement(
  context: CompileContext,
  parent: LayoutNode,
  children: readonly SolutionNode[],
  availableWidth: number,
  scrollAllowed: boolean,
): number {
  const bounds = children.map((child) => axisBounds(context, child, "width"));
  const minimum = Math.max(...bounds.map((value) => value.minimum));
  const maximum = Math.min(availableWidth, ...bounds.map((value) => value.maximum));
  if (minimum > maximum) {
    unsatisfiable(parent.id, minimum, axisMinimum(context, parent, "height"), maximum, axisPreferred(context, parent, "height"), [], scrollAllowed);
  }
  return round(maximum);
}

function sharedAxisSize(
  context: CompileContext,
  parent: LayoutNode,
  children: readonly SolutionNode[],
  axis: Axis,
  box: LayoutGeometry,
  scrollAllowed: boolean,
): number {
  const available = axis === "width" ? box.width : box.height;
  const bounds = children.map((child) => axisBounds(context, child, axis));
  const minimum = Math.max(...bounds.map((value) => value.minimum));
  const maximum = Math.min(available, ...bounds.map((value) => value.maximum));
  if (minimum > maximum) {
    unsatisfiable(parent.id, axis === "width" ? minimum : axisMinimum(context, parent, "width"), axis === "height" ? minimum : axisMinimum(context, parent, "height"), axis === "width" ? maximum : box.width, axis === "height" ? maximum : box.height, [], scrollAllowed);
  }
  return round(maximum);
}

function contentExtent(
  viewport: LayoutGeometry,
  children: readonly CompiledLayoutNode[],
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  insets: LayoutContentInsets,
  // end
): Readonly<{ width: number; height: number }> {
  let right = viewport.x + viewport.width;
  let bottom = viewport.y + viewport.height;
  const visit = (node: CompiledLayoutNode): void => {
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    right = Math.max(right, node.geometry.x + node.geometry.width + insets.right);
    bottom = Math.max(bottom, node.geometry.y + node.geometry.height + insets.bottom);
    // end
    if (node.layout !== "scroll-region") node.children.forEach(visit);
  };
  children.forEach(visit);
  return Object.freeze({ width: round(right - viewport.x), height: round(bottom - viewport.y) });
}

function compileRow(
  context: CompileContext,
  parent: LayoutNode,
  children: readonly SolutionNode[],
  box: LayoutGeometry,
  zIndex: number,
  scrollAllowed: boolean,
): readonly CompiledLayoutNode[] {
  const allocation = allocateAxis(context, parent, children, "width", box.width, box.height, scrollAllowed);
  let x = box.x;
  return Object.freeze(children.map((child, index) => {
    const width = allocation.sizes[index]!;
    const minimum = axisMinimum(context, child, "height");
    const natural = preferredHeight(context, child, width, scrollAllowed);
    if (minimum > box.height && !scrollAllowed) unsatisfiable(child.id, width, minimum, width, box.height, [], false);
    const height = child.intent.align === "stretch"
      ? Math.min(box.height, axisMaximum(context, child, "height"))
      : Math.min(box.height, natural);
    const y = alignedOffset(box.y, box.height, height, child.intent.align);
    const compiled = compileNode(context, child, { x, y, width, height }, zIndex, scrollAllowed);
    x = round(x + width + allocation.gap);
    return compiled;
  }));
}

function compileColumn(
  context: CompileContext,
  parent: LayoutNode,
  children: readonly SolutionNode[],
  box: LayoutGeometry,
  zIndex: number,
  scrollAllowed: boolean,
): readonly CompiledLayoutNode[] {
  const allocation = allocateAxis(context, parent, children, "height", box.height, box.width, scrollAllowed);
  let y = box.y;
  return Object.freeze(children.map((child, index) => {
    const height = allocation.sizes[index]!;
    const width = crossAxisWidth(context, child, box.width, height, scrollAllowed);
    const x = alignedOffset(box.x, box.width, width, child.intent.align);
    const compiled = compileNode(context, child, { x, y, width, height }, zIndex, scrollAllowed);
    y = round(y + height + allocation.gap);
    return compiled;
  }));
}

function compileGrid(
  context: CompileContext,
  parent: LayoutNode,
  children: readonly SolutionNode[],
  box: LayoutGeometry,
  zIndex: number,
  scrollAllowed: boolean,
): readonly CompiledLayoutNode[] {
  const tracks = gridTracks(context, parent, children, box.width, scrollAllowed);
  const rowMinimums: number[] = [];
  const rowPreferred: number[] = [];
  const rowWeights: number[] = [];
  children.forEach((child, index) => {
    const column = index % tracks.columns;
    const row = Math.floor(index / tracks.columns);
    rowMinimums[row] = Math.max(rowMinimums[row] ?? 0, minimumHeight(context, child, tracks.widths[column]!, scrollAllowed));
    rowPreferred[row] = Math.max(rowPreferred[row] ?? 0, preferredHeight(context, child, tracks.widths[column]!, scrollAllowed));
    rowWeights[row] = Math.max(rowWeights[row] ?? 0, child.intent.visualWeight * importanceWeight(child.intent.importance));
  });
  const gapCount = Math.max(0, rowMinimums.length - 1);
  const verticalGap = sum(rowMinimums) + tracks.gap * gapCount <= box.height ? tracks.gap : minimumGap(parent);
  const spaces = verticalGap * gapCount;
  let usableHeight = box.height - spaces;
  if (sum(rowMinimums) > usableHeight) {
    if (!scrollAllowed) unsatisfiable(parent.id, box.width, sum(rowMinimums) + spaces, box.width, box.height, [tracks.columns], false);
    usableHeight = sum(rowMinimums);
  }
  const rowHeights = [...rowMinimums];
  distribute(rowHeights, rowHeights.map((_height, index) => index), usableHeight - sum(rowMinimums), rowPreferred, rowWeights);
  const rowY: number[] = [];
  let y = box.y;
  rowHeights.forEach((height) => {
    rowY.push(y);
    y = round(y + height + verticalGap);
  });
  return Object.freeze(children.map((child, index) => {
    const column = index % tracks.columns;
    const row = Math.floor(index / tracks.columns);
    const cellX = round(box.x + sum(tracks.widths.slice(0, column)) + tracks.gap * column);
    const cellWidth = tracks.widths[column]!;
    const rowHeight = rowHeights[row]!;
    const width = child.intent.align === "stretch" || child.intent.width.mode === "fill"
      ? Math.min(cellWidth, axisMaximum(context, child, "width"))
      : Math.min(cellWidth, axisPreferred(context, child, "width"));
    const x = alignedOffset(cellX, cellWidth, width, child.intent.align);
    const naturalHeight = preferredHeight(context, child, width, scrollAllowed);
    const height = child.intent.align === "stretch"
      ? Math.min(rowHeight, axisMaximum(context, child, "height"))
      : Math.min(rowHeight, naturalHeight);
    return compileNode(context, child, { x, y: alignedOffset(rowY[row]!, rowHeight, height, child.intent.align), width, height }, zIndex, scrollAllowed);
  }));
}

function compileDock(
  context: CompileContext,
  parent: LayoutNode,
  children: readonly SolutionNode[],
  box: LayoutGeometry,
  zIndex: number,
  scrollAllowed: boolean,
): readonly CompiledLayoutNode[] {
  const north = children[0]!;
  const west = children.length >= 3 ? children[1] : undefined;
  const east = children.length >= 4 ? children[2] : undefined;
  const south = children.length === 5 ? children[3] : undefined;
  const center = children[children.length - 1]!;
  const middle = [west, center, east].filter((child): child is SolutionNode => child !== undefined);
  const horizontal = allocateAxis(context, parent, middle, "width", box.width, box.height, scrollAllowed);
  const verticalGapCount = south === undefined ? 1 : 2;
  const bandMinimums = [
    minimumHeight(context, north, box.width, scrollAllowed),
    Math.max(...middle.map((child, index) => minimumHeight(context, child, horizontal.sizes[index]!, scrollAllowed))),
    ...(south === undefined ? [] : [minimumHeight(context, south, box.width, scrollAllowed)]),
  ];
  const bandPreferred = [
    preferredHeight(context, north, box.width, scrollAllowed),
    Math.max(...middle.map((child, index) => preferredHeight(context, child, horizontal.sizes[index]!, scrollAllowed))),
    ...(south === undefined ? [] : [preferredHeight(context, south, box.width, scrollAllowed)]),
  ];
  const gap = box.height - preferredGap(parent) * verticalGapCount >= sum(bandMinimums)
    ? preferredGap(parent)
    : minimumGap(parent);
  const verticalGaps = verticalGapCount * gap;
  let usableHeight = box.height - verticalGaps;
  if (sum(bandMinimums) > usableHeight) {
    if (!scrollAllowed) unsatisfiable(parent.id, box.width, sum(bandMinimums) + verticalGaps, box.width, box.height, [], false);
    usableHeight = sum(bandMinimums);
  }
  const bandHeights = [...bandMinimums];
  const bandWeights = [
    north.intent.visualWeight * importanceWeight(north.intent.importance),
    Math.max(...middle.map((child) => child.intent.visualWeight * importanceWeight(child.intent.importance))),
    ...(south === undefined ? [] : [south.intent.visualWeight * importanceWeight(south.intent.importance)]),
  ];
  distribute(bandHeights, bandHeights.map((_height, index) => index), usableHeight - sum(bandMinimums), bandPreferred, bandWeights);
  const northHeight = bandHeights[0]!;
  const middleHeight = bandHeights[1]!;
  const southHeight = south === undefined ? 0 : bandHeights[2]!;
  const rectangles = new Map<string, LayoutGeometry>();
  const northWidth = crossAxisWidth(context, north, box.width, northHeight, scrollAllowed);
  rectangles.set(north.id, { x: alignedOffset(box.x, box.width, northWidth, north.intent.align), y: box.y, width: northWidth, height: northHeight });
  let x = box.x;
  middle.forEach((child, index) => {
    const width = horizontal.sizes[index]!;
    const naturalHeight = preferredHeight(context, child, width, scrollAllowed);
    const height = child.intent.align === "stretch"
      ? Math.min(middleHeight, axisMaximum(context, child, "height"))
      : Math.min(middleHeight, naturalHeight);
    const bandY = box.y + northHeight + gap;
    rectangles.set(child.id, { x, y: alignedOffset(bandY, middleHeight, height, child.intent.align), width, height });
    x = round(x + width + horizontal.gap);
  });
  if (south !== undefined) {
    const southWidth = crossAxisWidth(context, south, box.width, southHeight, scrollAllowed);
    rectangles.set(south.id, { x: alignedOffset(box.x, box.width, southWidth, south.intent.align), y: box.y + box.height - southHeight, width: southWidth, height: southHeight });
  }
  return Object.freeze(children.map((child) => compileNode(context, child, requireRectangle(rectangles, child.id), zIndex, scrollAllowed)));
}

// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
function preferredHeight(context: CompileContext, node: SolutionNode, availableWidth: number, scrollAllowed: boolean): number {
  const measured = requireIntrinsic(context.intrinsic, node.id);
  const insets = context.layoutInsets.get(node.id) ?? EMPTY_LAYOUT_INSETS;
  const verticalInsets = insets.top + insets.bottom;
  const innerWidth = availableWidth - insets.left - insets.right;
  const measuredContentHeight = Math.max(0, measured.preferredHeight - verticalInsets);
  let contentHeight = measuredContentHeight;
  if (node.kind === "layout") {
    const children = orderedChildren(node);
    const gap = preferredGap(node);
    if (node.layout === "row" || node.layout === "split" || node.layout === "sidebar-content" || node.layout === "master-detail") {
      const widths = allocateAxis(context, node, children, "width", innerWidth, measuredContentHeight, scrollAllowed).sizes;
      contentHeight = Math.max(measuredContentHeight, ...children.map((child, index) => preferredHeight(context, child, widths[index]!, scrollAllowed)));
    } else if (node.layout === "column" || node.layout === "scroll-region") {
      const childScrollAllowed = scrollAllowed || node.layout === "scroll-region";
      const widths = children.map((child) => crossAxisWidth(context, child, innerWidth, axisPreferred(context, child, "height"), childScrollAllowed));
      contentHeight = Math.max(measuredContentHeight, sum(children.map((child, index) => preferredHeight(context, child, widths[index]!, childScrollAllowed))) + gap * (children.length - 1));
    } else if (node.layout === "grid" || node.layout === "asymmetric-grid") {
      const tracks = gridTracks(context, node, children, innerWidth, scrollAllowed);
      const rows: number[] = [];
      children.forEach((child, index) => {
        const row = Math.floor(index / tracks.columns);
        const column = index % tracks.columns;
        rows[row] = Math.max(rows[row] ?? 0, preferredHeight(context, child, tracks.widths[column]!, scrollAllowed));
      });
      contentHeight = Math.max(measuredContentHeight, sum(rows) + tracks.gap * Math.max(0, rows.length - 1));
    } else if (node.layout === "stack" || node.layout === "overlay-anchor") {
      const sharedWidth = sharedWidthForMeasurement(context, node, children, innerWidth, scrollAllowed);
      contentHeight = Math.max(measuredContentHeight, stackHeightBounds(context, node, children, sharedWidth, scrollAllowed).preferred);
    } else {
      contentHeight = Math.max(measuredContentHeight, dockPreferredHeight(context, node, children, innerWidth, scrollAllowed));
    }
  }
  const bounds = axisBoundsFromMeasured(node, measured, "height");
  const resolved = resolveHeightIntent(node.intent.height, bounds, contentHeight + verticalInsets);
  const minimum = minimumHeight(context, node, availableWidth, scrollAllowed || (node.kind === "layout" && node.layout === "scroll-region"));
  if ((resolved < minimum || minimum > bounds.maximum) && !(node.kind === "layout" && node.layout === "scroll-region")) {
    unsatisfiable(node.id, axisMinimum(context, node, "width"), minimum, availableWidth, resolved, [], scrollAllowed);
  }
  return round(resolved);
}

function minimumHeight(context: CompileContext, node: SolutionNode, availableWidth: number, scrollAllowed: boolean): number {
  if (node.kind !== "layout") return axisMinimum(context, node, "height");
  const insets = context.layoutInsets.get(node.id) ?? EMPTY_LAYOUT_INSETS;
  const verticalInsets = insets.top + insets.bottom;
  const innerWidth = availableWidth - insets.left - insets.right;
  const children = orderedChildren(node);
  const gap = minimumGap(node);
  let required: number;
  if (node.layout === "row" || node.layout === "split" || node.layout === "sidebar-content" || node.layout === "master-detail") {
    required = Math.max(...children.map((child) => minimumHeight(context, child, innerWidth, scrollAllowed)));
  } else if (node.layout === "column" || node.layout === "scroll-region") {
    const childScrollAllowed = scrollAllowed || node.layout === "scroll-region";
    const widths = children.map((child) => crossAxisWidth(context, child, innerWidth, axisMinimum(context, child, "height"), childScrollAllowed));
    required = sum(children.map((child, index) => minimumHeight(context, child, widths[index]!, childScrollAllowed))) + gap * (children.length - 1);
  } else if (node.layout === "grid" || node.layout === "asymmetric-grid") {
    const tracks = gridTracks(context, node, children, innerWidth, scrollAllowed);
    const rows: number[] = [];
    children.forEach((child, index) => {
      const row = Math.floor(index / tracks.columns);
      rows[row] = Math.max(rows[row] ?? 0, minimumHeight(context, child, tracks.widths[index % tracks.columns]!, scrollAllowed));
    });
    required = sum(rows) + minimumGap(node) * Math.max(0, rows.length - 1);
  } else if (node.layout === "stack" || node.layout === "overlay-anchor") {
    const sharedWidth = sharedWidthForMeasurement(context, node, children, innerWidth, scrollAllowed);
    required = stackHeightBounds(context, node, children, sharedWidth, scrollAllowed).minimum;
  } else {
    required = dockMinimumHeight(context, node, children, innerWidth, scrollAllowed);
  }
  required += verticalInsets;
  if (node.layout === "scroll-region") return Math.min(axisMinimum(context, node, "height"), required);
  return Math.max(axisMinimum(context, node, "height"), required);
}
// end

function dockPreferredHeight(context: CompileContext, parent: LayoutNode, children: readonly SolutionNode[], width: number, scrollAllowed: boolean): number {
  const north = preferredHeight(context, children[0]!, width, scrollAllowed);
  const south = children.length === 5 ? preferredHeight(context, children[3]!, width, scrollAllowed) : 0;
  const middle = dockMiddle(children);
  const widths = allocateAxis(context, parent, middle, "width", width, axisPreferred(context, parent, "height"), scrollAllowed).sizes;
  const heights = middle.map((child, index) => preferredHeight(context, child, widths[index]!, scrollAllowed));
  return north + Math.max(...heights) + south + preferredGap(parent) * (south === 0 ? 1 : 2);
}

function dockMinimumHeight(context: CompileContext, parent: LayoutNode, children: readonly SolutionNode[], width: number, scrollAllowed: boolean): number {
  const north = minimumHeight(context, children[0]!, width, scrollAllowed);
  const south = children.length === 5 ? minimumHeight(context, children[3]!, width, scrollAllowed) : 0;
  const middle = dockMiddle(children);
  const widths = allocateAxis(context, parent, middle, "width", width, axisMinimum(context, parent, "height"), scrollAllowed).sizes;
  const heights = middle.map((child, index) => minimumHeight(context, child, widths[index]!, scrollAllowed));
  return north + Math.max(...heights) + south + minimumGap(parent) * (south === 0 ? 1 : 2);
}

function dockMiddle(children: readonly SolutionNode[]): readonly SolutionNode[] {
  const west = children.length >= 3 ? children[1] : undefined;
  const east = children.length >= 4 ? children[2] : undefined;
  return [west, children[children.length - 1]!, east].filter((child): child is SolutionNode => child !== undefined);
}

function allocateAxis(
  context: CompileContext,
  parent: LayoutNode,
  children: readonly SolutionNode[],
  axis: Axis,
  available: number,
  crossAvailable: number,
  scrollAllowed: boolean,
): AxisAllocation {
  const preferred = preferredGap(parent);
  const minimum = minimumGap(parent);
  const crossSizes = children.map((child) => axis === "height"
    ? crossAxisWidth(context, child, crossAvailable, axisPreferred(context, child, "height"), scrollAllowed)
    : crossAvailable);
  const minima = children.map((child, index) => axis === "height"
    ? minimumHeight(context, child, crossSizes[index]!, scrollAllowed)
    : axisMinimum(context, child, axis));
  const minimumTotal = sum(minima);
  const preferredSpaces = preferred * Math.max(0, children.length - 1);
  const minimumSpaces = minimum * Math.max(0, children.length - 1);
  let gap = preferred;
  let usable = available - preferredSpaces;
  const preserveScrollGap = parent.layout === "scroll-region" && axis === "height";
  if (minimumTotal > usable && !preserveScrollGap) {
    gap = minimum;
    usable = available - minimumSpaces;
  }
  if (minimumTotal > usable) {
    if (!(scrollAllowed && axis === "height")) {
      const first = children.find((_child, index) => minima[index]! > available) ?? parent;
      const requiredWidth = axis === "width" ? minimumTotal + minimumSpaces : axisMinimum(context, first, "width");
      const requiredHeight = axis === "height" ? minimumTotal + minimumSpaces : axisMinimum(context, first, "height");
      unsatisfiable(first === parent ? parent.id : first.id, requiredWidth, requiredHeight, axis === "width" ? available : crossAvailable, axis === "height" ? available : crossAvailable, [], scrollAllowed);
    }
    usable = minimumTotal;
  }
  const sizes = [...minima];
  let remaining = Math.max(0, usable - minimumTotal);
  for (const mode of ["content", "fixed", "minmax"] as const) {
    for (const importance of ["primary", "secondary", "supporting"] as const) {
      const indexes = children.map((_child, index) => index).filter((index) => children[index]!.intent[axis].mode === mode && children[index]!.intent.importance === importance);
      remaining = distribute(sizes, indexes, remaining, indexes.map((index) => axis === "height"
        ? preferredHeight(context, children[index]!, crossSizes[index]!, scrollAllowed)
        : axisPreferred(context, children[index]!, axis)), indexes.map(() => 1));
    }
  }
  for (const mode of ["ratio", "fill"] as const) {
    const indexes = children.map((_child, index) => index).filter((index) => children[index]!.intent[axis].mode === mode);
    const targets = indexes.map((index) => axisMaximum(context, children[index]!, axis));
    const weights = indexes.map((index) => {
      const child = children[index]!;
      const ratio = mode === "ratio" ? child.intent[axis].value ?? 1 : 1;
      return ratio * child.intent.visualWeight * importanceWeight(child.intent.importance);
    });
    remaining = distribute(sizes, indexes, remaining, targets, weights);
  }
  return Object.freeze({ gap, sizes: Object.freeze(fitRoundedSizes(sizes, minima, usable)) });
}

function distribute(sizes: number[], indexes: readonly number[], available: number, targets: readonly number[], weights: readonly number[]): number {
  let remaining = available;
  let active = indexes.map((_index, position) => position).filter((position) => targets[position]! > sizes[indexes[position]!]!);
  while (remaining > 0.000_001 && active.length > 0) {
    const totalWeight = sum(active.map((position) => weights[position]!));
    let used = 0;
    active.forEach((position) => {
      const index = indexes[position]!;
      const capacity = targets[position]! - sizes[index]!;
      const share = remaining * weights[position]! / totalWeight;
      const addition = Math.min(capacity, share);
      sizes[index] = sizes[index]! + addition;
      used += addition;
    });
    if (used <= 0.000_001) break;
    remaining -= used;
    active = active.filter((position) => targets[position]! - sizes[indexes[position]!]! > 0.000_001);
  }
  return Math.max(0, remaining);
}

function gridTracks(
  context: CompileContext,
  parent: LayoutNode,
  children: readonly SolutionNode[],
  availableWidth: number,
  scrollAllowed: boolean,
): GridTracks {
  const attempted: number[] = [];
  const largest = Math.min(GRID_COLUMN_LIMIT, children.length, parent.layout === "asymmetric-grid" ? 2 : GRID_COLUMN_LIMIT);
  for (let columns = largest; columns >= 1; columns -= 1) {
    attempted.push(columns);
    for (const gap of uniqueNumbers([preferredGap(parent), minimumGap(parent)])) {
      const trackSpace = availableWidth - gap * (columns - 1);
      if (trackSpace < 0) continue;
      if (parent.layout === "grid") {
        const width = trackSpace / columns;
        if (children.every((child) => axisMinimum(context, child, "width") <= width)) {
          const widths = cumulativeRoundedSizes(Array.from({ length: columns }, () => width), trackSpace);
          if (children.every((child, index) => axisMinimum(context, child, "width") <= widths[index % columns]! + 0.01)) {
            return Object.freeze({ columns, gap, widths });
          }
        }
      } else {
        const minima = Array.from({ length: columns }, (_value, column) => Math.max(...children.filter((_child, index) => index % columns === column).map((child) => axisMinimum(context, child, "width"))));
        if (sum(minima) <= trackSpace) {
          const weights = Array.from({ length: columns }, (_value, column) => Math.max(...children.filter((_child, index) => index % columns === column).map((child) => child.intent.visualWeight)));
          const widths = [...minima];
          distribute(widths, widths.map((_value, index) => index), trackSpace - sum(minima), widths.map(() => trackSpace), weights);
          return Object.freeze({ columns, gap, widths: cumulativeRoundedSizes(widths, trackSpace) });
        }
      }
    }
  }
  const failed = children.find((child) => axisMinimum(context, child, "width") > availableWidth) ?? parent;
  unsatisfiable(failed.id, axisMinimum(context, failed, "width"), axisMinimum(context, failed, "height"), availableWidth, axisPreferred(context, failed, "height"), attempted, scrollAllowed);
}

function orderedChildren(parent: LayoutNode): readonly SolutionNode[] {
  const children = parent.children;
  const byId = new Map(children.map((child) => [child.id, child]));
  const edges = new Map(children.map((child) => [child.id, new Set<string>()]));
  children.forEach((child) => child.intent.groupWith.forEach((target) => {
    edges.get(child.id)!.add(target);
    edges.get(target)!.add(child.id);
  }));
  const remaining = new Set(children.map((child) => child.id));
  const components: SolutionNode[][] = [];
  while (remaining.size > 0) {
    const first = [...remaining].sort(compareCodePoints)[0]!;
    const stack = [first];
    const component: SolutionNode[] = [];
    remaining.delete(first);
    while (stack.length > 0) {
      const current = stack.pop()!;
      component.push(byId.get(current)!);
      [...edges.get(current)!].sort(compareCodePoints).forEach((next) => {
        if (remaining.delete(next)) stack.push(next);
      });
    }
    component.sort(compareNodes);
    components.push(component);
  }
  components.sort((left, right) => compareNodes(left[0]!, right[0]!));
  return Object.freeze(components.flat());
}

function compareNodes(left: SolutionNode, right: SolutionNode): number {
  if (left.intent.readingOrder !== right.intent.readingOrder) return left.intent.readingOrder - right.intent.readingOrder;
  return compareCodePoints(left.id, right.id);
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const leftPoint = leftPoints[index]!.codePointAt(0)!;
    const rightPoint = rightPoints[index]!.codePointAt(0)!;
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
  }
  return leftPoints.length === rightPoints.length ? 0 : leftPoints.length < rightPoints.length ? -1 : 1;
}

function crossAxisWidth(context: CompileContext, node: SolutionNode, available: number, height: number, scrollAllowed: boolean): number {
  const minimum = axisMinimum(context, node, "width");
  if (minimum > available) unsatisfiable(node.id, minimum, axisMinimum(context, node, "height"), available, height, [], scrollAllowed);
  if (node.intent.align === "stretch" || node.intent.width.mode === "fill") return Math.min(available, axisMaximum(context, node, "width"));
  return Math.min(available, axisPreferred(context, node, "width"));
}

function axisMinimum(context: CompileContext, node: SolutionNode, axis: Axis): number {
  return axisBounds(context, node, axis).minimum;
}

function axisPreferred(context: CompileContext, node: SolutionNode, axis: Axis): number {
  return axisBounds(context, node, axis).preferred;
}

function axisMaximum(context: CompileContext, node: SolutionNode, axis: Axis): number {
  return axisBounds(context, node, axis).maximum;
}

function axisBounds(context: CompileContext, node: SolutionNode, axis: Axis): AxisBounds {
  return axisBoundsFromMeasured(node, requireIntrinsic(context.intrinsic, node.id), axis);
}

function axisBoundsFromMeasured(node: SolutionNode, measured: IntrinsicSize, axis: Axis): AxisBounds {
  const size = node.intent[axis];
  const intrinsicPreferred = axis === "width" ? measured.preferredWidth : measured.preferredHeight;
  const range = axisRangeFromMeasured(node, measured, axis);
  if ((size.mode === "fixed" || size.mode === "viewport") && size.value !== undefined) {
    return Object.freeze({ minimum: size.value, preferred: size.value, maximum: size.value });
  }
  return Object.freeze({ minimum: range.minimum, preferred: clamp(intrinsicPreferred, range.minimum, range.maximum), maximum: range.maximum });
}

function axisRangeFromMeasured(node: SolutionNode, measured: IntrinsicSize, axis: Axis): AxisBounds {
  const size = node.intent[axis];
  const intrinsicMinimum = axis === "width" ? measured.minWidth : measured.minHeight;
  const intrinsicPreferred = axis === "width" ? measured.preferredWidth : measured.preferredHeight;
  const intrinsicMaximum = axis === "width" ? measured.maxWidth : measured.maxHeight;
  const minimum = Math.max(intrinsicMinimum, size.min ?? 0);
  const maximum = Math.min(intrinsicMaximum, size.max ?? intrinsicMaximum);
  return Object.freeze({ minimum, preferred: clamp(intrinsicPreferred, minimum, maximum), maximum });
}

function resolveHeightIntent(size: NodeIntent["height"], bounds: AxisBounds, contentHeight: number): number {
  if ((size.mode === "fixed" || size.mode === "viewport") && size.value !== undefined) return size.value;
  return clamp(Math.max(bounds.preferred, contentHeight), bounds.minimum, bounds.maximum);
}

function rootUsesAvailableWidth(node: SolutionNode): boolean {
  return node.intent.width.mode === "fill" || node.intent.width.mode === "ratio";
}

function assertGeometryWithinBounds(
  context: CompileContext,
  node: SolutionNode,
  geometry: LayoutGeometry,
  scrollAllowed: boolean,
): void {
  const width = axisBounds(context, node, "width");
  const height = axisBounds(context, node, "height");
  if (geometry.width < width.minimum - 0.01 || geometry.width > width.maximum + 0.01
    || geometry.height < height.minimum - 0.01 || geometry.height > height.maximum + 0.01) {
    unsatisfiable(node.id, width.minimum, height.minimum, geometry.width, geometry.height, [], scrollAllowed);
  }
}

function preferredGap(parent: LayoutNode): number {
  const tokens = densityTokens(parent.intent.density);
  return parent.children.some((child) => child.kind === "layout") ? tokens.sectionGap : tokens.controlGap;
}

function minimumGap(parent: LayoutNode): number {
  return Math.max(4, Math.floor(preferredGap(parent) / 2));
}

function densityTokens(density: Density): (typeof DENSITY)[Density] {
  return DENSITY[density];
}

function alignedOffset(start: number, available: number, size: number, align: NodeIntent["align"]): number {
  if (align === "center") return round(start + (available - size) / 2);
  if (align === "end") return round(start + available - size);
  return start;
}

function requireIntrinsic(values: ReadonlyMap<string, IntrinsicSize>, nodeId: string): IntrinsicSize {
  const value = values.get(nodeId);
  if (value === undefined) inputInvalid(nodeId);
  return value;
}

function requireRectangle(values: ReadonlyMap<string, LayoutGeometry>, nodeId: string): LayoutGeometry {
  const value = values.get(nodeId);
  if (value === undefined) inputInvalid(nodeId);
  return value;
}

function freezeGeometry(value: LayoutGeometry): LayoutGeometry {
  const geometry = { x: round(value.x), y: round(value.y), width: round(value.width), height: round(value.height) };
  if (![geometry.x, geometry.y, geometry.width, geometry.height].every(finiteNonnegative)) inputInvalid("geometry");
  return Object.freeze(geometry);
}

function auditResult(result: CompiledLayoutTree, expectedNodeCount: number): void {
  if (result.byId.size !== expectedNodeCount || result.byId.get(result.root.id) !== result.root) inputInvalid(result.root.id);
  const visit = (node: CompiledLayoutNode, nearestScroll: CompiledLayoutNode | undefined): void => {
    const box = node.geometry;
    if (![box.x, box.y, box.width, box.height, node.zIndex].every(finiteNonnegative)) inputInvalid(node.id);
    if (nearestScroll === undefined) {
      if (box.x + box.width > result.pageWidth + 0.01 || box.y + box.height > result.pageHeight + 0.01) inputInvalid(node.id);
    } else {
      const extent = nearestScroll.scrollContentExtent;
      if (extent === undefined || !contains({
        x: nearestScroll.geometry.x,
        y: nearestScroll.geometry.y,
        width: extent.width,
        height: extent.height,
      }, box)) inputInvalid(node.id);
    }
    const isScroll = node.layout === "scroll-region";
    if ((node.overflow === "local-scroll") !== isScroll) inputInvalid(node.id);
    if (isScroll) {
      const extent = node.scrollContentExtent;
      if (extent === undefined || ![extent.width, extent.height].every((value) => Number.isFinite(value) && value > 0)
        || extent.width < box.width || extent.height < box.height) inputInvalid(node.id);
    } else if (node.scrollContentExtent !== undefined) {
      inputInvalid(node.id);
    }
    if (node.layout !== "stack" && node.layout !== "overlay-anchor") {
      node.children.forEach((child, index) => node.children.slice(index + 1).forEach((other) => {
        if (overlaps(child.geometry, other.geometry)) inputInvalid(parentFailureId(node, child, other));
      }));
    }
    if (!isScroll) {
      node.children.forEach((child) => {
        if (!contains(box, child.geometry)) inputInvalid(child.id);
      });
    }
    node.children.forEach((child) => visit(child, isScroll ? node : nearestScroll));
  };
  visit(result.root, undefined);
}

function contains(outer: LayoutGeometry, inner: LayoutGeometry): boolean {
  return inner.x >= outer.x - 0.01 && inner.y >= outer.y - 0.01
    && inner.x + inner.width <= outer.x + outer.width + 0.01
    && inner.y + inner.height <= outer.y + outer.height + 0.01;
}

function overlaps(left: LayoutGeometry, right: LayoutGeometry): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x
    && left.y < right.y + right.height && left.y + left.height > right.y;
}

function parentFailureId(parent: CompiledLayoutNode, left: CompiledLayoutNode, right: CompiledLayoutNode): string {
  return compareCodePoints(left.id, right.id) <= 0 ? `${parent.id}-${left.id}` : `${parent.id}-${right.id}`;
}

function importanceWeight(importance: Importance): number {
  return importance === "primary" ? 4 : importance === "secondary" ? 2 : 1;
}

function sameGeometry(left: LayoutGeometry, right: LayoutGeometry): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height;
}

function formatGeometry(value: LayoutGeometry): string {
  return `${value.x},${value.y},${value.width},${value.height}`;
}

function formatExtent(value: Readonly<{ width: number; height: number }>): string {
  return `${value.width}x${value.height}`;
}

function implementationMismatch(
  pageId: string,
  nodeId: string,
  field: LayoutImplementationMismatchField,
  expected: string,
  actual: string,
): never {
  throw new LayoutImplementationMismatchError({ pageId, nodeId, field, expected, actual });
}

function inputInvalid(nodeId: string): never {
  throw new LayoutCompileError("LAYOUT_INPUT_INVALID", {
    nodeId,
    minimumRequired: { width: 0, height: 0 },
    available: { width: 0, height: 0 },
    attemptedColumns: [],
    scrollAllowed: false,
  });
}

function unsatisfiable(
  nodeId: string,
  minimumWidth: number,
  minimumHeight: number,
  availableWidth: number,
  availableHeight: number,
  attemptedColumns: readonly number[],
  scrollAllowed: boolean,
): never {
  throw new LayoutCompileError("LAYOUT_UNSATISFIABLE", {
    nodeId,
    minimumRequired: { width: round(minimumWidth), height: round(minimumHeight) },
    available: { width: round(availableWidth), height: round(availableHeight) },
    attemptedColumns,
    scrollAllowed,
  });
}

function finiteNonnegative(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function sum(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function uniqueNumbers(values: readonly number[]): readonly number[] {
  return [...new Set(values)];
}

function fitRoundedSizes(values: readonly number[], minima: readonly number[], maximumTotal: number): readonly number[] {
  const fitted = values.map(round);
  let excess = Math.max(0, round(sum(fitted) - maximumTotal));
  for (let index = fitted.length - 1; index >= 0 && excess > 0; index -= 1) {
    const slack = Math.max(0, fitted[index]! - minima[index]!);
    const reduction = Math.min(slack, excess);
    fitted[index] = round(fitted[index]! - reduction);
    excess = round(excess - reduction);
  }
  if (excess > 0 && fitted.length > 0) fitted[fitted.length - 1] = Math.max(0, round(fitted[fitted.length - 1]! - excess));
  return fitted;
}

function cumulativeRoundedSizes(values: readonly number[], exactTotal: number): readonly number[] {
  const fitted: number[] = [];
  let rawBoundary = 0;
  let fittedBoundary = 0;
  values.forEach((value, index) => {
    rawBoundary += value;
    const nextBoundary = index === values.length - 1 ? round(exactTotal) : round(rawBoundary);
    fitted.push(round(nextBoundary - fittedBoundary));
    fittedBoundary = nextBoundary;
  });
  return Object.freeze(fitted);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
