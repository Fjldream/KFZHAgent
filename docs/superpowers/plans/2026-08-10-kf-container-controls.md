# KF 容器对象支持 Implementation Plan（easyui 控件 + 布局容器）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 agent-app 对 KF 容器对象的支持从"保留但不可见"提升为 L3/L4（可识别、可展示、可修改几何与核心属性），覆盖参考工程 test_最新_2 中全部 easyui 控件（objectType=3）与布局容器（objectType=2 及无 objectType 布局）。

**Architecture:** 容器对象沿静态控件的 6 层实现链落地，但需独立 IR 建模（容器几何在 baseProperty、子对象在 insiderObjects、easyui 控件用 objectType+uiExtendType 而非 uiModelType 标识）。easyui 控件归类为 `EasyuiControlIR`（datagrid/treegrid/combobox/tree 等按 proto 细分），布局容器归类为 `LayoutContainerIR`（layoutType 2/3/4/5 等）。

**Tech Stack:** TypeScript 5.9、Node.js 24、Zod 4、Vitest 3、pnpm workspace；参考工程 /tmp/kf_ref/1.0.0.1。

## Global Constraints

- 参考工程容器对象：objectType=3 easyui 控件 400+（proto 1=datagrid、17=treegrid、18=树表、0=combobox、26=sidemenu、5=属性列表、9=按钮组、2=树列表 等），objectType=2 布局容器 120（layoutType 2/4/5/10），无 objectType 布局（0/3/6）
- 布局容器几何在 `baseProperty`（非顶层 leftTopPt），子对象在 `insiderObjects[]`（含 region/internalVertex），面板在 `dPanelsOption`
- datagrid 等 easyui 控件几何在顶层，数据/列在 `configureData` 脚本（easyui 模式，IR 不建模数据）
- 容器对象必须能被 inspect 识别（unknownFields 清零）、可修改几何与核心属性（L3）、可预览渲染（L4）
- 容器内嵌套子控件递归收集（insiderObjects → 子控件）
- CustomCharts/AlarmWindow/TrendChart（objectType=1 等特殊节点）**不在本轮**，保持 L1 保留
- 跨平台（Linux x86 + Windows）；每批测试先行、单批一个 commit
- 现有 500 测试基线须保持全绿

---

## 阶段 A：结构分析与 IR 建模

### Task A1: 建立 easyui proto → 控件名映射表

**Files:**
- Create: `packages/domain-client/src/ir/easyui-types.ts`
- Test: `packages/domain-client/src/ir/easyui-types.test.ts`

- [ ] **Step 1: 从参考工程统计 proto 0-26 的完整分布与字段集**（脚本输出每 proto 的字段并集）
- [ ] **Step 2: 写失败测试**——断言 proto 1→datagrid、17→treegrid、0→combobox 等映射存在
- [ ] **Step 3: 实现映射表**（proto → 语义类型名 + 可修改字段白名单）
- [ ] **Step 4: 测试通过**
- [ ] **Step 5: Commit**

### Task A2: IR schema 容器 variant

**Files:**
- Modify: `packages/domain-client/src/ir/client-project-ir.schema.ts`（EasyuiControlIR + LayoutContainerIR + ContainerIR 联合 + 映射）
- Test: `packages/domain-client/src/ir/client-project-ir.test.ts`

- [ ] **Step 1: 失败测试**——parse 一个含 datagrid + 布局容器的 IR 对象
- [ ] **Step 2: 确认失败**
- [ ] **Step 3: 实现 variant**：`EasyuiControlIR`（type=easyui-<proto>，几何+核心字段）、`LayoutContainerIR`（type=layout-<layoutType>，baseProperty 几何+insiderObjects 嵌套）
- [ ] **Step 4: 测试通过**
- [ ] **Step 5: Commit**

---

## 阶段 B：编译/校验/patcher

### Task B1: 编译 easyui 控件与布局容器

**Files:**
- Modify: `packages/domain-client/src/compile/control-compiler.ts`、`client-compiler.ts`
- Test: `packages/domain-client/src/compile/client-compiler.test.ts`

