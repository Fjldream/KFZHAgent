# KingFusion 解决方案 Agent 演进设计

日期：2026-08-09

状态：待用户书面审查
适用范围：在现有 `agent-app` 基础上演进，不推翻现有 NestJS、Vue、PostgreSQL、LangGraph、BuildJob、Revision 和 KingClient 生成链路

## 1. 目标

第一阶段交付一个公司侧在线 Agent 应用，用户登录后可以：

1. 通过持续对话提出并澄清需求；
2. 确认结构化需求和可落地的效果蓝图；
3. 新建 KingClient 工程，或上传原生工程包后继续修改；
4. 预览、校验并下载可由 KingFusion 原生开发界面导入的工程包；
5. 对生成结果继续提出局部或整体修改，并获得新的工程版本；
6. 保留所有历史 Revision，能够比较、下载和回退，不覆盖原工程。

第一阶段不连接客户机、不部署工程、不启动运行态。系统只实际生成 `kingclient` 工程，但从数据模型、注册接口和解决方案蓝图上预留计算、数据源、采集、告警等工程领域。

长期目标是从“客户端工程生成器”演进为“完整 KingFusion 解决方案开发 Agent”。

## 2. 已确认的关键决策

1. 使用 LangGraph 管理持久化业务工作流、分支、循环、人工确认和失败恢复。
2. 第一阶段只设置两个真正的 LangChain Agent：Requirement Agent 和 Solution Architect Agent。
3. KingClient Planner 是结构化模型生成节点，不是自由 Agent。
4. Agent 只使用查询、检查和预校验类 Tool，不直接调用写 JSON、打包、保存 Artifact 或创建 Revision 的方法。
5. Worker 通过 DomainPack 生成工程；Compiler、Patcher、Validator 和 Packager 使用确定性代码。
6. `SolutionBlueprint.json` 是机器可执行的蓝图真源；`BLUEPRINT.md` 和界面展示是派生视图。
7. 需求确认和执行确认分为两道人工门禁。
8. 每次修改从指定基础 Revision 产生新 Revision，不原地覆盖。
9. 不支持的未来工程需求进入 `pendingRequirements`，必须让用户明确接受当前只生成客户端子集。
10. KingClient 控件能力由组件能力注册中心管理，不再持续扩张单一硬编码 `switch`。

## 3. 当前实现基线

现有系统已经具备：

- Vue 3 Web；
- NestJS API；
- PostgreSQL、Prisma；
- LangGraph `StateGraph` 和 PostgreSQL Checkpointer；
- 会话、BuildJob、Worker、Artifact、Revision、Audit；
- 新建与上传/修改两条 KingClient 构建路径；
- KingClient Inspector、Compiler、Patcher、Validator、Native Packager；
- 原生 `.gz` 工程包与浏览器预览；
- DomainRegistry 外壳；
- KF 开发态 Schema 提取工具和 SDB 只读取证能力。

当前主要架构缺口：

1. 模型通过自定义 DeepSeek ModelPort 直接调用兼容接口，尚未形成受限的 LangChain Agent 与 Tool 层；
2. DomainRegistry 虽能解析 DomainPack，但 BuildExecutor 仍直接硬编码 KingClient 的编译、修改、校验和打包函数；
3. 当前流程中的需求分析、设计计划和工程计划还没有统一收敛为 `RequirementSpec → SolutionBlueprint → DomainPlan`；
4. 当前只定义 12 种语义控件，且部分控件只有模板或基础几何能力；
5. 控件 Schema、编译、检查、修改、预览和原生验收的支持状态没有统一注册和发布门禁。

## 4. 总体架构

