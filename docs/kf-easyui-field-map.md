# KF EasyUI 控件字段映射文档（objectType=3）

> 用途：为 IR 建模 / allowlist 提供 easyui 控件（`uiModelType` 为 null 且 `objectType===3`）的完整字段集。
>
> 数据来源：
> - 参考工程：`/tmp/kf_ref/1.0.0.1/project/page/*.json`（275 个页面，596 个 easyui 控件）
> - 控件源码：`KingFusion3.6_Center/kingdevopscenter/kingclient/exe/public/javascripts/Common/Graphic/UI/kmui_*.js`（49 个文件）
> - 枚举定义：`Common/Global/kmui_glabolvar.js` 中 `kmUIExtendTypeEnum`
> - 工厂映射：`Common/Util/km_factory.js` 中 `UIObjectFactory.create()`

---

## 1. proto（uiExtendType）→ 控件名映射

| uiExtendType | prototypeName（控件名） | 参考工程数量 | 占比 | 源码类 | 源码文件 |
|---|---|---|---|---|---|
| 0 | Combobox | 24 | 4.0% | `KMUIExtCombobox` | kmui_ext_combobox.js |
| 1 | Datagrid | 75 | 12.6% | `KMUIExtDatagrid` | kmui_ext_datagrid.js |
| 2 | LinkButton | 249 | 41.8% | `KMUIExtLinkbutton` | kmui_ext_linkbutton.js |
| 3 | Numberbox | 5 | 0.8% | `KMUIExtNumberbox` | kmui_ext_numberbox.js |
| 4 | NumberSpinner | 7 | 1.2% | `KMUIExtNumberspinner` | kmui_ext_numberspinner.js |
| 5 | Propertygrid | 14 | 2.3% | `KMUIExtPropergrid` | kmui_ext_propergrid.js |
| 6 | Searchbox | 5 | 0.8% | `KMUIExtSearchbox` | kmui_ext_searchbox.js |
| 7 | Slider | 9 | 1.5% | `KMUIExtSlider` | kmui_ext_slider.js |
| 8 | Spinner | 2 | 0.3% | `KMUIExtSpinner` | kmui_ext_spinner.js |
| 9 | Textbox | 69 | 11.6% | `KMUIExtTextbox` | kmui_ext_textbox.js |
| 10 | TimeSpinner | 5 | 0.8% | `KMUIExtTimespinner` | kmui_ext_timespinner.js |
| 11 | DateBox | 0 | — | `KMUIExtDateBox` | kmui_extdatebox.js |
| 12 | Dialog | 5 | 0.8% | `KMUIExtDialog` | kmui_extdialog.js |
| 13 | FileBox | 6 | 1.0% | `KMUIExtFileBox` | kmui_extfilebox.js |
| 14 | MenuButton | 5 | 0.8% | `KMUIExtMenuButton` | kmui_extmenubutton.js |
| 15 | ProgressBar | 8 | 1.3% | `KMUIExtProgressbar` | kmui_extprogressbar.js |
| 16 | ToolTip | 2 | 0.3% | `KMUIExtTooltip` | kmui_exttooltip.js |
| 17 | Tree | 33 | 5.5% | `KMUIExtTree` | kmui_exttree.js |
| 18 | TreeGrid | 14 | 2.3% | `KMUIExtTreegrid` | kmui_exttreegird.js |
| 19 | Window | 4 | 0.7% | `KMUIExtWindows` | kmui_extwindows.js |
| 20 | Calendar | 7 | 1.2% | `KMUIExtCalendar` | kmui_ext_calendar.js |
| 21 | DateTimeBox | 8 | 1.3% | `KMUIExtDateTimeBox` | kmui_extdatetimebox.js |
| 22 | pagination | 5 | 0.8% | `KMUIExtPagination` | kmui_extpagination.js |
| 23 | ValidateBox | 0 | — | `KMUIExtValidateBox` | kmui_extvalidatebox.js |
| 24 | combotree | 9 | 1.5% | `KMUIExtCombotree` | kmui_ext_combotree.js |
| 25 | Tagbox | 4 | 0.7% | `KMUIExtTagbox` | kmui_ext_tagbox.js |
| 26 | Sidemenu | 12 | 2.0% | `KMUIExtSidemenu` | kmui_ext_sidemenu.js |
| 27 | Switchbutton | 4 | 0.7% | `KMUIExtSwitchbutton` | kmui_ext_switchbutton.js |
| 28 | Validatebox | 3 | 0.5% | `KMUIValidatebox` | kmui_validatebox.js |
| 29 | ImageCarsuel | 3 | 0.5% | `KMUIImageCarsuel` | kmui_image_carsuel.js |

