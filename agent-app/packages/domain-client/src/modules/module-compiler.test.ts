import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ModulePlan, ModulePlanModule, ResolvedAsset, UIComponentSpec } from "@kf/contracts";
import { ModuleRegistry, type ModuleDefinition } from "./module-registry.js";
import { compileModulePlan } from "./module-compiler.js";

const theme = {
  background: "#101827",
  surface: "#1E293B",
  primary: "#2563EB",
  accent: "#38BDF8",
  textPrimary: "#F8FAFC",
  textSecondary: "#94A3B8",
  fontFamily: "Inter",
  spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;

function module(id: string, overrides: Partial<ModulePlanModule> = {}): ModulePlanModule {
  return {
    id,
    kind: "test-panel",
    templateVersion: "1.0.0",
    variant: "default",
    title: id,
    content: JSON.stringify({ label: `${id} label` }),
    placement: {
      region: "main",
      order: 0,
      columnSpan: 12,
      preferredHeight: "medium",
      alignment: "stretch",
      emphasis: "primary",
    },
    interactions: [],
    ...overrides,
  };
}

function plan(modules: ModulePlanModule[]): ModulePlan {
  return {
    schema: "kf-module-plan/v1",
    projectKey: "kingclient.portal",
    theme,
    assets: [{ id: "portrait", kind: "image", name: "Portrait", mimeType: "image/png", description: "Profile portrait" }],
    pages: [{ id: "home", title: "Home", mode: "vertical-flow", modules }],
    operations: [],
  };
}

function definition(overrides: Partial<ModuleDefinition> = {}): ModuleDefinition {
  return {
    kind: "test-panel",
    version: "1.0.0",
    category: "test",
    maturity: "stable",
    variants: ["default"],
    contentSchema: z.object({ label: z.string().min(1) }),
    assetSlots: [],
    requiredKfCapabilities: ["text"],
    layout: {
      regions: ["main"],
      minColumnSpan: 1,
      maxColumnSpan: 12,
      preferredHeights: ["medium"],
      interactions: [],
      height: { min: 120, preferred: { compact: 120, small: 120, medium: 200, large: 320, full: 480 }, max: 480 },
    },
    compile: ({ context }) => ({
      components: [{
        id: "title",
        role: "title",
        capabilityId: "text",
        critical: true,
        content: String(context.content.label),
        geometry: { x: 20, y: 30, width: 200, height: 32 },
        properties: { semantic: "heading" },
        style: { declarations: { fontWeight: 700 }, states: {} },
      }],
      deliveryGaps: [],
    }),
    ...overrides,
  };
}

function registryFor(...definitions: ModuleDefinition[]): ModuleRegistry {
  const registry = new ModuleRegistry();
  definitions.forEach((item) => registry.register(item));
  return registry;
}

const resolvedAssets: Readonly<Record<string, ResolvedAsset>> = {
  portrait: { assetId: "portrait", status: "resolved", resolvedName: "Portrait" },
};

function compile(inputPlan: ModulePlan, registry: ModuleRegistry, extra: Partial<Parameters<typeof compileModulePlan>[0]> = {}) {
  return compileModulePlan({
    plan: inputPlan,
    registry,
    assetsById: resolvedAssets,
    validationContext: { availableKfCapabilities: ["text", "image"], approvedAuthorizationRefs: [] },
    ...extra,
  });
}

describe("compileModulePlan", () => {
  it("derives stable module-id/slot identifiers and translates local geometry into page coordinates", () => {
    const result = compile(plan([module("profile")]), registryFor(definition()));

    expect(result.implementation.pages[0]?.components).toEqual([expect.objectContaining({
      id: "profile/title",
      sourceModuleId: "profile",
      geometry: { x: 68, y: 78, width: 200, height: 32 },
    })]);
  });

  it("uses the exact persisted template version rather than an arbitrary latest definition", () => {
    const result = compile(plan([module("profile")]), registryFor(
      definition({ compile: () => ({ components: [component("title", "text")], deliveryGaps: [] }) }),
      definition({ version: "2.0.0", compile: () => ({ components: [component("title", "image")], deliveryGaps: [] }) }),
    ));

    expect(result.implementation.pages[0]?.components[0]?.capabilityId).toBe("text");
  });

  it("returns a blocking gap and never calls a required-asset module with an unresolved asset", () => {
    let compiled = false;
    const result = compile(plan([module("summary"), module("hero", { assetId: "portrait", placement: { ...module("hero").placement, order: 1 } })]), registryFor(
      definition(),
      definition({
        kind: "image-panel",
        assetSlots: [{ id: "image", required: true, allowedKinds: ["image"] }],
        requiredKfCapabilities: ["image"],
        compile: () => { compiled = true; return { components: [component("image", "image")], deliveryGaps: [] }; },
      }),
    ), {
      plan: plan([module("summary"), module("hero", {
        kind: "image-panel", assetId: "portrait", placement: { ...module("hero").placement, order: 1 },
      })]),
      assetsById: { portrait: { assetId: "portrait", status: "unavailable" } },
    });

    expect(compiled).toBe(false);
    expect(result.gaps).toEqual([expect.objectContaining({ moduleId: "hero", severity: "blocking", status: "unresolved" })]);
    expect(result.implementation.pages[0]?.components.map((item) => item.sourceModuleId)).toEqual(["summary"]);
  });

  it("reports a missing required KF capability as a blocking delivery gap instead of fabricating a fallback", () => {
    const result = compile(plan([module("summary"), module("image", {
      kind: "image-panel", placement: { ...module("image").placement, order: 1 },
    })]), registryFor(
      definition(),
      definition({ kind: "image-panel", requiredKfCapabilities: ["image"] }),
    ), {
      validationContext: { availableKfCapabilities: ["text"], approvedAuthorizationRefs: [] },
    });

    expect(result.gaps).toEqual([expect.objectContaining({
      moduleId: "image",
      severity: "blocking",
      status: "unresolved",
      reason: expect.stringContaining("MODULE_KF_CAPABILITY_MISSING"),
    })]);
    expect(result.implementation.pages[0]?.components.map((component) => component.sourceModuleId)).toEqual(["summary"]);
  });

  it("rejects raw CSS or native payloads from a module compiler", () => {
    const registry = registryFor(definition({
      compile: () => ({ components: [{ ...component("title", "text"), properties: { css: "body { display: none; }" } }], deliveryGaps: [] }),
    }));

    expect(() => compile(plan([module("profile")]), registry)).toThrow("MODULE_COMPILER_UNSAFE_OUTPUT: profile/title");
  });

  it("returns byte-equivalent output for repeated compilation", () => {
    const input = plan([module("profile")]);
    const registry = registryFor(definition());

    expect(compile(input, registry)).toEqual(compile(input, registry));
  });

  it("reuses a previous untouched module component exactly when its stable slots and bounds still match", () => {
    const input = plan([module("profile")]);
    const registry = registryFor(definition());
    const first = compile(input, registry);
    const previous = structuredClone(first.implementation);
    const existing = previous.pages[0]!.components[0]!;
    previous.pages[0]!.components[0] = {
      ...existing,
      properties: { semantic: "heading", preserved: true },
      style: { declarations: { fontWeight: 900, textColor: "#FFFFFF" }, states: {} },
    };

    const result = compile(input, registry, { previousPlan: input, previousImplementation: previous });

    expect(result.implementation.pages[0]?.components[0]).toEqual(previous.pages[0]?.components[0]);
  });

  it("rejects duplicate stable slots and local output outside the assigned module bounds", () => {
    const duplicate = registryFor(definition({
      compile: () => ({ components: [component("title", "text"), component("title", "text")], deliveryGaps: [] }),
    }));
    expect(() => compile(plan([module("profile")]), duplicate)).toThrow("DUPLICATE_STABLE_COMPONENT_ID: profile/title");

    const overflow = registryFor(definition({
      compile: () => ({ components: [{ ...component("title", "text"), geometry: { x: 0, y: 190, width: 20, height: 20 } }], deliveryGaps: [] }),
    }));
    expect(() => compile(plan([module("profile")]), overflow)).toThrow("MODULE_COMPILER_OUTPUT_OUT_OF_BOUNDS: profile/title");
  });
});

function component(id: string, capabilityId: string): UIComponentSpec {
  return {
    id,
    role: "content",
    capabilityId,
    critical: true,
    content: "content",
    geometry: { x: 0, y: 0, width: 20, height: 20 },
    properties: {},
    style: { declarations: {}, states: {} },
  };
}
