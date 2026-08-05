# KingFusion 解决方案开发 Agent 第一版设计

日期：2026-08-05
状态：待用户审查（v5.1：加入 SDB 样本提取方法与开放式 Domain Registry）

## 1. 结论

第一版建设一个部署在公司服务器上的、多租户 KingFusion 解决方案开发 Agent。外部客户登录 Web 应用后，可以：

1. 通过持续自然语言对话新建一个 KF 客户端工程；
2. 上传 KF 原生客户端工程 `.gz`，在保留未知字段及人工修改的前提下继续修改；
3. 先查看设计、变更计划、页面预览和验证报告，再确认构建；
4. 下载可由 KF 原生开发界面直接导入的客户端工程 `.gz`。

第一版不安装客户侧服务、不连接客户机、不配置客户公网 IP、不在线写入或发布运行态。

产品、数据模型、LangGraph 顶层工作流、版本和制品模型从第一天按“完整 KF 解决方案”设计；第一版只实现客户端 `Domain Pack`。计算、数据源、采集、告警及以后发现的其他工程类型通过开放式 Domain Registry 注册，并以新的 Domain Pack 和 LangGraph Subgraph 接入。

核心架构原则：

> Agent 决定做什么；LangGraph 决定何时做；确定性 KF Build Engine 准确地生成、修改、验证和打包工程。

## 2. 第一版范围

### 2.1 包含

- 本地账号体系：平台管理员、客户管理员、普通用户；
- 客户租户隔离；
- 管理员开户，无自由注册；
- 长期会话和工程 Workspace；
- 单 Conversation Agent；
- LangGraph 持久化工作流、用户确认中断和恢复；
- 客户端工程从零新建；
- KF 原生客户端 `.gz` 上传、解析和无损修改；
- 页面、控件、工程变量 Tag、全局/事件脚本；
- 设计确认、变更确认和删除确认；
- 页面预览、工程结构、差异和验证报告；
- 不可变工程 Revision；
- KF 原生客户端 `.gz` 成果包下载；
- 审计日志、私有制品存储和后台构建任务。

### 2.2 不包含

- 客户侧 `kf-connector`；
- 访问客户公网 IP；
- 在线读取、写入、备份或回滚客户 KF；
- 发布、部署、启动或运行态验收；
- 计算、数据源、采集、告警及其他非客户端工程的实际生成与修改；
- 多 Agent；
- 自由注册、短信/邮件验证、自助找回密码；
- 多 KF 版本兼容矩阵；
- Redis、微服务拆分和 Kubernetes；
- gauge/trend 等尚未完成原生结构实证的复杂工业控件。

## 3. 已实证的 KF 基础

| 事实 | 设计影响 |
|---|---|
| KF 客户端工程由 `project.json`、页面、Tag、脚本等 JSON/资源文件组成 | 可以构建确定性工程编译器 |
| `saveProjectData` 可将请求体原样写入指定工程文件，服务端零 schema 校验 | 合法性必须由 Agent 平台自己的编译器和验证器保证 |
| 页面 JSON 由 `pageProperty`、`objects[]`、GUID、类型和链接等组成 | Agent 不应直接自由生成页面 JSON |
| 前端控件库包含 49 个控件类及构造器默认字段；`uiModelType` 已枚举至 0–53 | 可从 KF 开发态代码提取控件模板库 |
| 客户端原生导出生成扩展名 `.gz` 的 ZIP 容器，内容为工程目录 | 公司侧可以复刻 KF 原生打包格式 |
| 客户端原生导入会解包、检查目录并重建部分工程元数据 | 成果包必须通过 KF 原生导入往返测试 |
| 计算、数据源、采集模块各自拥有独立的导入/导出和目录规则 | 后续必须分别实现 Domain Pack，不能用一个通用压缩函数代替 |
| `Center/sdb` 已包含客户端、计算、数据源、采集和告警真实工程 | 可以建立跨领域的真实序列化样本库，但必须先脱敏 |

详细证据见：

- `docs/kf-api-notes.md`
- `docs/kf-control-schema.md`
- `KingFusion3.6_Center/kingdevopscenter/kingclient/exe/lib/services/childProcess/fileoperation.js`
- `KingFusion3.6_Center/kingdevopscenter/kingcalculation/exe/lib/services/dataStore.js`

### 3.1 现有 SDB 样本基线

对 `KingFusion3.6_Center/sdb` 的只读结构盘点结果：

