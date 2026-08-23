import { describe, expect, it } from "vitest";
import { canonicalServerHash, type SolutionImplementationPlan, type UIImplementationSpecV2 } from "@kf/contracts";
import {
  createSemanticScriptApiContext,
  resolveEventBinding,
  resolveSemanticApiCall,
} from "./semantic-script-api.js";

const theme = {
  background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32",
  textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;

function control(id: string, capabilityId: string, sourceBlueprintPageId: string) {
  return {
    id,
    role: "content",
    capabilityId,
    depth: 0,
    zIndex: 0,
    geometry: { x: 0, y: 0, width: 120, height: 40 },
    nativeProperties: {},
    sourceSolutionNodeId: id,
    sourceBlueprintPageId,
    sourceBlueprintRegionIds: ["region"],
    eventBindings: [],
  };
}

function implementation(): UIImplementationSpecV2 {
  return {
    schema: "kf-ui-implementation/v2",
    compatibility: "native",
    sourceSolutionPlanHash: canonicalServerHash(plan()),
    theme,
    compiledRoleStyles: {},
    compiledActions: [],
    compiledScripts: [],
    pages: [
      {
        compatibility: "native", id: "home", width: 1280, height: 720, sourceBlueprintPageId: "bp-home",
        controls: [
          control("go", "button", "bp-home"),
          control("status-filter", "input", "bp-home"),
          control("records", "easyui.1", "bp-home"),
          control("status-select", "select", "bp-home"),
          control("plain-text", "text", "bp-home"),
          {
            ...control("overlay-content", "text", "bp-home"),
            overlayHost: {
              overlayId: "detail-overlay", hostPageId: "home", presentation: "dialog", visibleStateId: "detail-visible",
              dismissible: true, initiallyVisible: false,
            },
          },
        ],
      },
      {
        compatibility: "native", id: "detail-page", width: 1280, height: 720, sourceBlueprintPageId: "bp-detail",
        controls: [control("detail-input", "input", "bp-detail"), control("detail-records", "easyui.1", "bp-detail")],
      },
    ],
    runtimeCorrelation: {
      controls: [
        { semanticControlId: "go", instanceName: "Button1" },
        { semanticControlId: "status-filter", instanceName: "Input1" },
        { semanticControlId: "records", instanceName: "Table1" },
        { semanticControlId: "status-select", instanceName: "Select1" },
        { semanticControlId: "plain-text", instanceName: "Text1" },
        { semanticControlId: "overlay-content", instanceName: "Text2" },
        { semanticControlId: "detail-input", instanceName: "Input2" },
        { semanticControlId: "detail-records", instanceName: "Table2" },
      ],
      pages: [
        { semanticPageId: "home", pageGuid: "00000000-0000-4000-8000-000000000001" },
        { semanticPageId: "detail-page", pageGuid: "00000000-0000-4000-8000-000000000002" },
      ],
    },
  };
}

const intent: SolutionImplementationPlan["pages"][number]["root"]["intent"] = {
  importance: "primary", visualWeight: 3, readingOrder: 0, density: "comfortable", groupWith: [],
  width: { mode: "fixed", value: 120 }, height: { mode: "fixed", value: 40 }, align: "start",
};

function planControl(
  id: string,
  capabilityId: string,
  content = "控件",
): Extract<SolutionImplementationPlan["pages"][number]["root"], { kind: "control" }> {
  return {
    id, kind: "control", capabilityId, content, properties: [], tabIds: [], styleRole: "content",
    sourceBlueprintRegionIds: ["region"], intent, eventBindings: [],
  };
}

function plan(): SolutionImplementationPlan {
  return {
    schema: "kf-solution-implementation/v1", projectKey: "demo", blueprintHash: "a".repeat(64), candidateBundleHash: "b".repeat(64),
    theme, roleStyles: [{ role: "content", declarations: {}, states: {} }],
    mockData: [
      {
        id: "visitor-records", purpose: "访客记录", fields: [{ key: "id", label: "标识", type: "text" }, { key: "name", label: "姓名", type: "text" }],
        records: [{ values: [{ field: "id", value: "visitor-1" }, { field: "name", value: "张三" }] }],
      },
      {
        id: "detail-data", purpose: "详情记录", fields: [{ key: "code", label: "编码", type: "text" }],
        records: [{ values: [{ field: "code", value: "D-1" }] }],
      },
    ],
    localState: [
      { id: "submitted", purpose: "是否提交", type: "boolean", initialValue: false },
      { id: "detail-visible", purpose: "详情是否显示", type: "boolean", initialValue: false },
      { id: "selected-name", purpose: "选中姓名", type: "record-key", initialValue: "visitor-1", mockDataId: "visitor-records", keyField: "id" },
      { id: "selected-names", purpose: "选中姓名列表", type: "record-key-list", initialValue: ["visitor-1"], mockDataId: "visitor-records", keyField: "id" },
      { id: "detail-state", purpose: "详情状态", type: "text", initialValue: "待处理" },
    ],
    pages: [
      {
        id: "home", title: "首页", purpose: "首页", canvas: "desktop", sourceBlueprintPageId: "bp-home",
        sourceBlueprintRegionIds: ["region"], initialStateIds: ["submitted", "detail-visible", "selected-name", "selected-names"],
        root: { id: "home-root", kind: "layout", layout: "column", sourceBlueprintRegionIds: ["region"], intent, children: [
          planControl("go", "button", "前往详情"), planControl("status-filter", "input"),
          { ...planControl("records", "easyui.1"), mockDataId: "visitor-records" },
          planControl("status-select", "select"), planControl("plain-text", "text"),
        ] },
      },
      {
        id: "detail-page", title: "详情", purpose: "详情", canvas: "desktop", sourceBlueprintPageId: "bp-detail",
        sourceBlueprintRegionIds: ["detail-region"], initialStateIds: ["detail-state"], root: {
          id: "detail-root", kind: "layout", layout: "column", sourceBlueprintRegionIds: ["detail-region"], intent,
          children: [
            { ...planControl("detail-input", "input"), sourceBlueprintRegionIds: ["detail-region"] },
            { ...planControl("detail-records", "easyui.1"), sourceBlueprintRegionIds: ["detail-region"], mockDataId: "detail-data" },
          ],
        },
      },
    ],
    overlays: [{
      id: "detail-overlay", title: "详情弹窗", purpose: "展示详情", presentation: "dialog", hostPageId: "home",
      sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region"], visibleStateId: "detail-visible", dismissible: true,
      root: planControl("overlay-content", "text", "详情"),
    }],
    actions: [],
    scripts: [{ id: "refresh-script", purpose: "刷新数据", kind: "custom", programVersion: "declarative-steps/v1", inputs: [], outputs: [], steps: [{ order: 1, intent: "刷新访客数据", inputNames: [], outputNames: [] }] }],
  };
}

const call = (api: string, ...args: readonly unknown[]) => ({ api, args });
const context = (ownerControlId = "go") => createSemanticScriptApiContext({ plan: plan(), implementation: implementation(), ownerControlId });

describe("semantic script API", () => {
  it("resolves exact evidence-backed input reads through semantic-to-runtime correlation", () => {
    expect(resolveSemanticApiCall(call("$control.getValue", "status-filter"), context())).toMatchObject({
      availability: "supported",
      kind: "property-read",
      semanticControlId: "status-filter",
      instanceName: "Input1",
      capabilityId: "input",
      pageId: "home",
      kfProperty: "Value",
    });
  });

  it("keeps input writes and select Value access planned without inventing a runtime spelling", () => {
    expect(resolveSemanticApiCall(call("$control.setValue", "status-filter", "open"), context())).toEqual({
      availability: "planned", kind: "planned", api: "$control.setValue", reason: "SCRIPT_PROPERTY_NOT_WRITABLE",
    });
    expect(resolveSemanticApiCall(call("$control.getValue", "status-select"), context())).toEqual({
      availability: "planned", kind: "planned", api: "$control.getValue", reason: "SCRIPT_PROPERTY_NOT_SUPPORTED",
    });
  });

  it("resolves only the product-evidenced datagrid SetData method", () => {
    expect(resolveSemanticApiCall(call("$control.setData", "records", []), context())).toMatchObject({
      availability: "supported", kind: "method", semanticControlId: "records", instanceName: "Table1",
      capabilityId: "easyui.1", pageId: "home", kfMethod: "SetData", parameterNames: ["records"],
    });
    expect(() => resolveSemanticApiCall(call("$control.setData", "status-select", []), context()))
      .toThrow(/SCRIPT_API_INPUT_INVALID.*not bound to mock data/);
  });

  it("maps the reviewed semantic row-click alias to exact Cell-click evidence", () => {
    expect(resolveEventBinding({ controlId: "records", semanticEvent: "row-click" }, context("records"))).toMatchObject({
      availability: "supported", kind: "event", semanticControlId: "records", instanceName: "Table1",
      kfEvent: "Cell-click", linkId: 200006,
      arguments: [
        { name: "record", position: 1, valueKind: "record" },
        { name: "column", position: 2, valueKind: "scalar" },
      ],
    });
    expect(() => resolveEventBinding({ controlId: "records", semanticEvent: "Row-click" }, context("records")))
      .toThrow(/SCRIPT_EVENT_NOT_SUPPORTED: records/);
    expect(() => resolveEventBinding({ controlId: "records", semanticEvent: "selection-change" }, context("records")))
      .toThrow(/SCRIPT_EVENT_NOT_SUPPORTED: records/);
  });

  it("exposes the record only from the exact active event argument profile", () => {
    const active = createSemanticScriptApiContext({
      plan: plan(), implementation: implementation(), ownerControlId: "records", activeEvent: { controlId: "records", semanticEvent: "row-click" },
    });
    expect(resolveSemanticApiCall(call("$event.record"), active)).toMatchObject({
      availability: "supported", kind: "event-argument", instanceName: "Table1", kfEvent: "Cell-click",
      argumentName: "record", argumentPosition: 1, valueKind: "record",
    });
    expect(resolveSemanticApiCall(call("$event.record"), context())).toEqual({
      availability: "planned", kind: "planned", api: "$event.record", reason: "SCRIPT_EVENT_RECORD_NOT_PROVEN",
    });
  });

  it("resolves page navigation only as an evidence-backed restricted action", () => {
    expect(resolveSemanticApiCall(call("$page.navigate", "detail-page"), context())).toEqual({
      availability: "supported",
      kind: "restricted-action",
      api: "$page.navigate",
      semanticAction: "navigate-page",
      targetPageId: "detail-page",
      targetPageGuid: "00000000-0000-4000-8000-000000000002",
    });
  });

  it.each([
    ["$control.setVisible", ["plain-text", true], "SCRIPT_CONTROL_VISIBILITY_NOT_SERIALIZABLE"],
    ["$control.setEnabled", ["plain-text", true], "SCRIPT_CONTROL_ENABLED_NOT_SERIALIZABLE"],
    ["$overlay.open", ["detail-overlay"], "SCRIPT_OVERLAY_NOT_SERIALIZABLE"],
    ["$overlay.close", ["detail-overlay"], "SCRIPT_OVERLAY_NOT_SERIALIZABLE"],
    ["$state.get", ["submitted"], "SCRIPT_PAGE_LOCAL_RUNTIME_UNAVAILABLE"],
    ["$state.set", ["submitted", true], "SCRIPT_PAGE_LOCAL_RUNTIME_UNAVAILABLE"],
    ["$data.get", ["visitor-records"], "SCRIPT_PAGE_LOCAL_RUNTIME_UNAVAILABLE"],
    ["$data.set", ["visitor-records", []], "SCRIPT_PAGE_LOCAL_RUNTIME_UNAVAILABLE"],
    ["$feedback.show", ["success", "完成"], "SCRIPT_FEEDBACK_NOT_SERIALIZABLE"],
    ["$timer.after", [100, "refresh-script"], "SCRIPT_TIMER_NOT_SERIALIZABLE"],
    ["$timer.repeat", [100, 2, "refresh-script"], "SCRIPT_TIMER_NOT_SERIALIZABLE"],
  ])("keeps %s as a closed planned result", (api, args, reason) => {
    expect(resolveSemanticApiCall(call(api, ...args), context())).toEqual({ availability: "planned", kind: "planned", api, reason });
  });

  it("rejects unknown APIs, runtime spellings, cross-page targets, and wrong event hosts", () => {
    expect(() => resolveSemanticApiCall(call("$control.deleteAll", "records"), context())).toThrow(/SCRIPT_METHOD_UNSUPPORTED/);
    expect(() => resolveSemanticApiCall(call("$control.GetValue", "status-filter"), context())).toThrow(/SCRIPT_API_UNSUPPORTED/);
    expect(() => resolveSemanticApiCall(call("$control.getValue", "Input1"), context())).toThrow(/SCRIPT_CONTROL_NOT_FOUND: Input1/);
    expect(() => resolveSemanticApiCall(call("$control.getValue", "detail-input"), context())).toThrow(/SCRIPT_CONTROL_CROSS_PAGE/);
    expect(() => resolveEventBinding({ controlId: "plain-text", semanticEvent: "row-click" }, context()))
      .toThrow(/SCRIPT_EVENT_NOT_SUPPORTED: plain-text/);
  });

  it("rejects malformed arity before resolving supported calls", () => {
    expect(() => resolveSemanticApiCall(call("$control.getValue", "status-filter", "extra"), context()))
      .toThrow(/SCRIPT_API_INPUT_INVALID/);
    expect(() => resolveSemanticApiCall(call("$control.setData", "records"), context()))
      .toThrow(/SCRIPT_API_INPUT_INVALID/);
    expect(() => resolveSemanticApiCall(call("$page.navigate", "detail-page", "extra"), context()))
      .toThrow(/SCRIPT_API_INPUT_INVALID/);
    const active = createSemanticScriptApiContext({
      plan: plan(), implementation: implementation(), ownerControlId: "records", activeEvent: { controlId: "records", semanticEvent: "row-click" },
    });
    expect(() => resolveSemanticApiCall(call("$event.record", "extra"), active))
      .toThrow(/SCRIPT_API_INPUT_INVALID/);
  });

  it("returns deeply immutable resolutions and rejects forged contexts", () => {
    const trusted = context();
    const resolution = resolveSemanticApiCall(call("$control.getValue", "status-filter"), trusted);
    expect(Object.isFrozen(resolution)).toBe(true);
    expect(Object.isFrozen((resolution as { evidence: readonly unknown[] }).evidence)).toBe(true);
    expect(() => resolveSemanticApiCall(call("$control.getValue", "status-filter"), structuredClone(trusted)))
      .toThrow(/SCRIPT_API_CONTEXT_UNTRUSTED/);
  });

  it("rejects hostile descriptors without invoking accessors or accepting caller evidence", () => {
    let reads = 0;
    const hostile = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(hostile, "plan", { enumerable: true, value: plan() });
    Object.defineProperty(hostile, "implementation", { enumerable: true, get: () => { reads += 1; return implementation(); } });
    Object.defineProperty(hostile, "ownerControlId", { enumerable: true, value: "go" });
    expect(() => createSemanticScriptApiContext(hostile)).toThrow(/SCRIPT_API_CONTEXT_INVALID/);
    expect(reads).toBe(0);

    expect(() => createSemanticScriptApiContext({
      plan: plan(), implementation: implementation(), ownerControlId: "go", evidence: [{ kfEvent: "Click" }],
    })).toThrow(/SCRIPT_API_CONTEXT_INVALID/);

    let traps = 0;
    const proxy = new Proxy({ plan: plan(), implementation: implementation(), ownerControlId: "go" }, {
      getPrototypeOf(value) { traps += 1; return Reflect.getPrototypeOf(value); },
      ownKeys(value) { traps += 1; return Reflect.ownKeys(value); },
    });
    expect(() => createSemanticScriptApiContext(proxy)).toThrow(/SCRIPT_API_CONTEXT_INVALID/);
    expect(traps).toBe(0);
  });

  it("rejects reserved object keys at both descriptor-safe entry points without prototype mutation", () => {
    const hostileContext = { plan: plan(), implementation: implementation(), ownerControlId: "go" } as Record<string, unknown>;
    Object.defineProperty(hostileContext, "__proto__", { enumerable: true, value: { polluted: true } });
    expect(() => createSemanticScriptApiContext(hostileContext)).toThrow(/SCRIPT_API_CONTEXT_INVALID.*reserved/);

    const hostileCall = call("$feedback.show", "success", "完成") as Record<string, unknown>;
    Object.defineProperty(hostileCall, "constructor", { enumerable: true, value: "forbidden" });
    expect(() => resolveSemanticApiCall(hostileCall, context())).toThrow(/SCRIPT_API_INPUT_INVALID.*reserved/);
    expect(({} as { polluted?: boolean }).polluted).toBeUndefined();
  });

  it("binds event resolution to the trusted owner control, not merely the same page", () => {
    expect(() => resolveEventBinding({ controlId: "records", semanticEvent: "row-click" }, context("go")))
      .toThrow(/SCRIPT_EVENT_NOT_SUPPORTED.*owner/);
  });

  it("rejects plan hashes and UI provenance that drift from the authoritative context", () => {
    const invalidHash = plan();
    invalidHash.blueprintHash = "A".repeat(64);
    expect(() => createSemanticScriptApiContext({ plan: invalidHash, implementation: implementation(), ownerControlId: "go" }))
      .toThrow(/SCRIPT_API_CONTEXT_INVALID: plan/);

    const wrongCapability = implementation();
    const home = wrongCapability.pages[0];
    if (home?.compatibility !== "native") throw new Error("native fixture required");
    home.controls[0]!.capabilityId = "text";
    expect(() => createSemanticScriptApiContext({ plan: plan(), implementation: wrongCapability, ownerControlId: "go" }))
      .toThrow(/capability does not match/);

    const wrongSource = implementation();
    const wrongSourceHome = wrongSource.pages[0];
    if (wrongSourceHome?.compatibility !== "native") throw new Error("native fixture required");
    wrongSourceHome.controls[0]!.sourceSolutionNodeId = "missing-node";
    expect(() => createSemanticScriptApiContext({ plan: plan(), implementation: wrongSource, ownerControlId: "go" }))
      .toThrow(/provenance does not match/);

    const driftedPlan = plan();
    driftedPlan.projectKey = "drifted-demo";
    expect(() => createSemanticScriptApiContext({ plan: driftedPlan, implementation: implementation(), ownerControlId: "go" }))
      .toThrow(/solution-plan hash does not match/);

    const missingPlanHash = implementation();
    delete missingPlanHash.sourceSolutionPlanHash;
    expect(() => createSemanticScriptApiContext({ plan: plan(), implementation: missingPlanHash, ownerControlId: "go" }))
      .toThrow(/solution-plan hash does not match/);

    const crossPageAlias = implementation();
    const detail = crossPageAlias.pages[1];
    if (detail?.compatibility !== "native") throw new Error("native fixture required");
    detail.controls[0]!.sourceSolutionNodeId = "status-filter";
    expect(() => createSemanticScriptApiContext({ plan: plan(), implementation: crossPageAlias, ownerControlId: "detail-input" }))
      .toThrow(/page ownership/);
  });

  it("requires a one-to-one overlay root host on its exact owner page", () => {
    const missing = implementation();
    const missingHome = missing.pages[0];
    if (missingHome?.compatibility !== "native") throw new Error("native fixture required");
    delete missingHome.controls.find((candidate) => candidate.id === "overlay-content")!.overlayHost;
    expect(() => createSemanticScriptApiContext({ plan: plan(), implementation: missing, ownerControlId: "go" }))
      .toThrow(/overlay host|page ownership/);

    const wrong = implementation();
    const wrongHome = wrong.pages[0];
    if (wrongHome?.compatibility !== "native") throw new Error("native fixture required");
    const overlayHost = wrongHome.controls.find((candidate) => candidate.id === "overlay-content")!.overlayHost!;
    delete wrongHome.controls.find((candidate) => candidate.id === "overlay-content")!.overlayHost;
    wrongHome.controls.find((candidate) => candidate.id === "plain-text")!.overlayHost = overlayHost;
    expect(() => createSemanticScriptApiContext({ plan: plan(), implementation: wrong, ownerControlId: "go" }))
      .toThrow(/overlay host|page ownership/);

    const wrongMetadata = implementation();
    const metadataHome = wrongMetadata.pages[0];
    if (metadataHome?.compatibility !== "native") throw new Error("native fixture required");
    metadataHome.controls.find((candidate) => candidate.id === "overlay-content")!.overlayHost!.presentation = "drawer";
    expect(() => createSemanticScriptApiContext({ plan: plan(), implementation: wrongMetadata, ownerControlId: "go" }))
      .toThrow(/overlay provenance/);

    const extra = implementation();
    const extraHome = extra.pages[0];
    if (extraHome?.compatibility !== "native") throw new Error("native fixture required");
    extraHome.controls.find((candidate) => candidate.id === "plain-text")!.overlayHost = {
      ...extraHome.controls.find((candidate) => candidate.id === "overlay-content")!.overlayHost!,
    };
    expect(() => createSemanticScriptApiContext({ plan: plan(), implementation: extra, ownerControlId: "go" }))
      .toThrow(/overlay host|page ownership/);
  });

  it("scopes state and mock data to resources actually owned by the owner page", () => {
    expect(() => resolveSemanticApiCall(call("$state.get", "detail-state"), context("go")))
      .toThrow(/SCRIPT_API_INPUT_INVALID.*unknown local state/);
    expect(() => resolveSemanticApiCall(call("$data.get", "detail-data"), context("go")))
      .toThrow(/SCRIPT_API_INPUT_INVALID.*unknown mock data/);
    expect(resolveSemanticApiCall(call("$state.get", "detail-state"), context("detail-input"))).toMatchObject({ availability: "planned" });
    expect(resolveSemanticApiCall(call("$data.get", "detail-data"), context("detail-input"))).toMatchObject({ availability: "planned" });
    expect(() => resolveSemanticApiCall(call("$overlay.open", "detail-overlay"), context("detail-input")))
      .toThrow(/SCRIPT_API_INPUT_INVALID.*unknown overlay/);
  });

  it("validates record-list values against the target and page mock-data schema", () => {
    expect(resolveSemanticApiCall(call("$control.setData", "records", [{ id: "visitor-2", name: "李四" }]), context())).toMatchObject({ availability: "supported" });
    expect(resolveSemanticApiCall(call("$data.set", "visitor-records", [{ id: "visitor-2", name: "李四" }]), context())).toMatchObject({ availability: "planned" });
    for (const records of [[{ id: "visitor-2", name: 1 }], [{ other: "李四" }], [{ id: "visitor-2", name: "李四", extra: true }], ["李四"]]) {
      expect(() => resolveSemanticApiCall(call("$control.setData", "records", records), context())).toThrow(/SCRIPT_API_INPUT_INVALID.*record-list/);
      expect(() => resolveSemanticApiCall(call("$data.set", "visitor-records", records), context())).toThrow(/SCRIPT_API_INPUT_INVALID.*record-list/);
    }
  });

  it("validates capability-specific values, record keys, unique key lists, and scalar overlay results", () => {
    expect(() => resolveSemanticApiCall(call("$control.setValue", "status-filter", 1), context()))
      .toThrow(/SCRIPT_API_INPUT_INVALID.*input value/);
    expect(() => resolveSemanticApiCall(call("$state.set", "selected-name", "不存在"), context()))
      .toThrow(/SCRIPT_API_INPUT_INVALID.*record key/);
    expect(() => resolveSemanticApiCall(call("$state.set", "selected-names", ["visitor-1", "visitor-1"]), context()))
      .toThrow(/SCRIPT_API_INPUT_INVALID.*unique/);
    expect(() => resolveSemanticApiCall(call("$state.set", "selected-names", ["不存在"]), context()))
      .toThrow(/SCRIPT_API_INPUT_INVALID.*record key/);
    expect(() => resolveSemanticApiCall(call("$overlay.close", "detail-overlay", { accepted: true }), context()))
      .toThrow(/SCRIPT_API_INPUT_INVALID.*scalar/);
    expect(resolveSemanticApiCall(call("$overlay.close", "detail-overlay", "accepted"), context())).toMatchObject({ availability: "planned" });
  });

  it.each([
    ["$control.setVisible", ["plain-text", "yes"]],
    ["$control.setEnabled", ["missing", true]],
    ["$overlay.open", ["missing-overlay"]],
    ["$overlay.close", ["detail-overlay", null, "extra"]],
    ["$state.get", ["missing-state"]],
    ["$state.set", ["submitted"]],
    ["$data.get", ["missing-data"]],
    ["$data.set", ["visitor-records"]],
    ["$feedback.show", ["debug", "完成"]],
    ["$timer.after", [99, "refresh-script"]],
    ["$timer.after", [100, "missing-script"]],
    ["$timer.repeat", [100, 11, "refresh-script"]],
  ])("validates the full planned %s contract before reporting planned", (api, args) => {
    expect(() => resolveSemanticApiCall(call(api, ...args), context())).toThrow(/SCRIPT_API_INPUT_INVALID|SCRIPT_CONTROL_NOT_FOUND/);
  });

  it("rejects hostile call descriptors without reading or reflecting through them", () => {
    let reads = 0;
    const hostile = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(hostile, "api", { enumerable: true, get: () => { reads += 1; return "$control.getValue"; } });
    Object.defineProperty(hostile, "args", { enumerable: true, value: ["status-filter"] });
    expect(() => resolveSemanticApiCall(hostile, context())).toThrow(/SCRIPT_API_INPUT_INVALID/);
    expect(reads).toBe(0);

    let traps = 0;
    const proxy = new Proxy(call("$control.getValue", "status-filter"), {
      ownKeys(value) { traps += 1; return Reflect.ownKeys(value); },
    });
    expect(() => resolveSemanticApiCall(proxy, context())).toThrow(/SCRIPT_API_INPUT_INVALID/);
    expect(traps).toBe(0);
  });

  it("bounds descriptor-safe cloning before schema validation", () => {
    const oversized = {
      implementation: Array.from({ length: 10_000 }, (_, index) => ({ index, a: 1, b: 2, c: 3, d: 4, e: 5 })),
      ownerControlId: "go",
    };
    expect(() => createSemanticScriptApiContext(oversized)).toThrow(/input node budget exceeds 50000/);
  });
});
