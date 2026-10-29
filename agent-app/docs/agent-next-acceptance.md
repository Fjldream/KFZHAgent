<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
# Agent App 可用版验收记录（2026-10-27）

**基础可试用版本已完成本轮验收。** 登录、多会话、真实文字生成、继续修改、单图生成、构建下载、历史查看/分叉、刷新和正常进程重启恢复均取得证据。三份最终包在用户授权KF443环境独立导入、逐页读回一致，开发态打开无名称警告或脚本错误。本轮未发布运行态，不宣称UI还原、运行交互或原长期计划全部完成。

试用入口 `http://127.0.0.1:43301/login`；租户“Agent 可用版试用”，用户 `admin`。密码只见本机私有 `.kf-trial-v1/access.json` 的 `currentPassword`，不包含在本文件或补丁。当前独立库 `kf_agent_trial_v1_20261027`、22迁移、UTC；旧库/旧服务及实际.env未替换。

## 最终真实模型和浏览器

| 路径 | 结论与证据 |
| --- | --- |
| 登录/首次改密 | 通过；随机初始密码，真实强制改密；login.json无密码 |
| 文字需求→蓝图确认→构建→下载 | 真实DeepSeek与生产worker通过；最终text.json |
| 文字工程继续修改 | 通过；原始自然语言需求正常重试、新蓝图确认；设备A正常替换成设备B待机，无旧文字残留；7处GUID、全部页和包路径保留，画布尺寸可调整；modify-content-verification.json |
| 单图→识别→差异审核→独立蓝图→工程包 | 通过；最终@14/8/24/13，三阶段真实模型，运行中浏览器刷新后同一轮继续，0个工作台脚本错误；image.json |
| 多会话/草稿/管理 | 新建、切换、改名、分页、归档只读/恢复、会话A/B草稿与模式、刷新、浏览器前进后退通过；父目录management.json |
| 历史精确下载和分叉 | 最终首包SHA一致；分叉含首轮A上下文，排除后续B、旁支及可执行审批回执；工作区仍指向修改版，不回滚；最终history.json |
| 正常整组重启恢复 | 等待蓝图确认后停止/启动；9个Run状态、1个原job、11个已返回响应、当前版本逐项不变，恢复同一Run后交付；父目录restart-verification.json；不等同在途模型请求OS kill |
| 旧长名基线 | 历史text/image精确原包仍可下载；新生成在模型前拒绝，失败码CREATIVE_GENERATED_NATIVE_NAME_REGENERATION_REQUIRED，0个执行step/0个本轮gateway调用，无BuildJob，基线不动；legacy-native-name-refusal.json |

最终正例目录为 `outputs/usable-v1-20261027/native-name-fixed/`。可直接导入合法短名别名 `DeviceOverviewV1.gz`、`DeviceOverviewV2.gz`、`EnergyOverviewV1.gz`；与原三份包字节一致。各json列出实际Run/revision/job/artifact，SHA由实际下载字节计算。

| 最终工程 | 字节 | SHA-256 |
| --- | --- | --- |
| text | 14389 | `d32976f4cf5795b3b0e4a62383e40b89e69004999928bf89f92cad8198055753` |
| modify | 14393 | `b08d03d2d13b0f483cb710c2a932454c7cf730ebf61f5934a7db2684989165f8` |
| image | 21797 | `dc9197bda1590a0de97cb659a7c558e1a16cdf12dc200688e94d3ef740cd0e2e` |

父目录原text/modify/image-client.gz属于修复前历史，不被覆盖、不作为最终正例。没有将手工修过的包冒充模型/worker原始交付。

## KF真实导入与开发态

| 最终包 | 独立工程 | 原生结果 |
| --- | --- | --- |
| text | AgentTextReadyV120261027 | 52→53；逐页JSON读回相等；设备A正常可见 |
| modify | AgentTextReadyV220261027 | 53→54；逐页JSON读回相等；设备B待机可见，设备A正常消失 |
| image | AgentImageReadyV120261027 | 54→55；逐页JSON读回相等；能源管理系统/园区能源总览/演示数据可见 |

