import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { parse } from "acorn";
import {
  canonicalServerHash,
  type ScriptPlan,
  type SolutionImplementationPlan,
  type UIImplementationSpecV2,
} from "@kf/contracts";
import { describe, expect, it } from "vitest";
import { createDefaultModuleRegistry } from "../modules/module-registry.js";
import { solutionModuleRegistryHash } from "../solution-compile/solution-provenance.js";
import {
  createSemanticScriptApiContext,
  createSemanticScriptValidationIdentity,
} from "./semantic-script-api.js";
import { validateCustomScript } from "./custom-script-validator.js";
import { compileScriptPlan } from "./script-compiler.js";

const theme = {
  background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32",
  textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;
const intent: SolutionImplementationPlan["pages"][number]["root"]["intent"] = {
  importance: "primary", visualWeight: 3, readingOrder: 0, density: "comfortable", groupWith: [],
  width: { mode: "fixed", value: 120 }, height: { mode: "fixed", value: 40 }, align: "start",
};
const port = (name: string, refKind: "control", refId: string) => ({ name, description: name, refKind, refId });
const repositoryRoot = fileURLToPath(new URL("../../../../../", import.meta.url));
function at(value: unknown, segments: readonly (string | number)[]): unknown {
  let current = value;
  for (const segment of segments) {
    if (current === null || typeof current !== "object") throw new Error(`missing product evidence: ${segments.join(".")}`);
    current = (current as Record<string | number, unknown>)[segment];
  }
  return current;
}

function fixture(
  source = 'const value = $control.getValue("status-filter");',
  options: FixtureOptions = {},
) {
  const writesFilter = source.includes("$control.setValue");
  const writesRecords = source.includes("$control.setData");
  const readsFilter = source.includes("$control.getValue");
  const script: ScriptPlan = {
    id: "read-filter", purpose: "读取筛选条件", kind: "custom", programVersion: "semantic-js/v1",
    source,
    inputs: readsFilter ? [port("filter", "control", "status-filter")] : [],
    outputs: writesFilter ? [port("filter", "control", "status-filter")]
      : writesRecords ? [port("records", "control", "records")] : [],
  };
  return fixtureForScript(script, options) as ReturnType<typeof fixtureForScript> & {
    identity: ReturnType<typeof createSemanticScriptValidationIdentity>;
    validatedAst: ReturnType<typeof validateCustomScript>;
  };
}

function fixtureForScript(
  script: ScriptPlan,
  options: FixtureOptions = {},
) {
  const owner = options.owner ?? "go";
  const event = options.event ?? "click";
  const scripts = [script, ...(options.additionalScripts ?? [])];
  const plan: SolutionImplementationPlan = {
    schema: "kf-solution-implementation/v1", projectKey: "script-compiler", blueprintHash: "a".repeat(64),
    candidateBundleHash: "b".repeat(64), theme, roleStyles: [{ role: "content", declarations: {}, states: {} }],
    mockData: [{
      id: "visitor-records", purpose: "访客", fields: [{ key: "id", label: "标识", type: "text" }],
      records: [{ values: [{ field: "id", value: "v1" }] }],
    }], localState: [], overlays: [], scripts,
    actions: scripts.map((candidate) => ({ id: `run-${candidate.id}`, kind: "run-script" as const, scriptId: candidate.id, afterActionIds: [] })),
    pages: [{
      id: "home", title: "首页", purpose: "脚本宿主页", canvas: "desktop", sourceBlueprintPageId: "bp-home",
      sourceBlueprintRegionIds: ["region"], initialStateIds: [], root: {
        id: "home-root", kind: "layout", layout: "column", sourceBlueprintRegionIds: ["region"], intent,
        children: [
          {
            id: "go", kind: "control", capabilityId: "button", content: "执行", properties: [], tabIds: [],
            styleRole: "content", sourceBlueprintRegionIds: ["region"], intent,
            eventBindings: owner === "go" ? [{ semanticEvent: "click", actionIds: scripts.map((candidate) => `run-${candidate.id}`) }] : [],
          },
          {
            id: "status-filter", kind: "control", capabilityId: "input", content: "筛选", properties: [], tabIds: [],
            styleRole: "content", sourceBlueprintRegionIds: ["region"], intent, eventBindings: [],
          },
          {
            id: "records", kind: "control", capabilityId: "easyui.1", content: "记录", properties: [], tabIds: [],
            styleRole: "content", sourceBlueprintRegionIds: ["region"], intent, mockDataId: "visitor-records",
            eventBindings: owner === "records" ? [{ semanticEvent: "row-click", actionIds: scripts.map((candidate) => `run-${candidate.id}`) }] : [],
          },
        ],
      },
    }],
  };
  const control = (id: string, capabilityId: string, parentId?: string) => ({
    id, role: capabilityId.startsWith("layout.") ? "layout" : "content", capabilityId,
    ...(parentId === undefined ? {} : { parentId }), depth: parentId === undefined ? 0 : 1, zIndex: 0,
    geometry: { x: 0, y: 0, width: parentId === undefined ? 1280 : 120, height: parentId === undefined ? 720 : 40 },
    nativeProperties: {}, sourceSolutionNodeId: id, sourceBlueprintPageId: "bp-home",
    sourceBlueprintRegionIds: ["region"], eventBindings: [],
    ...(capabilityId.startsWith("layout.") ? { compiledLayout: { kind: "column" as const, overflow: "visible" as const } } : {}),
  });
  const implementation: UIImplementationSpecV2 = {
    schema: "kf-ui-implementation/v2", compatibility: "native", sourceSolutionPlanHash: canonicalServerHash(plan),
    sourceModuleRegistryHash: solutionModuleRegistryHash(plan, createDefaultModuleRegistry()), theme,
    compiledRoleStyles: {}, compiledActions: [], compiledScripts: [], pages: [{
      compatibility: "native", id: "home", width: 1280, height: 720, sourceBlueprintPageId: "bp-home",
      controls: [
        control("go", "button", "home-root"), control("status-filter", "input", "home-root"),
        { ...control("records", "easyui.1", "home-root"), dataBinding: { mockDataId: "visitor-records", records: [{ id: "v1" }] } },
        control("home-root", "layout.4"),
      ],
    }],
    runtimeCorrelation: {
      controls: [
        { semanticControlId: "go", instanceName: "Button1" },
        { semanticControlId: "status-filter", instanceName: "Input1" },
        { semanticControlId: "records", instanceName: "Table1" },
        { semanticControlId: "home-root", instanceName: "Layout1" },
      ],
      pages: [{ semanticPageId: "home", pageGuid: "00000000-0000-4000-8000-000000000001" }],
    },
  };
  const context = createSemanticScriptApiContext({
    plan, implementation, ownerControlId: owner,
    ...(options.active === false ? {} : { activeEvent: { controlId: owner, semanticEvent: options.activeEvent ?? event } }),
  });
  if (script.kind === "custom" && script.programVersion === "semantic-js/v1" && script.source !== undefined) {
    const identity = createSemanticScriptValidationIdentity(script, context);
    const validatedAst = validateCustomScript({
      source: script.source, inputs: script.inputs, outputs: script.outputs, context, currentScriptIdentity: identity,
    });
    return { script, plan, implementation, context, identity, validatedAst };
  }
  return { script, plan, implementation, context };
}

interface FixtureOptions {
  readonly owner?: "go" | "records";
  readonly event?: "click" | "row-click";
  readonly active?: boolean;
  readonly activeEvent?: string;
  readonly additionalScripts?: readonly ScriptPlan[];
}

describe("compileScriptPlan", () => {
  it("rewrites a branded semantic AST to deterministic KF instance source and exact event identity", () => {
    const data = fixture();
    const first = compileScriptPlan({
      script: data.script, context: data.context, validationIdentity: data.identity,
      validatedAst: data.validatedAst, binding: { controlId: "go", semanticEvent: "click" },
    });
    const second = compileScriptPlan({
      script: data.script, context: data.context, validationIdentity: data.identity,
      validatedAst: data.validatedAst, binding: { controlId: "go", semanticEvent: "click" },
    });

    expect(first).toEqual(second);
    expect(first.module).toMatchObject({
      id: expect.stringMatching(/^kf\$script:read-filter-[0-9a-f]{16}$/), sourceScriptId: "read-filter", placement: "event", ownerInstanceName: "Button1",
      instanceReferences: [
        { semanticId: "go", instanceName: "Button1" },
        { semanticId: "status-filter", instanceName: "Input1" },
      ],
      pageReferences: [],
    });
    expect(first.module.source).toBe("const value = Input1.Value;\n");
    expect(first.module.sourceHash).toBe(createHash("sha256").update(first.module.source).digest("hex"));
    expect(first.binding).toEqual({
      id: expect.stringMatching(/^kf\$binding:script-read-filter-[0-9a-f]{16}$/), ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001,
      phase: "event", scriptModuleIds: [first.module.id], nativeActionIds: [],
    });
  });

  it("rejects an unbranded AST and every API that remains planned", () => {
    const data = fixture();
    expect(() => compileScriptPlan({
      script: data.script, context: data.context, validationIdentity: data.identity,
      validatedAst: { ...data.validatedAst }, binding: { controlId: "go", semanticEvent: "click" },
    })).toThrow(/SCRIPT_COMPILER_UNTRUSTED_AST/);

    const planned = fixture('$control.setValue("status-filter", "changed");');
    expect(() => compileScriptPlan({
      script: planned.script, context: planned.context, validationIdentity: planned.identity,
      validatedAst: planned.validatedAst, binding: { controlId: "go", semanticEvent: "click" },
    })).toThrow(/SCRIPT_COMPILER_API_UNSUPPORTED.*\$control\.setValue/);
  });

  it("emits reviewed SetData, conditional syntax, and the exact Cell-click record position", () => {
    const setData = fixture('$control.setData("records", []);');
    expect(compileScriptPlan({
      script: setData.script, context: setData.context, validationIdentity: setData.identity,
      validatedAst: setData.validatedAst, binding: { controlId: "go", semanticEvent: "click" },
    }).module.source).toBe("Table1.SetData([]);\n");

    const conditional = fixture('const value = $control.getValue("status-filter");\nif (value === "open") { const copy = String(value); }');
    expect(compileScriptPlan({
      script: conditional.script, context: conditional.context, validationIdentity: conditional.identity,
      validatedAst: conditional.validatedAst, binding: { controlId: "go", semanticEvent: "click" },
    }).module.source).toContain('if ((value === "open"))');

    const record = fixture("const selectedRecord = $event.record();", { owner: "records", event: "row-click" });
    const compiled = compileScriptPlan({
      script: record.script, context: record.context, validationIdentity: record.identity,
      validatedAst: record.validatedAst, binding: { controlId: "records", semanticEvent: "row-click" },
    });
    expect(compiled.module.source).toBe("const selectedRecord = arguments[1];\n");
    expect(compiled.binding).toMatchObject({ ownerInstanceName: "Table1", kfEvent: "Cell-click", linkId: 200006 });
  });

  it("requires explicit configure-data placement and its reviewed capability profile", () => {
    const data = fixture('$control.setData("records", []);', { owner: "records", event: "row-click" });
    const compiled = compileScriptPlan({
      script: data.script, context: data.context, validationIdentity: data.identity,
      validatedAst: data.validatedAst, placement: "configure-data",
    });
    expect(compiled.binding).toBeUndefined();
    expect(compiled.module).toMatchObject({ placement: "configure-data", ownerInstanceName: "Table1" });
    expect(() => compileScriptPlan({
      script: data.script, context: data.context, validationIdentity: data.identity,
      validatedAst: data.validatedAst, placement: "configure-data",
      binding: { controlId: "records", semanticEvent: "row-click" },
    })).toThrow(/SCRIPT_COMPILER_BINDING_INVALID/);
  });

  it("runs template semantic source through the same AST gate and rejects its still-planned APIs", () => {
    const template: ScriptPlan = {
      id: "detail", purpose: "填充明细", kind: "template", template: "master-detail-fill",
      inputs: [], outputs: [port("target-1", "control", "status-filter")],
      parameters: [
        { name: "missing-message", value: "请选择记录" },
        { name: "mapping-1-field", value: "id" },
      ],
    };
    const base = fixtureForScript(template);
    expect(() => compileScriptPlan({
      script: template, context: base.context, binding: { controlId: "go", semanticEvent: "click" },
    })).toThrow(/SCRIPT_COMPILER_API_UNSUPPORTED|CUSTOM_SCRIPT/);
  });

  it("does not serialize page navigation as JavaScript", () => {
    const data = fixture('$page.navigate("home");');
    expect(() => compileScriptPlan({
      script: data.script, context: data.context, validationIdentity: data.identity,
      validatedAst: data.validatedAst, binding: { controlId: "go", semanticEvent: "click" },
    })).toThrow(/SCRIPT_COMPILER_API_UNSUPPORTED.*restricted actions must remain native actions/);
  });

  it("rejects ScriptPlan drift and hostile compile-input descriptors before reading them", () => {
    const data = fixture();
    expect(() => compileScriptPlan({
      script: { ...data.script, purpose: "内容漂移" }, context: data.context, validationIdentity: data.identity,
      validatedAst: data.validatedAst, binding: { controlId: "go", semanticEvent: "click" },
    })).toThrow(/SCRIPT_API_INPUT_INVALID.*does not match the authoritative plan/);

    let reads = 0;
    const hostile = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(hostile, "script", { enumerable: true, get() { reads += 1; return data.script; } });
    expect(() => compileScriptPlan(hostile as never)).toThrow(/SCRIPT_COMPILER_INPUT_INVALID/);
    expect(reads).toBe(0);
  });

  it("matches the exact KF 3.6 product event slots and reviewed runtime spellings", () => {
    const center: unknown = JSON.parse(readFileSync(path.join(
      repositoryRoot,
      "KingFusion3.6_Center/sdb/c7f1771f-0c8f-4c75-9d71-3b8c4b6bd190/kingclient/9fdd3be0-2d91-11f1-b60a-4937cd79e5a1/pagerecord/recordpages/数据模型管理_属性定义20230511104433.json",
    ), "utf8"));
    const buttonSlot = at(center, ["objects", 0, "insiderObjects", 0, "insiderObjects", 0, "insiderObjects", 4, "linkMng", "linkList", 0]) as Record<string, unknown>;
    const memberEvidence = at(center, ["linkMng", "linkList", 3, "script"]);
    if (typeof memberEvidence !== "string") throw new Error("missing member evidence script");
    const read = fixture();
    const compiledRead = compileScriptPlan({
      script: read.script, context: read.context, validationIdentity: read.identity,
      validatedAst: read.validatedAst, binding: { controlId: "go", semanticEvent: "click" },
    });
    expect(compiledRead.binding).toMatchObject({ kfEvent: buttonSlot.name, linkId: buttonSlot.linkId });
    expect(memberEvidence).toContain("input1.Value");
    expect(memberEvidence).toContain("Table1.SetData(");
    expect(compiledRead.module.source).toContain("Input1.Value");

    const node: unknown = JSON.parse(readFileSync(path.join(
      repositoryRoot,
      "KingFusion3.6_Node/sdb/kingclient/bbb85040-d19b-11f0-b646-250384722929/e91a8070-d94e-11f0-bc3d-dbe5f779bd94/pagerecord/recordpages/修改班组20230718142335.json",
    ), "utf8"));
    const cellSlot = at(node, ["objects", 0, "insiderObjects", 0, "insiderObjects", 4, "insiderObjects", 0, "linkMng", "linkList", 5]) as Record<string, unknown>;
    const record = fixture("const selectedRecord = $event.record();", { owner: "records", event: "row-click" });
    const compiledRecord = compileScriptPlan({
      script: record.script, context: record.context, validationIdentity: record.identity,
      validatedAst: record.validatedAst, binding: { controlId: "records", semanticEvent: "row-click" },
    });
    expect(compiledRecord.binding).toMatchObject({ kfEvent: cellSlot.name, linkId: cellSlot.linkId });
    expect(cellSlot["script"]).toEqual(expect.stringContaining("arg[1]"));
    expect(compiledRecord.module.source).toContain("arguments[1]");
  });

  it("binds a validated AST to the exact context identity and authoritative ports", () => {
    const sibling: ScriptPlan = {
      id: "same-source-sibling", purpose: "同源不同端口", kind: "custom", programVersion: "semantic-js/v1",
      source: 'const value = $control.getValue("status-filter");',
      inputs: [{ name: "different-port", description: "不同端口", refKind: "control", refId: "status-filter" }], outputs: [],
    };
    const primary = fixture(undefined, { additionalScripts: [sibling] });
    const siblingIdentity = createSemanticScriptValidationIdentity(sibling, primary.context);
    const siblingAst = validateCustomScript({
      source: sibling.source!, inputs: sibling.inputs, outputs: sibling.outputs,
      context: primary.context, currentScriptIdentity: siblingIdentity,
    });
    expect(() => compileScriptPlan({
      script: primary.script, context: primary.context, validationIdentity: primary.identity,
      validatedAst: siblingAst, binding: { controlId: "go", semanticEvent: "click" },
    })).toThrow(/SCRIPT_COMPILER_UNTRUSTED_AST.*identity|SCRIPT_COMPILER_UNTRUSTED_AST.*ports/);
  });

  it("emits every reviewed Task5 syntax branch with parse-equivalent precedence and object arrows", () => {
    const source = [
      'const value = $control.getValue("status-filter");',
      "let index = 0;",
      'const rows = [{ "extra": true }];',
      'const transformRecord = (item) => ({ 1: item, "label": item, ...rows[index] });',
      "const normalizeText = (raw) => { return String(raw).trim(); };",
      "const preselected = chooseText(value);",
      'function chooseText(input) { if (input !== "") return input; return "empty"; }',
      "const made = transformRecord(value);",
      "const selected = [value].filter((candidate) => candidate === value);",
      "const label = `${value}-${selected.length}`;",
      'const chosen = normalizeText(preselected) || "empty";',
      "let total = (1 + 2) * 3;",
      "total++;",
      ";",
      "for (let counter = 0; counter < 2; counter += 1) { total += counter; }",
      "for (const entry of rows) { total += entry === made ? 1 : 0; }",
      "if (label === value) total = -total; else total = Math.max(total, 0);",
    ].join("\n");
    const data = fixture(source);
    const compiled = compileScriptPlan({
      script: data.script, context: data.context, validationIdentity: data.identity,
      validatedAst: data.validatedAst, binding: { controlId: "go", semanticEvent: "click" },
    });
    expect(() => parse(compiled.module.source, { ecmaVersion: 2022 })).not.toThrow();
    expect(compiled.module.source).toContain('=> ({ 1: item, "label": item, ...rows[index] })');
    expect(compiled.module.source).toContain("((1 + 2) * 3)");
    expect(compiled.module.source).toContain("`${value}-${selected.length}`");
    expect(compiled.module.source).toContain("for (let counter = 0;");
    expect(compiled.module.source).toContain("for (const entry of rows)");
    expect(compiled.module.source).toContain("const chooseText = (input) =>");
    expect(compiled.module.source).not.toContain("function chooseText");
    expect(compiled.module.source.indexOf("const chooseText")).toBeLessThan(compiled.module.source.indexOf("const preselected"));
    expect(compiled.module.source).toContain("(total++)");
    expect(compiled.module.source).toContain('normalizeText(preselected) || "empty"');
    const sandbox = { Input1: { Value: "ready" }, __result: undefined as unknown };
    runInNewContext(`${compiled.module.source}\n__result = { preselected, made, label, chosen, total };`, sandbox);
    expect(sandbox.__result).toEqual({
      preselected: "ready",
      made: { 1: "ready", label: "ready", extra: true },
      label: "ready-1",
      chosen: "ready",
      total: 11,
    });
  });

  it("requires event placement to match the exact active-event brand", () => {
    const absent = fixture(undefined, { active: false });
    expect(() => compileScriptPlan({
      script: absent.script, context: absent.context, validationIdentity: absent.identity,
      validatedAst: absent.validatedAst, binding: { controlId: "go", semanticEvent: "click" },
    })).toThrow(/SCRIPT_COMPILER_BINDING_INVALID.*active event/);
    const mismatch = fixture(undefined, { activeEvent: "change" });
    expect(() => compileScriptPlan({
      script: mismatch.script, context: mismatch.context, validationIdentity: mismatch.identity,
      validatedAst: mismatch.validatedAst, binding: { controlId: "go", semanticEvent: "click" },
    })).toThrow(/SCRIPT_COMPILER_BINDING_INVALID.*active event/);
  });

  it("deep-clones binding descriptors and derives collision-free artifact IDs", () => {
    const data = fixture();
    let reads = 0;
    const hostileBinding = Object.create(null) as Record<string, unknown>;
    Object.defineProperty(hostileBinding, "controlId", { enumerable: true, get() { reads += 1; return "go"; } });
    Object.defineProperty(hostileBinding, "semanticEvent", { enumerable: true, value: "click" });
    expect(() => compileScriptPlan({
      script: data.script, context: data.context, validationIdentity: data.identity,
      validatedAst: data.validatedAst, binding: hostileBinding as never,
    })).toThrow(/SCRIPT_COMPILER_INPUT_INVALID/);
    expect(reads).toBe(0);

    const first = compileScriptPlan({
      script: data.script, context: data.context, validationIdentity: data.identity,
      validatedAst: data.validatedAst, binding: { controlId: "go", semanticEvent: "click", phase: "event" },
    });
    const repeated = compileScriptPlan({
      script: data.script, context: data.context, validationIdentity: data.identity,
      validatedAst: data.validatedAst, binding: { controlId: "go", semanticEvent: "click", phase: "event" },
    });
    const after = compileScriptPlan({
      script: data.script, context: data.context, validationIdentity: data.identity,
      validatedAst: data.validatedAst, binding: { controlId: "go", semanticEvent: "click", phase: "after-event" },
    });
    const otherOwner = fixture(undefined, { owner: "records", event: "row-click" });
    const other = compileScriptPlan({
      script: otherOwner.script, context: otherOwner.context, validationIdentity: otherOwner.identity,
      validatedAst: otherOwner.validatedAst, binding: { controlId: "records", semanticEvent: "row-click" },
    });
    expect(repeated.module.id).toBe(first.module.id);
    expect(repeated.binding?.id).toBe(first.binding?.id);
    expect(after.module.id).not.toBe(first.module.id);
    expect(after.binding?.id).not.toBe(first.binding?.id);
    expect(other.module.id).not.toBe(first.module.id);
    expect(other.binding?.id).not.toBe(first.binding?.id);
  });
});
