import { z } from "zod";
import { describe, expect, it } from "vitest";
import type { ModulePlanModule } from "@kf/contracts";
import { ModuleRegistry, type ModuleDefinition } from "../module-registry.js";
import { solvePageLayout } from "./layout-engine.js";

const contentSchema = z.object({ headline: z.string().min(1) });

function definition(overrides: Partial<ModuleDefinition> = {}): ModuleDefinition {
  return {
    kind: "layout-card",
    version: "1.0.0",
    category: "test",
    maturity: "stable",
    variants: ["default"],
    contentSchema,
    assetSlots: [],
    requiredKfCapabilities: [],
    layout: {
      regions: ["header", "main", "sidebar", "footer", "toolbar"],
      minColumnSpan: 1,
      maxColumnSpan: 12,
      preferredHeights: ["compact", "small", "medium", "large", "full"],
      interactions: [],
      height: { min: 80, preferred: { compact: 120, small: 200, medium: 320, large: 420, full: 520 }, max: 600 },
    },
    compile: () => ({ components: [], deliveryGaps: [] }),
    ...overrides,
  };
}

function registryFor(...definitions: ModuleDefinition[]): ModuleRegistry {
  const registry = new ModuleRegistry();
  definitions.forEach((item) => registry.register(item));
  return registry;
}

function module(id: string, order: number, overrides: Partial<ModulePlanModule> = {}): ModulePlanModule {
  return {
    id,
    kind: "layout-card",
    templateVersion: "1.0.0",
    variant: "default",
    title: id,
    content: JSON.stringify({ headline: id }),
    placement: {
      region: "main",
      order,
      columnSpan: 12,
      preferredHeight: "full",
      alignment: "stretch",
      emphasis: "primary",
    },
    interactions: [],
    ...overrides,
  };
}

