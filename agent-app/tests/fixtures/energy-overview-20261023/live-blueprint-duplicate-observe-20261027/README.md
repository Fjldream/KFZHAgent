<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
# 重复观察文字真实负例

本轮独立试用环境中，可外发的合成能源界面经真实浏览器上传、逐次同意和 43 项差异确认后，蓝图及其一次修复均为 stop/合法 JSON；修复稿仍违反 `journeys.2.steps.0.expectedTexts` 的去重约束，下标 4 重复。

`provider-reply.json` 保留原修复稿 content 字符串与 finishReason，未修改模型原文。`reference.json` 只保留当轮已确认的合成图结构/映射/接受差异；无 key、请求头、会话 cookie、批准 receipt、隐藏推理或真实业务数据。JSON 为严格数据格式，改动说明放在本文件，不添加会破坏解析的代码注释。

离线测试要求原稿继续拒绝；只反馈安全路径和重复下标，不回显文字、不自动删重、不改变参考图或合法阅读要求。测试中的显式新提案去除重复的期望项后可通过，但原稿保持逐值不变。

新反馈进入 blueprint@11 / blueprint-repair@5 的冻结身份。原审核不重签，真实复验须新图片 Run、新差异审核和独立蓝图确认，仍最多一次修复。
<!-- end -->