**合计：596 个对象（objectType=3 且 uiModelType 为 null）**

注意：
- `uiExtendType` 枚举里 **23 与 28 都叫 VALIDATEBOX**：23 = `VALLIDDATEBOX`→`KMUIExtValidateBox`（封装 easyui validatebox），28 = `VALIDATEBOX`→`KMUIValidatebox`（KF 自研校验框，prototypeName="Validatebox"）。参考工程只用 28。
- 枚举里 30~34（GANTT/TABLE/DROPDOWN/NAVMENU 等）不属 easyui 控件，参考工程中未出现；11（DateBox）与 23 未出现。
- 旁证：参考工程中另有一批 `objectType=3` 但 `uiModelType` 非空（0/1/6/7）的对象，其 `uiExtendType` 全为 null，属 UI 模型（KMUITextBox/KMUITable 等），**不在此文档范围**。

---

## 2. 公共基础字段（全部 easyui 控件共有）

这些字段由 `KMUIExtendBase`（kmui_uibase.js）构造器定义，`jsonToObject()` 以 switch 分支逐个赋值，`objectToJson()` 统一序列化，**各控件完全一致**（个别控件有差异，见备注）。

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| guid | string | uuid `k...` | 对象唯一标识 |
| name | string | `Combobox1` 等 | 控件名，setName 有非法字符校验 |
| objectType | int | 3 | 恒为 3 |
| uiExtendType | int | 0~29 | 见 §1 |
| leftTopPt | object | `{x,y}` | 左上角坐标（浮点） |
| width / height | int | 各控件默认 | 宽/高 |
| sizePolicy | list[4] | `[3,3,0,0]` | 水平/垂直尺寸策略（3=EXPANDING） |
| fixedSize | list[2] | `[w,h]` | 固定尺寸（与 width/height 相同） |
| visible | bool | true | 设计期可见 |
| runVisible | bool | true | 运行期可见 |
| enable | bool | true | 使能 |
| lock | bool | false | 锁定（不可编辑） |
| comment | string | `''` | 描述 |
| memberAccess | bool | true | 成员可访问 |
| modleStyle | string | `''` | 模型样式脚本 |
| configureData | string | `''` | 详细配置脚本（eval 执行） |
| styleData | string | `''` | 样式脚本 |
| styleDataNew | string | `''` | 新样式脚本 |
| changeProperty | object | `{}` | 变更属性记录（含 width/height） |
| version | string | `2.0.0.1` / `1.0.0.1` | 控件版本（由 getVersion() 写入） |
| linkMng | object | `{linkList:[...]}` | 连接/事件管理器（JSON 序列化为 `{IDS_BASE:[{connectName,configData,statusSelected}]}`） |
| securityPriority | int | 1 | 安全优先级 |
| securitySection | list | `[]` | 安全分区 |
| resourceGroup | list | `[]` | 资源组 |
| isControl | bool | false | 是否受权限控制 |
| resDescription | object | `{}` | 资源描述 |

**差异备注**：
- `alpha`（bool，透明）仅 Datagrid(1)、Propertygrid(5)、Tree(17)、TreeGrid(18) 有（`KMUIExtendBase.prototype.setalpha` 支持 DATAGRID/TREEGRID/PROPERGRID）。
- `picName`/`backPicName`（图片按钮）仅 LinkButton(2)、FileBox(13) 有。
- `region`（子内容布局容器 `KMWinDiagLayout`，layoutType=7，内含 baseProperty/insiderObjects）仅 Dialog(12)、Window(19) 有。
- `primary`（响应式字体/尺寸，object，多数为 `{width,fontSize}`）多数控件有，**Propertygrid/Searchbox/Slider/TreeGrid/Dialog/Window/FileBox/MenuButton/ProgressBar/ToolTip/Tree/DateTimeBox/Tagbox/Sidemenu/Switchbutton/Validatebox/Calendar/pagination/combotree/ImageCarsuel 无**。
- Validatebox(28) 的 `objectToJson` 不序列化 `configureData`；ImageCarsuel(29) 不序列化 `resourceGroup`（因此参考工程对象里没有这两个 key）。

**序列化机制（源码验证）**：`jsonToObject(t,r)` 遍历 JSON 的 key：上述基础字段走 `switch` 分支直接赋给 `this.xxx`；其余 key 进入 default 分支收集到临时对象 `s[]`，开发态通过 `$(id).<widget>(s)`（如 `datagrid`/`textbox`/`filebox`…）或运行态 `addOptions()` 传给 easyui。`objectToJson()` 则从 `$(id).<widget>("options")` 中按白名单 key 数组取当前值，再拼上基础字段。

