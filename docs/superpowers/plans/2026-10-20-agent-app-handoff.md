# Agent App Next Handoff Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让下一模型无需前文对话即可安全接手实施、验证与交付。

**Architecture:** master是任务索引，design是唯一设计基线，阶段计划是执行步骤，本文件是动态状态与移交记录。冲突先更新设计与任务，不能只在聊天里改变实现。

**Tech Stack:** 使用仓库现有技术栈与Superpowers实施流程。

**Spec:** `docs/superpowers/specs/2026-10-20-agent-app-next-design.md`

## Global Constraints

- 不覆盖、不重置、不自动提交已有未提交修改；补丁保留原目录，只包含本任务所有新增和修改文件。
- 保留租户鉴权、审批、签名计划、制品绑定、workspace 构建串行与 stale-base 拒绝。
- 新功能默认 feature flag 关闭；先 expand 数据迁移，后灰度启用；本期不做破坏性 contract 迁移。
- 其他约束完整见design §3；每次接手必须阅读，不以本表替代。

---

## 当前交接状态（2026-10-20）

- 已完成：源代码审视、相关历史设计比对、DeepSeek缓存与视觉官方文档核查、总设计与分阶段计划。
- **2026-10-20 10:40 起进入实施**：维护者确认「沿用当前工作目录、允许本地提交、禁止推送远程」。T00 已完成并本地提交（详见 `agent-app/docs/agent-next-change-manifest.md`）。
- 未完成：T01–T27 全部实施任务；没有真实模型费用基线、完整回归或原生环境验收。
- 工作区：`/Users/fengjinlong/YK/KingFusion3.6`，包含大量用户/其他任务既有未提交修改，特别是agent-app。不能直接reset、整体format或git add全部文件。
- 下一步：执行T00，确认基线与专用测试DB，再执行T01。不要跳过成本账本先重做UI。
- 本期新增的8份文档仅是计划资料，不包含可运行的新产品功能。

## 必读资料

1. 根 `AGENTS.md`（含先格式化、改动标注、Windows补丁结构）。
2. `docs/superpowers/plans/2026-10-20-agent-app-next-master.md`。
3. `docs/superpowers/specs/2026-10-20-agent-app-next-design.md`。
4. 当前阶段p1/p2/p3/p4/p5计划，及其引用的接口前置任务。
5. P3 视觉基线：`outputs/agent-app-ui-macos-20261020/index.html`（macOS 风格工作台高保真原型；outputs 目录不进 git，缺失时向维护者索取，不得凭记忆重画）。
6. `docs/superpowers/plans/2026-08-17-kf-creative-build-integration.md`：不能破坏首建签名链。
7. `docs/superpowers/specs/2026-08-17-kf-creative-solution-generation-design.md`及同日design-knowledge/planning-retrieval/interaction计划中当前任务相关部分。

Superpowers安装路径因机器不同会变化。本机writing-plans读取路径为 `/Users/fengjinlong/.codex/plugins/cache/openai-curated/superpowers/0722921d/skills/writing-plans/SKILL.md`。执行时查找可用的executing-plans或subagent-driven-development技能并完整阅读，不能假设该本机绝对路径在其他环境存在。没有技能时报告不可用并遵循本计划TDD/复核步骤，不能声称使用了未读技能。

## 状态台账

状态枚举：NOT_STARTED / IN_PROGRESS / VERIFIED / BLOCKED_ENV / NEEDS_REVIEW。只有有测试与验收证据才是VERIFIED。