```text
浏览器 / Vue Web
  ├─ 登录、会话、需求确认
  ├─ 蓝图审查、影响范围确认
  ├─ 工程预览、校验报告
  └─ Revision 与成果包下载
             │ HTTPS / SSE
             ▼
NestJS API
  ├─ Auth / Tenant / Conversation
  ├─ LangGraph SolutionGraph
  │   ├─ Context Loader
  │   ├─ Requirement Agent
  │   ├─ Requirement Validator
  │   ├─ Requirement Approval Interrupt
  │   ├─ Solution Architect Agent
  │   ├─ Blueprint Validator
  │   ├─ Domain Planner Nodes
  │   ├─ Preflight Validator
  │   ├─ Execution Approval Interrupt
  │   └─ Build Coordinator
  ├─ Read-only Agent Tool Layer
  ├─ Domain Registry
  └─ Revision / Artifact / Audit Services
             │ BuildJob
             ▼
Worker
  └─ DomainPack
      └─ KingClientDomainPack（第一阶段唯一 supported）
          ├─ Inspector
          ├─ Component Capability Registry
          ├─ Compiler
          ├─ Patcher
          ├─ Validator
          ├─ Preview Adapter
          └─ Native Packager
             │
             ▼
KF 原生 JSON 目录 + `.gz` 工程包 + 校验报告 + Revision
```

未来只需要注册新的领域包：

```text
KingCalculationDomainPack
KingDbConnectorDomainPack
KingIoServerDomainPack
KingAlarmDomainPack
```

主工作流、确认机制、BuildJob 协议和 Artifact 管理不因领域增加而重写。

## 5. LangGraph、LangChain 与 Agent 边界

### 5.1 SolutionGraph

SolutionGraph 是唯一的持久业务流程拥有者，负责：

- 读取会话、租户、工程、Revision 和历史决策；
- 调用两个 Agent；
- 保存结构化需求和蓝图；
- 路由新建、修改、澄清和重新设计；
- 执行两次人工确认；
- 创建 BuildJob；
- 接收构建结果和结构化诊断；
- 在失败后恢复或回到规划节点。

外层 Graph 使用 PostgreSQL Checkpointer，以 `conversationId` 作为 `thread_id`。内层 Agent 默认按单次调用运行，不另建一套长期记忆，避免出现两套互相漂移的历史状态。

### 5.2 Requirement Agent

Requirement Agent 使用 LangChain `createAgent()`，负责：

- 理解当前输入和历史上下文；
- 判断新建、修改、确认、拒绝或补充需求；
- 主动提出有限、必要的澄清问题；
- 输出结构化 `RequirementSpec`；
- 根据用户反馈生成新版 RequirementSpec；
- 识别局部修改、页面级修改和方案级修改。

它不能写工程文件，也不能创建构建任务。

### 5.3 Solution Architect Agent

Solution Architect Agent 使用 LangChain `createAgent()`，负责：

- 查询 KingFusion 能力目录；
- 将已确认需求拆分为一个或多个领域工程；
- 规划工程依赖、跨领域契约和待办需求；
- 输出结构化 `SolutionBlueprint`；
- 对不支持的领域或组件明确降级，不虚构实现能力。

### 5.4 KingClient Structured Planner

KingClient Planner 不使用自由 Tool 循环。它接收已确认的需求、蓝图、当前工程摘要和已验证组件 Schema，输出：

- 新建模式：`ClientProjectIR`；
- 修改模式：`ClientChangePlan`。

输出必须通过 Zod/JSON Schema 和业务预校验。Planner 不接触临时目录和原生 KF 字段。

## 6. Tool 边界

### 6.1 提供给 Agent 的只读 Tool

```text
get_domain_capabilities
search_component_catalog
get_component_capabilities
get_component_schema
get_component_examples
inspect_current_project
list_editable_entities
search_solution_examples
validate_requirement_spec
validate_blueprint
```

Tool 必须进行租户隔离、返回字段裁剪、调用次数限制、超时、审计和敏感信息过滤。

### 6.2 不提供给 Agent 的能力

```text
write_project_json
patch_project_file
compile_project
package_project
enqueue_build
store_artifact
create_revision
delete_project
publish_or_deploy
```

这些是应用内部 Port 或 DomainPack 方法，不是 LangChain Tool。Agent 可以根据校验诊断重新规划，但不能绕开确认和 BuildJob 直接改文件。

## 7. 核心结构化契约

### 7.1 RequirementSpec

