<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
# T22 公共视觉确认受理与真实 HTTP → 蓝图等待

日期：2026-10-22；功能名：Agent工作台迭代。接续 `visual-blueprint-run-20261022.md`。继续当前 mixed dirty checkout，不自动提交、推送、worktree或多代理，不修改其他 KingFusion 服务。

## 1. 本轮结果与未完成边界

公共 `POST /api/conversations/:conversationId/runs` 的 `accept_visual_reference` 已接 RunService → PrismaRunStore → VisualReviewService 原子确认事务。隔离 staging policy 下，以真实 Cookie/Origin HTTP 受理后，正式执行器/registry/真实 PostgreSQL LangGraph 能产出独立蓝图 Message 和独立蓝图回执，暂停 `WAITING_INPUT`。确认候选不再需要手工插入数据库。

**不是完整图生客户端工程交付。** 生产 `resolveWorkbenchConfig` 仍关闭 vision；设置 `AGENT_VISION_V1=true` 不是启用方法，当前工作台尚未接视觉上传/差异确认。`confirm_blueprint`、后续原生审批和 retry 仍缺下一段可信视觉继承，不能拿 accept-only proof 批准构建。T22 仍 IN_PROGRESS。当前限定单图、原同意人、source/successor 都是 build；没有扩展到协作用户确认、多图、区域修改或 plan/discuss 源运行的确认。

默认文本仍 `run-plan@6`，受控视觉仍实验 `run-plan@7`，没有修改文字请求 hash 或旧编译/签名/build/delivery 安全边界。无迁移、真实收费 provider/KF 请求、实际 .env/key/服务/试用库修改；预算限制继续暂缓，旧 POST messages/resume 不恢复。

## 2. 公共请求合同

```json
{
  "clientRequestId": "每次新确认唯一，重试复用",
  "clientMessageId": "该请求的消息标识",
  "mode": "build",
  "action": {
    "type": "accept_visual_reference",
    "expectedRunId": "原识别结果的等待Run",
    "analysisId": "该回执对应的分析ID",
    "analysisHash": "该分析的64位小写十六进制hash",
    "receipt": "vref1:<64hex reviewHash>:<64hex signature>",
    "acceptedDifferences": [
      { "regionId": "heading", "disposition": "accept-unverified", "capabilityId": "richtext", "reason": "接受未验证标题控件" }
    ]
  },
  "attachmentIds": []
}
```

上例 receipt/hash 是说明占位，不可提交。必须使用同一等待 review 中的真实值；Cookie + 白名单 Origin 仍强制。每项差异 strict、至多100项，reason trim后1–1000字符，区域/能力标识有界。`substitute` 仍要求重新 review，不接受随意替代；省略/未验证确认按现有服务器映射约束复核。

浏览器不能传 route、config、proof、native 或服务器 snapshot 到 action；strict parser 拒绝而非静默删除。确认不得附新图片/options，不得 retry 或用其他 mode。

`RunActionSchema` 允许 receipt/acceptedDifferences optional **仅为读取前批内部持久化最小动作**；RunService 与 Store 的新准入都要求完整 `VisualReviewAcceptanceSchema`。旧内部 proof 不重新签署/修改，不把 schema 可读取误当公共受理许可。新增无依赖的 `visual-acceptance.ts` leaf schema，generation snapshot 与 Run action 共用差异定义，避免 agent-run → visual-review → visual-execution → agent-run 循环。

## 3. 准入、锁与原子性

