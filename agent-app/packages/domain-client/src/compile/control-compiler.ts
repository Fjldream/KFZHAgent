import baseFields from "../templates/base-fields.json" with { type: "json" };
import buttonTemplate from "../templates/control-templates/button.json" with { type: "json" };
import checkboxTemplate from "../templates/control-templates/checkbox.json" with { type: "json" };
import imageTemplate from "../templates/control-templates/image.json" with { type: "json" };
import inputNumberTemplate from "../templates/control-templates/inputnumber.json" with { type: "json" };
import radioTemplate from "../templates/control-templates/radio.json" with { type: "json" };
import richtextTemplate from "../templates/control-templates/richtext.json" with { type: "json" };
import selectTemplate from "../templates/control-templates/select.json" with { type: "json" };
import spacerTemplate from "../templates/control-templates/spacer.json" with { type: "json" };
import switchTemplate from "../templates/control-templates/switch.json" with { type: "json" };
import tableTemplate from "../templates/control-templates/table.json" with { type: "json" };
import tabsTemplate from "../templates/control-templates/tabs.json" with { type: "json" };
import textTemplate from "../templates/control-templates/text.json" with { type: "json" };
import cascaderTemplate from "../templates/control-templates/cascader.json" with { type: "json" };
import checkboxLegacyTemplate from "../templates/control-templates/checkboxlegacy.json" with { type: "json" };
import comboboxTemplate from "../templates/control-templates/combobox.json" with { type: "json" };
import datetimePickerTemplate from "../templates/control-templates/datetimepicker.json" with { type: "json" };
import dropdownTemplate from "../templates/control-templates/dropdown.json" with { type: "json" };
import factoryCalendarTemplate from "../templates/control-templates/factorycalendar.json" with { type: "json" };
import ganttTemplate from "../templates/control-templates/gantt.json" with { type: "json" };
import inputTemplate from "../templates/control-templates/input.json" with { type: "json" };
import listTemplate from "../templates/control-templates/list.json" with { type: "json" };
import navmenuTemplate from "../templates/control-templates/navmenu.json" with { type: "json" };
import radioLegacyTemplate from "../templates/control-templates/radiolegacy.json" with { type: "json" };
import scaleTemplate from "../templates/control-templates/scale.json" with { type: "json" };
import stepsTemplate from "../templates/control-templates/steps.json" with { type: "json" };
import tagTemplate from "../templates/control-templates/tag.json" with { type: "json" };
import timelineTemplate from "../templates/control-templates/timeline.json" with { type: "json" };
import transferTemplate from "../templates/control-templates/transfer.json" with { type: "json" };
import treeTemplate from "../templates/control-templates/tree.json" with { type: "json" };
import treeviewTemplate from "../templates/control-templates/treeview.json" with { type: "json" };
import uploadTemplate from "../templates/control-templates/upload.json" with { type: "json" };
import webContainerTemplate from "../templates/control-templates/webcontainer.json" with { type: "json" };
import easyuiBaseTemplate from "../templates/control-templates/easyui-base.json" with { type: "json" };
import easyuiCalendarTemplate from "../templates/control-templates/easyui-calendar.json" with { type: "json" };
import easyuiComboboxTemplate from "../templates/control-templates/easyui-combobox.json" with { type: "json" };
import easyuiCombotreeTemplate from "../templates/control-templates/easyui-combotree.json" with { type: "json" };
import easyuiDatagridTemplate from "../templates/control-templates/easyui-datagrid.json" with { type: "json" };
import easyuiDatetimeboxTemplate from "../templates/control-templates/easyui-datetimebox.json" with { type: "json" };
import easyuiDateboxTemplate from "../templates/control-templates/easyui-datebox.json" with { type: "json" };
import easyuiDialogTemplate from "../templates/control-templates/easyui-dialog.json" with { type: "json" };
import easyuiFileboxTemplate from "../templates/control-templates/easyui-filebox.json" with { type: "json" };
import easyuiImagecarouselTemplate from "../templates/control-templates/easyui-imagecarousel.json" with { type: "json" };
import easyuiLinkbuttonTemplate from "../templates/control-templates/easyui-linkbutton.json" with { type: "json" };
import easyuiMenubuttonTemplate from "../templates/control-templates/easyui-menubutton.json" with { type: "json" };
import easyuiNumberboxTemplate from "../templates/control-templates/easyui-numberbox.json" with { type: "json" };
import easyuiNumberspinnerTemplate from "../templates/control-templates/easyui-numberspinner.json" with { type: "json" };
import easyuiPaginationTemplate from "../templates/control-templates/easyui-pagination.json" with { type: "json" };
import easyuiProgressbarTemplate from "../templates/control-templates/easyui-progressbar.json" with { type: "json" };
import easyuiPropertygridTemplate from "../templates/control-templates/easyui-propertygrid.json" with { type: "json" };
import easyuiSearchboxTemplate from "../templates/control-templates/easyui-searchbox.json" with { type: "json" };
import easyuiSidemenuTemplate from "../templates/control-templates/easyui-sidemenu.json" with { type: "json" };
import easyuiSliderTemplate from "../templates/control-templates/easyui-slider.json" with { type: "json" };
import easyuiSpinnerTemplate from "../templates/control-templates/easyui-spinner.json" with { type: "json" };
import easyuiSwitchbuttonTemplate from "../templates/control-templates/easyui-switchbutton.json" with { type: "json" };
import easyuiTagboxTemplate from "../templates/control-templates/easyui-tagbox.json" with { type: "json" };
import easyuiTextboxTemplate from "../templates/control-templates/easyui-textbox.json" with { type: "json" };
import easyuiTimespinnerTemplate from "../templates/control-templates/easyui-timespinner.json" with { type: "json" };
import easyuiTooltipTemplate from "../templates/control-templates/easyui-tooltip.json" with { type: "json" };
import easyuiTreeTemplate from "../templates/control-templates/easyui-tree.json" with { type: "json" };
import easyuiTreegridTemplate from "../templates/control-templates/easyui-treegrid.json" with { type: "json" };
import easyuiValidateboxTemplate from "../templates/control-templates/easyui-validatebox.json" with { type: "json" };
import easyuiWindowTemplate from "../templates/control-templates/easyui-window.json" with { type: "json" };
import layoutTemplate from "../templates/control-templates/layout.json" with { type: "json" };
import prototypeBaseTemplate from "../templates/control-templates/prototype-base.json" with { type: "json" };
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { nativeStyleStorage } from "./native-presentation.js";
// end
import type { ControlIR, RestrictedAction, EasyuiControlIR, LayoutContainerIR } from "../ir/client-project-ir.js";
import type { ThemeSpec } from "@kf/contracts";
import {
  CompiledEventBindingSchema,
  CompiledNativeActionSchema,
  CompiledScriptModuleSchema,
  type CompiledEventBinding,
  type CompiledNativeAction,
  type CompiledScriptModule,
} from "@kf/contracts";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { isDeepStrictEqual, types as utilTypes } from "node:util";
import {
  EASYUI_ALL_FIELDS,
  EASYUI_PROTO_FIELDS,
  easyuiTypeName,
} from "../ir/easyui-types.js";
import { mergeControlTemplate, type TemplateJson } from "../templates/merge-template.js";
import { deriveGuid, type BuildSeed } from "./guid-factory.js";
import { assertStyleCompilationAccepted, compileControlStyle } from "../style/style-engine.js";
import { KF36_RUNTIME_PROFILE } from "../style/runtime-profile.js";
import { mergeManagedStyleData } from "../style/style-data-merge.js";

/**
 * 逐控件编译（简要步骤 5 + 步骤 6）。
 *
 * 每个 KF 控件对象按以下方式构建：
 *
 *   result = mergeControlTemplate(mergeControlTemplate(baseFields, template), overrides)
 *          = { ...baseFields, ...template, ...overrides }
 *
 * - `baseFields` 和各类型的 `template` 来自 `src/templates/` 下已审查的模板；编译器绝不会虚构字段。
 * - `overrides` 只包含 schema 批准的运行时值：KF `name`、派生的 KF GUID、几何信息以及类型特定的语义值（文本 / 精度 / 受限 action）。
 * - 绝不复制模型提供的原始字段：外来 OBJECT 字段会被忽略（以模板为准），外来 STRING 字段则以 MODEL_OUTPUT_INVALID 拒绝，因为原始字符串可以承载任意 JavaScript 注入（简要步骤 6）。
 */

export const MODEL_OUTPUT_INVALID = "MODEL_OUTPUT_INVALID";

export class ModelOutputInvalidError extends Error {
  constructor(detail: string, options?: ErrorOptions) {
    super(`${MODEL_OUTPUT_INVALID}: ${detail}`, options);
    this.name = "ModelOutputInvalidError";
  }
}

/** Lookups the compiler needs while resolving semantic references to KF values. */
export interface CompileContext {
  /** KF group GUID shared by page-manager entries and the variable group file. */
  variableGroupGuid: string;
  /** KF GUID of the page group (pageGroupManager.Groups.id / Pages[].groupId). */
  pageGroupGuid: string;
  /** Resolves a `navigate.pageId` SEMANTIC PAGE ID (page name) to its KF GUID. */
  resolvePageGuid(semanticPageName: string): string;
  /** Validates a `setVariable.variableId` SEMANTIC VARIABLE ID (variable name). */
  resolveVariableName(semanticVariableId: string): string;
}

export interface CompiledControlScriptSerialization {
  readonly ownerInstanceName: string;
  readonly capabilityId: string;
  readonly bindings: readonly CompiledEventBinding[];
  readonly modules: readonly CompiledScriptModule[];
  /** Present only at the verified creative-materialization boundary. */
  readonly actions?: readonly CompiledNativeAction[];
}

interface ExpectedCompiledControlScriptTarget {
  readonly ownerInstanceName: string;
  readonly capabilityId: string;
}

/**
 * Serialized restricted-action command placed in `linkMng.linkList`.
 * `openDialog` is an encoded action form supported by the serializer; the
 * current IR schema only produces `navigatePage` and `setVariable`.
 */
export type CompiledAction = {
  action?: "setVariable" | "openDialog";
  pageId?: string;
  variableId?: string;
  value?: string | number | boolean;
  linkId?: number;
  enable?: boolean;
  name?: string;
  script?: string;
};

const BASE_FIELDS: TemplateJson = baseFields;

