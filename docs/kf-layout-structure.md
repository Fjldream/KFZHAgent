# KF 参考工程布局容器完整结构文档

> 目的：供后续实现 KF 布局容器使用。
> 数据来源：
> - 参考工程页面 JSON：`/tmp/kf_ref/1.0.0.1/project/page/*.json`（共 275 个页面文件，扫描到 187 个布局容器）
> - KF 布局源码：`KingFusion3.6_Center/kingdevopscenter/kingclient/exe/public/javascripts/Common/Graphic/Layout/kmui_*.js`
> - 工厂/枚举：`Common/Util/km_factory.js`（gLayoutObjectFactory）、`Common/SizePolicy/km_sizePolicy.js`（kmSizePolicyTypeEnum）
> - 本文档为只读研究产出，未修改任何代码。

---

## 1. 布局容器判定规则与 layoutType 枚举映射

### 1.1 判定规则

布局容器 = `objects[]` 中满足以下条件的对象：

```
uiModelType 为 null/undefined
且 (objectType === 2 或 对象含 layoutType 字段)
```

参考工程实测（187 个布局），`uiModelType` 全部为 null；`objectType===2` 的布局有 layoutType 2/4/5/10；无 `objectType` 字段的有 0/3/6/11。

### 1.2 枚举映射表

源码 `kmui_layoutcomponentbase.js` 定义：

```js
kmLayoutTypeEnum = {
  ACCORDION: 0, GRID: 1, HORIZONTAL: 2, TAB: 3, VERTICAL: 4,
  DOCKINGLAYOUT: 5, TWODIMENSIONAL: 6, WINDIALOG: 7, FORMLAYOUT: 8,
  GRIDLAYOUT: 9, MOBILE: 10, HT3DLAYOUT: 11, HTLAYOUT: 12, WORKFLOW: 13, MAP: 14
}
```

| layoutType | 布局名 | prototypeName | 源码类 | 参考工程 baseProperty.name 样例 | objectType |
|---|---|---|---|---|---|
| 0 | 折叠面板 | `Accordion` | KMAccordion（kmui_accordion.js） | Accordion1/2/3 | 无 |
| 1 | 网格布局 | `GridLayout` | KMGridLayout（kmui_grid_layout.js） | —（参考工程未出现） | 2 |
| 2 | 水平布局 | `HorizontalLayout` | KMHorizontalLayout（kmui_horizontal_layout.js） | HorizontalLayout1/2/3 | 2 |
| 3 | 选项卡 | `Tab` | KMTab（kmui_tab.js） | Tab1/3/4 | 无 |
| 4 | 垂直布局 | `VerticalLayout` | KMVerticalLayout（kmui_vertical_layout.js） | VerticalLayout1/2 | 2 |
| 5 | Docking 区域布局 | `DockingLayout` | KMLayout（kmui_layout.js） | DockingLayout1/6 | 2 |
| 6 | 导航/二维流程图 | `ProjectFlowChart` | KMTwoDimensionalLayout（kmui_twodimensional_layout.js） | ProjectFlowChart1 | 无 |
| 7 | 窗口/对话框容器 | `windiagLayout` | KMWinDiagLayout（kmui_windiag_layout.js） | —（参考工程未出现） | 无 |
| 8 | 表单布局 | `FormLayout` | KMFormLayout（kmui_form_layout.js） | —（参考工程未出现） | — |
| 9 | 网格布局(旧) | `GridLayout` | KMGridLayout（同一文件） | —（参考工程未出现） | — |
| 10 | 移动端布局 | `MobileLayout` | KMMobileLayout（kmui_mobile_layout.js） | MobileLayout1 | 2 |
| 11 | HT 3D 布局 | `HT3DLayout` | KMHT3DLayout（kmui_ht_3d_layout/kmui_ht_3d_layout.js） | HT3DLayout1 | 无 |
| 12 | HT 2D 布局 | `HTLayout` | KMHTLayout（kmui_ht_layout/kmui_ht_layout.js） | —（参考工程未出现） | 无 |
| 13 | 工作流 | — | — | —（参考工程未出现） | — |
| 14 | 地图 | — | KMElementUIMap（工厂注册） | —（参考工程未出现） | — |

