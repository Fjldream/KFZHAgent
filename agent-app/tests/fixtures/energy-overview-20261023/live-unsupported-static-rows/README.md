<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 真实识图中的静态行表格分类

2026-10-26 10:39:55 /15.33s，blueprint@5/semantic@7。仅1次真实vision调用后，验收协调器以 `LIVE_VISUAL_UNSUPPORTED_REGION_REQUIRES_REVIEW` 停止；服务端识图Run当时为WAITING_INPUT，没有调用蓝图/工程、没有BuildJob或工程包。普通回归不包含该付费用例。

provider将device-row1/2/3、summary-row1/2/3这6个空文字父区域标为table，子区域保留独立名称/状态/数值。当前目录无可直接生成的原生表格候选，因此不能自动省略这些行。人工对照固定目标图可按静态布局和文本表达，但必须走已有识别修订/重新确认流程；本目录保留未修改原事实，不将table全局当content。

后续仅在这张固定演示图的显式测试operator场景中增加受限修订选项，使用原actor/receipt/hash及服务端revision，不改原analysis。实际是否发生修订以每轮reference-review-edit证据为准，不能因为启用了该选项就声称发生过人工修订。

vision input1534/output3270，hit1280/miss254，10679ms。完整临时证据 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-energy-live-AxX4p2`。JSON不含key/header/reasoning/图片base64或私有HMAC；JSON不插注释。

- reference-review.json SHA256：`db3106754e9804816584b023bf5c66edc9f0a99f2577a06d375c8c4b26d37559`
- provider-reply.json SHA256：`7e6d89ac8b0c940e5fe80ef2a85752bf188ff719bc16ac73fdc4e761e4478077`
- result.json SHA256：`a2bd7ab19a030e19a13478c513d5d8289b7083ef9b3806cda190e243aa72c759`
<!-- end -->
