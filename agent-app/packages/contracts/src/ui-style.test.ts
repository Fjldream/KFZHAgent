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

function scrollV2Fixture() {
  const sourcePage = v2Fixture.pages[0]!;
  const root = sourcePage.controls[0]!;
  const child = sourcePage.controls[1]!;
  return {
    ...v2Fixture,
    pages: [{
      ...sourcePage,
      height: 300,
      controls: [
        {
          ...root,
          id: "scroll-root",
          capabilityId: "layout.4",
          geometry: { x: 40, y: 40, width: 1_360, height: 220 },
          scrollContentExtent: { width: 1_360, height: 326 },
          sourceSolutionNodeId: "scroll-layout",
        },
        {
          ...child,
          id: "scroll-first",
          parentId: "scroll-root",
          geometry: { x: 40, y: 40, width: 1_360, height: 160 },
          sourceSolutionNodeId: "scroll-first",
        },
        {
          ...child,
          id: "scroll-second",
          parentId: "scroll-root",
          geometry: { x: 40, y: 206, width: 1_360, height: 160 },
          sourceSolutionNodeId: "scroll-second",
        },
        {
          ...child,
          id: "scroll-leaf",
          parentId: "scroll-second",
          depth: 2,
          geometry: { x: 60, y: 340, width: 100, height: 20 },
          sourceSolutionNodeId: "scroll-leaf",
        },
      ],
    }],
  };
}

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

  it.each([
    "notAColor",
    "position",
    "rgb(256, 0, 0)",
    "rgb(101%, 0%, 0%)",
    "rgb(100%, 0, 255)",
    "rgb(100% 0 255)",
    "rgb(255, 0, 0 / 50%)",
    "rgba(0, 0, 0, 1.1)",
    "rgba(0, 0, 0, -0.1)",
    "hsl(361, 50%, 50%)",
    "hsl(-1, 50%, 50%)",
    "hsl(120, 101%, 50%)",
    "hsl(120, 50%, -1%)",
    "hsl(240, 100, 50%)",
    "hsl(240 100 50% / .5)",
    "hsl(240, 100%, 50% / .5)",
    "hsla(120, 50%, 50%, 1.1)",
  ])("rejects out-of-contract native color %s", (color) => {
    const poisoned = mutableNativeV2Fixture();
    poisoned.pages[0]!.controls[1]!.style!.declarations.backgroundColor = color;

    expect(UIImplementationSpecV2Schema.safeParse(poisoned).success).toBe(false);
  });

  it.each([
    "transparent",
    "red",
    "rebeccapurple",
    "#abc",
    "#12345678",
    "{theme.primary}",
    "rgb(255, 0, 128)",
    "rgb(100%, 0%, 50%)",
    "rgb(12.5, 64, 128.25)",
    "rgba(0, 0, 0, .5)",
    "rgba(0, 0, 0, 50%)",
    "rgb(255 0 0 / 50%)",
    "rgb(100% 0% 50%)",
    "rgba(12.5 64 128.25 / .5)",
    "hsl(360, 100%, 50%)",
    "hsla(0, 0%, 0%, 1)",
    "hsla(240deg, 100%, 50%, 25%)",
    "hsl(240 100% 50% / .5)",
    "hsl(240deg 100% 50%)",
    "hsla(240 100% 50% / 25%)",
  ])("accepts bounded native color %s", (color) => {
    const valid = mutableNativeV2Fixture();
    valid.pages[0]!.controls[1]!.style!.declarations.backgroundColor = color;

    expect(UIImplementationSpecV2Schema.safeParse(valid).success).toBe(true);
  });

  it("preserves bounded domain records that merely resemble technical prose", () => {
    const valid = mutableNativeV2Fixture();
    valid.pages[0]!.controls[1]!.dataBinding!.records = [{
      status: "status:active",
      statusLabel: "status(active)",
      product: "Version(3.6)",
      summary: "设备由一号班组负责，等待复核",
    }];

    expect(UIImplementationSpecV2Schema.safeParse(valid).success).toBe(true);
  });

  it.each([
    "FuNcTiOn('return 1')",
    "WeBsOcKeT('wss://attacker.example')",
    "XmLhTtPrEqUeSt()",
    "body > .admin",
  ])("rejects explicit dangerous native implementation text %s", (payload) => {
    const poisoned = mutableNativeV2Fixture();
    poisoned.pages[0]!.controls[1]!.nativeProperties = { targetDescription: payload };

    expect(UIImplementationSpecV2Schema.safeParse(poisoned).success).toBe(false);
  });

  it.each([
    ".admin",
    "div .admin",
    ".a > .b",
    "body > span",
    ".admin{cursor:pointer}",
    "@import \"evil.css\"",
    "button:hover",
    "[data-admin]",
    "#app",
    "location.assign(\"/next\")",
    "navigator.sendBeacon(\"/x\")",
    "new Worker(\"worker.js\")",
    "require(\"pkg\")",
    "import(\"pkg\")",
    "article{color:red}",
    "article{cursor:pointer}",
    ".admin {\n color:red;\n}",
    ".admin {\n cursor:pointer;\n}",
    " BODY\n >\n custom-widget ",
    "location?.assign(\"/next\")",
    " WINDOW?.ALERT (\"x\") ",
    "navigator[\"sendBeacon\"](\"/x\")",
    "new (Worker)(\"worker.js\")",
    "function run(){ return 1; }",
    " ASYNC FUNCTION run() {\n return 1;\n} ",
    "async () => 1",
    "(value) => value",
    "body\n>\ncustom-widget {\n cursor: pointer;\n}",
    "article > span",
    ".a,.b{cursor:pointer}",
    "*{cursor:pointer}",
    " BODY\n >\n CUSTOM-WIDGET {\n CURSOR : pointer;\n} ",
    "(api.run())",
    "await api.run()",
    "api.run(\n \"x\"\n)",
    "api.run(other(1))",
    "api?.run?.()",
    "api?.[\"run\"]()",
    "window?.[\"alert\"](\"x\")",
    "location?.[\"assign\"](\"/next\")",
    "navigator?.[\"sendBeacon\"](\"/x\")",
    "return api[\"run\"](\n nested(1)\n)",
    " ReTuRn API.RUN(OTHER(1)) ",
    ".a,.b",
    "#app, .modal",
    "[data-admin], button",
    "article, custom-widget",
    ".a, #b, [data-x]",
    " ARTICLE , SPAN ",
    ".A , #Modal",
    "custom-widget,\nARTICLE",
    "[DATA-ADMIN], BUTTON",
  ])("rejects structurally executable native semantic text %s", (payload) => {
    const poisoned = mutableNativeV2Fixture();
    poisoned.pages[0]!.controls[1]!.nativeProperties = { semanticDescription: payload };

    expect(UIImplementationSpecV2Schema.safeParse(poisoned).success).toBe(false);
  });

  it.each([
    "onLoad",
    "oNlOaD",
    "ON_LOAD",
    "on-load",
    "OnError",
    "ONERROR",
    "ON_ERROR",
    "on_error",
    "onSubmit",
    "onCustomEvent",
    "oNCustomEvent",
    "ONCustomEvent",
    "oncustomEvent",
    "on_custom_event",
    "ON-CHANGE",
  ])("rejects native event-handler field %s after normalized matching", (field) => {
    const poisoned = mutableNativeV2Fixture();
    poisoned.pages[0]!.controls[1]!.nativeProperties = { [field]: "domain value" };

    expect(UIImplementationSpecV2Schema.safeParse(poisoned).success).toBe(false);
  });

  it.each([
    "status(active)",
    "Version(3.6)",
    "status:active",
    "article:hover",
    "设备路径由运维组复核",
    "https://example.com/operations/status",
    "urn:kingfusion:equipment:status",
    "园区/设备/巡检",
    "设备路径：园区/设备/巡检\n当前状态：active",
    "设备说明 {等待现场复核}",
    "Release notes {status active; owner team}",
    "参数范围 {温度：正常；压力：稳定}",
    "状态正常, 等待复核",
    "Status is active, awaiting review",
    "园区A, 园区B, 等待确认",
    "Active, Pending",
    "v1, v2",
    "North, South",
    " ACTIVE , pending ",
    "V1,\nV2",
  ])("accepts bounded native domain text %s", (payload) => {
    const valid = mutableNativeV2Fixture();
    valid.pages[0]!.controls[1]!.nativeProperties = { semanticDescription: payload };

    expect(UIImplementationSpecV2Schema.safeParse(valid).success).toBe(true);
  });

  it.each([
    "onlineStatus",
    "ONLINE_STATUS",
    "onboardingStage",
    "onboarding-stage",
    "onlyPending",
    "ONLY_PENDING",
  ])("preserves explicitly allowed on-prefixed domain field %s", (field) => {
    const valid = mutableNativeV2Fixture();
    valid.pages[0]!.controls[1]!.nativeProperties = { [field]: "active" };

    expect(UIImplementationSpecV2Schema.safeParse(valid).success).toBe(true);
  });

  it.each([
    "StyleDataNew",
    "CONFIGURE_DATA",
    "OnClick",
    "LINK-ID",
    "ObjectType",
    "ui_model_type",
  ])("rejects implementation-owned native field %s after normalized matching", (field) => {
    const poisoned = mutableNativeV2Fixture();
    poisoned.pages[0]!.controls[1]!.nativeProperties = { [field]: "poison" };

    expect(UIImplementationSpecV2Schema.safeParse(poisoned).success).toBe(false);
  });

  it("rejects implementation payloads in a native theme without tightening the v1 adapter theme", () => {
    const native = structuredClone(v2Fixture);
    (native.theme as { background: string }).background = "red;position:fixed";
    expect(UIImplementationSpecV2Schema.safeParse(native).success).toBe(false);

    const legacy = UIImplementationSpecSchema.parse({
      ...v1Fixture,
      theme: { ...v1Fixture.theme, background: "red;position:fixed" },
    });
    expect(UIImplementationSpecV2Schema.safeParse(adaptUiImplementationV1(legacy)).success).toBe(true);
  });

  it("rejects an overwide native semantic record in an otherwise valid v2 envelope", () => {
    const overwide = mutableNativeV2Fixture();
    overwide.pages[0]!.controls[1]!.nativeProperties = Object.fromEntries(
      Array.from({ length: 101 }, (_, index) => [`field${index}`, index]),
    );

    expect(UIImplementationSpecV2Schema.safeParse(overwide).success).toBe(false);
  });

  it("shares one recursive value budget across every field in a native semantic record", () => {
    const overBudget = mutableNativeV2Fixture();
    const sixHundredLeaves = Array.from({ length: 6 }, () => Array.from({ length: 100 }, (_, index) => index));
    overBudget.pages[0]!.controls[1]!.nativeProperties = {
      primaryRecords: sixHundredLeaves,
      secondaryRecords: sixHundredLeaves,
    };

    expect(UIImplementationSpecV2Schema.safeParse(overBudget).success).toBe(false);
  });

  it("accepts a native semantic record within the shared recursive value budget", () => {
    const withinBudget = mutableNativeV2Fixture();
    const fourHundredLeaves = Array.from({ length: 4 }, () => Array.from({ length: 100 }, (_, index) => index));
    withinBudget.pages[0]!.controls[1]!.nativeProperties = {
      primaryRecords: fourHundredLeaves,
      secondaryRecords: fourHundredLeaves,
    };

    expect(UIImplementationSpecV2Schema.safeParse(withinBudget).success).toBe(true);
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

  it("accepts scroll descendants outside the viewport and page only within compiler-owned content extent", () => {
    const fixture = scrollV2Fixture();
    const parsed = UIImplementationSpecV2Schema.parse(fixture);
    const parsedPage = parsed.pages[0]!;
    expect(parsedPage.compatibility).toBe("native");
    if (parsedPage.compatibility !== "native") return;

    expect(parsedPage.height).toBe(300);
    expect(parsedPage.controls[0]!.scrollContentExtent).toEqual({ width: 1_360, height: 326 });
    expect(parsedPage.controls[2]!.geometry.y + parsedPage.controls[2]!.geometry.height)
      .toBeGreaterThan(parsedPage.height);
  });

  it("rejects invalid or misused scroll content extents and out-of-extent descendants", () => {
    const fixture = scrollV2Fixture();
    const page = fixture.pages[0]!;
    const root = page.controls[0]!;

    expect(UIImplementationSpecV2Schema.safeParse({
      ...fixture,
      pages: [{ ...page, controls: [{ ...root, scrollContentExtent: { width: 1_359, height: 326 } }, ...page.controls.slice(1)] }],
    }).success).toBe(false);
    expect(UIImplementationSpecV2Schema.safeParse({
      ...fixture,
      pages: [{ ...page, controls: [{ ...root, capabilityId: "text" }, ...page.controls.slice(1)] }],
    }).success).toBe(false);
    expect(UIImplementationSpecV2Schema.safeParse({
      ...fixture,
      pages: [{ ...page, controls: [{ ...root }] }],
    }).success).toBe(false);
    expect(UIImplementationSpecV2Schema.safeParse({
      ...fixture,
      pages: [{
        ...page,
        controls: page.controls.map((control) => control.id === "scroll-second"
          ? { ...control, geometry: { ...control.geometry, y: 207 } }
          : control),
      }],
    }).success).toBe(false);
    expect(UIImplementationSpecV2Schema.safeParse({
      ...fixture,
      pages: [{
        ...page,
        controls: page.controls.map((control) => control.id === "scroll-second"
          ? { ...control, capabilityId: "layout.4", scrollContentExtent: { width: 1_360, height: 160 } }
          : control),
      }],
    }).success).toBe(false);
    expect(UIImplementationSpecV2Schema.safeParse({
      ...fixture,
      pages: [{
        ...page,
        controls: page.controls.map((control) => control.id === "scroll-leaf"
          ? { ...control, geometry: { ...control.geometry, y: 200 } }
          : control),
      }],
    }).success).toBe(false);
    expect(UIImplementationSpecV2Schema.safeParse({
      ...fixture,
      pages: [{
        ...page,
        controls: page.controls.map((control) => control.id === "scroll-root"
          ? { ...control, geometry: { ...control.geometry, y: 100 } }
          : control),
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

  it("ignores a control base role when style.role overrides the effective compiled role", () => {
    const overridden = structuredClone(v2Fixture);
    (overridden.pages[0]!.controls[1]!.style as { role?: string }).role = "secondary-heading";
    (overridden.compiledRoleStyles.heading.declarations as Record<string, unknown>).advanced = [
      { kind: "background-image", assetId: "role-only-asset" },
    ];

    expect(UIImplementationSpecV2Schema.safeParse(overridden).success).toBe(true);
  });

  it("requires assets declared by controls whose style.role selects the compiled role", () => {
    const overridden = structuredClone(v2Fixture);
    (overridden.pages[0]!.controls[1]!.style as { role?: string }).role = "secondary-heading";
    (overridden.compiledRoleStyles as Record<string, unknown>)["secondary-heading"] = {
      declarations: { advanced: [{ kind: "background-image", assetId: "role-only-asset" }] },
      states: {},
    };

    expect(UIImplementationSpecV2Schema.safeParse(overridden).success).toBe(false);
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
