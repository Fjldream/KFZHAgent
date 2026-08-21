import {
  UIImplementationSpecV2Schema,
  type LayoutNode,
  type NodeIntent,
  type SolutionNode,
  type SolutionPage,
  type UIImplementationControlV2,
  type UIImplementationSpecV2,
} from "@kf/contracts";
import { describe, expect, it } from "vitest";
import { measureIntrinsic, type IntrinsicSize } from "./intrinsic-measure.js";
import {
  LayoutImplementationMismatchError,
  LayoutCompileError,
  assertImplementationMatchesCompiledLayout,
  compileLayout,
  type CompiledLayoutNode,
  type LayoutCompileInput,
} from "./layout-compiler.js";

const sourceIds = ["region-main"];

function intent(overrides: Partial<NodeIntent> = {}): NodeIntent {
  return {
    importance: "secondary",
    visualWeight: 3,
    readingOrder: 0,
    density: "comfortable",
    groupWith: [],
    width: { mode: "fill" },
    height: { mode: "content" },
    align: "stretch",
    ...overrides,
  };
}

function control(id: string, overrides: Partial<NodeIntent> = {}): SolutionNode {
  return {
    kind: "control",
    id,
    sourceBlueprintRegionIds: sourceIds,
    intent: intent(overrides),
    capabilityId: "text",
    content: id,
    properties: [],
    tabIds: [],
    styleRole: "body",
    eventBindings: [],
  };
}

type LayoutKind = LayoutNode["layout"];

function layout(id: string, kind: LayoutKind, children: SolutionNode[], overrides: Partial<NodeIntent> = {}): LayoutNode {
  return {
    kind: "layout",
    id,
    sourceBlueprintRegionIds: sourceIds,
    intent: intent(overrides),
    layout: kind,
    children,
  };
}

function page(root: SolutionNode, canvas: SolutionPage["canvas"] = "desktop"): SolutionPage {
  return {
    id: "visitor-page",
    title: "园区访客工作台",
    purpose: "处理预约、审批和到访记录",
    canvas,
    sourceBlueprintPageId: "blueprint-page",
    sourceBlueprintRegionIds: sourceIds,
    initialStateIds: [],
    root,
  };
}

function intrinsic(overrides: Partial<IntrinsicSize> = {}): IntrinsicSize {
  return {
    minWidth: 80,
    preferredWidth: 160,
    maxWidth: 1_600,
    minHeight: 32,
    preferredHeight: 48,
    maxHeight: 800,
    overflow: "wrap",
    ...overrides,
  };
}

function childNodes(node: SolutionNode): readonly SolutionNode[] {
  if (node.kind === "layout") return node.children;
  if (node.kind === "registered-module") return node.slots.flatMap((slot) => slot.children);
  return node.kind === "repeater" ? [node.template] : [];
}

function intrinsicMap(root: SolutionNode, overrides: ReadonlyMap<string, IntrinsicSize> = new Map()): ReadonlyMap<string, IntrinsicSize> {
  const result = new Map<string, IntrinsicSize>();
  const visit = (node: SolutionNode): void => {
    result.set(node.id, overrides.get(node.id) ?? intrinsic());
    childNodes(node).forEach(visit);
  };
  visit(root);
  return result;
}

function compile(root: SolutionNode, overrides: ReadonlyMap<string, IntrinsicSize> = new Map(), canvas: SolutionPage["canvas"] = "desktop") {
  return compileLayout({ page: page(root, canvas), expandedRoot: root, intrinsicByNodeId: intrinsicMap(root, overrides) });
}

function nativeImplementationFor(compiled: ReturnType<typeof compile>): UIImplementationSpecV2 {
  const controls: UIImplementationControlV2[] = [];
  const visit = (node: CompiledLayoutNode, parentId: string | undefined, depth: number): void => {
    controls.push({
      id: `implementation-${node.id}`,
      ...(parentId === undefined ? {} : { parentId }),
      role: node.layout === undefined ? "content" : "layout",
      capabilityId: node.layout === undefined ? "text" : "layout.4",
      depth,
      zIndex: node.zIndex,
      geometry: { ...node.geometry },
      ...(node.layout === undefined
        ? {}
        : {
          compiledLayout: node.layout === "scroll-region"
            ? { kind: node.layout, overflow: "local-scroll" as const, scrollContentExtent: { ...node.scrollContentExtent! } }
            : { kind: node.layout, overflow: "visible" as const },
        }),
      nativeProperties: {},
      sourceSolutionNodeId: node.id,
      sourceBlueprintPageId: "blueprint-page",
      sourceBlueprintRegionIds: sourceIds,
      eventBindings: [],
    });
    node.children.forEach((child) => visit(child, `implementation-${node.id}`, depth + 1));
  };
  visit(compiled.root, undefined, 0);
  return UIImplementationSpecV2Schema.parse({
    schema: "kf-ui-implementation/v2",
    compatibility: "native",
    theme: {
      background: "#f4f7fb",
      surface: "#ffffff",
      primary: "#163a5f",
      accent: "#e47b32",
      textPrimary: "#14212b",
      textSecondary: "#52616d",
      fontFamily: "Inter",
      spacingUnit: 8,
      radiusScale: { small: 4, medium: 8, large: 16 },
    },
    compiledRoleStyles: {},
    pages: [{
      compatibility: "native",
      id: "implementation-page",
      width: compiled.pageWidth,
      height: compiled.pageHeight,
      sourceBlueprintPageId: "blueprint-page",
      controls,
    }],
    compiledActions: [],
    compiledScripts: [],
  });
}

function nativePageFrom(implementation: UIImplementationSpecV2): Extract<UIImplementationSpecV2["pages"][number], { compatibility: "native" }> {
  const page = implementation.pages[0]!;
  if (page.compatibility !== "native") throw new Error("expected native test page");
  return page;
}

