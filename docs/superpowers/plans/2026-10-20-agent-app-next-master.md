# Agent App Next Master Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在现有 agent-app 上分阶段交付成本治理、多会话工作台、持久任务、图片驱动组件生成与验证闭环，并能交接给不了解历史的模型。

**Architecture:** 保留 creative-v2 和现有确定性编译/构建。先建立观测和预算，再把执行与 SSE 解耦；最后加入视觉结构和受限局部修改，所有交付绑定版本与证据。

**Tech Stack:** NestJS / Vue 3 / TypeScript / Zod / Prisma + PostgreSQL / LangGraph / Vitest / Playwright。

**Spec:** `docs/superpowers/specs/2026-10-20-agent-app-next-design.md`

## Global Constraints

- 只规划并修改 `agent-app` 及本次配套文档；不修改其他 KingFusion 服务。
- 保留 legacy、module-v1、creative-v2；不自动迁移已有工作区的 generationWorkflow。
- 保留租户鉴权、审批、签名计划、制品绑定、workspace 构建串行与 stale-base 拒绝。
- 参考图、OCR、用户文本和模型输出均为不可信数据，不拥有执行权限。
- UI 展示执行事件与可公开决策摘要，不持久化或展示模型原始隐藏思维链。
- 不承诺固定缓存命中率、降本比例或像素级还原率；必须附测试样本和实际测量。
- 新功能默认 feature flag 关闭；先 expand 数据迁移，后灰度启用；本期不做破坏性 contract 迁移。
- 沿用 NestJS、Vue 3、TypeScript、Zod、Prisma/PostgreSQL、LangGraph、Vitest、Playwright；本期不引入 Redis、向量数据库或新前端框架。
- 遵守根 AGENTS.md：压缩代码先格式化；代码改动按实际执行日期加统一功能名“Agent工作台迭代”的前后标注；保留原有压缩标识符。
- 不覆盖、不重置、不自动提交已有未提交修改；补丁保留原目录，只包含本任务所有新增和修改文件。

---

## 1. 阅读入口与使用方法

这是计划，不是实施完成报告。2026-10-20 本轮只审视代码、核查部分官方文档并编写计划；没有修改 agent-app 业务代码，没有跑全套测试，没有生产费用或原生视觉验收结果。

阅读顺序：根 AGENTS.md → 本文件 → design spec → 当前阶段计划 → handoff。每轮只领一个任务，先写红测，再最小实现、绿测、回归和复核。后续若源文件移动，以符号名搜索确认，不能按旧行号盲改。

代码块是合同、关键实现和红测样例，不是让执行者用十行示例覆盖已有完整模块。必须保留现有合法性校验/错误映射并补全对应测试；新文件按任务指定职责组织，测试fixture不得进入生产exports。计划中的fixture字符串仅测试用途，不能成为生产默认值。

| 文档 | 任务 | 交付结果 |
|---|---|---|
| 本文件 | T00 | 安全基线与可执行测试环境 |
| `2026-10-20-agent-app-p1-cost.md` | T01–T06 | 调用账本、网关、缓存友好上下文、统一预算 |
| `2026-10-20-agent-app-p2-runs.md` | T07–T12 | 数据迁移、持久任务、事件恢复、取消与兼容 |
| `2026-10-20-agent-app-p3-workbench.md` | T13–T17 | 会话导航、时间线、附件入口、历史版本 |
| `2026-10-20-agent-app-p4-vision.md` | T18–T23 | 图片理解、能力映射、组件生成、局部编辑 |
| `2026-10-20-agent-app-p5-release.md` | T24–T27 | 证据分级、原生验证、评测与补丁发布 |
| `2026-10-20-agent-app-handoff.md` | 执行台账/移交模板 | 接手入口、停止条件、证据记录 |

所有文件位于本目录；design spec 位于相邻 `specs` 目录。任务 ID 在整个计划中唯一，不在每份文档重新从 1 开始。

## 2. 优先级、依赖和发布切片

```text
T00 → T01 → T02 → T03 → T04 → T05 → T06     P1 成本治理
       └──────────────────→ T07 → T08 → T09 → T10 → T11 → T12  P2 持久执行
                                            └→ T13 → T14 → T15 → T16 → T17 P3 界面
                         T06 + T12 + T16 → T18 → T19 → T20 → T21 → T22 → T23 P4 视觉/编辑
                                                               └→ T24 → T25 → T26 → T27 P5 验收发布
```

默认按顺序执行，避免多模型同时改 contracts/schema/store/deepseek-model。允许的并行仅限已冻结接口后的独立测试/文档；由用户选择子代理执行模式后再安排，不因本计划自动开启多代理。

