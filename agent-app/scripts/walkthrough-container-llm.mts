// 容器 LLM 端到端走查：真实 DeepSeek 对话生成容器 plan → applyClientPatch → 产物校验。
//
// 用法：
//   DEEPSEEK_API_KEY=sk-xxx npx vite-node scripts/walkthrough-container-llm.mts
//   -- 无 key 时仅打印提示退出；场景通过第一个参数选择：create | modify | both（默认 both）
//
// 验证目标：
//   1. LLM（DeepSeek）在对话中能输出正确的容器 plan（create easyui/layout + 修改容器字段）
//   2. plan 经 applyClientPatch 应用到容器验收工程后，KF 产物满足容器序列化硬约束
//      （children 无 type/uiModelType、easyui 子控件无 baseProperty、Docking 有 panels 等）
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compileClientProject } from "../packages/domain-client/src/compile/client-compiler.js";
import { packageNativeClientProject } from "../packages/domain-client/src/package/native-client-package.js";
import { inspectClientProject } from "../packages/domain-client/src/inspect/client-inspector.js";
import { applyClientPatch } from "../packages/domain-client/src/patch/client-patcher.js";
import { DeepSeekModelPort } from "../apps/api/src/conversations/deepseek-model.js";
import type { EditableEntity } from "../packages/agent-orchestrator/src/ports.js";
import type { ModelPortContext } from "../packages/agent-orchestrator/src/model-port.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// 1. 生成容器验收工程（与 scripts/gen-container-acceptance.mts 相同）
// ---------------------------------------------------------------------------
const build = { seed: "container-acceptance-20260810" };

const dockingChildren = [
  { type: 1, uiModelType: null, objectType: 3, uiExtendType: 26, name: "SideMenu1", leftTopPt: { x: 0, y: 0 }, width: 180, height: 540, region: "west", border: true, animate: true },
  { type: 1, uiModelType: null, objectType: 3, uiExtendType: 17, name: "Tree1", leftTopPt: { x: 0, y: 0 }, width: 220, height: 60, region: "north", checkbox: true, cascadeCheck: true },
  { type: 1, uiModelType: null, objectType: 3, uiExtendType: 1, name: "Datagrid1", leftTopPt: { x: 0, y: 0 }, width: 900, height: 540, region: "center", striped: true, pagination: true, showHeader: true, singleSelect: true, fitColumns: true, rownumbers: true, pageSize: 10, pageList: [10, 20, 30, 40, 50] },
];

const controls = [
  { id: "LinkButton1", type: "easyui", x: 12, y: 10, width: 90, height: 30, proto: 2, uiExtendType: 2, text: "新增", plain: true },
  { id: "LinkButton2", type: "easyui", x: 108, y: 10, width: 90, height: 30, proto: 2, uiExtendType: 2, text: "删除", plain: true },
  { id: "Textbox1", type: "easyui", x: 12, y: 50, width: 240, height: 28, proto: 9, uiExtendType: 9, value: "", prompt: "请输入设备编号", readonly: false },
  {
    id: "DockingLayout1", type: "layout", x: 12, y: 90, width: 1100, height: 560, layoutType: 5,
    children: dockingChildren,
    panels: [
      { region: "north", size: 60, split: true },
      { region: "west", size: 180, split: true },
      { region: "center", size: 900 },
    ],
  },
  {
    id: "HorizontalLayout1", type: "layout", x: 12, y: 670, width: 1100, height: 200, layoutType: 2,
    children: [
      { type: 1, uiModelType: null, objectType: 3, uiExtendType: 1, name: "Datagrid2", leftTopPt: { x: 0, y: 0 }, width: 540, height: 190, internalVertex: { left: 0, top: 0 }, striped: false, pagination: false, showHeader: true, rownumbers: false },
      { type: 1, uiModelType: null, objectType: 3, uiExtendType: 1, name: "Datagrid3", leftTopPt: { x: 0, y: 0 }, width: 540, height: 190, internalVertex: { left: 540, top: 0 }, striped: true, pagination: true, showHeader: true, rownumbers: true, pageSize: 5 },
    ],
  },
];

const ir = {
  schema: "kf-client-project-ir/v1",
  id: "container-acceptance",
  name: "容器对象验收",
  version: "1.0.0.1",
  pages: [{ id: "page-1", name: "容器验收页", width: 1440, height: 900, controls: controls as never }],
  variables: [],
};

const ws = await compileClientProject(ir as never, build);
console.log("① 容器验收工程已生成:", ws.path);

