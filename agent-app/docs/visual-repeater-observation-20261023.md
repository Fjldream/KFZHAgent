<!-- modified by jinlong.feng at 2026-10-23 Agent工作台迭代 -->
# 有界模拟重复实例的观察证明

<!-- modified by jinlong.feng at 2026-10-26 Agent工作台迭代 -->
**后续实施入口：** `visual-blueprint-sources-20261026.md`。当前blueprint@7/semantic@8，蓝图有界一次修复及无损输入投影已实施；完整视觉PG/五种Chrome292/292通过。最新真实工程语义仍有封装/事件数组/布局/尺寸问题，无能源工程包/KF验收；下一为语义有界修复与编译反馈。旧合盖回归已补齐，下面@4/@4原结论按历史保留，当前事实/用例/文件清单以10月26日报告为准。
<!-- end -->

## 本切片设计

接续 `visual-observation-journeys-20261023.md`，不改旧无 kind 旅程，也不接业务源。

1. 将既有 solution-provenance 的规范 key、实例 ID、parent、最近 repeater 和别名记录展开提取为 contracts 内共享纯投影，原领域 provenance 复用它，避免给观察验证另造一套 ID 规则。模块继续由领域 registry 回放，不因提取而绕过。
2. 投影受 maxItems、规范 key 唯一、100字符 ID、5000展开节点的独立防护上限约束；原 native 编译器更严格的全计划500展开节点预算保持不变，没有用证明预算代替编译准入。相同 source node 可在不同已声明记录下得到确定实例。字段只接受当前别名作用域内已声明 mock 记录中的字符串，不把数值/对象强制字符串化，不从未使用的 mock 数据中找答案。
3. 观察 witness 绑定真实展开实例、精确原文、source page/region、完整父链和最近 repeater。原生检查再核对实例 id/sourceSolutionNodeId、sourceRepeaterId、native text/content、父链/样式/页面内几何；模块、动态绑定、tab、浮层和屏外路径仍拒绝。
4. 原 artifact 再证明与 exact materialization/snapshot/signing 保持；模型不能提供 native ID 或自报证明。新 prompt 明确有界 mock 模板规则并升级冻结语义版本，须排空整体升级，production vision 仍关闭。
5. 先红绿测与保存的真实响应离线回放。原始 live-negative 不改；只有当前严格候选、来源与编译都通过后才进行下一次有上限的真实付费测试，不为旧侧栏 button 扩候选。

## 验收顺序

- 共享展开/别名/嵌套/key碰撞/上限/错误字段与非字符串负例。
- API 语义观察、真实编译和 artifact 原生文字/实例/父链/隐藏篡改负例。
- 实际浏览器确认与包内实例文字核对（fixture），完整相关回归。
- 真实能源图链路与 KF 隔离导入仍按实际结果报告，不能以 fixture 包替代。

## 已实施

- 新 `solution-node-projection.ts` 提取原领域 provenance 的 key 规范化、展开 id、parent、最近 repeater 与别名记录作用域；原导入路径继续 re-export 同名 Error/normalizer，领域验证复用共享投影，模块仍按 registry 回放。源类型没有改成任意对象，不接受模型提供 native id。
- 投影新增重复展开 id 碰撞和5000展开节点的防护上限；原编译器全计划500节点预算不改。maxItems/规范 key/100字符 ID 保持失败关闭，嵌套别名按原作用域规则处理。records 是不可信语义计划中的有类型 mock 值，不是逐行已授权的生产记录，也不是外部业务数据或执行授权；审批确认的是蓝图期望原文，不能据此宣称所有模型 mock 业务事实正确。
- 观察验证按模板实际使用的字符串字段取值，绑定每个实际投影实例；模块、动态数据绑定、tab/浮层、不可信隐藏/屏外、非字符串字段、未显示字段继续拒绝。原生/父链核对最近 repeater、精确 source/region、内容和原生 text，原 artifact 与 exact materialization/snapshot 再验证自动复用。
- 旧交互与缺 kind 的旅程门槛不变；未改历史原始五份 live-negative。测试另建明确 observe 的单元蓝图，原真实响应中的 KPI/设备/摘要文字全部通过语义观察证明，但原侧栏 button 不在该区域候选中，仍精确拒绝。测试明确保留这项候选错误，未把完整旧响应改成成功样例。
- 模型共享语义 prompt 明确有界 mock/实例要求，以及按实际页面区域取候选、不把静态外观当按钮权限。真实蓝图空单位负例之后补充“无单位省略键”规则，蓝图升为 **visual-blueprint@4**；真实工程 recipeId 负例之后明确 layout能力不是组合经验，冻结实现升为 **visual-semantic@4**。必须排空整体升级，同 run-plan@7 不支持混部，生产 vision 保持关闭；最新@4/@4并未再次进行付费验收，不能声称提示词已解决真实候选问题。

## 实测与中间失败