const CONTROL_TEMPLATES: Readonly<Record<string, TemplateJson>> = {
  text: textTemplate,
  button: buttonTemplate,
  inputnumber: inputNumberTemplate,
  switch: switchTemplate,
  checkbox: checkboxTemplate,
  radio: radioTemplate,
  select: selectTemplate,
  image: imageTemplate,
  tabs: tabsTemplate,
  table: tableTemplate,
  richtext: richtextTemplate,
  spacer: spacerTemplate,
  radiolegacy: radioLegacyTemplate,
  checkboxlegacy: checkboxLegacyTemplate,
  combobox: comboboxTemplate,
  scale: scaleTemplate,
  list: listTemplate,
  treeview: treeviewTemplate,
  webcontainer: webContainerTemplate,
  gantt: ganttTemplate,
  factorycalendar: factoryCalendarTemplate,
  input: inputTemplate,
  cascader: cascaderTemplate,
  datetimepicker: datetimePickerTemplate,
  dropdown: dropdownTemplate,
  navmenu: navmenuTemplate,
  tree: treeTemplate,
  upload: uploadTemplate,
  transfer: transferTemplate,
  tag: tagTemplate,
  timeline: timelineTemplate,
  steps: stepsTemplate,
  easyui: easyuiBaseTemplate,
  layout: layoutTemplate,
  prototype: prototypeBaseTemplate,
};

/**
 * easyui 控件模板按 proto（KF uiExtendType）注册：`easyui-base` 提供所有
 * easyui 控件共享的静态字段（type/uiModelType/objectType/version/linkMng/...），
 * 每个 proto 模板只含该控件特有的默认 options（geometry 默认值、白名单字段
 * 的 easyui 默认值）。模板只含静态默认值，data/columns 等复杂内容不建模
 * （走 configureData 脚本）。
 */
const EASYUI_TEMPLATES: Readonly<Record<number, TemplateJson>> = {
  0: easyuiComboboxTemplate,
  1: easyuiDatagridTemplate,
  2: easyuiLinkbuttonTemplate,
  3: easyuiNumberboxTemplate,
  4: easyuiNumberspinnerTemplate,
  5: easyuiPropertygridTemplate,
  6: easyuiSearchboxTemplate,
  7: easyuiSliderTemplate,
  8: easyuiSpinnerTemplate,
  9: easyuiTextboxTemplate,
  10: easyuiTimespinnerTemplate,
  11: easyuiDateboxTemplate,
  12: easyuiDialogTemplate,
  13: easyuiFileboxTemplate,
  14: easyuiMenubuttonTemplate,
  15: easyuiProgressbarTemplate,
  16: easyuiTooltipTemplate,
  17: easyuiTreeTemplate,
  18: easyuiTreegridTemplate,
  19: easyuiWindowTemplate,
  20: easyuiCalendarTemplate,
  21: easyuiDatetimeboxTemplate,
  22: easyuiPaginationTemplate,
  24: easyuiCombotreeTemplate,
  25: easyuiTagboxTemplate,
  26: easyuiSidemenuTemplate,
  27: easyuiSwitchbuttonTemplate,
  28: easyuiValidateboxTemplate,
  29: easyuiImagecarouselTemplate,
};

/** Returns the reviewed EasyUI proto inventory without exposing templates. */
export function supportedEasyuiProtos(): readonly number[] {
  return Object.freeze(Object.keys(EASYUI_TEMPLATES).map(Number).sort((a, b) => a - b));
}

/** IR fields every control variant carries (everything the schema defines). */
const COMMON_IR_FIELDS = new Set(["id", "type", "x", "y", "width", "height", "style"]);
const TYPE_IR_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  text: new Set(["text"]),
  button: new Set(["text", "action"]),
  inputnumber: new Set(["variableId", "decimals"]),
  switch: new Set(["value", "activeText", "inactiveText"]),
  checkbox: new Set(["label", "checked"]),
  radio: new Set(["options", "value"]),
  select: new Set(["options", "value", "multiple", "placeholder"]),
  image: new Set(["src", "fit", "alt"]),
  tabs: new Set(["tabs", "activeId"]),
  table: new Set([]),
  richtext: new Set(["text"]),
  spacer: new Set(["axis"]),
  radiolegacy: new Set(["options", "value"]),
  checkboxlegacy: new Set(["label", "checked"]),
  combobox: new Set(["options", "value", "editable"]),
  scale: new Set(["min", "max", "value", "step"]),
  list: new Set(["options"]),
  treeview: new Set(["showCheckbox"]),
  webcontainer: new Set(["url", "scrollbar"]),
  gantt: new Set([]),
  factorycalendar: new Set(["value", "dateFormat"]),
  input: new Set(["value", "placeholder", "inputType", "disabled", "clearable", "maxlength"]),
  cascader: new Set(["options", "placeholder", "filterable", "clearable"]),
  datetimepicker: new Set(["value", "pickerType", "placeholder", "format"]),
  dropdown: new Set(["options", "text", "splitButton"]),
  navmenu: new Set(["mode", "options"]),
  tree: new Set(["showCheckbox", "indent", "expandOnClickNode"]),
  upload: new Set(["action", "accept", "multiple"]),
  transfer: new Set(["options", "titles"]),
  tag: new Set(["effect", "closable", "hit"]),
  timeline: new Set(["items"]),
  steps: new Set(["active", "direction", "processStatus"]),
  easyui: new Set([...EASYUI_ALL_FIELDS, "proto", "uiExtendType"]),
  layout: new Set(["layoutType", "children", "panels"]),
};

/**
 * Returns the only control types with a REVIEWED template. Any other IR
 * control type is rejected (MODEL_OUTPUT_INVALID) because the compiler must
 * not fabricate a KF field layout for it.
 */
export function supportedControlTypes(): readonly string[] {
  return Object.freeze(Object.keys(CONTROL_TEMPLATES).sort());
}

export function hasReviewedTemplate(controlType: string): boolean {
  return CONTROL_TEMPLATES[controlType] !== undefined;
}

/**
 * Rejects foreign string fields on a control. The IR schema only knows
 * COMMON_IR_FIELDS + the type-specific fields; a string in any other field is
 * the injection vehicle for raw JavaScript / arbitrary model strings.
 */
export function assertNoStringForeignFields(
  control: Record<string, unknown>,
  controlType: string,
): void {
  const known = new Set([...COMMON_IR_FIELDS, ...(TYPE_IR_FIELDS[controlType] ?? [])]);
  for (const [key, value] of Object.entries(control)) {
    if (!known.has(key) && typeof value === "string") {
      throw new ModelOutputInvalidError(
        `control "${String(control["id"])}" carries a raw string field "${key}" ` +
          "(raw JavaScript / arbitrary model strings are rejected)",
      );
    }
  }
}

/**
 * Compiles one IR control into its full KF control object using the reviewed
 * templates and the single merge rule from merge-template.ts.
 */
export function compileControl(
  build: BuildSeed,
  control: ControlIR,
  ctx: CompileContext,
  scripts?: CompiledControlScriptSerialization,
): TemplateJson {
  let compiled: TemplateJson;
  if (control.type === "easyui") {
    compiled = compileEasyuiControl(build, control);
  } else if (control.type === "layout") {
    compiled = compileLayoutControl(build, control);
  } else if (control.type === "prototype") {
    compiled = compileSpecialNode(build, control);
  } else {
    const template = CONTROL_TEMPLATES[control.type];
    if (template === undefined) {
      throw new ModelOutputInvalidError(
        `control type "${control.type}" has no reviewed template ` +
          `(supported: ${supportedControlTypes().join(", ")})`,
      );
    }
    const merged = mergeControlTemplate(BASE_FIELDS, template);
    compiled = mergeControlTemplate(merged, applySchemaOverrides(build, control, ctx));
  }
  const styled = applyControlStyle(normalizeNativeSizePolicy(compiled), control);
  return scripts === undefined ? styled : serializeReviewedNativeInteractions(styled, scripts, {
    ownerInstanceName: control.id,
    capabilityId: capabilityIdForControl(control),
  });
}

function safeCloneScriptData(
  value: unknown,
  label: string,
  depth = 0,
  seen = new WeakSet<object>(),
  budget = { nodes: 0 },
): unknown {
  budget.nodes += 1;
  if (budget.nodes > 50_000) throw new ModelOutputInvalidError(`${label} exceeds 50000 nodes`);
  if (depth > 64) throw new ModelOutputInvalidError(`${label} exceeds depth 64`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new ModelOutputInvalidError(`${label} contains a non-finite number`);
    return value;
  }
  if (typeof value !== "object" || utilTypes.isProxy(value)) throw new ModelOutputInvalidError(`${label} must be descriptor-safe data`);
  if (seen.has(value)) throw new ModelOutputInvalidError(`${label} contains a cycle`);
  seen.add(value);
  let prototype: object | null;
  let keys: readonly PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch (error) {
    throw new ModelOutputInvalidError(`${label} descriptor inspection failed`, error instanceof Error ? { cause: error } : undefined);
  }
  if (keys.some((key) => typeof key !== "string" || key === "__proto__" || key === "prototype" || key === "constructor")) {
    throw new ModelOutputInvalidError(`${label} contains a reserved key`);
  }
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype || keys.filter((key) => key !== "length").length !== value.length) throw new ModelOutputInvalidError(`${label} must be a dense plain array`);
    const result = Array.from({ length: value.length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) throw new ModelOutputInvalidError(`${label} requires array data properties`);
      return safeCloneScriptData(descriptor.value, `${label}.${index}`, depth + 1, seen, budget);
    });
    seen.delete(value);
    return result;
  }
  if (prototype !== Object.prototype && prototype !== null) throw new ModelOutputInvalidError(`${label} must be a plain object`);
  const result: Record<string, unknown> = {};
  for (const key of keys) {
    const descriptor = descriptors[String(key)];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) throw new ModelOutputInvalidError(`${label} requires object data properties`);
    Object.defineProperty(result, key, {
      value: safeCloneScriptData(descriptor.value, `${label}.${String(key)}`, depth + 1, seen, budget),
      enumerable: true, configurable: true, writable: true,
    });
  }
  seen.delete(value);
  return result;
}

function asCompilerRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function appendScript(existing: string, additions: readonly string[]): string {
  let result = existing;
  for (const source of additions) {
    if (result.length > 0) result += "\n;\n";
    result += source;
  }
  return result;
}

