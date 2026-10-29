<!-- modified by jinlong.feng at 2026-10-27 Agent工作台迭代 -->
# Agent 客户端原生显示与 UI 还原修复基线

本文件补充2026-10-20设计，依据2026-10-27用户实机截图、KF3.6开发/运行共享代码及443测试环境实际脚本。现有工程可以编译/导入，不等于原生显示或1:1通过。用户确认报错发生在导入后打开页面；截图显示多行输入框、顺序颠倒、大量无效留白及未生效字体/颜色。不得继续把原包当视觉验收结果。

## 1. 已核对的真实消费者

实际开发态入口：`https://192.168.3.32/kingclient/index.html?GUID=<新测试工程>&pageName=<原生安全名>`。入口`/kingclient/extension/KingPortal_entrance.js`加载`/kingclient/public/javascripts/Common/...`。不能使用省略public的猜测路径。工作区`中车现场代码/kingclient`的版本与测试环境不完全相同，必须比较具体消费者，不修改这些服务文件。

| 实际脚本（Common下） | 443完整文件SHA256 | 关键消费者 |
| --- | --- | --- |
| Graphic/Layout/kmui_layoutcomponentbase.js | de9f2d3805a34a0203b738f4fe4f4798adc160b86d51950315af80f7242b3720 | jsonToBaseProperty读baseProperty.styleDataNew；setStyleFormat替换domId并创建style |
| Graphic/Layout/kmui_horizontal_layout.js | dc7666b9ec73d47d465b4928e76075f26ea8ffbc7a161add012f6189ed0d184b | 按insiderObjects数组追加，读取sizePolicy/fixedSize/interval，最后调用setStyleFormat |
| Graphic/UI/kmui_richtext.js | 053fba1f1adf422b381628202640b6bf96c276ad3b045518a61401f00288b3b7 | uiModelType7是textarea；不读取styleData/styleDataNew，不调用CSS挂载 |
| Graphic/UI/kmui_textbox.js | ba927ba38322fd3b81bc6174b2a9fb4ba29dd323ea3a1e659e41918b8617796a | uiModelType6是input，不是原生静态Label；读fontInfo/readOnly/isBold/bkColor等，不读styleDataNew |
| Graphic/ElementUI/kmui_elementui_base.js | f4a477def9424893a3a1b9f2343291702a7a94dc40ccf45621893d17d50f6590 | propertys含styleData；jsonToObject调用setStyleFormat(self.styleData)，随后执行已配置的configureData |
| Graphic/ElementUI/kmui_elementui_tag.js | 5aae561614909404841416073f09ea2d409275a02bd48d55886141442019fff9 | 单标签文字来自Vue tags[].lable，普通Tag默认含示例及新增入口，必须显式关闭 |

Common消费者内部区分DEVELOP_SYSTEM/RUN_SYSTEM；运行侧还须核对RunClient实例化、页面缩放及样式覆盖，代码审阅不作为实际运行截图证据。临时原始脚本在/tmp/kf-live-kmui_*.js；不要把登录token、授权头或隐藏思维链放证据。

本地RunClient/Frame/libs/runview/km_object_convert.js（SHA256 5189f0359303e9630e92f45fe3ab606309a258d008bdc2114c178965bee639c6）经KMPage.jsonToObject反序列化页面，并另行采集原字体尺寸；km_pagemanager.js（197ba54eb78f80ae65ad61e4e6f4200c631b3c69a276ec546790978121c2677a）管理已转换页面。该目录在443对应路径返回404，不能声称部署运行入口已验证。实际开发入口kmui_initialdevelop.js（10c3a55273ba67502a75a1ed1b224483148a41c59cff95e8d21c28bbb8879c5f）还依赖门户写入的sessionStorage.userStore；只有WellinUserToken不足以直接打开完整工程。

## 2. 根因和所需适配

