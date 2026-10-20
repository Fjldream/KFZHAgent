# Agent App Reference Image Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 用参考UI图驱动现有KF组件生成，并能在稳定语义基线上局部修改。

**Architecture:** 图像只进入专用视觉理解步骤；结构化VisualReferenceSpec经能力匹配进入现有SolutionImplementationPlan和确定性编译。所有像素、语义计划、资产和制品都带hash和版本来源，不另建模型直接写native文件的旁路。

**Tech Stack:** TypeScript / Zod / 现有domain-client编译器 / Prisma / sharp / Vitest / Vue。

**Spec:** `docs/superpowers/specs/2026-10-20-agent-app-next-design.md`，重点 §10、§11。

## Global Constraints

- 参考图、OCR、用户文本和模型输出均为不可信数据，不拥有执行权限。
- 保留租户鉴权、审批、签名计划、制品绑定、workspace 构建串行与 stale-base 拒绝。
- 不承诺固定缓存命中率、降本比例或像素级还原率；必须附测试样本和实际测量。
- 新功能默认 feature flag 关闭；先 expand 数据迁移，后灰度启用；本期不做破坏性 contract 迁移。
- 不覆盖、不重置、不自动提交已有未提交修改；补丁保留原目录，只包含本任务所有新增和修改文件。
- 其余约束继承design §3；未支持的控件不得伪造，截图不能替代交互需求确认。

---

## 文件职责

`apps/api/src/vision/`负责可信文件访问、provider调用和分析持久化；`packages/contracts`只放schema；`packages/domain-client/src/visual/`只做纯映射/验证，不读数据库、不请求模型；`generation/`保存编译前后语义快照。当前sourceMap和snapshot是局部修改前置条件，不从native压缩JSON临时猜。

## T18：参考图上传、派生像素与附件归属

依赖T06/T12/T16。

**Files**

- Create: `agent-app/apps/api/src/vision/reference-asset.controller.ts`、`reference-asset.service.ts`、`image-policy.ts`
- Modify: `agent-app/apps/api/src/assets/asset.service.ts`、`assets/asset.controller.ts`
- Modify: `agent-app/apps/api/src/runs/run.service.ts`、`run.module.ts`
- Modify: `agent-app/prisma/schema.prisma`、`agent-app/apps/api/package.json`、`agent-app/pnpm-lock.yaml`
- Create: `agent-app/prisma/migrations/202610200007_reference_assets/migration.sql`
- Test: `agent-app/apps/api/src/vision/image-policy.test.ts`、`reference-asset.integration.test.ts`

**Interfaces**

```ts
export type ReferenceImageFacts = { mimeType: string; byteSize: number; width: number; height: number; animated: boolean };
export function validateReferenceImage(facts: ReferenceImageFacts): void;
export type TrustedReferenceImage = { tenantId: string; workspaceId: string; assetId: string;
  sourceHash: string; derivativeHash: string; mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number; height: number; bytes: Uint8Array; scale: number };
export interface ReferenceAssetService {
  resolve(tenantId: string, workspaceId: string, assetId: string): Promise<TrustedReferenceImage>;
}
```

- [ ] 红测：

```ts
expect(() => validateReferenceImage({ mimeType: "image/png", byteSize: 1024,
  width: 9000, height: 100, animated: false })).toThrow("IMAGE_DIMENSIONS_EXCEEDED");
expect(() => validateReferenceImage({ mimeType: "image/svg+xml", byteSize: 1024,
  width: 100, height: 100, animated: false })).toThrow("IMAGE_FORMAT_UNSUPPORTED");
expect(() => validateReferenceImage({ mimeType: "image/png", byteSize: 1024,
  width: 1440, height: 900, animated: false })).not.toThrow();
```

- [ ] Run: `pnpm --filter @kf/api exec vitest run src/vision/image-policy.test.ts`；预期 FAIL。
- [ ] 复用原asset sniff/full validation，sharp以limitInputPixels=32_000_000解码，拒绝动画/损坏/伪MIME，去metadata生成≤2048长边派生图，保持aspect ratio；raw原图加密/权限按原storage策略，文件名不拼物理路径。关键校验：

