/**
 * Canonical native field-delta policy shared by contract validation and the
 * domain patcher/lowerer. Keep this module dependency-free so signed artifact
 * validation never has to trust a policy projection supplied by the artifact.
 */

function freezeFields(fields: readonly string[]): readonly string[] {
  return Object.freeze([...fields]);
}

function freezeFieldTable<Key extends string | number>(
  table: Readonly<Record<Key, readonly string[]>>,
): Readonly<Record<Key, readonly string[]>> {
  const copy: Record<string, readonly string[]> = {};
  const stringKeyedTable = table as Readonly<Record<string, readonly string[]>>;
  for (const [key, fields] of Object.entries(stringKeyedTable)) {
    copy[key] = freezeFields(fields);
  }
  return Object.freeze(copy) as Readonly<Record<Key, readonly string[]>>;
}

const AUTHORITATIVE_EASYUI_PROTO_FIELDS = freezeFieldTable<number>({
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
});

const AUTHORITATIVE_EASYUI_ALL_FIELDS = freezeFields([
  ...new Set(Object.values(AUTHORITATIVE_EASYUI_PROTO_FIELDS).flat()),
]);

/** `guid` is deliberately excluded because native identities are immutable. */
const AUTHORITATIVE_COMMON_CONTROL_ALLOWED_FIELDS = freezeFields([
  "name", "leftTopPt", "width", "height", "x", "y", "backgroundColor",
  "comment", "visible", "runVisible", "enable", "lock", "sizePolicy",
  "fixedSize", "linkMng", "configureData", "isControl", "resDescription",
  "primary", "internalVertex", "version", "securityPriority", "securitySection",
  "resourceGroup", "resourceGroupMsg", "showUiExtendType", "customPropertyRecords",
  "isChangeFixedSize", "isChangeFont",
]);

const AUTHORITATIVE_PROTOTYPE_ALLOWED_FIELDS = freezeFields([
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
]);

const AUTHORITATIVE_PROTOTYPE_ALLOWED_FIELDS_BY_NAME = freezeFieldTable<string>({
  CustomCharts: ["pageProperty", "objects", "modlePrototype", "region", "bordershow"],
  TrendChart: ["title", "areas", "chartComponentType", "trendMode", "refreshMode", "refreshFrequance", "boundRect", "relativePt", "absolutePt", "isEditLocked", "isEditVisible"],
  BarChart: ["title", "areas", "chartComponentType", "trendMode", "refreshMode", "refreshFrequance", "boundRect", "relativePt", "absolutePt", "isEditLocked", "isEditVisible"],
  PieChart: ["title", "areas", "chartComponentType", "trendMode", "refreshMode", "refreshFrequance", "boundRect", "relativePt", "absolutePt", "isEditLocked", "isEditVisible"],
  XYChart: ["title", "areas", "chartComponentType", "trendMode", "refreshMode", "refreshFrequance", "boundRect", "relativePt", "absolutePt", "isEditLocked", "isEditVisible"],
  AlarmWindow: ["alarmWindowType", "columns", "dateSource", "dateType", "timeType", "historyNumber", "list", "toolBar", "statusBar", "titleName", "titleFontSize", "titleFontColor", "titleTextAlign", "titleTextVertAlign", "backGroundColor", "alarmMsgColor", "alarmMsgBackColor", "alarmMsgFontSize", "ackAlarmColor", "ackAlarmBackColor", "ackAlarmFontSize", "resumeAlarmColor", "resumeAlarmBackColor", "resumeAlarmFontSize", "showAlarmTitle", "showToolBar", "showStatusBar", "showTree", "treeBackGround", "treeFontSize", "treeFontColor", "treeShowLine"],
  EventWindow: ["columns", "dateSource", "dateType", "timeType", "historyNumber", "list", "toolBar", "statusBar", "titleName", "titleFontSize", "titleFontColor", "titleTextAlign", "titleTextVertAlign", "backGroundColor", "operationEventColor", "operationEventBckColor", "operationEventFontSize", "securityEventColor", "securityEventBckColor", "securityEventFontSize", "customEventColor", "customEventBckColor", "customEventFontSize", "showToolBar", "showStatusBar", "showTree", "treeBackGround", "treeFontSize", "treeFontColor", "treeShowLine"],
});