const COMPILED_EVENT_MARKER = "// kf-compiled-event/v1 ";

function serializedCompiledModule(module: CompiledScriptModule, binding?: CompiledEventBinding): string {
  const payload = {
    schema: "kf-compiled-event/v1",
    moduleId: module.id,
    sourceScriptId: module.sourceScriptId,
    bodySha256: module.sourceHash,
    bodyByteLength: Buffer.byteLength(module.source, "utf8"),
    ownerInstanceName: module.ownerInstanceName,
    placement: module.placement,
    kfEvent: binding?.kfEvent ?? null,
    linkId: binding?.linkId ?? null,
    phase: binding?.phase ?? null,
    instanceReferences: [...module.instanceReferences].sort((left, right) => left.semanticId.localeCompare(right.semanticId, "en-US")),
    pageReferences: [...module.pageReferences].sort((left, right) => left.semanticId.localeCompare(right.semanticId, "en-US")),
  };
  return `${COMPILED_EVENT_MARKER}${Buffer.from(JSON.stringify(payload), "utf8").toString("base64url")}\n${module.source}`;
}

const COMPILED_ACTION_MARKER_SCHEMA = "kf-compiled-action/v1";
const COMPILED_VISIBILITY_ACTION_MARKER_SCHEMA = "kf-compiled-action/v3";
const COMPILED_STATE_ACTION_MARKER_SCHEMA = "kf-compiled-state/v1";
const COMPILED_FEEDBACK_ACTION_MARKER_SCHEMA = "kf-compiled-feedback/v1";

interface CompiledNavigateActionMarker {
  schema: typeof COMPILED_ACTION_MARKER_SCHEMA;
  actionId: string;
  sourceActionId: string;
  ownerInstanceName: string;
  kfEvent: string;
  linkId: number | null;
  phase: "event" | "after-event";
}

interface CompiledVisibilityActionMarker {
  schema: typeof COMPILED_VISIBILITY_ACTION_MARKER_SCHEMA;
  actionId: string;
  sourceActionId: string;
  ownerInstanceName: string;
  ownerSemanticControlId: string;
  targetSemanticControlId: string;
  targetInstanceName: string;
  operation: "open-overlay" | "close-overlay";
  visible: boolean;
  kfEvent: string;
  linkId: number | null;
  phase: "event" | "after-event";
}

interface CompiledStateActionMarker {
  schema: typeof COMPILED_STATE_ACTION_MARKER_SCHEMA;
  actionId: string;
  sourceActionId: string;
  ownerInstanceName: string;
  stateId: string;
  variableName: string;
  value: string | number | boolean | null;
  kfEvent: string;
  linkId: number | null;
  phase: "event" | "after-event";
}

interface CompiledFeedbackActionMarker {
  schema: typeof COMPILED_FEEDBACK_ACTION_MARKER_SCHEMA;
  actionId: string;
  sourceActionId: string;
  ownerInstanceName: string;
  message: string;
  level: "success" | "info" | "warning" | "error";
  scriptSha256: string;
  scriptByteLength: number;
  kfEvent: string;
  linkId: number | null;
  phase: "event" | "after-event";
}

type CompiledActionMarker = CompiledNavigateActionMarker | CompiledVisibilityActionMarker | CompiledStateActionMarker | CompiledFeedbackActionMarker;

function parseCompiledActionMarker(input: unknown): CompiledActionMarker | undefined {
  if (input === undefined) return undefined;
  const record = input !== null && typeof input === "object" && !Array.isArray(input)
    ? input as Record<string, unknown>
    : undefined;
  const schema = record?.["schema"];
  const expected = schema === COMPILED_VISIBILITY_ACTION_MARKER_SCHEMA
    ? ["actionId", "kfEvent", "linkId", "operation", "ownerInstanceName", "ownerSemanticControlId", "phase", "schema", "sourceActionId", "targetInstanceName", "targetSemanticControlId", "visible"]
    : schema === COMPILED_STATE_ACTION_MARKER_SCHEMA
      ? ["actionId", "kfEvent", "linkId", "ownerInstanceName", "phase", "schema", "sourceActionId", "stateId", "value", "variableName"]
      : schema === COMPILED_FEEDBACK_ACTION_MARKER_SCHEMA
        ? ["actionId", "kfEvent", "level", "linkId", "message", "ownerInstanceName", "phase", "schema", "scriptByteLength", "scriptSha256", "sourceActionId"]
        : ["actionId", "kfEvent", "linkId", "ownerInstanceName", "phase", "schema", "sourceActionId"];
  if (record === undefined || Object.keys(record).sort().join("\0") !== expected.join("\0")
    || ![COMPILED_ACTION_MARKER_SCHEMA, COMPILED_VISIBILITY_ACTION_MARKER_SCHEMA,
      COMPILED_STATE_ACTION_MARKER_SCHEMA, COMPILED_FEEDBACK_ACTION_MARKER_SCHEMA].includes(String(schema))
    || typeof record["actionId"] !== "string" || typeof record["sourceActionId"] !== "string"
    || typeof record["ownerInstanceName"] !== "string" || typeof record["kfEvent"] !== "string"
    || (record["linkId"] !== null && !Number.isInteger(record["linkId"]))
    || (record["phase"] !== "event" && record["phase"] !== "after-event")) {
    throw new ModelOutputInvalidError("compiler-owned action marker is malformed");
  }
  if (schema === COMPILED_VISIBILITY_ACTION_MARKER_SCHEMA
    && (typeof record["ownerSemanticControlId"] !== "string" || typeof record["targetSemanticControlId"] !== "string" || typeof record["targetInstanceName"] !== "string"
      || (record["operation"] !== "open-overlay" && record["operation"] !== "close-overlay")
      || typeof record["visible"] !== "boolean"
      || record["visible"] !== (record["operation"] === "open-overlay"))) {
    throw new ModelOutputInvalidError("compiler-owned visibility action marker is malformed");
  }
  if (schema === COMPILED_STATE_ACTION_MARKER_SCHEMA
    && (typeof record["stateId"] !== "string" || typeof record["variableName"] !== "string"
      || !/^\$kf_[a-z0-9_]+_[0-9a-f]{12}$/.test(record["variableName"])
      || !Object.hasOwn(record, "value")
      || !(record["value"] === null || ["string", "number", "boolean"].includes(typeof record["value"])))) {
    throw new ModelOutputInvalidError("compiler-owned state action marker is malformed");
  }
  if (schema === COMPILED_FEEDBACK_ACTION_MARKER_SCHEMA
    && (typeof record["message"] !== "string" || !["success", "info", "warning", "error"].includes(String(record["level"]))
      || typeof record["scriptSha256"] !== "string" || !/^[0-9a-f]{64}$/.test(record["scriptSha256"])
      || !Number.isInteger(record["scriptByteLength"]) || Number(record["scriptByteLength"]) < 1 || Number(record["scriptByteLength"]) > 32_000)) {
    throw new ModelOutputInvalidError("compiler-owned feedback action marker is malformed");
  }
  return record as unknown as CompiledActionMarker;
}

function visibilityActionModule(marker: CompiledVisibilityActionMarker): CompiledScriptModule {
  const source = `${marker.targetInstanceName}.setVisible(${String(marker.visible)});\n`;
  return CompiledScriptModuleSchema.parse({
    id: `kf$script:action-${createHash("sha256").update(marker.actionId, "utf8").digest("hex").slice(0, 24)}`,
    sourceScriptId: marker.sourceActionId,
    placement: "event",
    ownerInstanceName: marker.ownerInstanceName,
    instanceReferences: [
      { semanticId: marker.ownerSemanticControlId, instanceName: marker.ownerInstanceName },
      { semanticId: marker.targetSemanticControlId, instanceName: marker.targetInstanceName },
    ],
    pageReferences: [],
    source,
    sourceHash: createHash("sha256").update(source, "utf8").digest("hex"),
  });
}

function serializedVisibilityActionScript(marker: CompiledVisibilityActionMarker): string {
  return serializedCompiledModule(visibilityActionModule(marker), {
    id: `kf$binding:${createHash("sha256").update(marker.actionId, "utf8").digest("hex").slice(0, 24)}`,
    ownerInstanceName: marker.ownerInstanceName,
    kfEvent: marker.kfEvent,
    ...(marker.linkId === null ? {} : { linkId: marker.linkId }),
    phase: marker.phase,
    scriptModuleIds: [],
    nativeActionIds: [marker.actionId],
  });
}

function serializedFeedbackActionScript(marker: CompiledFeedbackActionMarker): string {
  return `ShowMessage(${JSON.stringify({ message: marker.message, type: marker.level })});`;
}

function nativeActionScriptModule(action: CompiledNativeAction): CompiledScriptModule {
  let source: string;
  let instanceReferences: Array<{ semanticId: string; instanceName: string }> = [
    { semanticId: action.sourceActionId, instanceName: action.ownerInstanceName },
  ];
  let pageReferences: Array<{ semanticId: string; pageGuid: string }> = [];
  switch (action.kind) {
    case "navigate-page":
      source = `ShowPage(${JSON.stringify(action.targetPageName)},1);\n`;
      pageReferences = [{ semanticId: action.targetPageName, pageGuid: action.targetPageGuid }];
      break;
    case "set-state":
      source = `$Variable.${action.targetVariableName} = ${JSON.stringify(action.value)};\n`;
      break;
    case "show-feedback":
      source = `ShowMessage(${JSON.stringify({ message: action.message, type: action.level })});\n`;
      break;
    case "open-overlay":
    case "close-overlay": {
      const visible = action.kind === "open-overlay";
      const targets = visible ? action.targetControls : [...action.targetControls].reverse();
      source = targets.map((target) => `${target.instanceName}.setVisible(${String(visible)});`).join("\n") + "\n";
      instanceReferences = [
        { semanticId: action.ownerSemanticControlId, instanceName: action.ownerInstanceName },
        ...action.targetControls.map((target) => ({ semanticId: target.semanticControlId, instanceName: target.instanceName })),
      ].filter((reference, index, all) => all.findIndex((candidate) => candidate.semanticId === reference.semanticId) === index);
      break;
    }
    default:
      throw new ModelOutputInvalidError(`native action kind lacks reviewed KF 3.6 script serialization: ${action.kind}`);
  }
  return CompiledScriptModuleSchema.parse({
    id: `kf$script:action-${createHash("sha256").update(action.id, "utf8").digest("hex").slice(0, 24)}`,
    sourceScriptId: action.sourceActionId,
    placement: "event",
    ownerInstanceName: action.ownerInstanceName,
    instanceReferences,
    pageReferences,
    source,
    sourceHash: createHash("sha256").update(source, "utf8").digest("hex"),
  });
}

