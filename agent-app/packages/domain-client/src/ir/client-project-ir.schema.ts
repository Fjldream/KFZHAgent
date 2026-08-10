import { z } from "zod";

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