| KF 存储模块 | 工程数量 | 体量 |
|---|---:|---:|
| `kingclient` | 32 | 约 6.2 GB |
| `kingcalculation` | 17 | 约 179 MB |
| `kingdbconnector` | 33 | 约 136 KB |
| `kingioserver` | 20 | 约 120 MB |
| `kingalarm` | 5 | 约 184 KB |

`filestation` 中还存在计算、数据源、客户端、告警和采集模块的导入/导出目录，可用于核对原生工程包格式。

这些工程属于只读原始语料，可能含客户名称、设备地址、数据库连接、密码、脚本和大体积素材，不进入 Git、不直接作为模型训练数据，也不直接成为公开测试夹具。

样本分三层保存：

```text
raw-corpus/          原始 SDB 工程；受限访问、只读、不入 Git
sanitized-golden/    脱敏后的代表性工程；用于私有集成测试
fixtures/            最小化安全样本；可以进入代码仓库
```

### 3.2 Domain Pack 四层取证方法

每个工程类型都必须由四层证据共同定义：

```text
L1 开发态源码：默认模板、枚举、模型、API、持久化和打包逻辑
L2 Center/sdb：真实目录、字段组合、引用关系和复杂结构
L3 原生导出包：用户实际上传和下载的容器与目录格式
L4 测试服务器：导入 → 打开 → 保存 → 导出 → 再导入
```

只有通过 L4 的具体能力才能在 Domain Registry 中标记为 `supported: true`。

标准提取循环：

1. 沿 `createProject → edit/save → exportProject → importProjects` 跟踪源码；
2. 在原生编辑器创建空工程和单特性工程；
3. 将空工程与单特性工程做结构差异分析；
4. 用 SDB 真实工程补充复杂字段和引用组合；
5. 定义领域 IR、命名规则和引用规则；
6. 实现 Importer、Inspector、Compiler、Patcher、Validator 和 Native Packager；
7. 在测试服务器完成原生往返验证；
8. 固化脱敏 Golden Sample 和自动回归测试。

开发 `kf-schema-extractor` 作为只读研发工具，负责工程清单、JSON 字段路径与类型统计、样本差异、引用分析、敏感信息扫描和脱敏。自动提取结果只是 Schema 候选，必须结合源码语义和测试服务器结果人工确认。生产 Agent 不动态解析 KF 开发态源码，也不携带完整 KF 源码。

## 4. 总体架构

```text
浏览器
  │
  ▼
Vue Web
  │ HTTPS / SSE
  ▼
NestJS API
  ├─ Auth / Tenant / Session
  ├─ Workspace / Conversation / Revision
  ├─ Artifact / Audit
  └─ Agent Orchestrator
       │
       ▼
  LangGraph SolutionGraph
       ├─ 单 Conversation Agent
       ├─ Client Subgraph（第一版启用）
       └─ Domain Registry
              │
              ▼
PostgreSQL + 私有制品存储 + Build Worker
                                  │
                                  ▼
                             KF Build Engine
                             ├─ Importer
                             ├─ Inspector
                             ├─ Compiler
                             ├─ Patcher
                             ├─ Validator
                             ├─ Preview
                             └─ Native Packager
```

采用模块化单体代码库；API 和 Worker 是两个进程，使用同一 PostgreSQL 和私有制品存储。第一版不拆微服务。

### 4.1 技术栈

- 前端：Vue 3、TypeScript、Vite；
- API：Node.js LTS、TypeScript、NestJS；
- 数据库：PostgreSQL；
- ORM：Prisma；
- Agent 工作流：LangGraph JS `StateGraph`；
- LangGraph 持久化：PostgreSQL Checkpointer；
- LLM：可配置的 OpenAI 兼容 Provider，默认可使用 DeepSeek；
- 流式回复：SSE；
- 后台构建：数据库任务表 + 独立 Worker + 任务租约；
- 文件存储：第一版使用服务器私有目录，通过 `ArtifactStorage` 接口访问；
- 部署：Docker Compose。

## 5. 代码边界

```text
agent-app/
├─ apps/
│  ├─ web/
│  ├─ api/
│  └─ worker/
├─ packages/
│  ├─ auth/
│  ├─ tenant/
│  ├─ conversation/
│  ├─ workspace/
│  ├─ artifact-storage/
│  ├─ agent-orchestrator/
│  ├─ solution-ir/
│  ├─ domain-registry/
│  ├─ domain-client/
│  │  ├─ graph/
│  │  ├─ prompts/
│  │  ├─ ir-schema/
│  │  ├─ importer/
│  │  ├─ inspector/
│  │  ├─ compiler/
│  │  ├─ patcher/
│  │  ├─ validator/
│  │  ├─ preview/
│  │  └─ native-packager/
│  └─ audit/
└─ prisma/
   └─ schema.prisma
```