function isCanonicalShowMessageSource(source: string): boolean {
  if (!source.startsWith("ShowMessage(") || !source.endsWith(");")) return false;
  let payload: unknown;
  try { payload = JSON.parse(source.slice("ShowMessage(".length, -2)); } catch { return false; }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) return false;
  const record = payload as Record<string, unknown>;
  if (Object.keys(record).join("\0") !== "message\0type" || typeof record["message"] !== "string"
    || !["success", "info", "warning", "error"].includes(String(record["type"]))) return false;
  return source === `ShowMessage(${JSON.stringify({ message: record["message"], type: record["type"] })});`;
}

/**
 * Compiler modules are always an ASI-delimited tail. Validate every marker and
 * hash before removing that tail, leaving pre-existing product script bytes intact.
 */
function stripCompilerOwnedScriptTail(
  source: string,
  ownerInstanceName: string,
  expected?: { placement: "event" | "configure-data"; kfEvent: string | null; linkId: number | null },
): string {
  if (!hasCompilerOwnedScriptTail(source)) return source;
  const bytes = Buffer.from(source, "utf8");
  const marker = Buffer.from(COMPILED_EVENT_MARKER, "utf8");
  const first = firstCompilerTailMarker(bytes, marker);
  if (first < 0) return source;
  const legacyEnd = first === 0 ? 0 : first - 3;
  let cursor = first;
  while (cursor < bytes.length) {
    if (bytes.indexOf(marker, cursor) !== cursor) throw new ModelOutputInvalidError("compiler module boundary is malformed");
    const newline = bytes.indexOf(0x0a, cursor + marker.length);
    if (newline < 0) throw new ModelOutputInvalidError("compiler marker has no body newline");
    const encoded = bytes.subarray(cursor + marker.length, newline).toString("ascii");
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new ModelOutputInvalidError("compiler marker payload is not base64url");
    let metadata: Record<string, unknown>;
    try {
      metadata = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Record<string, unknown>;
    } catch (error) {
      throw new ModelOutputInvalidError("compiler marker payload is invalid JSON", { cause: error });
    }
    const expectedKeys = ["bodyByteLength", "bodySha256", "instanceReferences", "kfEvent", "linkId", "moduleId", "ownerInstanceName", "pageReferences", "phase", "placement", "schema", "sourceScriptId"];
    const bodyLength = metadata["bodyByteLength"];
    const bodyHash = metadata["bodySha256"];
    if (Object.keys(metadata).sort().join("\0") !== expectedKeys.join("\0")
      || metadata["schema"] !== "kf-compiled-event/v1" || typeof bodyLength !== "number"
      || !Number.isInteger(bodyLength) || bodyLength < 1 || bodyLength > 128_000
      || typeof bodyHash !== "string" || !/^[0-9a-f]{64}$/.test(bodyHash)
      || metadata["ownerInstanceName"] !== ownerInstanceName) {
      throw new ModelOutputInvalidError("compiler marker payload has an invalid owner/schema");
    }
    if (expected !== undefined && (metadata["placement"] !== expected.placement
      || metadata["kfEvent"] !== expected.kfEvent || metadata["linkId"] !== expected.linkId
      || (expected.placement === "configure-data"
        ? metadata["phase"] !== null
        : metadata["phase"] !== "event" && metadata["phase"] !== "after-event"))) {
      throw new ModelOutputInvalidError("compiler-owned event identity mismatch");
    }
    const bodyStart = newline + 1;
    const bodyEnd = bodyStart + bodyLength;
    if (bodyEnd > bytes.length) throw new ModelOutputInvalidError("compiled script bodyByteLength exceeds field bytes");
    const body = bytes.subarray(bodyStart, bodyEnd).toString("utf8");
    if (Buffer.byteLength(body, "utf8") !== bodyLength
      || createHash("sha256").update(body, "utf8").digest("hex") !== bodyHash) {
      throw new ModelOutputInvalidError("compiled script hash mismatch");
    }
    const parsedModule = CompiledScriptModuleSchema.safeParse({
      id: metadata["moduleId"], sourceScriptId: metadata["sourceScriptId"],
      placement: metadata["placement"], ownerInstanceName: metadata["ownerInstanceName"],
      instanceReferences: metadata["instanceReferences"], pageReferences: metadata["pageReferences"],
      source: body, sourceHash: metadata["bodySha256"],
    });
    if (!parsedModule.success) throw new ModelOutputInvalidError("compiler marker references are invalid", { cause: parsedModule.error });
    const canonical = {
      schema: "kf-compiled-event/v1", moduleId: parsedModule.data.id,
      sourceScriptId: parsedModule.data.sourceScriptId, bodySha256: parsedModule.data.sourceHash,
      bodyByteLength: Buffer.byteLength(body, "utf8"), ownerInstanceName: parsedModule.data.ownerInstanceName,
      placement: parsedModule.data.placement, kfEvent: metadata["kfEvent"], linkId: metadata["linkId"],
      phase: metadata["phase"],
      instanceReferences: [...parsedModule.data.instanceReferences].sort((left, right) => left.semanticId.localeCompare(right.semanticId, "en-US")),
      pageReferences: [...parsedModule.data.pageReferences].sort((left, right) => left.semanticId.localeCompare(right.semanticId, "en-US")),
    };
    if (Buffer.from(JSON.stringify(canonical), "utf8").toString("base64url") !== encoded) {
      throw new ModelOutputInvalidError("compiler marker payload is not canonical");
    }
    if (bodyEnd === bytes.length) cursor = bodyEnd;
    else if (bytes.subarray(bodyEnd, bodyEnd + 3).toString("utf8") === "\n;\n") cursor = bodyEnd + 3;
    else throw new ModelOutputInvalidError("compiler module boundary is malformed");
  }
  return bytes.subarray(0, legacyEnd).toString("utf8");
}

function hasCompilerOwnedScriptTail(source: string): boolean {
  return source.startsWith(COMPILED_EVENT_MARKER)
    || source.includes(`\n;\n${COMPILED_EVENT_MARKER}`);
}

function firstCompilerTailMarker(source: Buffer, marker: Buffer): number {
  let cursor = 0;
  for (;;) {
    const found = source.indexOf(marker, cursor);
    if (found < 0) return -1;
    if (found === 0 || (found >= 3 && source.subarray(found - 3, found).toString("utf8") === "\n;\n")) return found;
    cursor = found + marker.length;
  }
}

function serializeCompiledNativeAction(
  action: CompiledNativeAction,
  binding: CompiledEventBinding,
): Record<string, unknown> {
  if (action.ownerInstanceName !== binding.ownerInstanceName) {
    throw new ModelOutputInvalidError(`compiled action owner mismatch: ${action.id}`);
  }
  if (action.kind === "open-overlay" || action.kind === "close-overlay") {
    const marker: CompiledVisibilityActionMarker = {
      schema: COMPILED_VISIBILITY_ACTION_MARKER_SCHEMA,
      actionId: action.id,
      sourceActionId: action.sourceActionId,
      ownerInstanceName: action.ownerInstanceName,
      ownerSemanticControlId: action.ownerSemanticControlId,
      targetSemanticControlId: action.targetSemanticControlId,
      targetInstanceName: action.targetInstanceName,
      operation: action.kind,
      visible: action.kind === "open-overlay",
      kfEvent: binding.kfEvent,
      linkId: binding.linkId ?? null,
      phase: binding.phase,
    };
    return {
      ...(binding.linkId === undefined ? {} : { linkId: binding.linkId }),
      enable: true,
      script: serializedVisibilityActionScript(marker),
      name: binding.kfEvent,
      kfCompilerAction: marker,
    };
  }
  if (action.kind === "set-state") {
    const marker: CompiledStateActionMarker = {
      schema: COMPILED_STATE_ACTION_MARKER_SCHEMA,
      actionId: action.id,
      sourceActionId: action.sourceActionId,
      ownerInstanceName: action.ownerInstanceName,
      stateId: action.stateId,
      variableName: action.targetVariableName,
      value: action.value,
      kfEvent: binding.kfEvent,
      linkId: binding.linkId ?? null,
      phase: binding.phase,
    };
    return {
      action: "setVariable",
      variableId: action.targetVariableName,
      value: action.value,
      ...(binding.linkId === undefined ? {} : { linkId: binding.linkId }),
      enable: true,
      name: binding.kfEvent,
      kfCompilerAction: marker,
    };
  }
  if (action.kind === "show-feedback") {
    const source = `ShowMessage(${JSON.stringify({ message: action.message, type: action.level })});`;
    const marker: CompiledFeedbackActionMarker = {
      schema: COMPILED_FEEDBACK_ACTION_MARKER_SCHEMA,
      actionId: action.id,
      sourceActionId: action.sourceActionId,
      ownerInstanceName: action.ownerInstanceName,
      message: action.message,
      level: action.level,
      scriptSha256: createHash("sha256").update(source, "utf8").digest("hex"),
      scriptByteLength: Buffer.byteLength(source, "utf8"),
      kfEvent: binding.kfEvent,
      linkId: binding.linkId ?? null,
      phase: binding.phase,
    };
    return {
      ...(binding.linkId === undefined ? {} : { linkId: binding.linkId }),
      enable: true,
      script: serializedFeedbackActionScript(marker),
      name: binding.kfEvent,
      kfCompilerAction: marker,
    };
  }
  if (action.kind !== "navigate-page") {
    throw new ModelOutputInvalidError(`native action kind lacks reviewed KF 3.6 serialization: ${action.kind}`);
  }
  const marker: CompiledNavigateActionMarker = {
    schema: COMPILED_ACTION_MARKER_SCHEMA,
    actionId: action.id,
    sourceActionId: action.sourceActionId,
    ownerInstanceName: action.ownerInstanceName,
    kfEvent: binding.kfEvent,
    linkId: binding.linkId ?? null,
    phase: binding.phase,
  };
  return {
    action: "navigatePage",
    pageId: action.targetPageGuid,
    ...(binding.linkId === undefined ? {} : { linkId: binding.linkId }),
    enable: true,
    name: binding.kfEvent,
    kfCompilerAction: marker,
  };
}

