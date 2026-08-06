# 浏览器视觉预览 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建成功后浏览器内自动展示 KF 工程视觉预览（纯静态 HTML 渲染 `ClientProjectIR`）。

**Architecture:** 新包 `packages/preview-renderer`（纯函数，无依赖）把 `ClientProjectIR` 渲染为自包含 HTML（12 种控件绝对定位 + 默认样式 + 多页面 CSS `:target` 页签）；API 新增 `GET /api/artifacts/:id/preview`（复用 download-token 授权，从 Artifact→BuildJob→solutionRevision.state 读 IR）返回 `text/html`；web 端 `createPreviewUrl` 指向预览端点，iframe 保持 `sandbox=""`。

**Tech Stack:** TypeScript、NestJS、vitest、Vue 3。

## Global Constraints

- 渲染器输出**自包含 HTML**：内联 CSS、**零 `<script>`、零外部 URL**（iframe `sandbox=""` 安全约束不降级）。
- **样式来源修正（spec §3 澄清）**：`ControlIR` 是语义层（id/x/y/width/height + text/value/options 等），**不含 fontInfo/bkColor 等样式字段**——渲染器用合理的默认样式（text 16px 深色、button 主题色、容器深色工控底），仅渲染 IR 可用字段。
- 控件定位：`position:absolute; left/top/width/height`（BaseControlIR.x/y/width/height）。
- 页面容器：`page.width × page.height`（缺省 1024×768）；多页面顶部页签用 CSS `:target`（无 JS）。
- 跨平台：渲染器纯字符串拼接（无 fs/无平台 API）。
- 全仓 `pnpm test` 全绿、typecheck/lint 干净。
- Node 用 `export PATH="/Users/fengjinlong/YK/KingFusion3.6/.toolchain/node-v24.19.0-darwin-arm64/bin:$PATH"`。

---

### Task 1: preview-renderer 包（渲染器 + 单测）

**Files:**
- Create: `packages/preview-renderer/package.json`、`packages/preview-renderer/tsconfig.json`、`packages/preview-renderer/src/index.ts`、`packages/preview-renderer/src/renderer.ts`、`packages/preview-renderer/src/renderer.test.ts`
- Modify: `agent-app/pnpm-workspace.yaml`（把 `packages/preview-renderer` 加入 workspace——先看现有 workspace 通配是否已覆盖 `packages/*`，若已是通配则跳过此步）

**Interfaces:**
- Consumes: `import type { ClientProjectIR, PageIR, ControlIR } from "@kf/domain-client"`（确认 domain-client 的 `src/ir/client-project-ir.schema.ts` 已导出这些类型；若未导出到入口 index，需在 domain-client `src/index.ts` 补导出——先 grep 确认）。
- Produces:
  - `renderClientProjectPreview(ir: ClientProjectIR): string` —— 完整 HTML 文档（`<!DOCTYPE html>` + `<head><style>…</style></head>` + 页签 + 所有页面容器；无 `<script>`）。
  - `renderPagePreview(page: PageIR): string` —— 单页面 HTML 片段（`<section class="kf-page" id="page-<id>" data-testid="kf-page">…控件…</section>`）。
  - 控件渲染为 `<div class="kf-control kf-<type>" style="left:…px;top:…px;width:…px;height:…px" data-type="<type>" data-testid="kf-control">…</div>`。

- [ ] **Step 1: 建包骨架**——创建 package.json（name `@kf/preview-renderer`，type module，scripts test/typecheck/lint 参考 `packages/domain-client/package.json` 的写法）、tsconfig（extends 根 tsconfig 或参考 domain-client）、`src/index.ts` 导出两个函数（先抛 not implemented 或空实现让测试失败）。

- [ ] **Step 2: 写失败测试**——`src/renderer.test.ts`：

