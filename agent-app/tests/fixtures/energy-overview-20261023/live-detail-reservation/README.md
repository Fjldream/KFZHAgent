<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 预留能力未进入候选却残留在详情清单

2026-10-26 13:52:17 /30.79s，blueprint@7/semantic@9，两种修复均once。实际2次请求（vision、blueprint），识图及独立蓝图确认通过；工程模型没有外发，语义修复也未调用。工程准备因detailed capability IDs do not exactly cover advertised control and layout candidates失败，图节点当时显示INVALID_MODEL_OUTPUT；该失败属于服务器生成的候选身份不一致，不是模型输出错误。

离线回放原蓝图/视觉数据：区域最终controls/layouts实际只有14种，detail清单却有15种，多出easyui.18。检索先为minimum预留全局预算，后续视觉必需控件占据区域Top5并挤掉该预留项，但返回详情ID仍取预留集合。随后只将返回detailedCapabilityIds改为最终公布controls/layouts的去重并集，保留预留预算、所有区域候选及排序/能力/5控件/3布局/25详情上限，不回收空位再扩候选。领域原负例先红后绿，API原蓝图现在可准备请求；冻结语义升@10并绑定该身份规则，必须新建确认，不能改旧Run/缓存重签。

| task | input/output | hit/miss | latencyMs |
| --- | --- | --- | ---: |
| vision | 1534/3388 | 1280/254 | 11181 |
| blueprint | 11794/2466 | 2304/9490 | 13314 |

本轮实际冗余装饰省略0项，原接受记录如实保留，未编造operator修改；无工程包/KF结论。五份JSON逐字节来自 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-energy-live-j89ZPA`，provider-reply.json对应model-reply-2.json；不包含key/header/reasoning/base64或私有签名，JSON不加注释。

- reference-review.json SHA256：`e44a3897dd82be26f82bb6b1844747d7c571e92dffb7d891a80beaf94c30649b`
- accepted-differences.json SHA256：`6cbd32405dff05d078c21010c839aceec60f75a88ce252970cf819eb27cf91be`
- blueprint.json SHA256：`13ac6be54dfccc44bba47af0ec10e3c21d04c70bf2bd83cf82e9dce1e08488d7`
- provider-reply.json SHA256：`6bcaaa3b2e28bd7e9d00865fa82ddb1b2bbbec68738da29c21f7e095fc6e368e`
- result.json SHA256：`ba9d5d68c6be0b815aefece4876584ee727d3292542f1622cc9e40a6cfc37b67`
<!-- end -->
