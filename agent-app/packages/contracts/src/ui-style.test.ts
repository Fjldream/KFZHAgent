import { describe, expect, it } from "vitest";
import {
  adaptUiImplementationV1,
  AdvancedStyleDeclarationSchema,
  AnyUIImplementationSpecSchema,
  ComponentStyleSpecSchema,
  ControlCapabilitySchema,
  UIImplementationSpecV2Schema,
  UIImplementationSpecSchema,
} from "./ui-style.js";

const theme = {
  background: "#f4f7fb",
  surface: "#ffffff",
  primary: "#163a5f",
  accent: "#e47b32",
  textPrimary: "#14212b",
  textSecondary: "#52616d",
  fontFamily: "Inter",
  spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;

const component = {
  id: "hero-title",
  role: "heading",
  sourceModuleId: "brand",
  capabilityId: "text",
  critical: true,
  content: "张伟",
  geometry: { x: 40, y: 40, width: 320, height: 48 },
  properties: {},
  style: { declarations: {}, states: {} },
} as const;

const v1Fixture = UIImplementationSpecSchema.parse({
  schema: "kf-ui-implementation/v1",
  theme,
  pages: [{ id: "home", width: 1440, height: 900, components: [component] }],
});

const v2Fixture = {
  schema: "kf-ui-implementation/v2",
  theme,
  compiledRoleStyles: {
    heading: { declarations: { fontSize: 24, fontWeight: 600 }, states: {} },
  },
  pages: [{
    id: "home",
    width: 1440,
    height: 900,
    sourceBlueprintPageId: "home-blueprint",
    controls: [
      {
        id: "hero",
        role: "surface",
        capabilityId: "layout.2",
        depth: 0,
        zIndex: 0,
        geometry: { x: 24, y: 24, width: 1392, height: 160 },
        nativeProperties: {},
        compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] },
        sourceSolutionNodeId: "hero-layout",
        sourceBlueprintPageId: "home-blueprint",
        sourceBlueprintRegionIds: ["hero-region"],
        eventBindings: [],
      },
      {
        id: "hero-title",
        parentId: "hero",
        role: "heading",
        capabilityId: "text",
        depth: 1,
        zIndex: 1,
        geometry: { x: 40, y: 40, width: 320, height: 48 },
        nativeProperties: { text: "张伟" },
        style: { declarations: { fontSize: 24 }, states: {} },
        compiledStyle: {
          nativeFields: {},
          cssFragments: [{ selectorToken: "root", state: "normal", declarations: { fontSize: 24 } }],
          warnings: [],
        },
        dataBinding: { mockDataId: "visitor-data", field: "name" },
        assetIds: ["portrait-asset"],
        sourceSolutionNodeId: "visitor-name",
        sourceRepeaterId: "visitor-cards",
        sourceBlueprintPageId: "home-blueprint",
        sourceBlueprintRegionIds: ["hero-region"],
        eventBindings: [],
      },
      {
        id: "visitor-dialog",
        role: "dialog",
        capabilityId: "easyui.19",
        depth: 0,
        zIndex: 100,
        geometry: { x: 420, y: 180, width: 600, height: 480 },
        nativeProperties: {},
        compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] },
        overlayHost: {
          overlayId: "visitor-detail",
          hostPageId: "home",
          presentation: "dialog",
          visibleStateId: "detail-visible",
          dismissible: true,
        },
        sourceSolutionNodeId: "visitor-detail-root",
        sourceBlueprintPageId: "home-blueprint",
        sourceBlueprintRegionIds: ["detail-region"],
        eventBindings: [],
      },
    ],
  }],
  compiledActions: [],
  compiledScripts: [],
};