---

## 3. 各 proto 字段并集（参考工程真实对象）+ 源码对照

> 表格约定：`类型` 取参考工程主要类型（bool/int/string/list/object）；`参考值/默认` 为示例值或 easyui 默认值；`源码` = objectToJson 白名单/构造器中的字段来源。

### 3.1 Combobox（uiExtendType=0，24 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| editable | bool | true | 是否可编辑 |
| value | string | `''` | 值 |
| valueField | string | `label` | 值字段 |
| textField | string | `value` | 文本字段 |
| mode | string | `local` | 数据模式 local/remote |
| method | string | `post` | 请求方法 |
| data | list | `[{label,value}]` | 本地数据 |
| primary | object | `{width,fontSize}` | 响应式 |

源码白名单（objectToJson）：`width,height,value,editable,valueField,textField,groupField,mode,url,method,data`。构造器默认：`width="150",height="25",primitiveHeight=20,miniFontSize=10`。

### 3.2 Datagrid（uiExtendType=1，75 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| method | string | `post` | 请求方法 |
| queryParams | object | `{}` | 查询参数 |
| fitColumns | bool | false | 列自适应填满宽度 |
| resizeHandle | string | `right` | 列拖拽手柄 |
| autoRowHeight | bool | true | 行高自适应 |
| striped | bool | false | 斑马纹 |
| nowrap | bool | true | 不换行 |
| data | list | `[]` | 行数据 |
| loadMsg | string | `Processing...` | 加载提示 |
| rownumbers | bool | false | 行号列 |
| singleSelect | bool | false | 单选模式 |
| selectOnCheck | bool | true | 点复选框选中行 |
| checkOnSelect | bool | true | 选中行勾复选框 |
| pagination | bool | false | 底部工具栏分页 |
| pagePosition | string | `bottom` | 分页条位置 |
| pageNumber | int | 1 | 页码 |
| pageSize | int | 5 | 每页行数 |
| pageList | list | `[10,20,30,40,50]` | 页大小选项 |
| sortOrder | string | `asc` | 排序方向（72 个对象有） |
| multiSort | bool | false | 多列排序 |
| remoteSort | bool | false | 远程排序 |
| showHeader | bool | true | 显示表头 |
| showFooter | bool | false | 显示表尾 |
| scrollbarSize | int | 18 | 滚动条宽度 |
| toolbar | list | 仅 4 个对象有 | 工具栏项 `[{iconCls},{text}]` |
| alpha | bool | false | 透明背景 |
| primary | object | `{table_width,header_fontsize,table_fontsize,header_height,table_height}` | 响应式 |

源码白名单（objectToJson）：`width,height,fitColumns,resizeHandle,autoRowHeight,toolbar,striped,method,nowrap,idField,url,data,loadMsg,pagination,rownumbers,singleSelect,checkOnSelect,selectOnCheck,pagePosition,pageNumber,pageSize,pageList,queryParams,sortName,sortOrder,multiSort,remoteSort,showHeader,showFooter,scrollbarSize`（`idField/url/sortName` 因无值未出现在参考工程 JSON）。构造器默认：`width="300",height="300",demoName="初始化表头"`。

### 3.3 LinkButton（uiExtendType=2，249 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| id | string | `cssIDk...` | 样式用 dom id |
| disabled | bool | false | 禁用 |
| toggle | bool | true | 可切换按下状态 |
| selected | bool | false | 选中（toggle=true 时生效） |
| outline | bool | false | 轮廓样式 |
| group | string | `g1` | 单选按钮组名 |
| plain | bool | false | 朴素样式 |
| text | string | `''` | 按钮文本 |
| iconAlign | string | `left` | 图标位置 |
| size | string | `small` | 尺寸 |
| iconCls | string | 仅 1 个对象有 | easyui 图标类 |
| picName | string | `''` | 自定义背景图 |
| backPicName | string | `''` | 悬停背景图 |
| primary | object | `{width,fontSize}` | 响应式 |

源码白名单（objectToJson）：`disabled,toggle,selected,outline,group,plain,text,iconAlign,badgeStatus,badgeNumber`。构造器默认：`width="80px",height="40px",picName="",picPath="",badgeNumber="0",badgeStatus=false,toolTipEnable=false`（badge 字段在参考工程 JSON 中未见，说明默认未启用时不序列化）。

### 3.4 Numberbox（uiExtendType=3，5 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| disabled | bool | false | 禁用 |
| value | string | `''` | 值 |
| min / max | int | 0 / 100 | 范围 |
| precision | int | 2 | 小数位 |
| decimalSeparator | string | `.` | 小数分隔符 |
| groupSeparator | string | `''` | 千分位分隔符 |
| prefix / suffix | string | `''` | 前缀/后缀 |
| primary | object | `{width,fontSize}` | 响应式 |

