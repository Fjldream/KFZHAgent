/**
 * Per-entity-type patch allowlists.
 *
 * The patcher accepts `update.changes[].path` only when the first reference
 * token names a controlled field for the target entity type. Everything else
 * is rejected with PATCH_CONFLICT — the patch engine never invents KF fields
 * and never writes to unknown/future fields (those are preserved losslessly).
 *
 * The control table is keyed by the IR control type (`CONTROL_TYPE_BY_UIMODEL_TYPE`),
 * which is what the inspector resolves a KF `uiModelType` to. `x`/`y` are
 * geometry aliases for the raw KF `leftTopPt.x`/`leftTopPt.y` fields; `width`
 * and `height` map 1:1 to the raw KF fields.
 *
 * KF 容器对象（easyui / 布局）也走同一张表：
 * - `easyui`（objectType=3 + uiExtendType）白名单 = `EASYUI_ALL_FIELDS` 并集
 *   （约 145 个宽松字段）+ 公共几何字段，字段名与 KF 顶层字段一一对应；
 * - `layout`（objectType=2 + layoutType）白名单 = layoutType/children/panels
 *   + 公共几何字段，但 IR 路径与 KF 原始路径不同（几何在 baseProperty、
 *   子对象在 insiderObjects、面板在 dPanelsOption），由
 *   `CONTROL_LAYOUT_PATH_ALIASES` 在解析阶段映射；
 * - `prototype`（prototypeName 判别的 KF 特殊节点：CustomCharts/AlarmWindow/
 *   EventWindow/TrendChart/BarChart/PieChart/XYChart）白名单 = 几何 + title +
 *   显示属性 + 复杂配置字段，其中复杂配置（pageProperty/objects/areas/columns）
 *   作为**整体替换**（patch 整段 JSON，不细粒度 patch）；CustomCharts 的几何
 *   在 pageProperty.pagePos/pageSize（非顶层 leftTopPt），由
 *   `PROTOTYPE_GEOMETRY_ALIASES_BY_NAME` 在解析阶段映射。
 */

import { EASYUI_ALL_FIELDS } from "../ir/easyui-types.js";

/** Fields every KF control may be patched on, regardless of type.
 * Note: `guid` is deliberately NOT here — a KF GUID identifies the entity
 * across the whole project and must never be changed by a field patch.
 */
export const COMMON_CONTROL_ALLOWED_FIELDS: readonly string[] = [
  "name",
  "leftTopPt",
  "width",
  "height",
  "x", // alias -> /leftTopPt/x
  "y", // alias -> /leftTopPt/y
  "backgroundColor", // brief Step 1 controlled field
  "comment",
  "visible",
  "runVisible",
  "enable",
  "lock",
  "sizePolicy",
  "fixedSize",
  "linkMng",
  "styleData",
  "styleDataNew",
  "configureData",
  "isControl",
  "resDescription",
  "primary",
  "internalVertex",
  "version",
  "securityPriority",
  "securitySection",
  "resourceGroup",
  "resourceGroupMsg",
  "prototypeName",
  "showUiExtendType",
  "customPropertyRecords",
  "isChangeFixedSize",
  "isChangeFont",
  "region",
  "baseProperty",
  "insiderObjects",
  "objects",
  "children",
  "layoutItems",
];

/** Geometry alias: `x` -> `leftTopPt.x`, `y` -> `leftTopPt.y`. */
export const CONTROL_GEOMETRY_ALIASES: Readonly<Record<string, string>> = {
  "/x": "/leftTopPt/x",
  "/y": "/leftTopPt/y",
  "/width": "/width",
  "/height": "/height",
};

/**
 * KF 特殊节点（prototypeName 判别）可 patch 字段。复杂配置字段
 * （pageProperty/objects/areas/columns/list/...）只作为**整体替换**：
 * patch 整段 JSON，绝不细粒度 patch 内部深层结构（objects[0] 是 JSON 字符串、
 * areas/columns 结构随原型而变）。来源：docs/kf-special-node-field-map.md §4。
 */