describe("solvePageLayout", () => {
  it("grows a vertical-flow page beyond 900px instead of shrinking its modules", () => {
    const result = solvePageLayout({
      id: "portal",
      mode: "vertical-flow",
      modules: [module("hero", 0), module("portfolio", 1)],
    }, registryFor(definition({ layout: { ...definition().layout, height: { min: 24, preferred: { compact: 120, small: 200, medium: 320, large: 420, full: 520 }, max: 600 } } })));

    expect(result.height).toBe(1160);
    expect(result.boundsByModuleId).toEqual({
      hero: { x: 48, y: 48, width: 1344, height: 520 },
      portfolio: { x: 48, y: 592, width: 1344, height: 520 },
    });
    expect(result.issues).toEqual([]);
  });

  it("uses exact integer 12-column span widths", () => {
    const result = solvePageLayout({
      id: "portal",
      mode: "vertical-flow",
      modules: [module("hero", 0)],
    }, registryFor(definition({ layout: { ...definition().layout, height: { min: 24, preferred: { compact: 120, small: 200, medium: 320, large: 420, full: 520 }, max: 600 } } })));

    expect(result.boundsByModuleId.hero).toEqual({ x: 48, y: 48, width: 1344, height: 520 });
  });

  it("reports dashboard overflow without globally rescaling the first module", () => {
    const result = solvePageLayout({
      id: "dashboard",
      mode: "dashboard-grid",
      modules: [module("top", 0), module("bottom", 1)],
    }, registryFor(definition()));

    expect(result.width).toBe(1440);
    expect(result.height).toBe(900);
    expect(result.boundsByModuleId.top).toEqual({ x: 48, y: 48, width: 1344, height: 520 });
    expect(result.boundsByModuleId).not.toHaveProperty("bottom");
    expect(result.issues).toEqual([{ code: "LAYOUT_OVERFLOW", moduleId: "bottom" }]);
  });

  it("reserves stable header, sidebar, and main regions in an admin shell", () => {
    const result = solvePageLayout({
      id: "admin",
      mode: "admin-shell",
      modules: [
        module("header", 0, { placement: { ...module("header", 0).placement, region: "header" } }),
        module("sidebar", 0, { placement: { ...module("sidebar", 0).placement, region: "sidebar" } }),
        module("table", 0),
      ],
    }, registryFor(definition({ layout: { ...definition().layout, height: { min: 24, preferred: { compact: 120, small: 200, medium: 320, large: 420, full: 520 }, max: 600 } } })));

    expect(result.boundsByModuleId.header).toEqual({ x: 24, y: 12, width: 1392, height: 40 });
    expect(result.boundsByModuleId.sidebar).toEqual({ x: 24, y: 88, width: 192, height: 520 });
    expect(result.boundsByModuleId.table).toEqual({ x: 288, y: 140, width: 1128, height: 520 });
    expect(result.issues).toEqual([]);
  });

  it("keeps the unaffected prefix anchored and moves only the affected suffix after insertion", () => {
    const registry = registryFor(definition());
    const before = solvePageLayout({
      id: "portal",
      mode: "vertical-flow",
      modules: [module("first", 0), module("third", 2)],
    }, registry);
    const after = solvePageLayout({
      id: "portal",
      mode: "vertical-flow",
      modules: [module("first", 0), module("second", 1), module("third", 2)],
      previousLayout: before,
    }, registry);

    expect(after.boundsByModuleId.first).toEqual(before.boundsByModuleId.first);
    expect(after.boundsByModuleId.second).toEqual({ x: 48, y: 592, width: 1344, height: 520 });
    expect(after.boundsByModuleId.third).toEqual({ x: 48, y: 1136, width: 1344, height: 520 });
  });

  it("returns a typed invalid region issue instead of placing a module in an illegal mode region", () => {
    const registry = registryFor(definition({ layout: { ...definition().layout, regions: ["main"] } }));
    const result = solvePageLayout({
      id: "dashboard",
      mode: "dashboard-grid",
      modules: [module("header", 0, { placement: { ...module("header", 0).placement, region: "header" } })],
    }, registry);

    expect(result.boundsByModuleId).toEqual({});
    expect(result.issues).toEqual([{ code: "INVALID_REGION", moduleId: "header" }]);
  });

  it("returns MODULE_TOO_SMALL when a fixed page cannot honor a module minimum height", () => {
    const registry = registryFor(definition({
      layout: { ...definition().layout, height: { min: 900, preferred: { compact: 900, small: 900, medium: 900, large: 900, full: 900 }, max: 900 } },
    }));
    const result = solvePageLayout({
      id: "dashboard",
      mode: "dashboard-grid",
      modules: [module("oversized", 0)],
    }, registry);

    expect(result.boundsByModuleId).toEqual({});
    expect(result.issues).toEqual([{ code: "MODULE_TOO_SMALL", moduleId: "oversized" }]);
  });

  it("fills a non-divisible twelve-column content width exactly", () => {
    const result = solvePageLayout({
      id: "non-divisible",
      mode: "vertical-flow",
      canvasWidth: 1441,
      modules: [module("full", 0)],
    }, registryFor(definition()));

    expect(result.boundsByModuleId.full).toEqual({ x: 48, y: 48, width: 1345, height: 520 });
  });

  it.each([
    ["start", 48],
    ["center", 162],
    ["end", 276],
    ["stretch", 48],
  ] as const)("aligns a narrower module at %s within its assigned grid slot", (alignment, expectedX) => {
    const result = solvePageLayout({
      id: `alignment-${alignment}`,
      mode: "vertical-flow",
      modules: [module("aligned", 0, {
        placement: { ...module("aligned", 0).placement, columnSpan: 6, alignment },
      })],
    }, registryFor(definition({ layout: { ...definition().layout, minColumnSpan: 4 } })));

    expect(result.boundsByModuleId.aligned).toEqual({
      x: expectedX,
      y: 48,
      width: alignment === "stretch" ? 660 : 432,
      height: 520,
    });
  });

  it("honors a trusted vertical-flow canvas minimum height", () => {
    const result = solvePageLayout({
      id: "tall-canvas",
      mode: "vertical-flow",
      canvasHeight: 2000,
      modules: [module("hero", 0)],
    }, registryFor(definition()));

    expect(result.height).toBe(2000);
  });

  it("reserves a failed fixed-layout module footprint so a later sibling cannot backfill it", () => {
    const result = solvePageLayout({
      id: "fixed-failure",
      mode: "dashboard-grid",
      modules: [
        module("a", 0, { placement: { ...module("a", 0).placement, preferredHeight: "small" } }),
        module("b", 1),
        module("c", 2, { placement: { ...module("c", 2).placement, preferredHeight: "small" } }),
      ],
    }, registryFor(definition({ layout: {
      ...definition().layout,
      height: { min: 80, preferred: { compact: 120, small: 200, medium: 320, large: 420, full: 700 }, max: 700 },
    } })));

    expect(result.boundsByModuleId.a).toEqual({ x: 48, y: 48, width: 1344, height: 200 });
    expect(result.boundsByModuleId).not.toHaveProperty("b");
    expect(result.boundsByModuleId).not.toHaveProperty("c");
    expect(result.issues).toEqual([
      { code: "LAYOUT_OVERFLOW", moduleId: "b" },
      { code: "LAYOUT_OVERFLOW", moduleId: "c" },
    ]);
  });

  it("reserves an undersized admin header slot before considering a later header sibling", () => {
    const tooTall = definition({
      kind: "tall-header",
      layout: { ...definition().layout, height: { min: 80, preferred: { compact: 80, small: 80, medium: 80, large: 80, full: 80 }, max: 80 } },
    });
    const compact = definition({
      kind: "compact-header",
      layout: { ...definition().layout, height: { min: 30, preferred: { compact: 30, small: 30, medium: 30, large: 30, full: 30 }, max: 30 } },
    });
    const result = solvePageLayout({
      id: "header-failure",
      mode: "admin-shell",
      modules: [
        module("failed", 0, { kind: "tall-header", placement: { ...module("failed", 0).placement, region: "header" } }),
        module("later", 1, { kind: "compact-header", placement: { ...module("later", 1).placement, region: "header" } }),
      ],
    }, registryFor(tooTall, compact));

    expect(result.boundsByModuleId).toEqual({});
    expect(result.issues).toEqual([
      { code: "MODULE_TOO_SMALL", moduleId: "failed" },
      { code: "LAYOUT_OVERFLOW", moduleId: "later" },
    ]);
  });

  it("reserves a below-minimum span and wraps a later full-width sibling instead of backfilling", () => {
    const wideOnly = definition({ kind: "wide-only", layout: { ...definition().layout, minColumnSpan: 6 } });
    const anyWidth = definition({ kind: "any-width", layout: { ...definition().layout, minColumnSpan: 1 } });
    const result = solvePageLayout({
      id: "span-failure",
      mode: "dashboard-grid",
      modules: [
        module("failed", 0, { kind: "wide-only", placement: { ...module("failed", 0).placement, columnSpan: 4, preferredHeight: "small" } }),
        module("later", 1, { kind: "any-width", placement: { ...module("later", 1).placement, columnSpan: 12, preferredHeight: "small" } }),
      ],
    }, registryFor(wideOnly, anyWidth));

    expect(result.boundsByModuleId.later).toEqual({ x: 48, y: 272, width: 1344, height: 200 });
    expect(result.boundsByModuleId).not.toHaveProperty("failed");
    expect(result.issues).toEqual([{ code: "MODULE_TOO_SMALL", moduleId: "failed" }]);
  });

  it("anchors the unchanged fixed-layout prefix while recomputing its affected sibling", () => {
    const registry = registryFor(definition());
    const before = solvePageLayout({
      id: "fixed-anchor",
      mode: "dashboard-grid",
      modules: [
        module("a", 0, { placement: { ...module("a", 0).placement, preferredHeight: "small" } }),
        module("b", 1, { placement: { ...module("b", 1).placement, preferredHeight: "small" } }),
      ],
    }, registry);
    const after = solvePageLayout({
      id: "fixed-anchor",
      mode: "dashboard-grid",
      previousLayout: before,
      modules: [
        module("a", 0, { placement: { ...module("a", 0).placement, preferredHeight: "small" } }),
        module("b", 1),
      ],
    }, registry);

    expect(after.boundsByModuleId.a).toBe(before.boundsByModuleId.a);
    expect(after.boundsByModuleId.b).toEqual({ x: 48, y: 272, width: 1344, height: 520 });
    expect(after.boundsByModuleId.b).not.toBe(before.boundsByModuleId.b);
  });

  it("rejects stale and overlapping previous anchors before deterministic recomputation", () => {
    const registry = registryFor(definition());
    const result = solvePageLayout({
      id: "anchors",
      mode: "vertical-flow",
      modules: [module("a", 0), module("b", 1)],
      previousLayout: {
        pageId: "anchors",
        mode: "vertical-flow",
        width: 1440,
        height: 1160,
        boundsByModuleId: {
          a: { x: 48, y: 48, width: 1344, height: 520 },
          b: { x: 48, y: 48, width: 1344, height: 520 },
        },
        issues: [],
      },
    }, registry);

    expect(result.boundsByModuleId).toEqual({
      a: { x: 48, y: 48, width: 1344, height: 520 },
      b: { x: 48, y: 592, width: 1344, height: 520 },
    });
  });
});