| Task | 内容 | 初始状态 | 依赖 |
|---|---|---|---|
| T00 | 基线与数据库安全 | VERIFIED（2026-10-20） | 无 |
| T01 | 模型能力/usage合同 | VERIFIED（2026-10-20） | T00 |
| T02 | 调用账本与费用 | VERIFIED（2026-10-20） | T01 |
| T03 | 网关/超时/取消 | VERIFIED（2026-10-20） | T02 |
| T04 | prompt拆分与前缀 | NOT_STARTED | T03 |
| T05 | 上下文与摘要 | NOT_STARTED | T04 |
| T06 | 预算与修复 | NOT_STARTED | T05 |
| T07 | Run/Event迁移 | NOT_STARTED | T01/T02 |
| T08 | 幂等队列与fence | NOT_STARTED | T06/T07 |
| T09 | 独立执行器 | NOT_STARTED | T08 |
| T10 | SSE/API恢复 | NOT_STARTED | T09 |
| T11 | 取消/重试/构建协调 | NOT_STARTED | T10 |
| T12 | 兼容与灰度 | NOT_STARTED | T11 |
| T13 | 会话管理API | NOT_STARTED | T12 |
| T14 | 多会话导航 | NOT_STARTED | T13 |
| T15 | 时间线与重连 | NOT_STARTED | T14 |
| T16 | 模式/附件输入 | NOT_STARTED | T15 |
| T17 | 历史交付/分叉 | NOT_STARTED | T16 |
| T18 | 安全图像上传 | NOT_STARTED | T06/T12/T16 |
| T19 | 像素分析与缓存 | NOT_STARTED | T18 |
| T20 | 控件与证据匹配 | NOT_STARTED | T19 |
| T21 | 语义编译/snapshot | NOT_STARTED | T20 |
| T22 | 图生确认流程 | NOT_STARTED | T21 |
| T23 | 局部修改 | NOT_STARTED | T22/T17 |
| T24 | 静态验证/证据分级 | NOT_STARTED | T21；验收依赖T23 |
| T25 | 原生验证 | NOT_STARTED | T24；需授权环境 |
| T26 | 评测/成本对比 | NOT_STARTED | T23/T24；runtime部分依赖T25 |
| T27 | 发布/补丁/交接 | NOT_STARTED | T26；可明确不发布T25 |

## 每任务的记录格式

复制下方字段填写实际结果，不能预先勾选计划步骤：

```text
任务：Txx
状态：IN_PROGRESS / VERIFIED / BLOCKED_ENV / NEEDS_REVIEW
执行日期与功能标注：实际日期 / Agent工作台迭代
基线：commit SHA、branch、相关dirty文件摘要
实现：新增/修改的确切仓库相对路径
红测：命令、失败原因、测试数量
绿测：命令、测试数量、通过/失败/跳过
回归：影响模块及结果
数据库：隔离DB名称（不含密码）、migration checksum、升级结果
证据：脱敏日志/截图/制品hash/报告路径
提交：自己的commit或未提交原因（混有用户改动时明确记录）
偏差：与design或计划不同之处、原因、已同步的文档
风险：仍未验证的项，是否阻断发布
下一步：下一个依赖满足的任务及具体第一条操作
```

## 接手时的只读检查

仓库根执行：

```bash
git status --short
git rev-parse HEAD
git branch --show-current
rg --files -g AGENTS.md -g package.json -g pnpm-lock.yaml -g '*agent-app*2026-10-20*'
```

agent-app内执行：

```bash
node --version
pnpm --version
rg -n 'TRUNCATE|TEST_DATABASE_URL|E2E_DATABASE_URL' apps packages tests
rg -n 'chatJson|generateSolutionImplementationPlan|buildCreativeBlueprintPrompt' apps/api/src/conversations/deepseek-model.ts
rg -n 'createClassifyIntentNode|createSolutionGraph|generationWorkflow' packages/agent-orchestrator/src apps/api/src/workspaces
```

只输出变量名/脱敏数据库名，不把.env、API key、session cookie或连接密码发进聊天。测试前按T00使用明确隔离库。

## 不得误读的历史结论

- creative-v2已经是新建workspace主线，不要实现第二套相同功能。
- module-v1“5个稳定模块”不是全部creative控件上限；以registry/adapter/实际证据为准。
- 现有confirmation有确定性快路，旧resume也存在；扩展而不是删除。
- creative关闭旧preview是明确历史设计；新原生验证不等于复活旧HTML预览。
- build-jobs已经有workspace互斥与stale-base判断；新run锁必须与之协调。
- 上传assets已实现基础安全检查；扩展参考用途与像素传输，不另建裸上传。
- 现有用户日志没有提供真实cache hit基线；计划中的-20%是实验目标，不是已验证收益。
- 暂未运行的测试和缺失的原生截图不能写“通过”。

## 需要维护者参与的决策点

这些不阻止先做离线开发，但到对应阶段必须落实：

1. T00：专用可清空测试数据库、如何保留当前dirty基线；若需新worktree，必须携带经过维护者保存的正确状态。
2. T01/T19：生产模型endpoint/model/视觉能力白名单、价格版本、租户图片外发策略；不自动换模型。
3. T25：KF原生隔离环境、运行版本、字体/viewport、测试工程和账号；未提供时native验证保持关闭。
4. T26：允许真实模型评测的样本、预算和key；离线fake不能替代实测。
5. T27：生产部署窗口、备份、迁移执行权、各flag灰度租户和保留策略；本计划不是生产操作授权。

