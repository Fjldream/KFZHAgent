# 需求澄清、设计计划确认与设计原则注入

日期：2026-08-06
状态：待用户审查（v3：Reasonix 式迭代对话 + 预览反馈循环）

## 1. 结论

当前 KF Solution Agent（agent-app，LangGraph 单 Agent）是"任务型一次性生成"，达不到设计工具的对话体验。三个目标缺口（均已实证，见 §2）：

本设计把 Agent 从"任务型一次性生成"升级为 **Reasonix 式持续对话迭代设计**：设计是一个随对话持续演化的对象，用户通过不断对话（澄清→设计计划→预览）反复调整方案，最终满意后落地工程。

三个目标缺口（已实证，见 §2）：

1. **无澄清**：输入需求直接出方案，无法连续确认需求；
2. **无设计迭代**：设计一次性生成，用户看不到"我理解你要什么 + 打算怎么做"，也无法反复调整；
3. **无预览反馈**：构建后没有"看真实效果 → 反馈 → 修订 → 重建"的闭环。

三层改动（控件能力补全见 §9 后续计划）：

- **层 1（架构）**：逐轮需求澄清（CLARIFY 意图 + clarify 节点 + 澄清计数上限），信息不足时 Agent 必须追问而非猜测；
- **层 2（架构）**：**设计迭代循环**——design-plan 节点产出/修订 DesignPlan（布局/风格/分区/控件清单），SSE 对话内展示；用户自然语言反馈 → REVISE_DESIGN → 修订重新展示（不设上限）；确认 → 生成控件方案 → 批准 → 构建 → **预览反馈循环**（看预览 → 反馈 → 修订 → 重建，满意才落地）；
- **层 3（模型）**：把 Anthropic 官方 `frontend-design` skill（Apache 2.0）转录为 DeepSeek system prompt 的 `KF_DESIGN_PRINCIPLES` 章节（适配 KF 控件语言），让 DeepSeek 具备设计审美并遵守"两遍流程"。

核心原则不变：Agent 决定做什么；LangGraph 决定何时做；确定性 KF Build Engine 准确地生成、修改、验证和打包工程。

## 2. 问题定位（已实证）

### 2.1 无澄清——架构层根因（三层叠加）

| 层 | 现状 | 根因 |
|---|---|---|
| Intent 枚举 | 仅 7 种（QUESTION/NEW_REQUIREMENT/MODIFY_REQUIREMENT/CONFIRM_PLAN/CANCEL_PLAN/ROLLBACK/BUILD），无澄清类意图 | NEW_REQUIREMENT 只能路由到 plan-change |
| Graph 拓扑 | 6 节点线性流（load-context → classify → plan-change → approval → enqueue-build），无澄清循环 | 需求信息不足时无"追问→等待→再判"回路 |
| LLM Prompt | classifyIntent 直接判 7 意图；createChangePlan 开头即"请根据需求输出变更计划 JSON" | 模型被架构逼着一次到位 |

### 2.2 产物偏差——能力缺口（三层叠加）

| 层 | 现状 | 根因 |
|---|---|---|
| IR 控件类型 | 12 种（text/button/inputnumber/switch/checkbox/radio/select/image/tabs/table/richtext/spacer），无图表/趋势曲线类 | LLM 想画趋势曲线也没有"笔" |
| LLM Prompt | create 格式硬编码 `type:"text\|button\|inputnumber"` | 即使有图表类型 prompt 也只让建三种 |
| KF 侧 | 趋势曲线是运行时图表组件（ChartComponent/EChart/TrendChart，KMEnumChartComponentType.TRENDCHART），非页面 JSON 静态控件；SDB 真实工程无图表样本 | 趋势曲线在页面 JSON 的序列化形式未验证（本设计不解决，见 §9 遗留） |

## 3. 方案总览：Reasonix 式迭代对话

```
用户输入需求
  → classify ──CLARIFY──► clarify 节点（追问+可选项）→ idle，等客户回答
  → classify（信息足够）──► design-plan 节点（生成设计计划）
  → SSE 对话内展示设计计划 → idle，stage=design-review
  → 用户自然语言反馈 ──REVISE_DESIGN──► design-plan 修订 → 重新展示（循环，不限次数）
  → CONFIRM_DESIGN ──► plan-change（生成控件方案）→ approval（现有）→ build
  → 构建成功 → SSE 展示预览（preview）+ 方案摘要 → idle，stage=preview-review
  → 预览不满意 → 用户自然语言反馈：
       REVISE_DESIGN（改设计方向）──► design-plan 修订 → 重新 plan/build（循环）
       MODIFY_REQUIREMENT（小调整）──► plan-change 增量修改 → approval → build（循环）
  → 满意 → CONFIRM_BUILD ──► 落地（stage=done，下载产物）
```

