import { z } from "zod";
import { ComponentStyleSpecSchema } from "@kf/contracts";

/**
 * ClientProjectIR: a schema-constrained, lossless view of a KingFusion client
 * project. IR field names are semantic (stable across KF versions); the raw KF
 * field layout lives in the control templates under `src/templates/`.
 *
 * Conventions:
 * - `ControlIR.id` is a STABLE SEMANTIC id (e.g. the KF control `name`), never
 *   a KF GUID. The KF GUID mapping is owned by the inspector's EntityIndex.
 * - `ControlIR` is a Zod discriminated union on `type`; a variant may never
 *   expose a raw KF object or an arbitrary property bag.
 */

/** Layout coordinates shared by every control variant (brief Step 4). */
export const BaseControlIR = z.object({
  id: z.string().min(1),
  x: z.number().nonnegative(),
  y: z.number().nonnegative(),
  width: z.number().positive(),
  height: z.number().positive(),
  /** Structured style intent only; arbitrary CSS is intentionally not representable. */
  style: ComponentStyleSpecSchema.optional(),
});
export type BaseControlIR = z.infer<typeof BaseControlIR>;

/**
 * Restricted action DSL (design doc §11: "动作 DSL/模板" as a limited first
 * capability). Only whitelisted, declarative actions are expressible; free
 * script text is represented separately and never executed on the agent.
 *
 * Reference domains (semantic IDs, never KF GUIDs):
 * - `navigate.pageId` targets a SEMANTIC PAGE ID — the KF page `name` (stable
 *   and human-readable). The Task 6 compiler resolves it to the page KF GUID
 *   via the inspector's page index.
 * - `setVariable.variableId` targets a SEMANTIC VARIABLE ID — the KF variable
 *   `name` (e.g. `$TestVar`). The numeric KF variable `id` is an internal
 *   sequential number and is NOT stable across re-imports, so it is never used
 *   as a reference here.
 */
export const RestrictedAction = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("navigate"), pageId: z.string().min(1) }),
  z.object({
    kind: z.literal("setVariable"),
    variableId: z.string().min(1),
    value: z.union([z.string(), z.number(), z.boolean()]),
  }),
  z.object({ kind: z.literal("noop") }),
]);
export type RestrictedAction = z.infer<typeof RestrictedAction>;

export const TextControlIR = BaseControlIR.extend({
  type: z.literal("text"),
  text: z.string(),
}).strict();

export const ButtonControlIR = BaseControlIR.extend({
  type: z.literal("button"),
  text: z.string(),
  action: RestrictedAction.optional(),
}).strict();

export const InputNumberControlIR = BaseControlIR.extend({
  type: z.literal("inputnumber"),
  variableId: z.string().min(1),
  decimals: z.number().int().min(0).max(10),
}).strict();

export const SwitchControlIR = BaseControlIR.extend({
  type: z.literal("switch"),
  value: z.boolean(),
  activeText: z.string().optional(),
  inactiveText: z.string().optional(),
}).strict();

export const CheckboxControlIR = BaseControlIR.extend({
  type: z.literal("checkbox"),
  label: z.string().optional(),
  checked: z.boolean(),
}).strict();

export const RadioControlIR = BaseControlIR.extend({
  type: z.literal("radio"),
  options: z.array(z.object({ label: z.string(), value: z.string() })).min(1),
  value: z.string().optional(),
}).strict();

export const SelectControlIR = BaseControlIR.extend({
  type: z.literal("select"),
  options: z.array(z.object({ label: z.string(), value: z.string() })).min(1),
  value: z.string().optional(),
  multiple: z.boolean().optional(),
  placeholder: z.string().optional(),
}).strict();

export const ImageControlIR = BaseControlIR.extend({
  type: z.literal("image"),
  src: z.string().min(1),
  fit: z.string().optional(),
  alt: z.string().optional(),
}).strict();

export const TabsControlIR = BaseControlIR.extend({
  type: z.literal("tabs"),
  tabs: z.array(z.object({ id: z.string().min(1), label: z.string() })).min(1),
  activeId: z.string().optional(),
}).strict();

export const TableControlIR = BaseControlIR.extend({
  type: z.literal("table"),
}).strict();
// KF tables (uiModelType 31) do NOT serialize columns/dataSource as object
// fields: verified against 1094 real SDB table objects, the column model lives
// inside the `configureData` script (`this.table({ columns: [...] })`) and the
// runtime `$VMData.columns` Vue state is never persisted. A structured column
// mapping is therefore deferred to Task 6 (parse `configureData` or introduce
// a configuration DSL); until then the table variant exposes base geometry only.

