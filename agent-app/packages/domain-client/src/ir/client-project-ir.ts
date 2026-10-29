export * from "./client-project-ir.schema.js";
export * from "./easyui-types.js";

import {
  ClientProjectIR,
  type ClientProjectIR as ClientProjectIRValue,
} from "./client-project-ir.schema.js";

/** 所有IR控制判别器，按模板审查顺序排列。 */
export const CONTROL_TYPES = [
  "text",
  "button",
  "inputnumber",
  "switch",
  "checkbox",
  "radio",
  "select",
  "image",
  "tabs",
  "table",
  "richtext",
  "spacer",
  "radiolegacy",
  "checkboxlegacy",
  "combobox",
  "scale",
  "list",
  "treeview",
  "webcontainer",
  "gantt",
  "factorycalendar",
  "input",
  "cascader",
  "datetimepicker",
  "dropdown",
  "navmenu",
  "tree",
  "upload",
  "transfer",
  "tag",
  "timeline",
  "steps",
  "easyui",
  "layout",
  "prototype",
] as const;

export function isClientProjectIR(value: unknown): value is ClientProjectIRValue {
  return ClientProjectIR.safeParse(value).success;
}

export function parseClientProjectIR(value: unknown): ClientProjectIRValue {
  return ClientProjectIR.parse(value);
}