## 停止与升级条件

遇跨租户泄露/审批绕过/制品错绑立即停相关实现并报告；不要用更宽权限解决。遇同文件用户改动无法隔离时停提交并请求基线；不要reset。遇原生能力缺失时提供受支持替代并说明，不让模型编造。遇预算不足、真实环境缺失、迁移不可兼容时停止受影响步骤，保留已验证成果，不把问题隐藏为skip。

## 可直接复制给其他模型的完整提示

> 你接手的是KingFusion3.6/agent-app的分阶段迭代实施。先阅读根AGENTS.md、docs/superpowers/plans/2026-10-20-agent-app-next-master.md、docs/superpowers/specs/2026-10-20-agent-app-next-design.md和docs/superpowers/plans/2026-10-20-agent-app-handoff.md。按台账选择第一个未完成且依赖满足的任务；本文件初始状态是全部未实施。保持现有creative-v2确定性编译/签名/构建主线，保留legacy和module-v1。不重置或整体提交当前dirty工作树；不修改其他KingFusion服务。先红测、再最小实现、绿测与回归，遵守实际日期+“Agent工作台迭代”的改动标注。所有破坏性测试先校验独立数据库；生产操作、真实模型评测和KF原生环境测试需要维护者明确提供环境与授权。每完成一任务更新台账，列实际文件、命令、测试数量、证据、偏差和下一步。没有证据不得宣称缓存降本、像素还原或原生验证通过。需要改变方案时先说明理由并同步设计文档，不另起一套架构。

## 执行方式

可以使用Superpowers子代理逐任务实施并在任务间审查，或在同一会话使用executing-plans按阶段执行。当前交付仅计划；等待用户选择实施方式或交给其他模型，不自动开始修改产品代码。

## 实施记录

```text
任务：T00
状态：VERIFIED（守卫与基线记录完成；5 条既有失败单列，不代表本轮通过）
执行日期与功能标注：2026-10-20 / Agent工作台迭代
基线：HEAD d8fdcb4（branch main）；agent-app 开工前 194 个已修改文件；本任务触碰的 10 个文件中 7 个带既有改动
实现：新增 tests/helpers/{database-safety.ts,database-safety.test.ts,vitest.config.ts}、docs/{agent-next-baseline.md,agent-next-change-manifest.md}；
      修改 tests/e2e/helpers/destructive-reset.ts 与 9 个破坏性集成测试（统一守卫 + 兜底库名改 kf_agent_test_agent_next）
红测：vitest run --config tests/helpers/vitest.config.ts → Cannot find module './database-safety.js'（1 文件加载失败）
绿测：同上 6 passed；e2e 守卫 13 passed；负向验证缺 KF_TEST_ALLOW_DESTRUCTIVE_RESET → TEST_DATABASE_NOT_AUTHORIZED 且未连库
回归：tsc -p apps/api|apps/worker|packages/build-jobs|packages/agent-orchestrator --noEmit 4/4 通过
      集成基线（隔离库）：157 通过 / 5 失败；失败项均与本轮改动无关（详见 change-manifest §4）
数据库：kf_agent_test_agent_next（新建，owner postgres）；prisma migrate deploy 全部迁移成功；本机 Postgres 16 以 pg_ctl 启动
证据：agent-app/docs/agent-next-change-manifest.md（红绿命令、逐套件结果、既有隐患 3 项）
提交：本地提交 test(agent): guard isolated integration databases；未推送远程
偏差：pnpm 不在 PATH，改用 ./node_modules/.bin/{vitest,tsc,prisma}；e2e 守卫用例不在 workspace 项目根内，用临时配置单独验证
风险：①空库先跑 api.integration 必挂（checkpoint 表顺序依赖）②job-runner 的 EEXIST 疑为本机沙箱 FS broker 包装错误，需非沙箱终端复核
下一步：T01 模型合同与 usage 规范化（packages/contracts/src/model-usage.ts 起）
```