```ts
interface RequirementSpec {
  schema: "kf-requirement-spec/v1";
  mode: "create" | "modify";
  solutionName: string;
  goals: Goal[];
  functionalRequirements: FunctionalRequirement[];
  dataRequirements: DataRequirement[];
  uiRequirements: UiRequirement[];
  constraints: Constraint[];
  affectedDomains: DomainKind[];
  pendingQuestions: Question[];
  acceptanceCriteria: AcceptanceCriterion[];
}
```

RequirementSpec 通过规范化 JSON 计算 `requirementHash`。用户确认时保存确认人、时间和 Hash。

### 7.2 SolutionBlueprint

```ts
interface SolutionBlueprint {
  schema: "kf-solution-blueprint/v1";
  solution: SolutionMetadata;
  projects: ProjectBlueprint[];
  dependencies: ProjectDependency[];
  contracts: CrossDomainContract[];
  pendingRequirements: PendingRequirement[];
  acceptanceCriteria: AcceptanceCriterion[];
}
```

每个 `ProjectBlueprint` 必须包含：

- `domainKind`；
- `supported`；
- `action: create | modify | preserve | defer`；
- `baseRevisionId`（修改时）；
- 页面、模型或领域级设计摘要；
- 能力缺口和降级结果。

### 7.3 第二次确认绑定

执行确认必须绑定：

```text
blueprintHash + planHash + baseRevisionId
```

任一值变化，原确认自动失效，必须重新展示影响范围并确认。

## 8. 对话、生成和持续修改闭环

### 8.1 新建工程

```text
用户需求
  → Requirement Agent 澄清
  → RequirementSpec 校验
  → 用户确认需求
  → Solution Architect Agent 生成蓝图
  → KingClient Planner 生成 ClientProjectIR
  → Preflight
  → 用户确认蓝图和执行范围
  → BuildJob
  → KingClientDomainPack.compile
  → validate / package
  → Preview + Revision 1 + `.gz`
```

### 8.2 导入并修改

```text
用户上传 `.gz`
  → 安全解包与格式检查
  → Inspector 生成 ProjectSummary、EntityIndex、CapabilityCoverage
  → 保存不可变基础 Revision
  → 用户提出修改
  → Requirement Agent 判断影响级别
  → Planner 生成 ClientChangePlan
  → 展示增删改影响范围
  → 用户确认
  → KingClientDomainPack.patch
  → 修改范围校验、原生往返校验
  → 新 Revision + 新工程包
```

导入工程中的未知字段和暂不支持组件必须原样保留。修改模式不能把整个工程降级为当前 IR 后重新生成。

### 8.3 预览后继续修改

修改分为三类：

| 级别 | 示例 | 路由 |
|---|---|---|
| 局部细节 | 文字、颜色、位置、尺寸、绑定、小数位 | 直接生成 ChangePlan |
| 页面级 | 新增页面、重新分区、增加组件组 | 更新受影响蓝图片段后生成 ChangePlan |
| 方案级 | 新增计算工程、改变数据流、整体推翻结构 | 回到 RequirementSpec 和 SolutionBlueprint 确认 |

每次成功构建产生新 Revision。旧 Revision、Artifact、Hash 和校验报告保留，支持比较和回退。

## 9. DomainPack 设计

通用接口不使用 `workspaceId` 隐式查找领域状态，而传递明确输入和输出：

```ts
interface DomainPack<TProjectIR, TChangePlan, TWorkspace> {
  readonly metadata: DomainMetadata;

  inspect(input: InspectInput): Promise<DomainInspection>;

  compile(input: {
    projectIr: TProjectIR;
    buildSeed: string;
    workDir: string;
  }): Promise<TWorkspace>;

  patch(input: {
    baseWorkspace: TWorkspace;
    changePlan: TChangePlan;
    expectedPlanHash: string;
    workDir: string;
  }): Promise<TWorkspace>;

  validate(input: {
    baseWorkspace?: TWorkspace;
    candidateWorkspace: TWorkspace;
    changePlan?: TChangePlan;
  }): Promise<ValidationReport>;

  package(input: {
    workspace: TWorkspace;
  }): Promise<PackagedArtifact>;
}
```

BuildExecutor 只负责作业租约、状态转换、调用 DomainPack、Artifact 落库和事务提交。它不再导入任何 `domain-client` 具体函数。

