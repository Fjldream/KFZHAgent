import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { canonicalServerHash, type ScriptPlan, type SolutionImplementationPlan, type UIImplementationSpecV2 } from "@kf/contracts";
import type { ClientWorkspace } from "../compile/client-compiler.js";
import { validateCustomScript } from "../interaction/custom-script-validator.js";
import { createSemanticScriptApiContext, createSemanticScriptValidationIdentity } from "../interaction/semantic-script-api.js";
import { compileScriptPlan } from "../interaction/script-compiler.js";
import { createDefaultModuleRegistry } from "../modules/module-registry.js";
import { applyClientPatch, deleteOperationDigest } from "../patch/client-patcher.js";
import { inspectClientProject } from "../inspect/client-inspector.js";
import { attachRuntimeCorrelation } from "../implementation/runtime-correlation.js";
import { solutionModuleRegistryHash } from "../solution-compile/solution-provenance.js";
import { validateClientProject } from "./client-validator.js";

const pkgDir = fileURLToPath(new URL(".", import.meta.url));
const fixturesRoot = join(pkgDir, "../../../../tests/fixtures");
const fixture = (name: string): string => join(fixturesRoot, name);

type Root = string | ClientWorkspace;

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function copyFixture(name: string): Promise<string> {
  const dest = await tempDir("kf-validate-base-");
  await cp(fixture(name), dest, { recursive: true });
  return dest;
}

function plan(operations: unknown[]): { schema: "kf-change-plan/v1"; workspaceId: string; operations: unknown[] } {
  return { schema: "kf-change-plan/v1", workspaceId: "w-test", operations };
}

async function rootDirOf(root: Root): Promise<string> {
  return typeof root === "string" ? root : root.rootDir;
}

function happyPlan(): { schema: "kf-change-plan/v1"; workspaceId: string; operations: unknown[] } {
  return plan([
    { op: "update", entityId: "button-guid-1", changes: [{ path: "/backgroundColor", value: "#ff0000" }] }
  ]);
}

async function resolveVersionDir(root: Root): Promise<string> {
  const dir = await rootDirOf(root);
  const entries = await readdir(dir, { withFileTypes: true });
  const version = entries.find((e) => e.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(e.name));
  return version ? join(dir, version.name) : dir;
}

async function pageFile(root: Root): Promise<string> {
  const projectRoot = await resolveVersionDir(root);
  return join(projectRoot, "project", "page", "Page1.json");
}

async function pageManagerFile(root: Root): Promise<string> {
  const projectRoot = await resolveVersionDir(root);
  return join(projectRoot, "project", "pageManager.json");
}

async function addSecondPage(root: Root, objects: Array<Record<string, unknown>>): Promise<void> {
  const projectRoot = await resolveVersionDir(root);
  const first = JSON.parse(await readFile(join(projectRoot, "project", "page", "Page1.json"), "utf8")) as Record<string, unknown>;
  const second = { ...first, guid: "page-guid-2", objects };
  await writeFile(join(projectRoot, "project", "page", "Page2.json"), JSON.stringify(second, null, 2));
  const managerPath = await pageManagerFile(root);
  const manager = JSON.parse(await readFile(managerPath, "utf8")) as { Pages: Array<Record<string, unknown>> };
  manager.Pages.push({ ...manager.Pages[0], name: "Page2", id: "page-guid-2" });
  await writeFile(managerPath, JSON.stringify(manager, null, 2));
}

interface PageFixture {
  objects: Array<Record<string, unknown>>;
}

async function readPage(root: Root): Promise<PageFixture> {
  return JSON.parse(await readFile(await pageFile(root), "utf8")) as PageFixture;
}

async function writePage(root: Root, page: PageFixture): Promise<void> {
  await writeFile(await pageFile(root), JSON.stringify(page, null, 2));
}

interface VariablesFixture {
  Variables: Array<Record<string, unknown>>;
}

async function variableGroupFile(root: Root): Promise<string> {
  const projectRoot = await resolveVersionDir(root);
  return join(projectRoot, "project", "Tag", "variables", "group-guid-1.json");
}

async function readVariables(root: Root): Promise<VariablesFixture> {
  return JSON.parse(await readFile(await variableGroupFile(root), "utf8")) as VariablesFixture;
}

async function writeVariables(root: Root, doc: VariablesFixture): Promise<void> {
  await writeFile(await variableGroupFile(root), JSON.stringify(doc, null, 2));
}

function markedScript(body: string, overrides: Record<string, unknown> = {}): string {
  const metadata = {
    schema: "kf-compiled-event/v1", moduleId: "kf$script:validator-test", sourceScriptId: "validator-test",
    bodySha256: createHash("sha256").update(body).digest("hex"), bodyByteLength: Buffer.byteLength(body),
    ownerInstanceName: "Button1", placement: "event", kfEvent: "onClick", linkId: 200001, phase: "event",
    instanceReferences: [{ semanticId: "go", instanceName: "Button1" }], pageReferences: [], ...overrides,
  };
  return `// kf-compiled-event/v1 ${Buffer.from(JSON.stringify(metadata)).toString("base64url")}\n${body}`;
}

function reencodeMarker(source: string, transform: (metadata: Record<string, unknown>) => string): string {
  const prefix = "// kf-compiled-event/v1 ";
  const newline = source.indexOf("\n");
  const metadata = JSON.parse(Buffer.from(source.slice(prefix.length, newline), "base64url").toString("utf8")) as Record<string, unknown>;
  return `${prefix}${transform(metadata)}${source.slice(newline)}`;
}

