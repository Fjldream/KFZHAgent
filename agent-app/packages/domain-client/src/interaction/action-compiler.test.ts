import { afterEach, describe, expect, it, vi } from "vitest";
import type { SolutionImplementationPlan, UIImplementationSpecV2 } from "@kf/contracts";
import { compileAction } from "../compile/control-compiler.js";

function fixture() {
  const plan = {
    schema: "kf-solution-implementation/v1", projectKey: "demo", blueprintHash: "a".repeat(64), candidateBundleHash: "b".repeat(64),
    theme: {}, roleStyles: [], mockData: [], localState: [], overlays: [],
    pages: [
      { id: "home", title: "首页", purpose: "首页", canvas: "desktop", sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region"], initialStateIds: [], root: {
        id: "go", kind: "control", capabilityId: "button", content: "打开", properties: [], tabIds: [], styleRole: "action", sourceBlueprintRegionIds: ["region"],
        intent: { purpose: "导航", importance: "primary", density: "comfortable", groupWith: [], width: { mode: "fixed", value: 120 }, height: { mode: "fixed", value: 40 }, align: "start" },
        eventBindings: [{ semanticEvent: "click", actionIds: ["navigate"] }],
      }},
      { id: "detail-page", title: "详情", purpose: "详情", canvas: "desktop", sourceBlueprintPageId: "bp-detail", sourceBlueprintRegionIds: ["detail-region"], initialStateIds: [], root: {
        id: "detail", kind: "control", capabilityId: "text", content: "详情", properties: [], tabIds: [], styleRole: "body", sourceBlueprintRegionIds: ["detail-region"],
        intent: { purpose: "详情", importance: "secondary", density: "comfortable", groupWith: [], width: { mode: "fixed", value: 120 }, height: { mode: "fixed", value: 40 }, align: "start" }, eventBindings: [],
      }},
    ],
    actions: [{ id: "navigate", kind: "navigate-page", targetPageId: "detail-page", afterActionIds: [] }], scripts: [],
  } as unknown as SolutionImplementationPlan;
  const implementation = {
    schema: "kf-ui-implementation/v2", compatibility: "native", theme: {}, compiledRoleStyles: {}, compiledActions: [], compiledScripts: [],
    pages: [
      { compatibility: "native", id: "home", width: 1280, height: 720, sourceBlueprintPageId: "bp-home", controls: [{ id: "go", role: "action", capabilityId: "button", depth: 0, zIndex: 0, geometry: { x: 0, y: 0, width: 120, height: 40 }, nativeProperties: {}, sourceSolutionNodeId: "go", sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region"], eventBindings: [] }] },
      { compatibility: "native", id: "detail-page", width: 1280, height: 720, sourceBlueprintPageId: "bp-detail", controls: [{ id: "detail", role: "body", capabilityId: "text", depth: 0, zIndex: 0, geometry: { x: 0, y: 0, width: 120, height: 40 }, nativeProperties: {}, sourceSolutionNodeId: "detail", sourceBlueprintPageId: "bp-detail", sourceBlueprintRegionIds: ["detail-region"], eventBindings: [] }] },
    ],
    runtimeCorrelation: {
      controls: [{ semanticControlId: "go", instanceName: "Button1" }, { semanticControlId: "detail", instanceName: "Text1" }],
      pages: [{ semanticPageId: "home", pageGuid: "00000000-0000-4000-8000-000000000001" }, { semanticPageId: "detail-page", pageGuid: "00000000-0000-4000-8000-000000000002" }],
    },
  } as unknown as UIImplementationSpecV2;
  return { plan, implementation };
}

afterEach(() => {
  vi.doUnmock("../design-knowledge/script-capability-registry.js");
  vi.resetModules();
});

describe("compileNativeActions", () => {
  it("uses the trusted production registry and degrades unsupported trigger evidence to a source-free typed request", async () => {
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    const result = compileNativeActions({ normalized: normalizeActionGraph(data), implementation: data.implementation });
    expect(result.actions).toEqual([]);
    expect(result.bindings).toEqual([]);
    expect(result.scriptRequests).toEqual([expect.objectContaining({
      actionId: "navigate", requestedTier: "custom-script", reason: "TRIGGER_EVENT_UNSUPPORTED", ownerControlId: "go",
    })]);
    expect(JSON.stringify(result.scriptRequests)).not.toMatch(/source|javascript|Button1|00000000-/i);
  });

  it("compiles navigation only when the trusted registry reports supported event and action evidence", async () => {
    vi.doMock("../design-knowledge/script-capability-registry.js", () => ({
      requireScriptCapabilityProfile: () => ({
        schema: "kf-script-capability-profile/v1", capabilityId: "button", version: "1.0.0", availability: "supported",
        actions: [{ semanticAction: "navigate-page", implementation: "restricted-action", availability: "supported", evidence: [{ kind: "compiler", ref: "reviewed#navigate" }] }],
        events: [{ semanticEvent: "click", kfEvent: "Click", availability: "supported", arguments: [], evidence: [{ kind: "template", ref: "reviewed#click" }] }],
        methods: [], properties: [], initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }),
    }));
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    const result = compileNativeActions({ normalized: normalizeActionGraph(data), implementation: data.implementation });
    expect(result.actions).toEqual([{
      id: "kf$action:navigate", sourceActionId: "navigate", ownerInstanceName: "Button1", kind: "navigate-page",
      targetPageGuid: "00000000-0000-4000-8000-000000000002",
    }]);
    expect(result.bindings).toEqual([{
      id: "kf$binding:navigate", ownerInstanceName: "Button1", kfEvent: "Click", phase: "event",
      scriptModuleIds: [], nativeActionIds: ["kf$action:navigate"],
    }]);
    expect(result.scriptRequests).toEqual([]);
  });

  it("does not promote planned event evidence to the native tier", async () => {
    vi.doMock("../design-knowledge/script-capability-registry.js", () => ({
      requireScriptCapabilityProfile: () => ({
        schema: "kf-script-capability-profile/v1", capabilityId: "button", version: "1.0.0", availability: "supported",
        actions: [{ semanticAction: "navigate-page", implementation: "restricted-action", availability: "supported", evidence: [{ kind: "compiler", ref: "reviewed#navigate" }] }],
        events: [{ semanticEvent: "click", kfEvent: "Click", availability: "planned", arguments: [], evidence: [] }],
        methods: [], properties: [], initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }),
    }));
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    const result = compileNativeActions({ normalized: normalizeActionGraph(data), implementation: data.implementation });
    expect(result.actions).toEqual([]);
    expect(result.scriptRequests[0]).toMatchObject({ reason: "TRIGGER_EVENT_UNSUPPORTED" });
  });

  it("keeps supported local state assignment distinct from legacy setVariable", async () => {
    vi.doMock("../design-knowledge/script-capability-registry.js", () => ({
      requireScriptCapabilityProfile: () => ({
        schema: "kf-script-capability-profile/v1", capabilityId: "button", version: "1.0.0", availability: "supported",
        actions: [{ semanticAction: "set-state", implementation: "restricted-action", availability: "supported", evidence: [{ kind: "compiler", ref: "reviewed#set-state" }] }],
        events: [{ semanticEvent: "click", kfEvent: "Click", availability: "supported", arguments: [], evidence: [{ kind: "template", ref: "reviewed#click" }] }],
        methods: [], properties: [], initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }),
    }));
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    data.plan.localState.push({ id: "allowed", purpose: "允许", type: "boolean", initialValue: false });
    data.plan.actions = [{ id: "navigate", kind: "set-state", stateId: "allowed", value: true, afterActionIds: [] }];
    const result = compileNativeActions({ normalized: normalizeActionGraph(data), implementation: data.implementation });
    expect(result.actions).toEqual([{
      id: "kf$action:navigate", sourceActionId: "navigate", ownerInstanceName: "Button1", kind: "set-state", stateId: "allowed", value: true,
    }]);
    expect(JSON.stringify(result.actions)).not.toContain("setVariable");
  });

  it("requires exact supported target capability evidence for visibility", async () => {
    vi.doMock("../design-knowledge/script-capability-registry.js", () => ({
      requireScriptCapabilityProfile: (capabilityId: string) => capabilityId === "button" ? ({
        schema: "kf-script-capability-profile/v1", capabilityId, version: "1.0.0", availability: "supported",
        actions: [{ semanticAction: "set-visibility", implementation: "restricted-action", availability: "supported", evidence: [{ kind: "compiler", ref: "reviewed#visibility" }] }],
        events: [{ semanticEvent: "click", kfEvent: "Click", availability: "supported", arguments: [], evidence: [{ kind: "template", ref: "reviewed#click" }] }],
        methods: [], properties: [], initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }) : ({
        schema: "kf-script-capability-profile/v1", capabilityId, version: "1.0.0", availability: "supported",
        actions: [], events: [], methods: [], properties: [], initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }),
    }));
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    data.plan.actions = [{ id: "navigate", kind: "set-visibility", targetId: "detail", visible: true, afterActionIds: [] }];
    const result = compileNativeActions({ normalized: normalizeActionGraph(data), implementation: data.implementation });
    expect(result.actions).toEqual([]);
    expect(result.scriptRequests[0]).toMatchObject({ reason: "TARGET_CAPABILITY_UNSUPPORTED" });
  });

  it("rejects stale runtime correlation rather than treating semantic ids as instance names", async () => {
    const { normalizeActionGraph } = await import("./action-graph.js");
    const data = fixture();
    data.implementation.runtimeCorrelation!.controls[0]!.semanticControlId = "stale-go";
    expect(() => normalizeActionGraph(data)).toThrowError(expect.objectContaining({ code: "ACTION_RUNTIME_CORRELATION_MISSING", nodeId: "go" }));

    const missingPage = fixture();
    missingPage.implementation.runtimeCorrelation!.pages = missingPage.implementation.runtimeCorrelation!.pages.filter((entry) => entry.semanticPageId !== "detail-page");
    expect(() => normalizeActionGraph(missingPage)).toThrowError(expect.objectContaining({ code: "ACTION_RUNTIME_CORRELATION_MISSING", nodeId: "detail-page" }));
  });

  it("routes conditions and run-script through bounded requests and never marks script closure complete", async () => {
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    data.plan.localState.push({ id: "allowed", purpose: "允许导航", type: "boolean", initialValue: true });
    data.plan.actions[0]!.conditions = [{ left: { kind: "local-state", stateId: "allowed" }, operator: "equals", right: { kind: "literal", value: true } }];
    let result = compileNativeActions({ normalized: normalizeActionGraph(data), implementation: data.implementation });
    expect(result.scriptRequests[0]).toMatchObject({ reason: "ACTION_CONDITIONS_REQUIRE_SCRIPT", closureStatus: "unverified" });

    data.plan.actions = [{ id: "navigate", kind: "run-script", scriptId: "filter-script", afterActionIds: [] }];
    data.plan.scripts = [{ id: "filter-script", kind: "template", template: "multi-filter", purpose: "筛选", inputs: [], outputs: [{ name: "filtered", description: "结果", refKind: "control", refId: "go" }], parameters: [] }];
    result = compileNativeActions({ normalized: normalizeActionGraph(data), implementation: data.implementation });
    expect(result.scriptRequests[0]).toMatchObject({ requestedTier: "script-template", templateId: "multi-filter", reason: "RUN_SCRIPT_REQUIRES_VALIDATION", closureStatus: "unverified" });
  });

  it("keeps all currently unproved simple effects out of native output", async () => {
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const effects = [
      { kind: "set-visibility", targetId: "detail", visible: true },
      { kind: "switch-tab", targetId: "detail", tabId: "summary" },
      { kind: "set-state", stateId: "allowed", value: true },
      { kind: "set-control-value", targetId: "detail", value: { kind: "literal", value: "更新" } },
      { kind: "show-feedback", level: "success", message: "完成" },
    ] as const;
    for (const effect of effects) {
      const data = fixture();
      data.plan.localState.push({ id: "allowed", purpose: "开关", type: "boolean", initialValue: false });
      data.plan.actions = [{ id: "navigate", ...effect, afterActionIds: [] }] as SolutionImplementationPlan["actions"];
      const result = compileNativeActions({ normalized: normalizeActionGraph(data), implementation: data.implementation });
      expect(result.actions, effect.kind).toEqual([]);
      expect(result.scriptRequests, effect.kind).toHaveLength(1);
    }
  });

  it("preserves the existing restricted navigatePage and setVariable serialization", () => {
    const context = {
      variableGroupGuid: "variables",
      pageGroupGuid: "pages",
      resolvePageGuid: (id: string) => `guid-${id}`,
      resolveVariableName: (id: string) => id,
    };
    expect(compileAction({ kind: "navigate", pageId: "detail" }, context)).toEqual({ action: "navigatePage", pageId: "guid-detail" });
    expect(compileAction({ kind: "setVariable", variableId: "selected", value: 7 }, context)).toEqual({ action: "setVariable", variableId: "selected", value: 7 });
  });
});