export const RichTextControlIR = BaseControlIR.extend({
  type: z.literal("richtext"),
  text: z.string(),
}).strict();

export const SpacerControlIR = BaseControlIR.extend({
  type: z.literal("spacer"),
  axis: z.enum(["horizontal", "vertical"]),
}).strict();
// `axis` is a DERIVED field: KF spacers carry no such attribute (verified:
// 11k+ real SDB spacer objects have no `name` and no axis field). The axis is
// implied by the KF uiModelType (13 = HORIZONTALSPACER, 14 = VERTICALSPACER);
// the Task 6 compiler emits the uiModelType from `axis`.

// ── 新增控件（参考工程 test_最新_2 实际使用；字段 = LLM 可生成的语义属性，
//    复杂数据如 gantt data/tag tags 走 configureData 脚本，IR 不建模）──

export const LegacyRadioControlIR = BaseControlIR.extend({
  type: z.literal("radiolegacy"),
  options: z.array(z.object({ label: z.string(), value: z.string() })).min(1),
  value: z.string().optional(),
}).strict();

export const LegacyCheckboxControlIR = BaseControlIR.extend({
  type: z.literal("checkboxlegacy"),
  label: z.string().optional(),
  checked: z.boolean(),
}).strict();

export const ComboboxControlIR = BaseControlIR.extend({
  type: z.literal("combobox"),
  options: z.array(z.object({ label: z.string(), value: z.string() })).min(1),
  value: z.string().optional(),
  editable: z.boolean().optional(),
}).strict();

export const ScaleControlIR = BaseControlIR.extend({
  type: z.literal("scale"),
  min: z.number().optional(),
  max: z.number().optional(),
  value: z.number().optional(),
  step: z.number().optional(),
}).strict();

export const ListControlIR = BaseControlIR.extend({
  type: z.literal("list"),
  options: z.array(z.object({ label: z.string(), value: z.string() })).min(1),
}).strict();

export const TreeviewControlIR = BaseControlIR.extend({
  type: z.literal("treeview"),
  showCheckbox: z.boolean().optional(),
}).strict();

export const WebContainerControlIR = BaseControlIR.extend({
  type: z.literal("webcontainer"),
  url: z.string().optional(),
  scrollbar: z.boolean().optional(),
}).strict();

export const GanttControlIR = BaseControlIR.extend({
  type: z.literal("gantt"),
}).strict();
// gantt 的 data（项目/任务树）走 configureData 脚本，IR 只占几何。

export const FactoryCalendarControlIR = BaseControlIR.extend({
  type: z.literal("factorycalendar"),
  value: z.string().optional(),
  dateFormat: z.string().optional(),
}).strict();

export const InputControlIR = BaseControlIR.extend({
  type: z.literal("input"),
  value: z.string().optional(),
  placeholder: z.string().optional(),
  inputType: z.enum(["text", "password", "textarea"]).optional(),
  disabled: z.boolean().optional(),
  clearable: z.boolean().optional(),
  maxlength: z.number().int().nonnegative().optional(),
}).strict();

export const CascaderControlIR = BaseControlIR.extend({
  type: z.literal("cascader"),
  options: z.array(z.record(z.string(), z.unknown())).optional(),
  placeholder: z.string().optional(),
  filterable: z.boolean().optional(),
  clearable: z.boolean().optional(),
}).strict();

export const DatetimePickerControlIR = BaseControlIR.extend({
  type: z.literal("datetimepicker"),
  value: z.string().optional(),
  pickerType: z.enum(["date", "datetime", "daterange", "month", "time"]).optional(),
  placeholder: z.string().optional(),
  format: z.string().optional(),
}).strict();

export const DropdownControlIR = BaseControlIR.extend({
  type: z.literal("dropdown"),
  options: z.array(z.object({ label: z.string(), value: z.string() })).min(1),
  text: z.string().optional(),
  splitButton: z.boolean().optional(),
}).strict();

export const NavmenuControlIR = BaseControlIR.extend({
  type: z.literal("navmenu"),
  mode: z.enum(["horizontal", "vertical"]).optional(),
  options: z.array(z.record(z.string(), z.unknown())).optional(),
}).strict();

