import { createHash } from "node:crypto";
import {
  canonicalServerHash,
  type ScriptPlan,
  type SolutionImplementationPlan,
  type UIImplementationSpecV2,
} from "@kf/contracts";
import { describe, expect, it } from "vitest";
import { createDefaultModuleRegistry } from "../modules/module-registry.js";
import { solutionModuleRegistryHash } from "../solution-compile/solution-provenance.js";
import { compileInteractions, traceInteraction } from "./interaction-compiler.js";

const theme = {
  background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32",
  textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;
const intent = {
  importance: "primary" as const, visualWeight: 3, readingOrder: 0, density: "comfortable" as const,
  groupWith: [], width: { mode: "fixed" as const, value: 120 },
  height: { mode: "fixed" as const, value: 40 }, align: "start" as const,
};

function fixture(kind: "native" | "script" | "planned" = "native") {
  const script: ScriptPlan = {
    id: "load-records", purpose: "加载本地记录", kind: "custom", programVersion: "semantic-js/v1",
    source: kind === "planned"
      ? '$control.setValue("filter", "open");'
      : '$control.setData("records", []);',
    inputs: [],
    outputs: [{ name: "records-output", description: "记录输出", refKind: "control", refId: kind === "planned" ? "filter" : "records" }],
  };
  const isNative = kind === "native";
  const plan: SolutionImplementationPlan = {
    schema: "kf-solution-implementation/v1", projectKey: "interaction", blueprintHash: "a".repeat(64), candidateBundleHash: "b".repeat(64),
    theme, roleStyles: [{ role: "content", declarations: {}, states: {} }],
    mockData: [{ id: "visitor-records", purpose: "访客", fields: [{ key: "id", label: "标识", type: "text" }], records: [{ values: [{ field: "id", value: "v1" }] }] }],
    localState: [], overlays: [], scripts: isNative ? [] : [script],
    actions: isNative
      ? [{ id: "navigate", kind: "navigate-page", targetPageId: "detail", afterActionIds: [] }]
      : [{ id: "run-load", kind: "run-script", scriptId: script.id, afterActionIds: [] }],
    pages: [
      {
        id: "home", title: "首页", purpose: "首页", canvas: "desktop", sourceBlueprintPageId: "bp-home",
        sourceBlueprintRegionIds: ["region"], initialStateIds: [], root: {
          id: "home-root", kind: "layout", layout: "column", sourceBlueprintRegionIds: ["region"], intent,
          children: [
            { id: "go", kind: "control", capabilityId: "button", content: "执行", properties: [], tabIds: [], styleRole: "content", sourceBlueprintRegionIds: ["region"], intent, eventBindings: [{ semanticEvent: "click", actionIds: [isNative ? "navigate" : "run-load"] }] },
            { id: "filter", kind: "control", capabilityId: "input", content: "筛选", properties: [], tabIds: [], styleRole: "content", sourceBlueprintRegionIds: ["region"], intent, eventBindings: [] },
            { id: "records", kind: "control", capabilityId: "easyui.1", content: "记录", properties: [], tabIds: [], styleRole: "content", sourceBlueprintRegionIds: ["region"], intent, mockDataId: "visitor-records", eventBindings: [] },
          ],
        },
      },
      {
        id: "detail", title: "详情", purpose: "详情", canvas: "desktop", sourceBlueprintPageId: "bp-detail",
        sourceBlueprintRegionIds: ["detail-region"], initialStateIds: [], root: {
          id: "detail-text", kind: "control", capabilityId: "text", content: "详情", properties: [], tabIds: [], styleRole: "content",
          sourceBlueprintRegionIds: ["detail-region"], intent, eventBindings: [],
        },
      },
    ],
  };
  const control = (id: string, capabilityId: string, page: "home" | "detail", parentId?: string) => ({
    id, role: "content", capabilityId, ...(parentId === undefined ? {} : { parentId }), depth: parentId === undefined ? 0 : 1,
    zIndex: 0, geometry: { x: 0, y: 0, width: parentId === undefined ? 1280 : 120, height: parentId === undefined ? 720 : 40 },
    nativeProperties: {}, sourceSolutionNodeId: id, sourceBlueprintPageId: page === "home" ? "bp-home" : "bp-detail",
    sourceBlueprintRegionIds: [page === "home" ? "region" : "detail-region"], eventBindings: [],
    ...(capabilityId.startsWith("layout.") ? { compiledLayout: { kind: "column" as const, overflow: "visible" as const } } : {}),
  });
  const implementation: UIImplementationSpecV2 = {
    schema: "kf-ui-implementation/v2", compatibility: "native", sourceSolutionPlanHash: canonicalServerHash(plan),
    sourceModuleRegistryHash: solutionModuleRegistryHash(plan, createDefaultModuleRegistry()), theme,
    compiledRoleStyles: {}, compiledActions: [], compiledScripts: [],
    pages: [
      { compatibility: "native", id: "home", width: 1280, height: 720, sourceBlueprintPageId: "bp-home", controls: [
        control("go", "button", "home", "home-root"), control("filter", "input", "home", "home-root"),
        { ...control("records", "easyui.1", "home", "home-root"), dataBinding: { mockDataId: "visitor-records", records: [{ id: "v1" }] } },
        control("home-root", "layout.4", "home"),
      ] },
      { compatibility: "native", id: "detail", width: 1280, height: 720, sourceBlueprintPageId: "bp-detail", controls: [control("detail-text", "text", "detail")] },
    ],
    runtimeCorrelation: {
      controls: [
        { semanticControlId: "go", instanceName: "Button1" }, { semanticControlId: "filter", instanceName: "Input1" },
        { semanticControlId: "records", instanceName: "Table1" }, { semanticControlId: "home-root", instanceName: "Layout1" },
        { semanticControlId: "detail-text", instanceName: "Text1" },
      ],
      pages: [
        { semanticPageId: "home", pageGuid: "00000000-0000-4000-8000-000000000001" },
        { semanticPageId: "detail", pageGuid: "00000000-0000-4000-8000-000000000002" },
      ],
    },
  };
  return { plan, implementation };
}

describe("compileInteractions", () => {
  it("compiles native navigation first and closes its declared trigger", () => {
    const input = fixture("native");
    const original = structuredClone(input);
    const result = compileInteractions(input);

    expect(input).toEqual(original);
    expect(result.diagnostics.errors).toEqual([
      expect.objectContaining({ code: "JOURNEY_PROVENANCE_UNAVAILABLE", nodeId: input.plan.blueprintHash }),
    ]);
    expect(result.diagnostics.requests).toEqual([]);
    expect(result.implementation.compiledActions).toHaveLength(1);
    expect(result.implementation.compiledScripts).toEqual([]);
    expect(traceInteraction(result, "go", "click")).toEqual(["navigate"]);
  });

  it("compiles an evidence-backed Input/Button event to Table SetData script", () => {
    const result = compileInteractions(fixture("script"));

    expect(result.diagnostics.errors).toEqual([
      expect.objectContaining({ code: "JOURNEY_PROVENANCE_UNAVAILABLE" }),
    ]);
    expect(result.implementation.compiledScripts).toHaveLength(1);
    const module = result.implementation.compiledScripts[0]!;
    expect(module.source).toBe("Table1.SetData([]);\n");
    expect(module.sourceHash).toBe(createHash("sha256").update(module.source).digest("hex"));
    expect(module.source).not.toMatch(/\$control|load-records|visitor-records/);
    expect(traceInteraction(result, "go", "click")).toEqual(["run-load"]);
  });

  it("closes the reviewed Cell-click record event through Input read and Table SetData", () => {
    const input = fixture("script");
    const script = input.plan.scripts[0]!;
    if (script.kind !== "custom") throw new Error("custom fixture required");
    script.source = 'const selectedRecord = $event.record();\nconst filterValue = $control.getValue("filter");\n$control.setData("records", []);';
    script.inputs = [{ name: "filter-input", description: "筛选输入", refKind: "control", refId: "filter" }];
    const root = input.plan.pages[0]!.root;
    if (root.kind !== "layout" || root.children[0]!.kind !== "control" || root.children[2]!.kind !== "control") throw new Error("control fixture required");
    root.children[0]!.eventBindings = [];
    root.children[2]!.eventBindings = [{ semanticEvent: "row-click", actionIds: ["run-load"] }];
    input.implementation.sourceSolutionPlanHash = canonicalServerHash(input.plan);

    const result = compileInteractions(input);
    const module = result.implementation.compiledScripts[0]!;
    expect(module.source).toContain("arguments[1]");
    expect(module.source).toContain("Input1.Value");
    expect(module.source).toContain("Table1.SetData([])");
    const page = result.implementation.pages[0]!;
    if (page.compatibility !== "native") throw new Error("native fixture required");
    expect(page.controls.find((control) => control.id === "records")!.eventBindings[0]).toMatchObject({ kfEvent: "Cell-click", linkId: 200006 });
  });

  it("returns a deterministic blocking request for a planned API without inventing runtime", () => {
    const first = compileInteractions(fixture("planned"));
    const second = compileInteractions(fixture("planned"));

    expect(first).toEqual(second);
    expect(first.diagnostics.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INTERACTION_SCRIPT_BLOCKED", nodeId: "load-records" }),
    ]));
    expect(first.diagnostics.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceScriptId: "load-records", status: "blocked" }),
    ]));
    expect(first.implementation.compiledScripts).toEqual([]);
  });

  it("rejects timer cycles and refuses already-compiled or adapted-v1 inputs", () => {
    const cyclic = fixture("script");
    const scriptA = cyclic.plan.scripts[0]!;
    if (scriptA.kind !== "custom") throw new Error("custom fixture required");
    scriptA.source = '$timer.after(100, "refresh-records");'; scriptA.outputs = [];
    cyclic.plan.scripts.push({
      id: "refresh-records", purpose: "刷新本地记录", kind: "custom", programVersion: "semantic-js/v1",
      source: '$timer.after(100, "load-records");', inputs: [], outputs: [],
    });
    cyclic.plan.actions.push({ id: "run-refresh", kind: "run-script", scriptId: "refresh-records", afterActionIds: [] });
    const root = cyclic.plan.pages[0]!.root;
    if (root.kind !== "layout" || root.children[0]!.kind !== "control") throw new Error("control fixture required");
    root.children[0]!.eventBindings[0]!.actionIds.push("run-refresh");
    cyclic.implementation.sourceSolutionPlanHash = canonicalServerHash(cyclic.plan);
    expect(compileInteractions(cyclic).diagnostics.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INTERACTION_SCRIPT_CYCLE", nodeId: "load-records" }),
    ]));

    const precompiled = fixture("native");
    const native = compileInteractions(precompiled);
    expect(() => compileInteractions({ plan: precompiled.plan, implementation: native.implementation })).toThrow(/INTERACTION_INPUT_ALREADY_COMPILED/);

    const adapted = fixture("native");
    adapted.implementation = { ...adapted.implementation, compatibility: "adapted-v1" };
    expect(() => compileInteractions(adapted)).toThrow(/INTERACTION_INPUT_INVALID/);
  });

  it("recomputes both authoritative provenance hashes before every tier", () => {
    for (const kind of ["native", "script"] as const) {
      const planHash = fixture(kind);
      planHash.implementation.sourceSolutionPlanHash = "c".repeat(64);
      expect(() => compileInteractions(planHash)).toThrow(/INTERACTION_INPUT_PROVENANCE_MISMATCH.*solution-plan/);

      const registryHash = fixture(kind);
      registryHash.implementation.sourceModuleRegistryHash = "d".repeat(64);
      expect(() => compileInteractions(registryHash)).toThrow(/INTERACTION_INPUT_PROVENANCE_MISMATCH.*module-registry/);
    }
  });

  it("preserves normalized topology within one tier instead of sorting artifact ids", () => {
    const input = fixture("script");
    input.plan.scripts.push({
      id: "read-filter", purpose: "读取筛选", kind: "custom", programVersion: "semantic-js/v1",
      source: 'const value = $control.getValue("filter");',
      inputs: [{ name: "filter-input", description: "筛选输入", refKind: "control", refId: "filter" }], outputs: [],
    });
    input.plan.actions = [
      { id: "z-read-first", kind: "run-script", scriptId: "read-filter", afterActionIds: ["a-load-second"] },
      { id: "a-load-second", kind: "run-script", scriptId: "load-records", afterActionIds: [] },
    ];
    const root = input.plan.pages[0]!.root;
    if (root.kind !== "layout" || root.children[0]!.kind !== "control") throw new Error("control fixture required");
    root.children[0]!.eventBindings[0]!.actionIds = ["z-read-first", "a-load-second"];
    input.implementation.sourceSolutionPlanHash = canonicalServerHash(input.plan);
    const result = compileInteractions(input);
    const page = result.implementation.pages[0]!;
    if (page.compatibility !== "native") throw new Error("native fixture required");
    const binding = page.controls.find((control) => control.id === "go")!.eventBindings[0]!;
    const sourceIds = binding.scriptModuleIds.map((id) => result.implementation.compiledScripts.find((module) => module.id === id)!.sourceScriptId);
    expect(sourceIds).toEqual(["read-filter", "load-records"]);
    expect(result.diagnostics.errors).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INTERACTION_CLOSURE_MISSING", nodeId: "z-read-first" }),
    ]));
  });

  it("fails closed when a trigger graph has no visible terminal or a conditional-only result", () => {
    const readOnly = fixture("script");
    const script = readOnly.plan.scripts[0]!;
    if (script.kind !== "custom") throw new Error("custom fixture required");
    script.source = 'const value = $control.getValue("filter");';
    script.inputs = [{ name: "filter-input", description: "筛选输入", refKind: "control", refId: "filter" }];
    script.outputs = [];
    readOnly.implementation.sourceSolutionPlanHash = canonicalServerHash(readOnly.plan);
    expect(compileInteractions(readOnly).diagnostics.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INTERACTION_CLOSURE_MISSING", nodeId: "run-load" }),
    ]));

    const conditional = fixture("script");
    const conditionalScript = conditional.plan.scripts[0]!;
    if (conditionalScript.kind !== "custom") throw new Error("custom fixture required");
    conditionalScript.source = 'const value = $control.getValue("filter");\nif (value === "open") { $control.setData("records", []); }';
    conditionalScript.inputs = [{ name: "filter-input", description: "筛选输入", refKind: "control", refId: "filter" }];
    conditional.implementation.sourceSolutionPlanHash = canonicalServerHash(conditional.plan);
    expect(compileInteractions(conditional).diagnostics.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INTERACTION_CONDITIONAL_CLOSURE_UNPROVEN", nodeId: "run-load" }),
    ]));
  });

  it("does not invent output-consumer evidence for a blocked producer", () => {
    const input = fixture("planned");
    const script = input.plan.scripts[0]!;
    if (script.kind !== "custom") throw new Error("custom fixture required");
    script.source = '$data.set("visitor-records", []);';
    script.outputs = [{ name: "records-output", description: "记录输出", refKind: "mock-data", refId: "visitor-records" }];
    input.implementation.sourceSolutionPlanHash = canonicalServerHash(input.plan);

    const result = compileInteractions(input);
    expect(result.diagnostics.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INTERACTION_SCRIPT_BLOCKED", nodeId: "load-records" }),
    ]));
    expect(result.diagnostics.errors).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INTERACTION_OUTPUT_CONSUMER_MISSING", nodeId: "load-records" }),
    ]));
  });

  it("rejects an afterAction edge that crosses two declared triggers", () => {
    const input = fixture("script");
    input.plan.actions = [
      { id: "from-button", kind: "run-script", scriptId: "load-records", afterActionIds: ["from-table"] },
      { id: "from-table", kind: "navigate-page", targetPageId: "detail", afterActionIds: [] },
    ];
    const root = input.plan.pages[0]!.root;
    if (root.kind !== "layout" || root.children[0]!.kind !== "control" || root.children[2]!.kind !== "control") throw new Error("control fixture required");
    root.children[0]!.eventBindings = [{ semanticEvent: "click", actionIds: ["from-button"] }];
    root.children[2]!.eventBindings = [{ semanticEvent: "row-click", actionIds: ["from-table"] }];
    input.implementation.sourceSolutionPlanHash = canonicalServerHash(input.plan);
    expect(() => compileInteractions(input)).toThrow(/INTERACTION_CROSS_TRIGGER_EDGE.*from-button.*from-table/);
  });

  it("blocks a same-event cross-tier order that the binding contract cannot represent", () => {
    const input = fixture("script");
    input.plan.actions = [
      { id: "z-native-first", kind: "navigate-page", targetPageId: "detail", afterActionIds: ["a-script-second"] },
      { id: "a-script-second", kind: "run-script", scriptId: "load-records", afterActionIds: [] },
    ];
    const root = input.plan.pages[0]!.root;
    if (root.kind !== "layout" || root.children[0]!.kind !== "control") throw new Error("control fixture required");
    root.children[0]!.eventBindings[0]!.actionIds = ["z-native-first", "a-script-second"];
    input.implementation.sourceSolutionPlanHash = canonicalServerHash(input.plan);
    const result = compileInteractions(input);
    expect(result.diagnostics.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: "INTERACTION_BINDING_TIER_ORDER_UNREPRESENTABLE", nodeId: "go" }),
    ]));
    expect(result.diagnostics.requests).toEqual(expect.arrayContaining([
      expect.objectContaining({ actionId: "z-native-first", status: "blocked" }),
      expect.objectContaining({ actionId: "a-script-second", status: "blocked" }),
    ]));
    expect(result.implementation.compiledActions).toEqual([]);
    expect(result.implementation.compiledScripts).toEqual([]);
  });
});
