<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
# Run 服务端准入、配置快照与只读工作台交接

> 后续审批/构建审计、决定恢复与 run-plan@5 见 `run-audit-20261021.md`；本报告保留准入批次 657 项验证和当时的 run-plan@4 历史证据。升级须先用旧 worker 排空旧协议任务，不能直接混用。

日期：2026-10-21。范围：T12 准入/配置与 T16 输入能力显示；**T12 整体仍 IN_PROGRESS**。预算继续暂缓；没有开启图片、收费模型评测或原生验收。

## 1. 本批结果

- 增加 `GET /api/v2/workbench-config`，经 TenantGuard 读取 cookie 的真实租户；响应只含有效能力、协议版本、准入原因、图片关闭策略。返回 `Cache-Control: private, no-store`、`Vary: Cookie, Origin`，不返回 allowlist、provider URL 或凭据。
- `AGENT_RUNS_V2`、`AGENT_WORKBENCH_V2` 默认关闭，需精确 `true` 加 `AGENT_FEATURE_TENANT_ALLOWLIST` 中的租户 UUID；空名单和 `*` 不开放任何普通租户。只接受精确布尔字符串，错误依赖或提前启用未接通功能会失败关闭。
- RunStore 在会话锁内、幂等命中之后、消息写入之前读取服务端策略。直接调用 store 也不能通过省略配置绕过准入；配置不来自请求体，公开输入类型没有 configSnapshot 或 flag 参数。可注入策略函数供受控服务装配和隔离夹具使用，生产默认始终是服务端关闭策略。
- 新消息、确认/批准/改稿和新 retry 关闭时不入队；原幂等请求仍返回原 Run，快照不重写。保留历史、订阅、下载、stop；原生审批 cancel 后继合法性校验不减弱，继承原配置并真正消费 interrupt。已有 Run 在关闭后继续 drain，不因 rollout 关闭就假取消。
- 新 Run 冻结当前有效 flags/schemaVersion/planVersion。worker 在任何已完成 step cache 读取之前校验冻结协议；不认识的版本以 `RUN_CONFIG_VERSION_MISMATCH` 失败，不调用图或删除旧输出。旧 null 快照保留，按既有协议恢复。
- 前端独立读取服务器配置，不用 localStorage 决定权限；配置失败或未启用则只读，不阻塞历史/停止。切换租户/工程重读，取消前一个配置请求并忽略迟到授权；会话创建、提交、审批、停止、重试响应也校验视图代际，旧请求不得挂回新租户，输入草稿随租户切换重建。批准/确认/重试入口同样关闭，取消入口仍保留。
- 未启用的用量入口隐藏；真实页面图片附件按钮关闭，明确“不会向模型发送图片”。显式设计预览仍可保持 UI 设计稿，不提交业务请求。
- `.env.example` 增加真实配置说明，**没有修改实际 `.env`、开启任何实际租户或重启常驻服务**。用户在更新后重启 API 时若未配置 flags/名单，会看到只读状态，这是默认安全行为，不是旧 API fallback。

## 2. 启用与停新受理

完整说明见 `agent-runs-operations.md` §1.1。当前登录会话可从 `/api/me` 确认自己的 tenantId，再由获准管理员配置；不要使用租户名称。

```dotenv
AGENT_RUNS_V2=true
AGENT_WORKBENCH_V2=true
AGENT_FEATURE_TENANT_ALLOWLIST=<tenant-uuid-1>,<tenant-uuid-2>
```

停新受理时将两个 flags 置 false 或移除目标租户，让每一个 API 副本加载相同配置；不要停掉仍在 drain 的 worker，也不要恢复旧 POST messages/resume。环境配置不是跨副本原子远程开关；生产维护窗口/多副本加载和整体回退仍需实测与授权。

目前尚未接入完整真实调用账本/统一 gateway，所以 usage/prompt/vision/regional-edit/native 的对应 flags 必须保持 false；预算限制仍关闭。今后开放功能必须先完成接线和验证，再修改 resolver 和对应测试，不能只把环境值改成 true。

配置快照本轮覆盖功能准入与 `run-plan@4`，**不等于模型/提示词/价格配置已经完整冻结**；这些仍随 T02/T03 gateway 接线收尾。实际生产 provider 配置中途变更前仍应排空。

## 3. 红测、绿测与回归

TDD 证据：

- 配置端点最初 404，关闭准入后的 retry 仍 202，快照为 null；新增测试观察到失败后再实现。
- 初版仅 HTTP 门面传配置存在 store 省略参数绕过；存储边界测试实际得到 QUEUED（预期拒绝），随后把策略读取移至持久事务内。
- 配置响应最初没有 no-store/Vary，浏览器请求也未禁止缓存；补齐两端后通过。
- 未知冻结协议最初仍 SUCCEEDED；初版放在 step handler 内又被已完成 cache 绕过。两个红测分别复现，校验现位于 cache 之前，且不删除原缓存输出。
- 前端只读/配置失败/切换工作区的红测最初输入仍可发；图片按钮也可用且误导为即将外发。接线后通过，并补租户切换与迟到授权回归。另一个红测复现旧租户提交响应晚到后出现停止按钮，随后用视图代际隔离，防止旧 Run/消息挂回新租户。

最终相关回归 **657 passed，0 failed，0 skipped**：

| 范围 | 文件数 | 测试数 |
|---|---:|---:|
| API：Run/权限/历史领域/HTTP/模型 | 32 | 378 |
| Web 当前全部组件与视图 | 23 | 110 |
| agent-orchestrator 相关流程 | 4 | 60 |
| build-jobs 全部 | 4 | 68 |
| worker 相关构建/恢复 | 4 | 41 |

