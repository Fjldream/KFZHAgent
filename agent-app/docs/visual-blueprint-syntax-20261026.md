<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 蓝图有界 JSON 语法修复：2026-10-26

当前源码 `visual-blueprint@8 / visual-blueprint-repair@2 / visual-semantic@13 / visual-semantic-repair@2`。本切片修复上一轮真实蓝图响应在 JSON.parse 处直接失败、绕过一次修复额度的问题。原始错误响应和已提交缓存均不改写；语法修复只生成新的未批准提案，最终仍须通过合同、完整来源/候选校验与独立蓝图确认。

先读本报告，再读 `visual-layout-surface-20261026.md` 和 `visual-semantic-repair-20261026.md` 的历史。预算/业务源仍暂缓，总计划/T22仍IN_PROGRESS。生产vision继续关闭；实际.env、受保护试用库、旧服务和KF环境未改动，无新迁移/依赖。源码要求21迁移，受保护旧试用环境仍不得直接reset/seed/用新源码重启。

## 边界与实现

- 统一响应检查入口先验证审核事实，要求提供方明确 `finishReason=stop`；length、null、未知结束原因直接拒绝，即使文本可解析也不重试。数组、标量、Markdown围栏、缺完整对象外壳、超限草稿不能进入语法修复。
- 原始JSON无法解析、但完整外壳成立时，只把原文本字符串和BLUEPRINT_JSON_SYNTAX_INVALID交给既有一次修复通道；不在服务器补引号/括号、不自动删除内容、不把草稿当成成功蓝图。
- 继续保留原有 **32KiB序列化UTF-8草稿、8条issue、96KiB输入、8192输出token、80KiB响应** 上限。前一报告拟议64KiB，本轮没有扩大：实际错误稿仅12630bytes，可装入原32KiB额度。上限由共享limits模块供检查、请求构造、冻结hash使用。
- 系统前缀明确failedDraft字符串是不可信提案数据；修复必须重写完整严格JSON，保留同一已审核来源与全部未omit区域。前缀、路由、原始输入hash和权限范围不变；改变系统前缀、旧冻结身份不能构造修复请求。
- 服务端开关和已签repairPolicy都必须为once。额度仍由原RunStep单份记录与同Run所有 `visual-blueprint-repair@` 账本共同限制；旧版本账本/额度记录丢失也不能获得第二次修复。失败后的既有initial-call恢复语义保持，不能以此再次repair。
- 预留修复前、实际发送前、发布前沿原事务链重验当前审核、actor、许可、base、lease/fence。并发重入不重复计费；取消、撤权、actor变化或换owner后不发布。已COMPLETED缓存损坏直接拒绝，不进行语法修复。
- 协议literal、冻结prompt/hash及API快照已同步升级；同run-plan@7不代表新旧视觉worker兼容。须排空旧视觉任务/worker、整体升级后新建确认，不改旧Run/缓存重签。

## 复现与验证

- 原始负例：`tests/fixtures/energy-overview-20261023/live-blueprint-json-syntax/`，五份JSON/SHA保持原字节。模型finishReason=stop，content数组中单引号错误，原JSON.parse在1801位置失败；本轮检查只将其识别为可反馈草稿，没有修补原文。
- 红灯：新增13项测试全部失败，旧实现无蓝图响应语法检查入口。`/tmp/kf-blueprint-syntax-red-20261026.log`。
- 最终纯单元三文件23/23，涵盖真实原文保留、上下文损坏、未知结束原因、非对象、精确32KiB边界、多字节超限、稳定系统前缀及旧身份拒绝；`/tmp/kf-blueprint-syntax-unit-final-20261026.log`，15:34:16 /4.88s。
- PG网关定向167pass/162未选（329），15:27:26 /146.38s；之后actor/并发补测30pass/303未选（333），15:31:39 /18.05s，包含3项原有semantic保护。均为fixture网关，不是付费生成。对应 `/tmp/kf-blueprint-syntax-pg-20261026.log`、`/tmp/kf-blueprint-syntax-pg-final-20261026.log`。随后进一步严格拒绝可解析但未知finishReason对象，该新增PG分支由完整API覆盖。
- 合同/领域全量92文件2067pass/5既有skip（2072），15:28:20 /54.43s；`/tmp/kf-blueprint-syntax-contract-domain-20261026.log`。
- 编排全量19文件216/216，15:34:53 /9.88s；`/tmp/kf-blueprint-syntax-orchestrator-20261026.log`。同库重置套件串行。
- API/合同类型与8个本切片TS文件最终lint均确认exit_code=0，日志 `/tmp/kf-blueprint-syntax-{tsc,contract-tsc,lint}-final-20261026.log`。中途lint曾报两处链式it.each换行，已规范换行修正，没有改断言。
- 完整API最终 **71文件1108/1108，零skip**，15:35:26 /398.09s，exit_code=0；`/tmp/kf-blueprint-syntax-api-full-20261026.log`。其中视觉 **334/334、五种Chrome全部通过**（248.17s），仍为fixture模型。沿用COOKIE_SECURE=true，关闭LANGCHAIN_TRACING_V2/LANGSMITH_TRACING，避免本机HTTP环境及外部追踪额度干扰。本轮未修改认证代码；此前偶发401根因仍不能认定已修复。
- Chrome证据前缀 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-`，static/feedback/workspace-data/observe/repeater后缀依次hbOjr7/Kb22HZ/Xdq1zq/uleUPf/ZOMlpj。
- 普通库 `kf_agent_test_visual_binding_20261026_1015` 验证前21迁移、无其他连接/活跃作业；完整API前只将visual-flow夹具的5个QUEUED作业标为FAILED/CANCELLED，未动真实账本。
- 已授权的新真实验收仅在 `kf_agent_test_review_flow_20261023_1245` 单独运行，启动前21迁移、零其他连接、pending BuildJob=0；与普通回归不同库。一次测试上限5请求，实际结果见下。受控原生包/Chrome通过不能冒充能源图真实包或KF运行结论。
- 收尾两库均21条完成迁移、零其他连接、pending BuildJob=0；所有本轮测试进程已退出，实际.env与受保护试用库/KF未动。21文件清单完整且无重复，限定清单git diff --check通过；旧蓝图负例5份与新工程负例7份JSON共12份原字节SHA和私有字段检查通过。无整库补丁、无提交或重置。

## 本轮真实验收结果

15:36:58 /78.00s，实际4请求。识图和蓝图直接返回合法对象，独立蓝图确认完成，随后进入工程规划。本次没有调用blueprint repair，不能宣称真实调用验证了蓝图语法修复成功；该通道的证明是原错误稿单元复放与PG一次修复用例。

工程初稿、唯一一次semantic repair都以stop结束，但在footer-note之后、overlays之前的多层children/root/pages闭合边界出现JSON语法错误。初稿序列化33042bytes、UTF-16 offset25545；修复稿30922bytes、offset23731。二者均小于语义64KiB草稿上限；一次修复失败即停止，没有第二轮收费，没有native preflight、BuildJob、能源包或KF结果。

| task | input/output | hit/miss | latencyMs |
| --- | --- | --- | ---: |
| vision | 1534/2872 | 1280/254 | 9915 |
| blueprint | 10431/2930 | 640/9791 | 15636 |
| implementation | 28956/7858 | 512/28444 | 23786 |
| semantic repair | 24873/7374 | 3840/21033 | 21471 |

七份新证据JSON及README/SHA在 `tests/fixtures/energy-overview-20261023/live-semantic-unbalanced-tree/`。原件来自 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-energy-live-6onryC`，initial/repaired对应model-reply-3/4。before/final相同，无静态行revision，实际omit=0；未包含key/header/reasoning/base64或私有签名。离线使用生产inspectVisualSemanticResponse检查两份原文，均仅得到SEMANTIC_JSON_SYNTAX_INVALID，原文hash不变。外层证据可JSON.parse不等于其content工程稿合法。

