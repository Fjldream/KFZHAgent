// 隔离定位 2：只有 DockingLayout + 1 个 datagrid（center），验证 datagrid 在布局中的行为。
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { compileClientProject } from "../packages/domain-client/src/compile/client-compiler.js";
import { packageNativeClientProject } from "../packages/domain-client/src/package/native-client-package.js";

const build = { seed: "container-single-dg-20260810" };

const controls = [
  {
    id: "DockingLayout1",
    type: "layout",
    x: 12,
    y: 12,
    width: 1100,
    height: 560,
    layoutType: 5,
    children: [
      {
        type: 1, uiModelType: null, objectType: 3, uiExtendType: 1,
        name: "Datagrid1", leftTopPt: { x: 0, y: 0 }, width: 900, height: 540,
        region: "center",
        striped: true, pagination: true, showHeader: true, singleSelect: true,
        fitColumns: true, rownumbers: true, pageSize: 10, pageList: [10, 20, 30, 40, 50],
      },
    ],
    panels: [{ region: "center", size: 900, split: false }],
  },
];

const ir = {
  schema: "kf-client-project-ir/v1",
  id: "container-single-dg",
  name: "容器验收-单表",
  version: "1.0.0.1",
  pages: [
    { id: "page-1", name: "单datagrid页", width: 1440, height: 900, controls: controls as never },
  ],
  variables: [],
};

const ws = await compileClientProject(ir as never, build);
const pkg = await packageNativeClientProject(ws.path);
const outDir = "/tmp/container-single-dg";
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "built-container-single-dg.gz"), pkg);
console.log(`wrote ${path.join(outDir, "built-container-single-dg.gz")} (${pkg.length} bytes)`);
