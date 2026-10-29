<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
# T22 公共蓝图确认与 HTTP 工程包下载（2026-10-23）

## 1. 本批完成的切片

公共 `POST /api/conversations/:conversationId/runs` 的视觉 `confirm_blueprint` 已接通既有签名工程继承和正式执行链，不再需要手工创建工程候选。

已验证的链路：

`参考图分析/差异确认 → 实际 PG 蓝图等待 → Cookie/Origin HTTP confirm_blueprint → 原子签名工程 Run → 正式 executor/registry/PG 图 → 专用 semantic gateway → 原生编译/签名/GenerationSnapshot → BuildJob/真实 BuildExecutor → Delivery API → 私有一次性下载令牌 → HTTP 包字节/hash`。

**T22 仍 IN_PROGRESS。生产 vision resolver 仍关闭，前端上传/授权/差异确认尚未接通，不能仅开 flag 宣称可以图生工程试用。** 本批 HTTP 在隔离测试库通过依赖注入配置真实 PrismaRunStore 的 staged 策略；这是当前 controller/service/store、worker graph、原生打包及下载的集成验证，不是生产开关灰度或真实 provider/KF/1:1 验收。模型响应使用本地 fixture fetch，未调用真实模型。

前批工程执行与恢复见 `visual-engineering-run-20261023.md`；不重做其模型/consumer/提交后跟踪。本批没有修改 Web、contracts、schema/migration、编排节点或构建核心。

## 2. 公共确认事务

1. 在原 conversation advisory lock 内优先查幂等：完整 action/request hash 一致返回原 Run，不因当前外发/rollout/runtime 关闭或工作区已前进而重新消费来源。相同 key 不同 receipt 仍冲突。
2. 只在当前 tenant/workspace/conversation 内发现 expectedRun。正常 @6 文本确认沿用原路径；视觉输入/视觉 plan 任一存在就走视觉屏障，配置损坏/降级不得回落普通文本确认。
3. 识别结果等待不能跳过差异接受直接确认蓝图：来源 action 必须是 accept_visual_reference，之后才检查当前 runtime/gates。图片识别等待仍返回 VISUAL_REVIEW_ACTION_REQUIRED。
4. 当前 vision/explicit-consent/outbound/admission gate 和工程 runtime 依赖齐全；仅 build、无新附件/visualReference/retry。来源 actor 必须等于原同意者。
5. 取锁/复核顺序为 conversation → 原 reader 的 tenant/workspace → 原 image control/row → blueprint control/row → outstanding rows；不能先持新 Run 或 blueprint row 再倒序读原图。完整 ancestry reader 验证当前同意/TTL/基线/目录/签名与原事实。
6. 来源必须仍 WAITING_INPUT、未取消/未 supersede/无 job，且是唯一 outstanding。回执匹配真实发布事件，再由签名器核对独立 review、实际 Message、revision/hash/stamp。
7. 同事务创建用户 Message、QUEUED 候选（inputSnapshot 初始 SQL NULL；固定原 config/base/actor/predecessor），调用原 freezeEngineering 唯一 CAS 消费旧等待并冻结 engineering proof/semantic model；缺可执行 semanticModel 则整笔回滚。
8. 同事务绑定 Message.runId、RUN_ACTION_ACCEPTED/签名器 VISUAL_BLUEPRINT_CONFIRMED 审计、RunBudget 观测行、run.queued/lastSeq/activity。通用 active 消费分支跳过已由 signer 消费的来源，不重复 source event/CAS。

预算行沿用既有观测机制，未新增预算限制。旧 POST 不恢复。没有接受客户端传入 proof/modelRoute/原生内容作为授权。

## 3. 装配与错误语义

- RunsModule 只有同时具备 reviews、blueprints、semantics 才向 PrismaRunStore 提供工程继承依赖。仅 review/blueprint 可继续原差异确认→蓝图阶段，但不能受理工程确认。
- 旧五参数 Store 构造仍保持其他路径兼容；新增第六依赖只用于公共视觉工程。worker 已有执行器/模型/签名验证接线不变。
- 未提供工程 runtime 或 semantic 配置无效，公共服务返回 403 VISUAL_FLOW_NOT_CONFIGURED；不可用任务不能悄悄入队。
- actor/外发拒绝仍 403；坏/过期 review、continuation、Message、receipt、source 状态等安全映射 409；客户端 mode/空 receipt/额外 action 配置/附件伪装等在入参层 400。
- 其他会话的真实 expectedRun 与不存在的 expectedRun 在相同条件下均 RUN_ACTION_STALE，不泄露来源；不存在/跨 tenant 的 conversation 保持 404。
- 原 RunSnapshot 不返回 proof/config/模型路由；沿用公开事件安全摘要，不展示隐藏思维链。

## 4. 验证内容与中间失败

新增 22 项流程测试（visual-run-flow 162 → 184）：

- 公共原子准入、固定签名输入、source 唯一消费、Message/budget/queued/双审计及关闭 gate/runtime 后原 key 重放；变更 receipt 冲突。
- 相同请求、不同请求、取消竞争；同意者/租户/会话隔离。
- rollout、外发、TTL、actor、receipt、取消、独立 review、实际 Message、config 降级、缺 runtime、无效模型、当前 base 与显式 expected base 拒绝后无候选/消息/预算残留。
- 缺模型以及签名器已经消费来源后再故障，两种真实事务回滚。
- HTTP malformed action/body 拒绝；已有图片识别等待不能越过差异确认。
- 完整 HTTP 确认→正式 PG 图→原生包→delivery→一次性 token/download；无会话/无 Origin 拒绝，跨租户取 token 404、盗用 token 401、重复消费 401；实际 HTTP 字节 SHA-256 与绑定 Artifact 完全一致，确认重放在 workspace 前进后仍返回原 Run。图/编译/签名/私有存储/BuildExecutor/下载均为真实实现，模型为本地响应。

