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
      height: { min: 80, preferred: { full: 520 }, max: 600 },
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
    }, registryFor(definition({ layout: { ...definition().layout, height: { min: 24, preferred: { full: 520 }, max: 600 } } })));

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
    }, registryFor(definition({ layout: { ...definition().layout, height: { min: 24, preferred: { full: 520 }, max: 600 } } })));

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
    }, registryFor(definition({ layout: { ...definition().layout, height: { min: 24, preferred: { full: 520 }, max: 600 } } })));

    expect(result.boundsByModuleId.header).toEqual({ x: 24, y: 12, width: 1392, height: 40 });
    expect(result.boundsByModuleId.sidebar).toEqual({ x: 24, y: 88, width: 192, height: 520 });
    expect(result.boundsByModuleId.table).toEqual({ x: 288, y: 124, width: 1128, height: 520 });
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
      layout: { ...definition().layout, height: { min: 900, preferred: { full: 900 }, max: 900 } },
    }));
    const result = solvePageLayout({
      id: "dashboard",
      mode: "dashboard-grid",
      modules: [module("oversized", 0)],
    }, registry);

    expect(result.boundsByModuleId).toEqual({});
    expect(result.issues).toEqual([{ code: "MODULE_TOO_SMALL", moduleId: "oversized" }]);
  });
});
