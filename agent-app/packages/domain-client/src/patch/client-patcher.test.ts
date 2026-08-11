import { describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
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

async function setControlField(root: string, guid: string, field: string, value: unknown): Promise<void> {
  const result = await inspectClientProject(root);
  const entry = result.index.controls[guid];
  if (!entry) throw new Error(`no control ${guid} in index`);
  const page = await pageFile(root);
  const control = await nodeAt(entry, page);
  control[field] = value;
  const projectRoot = await resolveVersionDir(root);
  await writeFile(join(projectRoot, "project", "page", "Page1.json"), JSON.stringify(page, null, 2));
}

describe("client patcher (Task 7 brief Step 1)", () => {
  it("applies structured style to an imported control without changing unknown fields", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, plan([{
      op: "applyStyle",
      entityId: "button-guid-1",
      entityType: "control",
      style: { declarations: { backgroundColor: "#2563eb", borderRadius: 8 }, states: {} },
    }]));

    expect(await controlField(candidate, "button-guid-1", "backgroundColor")).toBe("#2563eb");
    expect(await controlField(candidate, "button-guid-1", "styleDataNew")).toContain("border-radius:8px");
    expect(await controlField(candidate, "button-guid-1", "customFutureField")).toEqual({ keep: true });
  });

  it("preserves customer CSS and merges successive compiler-managed declaration and state deltas", async () => {
    const base = await copyFixture("client-unknown-field");
    const customerCss = "#domId .customer-owned{color:#123456}";
    await setControlField(base, "button-guid-1", "styleDataNew", customerCss);

    const candidate = await applyClientPatch(base, plan([
      {
        op: "applyStyle",
        entityId: "button-guid-1",
        entityType: "control",
        style: {
          declarations: { backgroundColor: "#2563eb", fontSize: 14 },
          states: { hover: { textColor: "#ffffff" } },
        },
      },
      {
        op: "applyStyle",
        entityId: "button-guid-1",
        entityType: "control",
        style: {
          declarations: { borderRadius: 8, fontSize: 16 },
          states: { active: { opacity: 0.8 } },
        },
      },
    ]));

    const merged = await controlField(candidate, "button-guid-1", "styleDataNew");
    expect(merged).toContain(customerCss);
    expect(merged).toContain("font-size:16px");
    expect(merged).not.toContain("font-size:14px");
    expect(merged).toContain("border-radius:8px");
    expect(merged).toContain("#domId:hover{color:#ffffff}");
    expect(merged).toContain("#domId:active{opacity:0.8}");
    expect((merged as string).match(/KF_AGENT_MANAGED_STYLE_V1_START/g)).toHaveLength(1);
    expect(await controlField(candidate, "button-guid-1", "backgroundColor")).toBe("#2563eb");
  });

  it("leaves imported native fields and styleDataNew byte-for-byte unchanged for an empty style delta", async () => {
    const base = await copyFixture("client-unknown-field");
    const customerCss = "#domId{color:#123456}\n";
    await setControlField(base, "button-guid-1", "styleDataNew", customerCss);
    await setControlField(base, "button-guid-1", "backgroundColor", "#abcdef");
    const baseProjectRoot = await resolveVersionDir(base);
    const beforePage = await readFile(join(baseProjectRoot, "project", "page", "Page1.json"), "utf8");

    const candidate = await applyClientPatch(base, plan([{
      op: "applyStyle",
      entityId: "button-guid-1",
      entityType: "control",
      style: { declarations: {}, states: {} },
    }]));

    expect(await controlField(candidate, "button-guid-1", "styleDataNew")).toBe(customerCss);
    expect(await controlField(candidate, "button-guid-1", "backgroundColor")).toBe("#abcdef");
    const candidateProjectRoot = await resolveVersionDir(candidate.rootDir);
    expect(await readFile(join(candidateProjectRoot, "project", "page", "Page1.json"), "utf8"))
      .toBe(beforePage);
  });

  it("rejects empty style application to an imported preserve-only capability", async () => {
    const base = await copyFixture("client-unknown-field");
    await setControlField(base, "button-guid-1", "uiModelType", 31);

    await expect(applyClientPatch(base, plan([{
      op: "applyStyle",
      entityId: "button-guid-1",
      entityType: "control",
      style: { declarations: {}, states: {} },
    }]))).rejects.toThrow(/PATCH_CONFLICT: UNSUPPORTED_STYLE_CAPABILITY|STYLE_ADAPTER_UNAVAILABLE/);
  });

  it("wraps schema-valid invalid style values as patch conflicts without changing the base", async () => {
    const base = await copyFixture("client-unknown-field");

    await expect(applyClientPatch(base, plan([{
      op: "applyStyle",
      entityId: "button-guid-1",
      entityType: "control",
      style: { declarations: { backgroundColor: "red" }, states: {} },
    }]))).rejects.toThrow("PATCH_CONFLICT: INVALID_STYLE_VALUE");

    expect(await controlField(base, "button-guid-1", "backgroundColor")).not.toBe("red");
    expect(await controlField(base, "button-guid-1", "customFutureField")).toEqual({ keep: true });
  });

  it("validates and compiles create-control styles after template merging", async () => {
    const base = await copyFixture("client-unknown-field");
    const inspected = await inspectClientProject(base);
    const pageId = Object.keys(inspected.index.pages)[0];
    if (!pageId) throw new Error("fixture must contain a page");
    const candidate = await applyClientPatch(base, plan([{
      op: "create",
      entityType: "control",
      entityId: "StyledButton",
      properties: {
        pageId,
        type: "button",
        x: 100,
        y: 100,
        width: 120,
        height: 40,
        text: "Save",
        style: { declarations: { backgroundColor: "#2563eb", borderRadius: 8 }, states: {} },
      },
    }]));
    const createdGuid = deriveGuid({ seed: "w-test" }, "StyledButton");

    expect(await controlField(candidate, createdGuid, "backgroundColor")).toBe("#2563eb");
    expect(await controlField(candidate, createdGuid, "styleDataNew")).toContain("border-radius:8px");
  });

  it("rejects nested reserved native/style payloads at the create persistence boundary", async () => {
    const base = await copyFixture("client-unknown-field");

    await expect(applyClientPatch(base, plan([{
      op: "create",
      entityType: "control",
      entityId: "UnsafeSelect",
      properties: {
        pageId: "page-guid-1",
        type: "select",
        options: [{
          label: "Ready",
          value: "ready",
          raw: { native: { styleDataNew: "#domId{display:none}" } },
        }],
      },
    }]))).rejects.toThrow(/PATCH_CONFLICT: UNSAFE_COMPONENT_PROPERTY/);

    const inspection = await inspectClientProject(base);
    expect(inspection.index.controls[deriveGuid({ seed: "w-test" }, "UnsafeSelect")]).toBeUndefined();
  });

  it("rejects unknown nested native/script fields in direct ChangePlan control properties", async () => {
    const base = await copyFixture("client-unknown-field");

    await expect(applyClientPatch(base, plan([{
      op: "create",
      entityType: "control",
      entityId: "UnsafeDirectSelect",
      properties: {
        pageId: "page-guid-1",
        type: "select",
        options: [{
          label: "Ready",
          value: "ready",
          objectType: 3,
          linkMng: { linkList: [] },
          script: "evil()",
        }],
      },
    }]))).rejects.toThrow(/PATCH_CONFLICT: INVALID_COMPONENT_PROPERTY/);

    const inspection = await inspectClientProject(base);
    expect(inspection.index.controls[deriveGuid({ seed: "w-test" }, "UnsafeDirectSelect")]).toBeUndefined();
  });

  it("rejects unsafe image fit and URL values in a direct ChangePlan", async () => {
    const base = await copyFixture("client-unknown-field");

    await expect(applyClientPatch(base, plan([{
      op: "create",
      entityType: "control",
      entityId: "UnsafeDirectImage",
      properties: {
        pageId: "page-guid-1",
        type: "image",
        src: "javascript:alert(1)",
        fit: "fill;background:url(javascript:evil)",
      },
    }]))).rejects.toThrow(/PATCH_CONFLICT: INVALID_COMPONENT_PROPERTY/);
  });

  it.each([
    { name: "string x", extra: { x: "10" } },
    { name: "object y", extra: { y: { value: 10 } } },
    { name: "negative width", extra: { width: -1 } },
    { name: "zero height", extra: { height: 0 } },
    { name: "inconsistent proto discriminator", extra: { proto: 1 } },
  ])("rejects $name in the direct create envelope", async ({ extra }) => {
    const base = await copyFixture("client-unknown-field");

    await expect(applyClientPatch(base, plan([{
      op: "create",
      entityType: "control",
      entityId: "UnsafeEnvelope",
      properties: {
        pageId: "page-guid-1",
        type: "button",
        x: 10,
        y: 20,
        width: 100,
        height: 40,
        text: "Safe text",
        ...extra,
      },
    }]))).rejects.toThrow(/PATCH_CONFLICT: INVALID_CREATE_CONTROL_ENVELOPE/);
  });

  it.each([
    { name: "input inputType", type: "input", extra: { inputType: "password" } },
    { name: "datetime pickerType", type: "datetimepicker", extra: { pickerType: "date" } },
    { name: "inputnumber variableId", type: "inputnumber", extra: { variableId: "$Temp" } },
    { name: "inputnumber decimals", type: "inputnumber", extra: { decimals: 2 } },
  ])("rejects direct-only $name instead of silently dropping it during create", async ({ type, extra }) => {
    const base = await copyFixture("client-unknown-field");
    await expect(applyClientPatch(base, plan([{
      op: "create",
      entityType: "control",
      entityId: "UnsupportedPatchSemantic",
      properties: { pageId: "page-guid-1", type, ...extra },
    }]))).rejects.toThrow(/PATCH_CONFLICT: INVALID_COMPONENT_PROPERTY/);
  });

  it("accepts the reviewed restricted button action for native compilation", async () => {
    const base = await copyFixture("client-unknown-field");
    await expect(applyClientPatch(base, plan([{
      op: "create", entityType: "control", entityId: "NavigateButton",
      properties: { pageId: "page-guid-1", type: "button", text: "Go", action: { kind: "navigate", pageId: "Page1" } },
    }]))).resolves.toBeDefined();
  });

  it("rejects a button navigate action whose semantic page target is unknown", async () => {
    const base = await copyFixture("client-unknown-field");
    await expect(applyClientPatch(base, plan([{
      op: "create", entityType: "control", entityId: "UnknownNavigateButton",
      properties: { pageId: "page-guid-1", type: "button", text: "Go", action: { kind: "navigate", pageId: "missing-page" } },
    }]))).rejects.toThrow(/PATCH_CONFLICT: invalid button action: unknown page missing-page/);
  });

  it.each(["/linkMng/linkList", "/linkMng~1linkList", "/linkMng/0"]) ("rejects raw or descendant linkMng update %s before persistence", async (path) => {
    const base = await copyFixture("client-unknown-field");
    await expect(applyClientPatch(base, plan([{
      op: "update", entityType: "control", entityId: "button-guid-1",
      changes: [{ path, value: { action: "navigatePage", script: "evil()" } }],
    }]))).rejects.toThrow(/PATCH_CONFLICT/);
    expect(await controlField(base, "button-guid-1", "linkMng")).toBeUndefined();
  });

  it("nests static, EasyUI, and layout controls using parent-local coordinates", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, plan([
      {
        op: "create", entityType: "control", entityId: "OuterLayout",
        properties: { pageId: "page-guid-1", type: "layout", layoutType: 2, x: 100, y: 80, width: 500, height: 360 },
      },
      {
        op: "create", entityType: "control", entityId: "InnerLayout",
        properties: { pageId: "page-guid-1", type: "layout", layoutType: 2, parentId: "OuterLayout", x: 140, y: 120, width: 300, height: 200 },
      },
      {
        op: "create", entityType: "control", entityId: "NestedText",
        properties: { pageId: "page-guid-1", type: "text", parentId: "InnerLayout", x: 170, y: 150, width: 120, height: 30, text: "Nested" },
      },
      {
        op: "create", entityType: "control", entityId: "NestedEasyUi",
        properties: { pageId: "page-guid-1", type: "easyui", proto: 9, parentId: "InnerLayout", x: 180, y: 190, width: 180, height: 32 },
      },
    ]));

    const outer = await wholeControl(candidate, deriveGuid({ seed: "w-test" }, "OuterLayout"));
    const inner = (outer["insiderObjects"] as Record<string, unknown>[])[0]!;
    const children = inner["insiderObjects"] as Record<string, unknown>[];
    const text = children.find((child) => child["name"] === "NestedText")!;
    const easyui = children.find((child) => child["name"] === "NestedEasyUi")!;

    expect((outer["baseProperty"] as Record<string, unknown>)["leftTopPt"]).toEqual({ x: 100, y: 80 });
    expect((inner["baseProperty"] as Record<string, unknown>)["leftTopPt"]).toEqual({ x: 40, y: 40 });
    expect(inner["internalVertex"]).toEqual({ left: 40, top: 40 });
    expect(text["leftTopPt"]).toEqual({ x: 30, y: 30 });
    expect(text["internalVertex"]).toEqual({ left: 30, top: 30 });
    expect(easyui["leftTopPt"]).toEqual({ x: 40, y: 70 });
    expect(easyui["internalVertex"]).toEqual({ left: 40, top: 70 });

    const inspection = await inspectClientProject(await rootDirOf(candidate));
    expect(inspection.index.controls[deriveGuid({ seed: "w-test" }, "InnerLayout")]?.id).toBe("InnerLayout");
    expect(inspection.index.controls[deriveGuid({ seed: "w-test" }, "NestedText")]?.id).toBe("NestedText");
    expect(inspection.index.controls[deriveGuid({ seed: "w-test" }, "NestedEasyUi")]?.id).toBe("NestedEasyUi");
  });

  it.each([
    { label: "static", type: "text", properties: { text: "no parent" } },
    { label: "easyui", type: "easyui", properties: { proto: 9 } },
    { label: "layout", type: "layout", properties: { layoutType: 2 } },
  ])("rejects an explicit missing parent for $label controls", async ({ type, properties }) => {
    const base = await copyFixture("client-unknown-field");
    await expect(applyClientPatch(base, plan([{
      op: "create", entityType: "control", entityId: `MissingParent-${type}`,
      properties: { pageId: "page-guid-1", type, parentId: "DoesNotExist", x: 20, y: 20, width: 100, height: 40, ...properties },
    }]))).rejects.toThrow(/PATCH_CONFLICT: create/);
  });

  it("rejects a non-layout explicit parent instead of falling back to page root", async () => {
    const base = await copyFixture("client-unknown-field");
    await expect(applyClientPatch(base, plan([
      {
        op: "create", entityType: "control", entityId: "NotALayout",
        properties: { pageId: "page-guid-1", type: "text", x: 10, y: 10, width: 100, height: 30, text: "Not a layout" },
      },
      {
        op: "create", entityType: "control", entityId: "NestedUnderText",
        properties: { pageId: "page-guid-1", type: "easyui", proto: 9, parentId: "NotALayout", x: 20, y: 20, width: 100, height: 30 },
      },
    ]))).rejects.toThrow(/PATCH_CONFLICT: create easyui control/);
  });

  it.each(["   ", "x".repeat(101)])("rejects invalid runtime-normalized entityId %j", async (entityId) => {
    const base = await copyFixture("client-unknown-field");
    await expect(applyClientPatch(base, plan([{
      op: "create",
      entityType: "control",
      entityId,
      properties: { pageId: "page-guid-1", type: "button", text: "unsafe" },
    }]))).rejects.toThrow(/PATCH_CONFLICT: operations\[0\]\.entityId/);
  });

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
