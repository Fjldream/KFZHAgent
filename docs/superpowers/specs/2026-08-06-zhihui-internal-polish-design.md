# 智绘全站统一设计语言（内部前端优化）设计

日期：2026-08-06
状态：用户已确认（2026-08-06）

## 1. 结论

将登录页已建立的质感（苹果风浅色、毛玻璃、GSAP 动效、氛围背景、品牌叙事）渗透到全部内部页面，建立一套可复用的全局 UI 组件库。方案 A：四区域联动重设计——工程列表页丰富化、工作区增强、预览增强、全局统一组件。后端零改动，全部前端实现。

**核心架构原则：**

> 一次建立统一设计语言：`components/ui/` 组件库承载视觉一致性，各页面引用；所有动画走 useGsap + gsap-motion-playbook 规则；延续现有 tokens（--color-*/--radius-*/--shadow-*）与 AmbientBackground 氛围背景。

## 2. 范围

### 2.1 包含

- 新建 `components/ui/` 组件库：StatCard、EmptyState、StatusBadge、SkeletonCard
- 工程列表页（WorkspacesView）重设计：统计概览、搜索过滤、空态引导、卡片丰富
- 工作区（WorkspaceView + 组件）增强：空对话欢迎屏、顶栏面包屑、情境面板状态可视化
- 预览增强：全屏预览模式 + 缩放控制
- 组件测试同步

### 2.2 不包含

- 后端零改动（统计/搜索/预览全前端推导）
- 不改 SSE 协议、不改路由
- 不引入新依赖（GSAP 已装）
- 不新增产品功能（示例 Prompt 为演示性质，真实构建仍需登录）

## 3. 全局 UI 组件库（components/ui/）

| 组件 | 用途 | 接口 |
|---|---|---|
| `StatCard.vue` | 统计概览卡 | props: `label: string`, `value: string \| number`, `hint?: string`, `icon?: string`；毛玻璃白卡 + GSAP 进入 |
| `EmptyState.vue` | 空态引导 | props: `title: string`, `desc?: string`, `actionText?: string`, `actionIcon?: string`；emit: `action`；插画式装饰 + CTA |
| `StatusBadge.vue` | 状态徽章 | props: `status: "active" \| "done" \| "error" \| "info"`, `label: string`；色系映射（蓝/绿/红/灰） |
| `SkeletonCard.vue` | 加载占位 | props: 无（或 `count?: number`）；骨架屏呼吸动画，替代「加载中…」文字 |

全部使用现有 tokens，GSAP 进入动画走 useGsap，prefers-reduced-motion 降级。

## 4. 工程列表页重设计（WorkspacesView）

```
顶栏（毛玻璃）：◈ 智绘 · 租户/用户名 · 退出（保留现有）
───────────────────────────────────────
欢迎区：你好，{用户} · 一句动态文案（按时间段变化）
统计概览：[工程总数] [最近活跃] [进行中]（StatCard ×3）
创建区（毛玻璃大卡）：名称输入 + 新建/上传 + 示例模板 pill
我的工程 · [搜索框]（前端过滤）
  [卡片]×N：名称、模式徽章（StatusBadge）、修订号、相对更新时间
空态：EmptyState（「还没有工程」+ 新建引导）
```

- 统计全前端推导：总数 = `workspaces.length`；进行中 = `currentRevisionId` 非空计数；最近活跃 = `createdAt` 最新时间
- 搜索：前端 `name.includes(query)` 过滤，无后端请求
- 卡片信息扩展：现有 name/mode 之外加 StatusBadge（新建/上传）+ 相对时间（`createdAt` → 「x 分钟前」）
- 空态：无工程时显示 EmptyState + 「新建工程」CTA；加载失败显示 EmptyState + 重试
- 动画：现有 playChromeEntrance/playCardsEntrance 保留，StatCard 加入 stagger

## 5. 工作区增强（WorkspaceView）

### 5.1 空对话欢迎屏（ConversationPanel 空态）

- 对话为空时（`messages.length === 0`）替换当前「描述你的需求…」纯文字为：
  - 品牌标语（◈ 智绘 · 用一句话生成 KingFusion 工程）
  - 能力亮点 2-3 条（对话式生成 / 无损编辑 / 实时预览）
  - 示例 Prompt 卡片 2-3 个（点击填入输入框，用户确认后发送）
- 复用登录页示例交互模式；`message-input` testid 保留

### 5.2 顶栏增强（TopBar）

- 品牌区加「← 返回」链接（跳 `/workspaces`）
- 工程名下方加轻量面包屑（`工程列表 / {工程名}`）
- 状态胶囊保留（现有 stage 映射 + GSAP 脉冲）

### 5.3 情境面板状态可视化（ContextPanel）

- idle：工程概况卡（名称/模式/修订数，StatCard 风格）
- building：确定性步骤进度——编译 → 校验 → 打包，每步随 `buildJobStatus`（QUEUED/RUNNING/VALIDATING）点亮
- ready/error：校验报告卡片化（现有 ValidationReport 视觉统一到 tokens）

## 6. 预览增强（PreviewBar）

- 加「全屏预览」按钮：点击展开 fixed 覆盖层，iframe 放大至全屏，右上角「退出全屏」
- 缩放切换：适应宽度 / 100% 两档
- ready 状态：情境面板「下载」旁加「预览」入口（跳转打开全屏预览）
- `preview-frame`/`preview-panel` testid 保留

## 7. 数据流与错误处理

- 后端零改动；统计/搜索/预览全前端推导与既有 API
- 错误态：列表加载失败 → EmptyState + 重试按钮（重新调用 refresh）
- 对话错误：现有 shell-error 内联提示保留
- 测试：保留现有 testid（workspace-name/create-workspace/upload-workspace/message-input/send-message/approve-plan/preview-frame/preview-panel 等），新增 StatCard/EmptyState/搜索过滤测试

## 8. 测试策略

- 现有测试 52/52 保持全绿（testid 不变）
- 新增：StatCard/EmptyState/StatusBadge 渲染测试、列表页搜索过滤测试、欢迎屏示例点击填入测试
- E2E 不动（选择器不变）

## 9. 待办边界（本次不做）

- 不新增后端接口
- 不实现真实预览交互（iframe 内容为构建产物，全屏仅 UI 层放大）
- 不引入深色模式
- 示例 Prompt 演示不触发真实构建