export const PROTOTYPE_ALLOWED_FIELDS: readonly string[] = [
  // CustomCharts（objectType=1，窗口型容器）：复杂配置整体替换
  "pageProperty",
  "objects",
  "modlePrototype",
  "region",
  "bordershow",
  // 图表型（TrendChart/BarChart/PieChart/XYChart）顶层显示字段
  "title",
  "areas",
  "chartComponentType",
  "trendMode",
  "refreshMode",
  "refreshFrequance",
  "boundRect",
  "relativePt",
  "absolutePt",
  "isEditLocked",
  "isEditVisible",
  // AlarmWindow / EventWindow
  "alarmWindowType",
  "columns",
  "dateSource",
  "dateType",
  "timeType",
  "historyNumber",
  "list",
  "toolBar",
  "statusBar",
  // 文字 / 配色 / 背景 / 显示开关
  "titleName",
  "titleFontSize",
  "titleFontColor",
  "titleTextAlign",
  "titleTextVertAlign",
  "backGroundColor",
  "alarmMsgColor",
  "alarmMsgBackColor",
  "alarmMsgFontSize",
  "ackAlarmColor",
  "ackAlarmBackColor",
  "ackAlarmFontSize",
  "resumeAlarmColor",
  "resumeAlarmBackColor",
  "resumeAlarmFontSize",
  "operationEventColor",
  "operationEventBckColor",
  "operationEventFontSize",
  "securityEventColor",
  "securityEventBckColor",
  "securityEventFontSize",
  "customEventColor",
  "customEventBckColor",
  "customEventFontSize",
  "showAlarmTitle",
  "showToolBar",
  "showStatusBar",
  "showTree",
  "treeBackGround",
  "treeFontSize",
  "treeFontColor",
  "treeShowLine",
  "brushArray",
  "brushName",
  "picName",
  "picPath",
];

