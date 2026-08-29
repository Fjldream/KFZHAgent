import { afterEach, describe, expect, it, vi } from "vitest";
import type { SolutionImplementationPlan, UIImplementationSpecV2 } from "@kf/contracts";
import { compileAction } from "../compile/control-compiler.js";
import { attachRuntimeCorrelation } from "../implementation/runtime-correlation.js";

const validTheme = {
  background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32",
  textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;

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
    schema: "kf-ui-implementation/v2", compatibility: "native", theme: validTheme, compiledRoleStyles: {}, compiledActions: [], compiledScripts: [],
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
  it("closes attached runtime page identities through exact native navigation compilation", async () => {
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    const uncorrelated = structuredClone(data.implementation);
    delete uncorrelated.runtimeCorrelation;
    data.implementation = attachRuntimeCorrelation({
      workspaceId: "navigation-workspace", baseRevisionId: "navigation-revision", implementation: uncorrelated,
    });
    const targetPageGuid = data.implementation.runtimeCorrelation!.pages
      .find((entry) => entry.semanticPageId === "detail-page")!.pageGuid;
    const result = compileNativeActions({ normalized: normalizeActionGraph(data) });
    expect(result.actions[0]).toMatchObject({ kind: "navigate-page", targetPageGuid });
  });

  it("allows a reviewed Datagrid event to trigger reviewed navigation", async () => {
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    const root = data.plan.pages[0]!.root;
    if (root.kind !== "control") throw new Error("control trigger fixture required");
    root.capabilityId = "easyui.1";
    root.eventBindings = [{ semanticEvent: "row-click", actionIds: ["navigate"] }];
    const homePage = data.implementation.pages[0]!;
    if (homePage.compatibility !== "native") throw new Error("native fixture required");
    homePage.controls[0]!.capabilityId = "easyui.1";
    data.implementation.runtimeCorrelation!.controls[0]!.instanceName = "Datagrid1";

    const result = compileNativeActions({ normalized: normalizeActionGraph(data) });

    expect(result.actions).toEqual([expect.objectContaining({ kind: "navigate-page" })]);
    expect(result.scriptRequests).toEqual([]);
  });

  it("compiles same-page overlay open and close through the reviewed Visible target with semantic provenance", async () => {
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    const homePage = data.plan.pages[0]!;
    if (homePage.root.kind !== "control") throw new Error("control trigger fixture required");
    homePage.root.eventBindings = [{ semanticEvent: "click", actionIds: ["open-overlay"] }];
    data.plan.localState.push({ id: "overlay-visible", purpose: "弹层可见", type: "boolean", initialValue: false });
    data.plan.overlays.push({
      id: "contact-overlay", title: "联系", purpose: "联系编辑", presentation: "dialog", hostPageId: "home",
      sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region"], visibleStateId: "overlay-visible", dismissible: true,
      root: {
        id: "contact-overlay-root", kind: "layout", layout: "column", sourceBlueprintRegionIds: ["region"],
        intent: { importance: "primary", visualWeight: 5, readingOrder: 0, density: "comfortable", groupWith: [], width: { mode: "fixed", value: 560 }, height: { mode: "fixed", value: 320 }, align: "center" },
        children: [{
          id: "close-overlay-button", kind: "control", capabilityId: "button", content: "关闭", properties: [], tabIds: [], styleRole: "action",
          sourceBlueprintRegionIds: ["region"], intent: { importance: "secondary", visualWeight: 2, readingOrder: 1, density: "comfortable", groupWith: [], width: { mode: "fixed", value: 96 }, height: { mode: "fixed", value: 40 }, align: "end" },
          eventBindings: [{ semanticEvent: "click", actionIds: ["close-overlay"] }],
        }],
      },
    });
    data.plan.actions = [
      { id: "open-overlay", kind: "open-overlay", overlayId: "contact-overlay", afterActionIds: [] },
      { id: "close-overlay", kind: "close-overlay", overlayId: "contact-overlay", afterActionIds: [] },
    ];
    const homeImplementation = data.implementation.pages[0]!;
    if (homeImplementation.compatibility !== "native") throw new Error("native fixture required");
    homeImplementation.controls.push(
      {
        id: "contact-overlay-root", role: "layout", capabilityId: "layout.4", depth: 0, zIndex: 10,
        geometry: { x: 360, y: 160, width: 560, height: 320 }, compiledLayout: { kind: "column", overflow: "visible" }, nativeProperties: {},
        sourceSolutionNodeId: "contact-overlay-root", sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region"], eventBindings: [],
        overlayHost: { overlayId: "contact-overlay", hostPageId: "home", presentation: "dialog", visibleStateId: "overlay-visible", dismissible: true, initiallyVisible: false },
      },
      {
        id: "close-overlay-button", parentId: "contact-overlay-root", role: "action", capabilityId: "button", depth: 1, zIndex: 11,
        geometry: { x: 760, y: 420, width: 96, height: 40 }, nativeProperties: { parentId: "contact-overlay-root" },
        sourceSolutionNodeId: "close-overlay-button", sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region"], eventBindings: [],
      },
    );
    data.implementation.runtimeCorrelation!.controls.push(
      { semanticControlId: "contact-overlay-root", instanceName: "Layout2" },
      { semanticControlId: "close-overlay-button", instanceName: "Button2" },
    );

    const result = compileNativeActions({ normalized: normalizeActionGraph(data) });
    expect(result.scriptRequests).toEqual([]);
    expect(result.actions).toEqual([
      expect.objectContaining({
        kind: "close-overlay", ownerSemanticControlId: "close-overlay-button", ownerInstanceName: "Button2",
        targetSemanticControlId: "contact-overlay-root", targetInstanceName: "Layout2",
      }),
      expect.objectContaining({
        kind: "open-overlay", ownerSemanticControlId: "go", ownerInstanceName: "Button1",
        targetSemanticControlId: "contact-overlay-root", targetInstanceName: "Layout2",
      }),
    ]);
  });

  it("accepts only the exact trusted normalized object and rejects clones or forgeries", async () => {
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    const normalized = normalizeActionGraph(data);
    expect(() => compileNativeActions({ normalized })).not.toThrow();
    expect(() => compileNativeActions({ normalized: structuredClone(normalized) })).toThrowError(expect.objectContaining({ code: "ACTION_CONTEXT_UNTRUSTED" }));
    expect(() => compileNativeActions({ normalized: { ...normalized } })).toThrowError(expect.objectContaining({ code: "ACTION_CONTEXT_UNTRUSTED" }));
  });

  it("uses exact product click evidence and the trusted normalized snapshot for native navigation", async () => {
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    const normalized = normalizeActionGraph(data);
    data.implementation.runtimeCorrelation!.pages[1]!.pageGuid = "00000000-0000-4000-8000-000000000099";
    const homePage = data.implementation.pages[0]!;
    if (homePage.compatibility !== "native") throw new Error("native fixture required");
    homePage.controls[0]!.capabilityId = "text";
    homePage.id = "mutated-home";
    const swapped = fixture().implementation;
    swapped.runtimeCorrelation!.pages[1]!.pageGuid = "00000000-0000-4000-8000-000000000088";
    const result = compileNativeActions({ normalized, implementation: swapped } as unknown as Parameters<typeof compileNativeActions>[0]);
    expect(result.actions).toEqual([{
      id: "kf$action:navigate", sourceActionId: "navigate", ownerInstanceName: "Button1", kind: "navigate-page",
      targetPageGuid: "00000000-0000-4000-8000-000000000002",
    }]);
    expect(result.bindings).toEqual([{
      id: "kf$binding:navigate", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001, phase: "event",
      scriptModuleIds: [], nativeActionIds: ["kf$action:navigate"],
    }]);
    expect(result.scriptRequests).toEqual([]);
  });

  it("compiles navigation only when the trusted trigger registry reports supported event evidence", async () => {
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
    const normalized = normalizeActionGraph(data);
    data.implementation.runtimeCorrelation!.pages[1]!.pageGuid = "00000000-0000-4000-8000-000000000099";
    const result = compileNativeActions({ normalized });
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
    const result = compileNativeActions({ normalized: normalizeActionGraph(data) });
    expect(result.actions).toEqual([]);
    expect(result.scriptRequests[0]).toMatchObject({ reason: "TRIGGER_EVENT_UNSUPPORTED" });
  });

  it("keeps planned local state assignment out of native output", async () => {
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
    const result = compileNativeActions({ normalized: normalizeActionGraph(data) });
    expect(result.actions).toEqual([]);
    expect(result.scriptRequests[0]).toMatchObject({ reason: "ACTION_CAPABILITY_UNSUPPORTED" });
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
    data.plan.actions = [{ id: "navigate", kind: "set-visibility", targetId: "go", visible: true, afterActionIds: [] }];
    const result = compileNativeActions({ normalized: normalizeActionGraph(data) });
    expect(result.actions).toEqual([]);
    expect(result.scriptRequests[0]).toMatchObject({ reason: "ACTION_CAPABILITY_UNSUPPORTED" });
  });

  it("rejects stale runtime correlation rather than treating semantic ids as instance names", async () => {
    const { normalizeActionGraph } = await import("./action-graph.js");
    const data = fixture();
    data.implementation.runtimeCorrelation!.controls[0]!.semanticControlId = "stale-go";
    expect(() => normalizeActionGraph(data)).toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID", nodeId: "stale-go" }));

    const missingPage = fixture();
    missingPage.implementation.runtimeCorrelation!.pages = missingPage.implementation.runtimeCorrelation!.pages.filter((entry) => entry.semanticPageId !== "detail-page");
    expect(() => normalizeActionGraph(missingPage)).toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID", nodeId: "implementation" }));

    const guidAlias = fixture();
    guidAlias.implementation.runtimeCorrelation!.pages[0]!.pageGuid = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    guidAlias.implementation.runtimeCorrelation!.pages[1]!.pageGuid = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
    expect(() => normalizeActionGraph(guidAlias)).toThrowError(expect.objectContaining({ code: "ACTION_IMPLEMENTATION_INVALID", nodeId: "detail-page" }));
  });

  it("routes conditions and run-script through bounded requests and never marks script closure complete", async () => {
    vi.doMock("../design-knowledge/script-capability-registry.js", () => ({
      requireScriptCapabilityProfile: () => ({
        schema: "kf-script-capability-profile/v1", capabilityId: "button", version: "1.0.0", availability: "supported",
        actions: [], events: [{ semanticEvent: "click", kfEvent: "Click", availability: "supported", arguments: [], evidence: [{ kind: "template", ref: "reviewed#click" }] }],
        methods: [], properties: [], initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }),
    }));
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    data.plan.localState.push({ id: "allowed", purpose: "允许导航", type: "boolean", initialValue: true });
    data.plan.actions[0]!.conditions = [{ left: { kind: "local-state", stateId: "allowed" }, operator: "equals", right: { kind: "literal", value: true } }];
    let result = compileNativeActions({ normalized: normalizeActionGraph(data) });
    expect(result.scriptRequests[0]).toMatchObject({ reason: "ACTION_CONDITIONS_REQUIRE_SCRIPT", closureStatus: "unverified" });

    data.plan.actions = [{ id: "navigate", kind: "run-script", scriptId: "filter-script", afterActionIds: [] }];
    data.plan.scripts = [{ id: "filter-script", kind: "template", template: "multi-filter", purpose: "筛选", inputs: [], outputs: [{ name: "filtered", description: "结果", refKind: "control", refId: "go" }], parameters: [] }];
    result = compileNativeActions({ normalized: normalizeActionGraph(data) });
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
      const result = compileNativeActions({ normalized: normalizeActionGraph(data) });
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

  it("preflights the 16-action binding capacity and degrades 17 or 200 as a whole", async () => {
    vi.doMock("../design-knowledge/script-capability-registry.js", () => ({
      requireScriptCapabilityProfile: () => ({
        schema: "kf-script-capability-profile/v1", capabilityId: "button", version: "1.0.0", availability: "supported",
        actions: [{ semanticAction: "show-feedback", implementation: "restricted-action", availability: "supported", evidence: [{ kind: "compiler", ref: "reviewed#feedback" }] }],
        events: [{ semanticEvent: "click", kfEvent: "Click", availability: "supported", arguments: [], evidence: [{ kind: "template", ref: "reviewed#click" }] }],
        methods: [], properties: [], initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }),
    }));
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const compileCount = (count: number) => {
      const data = fixture();
      const root = data.plan.pages[0]!.root;
      if (root.kind !== "control") throw new Error("control fixture required");
      root.eventBindings = count === 0 ? [] : [{ semanticEvent: "click", actionIds: ["action-0"] }];
      data.plan.actions = Array.from({ length: count }, (_, index) => ({
        id: `action-${index}`, kind: "navigate-page" as const, targetPageId: "detail-page",
        afterActionIds: index + 1 < count ? [`action-${index + 1}`] : [],
      }));
      const normalized = normalizeActionGraph(data);
      return compileNativeActions({ normalized });
    };
    expect(compileCount(0)).toEqual({ actions: [], bindings: [], scriptRequests: [] });
    const sixteen = compileCount(16);
    expect(sixteen.actions).toHaveLength(16);
    expect(sixteen.bindings).toHaveLength(1);
    expect(sixteen.bindings[0]!.nativeActionIds).toHaveLength(16);
    for (const count of [17, 200]) {
      const overflow = compileCount(count);
      expect(overflow.actions, String(count)).toEqual([]);
      expect(overflow.bindings, String(count)).toEqual([]);
      expect(overflow.scriptRequests, String(count)).toHaveLength(count);
      expect(overflow.scriptRequests.every((item) => item.reason === "BINDING_CAPACITY_EXCEEDED"), String(count)).toBe(true);
    }
  });

  it("rejects an action without a reviewed global native serialization", async () => {
    vi.doMock("../design-knowledge/script-capability-registry.js", () => ({
      requireScriptCapabilityProfile: (capabilityId: string) => capabilityId === "button" ? ({
        schema: "kf-script-capability-profile/v1", capabilityId, version: "1.0.0", availability: "supported",
        actions: [{ semanticAction: "set-visibility", implementation: "restricted-action", availability: "supported", evidence: [{ kind: "compiler", ref: "reviewed#visibility" }] }],
        events: [{ semanticEvent: "click", kfEvent: "Click", availability: "supported", arguments: [], evidence: [{ kind: "template", ref: "reviewed#click" }] }],
        methods: [], properties: [], initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }) : ({
        schema: "kf-script-capability-profile/v1", capabilityId, version: "1.0.0", availability: "supported",
        actions: [], events: [], methods: [], properties: [{ semanticProperty: "visible", kfProperty: "Visible", readable: true, writable: true, availability: "supported", evidence: [{ kind: "compiler", ref: "reviewed#visible" }] }],
        initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }),
    }));
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    data.plan.actions = [{ id: "navigate", kind: "set-visibility", targetId: "go", visible: true, afterActionIds: [] }];
    const result = compileNativeActions({ normalized: normalizeActionGraph(data) });
    expect(result.actions).toEqual([]);
    expect(result.scriptRequests[0]).toMatchObject({ reason: "ACTION_CAPABILITY_UNSUPPORTED" });

  });

  it("rejects an overlay whose host page differs from the trigger owner page", async () => {
    vi.doMock("../design-knowledge/script-capability-registry.js", () => ({
      requireScriptCapabilityProfile: (capabilityId: string) => ({
        schema: "kf-script-capability-profile/v1", capabilityId, version: "1.0.0", availability: "supported",
        actions: [{ semanticAction: "open-dialog", implementation: "restricted-action", availability: "supported", evidence: [{ kind: "compiler", ref: "reviewed#open" }] }],
        events: capabilityId === "button" ? [{ semanticEvent: "click", kfEvent: "Click", availability: "supported", arguments: [], evidence: [{ kind: "template", ref: "reviewed#click" }] }] : [],
        methods: [], properties: [], initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }),
    }));
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    data.plan.localState.push({ id: "overlay-visible", purpose: "弹层可见", type: "boolean", initialValue: false });
    data.plan.overlays.push({
      id: "detail-overlay", title: "详情弹层", purpose: "详情", presentation: "dialog", hostPageId: "detail-page",
      sourceBlueprintPageId: "bp-detail", sourceBlueprintRegionIds: ["detail-region"], visibleStateId: "overlay-visible", dismissible: true,
      root: { ...data.plan.pages[1]!.root, id: "overlay-content" },
    });
    data.plan.actions = [{ id: "navigate", kind: "open-overlay", overlayId: "detail-overlay", afterActionIds: [] }];
    const detailPage = data.implementation.pages[1]!;
    if (detailPage.compatibility !== "native") throw new Error("native fixture required");
    detailPage.controls.push({
      ...detailPage.controls[0]!, id: "overlay-host", capabilityId: "easyui.12", sourceSolutionNodeId: "overlay-content",
      overlayHost: { overlayId: "detail-overlay", hostPageId: "detail-page", presentation: "dialog", visibleStateId: "overlay-visible", dismissible: true, initiallyVisible: false },
    });
    data.implementation.runtimeCorrelation!.controls.push({ semanticControlId: "overlay-host", instanceName: "Dialog1" });
    const result = compileNativeActions({ normalized: normalizeActionGraph(data) });
    expect(result.actions).toEqual([]);
    expect(result.scriptRequests[0]).toMatchObject({ reason: "ACTION_CONTEXT_CROSS_PAGE" });

    detailPage.controls[1]!.overlayHost!.hostPageId = "home";
    expect(() => normalizeActionGraph(data)).toThrowError(expect.objectContaining({
      code: "ACTION_IMPLEMENTATION_INVALID", nodeId: "overlay-host",
    }));
    detailPage.controls[1]!.overlayHost!.hostPageId = "detail-page";

    data.plan.overlays[0]!.presentation = "drawer";
    expect(() => normalizeActionGraph(data)).toThrowError(expect.objectContaining({
      code: "ACTION_OVERLAY_HOST_METADATA_MISMATCH", nodeId: "detail-overlay",
    }));
    data.plan.overlays[0]!.presentation = "dialog";

    detailPage.controls[1]!.sourceSolutionNodeId = "wrong-overlay-root";
    expect(() => normalizeActionGraph(data)).toThrowError(expect.objectContaining({
      code: "ACTION_OVERLAY_HOST_PROVENANCE_MISMATCH", nodeId: "detail-overlay",
    }));
    detailPage.controls[1]!.sourceSolutionNodeId = "overlay-content";

    const hostControl = detailPage.controls.pop()!;
    const hostCorrelation = data.implementation.runtimeCorrelation!.controls.pop()!;
    expect(() => normalizeActionGraph(data)).toThrowError(expect.objectContaining({
      code: "ACTION_OVERLAY_HOST_MISSING", nodeId: "detail-overlay",
    }));
    detailPage.controls.push(hostControl);
    data.implementation.runtimeCorrelation!.controls.push(hostCorrelation);

    const overlayPlan = data.plan.overlays.pop()!;
    expect(() => normalizeActionGraph(data)).toThrowError(expect.objectContaining({
      code: "ACTION_OVERLAY_HOST_EXTRA", nodeId: "detail-overlay",
    }));
    data.plan.overlays.push(overlayPlan);

    data.plan.overlays.push(structuredClone(overlayPlan));
    expect(() => normalizeActionGraph(data)).toThrowError(expect.objectContaining({
      code: "ACTION_OVERLAY_PLAN_DUPLICATE", nodeId: "detail-overlay",
    }));
    data.plan.overlays.pop();

    detailPage.controls.push({ ...hostControl, id: "overlay-host-duplicate" });
    data.implementation.runtimeCorrelation!.controls.push({ semanticControlId: "overlay-host-duplicate", instanceName: "Dialog2" });
    expect(() => normalizeActionGraph(data)).toThrowError(expect.objectContaining({
      code: "ACTION_OVERLAY_HOST_DUPLICATE", nodeId: "detail-overlay",
    }));
  });

  it("does not trust supported members under a planned top-level profile", async () => {
    vi.doMock("../design-knowledge/script-capability-registry.js", () => ({
      requireScriptCapabilityProfile: () => ({
        schema: "kf-script-capability-profile/v1", capabilityId: "button", version: "1.0.0", availability: "planned",
        actions: [{ semanticAction: "navigate-page", implementation: "restricted-action", availability: "supported", evidence: [{ kind: "compiler", ref: "reviewed#navigate" }] }],
        events: [{ semanticEvent: "click", kfEvent: "Click", availability: "supported", arguments: [], evidence: [{ kind: "template", ref: "reviewed#click" }] }],
        methods: [], properties: [], initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }),
    }));
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    const result = compileNativeActions({ normalized: normalizeActionGraph(data) });
    expect(result.actions).toEqual([]);
    expect(result.scriptRequests[0]).toMatchObject({ reason: "ACTION_CAPABILITY_UNSUPPORTED" });
  });

  it("does not trust target members under a planned target profile", async () => {
    vi.doMock("../design-knowledge/script-capability-registry.js", () => ({
      requireScriptCapabilityProfile: (capabilityId: string) => capabilityId === "button" ? ({
        schema: "kf-script-capability-profile/v1", capabilityId, version: "1.0.0", availability: "supported",
        actions: [{ semanticAction: "set-visibility", implementation: "restricted-action", availability: "supported", evidence: [{ kind: "compiler", ref: "reviewed#visibility" }] }],
        events: [{ semanticEvent: "click", kfEvent: "Click", availability: "supported", arguments: [], evidence: [{ kind: "template", ref: "reviewed#click" }] }],
        methods: [], properties: [], initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }) : ({
        schema: "kf-script-capability-profile/v1", capabilityId, version: "1.0.0", availability: "planned",
        actions: [], events: [], methods: [], properties: [{ semanticProperty: "visible", kfProperty: "Visible", readable: true, writable: true, availability: "supported", evidence: [{ kind: "compiler", ref: "reviewed#visible" }] }],
        initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }),
    }));
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    const homePage = data.implementation.pages[0]!;
    if (homePage.compatibility !== "native") throw new Error("native fixture required");
    homePage.controls.push({ ...homePage.controls[0]!, id: "same-page-target", capabilityId: "text", sourceSolutionNodeId: "same-page-target" });
    data.implementation.runtimeCorrelation!.controls.push({ semanticControlId: "same-page-target", instanceName: "Text2" });
    data.plan.actions = [{ id: "navigate", kind: "set-visibility", targetId: "same-page-target", visible: true, afterActionIds: [] }];
    const result = compileNativeActions({ normalized: normalizeActionGraph(data) });
    expect(result.actions).toEqual([]);
    expect(result.scriptRequests[0]).toMatchObject({ reason: "ACTION_CAPABILITY_UNSUPPORTED" });
  });

  it("normalizes compiled binding contract failures instead of leaking Zod errors", async () => {
    vi.doMock("../design-knowledge/script-capability-registry.js", () => ({
      requireScriptCapabilityProfile: () => ({
        schema: "kf-script-capability-profile/v1", capabilityId: "button", version: "1.0.0", availability: "supported",
        actions: [{ semanticAction: "navigate-page", implementation: "restricted-action", availability: "supported", evidence: [{ kind: "compiler", ref: "reviewed#navigate" }] }],
        events: [{ semanticEvent: "click", kfEvent: "bad event", availability: "supported", arguments: [], evidence: [{ kind: "template", ref: "reviewed#click" }] }],
        methods: [], properties: [], initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }),
    }));
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    expect(() => compileNativeActions({ normalized: normalizeActionGraph(data) }))
      .toThrowError(expect.objectContaining({ code: "NATIVE_ACTION_CONTRACT_INVALID", nodeId: "navigate" }));
  });

  it("merges semantic aliases by actual KF event identity before capacity checks", async () => {
    vi.doMock("../design-knowledge/script-capability-registry.js", () => ({
      requireScriptCapabilityProfile: () => ({
        schema: "kf-script-capability-profile/v1", capabilityId: "button", version: "1.0.0", availability: "supported",
        actions: [],
        events: ["click", "change"].map((semanticEvent) => ({ semanticEvent, kfEvent: "Click", linkId: 7, availability: "supported", arguments: [], evidence: [{ kind: "template", ref: "reviewed#click" }] })),
        methods: [], properties: [], initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }),
    }));
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const compileAliases = (leftCount: number, rightCount: number) => {
      const data = fixture();
      const root = data.plan.pages[0]!.root;
      if (root.kind !== "control") throw new Error("control fixture required");
      root.eventBindings = [
        { semanticEvent: "click", actionIds: ["left-0"] },
        { semanticEvent: "change", actionIds: ["right-0"] },
      ];
      const chain = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => ({
        id: `${prefix}-${index}`, kind: "navigate-page" as const, targetPageId: "detail-page",
        afterActionIds: index + 1 < count ? [`${prefix}-${index + 1}`] : [],
      }));
      data.plan.actions = [...chain("left", leftCount), ...chain("right", rightCount)];
      return compileNativeActions({ normalized: normalizeActionGraph(data) });
    };
    const sixteen = compileAliases(8, 8);
    expect(sixteen.bindings).toHaveLength(1);
    expect(sixteen.bindings[0]).toMatchObject({ ownerInstanceName: "Button1", kfEvent: "Click", linkId: 7 });
    expect(sixteen.bindings[0]!.nativeActionIds).toHaveLength(16);

    const seventeen = compileAliases(9, 8);
    expect(seventeen.actions).toEqual([]);
    expect(seventeen.bindings).toEqual([]);
    expect(seventeen.scriptRequests).toHaveLength(17);
    expect(seventeen.scriptRequests.every((item) => item.reason === "BINDING_CAPACITY_EXCEEDED")).toBe(true);
  });

  it("fails closed when semantic aliases disagree on actual event evidence semantics", async () => {
    vi.doMock("../design-knowledge/script-capability-registry.js", () => ({
      requireScriptCapabilityProfile: () => ({
        schema: "kf-script-capability-profile/v1", capabilityId: "button", version: "1.0.0", availability: "supported",
        actions: [{ semanticAction: "show-feedback", implementation: "restricted-action", availability: "supported", evidence: [{ kind: "compiler", ref: "reviewed#feedback" }] }],
        events: [
          { semanticEvent: "click", kfEvent: "Click", availability: "supported", arguments: [], evidence: [{ kind: "template", ref: "reviewed#click" }] },
          { semanticEvent: "change", kfEvent: "Click", availability: "supported", arguments: [{ name: "value" }], evidence: [{ kind: "template", ref: "reviewed#change" }] },
        ],
        methods: [], properties: [], initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }),
    }));
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const data = fixture();
    const root = data.plan.pages[0]!.root;
    if (root.kind !== "control") throw new Error("control fixture required");
    root.eventBindings = [
      { semanticEvent: "click", actionIds: ["left"] },
      { semanticEvent: "change", actionIds: ["right"] },
    ];
    data.plan.actions = [
      { id: "left", kind: "show-feedback", level: "info", message: "左", afterActionIds: [] },
      { id: "right", kind: "show-feedback", level: "info", message: "右", afterActionIds: [] },
    ];
    const result = compileNativeActions({ normalized: normalizeActionGraph(data) });
    expect(result.actions).toEqual([]);
    expect(result.bindings).toEqual([]);
    expect(result.scriptRequests).toHaveLength(2);
    expect(result.scriptRequests.every((item) => item.reason === "EVENT_ALIAS_EVIDENCE_CONFLICT")).toBe(true);
  });

  it("treats linkId as alias consistency metadata rather than KF event identity", async () => {
    let leftLinkId: number | undefined;
    let rightLinkId: number | undefined = 7;
    vi.doMock("../design-knowledge/script-capability-registry.js", () => ({
      requireScriptCapabilityProfile: () => ({
        schema: "kf-script-capability-profile/v1", capabilityId: "button", version: "1.0.0", availability: "supported",
        actions: [{ semanticAction: "show-feedback", implementation: "restricted-action", availability: "supported", evidence: [{ kind: "compiler", ref: "reviewed#feedback" }] }],
        events: [
          { semanticEvent: "click", kfEvent: "Click", ...(leftLinkId === undefined ? {} : { linkId: leftLinkId }), availability: "supported", arguments: [], evidence: [{ kind: "template", ref: "reviewed#click" }] },
          { semanticEvent: "change", kfEvent: "Click", ...(rightLinkId === undefined ? {} : { linkId: rightLinkId }), availability: "supported", arguments: [], evidence: [{ kind: "template", ref: "reviewed#click" }] },
        ],
        methods: [], properties: [], initialization: { supportsConfigureData: false, lifecycleEvents: [] }, limitations: [],
      }),
    }));
    const { normalizeActionGraph } = await import("./action-graph.js");
    const { compileNativeActions } = await import("./action-compiler.js");
    const compile = () => {
      const data = fixture();
      const root = data.plan.pages[0]!.root;
      if (root.kind !== "control") throw new Error("control fixture required");
      root.eventBindings = [
        { semanticEvent: "click", actionIds: ["left"] },
        { semanticEvent: "change", actionIds: ["right"] },
      ];
      data.plan.actions = [
        { id: "left", kind: "show-feedback", level: "info", message: "左", afterActionIds: [] },
        { id: "right", kind: "show-feedback", level: "info", message: "右", afterActionIds: [] },
      ];
      return compileNativeActions({ normalized: normalizeActionGraph(data) });
    };
    for (const links of [[undefined, 7], [7, 8]] as const) {
      [leftLinkId, rightLinkId] = links;
      const result = compile();
      expect(result.actions, String(links)).toEqual([]);
      expect(result.bindings, String(links)).toEqual([]);
      expect(result.scriptRequests, String(links)).toHaveLength(2);
      expect(result.scriptRequests.every((item) => item.reason === "EVENT_ALIAS_EVIDENCE_CONFLICT"), String(links)).toBe(true);
    }
  });
});
