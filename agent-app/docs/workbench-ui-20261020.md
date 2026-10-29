# 10-20 工作台设计还原

实施日期：2026-10-20。统一代码标注功能名：Agent工作台迭代。

## 设计来源与交付范围

参考 `outputs/agent-app-ui-macos-20261020/index.html`，将原有铺满屏幕的工作台改为原稿的 macOS 浮窗结构。保留现有 Vue 3 / Router / API 和后台执行接口，样式仅限 `.workbench-page`，不更改登录页、工程列表或后端服务。

已还原：背景与浮窗阴影、44px完整标题栏、240px会话侧栏、52px中央工具栏、320px检查器、28px底部状态栏、消息气泡、执行时间线、参考图识别确认、方案卡、冲突和交付状态、分段输入、附件外观、四个检查器标签、任务标注开关和窄屏抽屉。

1440×900 下实测：外框1392×852，左右栏240/320，中央工具栏832×52，与原稿对应尺寸一致。输入模式分段高度34px。长内容卡片禁止flex收缩，在消息区单独滚动，修复原稿与旧实现长卡片被压扁的问题。附件长文件名改为省略显示。

## 实际数据与设计预览

开发预览：`/workspaces/design/workbench?preview=workbench`。仅开发环境路由允许预览；底部明确显示“设计预览 · 示例数据”。ReferenceMessages / ReferenceInspector用于复核设计稿的全部状态，不向后端提交视觉生成、下载或费用数据。

正式路由：`/workspaces/:id/workbench/:conversationId?`。正确把路由id映射为workspaceId，调用已有工程、会话、历史消息、修订接口，支持选择/新建会话和提交Run。提交成功才清空输入；失败保留需求。run查询参数用于刷新后的订阅恢复。

正式页面未接入的图生上传、停止、归档等能力保持真实边界：未实现的服务端取消不发送伪请求；用量没有调用记录时显示“—”；不会把预览中的verified/¥0.42当成真实结果。后端动作、构建回填、图片理解不属于本次前端还原。

## 本次文件清单

修改：

- agent-app/apps/web/src/router.ts
- agent-app/apps/web/src/views/RunWorkbenchView.vue
- agent-app/apps/web/src/views/RunWorkbenchView.test.ts
- agent-app/apps/web/src/components/runs/WorkbenchShell.vue
- agent-app/apps/web/src/components/runs/ConversationSidebar.vue
- agent-app/apps/web/src/components/runs/MessageBubble.vue
- agent-app/apps/web/src/components/runs/RunTimeline.vue
- agent-app/apps/web/src/components/runs/RunPill.vue
- agent-app/apps/web/src/components/runs/RunPill.test.ts
- agent-app/apps/web/src/components/runs/ComposerBar.vue
- agent-app/apps/web/src/components/runs/ComposerBar.test.ts
- agent-app/apps/web/src/components/runs/ContextPanel.vue

新增：

- agent-app/apps/web/src/components/runs/ReferenceMessages.vue
- agent-app/apps/web/src/components/runs/ReferenceInspector.vue
- agent-app/apps/web/src/styles/workbench-reference.css
- agent-app/docs/workbench-ui-20261020.md

开工前已有的 `stores/workspace.ts`、`types.ts` 和未跟踪的 `styles/workbench.css` 未修改，不属于本次补丁。

## 验证

- Web完整Vitest：24个文件，115项通过。
- vue-tsc --noEmit：通过，修复开工时7处类型错误。
- Vite production build：通过，输出apps/web/dist。
- 本次修改的TS路由与测试文件ESLint：通过。
- 浏览器：桌面布局、四个检查器标签、时间线折叠、区域联动、手机会话抽屉/检查器抽屉。
- 手机390×844：document.scrollWidth=390，无横向溢出；检查器宽320，位于x=70。
- 新页面测试覆盖预览不读真实API、选中真实会话提交、空工作区自动建会话、失败保留输入。

验证使用仓库自带Node24 arm64。未重装依赖、未运行数据库清空测试、未部署生产。已有全量仓库未提交修改保持原样。

## 发布与交接

保留上述文件的原目录层级。若交付静态前端，需要包含本次完整apps/web/dist目录及其全部hash资源，不只替换index.html；源码变更与测试/文档同样列入补丁清单。后续接手先读此文件和原设计，再接图生、取消和版本交付的服务端数据。
