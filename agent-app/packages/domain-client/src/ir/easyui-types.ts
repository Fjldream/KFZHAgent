/**
 * EasyUI 控件契约层（KF 容器对象之一）。
 *
 * KF 工程页面 JSON 中 objectType=3 的对象是 easyui 控件：它们没有
 * `uiModelType`，由 `objectType=3` + `uiExtendType`（本文件称 proto）标识，
 * 几何在顶层 `leftTopPt`/`width`/`height`。
 *
 * 本文件把 proto 映射为语义类型名（供 compile/patcher/inspect/render 使用），
 * 并提供每个 proto 允许的可修改字段白名单。字段与映射均来自参考工程
 * test_最新_2（/tmp/kf_ref/1.0.0.1）782 个真实 easyui 对象：控件 `name`
 * 前缀即 easyui 组件名（Datagrid/TreeGrid/Tree/Combobox/...）。
 */

/**
 * proto（`uiExtendType`）→ easyui 控件语义类型名。
 * 依据：参考工程真实对象 name 前缀（e.g. proto 1 的对象名 Datagrid1..N）。
 * 注意：与静态控件的 IR 判别类型（`ControlIR.type`）不同——easyui 控件在
 * IR 中是 `type: "easyui"` + `proto` 数字，不直接使用这里的语义名。
 */
export const EASYUI_PROTO_TYPES: Readonly<Record<number, string>> = {
  0: "combobox", // Combobox 下拉框
  1: "datagrid", // Datagrid 数据列表
  2: "linkbutton", // LinkButton 按钮组
  3: "numberbox", // Numberbox 数字框
  4: "numberspinner", // NumberSpinner 数字微调
  5: "propertygrid", // Propertygrid 属性列表
  6: "searchbox", // Searchbox 搜索框
  7: "slider", // Slider 滑块
  8: "spinner", // Spinner 微调
  9: "textbox", // Textbox 文本框（可带按钮）
  10: "timespinner", // TimeSpinner 时间微调
  // 11 = DateBox 日期框：KF 序列化时**不带 objectType**（KMUIExtendBase 系），
  // 只带 uiExtendType=11；KF 前端 gUIObjectFactory.create(11) 原生创建，可正常渲染。
  11: "datebox", // DateBox 日期框（无 objectType 键）
  12: "dialog", // Dialog 对话框
  13: "filebox", // FileBox 文件框
  14: "menubutton", // MenuButton 菜单按钮
  15: "progressbar", // ProgressBar 进度条
  16: "tooltip", // ToolTip 提示框
  17: "tree", // Tree 树列表
  18: "treegrid", // TreeGrid 树表
  19: "window", // Window 窗口
  20: "calendar", // Calendar 日历
  21: "datetimebox", // DateTimeBox 日期时间框
  22: "pagination", // Pagination 分页
  24: "combotree", // ComboTree 树形下拉
  25: "tagbox", // Tagbox 标签框
  26: "sidemenu", // Sidemenu 侧栏菜单
  27: "switchbutton", // Switchbutton 开关按钮
  28: "validatebox", // Validatebox 校验框
  29: "imagecarousel", // ImageCarousel 图片轮播
};

/**
 * 每个 proto 允许的"可修改字段"白名单（核心属性）。
 *
 * - 从参考工程真实对象的字段并集中提取，剔除框架/系统字段（guid、leftTopPt、
 *   uiExtendType、objectType、name、lock、visible、enable、comment、linkMng、
 *   modleStyle、styleData、styleDataNew、changeProperty、internalVertex、
 *   fixedSize、isControl、primary、region、resDescription、resourceGroup、
 *   securityPriority、securitySection、sizePolicy、version、method、alpha）。
 * - 数据/列（`data`、`columns`、`toolbar` 之外的结构化内容）走 easyui
 *   `configureData` 脚本，IR 不建模数据；`toolbar` 仅作为占位保留。
 * - 几何（leftTopPt→x/y、width、height）由 BaseControlIR 统一承载。
 */