/** Control-specific fields per IR control type (mirrors the serialized layouts). */
export const CONTROL_TYPE_ALLOWED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  text: ["text", "readOnly", "maxLen", "fontInfo", "bkColor", "type", "borderStyle", "borderColor", "layoutStyle", "isShowBorder", "toolTipEnable", "toolTipText"],
  richtext: ["text", "readOnly", "fontInfo", "bkColor", "borderStyle", "borderColor", "scrollBar", "toolTipText", "toolTipEnable", "isShowBorder"],
  spacer: [],
  table: ["configureData"],
  button: ["text", "type", "plain", "round", "circle", "loading", "disabled", "icon", "titleShow"],
  radio: ["radioData", "disabled", "border", "size", "type", "radioValue", "textColor"],
  checkbox: ["checkboxData", "checkedData", "allselectText", "indeterminate", "checkAll", "type", "min", "max", "size", "textColor", "fill", "border", "isIndeterminate"],
  image: ["src", "fit", "alt", "placeholder", "lazy", "referrerPolicy", "previewSrcLists", "picName"],
  select: ["selectValue", "multiple", "disabled", "clearable", "multipleLimit", "filterable", "allowCreate", "defaultFirstOption", "placeholder", "selectData", "collapseTags", "remote", "loading", "loadingText", "noMatchText", "noDataText", "reserveKeyworld", "automaticDropdown"],
  tabs: ["activeName", "type", "tabData", "closable", "addable", "tabPosition", "stretch"],
  switch: ["value", "activeColor", "inactiveColor", "activeText", "inactiveText", "activeIconClass", "inactiveIconClass", "disabled"],
  inputnumber: ["value", "min", "max", "step", "stepStrictly", "precision", "disabled", "controls", "controlsPosition", "placeholder"],
  // ── 新增 20 种（update 允许修改的核心字段，与模板序列化字段一致）──
  radiolegacy: ["radioData", "selectIndex", "layoutStyle", "bkColor", "fontInfo", "rightToLeft"],
  checkboxlegacy: ["check", "checkbox", "bkColor", "fontInfo", "span"],
  combobox: ["selectIndex", "bkColor", "isChangeFixedSize", "isChangeFont"],
  scale: ["minValue", "maxValue", "numerical", "priGraduation", "auxGraduation", "decPart", "graColor", "textColor", "bkColor", "fontInfo"],
  list: ["list", "selectIndex", "borderStyle", "hScrollBar", "bkColor", "fontInfo"],
  treeview: ["bkColor", "fontInfo", "isChangeFixedSize", "isChangeFont"],
  webcontainer: ["url", "scrolling", "transcrolling", "webcon"],
  gantt: ["currentTimeLevel", "timeFormatter", "rowHeight", "taskHeight", "rowFontSize", "timeLineFontSize", "dateEnable", "disableResizing", "isShowTool", "isShowDel", "isShowLock"],
  factorycalendar: ["defaultData", "connectObj"],
  input: ["value", "maxlength", "showWordLimit", "placeholder", "showPassword", "disabled", "clearable", "prefixIcon", "suffixIcon", "readonly", "max", "min", "step", "type", "prepend", "append"],
  cascader: ["placeholder", "disabled", "clearable", "showAllLevels", "collapseTags", "filterable", "separator", "debounce", "refresh"],
  datetimepicker: ["value", "type", "placeholder", "startPlaceholder", "endPlaceholder", "rangeSeparator", "format", "align", "clearable", "editable", "readonly", "unlinkPanels", "disabled"],
  dropdown: ["showDropdown", "showMenu", "property", "text"],
  navmenu: ["show", "mode"],
  tree: ["show", "showCheckbox", "indent", "expandOnClickNode", "draggable", "highlightCurrent", "defaultExpandAll", "accordion"],
  upload: ["dialogVisible", "action", "accept", "multiple"],
  transfer: ["filterable", "filterPlaceholder", "targetOrder"],
  tag: ["closable", "disableTransitions", "hit", "effect", "addable"],
  timeline: ["reverse"],
  steps: ["active", "direction", "space", "processStatus", "finishStatus", "alignCenter", "simple"],
  // ── KF 容器对象（参考工程 test_最新_2）──
  // easyui（objectType=3 + uiExtendType/proto）：白名单 = 全 proto 可修改字段并集
  // （EASYUI_ALL_FIELDS，约 145 个宽松字段）；几何走公共 leftTopPt/width/height。
  easyui: EASYUI_ALL_FIELDS,
  // layout（objectType=2 + layoutType）：layoutType 顶层直写，children/panels 为
  // IR 语义字段（patch 时经 CONTROL_LAYOUT_PATH_ALIASES 映射到 insiderObjects/
  // dPanelsOption），几何经映射进入 baseProperty。
  layout: ["layoutType", "children", "panels"],
  // ── KF 特殊节点（objectType=1 / prototypeName 判别）──
  // 几何/可见性/tooltip 等走公共字段（COMMON_CONTROL_ALLOWED_FIELDS）；
  // 复杂配置（pageProperty/objects JSON 字符串/areas/columns）作为整体替换
  // （patch 整段 JSON，不细粒度 patch）；guid/areasNumStr 等身份/结构字段
  // 不在此列（保持只读）。
  prototype: PROTOTYPE_ALLOWED_FIELDS,
};

/**
 * KF 布局容器的 IR 路径 → 原始 KF 路径映射：几何在 `baseProperty`（非顶层
 * leftTopPt），子对象在 `insiderObjects`，面板在 `dPanelsOption`。easyui 的
 * IR 字段名与 KF 顶层字段一一对应，无需映射。
 */
export const CONTROL_LAYOUT_PATH_ALIASES: Readonly<Record<string, string>> = {
  "/x": "/baseProperty/leftTopPt/x",
  "/y": "/baseProperty/leftTopPt/y",
  "/leftTopPt": "/baseProperty/leftTopPt",
  "/width": "/baseProperty/width",
  "/height": "/baseProperty/height",
  "/children": "/insiderObjects",
  "/panels": "/dPanelsOption",
};

