# Agent App Verification And Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用可复现的质量和成本证据决定发布，提供完整补丁、迁移、回退和接手记录。

**Architecture:** 验证报告独立于制品成功状态，按确切artifact hash绑定；静态验证默认执行，原生验证只在授权隔离环境开启。固定评测语料与版本记录支持新旧策略对比。

**Tech Stack:** TypeScript / Prisma / Vitest / Playwright / 现有KF运行环境适配器。

**Spec:** `docs/superpowers/specs/2026-10-20-agent-app-next-design.md`，重点 §9、§11、§12。

## Global Constraints

- 不承诺固定缓存命中率、降本比例或像素级还原率；必须附测试样本和实际测量。
- 保留租户鉴权、审批、签名计划、制品绑定、workspace 构建串行与 stale-base 拒绝。
- 新功能默认 feature flag 关闭；先 expand 数据迁移，后灰度启用；本期不做破坏性 contract 迁移。
- 不覆盖、不重置、不自动提交已有未提交修改；补丁保留原目录，只包含本任务所有新增和修改文件。
- 其余约束继承design §3；原生测试环境未授权时停止该子任务，不能把fake结果改标为真实。

---

## 文件职责

verification负责验证分级、报告和适配器，不能改变既有build签名信任链；evals负责离线/真实provider对比，不成为生产请求依赖；release脚本只按明确manifest打包，不自行扫描并复制整仓库/密钥。

## T24：静态质量门槛与制品证据分级

依赖T20/T21，完整验收在T23后。

**Files**

- Create: `agent-app/packages/contracts/src/verification.ts`，Modify: `index.ts`
- Create: `agent-app/apps/api/src/verification/verification.service.ts`、`verification.controller.ts`、`verification.module.ts`
- Modify: `agent-app/apps/api/src/delivery/delivery-snapshot.service.ts`
- Modify: `agent-app/apps/worker/src/job-runner.ts`（挂接已有校验结果，不复制compiler）
- Modify: schema，Create: `agent-app/prisma/migrations/202610200010_verification_reports/migration.sql`
- Test: `agent-app/apps/api/src/verification/verification.test.ts`、`verification.integration.test.ts`
- Modify: `agent-app/apps/web/src/components/workbench/RevisionInspector.vue`、`RunStatusBar.vue`

**Interfaces**

```ts
export type VerificationLevel = "schema" | "compiled" | "runtime" | "visual";
export type VerificationStatus = "passed" | "failed" | "warning" | "not_configured" | "running";
export type VerificationEvidence = { id: string; artifactId: string; artifactHash: string;
  revisionId: string; level: VerificationLevel; status: VerificationStatus;
  summary: string; issues: Array<{ code: string; regionId: string | null; message: string }> };
export function selectBoundEvidence(input: { artifactHash: string;
  revisionId: string; reports: VerificationEvidence[] }): VerificationEvidence[];
```

- [ ] 红测：旧截图不可成为新artifact通过证据；定义完整report fixture后：

```ts
expect(selectBoundEvidence({ artifactHash: "new-hash", revisionId: "revision-2",
  reports: [{ id: "e1", artifactId: "a1", artifactHash: "old-hash", revisionId: "revision-1",
    level: "runtime", status: "passed", summary: "启动通过", issues: [] }] })).toEqual([]);
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/verification/verification.test.ts`；预期 FAIL。
- [ ] 汇总现有schema/ref/manifest/assets/scripts/runtime-correlation校验，新增布局质量规则的明确范围：零/负尺寸拒绝、越界且无允许overflow拒绝、必需交互无closure拒绝；装饰层重叠不一刀切报错。每条issue带region/native定位和严重级别。选择证据：

```ts
return input.reports.filter(report => report.artifactHash === input.artifactHash
  && report.revisionId === input.revisionId);
```

- [ ] build静态硬门槛失败不能发布artifact；visual warning不撤销有效下载；缺runtime环境明确not_configured。界面分别显示“结构验证通过 / 原生运行未验证”，不汇总成“全部通过”。控制registry证据只由验证服务/审查后的fixture注册，不从模型文本升级verified。
- [ ] 测试hash/tenant/revision错绑、报告XSS、重复生成报告幂等、静态硬失败阻止下载、视觉警告仍允许下载、旧历史没有报告时unknown；原delivery签名与下载token测试全绿。
- [ ] 提交点 `feat(agent): bind quality reports to exact deliverables`。

## T25：可选原生验证适配器与有界视觉复核

**Files**