> 注意：任务描述中的「2=区域、4=水平、10=垂直」与实际源码/参考工程不符。实际为 **2=水平布局**、**4=垂直布局**、**10=移动端布局**、**6=导航(二维流程图)**。

### 1.3 参考工程 layoutType 分布（187 个布局）

```
layoutType 0  (Accordion):        12
layoutType 2  (Horizontal):       53
layoutType 3  (Tab):              17
layoutType 4  (Vertical):         18
layoutType 5  (DockingLayout):    51
layoutType 6  (ProjectFlowChart): 33
layoutType 10 (Mobile):           1
layoutType 11 (HT3D):             2
```

未出现 1/7/8/9/12/13/14。

### 1.4 参考工程中嵌套关系统计（父 layoutType -> 子 layoutType）

```
顶层(None) -> 0: 12  顶层(None) -> 2: 53  顶层(None) -> 3: 17
顶层(None) -> 4: 18  顶层(None) -> 5: 51  顶层(None) -> 6: 33  顶层(None) -> 10: 1
5 -> 2: 6   5 -> 4: 39   5 -> 3: 1   5 -> 5: 1   5 -> 6: 3
2 -> 5: 19  4 -> 2: 10   4 -> 5: 2   10 -> 5: 1
```

insiderObjects 非空情况：layoutType 5 有 50/51 个非空、2 有 25/53、4 有 7/18、10 有 1/1；**0 和 3（Accordion/Tab）在参考工程中 insiderObjects 全部为空**（面板由 dPanelsOption 定义，未放子控件）。

---

## 2. 各 layoutType 完整字段集

### 2.1 layoutType = 0（Accordion 折叠面板）

顶层字段（参考工程实测全集）：

```json
{
  "baseProperty": {...},          // 见 §3
  "layoutType": 0,
  "configureData": "/*id为easyui控件的id*/\n$('#' + id).accordion('add',{...})",
  "styleData": "",
  "styleDataNew": "\n#domId .accordion-header{\n    background: red !important;\n}",
  "isShowBorder": false,
  "dPanelsOption": [ ... ],       // 折叠面板配置数组
  "insiderObjects": [],           // 本工程全部为空
  "sizePolicy": [3, 3, 0, 0],
  "fixedSize": [198, 300],
  "version": "2.0.0.1",
  "memberAccess": true,
  "paddingPolicy": {"top": 0, "left": 0, "right": 0, "bottom": 0},
  "resDescription": {}
}
```

dPanelsOption 元素字段全集（easyui panel options）：

```
title, width, height, headerCls, bodyCls, style, cache, fit, border,
doSize, noheader, halign, titleDirection, collapsible, minimizable,
maximizable, closable, collapsed, minimized, maximized, closed,
openAnimation, openDuration, closeAnimation, closeDuration,
queryParams, method, loadingMessage, selected, doneLayout, hasResized,
iconCls, tools
```

样例：

```json
{"title": "标题栏背景色", "width": 198, "height": 269, "headerCls": "accordion-header",
 "bodyCls": "accordion-body", "style": {}, "cache": true, "fit": false, "border": true,
 "doSize": false, "noheader": false, "halign": "top", "titleDirection": "down",
 "collapsible": true, "minimizable": false, "maximizable": false, "closable": false,
 "collapsed": false, "minimized": false, "maximized": false, "closed": false,
 "openAnimation": false, "openDuration": 400, "closeAnimation": false,
 "closeDuration": 400, "queryParams": {}, "method": "get", "loadingMessage": "Loading...",
 "selected": false, "doneLayout": true, "hasResized": true}
```

### 2.2 layoutType = 2（HorizontalLayout 水平布局）

顶层字段全集：

```json
{
  "baseProperty": {...},
  "layoutType": 2,
  "objectType": 2,
  "insiderObjects": [ ... ],     // 子元素，见 §4
  "version": "2.0.0.1",
  "sizePolicy": [3, 3, 0, 0],
  "fixedSize": [300, 100],
  "isShowBorder": false,          // 44/53 false，9/53 true
  "interval": 10,                 // 子元素间距，实测全部 10
  "memberAccess": true,
  "resDescription": {}
}
```

