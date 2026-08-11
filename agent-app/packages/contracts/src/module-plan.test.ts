import { describe, expect, it } from "vitest";
import { ModulePlanOperationSchema, ModulePlanSchema } from "./module-plan.js";

const theme = {
  background: "#ffffff",
  surface: "#f8fafc",
  primary: "#0f172a",
  accent: "#0ea5e9",
  textPrimary: "#0f172a",
  textSecondary: "#475569",
  fontFamily: "Inter",
  spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 12 },
} as const;

const hero = {
  id: "hero",
  kind: "hero",
  title: "欢迎使用门户",
  placement: {
    region: "main",
    order: 0,
    columnSpan: 12,
    preferredHeight: "large",
    alignment: "start",
    emphasis: "primary",
  },
  interactions: [{ type: "navigate", target: "projects" }],
  assetId: "brand-mark",
} as const;

const announcement = {
  id: "announcement",
  kind: "notice",
  title: "本周更新",
  placement: {
    region: "main",
    order: 1,
    columnSpan: 12,
    preferredHeight: "small",
    alignment: "stretch",
    emphasis: "secondary",
  },
  interactions: [],
} as const;

const validPlan = {
  schema: "kf-module-plan/v1",
  projectKey: "portal-demo",
  theme,
  assets: [
    {
      id: "brand-mark",
      kind: "image",
      name: "品牌标识",
      mimeType: "image/svg+xml",
      description: "门户页头使用的品牌标识",
    },
  ],
  pages: [
    {
      id: "home",
      title: "首页",
      mode: "vertical-flow",
      modules: [hero],
    },
  ],
  operations: [{ op: "add", pageId: "home", module: announcement }],
} as const;

describe("ModulePlanSchema", () => {
  it("accepts a vertical-flow portal with declaration-only placement", () => {
    expect(ModulePlanSchema.parse(validPlan).schema).toBe("kf-module-plan/v1");
  });

  it("rejects duplicate page and module ids", () => {
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      pages: [validPlan.pages[0], { ...validPlan.pages[0], id: "home" }],
    }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      pages: [{ ...validPlan.pages[0], modules: [{ ...hero, id: "hero" }, { ...hero, id: "hero" }] }],
    }).success).toBe(false);
  });

  it("rejects unregistered keys and implementation escape hatches", () => {
    expect(ModulePlanSchema.safeParse({ ...validPlan, css: "*{}" }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      pages: [{ ...validPlan.pages[0], modules: [{ ...hero, css: "*{}" }] }],
    }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      pages: [{ ...validPlan.pages[0], modules: [{ ...hero, coordinates: { x: 0, y: 0 } }] }],
    }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({ ...validPlan, path: "/tmp/portal" }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({ ...validPlan, storageKey: "assets/brand" }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({ ...validPlan, script: "alert(1)" }).success).toBe(false);
  });

  it("rejects modules whose assets are not registered in the plan", () => {
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      pages: [{ ...validPlan.pages[0], modules: [{ ...hero, assetId: "missing" }] }],
    }).success).toBe(false);
  });

  it("rejects add operations that duplicate an existing or added module id", () => {
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      operations: [{ op: "add", pageId: "home", module: hero }],
    }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      operations: [
        validPlan.operations[0],
        { op: "add", pageId: "home", module: announcement },
      ],
    }).success).toBe(false);
  });
});

describe("ModulePlanOperationSchema", () => {
  it("accepts only registered declaration-level operations", () => {
    expect(ModulePlanOperationSchema.safeParse({
      op: "move",
      pageId: "home",
      moduleId: "hero",
      placement: { region: "sidebar", order: 1, columnSpan: 4, preferredHeight: "medium", alignment: "stretch", emphasis: "secondary" },
    }).success).toBe(true);
    expect(ModulePlanOperationSchema.safeParse({ op: "move", pageId: "home", moduleId: "hero", x: 0, y: 0 }).success).toBe(false);
  });
});
