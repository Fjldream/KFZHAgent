/**
 * Canonical native field-delta policy shared by contract validation and the
 * domain patcher/lowerer. Keep this module dependency-free so signed artifact
 * validation never has to trust a policy projection supplied by the artifact.
 */

export const EASYUI_PROTO_FIELDS: Readonly<Record<number, readonly string[]>> = {
  0: ["editable", "value", "valueField", "textField", "mode"],
  1: [
    "striped", "pagination", "showHeader", "singleSelect", "fitColumns",
    "autoRowHeight", "nowrap", "rownumbers", "selectOnCheck", "checkOnSelect",
    "pagePosition", "pageNumber", "pageSize", "pageList", "sortOrder",
    "multiSort", "remoteSort", "showFooter", "scrollbarSize", "resizeHandle",
    "toolbar", "loadMsg",
  ],
  2: ["text", "disabled", "toggle", "selected", "outline", "group", "plain", "iconAlign", "size", "iconCls", "picName", "backPicName"],
  3: ["value", "min", "max", "precision", "prefix", "suffix", "decimalSeparator", "groupSeparator", "disabled"],
  4: ["value", "min", "max", "precision", "editable", "interval", "multiline"],
  5: ["showGroup", "groupField"],
  6: ["value", "prompt", "menu"],
  7: ["value", "min", "max", "mode", "reversed", "rule", "showTip", "disabled", "step"],
  8: ["value", "min", "max", "increment", "editable", "disabled"],
  9: ["value", "prompt", "required", "editable", "disabled", "readonly", "multiline", "type", "buttonText", "buttonAlign", "iconAlign", "iconWidth", "icons"],
  10: ["value", "separator", "highlight", "showSeconds", "disabled"],
  11: ["value", "disabled", "panelWidth", "panelHeight", "sharedCalendar", "currentText", "closeText", "okText"],
  12: ["title", "collapsible", "minimizable", "maximizable", "closable", "resizable", "inline", "buttons", "toolbar"],
  13: ["buttonText", "buttonAlign", "buttonIcon", "accept", "multiple", "separator", "picName"],
  14: ["menu", "iconCls", "duration"],
  15: ["text", "value"],
  16: ["content", "position", "valign", "deltaX", "deltaY", "hideDelay", "hideEvent", "showDelay", "showEvent", "trackMouse"],
  17: ["animate", "checkbox", "cascadeCheck", "onlyLeafCheck", "lines", "dnd"],
  18: ["idField", "treeField", "animate", "columns"],
  19: ["title", "modal", "closable", "collapsible", "minimizable", "maximizable", "resizable", "draggable", "inline", "shadow", "closed", "zIndex"],
  20: ["current", "firstDay", "showWeek", "weekNumberHeader", "month", "year", "months", "weeks", "border", "fit"],
  21: ["value", "showSeconds", "timeSeparator"],
  22: ["total", "pageSize", "pageNumber", "pageList", "loading", "links", "showPageList", "showRefresh", "displayMsg", "beforePageText", "afterPageText"],
  24: ["value", "editable", "textField", "valueField"],
  25: ["value", "hasDownArrow"],
  26: ["animate", "multiple", "collapsed", "border", "floatMenuPosition", "floatMenuWidth", "selectedItemId"],
  27: ["checked", "disabled", "readonly", "reversed", "handleText", "handleWidth", "onText", "offText", "value"],
  28: ["required", "disabled", "readonly", "editable", "novalidate", "validType", "delay", "invalidMessage", "missingMessage", "validateOnBlur", "validateOnCreate", "_validateOnCreate", "tipOptions", "tipPosition", "events", "rules"],
  29: ["images", "playtime"],
};

export const EASYUI_ALL_FIELDS: readonly string[] = [
  ...new Set(Object.values(EASYUI_PROTO_FIELDS).flat()),
];

/** `guid` is deliberately excluded because native identities are immutable. */
export const COMMON_CONTROL_ALLOWED_FIELDS: readonly string[] = [
  "name", "leftTopPt", "width", "height", "x", "y", "backgroundColor",
  "comment", "visible", "runVisible", "enable", "lock", "sizePolicy",
  "fixedSize", "linkMng", "configureData", "isControl", "resDescription",
  "primary", "internalVertex", "version", "securityPriority", "securitySection",
  "resourceGroup", "resourceGroupMsg", "showUiExtendType", "customPropertyRecords",
  "isChangeFixedSize", "isChangeFont",
];