/**
 * KF 特殊节点几何路径（按 prototypeName）：**CustomCharts** 的几何在
 * `pageProperty.pagePos/pageSize`（顶层无 leftTopPt/width/height），IR 几何
 * 别名需映射进 pageProperty；图表型 / 告警窗 / 事件窗几何在顶层，走默认
 * `CONTROL_GEOMETRY_ALIASES`，无需在此登记。
 */
export const PROTOTYPE_GEOMETRY_ALIASES_BY_NAME: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  CustomCharts: {
    "/x": "/pageProperty/pagePos/x",
    "/y": "/pageProperty/pagePos/y",
    "/leftTopPt": "/pageProperty/pagePos",
    "/width": "/pageProperty/pageSize/width",
    "/height": "/pageProperty/pageSize/height",
  },
};

/** Fields on a KF page JSON file that may be patched. */
export const PAGE_ALLOWED_FIELDS: readonly string[] = [
  "pageProperty",
  "pageViewWidth",
  "pageViewHeight",
  "version",
  "showLayer",
  "objectType",
  "linkMng",
  "variable",
  "dataSourceMng",
  "customProperty",
  "pagePrototype",
  "pageWindowInfo",
];

/** Fields on a KF variable (Tag file Variables[] entry) that may be patched. */
export const VARIABLE_ALLOWED_FIELDS: readonly string[] = [
  "name",
  "dataType",
  "comment",
  "defaultValue",
  "isMap",
];

const COMMON_CONTROL_SET = new Set(COMMON_CONTROL_ALLOWED_FIELDS);

const PAGE_SET = new Set(PAGE_ALLOWED_FIELDS);
const VARIABLE_SET = new Set(VARIABLE_ALLOWED_FIELDS);

const TYPE_SETS = new Map<string, ReadonlySet<string>>(
  Object.entries(CONTROL_TYPE_ALLOWED_FIELDS).map(([type, fields]) => [
    type,
    new Set(fields),
  ]),
);

export type AllowlistKind = "control" | "page" | "variable";

export interface AllowlistLookup {
  kind: AllowlistKind;
  controlType?: string;
}

/**
 * Returns the allowlisted field set for an entity. For controls the set is
 * the union of the common fields and the IR control type fields.
 */
export function allowedFieldsFor(
  lookup: AllowlistLookup,
): ReadonlySet<string> {
  switch (lookup.kind) {
    case "page":
      return PAGE_SET;
    case "variable":
      return VARIABLE_SET;
    case "control": {
      if (lookup.controlType === undefined) return COMMON_CONTROL_SET;
      const typeSet = TYPE_SETS.get(lookup.controlType);
      if (typeSet === undefined) return COMMON_CONTROL_SET;
      return new Set([...COMMON_CONTROL_SET, ...typeSet]);
    }
  }
}

/** Resolves a relative change path to the effective raw-KF path (alias expansion). */
export function resolveControlPath(relativePath: string): string {
  return CONTROL_GEOMETRY_ALIASES[relativePath] ?? relativePath;
}

/**
 * Resolves a control change path for a specific IR control type. easyui
 * controls keep the top-level geometry aliases (`x`/`y` → `/leftTopPt/x`...);
 * layout containers additionally map `children`/`panels`/geometry onto their
 * KF nesting (`insiderObjects`/`dPanelsOption`/`baseProperty`); KF special
 * nodes (`prototype`) map CustomCharts geometry onto `pageProperty.pagePos/
 * pageSize` (other prototypeNames keep the top-level geometry aliases).
 */
export function resolveControlPathFor(
  controlType: string | undefined,
  relativePath: string,
  prototypeName?: string,
): string {
  if (controlType === "layout") {
    return CONTROL_LAYOUT_PATH_ALIASES[relativePath] ?? relativePath;
  }
  if (controlType === "prototype" && prototypeName !== undefined) {
    const aliases = PROTOTYPE_GEOMETRY_ALIASES_BY_NAME[prototypeName];
    if (aliases !== undefined) {
      return aliases[relativePath] ?? relativePath;
    }
  }
  return resolveControlPath(relativePath);
}
