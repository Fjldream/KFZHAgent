import { z } from "zod";
import {
  ButtonControlIR,
  CascaderControlIR,
  CheckboxControlIR,
  ComboboxControlIR,
  DatetimePickerControlIR,
  DropdownControlIR,
  FactoryCalendarControlIR,
  ImageControlIR,
  InputControlIR,
  InputNumberControlIR,
  LegacyCheckboxControlIR,
  LegacyRadioControlIR,
  ListControlIR,
  NavmenuControlIR,
  RadioControlIR,
  RichTextControlIR,
  ScaleControlIR,
  SelectControlIR,
  SpacerControlIR,
  SwitchControlIR,
  TabsControlIR,
  TagControlIR,
  TextControlIR,
  TimelineControlIR,
  TransferControlIR,
  TreeControlIR,
  TreeviewControlIR,
  UploadControlIR,
  WebContainerControlIR,
} from "../ir/client-project-ir.schema.js";

const parentId = z.string().min(1).optional();

const COMPONENT_PROPERTY_SCHEMAS: Readonly<Record<string, z.ZodType<Record<string, unknown>>>> = Object.freeze({
  button: z.object({ text: ButtonControlIR.shape.text.optional(), parentId }).strict(),
  text: z.object({ text: TextControlIR.shape.text.optional(), parentId }).strict(),
  richtext: z.object({ text: RichTextControlIR.shape.text.optional(), parentId }).strict(),
  image: z.object({
    src: ImageControlIR.shape.src.optional(),
    fit: ImageControlIR.shape.fit,
    alt: ImageControlIR.shape.alt,
    parentId,
  }).strict(),
  tag: z.object({
    effect: TagControlIR.shape.effect,
    closable: TagControlIR.shape.closable,
    hit: TagControlIR.shape.hit,
    parentId,
  }).strict(),
  input: z.object({
    value: InputControlIR.shape.value,
    placeholder: InputControlIR.shape.placeholder,
    disabled: InputControlIR.shape.disabled,
    clearable: InputControlIR.shape.clearable,
    maxlength: InputControlIR.shape.maxlength,
    parentId,
  }).strict(),
  inputnumber: z.object({
    precision: InputNumberControlIR.shape.decimals.optional(),
    parentId,
  }).strict(),
  cascader: z.object({
    options: CascaderControlIR.shape.options,
    placeholder: CascaderControlIR.shape.placeholder,
    filterable: CascaderControlIR.shape.filterable,
    clearable: CascaderControlIR.shape.clearable,
    parentId,
  }).strict(),
  combobox: z.object({
    options: ComboboxControlIR.shape.options.optional(),
    value: ComboboxControlIR.shape.value,
    editable: ComboboxControlIR.shape.editable,
    parentId,
  }).strict(),
  dropdown: z.object({
    options: DropdownControlIR.shape.options.optional(),
    text: DropdownControlIR.shape.text,
    splitButton: DropdownControlIR.shape.splitButton,
    parentId,
  }).strict(),
  factorycalendar: z.object({
    value: FactoryCalendarControlIR.shape.value,
    dateFormat: FactoryCalendarControlIR.shape.dateFormat,
    parentId,
  }).strict(),
  list: z.object({ options: ListControlIR.shape.options.optional(), parentId }).strict(),
  navmenu: z.object({
    mode: NavmenuControlIR.shape.mode,
    options: NavmenuControlIR.shape.options,
    parentId,
  }).strict(),
  select: z.object({
    options: SelectControlIR.shape.options.optional(),
    value: SelectControlIR.shape.value,
    multiple: SelectControlIR.shape.multiple,
    placeholder: SelectControlIR.shape.placeholder,
    parentId,
  }).strict(),
  checkbox: z.object({
    label: CheckboxControlIR.shape.label,
    checked: CheckboxControlIR.shape.checked.optional(),
    parentId,
  }).strict(),
  checkboxlegacy: z.object({
    label: LegacyCheckboxControlIR.shape.label,
    checked: LegacyCheckboxControlIR.shape.checked.optional(),
    parentId,
  }).strict(),
  radio: z.object({
    options: RadioControlIR.shape.options.optional(),
    value: RadioControlIR.shape.value,
    parentId,
  }).strict(),
  radiolegacy: z.object({
    options: LegacyRadioControlIR.shape.options.optional(),
    value: LegacyRadioControlIR.shape.value,
    parentId,
  }).strict(),
  scale: z.object({
    min: ScaleControlIR.shape.min,
    max: ScaleControlIR.shape.max,
    value: ScaleControlIR.shape.value,
    step: ScaleControlIR.shape.step,
    parentId,
  }).strict(),
  switch: z.object({
    value: SwitchControlIR.shape.value.optional(),
    activeText: SwitchControlIR.shape.activeText,
    inactiveText: SwitchControlIR.shape.inactiveText,
    parentId,
  }).strict(),
  datetimepicker: z.object({
    value: DatetimePickerControlIR.shape.value,
    placeholder: DatetimePickerControlIR.shape.placeholder,
    format: DatetimePickerControlIR.shape.format,
    parentId,
  }).strict(),
  tabs: z.object({
    tabs: TabsControlIR.shape.tabs.optional(),
    activeId: TabsControlIR.shape.activeId,
    parentId,
  }).strict(),
  spacer: z.object({ axis: SpacerControlIR.shape.axis.optional(), parentId }).strict(),
  timeline: z.object({ items: TimelineControlIR.shape.items.optional(), parentId }).strict(),
  transfer: z.object({
    options: TransferControlIR.shape.options.optional(),
    titles: TransferControlIR.shape.titles,
    parentId,
  }).strict(),
  tree: z.object({
    showCheckbox: TreeControlIR.shape.showCheckbox,
    indent: TreeControlIR.shape.indent,
    expandOnClickNode: TreeControlIR.shape.expandOnClickNode,
    parentId,
  }).strict(),
  treeview: z.object({ showCheckbox: TreeviewControlIR.shape.showCheckbox, parentId }).strict(),
  upload: z.object({
    action: UploadControlIR.shape.action,
    accept: UploadControlIR.shape.accept,
    multiple: UploadControlIR.shape.multiple,
    parentId,
  }).strict(),
  webcontainer: z.object({
    url: WebContainerControlIR.shape.url,
    scrollbar: WebContainerControlIR.shape.scrollbar,
    parentId,
  }).strict(),
  "easyui.2": z.object({ text: z.string().optional(), parentId }).strict(),
});