## 10. KingClient 工程生成设计

### 10.1 新建路径

```text
ClientProjectIR
  → IR Validator
  → Page/Layout/Component/Binding/Event Compilers
  → Reference Resolver
  → Stable ID Factory
  → Workspace Writer
  → KF 原生目录
```

生成必须满足：

- 相同 IR 与 BuildSeed 产生字节稳定的工程；
- GUID 从稳定语义 ID 派生，不使用随机数；
- 模型不能提供原生 GUID 和任意 KF 字段；
- 模板来自经审核的开发态提取结果；
- 文件写入临时候选目录，验证成功后才保存 Artifact；
- JSON 序列化顺序稳定；
- 引用在编译阶段统一解析并校验。

### 10.2 修改路径

```text
原生基础工程
  → Inspector / EntityIndex
  → 复制到候选目录
  → 语义 ChangePlan
  → Patcher
  → Change Scope Validator
  → Native Round Trip Validator
```

Patcher 只修改确认计划覆盖的实体和字段。未知字段、未知组件、资源和用户人工配置默认原样保留。

## 11. 客户端组件能力注册中心

### 11.1 当前事实

当前 IR 定义 12 种语义控件；`spacer` 映射两个原生类型。KingClient 开发态源码约有 49 个控件类，`kmUIModeTypeEnum` 声明 39 个类型编号。当前“存在模板”不等于“完整支持”：表格、选项控件、Tabs、变量绑定等仍有能力缺口。

### 11.2 ComponentDefinition

```ts
interface ComponentDefinition<TProps> {
  type: string;
  displayName: string;
  category: ComponentCategory;
  uiModelType: number;
  semanticSchema: ZodSchema<TProps>;
  nativeTemplate: NativeTemplate;
  compile: ComponentCompiler<TProps>;
  inspect: ComponentInspector<TProps>;
  patchPolicy: ComponentPatchPolicy<TProps>;
  validate: ComponentValidator;
  preview?: ComponentPreviewAdapter;
  capabilities: ComponentCapabilities;
  evidence: ComponentEvidence;
}
```

组件统一注册：

```text
Component Catalog
Semantic Schema Registry
Native Template Registry
Compiler Adapter Registry
Inspector Adapter Registry
Patch Policy Registry
Preview Adapter Registry
Capability / Evidence Registry
```

### 11.3 动态语义校验

随着组件增加，不继续扩大一个巨型 Zod 联合。统一节点结构为：

```ts
interface ComponentIR {
  id: string;
  type: string;
  layout: Rect;
  props: unknown;
  bindings?: BindingIR[];
  events?: EventIR[];
}
```

`props` 并非任意原生字段。Registry 根据 `type` 使用对应 `semanticSchema` 校验，Compiler Adapter 再翻译成 KF 字段。模型永远不能提交原生属性包。

### 11.4 能力等级

| 等级 | 含义 | 允许行为 |
|---|---|---|
| L0 Unknown | 未识别 | 拒绝生成 |
| L1 Preserve | 可原样保留 | 导入后不触碰 |
| L2 Inspect | 可识别和展示摘要 | 允许查询 |
| L3 Common Edit | 可修改位置、尺寸、可见性等公共属性 | 受限修改 |
| L4 Semantic Create | 可用语义 Schema 新建和配置核心属性 | 允许规划生成 |
| L5 Native Verified | 通过原生导入、打开、保存、运行、导出验收 | 对用户声明完整支持 |

新建工程只使用 L4/L5。修改工程可保留 L1，L2/L3 只允许明确支持的操作。

### 11.5 组件取证和发布流水线

```text
开发态源码
  → 提取枚举、构造器、默认值、序列化白名单、属性和事件
  → 候选模板与候选 Schema
  → SDB 真实样本结构比对
  → 人工确认语义字段和安全白名单
  → 单控件 Golden 工程
  → 测试服务器导入、打开、保存、运行、导出、再导入
  → 回归测试
  → 发布 ComponentDefinition 与能力等级
```

自动提取结果不能自动进入生产。只有通过原生验收的具体能力才能标记为 L5。