说明：无 dPanelsOption/configureData/paddingPolicy。子元素按横向排列，每个子元素带 `internalVertex={left, top}`（相对布局左上角的偏移）。嵌套 DockingLayout 时子元素带 borderStyle/alpha/layer/dPanelsOption 等（见 §4.2）。

### 2.3 layoutType = 3（Tab 选项卡）

顶层字段全集：

```json
{
  "baseProperty": {...},
  "layoutType": 3,
  "configureData": "/*id为easyui控件的id*/\n$('#' + id).tabs('add',{ title:'新增面板+X', ...})",
  "dPanelsOption": [ ... ],
  "insiderObjects": [],           // 本工程全部为空
  "version": "2.0.0.1",
  "sizePolicy": [3, 3, 0, 0],
  "fixedSize": [200, 240],
  "paddingPolicy": {"top": 0, "left": 0, "right": 0, "bottom": 0},
  "modleStyle": "",               // 少量存在
  "resDescription": {}
}
```

dPanelsOption 元素字段全集（在 Accordion 基础上多出 tab/index，无 headerCls/bodyCls）：

```
title, width, height, style, cache, fit, border, doSize, noheader, halign,
titleDirection, collapsible, minimizable, maximizable, closable, collapsed,
minimized, maximized, closed, openAnimation, openDuration, closeAnimation,
closeDuration, tools, queryParams, method, loadingMessage, selected,
tab, hasResized, doneLayout, index, iconCls
```

关键字段样例：`"selected": true`、`"index": 0`、`"tab": {"0": {}, "length": 1}`、`"tools": [{"iconCls": "icon-mini-refresh"}]`、`"border": false`、`"noheader": true`。

### 2.4 layoutType = 4（VerticalLayout 垂直布局）

与水平布局字段完全一致：

```json
{
  "baseProperty": {...},
  "layoutType": 4,
  "objectType": 2,
  "insiderObjects": [ ... ],     // 子元素带 internalVertex
  "version": "2.0.0.1",
  "sizePolicy": [3, 3, 0, 0],    // 17/18；1 个为 [0,0,0,0]
  "fixedSize": [150, 100],
  "isShowBorder": false,          // 10/18 false，8/18 true
  "interval": 10,                 // 13/18=10，5/18=0
  "memberAccess": true,
  "resDescription": {}
}
```

### 2.5 layoutType = 5（DockingLayout 区域布局）

顶层字段全集：

```json
{
  "borderStyle": "",              // 边框样式字符串
  "baseProperty": {...},
  "layoutType": 5,
  "objectType": 2,
  "alpha": true,                  // 30/51 false，21/51 true
  "layer": false,                 // 48/51 false，3/51 true（背景图开关）
  "configureData": "/*id为easyui控件的id*/\n\n//删除区域\n$('#' + id).layout('remove','west')...",
  "dPanelsOption": [ ... ],       // 区域面板配置（含 region）
  "insiderObjects": [ ... ],      // 每个区域内的子组件（带 region 标识）
  "picName": "",
  "sizePolicy": [3, 3, 0, 0],     // 50/51
  "fixedSize": [1920, 1080],
  "version": "2.0.0.1",           // 47/51；4 个为 "1.0.0.1"
  "memberAccess": true,
  "paddingPolicy": {"top": 0, "left": 0, "right": 0, "bottom": 0},  // 48/51；1 个为 {top:15,left:15,right:20,bottom:20}
  "resDescription": {}
}
```

dPanelsOption 元素字段全集（含 easyui layout 区域专有字段）：

```
width, height, left, top, cls, bodyCls, style, cache, fit, border, doSize,
noheader, halign, titleDirection, collapsible, minimizable, maximizable,
closable, collapsed, minimized, maximized, closed, openAnimation,
openDuration, closeAnimation, closeDuration, queryParams, method,
loadingMessage, region, split, collapsedSize, expandMode, hideExpandTool,
hideCollapsedContent, minWidth, minHeight, maxWidth, maxHeight,
doneLayout, hasResized, title
```

样例（west 区域）：

