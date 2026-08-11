// @ts-nocheck -- 测试风格与 client-inspector.test.ts 一致；运行时行为由 vitest 断言验证。
import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectClientProject, kfControlToIR, kfObjectToControl } from "./client-inspector.js";
import { ControlIR, EasyuiControlIR, LayoutContainerIR } from "../ir/client-project-ir.js";

/**
 * Golden 参考工程（真实 KF 页面）：/tmp/kf_ref/1.0.0.1/project/page/
 * 页面在参考工程 test_最新_2 中，含真实 easyui（objectType=3）与布局容器
 * （objectType=2 + layoutType）对象。若本机无参考工程，测试回退到内联的
 * 同构合成页面（结构、字段名与真实页面一致），保证测试在任何环境可运行。
 */
const REF_PAGE_DIR = "/tmp/kf_ref/1.0.0.1/project/page";
const hasRefPages = existsSync(REF_PAGE_DIR);

const SYNTHETIC_PAGES = {
  "数据列表1.json": {
    pageProperty: { name: "数据列表1" },
    version: "2.0.0.1",
    guid: "k453cad40-4b88-442c-b4f4-9f4b9cbf69a8",
    objectType: 6,
    objects: [
      {
        name: "Datagrid1",
        guid: "k80cdb49e-a70c-4b92-ab92-0cc51a125640",
        objectType: 3,
        uiExtendType: 1,
        leftTopPt: { x: 9, y: 2 },
        width: 431,
        height: 130,
        showHeader: true,
        pagination: false,
        singleSelect: false,
        striped: false,
        pageSize: 10,
        pageList: [10, 20, 30, 40, 50],
        fitColumns: false,
        rownumbers: false,
      },
    ],
  },
  "分页查询.json": {
    pageProperty: { name: "分页查询" },
    version: "2.0.0.1",
    guid: "k2f806528-8d15-442d-a7c8-e34de080db9e",
    objectType: 6,
    objects: [
      {
        layoutType: 5,
        objectType: 2,
        baseProperty: {
          name: "DockingLayout1",
          guid: "kf092adb6-29e6-4bb2-bae6-5262bc5d7cca",
          leftTopPt: { x: 20, y: 98 },
          width: 1243,
          height: 548,
        },
        dPanelsOption: [{ region: "center", width: 1243, height: 548, split: false }],
        insiderObjects: [
          {
            layoutType: 4,
            objectType: 2,
            baseProperty: { name: "VerticalLayout1", leftTopPt: { x: 20, y: 98 }, width: 1243, height: 548 },
            insiderObjects: [
              {
                layoutType: 2,
                objectType: 2,
                baseProperty: { name: "HorizontalLayout1", leftTopPt: { x: 21, y: 109 }, width: 1241, height: 40 },
                insiderObjects: [
                  { uiModelType: 13, guid: "k21f18567-a2ca-48cf-9297-e7d4e2ea33e0", leftTopPt: { x: 21, y: 119 }, width: 100, height: 20 },
                  { name: "QButton", guid: "k6b386362-c28b-4f31-853a-6e461d96bca9", objectType: 3, uiExtendType: 2, leftTopPt: { x: 300, y: 109 }, width: 80, height: 30, text: "查询" },
                ],
              },
              { name: "Datagrid1", guid: "k9825452e-cc6c-4463-8c08-a64484fa936b", objectType: 3, uiExtendType: 1, leftTopPt: { x: 21, y: 159 }, width: 1241, height: 386 },
            ],
          },
        ],
      },
    ],
  },
};

async function readRefPage(file) {
  if (hasRefPages) {
    return JSON.parse(await readFile(join(REF_PAGE_DIR, file), "utf8"));
  }
  return SYNTHETIC_PAGES[file];
}

