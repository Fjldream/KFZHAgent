---
version: alpha
colors:
  primary: "#0348dd"
  primary-soft: "#e9f0ff"
  canvas: "#f7f9ff"
  surface: "#ffffff"
  text: "#1f2937"
  text-secondary: "#667085"
  border: "#e4e9f2"
  success: "#43b267"
  warning: "#f59e0b"
  danger: "#ef4d4f"
typography:
  product:
    fontFamily: "Inter, PingFang SC, Microsoft YaHei, system-ui, sans-serif"
    fontSize: "14px"
    lineHeight: "1.5"
  data:
    fontFamily: "DIN Alternate, Inter, PingFang SC, Microsoft YaHei, sans-serif"
    fontSize: "14px"
    lineHeight: "1.4"
rounded:
  control: "4px"
  panel: "12px"
  status: "999px"
spacing:
  unit: "4px"
  panel: "16px"
  page: "20px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
    padding: "{spacing.unit}"
  page:
    backgroundColor: "{colors.canvas}"
    textColor: "{colors.text}"
    typography: "{typography.product}"
  table:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-secondary}"
    typography: "{typography.data}"
    rounded: "{rounded.panel}"
    padding: "{spacing.panel}"
  selection:
    backgroundColor: "{colors.primary-soft}"
  separator:
    backgroundColor: "{colors.border}"
  status-success:
    backgroundColor: "{colors.success}"
    rounded: "{rounded.status}"
  status-warning:
    backgroundColor: "{colors.warning}"
    rounded: "{rounded.status}"
  status-danger:
    backgroundColor: "{colors.danger}"
    rounded: "{rounded.status}"
  notification:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.panel}"
    padding: "{spacing.page}"
---

# KingFusion3.6 节点冗余 UI

## Overview

这是运维人员长时间使用的高密度产品界面，不是营销页面。视觉继续采用现有 KingFusion3.6 运维中心的浅蓝画布、白色数据面板、紧凑表格和克制状态色。标志性元素是“双节点角色带”：在详情和切换确认中用一条明确的主从关系线表达当前激活方向，但不增加装饰性大图。

## Colors

品牌蓝只用于主要操作、链接、选中状态与键盘焦点；红色仅表示异常或不可逆删除，橙色表示风险确认，绿色表示已在线、正常或完成。普通信息保持白底和灰蓝边框，避免一屏出现大量高饱和色块。

## Typography

沿用系统中文字体栈，保证离线环境与国产操作系统可用。APP 数量、revision 和时间等数据优先使用等宽感更强的数据字体栈；正文不使用展示字体。

## Layout

桌面端与现有运维中心一致：左侧宿主导航、顶部宿主栏、内容区内部使用 20px 边距。列表保留横向比较能力；详情在列表下方或独立路由呈现。窄屏允许表格横向滚动，配置表单与 APP 列表转为单列。

## Elevation & Depth

静态面板以边框和极浅阴影区分层级。弹窗、抽屉和通知浮层使用 Element Plus 的标准高程，禁止页面卡片出现厚重阴影。

## Shapes

控件使用 4px 小圆角，面板使用 12px，状态标签使用胶囊圆角。按钮和表格保持现有运维中心的紧凑比例。

## Components

运行时 token 的唯一所有者是 `src/modules/redundancy/styles/tokens.css`，本文件镜像已确认值并解释用途。Element Plus 通过同一 CSS 变量适配；业务组件不得直接写新的品牌色。所有异步操作使用共享反馈，所有 destructive 操作使用应用内确认框。

## Do's and Don'ts

- 保留高信息密度、清晰列对齐和中文运维术语。
- 当前异常持续显示在详情和通知中心，不用短暂 toast 替代。
- 不使用渐变大卡、玻璃拟态、巨型数字仪表盘或营销式空白。
- 不用颜色作为唯一状态信息，不隐藏可恢复路径。