KF Build Engine 不依赖 HTTP、登录、Vue、LLM 或 LangGraph，核心接口可以直接单测：

```ts
importClientPackage(file)
inspectClientProject(workspace)
compileClientProject(projectIR)
applyClientPatch(workspace, changePlan)
validateClientProject(workspace)
packageClientProject(workspace)
```

## 6. 解决方案与 Domain Pack

### 6.1 顶层模型

Workspace 从第一版起即代表一个 KF 解决方案，而不是单一客户端工程：

```ts
type DomainKind = string;

type SolutionWorkspace = {
  id: string;
  tenantId: string;
  name: string;
  currentRevisionId?: string;
  projects: DomainProjectRef[];
};
```

第一版创建的解决方案只有一个客户端工程：

```json
{
  "schema": "kf-solution-ir/v1",
  "name": "水泵站监控解决方案",
  "projects": [
    {
      "id": "pump-client",
      "kind": "kingclient",
      "name": "水泵站客户端"
    }
  ]
}
```

### 6.2 Domain Registry

```ts
interface DomainPack {
  kind: DomainKind;
  displayName: string;
  supported: boolean;
  capabilities: {
    create: boolean;
    import: boolean;
    modify: boolean;
    validate: boolean;
    package: boolean;
  };
  graph: CompiledSubgraph;
  importer: DomainImporter;
  compiler: DomainCompiler;
  patcher: DomainPatcher;
  validator: DomainValidator;
  packager: DomainPackager;
}
```

DomainKind 使用 KF 模块标识，例如 `kingclient`、`kingcalculation`、`kingdbconnector`、`kingioserver`、`kingalarm`。顶层数据模型不维护封闭枚举；具体工程类型、显示名称和能力由注册表声明。

第一版只注册完整的 `clientDomainPack`（`kind: "kingclient"`）。其他已知工程类型只注册 `supported: false` 的能力元数据，不创建虚假的编译器或空实现。

用户提出尚未支持的计算、数据源、采集、告警或其他领域需求时，系统：

1. 保存完整解决方案需求；
2. 明确说明当前不可构建的部分；
3. 将其保存为 `pendingRequirements`；
4. 只在用户确认后生成当前可支持的客户端部分；
5. 不伪造无法验证的工程包。

## 7. 单 Agent + LangGraph

### 7.1 为什么不是多 Agent

第一版只有客户端 Domain Pack。需求理解、工程设计、变更规划和错误解释由一个 Conversation Agent 在不同节点使用不同结构化输出完成。页面、变量和脚本之间存在强引用关系，多个自治 Agent 会增加不一致、调试和成本问题。

### 7.2 SolutionGraph

```text
收到用户消息
→ 加载 Workspace / 当前 Revision / 活动 ChangeRequest
→ 识别意图
   ├─ 普通问答 → 回答后结束本轮
   ├─ 新需求/修改需求 → 生成或更新计划
   ├─ 确认 → 校验 planHash
   ├─ 取消 → 关闭 ChangeRequest
   └─ 回退 → 生成回退 ChangeRequest
→ 确定性检查计划
→ 生成差异与预览
→ interrupt 等待用户确认
→ 冻结计划
→ 创建幂等 Build Job
→ Worker 构建与验证
→ 成功创建新 Revision 和工程包
→ 等待下一条需求
```

LangGraph `thread_id` 使用 `conversationId`。Graph State 只保存小型执行状态和业务实体 ID：

```ts
type AgentGraphState = {
  tenantId: string;
  userId: string;
  workspaceId: string;
  conversationId: string;
  currentRevisionId?: string;
  activeChangeRequestId?: string;
  changePlanId?: string;
  planHash?: string;
  buildJobId?: string;
  intent?: string;
  stage: string;
  recentMessages: Message[];
  conversationSummary?: string;
  lastErrorCode?: string;
};
```

完整工程包、工程目录和页面 JSON 不进入 Graph State，只在私有制品存储中保存，并通过 ID 引用。

### 7.3 持久化职责

```text
LangGraph Checkpoint：工作流执行到哪里
PostgreSQL 业务表：用户、租户、工程、变更计划和版本是什么
Artifact Storage：原始包、工作区、预览和成果包在哪里
```

