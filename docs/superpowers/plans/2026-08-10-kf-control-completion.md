# KF 控件全量完善 Implementation Plan（20 种静态控件 + 容器对象，至 L5）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 agent-app 的 KF 控件支持从 12 种扩展到约 20 种静态控件 + easyui/布局容器对象，达到 L3/L4 能力，并对核心控件做 L5 原生验收；参考工程为 `~/Desktop/test_最新_2.gz`（275 页、1726 控件、29 种 uiModelType + 786 个容器对象）。

**Architecture:** 每个新控件沿 6 层实现链落地：IR schema（`packages/domain-client/src/ir/client-project-ir.schema.ts`）→ 模板 JSON（`templates/control-templates/`，用 `kf-template-generator.ts` 从 KF 源码自动生成）→ 编译/校验（`compile/control-compiler.ts` + `client-compiler.ts`）→ patch 支持（`patch/allowlist.ts` + `client-patcher.ts`）→ 预览渲染（`packages/preview-renderer/src/renderer.ts`）→ LLM 暴露（`apps/api/src/conversations/deepseek-model.ts`）+ 各层测试。最后用真实工程 + 本机 KF 环境做原生验收。

**Tech Stack:** TypeScript 5.9、Node.js 24、Zod 4、Vitest 3、pnpm workspace；KF 源码提取用 kf-schema-extractor。

## Global Constraints

- 参考工程：`~/Desktop/test_最新_2.gz` → 解压 `/tmp/kf_ref/1.0.0.1`（页面在 `project/page/*.json`，控件在 `objects[]`）。
- KF 控件源码权威数据源：`/Users/fengjinlong/YK/KingFusion3.6/KingFusion3.6_Center/kingdevopscenter/kingclient/exe/public/javascripts/Common/Graphic/`（`UI/kmui_*.js` 49 个老式 + `ElementUI/kmui_elementui_*.js` 22 个新式 + `Global/kmui_glabolvar.js` 枚举 + `Global/kmui_zh_resource.js` 中文）。
- 模板必须用 `kf-template-generator.ts` 从源码生成，禁止手写字段（防字段遗漏/拼错）。
- 控件必须完全落在 1440x900 页面内；未知字段必须原样保留（修改工程不得降级）。
- 新增控件不得破坏现有 12 种（496 测试基线须保持全绿）。
- 跨平台（Linux x86 + Windows Server 部署目标），路径用 `node:path`。
- 每批完成：测试先行、`git diff --check`、单批一个 commit。
- L5 原生验收：用本机 KF（KingFusion3.6_Center）+ 参考服务器 192.168.3.32（root/Kingview01!）导入 Golden Sample 验证。

---

## 阶段 A：模板批量生成（基础，全部新控件）

### Task A1: 扩展 kf-template-generator 的 CONTROLS 表并生成全部新控件模板

**Files:**
- Modify: `agent-app/packages/kf-schema-extractor/src/kf-template-generator.ts`（CONTROLS 表）
- Create: `agent-app/packages/domain-client/src/templates/control-templates/{input,cascader,datetimepicker,dropdown,navmenu,tree,upload,transfer,tag,timeline,steps,gantt,webcontainer,combobox,scale,list,menu,treeview,factorycalendar}.json`（19 个新文件）
- Test: `agent-app/packages/kf-schema-extractor/src/kf-template-generator.test.ts`

**Interfaces:**
- Consumes: `template-extractor.ts` 的 `extractControlSource/extractConstructorBody/extractFieldDefaults/extractPropertys/extractUiModelType/mergeDefaults`
- Produces: 19 个模板 JSON，每个含 `uiModelType` + 序列化字段 + `sizePolicy`（`{sizePolicy:[3,3,0,0],minSize:[5,5],maxSize:[16777215,16777215],fixedSize:[w,h]}`）+ `showUiExtendType`

- [ ] **Step 1: 写失败测试**——断言 19 个新 uiModelType 都在 `KM_UI_MODE_TYPE_ENUM` 中且源码文件存在

```ts
// kf-template-generator.test.ts 新增
it("covers all reference-project control types", () => {
  const missing = [
    0,1,3,8,9,10,11,12,30,32,33,34,38,39,40,43,45,46,50,51,52,
  ].filter((ut) => !Object.values(KM_UI_MODE_TYPE_ENUM).includes(ut));
  expect(missing).toEqual([]);
});
```

- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: 在 CONTROLS 表补 19 项**（参照现有 12 项格式，`file`/`base`/`templateName` 用真实源码路径）：
  - ElementUI 系列（base `KMUIElementBase`）：input(38)/cascader(39)/datetimepicker(40)/dropdown(33)/navmenu(34)/tree(32)/upload(45)/transfer(46)/tag(50)/timeline(51)/steps(52)
  - 老式系列（base `KMUIModelBase`）：combobox(3)/scale(8)/list(9)/menu(10)/treeview(11)/webcontainer(12)/gantt(30)/factorycalendar(43)
  - 旧 radio(0)/checkbox(1)：源码在 `UI/kmui_radio_model.js`/`UI/kmui_checkbox_model.js`（如存在；不存在则映射到 ElementUI 的 36/37 语义模板）
- [ ] **Step 4: 跑生成器**生成 19 个模板到 `templates/control-templates/`
- [ ] **Step 5: 用参考工程真实控件逐字段比对模板**（抽样：input/tag/steps/cascader/tree 各取 1 个真实对象比对字段名与默认值，差异记入模板）
- [ ] **Step 6: 运行测试确认通过**
- [ ] **Step 7: Commit** `feat(schema-extractor): generate templates for 19 new control types`

---

## 阶段 B：IR schema + 编译校验（每控件一个 Task，或按组）

> 每个新控件在 IR schema 加 variant 时，同步改 `control-compiler.ts`（CONTROL_TEMPLATES/TYPE_IR_FIELDS/applySchemaOverrides）和 `client-compiler.ts`（validateControl），并补测试。为控制任务粒度，**每 3-4 个同类控件一组**。

### Task B1: ElementUI 输入类（input / cascader / datetimepicker / dropdown）

**Files:**
- Modify: `packages/domain-client/src/ir/client-project-ir.schema.ts`（新增 4 个 variant + CONTROL_TYPE_BY_UIMODEL_TYPE + ControlIR 联合）
- Modify: `packages/domain-client/src/ir/client-project-ir.ts`（CONTROL_TYPES）
- Modify: `packages/domain-client/src/compile/control-compiler.ts`（注册模板 + TYPE_IR_FIELDS + applySchemaOverrides 4 个 case）
- Modify: `packages/domain-client/src/compile/client-compiler.ts`（validateControl 4 个 case）
- Test: `packages/domain-client/src/compile/client-compiler.test.ts`

**Interfaces:**
- Consumes: Task A1 生成的 input.json/cascader.json/datetimepicker.json/dropdown.json
- Produces: IR variant 类型 `InputControlIR`/`CascaderControlIR`/`DatetimePickerControlIR`/`DropdownControlIR`

- [ ] **Step 1: 失败测试**——`ClientProjectIR.parse` 一个含 4 个新控件的 IR 对象
- [ ] **Step 2: 运行确认失败**
- [ ] **Step 3: IR schema 加 variant**（字段取自模板，如 input: `value/placeholder/maxlength/disabled/clearable/type`，cascader: `options/placeholder/filterable/clearable`，datetimepicker: `value/type/placeholder/format`，dropdown: `options/placeholder/splitButton`）
- [ ] **Step 4: control-compiler 注册 + overrides 映射**（IR 语义字段 → 模板 raw 字段）
- [ ] **Step 5: client-compiler validateControl 加校验**（decimals/options 非空等）
- [ ] **Step 6: 运行测试通过**
- [ ] **Step 7: Commit**

### Task B2: ElementUI 导航展示类（navmenu / tree / upload / transfer）

**Files:** 同 B1 结构（4 个新 variant）
- [ ] **Step 1-7**: 失败测试 → IR variant（navmenu: `mode/options`，tree: `showCheckbox/indent/expandOnClickNode`，upload: `action/accept/multiple`，transfer: `options/titles`）→ 编译映射 → 校验 → 测试通过 → commit

### Task B3: ElementUI 标签流程类（tag / timeline / steps）

**Files:** 同 B1 结构（3 个新 variant）
- [ ] **Step 1-7**: 失败测试 → IR variant（tag: `effect/closable/hit`，timeline: `items`，steps: `active/direction/processStatus`）→ 编译映射 → 校验 → 测试通过 → commit