发布 A：T00–T06，小范围开启 usage，再 prompt v2；旧界面可立即受益。
发布 B：T07–T17，内部租户先开 runs，再 workbench；可不等图生功能。
发布 C：T18–T24，图生和局部修改 beta，显示验证等级。
发布 D：T25–T27，具备授权原生环境后开启 runtime 验证；无环境则 native flag 保持关闭，发布其他已验收能力并明确限制。

粗排期（1 名熟悉全栈工程师，含测试，非承诺）：P0/P1 5–8 人日，P2 8–12，P3 5–8，P4 10–15，P5 5–8，总计33–51人日；不含采购/部署 KF 验证环境、产品验收等待和新控件研发。模型辅助能加快编码，不替代真实环境验证。每阶段完成后依据数据重估。

## 3. 文件边界总图

| 层 | 保留入口 | 计划新增职责 |
|---|---|---|
| contracts | `agent-app/packages/contracts/src/index.ts` | model-usage.ts、agent-run.ts、visual-reference.ts、generation-snapshot.ts、verification.ts |
| 模型/成本 | `apps/api/src/conversations/deepseek-model.ts`、fake-model.ts | `apps/api/src/models/` 网关、任务提示词、上下文、预算、价格与 usage；只抽相关职责，不全仓重构 |
| 运行 | conversation.service/controller/turn-lease | `apps/api/src/runs/` API、store、executor、event service；`run-agent-worker.ts` |
| 前端 | WorkspaceView、ConversationPanel、workspace store、api.ts、router | `stores/conversations.ts`、`stores/runs.ts`、`components/workbench/` |
| 视觉 | assets service + graph ports + domain client compiler | `apps/api/src/vision/`；domain-client 的视觉映射/局部 patch 模块 |
| 验证 | build-jobs、delivery、artifact download | `apps/api/src/verification/`、`tests/evals/`、受控 KF adapter |
| 数据 | `agent-app/prisma/schema.prisma` | 分阶段 additive migration；禁止把全部表一次写入且未使用 |

路径在各任务中精确列出。重复修改文件由对应依赖串行处理；不允许后任务重建并覆盖前任务成果。

## 4. 全局测试和命令约定

除 git 命令外，文档中的 pnpm 命令 cwd 固定为 `/Users/fengjinlong/YK/KingFusion3.6/agent-app`。跨机器替换仓库绝对根路径，不改变仓库相对布局。pnpm 版本先检查项目/lockfile兼容，不顺手升级依赖。Node 使用项目可用版本（本机有 Node24 工具链），CI 与 Windows 写入同一版本约束。

单文件示例使用 `pnpm --filter @kf/api exec vitest run src/path.test.ts`，它不会因测试文件不存在而 passWithNoTests；每次检查测试数>0。不要直接运行 package test 脚本来“验证”一个拼错的文件名。

DB 测试先执行 T00。禁止在未确认连接时直接运行 `pnpm test`、`pnpm e2e` 或任何 seed。环境使用专用 `TEST_DATABASE_URL`/`E2E_DATABASE_URL`，不得回退到生产 `DATABASE_URL`。真实模型验收需维护者提供允许使用的 key/预算；无 key 的 fake tests 可以验证控制流，不能证明缓存、视觉或费用。

每个任务提交点：完成任务范围 diff 检查和绿测后，只提交该任务自己的 hunks；若同一文件混有用户原改动，记录 patch 和证据，暂不提交，向维护者请求一个经过保存的基线。不得 `git add .`、不得把 dirty tree 整体当作自己的实现。文档中的 commit message 是建议检查点，不授权远程 push/PR。

## T00：建立安全的执行基线

**Files**

- Create: `agent-app/tests/helpers/database-safety.ts`
- Create/Test: `agent-app/tests/helpers/database-safety.test.ts`
- Create: `agent-app/tests/helpers/vitest.config.ts`（include仅本目录test文件，避免意外执行集成套件）
- Modify: `agent-app/tests/e2e/helpers/destructive-reset.ts`（复用校验，不削弱现有双开关）
- Modify: `agent-app/apps/api/src/api.integration.test.ts`、`agent-app/apps/worker/src/job-runner.integration.test.ts`，以及 `rg -l 'TRUNCATE|TEST_DATABASE_URL' agent-app --glob '*.test.ts'` 找出的所有破坏性集成测试；实际展开路径记入本任务变更清单，不修改非破坏性测试。
- Create: `agent-app/docs/agent-next-baseline.md`、`agent-app/docs/agent-next-change-manifest.md`

**Interfaces**

