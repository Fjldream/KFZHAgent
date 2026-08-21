import { describe, expect, it } from "vitest";
import {
  CapabilityCandidateBundleSchema,
  SolutionImplementationPlanSchema,
  canonicalServerHash,
  type SolutionImplementationPlan,
  type UIImplementationSpecV2,
} from "@kf/contracts";
import { createDefaultModuleRegistry } from "../modules/module-registry.js";
import { compileSolutionImplementation } from "../solution-compile/solution-compiler.js";
import { ActionGraphNormalizationError, normalizeActionGraph } from "./action-graph.js";

const validTheme = {
  background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32",
  textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;

function node(id: string, eventBindings: Array<{ semanticEvent: string; actionIds: string[] }> = []) {
  return {
    id,
    kind: "control",
    capabilityId: "button",
    content: "按钮",
    properties: [],
    tabIds: [],
    styleRole: "action",
    eventBindings,
    sourceBlueprintRegionIds: ["region"],
    intent: { purpose: "触发交互", importance: "primary", density: "comfortable", groupWith: [], width: { mode: "fixed", value: 120 }, height: { mode: "fixed", value: 40 }, align: "start" },
  };
}

function plan(overrides: Record<string, unknown> = {}): SolutionImplementationPlan {
  return {
    schema: "kf-solution-implementation/v1",
    projectKey: "demo",
    blueprintHash: "a".repeat(64),
    candidateBundleHash: "b".repeat(64),
    theme: {}, roleStyles: [], mockData: [], localState: [], overlays: [], scripts: [],
    pages: [{
      id: "home", title: "首页", purpose: "演示", canvas: "desktop",
      sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region"], initialStateIds: [],
      root: { ...node("open-button", [{ semanticEvent: "click", actionIds: ["open-detail"] }]) },
    }],
    actions: [
      { id: "open-detail", kind: "show-feedback", level: "info", message: "已打开", afterActionIds: ["populate-detail"] },
      { id: "populate-detail", kind: "set-control-value", targetId: "detail", value: { kind: "literal", value: "记录" }, afterActionIds: [] },
    ],
    ...overrides,
  } as unknown as SolutionImplementationPlan;
}

function implementation(extraControls: Array<Record<string, unknown>> = []): UIImplementationSpecV2 {
  const controls: Array<Record<string, unknown> & { id: string }> = [
    { id: "open-button", capabilityId: "button", sourceSolutionNodeId: "open-button" },
    { id: "detail", capabilityId: "input", sourceSolutionNodeId: "detail" },
    ...extraControls.map((control) => control as Record<string, unknown> & { id: string }),
  ].map((control) => ({
    role: "action", depth: 0, zIndex: 0, geometry: { x: 0, y: 0, width: 120, height: 40 },
    nativeProperties: {}, sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region"], eventBindings: [],
    ...control,
  }));
  return {
    schema: "kf-ui-implementation/v2", compatibility: "native", theme: validTheme, compiledRoleStyles: {},
    pages: [{ compatibility: "native", id: "home", width: 1280, height: 720, sourceBlueprintPageId: "bp-home", controls }],
    compiledActions: [], compiledScripts: [],
    runtimeCorrelation: {
      controls: controls.map((control, index) => ({ semanticControlId: control.id, instanceName: index === 0 ? "Button1" : `Input${index}` })),
      pages: [{ semanticPageId: "home", pageGuid: "00000000-0000-4000-8000-000000000001" }],
    },
  } as unknown as UIImplementationSpecV2;
}

describe("normalizeActionGraph", () => {
  it("projects ActionPlan conditions/effects and orders action→afterAction successors", () => {
    const result = normalizeActionGraph({ plan: plan(), implementation: implementation() });
    expect(result.executionOrder).toEqual(["open-detail", "populate-detail"]);
    expect(result.graph.actions).toMatchObject([
      { id: "open-detail", trigger: { controlId: "open-button", semanticEvent: "click" }, effects: [{ kind: "show-feedback" }] },
      { id: "populate-detail", trigger: { controlId: "open-button", semanticEvent: "click" }, effects: [{ kind: "set-control-value", targetId: "detail" }] },
    ]);
  });

  it("uses code-point ordering for independent roots regardless of source order", () => {
    const ordered = plan({
      actions: [
        { id: "action-b", kind: "show-feedback", level: "info", message: "B", afterActionIds: [] },
        { id: "action-a", kind: "show-feedback", level: "info", message: "A", afterActionIds: [] },
      ],
      pages: [{
        id: "home", title: "首页", purpose: "演示", canvas: "desktop", sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region"], initialStateIds: [],
        root: node("open-button", [{ semanticEvent: "click", actionIds: ["action-b", "action-a"] }]),
      }],
    });
    expect(normalizeActionGraph({ plan: ordered, implementation: implementation() }).executionOrder).toEqual(["action-a", "action-b"]);
  });

  it("rejects multiple trigger owners, cycles, and orphan actions with stable node errors", () => {
    const multi = plan();
    multi.pages[0]!.root = {
      ...multi.pages[0]!.root,
      kind: "layout", layout: "row",
      children: [
        node("open-button", [{ semanticEvent: "click", actionIds: ["open-detail"] }]),
        node("other-button", [{ semanticEvent: "click", actionIds: ["populate-detail"] }]),
      ],
    } as never;
    expect(() => normalizeActionGraph({ plan: multi, implementation: implementation([{ id: "other-button", capabilityId: "button", sourceSolutionNodeId: "other-button" }]) }))
      .toThrowError(expect.objectContaining({ code: "ACTION_TRIGGER_OWNERSHIP_MISMATCH", nodeId: "populate-detail" }));

    const cycle = plan();
    cycle.actions[1]!.afterActionIds = ["open-detail"];
    expect(() => normalizeActionGraph({ plan: cycle, implementation: implementation() }))
      .toThrowError(expect.objectContaining({ code: "ACTION_DEPENDENCY_CYCLE" }));

    const orphan = plan();
    orphan.actions.push({ id: "orphan", kind: "show-feedback", level: "info", message: "孤立", afterActionIds: [] });
    expect(() => normalizeActionGraph({ plan: orphan, implementation: implementation() }))
      .toThrowError(expect.objectContaining({ code: "ACTION_TRIGGER_MISSING", nodeId: "orphan" }));
  });

  it("maps a module binding only when it has one compiled runtime owner", () => {
    const modulePlan = plan({
      pages: [{
        id: "home", title: "首页", purpose: "演示", canvas: "desktop", sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region"], initialStateIds: [],
        root: { ...node("toolbar", [{ semanticEvent: "click", actionIds: ["open-detail"] }]), kind: "registered-module", moduleKind: "action.toolbar", templateVersion: "1.0.0", variant: "default", title: "工具栏", content: "工具栏", slots: [] },
      }],
    });
    const ambiguous = implementation([
      { id: "toolbar--first", sourceSolutionNodeId: "toolbar", sourceModuleId: "toolbar", capabilityId: "button" },
      { id: "toolbar--second", sourceSolutionNodeId: "toolbar", sourceModuleId: "toolbar", capabilityId: "button" },
    ]);
    expect(() => normalizeActionGraph({ plan: modulePlan, implementation: ambiguous }))
      .toThrowError(expect.objectContaining({ code: "ACTION_TRIGGER_RUNTIME_AMBIGUOUS", nodeId: "toolbar" }));

    const unique = implementation([{ id: "toolbar--only", sourceSolutionNodeId: "toolbar", sourceModuleId: "toolbar", capabilityId: "button" }]);
    const uniquePage = unique.pages[0]!;
    if (uniquePage.compatibility !== "native") throw new Error("native fixture required");
    uniquePage.controls = uniquePage.controls.filter((control) => control.id !== "open-button");
    unique.runtimeCorrelation!.controls = unique.runtimeCorrelation!.controls.filter((entry) => entry.semanticControlId !== "open-button");
    expect(normalizeActionGraph({ plan: modulePlan, implementation: unique }).graph.actions[0]!.trigger.controlId).toBe("toolbar--only");
  });

  it("marks run-script closure as unverified even with declared output candidates", () => {
    const scripted = plan({
      actions: [{ id: "filter", kind: "run-script", scriptId: "filter-script", afterActionIds: [] }],
      scripts: [{ id: "filter-script", kind: "template", template: "multi-filter", purpose: "筛选", inputs: [], outputs: [{ name: "filtered", description: "筛选结果", refKind: "control", refId: "detail" }], parameters: [] }],
      pages: [{
        id: "home", title: "首页", purpose: "演示", canvas: "desktop", sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region"], initialStateIds: [],
        root: node("open-button", [{ semanticEvent: "change", actionIds: ["filter"] }]),
      }],
    });
    const result = normalizeActionGraph({ plan: scripted, implementation: implementation() });
    expect(result.scriptClosures.get("filter-script")).toMatchObject({ status: "unverified", candidateOutputRefs: [{ refKind: "control", refId: "detail" }] });

    scripted.scripts.push({ id: "unused-script", kind: "template", template: "reset-controls", purpose: "重置", inputs: [], outputs: [], parameters: [] });
    expect(() => normalizeActionGraph({ plan: scripted, implementation: implementation() }))
      .toThrowError(expect.objectContaining({ code: "ACTION_SCRIPT_ORPHANED", nodeId: "unused-script" }));
  });

  it("wraps hostile descriptor input instead of leaking raw runtime errors", () => {
    const hostile = new Proxy(plan(), { ownKeys() { throw new Error("trap"); } });
    expect(() => normalizeActionGraph({ plan: hostile, implementation: implementation() }))
      .toThrowError(expect.objectContaining({ code: "ACTION_INPUT_INVALID" } satisfies Partial<ActionGraphNormalizationError>));
  });

  it("wraps canonical graph reference failures as stable normalization errors", () => {
    const invalid = plan({
      actions: [{ id: "open-detail", kind: "set-visibility", targetId: "missing", visible: true, afterActionIds: [] }],
    });
    expect(() => normalizeActionGraph({ plan: invalid, implementation: implementation() }))
      .toThrowError(expect.objectContaining({ code: "ACTION_INPUT_INVALID", nodeId: "open-detail" }));
  });

  it("authoritatively parses typed-cast implementations and rejects correlation aliases", () => {
    const invalid = implementation() as unknown as Record<string, unknown>;
    invalid["rogueRuntimeField"] = true;
    expect(() => normalizeActionGraph({ plan: plan(), implementation: invalid }))
      .toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID", nodeId: "implementation" }));

    const aliased = implementation([{ id: "alias-control", capabilityId: "text", sourceSolutionNodeId: "alias-control" }]);
    aliased.runtimeCorrelation!.controls.find((entry) => entry.semanticControlId === "alias-control")!.instanceName = "button1";
    expect(() => normalizeActionGraph({ plan: plan(), implementation: aliased }))
      .toThrowError(expect.objectContaining({ code: "ACTION_RUNTIME_CORRELATION_ALIAS", nodeId: "alias-control" }));

    const duplicateIdentity = implementation([{ id: "open-button", capabilityId: "button", sourceSolutionNodeId: "duplicate" }]);
    expect(() => normalizeActionGraph({ plan: plan(), implementation: duplicateIdentity }))
      .toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID", nodeId: "implementation" }));

    const extraPage = implementation();
    const home = extraPage.pages[0]!;
    if (home.compatibility !== "native") throw new Error("native fixture required");
    extraPage.pages.push({
      compatibility: "native", id: "rogue-page", width: 1280, height: 720, sourceBlueprintPageId: "bp-rogue",
      controls: [{
        ...home.controls[1]!, id: "rogue-control", sourceSolutionNodeId: "rogue-control",
        sourceBlueprintPageId: "bp-rogue",
      }],
    });
    extraPage.runtimeCorrelation!.controls.push({ semanticControlId: "rogue-control", instanceName: "Input9" });
    extraPage.runtimeCorrelation!.pages.push({ semanticPageId: "rogue-page", pageGuid: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" });
    expect(() => normalizeActionGraph({ plan: plan(), implementation: extraPage }))
      .toThrowError(expect.objectContaining({ code: "ACTION_RUNTIME_CORRELATION_EXTRA", nodeId: "rogue-page" }));
  });

  it("accepts a real Phase3 implementation after compiler-owned correlation is attached", () => {
    const sourcePages = [{ pageId: "bp-home", regions: ["main"] }] as const;
    const blueprintHash = canonicalServerHash({ projectKey: "phase3-positive", sourcePages });
    const ranked = (id: string) => ({ id, score: 100, reasons: ["reviewed fixture"], limitations: [], knowledgeVersion: "1.0.0" });
    const bundle = CapabilityCandidateBundleSchema.parse({
      schema: "kf-capability-candidates/v1", knowledgeCatalogVersion: "1.0.0", blueprintHash,
      regions: [{
        pageId: "bp-home", regionId: "main",
        controls: [ranked("button"), ranked("text"), ranked("input")],
        layouts: [ranked("layout.2")], recipes: [ranked("portal-composition")],
      }],
      detailedCapabilityIds: ["button", "input", "layout.2", "text"], generatedAtPolicy: "deterministic-no-timestamp",
    });
    const compiledPlan = SolutionImplementationPlanSchema.parse({
      schema: "kf-solution-implementation/v1", projectKey: "phase3-positive", blueprintHash,
      candidateBundleHash: canonicalServerHash(bundle), theme: validTheme,
      roleStyles: [{ role: "action", declarations: { backgroundColor: "{theme.primary}" }, states: {} }],
      mockData: [], localState: [], overlays: [], scripts: [],
      pages: [{
        id: "home", title: "首页", purpose: "验证 Phase3 产物", canvas: "desktop",
        sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["main"], initialStateIds: [],
        root: {
          kind: "control", id: "go", sourceBlueprintRegionIds: ["main"],
          intent: {
            importance: "primary", visualWeight: 5, readingOrder: 0, density: "comfortable",
            groupWith: [], width: { mode: "content" }, height: { mode: "content" }, align: "stretch",
          },
          capabilityId: "button", content: "进入", properties: [], tabIds: [], styleRole: "action",
          eventBindings: [{ semanticEvent: "click", actionIds: ["stay"] }],
        },
      }],
      actions: [{ id: "stay", kind: "navigate-page", targetPageId: "home", afterActionIds: [] }],
    });
    const phase3 = structuredClone(compileSolutionImplementation({
      plan: compiledPlan, candidateBundle: bundle, moduleRegistry: createDefaultModuleRegistry(),
      approvedAssets: [], activeCatalogVersion: "1.0.0",
    }));
    const nativePage = phase3.pages[0];
    if (nativePage?.compatibility !== "native") throw new Error("native Phase3 fixture required");
    phase3.runtimeCorrelation = {
      controls: nativePage.controls.map((control, index) => ({ semanticControlId: control.id, instanceName: `Button${index + 1}` })),
      pages: [{ semanticPageId: nativePage.id, pageGuid: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" }],
    };

    expect(normalizeActionGraph({ plan: compiledPlan, implementation: phase3 }).graph.actions)
      .toEqual([expect.objectContaining({ id: "stay", trigger: { controlId: "go", semanticEvent: "click" } })]);
  });
});