源码白名单（objectToJson）：`width,height,disabled,decimalSeparator,groupSeparator,prefix,suffix,value,min,max,precision`。构造器默认：`width="80",height="20"`。

### 3.5 NumberSpinner（uiExtendType=4，7 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| interval | int | 200 | 长按步进间隔 |
| editable | bool | false | 是否可编辑 |
| multiline | bool | false | 多行 |
| min / max | int | 10 / 100 | 范围 |
| precision | int | 0 | 小数位 |

源码白名单（objectToJson）：`editable,width,height,multiline,interval,min,max,precision`。构造器默认：`width="173",height="22"`。

### 3.6 Propertygrid（uiExtendType=5，14 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| data | object | `{total,rows:[{name,value,group,editor}]}` | 属性数据 |
| showGroup | bool | true | 显示分组 |
| groupField | string | `group` | 分组字段 |
| alpha | bool | false | 透明背景 |

源码白名单（objectToJson）：`width,height,showGroup,groupField,groupFormatter,data`。构造器默认：`width="300",height="300"`。

### 3.7 Searchbox（uiExtendType=6，5 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| prompt | string | `Please Input Value` | 提示文本 |
| value | string | `''` | 值 |
| menu | string | `#mmmm` | 下拉菜单选择器 |
| primary | object | `{width,fontSize}` | 响应式 |

源码白名单（objectToJson）：`width,height,prompt,value,menu`。构造器默认：`width="280",height="22"`。

### 3.8 Slider（uiExtendType=7，9 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| mode | string | `h` | 方向 h/v |
| reversed | bool | false | 反向 |
| showTip | bool | false | 显示气泡提示 |
| disabled | bool | false | 禁用 |
| value | int | 68 | 当前值 |
| min / max | int | 0 / 100 | 范围 |
| step | int | 1 | 步长 |
| rule | list | `[0,'\|',25,...]` | 刻度规则 |

源码白名单（objectToJson）：`width,height,mode,reversed,showTip,disabled,value,min,max,step,rule`。构造器默认：`width="130",height="40"`（枚举名 SILDER，prototypeName="Slider"）。

### 3.9 Spinner（uiExtendType=8，2 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| editable | bool | true | 是否可编辑 |
| disabled | bool | false | 禁用 |
| value | string | `''` | 值 |
| min / max | int | 1 / 100 | 范围 |
| increment | int | 10 | 步进值 |
| primary | object | `{width,fontSize}` | 响应式 |

源码白名单（objectToJson）：`width,height,increment,value,min,max,editable,disabled`。构造器默认：`width="173px",height="22px"`。

### 3.10 Textbox（uiExtendType=9，69 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| required | bool | false | 必填 |
| editable | bool | true | 可编辑 |
| disabled | bool | false | 禁用 |
| readonly | bool | true | 只读 |
| prompt | string | `''` | 提示文本 |
| value | string | `''` | 值 |
| type | string | `text` | 输入类型 text/password |
| multiline | bool | false | 多行（textarea） |
| icons | list | `[]` | 图标数组 |
| iconAlign | string | `right` | 图标对齐 |
| iconWidth | int | 26 | 图标区宽 |
| buttonText | string | `''` | 附加按钮文本 |
| buttonAlign | string | `right` | 按钮对齐 |
| primary | object | `{width,height,fontSize}` | 响应式 |

源码白名单（objectToJson）：`width,height,cls,prompt,value,type,multiline,editable,required,disabled,readonly,icons,iconCls,iconAlign,iconWidth,buttonText,buttonIcon,buttonAlign`。构造器默认：`width="200",height="25",miniFontSize=10`。

### 3.11 TimeSpinner（uiExtendType=10，5 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| value | string | `02:00:00` | 时间值 |
| separator | string | `:` | 分隔符 |
| showSeconds | bool | true | 显示秒 |
| highlight | int | 0 | 高亮字段 |
| primary | object | `{width,fontSize}` | 响应式 |

源码白名单（objectToJson）：`width,height,separator,showSeconds,highlight,value`。构造器默认：`width="173",height="22"`。

### 3.12 Dialog（uiExtendType=12，5 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| title | string | `''` | 标题 |
| collapsible | bool | false | 可折叠 |
| minimizable | bool | false | 可最小化 |
| maximizable | bool | false | 可最大化 |
| resizable | bool | false | 可缩放 |
| inline | bool | true | 内联显示 |
| toolbar | list | 仅 1 个对象有 | 工具栏 `[{text,iconCls}]` |
| buttons | list | 仅 3 个对象有 | 按钮 `[{text}]` |
| region | object | KMWinDiagLayout | 子内容布局容器 |