- Produces: `assertSafeTestDatabase(input: { url: string | undefined; allowReset: string | undefined; expectedPrefix: "kf_agent_test_" | "kf_agent_e2e_" }): void`。
- Consumes: 已有 E2E destructive-reset 守卫；保持原有拒绝语义。

- [ ] 记录 `git status --short`、`git rev-parse HEAD`、当前分支、Node/pnpm/Postgres版本；基线文件仅存路径与版本，不存连接密码；对将要改动的 dirty 文件记录已有变更摘要。确认继续在现工作目录还是由维护者保存后另建 worktree。
- [ ] 写独立红测（不得连接数据库）：

```ts
import { describe, expect, it } from "vitest";
import { assertSafeTestDatabase } from "./database-safety.js";
describe("database reset guard", () => {
  it("rejects absent and production databases", () => {
    for (const url of [undefined, "postgresql://localhost/production", "postgresql://localhost/kf_agent_test"]) {
      expect(() => assertSafeTestDatabase({ url, allowReset: "1", expectedPrefix: "kf_agent_test_" })).toThrow();
    }
  });
  it("requires both an explicit flag and isolated name", () => {
    const url = "postgresql://localhost/kf_agent_test_agent_next";
    expect(() => assertSafeTestDatabase({ url, allowReset: "0", expectedPrefix: "kf_agent_test_" })).toThrow();
    expect(() => assertSafeTestDatabase({ url, allowReset: "1", expectedPrefix: "kf_agent_test_" })).not.toThrow();
  });
});
```

- [ ] 创建专用config为 `defineConfig({test:{include:["tests/helpers/*.test.ts"]}})`，从vitest/config导入defineConfig；在agent-app执行 `pnpm exec vitest run --config tests/helpers/vitest.config.ts`。预期缺实现导致FAIL，测试数量不能为0，不能意外启动其他DB测试。
- [ ] 实现核心条件，且在任何 Prisma import/连接/seed 之前调用；动态 import 延后到守卫通过之后。

```ts
export function assertSafeTestDatabase(input: {
  url: string | undefined; allowReset: string | undefined;
  expectedPrefix: "kf_agent_test_" | "kf_agent_e2e_";
}): void {
  if (!input.url || input.allowReset !== "1") throw new Error("TEST_DATABASE_NOT_AUTHORIZED");
  const parsed = new URL(input.url);
  const databaseName = decodeURIComponent(parsed.pathname.slice(1));
  if (!["postgres:", "postgresql:"].includes(parsed.protocol)
    || !databaseName.startsWith(input.expectedPrefix)
    || databaseName.length <= input.expectedPrefix.length) throw new Error("UNSAFE_TEST_DATABASE");
}
```

- [ ] 补充 URL 编码名称/空密码/错误协议测试；绿测后在维护者指定隔离数据库运行现有 baseline 集成测试，记录通过/失败/跳过及原因；已有失败单列，不能归罪本轮，也不能删除测试使其变绿。
- [ ] 检查新代码标注；记录任务文件清单和建议提交 `test(agent): guard isolated integration databases`。后续所有数据库任务依赖此门槛。

## 5. 需求覆盖和最终 Definition of Done

| 需求 | 任务与证据 |
|---|---|
| DeepSeek 成本定位/优化 | T01–T06、T26：真实 usage 和固定语料 A/B |
| 多会话与过程展示 | T07–T15：隔离、重连、状态转换、交互 E2E |
| 图片驱动现有组件 | T16、T18–T22：像素请求证据、控件白名单、原生制品 |
| 局部编辑与历史 | T17、T23：不变区域 hash、stale-base 竞争测试 |
| 工程质量不足 | T20、T24–T26：能力证据、静态检查、可选原生截图/交互 |
| 安全、可回退、交接 | T00、T07–T12、T18、T27、handoff |

完成必须同时满足：任务级绿测、相关 legacy/module/creative 回归、租户隔离与安全测试、迁移兼容、Web build、精确证据链接、flag 回退演练、完整补丁清单；没有原生环境时标注运行验证未完成，不把它勾选为已通过。

## 6. 交接给下一模型的启动语

> 请先读根 AGENTS.md、docs/superpowers/plans/2026-10-20-agent-app-next-master.md、对应 design spec 和 handoff 文件。当前要求是按计划实施，不要重写架构。先核对 dirty 工作树与任务台账，只执行第一个依赖已满足的未完成任务，遵守先红测再实现再绿测。所有代码改动采用实际日期和“Agent工作台迭代”标注；不重置用户改动，不访问生产数据库，不修改其他 KingFusion 服务。每完成一个任务记录文件、测试命令/结果、偏差及下一任务；真实模型/KF 环境缺失必须明确报告，不伪造通过。