```ts
if (!["image/png", "image/jpeg", "image/webp"].includes(facts.mimeType) || facts.animated)
  throw new Error("IMAGE_FORMAT_UNSUPPORTED");
if (facts.byteSize > 10 * 1024 * 1024) throw new Error("IMAGE_BYTES_EXCEEDED");
if (facts.width <= 0 || facts.height <= 0 || Math.max(facts.width, facts.height) > 8192
  || facts.width * facts.height > 32_000_000) throw new Error("IMAGE_DIMENSIONS_EXCEEDED");
```

- [ ] migration增加MessageAttachment与ReferenceAssetDerivative（tenantId、assetId、sourceHash、derivativeHash、transform Json、storageKey、byteSize），assetId复合归属；run受理时锁定附件列表到inputSnapshot；客户端移除草稿只移引用，不立即删除asset。resolve只接受assetId，不接受用户URL/path，拒绝跨workspace；HTTP body parser在读取巨大body前限流限大小，租户总配额默认1GiB且可配置。
- [ ] 集成测穿越文件名、伪JPEG、解码炸弹、动画WebP、10MiB边界、跨tenant/跨workspace、重复上传同hash、读取鉴权、上传取消、缺外发授权。安装sharp后macOS/Linux/Windows各做decode smoke，不带本机node_modules出补丁。
- [ ] 绿测并提交点 `feat(agent): secure reference image ingestion and derivatives`。

## T19：视觉结构合同、真实像素请求与分析缓存

**Files**

- Create: `agent-app/packages/contracts/src/visual-reference.ts`，Modify: `index.ts`
- Create: `agent-app/apps/api/src/vision/visual-analysis.service.ts`、`visual-analysis-cache.ts`、`visual-analysis.controller.ts`
- Modify: `agent-app/apps/api/src/models/task-prompts.ts`、`model-config.ts`
- Modify: schema，Create: `agent-app/prisma/migrations/202610200008_visual_analysis/migration.sql`
- Test: `agent-app/packages/contracts/src/visual-reference.test.ts`
- Test: `agent-app/apps/api/src/vision/visual-analysis.test.ts`、`visual-analysis.integration.test.ts`

**Interfaces**

```ts
// VisualRegion、VisualReferenceSpec严格采用design §10形状，导出对应Zod schema。
export type VisualAnalysisInput = { tenantId: string; workspaceId: string; runId: string;
  assetId: string; instruction: string; analysisVersion: string };
export type VisualAnalysisResult = { id: string; specHash: string; spec: VisualReferenceSpec;
  reused: boolean; modelConfigHash: string };
export interface VisualAnalysisService {
  analyze(input: VisualAnalysisInput, signal: AbortSignal): Promise<VisualAnalysisResult>;
  revise(tenantId: string, analysisId: string, expectedHash: string, spec: VisualReferenceSpec): Promise<VisualAnalysisResult>;
}
export function visualAnalysisCacheKey(input: { tenantId: string; sourceHash: string;
  analysisVersion: string; modelConfigHash: string; instructionHash: string }): string;
```

- [ ] 红测schema与cache隔离；在test文件定义有效最小spec：sourceAssetId=a1/sourceHash为64hex/viewport1440×900/一个content region范围0,0,1,1/designTokens合法hex/无uncertainties。

```ts
expect(VisualReferenceSpecSchema.safeParse({ ...validSpec,
  regions: [{ ...validSpec.regions[0], box: { x: 0.9, y: 0, width: 0.2, height: 1 } }] }).success).toBe(false);
expect(visualAnalysisCacheKey({ ...cacheInput, tenantId: "a" }))
  .not.toBe(visualAnalysisCacheKey({ ...cacheInput, tenantId: "b" }));
```

