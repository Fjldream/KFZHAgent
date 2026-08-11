import { describe, expect, it } from "vitest";
import { ModuleInteractionSchema, ModulePlanOperationSchema, ModulePlanSchema } from "./module-plan.js";

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
  templateVersion: "1.0.0",
  variant: "default",
  title: "欢迎使用门户",
  placement: {
    region: "main",
    order: 0,
    columnSpan: 12,
    preferredHeight: "large",
    alignment: "start",
    emphasis: "primary",
  },
  interactions: [{ type: "navigate", pageId: "home" }],
  assetId: "brand-mark",
} as const;

const announcement = {
  id: "announcement",
  kind: "notice",
  templateVersion: "1.0.0",
  variant: "default",
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
  operations: [],
} as const;

describe("ModulePlanSchema", () => {
  it("accepts a vertical-flow portal with declaration-only placement", () => {
    expect(ModulePlanSchema.parse(validPlan).schema).toBe("kf-module-plan/v1");
  });

  it("accepts registered dot-separated module namespaces but not malformed kind paths", () => {
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      pages: [{ ...validPlan.pages[0], modules: [{ ...hero, kind: "content.hero" }] }],
    }).success).toBe(true);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      pages: [{ ...validPlan.pages[0], modules: [{ ...hero, kind: "content..hero" }] }],
    }).success).toBe(false);
  });

  it("requires each persisted module to pin an exact template version and variant", () => {
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      pages: [{ ...validPlan.pages[0], modules: [{ ...hero, templateVersion: undefined }] }],
    }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      pages: [{ ...validPlan.pages[0], modules: [{ ...hero, variant: undefined }] }],
    }).success).toBe(false);
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
    }).success).toBe(true);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      operations: [
        { op: "add", pageId: "home", module: announcement },
        { op: "add", pageId: "home", module: announcement },
      ],
    }).success).toBe(false);
  });

  it("treats pages as the final snapshot and requires add payload to match it exactly", () => {
    const finalPlan = {
      ...validPlan,
      pages: [{ ...validPlan.pages[0], modules: [hero, announcement] }],
      operations: [{ op: "add", pageId: "home", module: announcement }],
    };
    expect(ModulePlanSchema.safeParse(finalPlan).success).toBe(true);
    expect(ModulePlanSchema.safeParse({
      ...finalPlan,
      operations: [{ op: "add", pageId: "home", module: { ...announcement, title: "different" } }],
    }).success).toBe(false);
  });

  it("allows an update operation to explicitly clear an optional asset binding", () => {
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      operations: [{ op: "update", pageId: "home", moduleId: "hero", changes: { assetId: null } }],
    }).success).toBe(true);
  });

  it("rejects GUID-shaped ids and executable model-authored module text", () => {
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      pages: [{ ...validPlan.pages[0], modules: [{ ...hero, id: "a0b1c2d3-e4f5-6789-abcd-ef0123456789" }] }],
    }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      pages: [{ ...validPlan.pages[0], modules: [{ ...hero, title: "<script>alert(1)</script>" }] }],
    }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      pages: [{ ...validPlan.pages[0], modules: [{ ...hero, content: "data:text/html,<h1>x</h1>" }] }],
    }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      pages: [{ ...validPlan.pages[0], modules: [{ ...hero, content: "JSON {\"layout\": \"CSS grid\"}" }] }],
    }).success).toBe(true);
  });

  it("requires registered interaction targets to exist in their domain", () => {
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      pages: [{ ...validPlan.pages[0], modules: [{ ...hero, interactions: [{ type: "navigate", pageId: "missing-page" }] }] }],
    }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      pages: [{ ...validPlan.pages[0], modules: [{ ...hero, interactions: [{ type: "scroll", moduleId: "missing-module" }] }] }],
    }).success).toBe(false);
    expect(ModuleInteractionSchema.safeParse({
      type: "navigate",
      target: "anything",
    }).success).toBe(false);
  });

  it("validates interaction references introduced by an update operation", () => {
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      operations: [{
        op: "update",
        pageId: "home",
        moduleId: "hero",
        changes: { interactions: [{ type: "navigate", pageId: "missing-page" }] },
      }],
    }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      operations: [{
        op: "update",
        pageId: "home",
        moduleId: "hero",
        changes: {
          interactions: [
            { type: "navigate", pageId: "home" },
            { type: "scroll", moduleId: "hero" },
            { type: "open-modal", moduleId: "hero" },
          ],
        },
      }],
    }).success).toBe(true);
  });

  it("keeps template identity attached to a module update and changes variants explicitly", () => {
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      operations: [{
        op: "update",
        pageId: "home",
        moduleId: "hero",
        changes: { kind: "notice" },
      }],
    }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      operations: [{
        op: "update",
        pageId: "home",
        moduleId: "hero",
        changes: { templateVersion: "2.0.0" },
      }],
    }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      operations: [{
        op: "update",
        pageId: "home",
        moduleId: "hero",
        changes: { variant: "compact" },
      }],
    }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      operations: [{
        op: "changeVariant",
        pageId: "home",
        moduleId: "hero",
        templateVersion: "1.0.0",
        variant: "compact",
      }],
    }).success).toBe(true);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      operations: [{
        op: "changeVariant",
        pageId: "home",
        moduleId: "hero",
        templateVersion: "2.0.0",
        variant: "compact",
      }],
    }).success).toBe(false);
  });

  it("keeps legacy v1 submit, filter, and toggle interactions registered and safe", () => {
    expect(ModuleInteractionSchema.safeParse({ type: "submit", action: "save-profile" }).success).toBe(true);
    expect(ModuleInteractionSchema.safeParse({ type: "filter", field: "status" }).success).toBe(true);
    expect(ModuleInteractionSchema.safeParse({ type: "toggle", target: "hero" }).success).toBe(true);
    expect(ModuleInteractionSchema.safeParse({ type: "submit", action: "a0b1c2d3-e4f5-6789-abcd-ef0123456789" }).success).toBe(false);
    expect(ModuleInteractionSchema.safeParse({ type: "filter", field: "javascript:alert(1)" }).success).toBe(false);
    expect(ModulePlanSchema.safeParse({
      ...validPlan,
      pages: [{ ...validPlan.pages[0], modules: [{ ...hero, interactions: [{ type: "toggle", target: "missing-module" }] }] }],
    }).success).toBe(false);
  });

  it("processes remove operations before later module operations", () => {
    for (const operation of [
      { op: "update", pageId: "home", moduleId: "hero", changes: { title: "更新" } },
      { op: "move", pageId: "home", moduleId: "hero", placement: announcement.placement },
      { op: "resize", pageId: "home", moduleId: "hero", columnSpan: 6, preferredHeight: "medium" },
      { op: "remove", pageId: "home", moduleId: "hero" },
    ]) {
      expect(ModulePlanSchema.safeParse({
        ...validPlan,
        operations: [{ op: "remove", pageId: "home", moduleId: "hero" }, operation],
      }).success).toBe(false);
    }
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
    expect(ModulePlanOperationSchema.safeParse({ type: "navigate", target: "anything" }).success).toBe(false);
  });
});
