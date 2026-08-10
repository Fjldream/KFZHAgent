// KF 容器对象（easyui / 布局）的 patcher 修改链路测试：
// - create：easyui 用 proto 模板 + 白名单透传；layout 用 baseProperty 几何 + insiderObjects/dPanelsOption
// - update：easyui 字段按 allowlist 过滤；layout 的 children/panels 作为整体替换（嵌套 JSON patch 复杂，整体 set 最稳）
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

async function resolveVersionDir(root: string): Promise<string> {
  const entries = await readdir(root, { withFileTypes: true });
  const version = entries.find((e) => e.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(e.name));
  return version ? join(root, version.name) : root;
}

async function rootDirOf(root: Root): Promise<string> {
  return typeof root === "string" ? root : root.rootDir;
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

/**
 * 从 client-unknown-field 复制工程，并把 Page1.json 的 objects 替换为一个
 * easyui datagrid（objectType=3 + uiExtendType=1）与一个 Docking 布局容器
 * （objectType=2 + layoutType=5），供 update 测试使用。
 */
async function makeContainerFixture(): Promise<string> {
  const dest = await copyFixture("client-unknown-field");
  const versionDir = await resolveVersionDir(dest);
  const pagePath = join(versionDir, "project", "page", "Page1.json");
  const page = JSON.parse(await readFile(pagePath, "utf8")) as Record<string, unknown>;
  page["objects"] = [
    {
      name: "Datagrid1",
      guid: "easyui-guid-1",
      objectType: 3,
      uiExtendType: 1,
      leftTopPt: { x: 21, y: 159 },
      width: 1241,
      height: 386,
      showHeader: false,
      striped: false,
      pagination: false,
      singleSelect: false,
      pageSize: 10,
      pageList: [10, 20, 30, 40, 50],
    },
    {
      name: "DockingLayout1",
      guid: "layout-guid-1",
      objectType: 2,
      layoutType: 5,
      baseProperty: {
        name: "DockingLayout1",
        guid: "layout-guid-1",
        leftTopPt: { x: 20, y: 98 },
        width: 1243,
        height: 548,
      },
      dPanelsOption: [{ region: "center", width: 1243, height: 548, split: false }],
      insiderObjects: [],
    },
  ];
  await writeFile(pagePath, JSON.stringify(page, null, 2), "utf8");
  return dest;
}

/** 按 KF GUID 直接读取页面 JSON 中的原始节点（返回引用，可直接断言）。 */
async function rawContainer(root: Root, guid: string): Promise<Record<string, unknown>> {
  const dir = await rootDirOf(root);
  const projectRoot = await resolveVersionDir(dir);
  const page = JSON.parse(
    await readFile(join(projectRoot, "project", "page", "Page1.json"), "utf8"),
  ) as Record<string, unknown>;
  const objects = page["objects"] as Array<Record<string, unknown>>;
  const found = objects.find((o) => o["guid"] === guid || (o["baseProperty"] as Record<string, unknown> | undefined)?.["guid"] === guid);
  if (!found) throw new Error(`no container ${guid} in page`);
  return found;
}

describe("client patcher — KF 容器对象（easyui / 布局）", () => {
  it("creates an easyui control from its proto template with allowlisted pass-through", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, plan([
      {
        op: "create",
        entityType: "control",
        entityId: "NewDatagrid",
        properties: {
          pageId: "page-guid-1",
          type: "easyui",
          proto: 1,
          x: 30,
          y: 40,
          width: 400,
          height: 300,
          striped: true,
          pagination: true,
          pageSize: 20,
        },
      },
    ]));
    const expectedGuid = deriveGuid({ seed: "w-test" }, "NewDatagrid");
    const node = await rawContainer(candidate, expectedGuid);
    // 合法 KF 容器对象：objectType=3 + uiExtendType，几何在顶层，模板字段 + 白名单透传字段。
    expect(node).toMatchObject({
      name: "NewDatagrid",
      guid: expectedGuid,
      objectType: 3,
      uiExtendType: 1,
      leftTopPt: { x: 30, y: 40 },
      width: 400,
      height: 300,
      striped: true,
      pagination: true,
      pageSize: 20,
    });
    // datagrid 模板自带默认字段必须存在（fitColumns/rownumbers/...），构成合法对象。
    expect(node["fitColumns"]).toBe(false);
    expect(node["rownumbers"]).toBe(false);
    // inspect 能识别为 easyui 控件。
    const result = await inspectClientProject(await rootDirOf(candidate));
    expect(result.index.controls[expectedGuid]?.type).toBe("easyui");
  });

  it("creates a layout container with baseProperty geometry and insiderObjects/dPanelsOption", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, plan([
      {
        op: "create",
        entityType: "control",
        entityId: "NewDocking",
        properties: {
          pageId: "page-guid-1",
          type: "layout",
          layoutType: 5,
          x: 10,
          y: 12,
          width: 600,
          height: 400,
          children: [{ layoutType: 4, objectType: 2, baseProperty: { name: "VerticalLayout1" } }],
          panels: [{ region: "center", width: 600, height: 400, split: false }],
        },
      },
    ]));
    const expectedGuid = deriveGuid({ seed: "w-test" }, "NewDocking");
    const node = await rawContainer(candidate, expectedGuid);
    // 合法 KF 布局容器：objectType=2 + layoutType 顶层，几何在 baseProperty，子对象/面板走 insiderObjects/dPanelsOption。
    expect(node["objectType"]).toBe(2);
    expect(node["layoutType"]).toBe(5);
    expect(node["baseProperty"]).toEqual({
      name: "NewDocking",
      guid: expectedGuid,
      leftTopPt: { x: 10, y: 12 },
      width: 600,
      height: 400,
    });
    // 布局子对象自动补 guid（KF 要求 insiderObjects 子对象有 guid，否则 inspect
    // 无法索引、LLM 无法引用修改）——嵌套布局补 baseProperty.guid。
    const expectedChildGuid = deriveGuid({ seed: "w-test" }, "child:NewDocking:VerticalLayout1");
    expect(node["insiderObjects"]).toEqual([
      { layoutType: 4, objectType: 2, baseProperty: { name: "VerticalLayout1", guid: expectedChildGuid } },
    ]);
    expect(node["dPanelsOption"]).toEqual([{ region: "center", width: 600, height: 400, split: false }]);
    const result = await inspectClientProject(await rootDirOf(candidate));
    expect(result.index.controls[expectedGuid]?.type).toBe("layout");
  });

  it("rejects unreviewed nested layout child fields in a direct ChangePlan", async () => {
    const base = await copyFixture("client-unknown-field");

    await expect(applyClientPatch(base, plan([
      {
        op: "create",
        entityType: "control",
        entityId: "UnsafeLayout",
        properties: {
          pageId: "page-guid-1",
          type: "layout",
          layoutType: 5,
          children: [{
            layoutType: 4,
            objectType: 2,
            baseProperty: { name: "Nested", script: "evil()" },
          }],
        },
      },
    ]))).rejects.toThrow(/PATCH_CONFLICT: INVALID_COMPONENT_PROPERTY/);
  });

  it("preserves reviewed negative docking coordinates through strict create validation", async () => {
    const base = await copyFixture("client-unknown-field");
    const candidate = await applyClientPatch(base, plan([{
      op: "create",
      entityType: "control",
      entityId: "EdgeDocking",
      properties: {
        pageId: "page-guid-1",
        type: "layout",
        layoutType: 5,
        x: -1,
        y: -1,
        width: 600,
        height: 400,
      },
    }]));

    const node = await rawContainer(candidate, deriveGuid({ seed: "w-test" }, "EdgeDocking"));
    expect((node["baseProperty"] as Record<string, unknown>)["leftTopPt"]).toEqual({ x: -1, y: -1 });
  });

  it("updates easyui fields through the allowlist and rejects non-allowlisted ones", async () => {
    const base = await makeContainerFixture();
    const candidate = await applyClientPatch(base, plan([
      updateOperation("easyui-guid-1", [
        { path: "/striped", value: true },
        { path: "/pagination", value: true },
        { path: "/x", value: 100 },
        { path: "/width", value: 500 },
        { path: "/pageList", value: [10, 20] },
      ]),
    ]));
    const node = await rawContainer(candidate, "easyui-guid-1");
    expect(node["striped"]).toBe(true);
    expect(node["pagination"]).toBe(true);
    expect(node["leftTopPt"]).toEqual({ x: 100, y: 159 });
    expect(node["width"]).toBe(500);
    expect(node["height"]).toBe(386); // 未 patch 的字段保留
    expect(node["pageList"]).toEqual([10, 20]);

    // 非白名单字段被拒绝：任意未知字段。
    await expect(
      applyClientPatch(base, plan([
        updateOperation("easyui-guid-1", [{ path: "/arbitraryRawField", value: "x" }]),
      ])),
    ).rejects.toThrow(patchConflict);
    // 类型标识字段（uiExtendType/proto）也不可 patch。
    await expect(
      applyClientPatch(base, plan([
        updateOperation("easyui-guid-1", [{ path: "/uiExtendType", value: 9 }]),
      ])),
    ).rejects.toThrow(patchConflict);
  });

  it("updates layout children/panels wholesale and maps geometry into baseProperty", async () => {
    const base = await makeContainerFixture();
    const candidate = await applyClientPatch(base, plan([
      updateOperation("layout-guid-1", [
        { path: "/children", value: [
          { layoutType: 2, objectType: 2, baseProperty: { name: "HorizontalLayout1", leftTopPt: { x: 21, y: 109 }, width: 1241, height: 40 } },
        ] },
        { path: "/panels", value: [{ region: "north", width: 1243, height: 80, split: true }] },
        { path: "/layoutType", value: 4 },
        { path: "/x", value: 50 },
        { path: "/y", value: 60 },
      ]),
    ]));
    const node = await rawContainer(candidate, "layout-guid-1");
    // children/panels 作为整体替换到 KF 的 insiderObjects/dPanelsOption。
    expect(node["insiderObjects"]).toEqual([
      { layoutType: 2, objectType: 2, baseProperty: { name: "HorizontalLayout1", leftTopPt: { x: 21, y: 109 }, width: 1241, height: 40 } },
    ]);
    expect(node["dPanelsOption"]).toEqual([{ region: "north", width: 1243, height: 80, split: true }]);
    // layoutType 在顶层；几何映射进 baseProperty，其余保留。
    expect(node["layoutType"]).toBe(4);
    expect(node["baseProperty"]).toEqual({
      name: "DockingLayout1",
      guid: "layout-guid-1",
      leftTopPt: { x: 50, y: 60 },
      width: 1243,
      height: 548,
    });

    // layout 非白名单字段被拒绝：KF 原始字段名（dPanelsOption 走 /panels）与任意未知字段。
    await expect(
      applyClientPatch(base, plan([
        updateOperation("layout-guid-1", [{ path: "/dPanelsOption", value: [] }]),
      ])),
    ).rejects.toThrow(patchConflict);
    await expect(
      applyClientPatch(base, plan([
        updateOperation("layout-guid-1", [{ path: "/arbitraryRawField", value: "x" }]),
      ])),
    ).rejects.toThrow(patchConflict);
  });

  it("creates a control with properties.parentId into the target layout's insiderObjects (LLM nested-container expression)", async () => {
    const base = await copyFixture("client-unknown-field");
    // 先建垂直布局，再用 parentId 把两个按钮放进布局（LLM 的自然表达方式）
    const candidate = await applyClientPatch(base, plan([
      {
        op: "create",
        entityType: "control",
        entityId: "NewVerticalLayout",
        properties: {
          pageId: "page-guid-1",
          type: "layout",
          layoutType: 4,
          x: 100, y: 200, width: 620, height: 200,
        },
      },
      {
        op: "create",
        entityType: "control",
        entityId: "ConfirmBtn",
        properties: {
          pageId: "page-guid-1",
          type: "easyui",
          proto: 2,
          text: "确认",
          parentId: "NewVerticalLayout",
        },
      },
      {
        op: "create",
        entityType: "control",
        entityId: "CancelBtn",
        properties: {
          pageId: "page-guid-1",
          type: "easyui",
          proto: 2,
          text: "取消",
          parentId: "NewVerticalLayout",
        },
      },
    ]));
    const layoutGuid = deriveGuid({ seed: "w-test" }, "NewVerticalLayout");
    const layout = await rawContainer(candidate, layoutGuid);
    // 按钮在布局 insiderObjects 内（不在页面顶层），且自动补内部定位字段
    const inner = layout["insiderObjects"] as Array<Record<string, unknown>>;
    expect(inner.map((c) => c["name"])).toEqual(["ConfirmBtn", "CancelBtn"]);
    for (const child of inner) {
      expect(child["objectType"]).toBe(3);
      expect(child["uiExtendType"]).toBe(2);
      // 垂直布局（lt=4）子控件缺省 internalVertex:{0,0}，KF 加载不位置错乱
      expect(child["internalVertex"]).toEqual({ left: 0, top: 0 });
      expect(child["type"]).toBeUndefined();
      expect(child["uiModelType"]).toBeUndefined();
    }
    // 页面顶层不应有这两个按钮
    const dir = await rootDirOf(candidate);
    const projectRoot = await resolveVersionDir(dir);
    const page = JSON.parse(
      await readFile(join(projectRoot, "project", "page", "Page1.json"), "utf8"),
    ) as Record<string, unknown>;
    const topLevel = page["objects"] as Array<Record<string, unknown>>;
    expect(topLevel.some((o) => o["name"] === "ConfirmBtn" || o["name"] === "CancelBtn")).toBe(false);
  });
});
