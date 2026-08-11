import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { ModulePlan, ModulePlanModule, ResolvedAsset, UIComponentSpec } from "@kf/contracts";
import { ModuleRegistry, type ModuleDefinition } from "./module-registry.js";
import { compileModulePlan } from "./module-compiler.js";
import { stableModuleComponentId } from "./stable-ids.js";

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
  const outcome = compileModulePlan({
    plan: inputPlan,
    registry,
    assetsById: resolvedAssets,
    validationContext: { availableKfCapabilities: ["text", "image"], approvedAuthorizationRefs: [] },
    ...extra,
  });
  if (outcome.status !== "compiled") throw new Error("expected compiled outcome");
  return outcome;
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
    const result = compileModulePlan({ plan: plan([module("summary"), module("hero", {
      kind: "image-panel", assetId: "portrait", placement: { ...module("hero").placement, order: 1 },
    })]), registry: registryFor(
      definition(),
      definition({
        kind: "image-panel",
        assetSlots: [{ id: "image", required: true, allowedKinds: ["image"] }],
        requiredKfCapabilities: ["image"],
        compile: () => { compiled = true; return { components: [component("image", "image")], deliveryGaps: [] }; },
      }),
    ),
      assetsById: { portrait: { assetId: "portrait", status: "unavailable" } },
      validationContext: { availableKfCapabilities: ["text", "image"], approvedAuthorizationRefs: [] },
    });

    expect(compiled).toBe(false);
    expect(result.gaps).toEqual([expect.objectContaining({ moduleId: "hero", severity: "blocking", status: "unresolved" })]);
    expect(result.status).toBe("blocked");
  });

  it("reports a missing required KF capability as a blocking delivery gap instead of fabricating a fallback", () => {
    const result = compileModulePlan({ plan: plan([module("summary"), module("image", {
      kind: "image-panel", placement: { ...module("image").placement, order: 1 },
    })]), registry: registryFor(
      definition(),
      definition({ kind: "image-panel", requiredKfCapabilities: ["image"] }),
    ),
      assetsById: {},
      validationContext: { availableKfCapabilities: ["text"], approvedAuthorizationRefs: [] },
    });

    expect(result.gaps).toEqual([expect.objectContaining({
      moduleId: "image",
      severity: "blocking",
      status: "unresolved",
      reason: expect.stringContaining("MODULE_KF_CAPABILITY_MISSING"),
    })]);
    expect(result.status).toBe("blocked");
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
    const result = compile(input, registry, { previousPlan: input, previousImplementation: previous });

    expect(result.implementation.pages[0]?.components[0]).toBe(previous.pages[0]?.components[0]);
  });

  it("preserves customer legacy controls by explicit entity ID and removes only trusted generated seeds", () => {
    const input = plan([module("profile")]);
    const registry = registryFor(definition());
    const previous = compile(input, registry).implementation;
    const customerHello: UIComponentSpec = { ...component("Text1", "text"), id: "Text1", sourceModuleId: undefined, content: "Hello Alice" };
    previous.pages[0]!.components.push(customerHello);

    const preserved = compile(input, registry, { previousPlan: input, previousImplementation: previous, editableEntityIds: ["Text1"] });
    expect(preserved.implementation.pages[0]!.components.find((item) => item.id === "Text1")).toBe(customerHello);

    const withoutSeed = compile(input, registry, { previousPlan: input, previousImplementation: previous, editableEntityIds: ["Text1"], generatedSeedEntityIds: ["Text1"] });
    expect(withoutSeed.implementation.pages[0]!.components.some((item) => item.id === "Text1")).toBe(false);
  });

  it("rejects accessor-backed legacy provenance without executing it", () => {
    let reads = 0;
    const unsafe = { plan: plan([module("profile")]), registry: registryFor(definition()), assetsById: resolvedAssets } as Record<string, unknown>;
    Object.defineProperty(unsafe, "generatedSeedEntityIds", { enumerable: true, get: () => { reads += 1; return ["Text1"]; } });
    expect(() => compileModulePlan(unsafe as never)).toThrow("INVALID_GENERATED_SEED_ENTITY_IDS");
    expect(reads).toBe(0);
  });

  it("keeps a prior object only when the newly compiled canonical component is exactly equal", () => {
    const input = plan([module("profile")]);
    const registry = registryFor(definition());
    const first = compile(input, registry).implementation;
    const changedTheme = { ...input, theme: { ...input.theme, primary: "#000000" } };
    expect(compile(changedTheme, registry, { previousPlan: input, previousImplementation: first }).implementation.pages[0]!.components[0])
      .not.toBe(first.pages[0]!.components[0]);

    const prefix = plan([module("prefix"), module("profile", { placement: { ...module("profile").placement, order: 1 } })]);
    const afterPrefix = compile(prefix, registry).implementation;
    const withoutPrefix = plan([module("profile", { placement: { ...module("profile").placement, order: 1 } })]);
    expect(compile(withoutPrefix, registry, { previousPlan: prefix, previousImplementation: afterPrefix }).implementation.pages[0]!.components[0]?.geometry.y)
      .not.toBe(afterPrefix.pages[0]!.components.find((item) => item.sourceModuleId === "profile")?.geometry.y);

    const alteredRegistry = registryFor(definition({ compile: () => ({ components: [{ ...component("title", "text"), content: "definition changed" }], deliveryGaps: [] }) }));
    const definitionRevision = compile(input, alteredRegistry, { previousPlan: input, previousImplementation: first });
    expect(definitionRevision.diff?.changedModules).toEqual(["profile"]);
    expect(definitionRevision.implementation.pages[0]!.components[0]!.content).toBe("definition changed");
  });

  it("strictly rejects unsafe resolved assets, nested compiler payloads, and unsafe prior implementations", () => {
    const registry = registryFor(definition({
      compile: () => ({ components: [{ ...component("title", "text"), properties: { safe: [{ nestedStorageKey: "x" }] } }], deliveryGaps: [] }),
    }));
    expect(() => compile(plan([module("profile")]), registry)).toThrow("MODULE_COMPILER_UNSAFE_OUTPUT: profile/title");
    expect(() => compile(plan([module("profile")]), registryFor(definition()), { assetsById: { portrait: { assetId: "wrong", status: "resolved" } } as never }))
      .toThrow("INVALID_RESOLVED_ASSET: portrait");
    const good = compile(plan([module("profile")]), registryFor(definition())).implementation;
    const unsafe = structuredClone(good) as unknown as { pages: Array<{ components: Array<{ properties: Record<string, unknown> }> }> };
    unsafe.pages[0]!.components[0]!.properties = Object.create({ hiddenPath: "/tmp/secret" });
    expect(() => compile(plan([module("profile")]), registryFor(definition()), { previousPlan: plan([module("profile")]), previousImplementation: unsafe as never }))
      .toThrow("UNSAFE_PREVIOUS_IMPLEMENTATION");
  });

  it("uses slot-aware asset gaps and exact component traces", () => {
    const optional = definition({ kind: "optional-image", assetSlots: [{ id: "image", required: false, allowedKinds: ["image"] }] });
    const required = definition({ kind: "required-image", assetSlots: [{ id: "image", required: true, allowedKinds: ["image"] }] });
    const optionalPlan = plan([module("summary"), module("optional", { kind: "optional-image", assetId: "portrait", placement: { ...module("optional").placement, order: 1 } })]);
    expect(compile(optionalPlan, registryFor(definition(), optional), { assetsById: { portrait: { assetId: "portrait", status: "pending" } } }).gaps)
      .toEqual([expect.objectContaining({ moduleId: "optional", severity: "warning" })]);
    const requiredPlan = plan([module("summary"), module("required", { kind: "required-image", assetId: "portrait", placement: { ...module("required").placement, order: 1 } })]);
    const result = compileModulePlan({ plan: requiredPlan, registry: registryFor(definition(), required), assetsById: { portrait: { assetId: "portrait", status: "unavailable" } }, validationContext: { availableKfCapabilities: ["text"], approvedAuthorizationRefs: [] } });
    expect(result.gaps).toEqual([expect.objectContaining({ moduleId: "required", severity: "blocking" })]);
    expect(result.traces.flatMap((trace) => trace.entries)).toEqual([expect.objectContaining({ moduleId: "summary", outputId: "summary/title" })]);
    expect(result.status).toBe("blocked");
  });

  it("rejects malformed or cross-module compiler delivery gaps and bounds stable IDs", () => {
    const malformed = registryFor(definition({ compile: () => ({ components: [component("title", "text")], deliveryGaps: [{ moduleId: "other", requirement: "x", severity: "warning", status: "unresolved", reason: "x" }] as never }) }));
    expect(() => compile(plan([module("profile")]), malformed)).toThrow("INVALID_MODULE_DELIVERY_GAP: profile");
    const left = `a${"x".repeat(99)}`;
    const right = `b${"y".repeat(99)}`;
    const id = stableModuleComponentId(left, right);
    expect(id.length).toBeLessThanOrEqual(100);
    expect(id).not.toBe(stableModuleComponentId(`${left}a`, right));
    expect(stableModuleComponentId("brand-css", "title")).toBe("brand-css/title");
  });

  it("returns a structured blocked outcome when no page can produce components", () => {
    const onlyRequired = plan([module("hero", { assetId: "portrait" })]);
    const outcome = compileModulePlan({
      plan: onlyRequired,
      registry: registryFor(definition({ assetSlots: [{ id: "image", required: true, allowedKinds: ["image"] }] })),
      assetsById: { portrait: { assetId: "portrait", status: "unavailable" } },
      validationContext: { availableKfCapabilities: ["text"], approvedAuthorizationRefs: [] },
    });
    expect(outcome).toEqual(expect.objectContaining({ status: "blocked", gaps: [expect.objectContaining({ severity: "blocking" })] }));
  });

  it("returns schema defaults after canonical parsing", () => {
    const result = compile(plan([module("profile")]), registryFor(definition({
      compile: () => ({ components: [{ ...component("title", "text"), critical: undefined as never }], deliveryGaps: [] }),
    })));
    expect(result.implementation.pages[0]!.components[0]!.critical).toBe(true);
  });

  it("never invokes getters while rejecting descriptor surprises and preserves safe asset identity keys", () => {
    let reads = 0;
    const payload: Record<string, unknown> = {};
    Object.defineProperty(payload, "nativeConfig", { enumerable: true, get: () => { reads += 1; return {}; } });
    const registry = registryFor(definition({ compile: () => ({ components: [{ ...component("title", "text"), properties: payload }], deliveryGaps: [] }) }));
    expect(() => compile(plan([module("profile")]), registry)).toThrow("MODULE_COMPILER_UNSAFE_OUTPUT");
    expect(reads).toBe(0);
    expect(() => compile(plan([module("profile")]), registryFor(definition()), { assetsById: { "brand-css": { assetId: "brand-css", status: "resolved", resolvedName: "brand" } } })).not.toThrow();
  });

  it("never invokes compile-output or output-array getters before rejecting them", () => {
    for (const field of ["components", "deliveryGaps"] as const) {
      let reads = 0;
      const output: Record<string, unknown> = {};
      Object.defineProperty(output, field, { enumerable: true, get: () => { reads += 1; return []; } });
      Object.defineProperty(output, field === "components" ? "deliveryGaps" : "components", { enumerable: true, value: [] });
      expect(() => compile(plan([module("profile")]), registryFor(definition({ compile: () => output as never })))).toThrow("MODULE_COMPILER_INVALID_OUTPUT: profile");
      expect(reads).toBe(0);
    }
    for (const field of ["components", "deliveryGaps"] as const) {
      let reads = 0;
      const values: unknown[] = [];
      Object.defineProperty(values, "0", { enumerable: true, get: () => { reads += 1; return component("title", "text"); } });
      const output = field === "components" ? { components: values, deliveryGaps: [] } : { components: [], deliveryGaps: values };
      expect(() => compile(plan([module("profile")]), registryFor(definition({ compile: () => output as never })))).toThrow("MODULE_COMPILER_INVALID_OUTPUT: profile");
      expect(reads).toBe(0);
    }
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