- [ ] Run: contracts visual-reference test + API visual-analysis.test；预期 FAIL。
- [ ] 校验region最多100、text每条≤2000、parent无环、ID唯一、颜色hex、confidence0..1、box边界；模型不可信sourceAssetId/hash必须以服务器真实facts替换并校验，不允许模型换素材。构造真正像素请求：

```ts
const dataUrl = `data:${image.mimeType};base64,${Buffer.from(image.bytes).toString("base64")}`;
const userMessage: ModelMessage = { role: "user", content: [
  { type: "text", text: instruction },
  { type: "image_url", image_url: { url: dataUrl, detail: "high" } },
] };
// image=ReferenceAssetService.resolve；只在gateway transport内短暂持有base64，不落日志/events。
```

- [ ] 分别限制文本/图像/总HTTP16MiB并验证route.supportsVision；usage/预算都走gateway。图片分析异常有限修复占统一budget，不能独立无限retry。分析cache只复用VALID且模型/指令/版本全匹配，TTL30天，用户更改生成新analysis而非覆盖旧spec。并发相同key用数据库唯一约束/短lease防止重复发请求，不跨租户复用。
- [ ] 新API `GET /api/v2/visual-analyses/:id` 和 `PATCH /api/v2/visual-analyses/:id`，PATCH带expectedHash/spec；只允许修改region文本/role/box/tokens/uncertainties，不修改source facts。集成测试截获providerbody验证有像素而不是文件名；同图复用少一次调用；文本内“忽略系统指令”不影响工具权限；模型输出URL/path拒绝。
- [ ] 绿测、typecheck；提交点 `feat(agent): analyze UI references with versioned visual specs`。

## T20：现有控件匹配、能力证据与缺口解释

**Files**

- Create: `agent-app/packages/domain-client/src/visual/region-mapping.ts`、`capability-evidence.ts`
- Modify: `agent-app/packages/domain-client/src/planning/capability-retrieval.ts`
- Modify: `agent-app/packages/domain-client/src/style/control-capability-registry.ts`
- Modify: `agent-app/packages/domain-client/src/design-knowledge/design-knowledge-catalog.ts`
- Test: `agent-app/packages/domain-client/src/visual/region-mapping.test.ts`、`capability-evidence.test.ts`

**Interfaces**

```ts
export type CapabilityEvidence = { id: string; controlType: string; properties: string[];
  interactions: string[]; runtimeVersion: string; status: "verified" | "failed" | "unverified";
  artifactHash: string | null; reportId: string | null };
export type MappingCandidate = { capabilityId: string; controlType: string; supportedRoles: VisualRegion["role"][];
  evidence: CapabilityEvidence[]; fallback: string | null };
export function mapVisualRegions(input: { regions: VisualRegion[]; candidates: MappingCandidate[];
  targetRuntimeVersion: string }): RegionMapping[];
```

- [ ] 红测：不给不存在控件凭空输出属性；有control但无目标runtime证据只能supported_unverified。

```ts
const region: VisualRegion = { id: "chart-1", parentId: null, role: "chart",
  box: { x: 0, y: 0, width: 1, height: 1 }, text: [], confidence: 0.9, interactionHint: null };
expect(mapVisualRegions({ regions: [region], candidates: [], targetRuntimeVersion: "3.6" })[0])
  .toMatchObject({ regionId: "chart-1", controlType: null, support: "unsupported" });
```

- [ ] Run: `pnpm --filter @kf/domain-client exec vitest run src/visual/region-mapping.test.ts src/visual/capability-evidence.test.ts`；预期 FAIL。
- [ ] 先用现有capability retrieval提取候选，再按region role/所需属性/交互/版本排序；保留原候选数量上限，稳定排序tie-break capabilityId。证据判断必须匹配控件+属性+interaction+runtime，不能某个按钮验证过就宣布所有脚本能力verified。

```ts
const support = !candidate ? "unsupported"
  : candidate.evidence.some(evidence => evidence.status === "verified"
    && evidence.runtimeVersion === input.targetRuntimeVersion && evidence.reportId !== null)
    ? "verified" : "supported_unverified";
// 属性/交互子集校验通过后才能选用上述verified分支。
```