1. 先查本租户会话，按完整 action（含回执与所有选择）计算 requestHash。
2. 会话 advisory lock 后，优先命中已有请求：完全相同返回原 Run；内容变化 409。停新受理/管理员关闭许可后，原请求仍可查询式重放，不再创建或执行。
3. 新确认要求当前服务器 Run admission、vision、explicit-consent/outbound gate 和可执行蓝图依赖；RunsModule 只在统一 runtime 同时有 reviews/blueprints 时注入 signer。不从浏览器或旧快照补模型/密钥。
4. 按 `conversation → Tenant FOR UPDATE → Workspace FOR SHARE → source control lock → source row` 取锁，再检查 outstanding。取消是 control→row，不能先锁 row 再等待 control。source 必须属于同 scope、真实 WAITING_INPUT、无取消/build/后继；当前只允许唯一 outstanding 的准确 source。
5. 候选 Message、QUEUED Run 使用原基线/完整原 config/predecessor，initial inputSnapshot 为 SQL NULL。签名器在同一事务验证原 actor/发送同意/回执/analysis/leaf/TTL/catalog/base/来源，保存 accepted/proof/step/安全审计，CAS 消费原等待并产生唯一 run.cancelled。
6. Store **跳过通用 active 再消费分支**；随后关联 Message、记录 RUN_ACTION_ACCEPTED、预算行、seq1 run.queued 和 activity，同一事务提交。预算行仍记账，不代表已实现预算限制。
7. 签名结果没有冻结 blueprintModel 就拒绝并回滚整个事务，不能让 review-only signer 留下无法执行的公共后继。

新增 full action 与 acceptance 的一致性验证：freeze 和 read 都核对 receipt/choices 与签名 accepted 相等。仅 actionHash 绑定动作还不够：内部调用方若给动作A却传确认体B，以前能签出二者不一致的合法 proof，本轮补红测并修复。旧最小 action 的读取兼容保持。

失败不留候选 Message/Run、proof/预算/确认审计，不改变原等待（已先取消的 source 保持取消）。并发不同请求至多一个唯一后继；并发相同请求返回同一提交结果。确认先完成时旧 source 的迟到取消不撤销新 Run；取消先完成时确认409，这与已有终态不可复活语义一致。

## 4. HTTP 错误与安全边界

- 400：动作/确认体不完整或多余字段、非 build、新图片/options；内部 Store 同样验证，不只依赖 HTTP。
- 403：当前未开放/依赖不完整、管理员外发许可关闭、不是原同意人。
- 404：会话或 source 不在当前租户/工作区/会话；不返回外 scope 的 source 事实。
- 409：request 内容冲突、已消费/取消/错等待、旧基线/过期分析/坏回执、未确认或重复/错误差异、不支持的替代等。
- 仅映射明确安全错误码；未知数据库/系统错误不伪装成成功或业务冲突。

公共返回仍是精简 RunSnapshot，不回传 proof、配置、endpoint 或发送同意。用户 Message 为 `[accept_visual_reference]`；审计只保存原有安全来源 hash/差异数，不复制 OCR/用户理由/签名密钥。源照片不是工程素材，review receipt 不是 blueprint receipt，更不是原生构建批准。

## 5. 新测试与中间记录

原流程70项，本轮新增22项，最终该文件92项。新增合同1项，contracts总506项。

- 首轮合同红测：1失败/5通过，strict旧schema拒绝 receipt/acceptedDifferences。
- 首轮流程红测：16失败/71通过（87项）。主要为 INVALID_RUN_ACTION；actor fixture误写不可空 requestedByUserId 为null，另作fixture错误保留，改为真实其他用户发请求；不是生产功能红测。
- 实现后87/87通过，包含真实HTTP确认→正式执行器/PG图→独立蓝图WAITING_INPUT。补同请求并发、确认/取消竞争、真实跨scope与动作/确认体差异绑定后，新增2项按 `-t 'full public'` 单独红测，均错误resolve；其余90项是筛选未运行，不是新增永久skip。
- 绑定修复后扩展测试出现13项失败：追加的预算断言误用不存在的 `RunBudget.run` Prisma relation，而非生产受理失败；改为同库串行测试前后预算总行数，不改产品schema。修正后完整92/92通过。首轮完整API（17:27:50 / 171.09s）也读到了该错误断言，结果63文件通过/1失败、789 passed/13 failed（802项），最终另行完整重跑，不能将中间失败隐去。
- tsc修正helper的randomUUID推断过窄（公共HTTP ID是string）；lint移除未使用解构 type 和一个多余断言。没有关规则、增永久skip、放宽timeout/重试或生产schema。

## 6. 验证命令与隔离

Node 使用仓库 `.toolchain/node-v24.19.0-darwin-arm64/bin/node`。API cwd `agent-app/apps/api`：

