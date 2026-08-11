import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  ChangeEntityIdSchema,
  ComponentStyleSpecSchema,
  type ComponentStyleSpec,
  type FieldPatch,
  type ThemeSpec,
} from "@kf/contracts";
import { z } from "zod";
import { inspectClientProject, type EntityIndex, type InspectResult } from "../inspect/client-inspector.js";
import { stableStringify, type ClientWorkspace } from "../compile/client-compiler.js";
import { deriveGuid } from "../compile/guid-factory.js";
import { compileAction, ensureChildGuids } from "../compile/control-compiler.js";
import type { RestrictedAction } from "../ir/client-project-ir.js";
import { RestrictedAction as RestrictedActionSchema } from "../ir/client-project-ir.schema.js";
import { assertStyleCompilationAccepted, compileControlStyle } from "../style/style-engine.js";
import { KF36_RUNTIME_PROFILE } from "../style/runtime-profile.js";
import { mergeManagedStyleData } from "../style/style-data-merge.js";
import { validateCreateComponentProperties } from "../implementation/component-properties.js";
import { controlGeometryIssues, MAX_CONTROL_GEOMETRY } from "../implementation/control-geometry.js";
import { mergeControlTemplate, type TemplateJson } from "../templates/merge-template.js";
import baseFieldsJson from "../templates/base-fields.json" with { type: "json" };
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
// ── KF 容器对象模板（与 control-compiler 同一套 reviewed 模板）──
import easyuiBaseTemplate from "../templates/control-templates/easyui-base.json" with { type: "json" };
import easyuiCalendarTemplate from "../templates/control-templates/easyui-calendar.json" with { type: "json" };
import easyuiComboboxTemplate from "../templates/control-templates/easyui-combobox.json" with { type: "json" };
import easyuiCombotreeTemplate from "../templates/control-templates/easyui-combotree.json" with { type: "json" };
import easyuiDatagridTemplate from "../templates/control-templates/easyui-datagrid.json" with { type: "json" };
import easyuiDatetimeboxTemplate from "../templates/control-templates/easyui-datetimebox.json" with { type: "json" };
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
import pageSkeleton from "../templates/page-skeleton.json" with { type: "json" };
import { EASYUI_PROTO_FIELDS } from "../ir/easyui-types.js";
import { allowedFieldsFor, resolveControlPathFor } from "./allowlist.js";
import {
  PatchConflictError,
  isObject,
  parseJsonPointer,
  parseFragmentPointer,
  setByTokens,
} from "./json-pointer.js";
import {
  isControlLocation,
  locateEntity,
  resolveVariableGroupFile,
  resolveVersionDirName,
  type EntityLocation,
} from "./change-scope.js";

/**
 * Lossless client patcher (brief Step 4).
 *
 * `applyClientPatch(base, plan)` copies the base workspace tree and applies a
 * confirmed ChangePlan field-by-field on the copy:
 * - update patches JSON-pointer paths that are allowlisted per entity type;
 *   unknown/future fields are never touched,
 * - create compiles a complete entity from the reviewed templates and derives
 *   its KF GUID deterministically from the plan's workspace id,
 * - delete removes an entity but only when destructiveConfirmed=true and the
 *   operation digest matches the operation content.
 *
 * The returned candidate is a full, unpackable ClientWorkspace; nothing is
 * written back into `base`.
 */

// ---------------------------------------------------------------------------
// Normalization (contract shape from @kf/contracts; tolerates the brief's
// `action` alias for `op` and an optional `entityType` hint on update/delete)
// ---------------------------------------------------------------------------

export interface NormalizedOperation {
  op: "create" | "update" | "delete" | "applyStyle";
  entityType?: string;
  entityId: string;
  changes: FieldPatch[];
  properties: Record<string, unknown>;
  destructiveConfirmed: boolean;
  digest?: string;
  style?: ComponentStyleSpec;
}

export interface NormalizedPlan {
  schema: "kf-change-plan/v1";
  workspaceId: string;
  operations: NormalizedOperation[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== "string") throw new PatchConflictError(`${what} must be a string`);
  return value;
}

function requireEntityId(value: unknown, what: string): string {
  const parsed = ChangeEntityIdSchema.safeParse(value);
  if (!parsed.success) throw new PatchConflictError(`${what} must be a trimmed non-blank string of at most 100 characters`);
  return parsed.data;
}

/** Accepts both `op` (contract) and `action` (brief Step 1 example) keys. */
function operationAction(raw: Record<string, unknown>): string {
  const value = raw["op"] ?? raw["action"];
  return typeof value === "string" ? value : "";
}

function normalizeFieldPatch(raw: unknown, index: number): FieldPatch {
  const rec = asRecord(raw);
  const patchPath = requireString(rec["path"], `update.changes[${index}].path`);
  if (!patchPath.startsWith("/") && patchPath !== "") {
    throw new PatchConflictError(`update.changes[${index}].path must be a JSON Pointer`);
  }
  return { path: patchPath, value: rec["value"] };
}

export function normalizeChangePlan(input: unknown): NormalizedPlan {
  const plan = asRecord(input);
  const schema = plan["schema"];
  if (schema !== undefined && schema !== "kf-change-plan/v1") {
    throw new PatchConflictError(
      `change plan must declare schema "kf-change-plan/v1" (got ${JSON.stringify(schema)})`,
    );
  }
  const workspaceId =
    typeof plan["workspaceId"] === "string" ? (plan["workspaceId"]) : "default";
  const rawOperations = Array.isArray(plan["operations"]) ? plan["operations"] : [];
  const operations: NormalizedOperation[] = rawOperations.map((raw, index) => {
    const rec = asRecord(raw);
    const op = operationAction(rec);
    const entityId = requireEntityId(rec["entityId"], `operations[${index}].entityId`);
    const entityType =
      typeof rec["entityType"] === "string" ? (rec["entityType"]) : undefined;
    switch (op) {
      case "create":
        return {
          op: "create",
          entityId,
          ...(entityType !== undefined ? { entityType } : {}),
          changes: [],
          properties: asRecord(rec["properties"]),
          destructiveConfirmed: false,
        };
      case "update": {
        const changes = Array.isArray(rec["changes"])
          ? (rec["changes"] as unknown[]).map((c, ci) => normalizeFieldPatch(c, ci))
          : [];
        return {
          op: "update",
          entityId,
          ...(entityType !== undefined ? { entityType } : {}),
          changes,
          properties: {},
          destructiveConfirmed: false,
        };
      }
      case "delete":
        return {
          op: "delete",
          entityId,
          ...(entityType !== undefined ? { entityType } : {}),
          changes: [],
          properties: {},
          destructiveConfirmed: rec["destructiveConfirmed"] === true,
          ...(typeof rec["digest"] === "string" ? { digest: rec["digest"] } : {}),
        };
      case "applyStyle": {
        if (entityType !== "control") {
          throw new PatchConflictError(`operations[${index}].applyStyle requires entityType "control"`);
        }
        const parsedStyle = ComponentStyleSpecSchema.safeParse(rec["style"]);
        if (!parsedStyle.success) {
          throw new PatchConflictError(`operations[${index}].style is not a valid ComponentStyleSpec`);
        }
        return {
          op: "applyStyle",
          entityId,
          entityType: "control",
          changes: [],
          properties: {},
          destructiveConfirmed: false,
          style: parsedStyle.data,
        };
      }
      default:
        throw new PatchConflictError(
          `operations[${index}] has unknown action "${op}" (expected create/update/delete/applyStyle)`,
        );
    }
  });
  return { schema: "kf-change-plan/v1", workspaceId, operations };
}