export const PROTOTYPE_ALLOWED_FIELDS: readonly string[] = [
  "pageProperty", "objects", "modlePrototype", "region", "bordershow", "title",
  "areas", "chartComponentType", "trendMode", "refreshMode", "refreshFrequance",
  "boundRect", "relativePt", "absolutePt", "isEditLocked", "isEditVisible",
  "alarmWindowType", "columns", "dateSource", "dateType", "timeType",
  "historyNumber", "list", "toolBar", "statusBar", "titleName", "titleFontSize",
  "titleFontColor", "titleTextAlign", "titleTextVertAlign", "backGroundColor",
  "alarmMsgColor", "alarmMsgBackColor", "alarmMsgFontSize", "ackAlarmColor",
  "ackAlarmBackColor", "ackAlarmFontSize", "resumeAlarmColor", "resumeAlarmBackColor",
  "resumeAlarmFontSize", "operationEventColor", "operationEventBckColor",
  "operationEventFontSize", "securityEventColor", "securityEventBckColor",
  "securityEventFontSize", "customEventColor", "customEventBckColor",
  "customEventFontSize", "showAlarmTitle", "showToolBar", "showStatusBar", "showTree",
  "treeBackGround", "treeFontSize", "treeFontColor", "treeShowLine", "brushArray",
  "brushName", "picName", "picPath",
];

export const PROTOTYPE_ALLOWED_FIELDS_BY_NAME: Readonly<Record<string, readonly string[]>> = Object.freeze({
  CustomCharts: ["pageProperty", "objects", "modlePrototype", "region", "bordershow"],
  TrendChart: ["title", "areas", "chartComponentType", "trendMode", "refreshMode", "refreshFrequance", "boundRect", "relativePt", "absolutePt", "isEditLocked", "isEditVisible"],
  BarChart: ["title", "areas", "chartComponentType", "trendMode", "refreshMode", "refreshFrequance", "boundRect", "relativePt", "absolutePt", "isEditLocked", "isEditVisible"],
  PieChart: ["title", "areas", "chartComponentType", "trendMode", "refreshMode", "refreshFrequance", "boundRect", "relativePt", "absolutePt", "isEditLocked", "isEditVisible"],
  XYChart: ["title", "areas", "chartComponentType", "trendMode", "refreshMode", "refreshFrequance", "boundRect", "relativePt", "absolutePt", "isEditLocked", "isEditVisible"],
  AlarmWindow: ["alarmWindowType", "columns", "dateSource", "dateType", "timeType", "historyNumber", "list", "toolBar", "statusBar", "titleName", "titleFontSize", "titleFontColor", "titleTextAlign", "titleTextVertAlign", "backGroundColor", "alarmMsgColor", "alarmMsgBackColor", "alarmMsgFontSize", "ackAlarmColor", "ackAlarmBackColor", "ackAlarmFontSize", "resumeAlarmColor", "resumeAlarmBackColor", "resumeAlarmFontSize", "showAlarmTitle", "showToolBar", "showStatusBar", "showTree", "treeBackGround", "treeFontSize", "treeFontColor", "treeShowLine"],
  EventWindow: ["columns", "dateSource", "dateType", "timeType", "historyNumber", "list", "toolBar", "statusBar", "titleName", "titleFontSize", "titleFontColor", "titleTextAlign", "titleTextVertAlign", "backGroundColor", "operationEventColor", "operationEventBckColor", "operationEventFontSize", "securityEventColor", "securityEventBckColor", "securityEventFontSize", "customEventColor", "customEventBckColor", "customEventFontSize", "showToolBar", "showStatusBar", "showTree", "treeBackGround", "treeFontSize", "treeFontColor", "treeShowLine"],
});

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
  radiolegacy: ["radioData", "selectIndex", "layoutStyle", "bkColor", "fontInfo", "rightToLeft"],
  checkboxlegacy: ["check", "checkbox", "bkColor", "fontInfo", "span"],
  combobox: ["selectIndex", "bkColor", "isChangeFixedSize", "isChangeFont"],
  scale: ["minValue", "maxValue", "numerical", "priGraduation", "auxGraduation", "decPart", "graColor", "textColor", "bkColor", "fontInfo"],
  list: ["list", "options", "selectIndex", "borderStyle", "hScrollBar", "bkColor", "fontInfo"],
  treeview: ["bkColor", "fontInfo", "isChangeFixedSize", "isChangeFont"],
  webcontainer: ["url", "scrolling", "transcrolling", "webcon"],
  gantt: ["currentTimeLevel", "timeFormatter", "rowHeight", "taskHeight", "rowFontSize", "timeLineFontSize", "dateEnable", "disableResizing", "isShowTool", "isShowDel", "isShowLock"],
  factorycalendar: ["defaultData", "connectObj"],
  input: ["value", "maxlength", "showWordLimit", "placeholder", "showPassword", "disabled", "clearable", "prefixIcon", "suffixIcon", "readonly", "max", "min", "step", "type", "prepend", "append"],
  cascader: ["placeholder", "disabled", "clearable", "showAllLevels", "collapseTags", "filterable", "separator", "debounce", "refresh"],
  datetimepicker: ["value", "type", "placeholder", "startPlaceholder", "endPlaceholder", "rangeSeparator", "format", "align", "clearable", "editable", "readonly", "unlinkPanels", "disabled"],
  dropdown: ["showDropdown", "showMenu", "property", "options", "text"],
  navmenu: ["show", "mode"],
  tree: ["show", "showCheckbox", "indent", "expandOnClickNode", "draggable", "highlightCurrent", "defaultExpandAll", "accordion"],
  upload: ["dialogVisible", "action", "accept", "multiple"],
  transfer: ["filterable", "filterPlaceholder", "targetOrder"],
  tag: ["closable", "disableTransitions", "hit", "effect", "addable"],
  timeline: ["reverse"],
  steps: ["active", "direction", "space", "processStatus", "finishStatus", "alignCenter", "simple"],
  easyui: EASYUI_ALL_FIELDS,
  layout: ["children", "panels"],
  prototype: PROTOTYPE_ALLOWED_FIELDS,
};