export const TreeControlIR = BaseControlIR.extend({
  type: z.literal("tree"),
  showCheckbox: z.boolean().optional(),
  indent: z.number().nonnegative().optional(),
  expandOnClickNode: z.boolean().optional(),
}).strict();

export const UploadControlIR = BaseControlIR.extend({
  type: z.literal("upload"),
  action: z.string().optional(),
  accept: z.string().optional(),
  multiple: z.boolean().optional(),
}).strict();

export const TransferControlIR = BaseControlIR.extend({
  type: z.literal("transfer"),
  options: z.array(z.object({ label: z.string(), value: z.string() })).min(1),
  titles: z.tuple([z.string(), z.string()]).optional(),
}).strict();

export const TagControlIR = BaseControlIR.extend({
  type: z.literal("tag"),
  effect: z.enum(["light", "dark", "plain"]).optional(),
  closable: z.boolean().optional(),
  hit: z.boolean().optional(),
}).strict();

export const TimelineControlIR = BaseControlIR.extend({
  type: z.literal("timeline"),
  items: z.array(z.object({ title: z.string(), description: z.string().optional() })).min(1),
}).strict();

export const StepsControlIR = BaseControlIR.extend({
  type: z.literal("steps"),
  active: z.number().int().nonnegative().optional(),
  direction: z.enum(["horizontal", "vertical"]).optional(),
  processStatus: z.enum(["wait", "process", "finish", "error", "success"]).optional(),
}).strict();

// ── KF 容器对象（参考工程 test_最新_2；详见 docs/superpowers/plans/2026-08-10-kf-container-controls.md）──
// 容器对象没有 `uiModelType`：easyui 控件用 objectType=3 + uiExtendType(proto) 标识，
// 布局容器用 objectType=2（或无 objectType）+ layoutType 标识。

/** 布局容器内嵌套子对象的宽容保留（真实 `insiderObjects` 原始结构）。 */
export const ContainerChildIR = z.record(z.string(), z.unknown());
export type ContainerChildIR = z.infer<typeof ContainerChildIR>;

/**
 * easyui 控件（objectType=3）。几何在顶层 leftTopPt/width/height；
 * 数据/列走 `configureData` 脚本（easyui 模式），IR 只建模几何 + 核心字段。
 * `type` 固定为字面量 "easyui"（保证 discriminatedUnion 可用），proto 细分控件种类。
 */