/** Canonical SHA-256 of a plan (used as the planHash contract). */
export function planHash(input: unknown): string {
  const plan = normalizeChangePlan(input);
  return createHash("sha256").update(stableStringify(plan)).digest("hex");
}

/** Canonical digest of a delete operation (digest = hash of op content). */
export function deleteOperationDigest(entityId: string): string {
  return createHash("sha256").update(stableStringify({ op: "delete", entityId })).digest("hex");
}

export const patchConflict = "PATCH_CONFLICT";

const PATCH_STYLE_THEME: ThemeSpec = Object.freeze({
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

// ---------------------------------------------------------------------------
// Templates (same reviewed set as the deterministic compiler)
// ---------------------------------------------------------------------------

const BASE_FIELDS: TemplateJson = baseFieldsJson;

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

/**
 * easyui 控件模板按 proto（KF uiExtendType）注册：`easyui-base` 提供所有
 * easyui 控件共享的静态字段（type/uiModelType/objectType/version/linkMng/...），
 * 每个 proto 模板只含该控件特有的默认 options（与 control-compiler 同一套）。
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

/** CustomCharts 的 pageProperty 默认结构（docs/kf-special-node-field-map.md §2.1）。 */
const CUSTOMCHARTS_BASE_PAGE_PROPERTY: TemplateJson = {
  name: "",
  pagePos: { x: 0, y: 0 },
  pageSize: { width: 400, height: 300 },
  windowSize: { width: 1440, height: 900 },
  comment: "",
  title: "",
  titleBar: true,
  closeBox: false,
  sizeable: true,
  fontsizeable: false,
  autoUserScrollbar: false,
  windowType: 0,
  borderType: 0,
  openAlways: false,
  minLockWidth: 1200,
  minLockHeight: 500,
  lockHeightWidthScale: false,
  lockHeightWidthNum: false,
  lockAspectRatioType: 0,
  hideInOptenDialog: true,
  scaleControl: "图形模型实例",
  appOrientation: 0,
  brushArray: [],
  brushName: "纯色",
  picSrc: "",
  picPath: "",
  picName: "",
  priority: "",
  createtime: "",
  security: "",
  securitySection: "",
  resourceGroup: "",
  resourceGroupMsg: "",
  resDescriptionMap: [],
};

/** CustomCharts 模板：objectType=1，几何/name 在 pageProperty，objects[0] 是 JSON 字符串。 */
const CUSTOMCHARTS_TEMPLATE: TemplateJson = {
  prototypeName: "CustomCharts",
  objectType: 1,
  pageProperty: CUSTOMCHARTS_BASE_PAGE_PROPERTY,
  objects: [],
  modlePrototype: { name: "", guid: "", version: "2.0.0.1.1", type: 1 },
  linkMng: { linkList: [] },
  variableMng: [],
  depender: { dependObjects: [] },
  bordershow: true,
  toolTipEnable: true,
  toolTipText: "",
  fixedSize: [400, 300],
  sizePolicy: [3, 3, 0, 0],
  visible: true,
  lock: false,
  memberAccess: true,
  isControl: false,
  resDescription: {},
  version: "2.0.0.1.1",
  securityPriority: 0,
  securitySection: [],
  resourceGroup: [],
  region: "center",
  internalVertex: null,
};

/** 图表型共享模板（TrendChart/BarChart/PieChart/XYChart 公共字段，几何在顶层）。 */
function chartTemplate(
  prototypeName: string,
  chartComponentType: number,
  extra?: TemplateJson,
): TemplateJson {
  return {
    prototypeName,
    chartComponentType,
    leftTopPt: { x: 0, y: 0 },
    width: 400,
    height: 300,
    boundRect: { x: 0, y: 0, width: 400, height: 300 },
    relativePt: { x: 0, y: 0 },
    absolutePt: { x: 200, y: 150 },
    isEditLocked: false,
    isEditVisible: true,
    visible: true,
    enable: true,
    runVisible: true,
    toolTipEnable: false,
    toolTipText: "",
    securityPriority: 0,
    securitySection: [],
    resourceGroup: [],
    title: {
      show: true,
      textStyle: {
        color: "rgba(110,110,110,1)",
        fontStyle: "normal",
        fontWeight: "bolder",
        fontFamily: "sans-serif",
        fontSize: 20,
      },
      position: 1,
      text: "",
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      backgroundColor: "rgba(0,0,0,0)",
    },
    areas: [],
    areasNumStr: "1,0,0,0",
    sizePolicy: [3, 3, 0, 0],
    fixedSize: [400, 300],
    comment: "",
    memberAccess: true,
    lock: false,
    isControl: false,
    resDescription: {},
    version: "2.0.0.1.1",
    ...extra,
  };
}

/** AlarmWindow / EventWindow 共享模板（几何/字段在顶层，columns/dateSource 等数据字段保留）。 */
const ALARM_WINDOW_TEMPLATE: TemplateJson = {
  prototypeName: "AlarmWindow",
  name: "",
  leftTopPt: { x: 0, y: 0 },
  width: 500,
  height: 300,
  realAWModel: 0,
  alarmWindowType: "实时报警窗",
  columns: [],
  list: {},
  toolBar: {},
  statusBar: {},
  dateSource: "",
  dateType: "YYYY/MM/DD",
  timeType: ["小时", "分钟", "秒"],
  filterMsg: "",
  filterDataSource: "all",
  pageSizeNum: 7,
  historyNumber: 100,
  evalconfig: "",
  alarmMsgColor: "rgba(255,0,0,1)",
  alarmMsgBackColor: "",
  alarmMsgFontSize: 14,
  ackAlarmColor: "",
  ackAlarmBackColor: "",
  ackAlarmFontSize: 14,
  resumeAlarmColor: "",
  resumeAlarmBackColor: "",
  resumeAlarmFontSize: 14,
  confirmRemark: false,
  confirmCertification: false,
  backGroundColor: "rgba(255,255,255,1)",
  showAlarmTitle: true,
  showToolBar: true,
  showStatusBar: true,
  showTree: false,
  titleName: "报警",
  titleFontSize: 14,
  titleTextAlign: 0,
  titleTextVertAlign: 0,
  titleFontColor: "",
  treeBackGround: "",
  treeFontSize: 12,
  treeFontColor: "",
  treeShowLine: false,
  brushArray: [],
  brushName: "",
  picName: "",
  picPath: "",
  enable: true,
  runVisible: true,
  visible: true,
  lock: false,
  memberAccess: true,
  toolTipEnable: true,
  toolTipText: "",
  securityPriority: 0,
  securitySection: [],
  resourceGroup: [],
  fixedSize: [500, 300],
  sizePolicy: [3, 3, 0, 0],
  internalVertex: null,
  linkMng: { linkList: [] },
  comment: "",
  isControl: false,
  resDescription: {},
  version: "2.0.0.1.1",
};

const EVENT_WINDOW_TEMPLATE: TemplateJson = {
  ...ALARM_WINDOW_TEMPLATE,
  prototypeName: "EventWindow",
  alarmWindowType: "实时事件窗",
  operationEventColor: "",
  operationEventBckColor: "",
  operationEventFontSize: 14,
  securityEventColor: "",
  securityEventBckColor: "",
  securityEventFontSize: 14,
  customEventColor: "",
  customEventBckColor: "",
  customEventFontSize: 14,
};

/** prototypeName -> 特殊节点基础模板（与 control-compiler 同一套 reviewed 结构）。 */
const PROTOTYPE_TEMPLATES: Readonly<Record<string, TemplateJson>> = {
  CustomCharts: CUSTOMCHARTS_TEMPLATE,
  TrendChart: chartTemplate("TrendChart", 2, {
    trendMode: true,
    refreshMode: true,
    refreshFrequance: 1000,
  }),
  BarChart: chartTemplate("BarChart", 3),
  PieChart: chartTemplate("PieChart", 4),
  XYChart: chartTemplate("XYChart", 5),
  AlarmWindow: ALARM_WINDOW_TEMPLATE,
  EventWindow: EVENT_WINDOW_TEMPLATE,
};

/** create 时允许从 IR properties 透传覆盖的控件属性（与 client-project-ir schema 同名）。 */
const CREATE_PASS_THROUGH: Readonly<Record<string, readonly string[]>> = {
  switch: ["value", "activeText", "inactiveText"],
  checkbox: ["label", "checked"],
  radio: ["options", "value"],
  select: ["options", "value", "multiple", "placeholder"],
  image: ["src", "fit", "alt"],
  tabs: ["tabs", "activeId"],
  table: [],
  richtext: ["text"],
  spacer: ["axis"],
  radiolegacy: ["options", "value"],
  checkboxlegacy: ["label", "checked"],
  combobox: ["options", "value", "editable"],
  scale: ["min", "max", "value", "step"],
  list: ["options"],
  treeview: ["showCheckbox"],
  webcontainer: ["url", "scrollbar"],
  gantt: [],
  factorycalendar: ["value", "dateFormat"],
  input: ["value", "placeholder", "disabled", "clearable", "maxlength"],
  cascader: ["options", "placeholder", "filterable", "clearable"],
  datetimepicker: ["value", "placeholder", "format"],
  dropdown: ["options", "text", "splitButton"],
  navmenu: ["mode", "options"],
  tree: ["showCheckbox", "indent", "expandOnClickNode"],
  upload: ["action", "accept", "multiple"],
  transfer: ["options", "titles"],
  tag: ["effect", "closable", "hit"],
  timeline: ["items"],
  steps: ["active", "direction", "processStatus"],
};

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

export interface ApplyPatchOptions {
  /** When given, the plan is re-hashed and must match, else PATCH_CONFLICT. */
  planHash?: string;
  /** Parent directory for the patcher's fresh worker-local candidate. */
  workRoot?: string;
}

function filePath(rootDir: string, versionDir: string, file: string): string {
  return versionDir === "." ? path.join(rootDir, file) : path.join(rootDir, versionDir, file);
}

async function readJsonFile(rootDir: string, versionDir: string, file: string): Promise<Record<string, unknown>> {
  const full = filePath(rootDir, versionDir, file);
  return JSON.parse(await readFile(full, "utf8")) as Record<string, unknown>;
}

async function writeJsonFile(rootDir: string, versionDir: string, file: string, doc: unknown): Promise<void> {
  const full = filePath(rootDir, versionDir, file);
  await writeFile(full, JSON.stringify(doc, null, 2), "utf8");
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parentLabel(value: unknown): string {
  return typeof value === "string" ? value : "<invalid parentId>";
}

/** Container keys under which controls nest inside a page tree. */
const CONTROL_CONTAINER_KEYS = ["objects", "children", "layoutItems", "insiderObjects"] as const;
const PAGE_EDGE_PADDING = 40;

/** A located entity inside a candidate document: parent array + index + root. */
interface EntityRef {
  parent: unknown[];
  index: number;
  root: Record<string, unknown>;
}

/** Recursively locates a control by its KF GUID anywhere in the page tree. */
function findControlRef(node: unknown, guid: string): EntityRef | undefined {
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i += 1) {
      const item: unknown = node[i];
      if (isObject(item) && item["guid"] === guid) {
        return { parent: node, index: i, root: item };
      }
      const found = findControlRef(item, guid);
      if (found !== undefined) return found;
    }
    return undefined;
  }
  if (isObject(node)) {
    for (const key of CONTROL_CONTAINER_KEYS) {
      if (key in node) {
        const found = findControlRef(node[key], guid);
        if (found !== undefined) return found;
      }
    }
  }
  return undefined;
}

function controlBounds(node: unknown): { right: number; bottom: number } {
  let right = 0;
  let bottom = 0;
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isObject(value)) return;
    if (typeof value["uiModelType"] === "number") {
      const leftTop = asRecord(value["leftTopPt"]);
      right = Math.max(right, asNumber(leftTop["x"]) + asNumber(value["width"]));
      bottom = Math.max(bottom, asNumber(leftTop["y"]) + asNumber(value["height"]));
    }
    for (const key of CONTROL_CONTAINER_KEYS) {
      if (key in value) visit(value[key]);
    }
  };
  visit(node);
  return { right, bottom };
}