### 11.6 客户端节点分类

不能把开发态所有对象都作为扁平控件：

```text
ClientPageNode
├─ StaticComponentNode
├─ LayoutNode
├─ GraphicNode
├─ ChartNode
├─ GraphicModelNode
├─ ReportNode
└─ WebContainerNode
```

布局使用嵌套树；基础图形使用 GraphicIR；图表使用受控 Chart DSL；图形模型和报表使用独立 Adapter。各类节点最终由 KingClientDomainPack 统一组合。

## 12. 控件覆盖路线

### 阶段 A：补全当前 12 种

- 补齐 select、checkbox、tabs、inputnumber、table 的语义属性落地；
- 建立统一 BindingIR、EventIR 和 StyleIR；
- 对齐 compile、inspect、patch、validate、preview；
- 按能力等级重新声明，而不是把有模板直接视为完整支持。

### 阶段 B：高频静态 UI 控件

优先增加：

```text
input、cascader、datetimepicker、dropdown、navmenu、steps、tag、timeline、
transfer、tree、upload、scale、datetime、combobox、list、treeview、
webcontainer、gantt
```

实际接入以源码注册、SDB 样本和原生验收为准；缺少序列化证据的组件不得硬接。

### 阶段 C：剩余静态 UI 控件

补齐开发态其余静态 UI 类型，并为每种控件固化单控件 Golden Sample 和原生验收记录。

### 阶段 D：复杂客户端能力

独立实现：

- 水平、垂直、停靠等布局；
- 完整表格配置 DSL；
- 趋势、折线、柱状、饼图、仪表等图表；
- 基础图形、管道和组合图形；
- 图形模型和自定义模型；
- 报表；
- 2D/3D 场景。

这些能力不通过复制一个默认 JSON 完成，而需要独立语义 IR、Compiler、Inspector、Patcher、Validator 和 Preview Adapter。

## 13. 未来领域预留

第一阶段在 DomainRegistry 注册以下元数据，但 `supported: false`：

```text
kingcalculation
kingdbconnector
kingioserver
kingalarm
```

Blueprint 可以表达这些工程及契约，例如客户端变量依赖未来计算结果，但执行计划只能包含已支持的 `kingclient`。用户必须明确接受“本次只交付客户端子集”。

未来每个领域按相同证据链实现自己的：

```text
Importer → Inspector → Planner/IR → Compiler/Patcher → Validator → Packager
```

只有当领域规划确实需要多轮自主查询时，才在 DomainPack 内增加受限 Domain Planner Agent。默认优先使用结构化 Planner 和确定性代码。

## 14. 错误处理和修复循环

所有生成和校验错误返回结构化诊断：

```ts
interface BuildDiagnostic {
  code: DiagnosticCode;
  phase: "plan" | "preflight" | "compile" | "patch" | "validate" | "package";
  entityId?: string;
  path?: string;
  message: string;
  repairHint?: string;
  retryable: boolean;
}
```

处理规则：

- 模型输出 Schema 错误：有限次数自动修复，超限后向用户说明；
- 不支持组件：回到蓝图，替换、降级或记录 pending；
- Patch 冲突：重新读取最新基础 Revision 并重新规划，不能强行覆盖；
- planHash/baseRevision 不匹配：确认失效；
- 校验失败：不创建成功 Revision，不推进 currentRevisionId；
- Worker 崩溃：依靠租约和幂等恢复；
- Artifact 已写但事务未提交：允许安全重试并清理孤儿 Artifact。

## 15. 安全、审计与隔离

- 所有会话、工程、Revision、Artifact、Tool 调用按 tenantId 隔离；
- Agent Tool 返回脱敏摘要，不返回客户密码、连接串和完整任意脚本；
- 上传包限制大小、路径穿越、压缩炸弹、符号链接和可执行内容；
- 模型不能生成或执行任意 JavaScript；脚本能力必须采用受限 DSL 或经人工确认的模板；
- 每次需求确认、蓝图确认、构建、下载和回退写审计日志；
- 原始 SDB 只读、受限、不进入 Git、不直接进入模型上下文；
- 测试样本分为 raw corpus、sanitized golden 和 repository fixture。

