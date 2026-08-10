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
import type { ControlIR, RestrictedAction } from "../ir/client-project-ir.js";
import { mergeControlTemplate, type TemplateJson } from "../templates/merge-template.js";
import { deriveGuid, type BuildSeed } from "./guid-factory.js";

/**
 * Per-control compilation (brief Step 5 + Step 6).
 *
 * Every KF control object is built as:
 *
 *   result = mergeControlTemplate(mergeControlTemplate(baseFields, template), overrides)
 *          = { ...baseFields, ...template, ...overrides }
 *
 * - `baseFields` and the per-type `template` come from the REVIEWED templates
 *   under `src/templates/`; the compiler never invents fields.
 * - `overrides` contains ONLY schema-approved runtime values: the KF `name`,
 *   the derived KF GUID, geometry, and the type-specific semantic values
 *   (text / precision / restricted actions).
 * - Model-provided raw fields are never copied: foreign OBJECT fields are
 *   ignored (template wins), while foreign STRING fields are rejected with
 *   MODEL_OUTPUT_INVALID because a raw string is the vehicle for arbitrary
 *   JavaScript injection (brief Step 6).
 */

export const MODEL_OUTPUT_INVALID = "MODEL_OUTPUT_INVALID";

export class ModelOutputInvalidError extends Error {
  constructor(detail: string) {
    super(`${MODEL_OUTPUT_INVALID}: ${detail}`);
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

/**
 * Serialized restricted-action command placed in `linkMng.linkList`.
 * `openDialog` is an encoded action form supported by the serializer; the
 * current IR schema only produces `navigatePage` and `setVariable`.
 */
export type CompiledAction = {
  action: "navigatePage" | "setVariable" | "openDialog";
  pageId?: string;
  variableId?: string;
  value?: string | number | boolean;
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
};

/** IR fields every control variant carries (everything the schema defines). */
const COMMON_IR_FIELDS = new Set(["id", "type", "x", "y", "width", "height"]);
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
};

/**
 * Returns the only control types with a REVIEWED template. Any other IR
 * control type is rejected (MODEL_OUTPUT_INVALID) because the compiler must
 * not fabricate a KF field layout for it.
 */
export function supportedControlTypes(): readonly string[] {
  return Object.keys(CONTROL_TEMPLATES);
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
): TemplateJson {
  const template = CONTROL_TEMPLATES[control.type];
  if (template === undefined) {
    throw new ModelOutputInvalidError(
      `control type "${control.type}" has no reviewed template ` +
        `(supported: ${supportedControlTypes().join(", ")})`,
    );
  }
  const merged = mergeControlTemplate(BASE_FIELDS, template);
  return mergeControlTemplate(merged, applySchemaOverrides(build, control, ctx));
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
      return { action: "navigatePage", pageId: ctx.resolvePageGuid(action.pageId) };
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