```json
{"width": 52, "height": 82, "left": 0, "top": 20,
 "cls": "layout-panel layout-panel-west", "bodyCls": "layout-body", "style": {},
 "cache": true, "fit": false, "border": true, "doSize": false, "noheader": false,
 "halign": "top", "titleDirection": "down", "collapsible": true,
 "minimizable": false, "maximizable": false, "closable": false, "collapsed": false,
 "minimized": false, "maximized": false, "closed": false, "openAnimation": false,
 "openDuration": 400, "closeAnimation": false, "closeDuration": 400,
 "queryParams": {}, "method": "get", "loadingMessage": "Loading...",
 "region": "west", "split": false, "collapsedSize": 32, "expandMode": "float",
 "hideExpandTool": false, "hideCollapsedContent": true, "minWidth": 10,
 "minHeight": 10, "maxWidth": 10000, "maxHeight": 10000,
 "doneLayout": true, "hasResized": true}
```

region 枚举实测值：`center`（47）、`west`（4）、`north`（3）；源码支持顺序 `["east","west","north","south","center"]`。

### 2.6 layoutType = 6（ProjectFlowChart 导航/二维流程图）

顶层字段全集：

```json
{
  "linkMng": {"linkList": [{"linkId": 100, "enable": false, "script": ""},
                           {"linkId": 101, "enable": false, "script": ""},
                           {"linkId": 102, "enable": false, "script": ""}]},
  "baseProperty": {...},
  "layoutType": 6,
  "zoomRadio": {"x": 1, "y": 1},
  "insiderObjects": [],           // 全部为空；内容在 twoFlowChart.objects
  "styleData": "",
  "styleDataNew": "",
  "guid": "kf989a0b7-c349-4d05-9925-2fec383bce34",   // 与 baseProperty.guid 相同
  "isShowBorder": true,           // 28/33 true
  "visible": true,
  "sizePolicy": [3, 3, 0, 0],
  "fixedSize": [300, 127.8],
  "brushArray": [{"color": "rgba(240, 240, 240, 0)"},
                 {"index": 0, "bkColor": "rgba(0,0,0,1)", "ftColor": "rgba(255,255,255,1)"},
                 {"index": 0, "bkColor": "rgba(0,0,0,1)", "ftColor": "rgba(255,255,255,1)"},
                 {"index": 0}],
  "brushName": "纯色",
  "picSrc": "",
  "picPath": "static/images/images/caizhi1.png",
  "picName": "",
  "operationEnable": true,        // 26/33 true，7/33 false
  "sizeable": true,
  "version": "2.0.0.1",
  "enableOperate": true,
  "twoFlowChart": { ... },        // 流程图模型对象，见下
  "isFirstOpen": false,
  "variable": [],                 // 变量管理器 objectToJson（本工程为空数组）
  "customProperty": [],
  "resDescription": {}
}
```

`twoFlowChart` 键全集：

```
guid, name, width, height, objectType(=7), objects, linkMng, variableMng,
customPropertyMng, customPropertyRecords, publicEventMng, brushArray, brushName,
picSrc, picPath, picName, leftTopPt, comment, flowChartViewCanvasWidth,
flowChartViewCanvasHeight, parentVariables, parentpublicEventMng
```

`twoFlowChart.objects[i]`（图形对象，参考工程 16 个）键全集：

```
percentX, percentY, lon, lat, beginLevel, endLevel, bZoom, visibleLevel,
initLevel, initScale, curzoomRadio, bubble, resourceGroup, name, boundRect,
graphicType, scaleFactor, mouseStatus, matrix, scaling, translation,
xScaleReference, yScaleReference, transformation, transformationReference,
horzMirror, vertMirror, selfRotation, relativeCenterPt, parent
```

样例：`{"name":"Rect1","boundRect":{"x":183,"y":147,"width":200,"height":94},"graphicType":3,"matrix":{"a":1,"b":0,"c":0,"d":1,"tx":0,"ty":0},...}`

### 2.7 layoutType = 10（MobileLayout 移动端布局）

参考工程仅 1 个，字段全集：

```json
{
  "baseProperty": {...},
  "layoutType": 10,
  "objectType": 2,
  "insiderObjects": [ ... ],      // 1 个子元素，带 internalVertex={left:2,top:0}
  "version": "2.0.0.1",
  "sizePolicy": [3, 3, 0, 0],
  "fixedSize": [402.1, 999.5],
  "isShowBorder": false,
  "innerPolicy": "水平自适应",
  "paddingPolicy": {"top": 0, "left": 2, "right": 2, "bottom": 0},
  "memberAccess": true,
  "resDescription": {}
}
```