/** Serializes compiler-owned script modules into the two reviewed KF 3.6 script fields. */
export function serializeReviewedNativeInteractions(
  compiledControl: TemplateJson,
  serialization: CompiledControlScriptSerialization,
  expectedTarget: ExpectedCompiledControlScriptTarget,
): TemplateJson {
  const clonedSerialization = safeCloneScriptData(serialization, "script serialization");
  const clonedExpected = safeCloneScriptData(expectedTarget, "expected script target");
  if (clonedSerialization === null || typeof clonedSerialization !== "object" || Array.isArray(clonedSerialization)
    || clonedExpected === null || typeof clonedExpected !== "object" || Array.isArray(clonedExpected)) {
    throw new ModelOutputInvalidError("script serialization and expected target must be plain objects");
  }
  const serializationRecord = clonedSerialization as Record<string, unknown>;
  const expectedRecord = clonedExpected as Record<string, unknown>;
  const expectedKeys = serializationRecord["actions"] === undefined
    ? ["bindings", "capabilityId", "modules", "ownerInstanceName"]
    : ["actions", "bindings", "capabilityId", "modules", "ownerInstanceName"];
  if (Object.keys(serializationRecord).sort().length !== expectedKeys.length
    || Object.keys(serializationRecord).sort().some((key, index) => key !== expectedKeys[index])
    || Object.keys(expectedRecord).sort().join("\0") !== "capabilityId\0ownerInstanceName") {
    throw new ModelOutputInvalidError("script serialization has invalid fields or prototype");
  }
  const ownerInstanceName = serializationRecord["ownerInstanceName"];
  const capabilityId = serializationRecord["capabilityId"];
  const rawModules = serializationRecord["modules"];
  const rawBindings = serializationRecord["bindings"];
  const rawActions = serializationRecord["actions"];
  const expectedOwner = expectedRecord["ownerInstanceName"];
  const expectedCapability = expectedRecord["capabilityId"];
  if (typeof ownerInstanceName !== "string" || typeof capabilityId !== "string" || !Array.isArray(rawModules) || !Array.isArray(rawBindings)
    || (rawActions !== undefined && !Array.isArray(rawActions))
    || typeof expectedOwner !== "string" || typeof expectedCapability !== "string") {
    throw new ModelOutputInvalidError("script serialization fields have invalid types");
  }
  if (ownerInstanceName !== expectedOwner) throw new ModelOutputInvalidError("script serialization owner does not match the authoritative control owner");
  if (capabilityId !== expectedCapability) throw new ModelOutputInvalidError("script serialization capability does not match the authoritative control capability");
  if (rawModules.length > 200 || rawBindings.length > 32 || (Array.isArray(rawActions) && rawActions.length > 32)) {
    throw new ModelOutputInvalidError("script serialization capacity exceeded");
  }
  const modules = rawModules.map((module, index) => {
    const parsed = CompiledScriptModuleSchema.safeParse(safeCloneScriptData(module, `modules.${index}`));
    if (!parsed.success) throw new ModelOutputInvalidError(`invalid compiled script module: ${parsed.error.issues[0]?.message}`, { cause: parsed.error });
    if (parsed.data.ownerInstanceName !== ownerInstanceName) throw new ModelOutputInvalidError(`compiled script owner mismatch: ${parsed.data.id}`);
    const hash = createHash("sha256").update(parsed.data.source, "utf8").digest("hex");
    if (hash !== parsed.data.sourceHash) throw new ModelOutputInvalidError(`compiled script hash mismatch: ${parsed.data.id}`);
    if (parsed.data.source.includes("kf-compiled-event/v1")) {
      throw new ModelOutputInvalidError(`compiled script contains reserved marker: ${parsed.data.id}`);
    }
    try {
      parse(parsed.data.source, { ecmaVersion: 2022 });
    } catch (error) {
      throw new ModelOutputInvalidError(`compiled script AST is invalid: ${parsed.data.id}`, { cause: error });
    }
    return parsed.data;
  });
  const moduleById = new Map(modules.map((module) => [module.id, module]));
  if (moduleById.size !== modules.length) throw new ModelOutputInvalidError("duplicate compiled script module id");
  const bindings = rawBindings.map((binding, index) => {
    const parsed = CompiledEventBindingSchema.safeParse(safeCloneScriptData(binding, `bindings.${index}`));
    if (!parsed.success) throw new ModelOutputInvalidError(`invalid compiled event binding: ${parsed.error.issues[0]?.message}`, { cause: parsed.error });
    if (parsed.data.ownerInstanceName !== ownerInstanceName) throw new ModelOutputInvalidError(`compiled binding owner mismatch: ${parsed.data.id}`);
    return parsed.data;
  });
  const actions = rawActions === undefined ? undefined : rawActions.map((action, index) => {
    const parsed = CompiledNativeActionSchema.safeParse(safeCloneScriptData(action, `actions.${index}`));
    if (!parsed.success) throw new ModelOutputInvalidError(`invalid compiled native action: ${parsed.error.issues[0]?.message}`, { cause: parsed.error });
    if (parsed.data.ownerInstanceName !== ownerInstanceName) throw new ModelOutputInvalidError(`compiled action owner mismatch: ${parsed.data.id}`);
    return parsed.data;
  });
  const actionById = new Map((actions ?? []).map((action) => [action.id, action]));
  if (actionById.size !== (actions?.length ?? 0)) throw new ModelOutputInvalidError("duplicate compiled native action id");
  if (actions === undefined && bindings.some((binding) => binding.nativeActionIds.length > 0)) {
    throw new ModelOutputInvalidError("compiled native action references require an authoritative actions table");
  }
  const referencedActions = new Set<string>();
  const bindingByActionId = new Map<string, CompiledEventBinding>();
  const referencedEventModules = new Set<string>();
  const phaseKeys = new Set<string>();
  for (const binding of bindings) {
    const key = `${binding.kfEvent}\u0000${binding.linkId ?? ""}\u0000${binding.phase}`;
    if (phaseKeys.has(key)) throw new ModelOutputInvalidError(`duplicate compiled event phase: ${binding.kfEvent}/${binding.phase}`);
    phaseKeys.add(key);
    for (const id of binding.scriptModuleIds) {
      const module = moduleById.get(id);
      if (module === undefined) throw new ModelOutputInvalidError(`missing compiled script module: ${id}`);
      if (module.placement !== "event") throw new ModelOutputInvalidError(`event binding references configureData module: ${id}`);
      if (referencedEventModules.has(id)) throw new ModelOutputInvalidError(`compiled event module has multiple bindings: ${id}`);
      referencedEventModules.add(id);
    }
    if (actions !== undefined) for (const id of binding.nativeActionIds) {
      if (!actionById.has(id)) throw new ModelOutputInvalidError(`missing compiled native action: ${id}`);
      if (referencedActions.has(id)) throw new ModelOutputInvalidError(`compiled native action has multiple bindings: ${id}`);
      referencedActions.add(id);
      bindingByActionId.set(id, binding);
    }
  }
  if (modules.some((module) => module.placement === "event" && !referencedEventModules.has(module.id))) {
    throw new ModelOutputInvalidError("orphan compiled event module");
  }
  if (actions?.some((action) => !referencedActions.has(action.id)) === true) {
    throw new ModelOutputInvalidError("orphan compiled native action");
  }
  const expectedOwnedActionLinks = new Map((actions ?? []).flatMap((action) => {
    if (action.kind !== "set-state" && action.kind !== "show-feedback") return [];
    const binding = bindingByActionId.get(action.id);
    return binding === undefined ? [] : [[action.id, serializeCompiledNativeAction(action, binding)] as const];
  }));
  const result = safeCloneScriptData(compiledControl, "compiledControl") as TemplateJson;
  const actualOwner = result["name"] ?? asCompilerRecord(result["baseProperty"])["name"];
  if (actualOwner !== expectedOwner) throw new ModelOutputInvalidError("compiled control owner does not match the authoritative script owner");
  const rawLinkMng = result["linkMng"];
  if (rawLinkMng === null || typeof rawLinkMng !== "object" || Array.isArray(rawLinkMng)) throw new ModelOutputInvalidError("compiled control linkMng must be an object");
  const linkMng = rawLinkMng as TemplateJson;
  const rawLinks = linkMng["linkList"];
  if (!Array.isArray(rawLinks)) throw new ModelOutputInvalidError("compiled control linkMng.linkList must be an array");
  const seenOwnedActionMarkers = new Set<string>();
  const links = rawLinks.flatMap((link, index) => {
    if (link === null || typeof link !== "object" || Array.isArray(link)) throw new ModelOutputInvalidError(`compiled control linkMng.linkList.${index} must be an object`);
    const record = link as Record<string, unknown>;
    const actionMarker = parseCompiledActionMarker(record["kfCompilerAction"]);
    if (actionMarker !== undefined) {
      if (actionMarker.schema === COMPILED_STATE_ACTION_MARKER_SCHEMA || actionMarker.schema === COMPILED_FEEDBACK_ACTION_MARKER_SCHEMA) {
        if (seenOwnedActionMarkers.has(actionMarker.actionId)) {
          throw new ModelOutputInvalidError(`duplicate compiler-owned action marker: ${actionMarker.actionId}`);
        }
        const expected = expectedOwnedActionLinks.get(actionMarker.actionId);
        if (expected === undefined) {
          throw new ModelOutputInvalidError(`compiler-owned action is absent from the authoritative manifest: ${actionMarker.actionId}`);
        }
        if (!isDeepStrictEqual(record, expected)) {
          throw new ModelOutputInvalidError(`compiler-owned action does not match the authoritative manifest: ${actionMarker.actionId}`);
        }
        seenOwnedActionMarkers.add(actionMarker.actionId);
        return [];
      }
      const enclosingLinkId = typeof record["linkId"] === "number" ? record["linkId"] : null;
      if (actionMarker.ownerInstanceName !== ownerInstanceName
        || actionMarker.kfEvent !== record["name"]
        || actionMarker.linkId !== enclosingLinkId) {
        throw new ModelOutputInvalidError("compiler-owned action enclosing identity mismatch");
      }
      if (actionMarker.schema === COMPILED_ACTION_MARKER_SCHEMA && record["action"] !== "navigatePage") {
        throw new ModelOutputInvalidError("compiler-owned action enclosing identity mismatch");
      }
      if (actionMarker.schema === COMPILED_VISIBILITY_ACTION_MARKER_SCHEMA
        && (record["action"] !== undefined || record["script"] !== serializedVisibilityActionScript(actionMarker))) {
        throw new ModelOutputInvalidError("compiler-owned visibility action enclosing identity mismatch");
      }
      return [];
    }
    for (const expected of expectedOwnedActionLinks.values()) {
      const sameEvent = record["name"] === expected["name"]
        && (typeof record["linkId"] === "number" ? record["linkId"] : null)
          === (typeof expected["linkId"] === "number" ? expected["linkId"] : null);
      if (!sameEvent) continue;
      const stateCollision = expected["action"] === "setVariable" && record["action"] === "setVariable"
        && record["variableId"] === expected["variableId"];
      const feedbackCollision = (expected["kfCompilerAction"] as Record<string, unknown> | undefined)?.["schema"] === COMPILED_FEEDBACK_ACTION_MARKER_SCHEMA
        && record["action"] === undefined && typeof record["script"] === "string" && isCanonicalShowMessageSource(record["script"]);
      if (stateCollision || feedbackCollision) {
        throw new ModelOutputInvalidError("compiler-owned action marker is missing from a conflicting native effect");
      }
    }
    if (typeof record["script"] === "string" && hasCompilerOwnedScriptTail(record["script"])) {
      const legacy = stripCompilerOwnedScriptTail(record["script"], ownerInstanceName, {
        placement: "event",
        kfEvent: typeof record["name"] === "string" ? record["name"] : null,
        linkId: typeof record["linkId"] === "number" ? record["linkId"] : null,
      });
      return [{ ...record, script: legacy }];
    }
    return [record];
  });
  const eventGroups = new Map<string, CompiledEventBinding[]>();
  for (const binding of bindings) {
    const key = `${binding.kfEvent}\u0000${binding.linkId ?? ""}`;
    const group = eventGroups.get(key) ?? [];
    group.push(binding);
    eventGroups.set(key, group);
  }
  for (const [, group] of eventGroups) {
    const first = group[0]!;
    const sources: string[] = [];
    const declaredEffects: Array<{ kind: "action"; value: Record<string, unknown> } | { kind: "script" }> = [];
    const groupNativeActions = group.flatMap((binding) => binding.nativeActionIds.map((id) => actionById.get(id)!));
    // KF owns one executable slot per event identity. Navigation is a real
    // ShowPage call (not the compiler's former declarative command), and any
    // multi-effect event must share that one ordered script slot.
    const actionsUseScriptSlot = groupNativeActions.length > 1
      || groupNativeActions.some((action) => action.kind === "navigate-page"
        || ((action.kind === "open-overlay" || action.kind === "close-overlay") && action.targetControls.length > 1));
    let scriptEffectStarted = false;
    let actionAfterScript = false;
    for (const binding of group) {
      for (const actionId of binding.nativeActionIds) {
        if (scriptEffectStarted) actionAfterScript = true;
        const action = actionById.get(actionId)!;
        if (actionsUseScriptSlot) {
          if (!scriptEffectStarted) declaredEffects.push({ kind: "script" });
          scriptEffectStarted = true;
          sources.push(serializedCompiledModule(nativeActionScriptModule(action), binding));
        } else {
          declaredEffects.push({ kind: "action", value: serializeCompiledNativeAction(action, binding) });
        }
      }
      if (binding.scriptModuleIds.length > 0) {
        if (actionAfterScript) {
          throw new ModelOutputInvalidError(
            `UNREPRESENTABLE_KF_EVENT_EFFECT_ORDER: ${first.kfEvent}/${first.linkId ?? "none"} requires multiple native script slots`,
          );
        }
        if (!scriptEffectStarted) declaredEffects.push({ kind: "script" });
        scriptEffectStarted = true;
        sources.push(...binding.scriptModuleIds.map((id) => serializedCompiledModule(moduleById.get(id)!, binding)));
      }
    }
    let current: Record<string, unknown> | undefined;
    let currentIndex: number | undefined;
    if (sources.length > 0) {
      const matchingIndexes = links.flatMap((link, index) => {
        const sameId = first.linkId !== undefined && link["linkId"] === first.linkId;
        const sameName = link["name"] === first.kfEvent;
        return sameId || sameName ? [index] : [];
      });
      if (matchingIndexes.length > 1) throw new ModelOutputInvalidError(`ambiguous native event slots: ${first.kfEvent}`);
      if (matchingIndexes.length === 1) {
        currentIndex = matchingIndexes[0]!;
        current = links.splice(currentIndex, 1)[0]!;
      }
    }
    let serializedScript: Record<string, unknown> | undefined;
    if (sources.length > 0 && current !== undefined) {
      if (first.linkId !== undefined && current["linkId"] !== undefined && current["linkId"] !== first.linkId) {
        throw new ModelOutputInvalidError(`native event linkId mismatch: ${first.kfEvent}`);
      }
      if (current["name"] !== undefined && current["name"] !== first.kfEvent) throw new ModelOutputInvalidError(`native event name mismatch: ${first.kfEvent}`);
      const existing = current["script"];
      if (existing !== undefined && typeof existing !== "string") throw new ModelOutputInvalidError(`native event script must be a string: ${first.kfEvent}`);
      serializedScript = {
        ...current,
        ...(first.linkId === undefined ? {} : { linkId: first.linkId }),
        enable: true,
        script: appendScript(stripCompilerOwnedScriptTail(existing ?? "", ownerInstanceName, {
          placement: "event", kfEvent: first.kfEvent, linkId: first.linkId ?? null,
        }), sources),
        name: first.kfEvent,
      };
    } else if (sources.length > 0) {
      serializedScript = {
        ...(first.linkId === undefined ? {} : { linkId: first.linkId }), enable: true,
        script: appendScript("", sources), name: first.kfEvent,
      };
    }
    if (serializedScript !== undefined && String(serializedScript["script"]).length > 32_000) {
      throw new ModelOutputInvalidError(`compiled event script exceeds 32000 characters: ${first.kfEvent}`);
    }
    const serializedEffects = declaredEffects.map((effect) =>
      effect.kind === "action" ? effect.value : serializedScript!);
    if (currentIndex === undefined) links.push(...serializedEffects);
    else links.splice(currentIndex, 0, ...serializedEffects);
  }
  result["linkMng"] = { ...linkMng, linkList: links };
  const configureModules = modules.filter((module) => module.placement === "configure-data")
    .sort((left, right) => left.id.localeCompare(right.id, "en-US"));
  if (configureModules.length > 0) {
    // Task6's compileScriptPlan proves the exact profile flag before it creates
    // a configure-data module. This serialization layer repeats the reviewed
    // KF family boundary without importing the knowledge registry (which would
    // create control-compiler -> registry -> style-registry -> control-compiler).
    const configureDataCapabilities = new Set(Object.keys(EASYUI_TEMPLATES).map((proto) => `easyui.${proto}`));
    if (!configureDataCapabilities.has(capabilityId)) {
      throw new ModelOutputInvalidError(`capability ${capabilityId} does not support configureData`);
    }
    const existing = result["configureData"];
    if (typeof existing !== "string") throw new ModelOutputInvalidError("compiled control configureData must be a string");
    const configured = appendScript(stripCompilerOwnedScriptTail(existing, ownerInstanceName, {
      placement: "configure-data", kfEvent: null, linkId: null,
    }), configureModules.map((module) => serializedCompiledModule(module)));
    if (configured.length > 32_000) throw new ModelOutputInvalidError("compiled configureData exceeds 32000 characters");
    result["configureData"] = configured;
  } else if (typeof result["configureData"] === "string" && hasCompilerOwnedScriptTail(result["configureData"])) {
    result["configureData"] = stripCompilerOwnedScriptTail(result["configureData"], ownerInstanceName, {
      placement: "configure-data", kfEvent: null, linkId: null,
    });
  }
  return result;
}

