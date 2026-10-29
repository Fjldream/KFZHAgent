<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
# 真实蓝图空单位负例

2026-10-23 18:10:11 正式能源图验收，vision@v2 / visual-blueprint@3；2次物理调用后蓝图 INVALID_MODEL_OUTPUT，尚未进入工程规划或产出包。完整临时证据在 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-energy-live-D5TI9e`。

provider-reply.json 是 transport 只保留 model、finishReason、message.content 的原始有界响应，不含 headers/API key/reasoning/base64。严格合同唯一错误为 `pages[0].regions[5].sampleData[2].unit=""`，非空字段不允许空串；更新时间没有单位时应省略键，不在服务端偷偷删除错误字段。当前 visual-blueprint@4 提示词明确此规则，结构校验不放宽。

复制原响应/结果供离线回归，不改此前 live-negative，也不作为成功样例。JSON 不插入注释，变更在本文件记录：2026-10-23 / Agent工作台迭代。

- provider-reply.json SHA256：`2e3b08c445128ad97e12c1d08f7f2a2bf49bba8d93321ae256c7b69c93907c52`
- result.json SHA256：`90c90388be129f4e353db5972d8c6658e117d720b5762f39217ada7d2088edcd`
<!-- end -->