### 2.8 layoutType = 11（HT3DLayout HT 3D 布局）

参考工程 2 个，字段全集：

```json
{
  "baseProperty": {...},
  "graphicHTObj": { ... },        // HT 场景对象
  "prototypeName": "HT3DLayout",
  "layoutType": 11,
  "sizePolicy": [3, 3, 0, 0],
  "fixedSize": [1920, 1080],
  "operationEnable": true,
  "sizeable": true,
  "modelen": 14,                  // 模型数（另一例 14）
  "imagelen": 19,                 // 贴图数（另一例 22）
  "resDescription": {}
}
```

`graphicHTObj` 键全集：

```
name, guid, comment, htJsonPath, leftTopPt, width, height, variableMng,
linkMng, htModelEventMng, graphicHT2dObj, roamMng, firstPersonModel
```

`graphicHT2dObj` 键：`name, guid, comment, htJsonPath, leftTopPt, width, height, variableMng, linkMng, htModelEventMng`
`roamMng` 键：`{"pathRoam": {"roamPaths": [], "enable": false}, "immerseRoam": []}`
样例：`htJsonPath: "storage/scenes/wzlTest1/炼铁高炉"`

---

## 3. baseProperty 结构

### 3.1 字段定义

源码 `KMLayoutCompBase.prototype.basePropertyToJson()`（kmui_layoutcomponentbase.js）：

```js
{ name, leftTopPt: {x,y}, width, styleData, styleDataNew,
  height, comment, lock, visible, guid, memberAccess }
```

| 字段 | 类型 | 说明 |
|---|---|---|
| name | string | `prototypeName + 序号`，如 `HorizontalLayout1`、`DockingLayout6`、`Tab1` |
| leftTopPt | {x:number, y:number} | 布局左上角坐标（可含小数、可为负，如 `{x:-1,y:59}`） |
| width | number | 布局宽度（像素，可含小数，如 127.8、200.1、806.4） |
| height | number | 布局高度（像素） |
| styleData | string | 旧样式（一般空串） |
| styleDataNew | string | CSS 样式（`#domId` 是包裹布局外层 div 的 id 占位符） |
| comment | string | 备注（空串） |
| lock | boolean | 是否锁定（false） |
| visible | boolean | 是否可见（true） |
| guid | string | `k` + UUID，如 `k9da24417-1be4-43a1-be75-1954c5606ddd` |
| memberAccess | boolean | 是否成员访问（true） |

注意：Accordion 在 basePropertyToJson 中会对 width/height 做像素修正（`%` 情况取父节点 offsetWidth/Height），其它布局直接取 getWidth()/getHeight()。

### 3.2 几何字段与 name/guid 实测样例

| layoutType | name 样例 | leftTopPt | width | height | guid 样例 |
|---|---|---|---|---|---|
| 0 | Accordion1 | {x:5, y:3} | 200 | 302 | k9da24417-1be4-43a1-be75-1954c5606ddd |
| 2 | HorizontalLayout2 | {x:342.312, y:12} | 300 | 127.8 | k3e541f9c-206c-43a0-9b52-35ca76c54aa0 |
| 3 | Tab3 | {x:223, y:10} | 142 | 182 | k527d8f95-ce3a-48e4-9867-0288c303478c |
| 4 | VerticalLayout1 | {x:32.000000000000014, y:17} | 200.1 | 213 | k176c6e43-31c7-4dd1-9976-1775fecba462 |
| 5 | DockingLayout6 | {x:-1, y:59} | 1920 | 1080 | k41f8a50c-d3cd-450e-9f13-fcca1a5c007a |
| 6 | ProjectFlowChart1 | {x:460, y:121} | 806.4 | 489.6 | kf989a0b7-c349-4d05-9925-2fec383bce34 |
| 10 | MobileLayout1 | {x:0, y:0} | 402.1 | 999.5 | k29db2941-56a0-4659-bb64-a0fd9e5ce1c0 |
| 11 | HT3DLayout1 | {x:0, y:0} | 1920 | 1080 | kda13f04f-0a34-4613-be05-ca87438e0027 |