describe("KF UI style contracts", () => {
  it("accepts structured style intent without raw CSS", () => {
    const parsed = ComponentStyleSpecSchema.parse({
      role: "primary-action",
      declarations: {
        backgroundColor: "{theme.primary}",
        textColor: "#ffffff",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
      },
      states: { hover: { backgroundColor: "#1d4ed8" } },
    });
    expect(parsed.role).toBe("primary-action");
  });

  it("accepts the reviewed advanced style vocabulary and semantic parts", () => {
    const parsed = ComponentStyleSpecSchema.parse({
      declarations: {
        borderTopWidth: 1,
        borderRightWidth: 2,
        borderBottomWidth: 3,
        borderLeftWidth: 4,
        borderTopColor: "#111111",
        borderRightColor: "#222222",
        borderBottomColor: "#333333",
        borderLeftColor: "#444444",
        borderTopLeftRadius: 6,
        borderTopRightRadius: 8,
        borderBottomRightRadius: 10,
        borderBottomLeftRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        letterSpacing: 0.5,
        truncate: true,
        objectFit: "cover",
        overflow: "hidden",
        iconSize: 18,
        iconColor: "#ffffff",
        iconGap: 8,
        focusRing: { color: "#2563eb", width: 2, offset: 2 },
        transition: { property: "opacity", durationMs: 180, easing: "ease-out" },
        advanced: [
          { kind: "gradient", angle: 135, stops: [{ offset: 0, color: "#163a5f" }, { offset: 1, color: "#e47b32" }] },
          { kind: "background-image", assetId: "hero-asset" },
          { kind: "transform", translateX: 4, translateY: -2, scale: 1.02, rotate: 2 },
        ],
      },
      states: {},
      parts: {
        icon: { declarations: { iconColor: "#ffffff", iconSize: 16 }, states: {} },
      },
    });

    expect(parsed.parts?.icon?.declarations.iconSize).toBe(16);
    expect(parsed.declarations.advanced?.map((declaration) => declaration.kind))
      .toEqual(["gradient", "background-image", "transform"]);
  });

  it("rejects unbounded advanced style values and free-form CSS", () => {
    expect(AdvancedStyleDeclarationSchema.safeParse({
      kind: "transform", translateX: 201, scale: 1.3, rotate: 16,
    }).success).toBe(false);
    expect(ComponentStyleSpecSchema.safeParse({
      declarations: { transition: { property: "all", durationMs: 800, easing: "linear" } },
    }).success).toBe(false);
    expect(ComponentStyleSpecSchema.safeParse({
      parts: { icon: { css: ".icon{position:fixed}" } },
    }).success).toBe(false);
  });

  it("rejects raw CSS and unknown declaration keys", () => {
    expect(ComponentStyleSpecSchema.safeParse({ css: "body{display:none}" }).success).toBe(false);
    expect(ComponentStyleSpecSchema.safeParse({ declarations: { position: "fixed" } }).success).toBe(false);
    expect(ComponentStyleSpecSchema.safeParse({
      declarations: { backgroundColor: "red;position:fixed" },
    }).success).toBe(false);
  });

  it("requires every capability dimension", () => {
    expect(ControlCapabilitySchema.safeParse({ id: "button" }).success).toBe(false);
  });

  it("requires stable page and component ids", () => {
    expect(UIImplementationSpecSchema.safeParse({ schema: "kf-ui-implementation/v1", theme: {}, pages: [] }).success).toBe(false);
  });

  it("accepts strict v2 output with flattened controls and empty interaction slots", () => {
    expect(UIImplementationSpecV2Schema.parse(v2Fixture).schema).toBe("kf-ui-implementation/v2");
    expect(UIImplementationSpecV2Schema.safeParse({
      ...v2Fixture,
      compiledActions: [{ kind: "navigate-page" }],
    }).success).toBe(false);
    expect(UIImplementationSpecV2Schema.safeParse({
      ...v2Fixture,
      pages: [{
        ...v2Fixture.pages[0],
        controls: [{ ...v2Fixture.pages[0]!.controls[0]!, eventBindings: [{ event: "click" }] }],
      }],
    }).success).toBe(false);
  });

  it("dispatches v1 and v2 snapshots without changing the v1 export", () => {
    expect(AnyUIImplementationSpecSchema.parse(v1Fixture).schema).toBe("kf-ui-implementation/v1");
    expect(AnyUIImplementationSpecSchema.parse(v2Fixture).schema).toBe("kf-ui-implementation/v2");
    expect(UIImplementationSpecSchema.parse(v1Fixture).schema).toBe("kf-ui-implementation/v1");
  });

  it("rejects raw CSS-shaped compiled output and broken parent references", () => {
    expect(UIImplementationSpecV2Schema.safeParse({
      ...v2Fixture,
      pages: [{
        ...v2Fixture.pages[0],
        controls: [{ ...v2Fixture.pages[0]!.controls[0]!, compiledStyle: { css: "body{display:none}" } }],
      }],
    }).success).toBe(false);
    expect(UIImplementationSpecV2Schema.safeParse({
      ...v2Fixture,
      pages: [{
        ...v2Fixture.pages[0],
        controls: v2Fixture.pages[0]!.controls.map((control) =>
          control.id === "hero-title" ? { ...control, parentId: "missing-parent" } : control),
      }],
    }).success).toBe(false);
  });

  it("rejects controls outside pages or parents and overlay hosts on unknown pages", () => {
    const outsidePage = structuredClone(v2Fixture);
    outsidePage.pages[0]!.controls[0]!.geometry.width = 1500;
    expect(UIImplementationSpecV2Schema.safeParse(outsidePage).success).toBe(false);

    const outsideParent = structuredClone(v2Fixture);
    outsideParent.pages[0]!.controls[1]!.geometry.x = 10;
    expect(UIImplementationSpecV2Schema.safeParse(outsideParent).success).toBe(false);

    const unknownHost = structuredClone(v2Fixture);
    unknownHost.pages[0]!.controls[2]!.overlayHost!.hostPageId = "missing-page";
    expect(UIImplementationSpecV2Schema.safeParse(unknownHost).success).toBe(false);
  });

  it("adapts v1 components without inventing parents or creative provenance", () => {
    const adapted = adaptUiImplementationV1(v1Fixture);

    expect(adapted.pages[0]?.controls[0]?.parentId).toBeUndefined();
    expect(adapted.pages[0]?.controls[0]?.sourceSolutionNodeId).toBeUndefined();
    expect(adapted.pages[0]?.controls[0]?.overlayHost).toBeUndefined();
    expect(adapted.pages[0]?.controls[0]?.style).toEqual(component.style);
    expect(adapted.compiledActions).toEqual([]);
    expect(adapted.compiledScripts).toEqual([]);
    expect(UIImplementationSpecV2Schema.safeParse(adapted).success).toBe(true);
  });

  it("keeps a bounded blueprint module trace on implementation components", () => {
    expect(UIImplementationSpecSchema.shape.pages.element.shape.components.element.parse(component))
      .toMatchObject({ sourceModuleId: "brand" });
    expect(UIImplementationSpecSchema.shape.pages.element.shape.components.element.safeParse({
      ...component,
      sourceModuleId: "x".repeat(101),
    }).success).toBe(false);
  });
});
