import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClientWorkspace } from "../compile/client-compiler.js";
import { applyClientPatch, deleteOperationDigest } from "../patch/client-patcher.js";
import { inspectClientProject } from "../inspect/client-inspector.js";
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
      expect(report.warnings.join("\n"), body).toMatch(/compiled script.*(?:global|call|loop|syntax)/i);
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
