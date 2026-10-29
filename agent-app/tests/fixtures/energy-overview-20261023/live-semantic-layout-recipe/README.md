<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
# 第二轮真实工程输出负例

2026-10-23 18:13:06 / 45.64s，visual-blueprint@4 / semantic@3。3次正式调用完成识图和独立蓝图确认，但工程输出 INVALID_MODEL_OUTPUT；无 build job/客户端包，更没有 KF 导入运行或像素验收。

原语义响应将13个 layout 节点的 recipeId 填为 layout.2/layout.4，最早严格错误为 `pages.0.root.children.0.children.0.recipeId` stable id 不允许点号。layout能力不等于候选组合经验；新 semantic@4 提示词明确通常省略 recipeId，并加真实负例回归，未将这些字段自动删除或放宽 schema。

额外仅内存反事实诊断（没有修改此文件/旧Run/产品校验）：去掉这13项错误可选引用后，仍被三个 sideNav 按钮的精确区域候选拦截。这个诊断不属于成功或修复过的工程，不把反事实计划签名/交付，不增候选、不删除业务区域。

所有JSON为原有界事实复制，不含API key、headers、reasoning、图片base64或私有审批HMAC；JSON不插注释。reference-review/accepted-differences/blueprint/provider-reply 可离线重现严格语义与候选错误。完整临时证据：`/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-energy-live-W3wV22`。本目录新增日期/功能：2026-10-23 / Agent工作台迭代。

SHA256：

- accepted-differences.json：`bfbcaf6e654e404b73f7ff14fa68e6111b991b7fc54d8b93aa590296986b67f5`
- blueprint.json：`3b3d0ddebf86191604da6240983a0c455327d3b414da6932557dd298b0684f67`
- provider-reply.json：`faf7cc7551df2c3f3cd008f3da299a2f15a680075988ca5d9244bf3611db6e1f`
- reference-review.json：`cde577646dba1e7253c7fc36acc741e5c96f9e9575566bcc6c4dcc0aa24509f1`
- result.json：`ff9df756aea6a16264d76e82dcb0f4265e3cc68f37cc533e1032c718abbc0622`
<!-- end -->