/** 构造只含所选真实页面的临时 KF 工程，供 inspectClientProject 集成测试。 */
async function makeRefFixture(pageFiles) {
  const root = await mkdtemp(join(tmpdir(), "kf-inspect-container-"));
  const versionDir = join(root, "1.0.0.1");
  await mkdir(join(versionDir, "project", "page"), { recursive: true });
  await writeFile(join(versionDir, "project.json"), JSON.stringify({ name: "容器参考", version: "1.0.0.1" }));
  await writeFile(join(versionDir, "project", "pageManager.json"), JSON.stringify({ Pages: [] }));
  for (const file of pageFiles) {
    const page = await readRefPage(file);
    await writeFile(join(versionDir, "project", "page", file), JSON.stringify(page));
  }
  return root;
}

describe("KF 容器对象识别（easyui / 布局）", () => {
  it("识别单个 easyui 对象：objectType=3 + uiExtendType → EasyuiControlIR", () => {
    const kf = {
      name: "Datagrid1",
      guid: "k80cdb49e-a70c-4b92-ab92-0cc51a125640",
      objectType: 3,
      uiExtendType: 1,
      leftTopPt: { x: 9, y: 2 },
      width: 431,
      height: 130,
      showHeader: true,
      pagination: false,
      striped: false,
      queryParams: { a: 1 }, // 不在 EASYUI_PROTO_FIELDS，但必须不丢、不报 unknownFields
      data: [{ id: 1 }],
    };
    const { control, unknownFields } = kfObjectToControl(kf);
    expect(control).not.toBeNull();
    expect(control.type).toBe("easyui");
    expect(control.proto).toBe(1);
    expect(control.id).toBe("Datagrid1");
    expect(control).toMatchObject({ x: 9, y: 2, width: 431, height: 130 });
    expect(control.showHeader).toBe(true);
    expect(control.pagination).toBe(false);
    expect(EasyuiControlIR.safeParse(control).success).toBe(true);
    expect(unknownFields).toEqual([]);
  });

  it("将 reviewed Datagrid data/columns 只读映射为严格 tableData", () => {
    const { control } = kfObjectToControl({
      name: "Datagrid1", guid: "grid-1", objectType: 3, uiExtendType: 1,
      leftTopPt: { x: 0, y: 0 }, width: 600, height: 300, pageSize: 20,
      data: [{ name: "泵 A", pressure: 0.8 }],
      columns: [[
        { field: "name", title: "设备", width: "50%", align: "left" },
        { field: "pressure", title: "压力", width: "50%", align: "right" },
      ]],
    });
    expect(control?.tableData).toEqual({
      columns: [
        { key: "name", label: "设备", align: "left" },
        { key: "pressure", label: "压力", align: "right" },
      ],
      rows: [{ name: "泵 A", pressure: 0.8 }],
      pageSize: 20,
    });
  });

  it("对未知/危险 Datagrid native data 安全降级且不执行 getter", () => {
    let reads = 0;
    const accessor = {
      name: "DatagridAccessor", guid: "grid-accessor", objectType: 3, uiExtendType: 1,
      leftTopPt: { x: 0, y: 0 }, width: 600, height: 300,
      columns: [[{ field: "name", title: "设备", width: "100%", align: "left" }]],
    } as Record<string, unknown>;
    Object.defineProperty(accessor, "data", { enumerable: true, get() { reads += 1; return [{ name: "泵 A" }]; } });
    expect(kfObjectToControl(accessor).control?.tableData).toBeUndefined();
    expect(reads).toBe(0);

    const unknownColumn = {
      name: "DatagridUnknown", guid: "grid-unknown", objectType: 3, uiExtendType: 1,
      leftTopPt: { x: 0, y: 0 }, width: 600, height: 300,
      data: [{ name: "泵 A" }],
      columns: [[{ field: "name", title: "设备", width: "100%", align: "left", formatter: "unsafe" }]],
    };
    expect(kfObjectToControl(unknownColumn).control?.tableData).toBeUndefined();
    expect((kfObjectToControl(unknownColumn).control as Record<string, unknown>)?.["columns"]).toBeUndefined();
  });

  it("识别单个布局容器：objectType=2 + layoutType，几何来自 baseProperty", () => {
    const kf = {
      layoutType: 5,
      objectType: 2,
      baseProperty: {
        name: "DockingLayout1",
        guid: "kf092adb6-29e6-4bb2-bae6-5262bc5d7cca",
        leftTopPt: { x: 20, y: 98 },
        width: 1243,
        height: 548,
      },
      dPanelsOption: [{ region: "center", width: 1243, height: 548, split: false }],
      insiderObjects: [{ layoutType: 4, objectType: 2, baseProperty: { name: "VerticalLayout1" } }],
    };
    const { control, unknownFields } = kfObjectToControl(kf);
    expect(control).not.toBeNull();
    expect(control.type).toBe("layout");
    expect(control.layoutType).toBe(5);
    expect(control.id).toBe("DockingLayout1");
    expect(control).toMatchObject({ x: 20, y: 98, width: 1243, height: 548 });
    expect(control.children).toHaveLength(1);
    expect(control.panels).toHaveLength(1);
    expect(control.panels[0].region).toBe("center");
    expect(LayoutContainerIR.safeParse(control).success).toBe(true);
    expect(unknownFields).toEqual([]);
  });

  it("uiModelType 判型优先：静态控件不被误判为 easyui/布局", () => {
    // 真实工程 GIS 页面存在 uiModelType=6 + objectType=3 的 Label 对象。
    const kf = { uiModelType: 6, objectType: 3, name: "Label1", text: "hello" };
    const { control } = kfObjectToControl(kf);
    expect(control).toBeNull(); // 静态控件由 index 层 uiModelType 分支识别
  });

  it("识别 DateBox：无 objectType（仅 uiExtendType=11）仍判为 easyui", () => {
    // 参考工程 8 个 DateBox 均由 KMUIExtendBase 序列化，**没有 objectType 键**，
    // 只有 uiExtendType=11；KF 前端 gUIObjectFactory.create(11) 原生渲染。
    const kf = {
      value: "2023-11-07",
      disabled: false,
      width: 278,
      height: 30,
      panelWidth: 250,
      panelHeight: "auto",
      sharedCalendar: "",
      currentText: "Today",
      closeText: "Close",
      okText: "Ok",
      uiExtendType: 11,
      name: "DateBox1",
      leftTopPt: { x: 74.5, y: 186.5 },
      linkMng: { linkList: [] },
    };
    const { control, unknownFields } = kfObjectToControl(kf);
    expect(control).not.toBeNull();
    expect(control.type).toBe("easyui");
    expect(control.proto).toBe(11);
    expect(control.id).toBe("DateBox1");
    expect(control).toMatchObject({ x: 74.5, y: 186.5, width: 278, height: 30 });
    expect(control.value).toBe("2023-11-07");
    expect(control.panelWidth).toBe(250);
    expect(control.panelHeight).toBe("auto");
    expect(control.sharedCalendar).toBe("");
    expect(EasyuiControlIR.safeParse(control).success).toBe(true);
    expect(unknownFields).toEqual([]);
  });
});

