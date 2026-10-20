# Agent Next 实施基线（T00）

记录时间：2026-10-20 10:45（CST）
任务：T00「建立安全的执行基线」
功能标注：Agent工作台迭代

## 1. 仓库与工作树

| 项 | 值 |
|---|---|
| 仓库根 | `/Users/fengjinlong/YK/KingFusion3.6` |
| 分支 | `main` |
| HEAD | `d8fdcb42b29907a49a2170c5107b825d6d5a1c34` |
| 已修改未提交（全仓） | 210 |
| 已修改未提交（agent-app） | 194 |
| 未跟踪（全仓） | 67 |
| 远程 `origin/main` | `09e03a7`（2026-10-20 推送，树内容 = 当时工作区快照） |

工作目录决策（2026-10-20，维护者/冯工）：**沿用当前工作目录实施，不新建 worktree**。
Git 策略（2026-10-20，冯工）：**允许本地提交，禁止推送远程**；不执行 `reset` / `stash` / `checkout .`，不整体 `add .`。

## 2. 工具链与数据库（不含任何凭据）

| 项 | 值 |
|---|---|
| Node | v24.21.0 |
| 包管理器 | pnpm 未在 PATH（`corepack` 可用；本次以 `./node_modules/.bin/vitest` 直接驱动） |
| PostgreSQL | 本机 `postgresql@16`，数据目录 `/usr/local/var/postgresql@16`，监听 `127.0.0.1:5432` |
| 隔离测试库 | `kf_agent_test_agent_next`（本任务新建，owner `postgres`） |
| 破坏性测试开关 | `KF_TEST_ALLOW_DESTRUCTIVE_RESET=1`（新增，与隔离库名构成双开关） |
| E2E 隔离库 | 前缀 `kf_agent_e2e_`，开关 `KF_E2E_ALLOW_DESTRUCTIVE_RESET=1`（沿用既有） |

数据库启动方式（本机，沙箱内 `brew services` 被 launchctl 拒绝，改用）：

```bash
/usr/local/bin/pg_ctl -D /usr/local/var/postgresql@16 -l /tmp/pg16-agent-next.log start
```

## 3. 本任务将触碰的文件及其既有变更

T00 需要修改 9 个破坏性集成测试。其中 7 个在开工前已带既有未提交修改（均为 2026-08-27 → 09-03 基线工作的一部分，且已包含在 `origin/main` 的 `09e03a7` 快照中）；本任务的改动将叠加在这些文件上。

| 文件 | 开工前状态 | 既有 diff |
|---|---|---|
| `tests/e2e/helpers/destructive-reset.ts` | CLEAN | — |
| `apps/api/src/conversations/conversation-turn-lease.integration.test.ts` | CLEAN | — |
| `apps/api/src/build-jobs/build-job.integration.test.ts` | CLEAN | — |
| `apps/api/src/api.integration.test.ts` | M | 6 行 |
| `apps/api/src/artifacts/preview.service.test.ts` | M | 8 行 |
| `apps/api/src/auth/auth.integration.test.ts` | M | 13 行 |
| `apps/api/src/creative-goldens.integration.test.ts` | M | 5 行 |
| `apps/worker/src/job-runner.integration.test.ts` | M | 103 行 |
| `packages/agent-orchestrator/src/solution-graph.integration.test.ts` | M | 8 行 |
| `packages/build-jobs/src/build-job.service.integration.test.ts` | M | 9 行 |

`packages/agent-orchestrator/src/solution-graph.test.ts` 虽被计划的检索式命中，但命中内容为 `TEXT_TRUNCATED` 字样，不触碰数据库，按计划「不修改非破坏性测试」跳过。

## 4. 已知边界

- 本基线只覆盖本机开发环境，不代表 CI 或生产配置。
- 测试库名 `kf_agent_test`（无后缀）在新守卫生效后**不再被接受**：它无法证明是「本次任务专用」的隔离库。所有涉库测试的默认兜底改为 `kf_agent_test_agent_next`。
- 本文件不记录连接串、密码或密钥。