const RESERVED_PROPERTY_KEYS = new Set([
  "__proto__",
  "prototype",
  "constructor",
  "style",
  "css",
  "raw",
  "native",
  "nativefields",
  "nativepayload",
  "kfpayload",
  "styledata",
  "styledatanew",
  "backgroundcolor",
  "configuredata",
  "runtimeprofile",
  "selector",
  "selectors",
]);

function assertNoReservedPropertyKeys(
  value: unknown,
  path: string,
  seen: WeakSet<object>,
): void {
  if (value === null || typeof value !== "object") return;
  if (seen.has(value)) {
    throw new Error(`UNSAFE_COMPONENT_PROPERTY: cyclic value at ${path}`);
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoReservedPropertyKeys(item, `${path}[${index}]`, seen));
    return;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    if (RESERVED_PROPERTY_KEYS.has(key.toLowerCase())) {
      throw new Error(`UNSAFE_COMPONENT_PROPERTY: reserved key ${path}.${key}`);
    }
    assertNoReservedPropertyKeys(nested, `${path}.${key}`, seen);
  }
}

/**
 * Validates semantic UI component properties before they can reach native KF
 * assignment. Capabilities with semantic properties use their ControlIR value
 * schemas; raw-preservation paths still reject recursively nested native/style
 * payloads.
 */
export function validateComponentProperties(
  capabilityId: string,
  properties: Record<string, unknown>,
): Record<string, unknown> {
  assertNoReservedPropertyKeys(properties, "properties", new WeakSet());
  const schema = COMPONENT_PROPERTY_SCHEMAS[capabilityId];
  if (schema === undefined) return properties;
  const parsed = schema.safeParse(properties);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "properties"}: ${issue.message}`)
      .join("; ");
    throw new Error(`INVALID_COMPONENT_PROPERTY: ${capabilityId} — ${detail}`);
  }
  return parsed.data;
}
