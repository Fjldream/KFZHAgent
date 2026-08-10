import { describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClientWorkspace } from "../compile/client-compiler.js";
import { inspectClientProject } from "../inspect/client-inspector.js";
import { deriveGuid } from "../compile/guid-factory.js";
import { applyClientPatch, deleteOperationDigest, patchConflict, planHash } from "./client-patcher.js";

const pkgDir = fileURLToPath(new URL(".", import.meta.url));
const fixturesRoot = join(pkgDir, "../../../../tests/fixtures");
const fixture = (name: string): string => join(fixturesRoot, name);

type Root = string | ClientWorkspace;

async function tempDir(prefix: string): Promise<string> {
  return mkdtemp(join(tmpdir(), prefix));
}

async function copyFixture(name: string): Promise<string> {
  const dest = await tempDir("kf-patch-base-");
  await cp(fixture(name), dest, { recursive: true });
  return dest;
}

function plan(operations: unknown[]): { schema: "kf-change-plan/v1"; workspaceId: string; operations: unknown[] } {
  return { schema: "kf-change-plan/v1", workspaceId: "w-test", operations };
}

function updateOperation(
  entityId: string,
  changes: Array<{ path: string; value: unknown }>,
  extra?: Record<string, unknown>,
): unknown {
  return { op: "update", entityId, changes, ...extra };
}

async function resolveVersionDir(root: string): Promise<string> {
  const entries = await readdir(root, { withFileTypes: true });
  const version = entries.find((e) => e.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(e.name));
  return version ? join(root, version.name) : root;
}

async function rootDirOf(root: Root): Promise<string> {
  return typeof root === "string" ? root : root.rootDir;
}

async function pageFile(root: Root): Promise<Record<string, unknown>> {
  const dir = await rootDirOf(root);
  const projectRoot = await resolveVersionDir(dir);
  const page = JSON.parse(
    await readFile(join(projectRoot, "project", "page", "Page1.json"), "utf8"),
  ) as Record<string, unknown>;
  return page;
}

async function nodeAt(entry: { rawPath: string }, page: Record<string, unknown>): Promise<Record<string, unknown>> {
  const frag = entry.rawPath.split("#")[1] ?? "";
  let node: unknown = page;
  for (const seg of frag.split("/").filter(Boolean)) {
    const num = Number(seg);
    node = (node as Record<string, unknown>)[Number.isNaN(num) ? seg : num];
  }
  return node as Record<string, unknown>;
}

async function controlField(root: Root, guid: string, field: string): Promise<unknown> {
  const result = await inspectClientProject(await rootDirOf(root));
  const entry = result.index.controls[guid];
  if (!entry) throw new Error(`no control ${guid} in index`);
  const node = await nodeAt(entry, await pageFile(root));
  return node[field];
}

async function wholeControl(root: Root, guid: string): Promise<Record<string, unknown>> {
  const result = await inspectClientProject(await rootDirOf(root));
  const entry = result.index.controls[guid];
  if (!entry) throw new Error(`no control ${guid} in index`);
  return nodeAt(entry, await pageFile(root));
}