```ts
import { describe, expect, it } from "vitest";
import { renderClientProjectPreview, renderPagePreview } from "./index.js";
import type { ClientProjectIR, PageIR } from "@kf/domain-client";

const page: PageIR = {
  id: "p1", name: "首页", width: 1024, height: 768,
  controls: [
    { id: "c1", type: "text", x: 20, y: 30, width: 300, height: 40, text: "标题" },
    { id: "c2", type: "button", x: 20, y: 90, width: 120, height: 40, text: "开始运行" },
    { id: "c3", type: "switch", x: 200, y: 90, width: 80, height: 40, value: true, activeText: "开", inactiveText: "关" },
    { id: "c4", type: "select", x: 20, y: 150, width: 160, height: 40, options: [{ label: "A", value: "a" }, { label: "B", value: "b" }], value: "b" },
    { id: "c5", type: "inputnumber", x: 20, y: 210, width: 120, height: 40, variableId: "$Temp", decimals: 1 },
    { id: "c6", type: "checkbox", x: 200, y: 150, width: 120, height: 40, label: "启用", checked: true },
    { id: "c7", type: "radio", x: 20, y: 270, width: 200, height: 40, options: [{ label: "高", value: "h" }, { label: "低", value: "l" }], value: "h" },
    { id: "c8", type: "image", x: 400, y: 30, width: 120, height: 80, src: "http://x/y.png", alt: "logo" },
    { id: "c9", type: "tabs", x: 400, y: 130, width: 300, height: 40, tabs: [{ id: "t1", label: "趋势" }, { id: "t2", label: "明细" }], activeId: "t1" },
    { id: "c10", type: "table", x: 400, y: 190, width: 300, height: 120 },
    { id: "c11", type: "richtext", x: 20, y: 330, width: 300, height: 60, text: "<b>富文本</b>" },
    { id: "c12", type: "spacer", x: 20, y: 410, width: 300, height: 20, axis: "horizontal" },
  ],
};

const ir: ClientProjectIR = {
  schema: "kf-client-project-ir/v1", id: "w1", name: "监控大屏",
  pages: [page, { ...page, id: "p2", name: "第二页", controls: [] }],
  dependencies: [], variables: [], globalScripts: [],
};

describe("preview renderer", () => {
  it("renders a page container with the page size and id", () => {
    const html = renderPagePreview(page);
    expect(html).toContain('class="kf-page"');
    expect(html).toContain('id="page-p1"');
    expect(html).toContain("width:1024px");
    expect(html).toContain("height:768px");
  });
  it("positions each control absolutely and renders its type", () => {
    const html = renderPagePreview(page);
    expect(html).toContain('data-type="text"');
    expect(html).toContain("left:20px;top:30px;width:300px;height:40px");
    expect(html).toContain("标题");
  });
  it("renders per-type payloads", () => {
    const html = renderPagePreview(page);
    expect(html).toContain("开始运行"); // button text
    expect(html).toContain("开"); // switch activeText
    expect(html).toContain("关");
    expect(html).toContain("A"); // select options
    expect(html).toContain("B");
    expect(html).toContain("启用"); // checkbox label
    expect(html).toContain("高"); // radio options
    expect(html).toContain("<b>富文本</b>"); // richtext html passthrough
  });
  it("renders multi-page tabs with CSS :target and no scripts", () => {
    const html = renderClientProjectPreview(ir);
    expect(html).toContain("首页");
    expect(html).toContain("第二页");
    expect(html).toContain(":target");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<script>");
  });
});
```

- [ ] **Step 3: 跑测试确认失败**——Run: `pnpm --filter @kf/preview-renderer test`；Expected: FAIL（函数未实现/模块不存在）。

- [ ] **Step 4: 实现 renderer.ts**——按 Global Constraints：页面容器（宽高、深色底 `#1e2430`）、控件绝对定位 div、12 种类型各自的内部结构：
  - text：`<span>…text…</span>`（16px #e8ecf4）
  - button：`<button class="kf-btn">…text…</button>`（主题色 #2f6fed）
  - inputnumber：`<input class="kf-input" value="0.0" disabled>`（disabled 因为无脚本）
  - switch：`<span class="kf-switch is-on|is-off">…value ? activeText : inactiveText…</span>`
  - checkbox：`<label><input type="checkbox" checked disabled>…label…</label>`
  - radio：`<label class="kf-radio-option">…options.map(o => <span class="is-selected?">○/● o.label</span>)…</label>`
  - select：`<span class="kf-select">…options.find(value)?.label ?? options[0].label…</span>`
  - image：`<img src="…src…" alt="…alt…" style="object-fit:…fit…">`（注意：src 是外部 URL——iframe sandbox 会阻止加载，属预期；测试只断言标签结构）
  - tabs：`<div class="kf-tabs">…tabs.map(t => <span class="kf-tab is-active?">t.label</span>)…</div>`
  - table：`<table class="kf-table"><thead><tr><th>列1</th><th>列2</th></tr></thead></table>`（空表占位）
  - richtext：`<div class="kf-richtext">…text（HTML 透传）…</div>`
  - spacer：`<div class="kf-spacer" title="spacer"></div>`
  - 所有控件 escape 非 HTML 字段（text/label/options label/activeText 等用 `escapeHtml` 转义 `<`、`>`、`&`、`"`、`'`）；**richtext 的 text 不转义**（设计上透传 HTML）。
  - 多页面：`<nav class="kf-tabs-nav">…<a href="#page-p1">首页</a>…</nav>` + `:target` CSS 控制 `display`（默认隐藏 `section:not(:target) { display:none }`，首屏 `#page-p1:target` 或默认第一个可见——用 `section {display:none}` + `:target{display:block}` + 首页给 `id` 且默认 `display:block` 通过 CSS `body:has(...)` 不可用 → 用 `section.kf-page:first-child{display:block}` 覆盖）。
  - 顶部内联 `<style>` 包含全部 CSS。

