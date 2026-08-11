import { z } from "zod";
import { describe, expect, it } from "vitest";
import {
  createDefaultModuleRegistry,
  ModuleRegistry,
  type ModuleDefinition,
} from "./module-registry.js";

const layout = {
  regions: ["main"] as const,
  minColumnSpan: 4,
  maxColumnSpan: 8,
  preferredHeights: ["medium"] as const,
  interactions: ["navigate", "scroll"] as const,
};

function definition(overrides: Partial<ModuleDefinition> = {}): ModuleDefinition {
  return {
    kind: "hero",
    version: "1.0.0",
    category: "marketing",
    maturity: "stable",
    variants: ["default", "compact"],
    contentSchema: z.object({ headline: z.string().min(1) }),
    assetSlots: [{ id: "image", required: true, allowedKinds: ["image"] }],
    requiredKfCapabilities: ["text", "image"],
    layout,
    compile: () => ({ components: [], deliveryGaps: [] }),
    ...overrides,
  };
}

const instance = {
  id: "hero-banner",
  kind: "hero",
  title: "欢迎",
  content: JSON.stringify({ headline: "欢迎来到门户" }),
  placement: {
    region: "main" as const,
    order: 0,
    columnSpan: 6,
    preferredHeight: "medium" as const,
    alignment: "stretch" as const,
    emphasis: "primary" as const,
  },
  interactions: [{ type: "navigate" as const, pageId: "details" }],
  assetId: "hero-image",
};

const assets = [{
  id: "hero-image",
  kind: "image" as const,
  name: "门户横幅",
  mimeType: "image/png",
  description: "门户页横幅图",
}];

describe("versioned module registry", () => {
  it("rejects duplicate kind@version definitions", () => {
    const registry = new ModuleRegistry();
    registry.register(definition());

    expect(() => registry.register(definition())).toThrow("MODULE_DEFINITION_DUPLICATE: hero@1.0.0");
  });

  it("resolves only an exact kind@version and never selects a latest version", () => {
    const registry = new ModuleRegistry();
    registry.register(definition());
    registry.register(definition({ version: "2.0.0" }));

    expect(registry.require("hero", "1.0.0").version).toBe("1.0.0");
    expect(() => registry.require("hero", "3.0.0")).toThrow("MODULE_DEFINITION_NOT_FOUND: hero@3.0.0");
    expect(() => registry.require("hero", undefined as never)).toThrow();
  });

  it("lists stable definitions only for planning", () => {
    const registry = new ModuleRegistry();
    registry.register(definition());
    registry.register(definition({ kind: "beta-card", maturity: "beta" }));
    registry.register(definition({ kind: "legacy-card", maturity: "unsupported" }));

    expect(registry.listForPlanning().map((item) => item.kind)).toEqual(["hero"]);
  });

  it("returns a warning gap when validating a beta module", () => {
    const registry = new ModuleRegistry();
    registry.register(definition({ maturity: "beta" }));

    expect(registry.validateInstance({
      instance,
      version: "1.0.0",
      variant: "default",
      assets,
      availableKfCapabilities: ["text", "image"],
    }).deliveryGaps).toMatchObject([{
      moduleId: "hero-banner",
      severity: "warning",
      status: "unresolved",
    }]);
  });

  it("rejects unsupported modules and missing KF capabilities", () => {
    const registry = new ModuleRegistry();
    registry.register(definition({ maturity: "unsupported" }));

    expect(() => registry.validateInstance({
      instance,
      version: "1.0.0",
      variant: "default",
      assets,
      availableKfCapabilities: ["text", "image"],
    })).toThrow("MODULE_UNSUPPORTED: hero@1.0.0");

    const supportedRegistry = new ModuleRegistry();
    supportedRegistry.register(definition());
    expect(() => supportedRegistry.validateInstance({
      instance,
      version: "1.0.0",
      variant: "default",
      assets,
      availableKfCapabilities: ["text"],
    })).toThrow("MODULE_KF_CAPABILITY_MISSING: hero@1.0.0 [image]");
  });

  it("validates variants, content, asset slots, and layout against the registered definition", () => {
    const registry = new ModuleRegistry();
    registry.register(definition());

    expect(() => registry.validateInstance({
      instance,
      version: "1.0.0",
      variant: "unknown",
      assets,
      availableKfCapabilities: ["text", "image"],
    })).toThrow("MODULE_VARIANT_UNSUPPORTED: hero@1.0.0 [unknown]");
    expect(() => registry.validateInstance({
      instance: { ...instance, content: JSON.stringify({ headline: "" }) },
      version: "1.0.0",
      variant: "default",
      assets,
      availableKfCapabilities: ["text", "image"],
    })).toThrow("MODULE_CONTENT_INVALID: hero@1.0.0");
    expect(() => registry.validateInstance({
      instance: { ...instance, assetId: undefined },
      version: "1.0.0",
      variant: "default",
      assets,
      availableKfCapabilities: ["text", "image"],
    })).toThrow("MODULE_ASSET_SLOT_REQUIRED: hero@1.0.0 [image]");
    expect(() => registry.validateInstance({
      instance: { ...instance, placement: { ...instance.placement, columnSpan: 3 } },
      version: "1.0.0",
      variant: "default",
      assets,
      availableKfCapabilities: ["text", "image"],
    })).toThrow("MODULE_LAYOUT_INVALID: hero@1.0.0");
  });

  it("returns immutable catalog snapshots without compiler functions or native templates", () => {
    const registry = createDefaultModuleRegistry();
    registry.register(definition());

    const catalog = registry.listForPlanning();
    expect(catalog).toEqual([{
      kind: "hero",
      version: "1.0.0",
      maturity: "stable",
      variants: ["default", "compact"],
      slots: [{ id: "image", required: true, allowedKinds: ["image"] }],
      interactions: ["navigate", "scroll"],
      layout: {
        regions: ["main"],
        minColumnSpan: 4,
        maxColumnSpan: 8,
        preferredHeights: ["medium"],
      },
    }]);
    expect(catalog[0]).not.toHaveProperty("compile");
    expect(catalog[0]).not.toHaveProperty("contentSchema");

    try {
      (catalog as unknown as Array<{ kind: string }>)[0]!.kind = "forged";
      (catalog[0]!.variants as string[]).push("forged");
    } catch {
      // Frozen snapshots reject mutation in strict-mode ESM.
    }

    expect(registry.listForPlanning()[0]!.kind).toBe("hero");
    expect(registry.listForPlanning()[0]!.variants).toEqual(["default", "compact"]);
  });
});
