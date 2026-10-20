# Agent Next 变更清单（T00）

功能标注：Agent工作台迭代
执行日期：2026-10-20
计划来源：`docs/superpowers/plans/2026-10-20-agent-app-next-master.md` §T00

## 1. 新增文件

| 文件 | 职责 |
|---|---|
| `agent-app/tests/helpers/database-safety.ts` | 纯函数守卫 `assertSafeTestDatabase`：要求显式 `allowReset === "1"` + 隔离库名前缀 + 名称长于前缀；拒绝时只抛固定错误码，不回显 URL/凭据 |
| `agent-app/tests/helpers/database-safety.test.ts` | 守卫单元测试（6 例）：缺 URL、生产库名、裸 `kf_agent_test`、缺 flag、URL 编码库名、空密码、错误协议、无库名、错误信息不含连接串 |
| `agent-app/tests/helpers/vitest.config.ts` | 仅 include `tests/helpers/*.test.ts` 的独立配置，避免误触发集成套件 |
| `agent-app/docs/agent-next-baseline.md` | 执行基线：HEAD、分支、dirty 统计、工具链、隔离库、工作目录决策 |
| `agent-app/docs/agent-next-change-manifest.md` | 本文件 |

## 2. 修改文件

| 文件 | 改动 |
|---|---|
| `agent-app/tests/e2e/helpers/destructive-reset.ts` | 协议/前缀/长度规则改为复用统一守卫，保留 `refuse()` 统一报错、双开关语义、loopback 校验与库名后缀正则 |
| `agent-app/apps/api/src/api.integration.test.ts` | 兜底库名 → `kf_agent_test_agent_next`；接入守卫 |
| `agent-app/apps/api/src/auth/auth.integration.test.ts` | 同上 |
| `agent-app/apps/api/src/artifacts/preview.service.test.ts` | 同上 |
| `agent-app/apps/api/src/creative-goldens.integration.test.ts` | 同上 |
| `agent-app/apps/api/src/conversations/conversation-turn-lease.integration.test.ts` | 同上 |
| `agent-app/apps/api/src/build-jobs/build-job.integration.test.ts` | 同上 |
| `agent-app/apps/worker/src/job-runner.integration.test.ts` | 同上 |
| `agent-app/packages/agent-orchestrator/src/solution-graph.integration.test.ts` | 同上 |
| `agent-app/packages/build-jobs/src/build-job.service.integration.test.ts` | 同上 |

未修改：`packages/agent-orchestrator/src/solution-graph.test.ts`（检索式命中 `TEXT_TRUNCATED` 字样，不接触数据库，按计划不改非破坏性测试）。

## 3. Red → Green 证据

| 阶段 | 命令 | 结果 |
|---|---|---|
| 红测（缺实现） | `./node_modules/.bin/vitest run --config tests/helpers/vitest.config.ts` | FAIL：`Cannot find module './database-safety.js'`，1 个文件加载失败 |
| 绿测（实现后） | 同上 | **6 passed (6)** |
| e2e 守卫回归 | `vitest run --config <临时配置>` 指向 `tests/e2e/helpers/*.test.ts` | **13 passed (13)**，原有用例断言（`E2E destructive reset refused: ...`、双开关）全部保留通过 |
| 负向验证（真实集成测试） | 只给 `TEST_DATABASE_URL`、不给 `KF_TEST_ALLOW_DESTRUCTIVE_RESET` | 文件级失败：`Error: TEST_DATABASE_NOT_AUTHORIZED`，数据库未被连接 |
| 类型检查 | `tsc -p apps/api | apps/worker | packages/build-jobs | packages/agent-orchestrator --noEmit` | 4/4 exit 0 |

## 4. 现有集成套件基线（隔离库 `kf_agent_test_agent_next`）

环境：`TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_agent_next`、`KF_TEST_ALLOW_DESTRUCTIVE_RESET=1`、`prisma migrate deploy` 已执行。