// ---------------------------------------------------------------------------
// 2. 构造 editableEntities（真实 KF GUID）供 LLM 引用
// ---------------------------------------------------------------------------
const inspection = await inspectClientProject(ws.path);
const entities: EditableEntity[] = [];
for (const page of Object.values(inspection.index.pages)) {
  entities.push({ kind: "page", name: page.name, type: "page", guid: page.guid });
}
for (const [guid, c] of Object.entries(inspection.index.controls)) {
  // 语义 id（KF 控件 name）是 LLM 引用的稳定标识；guid 是 plan 必须引用的真实 KF GUID
  entities.push({ kind: "control", name: c.id, type: c.type, guid: c.guid });
  void guid;
}
console.log(`② editableEntities: ${entities.length} 个（页面 + 控件）`);
console.log(
  "   容器实体:", entities.filter((e) => e.type === "easyui" || e.type === "layout").map((e) => `${e.name}(${e.type})`).join(", "),
);

// ---------------------------------------------------------------------------
// 3. 真实 DeepSeek 走查
// ---------------------------------------------------------------------------
const dryRun = process.env.DRY_RUN === "1";
const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey && !dryRun) {
  console.error("\n❌ 缺少 DEEPSEEK_API_KEY 环境变量。");
  console.error("   export DEEPSEEK_API_KEY=sk-... 后重跑本脚本。");
  console.error("   （或 DRY_RUN=1 用预置容器 plan 验证 patch/产物链路）");
  process.exit(1);
}

const scene = process.argv[2] ?? "both";

// DRY_RUN：不调 LLM，用预置的合法容器 plan 验证 applyClientPatch + 产物校验链路。
// （真实 LLM 走查前先确认这条链路本身正确，避免把链路 bug 误判成 LLM 输出问题。）
const dryPlans: Record<string, unknown> = {
  create: {
    schema: "kf-change-plan/v1",
    workspaceId: "ws-container-llm",
    operations: [
      {
        op: "create",
        entityId: "NewDatagrid1",
        entityType: "control",
        properties: {
          pageId: Object.values(inspection.index.pages)[0].guid,
          type: "easyui",
          proto: 1,
          x: 1150, y: 90, width: 620, height: 300,
          rownumbers: true, pagination: true, pageSize: 15,
        },
      },
      {
        op: "create",
        entityId: "NewVerticalLayout1",
        entityType: "control",
        properties: {
          pageId: Object.values(inspection.index.pages)[0].guid,
          type: "layout",
          layoutType: 4,
          x: 1150, y: 420, width: 620, height: 200,
          children: [
            { objectType: 3, uiExtendType: 2, name: "ConfirmBtn", leftTopPt: { x: 0, y: 0 }, width: 90, height: 30, internalVertex: { left: 0, top: 0 }, text: "确认" },
            { objectType: 3, uiExtendType: 2, name: "CancelBtn", leftTopPt: { x: 0, y: 0 }, width: 90, height: 30, internalVertex: { left: 100, top: 0 }, text: "取消" },
          ],
        },
      },
    ],
  },
  modify: {
    schema: "kf-change-plan/v1",
    workspaceId: "ws-container-llm",
    operations: [
      {
        op: "update",
        entityId: (entities.find((e) => e.name === "Datagrid1") as EditableEntity).guid,
        entityType: "control",
        changes: [{ path: "/rownumbers", value: true }],
      },
      {
        op: "update",
        entityId: (entities.find((e) => e.name === "Datagrid2") as EditableEntity).guid,
        entityType: "control",
        changes: [{ path: "/pagination", value: true }],
      },
      {
        op: "update",
        entityId: (entities.find((e) => e.name === "Datagrid3") as EditableEntity).guid,
        entityType: "control",
        changes: [{ path: "/striped", value: false }],
      },
    ],
  },
};

const requirementText: Record<string, string> = {
  create:
    "在「容器验收页」页面新增：1) 一个数据表格（easyui datagrid，宽 620 高 300，放在页面右侧 x=1150 y=90，行号开启、分页开启、每页 15 条）；" +
    "2) 一个垂直布局（layoutType=4，宽 620 高 200，放在 x=1150 y=420），里面放两个按钮（easyui linkbutton，文字分别为「确认」「取消」）。",
  modify:
    "把「容器验收页」里 Docking 布局（DockingLayout1）中心区域的数据表格 Datagrid1 打开行号（rownumbers=true）；" +
    "再把水平布局（HorizontalLayout1）里的 Datagrid2 分页改成开启（pagination=true），Datagrid3 的条纹改为关闭（striped=false）。",
};

const model = new DeepSeekModelPort({ apiKey });
const ctxBase: ModelPortContext = {
  tenantId: "tenant-llm-walkthrough",
  userId: "user-llm-walkthrough",
  workspaceId: "ws-container-llm",
  conversationId: "conv-container-llm",
  recentMessages: [],
  revisionSummary: "页面「容器验收页」含 easyui 控件（LinkButton1/LinkButton2/Textbox1）、Docking 布局（内嵌 SideMenu1/Tree1/Datagrid1）、水平布局（内嵌 Datagrid2/Datagrid3）",
  editableEntities: entities,
};

