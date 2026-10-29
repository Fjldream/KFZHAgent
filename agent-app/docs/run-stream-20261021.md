<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
# Run SSE 生命周期、权限复核与前端清理交接

日期：2026-10-21。范围：T10/T12 事件订阅生命周期子项；**T12 整体仍 IN_PROGRESS**。沿用 run-plan@5，无新 migration，不改变审批、签名编译、构建、制品绑定或预算策略。本报告接续 `run-audit-20261021.md`，该报告保留前批 683 项历史证据。

<!-- modified by jinlong.feng at 2026-10-21 Agent工作台迭代 -->
后续接续：`run-browser-20261021.md` 已迁移 Playwright、启动独立 agent-worker，补上传入口并修复原生重规划基线；当前协议升为 run-plan@6。本报告的 @5/719 项和未做浏览器描述是本批历史状态。最新浏览器两轮各 9 项通过；扩大 API 回归仍有偶发失败，见新报告，不能把历史 719 项覆盖到当前宣称全绿。
<!-- end -->

## 1. 本批实现

新增只读 `RunEventStreamService`。RunController 只解析 cursor/limit 后委托，不再内嵌 socket/poll 循环。服务仅依赖 RunService.events、查询快照及会话复核，没有执行器、RunStore 或取消端口。GET events 仍不执行业务，浏览器断线只释放订阅资源。

| 方面 | 当前行为 |
|---|---|
| 输出背压 | `write()` 返回 false 后等待 drain，不继续写完整页；等待最长 5 秒，超时关闭慢连接 |
| 写入上限 | 单帧 UTF-8 字节数 + 应用层 writableLength 不超过 65,536；超限关闭，不向同一 socket 堆积更多事件 |
| 连接窗口 | 默认 30 秒，从初始查询之前开始计时；到期解除正在等待的订阅，允许客户端按 seq 重连 |
| 轮询/心跳 | 默认 poll 1 秒、心跳 15 秒；已有 backlog 立即分页，空页即使快照领先也必须等待，避免忙循环 |
| 生命周期 | req.aborted、res.close、res.error、deadline 共用 AbortSignal；统一清理 deadline、poll、drain 定时器及监听器 |
| 正常结束 | 最后事件写入缓冲后用 end 排空，不把正常缓冲误判成慢连接并 destroy；等待/终态事件补齐后结束 |
| 异常 | 开始 SSE 前维持安全的 400/401/404/500；保留 INVALID_CURSOR/INVALID_LIMIT，未知异常只返回 RUN_EVENTS_FAILED；流已开始后只结束，不混入 JSON 或私有错误 |
| 缓存 | `Cache-Control: private, no-store, no-transform`、`Vary: Cookie, Origin`，禁代理 SSE 缓冲 |

上面的 64 KiB 是应用层单帧/待写 socket 缓冲保护，不是 PostgreSQL 查询结果、操作系统 socket、代理或全进程堆内存的总上限。事件页仍按既有合同默认 100、最多 1,000 行；没有新建全站/每租户连接配额或反向代理压测结论。

## 2. 会话与权限边界

TenantGuard 仍负责初始 cookie 鉴权。新增 SessionService.isSubscriptionActive，按持久 sessionId/userId 只读复核 revokedAt、绝对过期、空闲阈值，并核对用户当前 tenantId、role、mustChangePassword。用户迁租户、改角色或被限制改密后不能沿用旧 principal。

首个事件查询返回后再验证身份；每批、轮询唤醒及背压恢复后再次复核。撤销/到期/权限丢失会结束原连接，客户端下次快照/重连得到鉴权错误后停止。常规检查周期约 1 秒；慢连接另受 5 秒 drain 和 30 秒窗口约束。**已经写入 socket/代理的字节无法撤回**，不能承诺原子撤回所有在途网络数据。

流内复核与心跳不更新 lastUsedAt，不能靠服务器内部轮询制造活动。但普通 HTTP 请求（包含初次订阅/重新握手、快照等）仍沿用原 TenantGuard/validateSession 的滑动规则。本批没有重定义全站“用户空闲”的含义，也不声称一个仍持续发普通 HTTP 的工作台会按纯键鼠闲置自动登出。

初始已发出的单次 Prisma 查询没有强制取消能力。断线/窗口到期会立即解除订阅等待，迟到查询结果被丢弃，不写 socket，不再发下一次查询；不能宣称物理 SQL 被取消。轮询等待和 drain 不持有数据库事务/连接。

## 3. 前端行为

- streamRunEvents 在正常 EOF、异常及消费者提前 break 时取消并释放 reader；残缺帧和完整单帧都有 64 KiB UTF-8 上限。一次网络 chunk 合并 500 个合法小帧仍可完整解析，不能把 chunk 总长度当单帧大小。
- useRunStream 只启动一个消费循环，多次 start 共享当前任务。stop 立即置断开，触发 AbortSignal、清理默认重连退避定时器，忽略迟到事件与快照。
- 快照请求绑定同一 AbortSignal；快照的 400/401/403/404 与流握手失败同样不再静默重连。RUN_EVENT_FRAME_TOO_LARGE 作为明确协议失败交给界面，不无限重复下载异常帧。
- 连续暂时性故障按 1/2/4/8/15 秒名义间隔指数退避，加入 ±20% 抖动，最终仍不超过 15 秒；连接正常结束或收到新的 seq 后重置。正常 30 秒窗口结束不累计成连续错误。默认等待可被 stop 立即取消，测试覆盖抖动两端、上限与恢复重置。
- seq 去重、缺口检测、等待态/终态补齐、CANCEL_REQUESTED 不被后续 build.updated 覆盖等原行为保持。工作台现有创建、停止、重试与租户代际保护不变。