| 套件 | 结果 | 说明 |
|---|---|---|
| `auth.integration.test.ts` | 10 passed / 1 failed | 失败项 `sets HttpOnly Secure SameSite session cookies`：本机 `.env` 的 `COOKIE_SECURE=false` 导致，`COOKIE_SECURE=true` 时该例通过。**环境因素，非本轮改动** |
| `api.integration.test.ts` | 58 passed / 1 failed | 首轮空库时 59 条全挂（`relation "checkpoint_writes" does not exist`）；待其它套件 `PostgresSaver.setup()` 建表后重跑仅剩 `recompiles the complete implementation...` 超时 5000ms |
| `creative-goldens.integration.test.ts` | 0 passed / 1 failed | `BUILD_EXECUTION_FAILED`，失败快照落库为 FAILED；疑似与 job-runner 同一环境原因，未在 T00 范围内深挖 |
| `job-runner.integration.test.ts` | 27 passed / 3 failed | ① `EEXIST ... mkdirExact`：mkDir 经本机沙箱 FS broker 抛出的错误 `code` 不是 `EEXIST`，`hasCode` 无法吞掉；② 一条 5000ms 超时；③ `expected 'FAILED' to be 'SUCCEEDED'`（疑似①的连带） |
| `build-job.integration.test.ts` | 31 passed | 通过 |
| `conversation-turn-lease.integration.test.ts` | 13 passed | 通过 |
| `preview.service.test.ts` | 6 passed | 通过 |
| `build-job.service.integration.test.ts` | 5 passed | 通过 |
| `solution-graph.integration.test.ts` | 7 passed | 通过 |

合计：157 通过 / 5 失败（均单列为既有问题，未删除或跳过任何用例）。

### 已确认的既有隐患（非本任务引入，建议后续任务处理）

1. **空库顺序依赖**：`api.integration.test.ts` 的 `resetDatabase` 会 TRUNCATE `checkpoint_*`，但该表由 LangGraph `PostgresSaver.setup()` 运行时创建；在全新库上先跑该套件必然全挂。CI 若从空库启动会踩到。
2. **`tests/e2e/helpers/*.test.ts` 不在任何 workspace 项目根内**，`pnpm test` 实际不会执行它们（本轮用临时配置验证，未改全局测试编排）。
3. **本机 `.env` 的 `COOKIE_SECURE=false`** 与 `auth.integration` 的 Secure 断言冲突。

## 5. 提交

- 建议消息：`test(agent): guard isolated integration databases`
- 范围：仅上述新增/修改文件；7 个涉库测试文件携带开工前既有改动（已在 `origin/main` 的 `09e03a7` 快照中），提交说明需注明。
- 远程：按维护者要求**不推送**。

---

# T01：模型合同、配置能力与 usage 规范化

执行日期：2026-10-20（同 T00）
功能标注：Agent工作台迭代

## 新增/修改文件

| 文件 | 改动 |
|---|---|
| `agent-app/packages/contracts/src/model-usage.ts` | 新增跨包类型：`ModelTask`、`NormalizedUsage`、`ProviderUsage`、`ModelRoute`（纯类型，无 Nest/API 依赖） |
| `agent-app/packages/contracts/src/index.ts` | 导出 `model-usage.js` |
| `agent-app/apps/api/src/models/model-types.ts` | `ModelRouteSource`（服务端 env 视图）、`ModelRouteTable`（任务→路由） |
| `agent-app/apps/api/src/models/normalize-usage.ts` | `normalizeUsage`：只接受非负安全整数；缺失保持 null；`hit+miss≠input` 标 `inconsistent`；reasoning 单独暴露不并入 output |
| `agent-app/apps/api/src/models/model-config.ts` | `resolveModelRoutes`（env 白名单 → 6 类任务路由）、`validateModelRoute`（vision 未配置时抛 `MODEL_CAPABILITY_UNSUPPORTED`） |
| `agent-app/apps/api/src/models/normalize-usage.test.ts` | 5 例：缺失/正常、负数浮点溢出、不一致、reasoning 不重复、部分字段 |
| `agent-app/apps/api/src/models/model-config.test.ts` | 5 例：默认值保留 `deepseek-chat`、vision 未配置必须拒绝、vision 独立模型不回落、baseUrl/超时/上限归一、价格版本与 thinking 透传 |
| `agent-app/.env.example` | 新增模型路由变量说明（无真实密钥）：`DEEPSEEK_MODEL/BASE_URL/TIMEOUT_MS/MAX_CONTEXT_TOKENS/VISION_MODEL/PRICING_VERSION/THINKING/API_KEY` |

## Red → Green 证据

| 阶段 | 命令 | 结果 |
|---|---|---|
| 红测（normalize） | `vitest run ... apps/api/src/models/normalize-usage.test.ts` | FAIL：`Cannot find module './normalize-usage.js'` |
| 绿测（normalize） | 同上 | 1 passed → 扩到 **5 passed** |
| 红测（config） | `vitest run ... model-config.test.ts` | FAIL：`Cannot find module './model-config.js'` |
| 绿测（config） | 两文件同跑 | **10 passed (10)** |
| 类型检查 | `tsc -p packages/contracts --noEmit`、`tsc -p apps/api --noEmit` | 2/2 exit 0 |