// KF 3.6 has two incompatible size-policy readers. Legacy KMUIModel controls
// deserialize a flat `sizePolicy` array plus a sibling `fixedSize`, whereas
// ElementUI controls deserialize the newer object envelope. Keeping the
// template author's object shape for a legacy label makes the horizontal and
// vertical layout engines read `undefined` policies and collapse it to 0x0.
const LEGACY_FLAT_SIZE_POLICY_MODELS = new Set([0, 1, 6, 7, 8, 12, 13, 14, 42, 43]);

export function normalizeNativeSizePolicy(compiled: TemplateJson): TemplateJson {
  const uiModelType = compiled["uiModelType"];
  const envelope = compiled["sizePolicy"];
  if (
    typeof uiModelType !== "number"
    || !LEGACY_FLAT_SIZE_POLICY_MODELS.has(uiModelType)
    || envelope === null
    || typeof envelope !== "object"
    || Array.isArray(envelope)
  ) return compiled;
  const policy = envelope as TemplateJson;
  if (!Array.isArray(policy["sizePolicy"]) || !Array.isArray(policy["fixedSize"])) return compiled;
  return {
    ...compiled,
    sizePolicy: structuredClone(policy["sizePolicy"]),
    fixedSize: structuredClone(policy["fixedSize"]),
  };
}

const DIRECT_IR_STYLE_THEME: ThemeSpec = Object.freeze({
  background: "#ffffff",
  surface: "#ffffff",
  primary: "#2563eb",
  accent: "#2563eb",
  textPrimary: "#111827",
  textSecondary: "#6b7280",
  fontFamily: "sans-serif",
  spacingUnit: 4,
  radiusScale: { small: 4, medium: 8, large: 12 },
});

function capabilityIdForControl(control: ControlIR): string {
  switch (control.type) {
    case "easyui":
      return `easyui.${control.proto}`;
    case "layout":
      return `layout.${control.layoutType}`;
    case "prototype":
      return `prototype.${control.prototypeName}`;
    default:
      return control.type;
  }
}