async function growPagesToFitControls(
  candidate: string,
  versionDir: string,
  inspection: InspectResult,
  pageGuids: ReadonlySet<string>,
): Promise<void> {
  const manager = await readJsonFile(candidate, versionDir, "project/pageManager.json");
  const managerPages = Array.isArray(manager["Pages"])
    ? (manager["Pages"] as Array<Record<string, unknown>>)
    : [];
  let managerChanged = false;

  for (const page of Object.values(inspection.index.pages)) {
    if (!pageGuids.has(page.guid)) continue;
    const doc = await readJsonFile(candidate, versionDir, page.file);
    const pageProperty = asRecord(doc["pageProperty"]);
    const pageSize = asRecord(pageProperty["pageSize"]);
    const currentWidth = asNumber(pageSize["width"]) || asNumber(doc["pageViewWidth"]);
    const currentHeight = asNumber(pageSize["height"]) || asNumber(doc["pageViewHeight"]);
    const bounds = controlBounds(doc["objects"]);
    const width = bounds.right > currentWidth
      ? bounds.right + PAGE_EDGE_PADDING
      : currentWidth;
    const height = bounds.bottom > currentHeight
      ? bounds.bottom + PAGE_EDGE_PADDING
      : currentHeight;
    if (width === currentWidth && height === currentHeight) continue;

    pageProperty["pageSize"] = { width, height };
    pageProperty["windowSize"] = { width, height };
    await writeJsonFile(candidate, versionDir, page.file, doc);

    const managerPage = managerPages.find((entry) => entry["id"] === page.guid);
    if (managerPage !== undefined) {
      managerPage["width"] = width;
      managerPage["height"] = height;
      managerPage["resolution"] = `${width} * ${height}`;
      managerChanged = true;
    }
  }

  if (managerChanged) {
    await writeJsonFile(candidate, versionDir, "project/pageManager.json", manager);
  }
}

