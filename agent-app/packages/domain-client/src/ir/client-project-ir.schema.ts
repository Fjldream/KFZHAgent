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
  columns: z.array(z.object({ id: z.string().min(1), title: z.string() })).min(1),
  dataSource: z.string().optional(),
}).strict();

export const RichTextControlIR = BaseControlIR.extend({
  type: z.literal("richtext"),
  text: z.string(),
}).strict();

export const SpacerControlIR = BaseControlIR.extend({
  type: z.literal("spacer"),
  axis: z.enum(["horizontal", "vertical"]),
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
]);
export type ControlIR = z.infer<typeof ControlIR>;

/** KF `uiModelType` -> IR control type (from `kmui_glabolvar.js` + SDB pages). */
export const CONTROL_TYPE_BY_UIMODEL_TYPE: Readonly<Record<number, string>> = {
  6: "text", // TEXTBOX
  7: "richtext", // RICHTEXT
  13: "spacer", // HORIZONTALSPACER
  14: "spacer", // VERTICALSPACER
  31: "table", // TABLE
  35: "button", // BUTTON (element-style, page JSON verified)
  36: "radio", // ELEMENTRADIO
  37: "checkbox", // ELEMENTCHECHECKBOX
  41: "image", // IMAGE
  44: "select", // SELECT
  47: "tabs", // TABS
  48: "switch", // SWITCH
  49: "inputnumber", // INPUTNUMBER
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