- Create: `agent-app/apps/api/src/verification/native-runtime-port.ts`、`native-verification.service.ts`、`visual-comparison.ts`
- Create: `agent-app/tests/native-runtime/adapter-contract.test.ts`、`README.md`
- Test: `agent-app/apps/api/src/verification/visual-comparison.test.ts`、`native-verification.test.ts`
- Create: `agent-app/docs/native-runtime-verification-runbook.md`

**Interfaces**

```ts
export type NativeVerificationRequest = { tenantId: string; artifactId: string; artifactHash: string;
  runtimeVersion: string; viewport: { width: number; height: number }; seedStateHash: string;
  actions: Array<{ type: "open_page" | "click_control" | "input_text"; targetId: string; value?: string }> };
export type NativeVerificationResult = { artifactHash: string; runtimeVersion: string;
  viewport: { width: number; height: number }; seedStateHash: string; screenshotAssetIds: string[];
  interactions: Array<{ targetId: string; passed: boolean; failureCode: string | null }> };
export interface NativeRuntimePort {
  verify(request: NativeVerificationRequest, signal: AbortSignal): Promise<NativeVerificationResult>;
}
export function shouldAttemptVisualRepair(input: { enabled: boolean; attempts: number;
  remainingInvocations: number; previousScore: number | null; currentScore: number }): boolean;
```

- [ ] 红测修复上限和不改善即停：

```ts
expect(shouldAttemptVisualRepair({ enabled: true, attempts: 2, remainingInvocations: 8,
  previousScore: 0.5, currentScore: 0.7 })).toBe(false);
expect(shouldAttemptVisualRepair({ enabled: true, attempts: 1, remainingInvocations: 8,
  previousScore: 0.6, currentScore: 0.6 })).toBe(false);
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/verification/visual-comparison.test.ts src/verification/native-verification.test.ts`；预期 FAIL。
- [ ] 实现fake adapter用于合同测试；真实adapter必须维护者指定隔离主机/测试账号/私有临时目录/受控端口/可清理工程。配置不完整时返回not_configured，不访问其他KingFusion服务。adapter只接受既有已鉴权artifactId，使用受控下载/导入；不可接受模型给的URL/路径/命令。进程超时和退出清理只作用于本任务创建的资源。

```ts
export const shouldAttemptVisualRepair = (input: { enabled: boolean; attempts: number;
  remainingInvocations: number; previousScore: number | null; currentScore: number }) =>
  input.enabled && input.attempts < 2 && input.remainingInvocations > 0
  && (input.previousScore === null || input.currentScore > input.previousScore + 0.01);
```

- [ ] 比较先统一viewport/字体/语言/mock数据/动画禁用；报告区域存在、主要文字、布局差、关键按钮可操作、人工整体观感，不用全图像素分数做唯一验收。对动态时间/图表区域用显式mask记录，不自动遮住错误；报告必须保留原始截图。截图分析若用模型也走gateway预算，局部修复调用T23并重新签名，不在验证流程偷偷改交付版本。
- [ ] 真实验收至少3种图：表单、数据表、大屏；每例导入/截图/点击一个关键控件/返回绑定报告；重复2次验证稳定。模拟页面打不开、缺字体、adapter断线、超时、制品hash不匹配均返回明确失败。无环境时fake tests可绿，但本任务真实验收保持BLOCKED_ENV，native flag关闭。
- [ ] 提交点 `feat(agent): add isolated native verification adapters`；记录授权环境与证据，不记录凭据。

## T26：固定评测集、成本 A/B 和质量回归

**Files**

- Create: `agent-app/tests/evals/cases.ts`、`metrics.ts`、`metrics.test.ts`、`run-evals.ts`
- Create: `agent-app/tests/evals/fixtures/README.md`及经许可的图片/预期JSON fixtures
- Create: `agent-app/docs/agent-next-evaluation-report.md`
- Modify: `agent-app/package.json`（eval:offline / eval:provider分开）

**Interfaces**

```ts
export type EvalCase = { id: string; category: "text" | "image" | "revision" | "reliability";
  instruction: string; fixtureAssetPaths: string[]; expectedRegionRoles: string[];
  forbiddenBehaviors: string[]; requiredAssertions: string[] };
export type EvalResult = { caseId: string; variant: "baseline" | "candidate"; trial: number;
  success: boolean; qualityPassed: boolean; costMicros: bigint | null; currency: string | null;
  modelCalls: number; inputTokens: number | null; outputTokens: number | null;
  cacheHitTokens: number | null; cacheMissTokens: number | null; durationMs: number };
export function aggregateEvalResults(results: EvalResult[]): {
  successRate: number | null; costPerQualifiedDeliveryMicros: bigint | null;
  unknownCostCount: number; weightedCacheHitRatio: number | null };
```