export const EasyuiControlIR = BaseControlIR.extend({
  type: z.literal("easyui"),
  /** KF `uiExtendType`：easyui 控件种类标识（见 EASYUI_PROTO_TYPES）。 */
  proto: z.number().int(),
  /** 冗余保留原始 proto 值（与 proto 相同，便于回写 KF 时对账）。 */
  uiExtendType: z.number().int().optional(),
  // ── easyui 核心可选字段（EASYUI_PROTO_FIELDS 并集，排除 IR 保留名 type/proto/uiExtendType/几何；值类型宽松 unknown）──
  _validateOnCreate: z.unknown().optional(),
  accept: z.unknown().optional(),
  afterPageText: z.unknown().optional(),
  animate: z.unknown().optional(),
  autoRowHeight: z.unknown().optional(),
  backPicName: z.unknown().optional(),
  beforePageText: z.unknown().optional(),
  border: z.unknown().optional(),
  buttonAlign: z.unknown().optional(),
  buttonIcon: z.unknown().optional(),
  buttonText: z.unknown().optional(),
  buttons: z.unknown().optional(),
  cascadeCheck: z.unknown().optional(),
  checkOnSelect: z.unknown().optional(),
  checkbox: z.unknown().optional(),
  checked: z.unknown().optional(),
  closable: z.unknown().optional(),
  closeText: z.unknown().optional(),
  closed: z.unknown().optional(),
  collapsed: z.unknown().optional(),
  collapsible: z.unknown().optional(),
  columns: z.unknown().optional(),
  content: z.unknown().optional(),
  current: z.unknown().optional(),
  currentText: z.unknown().optional(),
  decimalSeparator: z.unknown().optional(),
  delay: z.unknown().optional(),
  deltaX: z.unknown().optional(),
  deltaY: z.unknown().optional(),
  disabled: z.unknown().optional(),
  displayMsg: z.unknown().optional(),
  dnd: z.unknown().optional(),
  draggable: z.unknown().optional(),
  duration: z.unknown().optional(),
  editable: z.unknown().optional(),
  events: z.unknown().optional(),
  firstDay: z.unknown().optional(),
  fit: z.unknown().optional(),
  fitColumns: z.unknown().optional(),
  floatMenuPosition: z.unknown().optional(),
  floatMenuWidth: z.unknown().optional(),
  group: z.unknown().optional(),
  groupField: z.unknown().optional(),
  groupSeparator: z.unknown().optional(),
  handleText: z.unknown().optional(),
  handleWidth: z.unknown().optional(),
  hasDownArrow: z.unknown().optional(),
  hideDelay: z.unknown().optional(),
  hideEvent: z.unknown().optional(),
  highlight: z.unknown().optional(),
  iconAlign: z.unknown().optional(),
  iconCls: z.unknown().optional(),
  iconWidth: z.unknown().optional(),
  icons: z.unknown().optional(),
  idField: z.unknown().optional(),
  images: z.unknown().optional(),
  increment: z.unknown().optional(),
  inline: z.unknown().optional(),
  interval: z.unknown().optional(),
  invalidMessage: z.unknown().optional(),
  lines: z.unknown().optional(),
  links: z.unknown().optional(),
  loadMsg: z.unknown().optional(),
  loading: z.unknown().optional(),
  max: z.unknown().optional(),
  maximizable: z.unknown().optional(),
  menu: z.unknown().optional(),
  min: z.unknown().optional(),
  minimizable: z.unknown().optional(),
  missingMessage: z.unknown().optional(),
  modal: z.unknown().optional(),
  mode: z.unknown().optional(),
  month: z.unknown().optional(),
  months: z.unknown().optional(),
  multiSort: z.unknown().optional(),
  multiline: z.unknown().optional(),
  multiple: z.unknown().optional(),
  novalidate: z.unknown().optional(),
  nowrap: z.unknown().optional(),
  offText: z.unknown().optional(),
  okText: z.unknown().optional(),
  onText: z.unknown().optional(),
  onlyLeafCheck: z.unknown().optional(),
  outline: z.unknown().optional(),
  pageList: z.unknown().optional(),
  pageNumber: z.unknown().optional(),
  pagePosition: z.unknown().optional(),
  pageSize: z.unknown().optional(),
  pagination: z.unknown().optional(),
  panelHeight: z.unknown().optional(),
  panelWidth: z.unknown().optional(),
  picName: z.unknown().optional(),
  plain: z.unknown().optional(),
  playtime: z.unknown().optional(),
  position: z.unknown().optional(),
  precision: z.unknown().optional(),
  prefix: z.unknown().optional(),
  prompt: z.unknown().optional(),
  readonly: z.unknown().optional(),
  remoteSort: z.unknown().optional(),
  required: z.unknown().optional(),
  resizable: z.unknown().optional(),
  resizeHandle: z.unknown().optional(),
  reversed: z.unknown().optional(),
  rownumbers: z.unknown().optional(),
  rule: z.unknown().optional(),
  rules: z.unknown().optional(),
  scrollbarSize: z.unknown().optional(),
  selectOnCheck: z.unknown().optional(),
  selected: z.unknown().optional(),
  selectedItemId: z.unknown().optional(),
  separator: z.unknown().optional(),
  shadow: z.unknown().optional(),
  sharedCalendar: z.unknown().optional(),
  showDelay: z.unknown().optional(),
  showEvent: z.unknown().optional(),
  showFooter: z.unknown().optional(),
  showGroup: z.unknown().optional(),
  showHeader: z.unknown().optional(),
  showPageList: z.unknown().optional(),
  showRefresh: z.unknown().optional(),
  showSeconds: z.unknown().optional(),
  showTip: z.unknown().optional(),
  showWeek: z.unknown().optional(),
  singleSelect: z.unknown().optional(),
  size: z.unknown().optional(),
  sortOrder: z.unknown().optional(),
  step: z.unknown().optional(),
  striped: z.unknown().optional(),
  suffix: z.unknown().optional(),
  text: z.unknown().optional(),
  textField: z.unknown().optional(),
  timeSeparator: z.unknown().optional(),
  tipOptions: z.unknown().optional(),
  tipPosition: z.unknown().optional(),
  title: z.unknown().optional(),
  toggle: z.unknown().optional(),
  toolbar: z.unknown().optional(),
  total: z.unknown().optional(),
  trackMouse: z.unknown().optional(),
  treeField: z.unknown().optional(),
  validType: z.unknown().optional(),
  validateOnBlur: z.unknown().optional(),
  validateOnCreate: z.unknown().optional(),
  valign: z.unknown().optional(),
  value: z.unknown().optional(),
  valueField: z.unknown().optional(),
  weekNumberHeader: z.unknown().optional(),
  weeks: z.unknown().optional(),
  year: z.unknown().optional(),
  zIndex: z.unknown().optional(),
}).strict();
export type EasyuiControlIR = z.infer<typeof EasyuiControlIR>;