两个迭代循环是核心：**设计迭代**（design-review 阶段，设计计划随对话演化）与**预览反馈**（preview-review 阶段，看真实效果再修订）。三层关系：层 1/2 是 graph 拓扑改动；层 3 是模型 prompt 改动，独立可先行。

## 4. 层 1：逐轮需求澄清（CLARIFY）

### 4.1 Intent 与 Schema 改动（`packages/agent-orchestrator/src/schemas/intent.ts`）

```ts
IntentSchema = z.enum([
  "QUESTION",
  "NEW_REQUIREMENT",
  "MODIFY_REQUIREMENT",
  "CONFIRM_PLAN",
  "CANCEL_PLAN",
  "ROLLBACK",
  "BUILD",
  "CLARIFY",            // 新增：需求信息不足，需要追问
]);

ClassifyIntentResultSchema = z.object({
  intent: IntentSchema,
  requestedDomains: z.array(z.string()),
  reply: z.string().optional(),
  needsClarification: z.boolean().optional(),                       // 新增
  clarifyingQuestion: z.object({                                    // 新增
    question: z.string(),
    options: z.array(z.string()).max(5).optional(),                 // 可选项，≤5 个
  }).optional(),
});
```

### 4.2 路由与节点（`solution-graph.ts` + `nodes/clarify.ts` 新增）

- `routeAfterClassify`：`CLARIFY → "clarify"`（回 idle，不进入 plan-change）；
- 新节点 **clarify**：职责 = 把追问写入 assistant 消息（SSE 推送）、`clarificationCount + 1`、`stage = "clarifying"`、回 idle；
- `AgentGraphState` 新增 `clarificationCount: number`（默认 0），**上限 5**：达到上限时 classify 不再接受 CLARIFY（视为信息足够，按 NEW_REQUIREMENT 继续），防死循环；
- **防假澄清**：needsClarification=true 但 clarifyingQuestion 缺失 → `INVALID_MODEL_OUTPUT` 回 idle（不展示空追问）。

### 4.3 DeepSeek classifyIntent prompt 改造（`apps/api/src/conversations/deepseek-model.ts`）

- 明确指示：**"信息不足必须 CLARIFY，给出 1 个具体问题 + 3-5 个可选项；禁止猜测需求、禁止一次到位"**；
- 可选项给法：选项本身是"答什么"的引导（如 `①生产监控 ②设备状态 ③能源管理`），降低客户回答成本；
- 追问一次只问一个维度（主题/数据区/风格/布局逐轮收敛），由对话历史（recentMessages）保证不重复问。

### 4.4 交互（用户视角）

```
用户：生成一个监控大屏
→ Agent：主题是哪种？①生产监控 ②设备状态 ③能源管理 ④其他
→ 用户：①
→ Agent：需要哪些数据区？①趋势曲线+KPI 数字 ②实时状态灯 ③告警列表 ④以上都要
→ 用户：④
→ Agent：整体风格？①深色工业风 ②浅色简约 ③科技蓝光
→ 用户：①
→（信息足够）→ 进入设计计划（层 2）
```

## 5. 层 2：设计迭代循环 + 预览反馈循环

### 5.1 新 Schema：DesignPlan（`packages/contracts/src/design-plan.ts`）

把 frontend-design 的 compact token system 适配成 KF 语言；DesignPlan 是**随对话演化的对象**（修订产生新版本）：

```ts
DesignPlanSchema = z.object({
  schema: z.literal("kf-design-plan/v1"),
  displayName: z.string().min(1),              // 工程显示名
  summary: z.string(),                          // 一句话设计摘要
  layoutConcept: z.string(),                    // 布局概念（一句话 + ASCII 线框，≤400 字符）
  styleDirection: z.string(),                   // 风格方向（配色/基调，如"深色工业风 #0f172a 底 + 青绿强调"）
  sections: z.array(z.object({                  // 页面分区
    id: z.string().min(1),
    label: z.string(),                          // 区名（如"顶部 KPI 区"）
    controls: z.array(z.object({
      type: z.enum([...12 种 IR 控件类型...]),
      text: z.string().optional(),              // 文案/标题
      note: z.string().optional(),              // 该控件在此区的作用说明
    })).max(12),
  })).min(1).max(8),
  signature: z.string(),                        // 记忆点元素（本方案最特别的 1 个设计决策）
}).strict();
```