## 4. 红测与验证

TDD 证据：

1. 真实 HTTP/数据库测试首先复现 6 种权限失效后仍发后续事件（revoked/expired/idle/改密限制/迁租户/改角色）。跨租户初始 404 原本已成立，作为回归保留。
2. 最初 4 项真实 Writable 测试全部失败：不等 drain、完整页被塞进写缓冲、查询在途断线不能及时返回、初始 500 泄露私有数据库错误。
3. 补充红测捕获正常结束误 destroy 最后一页缓冲、快照领先空页导致忙轮询，以及安全 cursor/limit 错误码被泛化的问题，修复后保留明确断言。
4. 前端 5 个原始红测复现 reader 未释放、残缺帧无限等待、快照鉴权失败重连、停止后迟到事件污染、重复 start 两条连接；补全鉴权状态矩阵、默认退避取消、快照取消、500 帧 coalescing 等边界。

最终扩大回归 **719 passed，0 failed，0 skipped**，较前批 683 增加 36 项（API 21、Web 15）：

| 范围 | 文件数 | 测试数 |
|---|---:|---:|
| API：Run/权限/历史领域/HTTP/模型 | 35 | 425 |
| Web 当前全部组件与视图 | 23 | 125 |
| agent-orchestrator 相关流程 | 4 | 60 |
| build-jobs 全部 | 4 | 68 |
| worker 相关构建/恢复 | 4 | 41 |

新增 API 为 Writable/transport 10 项 + 真实 HTTP 11 项；Web 为 runs-api 3 项 + useRunStream 12 项。第一轮扩大 API 423 全通过，最终补安全错误码两项后 425 全通过（83.55 秒）；前端最后补齐退避后全部 125 通过。API/worker tsc、Web vue-tsc/Vite build（90 modules）与相关 TS ESLint、diff --check 通过。不是 monorepo 全量、Playwright、收费模型、OS 进程 kill 或 KF 原生运行态验收；未新增 skip/exclude。turn-lease 的已覆盖连接销毁故障告警仍存在。

真实 HTTP 的额外证据包括：100 个短订阅断开后数据库仍可访问且 Run 租约/状态不变；断线后原 Run 可继续完成并从另一连接补齐终态事件；终态 limit=1 分页按 seq 补齐；流内检查不刷新 lastUsedAt。Writable 层验证慢连接超时、窗口/心跳、监听器与定时器释放及查询迟到不写 socket。没有用 mock 计数代替这些业务结果，也不是生产堆内存/proxy 压测。

复现命令沿用 `legacy-retirement-20261021.md` §3；API 的 `src/runs` 自动包含新增文件。API 只用已有 `kf_agent_test_retirement_20261021_1015`（18 迁移）；build/worker 串行用 `kf_agent_test_runflow_20261020_462937`。显式 TEST_DATABASE_URL 和 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1，不能运行回落到业务连接的全仓测试或 seed。

## 5. 文件清单（相对仓库根）

新增：

- `agent-app/apps/api/src/runs/run-event-stream.service.ts`
- `agent-app/apps/api/src/runs/run-event-stream.test.ts`
- `agent-app/apps/api/src/runs/run-stream.integration.test.ts`
- `agent-app/docs/run-stream-20261021.md`

修改：

- `agent-app/apps/api/src/auth/session.service.ts`
- `agent-app/apps/api/src/runs/run.controller.ts`
- `agent-app/apps/api/src/runs/run.controller.test.ts`
- `agent-app/apps/api/src/runs/run.module.ts`
- `agent-app/apps/web/src/runs-api.ts`
- `agent-app/apps/web/src/runs-api.test.ts`
- `agent-app/apps/web/src/composables/useRunStream.ts`
- `agent-app/apps/web/src/composables/useRunStream.test.ts`
- `agent-app/docs/agent-runs-operations.md`
- `agent-app/docs/run-audit-20261021.md`
- `docs/superpowers/specs/2026-10-20-agent-app-next-design.md`
- `docs/superpowers/plans/2026-10-20-agent-app-p2-runs.md`
- `docs/superpowers/plans/2026-10-20-agent-app-next-master.md`
- `docs/superpowers/plans/2026-10-20-agent-app-handoff.md`

基线 main / 94364cd9add74915c6f85af96357ee5b286faede，沿用维护者选择的混合 dirty 工作区。无源文件删除、无 migration、无 commit/push、未制作正式 Windows 补丁；未改实际 .env、启用真实租户或重启服务。出补丁时按此清单保留目录，不包含其他任务既有改动。

## 6. 下一步

1. 迁移 Playwright 旧 POST/旧 UI/helpers/global-setup，并启动真正独立的 agent-worker；仍需隔离种子租户 flags/精确名单，不能通过恢复旧接口或放宽准入来变绿。
2. 真实 API/worker kill/restart、旧协议排空与整体回退、三类工程在现行 Run 下的完整矩阵。当前协议保持 run-plan@5；排空旧协议说明仍适用。
3. 事件保留/压缩尚未实现，所以计划中的过期事件 410 + snapshotUrl 没有验收。保留策略需同时考虑在途审批、决定 memo 和取消 actor 审计，不能先删审计/事件再假装可以恢复。
4. 反向代理、浏览器/多副本、长期 soak、真实内存/连接配额仍需独立验收。前批两个旧夹具瞬时异常的根因未确认，保留其历史记录；本批不靠 skip/exclude 隐藏失败。
5. 预算限制继续暂缓；真实模型调用账本/缓存收益、图片理解与组件映射、会话管理收口及 KF 原生环境验收未完成，不能用本批离线/注入测试冒充。
<!-- end -->