const scenes: Array<"create" | "modify"> = scene === "both" ? ["create", "modify"] : [scene];

for (const s of scenes) {
  console.log(`\n──────────────────────── 场景 ${s} ────────────────────────`);
  console.log(`需求: ${requirementText[s]}`);
  const ctx: ModelPortContext = { ...ctxBase, requirementText: requirementText[s] };
  const plan = dryRun ? dryPlans[s] : await model.createChangePlan(ctx);
  const planObj = plan as { workspaceId?: string; operations: Array<{ op: string; entityId: string; entityType?: string; properties?: Record<string, unknown>; changes?: Array<{ path: string; value: unknown }> }> };
  console.log(`${dryRun ? "（DRY_RUN 预置 plan）" : "③ LLM 输出 plan"}（workspaceId=${planObj.workspaceId}，operations=${planObj.operations.length}）:`);
  console.log(JSON.stringify(planObj.operations, null, 2));

  // 容器硬约束粗检（详细校验交给 applyClientPatch + 产物结构）
  for (const op of planObj.operations) {
    if (op.op === "create") {
      const t = op.properties?.["type"];
      console.log(`   create: type=${t} entityId=${op.entityId}`);
    } else if (op.op === "update") {
      console.log(`   update: entityId=${op.entityId} changes=${(op.changes ?? []).map((c) => c.path).join(",")}`);
    }
  }

  // -------------------------------------------------------------------------
  // 4. applyClientPatch → 校验产物
  // -------------------------------------------------------------------------
  console.log("\n④ 应用 plan 到工程…");
  const candidate = await applyClientPatch(ws.path, planObj);
  const candInspection = await inspectClientProject(candidate.path);
  console.log(`   候选工程控件数: ${Object.keys(candInspection.index.controls).length}`);

  // 产物结构硬约束校验
  const doc = await (await import("node:fs/promises")).readFile(
    path.join(candidate.path, "1.0.0.1", "project", "page", "容器验收页.json"),
    "utf8",
  );
  const page = JSON.parse(doc);
  const problems: string[] = [];
  const walk = (o: unknown): void => {
    if (Array.isArray(o)) { o.forEach(walk); return; }
    if (typeof o !== "object" || o === null) return;
    const rec = o as Record<string, unknown>;
    if (typeof rec["uiExtendType"] === "number" || typeof rec["layoutType"] === "number") {
      // 只拦 IR 判别值（type="easyui"/"layout"/"prototype" 或 uiModelType）；
      // textbox 的 type:"text" 是 KF 原生输入类型字段，合法。
      if (rec["type"] === "easyui" || rec["type"] === "layout" || rec["type"] === "prototype") {
        problems.push(`${String(rec["name"])}: 不应含 IR 判别 type 字段`);
      }
      if (rec["uiModelType"] !== undefined) problems.push(`${String(rec["name"])}: 不应含 uiModelType 字段`);
    }
    if (rec["objectType"] === 3 && rec["baseProperty"] !== undefined) {
      problems.push(`${String(rec["name"])}: easyui 子控件不应有 baseProperty`);
    }
    if (rec["layoutType"] === 5 && !Array.isArray(rec["dPanelsOption"])) {
      problems.push(`${String(rec["name"])}: Docking 布局缺少 dPanelsOption`);
    }
    for (const k of ["objects", "children", "layoutItems", "insiderObjects"]) {
      if (rec[k] !== undefined) walk(rec[k]);
    }
  };
  walk(page.objects);
  if (problems.length > 0) {
    console.error(`❌ 场景 ${s} 产物硬约束违规:\n  ${problems.join("\n  ")}`);
    process.exitCode = 1;
  } else {
    console.log(`✅ 场景 ${s} 产物硬约束全部通过（无 type/uiModelType/baseProperty 违规，Docking 有 panels）`);
  }

  // 校验 create 的控件确实存在
  for (const op of plan.operations) {
    if (op.op === "create" && op.entityType === "control") {
      const name = op.entityId;
      const exists = Object.values(candInspection.index.controls).some((c) => c.id === name);
      console.log(`   create 控件 "${name}" 是否进入产物: ${exists ? "✓" : "✗ 未找到"}`);
      if (!exists) process.exitCode = 1;
    }
  }
}

// 打包产物（供 sdb 安装原生验证）
const pkg = await packageNativeClientProject(ws.path);
const outDir = "/tmp/container-llm-walkthrough";
await mkdir(outDir, { recursive: true });
const out = path.join(outDir, "built-container-llm.gz");
await (await import("node:fs/promises")).writeFile(out, pkg);
console.log(`\n⑤ 基础工程打包: ${out} (${pkg.length} bytes)`);
console.log("   原生验证：将候选工程（candidate.path）按 sdb 流程安装后由 KF 前端打开确认。");