/** Locates a variable by its semantic name inside a Tag file's Variables array. */
function findVariableRef(doc: Record<string, unknown>, name: string): EntityRef | undefined {
  const variables = Array.isArray(doc["Variables"]) ? (doc["Variables"] as unknown[]) : [];
  for (let i = 0; i < variables.length; i += 1) {
    const item = variables[i];
    if (isObject(item) && item["name"] === name) {
      return { parent: variables, index: i, root: item };
    }
  }
  return undefined;
}

/**
 * Locates the entity root inside a candidate file. Controls and variables are
 * re-located by their IDENTITY (KF GUID / variable name) instead of the base
 * index pointer: earlier confirmed deletes shrink the candidate array, so a
 * base pointer would index drift or go out of bounds.
 */
async function entityRootOf(
  rootDir: string,
  versionDir: string,
  loc: EntityLocation,
): Promise<{ doc: Record<string, unknown>; root: Record<string, unknown>; ref: EntityRef | undefined }> {
  const doc = await readJsonFile(rootDir, versionDir, loc.file);
  const ref =
    loc.kind === "control" && loc.guid !== undefined
      ? findControlRef(doc, loc.guid)
      : loc.kind === "variable" && loc.name !== undefined
        ? findVariableRef(doc, loc.name)
        : undefined;
  if (ref !== undefined) return { doc, root: ref.root, ref };

  // Fallback (page entity / identity missing): resolve the base pointer.
  const tokens = parseFragmentPointer(loc.pointer);
  let node: unknown = doc;
  for (const token of tokens) {
    if (node !== null && typeof node === "object") {
      node = (node as Record<string, unknown>)[token];
    } else {
      throw new PatchConflictError(`entity not found at ${loc.file}${loc.pointer}`);
    }
  }
  if (node === null || typeof node !== "object" || Array.isArray(node)) {
    throw new PatchConflictError(`entity not found at ${loc.file}${loc.pointer}`);
  }
  return { doc, root: node as Record<string, unknown>, ref: undefined };
}

async function applyUpdate(
  candidate: string,
  versionDir: string,
  inspection: InspectResult,
  baseRoot: string,
  op: NormalizedOperation,
  workspaceId: string,
): Promise<void> {
  const loc = await locateEntity(baseRoot, inspection.index, versionDir, op.entityId, op.entityType);
  const { doc, root } = await entityRootOf(candidate, versionDir, loc);
  const allowed = allowedFieldsFor({
    kind: loc.kind,
    ...(isControlLocation(loc) && loc.controlType !== undefined
      ? { controlType: loc.controlType }
      : {}),
  });
  // KF 特殊节点：prototypeName 从候选节点读取（决定几何路径映射，
  // 例如 CustomCharts 几何在 pageProperty.pagePos/pageSize）。
  const prototypeName =
    isControlLocation(loc) && loc.controlType === "prototype"
      ? typeof root["prototypeName"] === "string"
        ? root["prototypeName"]
        : undefined
      : undefined;
  for (const change of op.changes) {
    if (change.path === "") {
      throw new PatchConflictError("update patch path must address a field, not the entity root");
    }
    const tokens = parseJsonPointer(change.path);
    const firstToken = tokens[0] as string;
    if (!allowed.has(firstToken)) {
      throw new PatchConflictError(
        `path "/${firstToken}" is not allowlisted for ${loc.kind}${
          isControlLocation(loc) ? `/${loc.controlType ?? "control"}` : ""
        }`,
      );
    }
    const resolvedPath = isControlLocation(loc)
      ? resolveControlPathFor(loc.controlType, change.path, prototypeName)
      : change.path;
    let value = change.value;
    if (isControlLocation(loc) && loc.controlType === "button" && change.path === "/linkMng") {
      if (value === null) {
        value = { linkList: [] };
      } else {
        const parsedAction = RestrictedActionSchema.safeParse(value);
        if (!parsedAction.success) throw new PatchConflictError("button linkMng update requires a reviewed RestrictedAction or null");
        try {
          value = { linkList: [compileAction(parsedAction.data, {
            variableGroupGuid: "",
            pageGroupGuid: "",
            resolvePageGuid: (pageId) => {
              const target = Object.values(inspection.index.pages).find((page) => page.id === pageId || page.name === pageId);
              if (target === undefined) throw new Error(`unknown page ${pageId}`);
              return target.guid;
            },
            resolveVariableName: (id) => id,
          })] };
        } catch (error) {
          throw new PatchConflictError(`invalid button action: ${error instanceof Error ? error.message : "unknown"}`);
        }
      }
    }
    if (
      isControlLocation(loc)
      && loc.controlType === "layout"
      && change.path === "/children"
      && Array.isArray(value)
    ) {
      const baseProperty = asRecord(root["baseProperty"]);
      const parentId = typeof baseProperty["name"] === "string"
        ? baseProperty["name"]
        : op.entityId;
      value = ensureChildGuids(
        { seed: workspaceId },
        structuredClone(value) as unknown[],
        parentId,
      );
    }
    setByTokens(root, parseJsonPointer(resolvedPath), value);
  }
  await writeJsonFile(candidate, versionDir, loc.file, doc);
}

function capabilityIdForImportedControl(
  controlType: string | undefined,
  control: Record<string, unknown>,
): string {
  if (controlType === "easyui") return `easyui.${asNumber(control["uiExtendType"])}`;
  if (controlType === "layout") return `layout.${asNumber(control["layoutType"])}`;
  if (controlType === "prototype") {
    return `prototype.${typeof control["prototypeName"] === "string" ? control["prototypeName"] : ""}`;
  }
  return controlType ?? "";
}

const CREATE_SYSTEM_PROPERTY_KEYS = new Set([
  "pageId",
  "type",
  "proto",
  "layoutType",
  "prototypeName",
  "x",
  "y",
  "width",
  "height",
  "style",
  "parentId",
]);