测试中间记录（保留，不拿最终绿测抹去）：

1. 第一条公共确认红测返回旧 VISUAL_REVIEW_ACTION_REQUIRED，证明入口未接。
2. 两条补充红测暴露 config 降级可能进入普通 @6 候选、无效 semantic 配置错误未映射；分别通过视觉 frozen-input 检测和 403 映射修复，无放宽来源验证。
3. 初次 API tsc 有测试 jobId nullable 和二进制 parser 参数不匹配，已用明确 job 断言及 supertest.Response 修复；初次 lint 的一个多余 tuple 非空断言已移除，不关规则。
4. 两文件定向首次 202 passed / 1 failed（10:02:35 / 100.36s），失败是既有图片识别等待测试应保持 VISUAL_REVIEW_ACTION_REQUIRED，而新分支过早报 runtime 缺失。修复来源阶段检查顺序，未改变该断言。
5. 修复后相关定向 22/22（另 162 因 -t 未选中，不是新增永久 skip，10:05:56 / 16.43s）；包含旧图片屏障与 21 个新用例。完整 184 项及全 API 以后面的最终复验为准。

本轮所有测试命令显式 `LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false`，未重现前批外部 tracing 429。前批短 lease FENCE/偶发 404/cleanup WARN 的根因仍未宣称根治；不修改既有 timeout/retry/skip，不动无关认证/调度代码。

## 5. 执行与环境保护

API cwd：

```sh
LANGCHAIN_TRACING_V2=false LANGSMITH_TRACING=false COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_full_20261022_0940 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --reporter=dot
```

定向用 `kf_agent_test_generation_20261022_0930`，全量用 full_0940，禁止同库并发 reset；全量在其他重检查结束后单独执行。新测试通过精确绑定当前测试 job 调用真实 BuildExecutor，不领取隔离库里无关 fixture，也不把它说成全局 JobRunner 调度验收。

未读/改实际 `.env`、真实 key，未启动/重启试用进程，未操作试用数据库或运行新迁移，未调用真实 provider/KF。旧试用 `kf_agent_e2e_trial_20261021_01` 按 18 迁移保护，源码 21 条的 expand/排空/整体升级要求不变。旧 @6、不支持签名 review/semantic/confirm consumer 的旧 @7 均不能混领新确认。未 commit/push/worktree/多代理，也未出未要求的补丁。

## 6. 下一模型直接继续

1. 不重做后端公共 accept/confirm、HMAC 继承、semantic/gateway、工程 handler、snapshot 或下载协议。
2. **现有前端图生闭环**：读取实际上传/派生图/分析与 review 合同，将现有工作台接上私有参考图上传、明确外发同意、单图选择、识别差异接受、独立蓝图确认和现有 download helper。先完成一个从 UI 上传到包下载的真实 browser E2E，不以再次堆内部 primitive 代替。
3. 在 T22 中保留未完成的可编辑识别/区域修订/视觉 retry 合同；当前单图、原同意者、build 源/后继约束不能悄悄放宽。TTL 到期/撤权要有可理解错误和停止/重新提交路径，不把参考图清成文字绕过。
4. 前端/browser 全链路、升级/回退/资源专项通过后才考虑生产 resolver/配置开放。真实视觉 provider/收费/缓存质量和 KF/Windows/像素级还原，需要独立授权和实测，不能拿 fixture download 通过替代。

## 7. 文件清单

代码/测试 5 份：runs/run-store.ts、run.module.ts、run.service.ts、visual-run-flow.integration.test.ts；vision/visual-blueprint-authority.ts 仅更新已过时的公开受理注释。未修改上一批工程 handler/模型/构建核心。

文档 6 份：本报告、master、handoff、P4、design §10、operations。

最终复验在末尾追加，前批 874/214 不作为本轮通过数。

## 8. 最终复验

2026-10-23，Asia/Shanghai：API **64 文件、896 passed / 0 failed / 0 skipped**（10:07:06 开始，226.00s），包含完整 184 项 visual-run-flow 和 19 项 RunStore 回归。定向结果均计入完整套件，不重复计算。

前批 214 项 orchestrator/其他包测试不作为本批通过数：本批未修改编排节点、contracts 或 domain-client，也没有重跑这些包/Web/browser/build-jobs 全量。实际 PG 图/native 编译/签名/打包/HTTP 下载由本批 API 集成用例覆盖，不能据此宣称真实 provider/KF/Windows/生产灰度/像素验收完成。

本轮完整 API 未再出现前批短 lease/404，但根因仍未全部确认；既有 lease cleanup connection destroyed WARN 仍出现。所有红测、中间 202/1 和修复记录保留在 §4；没有放宽既有 timeout/retry/skip。

最终 root/API tsc 与 5 文件 type-aware ESLint 均 exit 0，涉及 tracked 文件 diff --check 和新增源/文档末尾空白检查通过；本轮测试进程已结束。未自动提交、未留下业务服务或修改试用环境。
<!-- end -->