- [ ] **Step 1: 失败测试**——compile IR 含 datagrid + 布局容器
- [ ] **Step 2: 确认失败**
- [ ] **Step 3: 实现 compile**（easyui: 顶层几何 + 模板字段；布局: baseProperty 几何 + insiderObjects 递归）
- [ ] **Step 4: 测试通过**
- [ ] **Step 5: Commit**

### Task B2: allowlist + patcher 支持容器

**Files:**
- Modify: `packages/domain-client/src/patch/allowlist.ts`、`client-patcher.ts`
- Test: `packages/domain-client/src/patch/client-patcher.test.ts`

- [ ] **Step 1: 失败测试**——create/update 容器对象
- [ ] **Step 2: 确认失败**
- [ ] **Step 3: 实现**（allowlist 加容器字段；patcher create 用 baseProperty 几何）
- [ ] **Step 4: 测试通过**
- [ ] **Step 5: Commit**

---

## 阶段 C：inspect + 渲染

### Task C1: inspect 识别容器对象（unknownFields 清零）

**Files:**
- Modify: `packages/domain-client/src/inspect/client-inspector.ts`（collectControls 识别 objectType 2/3）
- Test: `packages/domain-client/src/inspect/client-inspector.test.ts`

- [ ] **Step 1: 失败测试**——inspect 参考工程 datagrid/布局容器页，type 映射正确且 unknownFields 为空
- [ ] **Step 2: 确认失败**
- [ ] **Step 3: 实现**（无 uiModelType 但 objectType 2/3 的对象 → 容器类型）
- [ ] **Step 4: 测试通过**
- [ ] **Step 5: Commit**

### Task C2: preview-renderer 渲染容器

**Files:**
- Modify: `packages/preview-renderer/src/renderer.ts`（renderControl 加 easyui/布局 case + CSS）
- Test: `packages/preview-renderer/src/renderer.test.ts`

- [ ] **Step 1: 失败测试**——渲染 datagrid（表格）+ 布局容器（区域框）
- [ ] **Step 2: 确认失败**
- [ ] **Step 3: 实现**（datagrid → table HTML；布局 → div 区域 + 子控件嵌套渲染）
- [ ] **Step 4: 测试通过**
- [ ] **Step 5: Commit**

---

## 阶段 D：LLM 暴露 + 验收

### Task D1: deepseek-model prompt 支持容器

**Files:**
- Modify: `apps/api/src/conversations/deepseek-model.ts`（SYSTEM_PROMPT + buildPlanPrompt）
- Test: `apps/api/src/conversations/deepseek-model.test.ts`

- [ ] **Step 1: 失败测试**——prompt 含 easyui 控件/布局容器类型
- [ ] **Step 2: 确认失败**
- [ ] **Step 3: 实现**（SYSTEM_PROMPT 加"容器类控件"章节）
- [ ] **Step 4: 测试通过**
- [ ] **Step 5: Commit**

### Task D2: 全量回归 + L5 原生验收

**Files:** 全仓库
- [ ] **Step 1: 全量 vitest + 两包 tsc**
- [ ] **Step 2: 用参考工程真实 datagrid/布局页走完整流程**（上传 → 识别 → 修改 → 构建 → 预览）
- [ ] **Step 3: Golden Sample（含 datagrid + 布局）安装到服务器 192.168.3.32 sdb → KF 打开验收**
- [ ] **Step 4: git diff --check + 交付说明**
- [ ] **Step 5: Commit 最终**

---

## Self-Review

**覆盖检查：** easyui 全量（Task A1/A2 + B1/B2 + C1/C2 + D1）✓、布局容器（Task A2/B1/C1/C2）✓、L5 验收（D2）✓、CustomCharts 明确排除 ✓。

**风险：** easyui 控件字段集大（datagrid 30+ 字段），IR 只建模几何+核心属性、数据走 configureData 保留；布局容器嵌套深度需递归处理；布局容器几何在 baseProperty 与静态控件顶层几何不同，patcher create 需特判。