```sh
COOKIE_SECURE=true TEST_DATABASE_URL=postgresql://postgres@127.0.0.1:5432/kf_agent_test_generation_full_20261022_0940 KF_TEST_ALLOW_DESTRUCTIVE_RESET=1 ../../../.toolchain/node-v24.19.0-darwin-arm64/bin/node ../../node_modules/vitest/vitest.mjs run --reporter=dot
```

定向 API 用 `kf_agent_test_generation_20261022_0930`，同库结束后再跑编排器，不并发 reset。编排器 cwd `agent-app/packages/agent-orchestrator` 用同Node相对路径/明确TEST_DATABASE_URL/KF_TEST_ALLOW_DESTRUCTIVE_RESET；contracts/domain-client 各包 cwd 同Node运行 vitest 全量。

最终完整结果（2026-10-22本地时间，API在fixture/类型/lint收尾后重新完整执行）：

| 范围 | 结果 | 开始 / 耗时 |
|---|---|---|
| API | 64文件，802 passed / 0 failed / 0 skipped | 17:33:53 / 161.81s |
| agent-orchestrator | 19文件，214 passed / 0 failed / 0 skipped | 17:30:00 / 23.19s |
| contracts | 20文件，506 passed / 0 failed / 0 skipped | 17:25:35 / 1.76s |
| domain-client | 68文件，1403 passed / 0 failed / 5既有条件skipped（1408总项） | 17:30:01 / 22.30s |

共2925 passed / 5既有条件跳过，非monorepo全量；92项流程已在API内，不重复计数。最终root/API tsc、相关10文件type-aware ESLint均exit0；tracked diff --check和涉及新增文件末尾空白检查无问题。API两次完整执行均保留既有lease cleanup connection destroyed WARN，不能据通过宣布历史连接偶发问题已全部根治。

本轮没有Web/browser/build-jobs全量、完整视觉upload→download、真实provider/KF/Windows/OS kill/生产代理/多副本验收；不拿历史浏览器或内部fixture蓝图证明真实还原质量。

旧试用 `kf_agent_e2e_trial_20261021_01` 按18迁移和用户数据保护，源码21迁移；不 reset/seed/直接新代码重启指向它。LangGraph checkpoint schema 也不作为 Prisma drift 删除。

## 7. 下一模型直接续做

1. 不再重做公共 accept、后继handler或设计节点。先做 **confirm_blueprint 的下一段可信继承**：绑定当前实际展示的 blueprint revision/hash/receipt、visualBlueprintConfirmationHash、原 accepted/source链/固定base/config、原同意人，以及新 action/request 身份；原 proof 限定 accept，不能原样复制到新动作。
2. 同事务消费当前蓝图等待/创建下一后继与消息/审计/事件，前置校验之后才允许正式图进入视觉语义步骤；旧 checkpoint 的批准/构建权限仍要清理/精确校验。明确审批/取消/retry的动作边界，不能退回文字入口丢图。
3. 冻结 visual semantic/repair 的任务route/prompt/limits/身份，OCR/派生结构也经当前管理员许可、原发送同意、执行scope/fence/DB lease复核。凭据绑定原route，不把当前key发到历史host。不持事务跨网络，不隐藏二次repair。
4. 接现有 semantic/compile/签名计划/GenerationSnapshot/BuildJob/delivery，跑本地provider真实 upload→confirm→blueprint→approve→原生工程下载；再接当前UI上传/授权/review/独立蓝图/下载，前端任务需读对应设计skill。
5. 最后才评估生产resolver灰度与真实provider/KF质量验收。旧@6、前批仅message的@7和不支持新动作的旧worker均须排空整体升级；相同实验@7不等于可混部。当前公共路径代码存在不代表部署已可用，不自动升级旧试用或读取真实key。

## 8. 本轮文件清单

- 新：contracts `visual-acceptance.ts`。
- 改：contracts `agent-run.ts`、`agent-run.test.ts`、`generation-snapshot.ts`、`visual-review.ts`。
- 改：API runs `run.service.ts`、`run-store.ts`、`run.module.ts`、`visual-run-flow.integration.test.ts`；vision `visual-review.service.ts`。
- 新本报告；同步 master/handoff/P4/design/operations 最新状态，保留前批历史与异常。共10个代码/测试文件和6个文档；不自动出未要求的补丁。
<!-- end -->
