# KingFusion 客户端工程控件 Schema 提取笔记

> 来源：开发态代码（本地副本 `KingFusion3.6_Center/kingdevopscenter/kingclient/exe/public/javascripts/`，压缩但结构完整）
> 日期：2026-08-05

## 1. 控件定义库位置

```
kingclient/exe/public/javascripts/Common/Graphic/UI/kmui_*.js   （49 个控件类）
kingclient/exe/public/javascripts/Common/Global/kmui_glabolvar.js （枚举/全局定义）
```

每个控件类形如：`function KMUIButtonModel(){ ... this.uiModelType=kmUIModeTypeEnum.BUTTON; ... }`，继承 `KMUIModelBase`（`kmui_modelbase.js`），构造器内 `this.xxx=默认值` 即控件默认属性模板。

## 2. uiModelType 完整枚举（渲染器核心映射）

> 来源：`kmui_glabolvar.js` 中 `var kmUIModeTypeEnum={...}`；注意 `BUTTON:2` 与 `BUTTON:35` 重复键，JS 后者覆盖，**BUTTON 实际 = 35**（与页面 JSON 实测一致）。

| 值 | 常量 | 控件 | 对应控件类 |
|---|---|---|---|
| 0 | RADIO | 单选 | radio_model |
| 1 | CHECKBOX | 复选 | checkbox_model |
| 2 | BUTTON(被覆盖) | — | — |
| 3 | COMBOBOX | 下拉框 | combobox_model |
| 4 | CLAENDAR | 日历 | (ext calendar?) |
| 5 | DATATIME | 时间 | time |
| 6 | TEXTBOX | 文本框 | textbox |
| 7 | RICHTEXT | 富文本 | richtext |
| 8 | SCALE | 标尺/刻度 | scale |
| 9 | LIST | 列表 | list_model |
| 10 | MENU | 菜单 | — |
| 11 | TREEVIEW | 树视图 | treeview |
| 12 | WEBCONTAINER | Web 容器 | webcontainer |
| 13 | HORIZONTALSPACER | 水平占位 | horizontal_spacer |
| 14 | VERTICALSPACER | 垂直占位 | vertical_spacer |
| 30 | GANTT | 甘特图 | gantt |
| 31 | TABLE | 表格 | — |
| 32 | TREE | 树 | — |
| 33 | DROPDOWN | 下拉 | — |
| 34 | NAVMENU | 导航菜单 | — |
| **35** | **BUTTON** | **按钮** | button_model |
| 36 | ELEMENTRADIO | el-radio | — |
| 37 | ELEMENTCHECHECKBOX | el-checkbox | — |
| 38 | INPUT | el-input | — |
| 39 | CASCADER | el-cascader | — |
| 40 | DATETIMEPICKER | el-date-picker | — |
| 41 | IMAGE | 图片 | image_carsuel/image_sequence |
| 42 | CUSTOMMODEL | 自定义模型 | custome_model |
| 43 | FACTORYCALENDAR | 工厂日历 | factorycalendar |
| 44 | SELECT | el-select | — |
| 45 | UPLOAD | 上传 | — |
| 46 | TRANSFER | 穿梭框 | — |
| 47 | TABS | 标签页 | — |
| 48 | SWITCH | 开关 | — |
| 49 | INPUTNUMBER | 数字输入 | — |
| 50 | TAG | 标签 | — |
| 51 | TIMELINE | 时间线 | — |
| 52 | STEPS | 步骤条 | — |
| 53 | REPORT | 报表 | — |

> 35+ 为 element-plus 风格控件（页面 JSON 实测 Button=35 带 `primary/plain/round/loading/badge` 等 el-button 属性）。
> 2 vs 35：旧版按钮模型(2)已废弃，页面统一用 35。

## 3. 下一步提取计划（渲染器模板库）

1. **基础字段**：`kmui_modelbase.js` 的 `KMUIModelBase` 构造器（所有控件共有：leftTopPt/sizePolicy/guid/visible/lock/memberAccess 等）
2. **控件默认属性**：逐个控件类构造器的 `this.xxx=默认值`
3. **扩展控件**：`ext_*.js`（easyui 风格）与 element 风格控件的属性集合
4. **页面序列化逻辑**：页面 JSON 顶层（pageProperty/objects/showLayer 等）如何由控件对象组装——在 `Common/Graphic` 与 `DevelopClient` 目录
5. 产物：`kf-adapter` 渲染器的控件模板配置（DSL 控件类型 → KF 控件 JSON）

## 4. 第一版渲染器控件范围建议（与设计文档 §4.5 对齐）

从 49 个控件中优先实现（按设计文档控件清单 + 枚举映射）：
text→TEXTBOX(6)、button→BUTTON(35)、numeric→INPUTNUMBER(49)/INPUT(38)、switch→SWITCH(48)、gauge(仪表)→无原生枚举，用自定义模型 CUSTOMMODEL(42) 或 element 图表（待查）、trend(趋势)→表格/图表（待查）、image→IMAGE(41)、navigation/dialog→(待查页面跳转机制)、rect→(待查基础形状)。

> 注：设计文档 §4.5 中的 gauge/trend 等工业控件需在 `DevelopClient` 编辑器代码中进一步确认是否存在专用控件类型（可能以图形模型/自定义控件形式存在）。