### 5.2 Intent 与路由

- `IntentSchema` +2：`CONFIRM_DESIGN`（确认设计计划）、`REVISE_DESIGN`（修改设计计划，设计/预览阶段均可）；
- `IntentSchema` +1：`CONFIRM_BUILD`（预览满意，落地）；
- 路由：
  - `CONFIRM_DESIGN → "plan-change"`；
  - `REVISE_DESIGN → "design-plan"`（修订设计计划，携带用户自然语言修改意见）；
  - 预览阶段（stage=preview-review）的 `MODIFY_REQUIREMENT` → `"plan-change"`（小调整，增量修改现有 revision）；
  - `CONFIRM_BUILD → END`（stage=done，落地，下载产物）。

### 5.3 design-plan 节点（新增）

1. 调 `ModelPort.createDesignPlan(context, { revising: boolean })` 生成/修订 DesignPlan；
2. `designPlanHash = sha256(canonical(designPlan))` 存 state（修订产生新版本）；
3. SSE 对话内展示（标题 + 分区 + ASCII 布局 + 风格方向 + 记忆点）；`stage = "design-review"`、回 idle。

修订上下文：revising 时把**上一版 designPlan + 用户自然语言修改意见**注入 prompt（类似 reviseChangePlan 的语义），保证修订是"在上一版基础上改"而非重来。

### 5.4 plan-change 守卫

- `plan-change` 入口校验：存在已确认的 designPlan（`designPlanHash` 非空）且 `stage ∈ {design-review, preview-review}`（由 CONFIRM_DESIGN / MODIFY_REQUIREMENT 路由进入时 stage 置 "planning"）；
- REVISE_DESIGN 修订后 designPlanHash 更新，plan-change 使用**最新** designPlan 作为上下文。

### 5.5 预览反馈循环（preview-review）

- `enqueue-build` 成功后：SSE 推送 previewUrl（现有 `createPreviewUrl` 能力）+ 方案摘要 + "看预览后继续反馈"提示；`stage = "preview-review"`、回 idle；
- 用户反馈路由（classify 判定）：
  - `REVISE_DESIGN`（大改：布局/风格方向变）→ design-plan 修订 → plan-change → approval → build（重建）；
  - `MODIFY_REQUIREMENT`（小改：改文案/调尺寸/加一个控件）→ plan-change 增量（基于现有 revision + editableEntities）→ approval → build；
  - `CONFIRM_BUILD`（满意）→ `stage=done`、END，下载产物（现有 token 下载）；
- **落地语义**：`stage=done` 表示"客户已确认工程"，下载按钮可用（与现有下载一致）。

### 5.6 ModelPort 新方法

```ts
interface ModelPort {
  // ...现有五方法不变
  createDesignPlan(input: ModelPortContext, opts?: { revising?: boolean }): Promise<DesignPlan>;   // 新增
}
```

- DeepSeek 实现：system prompt 含 §6 设计原则；输出 zod 预校验（`DesignPlanSchema.safeParse`），失败 → `INVALID_MODEL_OUTPUT`；
- FakeModelPort（E2E）：确定性输出一个最小 DesignPlan（一个分区、一个 text 控件），保证 E2E 不依赖 LLM。

### 5.7 交互（用户视角，Reasonix 式）

```
（澄清结束）
→ Agent：设计计划 v1
   "工程名：生产监控大屏
    布局：顶部标题+4 KPI 卡 / 中部 3 条趋势曲线 / 右侧状态灯矩阵 / 底部告警滚动
    风格：深色工业风（#0f172a 底 + 青绿 #10b981 强调）
    记忆点：中部 3 条趋势曲线联动 KPI 高亮
    回复调整意见或「确认」"
→ 用户：趋势曲线少一点，改成 2 条，右侧状态灯改成表格
→ Agent：设计计划 v2（修订，展示差异）
→ 用户：确认
→（生成控件方案 → 批准 → 构建）
→ Agent：构建完成，预览已生成（链接）
→ 用户：把标题颜色改红色
→ Agent：（MODIFY_REQUIREMENT → 增量修改 → 重建）构建完成，预览已更新
→ 用户：可以了
→（stage=done，下载）
```