export const PAGE_ALLOWED_FIELDS: readonly string[] = [
  "pageProperty", "pageViewWidth", "pageViewHeight", "version", "showLayer",
  "objectType", "linkMng", "variable", "dataSourceMng", "customProperty",
  "pagePrototype", "pageWindowInfo",
];

export const VARIABLE_ALLOWED_FIELDS: readonly string[] = [
  "name", "dataType", "comment", "defaultValue", "isMap",
];

const COMMON_CONTROL_SET = new Set(COMMON_CONTROL_ALLOWED_FIELDS);
const PAGE_SET = new Set(PAGE_ALLOWED_FIELDS);
const VARIABLE_SET = new Set(VARIABLE_ALLOWED_FIELDS);
const TYPE_SETS = new Map<string, ReadonlySet<string>>(
  Object.entries(CONTROL_TYPE_ALLOWED_FIELDS).map(([type, fields]) => [type, new Set(fields)]),
);

export type AllowlistKind = "control" | "page" | "variable";

export interface AllowlistLookup {
  kind: AllowlistKind;
  controlType?: string;
  easyuiProto?: number;
  prototypeName?: string;
}

export interface NativeControlVariant {
  type: string;
  proto?: number;
  layoutType?: number;
  prototypeName?: string;
}

export function nativeControlVariantForCapability(capabilityId: string): NativeControlVariant {
  const easyui = /^easyui\.(\d+)$/.exec(capabilityId);
  if (easyui !== null) return { type: "easyui", proto: Number(easyui[1]) };
  const layout = /^layout\.(\d+)$/.exec(capabilityId);
  if (layout !== null) return { type: "layout", layoutType: Number(layout[1]) };
  const prototype = /^prototype\.(.+)$/.exec(capabilityId);
  if (prototype !== null) return { type: "prototype", prototypeName: prototype[1]! };
  return { type: capabilityId };
}

export function allowedFieldsFor(lookup: AllowlistLookup): ReadonlySet<string> {
  switch (lookup.kind) {
    case "page":
      return PAGE_SET;
    case "variable":
      return VARIABLE_SET;
    case "control": {
      if (lookup.controlType === undefined) return COMMON_CONTROL_SET;
      if (lookup.controlType === "easyui") {
        const exact = lookup.easyuiProto === undefined ? undefined : EASYUI_PROTO_FIELDS[lookup.easyuiProto];
        return new Set([...COMMON_CONTROL_SET, ...(exact ?? [])]);
      }
      if (lookup.controlType === "prototype") {
        const exact = lookup.prototypeName === undefined ? undefined : PROTOTYPE_ALLOWED_FIELDS_BY_NAME[lookup.prototypeName];
        return new Set([...COMMON_CONTROL_SET, ...(exact ?? [])]);
      }
      const typeSet = TYPE_SETS.get(lookup.controlType);
      if (typeSet === undefined) return COMMON_CONTROL_SET;
      return new Set([...COMMON_CONTROL_SET, ...typeSet]);
    }
  }
}

export function allowedFieldsForCapability(capabilityId: string): ReadonlySet<string> {
  const variant = nativeControlVariantForCapability(capabilityId);
  return allowedFieldsFor({
    kind: "control",
    controlType: variant.type,
    ...(variant.proto === undefined ? {} : { easyuiProto: variant.proto }),
    ...(variant.prototypeName === undefined ? {} : { prototypeName: variant.prototypeName }),
  });
}
