<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 工程全区域绑定已输出，副标题连接修复后出现样式字段回归

2026-10-26 17:29:54 /50.93s，semantic@16/repair@5，blueprint@8/repair@2。本轮是**工程阶段真实验收**：复用上一轮保存的公开spec/blueprint作为本地未批准提案，重新上传同一合成能源图、创建新审核与新签名、由测试操作员重新接受43项静态近似并独立确认蓝图。没有载入历史receipt。识图与蓝图各有一次明确标记的本地夹具响应（0 token、未向提供方发送请求），工程初稿与一次修复共2次真实DeepSeek请求；不能把四行invocation当四次付费调用或新完整识图验收。

result.acceptanceMode=semantic-only-with-new-approvals，planningFixtureRequests=2，physicalRequests=2，publicFactsHash=33b3c8d0272d72fedf73c7dbb0c97b31f51bef16b1dbe902732cc690a0c2a30b。before/final review相同，无静态行revision，acceptedDifferences=43、omit=0。当前review使用新analysisId/assetId；原公开蓝图和接受内容可逐字相同，不代表复用了私有授权。

两份响应均finishReason=stop、JSON合法、graph/v1、53节点/43区域绑定，groupWith均为空。初稿27504序列化UTF-8 bytes，漏接node-main-subtitle，生产检查返回SEMANTIC_GRAPH_ORPHAN与UNREACHABLE_NODES(count=1)。一次修复将其接入node-main，但重写样式时在roleStyles[7]（nav-item-text）顶层新增disabled，原初稿无此字段；修复稿27434bytes，严格检查报SEMANTIC_PLAN_INVALID / roleStyles.7: Unrecognized key: "disabled"。

离线内存副本仅给初稿补上副标题边后，还暴露VISUAL_BLUEPRINT_LAYOUT_CAPABILITY_MISMATCH: devices和NATIVE_STYLE_STATE_UNSUPPORTED（node-nav-overview，button.root.selected）。该反事实不写回原稿、不创建Run/制品；因此不能宣称只删除disabled或只接一条边即可交付。没有静默删字段、挪状态、换审核能力或第二轮修复。最终engineering Run为FAILED/INVALID_MODEL_OUTPUT，未生成成功缓存、BuildJob、能源包或KF导入/运行/1:1结论。

| 真实task | input/output | hit/miss | latencyMs |
| --- | --- | --- | ---: |
| implementation | 26460/7585 | 3584/22876 | 23104 |
| semantic repair | 30350/7567 | 4224/26126 | 21504 |

本地vision/blueprint的actualModel分别为saved-public-vision-fixture、saved-public-blueprint-fixture，0输入/输出token，缓存计数字段null而非零。SUCCEEDED仅表示调用/夹具响应成功，不代表最终工程成功。没有增加本轮调用次数，没有KF操作。

七份JSON逐字节复制自 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-energy-live-w11f5b/`；initial/repaired-provider对应model-reply-1/2，均为真实工程响应。本目录没有本地夹具的HTTP封装、key/header/reasoning_content/base64/私有receipt，JSON不加注释。

- reference-review-before-edit.json SHA256：`69e5ad817883b2aaf161b2c26eb809bf312c949a8dfe3831e7034940a140b7b5`
- reference-review.json SHA256：`69e5ad817883b2aaf161b2c26eb809bf312c949a8dfe3831e7034940a140b7b5`
- accepted-differences.json SHA256：`9ac60889c84e1d30031c6cb027b922af6a332a3a6c708cabbb99e6cb69e0211f`
- blueprint.json SHA256：`c65ee0ce1ab7ae021dfdf37dd23e55a5650db155444a7952d8658dbe6f2acded`
- initial-provider-reply.json SHA256：`1731c0b6d441d5b994b86134d57a9c9598b4a79773c36ead188f3d46ee5fb4c5`
- repaired-provider-reply.json SHA256：`54fd949b062a0eecdc22dccc1dd98beee4b638eaf3c2a80d148447df65f15615`
- result.json SHA256：`fa488312ae2eee88302525ba601c986d576adfbf32035df5cee7bb3d9479f26c`
<!-- end -->
