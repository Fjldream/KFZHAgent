import { describe, expect, it } from "vitest";
import {
  CompiledEventBindingSchema,
  CompiledScriptModuleSchema,
  ScriptPlanSchema,
} from "./script-program.js";
import { CompilerPageGuidSchema } from "./action-graph.js";
import { SolutionImplementationPlanSchema } from "./solution-implementation-plan.js";
import {
  adaptUiImplementationV1,
  UIImplementationSpecSchema,
  UIImplementationSpecV2Schema,
} from "./ui-style.js";

const theme = {
  background: "#f4f7fb",
  surface: "#ffffff",
  primary: "#163a5f",
  accent: "#e47b32",
  textPrimary: "#14212b",
  textSecondary: "#52616d",
  fontFamily: "Inter",
  spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
};

const sourcePlan = {
  schema: "kf-solution-implementation/v1",
  projectKey: "script-demo",
  blueprintHash: "a".repeat(64),
  candidateBundleHash: "b".repeat(64),
  theme,
  roleStyles: [{ role: "action", declarations: {}, states: {} }],
  mockData: [],
  localState: [{ id: "submitted", purpose: "记录本地模拟提交结果", type: "boolean", initialValue: false }],
  pages: [{
    id: "home",
    title: "脚本演示",
    purpose: "演示本地提交闭环",
    canvas: "responsive",
    sourceBlueprintPageId: "home-blueprint",
    sourceBlueprintRegionIds: ["main-region"],
    initialStateIds: ["submitted"],
    root: {
      kind: "control",
      id: "submit-button",
      sourceBlueprintRegionIds: ["main-region"],
      intent: {
        importance: "primary",
        visualWeight: 5,
        readingOrder: 0,
        density: "comfortable",
        groupWith: [],
        width: { mode: "content" },
        height: { mode: "content" },
        align: "start",
      },
      capabilityId: "button",
      content: "提交",
      properties: [],
      tabIds: [],
      styleRole: "action",
      eventBindings: [{ semanticEvent: "click", actionIds: ["submit"] }],
    },
  }],
  overlays: [],
  actions: [{ id: "submit", kind: "run-script", scriptId: "submit-script", afterActionIds: [] }],
  scripts: [{
    id: "submit-script",
    kind: "custom",
    programVersion: "semantic-js/v1",
    purpose: "设置本地模拟提交状态",
    inputs: [],
    outputs: [{ name: "result", description: "本地提交状态", refKind: "local-state", refId: "submitted" }],
    source: "$state.set(\"submitted\", true);",
  }],
};

const compiledBinding = {
  id: "kf$binding:submit-click",
  ownerInstanceName: "Button1",
  kfEvent: "Click",
  phase: "event",
  scriptModuleIds: ["kf$script:submit-script"],
  nativeActionIds: [],
};

const compiledScript = {
  id: "kf$script:submit-script",
  sourceScriptId: "submit-script",
  placement: "event",
  ownerInstanceName: "Button1",
  instanceReferences: [{ semanticId: "submit-button", instanceName: "Button1" }],
  pageReferences: [{ semanticId: "home", pageGuid: "00000000-0000-4000-8000-000000000001" }],
  source: "KFPage.State.set(\"submitted\",true);",
  sourceHash: "a".repeat(64),
};

