<!-- modified by jinlong.feng at 2026-10-22 Agent工作台迭代 -->
# T22 冻结视觉语义模型、专用网关与结果恢复

日期2026-10-22，功能名Agent工作台迭代；接续 `visual-blueprint-confirmation-20261022.md`。保留mixed dirty/current checkout，不自动commit/push/worktree/多代理。

## 1. 实际完成与边界

engineering proof现在可冻结专用semantic route/prompt身份/限制/repairPolicy；VisualSemanticService经真实scope/fence/DB lease/来源/当前许可复核，走实际ModelGateway/usage账本、严格语义校验和持久结果缓存。统一runtime/Conversation ModelPort已装配，原语义图节点可调用该服务并保留visualPlanConfirmationHash。不是只有一个无调用方schema，也不是再新增另一套编译器。

**T22仍IN_PROGRESS，不是公开图生工程交付。** engineering候选仍由隔离测试事务创建；@7执行器/handler及公共Store尚不支持confirm_blueprint，production vision继续关闭。没有完整PG图从该动作到compile/build/download，没有前端视觉上传确认接线。本轮验证到服务与原semantic节点，不拿它代替原生制品/sourceMap匹配、任意UI还原或完整上传到下载验收。

无迁移、实际.env/key/进程/旧试用变更、真实收费provider/KF请求；预算限制暂缓、旧POST退役、文字@6/原编译签名交付边界保持。

## 2. 配置与提示词

`VisualReviewService`服务器planningRoutes可选implementation；authority冻结新engineering proof时复制该route，保存semanticModel：HTTPS/JSON route、`visual-semantic@1`、`repairPolicy:none`、configHash。旧内部proof缺字段仍可读，但模型执行明确CONFIG_REQUIRED，不从当前环境补默认模型。

配置hash绑定完整system、create/coverage/journey/native/视觉规则、candidate投影版本、schema、输出32000token/响应2MiB/输入128000UTF-8 bytes、thinking=false和无隐式repair。输入另以保守bytes上界检查route上下文剩余量；配置有效不代表任意需求都装得下，也未验证真实provider是否支持这些限额，未更换原默认模型。

从既有DeepSeek适配器提取纯messages/validation函数；普通文字路径复用同一校验，固定提示词文本保持。视觉候选仍使用无损dictionary projection，完整bundle hash不变，不删能力事实骗过校验。prompt规则变更必须更新身份/版本；动态blueprint/candidates/资产/视觉结构进入请求inputHash，首次调用前固定，后续漂移拒绝。

构造请求只用签名blueprintReview/accepted、服务端重算候选和本工作区实际注册素材的安全metadata；参考图不混入素材表。不发送图像字节、历史消息、任意graph需求文本、repair草稿、receipt、租约、存储路径或凭据。OCR/派生结构仍受原同意和当前管理员外发许可约束。

## 3. 服务与缓存

每次入口/缓存命中、发送前、发布前：engineering reader按祖先锁序验证原链/签名/TTL/leaf/catalog/base/同意/许可，再lockActiveVisualRun验证实际RUNNING/owner/fence/DB墙钟lease/无取消/后继/build。核对graph传入scope/base/blueprint/reference/candidates/assets与可信重建事实完全一致，禁止repair上下文；任何网络调用期间不持事务。

唯一`visual-semantic-result-v1` step固定inputHash和owner:fence token：

- 同fence在途并发明确IN_PROGRESS，不双发；COMPLETED再次校验来源及完整结果后复用，不花第二次调用。
- FAILED可按明确新调用再次尝试，但一次方法调用只发一次，不隐藏JSON修复/文字fallback/repair。当前HTTP视觉retry仍关闭。
- 过期lease新owner恢复已完成结果不再请求；未知在途请求可重发且如实记账两次，不能承诺exactly-once收费。旧fence迟到不能覆盖新结果。
- schema/绑定/旅程/候选、截断、在途取消/政策撤销均不发布COMPLETED；已经发生的provider usage仍保留，不当成免费调用。
- 缓存必须是已经提交的规范结果。校验器原本会重绑模型输出里的server-owned hash；缓存读取不得借此“修复”坏hash。现在将存储原值与重校验结果做canonical一致性检查，变更即CACHE_INVALID，不重发或降级。

输出沿用现有语义计划/旅程/候选/区域绑定校验；既有受限语义脚本仍须经过后续编译校验，不开放模型直接写原生工程。模型计划返回不等于已批准构建，native投影/sourceMap的控件匹配仍由原编译链验证。

## 4. runtime与凭据

统一VISUAL_PLANNING_RUNTIME新增semantics。仅合法HMAC+deepseek模式+key+有效专用任务配置装配；fake/stub不外发。蓝图可用而语义配置不足时保持蓝图服务可用、semantics=null，不使普通文字整体失效。

semantic gateway绑定完整服务器route hash，历史endpoint/model与当前凭据路由不匹配在记账/网络前拒绝，不把新key给旧host。当前不是历史secret版本注册表。

Conversations组合专用方法并绑定原class receiver。特别修复：显式semantics=null时，必须隐藏base适配器原有的视觉语义方法，不能退回未冻结/未授权的旧方法；原文字方法保持。旧两参数composition兼容仅用于原调用，生产runtime显式传第三参数。

## 5. 测试与中间记录

原流程123，本轮新增22共145；runtime新增2共5，DeepSeek适配器原127项。三文件合计277项，中间失败见下，最终覆盖以完整API为准。真实上游图片/Run/review/accept/PG蓝图等待和engineering签名继承保留，语义provider为本地fetch，执行ALS/租约/usage/缓存是真实现。