const createCoordinate = z.number().finite().min(-MAX_CONTROL_GEOMETRY).max(MAX_CONTROL_GEOMETRY).optional();
const createSize = z.number().finite().positive().max(MAX_CONTROL_GEOMETRY).optional();
const CREATE_CONTROL_ENVELOPE_SCHEMA = z.object({
  pageId: z.string().min(1).max(100),
  type: z.string().min(1).max(100),
  proto: z.number().int().optional(),
  layoutType: z.number().int().optional(),
  prototypeName: z.string().min(1).max(100).optional(),
  x: createCoordinate,
  y: createCoordinate,
  width: createSize,
  height: createSize,
  style: ComponentStyleSpecSchema.optional(),
  parentId: z.string().min(1).max(100).optional(),
}).strict().superRefine((value, ctx) => {
  const discriminatorKeys = ["proto", "layoutType", "prototypeName"] as const;
  const rejectUnexpectedDiscriminators = (expected?: (typeof discriminatorKeys)[number]) => {
    for (const key of discriminatorKeys) {
      if (key !== expected && value[key] !== undefined) {
        ctx.addIssue({ code: "custom", path: [key], message: `${key} is inconsistent with type ${value.type}` });
      }
    }
  };
  if (Object.hasOwn(CONTROL_TEMPLATES, value.type)) {
    rejectUnexpectedDiscriminators();
    addGeometryIssues(value.type);
    return;
  }
  if (value.type === "easyui") {
    rejectUnexpectedDiscriminators("proto");
    if (value.proto === undefined || !Object.hasOwn(EASYUI_TEMPLATES, value.proto)) {
      ctx.addIssue({ code: "custom", path: ["proto"], message: "proto must identify a reviewed EasyUI template" });
    }
    addGeometryIssues(`easyui.${String(value.proto)}`);
    return;
  }
  if (value.type === "layout") {
    rejectUnexpectedDiscriminators("layoutType");
    if (value.layoutType === undefined || ![0, 2, 3, 4, 5, 6].includes(value.layoutType)) {
      ctx.addIssue({ code: "custom", path: ["layoutType"], message: "layoutType must identify a reviewed layout" });
    }
    addGeometryIssues(`layout.${String(value.layoutType)}`);
    return;
  }
  if (value.type === "prototype") {
    rejectUnexpectedDiscriminators("prototypeName");
    if (value.prototypeName === undefined || !Object.hasOwn(PROTOTYPE_TEMPLATES, value.prototypeName)) {
      ctx.addIssue({ code: "custom", path: ["prototypeName"], message: "prototypeName must identify a reviewed prototype" });
    }
    addGeometryIssues(`prototype.${String(value.prototypeName)}`);
    return;
  }
  ctx.addIssue({ code: "custom", path: ["type"], message: `type ${value.type} has no reviewed template` });

  function addGeometryIssues(capabilityId: string): void {
    for (const issue of controlGeometryIssues(capabilityId, value)) {
      ctx.addIssue({ code: "custom", path: [issue.field], message: issue.message });
    }
  }
});

function capabilityIdForCreateProperties(properties: Record<string, unknown>): string {
  const type = properties["type"] as string;
  if (type === "easyui") return `easyui.${properties["proto"] as number}`;
  if (type === "layout") return `layout.${properties["layoutType"] as number}`;
  if (type === "prototype") {
    return `prototype.${typeof properties["prototypeName"] === "string" ? properties["prototypeName"] : ""}`;
  }
  return type;
}

function validateCreateControlProperties(properties: Record<string, unknown>): Record<string, unknown> {
  const systemInput = Object.fromEntries(
    Object.entries(properties).filter(([key]) => CREATE_SYSTEM_PROPERTY_KEYS.has(key)),
  );
  if (!Object.hasOwn(systemInput, "type")) systemInput["type"] = "button";
  const envelope = CREATE_CONTROL_ENVELOPE_SCHEMA.safeParse(systemInput);
  if (!envelope.success) {
    const detail = envelope.error.issues
      .map((issue) => `${issue.path.join(".") || "properties"}: ${issue.message}`)
      .join("; ");
    throw new PatchConflictError(`INVALID_CREATE_CONTROL_ENVELOPE: ${detail}`);
  }
  const semanticProperties = Object.fromEntries(
    Object.entries(properties).filter(([key]) => !CREATE_SYSTEM_PROPERTY_KEYS.has(key)),
  );
  try {
    const validated = validateCreateComponentProperties(capabilityIdForCreateProperties(envelope.data), semanticProperties);
    return { ...envelope.data, ...validated };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new PatchConflictError(detail, { cause: error });
  }
}

