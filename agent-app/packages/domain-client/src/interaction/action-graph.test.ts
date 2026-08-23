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
import {
  ActionGraphNormalizationError,
  normalizeActionGraph,
  type NormalizeActionGraphInput,
} from "./action-graph.js";

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
      { id: "open-detail", kind: "show-feedback", level: "info", message: "已打开", afterActionIds: ["populate-detail"], journeyStepRefs: [{ journeyId: "review-home", stepIndex: 0 }] },
      { id: "populate-detail", kind: "set-control-value", targetId: "detail", value: { kind: "literal", value: "记录" }, afterActionIds: [], journeyStepRefs: [{ journeyId: "review-home", stepIndex: 0 }] },
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
        { id: "action-b", kind: "show-feedback", level: "info", message: "B", afterActionIds: [], journeyStepRefs: [{ journeyId: "review-home", stepIndex: 0 }] },
        { id: "action-a", kind: "show-feedback", level: "info", message: "A", afterActionIds: [], journeyStepRefs: [{ journeyId: "review-home", stepIndex: 0 }] },
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
    orphan.actions.push({ id: "orphan", kind: "show-feedback", level: "info", message: "孤立", afterActionIds: [], journeyStepRefs: [{ journeyId: "review-home", stepIndex: 0 }] });
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
      actions: [{ id: "filter", kind: "run-script", scriptId: "filter-script", afterActionIds: [], journeyStepRefs: [{ journeyId: "review-home", stepIndex: 0 }] }],
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

  it("rejects accessors and proxy traps without invoking getters", () => {
    let topLevelGetterCalls = 0;
    const topLevelAccessor = { plan: plan() } as { plan: SolutionImplementationPlan; implementation?: UIImplementationSpecV2 };
    Object.defineProperty(topLevelAccessor, "implementation", {
      enumerable: true,
      get() { topLevelGetterCalls += 1; return implementation(); },
    });
    expect(() => normalizeActionGraph(topLevelAccessor as NormalizeActionGraphInput))
      .toThrowError(expect.objectContaining({ code: "ACTION_INPUT_INVALID", nodeId: "input" }));
    expect(topLevelGetterCalls).toBe(0);

    let implementationGetterCalls = 0;
    const accessorImplementation = implementation();
    const nativePage = accessorImplementation.pages[0]!;
    if (nativePage.compatibility !== "native") throw new Error("native fixture required");
    Object.defineProperty(nativePage.controls[0]!, "capabilityId", {
      enumerable: true,
      get() { implementationGetterCalls += 1; return "button"; },
    });
    expect(() => normalizeActionGraph({ plan: plan(), implementation: accessorImplementation }))
      .toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID", nodeId: "implementation" }));
    expect(implementationGetterCalls).toBe(0);

    let planGetterCalls = 0;
    const accessorPlan = plan();
    Object.defineProperty(accessorPlan.pages[0]!, "title", {
      enumerable: true,
      get() { planGetterCalls += 1; return "首页"; },
    });
    expect(() => normalizeActionGraph({ plan: accessorPlan, implementation: implementation() }))
      .toThrowError(expect.objectContaining({ code: "ACTION_INPUT_INVALID" }));
    expect(planGetterCalls).toBe(0);

    const trappedImplementation = new Proxy(implementation(), { getOwnPropertyDescriptor() { throw new Error("trap"); } });
    expect(() => normalizeActionGraph({ plan: plan(), implementation: trappedImplementation }))
      .toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID" }));

    const trappedPrototype = new Proxy(implementation(), { getPrototypeOf() { throw new Error("trap"); } });
    expect(() => normalizeActionGraph({ plan: plan(), implementation: trappedPrototype }))
      .toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID" }));
  });

  it("rejects non-pure implementation graphs before schema parsing", () => {
    const sparse = implementation();
    sparse.pages = new Array(1);
    expect(() => normalizeActionGraph({ plan: plan(), implementation: sparse }))
      .toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID" }));

    const cyclic = implementation() as UIImplementationSpecV2 & { self?: unknown };
    cyclic.self = cyclic;
    expect(() => normalizeActionGraph({ plan: plan(), implementation: cyclic }))
      .toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID" }));

    const dated = implementation() as UIImplementationSpecV2 & { generatedAt?: unknown };
    dated.generatedAt = new Date(0);
    expect(() => normalizeActionGraph({ plan: plan(), implementation: dated }))
      .toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID" }));

    const symbolic = implementation() as UIImplementationSpecV2 & { [key: symbol]: unknown };
    symbolic[Symbol("hidden")] = true;
    expect(() => normalizeActionGraph({ plan: plan(), implementation: symbolic }))
      .toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID" }));

    const nullPrototype = implementation();
    nullPrototype.compiledRoleStyles = Object.create(null) as UIImplementationSpecV2["compiledRoleStyles"];
    expect(normalizeActionGraph({ plan: plan(), implementation: nullPrototype }).graph.actions).toHaveLength(2);
  });

  it("enforces depth, node, array, and object budgets at their boundaries", () => {
    const failure = (value: unknown): ActionGraphNormalizationError => {
      const probed = implementation() as UIImplementationSpecV2 & { budgetProbe?: unknown };
      probed.budgetProbe = value;
      try {
        normalizeActionGraph({ plan: plan(), implementation: probed });
      } catch (error) {
        if (error instanceof ActionGraphNormalizationError) return error;
        throw error;
      }
      throw new Error("budget fixture must fail strict UI parsing");
    };
    const denseArrayBoundary = Array.from({ length: 10_000 }, () => null);
    expect(failure(denseArrayBoundary)).toMatchObject({ code: "ACTION_IMPLEMENTATION_INVALID" });
    expect(failure(new Array(10_001).fill(null)).message).toContain("input array budget exceeds 10000");

    const objectBoundary = Object.fromEntries(Array.from({ length: 1_000 }, (_, index) => [`k${index}`, null]));
    expect(failure(objectBoundary)).toMatchObject({ code: "ACTION_IMPLEMENTATION_INVALID" });
    const objectOverflow = { ...objectBoundary, overflow: null };
    expect(failure(objectOverflow).message).toContain("input object budget exceeds 1000");

    const nested = (objectCount: number): unknown => {
      let value: unknown = null;
      for (let index = 0; index < objectCount; index += 1) value = { value };
      return value;
    };
    expect(failure(nested(127))).toMatchObject({ code: "ACTION_IMPLEMENTATION_INVALID" });
    expect(failure(nested(128)).message).toContain("input depth exceeds 128");

    const nodeProbe = (arrayCount: number) => Object.fromEntries(Array.from(
      { length: arrayCount }, (_, index) => [`a${index}`, new Array(9_999).fill(null)],
    ));
    expect(failure(nodeProbe(24))).toMatchObject({ code: "ACTION_IMPLEMENTATION_INVALID" });
    expect(failure(nodeProbe(26)).message).toContain("input node budget exceeds 250000");
  });

  it("wraps canonical graph reference failures as stable normalization errors", () => {
    const invalid = plan({
      actions: [{ id: "open-detail", kind: "set-visibility", targetId: "missing", visible: true, afterActionIds: [], journeyStepRefs: [{ journeyId: "review-home", stepIndex: 0 }] }],
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
      .toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID", nodeId: "open-button" }));

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

  it("maps authoritative implementation schema failures to stable semantic node ids", () => {
    const correlationControl = implementation();
    correlationControl.runtimeCorrelation!.controls[0]!.instanceName = "invalid";
    expect(() => normalizeActionGraph({ plan: plan(), implementation: correlationControl }))
      .toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID", nodeId: "open-button" }));

    const correlationPage = implementation();
    correlationPage.runtimeCorrelation!.pages[0]!.pageGuid = "invalid";
    expect(() => normalizeActionGraph({ plan: plan(), implementation: correlationPage }))
      .toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID", nodeId: "home" }));

    const page = implementation();
    page.pages[0]!.width = -1;
    expect(() => normalizeActionGraph({ plan: plan(), implementation: page }))
      .toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID", nodeId: "home" }));

    const control = implementation();
    if (control.pages[0]!.compatibility !== "native") throw new Error("native fixture required");
    control.pages[0]!.controls[0]!.capabilityId = "";
    expect(() => normalizeActionGraph({ plan: plan(), implementation: control }))
      .toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID", nodeId: "open-button" }));

    const invalidCorrelationId = implementation();
    invalidCorrelationId.runtimeCorrelation!.controls[0]!.semanticControlId = "";
    expect(() => normalizeActionGraph({ plan: plan(), implementation: invalidCorrelationId }))
      .toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID", nodeId: "runtimeCorrelation.controls[0]" }));
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
      actions: [{ id: "stay", kind: "navigate-page", targetPageId: "home", afterActionIds: [], journeyStepRefs: [{ journeyId: "review-home", stepIndex: 0 }] }],
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
    const pending: object[] = [compiledPlan, phase3];
    const seen = new WeakSet<object>();
    while (pending.length > 0) {
      const value = pending.pop()!;
      if (seen.has(value)) continue;
      seen.add(value);
      Object.values(value).forEach((child) => {
        if (child !== null && typeof child === "object") pending.push(child);
      });
      Object.freeze(value);
    }

    expect(normalizeActionGraph({ plan: compiledPlan, implementation: phase3 }).graph.actions)
      .toEqual([expect.objectContaining({ id: "stay", trigger: { controlId: "go", semanticEvent: "click" } })]);
  });
});
