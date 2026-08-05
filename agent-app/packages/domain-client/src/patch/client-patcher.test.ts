// @ts-nocheck -- 测试含 brief 逐字代码（JS 风格、无类型标注）；运行时行为由 vitest 断言验证。
/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import { describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspectClientProject } from "../inspect/client-inspector.js";
import { deriveGuid } from "../compile/guid-factory.js";
import { applyClientPatch, deleteOperationDigest, patchConflict, planHash } from "./client-patcher.js";

const pkgDir = fileURLToPath(new URL(".", import.meta.url));
const fixturesRoot = join(pkgDir, "../../../../tests/fixtures");
const fixture = (name) => join(fixturesRoot, name);

async function tempDir(prefix) {
  return mkdtemp(join(tmpdir(), prefix));
}

async function copyFixture(name) {
  const dest = await tempDir("kf-patch-base-");
  await cp(fixture(name), dest, { recursive: true });
  return dest;
}

function plan(operations) {
  return { schema: "kf-change-plan/v1", workspaceId: "w-test", operations };
}

function updateOperation(entityId, changes, extra) {
  return { op: "update", entityId, changes, ...extra };
}

async function resolveVersionDir(root) {
  const entries = await import("node:fs/promises").then((m) => m.readdir(root, { withFileTypes: true }));
  const version = entries.find((e) => e.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(e.name));
  return version ? join(root, version.name) : root;
}

async function rootDirOf(root) {
  return typeof root === "string" ? root : root.rootDir;
}

async function controlField(root, guid, field) {
  const result = await inspectClientProject(await rootDirOf(root));
  const entry = result.index.controls[guid];
  if (!entry) throw new Error(`no control ${guid} in index`);
  const [file, frag] = entry.rawPath.split("#");
  const projectRoot = await resolveVersionDir(await rootDirOf(root));
  const page = JSON.parse(await readFile(join(projectRoot, file), "utf8"));
  let node = page;
  for (const seg of frag.split("/").filter(Boolean)) {
    node = node[Number.isNaN(Number(seg)) ? seg : Number(seg)];
  }
  return node[field];
}

async function wholeControl(root, guid) {
  const result = await inspectClientProject(await rootDirOf(root));
  const entry = result.index.controls[guid];
  const [file, frag] = entry.rawPath.split("#");
  const projectRoot = await resolveVersionDir(await rootDirOf(root));
  const page = JSON.parse(await readFile(join(projectRoot, file), "utf8"));
  let node = page;
  for (const seg of frag.split("/").filter(Boolean)) {
    node = node[Number.isNaN(Number(seg)) ? seg : Number(seg)];
  }
  return node;
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
    expect(result.index.pages["page-guid-1"].controlGuids).not.toContain("button-guid-1");
    // The page file and its other content survive untouched.
    expect(result.raw.pages["page-guid-1"].customFutureField).toEqual({ keep: true });
    expect(result.raw.pages["page-guid-1"].pageProperty.name).toBe("Page1");
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

  it("updates a variable field by name", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, plan([
      updateOperation("$TestVar", [{ path: "/comment", value: "patched comment" }])
    ]));
    const result = await inspectClientProject(await rootDirOf(candidate));
    expect(result.index.variables["1"].name).toBe("$TestVar");
    expect(result.raw.variables["group-guid-1"].Variables[0].comment).toBe("patched comment");
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