name 命名规则：`prototypeName`（见 §1.2 表）+ 页面内递增序号（可跳号，如 Tab1/Tab3/Tab4）。layoutType 6 的顶层 `guid` 字段与 `baseProperty.guid` 相同。

---

## 4. insiderObjects 嵌套规则

### 4.1 各布局类型的子元素标识方式

| 父布局 | 子元素位置标识字段 | 说明 |
|---|---|---|
| 5 DockingLayout | `region` | 子元素挂到 `region` 指定的区域面板；region ∈ {east, west, north, south, center}。参考工程实测值：center(47)、west(4)、north(3)。若区域无子组件则该 region 不出现在 insiderObjects（但 dPanelsOption 仍保留） |
| 0 Accordion / 3 Tab | `region`（= panel title） | 源码 appendChild 以面板 title 为 key；参考工程中这两个类型的 insiderObjects 全部为空 |
| 2 Horizontal / 4 Vertical / 10 Mobile | `internalVertex: {left, top}` | 子元素相对布局左上角的偏移（源码取 DOM childNode 的 offsetLeft/offsetTop） |
| 1 Grid / 9 GridLayout | `internalVertex` + `regionInfo: {column, row}` + 顶层 `columnCount` | 参考工程未出现 |
| 7 WinDiag | `internalVertex` | 参考工程未出现 |
| 窗口/对话框子组件 | `region1` | 子元素 uiExtendType 为 WINDOWS 或 DIALOG 时用 `region1` 代替 `region` |

源码（kmui_layout.js、kmui_accordion.js 等 objectToJson 均一致）：

```js
for (let [r, n] of componentMap) {
  var c = n.objectToJson();
  n.uiExtendType !== undefined && n.uiExtendType === WINDOWS || n.uiExtendType === DIALOG
    ? c.region1 = r : c.region = r;
  insiderObjects.push(c);
}
```

### 4.2 子元素类型识别（反序列化判定优先级，各 jsonToObject 一致）

```
1. objectType !== undefined   -> gModelObjectFactory.create(objectType)   // 5=CustomCharts、复合组件等
2. uiExtendType !== undefined -> gUIObjectFactory.create(uiExtendType)    // 1=WINDOWS, 2=DIALOG 等
3. uiModelType !== undefined  -> gUIModelObjectFactory.create(uiModelType) // 13=HorizontalSpacer、36/40 等
4. layoutType !== undefined   -> gLayoutObjectFactory.create(layoutType)   // 嵌套布局（递归）
5. prototypeName 特判: AlarmWindow / EventWindow / TrendChart / BarChart /
   PieChart / XYChart / CustomCharts -> 对应图表类
```

即：嵌套布局对象通过 `layoutType` 递归创建；普通子控件按 uiModelType/uiExtendType/objectType 创建。创建后调用 `n.jsonToObject(json)`，再 `appendChild(region 或 region1, n)`。

### 4.3 参考工程实测嵌套结构样例

layoutType 2（水平）嵌套 DockingLayout（区域布局.json）：

```
HorizontalLayout1 (layoutType=2)
└─ insiderObjects[0]
   ├─ borderStyle: ""   layoutType: 5   objectType: 2
   ├─ alpha/layer/configureData/dPanelsOption（4 个区域 west/north/south/center）
   └─ insiderObjects: []   ← 该 DockingLayout 未放子组件，region 均无子元素
```

layoutType 5（Docking）嵌套子布局（驾驶舱demo示例.json）：

```
DockingLayout6 (layoutType=5)  dPanelsOption[0].region = "center"
└─ insiderObjects[0]  region="center"  layoutType=2  name=HorizontalLayout1
   └─ insiderObjects[0]  internalVertex={left:9, top:59}  layoutType=4  name=VerticalLayout1
      └─ insiderObjects[0]  layoutType=5  name=DockingLayout1 ...（深层递归）
```

layoutType 4（垂直）内部子控件样例（用户新增demo示例.json）：子元素可为

