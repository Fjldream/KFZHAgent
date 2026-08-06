# KF Solution Agent 对话全链路"温和专业"化设计

日期：2026-08-06
状态：已获用户批准（语气=温和专业风、范围=全链路）

## 1. 背景与问题

用户实测对话后反馈：AI 回复"太骨感"——澄清追问干瘪（无序号选项、无礼貌语），整体像机器输出而非客服/顾问真人沟通。用户希望 AI "更灵动、更贴近客服真人对话，试图去理解客户需求"。

## 2. 决策（用户确认）

- **语气基调**：温和专业风（礼貌但克制）——不用 emoji、不用语气词（呀/哦/呢），用「您好」「请」「您可以」等礼貌表达。
- **范围**：全链路回复——澄清追问、设计计划展示、构建完成提示、确认落地、普通问答全部覆盖。

## 3. 改动点

### 3.1 澄清追问（DeepSeek classifyIntent prompt + clarify 节点）

**deepseek-model.ts classifyIntent userPrompt** 澄清规则升级：
- 问题格式：`您好，为了帮您把方案做得更贴合需求，先确认一下：<具体问题>。请选择或直接告诉我。`
- **options 必须带序号**（①②③④⑤，最多 5 个），选项简短具体（如 `① 生产车间监控`）。
- reply 用礼貌、专业的客服语气（覆盖普通问答）。
- 现有澄清判定（信息不足必 CLARIFY、一次一维、禁止猜测）保持不变。

**clarify 节点**（nodes/clarify.ts）：拼接格式不变（`问题\n选项逐行`），前端 `parseClarifyingQuestion` 已支持 ①② 解析与点选——**前端零改动**。

### 3.2 设计计划展示（nodes/design-plan.ts formatDesignPlan）

- 开头：`您好，我已根据您的需求整理出一份设计草案，请您过目：`
- 结尾：`您可以随时告诉我哪里需要调整；确认没问题的话，回复「确认」即可。`

### 3.3 构建完成提示（nodes/enqueue-build.ts）

- 原：「构建完成，预览已生成；满意回复「确认落地」，或继续提修改意见。」
- 改：「预览已生成，您可以在右侧查看实际效果；满意的话回复「确认落地」，需要调整也可以直接告诉我。」

### 3.4 落地确认（solution-graph done 节点）

- done 节点新增 appendMessage（role: assistant）：「方案已确认落地。感谢您的沟通！后续如需继续调整或新增需求，随时找我。」

### 3.5 普通问答（SYSTEM_PROMPT）

- SYSTEM_PROMPT 加一条 persona 描述：`你以礼貌、专业的客服顾问口吻与客户沟通，回复简洁自然，像真人顾问在对话，避免机械罗列。`
- 所有 DeepSeek 输出（classifyIntent/designPlan/createChangePlan）共享该 persona。

## 4. 边界

- 只改**文案层**：DeepSeek prompt + clarify/design-plan/enqueue-build/done 四处节点文案。不动图路由、状态机、契约 schema。
- 前端 ConversationPanel 无需改动（parseClarifyingQuestion 已支持 ①② 序号选项）。
- design-review 阶段确认兜底（CONFIRM_DESIGN 关键词）不变。

## 5. 测试

- deepseek-model.test.ts：澄清输出用例更新/新增——mock 返回带序号 options 的 CLARIFY，断言透传；reply 礼貌语气不破坏 schema。
- design-plan.test.ts：formatDesignPlan 断言含礼貌开场与结尾引导（如已有文案断言则同步）。
- enqueue-build.test.ts / solution-graph.test.ts：构建提示文案断言同步；done 节点新增提示消息断言。
- 全仓 `pnpm test` 369+ 全绿、typecheck/lint 干净。

## 6. 验收标准

1. 新对话输入模糊需求（如"生成一个监控大屏"）→ 澄清追问为「您好，为了帮您把方案做得更贴合需求，先确认一下：…① 生产车间 ② …」格式。
2. 设计计划展示含礼貌开场与结尾引导。
3. 构建完成提示、确认落地提示为客服语气。
4. 普通问答 reply 礼貌自然。
5. 全量测试通过，真实 DeepSeek 走查一遍确认文案效果。