Checkpoint 不是业务数据库。删除 Checkpoint 不能删除工程 Revision；重放 Graph 也不能重复创建同一个 Revision。

### 7.4 用户确认

`interrupt()` 返回包含 `changeRequestId`、`planHash`、摘要和预览地址的确认请求。恢复时必须比较 `planHash`。用户确认后如果需求或计划发生任何变化，原确认失效，必须重新确认。

中断节点前不执行不可重复副作用。创建 Build Job、Revision 和 Artifact 使用幂等键。

## 8. 长期对话与变更版本

一个 Solution Workspace 可以长期对话。每个成功构建产生一个不可变 `SolutionRevision`；第一版其中只有一个客户端 `ProjectRevision`。

```text
SolutionRevision 1：初始客户端工程
SolutionRevision 2：增加出口压力
SolutionRevision 3：修改按钮颜色
SolutionRevision 4：增加报警页面
```

每条用户消息先归类为：

- `QUESTION`
- `NEW_REQUIREMENT`
- `MODIFY_REQUIREMENT`
- `CONFIRM_PLAN`
- `CANCEL_PLAN`
- `ROLLBACK`
- `BUILD`

规则：

- 普通问题不改变工程；
- 确认前的新要求合并到当前 ChangeRequest，并使旧确认失效；
- 构建开始后输入冻结；构建期间收到的新需求进入待处理 ChangeRequest；
- 构建成功后，新需求以最新 Revision 为基础；
- 回退不会删除历史，而是创建内容基于历史版本的新 Revision；
- 一个 Workspace 同一时刻只允许一个 Build Job 和一个主要活动 ChangeRequest；
- 会话上下文由最近消息、滚动摘要和当前 Revision 的结构化工程摘要组成；工程事实永远从 Revision/索引读取，而不是依赖聊天摘要。

## 9. 新建工程流程

```text
用户描述需求
→ Agent 澄清
→ 输出结构化 ProjectDesign
→ 确定性检查
→ 页面预览和工程结构
→ 用户确认
→ 转换为 ClientProjectIR
→ Client Compiler 生成工程目录
→ Validator 校验
→ Native Packager 生成原生 .gz
→ 创建 Revision、验证报告和下载制品
```

LLM 不直接生成最终页面 JSON。它输出受 Schema 约束的设计和 IR；控件完整字段由模板库和确定性编译器生成。

## 10. 上传工程修改流程

```text
用户上传 KF 原生客户端 .gz
→ 上传安全检查
→ Client Importer 解包
→ 保存只读 Source Revision
→ Inspector 建立页面/控件/变量/脚本/GUID 索引
→ 生成 Agent 可读的工程摘要
→ 用户持续对话提出修改
→ Agent 输出 ChangePlan
→ 展示字段级差异和预览
→ 用户确认
→ Patcher 从原始工作区复制候选工作区
→ 只应用已确认字段级 Patch
→ Validator 校验变更范围和工程完整性
→ Native Packager 生成新 .gz
```

### 10.1 无损工作区

```text
workspace/
├─ source/             原样解包的上传工程，只读
├─ index.json          页面、控件、变量、脚本和 GUID 索引
├─ normalized-ir.json  Agent 可理解的规范化视图
├─ changes.json        已确认的字段级变更
└─ candidate/          从 source 复制并应用 Patch 的候选工程
```

修改原则：

- 未识别文件和字段原样保留；
- 使用 KF GUID 定位实体，名称只作为辅助匹配；
- 新增对象由编译器生成完整模板；
- 更新对象只修改计划中列出的字段；
- 删除必须单独确认；
- 不重新生成整个页面来完成局部修改；
- 验证器确认计划外的文件和字段未改变。

## 11. 客户端工程 IR 与模板

ClientProjectIR 覆盖：

- 工程属性；
- 页面和页面分组；
- 控件布局、样式、绑定和事件；
- 变量组与变量 Tag；
- 全局脚本和控件事件脚本；
- 页面引用和资源依赖。

第一版控件范围以已实证的控件枚举和模板为准，优先实现：

- text / textbox；
- button；
- input / inputnumber；
- switch；
- checkbox / radio；
- select / combobox；
- image；
- tabs；
- table；
- richtext；
- spacer。

控件模板来自 KF 开发态代码中的 `kmui_*.js` 构造器默认字段、`KMUIModelBase` 公共字段和已有工程页面 JSON。新增控件通过增加模板、IR Schema、映射和测试完成，不让 LLM猜测未知字段。