## 16. 迁移策略

采用渐进迁移，不一次性重写：

1. 先定义新版结构化契约，并通过适配器兼容当前 ModelPort 输出；
2. 将 Requirement Agent 和 Solution Architect Agent 作为 LangGraph 节点接入；
3. 保持现有 BuildJob 数据和 API，可先增加兼容字段；
4. 实现 `KingClientDomainPack`，把现有生成函数原样下沉；
5. 修改 BuildExecutor，使其只依赖 DomainPack；
6. 引入 Component Registry，先注册当前 12 种，不立即改变生成结果；
7. 逐个补齐组件能力和验收；
8. 最后删除旧的硬编码调用和重复 Schema 路径。

每一步都应保持现有新建、上传修改、预览和下载链路可运行。

## 17. 测试策略

### 17.1 Agent 与 Graph

- RequirementSpec 结构化输出；
- 信息不足时澄清循环；
- 两次确认及 Hash 失效；
- 对话恢复和并发输入；
- 局部、页面级、方案级修改路由；
- unsupported domain 子集确认；
- Agent Tool 权限和调用上限。

### 17.2 DomainPack

- BuildExecutor 不引用具体领域包；
- compile/patch/validate/package 顺序；
- 幂等重试；
- 失败不推进 Revision；
- Artifact 和数据库事务一致性。

### 17.3 组件

每个达到 L4/L5 的组件至少包含：

- semanticSchema 正反例；
- 编译 Golden JSON；
- Inspector 往返；
- Patcher 允许与禁止字段；
- 未知字段保留；
- Preview 快照；
- 原生导入、打开、保存、运行、导出、再导入验收记录。

### 17.4 端到端

- 从模糊需求到蓝图确认和工程下载；
- 上传现有工程后局部修改；
- 预览不满意后连续生成多个 Revision；
- 回退旧 Revision；
- 工程含未知组件时保持不丢失；
- 蓝图含未来领域时正确提示只交付客户端子集。

## 18. 第一阶段验收标准

1. 用户必须先看到可读的 RequirementSpec，并能反复修改后确认；
2. 用户必须看到页面结构、组件、绑定、交互、工程范围和能力缺口蓝图；
3. 未确认 RequirementSpec 不得生成执行计划；
4. 未确认 `blueprintHash + planHash + baseRevisionId` 不得创建 BuildJob；
5. 能新建已支持范围内的 KingClient 工程并下载原生包；
6. 能上传原生工程、识别可编辑实体并生成局部修改版本；
7. 用户可在预览后继续对话修改，成功后产生新 Revision；
8. 旧 Revision 不被覆盖，可下载和回退；
9. 未知字段和未支持组件在修改流程中不丢失；
10. BuildExecutor 通过 KingClientDomainPack 执行，不硬编码领域函数；
11. 组件目录展示真实能力等级，Planner 只新建 L4/L5 组件；
12. 第一阶段不调用客户机、不部署、不声称未来领域已完成。

## 19. 非目标

第一阶段不包含：

- 客户公网 IP 和客户机服务；
- 在线导入客户 KF；
- 发布、部署、启动或运行态验收；
- 计算、数据源、采集、告警工程的实际生成；
- 一次性完整支持所有客户端控件、图表、图形模型和 3D；
- 让 Agent 直接操作文件系统或执行任意脚本；
- 多模型自动仲裁、复杂 Agent 群或每种控件一个 Agent；
- 多 KF 版本兼容矩阵。

## 20. 结论

本设计在现有系统上形成三个稳定闭环：

```text
需求闭环：对话 → 澄清 → RequirementSpec → 用户确认
设计闭环：SolutionBlueprint → 预校验 → 用户确认 → 可执行计划
工程闭环：BuildJob → DomainPack → Preview/Artifact → 对话修改 → 新 Revision
```

同时以 DomainPack 预留完整解决方案能力，以 Component Capability Registry 解决客户端开发态组件数量大、结构差异大和持续演进的问题。Agent 负责理解和规划，确定性生成器负责工程正确性，人工确认负责最终业务授权。
