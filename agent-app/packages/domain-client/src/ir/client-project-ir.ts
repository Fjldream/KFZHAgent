export * from "./client-project-ir.schema.js";

import {
  ClientProjectIR,
  type ClientProjectIR as ClientProjectIRValue,
} from "./client-project-ir.schema.js";

/** All IR control discriminants, in template-review order. */
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
] as const;

export function isClientProjectIR(value: unknown): value is ClientProjectIRValue {
  return ClientProjectIR.safeParse(value).success;
}

export function parseClientProjectIR(value: unknown): ClientProjectIRValue {
  return ClientProjectIR.parse(value);
}