1. 共享观察红测先精确失败（重复字段没有 witness），接入后通过；包括嵌套别名、5000项预算、规范 key 碰撞/超长 id/展开 id 碰撞、错误字段/别名、数值和对象不字符串化、不显示的值不作证。
2. 真实领域编译单元夹具先被既有“repeater不能直接多实例做页面根”“固定高度与内在尺寸不符”拦截，改成正常普通布局根/内容高度；未放开编译器。之后测试额外 compiled 字段被严格交互输入拒绝，按原三字段合同调用；单元运行身份补上明确的 fixture correlation，不冒充工作区运行验证。
3. 原生编译与 opaque provenance 验证通过，错误 text、错误记录/实例/最近 repeater、隐藏、父级隐藏、屏外均拒绝。浏览器另行使用真正工作区身份物化，而不是上述单元 correlation。
4. 首次 Chrome 重复观察夹具错误地再次包装自己新增的 template，触发 stack overflow；只修夹具的字符串叶节点包装条件，没有放宽产品。修复后 **18:02:20 / 18.79s，1 passed / 276名称筛选未执行**，实际确认两项期望文字，真实编译/签名/快照/BuildExecutor/一次性下载，并按两个 sourceMap owner 解包核对 `演示设备A`、`演示设备B`。模型为本地 fixture，不是能源图真实模型/KF运行或像素一致。

定向 Chrome 证据：`/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-aLFi2F`，含 `client-project.gz`、解包文件与 `delivery-desktop.png`。

## 普通回归与最终复验边界

| 套件 | 实际结果 | 本地时间/时长 |
| --- | --- | --- |
| 付费前完整 API（semantic@3 / blueprint@3，含5种 Chrome） | 67文件，1007/1007，零skip | 18:04:17 / 327.33s |
| domain-client 串行全量 | 69文件，1454 passed / 5原有 skipped | 18:02:21 / 47.47s |
| contracts 全量 | 22文件，550/550 | 18:05:21 / 1.93s |
| Web 全量 | 26文件，183/183 | 18:04:18 / 4.23s |

上述付费前四包合计3194 passed、5原有 skipped，不是全 monorepo、不重复加定向测试。补充真实负例、空单位与 recipeId 提示规则后，@4/@4 root/API tsc 与15份 TS类型感知 ESLint 通过；contracts又全量550/550（18:17:41 / 2.46s）。Web vue-tsc/build通过，180模块，JS385.33kB/gzip131.85kB、CSS60.53kB。既有 lease cleanup WARN 仍出现，不声称系统级根因已消除。

最终全量 Chrome 证据的统一前缀为 `/var/folders/8p/b9t9yz5d5r3d70ry8gv8wq600000gn/T/kf-visual-browser-`：static=`ZKhQeO`、click-feedback=`Vm7TFM`、workspace-data=`xoPnSo`、observe=`YvdA3e`、observe-repeater=`kPdLkZ`。重复场景先核对审批卡两项原文，再按两个精确 sourceMap owner 核对快照与解包原生文字，下载文件 SHA 正确、二次链接401、无浏览器 JS error。模型 fixture，不能当作能源图真实工程或 KF验收。

### 最新 @4/@4 全量复验没有全绿，需保持机器唤醒后重跑

18:16:54 开始、1808.19s：API **1008 passed / 2 failed / 1 unhandled error**，不是1010通过。失败分别为 Chrome click-feedback 60000ms 超时、`rejects submitted engineering proof instead of reusing an untrusted binding` 30000ms 超时；还记录到异步 FENCE_REJECTED（最新相关用例为 submitted engineering result）。未删除/跳过用例、增加租约或放宽 fence 来掩盖失败。

只读电源日志确认：18:17:53 Clamshell Sleep；18:18:27 Maintenance Sleep（551s）；18:28:45 Maintenance Sleep（942s）；18:44:27 DarkWake。测试期间存在明确长时间系统休眠，跨越测试超时和租约期限，是有证据的环境干扰；**仍需连续唤醒状态下复跑，不能直接断言全部失败只是环境或产品已无缺陷**。未更改系统电源配置、阻止用户合盖或终止用户进程。最终测试进程退出，隔离库只读检查仍21完成迁移、0其他连接。

@4/@4 复验中 static/工作区名称/observe/observe-repeater 仍通过；其证据后缀分别 `7cWcxx` / `58Si8Z` / `dRTVVg` / `Kvflvj`（同前缀）。click-feedback没有成功证据，不以其他轮通过替代。本批最新全量状态是有两项失败，前面的1007全绿为付费前历史。

接手时请先让该 Mac 保持唤醒约6分钟，串行定向复跑 click-feedback、submitted engineering proof/result，再按原命令全量复跑；`KF_LIVE_VISUAL_ACCEPTANCE=disabled`、`KF_VISUAL_BROWSER_TEST=1`，仍只用该安全库。不要改用户电源配置，不在睡眠中反复跑收费测试；若唤醒后仍失败，再按实际堆栈定位运行/收尾异常。

## 本轮真实模型实验

普通全量回归已完成后，单独执行原 opt-in 能源图正式测试，读取已忽略本地配置，不输出密钥。每次固定图片 SHA、官方 endpoint、新租户/工作区与当前冻结协议，每次最多3物理调用、无自动重试；不修改 .env/试用库或远端 KF。