- [ ] 对pending-verification保留真实标签；特殊chart/partial shell/deferred preserve-only明确不可用于对应新生成能力。unsupported输出原因和已有可实现替代，例如“复杂图表暂以数据表呈现”，不自动替换且假装等价。用户选择保留未验证能力时记录acknowledgement，并在交付卡持续显示未验证。
- [ ] 测试同语义稳定候选、缺字体/无图表/未知脚本、旧runtime证据不升格、控制类型只来自registry、没有把module-v1五种当全局限制；现有capability retrieval和compiler测试不退化。
- [ ] 提交点 `feat(agent): map visual regions to evidence-aware capabilities`。

## T21：视觉约束进入语义计划和不可变 GenerationSnapshot

**Files**

- Create: `agent-app/packages/contracts/src/generation-snapshot.ts`，Modify: `index.ts`
- Create: `agent-app/packages/domain-client/src/visual/visual-plan-constraints.ts`
- Create: `agent-app/apps/api/src/generation/generation-snapshot.service.ts`
- Modify: `agent-app/apps/api/src/conversations/graph-ports.ts`、`deepseek-model.ts`
- Modify: `agent-app/packages/domain-client/src/solution-compile/solution-compiler.ts`、`layout-compiler.ts`
- Modify: schema，Create: `agent-app/prisma/migrations/202610200009_generation_snapshots/migration.sql`
- Test: `agent-app/packages/domain-client/src/visual/visual-plan-constraints.test.ts`
- Test: `agent-app/apps/api/src/generation/generation-snapshot.integration.test.ts`

**Interfaces**

```ts
export type SourceMapEntry = { regionId: string; componentId: string; nativeIds: string[] };
export type GenerationSnapshotInput = { tenantId: string; runId: string; baseRevisionId: string;
  blueprint: unknown; implementationPlan: unknown; capabilityCatalogVersion: string;
  compilerVersion: string; assetManifest: unknown; visualSpecId: string | null; sourceMap: SourceMapEntry[] };
export interface GenerationSnapshotService {
  create(input: GenerationSnapshotInput): Promise<{ id: string; contentHash: string }>;
  bindRevision(tenantId: string, snapshotId: string, revisionId: string, buildJobId: string): Promise<void>;
}
export function validateVisualPlanReferences(input: { regionIds: string[];
  mappings: RegionMapping[]; sourceMap: SourceMapEntry[] }): void;
```

unknown字段在service入口必须用已有blueprint/implementation/asset schema parse，持久化规范对象；不能把unknown当作免校验。bindRevision是单次nullable绑定，不更新已固定内容。

- [ ] 红测未匹配区域/重复nativeID/跨区域引用：

```ts
expect(() => validateVisualPlanReferences({ regionIds: ["header"], mappings: [],
  sourceMap: [{ regionId: "unknown", componentId: "c1", nativeIds: ["n1"] }] }))
  .toThrow("UNKNOWN_VISUAL_REGION");
```

- [ ] Run: `pnpm --filter @kf/domain-client exec vitest run src/visual/visual-plan-constraints.test.ts`；预期 FAIL。
- [ ] 增implementation prompt输入visualSpec/mappings/acceptedDifferences，仅模型生成语义组件关系、控件类型和受支持属性；布局坐标仍由compiler。若要加合同字段，升级schemaVersion并为旧计划保留parse path，不能直接改变旧signed plan hash含义。

```ts
const allowed = new Set(input.regionIds);
for (const entry of input.sourceMap) {
  if (!allowed.has(entry.regionId)) throw new Error("UNKNOWN_VISUAL_REGION");
}
// compile阶段稳定生成nativeIds，并建立region→component→native映射；不得把模型原始id直接作为文件路径。
```