```text
任务：T01
状态：VERIFIED
执行日期与功能标注：2026-10-20 / Agent工作台迭代
基线：T00 之后（本地提交 469a3a3）
实现：新增 packages/contracts/src/model-usage.ts（ModelTask/NormalizedUsage/ProviderUsage/ModelRoute）+ index 导出；
      apps/api/src/models/{model-types,normalize-usage,model-config}.ts；两份测试；.env.example 补模型变量说明
红测：normalize-usage.test.ts → Cannot find module './normalize-usage.js'；model-config.test.ts → Cannot find module './model-config.js'
绿测：10 passed (10)（normalize 5 + config 5）
回归：tsc -p packages/contracts / apps/api --noEmit 均 exit 0
数据库：未涉及
证据：agent-app/docs/agent-next-change-manifest.md §T01
提交：本地提交，未推送
偏差：计划只要求 normalize 红线；额外先写了 model-config 红线以保证先测后码
风险：DeepSeek 真实 vision 模型名与能力仍未实测，T19 前需维护者给出白名单；价格表版本待 T02 提供
下一步：T02 调用账本与费用（prisma ModelInvocation + pricing.ts）
```

```text
任务：T02
状态：VERIFIED
执行日期与功能标注：2026-10-20 / Agent工作台迭代
基线：T01 之后（本地提交 4370d27）
实现：prisma ModelInvocation + migrations/202610200001_model_invocations；
      apps/api/src/models/{pricing.ts,model-invocation.service.ts} + 两份测试
红测：pricing.test.ts → Cannot find module './pricing.js'
绿测：pricing 4 passed；账本集成 6 passed（隔离库 + KF_TEST_ALLOW_DESTRUCTIVE_RESET=1），合计 10
回归：tsc -p apps/api exit 0；conversation-turn-lease + preview.service 19 passed
数据库：kf_agent_test_agent_next 新增 ModelInvocation；migrate deploy 成功；
      checksum 6fb3e0d53c42ea9e651c992f6d8a1fee2598a9bf049bb20200c3a13b5fa3b0bd（与 _prisma_migrations 一致）
证据：agent-app/docs/agent-next-change-manifest.md §T02
提交：本地提交，未推送
偏差：①migrate dev 因 checkpoint_* 运行期表被判漂移，改用 migrate diff + 影子库生成 SQL；
      ②diff 报出 BuildSchedulerCursor.updatedAt 删默认值与 3 条索引重命名属既有漂移，未纳入本迁移
风险：①既有 schema 漂移未处理，后续迁移会反复报同一批 diff；②价格表尚未接 env（T06 处理），当前通过构造参数注入
下一步：T03 统一 provider transport、全程 deadline 与取消（deepseek-transport.ts + model-gateway.ts）
```

```text
任务：T03
状态：VERIFIED
执行日期与功能标注：2026-10-20 / Agent工作台迭代
实现：新增 apps/api/src/models/{deepseek-transport.ts,model-gateway.ts} + 两份测试；
      deepseek-model.ts 的 chatJson 委托 transport；orchestrator ModelPortContext 增加可选 execution
绿测：transport 8、gateway 5、老模型套件 124（合计 137 passed，零回归）
回归：tsc -p apps/api / packages/agent-orchestrator 均 exit 0
数据库：未涉及
证据：agent-app/docs/agent-next-change-manifest.md §T03
提交：本地提交，未推送
偏差：transport 先写实现后补测（未走红测）；截断原因由 transport 返回给 chatJson 再转 JSON_TRUNCATED，
      以保留既有「关 thinking 重试」路径
风险：gateway 尚未接进 Nest 模块与老入口（T06/T12 才接），当前仅单测覆盖
下一步：T04 按任务拆 prompt、稳定前缀与确定性动作
```


## 计划文档自检记录（2026-10-20）

- 需求覆盖：master矩阵已将成本、多会话、图片组件生成、局部修改、质量和安全分别映射到任务。
- 结构检查：8份文档、T00–T27共28个唯一任务、176个未勾选步骤；没有遗漏/重复任务编号、未闭合代码围栏或失效的仓库内Markdown文档引用。
- 占位检查：未发现未定占位词；测试fixture、接口、错误码和关键算法已写入各阶段。
- 一致性修正：统一视觉确认action；修正AppModule注册路径；明确旧请求预算与持久run外键的过渡；增加失效lease恢复、等待审批屏障和不可变snapshot顺序。
- 验证边界：以上只是计划文档检查，不是业务测试通过；本轮没有运行数据库迁移、应用测试、真实模型评测或KF原生验证。
