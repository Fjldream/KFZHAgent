# 设计确认阶段连续沟通修复设计

## 问题

在 `design-review` 阶段，客户补充“增加产品、项目经历”等内容时，DeepSeek 会返回 `MODIFY_REQUIREMENT`。现有路由看到已经存在 `designPlanHash` 后直接进入 `plan-change`，因此跳过设计蓝图修订并弹出工程计划审批。首版设计还只使用最后一条澄清回答，容易丢失“个人简历网站”等早期主题。

## 目标行为

- 设计确认前，除明确确认外的需求补充都修订设计蓝图，生成 v2、v3，而不生成 ChangePlan。
- 对已经取消错误 ChangePlan 的旧 checkpoint，若仍有未落地设计且没有计划/构建任务，也恢复到设计修订语义。
- 只有短且明确的确认表达进入 `CONFIRM_DESIGN → plan-change → approval`。
- 首版设计提示包含当前会话中完整的最近消息和最新需求，保留初始主题及澄清答案。
- DeepSeek 意图提示列出 `CONFIRM_DESIGN`、`REVISE_DESIGN`、`CONFIRM_BUILD`，但关键阶段路由仍由确定性规则兜底。

## 实现

1. `classify-intent` 在 `design-review` 阶段保留现有短确认规则；其他 `NEW_REQUIREMENT` 或 `MODIFY_REQUIREMENT` 强制转换为 `REVISE_DESIGN`。`idle + 未落地设计 + 无计划/构建` 使用同一规则恢复旧 checkpoint。
2. `DeepSeekModelPort.classifyIntent` 的提示补齐设计与预览阶段意图。
3. `DeepSeekModelPort.createDesignPlan` 在首版和修订版提示中加入最近会话上下文；修订版继续带上一版设计。
4. 单元测试覆盖实际复现语句，并断言不会创建 ChangePlan；模型测试断言完整上下文进入请求。

## 非目标

- 不改变 ChangePlan 的人工审批要求。
- 不取消设计蓝图确认步骤。
- 不扩展当前 KingClient 控件能力。