相较前批 635，本批新增 22 项：API 14 项（策略 12、协议含 cache 2）与 Web 8 项。现行真实 Run 的生成/构建/token 下载保持通过，三种 native 审批取消阶段在关闭新受理后仍通过。历史 fixture 的测试不能当成真实 Run 审计验证。

类型检查：API、agent-orchestrator、build-jobs、worker 的 tsc；Web vue-tsc。Web Vite build 90 modules；相关 TS ESLint 与 diff --check 通过。故障用例中的一次 turn-lease 连接销毁告警为已覆盖场景。不是 monorepo 全量，也不是 Playwright、收费模型、OS 进程 kill 或 KF 原生运行态验收。

## 4. 复现方式与数据库安全

完整 API/图/构建/worker/Web 回归命令沿用 `legacy-retirement-20261021.md` §3，其中 `src/runs` 会自动包含本批新策略测试；API 当前应为 32 文件 378 项。不要直接运行会回退到业务连接的全仓测试或 seed。

本批快速验证，cwd `agent-app/apps/api`：

```sh
TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_retirement_20261021_1015 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run src/runs
```

当前 Run 范围共 21 文件 125 项。核心 store 夹具只给本夹具创建的两个租户显式注入启用策略；真实 HTTP 用例设置该隔离租户的环境 flags/名单；不通过放宽生产默认策略来让测试变绿。policy 用例逐项恢复环境，只清理自己租户的 queued fixture。

API 使用前批已有、正常完成 18 个迁移的 `kf_agent_test_retirement_20261021_1015`；build/worker 串行使用 `kf_agent_test_runflow_20261020_462937`，不与 API 共库。**无新 migration，未修改业务库**；旧构建测试库的历史手工迁移状态不可当成生产 deploy 基线。

## 5. 当前任务文件清单（相对仓库根）

新增：

- `agent-app/apps/api/src/runs/feature-policy.ts`
- `agent-app/apps/api/src/runs/workbench-config.controller.ts`
- `agent-app/apps/api/src/runs/feature-policy.integration.test.ts`
- `agent-app/docs/run-feature-policy-20261021.md`

修改：

- `agent-app/.env.example`
- `agent-app/apps/api/src/runs/run.module.ts`
- `agent-app/apps/api/src/runs/run-store.ts`
- `agent-app/apps/api/src/runs/run.service.ts`
- `agent-app/apps/api/src/runs/run-control.service.ts`
- `agent-app/apps/api/src/runs/run-execution.service.ts`
- `agent-app/apps/api/src/runs/run-test-fixture.ts`
- `agent-app/apps/api/src/runs/run-executor.integration.test.ts`
- `agent-app/apps/api/src/runs/run-execution.integration.test.ts`
- `agent-app/apps/api/src/runs/run-flow.integration.test.ts`
- `agent-app/apps/api/src/runs/legacy-routes.integration.test.ts`
- `agent-app/apps/web/src/api.ts`
- `agent-app/apps/web/src/api.test.ts`
- `agent-app/apps/web/src/views/RunWorkbenchView.vue`
- `agent-app/apps/web/src/views/RunWorkbenchView.test.ts`
- `agent-app/apps/web/src/components/runs/ComposerBar.vue`
- `agent-app/apps/web/src/components/runs/ComposerBar.test.ts`
- `agent-app/docs/agent-runs-operations.md`
- `agent-app/docs/legacy-retirement-20261021.md`
- `docs/superpowers/specs/2026-10-20-agent-app-next-design.md`
- `docs/superpowers/plans/2026-10-20-agent-app-next-master.md`
- `docs/superpowers/plans/2026-10-20-agent-app-p2-runs.md`
- `docs/superpowers/plans/2026-10-20-agent-app-handoff.md`

本批无删除文件。基线 main / `94364cd9add74915c6f85af96357ee5b286faede`，混合 dirty 未 reset/commit/push。未创建生产配置、未重启服务、未制作正式 Windows 补丁。后续交付仍需逐任务清单汇总，保留目录，不能把所有 dirty 当成当前模型的改动。

## 6. 下一步与不能误报的项

1. 新 Run 审批/构建审计：检查确认目前生产 runs 中只有部分 `RUN_CANCELLED/RUN_CANCEL_REQUESTED` 分支写 auditLog，缺少原生审批 approve/revise/cancel、蓝图确认和构建受理的完整幂等审计。历史 fixture 的 PLAN_* / BUILD_START 测试通过不能替代本项。下一步先用真实 Run + DB 红测复现，在真实副作用事务/租约边界写入，验证 replay/crash 不重复、过期 fence 不写日志，避免伪造成功审计。
2. SSE 背压、会话过期和连接资源生命周期。
3. 旧 Playwright 仍用旧 POST/旧 UI，global-setup 也没启动独立 agent-worker；迁移时给隔离种子租户显式启用 flags/名单，按租户启动 worker，不能为了测试关闭生产默认保护。
4. 真正 kill API/worker/restart、无 runId 历史 checkpoint 升级处置、生产多副本停新入队/排空/回退仍未验收。不要自动删 fence、猜批准或复活旧 HTTP。
5. 预算限制继续暂缓；调用账本、真实缓存收益、图片理解/控件映射/局部修改和 KF 原生验收依旧未完成，不能用 657 个 fake/离线相关测试冒充这些外部结论。
<!-- end -->
