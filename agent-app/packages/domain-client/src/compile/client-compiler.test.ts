// @ts-nocheck -- 测试含 brief 逐字代码（JS 风格、无类型标注）；运行时行为由 vitest 断言验证。
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileClientProject, deriveGuid } from "./client-compiler.js";
import { packageNativeClientProject } from "../package/native-client-package.js";
import { importNativeClientPackage } from "../package/native-client-package.js";
import { inspectClientProject } from "../inspect/client-inspector.js";

const minimalIrPath = fileURLToPath(
  new URL("../../../../tests/fixtures/client-ir/minimal.json", import.meta.url),
);
const ir = JSON.parse(await readFile(minimalIrPath, "utf8"));

async function hashDirectory(dir) {
  const files = [];
  async function walk(p, rel) {
    const entries = await readdir(p, { withFileTypes: true });
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const full = path.join(p, e.name);
      const next = rel === "" ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) await walk(full, next);
      else files.push([next, createHash("sha256").update(await readFile(full)).digest("hex")]);
    }
  }
  await walk(dir, "");
  const h = createHash("sha256");
  for (const [rel, digest] of files) h.update(rel).update("\0").update(digest).update("\0");
  return h.digest("hex");
}

async function findJsonValue(dir, key) {
  let found;
  function search(node) {
    if (found !== undefined) return;
    if (Array.isArray(node)) {
      node.forEach(search);
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (k === key) {
          found = v;
          return;
        }
        search(v);
        if (found !== undefined) return;
      }
    }
  }
  async function walk(p) {
    const entries = await readdir(p, { withFileTypes: true });
    for (const e of entries) {
      if (found !== undefined) return;
      const full = path.join(p, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.name.toLowerCase().endsWith(".json")) {
        search(JSON.parse(await readFile(full, "utf8")));
        if (found !== undefined) return;
      }
    }
  }
  await walk(dir);
  return found;
}

const irWithInjectedRawField = {
  ...ir,
  pages: ir.pages.map((page) => ({
    ...page,
    controls: page.controls.map((control, ci) =>
      ci === 0 ? { ...control, arbitraryRawField: { keep: true } } : control,
    ),
  })),
};

