# KF Solution Agent 浏览器视觉预览设计

日期：2026-08-06
状态：已获用户批准（方案 A：浏览器视觉预览；构建后自动预览）

## 1. 背景与目标

用户希望在对话流程中"把工程运行起来"——在浏览器里直接看到生成的 KF 客户端工程长什么样。经探索确认：
- KF 3.6 Web 端（443）是管理界面，**无浏览器内图形运行入口**；真运行（变量联动/动作脚本）需桌面 kingclient 连 Center。
- 现有 PreviewBar 的 iframe 只是把构建产物 .gz 当 blob 展示（`sandbox=""`），不是工程画面。

**决策**：方案 A —— 用构建产物中的 `ClientProjectIR`（页面 + 12 种控件完整结构）写一个**纯静态 HTML 渲染器**，把工程页面"画"出来；构建成功即自动预览。不含 KF 运行时逻辑（与用户选择一致）。

## 2. 架构

三块独立组件，各自可测：

```
packages/preview-renderer（新包，纯函数无依赖）
  renderClientProjectPreview(ir: ClientProjectIR): string   // 多页面 → HTML（带页签切换）
  renderPagePreview(page: PageIR): string                    // 单页面 → HTML 片段
  ↑ 纯字符串拼接，零 fs / 零平台 API → 跨平台（Linux/Windows 无差异）

apps/api（新增端点）
  GET /api/artifacts/:id/preview
    → 复用 download-token 授权（POST :id/download-token 换 token → GET /api/artifacts/download/:token 语义）
    → 从 buildJob → revision.state 读 ClientProjectIR
    → 渲染 HTML 返回 text/html

apps/web（接线）
  createPreviewUrl → 指向 /preview 端点（替代现 .gz blob 逻辑）
  PreviewBar iframe 自动加载（构建成功即出现，preview-review 阶段已有触发点）
  iframe 保持 sandbox=""（渲染器无脚本，安全约束不变）
```

## 3. 渲染规则（12 种控件）

- 页面容器：按 `page.width × page.height`（默认 1024×768）；深色工控底或浅色按工程风格。
- 控件**绝对定位**：`leftTopPt.x/y + width/height`（CSS `position:absolute; left/top/width/height`）。
- 各类型渲染：
  - `text`：span，应用 `fontInfo`（fontSize/fontFamily/color）、`bkColor`、对齐 `layoutStyle`
  - `button`：button 外观，文本为 `text`（type=primary/plain 等映射样式）
  - `inputnumber`：input 外观，显示 value/decimals 占位
  - `switch`：开关样式（`value` 开/关 + `activeText`/`inactiveText`）
  - `checkbox`：checkbox + `label`（checked 状态）
  - `radio`：radio 组（`radioData`/options，选中 `value`）
  - `select`：下拉外观（options + 当前 value）
  - `image`：img（`src`/`fit`）
  - `tabs`：页签条（`tabs` 列表，activeId 高亮）
  - `table`：空表格框架（表头占位）
  - `richtext`：HTML 内容（`text` 为 HTML——渲染时**保留在 iframe sandbox 内**，由 sandbox 隔离）
  - `spacer`：透明占位（axis 方向条）
- 输出**自包含 HTML**：内联 CSS，无外部资源、无 `<script>`。

## 4. API 细节

- `GET /api/artifacts/:id/preview`：需登录 + 制品归属校验（复用 download-token 的 assertArtifactInTenant 模式）。
- 响应 `Content-Type: text/html; charset=utf-8`，Cache-Control: no-store。
- 数据源：revision.state（compile 模式存 ClientProjectIR）。若 state 无 IR（upload 模式），返回 404 + 说明（本版仅覆盖 compile 生成工程）。
- 多页面 HTML：顶部页签（页面名列表，JS 不可用 → 用 `<details>`/CSS `:target` 或纯 CSS checkbox hack 切换；推荐 `:target` 无 JS 方案）。

## 5. web 接线

- `workspace.createPreviewUrl(artifactId)` 改为返回 `/api/artifacts/:id/preview`（不再 fetch .gz blob）。
- WorkspaceView 构建成功（preview-review stage）时设 previewUrl（现逻辑不变，仅 URL 来源变）。
- PreviewBar iframe：`sandbox=""` 保留；`title` 更新为「工程视觉预览」。

## 6. 边界与安全

- **视觉预览**：布局/文本/样式真实还原；不含 KF 运行时逻辑（变量联动、动作脚本、趋势曲线动画）。
- **sandbox=""**：无脚本 iframe，渲染器零 JS——`richtext` 的 HTML 内容在 sandbox 内隔离，安全约束不降级。
- 跨平台：渲染器纯字符串操作。
- 本版仅覆盖 compile 模式（新建/迭代生成的工程）；upload 模式预览列入后续。

## 7. 测试

- `packages/preview-renderer` 单测：
  - 12 种控件各生成关键 HTML 结构断言（标签/类名/定位样式）
  - 页面容器 width/height；多页面页签
  - 输出无 `<script>`、无外部 URL 断言
- `apps/api` 集成测试：preview 端点登录+归属校验、返回 HTML 含页面名/控件、无 IR 时 404
- `apps/web`：createPreviewUrl 适配后既有测试更新（WorkspaceView/PreviewBar）
- 全仓 `pnpm test` 全绿、typecheck/lint 干净

## 8. 验收标准

1. 构建成功 → 对话页自动出现预览 iframe，展示工程页面（控件按坐标/尺寸/样式渲染）。
2. 多页面工程 → 预览顶部页签可切换页面。
3. iframe 保持 `sandbox=""`，页面无脚本执行。
4. 12 种控件在预览中均有正确视觉呈现。
5. 全量测试通过。