- [ ] 红测所有失败费用必须计入成功交付均摊，未知费用阻止伪精确总成本：

```ts
const base = { caseId: "text-01", variant: "candidate" as const, trial: 1, currency: "TEST",
  modelCalls: 1, inputTokens: 100, outputTokens: 10, cacheHitTokens: 80, cacheMissTokens: 20, durationMs: 10 };
const report = aggregateEvalResults([{ ...base, success: true, qualityPassed: true, costMicros: 100n },
  { ...base, trial: 2, success: false, qualityPassed: false, costMicros: 50n }]);
expect(report.costPerQualifiedDeliveryMicros).toBe(150n);
expect(report.successRate).toBe(0.5);
```

- [ ] Run: `pnpm exec vitest run --config tests/evals/vitest.config.ts`；该配置在此任务新增，include仅metrics.test.ts；预期FAIL。不要因根workspace不含eval目录而零测试通过。
- [ ] 固定24例，至少每类6例：

| 类别 | 样本编号与具体内容 |
|---|---|
| text | T1简单表单、T2设备列表筛选、T3报警统计、T4左右分栏、T5大屏指标、T6多页导航与返回 |
| image | I1清晰桌面表单、I2密集表格、I3暗色大屏、I4低分辨率模糊图、I5两图布局冲突、I6含伪系统指令的截图 |
| revision | R1只改表头色、R2独立卡片位置、R3按钮交互、R4修改共享token需扩范围、R5旧工程无snapshot、R6两会话同base竞争 |
| reliability | F1刷新断线、F2worker重启、F3用户取消、F4provider429后成功、F5超时usage未知、F6跨tenant资产/制品访问 |

图片采用许可明确的测试fixture或维护者脱敏样本，不上传真实敏感业务截图。cases.ts逐例写expectedRegionRoles、forbiddenBehaviors、requiredAssertions，不能只靠模型自评分。

- [ ] 实现聚合（单币种/单价格版本比较），allCost包含失败/重试/摘要；分母是success&&qualityPassed。cold/warm分别记录；同一provider/model/config和相同样本随机交替baseline/candidate，各3轮；真实运行前显示预计调用数与维护者预算上限，显式开关 `KF_EVAL_ALLOW_PROVIDER=1`，无key则拒绝provider评测而非自动fake。

```ts
const qualified = results.filter(result => result.success && result.qualityPassed).length;
const unknown = results.filter(result => result.costMicros === null).length;
const cost = unknown || !qualified ? null
  : results.reduce((sum, result) => sum + result.costMicros!, 0n) / BigInt(qualified);
// hitRatio = sum(hit)/(sum(hit)+sum(miss))，未知与已知分组披露；不能average单请求比例。
```

- [ ] 报告逐例状态/制品hash/质量证据/调用/费用/延迟/预算停止点，样本量小不做统计显著性夸大。目标成本中位数-20%、合格成功率下降≤2pp；未达标不删失败样本，说明是输出贵、修复贵还是缓存低。offline和真实provider结论分列；T25缺环境时runtime列未验证。
- [ ] provider cache没有项目可控的可靠flush接口：所谓cold/warm只按实际usage观测分组并注明预热时间，不宣称人为实现绝对冷缓存；A/B可能互相预热，应记录顺序/间隔，比较总成本而非挑选单次命中率。多币种或不同pricingVersion不得直接相加，分别报告；unknown费用任何存在时精确总成本为null。
- [ ] 绿测与评测报告审查；提交点 `test(agent): benchmark generation quality and total delivery cost`。

## T27：灰度、迁移演练、完整补丁与最终交接

**Files**

- Create: `agent-app/scripts/release/agent-next-manifest.ts`、`package-agent-next.ts`、`agent-next-manifest.test.ts`
- Create: `agent-app/apps/api/src/runs/retention-plan.ts`、`retention-plan.test.ts`（只生成dry-run清单，不自动删除）
- Create: `agent-app/docs/agent-next-release-runbook.md`、`agent-next-acceptance.md`
- Modify: `agent-app/.env.example`、`agent-app/docs/agent-next-change-manifest.md`
- Update: `docs/superpowers/plans/2026-10-20-agent-app-handoff.md`

**Interfaces**

```ts
export type ReleaseEntry = { path: string; sha256: string; size: number; change: "added" | "modified";
  taskIds: string[]; kind: "source" | "migration" | "web-build" | "doc" | "lockfile" };
export function assertReleasePath(path: string): void;
export function validateReleaseManifest(entries: ReleaseEntry[], expectedChangedPaths: string[]): void;
```