- [ ] **Step 5: 跑测试确认通过**——Run: `pnpm --filter @kf/preview-renderer test`；Expected: PASS（4 用例）。

- [ ] **Step 6: 确认导出**——若 `@kf/domain-client` 未导出 `ClientProjectIR/PageIR/ControlIR` 类型（grep `src/index.ts`），在 domain-client `src/index.ts` 补导出 `export type { ClientProjectIR, PageIR, ControlIR } from "./ir/client-project-ir.schema.js";`（跑 domain-client 测试确认不回归）。

- [ ] **Step 7: 提交**

```bash
git add packages/preview-renderer agent-app/pnpm-workspace.yaml 2>/dev/null; git add packages/domain-client/src/index.ts
git commit -m "feat(preview-renderer): static HTML renderer for ClientProjectIR (12 control types, :target tabs, no scripts)"
```

---

### Task 2: API 预览端点

**Files:**
- Modify: `apps/api/src/artifacts/artifact.controller.ts`（新增 `@Get(":id/preview")`）
- Create: `apps/api/src/artifacts/preview.service.ts`、`apps/api/src/artifacts/preview.service.test.ts`
- Modify: `apps/api/src/artifacts/artifacts.module.ts`（注册 PreviewService）

**Interfaces:**
- Consumes:
  - `DownloadTokenService` 的授权模式（`assertArtifactInTenant` 在 download-token.service.ts:88 是 private——preview 服务可仿照其实现：`prisma.artifact.findFirst({ where: { id, tenantId } })` 做归属校验）。
  - `renderClientProjectPreview(ir)` from `@kf/preview-renderer`（Task 1）。
  - Prisma：`artifact`（id/tenantId/buildJobId）→ `buildJob`（workspaceId/changePlanId）→ `solutionRevision`（workspaceId+changePlanId 最新一条的 `state`）。
- Produces: `GET /api/artifacts/:id/preview` → `text/html; charset=utf-8`（200）或 404（制品不存在/非本租户/无 IR）。

- [ ] **Step 1: 写失败测试**——`preview.service.test.ts`：用现有 api integration 的 fixture 风格（看 `apps/api/src/api.integration.test.ts` 的 makePackage/createWorkspace 模式；或复用 `build-jobs` 的集成测试基建）——测试用例：
  1. 登录 + 走完「新建 workspace → 需求 → 设计计划 → 确认 → approval → approve → 构建 SUCCEEDED」后，`GET /api/artifacts/<id>/preview` 返回 200 且 `content-type` 含 `text/html`、body 含页面名与 `data-type="text"`。
  2. 未登录访问 → 401。
  3. 其他 tenant 的 artifactId → 404。

- [ ] **Step 2: 跑测试确认失败**——Run: `pnpm --filter @kf/api test -- artifacts`；Expected: FAIL（端点不存在 404/405）。

- [ ] **Step 3: 实现 preview.service.ts + controller 路由**

```ts
// preview.service.ts
import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { renderClientProjectPreview } from "@kf/preview-renderer";

@Injectable()
export class PreviewService {
  constructor(private readonly prisma: PrismaService) {}

  async render(tenantId: string, artifactId: string): Promise<string> {
    const artifact = await this.prisma.artifact.findFirst({ where: { id: artifactId, tenantId } });
    if (artifact === null) throw new NotFoundException("artifact not found");
    const job = await this.prisma.buildJob.findFirst({ where: { id: artifact.buildJobId, tenantId } });
    if (job === null) throw new NotFoundException("build job not found");
    const revision = await this.prisma.solutionRevision.findFirst({
      where: { workspaceId: job.workspaceId, changePlanId: job.changePlanId, tenantId },
      orderBy: { revisionNumber: "desc" },
    });
    const state = revision?.state;
    if (typeof state !== "object" || state === null || (state as Record<string, unknown>)["schema"] !== "kf-client-project-ir/v1") {
      throw new NotFoundException("no renderable project IR for this artifact (upload-mode projects are not previewable yet)");
    }
    return renderClientProjectPreview(state as unknown as ClientProjectIR);
  }
}
```