源码白名单（objectToJson）：`width,height,title,collapsible,minimizable,maximizable,resizable,toolbar,buttons,inline`。构造器默认：`width=400,height=200,classType=true,region=new KMWinDiagLayout`。注意 Dialog 无 `leftTopPt` 之外的定位语义（inline 模式），无 primary。

### 3.13 FileBox（uiExtendType=13，6 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| buttonText | string | `Choose File` | 按钮文本 |
| buttonIcon | string | `''` | 按钮图标 |
| buttonAlign | string | `left` | 按钮位置 |
| accept | string | `''` | 接受文件类型 |
| separator | string | `,` | 多选分隔符 |
| multiple | bool | false | 多选 |
| picName | string | `''` | 背景图 |

源码白名单（objectToJson）：`width,height,buttonText,buttonIcon,buttonAlign,accept,multiple,separator`。构造器默认：`width="500",height="30"`。

### 3.14 MenuButton（uiExtendType=14，5 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| menu | string | `''` | 菜单选择器 |
| iconCls | string | `icon-edit` | 图标类 |
| duration | int | 100 | 展开动画时长 |
| primary | object | `{width,fontSize}` | 响应式 |

源码白名单（objectToJson）：`width,height,menu,duration,iconCls`。构造器默认：`width=90,height=30`（枚举名 MENEBUTTON）。

### 3.15 ProgressBar（uiExtendType=15，8 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| value | int | 60 | 进度值 0~100 |
| text | string | `{value}%` | 文本模板 |
| primary | object | `{width,fontSize:null}` | 响应式 |

源码白名单（objectToJson）：`width,height,value,text`。构造器默认：`width=120,height=22`。

### 3.16 ToolTip（uiExtendType=16，2 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| position | string | `right` | 弹出位置 |
| valign | string | `middle` | 垂直对齐 |
| content | string | `''` | 内容（HTML） |
| trackMouse | bool | false | 跟随鼠标 |
| deltaX / deltaY | int | 0 / 0 | 偏移 |
| showEvent | string | `mouseenter` | 显示事件 |
| hideEvent | string | `mouseleave` | 隐藏事件 |
| showDelay | int | 200 | 显示延迟 |
| hideDelay | int | 100 | 隐藏延迟 |

源码验证：objectToJson **全量**序列化 `$(id).tooltip("options")`（无白名单），因此参考工程里出现的 width/height 等即 easyui 默认 options。构造器默认：`width=120,height=30`。

### 3.17 Tree（uiExtendType=17，33 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| method | string | `post` | 请求方法 |
| animate | bool | false | 折叠动画 |
| checkbox | bool | false | 显示复选框（32 个对象有） |
| cascadeCheck | bool | true | 级联勾选 |
| onlyLeafCheck | bool | false | 仅叶节点可勾选 |
| lines | bool | false | 连接线 |
| dnd | bool | false | 拖拽 |
| data | list | 节点对象数组 | 树数据 |
| alpha | bool | false | 透明背景 |
| primary | object | `{width,height,fontSize}` | 响应式 |

源码白名单（objectToJson）：`width,height,method,animate,checkbox,cascadeCheck,onlyLeafCheck,lines,dnd,data`。构造器默认：`width=120,height=130,picName="image1.png",src=""`。

### 3.18 TreeGrid（uiExtendType=18，14 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| idField | string | `id` | 主键字段 |
| treeField | string | `name` | 树节点字段 |
| animate | bool | false | 折叠动画 |
| data | list / object(1) | 节点对象数组 | 树+表格数据 |
| columns | list | `[[{title,field,width,...}]]` | 列定义 |
| alpha | bool | false | 透明背景 |

源码白名单（objectToJson）：`width,height,idField,treeField,animate,data,columns`。构造器默认：`width=340,height=240`。列对象含 `title,field,width,align,deltaWidth,boxWidth,cellClass`。

### 3.19 Window（uiExtendType=19，4 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| title | string | `New Window` | 标题 |
| collapsible | bool | false | 可折叠 |
| minimizable | bool | true | 可最小化 |
| maximizable | bool | true | 可最大化 |
| closable | bool | true | 可关闭 |
| closed | bool | false | 初始关闭 |
| zIndex | int | 1521 | 层叠序 |
| draggable | bool | false | 可拖动 |
| resizable | bool | false | 可缩放 |
| shadow | bool | true | 阴影 |
| modal | bool | false | 模态 |
| inline | bool | true | 内联显示 |
| region | object | KMWinDiagLayout | 子内容布局容器 |