三份均先标准门户登录、建立真实选中工程上下文后打开开发页；打开成功，0个JS错误、0个dialog，无非法名称提示；本次取得的页面席位均显式释放且errorCode=0。新生成页/控件/布局名全部字符合法且最长32；未覆盖任何原工程、未发布。证明见各kf-native-*-development-verification.json/png、*-seat-release.json、kf-native-text-import-verification.json和kf-native-final-import-verification.json。

原KF开发页依赖当前选中工程上下文；最早使用不完整登录/工程上下文的调试页发生报表加载空projectId错误，修正验收方式后消失，未修改原生KF服务。不能据此宣称修改了KF报表实现。

## 最终源码自动化

以下是名称32、混合几何、稳定repeater key修复后的同一冻结源码重新执行，非把历史重复运行累加。数据库测试串行/单worker，专用新UTC测试库22迁移；E2E使用独立kf_agent_e2e_usable_v1_20261027和43400/43401。真实模型证据与固定模型回归分开。

| 范围 | 通过文件 | 通过用例 | 条件跳过 |
| --- | --- | --- | --- |
| flow | 1 | 19 | 0 |
| api | 88 | 922 | 0 |
| packages | 159 | 2757 | 5 |
| runtime | 2 | 11 | 0 |
| visual | 1 | 347 | 0 |
| e2e | — | 10 | 0 |

8个类型配置（API/合同/领域/编排/worker/build-jobs/trial/Web）全部通过；100个本轮修改/新增TypeScript文件lint通过；最终Web生产构建通过。visual包含5种Chrome流程，E2E10项使用测试模型；不能称为10次真实模型。5项条件skip沿用既有条件，不宣称已执行。各结果及日志SHA在release-automated-verification.json；关键源码/最终Web文件SHA见release-source-build-verification.json。

早期遇到HTTP404/Parse Error、浏览器竞争下等待超时，原失败日志保留；随后同源码串行重跑通过。未证明同一根因，不宣称已定位或修复所有网络偶发现象，也没有放松鉴权/时限/成功断言掩盖。

## 修复与边界

- 已修复：会话分页/管理与归档竞争、慢响应串草稿、历史job取错、失败重试丢原始需求、项目key漂移、旧对象/本地状态可信复用、原生名称超过32、混合已有/新增节点坐标、重复项改文字误换key留下旧项、视觉蓝图观察文本粒度及模型思考配置。
- 重复项投影v2有完整有界数据/key/布局/父子事实，24KiB和敏感值守卫保持；既有key集合和类型不能改，显示值/排序可改。既有记录集合增删需后续可信删除协议，新独立repeater仍可生成；不静默删记录、换布局类型或扩大修复次数。
- 旧长名生成工程仅历史只读；新建工程生成短名基线。未改旧包/旧签名/任意未知上传对象名称。
- 图片初次生成可用；图片工程普通文字续改在模型前明确拒绝，需后续T23的新同意复用/局部编辑协议，不能把旧图片识别结果视为新授权。失败图片需重新上传、同意、审核，不能直接复用旧回执重试。
- 不保证模型每次合法；无效输出严格失败且不产生成功包，补正最多一次。文字原需求重试不继承审批。
- UI精细还原、只读文字/字体/图表/比例、预算、真实业务源、完整用量账本和缓存成本A/B继续后置。当前“用量未知”不等于零成本。
- 本轮原生验证到导入/读回/开发态；完整运行态发布、交互/像素评测、故障OS kill、多副本/代理/跨平台矩阵未完成，native自动验证标志仍关闭。
- private目录、实际.env、API Key/密码/token、数据库、私有存储/诊断及node_modules不进入补丁；公开样例和固定测试签名不等于真实批准回执。ZIP及逐文件SHA读回结果见patch/verification.json。

实施/后续边界见agent-usable-v1-20261027.md；启动、迁移和回退见agent-next-release-runbook.md；补丁只按本轮精确基线收集，保留目录，不覆盖其他KF服务。
<!-- end -->