/** Applies only reviewed, allowlisted native style fields to a raw KF control. */
function applyStyleToControl(
  control: Record<string, unknown>,
  controlType: string | undefined,
  style: ComponentStyleSpec,
): boolean {
  let compiled;
  try {
    compiled = compileControlStyle({
      capabilityId: capabilityIdForImportedControl(controlType, control),
      theme: PATCH_STYLE_THEME,
      instanceStyle: style,
      runtimeProfile: KF36_RUNTIME_PROFILE,
    });
    assertStyleCompilationAccepted(capabilityIdForImportedControl(controlType, control), compiled);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new PatchConflictError(detail, { cause: error });
  }
  const allowed = allowedFieldsFor({ kind: "control", ...(controlType ? { controlType } : {}) });
  let changed = false;
  for (const [field, value] of Object.entries(compiled.nativeFields)) {
    if (!allowed.has(field)) {
      throw new PatchConflictError(`style native field "${field}" is not allowlisted for control/${controlType ?? "unknown"}`);
    }
    if (control[field] !== value) {
      control[field] = value;
      changed = true;
    }
  }
  if (compiled.styleDataNew !== "") {
    if (!allowed.has("styleDataNew")) {
      throw new PatchConflictError(`styleDataNew is not allowlisted for control/${controlType ?? "unknown"}`);
    }
    try {
      const merged = mergeManagedStyleData(control["styleDataNew"], compiled.styleDataNew);
      if (merged !== control["styleDataNew"]) {
        control["styleDataNew"] = merged;
        changed = true;
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      throw new PatchConflictError(detail, { cause: error });
    }
  }
  return changed;
}

async function applyStyle(
  candidate: string,
  versionDir: string,
  inspection: InspectResult,
  baseRoot: string,
  op: NormalizedOperation,
): Promise<void> {
  if (op.style === undefined) {
    throw new PatchConflictError("applyStyle operation is missing its validated style");
  }
  const loc = await locateEntity(baseRoot, inspection.index, versionDir, op.entityId, op.entityType);
  if (!isControlLocation(loc)) {
    throw new PatchConflictError(`applyStyle target "${op.entityId}" is not a control`);
  }
  const { doc, root } = await entityRootOf(candidate, versionDir, loc);
  if (!applyStyleToControl(root, loc.controlType, op.style)) return;
  await writeJsonFile(candidate, versionDir, loc.file, doc);
}

async function applyDelete(
  candidate: string,
  versionDir: string,
  inspection: InspectResult,
  baseRoot: string,
  op: NormalizedOperation,
): Promise<void> {
  if (op.destructiveConfirmed !== true) {
    throw new PatchConflictError(`delete of "${op.entityId}" requires destructiveConfirmed=true`);
  }
  if (op.digest === undefined) {
    throw new PatchConflictError(`delete of "${op.entityId}" requires an operation digest`);
  }
  const expected = deleteOperationDigest(op.entityId);
  if (op.digest !== expected) {
    throw new PatchConflictError(
      `delete of "${op.entityId}" has a mismatched operation digest (operation content changed)`,
    );
  }
  const loc = await locateEntity(baseRoot, inspection.index, versionDir, op.entityId, op.entityType);
  if (loc.kind === "control" || loc.kind === "variable") {
    const { doc, ref } = await entityRootOf(candidate, versionDir, loc);
    if (ref === undefined) {
      throw new PatchConflictError(`entity "${op.entityId}" not found in the candidate`);
    }
    ref.parent.splice(ref.index, 1);
    await writeJsonFile(candidate, versionDir, loc.file, doc);
    return;
  }
  // page: remove the page file and its pageManager entry.
  await rm(filePath(candidate, versionDir, loc.file));
  const manager = await readJsonFile(candidate, versionDir, "project/pageManager.json");
  const pages = Array.isArray(manager["Pages"]) ? (manager["Pages"] as Array<Record<string, unknown>>) : [];
  const entryIndex = pages.findIndex((p) => p["id"] === op.entityId);
  if (entryIndex >= 0) pages.splice(entryIndex, 1);
  await writeJsonFile(candidate, versionDir, "project/pageManager.json", manager);
}

/**
 * 把新建控件插入指定布局的 insiderObjects（LLM 用 properties.parentId 表达容器
 * 嵌套，如「在垂直布局里放两个按钮」。调用方对显式 parentId 必须将 false 视为
 * 冲突，绝不能静默回退到页面顶层。输入几何始终是页面绝对坐标；这里在写入
 * insiderObjects 前递归计算父布局的绝对原点并转换为父局部坐标。KF 布局子控件
 * 还需要内部定位字段：Docking 用 region、水平/垂直/导航布局用 internalVertex。
 */
function pushControlIntoParent(
  objects: unknown[],
  control: Record<string, unknown>,
  parentId: unknown,
  hasExplicitPosition = true,
): boolean {
  const target = typeof parentId === "string" ? parentId : "";
  if (target === "") return false;
  type LocatedLayout = { node: Record<string, unknown>; origin: { x: number; y: number } };
  const matches = (node: Record<string, unknown>): boolean => {
    const base = asRecord(node["baseProperty"]);
    return node["name"] === target
      || base["name"] === target
      || node["guid"] === target
      || base["guid"] === target;
  };
  const findLayout = (nodes: unknown[], origin = { x: 0, y: 0 }): LocatedLayout | undefined => {
    for (const node of nodes) {
      if (!isObject(node)) continue;
      const base = asRecord(node["baseProperty"]);
      const point = asRecord(base["leftTopPt"]);
      if (matches(node)) {
        return typeof node["layoutType"] === "number"
          ? { node, origin: { x: origin.x + asNumber(point["x"]), y: origin.y + asNumber(point["y"]) } }
          : undefined;
      }
      const nested = Array.isArray(node["insiderObjects"]) ? node["insiderObjects"] as unknown[] : [];
      const found = findLayout(nested, { x: origin.x + asNumber(point["x"]), y: origin.y + asNumber(point["y"]) });
      if (found !== undefined) return found;
    }
    return undefined;
  };
  const located = findLayout(objects);
  if (located === undefined) return false;
  const { node: rec, origin } = located;
  const parentBase = asRecord(rec["baseProperty"]);
  const parentWidth = asNumber(parentBase["width"]);
  const parentHeight = asNumber(parentBase["height"]);
  const childBase = asRecord(control["baseProperty"]);
  const childIsLayout = Object.keys(childBase).length > 0;
  const currentPoint = childIsLayout ? asRecord(childBase["leftTopPt"]) : asRecord(control["leftTopPt"]);
  // Legacy direct ChangePlans may omit x/y for a container child. In that
  // case no page-space coordinate was supplied, so preserve the old safe
  // semantic of the parent origin (local 0,0); supplied coordinates are
  // always page-absolute and are translated below.
  const absoluteX = hasExplicitPosition ? asNumber(currentPoint["x"]) : origin.x;
  const absoluteY = hasExplicitPosition ? asNumber(currentPoint["y"]) : origin.y;
  const localX = absoluteX - origin.x;
  const localY = absoluteY - origin.y;
  const width = childIsLayout ? asNumber(childBase["width"]) : asNumber(control["width"]);
  const height = childIsLayout ? asNumber(childBase["height"]) : asNumber(control["height"]);
  if (localX < 0 || localY < 0 || (parentWidth > 0 && localX + width > parentWidth) || (parentHeight > 0 && localY + height > parentHeight)) return false;
  if (childIsLayout) {
    childBase["leftTopPt"] = { x: localX, y: localY };
  } else {
    control["leftTopPt"] = { x: localX, y: localY };
  }
  if (!Array.isArray(rec["insiderObjects"])) rec["insiderObjects"] = [];
  const lt = rec["layoutType"];
  if (lt === 5) {
    // Docking 布局：子对象用 region 定位，缺省 center
    if (control["region"] === undefined) control["region"] = "center";
  } else if (lt === 2 || lt === 4 || lt === 6) {
    // 水平/垂直/导航布局：子对象用 internalVertex 定位，缺省 {0,0}
    if (control["internalVertex"] === undefined) {
      control["internalVertex"] = { left: localX, top: localY };
    }
  }
  (rec["insiderObjects"] as unknown[]).push(control);
  return true;
}

async function applyCreate(
  candidate: string,
  versionDir: string,
  inspection: InspectResult,
  baseRoot: string,
  op: NormalizedOperation,
  workspaceId: string,
): Promise<void> {
  const build = { seed: workspaceId };
  switch (op.entityType) {
    case "control": {
      const properties = validateCreateControlProperties(op.properties);
      const pageId = properties["pageId"];
      if (typeof pageId !== "string") {
        throw new PatchConflictError("create control requires properties.pageId (page GUID)");
      }
      const page = inspection.index.pages[pageId];
      if (page === undefined) throw new PatchConflictError(`create control: page "${pageId}" not found`);
      const type = typeof properties["type"] === "string" ? (properties["type"]) : "button";
      const parsedStyle = properties["style"] === undefined
        ? undefined
        : ComponentStyleSpecSchema.safeParse(properties["style"]);
      if (parsedStyle !== undefined && !parsedStyle.success) {
        throw new PatchConflictError("create control properties.style is not a valid ComponentStyleSpec");
      }
      const style = parsedStyle?.data;
      const guid = deriveGuid(build, op.entityId);
      const doc = await readJsonFile(candidate, versionDir, page.file);
      const objects = Array.isArray(doc["objects"]) ? (doc["objects"] as unknown[]) : [];

      if (type === "easyui") {
        // easyui 控件：objectType=3 + uiExtendType(proto)。模板 = base + easyui-base
        // + proto 专用模板，透传仅限该 proto 白名单字段（EASYUI_PROTO_FIELDS[proto]）。
        const proto = asNumber(properties["proto"]);
        const protoTemplate = EASYUI_TEMPLATES[proto];
        if (protoTemplate === undefined) {
          throw new PatchConflictError(
            `create easyui control: no reviewed template for proto ${proto} (uiExtendType; supported: ${Object.keys(EASYUI_TEMPLATES).join(", ")})`,
          );
        }
        const pass: Record<string, unknown> = {};
        // IR 保留字段名绝不能透传（同 compileEasyuiControl）：type 是判别值 "easyui"，
        // uiModelType 会在 KF 加载时覆盖 easyui 实例。
        const RESERVED_IR_FIELDS = new Set([
          "type", "proto", "uiExtendType", "id", "name", "guid",
          "x", "y", "width", "height", "uiModelType",
        ]);
        for (const field of EASYUI_PROTO_FIELDS[proto] ?? []) {
          if (RESERVED_IR_FIELDS.has(field)) continue;
          const value = properties[field];
          if (value !== undefined) pass[field] = value;
        }
        const overrides: TemplateJson = {
          name: op.entityId,
          guid,
          leftTopPt: { x: asNumber(properties["x"]), y: asNumber(properties["y"]) },
          uiExtendType: proto,
          ...pass,
        };
        if (properties["width"] !== undefined) overrides["width"] = asNumber(properties["width"]);
        if (properties["height"] !== undefined) overrides["height"] = asNumber(properties["height"]);
        const control = mergeControlTemplate(
          mergeControlTemplate(mergeControlTemplate(BASE_FIELDS, easyuiBaseTemplate), protoTemplate),
          overrides,
        );
        // DateBox（proto 11）KF 序列化不带 objectType（同 compileEasyuiControl）
        if (proto === 11) {
          delete control["objectType"];
        }
        if (style !== undefined) applyStyleToControl(control, type, style);
        // 显式 parentId 是结构契约：目标不存在或不是布局时不能悄悄改成顶层控件。
        const parentId = properties["parentId"];
        if (parentId === undefined) objects.push(control);
        else if (!pushControlIntoParent(objects, control, parentId, properties["x"] !== undefined || properties["y"] !== undefined)) throw new PatchConflictError(`create easyui control: parent "${parentLabel(parentId)}" not found or is not a layout`);
      } else if (type === "layout") {
        // 布局容器：objectType=2 + layoutType 顶层；几何进 baseProperty；
        // children/panels 作为整体写入 insiderObjects/dPanelsOption（嵌套 JSON patch 复杂，整体 set 最稳）。
        const overrides: TemplateJson = {
          layoutType: asNumber(properties["layoutType"]),
          baseProperty: {
            name: op.entityId,
            guid,
            leftTopPt: { x: asNumber(properties["x"]), y: asNumber(properties["y"]) },
            width: asNumber(properties["width"]) || 200,
            height: asNumber(properties["height"]) || 200,
          },
        };
        if (properties["children"] !== undefined) {
          // 布局子对象补 guid（KF 要求 insiderObjects 子对象有 guid，否则 inspect
          // 无法索引、后续 LLM 无法引用修改）；与 compileLayoutControl 一致。
          const children = properties["children"];
          if (Array.isArray(children)) {
            overrides["insiderObjects"] = ensureChildGuids(
              { seed: workspaceId },
              children as unknown[],
              op.entityId,
            );
          }
        }
        if (properties["panels"] !== undefined) overrides["dPanelsOption"] = properties["panels"];
        const control = mergeControlTemplate(layoutTemplate, overrides);
        if (style !== undefined) applyStyleToControl(control, type, style);
        const parentId = properties["parentId"];
        if (parentId === undefined) objects.push(control);
        else if (!pushControlIntoParent(objects, control, parentId, properties["x"] !== undefined || properties["y"] !== undefined)) throw new PatchConflictError(`create layout: parent "${parentLabel(parentId)}" not found or is not a layout`);
      } else if (type === "prototype") {
        // KF 特殊节点（prototypeName 判别）：模板 = 该原型的基础字段 + 宽容
        // 透传（prototype IR 是 passthrough）。判别/身份/几何字段不透传；
        // 复杂配置（pageProperty/objects/areas/columns）作为整体覆盖。
        const prototypeName = requireString(
          properties["prototypeName"],
          "create prototype control requires properties.prototypeName",
        );
        const protoTemplate = PROTOTYPE_TEMPLATES[prototypeName];
        if (protoTemplate === undefined) {
          throw new PatchConflictError(
            `create prototype control: no reviewed template for prototypeName "${prototypeName}" (supported: ${Object.keys(PROTOTYPE_TEMPLATES).join(", ")})`,
          );
        }
        const RESERVED_PROTOTYPE_FIELDS = new Set([
          "type", "prototypeName", "id", "name", "guid",
          "x", "y", "width", "height", "pageId", "uiModelType", "style",
        ]);
        const pass: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(properties)) {
          if (RESERVED_PROTOTYPE_FIELDS.has(key) || value === undefined) continue;
          pass[key] = value;
        }
        const overrides: TemplateJson = { ...pass, guid };
        if (prototypeName === "CustomCharts") {
          // CustomCharts 几何/name 在 pageProperty（窗口型容器）：pagePos/pageSize
          // 由 create 几何决定，用户提供的 pageProperty 其余字段浅合并。
          const pageProperty: TemplateJson = {
            ...CUSTOMCHARTS_BASE_PAGE_PROPERTY,
            ...(isObject(pass["pageProperty"])
              ? pass["pageProperty"]
              : {}),
            name: op.entityId,
            pagePos: { x: asNumber(properties["x"]), y: asNumber(properties["y"]) },
            pageSize: {
              width: asNumber(properties["width"]) || 400,
              height: asNumber(properties["height"]) || 300,
            },
          };
          overrides["pageProperty"] = pageProperty;
          overrides["fixedSize"] = [
            (pageProperty["pageSize"] as Record<string, unknown>)["width"],
            (pageProperty["pageSize"] as Record<string, unknown>)["height"],
          ];
        } else {
          // 图表型 / 告警窗 / 事件窗：几何在顶层 leftTopPt/width/height。
          overrides["name"] = op.entityId;
          overrides["leftTopPt"] = { x: asNumber(properties["x"]), y: asNumber(properties["y"]) };
          overrides["width"] = asNumber(properties["width"]) || 400;
          overrides["height"] = asNumber(properties["height"]) || 300;
          overrides["fixedSize"] = [overrides["width"], overrides["height"]];
        }
        const control = mergeControlTemplate(protoTemplate, overrides);
        if (style !== undefined) applyStyleToControl(control, type, style);
        objects.push(control);
      } else {
        const template = CONTROL_TEMPLATES[type];
        if (template === undefined) {
          throw new PatchConflictError(
            `create control: no reviewed template for type "${type}" (supported: ${Object.keys(CONTROL_TEMPLATES).join(", ")})`,
          );
        }
        const overrides: TemplateJson = {
          name: op.entityId,
          guid,
          leftTopPt: { x: asNumber(properties["x"]), y: asNumber(properties["y"]) },
          width: asNumber(properties["width"]) || 90,
          height: asNumber(properties["height"]) || 60,
        };
        if (type === "button" || type === "text") {
          if (typeof properties["text"] === "string") overrides["text"] = properties["text"];
        }
        if (type === "inputnumber") {
          if (typeof properties["precision"] === "number") overrides["precision"] = properties["precision"];
        }
        for (const key of CREATE_PASS_THROUGH[type] ?? []) {
          const value = properties[key];
          if (value !== undefined) (overrides as Record<string, unknown>)[key] = value;
        }
        const control = mergeControlTemplate(mergeControlTemplate(BASE_FIELDS, template), overrides);
        if (type === "button" && properties["action"] !== undefined) {
          const action = properties["action"] as RestrictedAction;
          try {
            const command = compileAction(action, {
              variableGroupGuid: "", pageGroupGuid: "",
              resolvePageGuid: (pageId) => {
                const target = Object.values(inspection.index.pages).find((candidate) => candidate.id === pageId || candidate.name === pageId);
                if (target === undefined) throw new Error(`unknown page ${pageId}`);
                return target.guid;
              },
              resolveVariableName: (variableId) => variableId,
            });
            control["linkMng"] = { linkList: [command] };
          } catch (error) {
            throw new PatchConflictError(`invalid button action: ${error instanceof Error ? error.message : "unknown"}`);
          }
        }
        if (style !== undefined) applyStyleToControl(control, type, style);
        // 静态控件也可用 parentId 放进布局（同 easyui 分支）
        const parentId = properties["parentId"];
        if (parentId === undefined) objects.push(control);
        else if (!pushControlIntoParent(objects, control, parentId, properties["x"] !== undefined || properties["y"] !== undefined)) throw new PatchConflictError(`create control: parent "${parentLabel(parentId)}" not found or is not a layout`);
      }
      await writeJsonFile(candidate, versionDir, page.file, doc);
      break;
    }
    case "variable": {
      const groupFile = await resolveVariableGroupFile(inspection.index, baseRoot, versionDir);
      const doc = await readJsonFile(candidate, versionDir, groupFile);
      const variables = Array.isArray(doc["Variables"]) ? (doc["Variables"] as unknown[]) : [];
      const nextId =
        variables.reduce<number>((max, v) => {
          const rec = v as Record<string, unknown>;
          return Math.max(max, typeof rec["id"] === "number" ? (rec["id"]) : 0);
        }, 0) + 1;
      const defaultValue = op.properties["defaultValue"] ?? 0;
      variables.push({
        name: op.entityId,
        dataType: asNumber(op.properties["dataType"]) || 1,
        id: nextId,
        comment: typeof op.properties["comment"] === "string" ? op.properties["comment"] : "",
        defaultValue,
        isMap: false,
        basicItem: { defaultValue, maxValue: 999999, minValue: -999999, deadZone: 0 },
      });
      await writeJsonFile(candidate, versionDir, groupFile, doc);
      break;
    }
    case "page": {
      const name = op.entityId;
      if (name === "" || /[\\/\0]/.test(name)) {
        throw new PatchConflictError(`unsafe page name "${name}"`);
      }
      const guid = deriveGuid(build, name);
      const json: TemplateJson = structuredClone(pageSkeleton);
      json["guid"] = guid;
      (json["pageProperty"] as Record<string, unknown>)["name"] = name;
      json["objects"] = [];
      json["pagePrototype"] = { name, guid, version: json["version"], type: json["objectType"] };
      await writeJsonFile(candidate, versionDir, `project/page/${name}.json`, json);
      const manager = await readJsonFile(candidate, versionDir, "project/pageManager.json");
      const pages = Array.isArray(manager["Pages"]) ? (manager["Pages"] as unknown[]) : [];
      pages.push({
        name,
        description: "",
        height: 720,
        width: 1280,
        positionX: 0,
        positionY: 0,
        pageType: 0,
        state: true,
        resolution: "1280 * 720",
        id: guid,
        groupId: inspection.summary.project.guid ?? "",
        security: "",
        createtime: "",
        priority: "",
        securitySection: "",
        user: "admin",
        resourceGroup: "",
        resourceGroupMsg: "",
      });
      await writeJsonFile(candidate, versionDir, "project/pageManager.json", manager);
      break;
    }
    default:
      throw new PatchConflictError(`create entityType "${op.entityType}" is not supported`);
  }
}

