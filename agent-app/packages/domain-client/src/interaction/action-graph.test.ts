import { describe, expect, it } from "vitest";
import type { SolutionImplementationPlan, UIImplementationSpecV2 } from "@kf/contracts";
import { ActionGraphNormalizationError, normalizeActionGraph } from "./action-graph.js";

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
    schema: "kf-ui-implementation/v2", compatibility: "native", theme: {} as never, compiledRoleStyles: {},
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
});