describe("client patcher (Task 7 brief Step 1)", () => {
  it("changes only the confirmed field and preserves unknown content", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, {
      operations: [{
        action: "update",
        entityType: "control",
        entityId: "button-guid-1",
        changes: [{ path: "/backgroundColor", value: "#ff0000" }]
      }]
    });
    expect(await controlField(candidate, "button-guid-1", "backgroundColor")).toBe("#ff0000");
    expect(await controlField(candidate, "button-guid-1", "customFutureField")).toEqual({ keep: true });
  });

  it("patches multiple fields including geometry aliases without touching siblings", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, plan([
      updateOperation("button-guid-1", [
        { path: "/backgroundColor", value: "#00ff00" },
        { path: "/x", value: 200 },
        { path: "/y", value: 120 },
        { path: "/width", value: 120 },
      ])
    ]));
    const control = await wholeControl(candidate, "button-guid-1");
    expect(control.backgroundColor).toBe("#00ff00");
    expect(control.leftTopPt).toEqual({ x: 200, y: 120 });
    expect(control.width).toBe(120);
    expect(control.height).toBe(60);
    expect(control.text).toBe("确定");
    expect(control.name).toBe("Button1");
    expect(control.guid).toBe("button-guid-1");
    expect(control.customFutureField).toEqual({ keep: true });
  });

  it("rejects an update path outside the per-type allowlist", async () => {
    const base = await copyFixture("client-unknown-field");
    await expect(
      applyClientPatch(base, plan([
        updateOperation("button-guid-1", [{ path: "/arbitraryRawField", value: "x" }])
      ])),
    ).rejects.toThrow(patchConflict);
  });

  it("rejects patching a control GUID (immutable identity field)", async () => {
    const base = await copyFixture("client-unknown-field");
    await expect(
      applyClientPatch(base, plan([
        updateOperation("button-guid-1", [{ path: "/guid", value: "new-guid" }])
      ])),
    ).rejects.toThrow(patchConflict);
  });

  it("fails when the entity GUID does not exist", async () => {
    const base = await copyFixture("client-unknown-field");
    await expect(
      applyClientPatch(base, plan([
        updateOperation("missing-guid", [{ path: "/backgroundColor", value: "#fff" }])
      ])),
    ).rejects.toThrow(/not found/i);
  });

  it("rejects an unconfirmed delete", async () => {
    const base = await copyFixture("client-unknown-field");
    await expect(
      applyClientPatch(base, plan([
        { op: "delete", entityId: "button-guid-1", destructiveConfirmed: false }
      ])),
    ).rejects.toThrow(/destructiveConfirmed/i);
  });

  it("rejects a delete with a mismatched operation digest", async () => {
    const base = await copyFixture("client-unknown-field");
    await expect(
      applyClientPatch(base, plan([
        { op: "delete", entityId: "button-guid-1", destructiveConfirmed: true, digest: "deadbeef" }
      ])),
    ).rejects.toThrow(/digest/i);
  });

  it("deletes a control when confirmed with a matching digest", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, plan([
      { op: "delete", entityId: "button-guid-1", destructiveConfirmed: true, digest: deleteOperationDigest("button-guid-1") }
    ]));
    const result = await inspectClientProject(await rootDirOf(candidate));
    expect(result.index.controls["button-guid-1"]).toBeUndefined();
    expect(result.index.pages["page-guid-1"]?.controlGuids).not.toContain("button-guid-1");
    // The page file and its other content survive untouched.
    const rawPage = result.raw.pages["page-guid-1"] as Record<string, unknown>;
    expect(rawPage["customFutureField"]).toEqual({ keep: true });
    expect((rawPage["pageProperty"] as Record<string, unknown>)["name"]).toBe("Page1");
  });

  it("creates a control from its reviewed template and a derived GUID", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, plan([
      {
        op: "create",
        entityType: "control",
        entityId: "NewButton",
        properties: { pageId: "page-guid-1", type: "button", text: "Go", x: 10, y: 20, width: 90, height: 60 }
      }
    ]));
    const expectedGuid = deriveGuid({ seed: "w-test" }, "NewButton");
    const created = await wholeControl(candidate, expectedGuid);
    expect(created).toMatchObject({
      name: "NewButton",
      guid: expectedGuid,
      uiModelType: 35,
      text: "Go",
      leftTopPt: { x: 10, y: 20 },
      width: 90,
      height: 60,
    });
    // Existing control is untouched.
    expect(await controlField(candidate, "button-guid-1", "customFutureField")).toEqual({ keep: true });
  });

  it("creates controls of all 12 reviewed template types with pass-through props", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, plan([
      {
        op: "create", entityType: "control", entityId: "NewSwitch",
        properties: { pageId: "page-guid-1", type: "switch", value: true, activeText: "开", inactiveText: "关", x: 0, y: 0 },
      },
      {
        op: "create", entityType: "control", entityId: "NewSelect",
        properties: { pageId: "page-guid-1", type: "select", options: [{ label: "A", value: "a" }], value: "a" },
      },
      {
        op: "create", entityType: "control", entityId: "NewTable",
        properties: { pageId: "page-guid-1", type: "table", x: 10, y: 10 },
      },
      {
        op: "create", entityType: "control", entityId: "NewSpacer",
        properties: { pageId: "page-guid-1", type: "spacer", axis: "horizontal" },
      },
      {
        op: "create", entityType: "control", entityId: "NewCheckbox",
        properties: { pageId: "page-guid-1", type: "checkbox", label: "启用", checked: true },
      },
    ]));
    const sw = await wholeControl(candidate, deriveGuid({ seed: "w-test" }, "NewSwitch"));
    expect(sw).toMatchObject({ name: "NewSwitch", uiModelType: 48, value: true, activeText: "开", inactiveText: "关" });
    const sel = await wholeControl(candidate, deriveGuid({ seed: "w-test" }, "NewSelect"));
    expect(sel).toMatchObject({ name: "NewSelect", uiModelType: 44, options: [{ label: "A", value: "a" }], value: "a" });
    const tbl = await wholeControl(candidate, deriveGuid({ seed: "w-test" }, "NewTable"));
    expect(tbl).toMatchObject({ name: "NewTable", uiModelType: 31 });
    const spc = await wholeControl(candidate, deriveGuid({ seed: "w-test" }, "NewSpacer"));
    expect(spc).toMatchObject({ name: "NewSpacer" });
    const cb = await wholeControl(candidate, deriveGuid({ seed: "w-test" }, "NewCheckbox"));
    expect(cb).toMatchObject({ name: "NewCheckbox", label: "启用", checked: true });
  });

  it("creates controls of the new ElementUI types with pass-through props", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, plan([
      {
        op: "create", entityType: "control", entityId: "NewInput",
        properties: { pageId: "page-guid-1", type: "input", placeholder: "请输入", value: "hello", clearable: true, x: 0, y: 0 },
      },
      {
        op: "create", entityType: "control", entityId: "NewTag",
        properties: { pageId: "page-guid-1", type: "tag", effect: "light", closable: true },
      },
      {
        op: "create", entityType: "control", entityId: "NewSteps",
        properties: { pageId: "page-guid-1", type: "steps", active: 1, direction: "horizontal" },
      },
      {
        op: "create", entityType: "control", entityId: "NewTree",
        properties: { pageId: "page-guid-1", type: "tree", showCheckbox: true, indent: 16 },
      },
      {
        op: "create", entityType: "control", entityId: "NewCascader",
        properties: { pageId: "page-guid-1", type: "cascader", placeholder: "请选择" },
      },
      {
        op: "create", entityType: "control", entityId: "NewRadioLegacy",
        properties: { pageId: "page-guid-1", type: "radiolegacy", options: [{ label: "A", value: "a" }] },
      },
    ]));
    const inp = await wholeControl(candidate, deriveGuid({ seed: "w-test" }, "NewInput"));
    expect(inp).toMatchObject({ name: "NewInput", uiModelType: 38, placeholder: "请输入", value: "hello", clearable: true });
    const tag = await wholeControl(candidate, deriveGuid({ seed: "w-test" }, "NewTag"));
    expect(tag).toMatchObject({ name: "NewTag", uiModelType: 50, effect: "light", closable: true });
    const stp = await wholeControl(candidate, deriveGuid({ seed: "w-test" }, "NewSteps"));
    expect(stp).toMatchObject({ name: "NewSteps", uiModelType: 52, active: 1, direction: "horizontal" });
    const tree = await wholeControl(candidate, deriveGuid({ seed: "w-test" }, "NewTree"));
    expect(tree).toMatchObject({ name: "NewTree", uiModelType: 32, showCheckbox: true, indent: 16 });
    const cas = await wholeControl(candidate, deriveGuid({ seed: "w-test" }, "NewCascader"));
    expect(cas).toMatchObject({ name: "NewCascader", uiModelType: 39, placeholder: "请选择" });
    const rl = await wholeControl(candidate, deriveGuid({ seed: "w-test" }, "NewRadioLegacy"));
    expect(rl).toMatchObject({ name: "NewRadioLegacy", uiModelType: 0 });
  });

  it("updates a variable field by name", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, plan([
      updateOperation("$TestVar", [{ path: "/comment", value: "patched comment" }])
    ]));
    const result = await inspectClientProject(await rootDirOf(candidate));
    expect(result.index.variables["1"]?.name).toBe("$TestVar");
    const variables = (result.raw.variables["group-guid-1"] as { Variables: Array<Record<string, unknown>> }).Variables;
    expect(variables[0]?.comment).toBe("patched comment");
  });

  it("creates a variable into the located group file (not a hard-coded name)", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, plan([
      {
        op: "create",
        entityType: "variable",
        entityId: "$NewVar",
        properties: { dataType: 1, comment: "new", defaultValue: 7 }
      }
    ]));
    const result = await inspectClientProject(await rootDirOf(candidate));
    const created = Object.values(result.index.variables).find((v) => v.name === "$NewVar");
    expect(created).toBeDefined();
    // Appended to the same group file that already holds $TestVar.
    expect(created?.file).toBe("project/Tag/variables/group-guid-1.json");
    const variables = (result.raw.variables["group-guid-1"] as { Variables: Array<Record<string, unknown>> }).Variables;
    const entry = variables.find((v) => v.name === "$NewVar");
    expect(entry).toMatchObject({ dataType: 1, comment: "new", defaultValue: 7 });
    expect(typeof entry?.id).toBe("number");
  });

  it("accepts a plan whose planHash matches", async () => {
    const base = await copyFixture("client-unknown-field");
    const p = plan([updateOperation("button-guid-1", [{ path: "/backgroundColor", value: "#112233" }])]);
    const hash = planHash(p);
    const candidate = await applyClientPatch(base, p, { planHash: hash });
    expect(await controlField(candidate, "button-guid-1", "backgroundColor")).toBe("#112233");
  });

  it("rejects a plan whose planHash does not match", async () => {
    const base = await copyFixture("client-unknown-field");
    const p = plan([updateOperation("button-guid-1", [{ path: "/backgroundColor", value: "#112233" }])]);
    await expect(applyClientPatch(base, p, { planHash: "deadbeef" })).rejects.toThrow(/planHash/i);
  });
});
