import { describe, expect, it } from "vitest";
import type { UIImplementationSpecV2 } from "@kf/contracts";
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
        ],
      },
      {
        compatibility: "native", id: "detail-page", width: 1280, height: 720, sourceBlueprintPageId: "bp-detail",
        controls: [control("detail-input", "input", "bp-detail")],
      },
    ],
    runtimeCorrelation: {
      controls: [
        { semanticControlId: "go", instanceName: "Button1" },
        { semanticControlId: "status-filter", instanceName: "Input1" },
        { semanticControlId: "records", instanceName: "Table1" },
        { semanticControlId: "status-select", instanceName: "Select1" },
        { semanticControlId: "plain-text", instanceName: "Text1" },
        { semanticControlId: "detail-input", instanceName: "Input2" },
      ],
      pages: [
        { semanticPageId: "home", pageGuid: "00000000-0000-4000-8000-000000000001" },
        { semanticPageId: "detail-page", pageGuid: "00000000-0000-4000-8000-000000000002" },
      ],
    },
  } as UIImplementationSpecV2;
}

const call = (api: string, ...args: readonly unknown[]) => ({ api, args });
const context = () => createSemanticScriptApiContext({ implementation: implementation(), ownerControlId: "go" });

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
    expect(resolveSemanticApiCall(call("$control.setData", "status-select", []), context())).toEqual({
      availability: "planned", kind: "planned", api: "$control.setData", reason: "SCRIPT_METHOD_NOT_SUPPORTED",
    });
  });

  it("maps the reviewed semantic row-click alias to exact Cell-click evidence", () => {
    expect(resolveEventBinding({ controlId: "records", semanticEvent: "row-click" }, context())).toMatchObject({
      availability: "supported", kind: "event", semanticControlId: "records", instanceName: "Table1",
      kfEvent: "Cell-click", linkId: 200006,
      arguments: [
        { name: "record", position: 1, valueKind: "record" },
        { name: "column", position: 2, valueKind: "scalar" },
      ],
    });
    expect(() => resolveEventBinding({ controlId: "records", semanticEvent: "Row-click" }, context()))
      .toThrow(/SCRIPT_EVENT_NOT_SUPPORTED: records/);
    expect(() => resolveEventBinding({ controlId: "records", semanticEvent: "selection-change" }, context()))
      .toThrow(/SCRIPT_EVENT_NOT_SUPPORTED: records/);
  });

  it("exposes the record only from the exact active event argument profile", () => {
    const active = createSemanticScriptApiContext({
      implementation: implementation(), ownerControlId: "records", activeEvent: { controlId: "records", semanticEvent: "row-click" },
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
    ["$state.set", ["submitted"], "SCRIPT_PAGE_LOCAL_RUNTIME_UNAVAILABLE"],
    ["$data.get", ["records"], "SCRIPT_PAGE_LOCAL_RUNTIME_UNAVAILABLE"],
    ["$data.set", ["records"], "SCRIPT_PAGE_LOCAL_RUNTIME_UNAVAILABLE"],
    ["$feedback.show", ["success", "完成"], "SCRIPT_FEEDBACK_NOT_SERIALIZABLE"],
    ["$timer.after", [100], "SCRIPT_TIMER_NOT_SERIALIZABLE"],
    ["$timer.repeat", [100, 2], "SCRIPT_TIMER_NOT_SERIALIZABLE"],
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
      implementation: implementation(), ownerControlId: "records", activeEvent: { controlId: "records", semanticEvent: "row-click" },
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
    Object.defineProperty(hostile, "implementation", { enumerable: true, get: () => { reads += 1; return implementation(); } });
    Object.defineProperty(hostile, "ownerControlId", { enumerable: true, value: "go" });
    expect(() => createSemanticScriptApiContext(hostile)).toThrow(/SCRIPT_API_CONTEXT_INVALID/);
    expect(reads).toBe(0);

    expect(() => createSemanticScriptApiContext({
      implementation: implementation(), ownerControlId: "go", evidence: [{ kfEvent: "Click" }],
    })).toThrow(/SCRIPT_API_CONTEXT_INVALID/);

    let traps = 0;
    const proxy = new Proxy({ implementation: implementation(), ownerControlId: "go" }, {
      getPrototypeOf(value) { traps += 1; return Reflect.getPrototypeOf(value); },
      ownKeys(value) { traps += 1; return Reflect.ownKeys(value); },
    });
    expect(() => createSemanticScriptApiContext(proxy)).toThrow(/SCRIPT_API_CONTEXT_INVALID/);
    expect(traps).toBe(0);
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