/** Applies compiled style only after semantic/template overrides have been resolved. */
function applyControlStyle(compiled: TemplateJson, control: ControlIR): TemplateJson {
  if (control.style === undefined) return compiled;
  let result;
  try {
    result = compileControlStyle({
      capabilityId: capabilityIdForControl(control),
      theme: DIRECT_IR_STYLE_THEME,
      instanceStyle: control.style,
      runtimeProfile: KF36_RUNTIME_PROFILE,
    });
  } catch (error) {
    throw new ModelOutputInvalidError(styleEngineErrorMessage(error), { cause: error });
  }
  try {
    assertStyleCompilationAccepted(capabilityIdForControl(control), result);
  } catch (error) {
    throw new ModelOutputInvalidError(styleEngineErrorMessage(error), { cause: error });
  }
  if (control.type === "layout") {
    const baseProperty = compiled["baseProperty"];
    if (baseProperty === null || typeof baseProperty !== "object" || Array.isArray(baseProperty)) {
      throw new ModelOutputInvalidError("compiled layout is missing baseProperty");
    }
    return {
      ...compiled,
      baseProperty: {
        ...(baseProperty as TemplateJson),
        ...result.nativeFields,
        styleDataNew: mergeManagedStyleData(
          (baseProperty as TemplateJson)["styleDataNew"],
          result.styleDataNew,
        ),
      },
    };
  }
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  const { field } = nativeStyleStorage(compiled);
  return {
    ...compiled,
    ...result.nativeFields,
    [field]: mergeManagedStyleData(compiled[field], result.styleDataNew),
  };
  // end
}

function styleEngineErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Compiles an easyui control (objectType=3). The KF object carries the
 * easyui-base static fields plus the proto-specific template defaults; only
 * fields on the proto's whitelist (EASYUI_PROTO_FIELDS) are taken from the IR
 * — data/columns/toolbar content goes to configureData scripts and is never
 * serialized as object fields.
 */
function compileEasyuiControl(build: BuildSeed, control: ControlIR): TemplateJson {
  const easyui = control as unknown as EasyuiControlIR;
  const proto = easyui.proto;
  const protoTemplate = EASYUI_TEMPLATES[proto];
  if (protoTemplate === undefined) {
    throw new ModelOutputInvalidError(
      `easyui proto ${proto} (${easyuiTypeName(proto)}) has no compiled template`,
    );
  }
  const merged = mergeControlTemplate(
    mergeControlTemplate(BASE_FIELDS, easyuiBaseTemplate),
    protoTemplate,
  );
  // IR 保留字段名（type/proto/几何/id）绝不能透传进 KF 对象：
  // IR 的 `type` 是判别值 "easyui"，若白名单含 "type"（如 textbox）会把判别值写进 KF；
  // `uiModelType` 更不能出现（KF 加载用 uiModelType!==void 0 覆盖 easyui 实例）。
  const RESERVED_IR_FIELDS = new Set([
    "type", "proto", "uiExtendType", "id", "name", "guid",
    "x", "y", "width", "height", "uiModelType",
  ]);
  const pass: Record<string, unknown> = {};
  for (const field of EASYUI_PROTO_FIELDS[proto] ?? []) {
    if (RESERVED_IR_FIELDS.has(field)) continue;
    const value = (easyui as unknown as Record<string, unknown>)[field];
    if (value !== undefined) pass[field] = value;
  }
  const overrides: TemplateJson = {
    name: easyui.id,
    guid: deriveGuid(build, easyui.id),
    leftTopPt: { x: easyui.x, y: easyui.y },
    width: easyui.width,
    height: easyui.height,
    uiExtendType: proto,
    ...pass,
  };
  const mergedOut = mergeControlTemplate(merged, overrides);
  // DateBox（proto 11）在 KF 序列化中**不带 objectType**（KMUIExtendBase 系
  // objectToJson 不输出 objectType，参考工程 8 个 DateBox 均无该键）；easyui-base
  // 模板会给 objectType:3。KF 加载按 objectType→uiExtendType 顺序分派、后者覆盖
  // 前者，带上 objectType:3 也能渲染，但为与 KF 原生形态一致、避免任何意外
  // （gModelObjectFactory.create(3) 无 case），产物剥离 objectType。
  if (proto === 11) {
    delete mergedOut["objectType"];
  }
  return mergedOut;
}

/**
 * 清洗 KF 容器子对象：递归删除 `type`/`uiModelType` 顶层键，并给 easyui
 * 子对象（objectType=3 + uiExtendType）补齐其 proto 模板的缺省字段
 * （如 data: []/queryParams: {}——KF 插件如 sidemenu 对 undefined data 崩溃）。
 * 仅补缺失 key，不覆盖子对象已有的字段。
 * KF 布局 jsonToObject 对 insiderObjects 的每个子对象做同样的分派
 * （uiExtendType → uiModelType → layoutType，后者覆盖前者）：
 * 若子对象带 `uiModelType: null`（null!==undefined 为 true），
 * gUIModelObjectFactory.create(null) 会把 easyui/布局实例覆盖成 null，控件不渲染。
 * 真实 KF 序列化的子对象本就不含这两个键；LLM 生成的 children 必须被清洗。
 */
function stripKfContainerKeys(node: unknown): unknown {
  if (Array.isArray(node)) {
    return node.map(stripKfContainerKeys);
  }
  if (node !== null && typeof node === "object") {
    const raw = node as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (key === "type" || key === "uiModelType") continue;
      out[key] = stripKfContainerKeys(value);
    }
    // easyui 子对象：补 proto 模板缺省字段（data/queryParams 等 KF 加载必需）
    if (raw["objectType"] === 3 && typeof raw["uiExtendType"] === "number") {
      const proto = raw["uiExtendType"];
      const protoTemplate = EASYUI_TEMPLATES[proto];
      if (protoTemplate) {
        for (const [k, v] of Object.entries(protoTemplate)) {
          if (k === "uiExtendType") continue;
          if (out[k] === undefined) out[k] = structuredClone(v);
        }
      }
    }
    return out;
  }
  return node;
}

/**
 * 规范化 Docking 布局的 dPanelsOption：easyui layout 的 panel 尺寸由
 * `width`（west/east）与 `height`（north/south）控制，**不认 `size` 字段**——
 * 只传 {region,size,split} 会让面板尺寸落到默认 "auto"，区域内部空白。
 * 将 IR 里的 `size` 按 region 语义转换为 width/height（center 自适应填满）。
 * 已有 width/height 的 panel 原样保留。
 */
function normalizeDockPanels(
  panels: unknown[] | undefined,
  layoutWidth: number,
  layoutHeight: number,
): unknown[] | undefined {
  if (panels === undefined) return undefined;
  return panels.map((panel) => {
    if (panel === null || typeof panel !== "object") return panel;
    const p = structuredClone(panel) as Record<string, unknown>;
    const region = typeof p["region"] === "string" ? p["region"] : "center";
    const hasSize = typeof p["size"] === "number" && p["width"] === undefined && p["height"] === undefined;
    if (hasSize) {
      const size = p["size"] as number;
      if (region === "north" || region === "south") p["height"] = size;
      else if (region === "west" || region === "east") p["width"] = size;
      else {
        p["width"] = layoutWidth;
        p["height"] = layoutHeight;
      }
      delete p["size"];
    }
    return p;
  });
}

/**
 * 给布局子对象递归补 guid：KF 布局 insiderObjects 的每个子对象必须有 guid
 * （参考工程 easyui 子控件在顶层、嵌套布局在 baseProperty.guid），否则 inspect
 * 无法索引、LLM 无法引用修改。easyui 子控件 name 在顶层；布局子对象 name 在
 * baseProperty.name。生成路径始终覆盖模型提供的子 GUID，并用 `parentId:name`
 * 派生稳定身份；导入工程的无关 patch 不调用此函数，因此继续原样保留。
 */
export function ensureChildGuids(build: BuildSeed, children: unknown[], parentId: string): unknown[] {
  return children.map((child) => {
    if (child === null || typeof child !== "object" || Array.isArray(child)) return child;
    const node = child as Record<string, unknown>;
    if (typeof node["uiExtendType"] === "number") {
      if (node["guid"] === undefined) {
        const name = typeof node["name"] === "string" ? node["name"] : "";
        if (name !== "") node["guid"] = deriveGuid(build, `child:${parentId}:${name}`);
      }
    } else if (typeof node["layoutType"] === "number") {
      const bp = node["baseProperty"];
      if (bp !== null && typeof bp === "object") {
        const base = bp as Record<string, unknown>;
        const name = typeof base["name"] === "string" ? base["name"] : "";
        if (name !== "") base["guid"] = deriveGuid(build, `child:${parentId}:${name}`);
        if (Array.isArray(node["insiderObjects"])) {
          node["insiderObjects"] = ensureChildGuids(build, node["insiderObjects"] as unknown[], parentId);
        }
      }
    }
    return child;
  });
}

/**
 * Compiles a layout container (objectType=2). Geometry + name/guid live inside
 * `baseProperty`; nested children are carried into `insiderObjects` verbatim
 * (raw KF JSON, recursive layout/control objects), panels into `dPanelsOption`.
 * Layouts do NOT merge base-fields.json (its comment/lock/enable/visible top
 * level keys are control-scoped; real layouts keep those inside baseProperty).
 */
function compileLayoutControl(build: BuildSeed, control: ControlIR): TemplateJson {
  const layout = control as unknown as LayoutContainerIR;
  const overrides: TemplateJson = {
    objectType: 2,
    layoutType: layout.layoutType,
    baseProperty: {
      name: layout.id,
      guid: deriveGuid(build, layout.id),
      leftTopPt: { x: layout.x, y: layout.y },
      width: layout.width,
      height: layout.height,
      styleData: "",
      styleDataNew: "",
      comment: "",
      lock: false,
      visible: true,
      memberAccess: true,
    },
  };
  if (layout.children !== undefined) {
    overrides["insiderObjects"] = ensureChildGuids(
      build,
      stripKfContainerKeys(layout.children.map((child) => structuredClone(child))) as unknown[],
      String(layout.id),
    );
  }
  if (layout.panels !== undefined) {
    overrides["dPanelsOption"] = normalizeDockPanels(layout.panels, layout.width, layout.height);
  }
  return mergeControlTemplate(layoutTemplate, overrides);
}

/**
 * KF 特殊节点（`prototypeName` 判别，无 uiModelType/uiExtendType/layoutType）：
 * CustomCharts（objectType=1）、图表型（TrendChart/BarChart/PieChart/XYChart）、
 * AlarmWindow/EventWindow。IR 用判别值 `type:"prototype"` + `prototypeName` 细分。
 */