源码白名单（objectToJson）：`width,height,title,collapsible,minimizable,maximizable,closable,closed,zIndex,draggable,resizable,shadow,inline,modal`。构造器默认：`width=300,height=200,state=false,maxFlag=false`。

### 3.20 Calendar（uiExtendType=20，7 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| fit | bool | false | 填满容器 |
| border | bool | true | 边框 |
| showWeek | bool | false | 显示周 |
| firstDay | int | 0 | 每周第一天 |
| weeks | list | `[S,M,T,W,T,F,S]` | 周标题 |
| months | list | 12 个月名 | 月标题 |
| year / month | int | 2026 / 7 | 当前年月 |
| current | string | ISO 时间串 | 当前日期 |
| weekNumberHeader | string | `''` | 周号表头 |

源码白名单（objectToJson）：`firstDay,weeks,months,year,month`（width/height 来自构造器）。构造器默认：`width="180px",height="180px"`。

### 3.21 DateTimeBox（uiExtendType=21，8 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| value | string | `2023-11-07 11:19:49` | 日期时间值 |
| showSeconds | bool | true | 显示秒 |
| timeSeparator | string | `:` | 时分秒分隔符 |
| primary | object | `{width,fontSize}` | 响应式 |

源码白名单（objectToJson）：`width,height,showSeconds,timeSeparator,value`。构造器默认：`width="180",height="30"`。

### 3.22 pagination（uiExtendType=22，5 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| total | int | 1 | 总记录数 |
| pageSize | int | 10 | 每页条数 |
| pageNumber | int | 1 | 当前页 |
| pageList | list | `[10,20,30,50,100]` | 页大小选项 |
| loading | bool | false | 加载中 |
| showPageList | bool | true | 显示页大小选择 |
| showRefresh | bool | true | 显示刷新 |
| links | int | 10 | 页码链接数 |
| beforePageText | string | `第` | 页码前文本 |
| afterPageText | string | `页 共{pages}页` | 页码后文本 |
| displayMsg | string | `显示 {from} 到 {to}, 共 {total} 记录` | 信息文本 |

源码白名单（objectToJson）：`width,height,total,pageSize,pageNumber,pageList,loading,links,showPageList,showRefresh,beforePageText,afterPageText,displayMsg`。构造器默认：`width=500,height=30`，prototypeName="pagination"。

### 3.23 combotree（uiExtendType=24，9 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| editable | bool | false | 是否可编辑 |
| value | string | `''` | 选中值 |
| method | string | `post` | 请求方法 |
| data | list | 节点对象数组（含 domId） | 树数据 |
| textField | string | `value`（6 个对象有） | 文本字段 |
| valueField | string | `label`（6 个对象有） | 值字段 |

源码白名单（objectToJson）：`width,height,value,editable,valueField,textField,groupField,mode,url,method,data`。构造器默认：`width="200",height="40",editable=false`。

### 3.24 Tagbox（uiExtendType=25，4 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| value | list | `['Apple','Qrange']` | 已选标签 |
| hasDownArrow | bool | false | 显示下拉箭头 |

源码白名单（objectToJson）：`width,height,hasDownArrow,tagFormatter,tagStyler,value`。构造器默认：`width="260",height="50"`。

### 3.25 Sidemenu（uiExtendType=26，12 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| border | bool | true | 边框 |
| animate | bool | true | 动画 |
| multiple | bool | true | 多开子菜单 |
| collapsed | bool | false | 默认折叠 |
| data | list | 侧栏菜单项（text/iconCls/state/children/id） | 菜单数据 |
| floatMenuWidth | int | 200 | 悬浮菜单宽 |
| floatMenuPosition | string | `right` | 悬浮位置 |
| selectedItemId | string | `_easyui_sidemenu_2`（5 个对象有） | 选中项 id |

源码白名单（objectToJson）：`border,animate,multiple,floatMenuWidth,floatMenuPosition,collapsed`。构造器默认：`width="180px",height="180px",demoName="初始化数据"`。

### 3.26 Switchbutton（uiExtendType=27，4 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| handleWidth | string | `auto` | 滑块宽 |
| checked | bool | true | 选中 |
| disabled | bool | false | 禁用 |
| readonly | bool | false | 只读 |
| reversed | bool | false | 反向 |
| onText | string | `yes` | 开文本 |
| offText | string | `no` | 关文本 |
| handleText | string | `''` | 滑块文本 |
| value | string | `on` | 值 |
| primary | object | `{width,fontSize}` | 响应式 |

