<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 蓝图漏掉外层来源的真实负例

2026-10-26 10:59:30 /32.16s，blueprint@6/semantic@7。2次物理调用，无自动重试；识图/接受通过，蓝图schema通过，但漏掉root、content两个未省略的外层容器来源，服务端以VISUAL_BLUEPRINT_SOURCE_MISSING拒绝。没有语义工程调用、BuildJob、工程包或KF运行结论。

原4份JSON保持不变，schema与来源门槛未放松。新反馈单元重放原提案，精确列出缺失的两个ID；后续blueprint@7可由服务器显式开启once策略，在同一Run追加最多一次提案修复，仍须完整校验和独立批准。不能直接给本目录历史失败数据补ID、改缓存或重签。

本轮static-row operator选项实际0修订（无reference-review-edit记录）；新识图已经返回可映射角色，不能声称修正了6行。

| task | input/output | hit/miss | latencyMs |
| --- | --- | --- | ---: |
| vision | 1534/2873 | 1280/254 | 10718 |
| blueprint | 10249/2939 | 128/10121 | 16074 |

完整临时证据 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-energy-live-sfBeIY`。provider-reply不含header/key/reasoning/base64或私有HMAC，JSON不插注释。

- reference-review.json SHA256：`250617c8a8aaf83062c98af6a2d929f758f1f8b7a3beee86d6e266ad99b8e852`
- accepted-differences.json SHA256：`67e634a6fad62601c5a0520c1230c6ee292d2f23070c784ebf6b85bc7a25de2a`
- provider-reply.json SHA256：`291be342c8914c701e65e4b346962acf8fbeb9ec1cd4f7c6b31848300aa54eca`
- result.json SHA256：`8819b416a2c5db343154127d221ee3885894fd9c6c8fad57bc1b9ade7e25a2b8`
<!-- end -->