describe("真实页面 golden round-trip（KF JSON → IR）", () => {
  it("datagrid 页面：18 个 easyui 控件（含 4 个静态 Button）转为 EasyuiControlIR，未知字段不再累积", async () => {
    const page = await readRefPage("数据列表1.json");
    const { controls, unknownFields } = kfControlToIR(page.objects);
    // 真实页面共 22 个对象：18 个 easyui datagrid + 4 个静态 Button（uiModelType 35，由 index 层识别）
    expect(page.objects).toHaveLength(22);
    expect(controls.length).toBe(18);
    for (const control of controls) {
      expect(control.type).toBe("easyui");
      expect(control.proto).toBe(1);
      expect(EasyuiControlIR.safeParse(control).success).toBe(true);
    }
    // 与真实 KF 对象逐字段对账（golden 关键字段）
    const first = controls[0];
    expect(first).toMatchObject({
      id: "Datagrid1",
      x: 9,
      y: 2,
      width: 431,
      height: 130,
      showHeader: true,
      pagination: false,
      singleSelect: false,
      striped: false,
      pageSize: 10,
      pageList: [10, 20, 30, 40, 50],
      fitColumns: false,
      rownumbers: false,
    });
    expect(unknownFields).toEqual([]);
  });

  it("布局页面：顶层布局 + 递归识别嵌套 easyui/子布局，unknownFields 不再累积", async () => {
    const page = await readRefPage("分页查询.json");
    const { controls, unknownFields } = kfControlToIR(page.objects);
    const types = controls.map((c) => `${c.type}:${c.layoutType ?? c.proto}`);
    expect(types[0]).toBe("layout:5");
    expect(types).toContain("layout:4");
    expect(types).toContain("layout:2");
    expect(types).toContain("easyui:1");
    expect(types).toContain("easyui:2");
    expect(types).toContain("easyui:22");

    const top = controls[0];
    expect(top).toMatchObject({ type: "layout", layoutType: 5, id: "DockingLayout1", x: 20, y: 98, width: 1243, height: 548 });
    // children = insiderObjects 原样保留，panels = dPanelsOption
    expect(top.children).toHaveLength(1);
    expect(top.panels).toHaveLength(1);
    expect(top.panels[0].region).toBe("center");

    // 嵌套 easyui 子对象被递归识别并带出真实几何/字段
    const dg = controls.find((c) => c.type === "easyui" && c.proto === 1);
    expect(dg).toMatchObject({ id: "Datagrid1", x: 21, y: 159, width: 1241, height: 386 });
    const qb = controls.find((c) => c.type === "easyui" && c.id === "QButton");
    expect(qb).toMatchObject({ proto: 2, text: "查询" });
    const pg = controls.find((c) => c.type === "easyui" && c.id === "pagination1");
    expect(pg).toMatchObject({ proto: 22, total: 100000, pageSize: 50 });

    for (const control of controls) {
      expect(ControlIR.safeParse(control).success).toBe(true);
    }
    expect(unknownFields).toEqual([]);
  });
});