controller 新增：
```ts
@Get(":id/preview")
@HttpCode(HttpStatus.OK)
async preview(@Param("id") artifactId: string, @Req() req: AuthenticatedRequest, @Res() res: Response): Promise<void> {
  const html = await this.preview.render(req.principal.tenantId, artifactId);
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.send(html);
}
```
（`@Res` 需要 `import type { Response } from "express"`——看现有 controller 是否已用 `@Res` 模式；若没有，改用 `@Header("Content-Type", "text/html; charset=utf-8")` + 返回 string 更简单，优先后者。）

- [ ] **Step 4: 跑测试确认通过**——Run: `pnpm --filter @kf/api test -- artifacts`（+ 若不匹配则全量 api 测试）；Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/api/src/artifacts/artifact.controller.ts apps/api/src/artifacts/preview.service.ts apps/api/src/artifacts/preview.service.test.ts apps/api/src/artifacts/artifacts.module.ts
git commit -m "feat(api): preview endpoint renders ClientProjectIR as HTML"
```

---

### Task 3: web 接线（previewUrl 指向预览端点）

**Files:**
- Modify: `apps/web/src/stores/workspace.ts`（`createPreviewUrl`）
- Modify: `apps/web/src/api.ts`（若需要新增 `previewUrl(artifactId)` API 方法）
- Test: `apps/web/src/stores/workspace.test.ts`（如有）或 `apps/web/src/components/WorkspaceView.test.ts`

**Interfaces:**
- Consumes: `GET /api/artifacts/:id/preview`（Task 2）。
- Produces: `createPreviewUrl(artifactId): Promise<string>` 返回该端点的绝对 URL（不再 fetch .gz blob）。

- [ ] **Step 1: 写失败测试**——看 `apps/web/src/stores/workspace.test.ts` 是否覆盖 `createPreviewUrl`（grep；若没有，在 WorkspaceView.test.ts 或 workspace.test.ts 加：mock api 后断言 `createPreviewUrl` 返回的 URL 含 `/api/artifacts/<id>/preview` 且**不调用 fetch blob**）。若测试基建复杂，改为在 `apps/web/src/api.ts` 加 `previewUrl` 方法 + 单测断言 URL 构造。

- [ ] **Step 2: 跑测试确认失败**——Run: `pnpm --filter @kf/web test`；Expected: FAIL（新断言）。

- [ ] **Step 3: 实现**——`createPreviewUrl` 改为：

```ts
async function createPreviewUrl(artifactId: string): Promise<string> {
  return api.previewUrl(artifactId); // 例如 `/api/artifacts/${artifactId}/preview`（带凭据的 iframe 直接加载）
}
```
注意：iframe `sandbox=""` 加载需登录 cookie——浏览器会带 cookie 到同源端点，OK。若现有 `createPreviewUrl` 被其他调用者依赖 blob URL 语义，检查调用点（grep createPreviewUrl）同步。

- [ ] **Step 4: 跑测试确认通过**——Run: `pnpm --filter @kf/web test`；Expected: PASS。

- [ ] **Step 5: 提交**

```bash
git add apps/web/src/stores/workspace.ts apps/web/src/api.ts
git commit -m "feat(web): point preview iframe at the rendered HTML endpoint"
```

---

### Task 4: 全量验证 + 真实走查

**Files:**
- 无代码改动（仅验证；若走查发现问题则修复提交）

**Interfaces:**
- Consumes: Task 1-3 全部。

- [ ] **Step 1: 全量测试**——Run: `pnpm test`（预期现有 381 + preview-renderer 新用例全绿）；`pnpm typecheck` 0 错误；`pnpm lint` 0 错误。

- [ ] **Step 2: 真实走查**——重启 demo（api+worker，`ARTIFACT_STORAGE_ROOT=/Users/fengjinlong/YK/KingFusion3.6/agent-app/.kf-demo-artifacts`，`MODEL_PORT_MODE=deepseek` + `DEEPSEEK_API_KEY`）：
  1. 新对话走完整流程到构建 SUCCEEDED；
  2. `curl -b cookie "http://localhost:3000/api/artifacts/<artifactId>/preview"` → 200 `text/html`，body 含工程名/页面名/控件 `data-type`；
  3. 浏览器（或 iframe）加载预览：页面容器 + 控件定位可见；
  4. 断言响应无 `<script>`。

- [ ] **Step 3: 提交（如有走查修复）**——走查发现问题（如布局/CSS/多页面切换）修复并提交。

**验收对照（spec §8）**：构建成功自动预览、多页面页签、sandbox 无脚本、12 控件视觉呈现、全量测试——全部满足后本计划完成。