function assertPatchGeneratedGuidUniqueness(
  plan: NormalizedPlan,
  inspection: InspectResult,
): void {
  const owners = new Map<string, string>();
  for (const guid of Object.keys(inspection.index.controls)) owners.set(guid, `existing control ${guid}`);
  for (const guid of Object.keys(inspection.index.pages)) owners.set(guid, `existing page ${guid}`);
  for (const variable of Object.values(inspection.index.variables)) {
    if (variable.guid !== "") owners.set(variable.guid, `existing variable ${variable.id}`);
  }
  const register = (guid: string, owner: string): void => {
    const existing = owners.get(guid);
    if (existing !== undefined) {
      throw new PatchConflictError(`GENERATED_GUID_COLLISION: ${owner} collides with ${existing}`);
    }
    owners.set(guid, owner);
  };

  for (const op of plan.operations) {
    if (op.op !== "create" || (op.entityType !== "control" && op.entityType !== "page")) continue;
    register(deriveGuid({ seed: plan.workspaceId }, op.entityId), `create ${op.entityType ?? "entity"} ${op.entityId}`);
  }
  for (const op of plan.operations) {
    if (op.op !== "create" || op.entityType !== "control") continue;
    const properties = validateCreateControlProperties(op.properties);
    if (properties["type"] !== "layout" || !Array.isArray(properties["children"])) continue;
    for (const child of properties["children"] as unknown[]) {
      if (child === null || typeof child !== "object" || Array.isArray(child)) continue;
      const base = (child as Record<string, unknown>)["baseProperty"];
      if (base === null || typeof base !== "object" || Array.isArray(base)) continue;
      const name = (base as Record<string, unknown>)["name"];
      if (typeof name !== "string") continue;
      register(
        deriveGuid({ seed: plan.workspaceId }, `child:${op.entityId}:${name}`),
        `layout child ${op.entityId}/${name}`,
      );
    }
  }
}

