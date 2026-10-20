import { createHash } from "node:crypto";
import { stringifyScriptSafeJson } from "../script-safe-json.js";
import { CompilerInstanceNameSchema } from "@kf/contracts";
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
  SelectControlIR,
  SpacerControlIR,
  StepsControlIR,
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
import { EASYUI_PROTO_TYPES } from "../ir/easyui-types.js";
import { controlGeometryIssues } from "./control-geometry.js";
import { parseTableData } from "../modules/definitions/native-data-adapters.js";

const parentId = z.string().min(1).max(100).optional();
const boundedNumber = z.number().finite().min(-1_000_000_000).max(1_000_000_000).optional();
const positiveBoundedNumber = z.number().finite().positive().max(1_000_000_000).optional();
const dateFormat = z.string().min(1).max(64).regex(/^[a-zA-Z0-9:/ ._-]+$/).optional();
const uploadAccept = z.string().min(1).max(256).regex(/^[a-zA-Z0-9.,/+*-]+$/).optional();

const layoutBaseProperty = z.object({
  name: z.string().trim().min(1).max(100),
  leftTopPt: z.object({ x: z.number().finite(), y: z.number().finite() }).strict().optional(),
  width: z.number().finite().positive().max(1_000_000_000).optional(),
  height: z.number().finite().positive().max(1_000_000_000).optional(),
}).strict();
const layoutChild = z.object({
  layoutType: z.union([z.literal(0), z.literal(2), z.literal(3), z.literal(4), z.literal(5), z.literal(6)]),
  objectType: z.literal(2).optional(),
  baseProperty: layoutBaseProperty,
}).strict().superRefine((value, ctx) => {
  const { leftTopPt, width, height } = value.baseProperty;
  for (const issue of controlGeometryIssues(`layout.${value.layoutType}`, {
    x: leftTopPt?.x,
    y: leftTopPt?.y,
    width,
    height,
  })) {
    ctx.addIssue({
      code: "custom",
      path: ["baseProperty", ...(issue.field === "x" || issue.field === "y"
        ? ["leftTopPt", issue.field]
        : [issue.field])],
      message: issue.message,
    });
  }
});
const layoutPanel = z.object({
  region: z.enum(["center", "north", "south", "east", "west"]),
  width: z.number().positive().max(1_000_000_000).optional(),
  height: z.number().positive().max(1_000_000_000).optional(),
  size: z.number().positive().max(1_000_000_000).optional(),
  split: z.boolean().optional(),
}).strict();
const layoutProperties = z.object({
  children: z.array(layoutChild).max(1_000).optional(),
  panels: z.array(layoutPanel).max(1_000).optional(),
  parentId,
}).strict().superRefine((value, ctx) => {
  const names = new Set<string>();
  for (const [index, child] of (value.children ?? []).entries()) {
    const name = child.baseProperty.name;
    if (names.has(name)) {
      ctx.addIssue({
        code: "custom",
        path: ["children", index, "baseProperty", "name"],
        message: `DUPLICATE_LAYOUT_CHILD_ID: ${name}`,
      });
    }
    names.add(name);
  }
});

const chartTitle = z.object({
  show: z.boolean(),
  text: z.string(),
  position: z.number().int().min(0).max(8),
}).strict();
const chartArea = z.object({
  top: z.number().finite(),
  left: z.number().finite(),
  width: z.number().finite().positive(),
  height: z.number().finite().positive(),
}).strict();
const chartProperties = z.object({
  title: chartTitle.optional(),
  areas: z.array(chartArea).max(100).optional(),
  comment: z.string().optional(),
}).strict();

const customChartProperties = z.object({
  region: z.enum(["center", "north", "south", "east", "west"]).optional(),
}).strict();

const emptyProperties = z.object({ parentId }).strict();
const easyuiDatagridProperties = z.object({
  striped: z.boolean().optional(),
  pagination: z.boolean().optional(),
  pageSize: z.number().int().min(1).max(10_000).optional(),
  /** Typed module semantic data; never a raw configureData script. */
  tableData: z.unknown().optional(),
  parentId,
}).strict().superRefine((value, ctx) => {
  if (value.tableData !== undefined) {
    try { parseTableData(value.tableData); }
    catch (error) { ctx.addIssue({ code: "custom", path: ["tableData"], message: error instanceof Error ? error.message : "invalid table data" }); }
  }
});
const easyuiTextboxProperties = z.object({
  value: z.string().optional(),
  readonly: z.boolean().optional(),
  parentId,
}).strict();