### Task B4: 老式控件组 1（combobox / scale / list / menu）

**Files:** 同 B1 结构（4 个新 variant，base KMUIModelBase）
- [ ] **Step 1-7**: 失败测试 → IR variant（combobox: `options/value`，scale: `min/max/value`，list: `options`，menu: `options`）→ 编译映射 → 校验 → 测试通过 → commit

### Task B5: 老式控件组 2（treeview / webcontainer / gantt / factorycalendar）

**Files:** 同 B1 结构（4 个新 variant）
- [ ] **Step 1-7**: 失败测试 → IR variant（treeview: `options/showCheckbox`，webcontainer: `url/scrollbar`，gantt: `options`，factorycalendar: `value/dateFormat`）→ 编译映射 → 校验 → 测试通过 → commit

### Task B6: 旧 radio/checkbox（uiModelType 0/1）别名映射

**Files:**
- Modify: `packages/domain-client/src/ir/client-project-ir.schema.ts`（CONTROL_TYPE_BY_UIMODEL_TYPE 加 0→radio、1→checkbox）
- Test: `packages/domain-client/src/inspect/client-inspector.test.ts`
- [ ] **Step 1: 失败测试**——`CONTROL_TYPE_BY_UIMODEL_TYPE[0]` 应为 "radio"
- [ ] **Step 2: 确认失败**
- [ ] **Step 3: 映射 0/1 → radio/checkbox**（复用现有 36/37 的模板与 IR）
- [ ] **Step 4: 测试通过**
- [ ] **Step 5: Commit**

---

## 阶段 C：patch 支持 + inspector + 预览渲染

### Task C1: allowlist 与 client-patcher 支持全部新控件

**Files:**
- Modify: `packages/domain-client/src/patch/allowlist.ts`（CONTROL_TYPE_ALLOWED_FIELDS 加 19 类）
- Modify: `packages/domain-client/src/patch/client-patcher.ts`（CONTROL_TEMPLATES 注册 + CREATE_PASS_THROUGH 加新类型透传）
- Test: `packages/domain-client/src/patch/client-patcher.test.ts`

**Interfaces:**
- Consumes: 阶段 B 的 IR 类型与模板
- Produces: 每个新控件可被 create/update（几何 + 核心属性）

- [ ] **Step 1: 失败测试**——`creates controls of all reviewed template types with pass-through props` 扩展：断言 NewInput `uiModelType:38`、NewTag `uiModelType:50` 等
- [ ] **Step 2: 确认失败**
- [ ] **Step 3: allowlist 加 19 类字段**
- [ ] **Step 4: patcher 注册模板 + CREATE_PASS_THROUGH**
- [ ] **Step 5: 测试通过**
- [ ] **Step 6: Commit**

### Task C2: client-inspector 支持新控件（unknownFields 检测 + 索引）

**Files:**
- Modify: `packages/domain-client/src/inspect/client-inspector.ts`（CONTROL_SPECIFIC_FIELDS 加新 uiModelType 数字）
- Test: `packages/domain-client/src/inspect/client-inspector.test.ts`
- [ ] **Step 1: 失败测试**——inspect 一个含新控件的工程，`type` 映射正确且 `unknownFields` 为空
- [ ] **Step 2: 确认失败**
- [ ] **Step 3: CONTROL_SPECIFIC_FIELDS 补新类型**
- [ ] **Step 4: 测试通过**
- [ ] **Step 5: Commit**

### Task C3: preview-renderer 渲染全部新控件

**Files:**
- Modify: `packages/preview-renderer/src/renderer.ts`（renderControl 加 case + kfControlToIR pickAll + PREVIEW_CSS）
- Test: `packages/preview-renderer/src/renderer.test.ts`
- [ ] **Step 1: 失败测试**——`renders per-type payloads` 扩展：断言 input `<input>`、cascader 下拉、datetimepicker 文本、tag 标签、steps 步骤条等 HTML
- [ ] **Step 2: 确认失败**
- [ ] **Step 3: renderControl 加 19 个 case**
- [ ] **Step 4: kfControlToIR pickAll 加字段**
- [ ] **Step 5: PREVIEW_CSS 加样式**
- [ ] **Step 6: 测试通过**
- [ ] **Step 7: Commit**

### Task C4: 容器对象支持（easyui datagrid + 布局容器 + CustomCharts 等）