const AUTHORITATIVE_CONTROL_TYPE_ALLOWED_FIELDS = freezeFieldTable<string>({
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
  easyui: AUTHORITATIVE_EASYUI_ALL_FIELDS,
  layout: ["children", "panels"],
  prototype: AUTHORITATIVE_PROTOTYPE_ALLOWED_FIELDS,
});

const AUTHORITATIVE_PAGE_ALLOWED_FIELDS = freezeFields([
  "pageProperty", "pageViewWidth", "pageViewHeight", "version", "showLayer",
  "objectType", "linkMng", "variable", "dataSourceMng", "customProperty",
  "pagePrototype", "pageWindowInfo",
]);

const AUTHORITATIVE_VARIABLE_ALLOWED_FIELDS = freezeFields([
  "name", "dataType", "comment", "defaultValue", "isMap",
]);

/**
 * Frozen compatibility views for historical imports. Each view is copied from
 * the private policy so callers can neither mutate nor retain its references.
 */
export const EASYUI_PROTO_FIELDS = freezeFieldTable(AUTHORITATIVE_EASYUI_PROTO_FIELDS);
export const EASYUI_ALL_FIELDS = freezeFields(AUTHORITATIVE_EASYUI_ALL_FIELDS);
export const COMMON_CONTROL_ALLOWED_FIELDS = freezeFields(AUTHORITATIVE_COMMON_CONTROL_ALLOWED_FIELDS);
export const PROTOTYPE_ALLOWED_FIELDS = freezeFields(AUTHORITATIVE_PROTOTYPE_ALLOWED_FIELDS);
export const PROTOTYPE_ALLOWED_FIELDS_BY_NAME = freezeFieldTable(
  AUTHORITATIVE_PROTOTYPE_ALLOWED_FIELDS_BY_NAME,
);
export const CONTROL_TYPE_ALLOWED_FIELDS = freezeFieldTable(
  AUTHORITATIVE_CONTROL_TYPE_ALLOWED_FIELDS,
);
export const PAGE_ALLOWED_FIELDS = freezeFields(AUTHORITATIVE_PAGE_ALLOWED_FIELDS);
export const VARIABLE_ALLOWED_FIELDS = freezeFields(AUTHORITATIVE_VARIABLE_ALLOWED_FIELDS);

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
      return new Set(AUTHORITATIVE_PAGE_ALLOWED_FIELDS);
    case "variable":
      return new Set(AUTHORITATIVE_VARIABLE_ALLOWED_FIELDS);
    case "control": {
      if (lookup.controlType === undefined) {
        return new Set(AUTHORITATIVE_COMMON_CONTROL_ALLOWED_FIELDS);
      }
      if (lookup.controlType === "easyui") {
        const exact = lookup.easyuiProto === undefined
          ? undefined
          : AUTHORITATIVE_EASYUI_PROTO_FIELDS[lookup.easyuiProto];
        return new Set([...AUTHORITATIVE_COMMON_CONTROL_ALLOWED_FIELDS, ...(exact ?? [])]);
      }
      if (lookup.controlType === "prototype") {
        const exact = lookup.prototypeName === undefined
          ? undefined
          : AUTHORITATIVE_PROTOTYPE_ALLOWED_FIELDS_BY_NAME[lookup.prototypeName];
        return new Set([...AUTHORITATIVE_COMMON_CONTROL_ALLOWED_FIELDS, ...(exact ?? [])]);
      }
      const typeFields = AUTHORITATIVE_CONTROL_TYPE_ALLOWED_FIELDS[lookup.controlType];
      return new Set([
        ...AUTHORITATIVE_COMMON_CONTROL_ALLOWED_FIELDS,
        ...(typeFields ?? []),
      ]);
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