function overlaps(left: CompiledLayoutNode, right: CompiledLayoutNode): boolean {
  const a = left.geometry;
  const b = right.geometry;
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

function expectGeometrySafe(compiled: ReturnType<typeof compile>): void {
  const contains = (outer: CompiledLayoutNode["geometry"], inner: CompiledLayoutNode["geometry"]): boolean =>
    inner.x >= outer.x - 0.01 && inner.y >= outer.y - 0.01
    && inner.x + inner.width <= outer.x + outer.width + 0.01
    && inner.y + inner.height <= outer.y + outer.height + 0.01;
  const visit = (node: CompiledLayoutNode, nearestScroll: CompiledLayoutNode | undefined): void => {
    const values = [node.geometry.x, node.geometry.y, node.geometry.width, node.geometry.height, node.zIndex];
    expect(values.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    if (nearestScroll === undefined) {
      expect(node.geometry.x + node.geometry.width).toBeLessThanOrEqual(compiled.pageWidth + 0.01);
      expect(node.geometry.y + node.geometry.height).toBeLessThanOrEqual(compiled.pageHeight + 0.01);
    } else {
      expect(contains({
        x: nearestScroll.geometry.x,
        y: nearestScroll.geometry.y,
        width: nearestScroll.scrollContentExtent!.width,
        height: nearestScroll.scrollContentExtent!.height,
      }, node.geometry)).toBe(true);
    }
    if (node.layout !== "stack" && node.layout !== "overlay-anchor") {
      node.children.forEach((child, index) => {
        node.children.slice(index + 1).forEach((other) => expect(overlaps(child, other)).toBe(false));
      });
    }
    if (node.overflow !== "local-scroll") {
      node.children.forEach((child) => {
        expect(contains(node.geometry, child.geometry)).toBe(true);
      });
      expect(node.scrollContentExtent).toBeUndefined();
    } else {
      expect(node.layout).toBe("scroll-region");
      expect(node.scrollContentExtent!.width).toBeGreaterThanOrEqual(node.geometry.width);
      expect(node.scrollContentExtent!.height).toBeGreaterThanOrEqual(node.geometry.height);
    }
    node.children.forEach((child) => visit(child, node.overflow === "local-scroll" ? node : nearestScroll));
  };
  visit(compiled.root, undefined);
  expect(compiled.byId.get(compiled.root.id)).toBe(compiled.root);
  expect(compiled.byId.size).toBe([...compiled.byId.values()].length);
}

const sidebar = layout("sidebar", "column", [control("nav" , { readingOrder: 0 })], {
  importance: "secondary",
  visualWeight: 1,
  readingOrder: 0,
  width: { mode: "ratio", value: 1 },
});
const filters = layout("filters", "row", [control("status-filter"), control("host-filter", { readingOrder: 1 })], {
  importance: "primary",
  visualWeight: 2,
  readingOrder: 0,
});
const summary = layout("summary", "asymmetric-grid", [
  control("pending-summary", { visualWeight: 2 }),
  control("today-summary", { readingOrder: 1, visualWeight: 1 }),
], { readingOrder: 1 });
const records = control("records", {
  importance: "primary",
  visualWeight: 5,
  readingOrder: 2,
  height: { mode: "minmax", min: 320, max: 520 },
});
const main = layout("main", "column", [records, summary, filters], {
  importance: "primary",
  visualWeight: 5,
  readingOrder: 1,
  width: { mode: "ratio", value: 5 },
});
const visitorWorkspaceRoot = layout("visitor-workspace", "sidebar-content", [main, sidebar], {
  density: "comfortable",
});
const visitorMeasures = new Map<string, IntrinsicSize>([
  ["visitor-workspace", intrinsic({ minWidth: 900, preferredWidth: 1_200, minHeight: 500, preferredHeight: 720 })],
  ["sidebar", intrinsic({ minWidth: 180, preferredWidth: 220, maxWidth: 300, minHeight: 360, preferredHeight: 640 })],
  ["main", intrinsic({ minWidth: 640, preferredWidth: 960, minHeight: 500, preferredHeight: 720 })],
  ["nav", intrinsic({ minWidth: 160, preferredWidth: 200, maxWidth: 240, minHeight: 240, preferredHeight: 420 })],
  ["filters", intrinsic({ minWidth: 360, preferredWidth: 520, minHeight: 48, preferredHeight: 48 })],
  ["status-filter", intrinsic({ minWidth: 160, preferredWidth: 220, minHeight: 40, preferredHeight: 40 })],
  ["host-filter", intrinsic({ minWidth: 160, preferredWidth: 260, minHeight: 40, preferredHeight: 40 })],
  ["summary", intrinsic({ minWidth: 360, preferredWidth: 620, minHeight: 100, preferredHeight: 120 })],
  ["pending-summary", intrinsic({ minWidth: 220, preferredWidth: 400, minHeight: 88, preferredHeight: 112 })],
  ["today-summary", intrinsic({ minWidth: 140, preferredWidth: 220, minHeight: 88, preferredHeight: 112 })],
  ["records", intrinsic({ minWidth: 620, preferredWidth: 920, minHeight: 320, preferredHeight: 420, maxHeight: 520, overflow: "scroll" })],
]);

describe("compileLayout", () => {
  it("rejects a schema-valid column relabeled as scroll at the trusted layout boundary", () => {
    const compiled = compile(layout("trusted-column", "column", [control("trusted-column-child")]));
    const implementation = nativeImplementationFor(compiled);
    const targetPage = implementation.pages[0]!;
    if (targetPage.compatibility !== "native") throw new Error("expected native test page");
    const layoutControl = targetPage.controls[0]!;
    layoutControl.compiledLayout = {
      kind: "scroll-region",
      overflow: "local-scroll",
      scrollContentExtent: {
        width: layoutControl.geometry.width,
        height: layoutControl.geometry.height,
      },
    };

    expect(UIImplementationSpecV2Schema.safeParse(implementation).success).toBe(true);
    try {
      assertImplementationMatchesCompiledLayout(implementation, targetPage.id, compiled);
      throw new Error("expected trusted layout correlation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(LayoutImplementationMismatchError);
      if (!(error instanceof LayoutImplementationMismatchError)) return;
      expect(error.code).toBe("LAYOUT_IMPLEMENTATION_MISMATCH");
      expect(error.details).toEqual({
        pageId: "implementation-page",
        nodeId: "trusted-column",
        field: "kind",
        expected: "column",
        actual: "scroll-region",
      });
    }
  });

  it("requires metadata on the unique control correlated to every trusted layout node", () => {
    const compiled = compile(layout("metadata-column", "column", [control("metadata-child")]));
    const implementation = nativeImplementationFor(compiled);
    const targetPage = nativePageFrom(implementation);
    delete targetPage.controls[0]!.compiledLayout;

    expect(UIImplementationSpecV2Schema.safeParse(implementation).success).toBe(true);
    expect(() => assertImplementationMatchesCompiledLayout(implementation, targetPage.id, compiled))
      .toThrowError(/compiledLayout mismatch.*metadata-column/);

    const duplicateImplementation = nativeImplementationFor(compiled);
    const duplicatePage = nativePageFrom(duplicateImplementation);
    duplicatePage.controls.push({
      ...duplicatePage.controls[1]!,
      id: "duplicate-layout-source",
      sourceSolutionNodeId: "metadata-column",
    });
    expect(UIImplementationSpecV2Schema.safeParse(duplicateImplementation).success).toBe(true);
    expect(() => assertImplementationMatchesCompiledLayout(duplicateImplementation, duplicatePage.id, compiled))
      .toThrowError(/correlation mismatch.*metadata-column/);
  });

  it("rejects extra compiled-layout controls that do not correlate to a trusted layout node", () => {
    const compiled = compile(layout("extra-column", "column", [control("extra-column-child")]));
    const implementation = nativeImplementationFor(compiled);
    const targetPage = nativePageFrom(implementation);
    const child = targetPage.controls[1]!;
    targetPage.controls.push({
      ...child,
      id: "extra-layout-control",
      parentId: undefined,
      role: "layout",
      capabilityId: "layout.4",
      depth: 0,
      zIndex: 10,
      geometry: { x: 0, y: 0, width: 10, height: 10 },
      compiledLayout: { kind: "column", overflow: "visible" },
      sourceSolutionNodeId: "extra-semantic-layout",
    }, {
      ...child,
      id: "extra-layout-child",
      parentId: "extra-layout-control",
      depth: 1,
      zIndex: 11,
      geometry: { x: 0, y: 0, width: 10, height: 10 },
      sourceSolutionNodeId: "extra-semantic-child",
    });

    expect(UIImplementationSpecV2Schema.safeParse(implementation).success).toBe(true);
    expect(() => assertImplementationMatchesCompiledLayout(implementation, targetPage.id, compiled))
      .toThrowError(/correlation mismatch.*extra-semantic-layout/);
  });

  it("rejects page and layout geometry that diverge from the trusted tree", () => {
    const compiled = compile(layout("geometry-column", "column", [control("geometry-column-child")]));
    const pageMismatch = nativeImplementationFor(compiled);
    const mismatchedPage = nativePageFrom(pageMismatch);
    mismatchedPage.width += 1;
    expect(UIImplementationSpecV2Schema.safeParse(pageMismatch).success).toBe(true);
    expect(() => assertImplementationMatchesCompiledLayout(pageMismatch, mismatchedPage.id, compiled))
      .toThrowError(/page mismatch/);

    const geometryMismatch = nativeImplementationFor(compiled);
    const targetPage = nativePageFrom(geometryMismatch);
    targetPage.controls.forEach((control) => {
      control.geometry.x += 1;
    });
    expect(UIImplementationSpecV2Schema.safeParse(geometryMismatch).success).toBe(true);
    expect(() => assertImplementationMatchesCompiledLayout(geometryMismatch, targetPage.id, compiled))
      .toThrowError(/geometry mismatch.*geometry-column/);
  });

  it("checks overflow even when a runtime payload bypasses standalone schema parsing", () => {
    const compiled = compile(layout("overflow-column", "column", [control("overflow-column-child")]));
    const implementation = nativeImplementationFor(compiled);
    const targetPage = nativePageFrom(implementation);
    const metadata = targetPage.controls[0]!.compiledLayout;
    if (metadata === undefined) throw new Error("expected compiled layout metadata");
    Object.assign(metadata, { overflow: "local-scroll" });

    expect(() => assertImplementationMatchesCompiledLayout(implementation, targetPage.id, compiled))
      .toThrowError(/overflow mismatch.*overflow-column/);

    const extentImplementation = nativeImplementationFor(compiled);
    const extentPage = nativePageFrom(extentImplementation);
    const visibleMetadata = extentPage.controls[0]!.compiledLayout;
    if (visibleMetadata === undefined) throw new Error("expected compiled layout metadata");
    Object.assign(visibleMetadata, {
      scrollContentExtent: {
        width: extentPage.controls[0]!.geometry.width,
        height: extentPage.controls[0]!.geometry.height,
      },
    });
    expect(() => assertImplementationMatchesCompiledLayout(extentImplementation, extentPage.id, compiled))
      .toThrowError(/scrollContentExtent mismatch.*overflow-column/);
  });

  it("accepts a real scroll tree and rejects a schema-tight extent that differs from the trusted compiler", () => {
    const item = intrinsic({ minHeight: 160, preferredHeight: 160, maxHeight: 160 });
    const root = layout("correlated-scroll", "scroll-region", [
      control("correlated-scroll-a"),
      control("correlated-scroll-b", { readingOrder: 1 }),
    ], { height: { mode: "fixed", value: 220 } });
    const compiled = compile(root, new Map([
      ["correlated-scroll-a", item],
      ["correlated-scroll-b", item],
    ]));
    const implementation = nativeImplementationFor(compiled);
    const targetPage = nativePageFrom(implementation);

    expect(() => assertImplementationMatchesCompiledLayout(implementation, targetPage.id, compiled)).not.toThrow();

    const second = targetPage.controls.find((candidate) => candidate.sourceSolutionNodeId === "correlated-scroll-b")!;
    second.geometry.y -= 1;
    const metadata = targetPage.controls[0]!.compiledLayout;
    if (metadata === undefined || metadata.kind !== "scroll-region") throw new Error("expected scroll metadata");
    metadata.scrollContentExtent.height -= 1;
    expect(UIImplementationSpecV2Schema.safeParse(implementation).success).toBe(true);
    expect(() => assertImplementationMatchesCompiledLayout(implementation, targetPage.id, compiled))
      .toThrowError(/scrollContentExtent mismatch.*correlated-scroll/);
  });

  it("fails closed when computed scroll content exceeds the v2 extent ceiling", () => {
    const exactRoot = layout("maximum-scroll", "scroll-region", [control("maximum-scroll-child")], {
      height: { mode: "fixed", value: 220 },
    });
    const exact = compile(exactRoot, new Map([[
      "maximum-scroll-child",
      intrinsic({ minHeight: 100_000, preferredHeight: 100_000, maxHeight: 100_000 }),
    ]]));
    expect(exact.root.scrollContentExtent).toEqual({ width: 1_360, height: 100_000 });
    const exactImplementation = nativeImplementationFor(exact);
    expect(() => assertImplementationMatchesCompiledLayout(exactImplementation, "implementation-page", exact)).not.toThrow();

    const children = Array.from({ length: 13 }, (_value, index) => control(`oversized-scroll-${index}`, { readingOrder: index }));
    const root = layout("oversized-scroll", "scroll-region", children, { height: { mode: "fixed", value: 220 } });
    const sizes = new Map(children.map((child) => [
      child.id,
      intrinsic({ minHeight: 8_192, preferredHeight: 8_192, maxHeight: 8_192 }),
    ]));

    try {
      compile(root, sizes);
      throw new Error("expected oversized scroll compilation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(LayoutCompileError);
      if (!(error instanceof LayoutCompileError)) return;
      expect(error.code).toBe("LAYOUT_UNSATISFIABLE");
      expect(error.details).toEqual({
        nodeId: "oversized-scroll",
        minimumRequired: { width: 1_360, height: 106_640 },
        available: { width: 100_000, height: 100_000 },
        attemptedColumns: [],
        scrollAllowed: true,
      });
    }
  });

  it("compiles a realistic visitor workspace with content-driven height and stable semantic order", () => {
    const compiled = compile(visitorWorkspaceRoot, visitorMeasures);

    expect(compiled.pageWidth).toBe(1440);
    expect(compiled.pageHeight).toBeLessThan(1_800);
    expect(compiled.byId.get("filters")!.geometry.y).toBeLessThan(compiled.byId.get("records")!.geometry.y);
    expect(overlaps(compiled.byId.get("summary")!, compiled.byId.get("records")!)).toBe(false);
    expect(compiled.byId.get("sidebar")!.geometry.width).toBeLessThan(compiled.byId.get("main")!.geometry.width);
    expect(compiled.byId.get("main")!.children.map((node) => node.id)).toEqual(["filters", "summary", "records"]);
    expectGeometrySafe(compiled);
  });

  it.each([
    ["row", 2],
    ["column", 2],
    ["grid", 4],
    ["asymmetric-grid", 4],
    ["split", 2],
    ["stack", 2],
    ["dock", 5],
    ["sidebar-content", 2],
    ["master-detail", 2],
    ["scroll-region", 2],
    ["overlay-anchor", 2],
  ] as const)("supports deterministic %s geometry", (kind, count) => {
    const children = Array.from({ length: count }, (_value, index) => control(`${kind}-${index + 1}`, {
      readingOrder: index,
      visualWeight: index + 1 > 5 ? 5 : index + 1,
    }));
    const root = layout(`${kind}-root`, kind, children, kind === "scroll-region" ? { height: { mode: "fixed", value: 240 } } : {});
    const first = compile(root);
    const second = compile(root);
    expect(first.root).toEqual(second.root);
    expect(first.root.children).toHaveLength(count);
    expectGeometrySafe(first);
  });

  it("maps responsive and desktop to 1440 and large-display to 1920", () => {
    const root = layout("canvas-root", "column", [control("canvas-child")]);
    expect(compile(root, new Map(), "responsive").pageWidth).toBe(1440);
    expect(compile(root, new Map(), "desktop").pageWidth).toBe(1440);
    expect(compile(root, new Map(), "large-display").pageWidth).toBe(1920);
  });

  it("applies density page padding exactly once while retaining nested control gaps", () => {
    const nested = layout("nested", "column", [control("nested-a"), control("nested-b", { readingOrder: 1 })]);
    const root = layout("padding-root", "column", [nested], { density: "spacious" });
    nested.intent = intent({ density: "spacious" });
    nested.children[0]!.intent = intent({ density: "spacious" });
    nested.children[1]!.intent = intent({ density: "spacious", readingOrder: 1 });

    const compiled = compile(root);
    const nestedBox = compiled.byId.get("nested")!;
    const first = compiled.byId.get("nested-a")!;
    const second = compiled.byId.get("nested-b")!;
    expect(compiled.root.geometry).toMatchObject({ x: 56, width: 1_328 });
    expect(nestedBox.geometry.x).toBe(56);
    expect(first.geometry.x).toBe(56);
    expect(second.geometry.y - (first.geometry.y + first.geometry.height)).toBe(16);
  });

  it("forms sibling group connected-components and stably orders components and members", () => {
    const grouped = layout("group-root", "column", [
      control("later-member", { readingOrder: 4 }),
      control("middle", { readingOrder: 2 }),
      control("first-member", { readingOrder: 0, groupWith: ["later-member"] }),
      control("tie-b", { readingOrder: 6 }),
      control("tie-a", { readingOrder: 6 }),
    ]);

    expect(compile(grouped).root.children.map((node) => node.id)).toEqual([
      "first-member",
      "later-member",
      "middle",
      "tie-a",
      "tie-b",
    ]);
  });

  it("fails closed for cyclic groupWith references instead of depending on traversal direction", () => {
    const root = layout("cyclic-group-root", "column", [
      control("cyclic-a", { groupWith: ["cyclic-b"] }),
      control("cyclic-b", { readingOrder: 1, groupWith: ["cyclic-a"] }),
    ]);
    expect(() => compile(root)).toThrowError(/LAYOUT_INPUT_INVALID:.*cyclic-/);
  });

  it("allocates scarce content space to higher importance before supporting siblings", () => {
    const root = layout("scarce-root", "row", [
      control("supporting", { importance: "supporting", readingOrder: 0 }),
      control("primary", { importance: "primary", readingOrder: 1 }),
    ]);
    const measures = new Map<string, IntrinsicSize>([
      ["scarce-root", intrinsic({ minWidth: 1_212, preferredWidth: 2_012, maxWidth: 3_000 })],
      ["supporting", intrinsic({ minWidth: 600, preferredWidth: 1_000 })],
      ["primary", intrinsic({ minWidth: 600, preferredWidth: 1_000 })],
    ]);
    const compiled = compile(root, measures);
    expect(compiled.byId.get("primary")!.geometry.width).toBeGreaterThan(compiled.byId.get("supporting")!.geometry.width);
  });

  it("allocates main-axis space in content, fixed, minmax, ratio, then fill order", () => {
    const root = layout("allocation-root", "row", [
      control("content-size", { width: { mode: "content" } }),
      control("fixed-size", { readingOrder: 1, width: { mode: "fixed", value: 150 } }),
      control("minmax-size", { readingOrder: 2, width: { mode: "minmax", min: 100, max: 180 } }),
      control("ratio-size", { readingOrder: 3, width: { mode: "ratio", value: 1 } }),
      control("fill-size", { readingOrder: 4, width: { mode: "fill" } }),
    ]);
    const sizes = new Map<string, IntrinsicSize>([
      ["content-size", intrinsic({ minWidth: 100, preferredWidth: 200 })],
      ["fixed-size", intrinsic({ minWidth: 100, preferredWidth: 140 })],
      ["minmax-size", intrinsic({ minWidth: 100, preferredWidth: 180 })],
      ["ratio-size", intrinsic({ minWidth: 100, preferredWidth: 200 })],
      ["fill-size", intrinsic({ minWidth: 100, preferredWidth: 200 })],
    ]);
    const compiled = compile(root, sizes);
    expect(["content-size", "fixed-size", "minmax-size", "ratio-size", "fill-size"].map((id) => compiled.byId.get(id)!.geometry.width))
      .toEqual([200, 150, 180, 682, 100]);
  });

  it("redistributes ratio and fill space after a sibling reaches its effective maximum", () => {
    const root = layout("bounded-fill-root", "row", [
      control("bounded-fill", { width: { mode: "fill" } }),
      control("open-fill", { readingOrder: 1, width: { mode: "fill" } }),
    ]);
    const sizes = new Map<string, IntrinsicSize>([
      ["bounded-fill", intrinsic({ maxWidth: 200 })],
      ["open-fill", intrinsic()],
    ]);

    const compiled = compile(root, sizes);
    expect(compiled.byId.get("bounded-fill")!.geometry.width).toBe(200);
    expect(compiled.byId.get("open-fill")!.geometry.width).toBe(1_148);
  });

  it("keeps the root and cross-axis stretch within effective intrinsic and intent bounds", () => {
    const root = layout("bounded-root", "column", [
      control("fixed-cross-axis", { align: "stretch", width: { mode: "fixed", value: 240 } }),
    ], { align: "center" });
    const sizes = new Map<string, IntrinsicSize>([
      ["bounded-root", intrinsic({ minWidth: 320, preferredWidth: 640, maxWidth: 640 })],
    ]);

    const compiled = compile(root, sizes);
    expect(compiled.root.geometry).toMatchObject({ x: 400, width: 640 });
    expect(compiled.byId.get("fixed-cross-axis")!.geometry).toMatchObject({ x: 400, width: 240 });
  });

  it("measures column content height at the child's bounded cross-axis width", () => {
    const gridChildren = Array.from({ length: 6 }, (_value, index) => control(`column-narrow-${index + 1}`, { readingOrder: index }));
    const narrowGrid = layout("column-narrow-grid", "grid", gridChildren, { width: { mode: "fixed", value: 300 } });
    const root = layout("column-narrow-root", "column", [narrowGrid]);
    const compiled = compile(root);

    expect(compiled.root.geometry.height).toBe(108);
    expect(compiled.byId.get("column-narrow-grid")!.geometry).toMatchObject({ width: 300, height: 108 });
    expect(compiled.byId.get("column-narrow-4")!.geometry.y)
      .toBeGreaterThan(compiled.byId.get("column-narrow-1")!.geometry.y);
  });

  it("fails closed when a fixed value exceeds the intrinsic maximum", () => {
    const root = layout("fixed-maximum-root", "row", [
      control("fixed-maximum-child", { width: { mode: "fixed", value: 500 } }),
    ]);

    expect(() => compile(root, new Map([
      ["fixed-maximum-child", intrinsic({ maxWidth: 400 })],
    ]))).toThrowError(/LAYOUT_UNSATISFIABLE:.*fixed-maximum-child/);
  });

  it("uses the shared effective-interval intersection for stack and overlay geometry", () => {
    for (const kind of ["stack", "overlay-anchor"] as const) {
      const root = layout(`${kind}-bounds-root`, kind, [
        control(`${kind}-fixed`, { width: { mode: "fixed", value: 400 } }),
        control(`${kind}-range`, { readingOrder: 1, width: { mode: "minmax", min: 300, max: 500 } }),
      ]);
      const compiled = compile(root);
      expect(compiled.root.children[0]!.geometry).toEqual(compiled.root.children[1]!.geometry);
      expect(compiled.root.children[0]!.geometry.width).toBe(400);

      const impossible = layout(`${kind}-impossible-root`, kind, [
        control(`${kind}-three-hundred`, { width: { mode: "fixed", value: 300 } }),
        control(`${kind}-four-hundred`, { readingOrder: 1, width: { mode: "fixed", value: 400 } }),
      ]);
      expect(() => compile(impossible)).toThrowError(/LAYOUT_UNSATISFIABLE:.*impossible-root/);
    }
  });

  it("measures shared stack and overlay height at the resolved narrow width", () => {
    for (const kind of ["stack", "overlay-anchor"] as const) {
      const gridChildren = Array.from({ length: 6 }, (_value, index) => control(`${kind}-narrow-${index + 1}`, { readingOrder: index }));
      const narrowGrid = layout(`${kind}-narrow-grid`, "grid", gridChildren, { width: { mode: "fixed", value: 300 } });
      const root = layout(`${kind}-narrow-root`, kind, [
        narrowGrid,
        control(`${kind}-narrow-peer`, { readingOrder: 1 }),
      ]);
      const compiled = compile(root);

      expect(compiled.root.children[0]!.geometry).toEqual(compiled.root.children[1]!.geometry);
      expect(compiled.root.children[0]!.geometry).toMatchObject({ width: 300, height: 108 });
      expect(compiled.byId.get(`${kind}-narrow-4`)!.geometry.y)
        .toBeGreaterThan(compiled.byId.get(`${kind}-narrow-1`)!.geometry.y);
    }
  });

  it("keeps remainder-rounded siblings inside their parent", () => {
    const children = Array.from({ length: 24 }, (_value, index) => control(`fraction-${index + 1}`, { readingOrder: index }));
    const root = layout("fraction-root", "row", children);
    const sizes = new Map<string, IntrinsicSize>(children.map((child) => [child.id, intrinsic({ minWidth: 1, preferredWidth: 1 })]));
    const compiled = compile(root, sizes);
    const last = compiled.byId.get("fraction-24")!.geometry;
    expect(last.x + last.width).toBeLessThanOrEqual(compiled.root.geometry.x + compiled.root.geometry.width);
    expectGeometrySafe(compiled);
  });

  it.each([
    ["start", 40],
    ["center", 660],
    ["end", 1_280],
    ["stretch", 40],
  ] as const)("uses %s alignment on a column cross-axis", (align, expectedX) => {
    const root = layout(`align-${align}`, "column", [control(`aligned-${align}`, { align, width: { mode: "content" } })]);
    const sizes = new Map<string, IntrinsicSize>([[`aligned-${align}`, intrinsic({ minWidth: 100, preferredWidth: 120, maxWidth: 120 })]]);
    const child = compile(root, sizes).byId.get(`aligned-${align}`)!;
    expect(child.geometry.x).toBe(expectedX);
    expect(child.geometry.width).toBe(120);
  });

  it("reduces grid columns deterministically from the largest candidate that child minima cannot fit", () => {
    const root = layout("grid-root", "grid", [control("g1"), control("g2", { readingOrder: 1 }), control("g3", { readingOrder: 2 })]);
    const sizes = new Map<string, IntrinsicSize>([
      ["g1", intrinsic({ minWidth: 500, preferredWidth: 500 })],
      ["g2", intrinsic({ minWidth: 500, preferredWidth: 500 })],
      ["g3", intrinsic({ minWidth: 500, preferredWidth: 500 })],
    ]);
    const compiled = compile(root, sizes);
    expect(compiled.byId.get("g1")!.geometry.y).toBe(compiled.byId.get("g2")!.geometry.y);
    expect(compiled.byId.get("g3")!.geometry.y).toBeGreaterThan(compiled.byId.get("g1")!.geometry.y);
  });

  it("caps a fitting grid at twelve columns", () => {
    const children = Array.from({ length: 13 }, (_value, index) => control(`cap-${index + 1}`, { readingOrder: index }));
    const compiled = compile(layout("capped-grid", "grid", children));
    expect(compiled.byId.get("cap-12")!.geometry.y).toBe(compiled.byId.get("cap-1")!.geometry.y);
    expect(compiled.byId.get("cap-13")!.geometry.y).toBeGreaterThan(compiled.byId.get("cap-1")!.geometry.y);
  });

  it.each([
    ["compact", "desktop"],
    ["comfortable", "desktop"],
    ["spacious", "desktop"],
    ["comfortable", "large-display"],
  ] as const)("absorbs eleven-column rounding at cumulative %s boundaries on %s", (density, canvas) => {
    const children = Array.from({ length: 11 }, (_value, index) => control(`round-${density}-${canvas}-${index + 1}`, {
      density,
      readingOrder: index,
    }));
    const root = layout(`round-${density}-${canvas}-root`, "grid", children, { density });
    const compiled = compile(root, new Map([
      [root.id, intrinsic({ maxWidth: 3_000 })],
      ...children.map((child) => [child.id, intrinsic({ minWidth: 1 })] as const),
    ]), canvas);
    const last = compiled.root.children[10]!.geometry;
    expect(last.x + last.width).toBeLessThanOrEqual(compiled.root.geometry.x + compiled.root.geometry.width + 0.01);
    expect(last.x + last.width).toBeCloseTo(compiled.root.geometry.x + compiled.root.geometry.width, 2);
  });

  it("keeps a fractional nested grid inside its allocated parent track", () => {
    const gridChildren = Array.from({ length: 11 }, (_value, index) => control(`nested-round-${index + 1}`, { readingOrder: index }));
    const nestedGrid = layout("nested-round-grid", "grid", gridChildren, { width: { mode: "ratio", value: 1 } });
    const root = layout("nested-round-root", "row", [
      nestedGrid,
      control("nested-round-side-a", { readingOrder: 1, width: { mode: "ratio", value: 1 } }),
      control("nested-round-side-b", { readingOrder: 2, width: { mode: "ratio", value: 1 } }),
    ]);
    const compiled = compile(root, new Map([
      [nestedGrid.id, intrinsic({ minWidth: 1 })],
      ...gridChildren.map((child) => [child.id, intrinsic({ minWidth: 1 })] as const),
      ["nested-round-side-a", intrinsic({ minWidth: 1 })],
      ["nested-round-side-b", intrinsic({ minWidth: 1 })],
    ]));
    const parentBox = compiled.byId.get("nested-round-grid")!.geometry;
    const last = compiled.byId.get("nested-round-11")!.geometry;
    expect(last.x + last.width).toBeLessThanOrEqual(parentBox.x + parentBox.width + 0.01);
    expect(last.x + last.width).toBeCloseTo(parentBox.x + parentBox.width, 2);
  });

  it("compresses grid spacing and row heights before failing a fixed-height grid", () => {
    const children = Array.from({ length: 13 }, (_value, index) => control(`tight-${index + 1}`, { readingOrder: index }));
    const root = layout("tight-grid", "grid", children, { height: { mode: "fixed", value: 70 } });
    const compiled = compile(root);
    const first = compiled.byId.get("tight-1")!.geometry;
    const last = compiled.byId.get("tight-13")!.geometry;
    expect(first.height).toBe(32);
    expect(last.y - (first.y + first.height)).toBe(6);
    expectGeometrySafe(compiled);
  });

  it("uses visualWeight for asymmetric tracks", () => {
    const root = layout("asymmetric-root", "asymmetric-grid", [
      control("heavy", { visualWeight: 5 }),
      control("light", { readingOrder: 1, visualWeight: 1 }),
    ]);
    const compiled = compile(root);
    expect(compiled.byId.get("heavy")!.geometry.width).toBeGreaterThan(compiled.byId.get("light")!.geometry.width);
  });

  it.each(["split", "sidebar-content", "master-detail"] as const)("requires exactly two children for %s", (kind) => {
    const root = layout(`${kind}-invalid`, kind, [control(`${kind}-only`)]);
    expect(() => compile(root)).toThrowError(LayoutCompileError);
  });

  it("maps dock children to north, west, east, south, then center", () => {
    const root = layout("dock-root", "dock", [
      control("north", { readingOrder: 0 }),
      control("west", { readingOrder: 1 }),
      control("east", { readingOrder: 2 }),
      control("south", { readingOrder: 3 }),
      control("center", { readingOrder: 4 }),
    ]);
    const compiled = compile(root);
    const north = compiled.byId.get("north")!.geometry;
    const west = compiled.byId.get("west")!.geometry;
    const east = compiled.byId.get("east")!.geometry;
    const south = compiled.byId.get("south")!.geometry;
    const center = compiled.byId.get("center")!.geometry;
    expect(north.y).toBe(compiled.root.geometry.y);
    expect(north.width).toBe(compiled.root.geometry.width);
    expect(west.x).toBe(compiled.root.geometry.x);
    expect(east.x).toBeGreaterThan(center.x);
    expect(south.y).toBeGreaterThan(center.y);
    expect(center.x).toBeGreaterThan(west.x);
  });

  it("compresses dock spacing before declaring a fixed-height composition unsatisfiable", () => {
    const root = layout("compact-dock", "dock", [
      control("compact-north", { height: { mode: "fixed", value: 32 } }),
      control("compact-center", { readingOrder: 1, height: { mode: "fixed", value: 32 } }),
    ], { height: { mode: "fixed", value: 70 } });
    const compiled = compile(root);
    const northBox = compiled.byId.get("compact-north")!.geometry;
    const centerBox = compiled.byId.get("compact-center")!.geometry;
    expect(centerBox.y - (northBox.y + northBox.height)).toBe(6);
    expectGeometrySafe(compiled);
  });

  it("compresses dock content toward intrinsic minima in scarce fixed height", () => {
    const root = layout("scarce-dock", "dock", [
      control("scarce-north"),
      control("scarce-center", { readingOrder: 1 }),
    ], { height: { mode: "fixed", value: 70 } });
    const compiled = compile(root);
    const northBox = compiled.byId.get("scarce-north")!.geometry;
    const centerBox = compiled.byId.get("scarce-center")!.geometry;
    expect([northBox.height, centerBox.height]).toEqual([32, 32]);
    expect(centerBox.y - (northBox.y + northBox.height)).toBe(6);
  });

  it("grows dock height from a center grid measured at its actual 300px track width", () => {
    const gridChildren = Array.from({ length: 6 }, (_value, index) => control(`dock-grid-${index + 1}`, { readingOrder: index }));
    const center = layout("dock-grid-center", "grid", gridChildren, { readingOrder: 1, width: { mode: "fixed", value: 300 } });
    const root = layout("dock-grid-root", "dock", [control("dock-grid-north"), center]);

    const compiled = compile(root);
    const centerBox = compiled.byId.get("dock-grid-center")!.geometry;
    expect(centerBox.width).toBe(300);
    expect(centerBox.height).toBe(108);
    expect(compiled.root.geometry.height).toBe(180);
    expect(compiled.byId.get("dock-grid-4")!.geometry.y).toBeGreaterThan(compiled.byId.get("dock-grid-1")!.geometry.y);
    expectGeometrySafe(compiled);
  });

  it("keeps dock middle cross-axis stretch within each child's maximum", () => {
    const gridChildren = Array.from({ length: 6 }, (_value, index) => control(`dock-west-grid-${index + 1}`, { readingOrder: index }));
    const west = layout("dock-west-grid", "grid", gridChildren, { readingOrder: 1, width: { mode: "fixed", value: 300 } });
    const root = layout("dock-middle-bounds-root", "dock", [
      control("dock-middle-bounds-north"),
      west,
      control("dock-middle-bounds-center", { readingOrder: 2 }),
    ]);
    const compiled = compile(root, new Map([
      ["dock-middle-bounds-center", intrinsic({ maxHeight: 60 })],
    ]));

    expect(compiled.byId.get("dock-west-grid")!.geometry.height).toBe(108);
    expect(compiled.byId.get("dock-middle-bounds-center")!.geometry.height).toBe(60);
    expectGeometrySafe(compiled);
  });

  it("shares geometry and increments z-order only for stack and overlay-anchor", () => {
    for (const kind of ["stack", "overlay-anchor"] as const) {
      const root = layout(`${kind}-root`, kind, [control(`${kind}-back`), control(`${kind}-front`, { readingOrder: 1 })]);
      const compiled = compile(root);
      const [back, front] = compiled.root.children;
      expect(back!.geometry).toEqual(front!.geometry);
      expect(front!.zIndex).toBe(back!.zIndex + 1);
    }
  });

  it("introduces local scrolling only for scroll-region", () => {
    const childSizes = new Map<string, IntrinsicSize>([
      ["scroll-a", intrinsic({ minHeight: 160, preferredHeight: 180 })],
      ["scroll-b", intrinsic({ minHeight: 160, preferredHeight: 180 })],
      ["plain-a", intrinsic({ minHeight: 160, preferredHeight: 180 })],
      ["plain-b", intrinsic({ minHeight: 160, preferredHeight: 180 })],
    ]);
    const scrollRoot = layout("scroll-root", "scroll-region", [control("scroll-a"), control("scroll-b", { readingOrder: 1 })], { height: { mode: "fixed", value: 220 } });
    const plainRoot = layout("plain-root", "column", [control("plain-a"), control("plain-b", { readingOrder: 1 })], { height: { mode: "fixed", value: 220 } });
    const scrolled = compile(scrollRoot, childSizes);
    expect([...scrolled.byId.values()].filter((node) => node.overflow === "local-scroll").map((node) => node.id)).toEqual(["scroll-root"]);
    expect(scrolled.pageHeight).toBe(300);
    expect(scrolled.root.geometry).toEqual({ x: 40, y: 40, width: 1_360, height: 220 });
    expect(scrolled.root.scrollContentExtent).toEqual({ width: 1_360, height: 332 });
    expect(scrolled.byId.get("scroll-b")!.geometry.y + scrolled.byId.get("scroll-b")!.geometry.height)
      .toBeGreaterThan(scrolled.root.geometry.y + scrolled.root.geometry.height);
    expect(scrolled.byId.get("scroll-b")!.geometry.y + scrolled.byId.get("scroll-b")!.geometry.height)
      .toBeLessThanOrEqual(scrolled.root.geometry.y + scrolled.root.scrollContentExtent!.height);
    expect([...scrolled.byId.values()].filter((node) => node.scrollContentExtent !== undefined).map((node) => node.id))
      .toEqual(["scroll-root"]);
    expectGeometrySafe(scrolled);
    expect(() => compile(plainRoot, childSizes)).toThrowError(/LAYOUT_UNSATISFIABLE:.*plain-root/);
  });

  it("compiles a fixed viewport from the real scroll-region intrinsic measurement", () => {
    const item = intrinsic({ minHeight: 160, preferredHeight: 160, maxHeight: 160 });
    const measuredRoot = measureIntrinsic({
      kind: "layout",
      node: { kind: "layout", id: "measured-scroll-root", layout: "scroll-region", intent: { density: "comfortable" } },
      density: "comfortable",
      width: { available: 1_360 },
      font: { fontSize: 16, lineHeight: 1.5 },
      childMeasures: [item, item],
      gap: 12,
    });
    const root = layout("measured-scroll-root", "scroll-region", [
      control("measured-scroll-a"),
      control("measured-scroll-b", { readingOrder: 1 }),
    ], { height: { mode: "fixed", value: 220 } });
    const compiled = compile(root, new Map([
      [root.id, measuredRoot],
      ["measured-scroll-a", item],
      ["measured-scroll-b", item],
    ]));

    expect(measuredRoot).toMatchObject({ minHeight: 0, preferredHeight: 332, maxHeight: 332, overflow: "scroll" });
    expect(compiled.root.geometry.height).toBe(220);
    expect(compiled.root.scrollContentExtent).toEqual({ width: 1_360, height: 332 });
    expect(compiled.pageHeight).toBe(300);
  });

  it("bounds every scrolling descendant while keeping deeper children inside their direct parent", () => {
    const nested = layout("scroll-nested", "column", [
      control("scroll-nested-a"),
      control("scroll-nested-b", { readingOrder: 1 }),
    ]);
    const root = layout("scroll-nested-root", "scroll-region", [nested], { height: { mode: "fixed", value: 150 } });
    const sizes = new Map<string, IntrinsicSize>([
      ["scroll-nested-a", intrinsic({ minHeight: 100, preferredHeight: 100 })],
      ["scroll-nested-b", intrinsic({ minHeight: 100, preferredHeight: 100 })],
    ]);
    const compiled = compile(root, sizes);
    const nestedBox = compiled.byId.get("scroll-nested")!.geometry;
    const leaf = compiled.byId.get("scroll-nested-b")!.geometry;

    expect(compiled.pageHeight).toBe(230);
    expect(compiled.root.scrollContentExtent).toEqual({ width: 1_360, height: 206 });
    expect(nestedBox.y + nestedBox.height).toBeGreaterThan(compiled.root.geometry.y + compiled.root.geometry.height);
    expect(leaf.y + leaf.height).toBeLessThanOrEqual(nestedBox.y + nestedBox.height);
    expect(leaf.y + leaf.height).toBeLessThanOrEqual(compiled.root.geometry.y + compiled.root.scrollContentExtent!.height);
    expectGeometrySafe(compiled);
  });

  it("gives nested scroll regions independent tight extents and stops the outer extent at the inner viewport", () => {
    const inner = layout("inner-scroll", "scroll-region", [
      control("inner-scroll-a"),
      control("inner-scroll-b", { readingOrder: 1 }),
    ], { readingOrder: 1, height: { mode: "fixed", value: 100 } });
    const root = layout("outer-scroll", "scroll-region", [
      control("outer-scroll-a"),
      inner,
    ], { height: { mode: "fixed", value: 150 } });
    const item = intrinsic({ minHeight: 100, preferredHeight: 100, maxHeight: 100 });
    const compiled = compile(root, new Map([
      ["outer-scroll-a", item],
      ["inner-scroll-a", item],
      ["inner-scroll-b", item],
    ]));
    const innerCompiled = compiled.byId.get("inner-scroll")!;
    const innerLast = compiled.byId.get("inner-scroll-b")!;

    expect(compiled.pageHeight).toBe(230);
    expect(compiled.root.scrollContentExtent).toEqual({ width: 1_360, height: 224 });
    expect(innerCompiled.scrollContentExtent).toEqual({ width: 1_360, height: 212 });
    expect(innerCompiled.geometry.y + innerCompiled.geometry.height).toBeGreaterThan(compiled.pageHeight);
    expect(innerLast.geometry.y + innerLast.geometry.height)
      .toBeGreaterThan(compiled.root.geometry.y + compiled.root.scrollContentExtent!.height);
    expectGeometrySafe(compiled);
  });

  it("reports the intrinsic maximum as available when a fixed intent exceeds it", () => {
    const root = layout("fixed-above-max", "column", [control("fixed-above-max-child")], {
      width: { mode: "fixed", value: 500 },
    });

    try {
      compile(root, new Map([[root.id, intrinsic({ maxWidth: 300 })]]));
      throw new Error("expected compileLayout to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(LayoutCompileError);
      if (!(error instanceof LayoutCompileError)) return;
      expect(error.details).toEqual({
        nodeId: "fixed-above-max",
        minimumRequired: { width: 500, height: 32 },
        available: { width: 300, height: 48 },
        attemptedColumns: [],
        scrollAllowed: false,
      });
    }
  });

  it("returns node-specific structured details for an impossible grid", () => {
    const root = layout("impossible-grid", "grid", [control("too-wide-a"), control("too-wide-b", { readingOrder: 1 })]);
    const sizes = new Map<string, IntrinsicSize>([
      ["impossible-grid", intrinsic({ minWidth: 1_500, preferredWidth: 1_500 })],
      ["too-wide-a", intrinsic({ minWidth: 1_500, preferredWidth: 1_500 })],
      ["too-wide-b", intrinsic({ minWidth: 1_500, preferredWidth: 1_500 })],
    ]);

    try {
      compile(root, sizes);
      throw new Error("expected compileLayout to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(LayoutCompileError);
      if (!(error instanceof LayoutCompileError)) return;
      expect(error.code).toBe("LAYOUT_UNSATISFIABLE");
      expect(error.message).toMatch(/LAYOUT_UNSATISFIABLE:.*too-wide-a/);
      expect(error.details).toEqual({
        nodeId: "too-wide-a",
        minimumRequired: { width: 1_500, height: 32 },
        available: { width: 1_360, height: 48 },
        attemptedColumns: [2, 1],
        scrollAllowed: false,
      });
    }
  });

  it("reports the padded page content box for an oversized root", () => {
    const root = layout("oversized-page-root", "column", [control("oversized-page-child")]);
    try {
      compile(root, new Map([
        [root.id, intrinsic({ minWidth: 1_500, preferredWidth: 1_500 })],
      ]));
      throw new Error("expected compileLayout to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(LayoutCompileError);
      if (!(error instanceof LayoutCompileError)) return;
      expect(error.details).toEqual({
        nodeId: "oversized-page-root",
        minimumRequired: { width: 1_500, height: 32 },
        available: { width: 1_360, height: 99_920 },
        attemptedColumns: [],
        scrollAllowed: false,
      });
    }
  });

  it.each([
    ["missing intrinsic", "LAYOUT_INPUT_INVALID", (root: LayoutNode): LayoutCompileInput => ({ page: page(root), expandedRoot: root, intrinsicByNodeId: new Map([[root.id, intrinsic()]]) })],
    ["extra intrinsic", "LAYOUT_INPUT_INVALID", (root: LayoutNode): LayoutCompileInput => ({ page: page(root), expandedRoot: root, intrinsicByNodeId: new Map([...intrinsicMap(root), ["ghost", intrinsic()]]) })],
    ["non-finite intrinsic", "LAYOUT_INPUT_INVALID", (root: LayoutNode): LayoutCompileInput => ({ page: page(root), expandedRoot: root, intrinsicByNodeId: new Map([...intrinsicMap(root), ["input-child", intrinsic({ minWidth: Number.NaN })]]) })],
  ] as const)("fails closed for %s maps", (_name, code, build) => {
    const root = layout("input-root", "column", [control("input-child")]);
    try {
      compileLayout(build(root));
      throw new Error("expected compileLayout to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(LayoutCompileError);
      if (error instanceof LayoutCompileError) expect(error.code).toBe(code);
    }
  });

  it("fails closed for duplicate ids, tree cycles, cross-parent groups, root mismatch, and invalid fixed sizes", () => {
    const duplicate = layout("duplicate-root", "column", [control("same"), control("same", { readingOrder: 1 })]);
    expect(() => compileLayout({ page: page(duplicate), expandedRoot: duplicate, intrinsicByNodeId: new Map([["duplicate-root", intrinsic()], ["same", intrinsic()]]) }))
      .toThrowError(/LAYOUT_INPUT_INVALID:.*same/);

    const cyclicChildren: SolutionNode[] = [];
    const cyclic = layout("cyclic-root", "column", cyclicChildren);
    cyclicChildren.push(cyclic);
    expect(() => compileLayout({ page: page(cyclic), expandedRoot: cyclic, intrinsicByNodeId: new Map([["cyclic-root", intrinsic()]]) }))
      .toThrowError(/LAYOUT_INPUT_INVALID:.*cyclic-root/);

    const nested = layout("nested-group", "column", [control("nested-target")]);
    const crossParent = layout("cross-parent", "column", [control("source", { groupWith: ["nested-target"] }), nested]);
    expect(() => compile(crossParent)).toThrowError(/LAYOUT_INPUT_INVALID:.*source/);

    const actual = layout("actual-root", "column", [control("actual-child")]);
    const declared = layout("declared-root", "column", [control("declared-child")]);
    expect(() => compileLayout({ page: page(declared), expandedRoot: actual, intrinsicByNodeId: intrinsicMap(actual) }))
      .toThrowError(/LAYOUT_INPUT_INVALID:.*actual-root/);

    const fixed = layout("fixed-root", "row", [control("fixed-child", { width: { mode: "fixed", value: 60 } })]);
    expect(() => compile(fixed, new Map([["fixed-child", intrinsic({ minWidth: 100 })]]))).toThrowError(/LAYOUT_UNSATISFIABLE:.*fixed-child/);

    const contradictoryFixed = layout("contradictory-root", "row", [control("contradictory-child", { width: { mode: "fixed", value: 120, min: 200, max: 300 } })]);
    expect(() => compile(contradictoryFixed)).toThrowError(/LAYOUT_UNSATISFIABLE:.*contradictory-child/);

    const illegalNumeric = layout("numeric-root", "column", [control("numeric-child")]);
    Object.defineProperty(illegalNumeric.intent.width, "value", { value: Number.NaN });
    expect(() => compile(illegalNumeric)).toThrowError(/LAYOUT_INPUT_INVALID:.*numeric-root/);
  });

  it.each([
    ["layout kind", (root: LayoutNode): void => { Object.defineProperty(root, "layout", { value: "absolute" }); }],
    ["density", (root: LayoutNode): void => { Object.defineProperty(root.intent, "density", { value: "dense" }); }],
    ["importance", (root: LayoutNode): void => { Object.defineProperty(root.children[0]!.intent, "importance", { value: "urgent" }); }],
    ["alignment", (root: LayoutNode): void => { Object.defineProperty(root.children[0]!.intent, "align", { value: "baseline" }); }],
    ["size mode", (root: LayoutNode): void => { Object.defineProperty(root.children[0]!.intent.width, "mode", { value: "absolute" }); }],
  ] as const)("returns a structured input error for an invalid runtime %s", (_name, corrupt) => {
    const root = layout("runtime-root", "row", [control("runtime-a"), control("runtime-b", { readingOrder: 1 })]);
    corrupt(root);
    expect(() => compile(root)).toThrowError(LayoutCompileError);
    try {
      compile(root);
      throw new Error("expected compileLayout to fail");
    } catch (error) {
      if (error instanceof LayoutCompileError) expect(error.code).toBe("LAYOUT_INPUT_INVALID");
    }
  });

  it.each([
    ["null", null],
    ["non-array string", "runtime-b"],
    ["non-iterable object", { target: "runtime-b" }],
  ] as const)("returns a structured input error for runtime groupWith %s", (_name, invalidGroup) => {
    const root = layout("runtime-group-root", "row", [control("runtime-a"), control("runtime-b", { readingOrder: 1 })]);
    Object.defineProperty(root.children[0]!.intent, "groupWith", { value: invalidGroup });
    try {
      compile(root);
      throw new Error("expected compileLayout to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(LayoutCompileError);
      if (error instanceof LayoutCompileError) expect(error.code).toBe("LAYOUT_INPUT_INVALID");
    }
  });
});