function compileReviewedSyntax(options: { readonly cellClickSource?: string; readonly source?: string } = {}): ReturnType<typeof compileScriptPlan>["module"] {
  const theme = {
    background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32",
    textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8,
    radiusScale: { small: 4, medium: 8, large: 16 },
  } as const;
  const intent = {
    importance: "primary" as const, visualWeight: 3, readingOrder: 0, density: "comfortable" as const, groupWith: [],
    width: { mode: "fixed" as const, value: 120 }, height: { mode: "fixed" as const, value: 40 }, align: "start" as const,
  };
  const reviewedSource = [
    'const value = $control.getValue("status-filter");',
    "let index = 0;",
    'const rows = [{ "extra": true }];',
    'const transformRecord = (item) => ({ 1: item, "label": item, ...rows[index] });',
    "const normalizeText = (raw) => { return String(raw).trim(); };",
    "const matcher = /a\\/b[你好]/gu;",
    "const large = 9007199254740993n;",
    "const mask = 0xFFn;",
    "const preselected = chooseText(value);",
    'function chooseText(input) { if (input !== "") return input; return "empty"; }',
    "const made = transformRecord(value);",
    "const selected = [value].filter((candidate) => candidate === value);",
    "const label = `${value}-${selected.length}`;",
    'const chosen = normalizeText(preselected) || "empty";',
    "let total = (1 + 2) * 3;",
    "total++;",
    "for (let counter = 0; counter < 2; counter += 1) { total += counter; }",
    "for (const entry of rows) { total += entry === made ? 1 : 0; }",
    "if (label === value) total = -total; else total = Math.max(total, 0);",
  ].join("\n");
  const source = options.cellClickSource ?? options.source ?? reviewedSource;
  const cellClick = options.cellClickSource !== undefined;
  const script: ScriptPlan = {
    id: "reviewed-syntax", purpose: "覆盖已审阅语法", kind: "custom", programVersion: "semantic-js/v1", source,
    inputs: source.includes("$control.getValue") ? [{ name: "filter", description: "filter", refKind: "control" as const, refId: "status-filter" }] : [],
    outputs: source.includes("$control.setData") ? [{ name: "records", description: "records", refKind: "control" as const, refId: "records" }] : [],
  };
  const plan: SolutionImplementationPlan = {
    schema: "kf-solution-implementation/v1", projectKey: "validator-e2e", blueprintHash: "a".repeat(64), candidateBundleHash: "b".repeat(64),
    theme, roleStyles: [{ role: "content", declarations: {}, states: {} }],
    mockData: [{ id: "visitor-records", purpose: "访客", fields: [{ key: "id", label: "标识", type: "text" }], records: [{ values: [{ field: "id", value: "a" }] }] }],
    localState: [], overlays: [], scripts: [script],
    actions: [{ id: "run-reviewed", kind: "run-script", scriptId: script.id, afterActionIds: [], journeyStepRefs: [{ journeyId: "review-records", stepIndex: 0 }] }],
    pages: [{ id: "home", title: "首页", purpose: "验证", canvas: "desktop", sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region"], initialStateIds: [], root: {
      id: "root", kind: "layout", layout: "column", sourceBlueprintRegionIds: ["region"], intent, children: [
        { id: "go", kind: "control", capabilityId: "button", content: "执行", properties: [], tabIds: [], styleRole: "content", sourceBlueprintRegionIds: ["region"], intent, eventBindings: cellClick ? [] : [{ semanticEvent: "click", actionIds: ["run-reviewed"] }] },
        { id: "status-filter", kind: "control", capabilityId: "input", content: "筛选", properties: [], tabIds: [], styleRole: "content", sourceBlueprintRegionIds: ["region"], intent, eventBindings: [] },
        { id: "records", kind: "control", capabilityId: "easyui.1", content: "记录", properties: [], tabIds: [], styleRole: "content", sourceBlueprintRegionIds: ["region"], intent,
          mockDataId: "visitor-records", eventBindings: cellClick ? [{ semanticEvent: "row-click", actionIds: ["run-reviewed"] }] : [] },
      ],
    } }],
  };
  const control = (id: string, capabilityId: string, parentId?: string) => ({
    id, role: capabilityId.startsWith("layout.") ? "layout" : "content", capabilityId, ...(parentId === undefined ? {} : { parentId }),
    depth: parentId === undefined ? 0 : 1, zIndex: 0, geometry: { x: 0, y: 0, width: 120, height: 40 }, nativeProperties: {},
    sourceSolutionNodeId: id, sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region"], eventBindings: [],
    ...(capabilityId.startsWith("layout.") ? { compiledLayout: { kind: "column" as const, overflow: "visible" as const } } : {}),
  });
  const implementation: UIImplementationSpecV2 = {
    schema: "kf-ui-implementation/v2", compatibility: "native", sourceSolutionPlanHash: canonicalServerHash(plan),
    sourceModuleRegistryHash: solutionModuleRegistryHash(plan, createDefaultModuleRegistry()),
    theme, compiledRoleStyles: {}, compiledActions: [], compiledScripts: [], pages: [{ compatibility: "native", id: "home", width: 1280, height: 720,
      sourceBlueprintPageId: "bp-home", controls: [control("go", "button", "root"), control("status-filter", "input", "root"),
        { ...control("records", "easyui.1", "root"), dataBinding: { mockDataId: "visitor-records", records: [{ id: "a" }] } }, control("root", "layout.4")] }],
    runtimeCorrelation: { controls: [{ semanticControlId: "go", instanceName: "Button1" }, { semanticControlId: "status-filter", instanceName: "Input1" }, { semanticControlId: "records", instanceName: "Table1" }, { semanticControlId: "root", instanceName: "Layout1" }],
      pages: [{ semanticPageId: "home", pageGuid: "00000000-0000-4000-8000-000000000001" }] },
  };
  const ownerControlId = cellClick ? "records" : "go";
  const semanticEvent = cellClick ? "row-click" : "click";
  const context = createSemanticScriptApiContext({ plan, implementation, ownerControlId, activeEvent: { controlId: ownerControlId, semanticEvent } });
  const identity = createSemanticScriptValidationIdentity(script, context);
  const validatedAst = validateCustomScript({ source, inputs: script.inputs, outputs: script.outputs, context, currentScriptIdentity: identity });
  return compileScriptPlan({ script, context, validationIdentity: identity, validatedAst, binding: { controlId: ownerControlId, semanticEvent } }).module;
}