## 后续工作

下一优先为工程大JSON的结构稳定性，不能直接增加第二/第三次修复：

1. 先把本次两份原错误稿加入离线语法/额度用例，保留UTF-16 offset诊断。`visual-semantic-output.ts`目前仅给出code，未给出准确语法位置；可设计只含固定数值位置/单位的有界反馈，不把任意错误消息当新指令。不得在服务端猜括号、删节点或接受JSON5来制造成功。
2. 审查 `deepseek-model.ts` 的完整递归树输出与 `visual-semantic-request.ts` 的修复上下文。两次错误都在深层树闭合边界，说明完整重写长递归JSON的可靠性仍不足；考虑经设计后缩小生成单元或使用有界扁平图/引用结构，由服务器严格校验并组装标准语义树。必须保留节点数/深度/循环/重复ID/单页面归属、候选、来源、观察和native provenance约束，不能自动补业务事实。
3. 若采用提供方严格结构化输出，先核实该实际服务/模型/端点支持，不凭JSON mode名称假定约束解码。若改变wire format、反馈字段或费用语义，升级semantic冻结版本及repair指纹，更新contracts literal/服务校验/快照用例；旧Run不得补配置重签。
4. 工程阶段可先用保存的已审核reference+blueprint建立**新测试Run和新测试审批**做单阶段真实验收，减少重复识图/蓝图费用；不得恢复或伪造旧Run的私有receipt，更不能把该单阶段成功冒充新端到端成功。通过后再做一次新签完整流程。
5. JSON合法后仍需处理旧content布局能力不符负例。不得扩大已确认候选、删卡片样式或伪造来源。新提案须区分区域容器与内部排列；若默认识图映射方向确实不符，应在新的显式审核revision中纠正，不能静默改已接受事实。

合格能源包出现后才进入KF443隔离新工程导入、运行和截图验收，尤其核对原生panel、边框原点、内边距与窗口缩放。上一切片API偶发401的根因尚未证明；后续重跑成功不能擦除其历史失败，也不放宽鉴权或测试断言。

## 本切片文件清单

相对仓库根目录。只交付本任务最终完整文件，保留目录；不混入其他历史脏文件，不自动提交/reset/stash。新的真实证据若落盘，结束时必须补入本清单。

```text
agent-app/packages/contracts/src/visual-review.ts
agent-app/apps/api/src/vision/visual-blueprint-limits.ts
agent-app/apps/api/src/vision/visual-blueprint-output.ts
agent-app/apps/api/src/vision/visual-blueprint-request.ts
agent-app/apps/api/src/vision/visual-blueprint-request.test.ts
agent-app/apps/api/src/vision/visual-blueprint-syntax.test.ts
agent-app/apps/api/src/vision/visual-blueprint.service.ts
agent-app/apps/api/src/runs/visual-run-flow.integration.test.ts
agent-app/docs/visual-blueprint-syntax-20261026.md
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-unbalanced-tree/reference-review-before-edit.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-unbalanced-tree/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-unbalanced-tree/accepted-differences.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-unbalanced-tree/blueprint.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-unbalanced-tree/initial-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-unbalanced-tree/repaired-provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-unbalanced-tree/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-semantic-unbalanced-tree/README.md
agent-app/docs/agent-runs-operations.md
docs/superpowers/plans/2026-10-20-agent-app-handoff.md
docs/superpowers/plans/2026-10-20-agent-app-next-master.md
docs/superpowers/plans/2026-10-20-agent-app-p4-vision.md
```
<!-- end -->