describe("script program contracts", () => {
  it("keeps declarative-v1 and semantic-js-v1 mutually exclusive", () => {
    const declarative = ScriptPlanSchema.parse({
      id: "describe",
      kind: "custom",
      purpose: "形成客户可读摘要",
      inputs: [],
      outputs: [],
      steps: [{ order: 1, intent: "形成摘要", inputNames: [], outputNames: [] }],
    });
    expect(declarative.kind).toBe("custom");
    if (declarative.kind === "custom") expect(declarative.programVersion).toBe("declarative-steps/v1");

    expect(ScriptPlanSchema.safeParse(sourcePlan.scripts[0]).success).toBe(true);
    expect(ScriptPlanSchema.safeParse({ ...sourcePlan.scripts[0], steps: [] }).success).toBe(false);
    expect(ScriptPlanSchema.safeParse({
      ...sourcePlan.scripts[0],
      purpose: "document.querySelector('#app')",
    }).success).toBe(false);
  });

  it.each([
    "fetch('/api')",
    "XMLHttpRequest()",
    "new WebSocket('ws://host')",
    "eval('1')",
    "Function('return 1')",
    "document.querySelector('#app')",
    "window.location.reload()",
    "globalThis.value = 1",
    "import('pkg')",
    "require('pkg')",
    "const transport = fetch;",
  ])("rejects obvious forbidden semantic source token %s", (source) => {
    expect(ScriptPlanSchema.safeParse({ ...sourcePlan.scripts[0], source }).success).toBe(false);
  });

  it("bounds semantic source before AST validation", () => {
    expect(ScriptPlanSchema.safeParse({ ...sourcePlan.scripts[0], source: "" }).success).toBe(false);
    expect(ScriptPlanSchema.safeParse({ ...sourcePlan.scripts[0], source: "x".repeat(8_001) }).success).toBe(false);
  });

  it("allows semantic JavaScript syntax but rejects KF implementation semantics", () => {
    const validSources = [
      "const records = $data.get(\"records\"); const active = records.filter((record) => record.status === \"active\"); $data.set(\"filtered-records\", active);",
      "const message = \"操作完成\"; $feedback.show(\"success\", message);",
      "const visitor1 = $control.getValue(\"visitor1\"); const detail2 = $state.get(\"detail2\"); $page.navigate(\"p1\");",
      "const message = \"The function is ready\"; $feedback.show(\"info\", message);",
      "const state = \"input:ready\"; const status = \"status:active\"; const urn = \"urn:kingfusion:visitor1\";",
      "function chooseText(input) { if (input !== \"\") return input; return \"empty\"; } const chosen = chooseText(\"ready\");",
      "/* function fake() {} */ function/* reviewed separator */normalize(input) { return input; } const value = normalize(\"ready\");",
      "const label = \"你好\"; const template = `🙂`;",
      "const matcher = /你好🙂/u;",
    ];
    validSources.forEach((source) => expect(ScriptPlanSchema.safeParse({ ...sourcePlan.scripts[0], source }).success, source).toBe(true));

    const forbiddenSources = [
      "const id = \"00000000-0000-4000-8000-000000000001\";",
      "const value = linkId;",
      "const selector = \".a,.b\";",
      "const selector = \"[data-secret]\";",
      "const selector = \"button:hover\";",
      "$control?.[\"getValue\"](\"status-filter\");",
      "$control?.[\"styleDataNew\"](\"status-filter\");",
      "const raw = styleDataNew;",
      "const raw = configureData;",
      "function(input) { return input; }",
      "function 名称(input) { return input; }",
      "async function chooseText(input) { return input; }",
      "const Factory = Function;",
      "const Factory = globalThis.Function;",
      "const value = function chooseText(input) { return input; };",
      String.raw`F\u0075nction('return 1')`,
      String.raw`new F\u0075nction('return 1')`,
      String.raw`const Factory = F\u0075nction;`,
      String.raw`$contr\u006fl.getValue("status-filter");`,
      String.raw`doc\u0075ment.querySelector("main");`,
      String.raw`$contr\u{6f}l.getValue("status-filter");`,
      String.raw`doc\u{75}ment.querySelector("main");`,
      String.raw`let count = 1; count++ / F\u0075nction('return 1');`,
      String.raw`let count = 1; count-- / doc\u0075ment.value;`,
      String.raw`const label = "\u4f60\u597d";`,
      "const template = `\\u{1f642}`;",
      String.raw`const matcher = /\u0061/u;`,
      String.raw`// \u0061 is rejected even in comments
const label = "actual";`,
      "let count = 1; count++ / Function('return 1');",
      "let count = 1; count-- / document.value;",
      "let count = 1; count++ / /fetch/.test('fetch');",
      'const label = "globalThis";',
      "const matcher = /XMLHttpRequest/;",
      "// Proxy is rejected even in comments\nconst value = 1;",
    ];
    forbiddenSources.forEach((source) => expect(ScriptPlanSchema.safeParse({ ...sourcePlan.scripts[0], source }).success, source).toBe(false));

    for (const source of ["const value = Button1.Value;", "const value = visitor1;"]) {
      expect(ScriptPlanSchema.safeParse({ ...sourcePlan.scripts[0], source }).success, source).toBe(true);
    }
  });

  it("screens string literals without treating comments, colors, or hashtags as selectors", () => {
    const validSources = [
      "// .comment-class #comment-id [data-secret] body{color:red}\nconst message = \"正常业务消息\"; $feedback.show(\"info\", message);",
      "const shortColor = \"#fff\"; const color = \"#ffffff\"; const alpha = \"#ffffffff\";",
      "const topic = \"#产品动态\"; const release = \"#release-notes\";",
      "const quote = \"他说：\\\"The function is ready\\\"\";",
      "const message = `第一行中文\n第二行 function is ready`; $feedback.show(\"info\", message);",
    ];
    validSources.forEach((source) => expect(ScriptPlanSchema.safeParse({ ...sourcePlan.scripts[0], source }).success, source).toBe(true));

    const forbiddenLiterals = [
      "const selector = \".class\";",
      "const selector = '#id';",
      "const selector = `[data-secret]`;",
      "const selector = \"body{color:red}\";",
      "const selector = \".a,.b\";",
      "const selector = \"button:hover\";",
    ];
    forbiddenLiterals.forEach((source) => expect(ScriptPlanSchema.safeParse({ ...sourcePlan.scripts[0], source }).success, source).toBe(false));
  });

  it("canonicalizes page GUIDs so case aliases cannot create distinct runtime identities", () => {
    const upper = "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA";
    expect(CompilerPageGuidSchema.parse(upper)).toBe(upper.toLowerCase());
    const parsed = CompiledScriptModuleSchema.parse({
      ...compiledScript,
      pageReferences: [{ semanticId: "home", pageGuid: upper }],
    });
    expect(parsed.pageReferences[0]?.pageGuid).toBe(upper.toLowerCase());
  });

  it("allows the exact bounded semantic source path in a whole native plan only", () => {
    expect(SolutionImplementationPlanSchema.safeParse(sourcePlan).success).toBe(true);

    const poisonedPurpose = structuredClone(sourcePlan);
    poisonedPurpose.scripts[0]!.purpose = "$state.set(\"submitted\", true);";
    expect(SolutionImplementationPlanSchema.safeParse(poisonedPurpose).success).toBe(false);

    const poisonedContent = structuredClone(sourcePlan);
    poisonedContent.pages[0]!.root.content = "document.querySelector('#app')";
    expect(SolutionImplementationPlanSchema.safeParse(poisonedContent).success).toBe(false);
  });

  it("rejects mismatched trigger ownership and orphan executable scripts in a whole plan", () => {
    const mismatchedOwner = structuredClone(sourcePlan);
    mismatchedOwner.pages[0]!.root.eventBindings.push({ semanticEvent: "change", actionIds: ["submit"] });
    const ownerResult = SolutionImplementationPlanSchema.safeParse(mismatchedOwner);
    expect(ownerResult.success).toBe(false);
    if (!ownerResult.success) expect(ownerResult.error.issues.some((issue) => issue.message === "ACTION_TRIGGER_OWNERSHIP_MISMATCH: submit")).toBe(true);

    const orphan = structuredClone(sourcePlan);
    orphan.pages[0]!.root.eventBindings = [];
    orphan.actions = [];
    const orphanResult = SolutionImplementationPlanSchema.safeParse(orphan);
    expect(orphanResult.success).toBe(false);
    if (!orphanResult.success) expect(orphanResult.error.issues.some((issue) => issue.message === "SCRIPT_ORPHANED: submit-script")).toBe(true);
  });

  it("accepts strict compiler output and rejects semantic ids masquerading as runtime identities", () => {
    expect(CompiledEventBindingSchema.safeParse(compiledBinding).success).toBe(true);
    expect(CompiledScriptModuleSchema.safeParse(compiledScript).success).toBe(true);
    expect(CompiledEventBindingSchema.safeParse({ ...compiledBinding, ownerInstanceName: "submit-button" }).success).toBe(false);
    expect(CompiledEventBindingSchema.safeParse({
      ...compiledBinding,
      scriptModuleIds: ["kf$action:submit-script"],
    }).success).toBe(false);
    expect(CompiledScriptModuleSchema.safeParse({
      ...compiledScript,
      pageReferences: [{ semanticId: "home", pageGuid: "home" }],
    }).success).toBe(false);
    expect(CompiledScriptModuleSchema.safeParse({
      ...compiledScript,
      source: "document.querySelector('#app').click();",
    }).success).toBe(false);
  });

  it("types native UI v2 compiled slots while adapted-v1 remains empty", () => {
    const native = {
      schema: "kf-ui-implementation/v2",
      compatibility: "native",
      theme,
      compiledRoleStyles: {},
      pages: [{
        compatibility: "native",
        id: "home",
        width: 800,
        height: 600,
        sourceBlueprintPageId: "home-blueprint",
        controls: [{
          id: "submit-button",
          role: "action",
          capabilityId: "button",
          depth: 0,
          zIndex: 0,
          geometry: { x: 10, y: 10, width: 100, height: 40 },
          nativeProperties: {},
          sourceSolutionNodeId: "submit-control",
          sourceBlueprintPageId: "home-blueprint",
          sourceBlueprintRegionIds: ["main-region"],
          eventBindings: [compiledBinding],
        }],
      }],
      compiledActions: [],
      compiledScripts: [compiledScript],
      runtimeCorrelation: {
        controls: [{ semanticControlId: "submit-button", instanceName: "Button1" }],
        pages: [{ semanticPageId: "home", pageGuid: "00000000-0000-4000-8000-000000000001" }],
      },
    };
    expect(UIImplementationSpecV2Schema.safeParse(native).success).toBe(true);

    const disguised = structuredClone(native);
    disguised.pages[0]!.controls[0]!.eventBindings[0]!.ownerInstanceName = "submit-button";
    expect(UIImplementationSpecV2Schema.safeParse(disguised).success).toBe(false);

    const contextualDisguise = structuredClone(native);
    contextualDisguise.pages[0]!.controls[0]!.id = "Button1";
    contextualDisguise.compiledScripts[0]!.instanceReferences[0]!.semanticId = "Button1";
    const contextualResult = UIImplementationSpecV2Schema.safeParse(contextualDisguise);
    expect(contextualResult.success).toBe(false);
    if (!contextualResult.success) {
      expect(contextualResult.error.issues.some((issue) => issue.message === "compiler instance name cannot reuse a semantic id")).toBe(true);
    }

    const wrongBindingOwner = structuredClone(native);
    wrongBindingOwner.pages[0]!.controls[0]!.eventBindings[0]!.ownerInstanceName = "Button2";
    expect(UIImplementationSpecV2Schema.safeParse(wrongBindingOwner).success).toBe(false);

    const duplicateInstance = structuredClone(native);
    duplicateInstance.runtimeCorrelation.controls.push({ semanticControlId: "other-control", instanceName: "Button1" });
    expect(UIImplementationSpecV2Schema.safeParse(duplicateInstance).success).toBe(false);

    const wrongPageGuid = structuredClone(native);
    wrongPageGuid.compiledScripts[0]!.pageReferences[0]!.pageGuid = "00000000-0000-4000-8000-000000000002";
    expect(UIImplementationSpecV2Schema.safeParse(wrongPageGuid).success).toBe(false);

    const guidCaseAlias = structuredClone(native);
    guidCaseAlias.pages.push({
      ...structuredClone(native.pages[0]!),
      id: "settings",
      sourceBlueprintPageId: "settings-blueprint",
      controls: [{
        ...structuredClone(native.pages[0]!.controls[0]!),
        id: "settings-root",
        sourceSolutionNodeId: "settings-control",
        sourceBlueprintPageId: "settings-blueprint",
        eventBindings: [],
      }],
    });
    guidCaseAlias.runtimeCorrelation.controls.push({ semanticControlId: "settings-root", instanceName: "Layout2" });
    guidCaseAlias.runtimeCorrelation.pages.push({ semanticPageId: "settings", pageGuid: "00000000-0000-4000-8000-000000000001".toUpperCase() });
    expect(UIImplementationSpecV2Schema.safeParse(guidCaseAlias).success).toBe(false);

    const v1 = UIImplementationSpecSchema.parse({
      schema: "kf-ui-implementation/v1",
      theme,
      pages: [{
        id: "home",
        width: 800,
        height: 600,
        components: [{
          id: "submit-button",
          role: "action",
          capabilityId: "button",
          geometry: { x: 10, y: 10, width: 100, height: 40 },
          properties: {},
          style: { declarations: {}, states: {} },
        }],
      }],
    });
    const adapted = adaptUiImplementationV1(v1);
    const forgedAdapted = { ...adapted, compiledScripts: [compiledScript] };
    expect(UIImplementationSpecV2Schema.safeParse(forgedAdapted).success).toBe(false);
  });
});