源码白名单（objectToJson）：`width,height,handleWidth,checked,disabled,readonly,reversed,onText,offText,handleText,value`。构造器默认：`width="80",height="20"`。

### 3.27 Validatebox（uiExtendType=28，3 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| required | bool | true | 必填 |
| validType | string | `url` | 校验规则 |
| delay | int | 200 | 校验延迟 |
| interval | int | 200 | 轮询间隔 |
| missingMessage | string | `This field is required` | 必填提示 |
| invalidMessage | string | `Please enter a valid URL` | 非法提示 |
| tipPosition | string | `right` | 提示位置 |
| deltaX / deltaY | int | 0 / 0 | 提示偏移 |
| novalidate | bool | false | 跳过校验 |
| editable / disabled / readonly | bool | true/false/false | 输入框状态 |
| validateOnCreate | bool | true | 创建即校验 |
| validateOnBlur | bool | false | 失焦校验 |
| events | object | `{}` | 事件 |
| tipOptions | object | `{showEvent,hideEvent,showDelay,hideDelay,zIndex}` | 提示配置 |
| rules | object | 内置规则集（email/url/length/remote/chartValidate...） | 规则字典 |
| _validateOnCreate | bool | true | 内部标记 |
| lengthMin | string | `0` | 长度下限 |
| lengthMax | string | `100` | 长度上限 |

源码验证：`KMUIValidatebox.objectToJson` 显式写 `invalidMessage,required,validType,lengthMin,lengthMax,missingMessage`，其余为 `$(id).validatebox("options")` 全量序列化。构造器默认：`required=true,validType="url",lengthMin="0",lengthMax="100",width=180,height=24`。注意**无 configureData**。

### 3.28 ImageCarsuel（uiExtendType=29，3 个）

| 字段 | 类型 | 参考值/默认 | 说明 |
|---|---|---|---|
| playtime | int | 1000 | 轮播间隔 ms |
| images | list | `[]` | 图片列表 |

源码验证：`KMUIImageCarsuel.objectToJson` 显式序列化 `name,comment,memberAccess,leftTopPt,width,height,playtime,enable,visible,runVisible,sizeable,lock,guid,images,modleStyle,uiExtendType,objectType,version,linkMng,configureData,styleData,sizePolicy,fixedSize,changeProperty,styleDataNew,securityPriority,securitySection,isControl,resDescription`（无 resourceGroup）。构造器默认：`width=800,height=600,playtime=0,picName="",sequence="",imagepath="",images=[]`。

### 3.29 DateBox / ValidateBox（参考工程未出现，供补全）

- **DateBox（uiExtendType=11）**，`KMUIExtDateBox`，kmui_extdatebox.js。objectToJson 白名单：`width,height,panelWidth,panelHeight,currentText,closeText,okText,disabled,formatter,parser,sharedCalendar,value`。构造器默认：`width="100",height="30"`。
- **ValidateBox（uiExtendType=23）**，`KMUIExtValidateBox`，kmui_extvalidatebox.js。objectToJson 全量序列化 `$(id).validatebox("options")`（无白名单、无 version/configureData/styleData）。

---

## 4. 可修改核心字段建议（IR 建模 + allowlist）

原则：**几何 + 显示属性 + 常用行为开关**；数据内容类字段（data/columns/menu/buttons 等大对象）建议只读引用或 JSON 原样透传，不逐字段建模。

