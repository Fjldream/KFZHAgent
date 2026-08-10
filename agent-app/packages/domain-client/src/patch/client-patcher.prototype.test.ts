// KF 特殊节点（prototypeName 判别）的 patcher 修改链路测试：
// - create：用 prototype 模板 + 透传 prototypeName + 宽容字段，产出合法 KF
//   特殊节点（CustomCharts 含 objectType=1 / pageProperty 几何；图表型含
//   顶层几何 + chartComponentType；两者都不含 type/uiModelType）；
// - update：字段按 allowlist 过滤（guid/areasNumStr/任意未知字段被拒）；
//   pageProperty/objects 作为整体替换；CustomCharts 几何经路径别名映射到
//   pageProperty.pagePos/pageSize。
import { describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile, readdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClientWorkspace } from "../compile/client-compiler.js";
import { deriveGuid } from "../compile/guid-factory.js";
import { inspectClientProject } from "../inspect/client-inspector.js";
import { applyClientPatch, patchConflict } from "./client-patcher.js";

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
): unknown {
  return { op: "update", entityId, changes };
}

async function resolveVersionDir(root: string): Promise<string> {
  const entries = await readdir(root, { withFileTypes: true });
  const version = entries.find((e) => e.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(e.name));
  return version ? join(root, version.name) : root;
}

async function rootDirOf(root: Root): Promise<string> {
  return typeof root === "string" ? root : root.rootDir;
}

async function pageJson(root: Root): Promise<Record<string, unknown>> {
  const dir = await rootDirOf(root);
  const projectRoot = await resolveVersionDir(dir);
  return JSON.parse(
    await readFile(join(projectRoot, "project", "page", "Page1.json"), "utf8"),
  ) as Record<string, unknown>;
}

