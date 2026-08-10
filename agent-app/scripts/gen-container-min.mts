// 隔离定位：只含顶层 easyui（LinkButton×2 + Textbox），无布局、无 datagrid/tree/sidemenu。
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { compileClientProject } from "../packages/domain-client/src/compile/client-compiler.js";
import { packageNativeClientProject } from "../packages/domain-client/src/package/native-client-package.js";

const build = { seed: "container-min-20260810" };

const controls = [
  { id: "LinkButton1", type: "easyui", x: 12, y: 10, width: 90, height: 30, proto: 2, uiExtendType: 2, text: "新增", plain: true },
  { id: "LinkButton2", type: "easyui", x: 108, y: 10, width: 90, height: 30, proto: 2, uiExtendType: 2, text: "删除", plain: true },
  { id: "Textbox1", type: "easyui", x: 12, y: 50, width: 240, height: 28, proto: 9, uiExtendType: 9, value: "", prompt: "请输入设备编号", readonly: false },
];

const ir = {
  schema: "kf-client-project-ir/v1",
  id: "container-min",
  name: "容器验收-最小",
  version: "1.0.0.1",
  pages: [
    { id: "page-1", name: "最小easyui页", width: 1440, height: 900, controls: controls as never },
  ],
  variables: [],
};

const ws = await compileClientProject(ir as never, build);
const pkg = await packageNativeClientProject(ws.path);
const outDir = "/tmp/container-min";
await mkdir(outDir, { recursive: true });
await writeFile(path.join(outDir, "built-container-min.gz"), pkg);
console.log(`wrote ${path.join(outDir, "built-container-min.gz")} (${pkg.length} bytes)`);