describe("inspectClientProject 容器索引", () => {
  it("easyui/布局控件进入索引，unknownFields 不再累积", async () => {
    const root = await makeRefFixture(["数据列表1.json", "分页查询.json"]);
    const result = await inspectClientProject(root);

    const datagrid = result.index.controls["k80cdb49e-a70c-4b92-ab92-0cc51a125640"];
    expect(datagrid).toBeDefined();
    expect(datagrid.type).toBe("easyui");
    expect(datagrid.id).toBe("Datagrid1");
    expect(datagrid.unknownFields).toEqual([]);

    const docking = result.index.controls["kf092adb6-29e6-4bb2-bae6-5262bc5d7cca"];
    expect(docking).toBeDefined();
    expect(docking.type).toBe("layout");
    expect(docking.id).toBe("DockingLayout1");
    expect(docking.unknownFields).toEqual([]);

    const innerDg = result.index.controls["k9825452e-cc6c-4463-8c08-a64484fa936b"];
    expect(innerDg).toBeDefined();
    expect(innerDg.type).toBe("easyui");

    // 汇总视图同样包含容器控件，且无 unknownFields 累积
    const summaryControls = result.summary.pages.flatMap((p) => p.controls);
    const summaryDg = summaryControls.find((c) => c.id === "Datagrid1");
    expect(summaryDg.type).toBe("easyui");
    expect(summaryDg.unknownFields).toEqual([]);
    const summaryLayout = summaryControls.find((c) => c.id === "DockingLayout1");
    expect(summaryLayout.type).toBe("layout");
    expect(summaryLayout.unknownFields).toEqual([]);

    // 静态 spacer 索引优先级不变
    const spacer = result.index.controls["k21f18567-a2ca-48cf-9297-e7d4e2ea33e0"];
    expect(spacer).toBeDefined();
    expect(spacer.type).toBe("spacer");
  });
});