export const EASYUI_PROTO_FIELDS: Readonly<Record<number, readonly string[]>> = {
  0: ["editable", "value", "valueField", "textField", "mode"],
  1: [
    "striped",
    "pagination",
    "showHeader",
    "singleSelect",
    "fitColumns",
    "autoRowHeight",
    "nowrap",
    "rownumbers",
    "selectOnCheck",
    "checkOnSelect",
    "pagePosition",
    "pageNumber",
    "pageSize",
    "pageList",
    "sortOrder",
    "multiSort",
    "remoteSort",
    "showFooter",
    "scrollbarSize",
    "resizeHandle",
    "toolbar",
    "loadMsg",
  ],
  2: [
    "text",
    "disabled",
    "toggle",
    "selected",
    "outline",
    "group",
    "plain",
    "iconAlign",
    "size",
    "iconCls",
    "picName",
    "backPicName",
  ],
  3: [
    "value",
    "min",
    "max",
    "precision",
    "prefix",
    "suffix",
    "decimalSeparator",
    "groupSeparator",
    "disabled",
  ],
  4: ["value", "min", "max", "precision", "editable", "interval", "multiline"],
  5: ["showGroup", "groupField"],
  6: ["value", "prompt", "menu"],
  7: [
    "value",
    "min",
    "max",
    "mode",
    "reversed",
    "rule",
    "showTip",
    "disabled",
    "step",
  ],
  8: ["value", "min", "max", "increment", "editable", "disabled"],
  9: [
    "value",
    "prompt",
    "required",
    "editable",
    "disabled",
    "readonly",
    "multiline",
    "type",
    "buttonText",
    "buttonAlign",
    "iconAlign",
    "iconWidth",
    "icons",
  ],
  10: ["value", "separator", "highlight", "showSeconds", "disabled"],
  11: [
    "value",
    "disabled",
    "panelWidth",
    "panelHeight",
    "sharedCalendar",
    "currentText",
    "closeText",
    "okText",
  ],
  12: [
    "title",
    "collapsible",
    "minimizable",
    "maximizable",
    "closable",
    "resizable",
    "inline",
    "buttons",
    "toolbar",
  ],
  13: [
    "buttonText",
    "buttonAlign",
    "buttonIcon",
    "accept",
    "multiple",
    "separator",
    "picName",
  ],
  14: ["menu", "iconCls", "duration"],
  15: ["text", "value"],
  16: [
    "content",
    "position",
    "valign",
    "deltaX",
    "deltaY",
    "hideDelay",
    "hideEvent",
    "showDelay",
    "showEvent",
    "trackMouse",
  ],
  17: ["animate", "checkbox", "cascadeCheck", "onlyLeafCheck", "lines", "dnd"],
  18: ["idField", "treeField", "animate", "columns"],
  19: [
    "title",
    "modal",
    "closable",
    "collapsible",
    "minimizable",
    "maximizable",
    "resizable",
    "draggable",
    "inline",
    "shadow",
    "closed",
    "zIndex",
  ],
  20: [
    "current",
    "firstDay",
    "showWeek",
    "weekNumberHeader",
    "month",
    "year",
    "months",
    "weeks",
    "border",
    "fit",
  ],
  21: ["value", "showSeconds", "timeSeparator"],
  22: [
    "total",
    "pageSize",
    "pageNumber",
    "pageList",
    "loading",
    "links",
    "showPageList",
    "showRefresh",
    "displayMsg",
    "beforePageText",
    "afterPageText",
  ],
  24: ["value", "editable", "textField", "valueField"],
  25: ["value", "hasDownArrow"],
  26: [
    "animate",
    "multiple",
    "collapsed",
    "border",
    "floatMenuPosition",
    "floatMenuWidth",
    "selectedItemId",
  ],
  27: [
    "checked",
    "disabled",
    "readonly",
    "reversed",
    "handleText",
    "handleWidth",
    "onText",
    "offText",
    "value",
  ],
  28: [
    "required",
    "disabled",
    "readonly",
    "editable",
    "novalidate",
    "validType",
    "delay",
    "invalidMessage",
    "missingMessage",
    "validateOnBlur",
    "validateOnCreate",
    "_validateOnCreate",
    "tipOptions",
    "tipPosition",
    "events",
    "rules",
  ],
  29: ["images", "playtime"],
};

/** 参考工程观测到的全部 proto（供测试/工具断言覆盖完整性）。 */
export const EASYUI_PROTOS = Object.keys(EASYUI_PROTO_TYPES).map(Number);

/** 返回 proto 的语义类型名；未知 proto 返回 "easyui"（宽容兜底）。 */
export function easyuiTypeName(proto: number): string {
  return EASYUI_PROTO_TYPES[proto] ?? "easyui";
}

/**
 * 全部 proto 的可修改字段并集（用于 IR schema 生成 optional 字段）。
 * 会排除 IR 保留名（type/proto/uiExtendType/几何字段）。
 */
export const EASYUI_ALL_FIELDS: readonly string[] = [
  ...new Set(Object.values(EASYUI_PROTO_FIELDS).flat()),
];
