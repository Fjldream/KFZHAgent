<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 平铺工程图已可解析，仍被布局宽度与已确认能力约束阻断

2026-10-26 16:24:30 /88.20s，blueprint@8/blueprint-repair@2、semantic@14/semantic-repair@3。一次完整真实验收上限5请求，实际5请求；没有追加第二轮修复或付费循环。来源是同目录上级的合成能源UI参考图，无真实业务数据。本目录保留失败事实，不代表工程交付或KF验收。

调用顺序与离线使用生产检查入口复放结果：

1. vision识图成功。reference-review-before-edit与最终reference-review原字节相同，没有静态行revision；44项差异接受，omit=0。
2. 蓝图初稿JSON合法，缺少content、footer-note来源，报VISUAL_BLUEPRINT_SOURCE_MISSING。
3. 唯一一次blueprint repair补全来源，生产检查通过，随后独立蓝图确认成功。这次验证的是来源修复，不能宣称发生了真实JSON语法修复。
4. 工程初稿finishReason=stop，JSON合法，schema=kf-visual-semantic-graph/v1，54节点；图的引用、归属、深度等检查通过并装配为标准语义树。完整校验报NATIVE_LAYOUT_UNSATISFIABLE，node-app-shell最小宽度2214、可用宽度1360；错误原文的available为1360x99920，不能把其高度诊断直接解释为最终窗口高度。
5. 唯一一次semantic repair仍为合法54节点图，可装配；将content绑定从row节点node-body-split改为column节点node-content，违反已确认layout.2，报VISUAL_BLUEPRINT_LAYOUT_CAPABILITY_MISMATCH: content。修复后立即停止，没有BuildJob、能源包、KF导入/运行或1:1结论。

两份工程草稿JSON.stringify后的UTF-8大小分别27805、27874bytes，均小于64KiB修复草稿上限。两次没有出现上一轮深层树JSON闭合错误，但一个样本不能证明后续模型输出必然合法，也不能把图结构合法等同于原生工程合格。

| task | input/output | cache hit/miss | latencyMs |
| --- | --- | --- | ---: |
| vision | 1534/2929 | 1280/254 | 10045 |
| blueprint | 10518/2857 | 2304/8214 | 14915 |
| blueprint repair | 13424/2868 | 10496/2928 | 9945 |
| implementation | 27046/7662 | 0/27046 | 23312 |
| semantic repair | 27914/7677 | 3968/23946 | 22643 |

result.json中两项task=repair按调用顺序分别对应蓝图与工程。invocation的SUCCEEDED只代表提供方调用成功；最终engineering Run为FAILED/INVALID_MODEL_OUTPUT。前两项CANCELLED是审核阶段流程结果，不能推断为生成了工程包。

九份JSON逐字节复制自 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-energy-live-S1g9V4/`；initial/repaired-blueprint对应model-reply-2/3，initial/repaired-provider对应model-reply-4/5。外层只保留公开响应字段；未包含API key、headers、reasoning_content、图片base64或私有签名/receipt。原始JSON不加注释、不改内容。

- reference-review-before-edit.json SHA256：`263cc970bb39f77c3be5bd754659926ef61bc36b25cc1532979b22096c7db5b2`
- reference-review.json SHA256：`263cc970bb39f77c3be5bd754659926ef61bc36b25cc1532979b22096c7db5b2`
- accepted-differences.json SHA256：`863dacc3c0ee6b5dd672a2f9c0c085f3058ad1e65c54d5f0a5de8dfebdd54d20`
- blueprint.json SHA256：`acb3f9f4640cc21193f2860ecff337a0ceccf38155da7b9e182c58974b043bc4`
- initial-blueprint-provider-reply.json SHA256：`e5ed157a8d5d0b334e309dcc9214cbe4f8a7cce9aa172ec56b52f3be156b9df4`
- repaired-blueprint-provider-reply.json SHA256：`e01f93c5b31f0bf7303da9fd7325529d745a966f47b6df003affec0846908633`
- initial-provider-reply.json SHA256：`d95f1d9683097d4210bf4f4e4055ad933930a0a92a80252b1681f4cc9fb150be`
- repaired-provider-reply.json SHA256：`6581b421b415f6be4e8a7bfb1ac95ba3229f171787d24e5e27030cb9609f57b8`
- result.json SHA256：`f2eed322cb391fefd20294ce18efa0c8561307eca13eac9ccc626ac7e7875395`
<!-- end -->
