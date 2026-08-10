// 生成容器对象 L5 验收工程：easyui（datagrid/linkbutton/textbox/tree/sidemenu）+ 布局（docking/horizontal/tab）嵌套。
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileClientProject } from "../packages/domain-client/src/compile/client-compiler.js";
import { packageNativeClientProject } from "../packages/domain-client/src/package/native-client-package.js";

const build = { seed: "container-acceptance-20260810" };

// Docking 布局：四边 region 放 sidemenu/树，center 放 datagrid（KF 规范：region 在子对象顶层，easyui 子控件无 baseProperty、几何在顶层）
const dockingChildren = [
  {
    type: 1,
    uiModelType: null,
    objectType: 3,
    uiExtendType: 26,
    name: "SideMenu1",
    leftTopPt: { x: 0, y: 0 },
    width: 180,
    height: 540,
    region: "west",
    border: true,
    animate: true,
  },
  {
    type: 1,
    uiModelType: null,
    objectType: 3,
    uiExtendType: 17,
    name: "Tree1",
    leftTopPt: { x: 0, y: 0 },
    width: 220,
    height: 60,
    region: "north",
    checkbox: true,
    cascadeCheck: true,
  },
  {
    type: 1,
    uiModelType: null,
    objectType: 3,
    uiExtendType: 1,
    name: "Datagrid1",
    leftTopPt: { x: 0, y: 0 },
    width: 900,
    height: 540,
    region: "center",
    striped: true,
    pagination: true,
    showHeader: true,
    singleSelect: true,
    fitColumns: true,
    rownumbers: true,
    pageSize: 10,
    pageList: [10, 20, 30, 40, 50],
  },
];

const controls = [
  // 顶层 easyui：按钮组 + 文本框
  { id: "LinkButton1", type: "easyui", x: 12, y: 10, width: 90, height: 30, proto: 2, uiExtendType: 2, text: "新增", plain: true },
  { id: "LinkButton2", type: "easyui", x: 108, y: 10, width: 90, height: 30, proto: 2, uiExtendType: 2, text: "删除", plain: true },
  { id: "Textbox1", type: "easyui", x: 12, y: 50, width: 240, height: 28, proto: 9, uiExtendType: 9, value: "", prompt: "请输入设备编号", readonly: false },
  // Docking 布局（5）
  {
    id: "DockingLayout1",
    type: "layout",
    x: 12,
    y: 90,
    width: 1100,
    height: 560,
    layoutType: 5,
    children: dockingChildren,
    panels: [
      { region: "north", size: 60, split: true },
      { region: "west", size: 180, split: true },
      { region: "center", size: 900 },
    ],
  },
  // 水平布局（2）内嵌 datagrid
  {
    id: "HorizontalLayout1",
    type: "layout",
    x: 12,
    y: 670,
    width: 1100,
    height: 200,
    layoutType: 2,
    children: [
      {
        type: 1, uiModelType: null, objectType: 3, uiExtendType: 1,
        name: "Datagrid2", leftTopPt: { x: 0, y: 0 }, width: 540, height: 190,
        internalVertex: { left: 0, top: 0 },
        striped: false, pagination: false, showHeader: true, rownumbers: false,
      },
      {
        type: 1, uiModelType: null, objectType: 3, uiExtendType: 1,
        name: "Datagrid3", leftTopPt: { x: 0, y: 0 }, width: 540, height: 190,
        internalVertex: { left: 540, top: 0 },
        striped: true, pagination: true, showHeader: true, rownumbers: true, pageSize: 5,
      },
    ],
  },
];

const ir = {
  schema: "kf-client-project-ir/v1",
  id: "container-acceptance",
  name: "容器对象验收",
  version: "1.0.0.1",
  pages: [
    {
      id: "page-1",
      name: "容器验收页",
      width: 1440,
      height: 900,
      controls: controls as never,
    },
  ],
  variables: [],
};

const ws = await compileClientProject(ir as never, build);
console.log("workspace:", ws.path);
const pkg = await packageNativeClientProject(ws.path);
const outDir = "/tmp/container-acceptance";
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "built-container-artifact.gz"), pkg);
console.log(`wrote ${path.join(outDir, "built-container-artifact.gz")} (${pkg.length} bytes)`);