脚本第一版作为受限制能力：默认优先使用动作 DSL/模板；自由脚本文本只做静态分析、从不在 Agent 服务器执行，并在最终构建前单独展示。

## 12. 原生工程包

客户端成果文件必须复刻 KF 原生导出行为：

- 扩展名 `.gz`；
- 实际容器为 ZIP；
- 目录内容与 KF 客户端工程目录一致；
- 不添加会影响 KF 导入的自定义文件；
- Agent 自己的 manifest、IR 和报告作为独立制品保存，不写入原生 `.gz`，除非实测确认 KF 会安全忽略。

下载结果包括：

```text
水泵站客户端_Agent修改_20260805.gz
validation-report.json
diff-report.json（修改已有工程时）
```

第一版暂不生成解决方案总包；数据模型保留 `solution-package` Artifact 类型。后续多 Domain Pack 上线时，总包包含 manifest 和各 KF 原生子工程包，但总包本身不直接导入 KF。

## 13. 用户、租户与权限

角色：

- `platform_admin`：创建客户租户和首个客户管理员、管理系统；
- `tenant_admin`：管理本客户用户和工程；
- `member`：使用 Agent、上传、生成和下载本客户工程。

开户流程：

1. 部署时创建首个平台管理员；
2. 平台管理员创建客户租户和客户管理员；
3. 系统生成一次性临时密码；
4. 首次登录强制修改密码；
5. 客户管理员创建或重置本客户成员密码。

安全要求：

- 密码使用 Argon2id 哈希；
- 使用服务端 Session 和 `HttpOnly`、`Secure`、`SameSite` Cookie；
- 修改密码后注销其他 Session；
- 登录失败限流和临时锁定；
- 所有业务表带 `tenant_id`；
- 访问 Artifact 时同时检查用户和租户；
- 不提供永久公开下载地址；
- 平台管理员查看客户工程也记录审计事件。

## 14. 核心业务实体

```text
Tenant
└─ User
   └─ SolutionWorkspace
      ├─ Conversation
      │  └─ Message
      ├─ ChangeRequest
      │  └─ ChangePlan
      ├─ SolutionRevision
      │  └─ DomainProjectRevision
      ├─ BuildJob
      ├─ Artifact
      ├─ ValidationReport
      └─ AuditLog
```

Artifact 类型：

- `source-package`
- `domain-package`
- `solution-package`
- `preview`
- `validation-report`
- `diff-report`

## 15. 后台任务

构建任务状态：

```text
QUEUED → RUNNING → VALIDATING → SUCCEEDED
                         └────→ FAILED
```

任务规则：

- PostgreSQL 保存任务、租约、尝试次数和幂等键；
- Worker 领取任务时设置租约，租约过期后可被其他 Worker 恢复；
- 同一 Workspace 只允许一个构建任务；
- 任务输入引用已冻结的 `planHash` 和 `baseRevisionId`；
- 重试不得创建重复 Revision 或重复 Artifact；
- 构建目录先写临时候选目录，成功后原子标记为成果；
- LLM 调用失败和 Build 失败分开记录。

## 16. 错误处理

标准错误码：

- `UPLOAD_INVALID`
- `PACKAGE_UNSUPPORTED`
- `PACKAGE_UNPACK_FAILED`
- `PROJECT_PARSE_FAILED`
- `MODEL_OUTPUT_INVALID`
- `BUILD_FAILED`
- `PATCH_CONFLICT`
- `VALIDATION_FAILED`
- `PACKAGE_BUILD_FAILED`
- `STORAGE_FAILED`

失败时原始上传包和历史成功 Revision 不变。每次重试创建新的候选构建记录，不在失败目录上继续写。用户看到可理解的原因和修复建议；详细堆栈只进入内部日志。

## 17. 上传与模型安全

上传包视为不可信输入。解包器必须限制：

- 路径穿越；
- ZIP 炸弹和异常压缩率；
- 总大小、单文件大小和文件数量；
- 绝对路径、软链接和设备文件；
- 可执行文件；
- JSON 大小、深度和解析时间；
- 非法文件名和编码。

工程中的页面文本、脚本和注释一律视为数据，不能作为模型指令。LLM 只接收经过 Inspector 选择和转义的结构化摘要。

LLM 不能直接：

- 读写服务器文件；
- 解压工程包；
- 执行脚本；
- 修改任意 JSON；
- 创建任意下载文件；
- 访问其他租户数据。

## 18. 确定性验证

验证分六层：