第一轮 18:10:11 / 24.18s，实际2次调用：识图成功，蓝图失败 INVALID_MODEL_OUTPUT，没有进入工程阶段或产出包。独立离线校验唯一错误：`pages[0].regions[5].sampleData[2].unit=""`。模型已正确声明 observe/expectedTexts，但更新时间没有单位时填了空字符串，违反原非空合同。未默删该字段/放开校验；补充明确提示、升 blueprint@4，并新增严格负例/提示词测试。源证据 `kf-energy-live-D5TI9e`；必要脱敏原响应与结果保存在 `tests/fixtures/energy-overview-20261023/live-blueprint-empty-unit/`，hash与边界见其README。vision input/output=1534/2943，cacheHit=1280，9.31s；blueprint=10087/2032，cacheHit=0，9.969s。记账 SUCCEEDED 不代表蓝图任务成功，也不能据此宣布缓存/降本验收。

空单位规则修复后 @4 单元/适配器共143项和 API类型检查通过，再单独新建一次正式验收（不是同一 Run 自动重试）：18:13:06 / 45.64s，实际3次调用。识图与独立蓝图通过，工程 FAILED/INVALID_MODEL_OUTPUT，尚未创建 build job，没有客户端包。工程严格校验最早错误为 `pages.0.root.children.0.children.0.recipeId`：模型把 layout.2/layout.4 填到13个可选 recipeId；这些是布局能力，不是候选 recipes 中的组合经验。

仅内存反事实诊断（未改原文件/旧Run/产品代码）：去掉这13项错误可选引用后，仍被三个 `overviewPage/sideNav` 按钮不在精确区域候选中拒绝。这个诊断不是有效计划或工程，不能签名、打包或当成功。对新负例补了 recipeId 的明确提示和严格回归，semantic 升@4；没有自动删字段、扩大候选或省略业务区域，之后暂停真实调用。后续应先审查候选与视觉映射约束是否一致，再设计有界、可追溯的语义修复策略，不能靠不断重跑收费试运气。

第二轮完整临时证据 `kf-energy-live-W3wV22`；可离线重现的5份JSON及hash存于 `tests/fixtures/energy-overview-20261023/live-semantic-layout-recipe/`，见README。vision input/output=1534/3183，hit1280，9.837s；blueprint=10873/2239，hit128，11.085s；implementation=29162/6163，hit0，18.08s。两个新验收共5个正式物理调用，无自动重试；真实结果不合并入普通回归通过计数。

当前结论：**重复 mock 观察证明已完成；真实能源图生成仍未成功，没有本轮能源工程包、KF 导入/运行或像素验收。** 生产 vision继续关闭，业务数据源暂缓。

## 本切片修改清单

15份 TS（已有文件未压缩，未涉及其他服务）：

- contracts：新增 `solution-node-projection.ts` / `.test.ts`；修改 `index.ts`、`observation-journeys.ts`、`visual-blueprint-authority.ts`、`visual-review.ts`。
- domain-client：修改 `solution-compile/solution-provenance.ts`；新增 `interaction/repeater-observation.test.ts`。
- API：`conversations/deepseek-model.ts` / `.test.ts`、`conversations/observation-journeys.test.ts`、`vision/visual-semantic-request.ts`、`vision/visual-blueprint-request.ts` / `.test.ts`、`runs/visual-run-flow.integration.test.ts`。
- 真实负例新增7份JSON（2+5份原始复制）及2份README，不插非法注释，不含凭据/headers/reasoning；原五份负例不变。
- 文档：本报告、上轮观察报告入口、design/master/P4/handoff/operations及负例README。无新依赖或迁移、无真实 .env 改动、Git状态改动或提交；旧试用库保持受保护。

## 接手顺序

1. 先完成上节连续唤醒复验，不把旧全绿结果冒充最新源码全绿。普通回归沿用上轮报告命令和原隔离库 `kf_agent_test_review_flow_20261023_1245`；同库 integration 不并发。新 Chrome 名称筛选为 `native package download \(observe-repeater\)`，不把未执行计成功。
2. 两份真实工程响应均保留候选问题，第二份还有 recipeId 错误。先离线审查接受的视觉映射与精确区域候选是否一致，再设计**有界语义修复**：冻结 attempt/配置/严格拒绝原因/收费账本，原蓝图、差异、actor、base、fence、能力门槛不变，修复后重新执行全部验证与签名；当前 repairPolicy=none、未实现，不偷偷改为循环。不得把负例改为成功、手改旧签名蓝图、扩候选或删除区域。后续真实验收仍固定调用上限、无盲目重试，不输出凭据/headers/reasoning。
3. 以真实模型正式工程结果为下一里程碑；有有效包才做 KF443 隔离新测试工程导入运行，不覆盖既有工程或重启服务，不关闭全局 TLS 检查。最后对照原能源图截图，不能把fixture包、物化证明或导入通过泛化为运行/1:1。
4. 业务源/预算门槛仍暂缓，T22/总体计划未完成、production vision关闭；其他交互/未知 hint/可信 retry、T17/T23/T24–T27 不冒充本切片已完成项。
<!-- end -->