| proto | 建议可修改核心字段 |
|---|---|
| Combobox(0) | width, height, leftTopPt, editable, value, valueField, textField, mode, method |
| Datagrid(1) | width, height, leftTopPt, striped, pagination, showHeader, singleSelect, fitColumns, rownumbers, nowrap, autoRowHeight, resizeHandle, pagePosition, pageSize, pageList, sortOrder, multiSort, remoteSort, showFooter, scrollbarSize, loadMsg, alpha |
| LinkButton(2) | width, height, leftTopPt, text, disabled, toggle, selected, outline, plain, group, iconAlign, iconCls, size, picName, backPicName |
| Numberbox(3) | width, height, leftTopPt, value, disabled, min, max, precision, prefix, suffix, decimalSeparator, groupSeparator |
| NumberSpinner(4) | width, height, leftTopPt, editable, interval, multiline, min, max, precision |
| Propertygrid(5) | width, height, leftTopPt, showGroup, groupField, alpha |
| Searchbox(6) | width, height, leftTopPt, prompt, value, menu |
| Slider(7) | width, height, leftTopPt, mode, reversed, showTip, disabled, value, min, max, step, rule |
| Spinner(8) | width, height, leftTopPt, editable, disabled, value, min, max, increment |
| Textbox(9) | width, height, leftTopPt, value, prompt, type, required, editable, disabled, readonly, multiline, icons, iconAlign, iconWidth, buttonText, buttonAlign |
| TimeSpinner(10) | width, height, leftTopPt, value, separator, showSeconds, highlight |
| DateBox(11) | width, height, leftTopPt, value, panelWidth, panelHeight, currentText, closeText, okText, disabled |
| Dialog(12) | width, height, leftTopPt, title, collapsible, minimizable, maximizable, resizable, inline, toolbar, buttons |
| FileBox(13) | width, height, leftTopPt, buttonText, buttonIcon, buttonAlign, accept, multiple, separator |
| MenuButton(14) | width, height, leftTopPt, menu, iconCls, duration |
| ProgressBar(15) | width, height, leftTopPt, value, text |
| ToolTip(16) | width, height, leftTopPt, position, valign, content, trackMouse, deltaX, deltaY, showEvent, hideEvent, showDelay, hideDelay |
| Tree(17) | width, height, leftTopPt, method, animate, checkbox, cascadeCheck, onlyLeafCheck, lines, dnd, alpha |
| TreeGrid(18) | width, height, leftTopPt, idField, treeField, animate, alpha |
| Window(19) | width, height, leftTopPt, title, collapsible, minimizable, maximizable, closable, closed, zIndex, draggable, resizable, shadow, modal, inline |
| Calendar(20) | width, height, leftTopPt, fit, border, showWeek, firstDay, weeks, months, weekNumberHeader |
| DateTimeBox(21) | width, height, leftTopPt, value, showSeconds, timeSeparator |
| pagination(22) | width, height, leftTopPt, total, pageSize, pageNumber, pageList, loading, showPageList, showRefresh, links, beforePageText, afterPageText, displayMsg |
| ValidateBox(23) | width, height, leftTopPt, required, validType, delay, interval, missingMessage, invalidMessage, tipPosition, novalidate |
| combotree(24) | width, height, leftTopPt, editable, value, textField, valueField, method |
| Tagbox(25) | width, height, leftTopPt, value, hasDownArrow |
| Sidemenu(26) | width, height, leftTopPt, border, animate, multiple, collapsed, floatMenuWidth, floatMenuPosition, selectedItemId |
| Switchbutton(27) | width, height, leftTopPt, checked, disabled, readonly, reversed, onText, offText, handleText, handleWidth, value |
| Validatebox(28) | width, height, leftTopPt, required, validType, missingMessage, invalidMessage, delay, interval, tipPosition, novalidate, validateOnCreate, validateOnBlur, lengthMin, lengthMax |
| ImageCarsuel(29) | width, height, leftTopPt, playtime, images |

**通用 allowlist 基础字段**（任何 proto 均可修改，IR 公共层）：`name, comment, leftTopPt, width, height, visible, runVisible, enable, lock, memberAccess, securityPriority, securitySection, resourceGroup, modleStyle, styleData, styleDataNew, configureData, alpha(仅 grid 类)`。

---

## 5. 源码验证要点汇总

1. **枚举定义**（kmui_glabolvar.js）：`kmUIExtendTypeEnum` 数值与 §1 映射完全一致；23 与 28 均名 VALIDATEBOX（需区分大小写），30~34 为 GANTT/TABLE/DROPDOWN/NAVMENU 非 easyui。
2. **工厂映射**（km_factory.js `UIObjectFactory.create`）：`kmUIExtendTypeEnum.* → new KMUIExt*`，一一对应 §1。
3. **序列化**：
   - `objectToJson()`：多数控件按**白名单数组**从 `$(id).<widget>("options")` 取值（如 datagrid 的 30 项、textbox 的 18 项）；ToolTip、ValidateBox(23)、Validatebox(28) 为**全量 options** 序列化；ImageCarsuel 为显式字段序列化。
   - `jsonToObject()`：基础字段 switch 赋值，其余走 `s[]` → `$(id).<widget>(s)`（开发态）或 `addOptions()`（运行态）。
4. **构造器默认值**：见各节"构造器默认"。字符串宽度（如 `"150"`、`"80px"`）为 DOM 初始值，运行时保存到 JSON 时已转为数字 width/height。
5. **参考工程 JSON 缺失 key 的原因**：`objectToJson` 中 `e[s]!==null && e[s].constructor!==Function` 过滤掉 null 与函数，undefined 经 JSON.stringify 省略——故 `idField/url/sortName/groupField` 等"支持但默认无值"的字段不出现。
6. **运行期附加字段**：`primary`（响应式字体/表格）由 `setPrimary(t)` 在 objectToJson 时注入，不是构造器字段；`changeProperty` 记录运行时变更（含 width/height）。
