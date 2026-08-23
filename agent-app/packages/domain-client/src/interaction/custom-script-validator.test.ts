import { createHash } from "node:crypto";
import { canonicalServerHash, type ScriptPlan, type SolutionImplementationPlan, type UIImplementationSpecV2 } from "@kf/contracts";
import { describe, expect, it } from "vitest";
import { renderScriptTemplate } from "./script-template-registry.js";
import {
  createSemanticScriptApiContext,
  createSemanticScriptValidationIdentity,
  requireSemanticScriptValidationIdentity,
} from "./semantic-script-api.js";
import { createDefaultModuleRegistry } from "../modules/module-registry.js";
import { solutionModuleRegistryHash } from "../solution-compile/solution-provenance.js";
import {
  getValidatedScriptProgram,
  requireValidatedScriptProgram,
  validateCustomScript,
  type CustomScriptValidationInput,
} from "./custom-script-validator.js";

const port = (name: string, refKind: "control" | "local-state" | "mock-data", refId = name) => ({
  name, description: name, refKind, refId,
});

const theme = {
  background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32",
  textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;
const intent: SolutionImplementationPlan["pages"][number]["root"]["intent"] = {
  importance: "primary", visualWeight: 3, readingOrder: 0, density: "comfortable", groupWith: [],
  width: { mode: "fixed", value: 120 }, height: { mode: "fixed", value: 40 }, align: "start",
};
const script = (id: string): ScriptPlan => ({
  id, purpose: `运行${id}`, kind: "custom" as const, programVersion: "declarative-steps/v1" as const,
  inputs: [], outputs: [], steps: [{ order: 1, intent: `执行${id}`, inputNames: [], outputNames: [] }],
});
const semanticPlan = (scripts: SolutionImplementationPlan["scripts"] = [script("current-script"), script("refresh-script"), script("pulse-script")]): SolutionImplementationPlan => ({
  schema: "kf-solution-implementation/v1", projectKey: "validator", blueprintHash: "a".repeat(64), candidateBundleHash: "b".repeat(64),
  theme, roleStyles: [{ role: "content", declarations: {}, states: {} }], mockData: [], localState: [],
  actions: scripts.filter((candidate) => candidate.kind === "custom" && candidate.programVersion === "semantic-js/v1")
    .map((candidate) => ({ id: `run-${candidate.id}`, kind: "run-script" as const, scriptId: candidate.id, afterActionIds: [], journeyStepRefs: [{ journeyId: "review-records", stepIndex: 0 }] })),
  scripts, overlays: [],
  pages: [{
    id: "home", title: "首页", purpose: "脚本宿主页", canvas: "desktop", sourceBlueprintPageId: "bp-home",
    sourceBlueprintRegionIds: ["region"], initialStateIds: [], root: {
      id: "home-root", kind: "layout", layout: "column", sourceBlueprintRegionIds: ["region"], intent,
      children: [{
        id: "go", kind: "control", capabilityId: "button", content: "执行", properties: [], tabIds: [], styleRole: "content",
        sourceBlueprintRegionIds: ["region"], intent,
        eventBindings: scripts.filter((candidate) => candidate.kind === "custom" && candidate.programVersion === "semantic-js/v1")
          .map((candidate) => ({ semanticEvent: "click", actionIds: [`run-${candidate.id}`] })),
      }],
    },
  }],
});
const semanticImplementation = (plan = semanticPlan()): UIImplementationSpecV2 => {
  return {
    schema: "kf-ui-implementation/v2", compatibility: "native", theme, compiledRoleStyles: {}, compiledActions: [], compiledScripts: [],
    sourceSolutionPlanHash: canonicalServerHash(plan), sourceModuleRegistryHash: solutionModuleRegistryHash(plan, createDefaultModuleRegistry()),
    pages: [{
      compatibility: "native", id: "home", width: 1280, height: 720, sourceBlueprintPageId: "bp-home", controls: [
        {
          id: "go", role: "content", capabilityId: "button", parentId: "home-root", depth: 1, zIndex: 0,
          geometry: { x: 0, y: 0, width: 120, height: 40 }, nativeProperties: {}, sourceSolutionNodeId: "go",
          sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region"], eventBindings: [],
        },
        {
          id: "home-root", role: "layout", capabilityId: "layout.4", depth: 0, zIndex: 0,
          geometry: { x: 0, y: 0, width: 1280, height: 720 }, nativeProperties: {}, sourceSolutionNodeId: "home-root",
          sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region"], eventBindings: [],
          compiledLayout: { kind: "column", overflow: "visible" },
        },
      ],
    }],
    runtimeCorrelation: {
      controls: [{ semanticControlId: "go", instanceName: "Button1" }, { semanticControlId: "home-root", instanceName: "Layout1" }],
      pages: [{ semanticPageId: "home", pageGuid: "00000000-0000-4000-8000-000000000001" }],
    },
  };
};
const trustedContext = (plan = semanticPlan()) => createSemanticScriptApiContext({
  plan, implementation: semanticImplementation(plan), ownerControlId: "go",
});

const recordFixture = () => {
  const base = semanticPlan();
  const root = base.pages[0]!.root;
  if (root.kind !== "layout") throw new Error("record fixture requires a layout root");
  const tableNode = (id: string, mockDataId: string) => ({
    id, kind: "control" as const, capabilityId: "easyui.1", content: id, properties: [], tabIds: [], styleRole: "content",
    sourceBlueprintRegionIds: ["region"], intent, eventBindings: [], mockDataId,
  });
  const plan: SolutionImplementationPlan = {
    ...base,
    mockData: [
      { id: "visitor-records", purpose: "访客", fields: [{ key: "id", label: "标识", type: "text" }, { key: "name", label: "姓名", type: "text" }], records: [{ values: [{ field: "id", value: "v1" }, { field: "name", value: "张三" }] }] },
      { id: "audit-records", purpose: "审计", fields: [{ key: "auditId", label: "编码", type: "text" }], records: [{ values: [{ field: "auditId", value: "a1" }] }] },
    ],
    pages: [{ ...base.pages[0]!, root: { ...root, children: [...root.children, tableNode("visitor-table", "visitor-records"), tableNode("audit-table", "audit-records")] } }],
  };
  const implementation = semanticImplementation(plan);
  type NativePage = Extract<UIImplementationSpecV2["pages"][number], { compatibility: "native" }>;
  const implementationPage = implementation.pages[0] as NativePage;
  const tableControl = (id: string, mockDataId: string): NativePage["controls"][number] => ({
    id, role: "content", capabilityId: "easyui.1", parentId: "home-root", depth: 1, zIndex: 0,
    geometry: { x: 0, y: 0, width: 120, height: 40 }, nativeProperties: {}, sourceSolutionNodeId: id,
    sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region"], eventBindings: [],
    dataBinding: { mockDataId, records: mockDataId === "visitor-records" ? [{ id: "v1", name: "张三" }] : [{ auditId: "a1" }] },
  });
  const withTables: UIImplementationSpecV2 = {
    ...implementation,
    pages: [{ ...implementationPage, controls: [...implementationPage.controls,
      tableControl("visitor-table", "visitor-records"), tableControl("audit-table", "audit-records")] }],
    runtimeCorrelation: {
      ...implementation.runtimeCorrelation!,
      controls: [...implementation.runtimeCorrelation!.controls,
        { semanticControlId: "visitor-table", instanceName: "Table1" }, { semanticControlId: "audit-table", instanceName: "Table2" }],
    },
  };
  return { plan, context: createSemanticScriptApiContext({ plan, implementation: withTables, ownerControlId: "go" }) };
};

const validate = (source: string, overrides: Partial<CustomScriptValidationInput> = {}) => validateCustomScript({
  source,
  scriptId: "current-script",
  inputs: [],
  outputs: [],
  ...overrides,
});

describe("constrained custom script validation", () => {
  it("parses reviewed filtering syntax and proves declared reads and writes", () => {
    const source = [
      'const records = $data.get("records");',
      'const status = $control.getValue("status");',
      'const filtered = records.slice(0, 100).filter((record) => String(record["status"]).startsWith(String(status)));',
      '$data.set("filtered-records", filtered);',
    ].join("\n");
    const result = validate(source, {
      inputs: [port("records", "mock-data"), port("status", "control")],
      outputs: [port("filtered", "mock-data", "filtered-records")],
    });

    expect(result.calls).toEqual([
      { api: "$data.get", namespace: "$data", method: "get", targetId: "records", availability: "unresolved" },
      { api: "$control.getValue", namespace: "$control", method: "getValue", targetId: "status", availability: "unresolved" },
      { api: "$data.set", namespace: "$data", method: "set", targetId: "filtered-records", availability: "unresolved" },
    ]);
    expect(result.inputReads).toEqual(["records", "status"]);
    expect(result.outputWrites).toEqual(["filtered-records"]);
    expect(result.sourceHash).toBe(createHash("sha256").update(source, "utf8").digest("hex"));
    expect(getValidatedScriptProgram(result).type).toBe("Program");
  });

  it("accepts the public ID-only input/output form without trusting inferred KF types", () => {
    const result = validateCustomScript({
      source: 'const records = $data.get("records"); $data.set("filtered-records", records.slice(0, 100));',
      inputs: ["records"],
      outputs: ["filtered-records"],
    });
    expect(result.inputReads).toEqual(["records"]);
    expect(result.outputWrites).toEqual(["filtered-records"]);
  });

  it.each([
    "fetch('/x')",
    "eval('1')",
    "new Function('return 1')",
    "document.querySelector('x')",
    "while(true){}",
    "for(;;){}",
    "Object.prototype.x=1",
    "import('x')",
    "window.location='x'",
    "globalThis.x = 1",
    "localStorage.setItem('x', 'y')",
    "const call = $data['get']; call('records')",
    "class Unsafe {}",
    "const value = { get x() { return 1; } }",
    "const value = tag`unsafe`",
    "const matcher = /(a+)+$/",
    "const matcher = /(a{1,3})+$/",
  ])("rejects forbidden or dynamically escaping syntax: %s", (source) => {
    expect(() => validate(source)).toThrow(/CUSTOM_SCRIPT_FORBIDDEN/);
  });

  it("rejects semantic, standard-library, and function aliases as first-class values", () => {
    for (const source of [
      'let f = () => 1; f = $control["getValue"]; f("Button1");',
      'const f = $control.getValue; f("Button1");',
      "const max = Math.max; const value = max(1, 2);",
      'const method = "max"; const value = Math[method](1, 2);',
      "const api = $control;",
      "const math = Math;",
    ]) expect(() => validate(source)).toThrow(/CUSTOM_SCRIPT_FORBIDDEN/);
  });

  it("rejects undeclared semantic reads, writes, and runtime-looking IDs", () => {
    expect(() => validate('$control.getValue("Button1");', {
      inputs: [port("status", "control")],
    })).toThrow(/CUSTOM_SCRIPT_UNDECLARED_INPUT.*Button1/);
    expect(() => validate('$state.set("other-state", true);', {
      outputs: [port("submitted", "local-state", "submitted-state")],
    })).toThrow(/CUSTOM_SCRIPT_UNDECLARED_OUTPUT.*other-state/);
    expect(() => validate('$page.navigate("00000000-0000-4000-8000-000000000001");'))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*GUID/);
    expect(() => validate('$page.navigate("k00000000-0000-4000-8000-000000000001");'))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*GUID/);
  });

  it("rejects undeclared globals, dynamic property escapes, and reserved member paths", () => {
    expect(() => validate("const leaked = unknownGlobal;")).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*unknownGlobal/);
    expect(() => validate('const record = { "name": "A" }; const field = "name"; const value = record[field];'))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*computed property/);
    expect(() => validate('const values = [1]; const leaked = values["constructor"];'))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*constructor/);
    expect(() => validate("const clock = Date();")).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*Date/);
    expect(() => validate('const parsed = Date.parse("2026-01-01");')).not.toThrow();
    expect(() => validate("const arguments = [null, { code: 'forged' }]; const record = $event.record();"))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*bindings require unique safe identifiers/);
    expect(() => validate("function read(arguments) { return arguments[1]; } read([]);"))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*bindings require unique safe identifiers/);
  });

  it("enforces semantic API arity and plan-declared non-port references", () => {
    expect(() => validate('$feedback.show("info");')).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*arity/);
    expect(() => validate('$page.navigate("detail-page");')).toThrow(/CUSTOM_SCRIPT_UNDECLARED_INPUT.*detail-page/);
    expect(validate('$page.navigate("home");', { context: trustedContext() }).calls[0]).toMatchObject({ availability: "supported", targetId: "home" });
    expect(validate('const visible = true; $control.setVisible("go", visible);', {
      context: trustedContext(), outputs: [port("go", "control")],
    }).calls[0]).toMatchObject({ availability: "planned", targetId: "go" });
    expect(validate('const target = "go"; $control.setVisible(target, true);', {
      context: trustedContext(), outputs: [port("go", "control")],
    }).calls[0]).toMatchObject({ availability: "planned", targetId: "go" });
    expect(validate('const visible = Boolean(1); $control.setVisible("go", visible);', {
      context: trustedContext(), outputs: [port("go", "control")],
    }).calls[0]).toMatchObject({ availability: "planned", targetId: "go" });
    expect(() => validate('let visible = true; if (true) { visible = "yes"; } if (true) { visible = false; } $control.setVisible("go", visible);', {
      context: trustedContext(), outputs: [port("go", "control")],
    })).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*cannot be proven/);
    expect(validate('$feedback.show("info", "Status: ready");').calls[0]).toMatchObject({ api: "$feedback.show", availability: "unresolved" });
  });

  it("rejects constant-folded selectors and CSS assembled from harmless atoms", () => {
    expect(() => validate('const selector = "." + "records";')).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*selector/i);
    expect(() => validate('const css = `color:${"red"}`;')).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*css/i);
    expect(() => validate('const instance = "Button" + 1;')).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*runtime instance/i);
    expect(() => validate('const prefix = "."; const selector = prefix + "records";')).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*selector/i);
    expect(() => validate('let prefix = "."; const selector = prefix + "records";')).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*selector/i);
  });

  it("requires every declared input to be read and every declared output to be written exactly", () => {
    expect(() => validate('const value = $control.getValue("name");', {
      inputs: [port("name", "control")],
      outputs: [port("submitted", "local-state")],
    })).toThrow(/CUSTOM_SCRIPT_OUTPUT_NOT_WRITTEN.*submitted/);
    expect(() => validate('$feedback.show("info", "ready");', {
      inputs: [port("name", "control")],
    })).toThrow(/CUSTOM_SCRIPT_INPUT_NOT_READ.*name/);
    expect(() => validate('$state.set("submitted", true); $state.set("submitted", false);', {
      outputs: [port("submitted", "local-state")],
    })).toThrow(/CUSTOM_SCRIPT_OUTPUT_WRITTEN_MULTIPLE_TIMES.*submitted/);
  });

  it("accepts exact bounded loops and rejects non-literal or excessive bounds", () => {
    expect(() => validate('let total = 0; for (let index = 0; index < 100; index += 1) { total += index; }'))
      .not.toThrow();
    expect(() => validate('const limit = 100; for (let index = 0; index < limit; index += 1) {}'))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*bounded loop/i);
    expect(() => validate('for (let index = 0; index < 1001; index += 1) {}'))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*bounded loop/i);
    expect(() => validate('for (let index = 0; index < 1000; index += 1) {}')).not.toThrow();
    expect(() => validate('for (let index = 0; index <= 999; index += 1) {}')).not.toThrow();
    expect(() => validate('for (let index = 0; index <= 1000; index += 1) {}'))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*bounded loop/i);
    expect(() => validate('const records = $data.get("records"); for (const record of records) {}', {
      inputs: [port("records", "mock-data")],
    })).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*for-of/i);
    expect(() => validate('const records = $data.get("records").slice(0, 100); for (const record of records) {}', {
      inputs: [port("records", "mock-data")],
    })).not.toThrow();
  });

  it("tracks top-level push capacity and rejects repeated or overflowing growth", () => {
    expect(() => validate("const values = [1]; values.push(2); values.push(3); const selected = values.filter((value) => value > 0);"))
      .not.toThrow();
    expect(() => validate(`const values = [${Array.from({ length: 999 }, () => "1").join(",")}]; values.push(1); values.push(1);`))
      .toThrow(/CUSTOM_SCRIPT_(?:FORBIDDEN|LIMIT).*push|CUSTOM_SCRIPT_(?:FORBIDDEN|LIMIT).*capacity/i);
    expect(() => validate(`const values = [${Array.from({ length: 999 }, () => "1").join(",")}]; const alias = values; alias.push(1); values.push(1);`))
      .toThrow(/CUSTOM_SCRIPT_(?:FORBIDDEN|LIMIT).*push|CUSTOM_SCRIPT_(?:FORBIDDEN|LIMIT).*capacity/i);
    expect(() => validate(`const values = [${Array.from({ length: 999 }, () => "1").join(",")}]; values.push(1); const copy = values.slice(0, 1000); copy.push(1);`))
      .toThrow(/CUSTOM_SCRIPT_(?:FORBIDDEN|LIMIT).*push|CUSTOM_SCRIPT_(?:FORBIDDEN|LIMIT).*capacity/i);
    expect(() => validate("const values = [1]; for (let index = 0; index < 2; index += 1) { values.push(index); }"))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*push/i);
    expect(() => validate("const values = [1]; function add() { values.push(2); } add();")).not.toThrow();
    expect(() => validate("const values = [1]; function add() { values.push(2); } add(); add();"))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN/);
  });

  it("rejects loop-counter mutation and mutation or aliasing of an iterated array", () => {
    for (const source of [
      "for (let index = 0; index < 10; index += 1) { index += 1; }",
      "for (let index = 0; index < 10; index += 1) { function mutate() { index += 1; } }",
      'const records = $data.get("records").slice(0, 100); for (const record of records) { records.push(record); }',
      'const records = $data.get("records").slice(0, 100); for (const record of records) { records[0] = record; }',
      'let records = $data.get("records").slice(0, 100); for (const record of records) { records = []; }',
      'const records = $data.get("records").slice(0, 100); const alias = records; for (const record of records) { alias.push(record); }',
      'const records = $data.get("records").slice(0, 100); function mutate() { records.push({}); } for (const record of records) { mutate(); }',
      'const records = $data.get("records").slice(0, 100); let alias = []; for (const record of records) { alias = records; alias.push(record); }',
      'const records = $data.get("records").slice(0, 100); let alias = []; function bind() { alias = records; } function mutate() { alias.push({}); } for (const record of records) { bind(); mutate(); }',
      'const records = $data.get("records").slice(0, 100); let alias = []; function mutate() { alias.push({}); } function bind() { alias = records; } for (const record of records) { bind(); mutate(); }',
      'const records = $data.get("records").slice(0, 100); let alias = []; for (const record of records) { alias = records; }',
      "function bump() { index += 1; } for (let index = 0; index < 10; index += 1) { bump(); }",
    ]) expect(() => validate(source, { inputs: source.includes("$data.get") ? [port("records", "mock-data")] : [] }))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN/);
  });

  it("tracks every possible array alias root across joins and helper boundaries", () => {
    for (const source of [
      "const first = [1]; const second = [2]; let alias = []; alias = first; alias = second; for (const value of alias) { first.push(value); }",
      "const first = [1]; const second = [2]; let alias = []; alias = true ? first : second; for (const value of alias) { first.push(value); }",
      "const first = [1]; const second = [2]; let alias = []; alias = first || second; for (const value of alias) { second.push(value); }",
      "const first = [1]; function choose() { return first; } let alias = []; alias = choose(); for (const value of alias) {}",
      "const first = [1]; const second = [2]; let alias = []; alias = true ? first : second; function mutate() { second.push(3); } for (const value of alias) { mutate(); }",
    ]) expect(() => validate(source)).toThrow(/CUSTOM_SCRIPT_FORBIDDEN|CUSTOM_SCRIPT_LIMIT/);
  });

  it("rejects recursive functions and reports static timer dependencies without allowing self-scheduling", () => {
    expect(() => validate('function recurse() { recurse(); } recurse();')).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*recursion/i);
    expect(() => validate("const f = () => [1].filter(() => f()); f();")).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*recursion/i);
    expect(() => validate("const f = () => [1].filter(() => g()); const g = () => f(); f();")).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*recursion/i);
    const source = '$timer.after(100, "refresh-script"); $timer.repeat(500, 2, "pulse-script");';
    const current = {
      id: "current-script", purpose: "运行当前脚本", kind: "custom" as const, programVersion: "semantic-js/v1" as const,
      inputs: [], outputs: [], source,
    };
    const plan = semanticPlan([current, script("refresh-script"), script("pulse-script")]);
    const context = trustedContext(plan);
    const identity = createSemanticScriptValidationIdentity(current, context);
    const authorized = requireSemanticScriptValidationIdentity(identity, context);
    expect(Object.isFrozen(authorized)).toBe(true);
    expect(Object.isFrozen(authorized.inputs)).toBe(true);
    const selfSource = '$timer.after(100, "current-script");';
    const selfScript = { ...current, source: selfSource };
    const selfPlan = semanticPlan([selfScript, script("refresh-script"), script("pulse-script")]);
    const selfContext = trustedContext(selfPlan);
    expect(() => validate(selfSource, {
      context: selfContext, currentScriptIdentity: createSemanticScriptValidationIdentity(selfScript, selfContext),
    })).toThrow(/CUSTOM_SCRIPT_SELF_SCHEDULE/);
    expect(() => validateCustomScript({ source: '$timer.after(100, "refresh-script");', inputs: [], outputs: [], context: trustedContext() }))
      .toThrow(/CUSTOM_SCRIPT_(?:INPUT_INVALID|UNTRUSTED_AST)/);
    expect(() => validate('$timer.after(100, "missing-script");')).toThrow(/CUSTOM_SCRIPT_UNTRUSTED_AST/);
    const branded = validate(source, {
      context, currentScriptIdentity: identity,
    });
    expect(branded.scheduledScriptIds).toEqual(["pulse-script", "refresh-script"]);
    expect(requireValidatedScriptProgram(branded, {
      context, validationIdentity: identity, authoritativeScript: authorized,
    }).type).toBe("Program");
    expect(() => requireValidatedScriptProgram({ ...branded }, {
      context, validationIdentity: identity, authoritativeScript: authorized,
    })).toThrow(/CUSTOM_SCRIPT_UNTRUSTED_AST/);
    expect(() => validate(source, { context, currentScriptIdentity: { schema: "kf-semantic-script-validation-identity/v1" } as never }))
      .toThrow(/CUSTOM_SCRIPT_(?:INPUT_INVALID|UNTRUSTED_AST)/);
    expect(() => validate(source, { context: trustedContext(plan), currentScriptIdentity: identity }))
      .toThrow(/CUSTOM_SCRIPT_(?:INPUT_INVALID|UNTRUSTED_AST)/);
    expect(() => validate(source.replace("500", "501"), { context, currentScriptIdentity: identity }))
      .toThrow(/CUSTOM_SCRIPT_(?:INPUT_INVALID|UNTRUSTED_AST)/);
    expect(() => validate(source, {
      context, currentScriptIdentity: identity, inputs: [port("extra", "control")],
    })).toThrow(/CUSTOM_SCRIPT_UNTRUSTED_AST.*ports/);
    expect(() => createSemanticScriptValidationIdentity({ ...current, source: source.replace("500", "501") }, context))
      .toThrow(/SCRIPT_API_INPUT_INVALID.*does not match/);
    let getterCalls = 0;
    const hostile = { ...current } as Record<string, unknown>;
    Object.defineProperty(hostile, "source", { enumerable: true, get() { getterCalls += 1; return source; } });
    expect(() => createSemanticScriptValidationIdentity(hostile, context)).toThrow(/SCRIPT_API_INPUT_INVALID/);
    expect(getterCalls).toBe(0);
    expect(() => createSemanticScriptValidationIdentity(new Proxy({}, {}), context)).toThrow(/SCRIPT_API_INPUT_INVALID/);
  });

  it("uses saturated call counts instead of enumerating exponential call paths", () => {
    const functions = Array.from({ length: 24 }, (_, index) => index === 23
      ? `function f${index}() { const value = 1; }`
      : `function f${index}() { f${index + 1}(); f${index + 1}(); }`);
    expect(() => validate(`${functions.join("\n")}\nf0();`)).toThrow(/CUSTOM_SCRIPT_FORBIDDEN|CUSTOM_SCRIPT_LIMIT/);
  });

  it("enforces AST node/depth budgets and script parsing mode", () => {
    expect(() => validate(`const values = [${Array.from({ length: 2_001 }, () => "0").join(",")}];`))
      .toThrow(/CUSTOM_SCRIPT_(?:FORBIDDEN|LIMIT).*2000/);
    expect(() => validate(`const value = ${"[".repeat(40)}1${"]".repeat(40)};`)).toThrow(/CUSTOM_SCRIPT_LIMIT.*depth 32/);
    expect(() => validate("export const value = 1;")).toThrow(/CUSTOM_SCRIPT_PARSE/);
  });

  it("returns an in-process branded result and rejects forged validation metadata", () => {
    const result = validate("const value = 1;");
    expect(Object.isFrozen(result)).toBe(true);
    expect(() => getValidatedScriptProgram(structuredClone(result))).toThrow(/CUSTOM_SCRIPT_UNTRUSTED_AST/);
    expect(() => getValidatedScriptProgram({ ...result, sourceHash: "0".repeat(64) })).toThrow(/CUSTOM_SCRIPT_UNTRUSTED_AST/);
  });

  it("clones descriptor-safe input and never invokes getters or proxies", () => {
    let getterCalls = 0;
    const hostile = { source: "const value = 1;", inputs: [], outputs: [] } as Record<string, unknown>;
    Object.defineProperty(hostile, "scriptId", { enumerable: true, get() { getterCalls += 1; return "x"; } });
    expect(() => validateCustomScript(hostile)).toThrow(/CUSTOM_SCRIPT_INPUT_INVALID/);
    expect(getterCalls).toBe(0);
    expect(() => validateCustomScript(new Proxy({}, { ownKeys() { throw new Error("trap"); } })))
      .toThrow(/CUSTOM_SCRIPT_INPUT_INVALID/);
    const hostilePorts: unknown[] = [];
    Object.defineProperty(hostilePorts, "0", { enumerable: true, get() { getterCalls += 1; return "records"; } });
    hostilePorts.length = 1;
    expect(() => validateCustomScript({ source: 'const records = $data.get("records");', inputs: hostilePorts, outputs: [] }))
      .toThrow(/CUSTOM_SCRIPT_INPUT_INVALID/);
    expect(getterCalls).toBe(0);
  });

  it("enforces lexical scope, use-before-declare, and a no-shadowing policy", () => {
    for (const source of [
      "const value = later; const later = 1;",
      "if (true) { const scoped = 1; } const leaked = scoped;",
      "[1].filter((record) => true); const leaked = record;",
      "let value = 1; if (true) { let value = 2; }",
      "for (let index = 0; index < 2; index += 1) { if (true) { let index = 0; } }",
      "const value = value;",
    ]) expect(() => validate(source)).toThrow(/CUSTOM_SCRIPT_FORBIDDEN/);
    expect(() => validate("const read = () => later; read(); const later = 1;"))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*use before declaration/);
    expect(() => validate("const read = () => later; const later = 1; read();")).not.toThrow();
    expect(() => validate("const read = () => { const value = later; const later = 1; return value; }; read();"))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*use before declaration/);
    expect(() => validate("const read = () => later; read(); const later = 1; const outer = () => read(); outer();"))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*use before declaration/);
    expect(() => validate("const value = read(); function read() { return 1; }")).not.toThrow();
  });

  it("allows ordinary colon and prose strings while rejecting actual composed CSS and selectors", () => {
    expect(() => validate('const status = "Status" + ": ready"; const action = "go" + " home";')).not.toThrow();
    expect(() => validate('const css = "color" + ": red";')).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*css/i);
    expect(() => validate('const selector = "div" + " .record";')).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*selector/i);
    expect(() => validate('const selector = "button" + " input";')).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*selector/i);
  });

  it("does not preserve stale exact constants after mutable reassignment", () => {
    expect(() => validate('let target = "home"; target = "missing"; $page.navigate(target);', {
      context: trustedContext(),
    })).toThrow(/CUSTOM_SCRIPT_FORBIDDEN|SCRIPT_PAGE_NOT_FOUND/);
    expect(() => validate('let level = "success"; level = "bogus"; $feedback.show(level, "done");', {
      context: trustedContext(),
    })).toThrow(/CUSTOM_SCRIPT_FORBIDDEN|SCRIPT_API_INPUT_INVALID/);
  });

  it("models logical expressions with JavaScript operand-return semantics", () => {
    expect(() => validate("const value = null ?? 'fallback';")).toThrow(/CUSTOM_SCRIPT_FORBIDDEN/);
    expect(() => validate('const visible = "yes" || false; $control.setVisible("go", visible);', {
      context: trustedContext(), outputs: [port("go", "control")],
    })).toThrow(/SCRIPT_API_INPUT_INVALID|CUSTOM_SCRIPT_FORBIDDEN/);
    expect(() => validate('const visible = Boolean(1) && Boolean(0); $control.setVisible("go", visible);', {
      context: trustedContext(), outputs: [port("go", "control")],
    })).not.toThrow();
    expect(() => validate('const message = "" || "fallback"; $feedback.show("info", message);', {
      context: trustedContext(),
    })).not.toThrow();
  });

  it("preserves record-list provenance instead of treating dynamic data as an empty array", () => {
    const { context } = recordFixture();
    expect(() => validate('const records = $data.get("visitor-records"); $data.set("visitor-records", records.slice(0, 100));', {
      context, inputs: [port("records", "mock-data", "visitor-records")], outputs: [port("updated", "mock-data", "visitor-records")],
    })).not.toThrow();
    expect(() => validate('const records = $data.get("visitor-records").slice(0, 100); records.push({ "id": "v2", "name": "李四" }); $data.set("visitor-records", records);', {
      context, inputs: [port("records", "mock-data", "visitor-records")], outputs: [port("updated", "mock-data", "visitor-records")],
    })).not.toThrow();
    expect(() => validate('const records = $data.get("visitor-records"); $data.set("audit-records", records.slice(0, 100));', {
      context, inputs: [port("records", "mock-data", "visitor-records")], outputs: [port("updated", "mock-data", "audit-records")],
    })).toThrow(/CUSTOM_SCRIPT_FORBIDDEN|SCRIPT_API_INPUT_INVALID/);
    expect(() => validate('const records = $data.get("visitor-records").slice(0, 100); records.push({ "auditId": "a1" }); $data.set("visitor-records", records);', {
      context, inputs: [port("records", "mock-data", "visitor-records")], outputs: [port("updated", "mock-data", "visitor-records")],
    })).toThrow(/CUSTOM_SCRIPT_FORBIDDEN|SCRIPT_API_INPUT_INVALID/);
    expect(() => validate('const records = $data.get("visitor-records").slice(0, 100); records[0] = { "auditId": "a1" }; $data.set("visitor-records", records);', {
      context, inputs: [port("records", "mock-data", "visitor-records")], outputs: [port("updated", "mock-data", "visitor-records")],
    })).toThrow(/CUSTOM_SCRIPT_FORBIDDEN|SCRIPT_API_INPUT_INVALID/);
  });

  it("counts ports and dependencies only through reachable, single-execution code", () => {
    expect(() => validate('function unused() { return $control.getValue("name"); }', {
      inputs: [port("name", "control")],
    })).toThrow(/CUSTOM_SCRIPT_(?:FORBIDDEN|INPUT_NOT_READ)/);
    expect(() => validate('function unused() { $state.set("submitted", true); }', {
      outputs: [port("submitted", "local-state")],
    })).toThrow(/CUSTOM_SCRIPT_(?:FORBIDDEN|OUTPUT_NOT_WRITTEN)/);
    expect(() => validate('function write() { $state.set("submitted", true); } write(); write();', {
      outputs: [port("submitted", "local-state")],
    })).toThrow(/CUSTOM_SCRIPT_(?:FORBIDDEN|OUTPUT_WRITTEN_MULTIPLE_TIMES)/);
    expect(() => validate('function notify() { $feedback.show("info", "again"); } notify(); notify();'))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN/);
    expect(() => validate('for (let index = 0; index < 2; index += 1) { $feedback.show("info", "again"); }'))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN/);
    expect(() => validate('[1].filter((value) => { $feedback.show("info", "again"); return true; });'))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN/);
    expect(() => validate('const values = [1]; values.filter((value) => { values.push(value); return true; });'))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN/);
    expect(() => validate('const values = [1]; function mutate() { values.push(2); } values.filter((value) => { mutate(); return true; });'))
      .toThrow(/CUSTOM_SCRIPT_FORBIDDEN/);
    expect(() => validate('if (true) { $state.set("submitted", true); }', {
      outputs: [port("submitted", "local-state")],
    })).toThrow(/CUSTOM_SCRIPT_FORBIDDEN|CUSTOM_SCRIPT_OUTPUT_NOT_WRITTEN/);
    const branched = validate('if (true) { $state.set("submitted", true); } else { $state.set("submitted", false); }', {
      outputs: [port("submitted", "local-state")],
    });
    expect(branched.outputWrites).toEqual(["submitted"]);
    expect(branched.calls.map((call) => call.execution)).toEqual(["conditional", "conditional"]);
    const helper = validate('function write() { $state.set("submitted", true); } if (true) { write(); } else { write(); }', {
      outputs: [port("submitted", "local-state")],
    });
    expect(helper.outputWrites).toEqual(["submitted"]);
    expect(helper.calls[0]?.execution).toBeUndefined();
  });
});