## 设计取舍

- **默认模型不变**：`deepseek-chat`、`https://api.deepseek.com`、60s 超时、64k 上下文，均沿用 `deepseek-model.ts` 现有常量。
- **视觉必须显式配置**：`DEEPSEEK_VISION_MODEL` 为空时 `routes.vision.supportsVision=false`，`validateModelRoute(route,"vision")` 直接抛错；不把文本模型当视觉模型、也不降级为纯文字请求。
- **不猜价格**：`pricingVersion` 未配置为 null，费用留待 T02 记为未知。
- **白名单边界**：路由只从服务端 env 派生，`ModelRoute` 结构里没有 apiKey/浏览器可控字段。

---

# T02：调用账本与费用

执行日期：2026-10-20
功能标注：Agent工作台迭代

## 新增/修改文件

| 文件 | 改动 |
|---|---|
| `agent-app/prisma/schema.prisma` | 新增 `ModelInvocation`（30 字段 + 3 个复合索引）；`runId` 暂为可空字符串，T07 再补外键 |
| `agent-app/prisma/migrations/202610200001_model_invocations/migration.sql` | 仅 CreateTable + 3 个 CreateIndex，不触碰既有表 |
| `agent-app/apps/api/src/models/pricing.ts` | `estimateCostMicros`：BigInt micros 计价、向上取整；价格缺失/负费率/usage 不完整/自相矛盾一律返 null |
| `agent-app/apps/api/src/models/model-invocation.service.ts` | `ModelInvocationService`：start 落 RUNNING；finish 用 `(tenantId,id,RUNNING)` CAS 收尾；同终态幂等、异终态 `INVOCATION_STATE_CONFLICT`、跨租户 `INVOCATION_NOT_FOUND` |
| `agent-app/apps/api/src/models/pricing.test.ts` | 4 例：加权计价、缺价/负价、不完整/矛盾 usage、向上取整与 bigint 精确性 |
| `agent-app/apps/api/src/models/model-invocation.integration.test.ts` | 6 例：RUNNING 落库且无 prompt/key 列、成功计价、重复 finish 幂等、跨租户拒绝、缺价/矛盾/UNKNOWN 保持 null、异终态冲突 |

## Red → Green 证据

| 阶段 | 命令 | 结果 |
|---|---|---|
| 红测（pricing） | `vitest run ... src/models/pricing.test.ts` | FAIL：`Cannot find module './pricing.js'` |
| 绿测（pricing） | 同上 | **4 passed** |
| 绿测（账本，需隔离库 + flag） | `TEST_DATABASE_URL=…kf_agent_test_agent_next KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 vitest run ... model-invocation.integration.test.ts` | **6 passed**（两文件合计 10 passed） |
| 类型检查 | `tsc -p apps/api --noEmit` | exit 0 |
| 旧链路回归 | `conversation-turn-lease` + `preview.service` | **19 passed** |

## 迁移

| 项 | 值 |
|---|---|
| 名称 | `202610200001_model_invocations` |
| 文件 sha256 = Prisma 记录 checksum | `6fb3e0d53c42ea9e651c992f6d8a1fee2598a9bf049bb20200c3a13b5fa3b0bd`（在 `_prisma_migrations` 中已核对一致） |
| 前向 | `prisma migrate deploy --schema prisma/schema.prisma`（已在 `kf_agent_test_agent_next` 执行成功） |
| 回退 | `DROP TABLE "ModelInvocation";` 然后删除该迁移目录；不触碰其他表、不回滚数据 |

### 迁移期间的既有漂移（未纳入本迁移，需维护者确认）

`prisma migrate diff` 在 ModelInvocation 之外还报出 4 处 **schema.prisma 与 migrations 的既有不一致**：

1. `ALTER TABLE "BuildSchedulerCursor" ALTER COLUMN "updatedAt" DROP DEFAULT;`
2. `RenameIndex` BuildJob ×2
3. `RenameIndex` DomainProjectRevision ×1

这些都不是 T02 的改动，放进本迁移会悄悄改变既有行为（尤其第 1 条会去掉默认值），故只取了 ModelInvocation 的 DDL。**另需注意**：`prisma migrate dev` 在该库不可用——LangGraph 的 `checkpoint_*` 表由 `PostgresSaver.setup()` 运行时创建，会被判为漂移并要求重置库；生成迁移必须用 `prisma migrate diff --from-migrations … --shadow-database-url …`。