/**
 * 布局容器（objectType=2 或无 objectType + layoutType）。几何在 `baseProperty`
 * （inspect 层映射为 IR 的 x/y/width/height，KF 贴边坐标可为 -1）；
 * 子对象在 `insiderObjects`（映射为 children），面板在 `dPanelsOption`（映射为 panels）。
 */
export const LayoutContainerIR = BaseControlIR.extend({
  x: z.number(), // KF Docking 布局 leftTopPt.x=-1 表示贴边，允许负坐标
  y: z.number(),
  type: z.literal("layout"),
  /** KF `layoutType`：2=HorizontalLayout、3=Tab、4=VerticalLayout、5=DockingLayout、0=Accordion、6=ProjectFlowChart 等。 */
  layoutType: z.number().int(),
  /** 嵌套子对象（宽容保留原始 JSON，含子布局/子控件的 baseProperty/insiderObjects）。 */
  children: z.array(ContainerChildIR).optional(),
  /** `dPanelsOption` 面板配置（宽容保留）。 */
  panels: z.array(z.record(z.string(), z.unknown())).optional(),
}).strict();
export type LayoutContainerIR = z.infer<typeof LayoutContainerIR>;

// ── KF 特殊节点（objectType=1 或 prototypeName 特判的图表/告警/自定义窗口）──
// 详见 docs/superpowers/plans/2026-08-10-kf-special-nodes.md。这些节点没有
// uiModelType/uiExtendType/layoutType，KF 前端 km_layer/kmui_layout jsonToObject
// 按 `prototypeName` 特判创建实例（AlarmWindow/EventWindow/TrendChart/BarChart/
// PieChart/XYChart/CustomCharts）。

/**
 * KF 特殊节点 IR（`prototypeName` 判别的图表/告警/自定义窗口）。
 *
 * 已知节点结构（参考工程 42 例，/tmp/kf_ref/1.0.0.1）：
 * - **CustomCharts**（objectType=1，容器型）：name/几何在
 *   pageProperty{name,pagePos,pageSize}；objects[0] 是 **JSON 字符串**
 *   （echart 配置 customChartsType/option/title/...）；modlePrototype
 *   {name,guid,version,type}；region 顶层。IR 的几何由 inspect 从
 *   pageProperty 提取映射到 BaseControlIR 的 x/y/width/height。
 * - **图表型**（XYChart/TrendChart/BarChart/PieChart）：几何在顶层
 *   leftTopPt/width/height；title 是对象（{show,text,textStyle,...}）非字符串；
 *   areas/chartComponentType 顶层。
 * - **AlarmWindow**：几何在顶层；alarmWindowType/columns/dateSource/
 *   dateType/evalconfig/filterDataSource/filterMsg/historyNumber/list/linkMng
 *   等顶层。
 *
 * 复杂配置（CustomCharts.objects JSON 字符串、AlarmWindow.columns/evalconfig、
 * 图表 areas/option/title）**不建模**：`.passthrough()` 宽容保留全部未知字段
 * 原样，由编译/patch/inspect/渲染透传。IR 判别 `type` 固定为字面量
 * "prototype"（保证 discriminatedUnion 可用），`prototypeName` 细分节点种类。
 */
export const SpecialNodeIR = BaseControlIR.extend({
  type: z.literal("prototype"),
  /** KF `prototypeName`：CustomCharts / AlarmWindow / EventWindow / TrendChart / BarChart / PieChart / XYChart 等。 */
  prototypeName: z.string(),
  /** 图表标题（图表型顶层 `title` 配置对象；CustomCharts 在 pageProperty.title）。 */
  title: z.unknown().optional(),
  /** 图表区域配置（图表型 `areas`，复杂配置宽容保留）。 */
  areas: z.unknown().optional(),
  /** 图表组件类型枚举（图表型 `chartComponentType`，宽容保留）。 */
  chartComponentType: z.unknown().optional(),
  /** 注释（顶层 `comment`）。 */
  comment: z.string().optional(),
}).passthrough();
export type SpecialNodeIR = z.infer<typeof SpecialNodeIR>;

