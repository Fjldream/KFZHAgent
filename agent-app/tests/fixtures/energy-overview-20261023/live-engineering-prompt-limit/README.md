<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 真实蓝图一次修复成功，工程请求准备超限

2026-10-26 11:32:12 /39.73s，blueprint@7/semantic@7，服务器显式开启blueprint repairPolicy=once。实际3次物理调用：vision、blueprint、repair；没有工程模型调用。初次蓝图漏root/main/bottom-row三个未省略容器，一次带缺失ID反馈的修复成功，最终蓝图通过全部来源/候选校验并完成独立确认。原提案与修复提案都保留，不手工补来源。

工程Run在准备模型请求时失败：序列化messages为129435字节，超过原128000字节上限。不是工程模型返回了坏JSON，也没有创建BuildJob或工程包。本轮static-row operator选项实际0修订。源码随后以可逆reason字典减少重复文本，semantic升@8，实际同数据120713字节，未提高原128000上限；签名/服务验证/存储始终用原始reference，不把投影当权限。

| task | input/output | hit/miss | latencyMs |
| --- | --- | --- | ---: |
| vision | 1534/2548 | 1280/254 | 8989 |
| blueprint | 9384/2322 | 640/8744 | 12344 |
| repair | 11756/2765 | 9344/2412 | 11529 |

修复复用了原请求前缀且实际有9344 cacheHit tokens，但本样本无合格客户端交付，不能宣称整体降本目标达成。完整临时证据 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-energy-live-Ph4LBx`；未包含key/header/reasoning/base64或私有HMAC。JSON为原事实，不插注释。旧失败Run不能改配置重签恢复。

- reference-review.json SHA256：`cb5b0015300d1facffb9f507c0bd3ee0c15cc2a4cb66debac66e29048d27d1d5`
- accepted-differences.json SHA256：`55c952db918b1449cdf716005895b263d98ca31eaab64c8e37ec7db1802bf38f`
- blueprint.json SHA256：`610f10e8cc6b5eb4962a2d93f15634fb250cae4833c1acd487d1d5fff63b975e`
- initial-provider-reply.json SHA256：`2652b7fc5b362697c31373dea9e11b67a0fce157835f92b5328c960528bb1661`
- repaired-provider-reply.json SHA256：`c0ca9bf1bb990fe99ff499c412d4b9ab4fecd43c5e6c493ea85f79c30506f542`
- result.json SHA256：`54a9e410182e0798213e86f8ddcbba2d0c3754e68770a4361d8649b9de67ecb4`
<!-- end -->