**Files:**
- Modify: `packages/domain-client/src/ir/client-project-ir.schema.ts`（新增容器 variant：`LayoutContainerIR`（objectType 2，insiderObjects 嵌套）、`DataGridIR`（objectType 3，datagrid 字段）、`SpecialNodeIR`（objectType 1，CustomCharts 等））
- Modify: `packages/domain-client/src/compile/client-compiler.ts`、`patch/allowlist.ts`、`client-patcher.ts`、`inspect/client-inspector.ts`、`preview-renderer/src/renderer.ts`
- Test: `packages/domain-client/src/compile/client-compiler.test.ts` + `patch/client-patcher.test.ts` + `renderer.test.ts`

**Interfaces:**
- Consumes: 参考工程 objectType 1/2/3 真实结构
- Produces: 容器对象可被创建/修改/渲染

- [ ] **Step 1: 失败测试**——解析参考工程某页，datagrid 被识别为 `datagrid` 类型且字段保留
- [ ] **Step 2: 确认失败**
- [ ] **Step 3: IR schema 加 3 个容器 variant**
- [ ] **Step 4: 编译/校验/allowlist/patcher/inspector/renderer 支持**
- [ ] **Step 5: 测试通过**
- [ ] **Step 6: Commit**

---

## 阶段 D：LLM 暴露 + 设计原则

### Task D1: deepseek-model prompt 支持全部新控件

**Files:**
- Modify: `apps/api/src/conversations/deepseek-model.ts`（SYSTEM_PROMPT 12 种 → 31 种、buildPlanPrompt create/update 字段、kf-design-principles.ts 能力边界）
- Test: `apps/api/src/conversations/deepseek-model.test.ts` + `kf-design-principles.test.ts`
- [ ] **Step 1: 失败测试**——prompt 含全部新控件类型名
- [ ] **Step 2: 确认失败**
- [ ] **Step 3: SYSTEM_PROMPT 控件清单扩到 31 种**
- [ ] **Step 4: buildPlanPrompt create 格式 + update 受控字段**
- [ ] **Step 5: KF_DESIGN_PRINCIPLES_FULL 能力边界**
- [ ] **Step 6: 测试通过**
- [ ] **Step 7: Commit**

---

## 阶段 E：L5 原生验收

### Task E1: Golden Sample 工程 + 原生导入验收

**Files:**
- Create: `packages/domain-client/tests/fixtures/golden-sample/`（含全部新控件的单页工程）
- Test: `packages/build-jobs/src/job-executor.test.ts`（构建通过）+ 手动验收

- [ ] **Step 1: 用编译产物生成 Golden Sample**（每新控件 1 个实例，含典型属性）
- [ ] **Step 2: 构建并通过 validateClientProject**
- [ ] **Step 3: 打包 artifact 并在本机 KF（KingFusion3.6_Center）导入、打开、保存**
- [ ] **Step 4: 参考服务器 192.168.3.32 导入验证**（如本机不可用则记录为待办）
- [ ] **Step 5: 记录验收结果到 `docs/kf-control-acceptance.md`**
- [ ] **Step 6: Commit**

---

## 阶段 F：全量回归 + 交付

### Task F1: 全量测试 + 真实工程端到端

**Files:** 全仓库
- [ ] **Step 1: 全量 vitest**（496 + 新增全绿）
- [ ] **Step 2: 两包 tsc --noEmit**
- [ ] **Step 3: 用参考工程 test_最新_2 走完整流程**（上传 → 识别控件 → 修改 → 构建 → 预览）
- [ ] **Step 4: git diff --check + 汇总交付说明**
- [ ] **Step 5: Commit 最终**

---

## Self-Review

**覆盖检查：**
- 参考工程 29 种 uiModelType → A1（模板）+ B1-B6（IR/编译）✓
- 786 个容器对象 → C4 ✓
- patch 修改 → C1-C2 ✓
- 预览 → C3 ✓
- LLM 生成 → D1 ✓
- L5 原生验收 → E1 ✓
- 回归 → F1 ✓

**风险：** menu(10)/list(9) 老式控件源码可能无独立构造器（子代理已提示 MENU 无独立文件）——A1 时如提取失败，标记为 L1 保留（模板=base 字段 + uiModelType），不阻塞其它控件。