- [ ] 编译前语义输出先按T09存completed step；编译器在内存产生完整sourceMap后创建不可变GenerationSnapshot，再入队build，不创建后续覆盖内容的可变草稿。revision绑定在build成功事务链中幂等完成，失败snapshot保留run关联但无revision。只将purpose=material经批准的facts传编译器；reference图不进入res/images。sourceMap可重复component归属时明确父子关系，native ownership不能有冲突。
- [ ] 集成验证相同计划/版本/资产输出确定、缺asset拒绝、snapshot跨tenant拒绝、contentHash重复一致、retry同step不重建snapshot、错误build不绑定成功revision。现有creative-native-materializer与signed-plan测试必须全绿。
- [ ] 提交点 `feat(agent): compile visual constraints with generation provenance`。

## T22：图生任务流程、可编辑识别结果与确认

**Files**

- Create: `agent-app/packages/agent-orchestrator/src/nodes/analyze-reference.ts`、`map-visual-capabilities.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.ts`、`state.ts`、`model-port.ts`
- Modify: `agent-app/packages/contracts/src/agent-run.ts`、`agent-app/apps/api/src/runs/action-router.ts`、`run-executor.ts`
- Create: `agent-app/apps/web/src/components/workbench/VisualReferenceReview.vue`、`CapabilityMappingPanel.vue`
- Modify: `agent-app/apps/web/src/components/ConversationPanel.vue`、`api.ts`
- Test: `agent-app/apps/api/src/vision/visual-flow.integration.test.ts`
- Test: `agent-app/apps/web/src/components/workbench/VisualReferenceReview.test.ts`
- Create: `agent-app/tests/e2e/reference-generation.spec.ts`

**Interfaces**

```ts
// T07/T09已预留的合同，本任务启用对应handler：
type AcceptVisualReferenceAction = { type: "accept_visual_reference"; expectedRunId: string;
  analysisId: string; analysisHash: string };
// RunAction包含AcceptVisualReferenceAction，ActionRoute包含"accept_visual_reference"；不要重复追加定义。
export interface VisualGraphPort {
  analyze(input: VisualAnalysisInput, signal: AbortSignal): Promise<VisualAnalysisResult>;
  mappings(tenantId: string, analysisId: string): Promise<RegionMapping[]>;
}
```

- [ ] 红测：缺receipt/analysisHash过期不能跳过视觉确认；正常flow首次停WAITING_INPUT且enqueue=0：

```ts
expect(routeRunAction({ type: "accept_visual_reference", expectedRunId: "run-1",
  analysisId: "analysis-1", analysisHash: "hash-1" })).toBe("accept_visual_reference");
// integration实际API：附件message run结束于input.required，payload仅analysisId/hash/安全摘要。
// PATCH修改region后，旧hash确认返回409 VISUAL_ANALYSIS_STALE。
```

- [ ] Run visual-flow/VisualReferenceReview测试；预期 FAIL。
- [ ] graph顺序load→analyze→map→WAITING_INPUT；用户修改/接受后新run关联分析，继续blueprint，按原blueprint确认才进入implementation/build。不能一次“接受识别”就自动批准原生工程变更。纯文本creative路径不经过vision节点；discuss模式可描述图但不构建。

```ts
if (accepted.analysisHash !== stored.specHash) throw new Error("VISUAL_ANALYSIS_STALE");
if (stored.tenantId !== scope.tenantId || stored.workspaceId !== scope.workspaceId)
  throw new Error("REFERENCE_NOT_FOUND");
// 通过后写acceptedAnalysisId/hash到新run.inputSnapshot，再继续blueprint；不信任客户端mapping。
```

- [ ] review显示原图区域叠层、区域角色/文字、控件映射、confidence、未知交互/数据源、fallback选择；允许表单修正，用T19 PATCH严格版本检查；提供“按当前理解继续”而不是强制用户编辑所有区块。多图各自spec，用用户指定主图+补充图关系；冲突布局要求选择，不凭顺序覆盖。关键低置信区域要确认。
- [ ] E2E fake视觉输出+真实图像文件走完整upload→review→confirm→build→download，断言reference原图未打包、资源material已打包、文本模式仍成功、错误时保留图/草稿；真实provider smoke另列T26，不用fake通过证明模型看图能力。
- [ ] 提交点 `feat(agent): deliver reviewed image-to-component generation`。

