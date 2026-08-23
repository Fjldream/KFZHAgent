import { createHash } from "node:crypto";
import { canonicalServerHash, type SolutionImplementationPlan, type UIImplementationSpecV2 } from "@kf/contracts";
import { describe, expect, it } from "vitest";
import { renderScriptTemplate } from "./script-template-registry.js";
import { createSemanticScriptApiContext } from "./semantic-script-api.js";
import { createDefaultModuleRegistry } from "../modules/module-registry.js";
import { solutionModuleRegistryHash } from "../solution-compile/solution-provenance.js";
import {
  getValidatedScriptProgram,
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
const script = (id: string) => ({
  id, purpose: `运行${id}`, kind: "custom" as const, programVersion: "declarative-steps/v1" as const,
  inputs: [], outputs: [], steps: [{ order: 1, intent: `执行${id}`, inputNames: [], outputNames: [] }],
});
const semanticPlan = (): SolutionImplementationPlan => ({
  schema: "kf-solution-implementation/v1", projectKey: "validator", blueprintHash: "a".repeat(64), candidateBundleHash: "b".repeat(64),
  theme, roleStyles: [{ role: "content", declarations: {}, states: {} }], mockData: [], localState: [], actions: [],
  scripts: [script("current-script"), script("refresh-script"), script("pulse-script")], overlays: [],
  pages: [{
    id: "home", title: "首页", purpose: "脚本宿主页", canvas: "desktop", sourceBlueprintPageId: "bp-home",
    sourceBlueprintRegionIds: ["region"], initialStateIds: [], root: {
      id: "home-root", kind: "layout", layout: "column", sourceBlueprintRegionIds: ["region"], intent,
      children: [{
        id: "go", kind: "control", capabilityId: "button", content: "执行", properties: [], tabIds: [], styleRole: "content",
        sourceBlueprintRegionIds: ["region"], intent, eventBindings: [],
      }],
    },
  }],
});
const semanticImplementation = (): UIImplementationSpecV2 => {
  const plan = semanticPlan();
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
const trustedContext = () => createSemanticScriptApiContext({
  plan: semanticPlan(), implementation: semanticImplementation(), ownerControlId: "go",
});

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

  it("rejects undeclared semantic reads, writes, and runtime-looking IDs", () => {
    expect(() => validate('$control.getValue("Button1");', {
      inputs: [port("status", "control")],
    })).toThrow(/CUSTOM_SCRIPT_UNDECLARED_INPUT.*Button1/);
    expect(() => validate('$state.set("other-state", true);', {
      outputs: [port("submitted", "local-state", "submitted-state")],
    })).toThrow(/CUSTOM_SCRIPT_UNDECLARED_OUTPUT.*other-state/);
    expect(() => validate('$page.navigate("00000000-0000-4000-8000-000000000001");'))
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
  });

  it("enforces semantic API arity and plan-declared non-port references", () => {
    expect(() => validate('$feedback.show("info");')).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*arity/);
    expect(() => validate('$page.navigate("detail-page");')).toThrow(/CUSTOM_SCRIPT_UNDECLARED_INPUT.*detail-page/);
    expect(validate('$page.navigate("home");', { context: trustedContext() }).calls[0]).toMatchObject({ availability: "supported", targetId: "home" });
  });

  it("rejects constant-folded selectors and CSS assembled from harmless atoms", () => {
    expect(() => validate('const selector = "." + "records";')).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*selector/i);
    expect(() => validate('const css = `color:${"red"}`;')).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*css/i);
    expect(() => validate('const instance = "Button" + 1;')).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*runtime instance/i);
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
    expect(() => validate('const records = $data.get("records"); for (const record of records) {}', {
      inputs: [port("records", "mock-data")],
    })).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*for-of/i);
    expect(() => validate('const records = $data.get("records").slice(0, 100); for (const record of records) {}', {
      inputs: [port("records", "mock-data")],
    })).not.toThrow();
  });

  it("rejects recursive functions and reports static timer dependencies without allowing self-scheduling", () => {
    expect(() => validate('function recurse() { recurse(); } recurse();')).toThrow(/CUSTOM_SCRIPT_FORBIDDEN.*recursion/i);
    expect(() => validate('$timer.after(100, "current-script");')).toThrow(/CUSTOM_SCRIPT_SELF_SCHEDULE/);
    expect(() => validate('$timer.after(100, "missing-script");')).toThrow(/CUSTOM_SCRIPT_UNDECLARED_INPUT.*missing-script/);
    expect(validate('$timer.after(100, "refresh-script"); $timer.repeat(500, 2, "pulse-script");', {
      context: trustedContext(),
    }).scheduledScriptIds)
      .toEqual(["pulse-script", "refresh-script"]);
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
  });
});