- 水平布局：`layoutType:2, objectType:2, internalVertex:{left:0, top:10}`，其 insiderObjects 里放 `HorizontalSpacer`（uiModelType=13，带 internalVertex={left:10,top:0}、sizePolicy=[3,3,0,0]、fixedSize=[30,30]）与 `Textbox`（objectType=3, uiExtendType=9, sizePolicy=[0,0,0,0], fixedSize=[380,50], primary:{width,height,fontSize}, internalVertex:{left:258,top:-1}）；
- DockingLayout：`layoutType:5, objectType:2`；
- 报警窗口：`prototypeName:"AlarmWindow"` 等。

layoutType 5 嵌套 layoutType 6 的样例（region="center" 下放 ProjectFlowChart1，twoFlowChart.objects 16 个图形）。

layoutType 10 内嵌套 layoutType 5（MobileLayout1 -> DockingLayout1，internalVertex={left:2, top:0}）。

---

## 5. 源码 objectToJson 对照验证（序列化输出 = 参考工程 JSON）

### 5.1 公共：baseProperty（kmui_layoutcomponentbase.js）

```js
basePropertyToJson() {
  e.name = this.name;  e.leftTopPt = this.leftTopPt;
  e.width = this.getWidth();  e.styleData = this.styleData;
  e.styleDataNew = this.styleDataNew;  e.height = this.getHeight();
  e.comment = this.comment;  e.lock = this.lock;  e.visible = this.visible;
  e.guid = this.guid;  e.memberAccess = this.memberAccess;
  // layoutType===ACCORDION 时 width/height 取实际像素
}
```

### 5.2 各布局 objectToJson 输出字段（与 §2 实测字段全集一一对应）

| 类（文件） | 输出的顶层字段 | 与参考工程一致性 |
|---|---|---|
| KMAccordion（kmui_accordion.js） | baseProperty, layoutType, configureData, styleData, styleDataNew, modleStyle, isShowBorder, dPanelsOption(来自 accordion("panels")), insiderObjects, sizePolicy, fixedSize, version, memberAccess, paddingPolicy | 参考工程无 modleStyle（空值被 jsonToObject 跳过）；其余字段完全一致 |
| KMTab（kmui_tab.js） | baseProperty, layoutType, configureData, modleStyle, dPanelsOption(来自 tabs("tabs")，tools 特殊处理), insiderObjects, version, sizePolicy, fixedSize, paddingPolicy | 一致 |
| KMHorizontalLayout / KMVerticalLayout | baseProperty, layoutType, objectType, insiderObjects(带 internalVertex=offsetLeft/offsetTop), version, sizePolicy, fixedSize, isShowBorder, interval, memberAccess | 完全一致 |
| KMLayout（kmui_layout.js） | borderStyle, baseProperty, layoutType, objectType, alpha, layer, configureData, dPanelsOption(按 east,west,north,south,center 顺序收集 layout("panel") options，modifyCls 修正 cls/bodyCls), insiderObjects(region/region1), picName, sizePolicy, fixedSize, version, memberAccess, paddingPolicy | 完全一致 |
| KMTwoDimensionalLayout（kmui_twodimensional_layout.js） | linkMng, baseProperty, layoutType, zoomRadio, bkInfo/bkOverlayInfo(可选), insiderObjects, styleData, styleDataNew, guid, isShowBorder, visible, sizePolicy, fixedSize, brushArray, brushName, picSrc, picPath, picName, operationEnable, sizeable, version, enableOperate, twoFlowChart, isFirstOpen, variable, customProperty | 参考工程无 bkInfo/bkOverlayInfo（bkType!=1 时不输出）；其余完全一致 |
| KMMobileLayout（kmui_mobile_layout.js） | baseProperty, layoutType, objectType, insiderObjects(internalVertex), version, sizePolicy, fixedSize, isShowBorder, innerPolicy, paddingPolicy, memberAccess | 完全一致 |
| KMHT3DLayout（kmui_ht_3d_layout.js） | baseProperty, graphicHTObj, prototypeName, layoutType, sizePolicy, fixedSize, operationEnable, sizeable, modelen, imagelen | 完全一致 |
| KMWinDiagLayout（kmui_windiag_layout.js） | baseProperty, layoutType, insiderObjects(internalVertex), version, memberAccess | 参考工程未出现 |

### 5.3 关键反序列化逻辑（KMLayout.jsonToObject，kmui_layout.js）

