<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 真实蓝图缺少未使用的完成说明

2026-10-26 10:47:55 /35.46s，blueprint@5/semantic@7。2次正式物理调用，无自动重试；识图/差异接受通过，蓝图FAILED/INVALID_MODEL_OUTPUT，没有工程调用/BuildJob/包或KF运行结论。

原蓝图仅缺journeys[0].completion，旧@5 schema要求该字段。只读代码审查证实它未被检索/编译/交互/观察证明用作执行或完成依据。其余蓝图严格schema、全部45个视觉来源、原候选17份详情都可通过；原JSON没有修改。新@6蓝图合同将该字段改为可选说明：缺键原样保留，不自动填默认值；若提供仍按原非空/类型/长度规则验证。steps/result/observe.expectedTexts/来源/原生证明保持必需。

本轮启用了固定演示图static-row人工修订选项，但新识图已自然返回可映射角色，实际未触发修订（无reference-review-edit记录）。不能将其描述为已经改了6行。本目录保存server reference、接受选择、原provider蓝图与结果，不保存任何伪造“已审批蓝图”。

| task | input/output | hit/miss | latencyMs |
| --- | --- | --- | ---: |
| vision | 1534/2934 | 1280/254 | 9778 |
| blueprint | 10407/2738 | 2176/8231 | 19514 |

临时证据 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-energy-live-GxSLHm`。provider-reply仅含model/finishReason/content，未保存key/header/reasoning/base64/HMAC；JSON不插注释。新合同离线验证不等同新Run/新模型交付，旧失败任务不得重签恢复。

- reference-review.json SHA256：`404be49aa869b6ace0729d1124aadd33ac593a420288f059f51fea8f7a598b9d`
- accepted-differences.json SHA256：`549411451ba51e8996c98966411334bb32bf8320afd732cd65a5ee38a2fca7e0`
- provider-reply.json SHA256：`92700d728f572f7b3dc0c534a76b0b24bc4d4ef4fb485f2a9b6d4e0a926d3031`
- result.json SHA256：`d0034926f8d58190aec14ee78c94328e55b0fc684540b5370acc5a243f460928`
<!-- end -->
