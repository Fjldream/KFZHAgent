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
  height: { min: 100, preferred: { compact: 120, small: 180, medium: 240, large: 300, full: 400 }, max: 400 },
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
    compilerFingerprint: "test-hero-compiler-v1",
    layoutFingerprint: "test-hero-layout-v1",
    layout,
    compile: () => ({ components: [], deliveryGaps: [] }),
    ...overrides,
  };
}

const instance = {
  id: "hero-banner",
  kind: "hero",
  templateVersion: "1.0.0",
  variant: "default",
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
  it("rejects missing, incomplete, and out-of-range module height contracts", () => {
    const registry = new ModuleRegistry();
    expect(() => registry.register(definition({ layout: { ...layout, height: undefined } as unknown as ModuleDefinition["layout"] })))
      .toThrow("MODULE_DEFINITION_INVALID: hero@1.0.0 has invalid layout height bounds");
    expect(() => registry.register(definition({ layout: { ...layout, height: { min: 100, preferred: {}, max: 400 } } as unknown as ModuleDefinition["layout"] })))
      .toThrow("MODULE_DEFINITION_INVALID: hero@1.0.0 has invalid layout height bounds");
    expect(() => registry.register(definition({ layout: { ...layout, height: { min: 300, preferred: { medium: 240 }, max: 400 } } as unknown as ModuleDefinition["layout"] })))
      .toThrow("MODULE_DEFINITION_INVALID: hero@1.0.0 has invalid layout height bounds");
  });

  it("deep-freezes complete registered height contracts", () => {
    const registry = new ModuleRegistry();
    registry.register(definition());
    const height = registry.require("hero", "1.0.0").layout.height;

    expect(height).toEqual({ min: 100, preferred: { compact: 120, small: 180, medium: 240, large: 300, full: 400 }, max: 400 });
    expect(Object.isFrozen(height)).toBe(true);
    expect(Object.isFrozen(height.preferred)).toBe(true);
  });
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
      assets,
      context: { availableKfCapabilities: ["text", "image"], approvedAuthorizationRefs: [] },
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
      assets,
      context: { availableKfCapabilities: ["text", "image"], approvedAuthorizationRefs: [] },
    })).toThrow("MODULE_UNSUPPORTED: hero@1.0.0");

    const supportedRegistry = new ModuleRegistry();
    supportedRegistry.register(definition());
    expect(() => supportedRegistry.validateInstance({
      instance,
      assets,
      context: { availableKfCapabilities: ["text"], approvedAuthorizationRefs: [] },
    })).toThrow("MODULE_KF_CAPABILITY_MISSING: hero@1.0.0 [image]");
  });

  it("validates variants, content, asset slots, and layout against the registered definition", () => {
    const registry = new ModuleRegistry();
    registry.register(definition());

    expect(() => registry.validateInstance({
      instance: { ...instance, variant: "unknown" },
      assets,
      context: { availableKfCapabilities: ["text", "image"], approvedAuthorizationRefs: [] },
    })).toThrow("MODULE_VARIANT_UNSUPPORTED: hero@1.0.0 [unknown]");
    expect(() => registry.validateInstance({
      instance: { ...instance, content: JSON.stringify({ headline: "" }) },
      assets,
      context: { availableKfCapabilities: ["text", "image"], approvedAuthorizationRefs: [] },
    })).toThrow("MODULE_CONTENT_INVALID: hero@1.0.0");
    expect(() => registry.validateInstance({
      instance: { ...instance, assetId: undefined },
      assets,
      context: { availableKfCapabilities: ["text", "image"], approvedAuthorizationRefs: [] },
    })).toThrow("MODULE_ASSET_SLOT_REQUIRED: hero@1.0.0 [image]");
    expect(() => registry.validateInstance({
      instance: { ...instance, placement: { ...instance.placement, columnSpan: 3 } },
      assets,
      context: { availableKfCapabilities: ["text", "image"], approvedAuthorizationRefs: [] },
    })).toThrow("MODULE_LAYOUT_INVALID: hero@1.0.0");
  });

  it("resolves the exact persisted template version and rejects an unknown version or variant", () => {
    const registry = new ModuleRegistry();
    registry.register(definition());
    registry.register(definition({ version: "2.0.0" }));

    expect(registry.validateInstance({
      instance,
      assets,
      context: { availableKfCapabilities: ["text", "image"], approvedAuthorizationRefs: [] },
    }).definition.version).toBe("1.0.0");
    expect(() => registry.validateInstance({
      instance: { ...instance, templateVersion: "3.0.0" },
      assets,
      context: { availableKfCapabilities: ["text", "image"], approvedAuthorizationRefs: [] },
    })).toThrow("MODULE_DEFINITION_NOT_FOUND: hero@3.0.0");
    expect(() => registry.validateInstance({
      instance: { ...instance, variant: "unknown" },
      assets,
      context: { availableKfCapabilities: ["text", "image"], approvedAuthorizationRefs: [] },
    })).toThrow("MODULE_VARIANT_UNSUPPORTED: hero@1.0.0 [unknown]");
  });

  it("permits WebContainer only for a trusted approved fallback authorization", () => {
    const registry = new ModuleRegistry();
    registry.register(definition({ requiredKfCapabilities: ["webcontainer"] }));

    expect(() => registry.validateInstance({
      instance,
      assets,
      context: { availableKfCapabilities: ["webcontainer"], approvedAuthorizationRefs: [] },
    })).toThrow("MODULE_WEBCONTAINER_DISALLOWED: hero@1.0.0");

    const authorizedRegistry = new ModuleRegistry();
    authorizedRegistry.register(definition({
      requiredKfCapabilities: ["webcontainer"],
      fallbackPolicy: { mode: "allow-webcontainer", authorizationRef: "invented-ref" },
    }));
    expect(() => authorizedRegistry.validateInstance({
      instance,
      assets,
      context: { availableKfCapabilities: ["webcontainer"], approvedAuthorizationRefs: ["approved-webcontainer"] },
    })).toThrow("MODULE_WEBCONTAINER_UNAUTHORIZED: hero@1.0.0 [invented-ref]");
    const approvedRegistry = new ModuleRegistry();
    approvedRegistry.register(definition({
      requiredKfCapabilities: ["webcontainer"],
      fallbackPolicy: { mode: "allow-webcontainer", authorizationRef: "approved-webcontainer" },
    }));
    expect(approvedRegistry.validateInstance({
      instance,
      assets,
      context: { availableKfCapabilities: ["webcontainer"], approvedAuthorizationRefs: ["approved-webcontainer"] },
    }).definition.kind).toBe("hero");
  });

  it("sorts planning catalog entries by code point rather than locale", () => {
    const registry = new ModuleRegistry();
    registry.register(definition({ version: "a" }));
    registry.register(definition({ version: "_" }));
    registry.register(definition({ version: "A" }));

    expect(registry.listForPlanning().map((item) => item.version)).toEqual(["A", "_", "a"]);
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

  it("registers every V1 module with a frozen non-surface quality contract", () => {
    const registry = createDefaultModuleRegistry();
    const kinds = ["navigation.top", "navigation.sidebar", "content.hero", "metric.kpi-grid", "content.card-grid", "content.timeline", "data.chart-panel", "data.status-grid", "data.table", "data.detail", "interaction.tabs-filter", "form.record-editor", "action.toolbar", "feedback.alert-list", "content.contact-footer"];
    for (const kind of kinds) {
      const quality = registry.require(kind, "1.0.0").quality!;
      expect(quality.minimumComponentCount).toBeGreaterThanOrEqual(2);
      expect(quality.minimumCriticalComponentCount).toBeGreaterThanOrEqual(1);
      expect(quality.requiredRoles.length).toBeGreaterThan(0);
      expect(quality.requiredCriticalRoles.length).toBeGreaterThan(0);
      expect(quality.requiredCapabilityIds.length).toBeGreaterThan(0);
      expect(Object.isFrozen(quality)).toBe(true);
      expect(Object.isFrozen(quality.requiredRoles)).toBe(true);
      expect(Object.isFrozen(quality.requiredCriticalRoles)).toBe(true);
    }
  });
});
