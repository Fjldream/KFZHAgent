import { describe, expect, it } from "vitest";
import {
  adaptUiImplementationV1,
  AdvancedStyleDeclarationSchema,
  AnyUIImplementationSpecSchema,
  ComponentStyleSpecV2Schema,
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
  compatibility: "native",
  theme,
  compiledRoleStyles: {
    heading: { declarations: { fontSize: 24, fontWeight: 600 }, states: {} },
  },
  pages: [{
    compatibility: "native",
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

type MutableNativeV2Fixture = {
  pages: Array<{
    sourceBlueprintPageId?: string;
    controls: Array<{
      nativeProperties: Record<string, unknown>;
      compiledStyle?: {
        nativeFields: Record<string, unknown>;
        cssFragments: Array<{ declarations: Record<string, unknown> }>;
      };
      dataBinding?: { records?: Array<Record<string, unknown>> };
      style?: { declarations: Record<string, unknown>; parts?: Record<string, unknown> };
      sourceSolutionNodeId?: string;
      sourceBlueprintPageId?: string;
      sourceBlueprintRegionIds?: string[];
    }>;
  }>;
};

function mutableNativeV2Fixture(): MutableNativeV2Fixture {
  return structuredClone(v2Fixture) as unknown as MutableNativeV2Fixture;
}

describe("KF UI style contracts", () => {
  it("accepts structured style intent without raw CSS", () => {
    const parsed = ComponentStyleSpecV2Schema.parse({
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
    const parsed = ComponentStyleSpecV2Schema.parse({
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
    expect(ComponentStyleSpecV2Schema.safeParse({
      declarations: { transition: { property: "all", durationMs: 800, easing: "linear" } },
    }).success).toBe(false);
    expect(ComponentStyleSpecV2Schema.safeParse({
      parts: { icon: { css: ".icon{position:fixed}" } },
    }).success).toBe(false);
  });

  it.each([
    ["native property raw CSS", (fixture: MutableNativeV2Fixture) => {
      fixture.pages[0]!.controls[1]!.nativeProperties = {
        label: "访客姓名",
        nested: { css: "body{display:none}" },
      };
    }],
    ["compiled native selector", (fixture: MutableNativeV2Fixture) => {
      fixture.pages[0]!.controls[1]!.compiledStyle!.nativeFields = {
        backgroundColor: "#ffffff",
        nested: { selector: "body" },
      };
    }],
    ["data-binding JavaScript", (fixture: MutableNativeV2Fixture) => {
      fixture.pages[0]!.controls[1]!.dataBinding!.records = [{
        name: "陈嘉宁",
        formatter: "alert(1)",
      }];
    }],
  ])("rejects %s injected into an otherwise valid native v2 envelope", (_label, mutate) => {
    const poisoned = mutableNativeV2Fixture();
    mutate(poisoned);

    expect(UIImplementationSpecV2Schema.safeParse(poisoned).success).toBe(false);
  });

  it.each(["red !important", "var(--attacker)", "calc(1px)"])(
    "rejects unsafe native v2 color value %s",
    (color) => {
      const poisoned = mutableNativeV2Fixture();
      poisoned.pages[0]!.controls[1]!.style!.declarations.backgroundColor = color;

      expect(UIImplementationSpecV2Schema.safeParse(poisoned).success).toBe(false);
    },
  );

  it("preserves bounded domain records that merely resemble technical prose", () => {
    const valid = mutableNativeV2Fixture();
    valid.pages[0]!.controls[1]!.dataBinding!.records = [{
      status: "status:active",
      product: "Version(3.6)",
      summary: "设备由一号班组负责，等待复核",
    }];

    expect(UIImplementationSpecV2Schema.safeParse(valid).success).toBe(true);
  });

  it("rejects an overwide native semantic record in an otherwise valid v2 envelope", () => {
    const overwide = mutableNativeV2Fixture();
    overwide.pages[0]!.controls[1]!.nativeProperties = Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [`field${index}`, index]),
    );

    expect(UIImplementationSpecV2Schema.safeParse(overwide).success).toBe(false);
  });

  it("rejects raw CSS and unknown declaration keys", () => {
    expect(ComponentStyleSpecV2Schema.safeParse({ css: "body{display:none}" }).success).toBe(false);
    expect(ComponentStyleSpecV2Schema.safeParse({ declarations: { position: "fixed" } }).success).toBe(false);
    expect(ComponentStyleSpecV2Schema.safeParse({
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

  it.each([
    ["page blueprint id", (fixture: MutableNativeV2Fixture) => {
      delete fixture.pages[0]!.sourceBlueprintPageId;
    }],
    ["solution node id", (fixture: MutableNativeV2Fixture) => {
      delete fixture.pages[0]!.controls[1]!.sourceSolutionNodeId;
    }],
    ["control blueprint page id", (fixture: MutableNativeV2Fixture) => {
      delete fixture.pages[0]!.controls[1]!.sourceBlueprintPageId;
    }],
    ["control blueprint region ids", (fixture: MutableNativeV2Fixture) => {
      delete fixture.pages[0]!.controls[1]!.sourceBlueprintRegionIds;
    }],
  ])("rejects native v2 output missing provenance %s", (_label, mutate) => {
    const incomplete = mutableNativeV2Fixture();
    mutate(incomplete);
    expect(UIImplementationSpecV2Schema.safeParse(incomplete).success).toBe(false);
  });

  it.each([
    ["nested semantic part", (fixture: MutableNativeV2Fixture) => {
      fixture.pages[0]!.controls[1]!.style!.parts = {
        icon: {
          declarations: {},
          states: {
            hover: { advanced: [{ kind: "background-image", assetId: "rogue-asset" }] },
          },
        },
      };
    }],
    ["compiled style fragment", (fixture: MutableNativeV2Fixture) => {
      fixture.pages[0]!.controls[1]!.compiledStyle!.cssFragments[0]!.declarations.advanced = [
        { kind: "background-image", assetId: "rogue-asset" },
      ];
    }],
  ])("rejects a %s background image absent from the control asset declaration", (_label, mutate) => {
    const undeclared = mutableNativeV2Fixture();
    mutate(undeclared);
    expect(UIImplementationSpecV2Schema.safeParse(undeclared).success).toBe(false);
  });

  it("rejects a compiled role background image absent from matching control asset declarations", () => {
    const undeclared = structuredClone(v2Fixture);
    (undeclared.compiledRoleStyles.heading.declarations as Record<string, unknown>).advanced = [
      { kind: "background-image", assetId: "rogue-asset" },
    ];

    expect(UIImplementationSpecV2Schema.safeParse(undeclared).success).toBe(false);
  });

  it("rejects an overlay host owned by a different implementation page", () => {
    const wrongOwner = structuredClone(v2Fixture);
    wrongOwner.pages.push({
      compatibility: "native",
      id: "secondary",
      width: 800,
      height: 600,
      sourceBlueprintPageId: "secondary-blueprint",
      controls: [{
        id: "secondary-root",
        role: "surface",
        capabilityId: "layout.2",
        depth: 0,
        zIndex: 0,
        geometry: { x: 0, y: 0, width: 800, height: 600 },
        nativeProperties: {},
        compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] },
        sourceSolutionNodeId: "secondary-layout",
        sourceBlueprintPageId: "secondary-blueprint",
        sourceBlueprintRegionIds: ["secondary-region"],
        eventBindings: [],
      }],
    });
    wrongOwner.pages[0]!.controls[2]!.overlayHost!.hostPageId = "secondary";

    expect(UIImplementationSpecV2Schema.safeParse(wrongOwner).success).toBe(false);
  });

  it("adapts v1 components without inventing parents or creative provenance", () => {
    const adapted = adaptUiImplementationV1(v1Fixture);

    expect(adapted.pages[0]?.controls[0]).not.toHaveProperty("parentId");
    expect(adapted.pages[0]?.controls[0]).not.toHaveProperty("sourceSolutionNodeId");
    expect(adapted.pages[0]?.controls[0]).not.toHaveProperty("overlayHost");
    expect(adapted.pages[0]?.controls[0]?.style).toEqual(component.style);
    expect(adapted.compiledActions).toEqual([]);
    expect(adapted.compiledScripts).toEqual([]);
    expect(UIImplementationSpecV2Schema.safeParse(adapted).success).toBe(true);
  });

  it("preserves the legacy v1 empty-color contract in the compatibility adapter", () => {
    const legacy = UIImplementationSpecSchema.parse({
      ...v1Fixture,
      pages: [{
        ...v1Fixture.pages[0],
        components: [{
          ...v1Fixture.pages[0]!.components[0],
          style: { declarations: { backgroundColor: "" }, states: {} },
        }],
      }],
    });

    const adapted = adaptUiImplementationV1(legacy);
    expect((adapted as unknown as Record<string, unknown>).compatibility).toBe("adapted-v1");
    expect(adapted.pages[0]?.controls[0]?.style?.declarations.backgroundColor).toBe("");
  });

  it("adapts a legacy v1 component that extends beyond its page", () => {
    const legacy = UIImplementationSpecSchema.parse({
      ...v1Fixture,
      pages: [{
        ...v1Fixture.pages[0],
        components: [{
          ...v1Fixture.pages[0]!.components[0],
          geometry: { x: 1_400, y: 40, width: 100, height: 48 },
        }],
      }],
    });

    const adapted = adaptUiImplementationV1(legacy);
    expect((adapted as unknown as Record<string, unknown>).compatibility).toBe("adapted-v1");
    expect(UIImplementationSpecV2Schema.safeParse(adapted).success).toBe(true);
  });

  it("adapts legacy v1 control ids that repeat on different pages", () => {
    const legacy = UIImplementationSpecSchema.parse({
      ...v1Fixture,
      pages: [
        {
          ...v1Fixture.pages[0],
          id: "page-one",
          components: [{ ...v1Fixture.pages[0]!.components[0], id: "shared-control" }],
        },
        {
          ...v1Fixture.pages[0],
          id: "page-two",
          components: [{ ...v1Fixture.pages[0]!.components[0], id: "shared-control" }],
        },
      ],
    });

    const adapted = adaptUiImplementationV1(legacy);
    expect((adapted as unknown as Record<string, unknown>).compatibility).toBe("adapted-v1");
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