- 两项首红：semanticModel未冻结、服务模块不存在；实现后新16语义项通过。
- runtime两项首红：缺凭据guard、缺专用端口时错误暴露旧方法；实现后通过。
- 原三文件271/271，再补并发/接管/缓存/原节点到276/276。缓存hash红测复现“错误resolve并重绑hash”，补严格缓存一致性。
- 扩大三文件出现275 passed/2 failed（277项，18:34:25 / 117.73s）：新semantic node用例默认5s超时、旧tenant-policy用例beforeEach默认10s超时。2项单独复验通过（18:54:32 / 4.39s，其余143筛选未运行），不放宽timeout/添加retry/永久skip，也不宣称全部历史偶发问题已根治。
- exactOptionalPropertyTypes要求显式route | undefined，已修正；lint修复URL字符串化与测试unbound-method，不关规则。最终root/API tsc和10文件type-aware ESLint、完整结果另记。
- 第一轮完整API为856 passed / 1 failed（857项，18:57:34 / 169.19s）：既有run-flow的文字工程用例创建会话预期201却得404。本轮新145流程/runtime/适配器项均在该轮通过；旧用例单独复验1/1通过（19:00:42 / 4.48s，其余14筛选未运行）。根因未定位，不把它归因于已冻结视觉路由或改鉴权绕过；随后仅再完整复验，不隐去中间结果。

## 6. 验证与环境

API仅用21迁移隔离库 `kf_agent_test_generation_full_20261022_0940`；定向API/编排器顺序用 `kf_agent_test_generation_20261022_0930`，同库不并发reset。Node仓库24.19.0，API显式COOKIE_SECURE=true/TEST_DATABASE_URL/KF_TEST_ALLOW_DESTRUCTIVE_RESET=1，命令沿用前批报告。

最终完整结果（2026-10-22本地时间）：

| 范围 | 结果 | 开始 / 耗时 |
|---|---|---|
| API 最终完整复验 | 64文件，857 passed / 0 failed / 0 skipped | 19:01:45 / 168.36s |
| agent-orchestrator | 19文件，214 passed / 0 failed / 0 skipped | 18:55:10 / 10.07s |
| contracts | 20文件，506 passed / 0 failed / 0 skipped | 18:54:20 / 1.44s |
| domain-client | 68文件，1403 passed / 0 failed / 5既有条件skipped（1408总项） | 18:55:32 / 16.71s |

合计2980 passed / 5既有条件跳过，非monorepo全量；277项相关定向已包含在API，不重复计数。最终root/API tsc、10文件type-aware ESLint exit0；tracked diff --check和涉及新增文件末尾空白检查无问题。

完整复验通过不抹去上述定向两次超时、完整856/1的会话创建404及既有lease cleanup WARN；根因未全部确认，不称历史偶发问题全根治。不改timeout/retry/永久skip或无关认证逻辑。没有Web/browser/build-jobs全量、真实provider/KF/Windows/OS kill/生产代理/多副本及完整视觉下载验收。

旧试用 `kf_agent_e2e_trial_20261021_01` 按18迁移和用户数据保护，不reset/seed或直接新代码重启指向它；源码21条升级仍需expand/排空整体升级worker。旧@7同字符串不表示支持新动作或模型配置；旧proof不得改写/补签救场。

## 7. 下一模型直接继续

1. **不再重做语义service/prompt/gateway/runtime或蓝图继承。** 接工程Run的cache前preflight、独立@7 confirm step/hash/handler。按engineering reader→当前执行lease的锁序，不能先持新Run锁倒序读祖先。
2. 图输入从签名blueprintReview+accepted恢复scope/base/design revision/hash/confirmation stamp，清旧构建/批准/模块channels；确定性确认，不把“确认”交给LLM分类。用本轮专用semantic端口进入原capability/semantic/compile/sign/snapshot/build/delivery。
3. **区分规划授权与已提交BuildJob跟踪**：当前reader/lockActiveVisualRun只适用于RUNNING/未构建，原源base/TTL检查不能原样用于已完成build后的只读收尾（工作区revision会合法改变）。须先验证本Run唯一绑定的已提交job/签名制品/结果revision，再定义恢复/跟踪分支；不能全局忽略stale-base/TTL或重跑模型/重复enqueue来绕过。
4. consumer真实可执行后才同步公共Store confirm事务：当前vision/egress/semantic runtime gate、幂等、同锁序、固定原config/base/actor，候选SQL NULL→freeze、Message/budget/queued同事务，source只消费一次。当前HTTP仍拒绝，不能先删屏障。
5. 覆盖真实HTTP确认→完整PG图→原生编译/签名/GenerationSnapshot→BuildJob→下载，以及当前UI上传/授权/差异/独立蓝图/交付。当前golden plan只验证语义服务与节点；视觉区域必须继续验证native控件匹配/sourceMap，不得凭node stamp宣称制品合格。真实provider/KF/Windows/像素还原另行授权验收。

## 8. 本轮文件

新API：vision/visual-semantic-request.ts、visual-semantic.service.ts。改API：deepseek-model.ts、conversation-runtime.module.ts、visual-review.service.ts、visual-blueprint-authority.ts、visual-blueprint-runtime.ts及其test、visual-run-flow.integration.test.ts；contracts/visual-blueprint-authority.ts。共10代码/测试文件；新本报告和master/handoff/P4/design/operations共6文档。不出未要求的补丁。
<!-- end -->