describe("client validator (Task 7 brief Step 2)", () => {
  it("validates explicitly compiler-owned event script metadata without rejecting unrelated legacy scripts", async () => {
    const base = await copyFixture("client-unknown-field");
    const legacyCandidate = await applyClientPatch(base, happyPlan());
    const legacyPage = await readPage(legacyCandidate);
    legacyPage.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "Click", script: "LegacyControl.DoThing();" }] };
    await writePage(legacyCandidate, legacyPage);
    expect((await validateClientProject(base, legacyCandidate, happyPlan(), { skipRoundTrip: true })).checks.businessRules).toBe("pass");

    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    const source = markedScript("Button1.Value;", { bodySha256: "0".repeat(64) });
    page.objects[0]!.linkMng = { linkList: [{
      linkId: 200001, enable: true, name: "onClick", script: source,
    }] };
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules).toBe("fail");
    expect(report.warnings.join("\n")).toMatch(/compiled script hash mismatch/);
  });

  it("reports compiler-owned target reference failures in the references layer", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    const body = "Missing1.Value;";
    const source = markedScript(body, { instanceReferences: [{ semanticId: "missing", instanceName: "Missing1" }] });
    page.objects[0]!.linkMng = { linkList: [{
      linkId: 200001, enable: true, name: "onClick", script: source,
    }] };
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.references).toBe("fail");
    expect(report.warnings.join("\n")).toMatch(/unknown compiler-owned instance reference/);
  });

  it("accepts a compiler-derived k page GUID through runtime correlation, marker metadata, source scanning, and project references", async () => {
    const correlated = attachRuntimeCorrelation({
      workspaceId: "validator-k-page",
      implementation: {
        schema: "kf-ui-implementation/v2", compatibility: "native",
        theme: { background: "#fff", surface: "#fff", primary: "#163a5f", accent: "#e47b32", textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8, radiusScale: { small: 4, medium: 8, large: 16 } },
        compiledRoleStyles: {}, compiledActions: [], compiledScripts: [],
        pages: [{ compatibility: "native", id: "home", width: 1280, height: 720, sourceBlueprintPageId: "bp-home", controls: [{
          id: "go", role: "action", capabilityId: "button", depth: 0, zIndex: 0,
          geometry: { x: 0, y: 0, width: 90, height: 40 }, nativeProperties: {},
          sourceSolutionNodeId: "go", sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["hero"], eventBindings: [],
        }] }],
      },
    });
    const pageGuid = correlated.runtimeCorrelation!.pages[0]!.pageGuid;
    expect(pageGuid).toMatch(/^k[0-9a-f-]{36}$/);

    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate) as PageFixture & Record<string, unknown>;
    page.guid = pageGuid;
    const body = `const targetPage = ${JSON.stringify(pageGuid)};`;
    page.objects[0]!.linkMng = { linkList: [{
      linkId: 200001, enable: true, name: "onClick",
      script: markedScript(body, { pageReferences: [{ semanticId: "home", pageGuid }] }),
    }] };
    await writePage(candidate, page);
    const managerPath = await pageManagerFile(candidate);
    const manager = JSON.parse(await readFile(managerPath, "utf8")) as { Pages: Array<Record<string, unknown>> };
    manager.Pages[0]!.id = pageGuid;
    await writeFile(managerPath, JSON.stringify(manager, null, 2));

    const report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.references).toBe("pass");
    expect(report.checks.businessRules).toBe("pass");
    expect(report.warnings.join("\n")).not.toMatch(/undeclared page reference|invalid schema|unknown compiler-owned page reference/);
  });

  it("rejects non-canonical marker payloads and non-ASI-safe legacy boundaries", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    const canonical = markedScript("Button1.Value;");
    const nonCanonical = reencodeMarker(canonical, (metadata) => Buffer.from(JSON.stringify(metadata, null, 1)).toString("base64url"));
    page.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "onClick", script: nonCanonical }] };
    await writePage(candidate, page);
    let report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules).toBe("fail");
    expect(report.warnings.join("\n")).toMatch(/canonical/);

    page.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "onClick", script: `legacyCall();\n${canonical}` }] };
    await writePage(candidate, page);
    report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules).toBe("fail");
    expect(report.warnings.join("\n")).toMatch(/boundary/);
  });

  it("rejects an undeclared project instance root but ignores a shadowing local identifier", async () => {
    const base = await copyFixture("client-unknown-field");
    const basePage = await readPage(base);
    basePage.objects.push({ name: "OddWidget7", uiModelType: 0, guid: "odd-widget-guid-7", leftTopPt: { x: 0, y: 0 }, width: 20, height: 20 });
    await writePage(base, basePage);
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "onClick", script: markedScript("OddWidget7.Value;") }] };
    await writePage(candidate, page);
    let report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules).toBe("fail");
    expect(report.warnings.join("\n")).toMatch(/undeclared instance/);

    page.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "onClick", script: markedScript("const OddWidget7 = { Value: 1 }; OddWidget7.Value;") }] };
    await writePage(candidate, page);
    report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules).toBe("pass");

    page.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "onClick", script: markedScript("{ const OddWidget7 = { Value: 1 }; OddWidget7.Value; } OddWidget7.Value;") }] };
    await writePage(candidate, page);
    report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules).toBe("fail");
  });

  it("uses AST runtime references and an evidence allowlist instead of marker labels", async () => {
    const base = await copyFixture("client-unknown-field");
    const basePage = await readPage(base);
    basePage.objects.push({ name: "Table1", uiModelType: 31, guid: "table-guid-1", leftTopPt: { x: 0, y: 0 }, width: 20, height: 20 });
    await writePage(base, basePage);
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    const refs = { instanceReferences: [{ semanticId: "go", instanceName: "Button1" }, { semanticId: "records", instanceName: "Table1" }] };
    page.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "onClick", script: markedScript('const spoof = "Table1";', refs) }] };
    await writePage(candidate, page);
    let report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules).toBe("fail");
    expect(report.warnings.join("\n")).toMatch(/does not use declared instance/);

    page.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "onClick", script: markedScript("Table1.UnknownMethod();", refs) }] };
    await writePage(candidate, page);
    report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules).toBe("fail");
    expect(report.warnings.join("\n")).toMatch(/unsupported runtime member/);
  });

  it("derives runtime capability from uiModelType rather than a forged instance name", async () => {
    const base = await copyFixture("client-unknown-field");
    const basePage = await readPage(base);
    basePage.objects.push({ name: "Table2", uiModelType: 35, guid: "forged-table-name", leftTopPt: { x: 0, y: 0 }, width: 20, height: 20 });
    await writePage(base, basePage);
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects[0]!.linkMng = { linkList: [{
      linkId: 200001, enable: true, name: "onClick",
      script: markedScript("Table2.SetData([]);", { instanceReferences: [{ semanticId: "go", instanceName: "Button1" }, { semanticId: "records", instanceName: "Table2" }] }),
    }] };
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules).toBe("fail");
    expect(report.warnings.join("\n")).toMatch(/unsupported runtime member/);
  });

  it("rejects compiler-owned payloads with escaped globals, dynamic calls, or unbounded work", async () => {
    const attacks = [
      "\\u0070rocess.exit();",
      "const target = String; target(1);",
      "const invoke = 1; { const invoke = () => 1; } invoke();",
      "while (true) {}",
      "for (let i = 0; i < 10; i--) {}",
      "for (let i = 0; i < 10; i += 1) { i = 0; }",
    ];
    for (const body of attacks) {
      const base = await copyFixture("client-unknown-field");
      const candidate = await applyClientPatch(base, happyPlan());
      const page = await readPage(candidate);
      page.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "onClick", script: markedScript(body) }] };
      await writePage(candidate, page);
      const report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
      expect(report.checks.businessRules, body).toBe("fail");
      expect(report.warnings.join("\n"), body).toMatch(/compiled script.*(?:global|call|loop|syntax|binding|shadow)/i);
    }
  });

  it("mirrors loop alias, call-DAG, and lexical declaration restrictions", async () => {
    const attacks = [
      "const records = [1]; const alias = records; for (const record of records) { alias.push(record); }",
      "const records = [1]; function mutate() { records.push(1); } for (const record of records) { mutate(); }",
      "const records = [1]; let alias = []; function bind() { alias = records; } function mutate() { alias.push(1); } for (const record of records) { bind(); mutate(); }",
      "const records = [1]; let alias = []; function mutate() { alias.push(1); } function bind() { alias = records; } for (const record of records) { bind(); mutate(); }",
      "const first = [1]; const second = [2]; let alias = []; alias = first; alias = second; for (const value of alias) { first.push(value); }",
      "const first = [1]; const second = [2]; let alias = []; alias = true ? first : second; for (const value of alias) { second.push(value); }",
      "const first = [1]; const second = [2]; let alias = []; alias = first || second; for (const value of alias) { first.push(value); }",
      "const first = [1]; function choose() { return first; } let alias = []; alias = choose(); for (const value of alias) {}",
      "const records = [1].slice(1, 2); for (const value of records) {}",
      "for (let index = 0; index < 10; index += 1) { function bump() { index += 1; } bump(); }",
      "for (let index = 0; index < 10; index += 1) { function bump() { index += 1; } function wrapper() { bump(); } wrapper(); }",
      "var value = 1;",
      "for (let index = 0; index < 1; index += 1) {} const leaked = index;",
      "function read() { return later; } read(); const later = 1;",
      "function choose() { return 1; } { function choose() { return 2; } } choose();",
    ];
    for (const body of attacks) {
      const base = await copyFixture("client-unknown-field");
      const candidate = await applyClientPatch(base, happyPlan());
      const page = await readPage(candidate);
      page.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "onClick", script: markedScript(body) }] };
      await writePage(candidate, page);
      const report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
      expect(report.checks.businessRules, body).toBe("fail");
      expect(report.warnings.join("\n"), body).toMatch(/compiled script/i);
    }
  });

  it("keeps bounded aliases and initialized closure captures admissible", async () => {
    for (const body of [
      "const records = [1]; const alias = records; let total = 0; for (const record of alias) { total += record; }",
      "const read = () => later; const later = 1; const value = read();",
      "const selected = [1].filter((value) => value === 1);",
      "const records = [1].slice(0, 1); for (const record of records) {}",
      "const rows = [{ value: 1 }]; const made = { ...rows[0] };",
    ]) {
      const base = await copyFixture("client-unknown-field");
      const candidate = await applyClientPatch(base, happyPlan());
      const page = await readPage(candidate);
      page.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "onClick", script: markedScript(body) }] };
      await writePage(candidate, page);
      const report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
      expect(report.checks.businessRules, body).toBe("pass");
    }
  });

  it("validates standard member receiver kinds and exact reviewed arities", async () => {
    const rejected = [
      "const value = {}; value.trim();",
      'const value = "x"; value.trim(1);',
      'const value = "x"; value.includes();',
      "const values = [1]; values.slice(0, 1, 2);",
      "const values = [1]; values.filter((value) => true, 1);",
      "const values = [1]; values.push();",
      `const values = [${Array.from({ length: 1_000 }, () => "1").join(",")}]; values.push(1);`,
      `const values = [${Array.from({ length: 999 }, () => "1").join(",")}]; values.push(1); values.push(1);`,
      `const values = [${Array.from({ length: 999 }, () => "1").join(",")}]; const alias = values; alias.push(1); values.push(1);`,
      `const values = [${Array.from({ length: 999 }, () => "1").join(",")}]; values.push(1); const copy = values.slice(0, 1000); copy.push(1);`,
      "const values = [1]; for (let index = 0; index < 2; index += 1) { values.push(index); }",
      "const values = [1]; function add() { values.push(2); } add(); add();",
      "const values = [1]; function helperB() { values.push(2); } function helperA() { helperB(); } helperA(); helperA();",
      "const values = [1]; function add() { values.push(2); } if (true) { add(); } if (true) { add(); }",
      "const value = 1; const result = Math.abs(value, value);",
      "const result = Math.max();",
      "const Math = { abs: (value) => value }; const result = Math.abs(1);",
      'const result = Date.parse("2026-01-01", "extra");',
      "const result = Date.UTC();",
    ];
    for (const body of rejected) {
      const base = await copyFixture("client-unknown-field");
      const candidate = await applyClientPatch(base, happyPlan());
      const page = await readPage(candidate);
      page.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "onClick", script: markedScript(body) }] };
      await writePage(candidate, page);
      expect((await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true })).checks.businessRules, body).toBe("fail");
    }
  });

  it("propagates bounded array, string, record, callback, and safe-index provenance", async () => {
    const accepted = [
      'const text = " ready "; const trimmed = text.trim(); const matches = trimmed.startsWith("r");',
      "const left = [1]; const right = [2]; const chosen = true ? left : right; const count = chosen.length;",
      "const left = [1]; const right = [2]; const chosen = left || right; const count = chosen.length;",
      'const rows = [{ status: "open" }]; const selected = rows.filter((record) => record.status === "open"); const count = selected.length;',
      "const holder = { records: [1] }; const copy = holder.records.slice(0, 1); const count = copy.length;",
      "const rows = [{ value: 1 }]; const alias = rows; const made = { ...alias[0] };",
      "const rows = [{ value: 1 }]; let index = 0; const made = { ...rows[index] };",
      "const rows = [{ value: 1 }]; let index = 0; function unusedMutation() { index += 1; } const made = { ...rows[index] };",
      "const holder = { rows: [{ value: 1 }] }; const made = { ...holder.rows[0] };",
      "const rows = [{ value: 1 }]; for (let index = 0; index < 1; index += 1) { const made = { ...rows[index] }; }",
      "const rows = [{ value: 1 }]; for (let index = 0; index < 1; index += 1) { rows[index] = { value: 2 }; }",
      "const values = [1]; values.push(2); values.push(3); const selected = values.filter((value) => value > 0);",
      "const values = [1]; function add() { values.push(2); } add();",
      "const values = [1]; function helperB() { values.push(2); } function helperA() { helperB(); } helperA();",
      "const values = [1]; function add() { values.push(2); } if (true) { add(); } else { add(); }",
      `const values = [${Array.from({ length: 1_000 }, () => "1").join(",")}]; for (let index = 0; index <= 999; index += 1) { const value = values[index]; }`,
    ];
    const rejected = [
      "const record = { value: 1 }; record.value = 2;",
      "const rows = [{ value: 1 }]; let index = 0; index += 1; const made = { ...rows[index] };",
      "const rows = [{ value: 1 }]; let index = 0; function mutate() { index += 1; } function wrapper() { mutate(); } wrapper(); const made = { ...rows[index] };",
      "const rows = [{ value: 1 }]; let index = 0; [1].filter(() => { index += 1; return true; }); const made = { ...rows[index] };",
      "const rows = [{ value: 1 }]; let index = 0; rows[index] = { value: 2 };",
      "const unknown = true ? [1] : {}; unknown.push(1);",
      "let values = [1]; values = true ? [1] : {}; values.push(1);",
      "for (let index = 0; index <= 1000; index += 1) {}",
      "for (let index = 0; index < 1001; index += 1) {}",
    ];
    for (const [expected, sources] of [["pass", accepted], ["fail", rejected]] as const) for (const body of sources) {
      const base = await copyFixture("client-unknown-field");
      const candidate = await applyClientPatch(base, happyPlan());
      const page = await readPage(candidate);
      page.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "onClick", script: markedScript(body) }] };
      await writePage(candidate, page);
      expect((await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true })).checks.businessRules, body).toBe(expected);
    }
  });

  it("accepts the real Task6 reviewed-syntax emitter output through marker and project validation", async () => {
    const module = compileReviewedSyntax();
    const base = await copyFixture("client-unknown-field");
    const basePage = await readPage(base);
    basePage.objects.push({ name: "Input1", uiModelType: 38, guid: "reviewed-input", leftTopPt: { x: 0, y: 0 }, width: 20, height: 20 });
    await writePage(base, basePage);
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects[0]!.linkMng = { linkList: [{
      linkId: 200001, enable: true, name: "onClick",
      script: markedScript(module.source, {
        moduleId: module.id, sourceScriptId: module.sourceScriptId,
        instanceReferences: module.instanceReferences,
      }),
    }] };
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules, report.warnings.join("\n")).toBe("pass");
  });

  it("rebuilds a read-only Cell-click event record fact for real Task6 output", async () => {
    const module = compileReviewedSyntax({ cellClickSource: 'const record = $event.record(); const code = record["code"];' });
    expect(module.source).toContain("arguments[1]");
    const base = await copyFixture("client-unknown-field");
    const basePage = await readPage(base);
    basePage.objects.push({ name: "Table1", uiModelType: 31, guid: "record-table", leftTopPt: { x: 0, y: 0 }, width: 20, height: 20 });
    await writePage(base, basePage);
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects[1]!.linkMng = { linkList: [{
      linkId: 200006, enable: true, name: "Cell-click",
      script: markedScript(module.source, {
        moduleId: module.id, sourceScriptId: module.sourceScriptId, ownerInstanceName: "Table1",
        kfEvent: "Cell-click", linkId: 200006, instanceReferences: module.instanceReferences,
      }),
    }] };
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules, report.warnings.join("\n")).toBe("pass");
  });

  it("accepts a static dot field from a real Cell-click record and closes through Table SetData", async () => {
    const module = compileReviewedSyntax({
      cellClickSource: 'const record = $event.record(); const code = record.code; $control.setData("records", [{ "id": String(code) }]);',
    });
    const base = await copyFixture("client-unknown-field");
    const basePage = await readPage(base);
    basePage.objects.push({ name: "Table1", uiModelType: 31, guid: "dot-record-table", leftTopPt: { x: 0, y: 0 }, width: 20, height: 20 });
    await writePage(base, basePage);
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects[1]!.linkMng = { linkList: [{
      linkId: 200006, enable: true, name: "Cell-click",
      script: markedScript(module.source, { moduleId: module.id, sourceScriptId: module.sourceScriptId, ownerInstanceName: "Table1",
        kfEvent: "Cell-click", linkId: 200006, instanceReferences: module.instanceReferences }),
    }] };
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules, report.warnings.join("\n")).toBe("pass");
  });

  it("rejects semantic Cell-click record scripts that shadow the reserved runtime arguments binding", () => {
    expect(() => compileReviewedSyntax({
      cellClickSource: 'const arguments = [null, { "code": "forged" }]; const record = $event.record(); const code = record.code;',
    })).toThrow();
  });

  it("accepts one capacity-proven Task6 push through final project validation", async () => {
    const module = compileReviewedSyntax({ source: 'const records = [{ "id": "a" }]; records.push({ "id": "b" }); $control.setData("records", records);' });
    const base = await copyFixture("client-unknown-field");
    const basePage = await readPage(base);
    basePage.objects.push({ name: "Table1", uiModelType: 31, guid: "push-table", leftTopPt: { x: 0, y: 0 }, width: 20, height: 20 });
    await writePage(base, basePage);
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects[0]!.linkMng = { linkList: [{
      linkId: 200001, enable: true, name: "onClick",
      script: markedScript(module.source, { moduleId: module.id, sourceScriptId: module.sourceScriptId, instanceReferences: module.instanceReferences }),
    }] };
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules, report.warnings.join("\n")).toBe("pass");
  });

  it("accepts a nested single-call Task6 helper push through final project validation", async () => {
    const module = compileReviewedSyntax({ source: [
      'const records = [{ "id": "a" }];',
      'function helperB() { records.push({ "id": "b" }); }',
      "function helperA() { helperB(); }",
      "helperA();",
      '$control.setData("records", records);',
    ].join("\n") });
    const base = await copyFixture("client-unknown-field");
    const basePage = await readPage(base);
    basePage.objects.push({ name: "Table1", uiModelType: 31, guid: "nested-push-table", leftTopPt: { x: 0, y: 0 }, width: 20, height: 20 });
    await writePage(base, basePage);
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "onClick",
      script: markedScript(module.source, { moduleId: module.id, sourceScriptId: module.sourceScriptId, instanceReferences: module.instanceReferences }) }] };
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules, report.warnings.join("\n")).toBe("pass");
  });

  it("rejects runtime writes, reserved members, unreviewed operators, and unbounded implicit work", async () => {
    const base = await copyFixture("client-unknown-field");
    const basePage = await readPage(base);
    basePage.objects.push({ name: "Input1", uiModelType: 38, guid: "input-guid-1", leftTopPt: { x: 0, y: 0 }, width: 20, height: 20 });
    await writePage(base, basePage);
    const attacks = [
      { body: 'Input1.Value = "changed";', refs: [{ semanticId: "go", instanceName: "Button1" }, { semanticId: "filter", instanceName: "Input1" }] },
      { body: "Input1.Value++;", refs: [{ semanticId: "go", instanceName: "Button1" }, { semanticId: "filter", instanceName: "Input1" }] },
      { body: "const value = {}; value.__proto__;" },
      { body: 'const value = {}; value["prototype"];' },
      { body: "const value = { constructor: 1 };" },
      { body: "const value = {}; value.constructor;" },
      { body: "const value = 1; const changed = ~value;" },
      { body: 'const changed = 1 == "1";' },
      { body: "let value = 1; value **= 2;" },
      { body: "const method = [1].filter;" },
      { body: "const copy = [...[1]];" },
    ];
    for (const attack of attacks) {
      const candidate = await applyClientPatch(base, happyPlan());
      const page = await readPage(candidate);
      page.objects[0]!.linkMng = { linkList: [{
        linkId: 200001, enable: true, name: "onClick",
        script: markedScript(attack.body, attack.refs === undefined ? {} : { instanceReferences: attack.refs }),
      }] };
      await writePage(candidate, page);
      const report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
      expect(report.checks.businessRules, attack.body).toBe("fail");
    }

    const tableBase = await copyFixture("client-unknown-field");
    const tableBasePage = await readPage(tableBase);
    tableBasePage.objects.push({ name: "Table1", uiModelType: 31, guid: "table-guid-event", leftTopPt: { x: 0, y: 0 }, width: 20, height: 20 });
    await writePage(tableBase, tableBasePage);
    const tableCandidate = await applyClientPatch(tableBase, happyPlan());
    const tablePage = await readPage(tableCandidate);
    for (const eventBody of [
      "const record = arguments[1]; const selected = record.items.filter((item) => true);",
      "const record = arguments[1]; const made = { ...record };",
      'const record = arguments[1]; record["code"] = "changed";',
      'const record = arguments[1]; const field = "code"; const code = record[field];',
      "const record = arguments[1]; const code = record.constructor;",
      "const record = arguments[1]; record.trim();",
      'function fake() { const record = arguments[1]; const code = record["code"]; } fake();',
      'const arguments = [null, { "code": "forged" }]; const record = arguments[1]; const code = record.code;',
    ]) {
      tablePage.objects[1]!.linkMng = { linkList: [{
        linkId: 200006, enable: true, name: "Cell-click",
        script: markedScript(eventBody, {
          ownerInstanceName: "Table1", kfEvent: "Cell-click", linkId: 200006,
          instanceReferences: [{ semanticId: "records", instanceName: "Table1" }],
        }),
      }] };
      await writePage(tableCandidate, tablePage);
      expect((await validateClientProject(tableBase, tableCandidate, happyPlan(), { skipRoundTrip: true })).checks.businessRules, eventBody).toBe("fail");
    }
  });

  it("requires a unique project instance index and globally unique compiled module ids", async () => {
    const duplicateBase = await copyFixture("client-unknown-field");
    const duplicatePage = await readPage(duplicateBase);
    duplicatePage.objects.push({ name: "Button1", uiModelType: 38, guid: "duplicate-button-name", leftTopPt: { x: 0, y: 0 }, width: 20, height: 20 });
    await writePage(duplicateBase, duplicatePage);
    const duplicateCandidate = await applyClientPatch(duplicateBase, happyPlan());
    let report = await validateClientProject(duplicateBase, duplicateCandidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules).toBe("fail");
    expect(report.warnings.join("\n")).toMatch(/duplicate.*instance/i);

    const moduleBase = await copyFixture("client-unknown-field");
    const moduleBasePage = await readPage(moduleBase);
    moduleBasePage.objects.push({ name: "Button2", uiModelType: 35, guid: "button-guid-2", leftTopPt: { x: 0, y: 0 }, width: 20, height: 20 });
    await writePage(moduleBase, moduleBasePage);
    const moduleCandidate = await applyClientPatch(moduleBase, happyPlan());
    const modulePage = await readPage(moduleCandidate);
    modulePage.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "onClick", script: markedScript("const first = 1;") }] };
    modulePage.objects[1]!.linkMng = { linkList: [{
      linkId: 200001, enable: true, name: "onClick",
      script: markedScript("const second = 2;", { ownerInstanceName: "Button2", instanceReferences: [{ semanticId: "other", instanceName: "Button2" }] }),
    }] };
    await writePage(moduleCandidate, modulePage);
    report = await validateClientProject(moduleBase, moduleCandidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules).toBe("fail");
    expect(report.warnings.join("\n")).toMatch(/duplicate compiled module identity/i);
  });

  it("indexes runtime instances per page while keeping module identities project-global", async () => {
    const legacyBase = await copyFixture("client-unknown-field");
    await addSecondPage(legacyBase, [{ name: "Button1", uiModelType: 35, guid: "page-2-button", leftTopPt: { x: 0, y: 0 }, width: 20, height: 20 }]);
    const legacyCandidate = await applyClientPatch(legacyBase, happyPlan());
    expect((await validateClientProject(legacyBase, legacyCandidate, happyPlan(), { skipRoundTrip: true })).checks.businessRules).toBe("pass");

    const isolatedBase = await copyFixture("client-unknown-field");
    await addSecondPage(isolatedBase, [{ name: "Input1", uiModelType: 38, guid: "page-2-input", leftTopPt: { x: 0, y: 0 }, width: 20, height: 20 }]);
    const isolatedCandidate = await applyClientPatch(isolatedBase, happyPlan());
    const page = await readPage(isolatedCandidate);
    page.objects[0]!.linkMng = { linkList: [{
      linkId: 200001, enable: true, name: "onClick",
      script: markedScript("const value = Input1.Value;", {
        instanceReferences: [{ semanticId: "go", instanceName: "Button1" }, { semanticId: "filter", instanceName: "Input1" }],
      }),
    }] };
    await writePage(isolatedCandidate, page);
    const report = await validateClientProject(isolatedBase, isolatedCandidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules).toBe("fail");
    expect(report.warnings.join("\n")).toMatch(/undeclared instance|owner type|page/i);
  });

  it("uses the full KF field character limit while retaining UTF-8 body slicing", async () => {
    const base = await copyFixture("client-unknown-field");
    for (const [body, expected] of [[`//${"中".repeat(11_000)}`, "pass"], [`//${"中".repeat(31_900)}`, "fail"]] as const) {
      const candidate = await applyClientPatch(base, happyPlan());
      const page = await readPage(candidate);
      const source = markedScript(body);
      expect(Buffer.byteLength(body, "utf8")).toBeGreaterThan(body.length);
      page.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "onClick", script: source }] };
      await writePage(candidate, page);
      const report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
      expect(report.checks.businessRules, `${source.length} chars`).toBe(expected);
    }
  });

  it("checks configureData without linkMng and rejects hidden malformed markers", async () => {
    const base = await copyFixture("client-unknown-field");
    const basePage = await readPage(base);
    basePage.objects.push({ name: "Table1", uiModelType: 31, guid: "table-guid-config", leftTopPt: { x: 0, y: 0 }, width: 20, height: 20 });
    await writePage(base, basePage);
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects[1]!.configureData = markedScript("Table1.UnknownMethod();", {
      ownerInstanceName: "Table1", placement: "configure-data", kfEvent: null, linkId: null, phase: null,
      instanceReferences: [{ semanticId: "records", instanceName: "Table1" }],
    });
    delete page.objects[1]!.linkMng;
    page.objects[0]!.linkMng = { linkList: [{ linkId: 200001, enable: true, name: "onClick", script: `legacy();\n// kf-compiled-event/v1 not-base64\nButton1.Value;` }] };
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules).toBe("fail");
    expect(report.warnings.join("\n")).toMatch(/configureData|marker/);
  });

  it("requires enabled canonical compiler bindings and unique module identities", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    const first = markedScript("Button1.Value;");
    const second = markedScript("Button1.Value;");
    page.objects[0]!.linkMng = { linkList: [
      { linkId: 200001, enable: false, name: "onClick", script: `${first}\n;\n${second}` },
    ] };
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan(), { skipRoundTrip: true });
    expect(report.checks.businessRules).toBe("fail");
    expect(report.warnings.join("\n")).toMatch(/enable|duplicate compiled module/);
  });
  it("accepts disabled native image Load/Error event slots as inert metadata", async () => {
    const base = await copyFixture("client-unknown-field");
    const page = await readPage(base);
    page.objects[0]!["linkMng"] = { linkList: [
      { linkId: 200001, enable: false, script: "", name: "Load" },
      { linkId: 200002, enable: false, script: "", name: "Error" },
    ] };
    await writePage(base, page);
    const report = await validateClientProject(base, base, plan([]));
    expect(report.warnings).toEqual([
      "[businessRules] change plan contains no operations (a confirmed plan must change at least one entity)",
    ]);
  });

  it("passes a legal field-level update", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(report.status).toBe("pass");
    for (const check of Object.values(report.checks)) {
      expect(["pass", "warn"]).toContain(check);
    }
  });

  it("fails on duplicate control GUIDs", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects.push({
      name: "ClonedButton",
      uiModelType: 35,
      guid: "button-guid-1",
      leftTopPt: { x: 0, y: 0 },
      width: 90,
      height: 60,
      text: "clone",
    });
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(report.checks.references).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("fails on a missing variable reference in a script action", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects[0]!.linkMng = {
      linkList: [{ action: "setVariable", variableId: "$NoSuchVar", value: 1 }],
    };
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(report.checks.references).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("fails on an unknown uiModelType", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects[0]!.uiModelType = 999;
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(report.checks.businessRules).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("fails on page geometry outside bounds", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects[0]!.leftTopPt = { x: 1300, y: 80 }; // beyond 1280x720 page
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(report.checks.businessRules).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("fails on an unconfirmed delete in the plan", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await copyFixture("client-unknown-field");
    const report = await validateClientProject(base, candidate, plan([
      { op: "delete", entityId: "button-guid-1", destructiveConfirmed: false }
    ]));
    expect(report.checks.businessRules).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("fails when a file outside the plan scope changed", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    // Tamper with a field the plan did NOT touch (same file, different field).
    const page = await readPage(candidate);
    page.objects[0]!.text = "hacked";
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(report.checks.changeScope).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("fails on a malformed script action", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const page = await readPage(candidate);
    page.objects[0]!.linkMng = {
      linkList: [{ action: "teleportToMoon", moon: "full" }],
    };
    await writePage(candidate, page);
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(report.checks.businessRules).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("fails on a package round-trip mismatch", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    // The packager excludes pagerecord record content (recordpages/recyclepages
    // page snapshots), so it never shows up in the unpacked output; a candidate
    // that keeps it cannot round-trip byte-for-byte.
    const projectRoot = await resolveVersionDir(candidate);
    await mkdir(join(projectRoot, "project", "pagerecord", "recordpages"), { recursive: true });
    await writeFile(join(projectRoot, "project", "pagerecord", "recordpages", "secret.page"), "top-secret");
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(report.checks.roundTrip).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("warns but does not fail when a planned change had no effect", async () => {
    const base = await copyFixture("client-unknown-field");
    // Plan updates /backgroundColor to the value it already... doesn't have, so
    // the patch does apply; instead use a plan whose field equals current value
    // of an existing field: /text stays "确定".
    const planText = plan([
      { op: "update", entityId: "button-guid-1", changes: [{ path: "/text", value: "确定" }] }
    ]);
    const candidate = await applyClientPatch(base, planText);
    const report = await validateClientProject(base, candidate, planText);
    expect(report.status).toBe("pass");
    expect(report.warnings.length).toBeGreaterThan(0);
  });

  it("passes a confirmed delete end-to-end", async () => {
    const base = await copyFixture("client-unknown-field");
    const deletePlan = plan([
      { op: "delete", entityId: "button-guid-1", destructiveConfirmed: true, digest: deleteOperationDigest("button-guid-1") }
    ]);
    const candidate = await applyClientPatch(base, deletePlan);
    const report = await validateClientProject(base, candidate, deletePlan);
    expect(report.status).toBe("pass");
  });

  it("passes a create-control end-to-end", async () => {
    const base = await copyFixture("client-unknown-field");
    const createPlan = plan([
      {
        op: "create",
        entityType: "control",
        entityId: "FreshButton",
        properties: { pageId: "page-guid-1", type: "button", text: "New", x: 10, y: 10, width: 90, height: 60 }
      }
    ]);
    const candidate = await applyClientPatch(base, createPlan);
    const report = await validateClientProject(base, candidate, createPlan);
    expect(report.status).toBe("pass");
  });

  it("returns a fail report (not a throw) for an unknown entityId", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await copyFixture("client-unknown-field");
    const badPlan = plan([
      { op: "update", entityId: "no-such-guid", changes: [{ path: "/text", value: "x" }] }
    ]);
    const report = await validateClientProject(base, candidate, badPlan);
    expect(report.status).toBe("fail");
    expect(report.checks.changeScope).toBe("fail");
  });

  it("returns a fail report (not a throw) for a malformed operation", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await copyFixture("client-unknown-field");
    const badPlan = {
      schema: "kf-change-plan/v1",
      workspaceId: "w-test",
      operations: [{ action: "teleport" }],
    };
    const report = await validateClientProject(base, candidate, badPlan);
    expect(report.status).toBe("fail");
    expect(report.checks.businessRules).toBe("fail");
    expect(report.checks.changeScope).toBe("fail");
  });

  it("returns a fail report (not a throw) for an empty operations array", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await copyFixture("client-unknown-field");
    const report = await validateClientProject(base, candidate, plan([]));
    expect(report.status).toBe("fail");
    expect(report.checks.businessRules).toBe("fail");
  });

  it("passes a create-variable end-to-end (no-GUID array tail append)", async () => {
    const base = await copyFixture("client-unknown-field");
    const createPlan = plan([
      {
        op: "create",
        entityType: "variable",
        entityId: "$NewVar",
        properties: { dataType: 1, comment: "new", defaultValue: 5 },
      },
    ]);
    const candidate = await applyClientPatch(base, createPlan);
    const report = await validateClientProject(base, candidate, createPlan);
    expect(report.status).toBe("pass");
    expect(report.checks.changeScope).toBe("pass");
  });

  it("fails on a mid-array variable insertion (no-GUID array outside scope)", async () => {
    const base = await copyFixture("client-unknown-field");
    const createPlan = plan([
      {
        op: "create",
        entityType: "variable",
        entityId: "$NewVar",
        properties: { dataType: 1 },
      },
    ]);
    const candidate = await applyClientPatch(base, createPlan);
    // Rogue variable inserted in the MIDDLE of Variables[] (not the confirmed
    // tail append) must be detected by the scope diff.
    const variables = await readVariables(candidate);
    variables.Variables.unshift({ name: "$Rogue", dataType: 1, id: 99 });
    await writeVariables(candidate, variables);
    const report = await validateClientProject(base, candidate, createPlan);
    expect(report.checks.changeScope).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("passes a delete-variable end-to-end (no-GUID array element removal)", async () => {
    const base = await copyFixture("client-unknown-field");
    const deletePlan = plan([
      { op: "delete", entityId: "$TestVar", destructiveConfirmed: true, digest: deleteOperationDigest("$TestVar") }
    ]);
    const candidate = await applyClientPatch(base, deletePlan);
    const report = await validateClientProject(base, candidate, deletePlan);
    expect(report.status).toBe("pass");
    expect(report.checks.changeScope).toBe("pass");
  });

  it("passes an update-variable end-to-end (no-GUID array field change)", async () => {
    const base = await copyFixture("client-unknown-field");
    const updatePlan = plan([
      { op: "update", entityId: "$TestVar", changes: [{ path: "/comment", value: "patched comment" }] }
    ]);
    const candidate = await applyClientPatch(base, updatePlan);
    const report = await validateClientProject(base, candidate, updatePlan);
    expect(report.status).toBe("pass");
    expect(report.checks.changeScope).toBe("pass");
  });

  it("passes a same-page delete+create control combination", async () => {
    const base = await copyFixture("client-unknown-field");
    // Build a 3-control page: [button-guid-1, button-guid-2, button-guid-3].
    const page = await readPage(base);
    page.objects.push(
      { name: "Button2", uiModelType: 35, guid: "button-guid-2", leftTopPt: { x: 0, y: 200 }, width: 90, height: 60, text: "b2" },
      { name: "Button3", uiModelType: 35, guid: "button-guid-3", leftTopPt: { x: 0, y: 300 }, width: 90, height: 60, text: "b3" },
    );
    await writePage(base, page);
    // Confirmed combination: delete the middle control, create a new one.
    const comboPlan = plan([
      { op: "delete", entityId: "button-guid-2", destructiveConfirmed: true, digest: deleteOperationDigest("button-guid-2") },
      { op: "create", entityType: "control", entityId: "Button4", properties: { pageId: "page-guid-1", type: "button", text: "b4", x: 0, y: 400, width: 90, height: 60 } }
    ]);
    const candidate = await applyClientPatch(base, comboPlan);
    const report = await validateClientProject(base, candidate, comboPlan);
    expect(report.status).toBe("pass");
    expect(report.checks.changeScope).toBe("pass");
  });

  it("passes a delete-middle-control end-to-end", async () => {
    const base = await copyFixture("client-unknown-field");
    const page = await readPage(base);
    page.objects.push(
      { name: "Button2", uiModelType: 35, guid: "button-guid-2", leftTopPt: { x: 0, y: 200 }, width: 90, height: 60, text: "b2" },
      { name: "Button3", uiModelType: 35, guid: "button-guid-3", leftTopPt: { x: 0, y: 300 }, width: 90, height: 60, text: "b3" },
    );
    await writePage(base, page);
    const deletePlan = plan([
      { op: "delete", entityId: "button-guid-2", destructiveConfirmed: true, digest: deleteOperationDigest("button-guid-2") }
    ]);
    const candidate = await applyClientPatch(base, deletePlan);
    const report = await validateClientProject(base, candidate, deletePlan);
    expect(report.status).toBe("pass");
    expect(report.checks.changeScope).toBe("pass");
  });

  it("passes a create-before-delete same-page combination (order-independent)", async () => {
    const base = await copyFixture("client-unknown-field");
    const page = await readPage(base);
    page.objects.push(
      { name: "Button2", uiModelType: 35, guid: "button-guid-2", leftTopPt: { x: 0, y: 200 }, width: 90, height: 60, text: "b2" },
      { name: "Button3", uiModelType: 35, guid: "button-guid-3", leftTopPt: { x: 0, y: 300 }, width: 90, height: 60, text: "b3" },
    );
    await writePage(base, page);
    // Same confirmed set as above but the create runs BEFORE the delete in the
    // plan; the scope prediction must be order-independent.
    const comboPlan = plan([
      { op: "create", entityType: "control", entityId: "Button4", properties: { pageId: "page-guid-1", type: "button", text: "b4", x: 0, y: 400, width: 90, height: 60 } },
      { op: "delete", entityId: "button-guid-2", destructiveConfirmed: true, digest: deleteOperationDigest("button-guid-2") },
    ]);
    const candidate = await applyClientPatch(base, comboPlan);
    const report = await validateClientProject(base, candidate, comboPlan);
    expect(report.status).toBe("pass");
    expect(report.checks.changeScope).toBe("pass");
  });

  it("fails on an unplanned control insertion even next to a same-page delete", async () => {
    const base = await copyFixture("client-unknown-field");
    const page = await readPage(base);
    page.objects.push(
      { name: "Button2", uiModelType: 35, guid: "button-guid-2", leftTopPt: { x: 0, y: 200 }, width: 90, height: 60, text: "b2" },
      { name: "Button3", uiModelType: 35, guid: "button-guid-3", leftTopPt: { x: 0, y: 300 }, width: 90, height: 60, text: "b3" },
    );
    await writePage(base, page);
    const comboPlan = plan([
      { op: "delete", entityId: "button-guid-2", destructiveConfirmed: true, digest: deleteOperationDigest("button-guid-2") },
      { op: "create", entityType: "control", entityId: "Button4", properties: { pageId: "page-guid-1", type: "button", text: "b4", x: 0, y: 400, width: 90, height: 60 } }
    ]);
    const candidate = await applyClientPatch(base, comboPlan);
    // Rogue control inserted after the confirmed operations — must stay a fail.
    const candPage = await readPage(candidate);
    candPage.objects.push({ name: "Rogue", uiModelType: 35, guid: "rogue-guid", leftTopPt: { x: 0, y: 500 }, width: 90, height: 60, text: "rogue" });
    await writePage(candidate, candPage);
    const report = await validateClientProject(base, candidate, comboPlan);
    expect(report.checks.changeScope).toBe("fail");
    expect(report.status).toBe("fail");
  });

  it("passes a head-delete + create variable combination", async () => {
    const base = await copyFixture("client-unknown-field");
    // base variables: [$TestVar, $V2, $V3]
    const variables = await readVariables(base);
    variables.Variables.push(
      { name: "$V2", dataType: 1, id: 2 },
      { name: "$V3", dataType: 1, id: 3 },
    );
    await writeVariables(base, variables);
    const comboPlan = plan([
      { op: "delete", entityId: "$TestVar", destructiveConfirmed: true, digest: deleteOperationDigest("$TestVar") },
      { op: "create", entityType: "variable", entityId: "$V4", properties: { dataType: 1 } }
    ]);
    const candidate = await applyClientPatch(base, comboPlan);
    const report = await validateClientProject(base, candidate, comboPlan);
    expect(report.status).toBe("pass");
    expect(report.checks.changeScope).toBe("pass");
  });

  it("passes a multi-delete + create variable combination", async () => {
    const base = await copyFixture("client-unknown-field");
    const variables = await readVariables(base);
    variables.Variables.push(
      { name: "$V2", dataType: 1, id: 2 },
      { name: "$V3", dataType: 1, id: 3 },
    );
    await writeVariables(base, variables);
    const comboPlan = plan([
      { op: "delete", entityId: "$TestVar", destructiveConfirmed: true, digest: deleteOperationDigest("$TestVar") },
      { op: "delete", entityId: "$V2", destructiveConfirmed: true, digest: deleteOperationDigest("$V2") },
      { op: "create", entityType: "variable", entityId: "$V4", properties: { dataType: 1 } }
    ]);
    const candidate = await applyClientPatch(base, comboPlan);
    const report = await validateClientProject(base, candidate, comboPlan);
    expect(report.status).toBe("pass");
    expect(report.checks.changeScope).toBe("pass");
  });

  it("deletes the right controls in an ascending multi-delete", async () => {
    const base = await copyFixture("client-unknown-field");
    const page = await readPage(base);
    page.objects.push(
      { name: "Button2", uiModelType: 35, guid: "button-guid-2", leftTopPt: { x: 0, y: 200 }, width: 90, height: 60, text: "b2" },
      { name: "Button3", uiModelType: 35, guid: "button-guid-3", leftTopPt: { x: 0, y: 300 }, width: 90, height: 60, text: "b3" },
      { name: "Button4", uiModelType: 35, guid: "button-guid-4", leftTopPt: { x: 0, y: 400 }, width: 90, height: 60, text: "b4" },
    );
    await writePage(base, page);
    const deletePlan = plan([
      { op: "delete", entityId: "button-guid-2", destructiveConfirmed: true, digest: deleteOperationDigest("button-guid-2") },
      { op: "delete", entityId: "button-guid-3", destructiveConfirmed: true, digest: deleteOperationDigest("button-guid-3") },
    ]);
    const candidate = await applyClientPatch(base, deletePlan);
    const result = await inspectClientProject(await rootDirOf(candidate));
    // g2 and g3 gone; g1 and g4 survive (ascending base-index deletion must
    // not splice the wrong element after the array shrinks).
    expect(result.index.controls["button-guid-2"]).toBeUndefined();
    expect(result.index.controls["button-guid-3"]).toBeUndefined();
    expect(result.index.controls["button-guid-1"]).toBeDefined();
    expect(result.index.controls["button-guid-4"]).toBeDefined();
  });

  it("passes delete + update of a later control on the same page", async () => {
    const base = await copyFixture("client-unknown-field");
    const page = await readPage(base);
    page.objects.push(
      { name: "Button2", uiModelType: 35, guid: "button-guid-2", leftTopPt: { x: 0, y: 200 }, width: 90, height: 60, text: "b2" },
      { name: "Button3", uiModelType: 35, guid: "button-guid-3", leftTopPt: { x: 0, y: 300 }, width: 90, height: 60, text: "b3" },
    );
    await writePage(base, page);
    const comboPlan = plan([
      { op: "delete", entityId: "button-guid-2", destructiveConfirmed: true, digest: deleteOperationDigest("button-guid-2") },
      { op: "update", entityId: "button-guid-3", changes: [{ path: "/backgroundColor", value: "#123456" }] }
    ]);
    const candidate = await applyClientPatch(base, comboPlan);
    const report = await validateClientProject(base, candidate, comboPlan);
    expect(report.status).toBe("pass");
    expect(report.checks.changeScope).toBe("pass");
  });
});

describe("validator reports", () => {
  it("always returns all six checks", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    const report = await validateClientProject(base, candidate, happyPlan());
    expect(Object.keys(report.checks).sort()).toEqual([
      "businessRules",
      "changeScope",
      "jsonSchema",
      "packageStructure",
      "references",
      "roundTrip",
    ]);
  });

  it("keeps candidate inspectable after validation", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, happyPlan());
    await validateClientProject(base, candidate, happyPlan());
    const result = await inspectClientProject(await rootDirOf(candidate));
    expect(result.index.controls["button-guid-1"]?.type).toBe("button");
  });

  it("fails the changeScope layer when base and candidate are the same directory (C1 defense)", async () => {
    const base = await copyFixture("client-unknown-field");
    // A same-directory "patch" with a non-empty plan means the confirmed plan
    // was never applied; the validator must fail instead of a silent no-op.
    const report = await validateClientProject(base, base, happyPlan());
    expect(report.status).toBe("fail");
    expect(report.checks.changeScope).toBe("fail");
    expect(report.warnings.join(" ")).toContain("same directory");
  });
});