describe("client compiler", () => {
  it("compiles the same IR and seed byte-for-byte", async () => {
    const first = await compileClientProject(ir, { seed: "build-1" });
    const second = await compileClientProject(ir, { seed: "build-1" });
    expect(await hashDirectory(first.path)).toBe(await hashDirectory(second.path));
  });

  it("uses reviewed templates rather than model-provided raw fields", async () => {
    const result = await compileClientProject(irWithInjectedRawField, { seed: "build-2" });
    expect(await findJsonValue(result.path, "arbitraryRawField")).toBeUndefined();
  });

  it("derives RFC 4122 v5 GUIDs from seed plus semantic id", () => {
    const g1 = deriveGuid({ seed: "build-1" }, "page-1");
    expect(g1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(deriveGuid({ seed: "build-1" }, "page-1")).toBe(g1);
  });

  it("produces different GUIDs for different seeds", async () => {
    const a = await compileClientProject(ir, { seed: "seed-a" });
    const b = await compileClientProject(ir, { seed: "seed-b" });
    const readPageGuid = async (ws) => {
      const page = JSON.parse(
        await readFile(
          path.join(ws.path, "1.0.0.1", "project", "page", "Page1.json"),
          "utf8",
        ),
      );
      return page.guid;
    };
    expect(await readPageGuid(a)).not.toBe(await readPageGuid(b));
    // KF 页面 GUID 带 k 前缀（KF 序列化规范），其余保持 UUID 格式
    expect(await readPageGuid(a)).toMatch(/^k[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it("rejects duplicate semantic page ids", async () => {
    const dup = {
      ...ir,
      pages: [...ir.pages, { ...ir.pages[0], id: "page-1", name: "Page1" }],
    };
    await expect(compileClientProject(dup, { seed: "s" })).rejects.toThrow(/MODEL_OUTPUT_INVALID/);
  });

  it("rejects duplicate semantic control ids within a page", async () => {
    const dup = {
      ...ir,
      pages: [
        {
          ...ir.pages[0],
          controls: [
            ...ir.pages[0].controls,
            { id: "Text1", type: "text", x: 0, y: 0, width: 10, height: 10, text: "dup" },
          ],
        },
      ],
    };
    await expect(compileClientProject(dup, { seed: "s" })).rejects.toThrow(/MODEL_OUTPUT_INVALID/);
  });

  it("rejects duplicate semantic variable ids", async () => {
    const dup = {
      ...ir,
      variables: [
        ...ir.variables,
        { id: "var-other", name: "$Temp", dataType: 1, defaultValue: 1 },
      ],
    };
    await expect(compileClientProject(dup, { seed: "s" })).rejects.toThrow(/MODEL_OUTPUT_INVALID/);
  });

  it("rejects raw JavaScript strings injected into controls with MODEL_OUTPUT_INVALID", async () => {
    const irWithJs = {
      ...ir,
      pages: ir.pages.map((page) => ({
        ...page,
        controls: page.controls.map((control) => ({ ...control, configureData: "alert(1)" })),
      })),
    };
    await expect(compileClientProject(irWithJs, { seed: "build-3" }))
      .rejects.toThrow(/MODEL_OUTPUT_INVALID/);
  });

  it("compiles a setVariable action as a restricted DSL command with the semantic variable id", async () => {
    const result = await compileClientProject(ir, { seed: "build-1" });
    const page = JSON.parse(
      await readFile(path.join(result.path, "1.0.0.1", "project", "page", "Page1.json"), "utf8"),
    );
    const button = page.objects.find((o) => o.name === "Button1");
    expect(button.linkMng.linkList).toHaveLength(1);
    expect(button.linkMng.linkList[0]).toMatchObject({
      action: "setVariable",
      variableId: "$Temp",
      value: 1,
    });
  });

  it("resolves navigate.pageId semantic ids to page KF GUIDs", async () => {
    const irWithNavigate = {
      ...ir,
      pages: [
        {
          ...ir.pages[0],
          controls: ir.pages[0].controls.map((control) =>
            control.type === "button"
              ? { ...control, action: { kind: "navigate", pageId: "Page1" } }
              : control,
          ),
        },
      ],
    };
    const result = await compileClientProject(irWithNavigate, { seed: "build-nav" });
    const page = JSON.parse(
      await readFile(path.join(result.path, "1.0.0.1", "project", "page", "Page1.json"), "utf8"),
    );
    const button = page.objects.find((o) => o.name === "Button1");
    expect(button.linkMng.linkList[0]).toMatchObject({
      action: "navigatePage",
      pageId: page.guid,
    });
  });

  it("rejects actions referencing unknown semantic ids", async () => {
    const badNav = {
      ...ir,
      pages: [
        {
          ...ir.pages[0],
          controls: ir.pages[0].controls.map((control) =>
            control.type === "button"
              ? { ...control, action: { kind: "navigate", pageId: "NoSuchPage" } }
              : control,
          ),
        },
      ],
    };
    await expect(compileClientProject(badNav, { seed: "s" })).rejects.toThrow(/MODEL_OUTPUT_INVALID/);

    const badVar = {
      ...ir,
      pages: [
        {
          ...ir.pages[0],
          controls: ir.pages[0].controls.map((control) =>
            control.type === "button"
              ? { ...control, action: { kind: "setVariable", variableId: "$Nope", value: 0 } }
              : control,
          ),
        },
      ],
    };
    await expect(compileClientProject(badVar, { seed: "s" })).rejects.toThrow(/MODEL_OUTPUT_INVALID/);
  });

  it("rejects control types without a reviewed template", async () => {
    const irWithUnknown = {
      ...ir,
      pages: [
        {
          ...ir.pages[0],
          controls: [
            { id: "G1", type: "gauge", x: 0, y: 0, width: 50, height: 30 },
          ],
        },
      ],
    };
    await expect(compileClientProject(irWithUnknown, { seed: "s" }))
      .rejects.toThrow(/MODEL_OUTPUT_INVALID/);
  });

  it("round-trips through importNativeClientPackage and inspects cleanly", async () => {
    const result = await compileClientProject(ir, { seed: "build-rt" });
    const gz = await packageNativeClientProject(result.path);
    const unpacked = await importNativeClientPackage(gz, tmpdir());
    const inspected = await inspectClientProject(unpacked);
    expect(inspected.summary.pageCount).toBe(1);
    expect(inspected.summary.pages[0].name).toBe("Page1");
    // KF 页面 GUID 带 k 前缀
    expect(inspected.summary.pages[0].guid).toMatch(/^k[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(inspected.summary.pages[0].controls).toHaveLength(3);
    expect(inspected.summary.pages[0].controls.map((c) => c.type).sort()).toEqual([
      "button",
      "inputnumber",
      "text",
    ]);
    // KF 系统变量占 id 1-10，minimal IR 的用户变量 $Temp 从 id 11 开始
    expect(inspected.index.variables["11"].name).toBe("$Temp");
  });
});

// ---------------------------------------------------------------------------
// KF metadata completeness (实机验收发现：缺元数据文件导致 KF 客户端无法打开)
// ---------------------------------------------------------------------------

const KF_REQUIRED_METADATA = [
  "config/GraphicModelManager.json",
  "config/loginConfig.json",
  "config/GraphicGroupManager.json",
  "ImgResourceManager.json",
  "reportManager.json",
  "reportGroupManager.json",
  "resourceGroupManager.json",
  "userManager.json",
  "datasourceManager.json",
  "diffusionManager.json",
  "globalScriptManager.json",
  "authManager.json",
  "resourceManager.json",
  "securitySectionManager.json",
  "pageGroupManager.json",
  "dataSet/dataSet.json",
  "htDataModel/storage/scenes/default.json",
];

it("compiled workspace includes the full KF metadata file set", async () => {
  const result = await compileClientProject(ir, { seed: "metadata-test" });
  const projectDir = path.join(result.path, "1.0.0.1", "project");
  for (const rel of KF_REQUIRED_METADATA) {
    await expect(readFile(path.join(projectDir, rel), "utf8")).resolves.toBeTruthy();
  }
});

it("page group wiring is consistent (pageManager.groupId === pageGroupManager.Groups.id)", async () => {
  const result = await compileClientProject(ir, { seed: "group-test" });
  const projectDir = path.join(result.path, "1.0.0.1", "project");
  const pm = JSON.parse(await readFile(path.join(projectDir, "pageManager.json"), "utf8"));
  const pg = JSON.parse(await readFile(path.join(projectDir, "pageGroupManager.json"), "utf8"));
  expect(pm.Pages.length).toBeGreaterThan(0);
  for (const page of pm.Pages) expect(page.groupId).toBe(pg.Groups.id);
  expect(pg.Groups.pages).toEqual(pm.Pages.map((p) => p.id));
  const diff = JSON.parse(await readFile(path.join(projectDir, "diffusionManager.json"), "utf8"));
  for (const page of pm.Pages) expect(Object.keys(diff.page)).toContain(page.id);
});

it("variables include KF system variables (id 1-10) and user variables start above 10", async () => {
  const result = await compileClientProject(ir, { seed: "var-test" });
  const projectDir = path.join(result.path, "1.0.0.1", "project");
  const entries = await readdir(path.join(projectDir, "Tag", "variables"));
  const groupFile = path.join(projectDir, "Tag", "variables", entries.find((f) => f.endsWith(".json")));
  const group = JSON.parse(await readFile(groupFile, "utf8"));
  const sysNames = ["$Year", "$Month", "$Day", "$Hour", "$Minute", "$Second", "$MilliSecond", "$Date", "$Time", "$DayofWeek"];
  for (const sys of sysNames) expect(group.Variables.map((v) => v.name)).toContain(sys);
  expect(group.Variables.slice(0, 10).map((v) => v.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  const userVars = group.Variables.slice(10);
  expect(userVars.length).toBeGreaterThan(0);
  for (const v of userVars) expect(v.id).toBeGreaterThan(10);
});

it("metadata dirs are created and determinism still holds", async () => {
  const a = await compileClientProject(ir, { seed: "determinism-a" });
  const b = await compileClientProject(ir, { seed: "determinism-a" });
  expect(await hashDirectory(a.path)).toBe(await hashDirectory(b.path));
  for (const rel of ["dataSource", "svgs", "res/graphicGroup", "htDataModel/storage/assets"]) {
    await expect(readdir(path.join(a.path, "1.0.0.1", "project", rel))).resolves.toBeDefined();
  }
});
