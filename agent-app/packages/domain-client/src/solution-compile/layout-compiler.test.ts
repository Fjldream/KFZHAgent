import type { LayoutNode, NodeIntent, SolutionNode, SolutionPage } from "@kf/contracts";
import { describe, expect, it } from "vitest";
import type { IntrinsicSize } from "./intrinsic-measure.js";
import {
  LayoutCompileError,
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

function overlaps(left: CompiledLayoutNode, right: CompiledLayoutNode): boolean {
  const a = left.geometry;
  const b = right.geometry;
  return a.x < b.x + b.width && a.x + a.width > b.x
    && a.y < b.y + b.height && a.y + a.height > b.y;
}

function expectGeometrySafe(compiled: ReturnType<typeof compile>): void {
  for (const node of compiled.byId.values()) {
    const values = [node.geometry.x, node.geometry.y, node.geometry.width, node.geometry.height, node.zIndex];
    expect(values.every((value) => Number.isFinite(value) && value >= 0)).toBe(true);
    expect(node.geometry.x + node.geometry.width).toBeLessThanOrEqual(compiled.pageWidth);
    expect(node.geometry.y + node.geometry.height).toBeLessThanOrEqual(compiled.pageHeight);
    if (node.layout !== "stack" && node.layout !== "overlay-anchor") {
      node.children.forEach((child, index) => {
        node.children.slice(index + 1).forEach((other) => expect(overlaps(child, other)).toBe(false));
      });
    }
    if (node.overflow !== "local-scroll") {
      node.children.forEach((child) => {
        expect(child.geometry.x).toBeGreaterThanOrEqual(node.geometry.x);
        expect(child.geometry.y).toBeGreaterThanOrEqual(node.geometry.y);
        expect(child.geometry.x + child.geometry.width).toBeLessThanOrEqual(node.geometry.x + node.geometry.width);
        expect(child.geometry.y + child.geometry.height).toBeLessThanOrEqual(node.geometry.y + node.geometry.height);
      });
    }
  }
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
    expect(child.geometry.width).toBe(align === "stretch" ? 1_360 : 120);
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
    expect(() => compile(plainRoot, childSizes)).toThrowError(/LAYOUT_UNSATISFIABLE:.*plain-root/);
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
});