## T23：受限局部修改与未选区域不变性

**Files**

- Create: `agent-app/packages/contracts/src/semantic-patch.ts`，Modify: `index.ts`
- Create: `agent-app/packages/domain-client/src/visual/semantic-patch.ts`、`unchanged-region-check.ts`
- Modify: `agent-app/packages/agent-orchestrator/src/solution-graph.ts`、`nodes/design-plan.ts`、`model-port.ts`
- Modify: `agent-app/apps/api/src/conversations/deepseek-model.ts`、`graph-ports.ts`
- Modify: `agent-app/apps/web/src/components/workbench/VisualReferenceReview.vue`
- Test: `agent-app/packages/domain-client/src/visual/semantic-patch.test.ts`
- Test: `agent-app/apps/api/src/generation/regional-edit.integration.test.ts`

**Interfaces**

```ts
// semantic-patch.ts：payload分别复用已有region计划、token、interaction的Zod类型，不开放任意对象。
export type RegionHashes = Record<string, string>;
export function assertUnchangedRegions(before: RegionHashes, after: RegionHashes, allowedRegionIds: string[]): void;
export type SemanticPatchEnvelope = { schemaVersion: 1; expectedSnapshotId: string; baseRevisionId: string;
  operations: Array<{ type: "replace_region" | "update_tokens" | "update_interaction"; regionId: string; payload: unknown }> };
// schema实际为按type的严格union；下列计划类型从@kf/contracts现有导出引入。
export function applySemanticPatch(snapshot: { id: string; baseRevisionId: string;
  implementationPlan: SolutionImplementationPlan }, patch: SemanticPatchEnvelope): SolutionImplementationPlan;
// 返回值经过现有SolutionImplementationPlanSchema校验；不得创建名字相近的第二套计划schema。
```

- [ ] 红测：

```ts
expect(() => assertUnchangedRegions({ a: "h1", b: "h2" }, { a: "changed", b: "h2" }, ["a"])).not.toThrow();
expect(() => assertUnchangedRegions({ a: "h1", b: "h2" }, { a: "changed", b: "changed" }, ["a"]))
  .toThrow("UNSELECTED_REGION_CHANGED");
```

- [ ] Run: `pnpm --filter @kf/domain-client exec vitest run src/visual/semantic-patch.test.ts`；预期 FAIL。
- [ ] 实现clone不可变snapshot→schema parse patch→校验allowedRegionIds→应用semantic变更→依赖闭包校验→确定性编译→未选region hash比较。hash排除时间戳等非语义字段，但不能排除脚本/geometry/asset refs。核心检查：

```ts
const allowed = new Set(allowedRegionIds);
for (const regionId of new Set([...Object.keys(before), ...Object.keys(after)])) {
  if (!allowed.has(regionId) && before[regionId] !== after[regionId])
    throw new Error("UNSELECTED_REGION_CHANGED");
}
```

- [ ] shared token/父布局变化影响其他region时返回DEPENDENCY_EXPANSION_REQUIRED及具体列表，不自动把所有region加入allowed；用户确认范围后重新规划/签名。保留稳定component/nativeId，禁止跨工程粘贴ID；planHash改变必须重新审批。无snapshot返回GENERATION_SNAPSHOT_REQUIRED并提供“重新规划可编辑版本”。
- [ ] 集成验收：只改表头颜色、移动独立卡片、更改表单交互；每例比较未选区域结构/native hash；A/B同base竞争只允许一个finalize；局部模型输出任意路径/未知控件拒绝；失败后旧revision仍可下载。预算/修复限制仍有效，不因局部编辑另起无限修复。
- [ ] 提交点 `feat(agent): apply bounded regional edits with revision safety`。P4 gate：S02/S03/S06通过，首次图生与局部修改均附真实制品，视觉相似度不能仅凭schema通过宣布完成。