1. 原生页面名直接使用语义ID page-overview，违反开发态名称规则。应保持语义ID/GUID/导航相关性，单独派生安全的原生文件名，同步pageProperty/pagePrototype/pageManager/default/appHomePage及校验器。原生导航使用签名pageGuid，不能为了修名改业务语义ID或直接改旧Run。
2. 排序把KF数组顺序当普通绘制层级，按zIndex/词典顺序排列；横/纵布局实际用数组顺序重新排版。流式父容器应按签名几何x/y排序，绝对画布仍按zIndex/order；生成和校验必须共用规则。
3. 布局CSS落在顶层styleDataNew，但实际读取baseProperty.styleDataNew；背景色字段又没有被布局JSON读取。必须把容器CSS写到真正消费的位置，背景使用CSS；不能只让字节校验跟着错误字段通过。
4. ElementUI按钮/标签/输入等使用styleData，与布局不同，当前泛用styleDataNew也会丢失。须建立按真实控件族的样式存储槽和对应选择器契约，含未知原生样式保留、受管块幂等及篡改拒绝。
5. 旧text/richtext分别是单/多行输入，不能把它们默认当任意CSS静态文字。旧控件仅支持已验证的原生字体字段；完整CSS展示文本需补充经过验证的只读标签适配，优先复用已有可真实挂载CSS的组件，不能静默把已批准richtext改成另一能力。
6. 当前包大量sizePolicy=[3,3,...]（EXPANDING）和模板fixedSize，原生布局会改写已编译几何。须把语义fixed/content/fill映射到原生策略，尺寸来自编译器，不能统一强制fixed而破坏非视觉响应式功能。interval/内容insets也应落到原生实际布局规则，开发态和运行态间距算法需分别验证。
7. 参考图画布与生成画布比例及层级留白需真正受约束。当前1440×1412、上一份1440×1628都不是1:1证明；需按已审核参考viewport建立目标和偏差检查，不能任意增加根padding、无界拉长页面或用整图背景蒙混。

## 3. CSS与只读文字组件方案评审

现有ElementUI Tag(uiModelType50)的受限只读单标签模式已完成真实Chrome控件探针：`styleData`与`tag({tags:[{lable:...,type:...}],closable:false,addable:false})`在开发/运行模式分支显示同一文字，实际`.el-tag`为30px/700、rgb(17,34,51)、背景rgb(232,240,248)，没有input/textarea或新增按钮。Button同样生效；RichText开发模式仍为18px/400黑色textarea，运行分支因缺少KMUserAuthManager在权限检查处中断，其已创建DOM仍是默认textarea。证据在agent-app/outputs/native-style-probes-20261027；这不是完整发布应用验收，也不是生成器已经具备新展示文本能力。

若采用，必须补：受限语义text属性；仅编译器生成的单个字面量标签初始化；精确解析/验证该初始化，禁止任意configureData；默认清除新增/删除/编辑入口及默认示例标签；受管CSS的透明背景、边框/内边距归零、字号/字重/颜色/对齐/行高映射到真实.el-tag；兼容普通Tag现有用途；语义观察、原生包文字读取、来源/GUID证明和UI点击权限仍严格验证。样式需要作用于真实label子节点，不能只写外层root继承后被Element主题覆盖。

另一个候选是KMText(graphicType9/objectType0)，它不是uiModelType6。布局中会经KMGraphicModel并隐式包装二维布局，需独立的图形文本序列化/字体/测量/来源适配；不能只改一个类型数字冒充支持。

### 控件与CSS落地矩阵