/**
 * Applies a confirmed change plan to `base` and returns a fresh candidate
 * workspace. `base` is never modified.
 */
export async function applyClientPatch(
  base: string,
  input: unknown,
  options?: ApplyPatchOptions,
): Promise<ClientWorkspace> {
  const plan = normalizeChangePlan(input);
  if (options?.planHash !== undefined) {
    const actual = planHash(plan);
    if (actual !== options.planHash) {
      throw new PatchConflictError(`planHash mismatch (expected ${options.planHash}, got ${actual})`);
    }
  }

  const versionDir = await resolveVersionDirName(base);
  const inspection = await inspectClientProject(base);
  assertPatchGeneratedGuidUniqueness(plan, inspection);
  const pagesNeedingBoundsCheck = new Set(
    plan.operations
      .filter((op) => op.op === "create" && op.entityType === "control")
      .map((op) => op.properties["pageId"])
      .filter((pageId): pageId is string => typeof pageId === "string"),
  );
  const candidate = await mkdtemp(
    path.join(options?.workRoot ?? tmpdir(), "kf-client-candidate-"),
  );
  await cp(base, candidate, { recursive: true });

  for (const op of plan.operations) {
    if (op.op === "create") {
      await applyCreate(candidate, versionDir, inspection, base, op, plan.workspaceId);
    } else if (op.op === "update") {
      await applyUpdate(candidate, versionDir, inspection, base, op, plan.workspaceId);
    } else if (op.op === "applyStyle") {
      await applyStyle(candidate, versionDir, inspection, base, op);
    } else {
      await applyDelete(candidate, versionDir, inspection, base, op);
    }
  }

  await growPagesToFitControls(candidate, versionDir, inspection, pagesNeedingBoundsCheck);

  return { id: plan.workspaceId, rootDir: candidate, mode: "candidate", path: candidate };
}

export type { EntityIndex };