describe("reviewed templates pass the same AST gate", () => {
  const fixtures = [
    {
      id: "multi-filter", invocation: {
        id: "filter-records", kind: "template", template: "multi-filter", purpose: "筛选记录",
        inputs: [port("records", "mock-data", "visitor-records"), port("criterion-1-value", "control", "status-filter")],
        outputs: [port("filtered", "mock-data", "filtered-records"), port("view", "control", "records-table")],
        parameters: [{ name: "combine", value: "all" }, { name: "criterion-1-field", value: "status" }, { name: "criterion-1-mode", value: "contains" }],
      },
    },
    {
      id: "master-detail-fill", invocation: {
        id: "fill-detail", kind: "template", template: "master-detail-fill", purpose: "填充详情", inputs: [],
        outputs: [port("target-1", "control", "visitor-name")],
        parameters: [{ name: "mapping-1-field", value: "name" }, { name: "missing-message", value: "请选择记录" }],
      },
    },
    {
      id: "form-validate-submit", invocation: {
        id: "submit-form", kind: "template", template: "form-validate-submit", purpose: "校验表单",
        inputs: [port("field-1", "control", "visitor-name")], outputs: [port("submitted", "local-state", "submitted-state")],
        parameters: [{ name: "field-1-required", value: true }, { name: "field-1-message", value: "请输入姓名" }, { name: "success-message", value: "提交成功" }],
      },
    },
    {
      id: "record-mutate", invocation: {
        id: "append-record", kind: "template", template: "record-mutate", purpose: "追加记录",
        inputs: [port("records", "mock-data", "visitor-records"), port("key", "control", "visitor-code"), port("field-1", "control", "visitor-name")],
        outputs: [port("updated", "mock-data", "updated-records"), port("view", "control", "records-table")],
        parameters: [{ name: "operation", value: "append" }, { name: "key-field", value: "code" }, { name: "field-1-name", value: "name" }, { name: "success-message", value: "追加成功" }],
      },
    },
    {
      id: "record-mutate", invocation: {
        id: "update-record", kind: "template", template: "record-mutate", purpose: "更新记录",
        inputs: [port("records", "mock-data", "visitor-records"), port("key", "local-state", "selected-code"), port("field-1", "control", "visitor-name")],
        outputs: [port("updated", "mock-data", "updated-records"), port("view", "control", "records-table")],
        parameters: [{ name: "operation", value: "update" }, { name: "key-field", value: "code" }, { name: "field-1-name", value: "name" }, { name: "success-message", value: "更新成功" }],
      },
    },
    {
      id: "record-mutate", invocation: {
        id: "remove-record", kind: "template", template: "record-mutate", purpose: "移除记录",
        inputs: [port("records", "mock-data", "visitor-records"), port("key", "control", "visitor-code")],
        outputs: [port("updated", "mock-data", "updated-records"), port("view", "control", "records-table")],
        parameters: [{ name: "operation", value: "remove" }, { name: "key-field", value: "code" }, { name: "success-message", value: "移除成功" }],
      },
    },
    {
      id: "reset-controls", invocation: {
        id: "reset", kind: "template", template: "reset-controls", purpose: "重置控件",
        inputs: [port("source-2", "mock-data", "visitor-records")],
        outputs: [port("target-1", "control", "status-filter"), port("target-2", "mock-data", "filtered-records")],
        parameters: [{ name: "target-1-value", value: "all" }, { name: "success-message", value: "重置完成" }],
      },
    },
  ] as const;

  it.each(fixtures)("validates $id output as a first-class positive fixture", ({ id, invocation }) => {
    const source = renderScriptTemplate(id, invocation);
    const result = validate(source, {
      scriptId: invocation.id,
      inputs: invocation.inputs,
      outputs: invocation.outputs,
    });
    expect(result.sourceHash).toMatch(/^[0-9a-f]{64}$/);
    if (id === "master-detail-fill") {
      expect(result.calls.filter((call) => call.execution === "conditional").map((call) => call.api))
        .toEqual(["$feedback.show", "$control.setValue"]);
    }
  });
});
