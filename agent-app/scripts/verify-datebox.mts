// DateBox 端到端 round-trip：参考工程真实 DateBox 页面 → kfControlToIR → compile → 断言
import { readFile } from "node:fs/promises";
import path from "node:path";
import { kfControlToIR } from "./packages/domain-client/src/inspect/client-inspector.js";
import { compileControl, type CompileContext } from "./packages/domain-client/src/compile/control-compiler.js";

const pageDir = "/tmp/kf_ref/1.0.0.1/project/page";
const build = { seed: "datebox-e2e" };
const ctx: CompileContext = {
  variableGroupGuid: "kvariables",
  pageGroupGuid: "kpagegroup",
  resolvePageGuid: (n) => `k${n}`,
  resolveVariableName: (id) => id,
};
const file = "日期_事件.json";
const page = JSON.parse(await readFile(path.join(pageDir, file), "utf8"));
const { controls, unknownFields } = kfControlToIR(page.objects);
console.log(`页面 ${file}: IR 控件 ${controls.length} 个`);
let seen = 0;
for (const c of controls as any[]) {
  if (c.proto === 11) {
    seen++;
    console.log(`DateBox: id=${c.id} proto=${c.proto} x=${c.x} y=${c.y} w=${c.width} h=${c.height} value=${JSON.stringify(c.value)} panelWidth=${c.panelWidth}`);
    const out = compileControl(build, c, ctx);
    const checks: Array<[string, boolean]> = [
      ["无 objectType", out["objectType"] === undefined],
      ["uiExtendType=11", out["uiExtendType"] === 11],
      ["无 type", out["type"] === undefined],
      ["无 uiModelType", out["uiModelType"] === undefined],
      ["有 leftTopPt", !!out["leftTopPt"]],
      ["panelWidth 透传", out["panelWidth"] === c.panelWidth],
      ["value 透传", out["value"] === c.value],
      ["模板 panelHeight=auto", out["panelHeight"] === "auto"],
    ];
    for (const [k, ok] of checks) {
      if (!ok) throw new Error(`检查失败: ${k}（产物 ${JSON.stringify(out).slice(0, 180)}）`);
    }
    console.log("  编译检查 8 项全部通过 ✓");
  }
}
console.log(`unknownFields: ${unknownFields.length}`);
if (seen !== 2) throw new Error(`应识别 2 个 DateBox，实际 ${seen}`);
console.log("E2E 通过 ✓");