const tabsProperties = z.object({
  tabs: TabsControlIR.shape.tabs.optional(),
  activeId: TabsControlIR.shape.activeId,
  parentId,
}).strict().superRefine((value, ctx) => {
  if (value.tabs === undefined) return;
  const ids = value.tabs.map((tab) => tab.id);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["tabs"], message: "TAB_ID_DUPLICATE" });
  if (value.activeId !== undefined && !ids.includes(value.activeId)) {
    ctx.addIssue({ code: "custom", path: ["activeId"], message: "TAB_ACTIVE_ID_UNKNOWN" });
  }
});

const GENERATED_COMPONENT_PROPERTY_SCHEMAS: Readonly<Record<string, z.ZodType<Record<string, unknown>>>> = Object.freeze({
  button: z.object({
    text: ButtonControlIR.shape.text.optional(),
    action: ButtonControlIR.shape.action,
    parentId,
  }).strict(),
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
    inputType: InputControlIR.shape.inputType,
    disabled: InputControlIR.shape.disabled,
    clearable: InputControlIR.shape.clearable,
    maxlength: z.number().int().min(0).max(1_000_000).optional(),
    parentId,
  }).strict(),
  inputnumber: z.object({
    precision: InputNumberControlIR.shape.decimals.optional(),
    variableId: InputNumberControlIR.shape.variableId.optional(),
    decimals: InputNumberControlIR.shape.decimals.optional(),
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
    dateFormat,
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
    min: boundedNumber,
    max: boundedNumber,
    value: boundedNumber,
    step: positiveBoundedNumber,
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
    pickerType: DatetimePickerControlIR.shape.pickerType,
    format: dateFormat,
    parentId,
  }).strict(),
  tabs: tabsProperties,
  spacer: z.object({ axis: SpacerControlIR.shape.axis.optional(), parentId }).strict(),
  timeline: z.object({ items: TimelineControlIR.shape.items.optional(), parentId }).strict(),
  transfer: z.object({
    options: TransferControlIR.shape.options.optional(),
    titles: TransferControlIR.shape.titles,
    parentId,
  }).strict(),
  tree: z.object({
    showCheckbox: TreeControlIR.shape.showCheckbox,
    indent: z.number().int().min(0).max(1_000).optional(),
    expandOnClickNode: TreeControlIR.shape.expandOnClickNode,
    parentId,
  }).strict(),
  treeview: z.object({ showCheckbox: TreeviewControlIR.shape.showCheckbox, parentId }).strict(),
  upload: z.object({
    action: UploadControlIR.shape.action,
    accept: uploadAccept,
    multiple: UploadControlIR.shape.multiple,
    parentId,
  }).strict(),
  webcontainer: z.object({
    url: WebContainerControlIR.shape.url,
    scrollbar: WebContainerControlIR.shape.scrollbar,
    parentId,
  }).strict(),
  table: emptyProperties,
  gantt: emptyProperties,
  steps: z.object({
    active: StepsControlIR.shape.active,
    direction: StepsControlIR.shape.direction,
    processStatus: StepsControlIR.shape.processStatus,
    parentId,
  }).strict(),
  "easyui.1": easyuiDatagridProperties,
  "easyui.2": z.object({ text: z.string().optional(), parentId }).strict(),
  "easyui.9": easyuiTextboxProperties,
  "layout.0": layoutProperties,
  "layout.2": layoutProperties,
  "layout.3": layoutProperties,
  "layout.4": layoutProperties,
  "layout.5": layoutProperties,
  "layout.6": layoutProperties,
  "prototype.CustomCharts": customChartProperties,
  "prototype.TrendChart": chartProperties,
  "prototype.BarChart": chartProperties,
  "prototype.PieChart": chartProperties,
  "prototype.XYChart": chartProperties,
  "prototype.AlarmWindow": z.object({}).strict(),
  "prototype.EventWindow": z.object({}).strict(),
});

