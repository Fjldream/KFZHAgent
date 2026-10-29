<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
# 原生布局容器表面样式：2026-10-26

本切片贯通可选 `LayoutNode.styleRole`、角色校验、容器内边距/四边边框测量、原生样式编译、签名物化及包内校验。没有能源图对应的合格客户端包，也没有 KF 运行或 1:1 还原结论。模型修复响应原件不改，不删样式来通过验收。

## 接手顺序与冻结协议

当前源码 `visual-blueprint@7 / visual-semantic@13 / visual-semantic-repair@2`。语义冻结 hash 新增 `layoutSurfaceVersion=kf-layout-surface-insets/v1`，提示词明确容器角色样式的边界。默认修复策略仍为 none；服务端开关和已签 continuation 都为 once 才允许对应阶段的一次修复。输出、输入、重试及费用上限未扩大。

须排空旧视觉任务与 worker，整体升级后重新确认；同 run-plan@7 不意味着不同语义版本可混部。旧 @12 调用、缓存和签名记录不重新解释。生产 vision 继续关闭，实际 `.env` 未修改，无新迁移或依赖。受保护试用库、旧服务及 KF 环境未变动；预算和业务数据源继续暂缓，总计划/T22 仍为 IN_PROGRESS。

先读本报告，再读 `visual-semantic-repair-20261026.md` 的真实调用历史和证据清单。下列改动接续该报告，不覆盖其中失败记录和历史测试版本。

## 实现边界

- 原生 layout 可引用已声明角色；字段缺省时保持原对象形状和 hash 行为，legacy 分支仍严格拒绝。layout 不支持实例 styleOverride，不把模型几何或 CSS 当可信输入。
- 使用同一角色解析规则，按 paddingHorizontal/Vertical 优先于 padding 的语义，加上四边 borderWidth，分别计算内容空间。内层测量后只加一次外层边距；行、列、网格、叠放、嵌套卡片及滚动内容范围都使用此结果。
- 编译器发布可选 `compiledLayout.contentInsets`；旧无边距节点不增加该字段。布局结果比对、语义 provenance 和滚动 tight-bound 校验同时核对，不能通过篡改边距扩大内容范围。
- 角色样式进入既有 style engine 和可信 persisted handoff。KF 布局默认 isShowBorder=false；显式正边框宽度同时生成 isShowBorder=true、solid 边框样式与未声明侧的零宽度，避免默认 medium 宽度。只作用于有确切布局运行时证据的布局根；原控件 CSS 序列化不变。
- 普通容器不能覆盖为 hidden/auto/scroll；scroll-region 固定 auto。容器角色的状态不能改变 padding/边框尺寸；容器背景图资产暂不支持，不能绕过 layout provenance 的资产限制。
- 本轮证明到真实编译、签名、补丁、校验、打包及重新导入。测试包是受控夹具，不能冒称能源图真实模型交付；KF 原生运行时的 panel 排版、边框原点、窗口缩放和截图仍须在合格能源包出现后验收。

## 真实负例复放

`tests/fixtures/energy-overview-20261023/live-semantic-layout-style-role/` 八份 JSON 原件保持原字节。最新响应的五个 card-surface 布局角色现在都能保留下来，原 `Unrecognized key: styleRole` 已解除。完整视觉预检继续拒绝：

`VISUAL_BLUEPRINT_LAYOUT_CAPABILITY_MISMATCH: content`

原 binding 将 content 指到 node-main（column），而审核来源要求水平布局能力。不能把已经审核的候选改宽，也不能删字段、改旧缓存/Run、伪造重签来过关。真实响应的字体族仍须走既有服务器规范化；节点保留测试独立检查原始 layout schema，不宣称原始整个 plan 无需规范化即可直接解析。

后续工程提案需要明确精确的区域容器与内部组合关系：content 的审核来源归 mainHeading，模型须给出符合 requiredVisualBindings/directLayoutKinds 的独立容器；其内部可再嵌套 column。先离线跑来源、绑定、组件归属和原生测量，不能复用旧确认冒充新工程。本轮另做的一次真实调用先暴露了蓝图语法边界，顺序见下。

## 本轮新的真实调用与下一修复