## 6. 层 3：设计原则注入（KF_DESIGN_PRINCIPLES）

### 6.1 来源

Anthropic 官方 `anthropics/skills/skills/frontend-design/SKILL.md`（Apache 2.0，已抓取原文 8.2KB）。

### 6.2 转录方式（`apps/api/src/conversations/kf-design-principles.ts` 新增常量）

转录为 DeepSeek system prompt 的 `KF_DESIGN_PRINCIPLES` 章节，**适配 KF 语言**（非 CSS）：
- 保留原意：两遍流程（先设计计划再实现）、subject 定位（先定主题/受众/页面职责）、三种 AI 模板脸警示（暖米色+衬线+赤陶、近黑+酸性绿、报纸排版——在 KF 里表现为"白底默认控件堆叠"）、克制与自审（boldness 用在一处）、文案即设计材料；
- 适配：设计原则用 KF 控件语言表达（分区网格、控件间距、配色一致性、字号层级），加"监控大屏典型布局"参考（顶部标题 + KPI 区 + 趋势区 + 状态区 + 告警区）；
- 注入位置：DeepSeekModelPort 的 system prompt（classify / design-plan / createChangePlan 共用），temperature 维持 0.2。

### 6.3 预期效果

- 澄清阶段：问的问题更聚焦设计决策；
- 设计计划：布局/风格有方向而非空泛；
- 控件方案：同一需求下不再产出"只有按钮文本写趋势曲线"的凑数方案（真正的趋势曲线控件属层 4 遗留，见 §9）。

## 7. 架构改动清单（按包）

### 7.1 目标控件（开发态静态控件，非图表子模型）

**ElementUI 未接入（12 种）**：`cascader(39)` `datetimepicker(40)` `dropdown` `input(38)` `map` `navmenu(34)` `steps(52)` `tag(50)` `timeline(51)` `transfer(46)` `tree(32)` `upload(45)`（括号内为 uiModelType；dropdown/map 以源码注册为准）

**老式高频（7 种）**：`scale(8)` `time/datetime(5)` `combobox(3)` `list(9)` `treeview(11)` `webcontainer(12)` `gantt(30)`

（控件源码文件与 uiModelType 已在 §2.2 盘点时确认；若个别控件的序列化为运行时复杂对象，按 SDB 无样本处理——模板用构造器默认值，KF 打开验证兜底。）

### 7.2 做法（复用现有模板提取器闭环）

1. **模板**：`kf-template-generator.ts` 的 `CONTROLS` 映射扩展到全部目标控件 → 重跑生成模板（构造器字段 + 基类合并 + 枚举求值，现有逻辑不变）→ 拷贝入 `control-templates/`；
2. **IR schema**：`client-project-ir.schema.ts` 为每个新类型定义语义字段（沿用现有模式：`BaseControlIR.extend({ type: z.literal(...), ...语义字段 }).strict()`），语义字段尽量少（id/geometry + 类型特有 1-3 个）；
3. **编译器**：`control-compiler.ts`（模板映射 + TYPE_IR_FIELDS + applySchemaOverrides case）+ `client-compiler.ts`（validateControl 变体）按 12 种模式扩展；
4. **验证**：编译含新控件的工程 → 导入 KF 3.32 → `getProjectFile` 读回（与 AllControls 实测同闭环）。

### 7.3 风险

- 个别控件（如 map/dropdown）可能也是运行时组件（类似图表子模型）——提取器跑出空模板或无 uiModelType 时，标记"推迟"，不硬接；
- 模板默认值 ≠ 真实序列化字段集（SDB 无样本）——以 KF 打开验证为准，失败则回退。

## 8. 后续计划：静态控件补全（本轮不做，供下轮排期参考）