const CREATE_COMPONENT_PROPERTY_SCHEMAS: Readonly<Record<string, z.ZodType<Record<string, unknown>>>> = Object.freeze({
  ...GENERATED_COMPONENT_PROPERTY_SCHEMAS,
  button: z.object({ text: ButtonControlIR.shape.text.optional(), action: ButtonControlIR.shape.action, parentId }).strict(),
  input: z.object({
    value: InputControlIR.shape.value,
    placeholder: InputControlIR.shape.placeholder,
    disabled: InputControlIR.shape.disabled,
    clearable: InputControlIR.shape.clearable,
    maxlength: z.number().int().min(0).max(1_000_000).optional(),
    parentId,
  }).strict(),
  inputnumber: z.object({ precision: InputNumberControlIR.shape.decimals.optional(), parentId }).strict(),
  datetimepicker: z.object({
    value: DatetimePickerControlIR.shape.value,
    placeholder: DatetimePickerControlIR.shape.placeholder,
    format: dateFormat,
    parentId,
  }).strict(),
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
function validateProperties(
  capabilityId: string,
  properties: Record<string, unknown>,
  schemas: Readonly<Record<string, z.ZodType<Record<string, unknown>>>>,
): Record<string, unknown> {
  assertNoReservedPropertyKeys(properties, "properties", new WeakSet());
  let schema = Object.hasOwn(schemas, capabilityId)
    ? schemas[capabilityId]
    : undefined;
  if (schema === undefined) {
    const easyui = /^easyui\.(\d+)$/.exec(capabilityId);
    if (easyui !== null && Object.hasOwn(EASYUI_PROTO_TYPES, Number(easyui[1]))) {
      schema = emptyProperties;
    }
  }
  if (schema === undefined) {
    throw new Error(`INVALID_COMPONENT_PROPERTY: ${capabilityId} — no reviewed property schema`);
  }
  const parsed = schema.safeParse(properties);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "properties"}: ${issue.message}`)
      .join("; ");
    throw new Error(`INVALID_COMPONENT_PROPERTY: ${capabilityId} — ${detail}`);
  }
  return parsed.data;
}

export function validateGeneratedComponentProperties(
  capabilityId: string,
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return validateProperties(capabilityId, properties, GENERATED_COMPONENT_PROPERTY_SCHEMAS);
}

export function validateCreateComponentProperties(
  capabilityId: string,
  properties: Record<string, unknown>,
): Record<string, unknown> {
  return validateProperties(capabilityId, properties, CREATE_COMPONENT_PROPERTY_SCHEMAS);
}

/** Exact reviewed KF 3.6 Tabs adapter: semantic ids become native tab names. */
export function toNativeTabsProperties(properties: Record<string, unknown>): Readonly<Record<string, unknown>> {
  const semantic = {
    ...(properties.tabs === undefined ? {} : { tabs: properties.tabs }),
    ...(properties.activeId === undefined ? {} : { activeId: properties.activeId }),
    ...(properties.parentId === undefined ? {} : { parentId: properties.parentId }),
  };
  const validated = validateGeneratedComponentProperties("tabs", semantic);
  const tabs = validated.tabs;
  if (!Array.isArray(tabs) || tabs.length === 0) throw new Error("INVALID_COMPONENT_PROPERTY: tabs — tabs are required");
  const activeId = typeof validated.activeId === "string"
    ? validated.activeId
    : (tabs[0] as { id: string }).id;
  return Object.freeze({
    tabData: Object.freeze((tabs as Array<{ id: string; label: string }>)
      .map((tab) => Object.freeze({ name: tab.id, label: tab.label }))),
    activeName: activeId,
  });
}

const REVIEWED_TABS_INITIALIZATION_SCHEMA = "kf-compiled-tabs/v1";
const ReviewedRuntimeTabSchema = z.object({
  name: z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
  label: z.string().trim().min(1).max(2_000),
}).strict();
const ReviewedTabsRuntimeStateSchema = z.object({
  tabData: z.array(ReviewedRuntimeTabSchema).min(1).max(32),
  activeName: z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*$/),
}).strict().superRefine((state, ctx) => {
  const names = state.tabData.map((tab) => tab.name);
  if (new Set(names).size !== names.length) ctx.addIssue({ code: "custom", path: ["tabData"], message: "TAB_ID_DUPLICATE" });
  if (!names.includes(state.activeName)) ctx.addIssue({ code: "custom", path: ["activeName"], message: "TAB_ACTIVE_ID_UNKNOWN" });
});
const ReviewedTabsInitializationMarkerSchema = z.object({
  schema: z.literal(REVIEWED_TABS_INITIALIZATION_SCHEMA),
  ownerInstanceName: CompilerInstanceNameSchema,
  uiModelType: z.literal(47),
  bodySha256: z.string().regex(/^[0-9a-f]{64}$/),
  bodyByteLength: z.number().int().positive().max(32_000),
  tabNames: z.array(z.string().min(1).max(100)).min(1).max(32),
  activeName: z.string().min(1).max(100),
}).strict();

type ReviewedTabsRuntimeState = z.infer<typeof ReviewedTabsRuntimeStateSchema>;

function serializeReviewedTabsRuntimeState(ownerInstanceName: string, input: ReviewedTabsRuntimeState): string {
  const owner = CompilerInstanceNameSchema.parse(ownerInstanceName);
  const state = ReviewedTabsRuntimeStateSchema.parse(input);
  const serializedState = stringifyScriptSafeJson(state);
  if (serializedState === undefined) {
    throw new Error("INVALID_COMPONENT_PROPERTY: tabs — initialization is not JSON serializable");
  }
  const body = `this.tabs(${serializedState});\n`;
  if (Buffer.byteLength(body, "utf8") > 32_000) {
    throw new Error("INVALID_COMPONENT_PROPERTY: tabs — initialization exceeds 32000 bytes");
  }
  const marker = ReviewedTabsInitializationMarkerSchema.parse({
    schema: REVIEWED_TABS_INITIALIZATION_SCHEMA,
    ownerInstanceName: owner,
    uiModelType: 47,
    bodySha256: createHash("sha256").update(body, "utf8").digest("hex"),
    bodyByteLength: Buffer.byteLength(body, "utf8"),
    tabNames: state.tabData.map((tab) => tab.name),
    activeName: state.activeName,
  });
  return `// ${REVIEWED_TABS_INITIALIZATION_SCHEMA} ${Buffer.from(stringifyScriptSafeJson(marker)!, "utf8").toString("base64url")}\n${body}`;
}

/**
 * 由编译器精确控制的 KF 3.6 Tabs 初始化。已签入的运行时会先基于 defaultData 创建 Vue，再求值 configureData；`tabs(e)` 是经审查后唯一用于把 tabData/activeName 赋给 `$vm` 的路径。
 */
export function serializeReviewedTabsInitialization(
  ownerInstanceName: string,
  properties: Record<string, unknown>,
): string {
  const native = toNativeTabsProperties(properties) as Readonly<{
    tabData: readonly Readonly<{ name: string; label: string }>[];
    activeName: string;
  }>;
  return serializeReviewedTabsRuntimeState(ownerInstanceName, {
    tabData: native.tabData.map((tab) => ({ ...tab })),
    activeName: native.activeName,
  });
}

/** 只解析精确的编译形式；它不是通用的JS/configureData解析器。 */
export function parseReviewedTabsInitialization(source: unknown): Readonly<{
  ownerInstanceName: string;
  uiModelType: 47;
  tabData: readonly Readonly<{ name: string; label: string }>[];
  activeName: string;
}> {
  try {
    if (typeof source !== "string" || source.length > 64_000) throw new Error("source");
    const prefix = `// ${REVIEWED_TABS_INITIALIZATION_SCHEMA} `;
    if (!source.startsWith(prefix)) throw new Error("marker");
    const newline = source.indexOf("\n");
    if (newline < prefix.length) throw new Error("marker line");
    const marker = ReviewedTabsInitializationMarkerSchema.parse(JSON.parse(
      Buffer.from(source.slice(prefix.length, newline), "base64url").toString("utf8"),
    ));
    const body = source.slice(newline + 1);
    if (Buffer.byteLength(body, "utf8") !== marker.bodyByteLength
      || createHash("sha256").update(body, "utf8").digest("hex") !== marker.bodySha256) throw new Error("body binding");
    const match = /^this\.tabs\((\{.*\})\);\n$/.exec(body);
    if (match === null) throw new Error("method");
    const state = ReviewedTabsRuntimeStateSchema.parse(JSON.parse(match[1]!));
    if (marker.activeName !== state.activeName
      || marker.tabNames.length !== state.tabData.length
      || marker.tabNames.some((name, index) => name !== state.tabData[index]!.name)
      || serializeReviewedTabsRuntimeState(marker.ownerInstanceName, state) !== source) throw new Error("canonical binding");
    return Object.freeze({
      ownerInstanceName: marker.ownerInstanceName,
      uiModelType: 47 as const,
      tabData: Object.freeze(state.tabData.map((tab) => Object.freeze({ ...tab }))),
      activeName: state.activeName,
    });
  } catch (error) {
    throw new Error("INVALID_REVIEWED_TABS_INITIALIZATION", { cause: error });
  }
}