export const ControlIR = z.discriminatedUnion("type", [
  TextControlIR,
  ButtonControlIR,
  InputNumberControlIR,
  SwitchControlIR,
  CheckboxControlIR,
  RadioControlIR,
  SelectControlIR,
  ImageControlIR,
  TabsControlIR,
  TableControlIR,
  RichTextControlIR,
  SpacerControlIR,
  LegacyRadioControlIR,
  LegacyCheckboxControlIR,
  ComboboxControlIR,
  ScaleControlIR,
  ListControlIR,
  TreeviewControlIR,
  WebContainerControlIR,
  GanttControlIR,
  FactoryCalendarControlIR,
  InputControlIR,
  CascaderControlIR,
  DatetimePickerControlIR,
  DropdownControlIR,
  NavmenuControlIR,
  TreeControlIR,
  UploadControlIR,
  TransferControlIR,
  TagControlIR,
  TimelineControlIR,
  StepsControlIR,
  EasyuiControlIR,
  LayoutContainerIR,
  SpecialNodeIR,
]);
export type ControlIR = z.infer<typeof ControlIR>;

/** KF `uiModelType` -> IR control type (from `kmui_glabolvar.js` + SDB pages). */
export const CONTROL_TYPE_BY_UIMODEL_TYPE: Readonly<Record<number, string>> = {
  0: "radiolegacy", // RADIO（旧）
  1: "checkboxlegacy", // CHECKBOX（旧）
  3: "combobox", // COMBOBOX
  6: "text", // TEXTBOX
  7: "richtext", // RICHTEXT
  8: "scale", // SCALE
  9: "list", // LIST
  11: "treeview", // TREEVIEW
  12: "webcontainer", // WEBCONTAINER
  13: "spacer", // HORIZONTALSPACER
  14: "spacer", // VERTICALSPACER
  30: "gantt", // GANTT
  31: "table", // TABLE
  32: "tree", // TREE
  33: "dropdown", // DROPDOWN
  34: "navmenu", // NAVMENU
  35: "button", // BUTTON (element-style, page JSON verified)
  36: "radio", // ELEMENTRADIO
  37: "checkbox", // ELEMENTCHECHECKBOX
  38: "input", // INPUT
  39: "cascader", // CASCADER
  40: "datetimepicker", // DATETIMEPICKER
  41: "image", // IMAGE
  43: "factorycalendar", // FACTORYCALENDAR
  44: "select", // SELECT
  45: "upload", // UPLOAD
  46: "transfer", // TRANSFER
  47: "tabs", // TABS
  48: "switch", // SWITCH
  49: "inputnumber", // INPUTNUMBER
  50: "tag", // TAG
  51: "timeline", // TIMELINE
  52: "steps", // STEPS
};

export const VariableIR = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  dataType: z.number().int(),
  comment: z.string().optional(),
  defaultValue: z.unknown().optional(),
});
export type VariableIR = z.infer<typeof VariableIR>;

export const ScriptIR = z.object({
  id: z.string().min(1),
  kind: z.enum(["global", "page", "control"]),
  scope: z.string().optional(),
  text: z.string(),
});
export type ScriptIR = z.infer<typeof ScriptIR>;

export const ResourceReferenceIR = z.object({
  id: z.string().min(1),
  kind: z.enum(["image", "font", "dataSource", "page", "variable"]),
  target: z.string().min(1),
});
export type ResourceReferenceIR = z.infer<typeof ResourceReferenceIR>;

export const PageIR = z.object({
  id: z.string().min(1),
  name: z.string(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
  controls: z.array(ControlIR),
  variables: z.array(VariableIR).optional(),
  scripts: z.array(ScriptIR).optional(),
});
export type PageIR = z.infer<typeof PageIR>;

export const ClientProjectIR = z.object({
  schema: z.literal("kf-client-project-ir/v1"),
  id: z.string().min(1),
  name: z.string(),
  version: z.string().optional(),
  pages: z.array(PageIR),
  variables: z.array(VariableIR).optional(),
  scripts: z.array(ScriptIR).optional(),
  resources: z.array(ResourceReferenceIR).optional(),
});
export type ClientProjectIR = z.infer<typeof ClientProjectIR>;
export const ClientProjectIRSchema = ClientProjectIR;