/** 在页面对象树中按 KF GUID 递归查找节点（含布局 insiderObjects 嵌套）。 */
function findNodeByGuid(node: unknown, guid: string): Record<string, unknown> | undefined {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findNodeByGuid(item, guid);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (node === null || typeof node !== "object") return undefined;
  const record = node as Record<string, unknown>;
  if (record["guid"] === guid) return record;
  for (const key of ["objects", "children", "layoutItems", "insiderObjects"]) {
    if (key in record) {
      const found = findNodeByGuid(record[key], guid);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

/** 按 KF GUID 直接读取页面 JSON 中的原始 prototype 节点。 */
async function rawPrototype(root: Root, guid: string): Promise<Record<string, unknown>> {
  const page = await pageJson(root);
  const found = findNodeByGuid(page["objects"], guid);
  if (!found) throw new Error(`no prototype node ${guid} in page`);
  return found;
}

/**
 * 从 client-unknown-field 复制工程，并把 Page1.json 的 objects 替换为一个
 * CustomCharts（objectType=1 + pageProperty 几何）与一个 XYChart（顶层几何），
 * 供 update 测试使用。
 */
async function makePrototypeFixture(): Promise<string> {
  const dest = await copyFixture("client-unknown-field");
  const versionDir = await resolveVersionDir(dest);
  const pagePath = join(versionDir, "project", "page", "Page1.json");
  const page = JSON.parse(await readFile(pagePath, "utf8")) as Record<string, unknown>;
  page["objects"] = [
    {
      prototypeName: "CustomCharts",
      objectType: 1,
      guid: "prototype-custom-guid",
      pageProperty: {
        name: "CustomCharts1",
        pagePos: { x: 13, y: 5 },
        pageSize: { width: 952, height: 513 },
        windowSize: { width: 1440, height: 900 },
        title: "旧窗口标题",
        titleBar: true,
        closeBox: false,
        sizeable: true,
      },
      objects: ['{"name":"echart","customChartsType":1,"option":{"title":{"text":"旧配置"}}}'],
      modlePrototype: { name: "", guid: "kmod-1", version: "2.0.0.1.1", type: 1 },
      region: "center",
      version: "2.0.0.1.1",
      fixedSize: [952, 513],
      sizePolicy: [3, 3, 0, 0],
      visible: true,
      lock: false,
      linkMng: { linkList: [] },
    },
    {
      prototypeName: "XYChart",
      guid: "prototype-chart-guid",
      name: "XYChart1",
      chartComponentType: 5,
      leftTopPt: { x: 89, y: 34 },
      width: 749,
      height: 271,
      title: { show: true, text: "旧标题", position: 1 },
      areas: [{ top: 0, left: 0, width: 749, height: 253 }],
      areasNumStr: "1,0,0,0",
      comment: "旧注释",
      version: "2.0.0.1.1",
    },
  ];
  await writeFile(pagePath, JSON.stringify(page, null, 2), "utf8");
  return dest;
}

describe("client patcher — KF 特殊节点（prototypeName 判别）", () => {
  it("creates an unconfigured CustomCharts shell (objectType=1, pageProperty geometry)", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, plan([
      {
        op: "create",
        entityType: "control",
        entityId: "NewCustomChart",
        properties: {
          pageId: "page-guid-1",
          type: "prototype",
          prototypeName: "CustomCharts",
          x: 30,
          y: 40,
          width: 400,
          height: 300,
          region: "center",
        },
      },
    ]));
    const expectedGuid = deriveGuid({ seed: "w-test" }, "NewCustomChart");
    const node = await rawPrototype(candidate, expectedGuid);
    // 合法 KF 特殊节点：prototypeName + objectType=1，几何在 pageProperty，
    // Foundation generation emits only the reviewed shell and geometry.
    expect(node["prototypeName"]).toBe("CustomCharts");
    expect(node["objectType"]).toBe(1);
    expect(node["type"]).toBeUndefined();
    expect(node["uiModelType"]).toBeUndefined();
    expect(node["guid"]).toBe(expectedGuid);
    expect(node["pageProperty"]).toMatchObject({
      name: "NewCustomChart",
      pagePos: { x: 30, y: 40 },
      pageSize: { width: 400, height: 300 },
    });
    expect(node["region"]).toBe("center");
    expect((node["modlePrototype"] as Record<string, unknown>)["type"]).toBe(1);
    // 模板默认字段必须存在，构成合法对象（fixedSize 与 pageSize 同步）。
    expect(node["fixedSize"]).toEqual([400, 300]);
    expect(node["linkMng"]).toEqual({ linkList: [] });
    // inspect 能识别为 prototype 控件。
    const result = await inspectClientProject(await rootDirOf(candidate));
    expect(result.index.controls[expectedGuid]?.type).toBe("prototype");
  });

  it("rejects configured CustomCharts objects in a direct ChangePlan", async () => {
    const base = await copyFixture("client-unknown-field");

    await expect(applyClientPatch(base, plan([{
      op: "create",
      entityType: "control",
      entityId: "ConfiguredCustomChart",
      properties: {
        pageId: "page-guid-1",
        type: "prototype",
        prototypeName: "CustomCharts",
        x: 30,
        y: 40,
        width: 400,
        height: 300,
        objects: ['{"name":"echart","option":{"series":[]}}'],
      },
    }]))).rejects.toThrow(/PATCH_CONFLICT: INVALID_COMPONENT_PROPERTY/);
  });

  it("creates a chart prototype (顶层几何 + chartComponentType, 无 type/uiModelType)", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, plan([
      {
        op: "create",
        entityType: "control",
        entityId: "NewXYChart",
        properties: {
          pageId: "page-guid-1",
          type: "prototype",
          prototypeName: "XYChart",
          x: 10,
          y: 20,
          width: 600,
          height: 400,
          title: { show: true, text: "My XY", position: 2 },
          areas: [{ top: 0, left: 0, width: 600, height: 380 }],
        },
      },
    ]));
    const expectedGuid = deriveGuid({ seed: "w-test" }, "NewXYChart");
    const node = await rawPrototype(candidate, expectedGuid);
    expect(node["prototypeName"]).toBe("XYChart");
    expect(node["chartComponentType"]).toBe(5);
    expect(node["type"]).toBeUndefined();
    expect(node["uiModelType"]).toBeUndefined();
    expect(node["guid"]).toBe(expectedGuid);
    expect(node).toMatchObject({
      name: "NewXYChart",
      leftTopPt: { x: 10, y: 20 },
      width: 600,
      height: 400,
      title: { show: true, text: "My XY", position: 2 },
      areas: [{ top: 0, left: 0, width: 600, height: 380 }],
    });
    const result = await inspectClientProject(await rootDirOf(candidate));
    expect(result.index.controls[expectedGuid]?.type).toBe("prototype");
  });

  it("rejects create of an unsupported prototypeName", async () => {
    const base = await copyFixture("client-unknown-field");
    await expect(
      applyClientPatch(base, plan([
        {
          op: "create",
          entityType: "control",
          entityId: "Mystery",
          properties: { pageId: "page-guid-1", type: "prototype", prototypeName: "MysteryNode" },
        },
      ])),
    ).rejects.toThrow(patchConflict);
  });

  it("rejects unreviewed top-level native fields on a TrendChart create", async () => {
    const base = await copyFixture("client-unknown-field");

    await expect(applyClientPatch(base, plan([
      {
        op: "create",
        entityType: "control",
        entityId: "UnsafeTrend",
        properties: {
          pageId: "page-guid-1",
          type: "prototype",
          prototypeName: "TrendChart",
          x: 10,
          y: 20,
          width: 600,
          height: 400,
          objectType: 1,
          linkMng: { linkList: [{ script: "evil()" }] },
        },
      },
    ]))).rejects.toThrow(/PATCH_CONFLICT: INVALID_COMPONENT_PROPERTY/);
  });

  it("updates CustomCharts through the allowlist (pageProperty/objects 整体替换 + 几何别名)", async () => {
    const base = await makePrototypeFixture();
    const candidate = await applyClientPatch(base, plan([
      updateOperation("prototype-custom-guid", [
        {
          path: "/pageProperty",
          value: {
            name: "CustomCharts1",
            pagePos: { x: 50, y: 60 },
            pageSize: { width: 500, height: 400 },
            windowSize: { width: 1440, height: 900 },
            title: "新窗口标题",
            titleBar: true,
            closeBox: true,
            sizeable: false,
          },
        },
        { path: "/objects", value: ['{"name":"echart","customChartsType":1,"option":{"title":{"text":"新配置"}}}'] },
        { path: "/x", value: 100 },
        { path: "/width", value: 800 },
      ]),
    ]));
    const node = await rawPrototype(candidate, "prototype-custom-guid");
    // pageProperty 整体替换（title/closeBox/sizeable 为新值）。
    expect(node["pageProperty"]).toMatchObject({
      name: "CustomCharts1",
      title: "新窗口标题",
      closeBox: true,
      sizeable: false,
    });
    // 几何别名：/x 与 /width 映射进 pageProperty.pagePos/pageSize。
    expect((node["pageProperty"] as Record<string, unknown>)["pagePos"]).toEqual({ x: 100, y: 60 });
    expect((node["pageProperty"] as Record<string, unknown>)["pageSize"]).toEqual({ width: 800, height: 400 });
    // objects 整体替换。
    expect(node["objects"]).toEqual(['{"name":"echart","customChartsType":1,"option":{"title":{"text":"新配置"}}}']);
    // 未 patch 的字段保留（modlePrototype/region/guid/version）。
    expect((node["modlePrototype"] as Record<string, unknown>)["guid"]).toBe("kmod-1");
    expect(node["region"]).toBe("center");
    expect(node["guid"]).toBe("prototype-custom-guid");
    expect(node["version"]).toBe("2.0.0.1.1");
  });

  it("updates a chart prototype (title/comment/几何) and keeps untouched fields", async () => {
    const base = await makePrototypeFixture();
    const candidate = await applyClientPatch(base, plan([
      updateOperation("prototype-chart-guid", [
        { path: "/title", value: { show: true, text: "新标题", position: 2 } },
        { path: "/comment", value: "新注释" },
        { path: "/x", value: 200 },
        { path: "/width", value: 900 },
      ]),
    ]));
    const node = await rawPrototype(candidate, "prototype-chart-guid");
    expect(node["title"]).toEqual({ show: true, text: "新标题", position: 2 });
    expect(node["comment"]).toBe("新注释");
    expect(node["leftTopPt"]).toEqual({ x: 200, y: 34 });
    expect(node["width"]).toBe(900);
    // 未 patch 的字段保留。
    expect(node["height"]).toBe(271);
    expect(node["chartComponentType"]).toBe(5);
    expect(node["areas"]).toHaveLength(1);
    expect(node["guid"]).toBe("prototype-chart-guid");
  });

  it("rejects update paths outside the prototype allowlist (guid/areasNumStr/unknown)", async () => {
    const base = await makePrototypeFixture();
    // guid 是身份字段，不可 patch。
    await expect(
      applyClientPatch(base, plan([
        updateOperation("prototype-custom-guid", [{ path: "/guid", value: "new-guid" }]),
      ])),
    ).rejects.toThrow(patchConflict);
    // areasNumStr 是只读字段（重建区域风险高）。
    await expect(
      applyClientPatch(base, plan([
        updateOperation("prototype-chart-guid", [{ path: "/areasNumStr", value: "2,0,0,0" }]),
      ])),
    ).rejects.toThrow(patchConflict);
    // 任意未知字段同样被拒。
    await expect(
      applyClientPatch(base, plan([
        updateOperation("prototype-custom-guid", [{ path: "/arbitraryRawField", value: 1 }]),
      ])),
    ).rejects.toThrow(patchConflict);
  });
});