export const SPECIAL_PROTOTYPE_NAMES: readonly string[] = Object.freeze([
  "CustomCharts",
  "AlarmWindow",
  "EventWindow",
  "TrendChart",
  "BarChart",
  "PieChart",
  "XYChart",
]);

/** Returns the reviewed special-node inventory without exposing templates. */
export function supportedPrototypeNames(): readonly string[] {
  return Object.freeze([...SPECIAL_PROTOTYPE_NAMES].sort());
}

const SPECIAL_PROTOTYPE_SET: ReadonlySet<string> = new Set(SPECIAL_PROTOTYPE_NAMES);

/**
 * Compiles a KF special node (objectType=1 or prototypeName-dispatched chart /
 * alarm / event window). Geometry + name/guid + prototypeName are managed by
 * the compiler; every other IR field is passed through verbatim (the IR schema
 * keeps complex content — CustomCharts `objects` JSON strings, chart
 * `title`/`areas`, AlarmWindow `columns`/`evalconfig` — as opaque passthrough).
 *
 * - CustomCharts: geometry lives in `pageProperty.pagePos/pageSize` (built from
 *   the IR geometry when the IR has no pageProperty); objectType=1.
 * - Other nodes: top-level `leftTopPt`/`width`/`height`; no objectType.
 * - BarChart/PieChart have no jsonToObject guard on title/areas (missing keys
 *   crash KF), so a default `title:{text,show:true}` + `areas:[]` is applied.
 * - `type`/`uiModelType` are NEVER emitted.
 */
export function compileSpecialNode(build: BuildSeed, control: ControlIR): TemplateJson {
  const raw = control as unknown as Record<string, unknown>;
  const prototypeName = typeof raw["prototypeName"] === "string" ? raw["prototypeName"] : "";
  if (!SPECIAL_PROTOTYPE_SET.has(prototypeName)) {
    throw new ModelOutputInvalidError(
      `prototypeName "${prototypeName}" is not a supported KF special node ` +
        `(supported: ${SPECIAL_PROTOTYPE_NAMES.join(", ")})`,
    );
  }

  // IR 判别/几何/id 字段绝不能透传进 KF 对象；objectType/prototypeName 由本
  // 函数显式管理。`uiModelType` 更不能出现（KF 加载用它覆盖实例）。
  const RESERVED_IR_FIELDS = new Set([
    "type", "id", "x", "y", "width", "height", "uiModelType",
    "objectType", "prototypeName",
  ]);
  const passthrough: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (RESERVED_IR_FIELDS.has(key)) continue;
    if (value === undefined) continue;
    passthrough[key] = value;
  }

  const result = mergeControlTemplate(prototypeBaseTemplate, passthrough);
  result["prototypeName"] = prototypeName;
  result["guid"] = deriveGuid(build, String(raw["id"]));

  if (prototypeName === "CustomCharts") {
    // 几何写入 pageProperty（KF KMCustomCharts 无条件读 pageProperty.pagePos/
    // pageSize）；IR 已给 pageProperty 时保留其余字段、回写几何。
    const pageProperty =
      passthrough["pageProperty"] !== null && typeof passthrough["pageProperty"] === "object"
        ? (structuredClone(passthrough["pageProperty"]) as Record<string, unknown>)
        : {};
    if (typeof pageProperty["name"] !== "string") {
      pageProperty["name"] = String(raw["id"]);
    }
    pageProperty["pagePos"] = { x: raw["x"], y: raw["y"] };
    pageProperty["pageSize"] = { width: raw["width"], height: raw["height"] };
    result["pageProperty"] = pageProperty;
    result["objectType"] = 1;
  } else {
    result["leftTopPt"] = { x: raw["x"], y: raw["y"] };
    result["width"] = raw["width"];
    result["height"] = raw["height"];
    if (result["name"] === undefined) {
      result["name"] = String(raw["id"]);
    }
    // BarChart/PieChart 的 jsonToObject 无 hasOwnProperty 守卫：title/areas
    // 缺失会 `undefined.jsonToObject` / `undefined.map` TypeError。
    if (prototypeName === "BarChart" || prototypeName === "PieChart") {
      if (result["title"] === undefined) {
        result["title"] = { text: prototypeName, show: true };
      }
      if (result["areas"] === undefined) {
        result["areas"] = [];
      }
    }
    // 图表型（KMCC*Chart）jsonToObject 用 `default: this[e[i]]=t[e[i]]` 逐个赋值，
    // 缺省字段会被覆盖成 undefined——updateCenterPoint 读 this.relativePt.x /
    // this.leftTopPt.x 崩溃（真实 BarChart 必有这三个派生几何）。
    if (result["relativePt"] === undefined) {
      result["relativePt"] = { x: 0, y: 0 };
    }
    if (result["boundRect"] === undefined) {
      result["boundRect"] = {
        x: raw["x"], y: raw["y"], width: raw["width"], height: raw["height"],
      };
    }
    if (result["absolutePt"] === undefined) {
      result["absolutePt"] = {
        x: Number(raw["x"]) + Number(raw["width"]) / 2,
        y: Number(raw["y"]) + Number(raw["height"]) / 2,
      };
    }
  }

  return result;
}

function applySchemaOverrides(
  build: BuildSeed,
  control: ControlIR,
  ctx: CompileContext,
): TemplateJson {
  const common = {
    name: control.id,
    guid: deriveGuid(build, control.id),
    leftTopPt: { x: control.x, y: control.y },
    width: control.width,
    height: control.height,
  };
  switch (control.type) {
    case "text":
      return { ...common, text: control.text };
    case "button": {
      const links =
        control.action === undefined || control.action.kind === "noop"
          ? []
          : [compileAction(control.action, ctx)];
      return { ...common, text: control.text, linkMng: { linkList: links } };
    }
    case "inputnumber":
      return { ...common, precision: control.decimals };
    case "switch":
      return {
        ...common,
        value: control.value,
        ...(control.activeText !== undefined ? { activeText: control.activeText } : {}),
        ...(control.inactiveText !== undefined ? { inactiveText: control.inactiveText } : {}),
      };
    case "checkbox":
      return { ...common };
    case "radio": {
      const radioData = control.options.map((o) => ({
        text: o.label,
        disabled: false,
        visible: true,
      }));
      return { ...common, radioData };
    }
    case "select":
      return { ...common };
    case "image":
      return {
        ...common,
        src: control.src,
        ...(control.fit !== undefined ? { fit: control.fit } : {}),
        ...(control.alt !== undefined ? { alt: control.alt } : {}),
      };
    case "tabs":
    case "table":
      return { ...common };
    case "richtext":
      return { ...common, text: control.text };
    case "spacer":
      // KF spacers carry no name/axis; axis maps to uiModelType 13/14
      return {
        ...common,
        name: control.id,
        uiModelType: control.axis === "horizontal" ? 13 : 14,
      };
    case "radiolegacy": {
      const radioData = control.options.map((o) => ({
        text: o.label,
        disabled: false,
        visible: true,
      }));
      return { ...common, radioData };
    }
    case "checkboxlegacy":
    case "combobox":
    case "scale":
    case "list":
    case "treeview":
    case "webcontainer":
    case "gantt":
    case "factorycalendar":
    case "cascader":
    case "navmenu":
    case "tree":
    case "upload":
    case "tag":
    case "timeline":
    case "steps": {
      // 多数新控件：IR 语义字段名与 KF 字段名一致（模板已由源码生成），
      // 直接透传非 undefined 字段；复杂数据（gantt data 等）走 configureData。
      const type = (control as unknown as Record<string, unknown>)["type"] as string;
      const pass = {} as Record<string, unknown>;
      for (const key of TYPE_IR_FIELDS[type] ?? []) {
        const value = (control as unknown as Record<string, unknown>)[key];
        if (value !== undefined) pass[key] = value;
      }
      return { ...common, ...pass };
    }
    case "input": {
      const pass = {} as Record<string, unknown>;
      for (const key of ["value", "placeholder", "disabled", "clearable", "maxlength"]) {
        const value = (control as unknown as Record<string, unknown>)[key];
        if (value !== undefined) pass[key] = value;
      }
      const inputType = (control as unknown as Record<string, unknown>)["inputType"];
      if (inputType !== undefined) pass["type"] = inputType;
      return { ...common, ...pass };
    }
    case "datetimepicker": {
      const pass = {} as Record<string, unknown>;
      for (const key of ["value", "placeholder", "format"]) {
        const value = (control as unknown as Record<string, unknown>)[key];
        if (value !== undefined) pass[key] = value;
      }
      const pickerType = (control as unknown as Record<string, unknown>)["pickerType"];
      if (pickerType !== undefined) pass["type"] = pickerType;
      return { ...common, ...pass };
    }
    case "dropdown": {
      const pass = {} as Record<string, unknown>;
      for (const key of ["options", "splitButton"]) {
        const value = (control as unknown as Record<string, unknown>)[key];
        if (value !== undefined) pass[key] = value;
      }
      const text = (control as unknown as Record<string, unknown>)["text"];
      if (text !== undefined) pass["text"] = text;
      return { ...common, ...pass };
    }
    case "transfer": {
      const pass = {} as Record<string, unknown>;
      for (const key of ["titles"]) {
        const value = (control as unknown as Record<string, unknown>)[key];
        if (value !== undefined) pass[key] = value;
      }
      return { ...common, ...pass };
    }
    default:
      throw new ModelOutputInvalidError(
        `control type "${String((control as { type?: string }).type)}" has no reviewed template`,
      );
  }
}

/**
 * Compiles one IR restricted action into a serialized command. Only explicit,
 * declarative actions are allowed; `navigate` becomes `navigatePage` with the
 * page KF GUID resolved at compile time, `setVariable` keeps the semantic
 * variable name as its target. `noop` is handled by the caller (empty list).
 */
export function compileAction(
  action: RestrictedAction,
  ctx: CompileContext,
): CompiledAction {
  switch (action.kind) {
    case "navigate":
      ctx.resolvePageGuid(action.pageId);
      return {
        linkId: 200001,
        enable: true,
        name: "onClick",
        script: `ShowPage(${JSON.stringify(action.pageId)},1);`,
      };
    case "setVariable":
      return {
        action: "setVariable",
        variableId: ctx.resolveVariableName(action.variableId),
        value: action.value,
      };
    case "noop":
      throw new ModelOutputInvalidError(
        "noop actions are not serialized as explicit commands (caller must skip them)",
      );
  }
}