| 目标UI元素 | 实际控件/承载面 | 需写入或补充的能力 | 当前证据与剩余验证 |
| --- | --- | --- | --- |
| 页面、侧栏、卡片、分割区域 | layout.2/4/5/6，baseProperty.styleDataNew，#domId | 背景、圆角、边线、阴影、padding/overflow；几何/interval/sizePolicy走布局编译，不靠CSS覆盖布局计算 | 本轮修复存储和背景，流式顺序已修；尺寸策略、间距、缩放尚未映射验证 |
| 标题、KPI数字/单位、状态文字 | 新的受限展示文本适配，优先单行Tag50探针路线 | 真实label节点字体、颜色、字重、对齐；清除默认tag边框/背景/内边距/新增与关闭；继承字体不能被组件主题覆盖 | 单控件探针通过，语义属性/初始化/来源观察/白名单尚未实现；多行正文不能直接硬套单行Tag |
| 普通与说明按钮 | ElementUI35，styleData，#domId .el-button及内部label/icon | 背景、边框、圆角、字号、悬停/禁用；必须由编译器控制真实动作与静态按钮的区别 | 本轮修复CSS字段和背景；真实控件两模式探针通过，整页hover/focus/disabled仍须验收 |
| 表单输入/选择 | ElementUI38/44/49等，styleData，已审查input/placeholder等part | 命中.el-input__inner等实际输入节点、placeholder、焦点/禁用；编辑行为保留 | 本轮按已证据化ElementUI族修复CSS字段，未冒充全部输入类已完成实机样式验收 |
| 图片/图标 | ElementUI41，styleData，已审查media part | 真实img的object-fit/裁剪/圆角；授权资源路径、大小、透明背景与离线资源完整性 | 物理CSS字段已修；图标素材和全页资源显示仍待验证，不能用整张UI图作为工程背景代替控件 |
| 菜单与页签 | Navmenu34/Tabs47，styleData，实际item/active-indicator/panel part | 层级数据、选中状态、hover、图标和导航目标；受限初始化与真实GUID动作 | CSS字段已修；Navmenu仍preserve-only，不据此扩大新生成白名单；能源页菜单目前仅静态近似 |
| 数据表格/告警列表 | EasyUI Datagrid1，顶层styleDataNew及实际datagrid子节点 | 表头/单元格/行高/分隔/选中状态CSS，columns/data/初始化及受限事件；行高与数据行数不是改背景色能实现 | 存储保留EasyUI原规则，不受ElementUI改名影响；表格能力已有独立合同，目标UI样式仍须实机核验 |
| 趋势图/环图/仪表 | 已授权图表组件或独立经过验证的图表适配 | 原生options/series/axis/legend/数据以及大小重绘；CSS只管外围，不能生成曲线和刻度 | 当前完整能源包没有真实图表控件；不得以空布局/文字框声称图表已经还原 |

字体族也是明确缺口：当前theme.fontFamily有值，但CSS声明链没有fontFamily映射，现有模板仍可能使用Arial。需增加受限字体族/回退列表，编译到真实文字节点，并验证Windows字体可用性与加载完成后的测量；不能因为theme字段存在就认为中文字体已应用。lineHeight现有合同为0.5..4的无单位倍数，不得把40px探针例子直接当合法模型声明。多行换行、截断、box-sizing、默认组件padding和边框须通过受限适配表达，不能开放模型任意CSS。

内部样式引擎的styleDataNew是历史交接字段名，不代表原生所有控件都使用同名物理字段；nativeStyleStorage负责最后的存储路由。旧未知styleDataNew和真正styleData中的客户CSS都必须保留，只合并自己的受管块。

## 4. 分步落地和验收

- 第一批已实现：原生安全页名、布局CSS存储、背景CSS、横/纵子项顺序；不改已上传工程的无关名称、样式或绝对层级。ElementUI物理CSS字段也已修复，直编/普通补丁/creative补丁/校验器共用路由，EasyUI保持原字段。新测试经HMAC签名、原生生成和验证，证明page-overview安全名同步及GUID导航保持；把按钮CSS迁回错误字段会被拒绝。
- 第二批待实现：只读展示文字的受限组件适配、字体族/多行/默认主题重置。先单控件探针，再语义schema/初始化闭合解析/来源/观察/签名/篡改测试，不能通过服务器静默换掉已批准richtext；必须新审核。
- 第三批：把编译尺寸/策略/间距和参考画布约束传到原生，先单控件探针，再完整能源页；字体测量、边界和滚动须对照实机。
- 第四批：新审核、新蓝图确认、新编译与独立KF工程，开发态可打开/保存；独立运行应用检查字体、布局、图标、按钮、缩放及滚动；桌面/窄屏截图和参考图对比。生产开关保持关闭，原有运行应用与受保护18迁移试用库保持。

所有新代码遵守当天Agent工作台迭代标注，原生服务只读。一次模型修复额度、候选/来源/观察/签名/租约及下载制品SHA不能放宽。真实调用只在新能力/样式探针与离线/PG通过后进行；原始失败和成功模型回复、旧包保持原件，新修正版另命名，不倒改成功记录冒充UI验收。
<!-- end -->