15:09:26 /30.39s，在独立真实联调库做了一次明确限次的新验收。实际2请求：vision 1534/2962、hit1280/miss254、9941ms；blueprint 10558/2817、hit2304/miss8254、15001ms。识图成功；蓝图API成功返回finishReason=stop，但模型content有错误单引号，JSON.parse在1801位置失败。蓝图修复once虽然已授权，service在parse失败处直接抛出，未进入repair；工程阶段未到达。停止后没有追加第二轮收费，也没有新工程包。

证据 `tests/fixtures/energy-overview-20261023/live-blueprint-json-syntax/`：五份原始JSON和README/SHA，草稿序列化12630 UTF-8 bytes；before/final相同，实际静态行revision=0、omit=0。语义@13样式在此次真实调用尚未被验收到，不得以受控打包夹具代替真实交付。之前八份布局样式负例hash全部保持。

下一优先修复蓝图有界JSON语法通道，再回到content布局与完整能源包：

1. 复用语义阶段已验证的边界：仅finishReason=stop、完整对象外壳、序列化草稿不超过64KiB可进入一次反馈修复；length/未知结束原因、截断、数组顶层、超限、损坏缓存必须拒绝。不得手工补引号/括号，不能把草稿当成功蓝图。
2. 涉及 `visual-blueprint-output.ts`、`visual-blueprint.service.ts`、`visual-blueprint-request.ts` 及各自测试。当前service的inspectResponse parse catch直接throw是定位点；新的解析结果须给出原始草稿与repairable issue，继续沿既有actor/许可/lease/fence保护和原子提交路径。
3. 蓝图修复账本当前按精确repair版本计数。若升级repair版本，需同步按所有 `visual-blueprint-repair@` 历史调用统计，避免通过换版本重新获取额度；RunStep allowance仍只有一份。repair坏JSON也不能再修第二次。
4. 协议拟升级blueprint@8/blueprint-repair@2，变更冻结hash并加syntax边界指纹；contracts literal、runtime一致性、API快照测试一起更新。不要在当前@7 hash下启用新的计费行为；生产仍关闭，旧任务排空后整体升级。
5. 用本次原始错误JSON做离线fixture，再做PG一次修复成功/失败、修复前后撤权/取消/换fence、缓存损坏、账本旧版本额度等用例。通过后才做下一次新签完整真实规划，不循环随机重试。

## 验证记录