1. 包结构：容器、必要目录和文件；
2. JSON Schema：页面骨架、控件必填字段、GUID 和类型；
3. 引用完整性：变量、脚本、素材、页面跳转目标；
4. 业务规则：命名、坐标尺寸、GUID 唯一性；
5. 变更范围：计划全部执行，计划外内容未改变；
6. 打包往返：成果 `.gz` 再次解包后与打包前候选工作区一致。

只有确定性 Validator 可以给出 `pass/fail`。LLM 只负责解释验证报告。

## 19. 测试与发布门槛

### 19.1 单元测试

- 控件模板合并；
- GUID 生成和保留；
- ClientProjectIR → KF JSON；
- 页面字段级 Patch；
- 未识别字段保留；
- 引用检查；
- `.gz` 打包与解包；
- planHash 和幂等行为。

### 19.2 集成测试

- 自然语言设计结果转换为合法 IR；
- 新建工程完整构建；
- 上传已有工程并增加控件；
- 上传已有工程并修改控件属性；
- 用户人工字段不被覆盖；
- 未确认删除被拒绝；
- 多 Revision、回退和重新构建；
- 构建期间新需求进入待处理 ChangeRequest；
- 不同租户无法访问彼此数据和制品。

### 19.3 安全测试

- 路径穿越和 ZIP 炸弹；
- 恶意脚本和提示词注入文本；
- 越权下载；
- Session 失效和暴力登录；
- 文件名、工程名和 JSON 注入。

### 19.4 KF 实机验收

```text
生成 .gz
→ KF 原生开发界面导入
→ 打开工程和页面
→ 检查控件、变量和脚本
→ 保存工程
→ KF 原生导出
→ 再次导入
```

第一版发布必须同时满足：

- 新建工程可稳定原生导入；
- 上传修改成果可稳定原生导入；
- 未涉及内容无丢失；
- KF 编辑器可以打开、保存、导出并再次导入；
- 静态验证、租户隔离和权限测试通过。

## 20. 实施阶段划分

### Phase 0：KF 客户端格式固化

- 建立 raw-corpus、sanitized-golden、fixtures 三层样本治理；
- 开发只读 `kf-schema-extractor`；
- 从 32 个现成客户端工程中选择最小、典型、复杂和压力样本；
- 提取页面骨架、公共字段和首批控件模板；
- 固化客户端原生 `.gz` 目录和打包规则；
- 准备匿名化的最小、典型和复杂客户端工程 Golden Samples；
- 在测试服务器完成 KF 导入—导出往返基线。

### Phase 1：确定性 KF Build Engine

- Importer / Inspector；
- ClientProjectIR；
- Compiler / Patcher；
- Validator / Native Packager；
- 单元和 KF 实机集成测试。

### Phase 2：多租户 Agent 应用

- Auth / Tenant / Session；
- Workspace / Artifact / Revision；
- Vue Web；
- LangGraph SolutionGraph 和 Client Subgraph；
- 对话、设计确认、构建、下载和审计。

### Phase 3：质量与试点

- Golden Sample 回归；
- 提示词与结构化输出评测；
- 安全测试和数据清理策略；
- 小范围客户试点。

### 后续 Domain Pack

依次实证并增加：

1. Calculation Domain Pack；
2. DataSource Domain Pack；
3. Acquisition Domain Pack；
4. Alarm Domain Pack；
5. 由 SDB 和产品能力继续发现并注册其他 Domain Pack；
6. 跨工程 Symbol Registry、依赖验证和解决方案总包；
7. 当多个领域 IR、编译器和评测均稳定后，再评估 Supervisor + 受限 Domain Agents。

## 21. 关键决策摘要

1. 第一版是纯离线、多租户 Web Agent，不连接客户机；
2. 第一版只交付客户端工程能力；
3. 产品和顶层模型按完整 KF 解决方案预留，工程类型由开放式 Domain Registry 注册；
4. 使用 LangGraph，但采用单 Agent 有状态工作流，不使用多 Agent；
5. LLM 输出设计和变更计划，不能直接生成或修改工程文件；
6. 新建工程使用确定性 Compiler；上传工程使用无损 Patcher；
7. 每次确认构建产生不可变 Revision；
8. 原生 `.gz` 是必须通过 KF 导入往返验收的正式成果；
9. 只有确定性 Validator 决定工程是否通过；
10. 后续工程类型通过“源码 + SDB + 原生包 + 测试服务器”取证并以 Domain Pack + Subgraph 扩展。