- dPanelsOption 处理：`for(d=1; d<u.length; d++)` 先添加 index≥1 的区域，再单独 `layout("add", u[0])`（center 最后）；`closed&&collapsed` 的区域记录到 collapsedPanelArr 并复位。
- insiderObjects：按 §4.2 优先级创建对象，WINDOWS/DIALOG 用 `appendChild(r.region1, n)`，其它用 `appendChild(r.region, n)`；GRAPHIC 对象包进 TWODIMENSIONAL 布局画布。
- sizePolicy/fixedSize/version/memberAccess/paddingPolicy 直接回填。

### 5.4 sizePolicy / fixedSize 语义（Common/SizePolicy/km_sizePolicy.js）

```js
kmSizePolicyTypeEnum = { FIXED: 0, MINIMUM: 1, MAXIMUM: 2, EXPANDING: 3 }
```

- 布局默认：`sizePolicy = [EXPANDING, EXPANDING, 0, 0] = [3,3,0,0]`；`minSize=[10,10]`、`maxSize=[16777215,16777215]`、`fixedSize=[150,100]`。
- 序列化 `sizePolicy.sizePolicy` -> `[水平策略, 垂直策略, 0, 0]`（参考工程几乎全部 [3,3,0,0]；layoutType 4 有 1 例 [0,0,0,0]）；`fixedSize` -> `[w, h]`（随实际尺寸变化，如 [198,300]、[1920,1080]）。
- setWidth/setHeight 在 FIXED 策略下会同步写回 `sizePolicy.fixedSize`。

---

## 6. 其它公共字段说明

| 字段 | 出现类型 | 说明 |
|---|---|---|
| version | 全部 | 页面布局版本，实测 "2.0.0.1"（layoutType 5 有 4 例 "1.0.0.1"） |
| memberAccess | 0/2/3/4/5/10 | 访问权限，实测全 true |
| resDescription | 全部 | 资源描述，参考工程为空对象 `{}` |
| isShowBorder | 0/2/3/4/5/6/10 | 是否显示边框 |
| interval | 2/4 | 子元素间距，实测 10 或 0 |
| alpha | 5 | 透明度模式开关 |
| layer | 5 | 背景图层开关（draw() 时用 picPath 背景） |
| paddingPolicy | 0/3/5/10 | {top,left,right,bottom} 内边距；5 的默认全 0，1 例 {top:15,left:15,right:20,bottom:20}；10 为 {top:0,left:2,right:2,bottom:0} |
| innerPolicy | 10 | 移动布局内部策略，实测 "水平自适应" |
| configureData | 0/3/5 | easyui 控件脚本示例（`$('#'+id).accordion/tabs/layout(...)`），布局代码执行配置 |
| picName/picPath/picSrc | 5/6 | 背景图相关；5 的 picName 默认 ""，6 的 picPath 默认 "static/images/images/caizhi1.png" |
| twoFlowChart/variable/customProperty/linkMng | 6 | 流程图模型、变量、自定义属性、链接管理器 |
| graphicHTObj | 11 | HT 场景对象（htJsonPath 指向 storage/scenes/...） |

---

## 7. 实现要点速查

1. **布局判定**：`uiModelType==null && (objectType==2 || 'layoutType' in obj)`；objectType 出现在 2/4/5/10，不出现于 0/3/6/11。
2. **layoutType 正确映射**：0=Accordion、2=Horizontal、3=Tab、4=Vertical、5=Docking、6=ProjectFlowChart(导航)、10=Mobile、11=HT3D（勿用任务描述中「2=区域、4=水平、10=垂直」的错误映射）。
3. **baseProperty 统一**：name/leftTopPt/width/height/styleData/styleDataNew/comment/lock/visible/guid/memberAccess 11 个字段。
4. **嵌套**：Docking 用 region 挂子组件（region 需与 dPanelsOption[].region 对应）；水平/垂直/移动用 internalVertex；窗口/对话框子组件用 region1；insiderObjects 递归包含子布局对象。
5. **面板配置**：Accordion/Tab 的面板在 dPanelsOption（无 region）；Docking 的面板在 dPanelsOption（含 region/cls/left/top/split/collapsedSize）。
6. **sizePolicy 固定形式**：[3,3,0,0]，fixedSize=[w,h]。
