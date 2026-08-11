# UI 实施主链路验收说明

## 主链路

1. 用户提出新建或修改需求。
2. LangGraph 生成并维护 `DesignPlan v2` 客户效果蓝图。
3. 客户确认蓝图后，UI 实施规划模型只生成受约束的 `UIImplementationSpec`。
4. 编排节点检查每个蓝图模块是否至少有一个可追溯组件；缺失或编译失败时只允许一次带原因的修复。
5. 现有 `compileUiImplementation()`、控件能力注册表、主题解析器和安全样式引擎确定性生成 `ChangePlan`。
6. 客户批准计划后，现有 worker 执行补丁、校验、原生工程打包、制品存储和 Revision 提交。
7. 客户继续提出修改时，流程复用上一次 `UIImplementationSpec` 和最新工程 Revision，重新生成增量计划；未纳入规格的导入工程控件不会被主动删除。

LLM 不负责生成 KF 原始 JSON、GUID、原始 CSS、JavaScript、ChangePlan 或工程压缩包。

## 自动化验收覆盖

- `implementation-plan.test.ts`：完整模块覆盖、缺失模块修复、确定性编译失败修复、失败后禁止持久化。
- `solution-graph.test.ts` / `solution-graph.integration.test.ts`：确认蓝图进入实施规划节点并到达计划审批边界。
- `graph-ports.test.ts`：生产编译端口复用既有 KingClient 编译器，并验证 KF 原生页面 GUID 前缀映射。
- `api.integration.test.ts`：七模块蓝图不能退化为单个 `Text1` 操作；客户继续修改后仍生成覆盖全部模块的更新计划。
- `job-runner.integration.test.ts`：七模块计划经过真实 worker 构建成功，解包后的原生客户端工程包含七个控件及样式字段。

## 人工验收步骤

1. 使用 `MODEL_PORT_MODE=deepseek` 启动 API，并通过环境变量提供 `DEEPSEEK_API_KEY`。
2. 新建工作区和对话，描述一个包含多个业务模块的客户端工程。
3. 检查客户效果蓝图内容，确认蓝图。
4. 在计划确认页检查操作数不再只有 `Text1`，且蓝图中的每个模块均有对应控件。
5. 批准计划，等待 worker 成功；下载工程包并在 KF 原生开发界面导入。
6. 回到同一对话提出局部修改，确认新计划只修改相关实现且没有删除无关导入控件。
7. 再次构建、下载并导入验证。

## 当前验收边界

- 本阶段只执行 `kingclient`，但领域端口和工程注册结构保留数据源、计算、采集等后续工程类型。
- 不执行客户机在线部署或自动导入。
- 不执行截图多模态视觉验收；当前预览用于结构与样式结果检查。
- 不受支持的关键控件或样式会在构建前失败并记录原因，不会静默降级为错误工程。