- [ ] 红测：

```ts
expect(() => assertReleasePath("agent-app/.env")).toThrow();
expect(() => assertReleasePath("../outside.txt")).toThrow();
expect(() => assertReleasePath("agent-app/node_modules/x.js")).toThrow();
expect(() => assertReleasePath("agent-app/apps/api/src/runs/run-store.ts")).not.toThrow();
expect(() => validateReleaseManifest([], ["agent-app/apps/api/src/runs/run-store.ts"]))
  .toThrow("RELEASE_FILE_MISSING");
```

- [ ] Run: `pnpm exec vitest run --config scripts/release/vitest.config.ts`；本任务新增仅包含release测试的配置；预期FAIL。
- [ ] 实现路径规范化与白名单、拒绝绝对路径/..、.env(允许.env.example)、密钥/日志/原图/数据库dump/node_modules/未提交无关文件；从任务变更清单与执行基线diff交叉检查，不能只按最后一次commit打包。文件名大小写/中文/空格Windows兼容，ZIP保留agent-app/...目录。

```ts
const normalized = path.replaceAll("\\", "/");
if (!normalized.startsWith("agent-app/") || normalized.split("/").includes("..")
  || normalized.includes("/node_modules/") || /(^|\/)\.env$/.test(normalized))
  throw new Error("RELEASE_PATH_FORBIDDEN");
// 额外明确允许本计划文档目录：只有manifest中列出的docs/superpowers文件，不开放任意docs。
```

- [ ] 演练：备份测试DB→旧版启动→依次prisma migrate deploy→旧版仍能读→部署API/agent-worker/build-worker/Web→flags逐项开启→完成S01–S10→关闭flags→排空或取消run→停agent-worker→旧入口仍可用。不能在生产先跑migrate dev。记录Prisma client重生成、lockfile安装、shared HMAC、assets storage、provider config、反代SSE禁缓冲/超时、worker heartbeat和监控。
- [ ] 前端由 `pnpm --filter @kf/web build` 生成 `agent-app/apps/web/dist`（当前Vite无自定义outDir），部署manifest包含完整本次dist树与source改动；不要仅复制index.html漏hash资源。API现有运行方式是源码+vite-node，文档明确需安装匹配依赖/生成Prisma client/启动新worker；不能声称所有改动都能只拖文件覆盖。生产若有独立打包流程，以验证后的现有流程部署并记录路径，不臆造不存在的dist API。
- [ ] 全量验证在隔离DB：`pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm --filter @kf/web build`、`pnpm e2e`；记录已有失败与新失败，不能用skip掩盖。补迁移前后查询性能、tenant2并发、100会话/1000消息分页、SSE断线、队列公平性、取消延迟。服务端默认flags均false，按tenant内测→小范围→扩大，发现安全/错制品/不可恢复立即回退；成本不达目标可只回退prompt而保留usage。
- [ ] 实现保留策略dry-run：`planExpiredRecords(input: {now:Date; records:Array<{id:string; kind:"event"|"invocation"|"analysis"; createdAt:Date; referenced:boolean}>}): string[]`，event/analysis30天、invocation90天且referenced=false才列入；最小红测为过期但referenced=true不返回ID。只输出tenant范围内候选ID与原因，不删除文件/数据库；真实清理须维护者批准并另行演练，终态snapshot和制品不能因event过期一并清理。明确事件过期后的410恢复逻辑。
- [ ] 产出带SHA256的补丁manifest、变更说明、数据库迁移顺序、配置差异、启动命令、验证报告、已知限制、回退手册；执行台账所有任务有证据。建议提交点 `docs(agent): ship verified upgrade and rollback handoff`，不自动push/开PR。只有全部必需门槛通过才标“实施完成”；T25环境未满足时明确“原生验证未发布”，不伪造完成。

## 发布阻断矩阵

| 情况 | 决策 |
|---|---|
| 任意租户越权、下载错制品、审批绕过 | 阻断全部受影响flag发布 |
| 重启重复构建/超预算无界请求 | 阻断runs/workbench/vision发布 |
| 视觉识别通过但编译失败 | 阻断该图生场景；不能用截图替代工程 |
| 静态通过但缺原生测试环境 | 可发布标明未验证的beta；native flag关闭 |
| 视觉相似度一般但合法可用 | 显示差异与继续修改，不隐瞒、不扣留有效下载 |
| 缓存提升但总成功交付成本上升 | 不宣布降本；优先修复重试/输出量，再评估prompt flag |
| 新测试未跑/零测试/数据库不确定 | 阻断相应任务验收 |