- 红灯：两文件 8 failed / 95 passed；确认旧合同拒绝布局角色，不是修改断言制造通过。日志 `/tmp/kf-layout-surface-red-20261026.log`。
- 初步定向：三文件 176/176。后加滚动包内验收发现旧 tight-bound 不含末端边距，已同步合同、元数据及 provenance；中途夹具的状态数组、scope token、DomainPack 参数和测试类型也已修正。
- 签名原生包定向：solution-compiler 40/40，通过 styleRole 编译、签名、patch、validate、package、import 和边距篡改负例。日志 `/tmp/kf-layout-package-20261026.log`。
- 合同与领域首轮全量：92 文件，2065 passed / 5 既有 skipped（总 2070），14:57:33 开始，47.73s。日志 `/tmp/kf-layout-domain-contracts-full-20261026.log`。之后补小数padding+border的两位精度归一化及输入精度拒绝测试；最终92文件 **2067 passed / 5既有skip**（2072），15:05:50 /55.69s，`/tmp/kf-layout-domain-contracts-final-20261026.log`。
- 合同、领域、API及orchestrator TypeScript检查通过；18个本切片TS文件最终lint零warning通过。对应日志 `/tmp/kf-layout-{contract,domain,api,orchestrator}-tsc-final-20261026.log`、`/tmp/kf-layout-lint-final-20261026.log`。
- 单独启动orchestrator时未带隔离库授权，18文件/209项通过，集成套件被TEST_DATABASE_NOT_AUTHORIZED正确阻断；随后在API退出后串行补跑，最终19文件 **216/216**，15:06:37 /10.63s，`/tmp/kf-layout-orchestrator-final-20261026.log`。
- API 完整回归前，只检查并处理指定隔离库 `kf_agent_test_visual_binding_20261026_1015`：21 条完成迁移、零其他连接，10 个遗留 QUEUED 夹具作业。第一次 CANCELED 枚举不合法，未改数据；按实际项目状态改为 FAILED/terminalReason=CANCELLED 后 count=10。真实联调库与试用库未触及。
- API两轮均启用五种Chrome，均为70文件/1069项。首轮14:58:52 /359.74s：1068pass/1fail，Secure Cookie断言失败；并有外部追踪配额429。固定COOKIE_SECURE=true并关闭LANGCHAIN_TRACING_V2/LANGSMITH_TRACING后重跑，认证11项通过；第二轮15:07:16 /353.56s仍是1068pass/1fail，为run-flow在beforeEach创建工作区时偶发401（orphan BUILDING用例尚未开始）。相关鉴权、断言与超时均未修改，不能宣称全API全绿。日志 `/tmp/kf-layout-api-full-20261026.log`、`/tmp/kf-layout-api-final-20261026.log`。随后15:16:05 /15.63s定向认证+Run两套件 **26/26**（含孤儿构建恢复），`/tmp/kf-layout-session-recheck-20261026.log`；401根因仍未证明，不用重跑成功擦除全量失败。
- 两轮视觉套件各 **311/311、零skip**，分别213.11s/212.41s，五种Chrome均成功完成真实上传、确认、签名、构建和下载（fixture模型）。本轮真实模型请求另为2次，不能合并到fixture回归冒充真实能源成功。
- 最终Chrome证据前缀 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-`，static/feedback/workspace-data/observe/repeater依次后缀ZSKxE5/EcMUFi/HKsqW7/2SS0gl/ctvasR。
- 最终两个隔离库均21条完成迁移、零其他连接、pending BuildJob=0；所有本轮测试进程均已退出。此前真实库账本保持；未访问受保护试用库/KF。最终源码类型、lint、领域/合同及编排检查均确认exit_code=0，API全量和本轮真实验收则为exit_code=1，如上如实记录。
- 最终29文件清单全部存在且无重复，限定清单的git diff --check通过；旧布局负例8份与新蓝图语法负例5份JSON共13份SHA核对通过，新证据未检出私有认证/receipt/reasoning字段。未输出整库补丁或带入其他历史脏文件。

## 本切片交付文件清单

相对仓库根目录；保持目录结构。本清单只描述本切片，既有未提交修改不能一并当作补丁，也不能重置。与前一报告重叠的文件应按最终完整文件交付。

```text
agent-app/packages/contracts/src/solution-implementation-plan.ts
agent-app/packages/contracts/src/solution-implementation-plan.test.ts
agent-app/packages/contracts/src/ui-style.ts
agent-app/packages/contracts/src/visual-blueprint-authority.ts
agent-app/packages/domain-client/src/solution-compile/layout-surface.ts
agent-app/packages/domain-client/src/solution-compile/layout-compiler.ts
agent-app/packages/domain-client/src/solution-compile/layout-compiler.test.ts
agent-app/packages/domain-client/src/solution-compile/component-compiler.ts
agent-app/packages/domain-client/src/solution-compile/solution-compiler.ts
agent-app/packages/domain-client/src/solution-compile/solution-compiler.test.ts
agent-app/packages/domain-client/src/solution-compile/solution-provenance.ts
agent-app/packages/domain-client/src/style/css-compiler.ts
agent-app/packages/domain-client/src/style/css-compiler.test.ts
agent-app/packages/domain-client/src/style/style-engine.ts
agent-app/apps/api/src/conversations/deepseek-model.ts
agent-app/apps/api/src/vision/visual-semantic-request.ts
agent-app/apps/api/src/vision/visual-semantic-output.test.ts
agent-app/apps/api/src/runs/visual-run-flow.integration.test.ts
agent-app/docs/visual-layout-surface-20261026.md
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-json-syntax/reference-review-before-edit.json
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-json-syntax/reference-review.json
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-json-syntax/accepted-differences.json
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-json-syntax/provider-reply.json
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-json-syntax/result.json
agent-app/tests/fixtures/energy-overview-20261023/live-blueprint-json-syntax/README.md
agent-app/docs/agent-runs-operations.md
docs/superpowers/plans/2026-10-20-agent-app-handoff.md
docs/superpowers/plans/2026-10-20-agent-app-next-master.md
docs/superpowers/plans/2026-10-20-agent-app-p4-vision.md
```
<!-- end -->