| 包 | 改动 |
|---|---|
| `packages/contracts` | 新增 `design-plan.ts`（DesignPlanSchema/DesignPlan）；ChangePlan 不变 |
| `packages/agent-orchestrator` | `schemas/intent.ts`（+CLARIFY/CONFIRM_DESIGN/REVISE_DESIGN、needsClarification/clarifyingQuestion）；`state.ts`（+clarificationCount/designPlan/designPlanHash/stage 枚举扩展）；`model-port.ts`（+createDesignPlan）；`nodes/clarify.ts`（新）、`nodes/design-plan.ts`（新）；`nodes/plan-change.ts`（设计计划守卫）；`solution-graph.ts`（+2 节点 +3 路由）；路由与守卫测试 |
| `apps/api/src/conversations` | `deepseek-model.ts`（+createDesignPlan、classify/plan prompt 改造）；`kf-design-principles.ts`（新，设计原则章节）；`graph-ports.ts`（若需把 designPlan 落库/持久化） |
| `apps/web` | 对话流展示设计计划（结构化消息）；澄清追问展示（问题+可选项可点选）；CONFIRM_DESIGN/REVISE_DESIGN 发送 |
| 测试 | 单元：intent schema、clarify 节点、design-plan 节点、守卫、prompt 断言；集成：graph 全流程（澄清→设计→确认→计划→批准）；E2E：新工程走查含澄清+设计确认 |

## 9. 状态与持久化

- `AgentGraphState` 新增：`clarificationCount`、`designPlan`、`designPlanHash`、`stage` 枚举扩展（`clarifying` / `design-review` / `design-planning` / `planning` / `building` / `preview-review` / `done`）；
- 持久化：designPlan 随 checkpoint 持久化（PostgresSaver），恢复后可继续；designPlanHash 校验语义与 planHash 一致（防止并发/过期确认）；
- SSE：clarify 追问、design-plan 展示均为 assistant 消息，走现有 SSE 通道。

## 10. 范围与遗留

**本轮做**：层 1-3（澄清 / 设计计划确认 / 审美注入，见 §4-6）。

**后续开发计划（本轮不做，已排期思路）**：
- **层 4 静态控件补全**：IR 控件类型从 12 种扩展到开发态全部静态控件（ElementUI 未接入 12 种 + 老式高频 7 种，清单见 §7.1），模板提取器重跑 + 编译器接入；
- **KF 趋势曲线/图表控件（TrendChart/BarChart/PieChart/XYChart/CustomCharts/Reports）**：实证确认是图表子模型（不注册 uiModelType，构造器字段可反推但宿主形式未验证——被 Layout/ChartComponent base 引用，页面 JSON 中的挂载方式待实测样本）。先决条件：在 KF 客户端实测拖一个图表保存导出，解析真实序列化结构后再扩展 IR `chart` 控件 + configureData 生成器；
- 上传 .gz 工程的 editableEntities 实体清单（modify 流程，独立遗留项）；
- 设计计划的多方案对比（2-3 个备选让客户选，后续增强）。

**交互上限**：澄清 ≤5 轮；设计计划修订不设上限（由客户主导，无死循环风险——每轮都要客户明确输入）。

## 11. 实施顺序（本轮）

1. 层 3（审美注入）：仅改 prompt，独立、见效快；
2. 层 1（澄清）：intent/classify/clarify 节点 + state；
3. 层 2（设计迭代）：DesignPlan schema + design-plan 节点 + REVISE_DESIGN 循环 + 守卫 + 路由；
4. 层 2（预览反馈）：preview-review 阶段 + CONFIRM_BUILD 落地 + 预览反馈路由；
5. 全量测试 + 真实 LLM 走查（监控大屏需求：澄清→设计计划迭代→确认→方案→批准→构建→预览反馈→落地）。

## 12. 验收标准

- 输入"生成一个监控大屏"：必先澄清（≥1 轮追问）才出设计计划；设计计划含布局/风格/分区/控件清单；确认后才生成控件方案；
- 澄清轮次 ≤5；needsClarification 无 question 时优雅失败（INVALID_MODEL_OUTPUT，不展示空追问）；
- 设计迭代：REVISE_DESIGN 可反复修订设计计划（v1→v2...），修订后使用最新 designPlanHash；无已确认设计计划时 plan-change 拒绝进入；
- 预览反馈：构建后进入 preview-review，可 REVISE_DESIGN（大改重建）/ MODIFY_REQUIREMENT（增量重建）/ CONFIRM_BUILD（落地 stage=done）；
- 全量测试、typecheck、lint 绿；DeepSeek 真实链路走查通过（沿用 MODEL_PORT_MODE=deepseek）；
- 跨平台约束保持（node:path、无平台专属 API）。
