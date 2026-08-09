# KingFusion 解决方案 Agent 交付路线图

设计依据：`docs/superpowers/specs/2026-08-09-kf-solution-agent-evolution-design.md`

## 拆分原则

总体设计包含领域构建、组件能力、Agent 工作流、用户验收和未来工程类型五个可以独立评审的子系统。实施时不使用一次性大改，而按下列计划逐批交付；每批保持现有新建、上传修改、预览和下载链路可运行。

## 批次顺序

### 批次 1：领域构建基础

详细计划：`2026-08-09-kf-domain-build-foundation.md`

交付结果：

- 明确通用 DomainPack 执行契约；
- 建立真实 `KingClientDomainPack`；
- BuildExecutor 不再导入 `@kf/domain-client`；
- Worker 注册真实领域包和未来领域元数据；
- 现有 KingClient 构建行为保持不变。

这是后续所有工程类型的基础，必须最先完成。

### 批次 2：客户端组件能力注册中心

独立计划范围：

- `ComponentDefinition`、能力等级和证据模型；
- Component Catalog 与只读查询接口；
- 将当前 12 种语义控件迁移到 Registry；
- Compiler、Inspector、Patcher、Validator、Preview 从 Registry 解析组件；
- 迁移期间不增加新控件、不改变现有工程格式。

验收结果：当前 12 种控件全部由统一注册中心声明；Planner 和后续 Tool 层可以读取真实能力，而不是读取硬编码列表。

### 批次 3：结构化需求与解决方案 Agent

独立计划范围：

- `RequirementSpec/v1`、`SolutionBlueprint/v1` 和 Hash 契约；
- 引入 `langchain`、`@langchain/openai`；
- Requirement Agent；
- Solution Architect Agent；
- 只读 Tool 层及租户、次数、超时和审计限制；
- LangGraph 两道确认门禁；
- 未来领域子集确认；
- 保持 DeepSeek OpenAI-compatible 接入。

验收结果：用户能够完成“澄清需求 → 确认需求 → 确认蓝图和执行范围 → 创建 BuildJob”。

### 批次 4：预览验收与持续 Revision 修改

独立计划范围：

- Preview Review 状态；
- 局部、页面级、方案级反馈分类；
- `blueprintHash + planHash + baseRevisionId` 过期确认处理；
- Revision 列表、比较、下载和回退；
- 上传工程的 editable entities 展示；
- 未知组件和字段保留报告；
- Web 端需求确认单、蓝图和修改影响范围界面。

验收结果：客户不满意时可继续对话修改，生成新 Revision，旧成果不被覆盖。

### 批次 5：当前控件能力补全

独立计划范围：

- 统一 `StyleIR`、`BindingIR`、`EventIR`；
- 补齐 select、checkbox、tabs、inputnumber、table；
- 为当前组件重新评定 L1–L5；
- 单控件 Golden Sample；
- 测试服务器原生导入、打开、保存、运行、导出、再导入验收。

验收结果：不再把“存在模板”等同于“完整支持”，界面和 Agent 只承诺真实能力。

### 批次 6：高频静态 UI 扩展

独立计划范围：

```text
input、cascader、datetimepicker、dropdown、navmenu、steps、tag、timeline、
transfer、tree、upload、scale、datetime、combobox、list、treeview、
webcontainer、gantt
```

每个组件必须经过源码提取、SDB 对照、人工审核、Golden Sample 和原生测试服务器验收。无可靠序列化证据的组件保持 unsupported。

### 批次 7：复杂客户端节点

按能力进一步拆为独立计划：

1. LayoutNode：水平、垂直、停靠布局和嵌套对象；
2. GraphicNode：基础图形、管道和组合图形；
3. ChartNode：趋势、折线、柱状、饼图和仪表 DSL；
4. GraphicModelNode 与自定义模型；
5. ReportNode；
6. 2D/3D 场景。

复杂节点不复用普通控件的扁平属性模型。

### 批次 8：未来工程领域

按领域逐一建立计划：

```text
KingCalculationDomainPack
KingDbConnectorDomainPack
KingIoServerDomainPack
KingAlarmDomainPack
```

每个领域独立完成 Importer、Inspector、IR/Planner、Compiler/Patcher、Validator、Packager 和原生验收。只有通过原生验收的领域才将 `supported` 切换为 `true`。

## 每批统一完成条件

- 使用测试先行；
- 包级测试、全量测试、typecheck 和 lint 全部通过；
- 现有用户工作区变更不被覆盖；
- 不把原始 SDB、客户数据和凭据提交到 Git；
- 不连接客户机、不发布、不部署；
- 产生独立、可回滚的提交；
- 更新能力声明和验收证据。
