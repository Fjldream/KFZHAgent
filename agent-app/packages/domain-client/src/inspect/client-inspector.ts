import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import {
  CONTROL_TYPE_BY_UIMODEL_TYPE,
  EasyuiControlIR,
  LayoutContainerIR,
  SpecialNodeIR,
  type ControlIR,
} from "../ir/client-project-ir.js";
import { EASYUI_PROTO_FIELDS } from "../ir/easyui-types.js";
import { parseTableData } from "../modules/definitions/native-data-adapters.js";
import { classifyNativeRuntimeControl, type NativeRuntimeControlType } from "./native-runtime-type.js";

/**
 * 无损客户端项目检查器。
 *
 * 消费一个解包的原生客户端工作区（由 `importNativeClientPackage` 生成），并产生：
 * - `raw`: 完整、未处理的 JSON 树（页面、变量、脚本、项目元数据）——没有任何内容被丢弃，未知字段包含在内；
 * - `index`: 由 KF GUID（页面、控件、变量）键值对索引的实体索引；
 * - `summary`: 项目的一个有界的、LLM 可以友好处理的摘要（计数器加上每页的有限代表控制列表）；
 * - `provenance`: 对于每个映射的实体，其源文件/JSON 路径和 IR/模板尚未理解的字段列表。
 *
 * 未知字段从未被解释：它们被保留为 `raw` 中的名称，并且在 `index`/`summary`/`provenance` 中报告为名称。
 */

export interface SummaryLimits {
  /** 每页列出的代表控制的最大数量。 */
  controlsPerPage: number;
  /** 生成计划中列出的页面的最大数量。 */
  pagesPerSummary: number;
}

export const DEFAULT_SUMMARY_LIMITS: SummaryLimits = {
  controlsPerPage: 50,
  pagesPerSummary: 200,
};

export interface InspectOptions {
  summaryLimits?: Partial<SummaryLimits>;
  /** 用于后期运行时关联证明的服务器选择的不可变身份。 */
  runtimeBinding?: { readonly workspaceId: string; readonly baseRevisionId: string };
}

const VERSION_DIR_RE = /^\d+\.\d+\.\d+\.\d+$/;

// ---------------------------------------------------------------------------
// 索引形状
// ---------------------------------------------------------------------------

export interface ControlIndexEntry {
  guid: string;
  pageGuid: string;
  type: string;
  /** 精确审查的可变能力变体（例如布局.2/易用性.17） */
  capabilityId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** 稳定语义标识符（KF 控制 `name`），从不引用 KF GUID。 */
  id: string;
  name?: string;
  /** 解包工作空间中的稳定语义标识符路径（e.g），`project/page/Page1.json#/objects/0`。 */
  rawPath: string;
  unknownFields: string[];
}

export interface PageIndexEntry {
  guid: string;
  /** 稳定语义页面标识符（KF 页面 `name`；从不引用 KF GUID 参考目标） */
  id: string;
  name: string;
  file: string;
  controlGuids: string[];
  unknownFields: string[];
}

export interface VariableIndexEntry {
  guid: string;
  /** 稳定语义变量标识符（KF 变量 `name`，e.g. `$TestVar`；从不引用 KF GUID 参考目标） */
  id: string;
  name: string;
  file: string;
}

export interface ScriptIndexEntry {
  id: string;
  file: string;
  kind: "global" | "page";
}

export interface EntityIndex {
  controls: Record<string, ControlIndexEntry>;
  pages: Record<string, PageIndexEntry>;
  variables: Record<string, VariableIndexEntry>;
  scripts: ScriptIndexEntry[];
}

export interface ControlProvenance {
  rawPath: string;
  sourceFile: string;
  kfType: number;
  mappedType: string;
  unknownFields: string[];
}

export interface PageProvenance {
  file: string;
  unknownFields: string[];
}

export interface Provenance {
  controls: Record<string, ControlProvenance>;
  pages: Record<string, PageProvenance>;
}

// ---------------------------------------------------------------------------
// 原始树
// ---------------------------------------------------------------------------

export interface RawTrees {
  project: unknown;
  pageManager: unknown;
  /** pageGuid -> 全部页面的 JSON 树（从不修改）。 */
  pages: Record<string, unknown>;
  /** 源文件基名 -> 解析后的 JSON 树（变量/标签文件）。 */
  variables: Record<string, unknown>;
  /** 源文件基名 -> 脚本文本（JS）或解析后的 JSON 树。 */
  scripts: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// 受限摘要
// ---------------------------------------------------------------------------

export interface ControlSummary {
  guid: string;
  id: string;
  type: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  unknownFields: string[];
}

export interface PageSummary {
  guid: string;
  /** 稳定语义页面 ID（KF 页面 `name`； fallback 到 guid） */
  id: string;
  name: string;
  width?: number;
  height?: number;
  controlCount: number;
  controls: ControlSummary[];
  unknownFields: string[];
}

export interface ClientProjectSummary {
  schema: "kf-client-project-summary/v1";
  project: { guid?: string; name: string; version?: string };
  pageCount: number;
  variableCount: number;
  scriptCount: number;
  pages: PageSummary[];
}

export interface InspectResult {
  raw: RawTrees;
  index: EntityIndex;
  summary: ClientProjectSummary;
  provenance: Provenance;
  warnings: string[];
}

export type ServerOwnedNativeControlType = NativeRuntimeControlType | { readonly kind: "malformed"; readonly reason: string };

export interface ServerOwnedRuntimeIdentitySnapshot {
  readonly runtimeBinding?: Readonly<{ readonly workspaceId: string; readonly baseRevisionId: string }>;
  readonly controls: readonly {
    readonly guid: string;
    readonly pageGuid: string;
    readonly name: string;
    readonly nativeType: ServerOwnedNativeControlType;
  }[];
  readonly pageGuids: readonly string[];
}

const serverOwnedInspectResults = new WeakMap<object, ServerOwnedRuntimeIdentitySnapshot>();

/** 供无损 inspector 结果的服务器专用使用方采用的运行时信任检查。 */
export function isServerOwnedInspectResult(value: unknown): value is InspectResult {
  return typeof value === "object" && value !== null && serverOwnedInspectResults.has(value);
}

/** 当检查完成时捕获的不可变身份唯一快照。 */
export function serverOwnedRuntimeIdentitySnapshot(value: InspectResult): ServerOwnedRuntimeIdentitySnapshot | undefined {
  return serverOwnedInspectResults.get(value);
}

// ---------------------------------------------------------------------------
// 已知字段集（来自 kmui_*.js 原始化 + 实际 SDB 页面）
// ---------------------------------------------------------------------------

/** KF 页面 JSON 文件的顶层键（已与 SDB 的 `project/page/*.json` 核对）。 */
const KNOWN_PAGE_FIELDS = new Set([
  "pageProperty",
  "version",
  "showLayer",
  "guid",
  "objectType",
  "objects",
  "linkMng",
  "variable",
  "dataSourceMng",
  "customProperty",
  "pagePrototype",
  "pageWindowInfo",
  "pageViewWidth",
  "pageViewHeight",
]);

/** 每控件共享的字段（KMUIModelBase + KMUIElementBase.propertys + SDB 页面）。 */
const COMMON_CONTROL_FIELDS = new Set([
  "name",
  "uiModelType",
  "guid",
  "leftTopPt",
  "width",
  "height",
  "comment",
  "memberAccess",
  "lock",
  "visible",
  "runVisible",
  "enable",
  "sizePolicy",
  "fixedSize",
  "styleData",
  "styleDataNew",
  "configureData",
  "isControl",
  "resDescription",
  "linkMng",
  "primary",
  "internalVertex",
  "version",
  "securityPriority",
  "securitySection",
  "resourceGroup",
  "resourceGroupMsg",
  "prototypeName",
  "showUiExtendType",
  "customPropertyRecords",
  "isChangeFixedSize",
  "isChangeFont",
  // 老式控件（KMUIModelBase 派生）的运行时序列化字段：
  "alpha",
  "absolutePt",
  "relativePt",
  "boundRect",
  "associatedEvents",
  "changeProperty",
  "connectObj",
  "demoName",
  "initialOptions",
  "modleStyle",
  "objectType",
  "styleName",
  "variables",
  "UIId",
  "Location",
  "Size",
  "isComponentGroupChild",
  "isExpandingX",
  "isExpandingY",
  "radioSinglyListNode",
  "$ParentChildren",
  "$ParentProperty",
  "$ParentVariable",
  // 每控件共享的布局/容器粘合字段（在 SDB 页面中验证）：
  "region",
  "baseProperty",
  "insiderObjects",
  "objects",
  "children",
  "layoutItems",
]);

/** 每个 KF uiModelType 的控制特定序列化字段（构造函数默认值 + SDB 页面）。 */
const CONTROL_SPECIFIC_FIELDS: Readonly<Record<number, readonly string[]>> = {
  6: [
    "text",
    "readOnly",
    "maxLen",
    "fontInfo",
    "bkColor",
    "type",
    "borderStyle",
    "borderColor",
    "layoutStyle",
    "isShowBorder",
    "toolTipEnable",
    "toolTipText",
    "textBoxShowType",
    "isBold",
    "originText",
    "UIId",
    "objectType",
    "variables",
    "associatedEvents",
    "connectObj",
    "inputCount",
    "absolutePt",
    "relativePt",
    "boundRect",
    "alpha",
    "demoName",
    "styleName",
    "modleStyle",
    "initialOptions",
    "changeProperty",
    "Location",
    "Size",
    "textInput",
  ],
  35: ["text", "type", "plain", "round", "circle", "loading", "disabled", "icon", "titleShow"],
  49: ["value", "min", "max", "step", "stepStrictly", "precision", "disabled", "controls", "controlsPosition", "placeholder"],
  48: ["value", "activeColor", "inactiveColor", "activeText", "inactiveText", "activeIconClass", "inactiveIconClass", "disabled"],
  44: ["selectValue", "multiple", "disabled", "clearable", "multipleLimit", "filterable", "allowCreate", "defaultFirstOption", "placeholder", "selectData", "collapseTags", "remote", "loading", "loadingText", "noMatchText", "noDataText", "reserveKeyworld", "automaticDropdown"],
  36: ["radioData", "disabled", "border", "size", "type", "radioValue", "textColor"],
  37: ["checkboxData", "checkedData", "allselectText", "indeterminate", "checkAll", "type", "min", "max", "size", "textColor", "fill", "border", "isIndeterminate"],
  41: ["src", "fit", "alt", "placeholder", "lazy", "referrerPolicy", "previewSrcLists", "picName"],
  47: ["activeName", "type", "tabData", "closable", "addable", "tabPosition", "stretch"],
  7: ["text", "readOnly", "fontInfo", "bkColor", "borderStyle", "borderColor", "scrollBar", "toolTipText", "toolTipEnable", "isShowBorder", "layoutStyle"],
  // ── 新增 20 种（字段取自 kf-template-generator 从源码提取的模板）──
  0: ["bkColor", "fontInfo", "layoutStyle", "radio1", "radio2", "radio3", "radioDiv1", "radioDiv2", "radioDiv3", "rightToLeft", "selectIndex", "span1", "span2", "span3"],
  1: ["bkColor", "check", "checkbox", "fontInfo", "span", "layoutStyle", "text"],
  3: ["bkColor", "selectIndex", "isChangeFixedSize", "isChangeFont"],
  8: ["auxGraduation", "bkColor", "bkDisplay", "decPart", "fontInfo", "graColor", "graLine", "hRulerCanvas", "maxValue", "minValue", "numerical", "priGraduation", "priLine", "textColor"],
  9: ["borderStyle", "hScrollBar", "list", "selectIndex", "isChangeFixedSize", "isChangeFont"],
  11: ["bkColor", "fontInfo", "isChangeFixedSize", "isChangeFont"],
  12: ["scrolling", "transcrolling", "url", "webcon", "isChangeFixedSize", "isChangeFont", "borderStyle"],
  30: ["copycolumns", "copylink", "copytaskBackgroudColor", "copyzooming", "currentTimeLevel", "dateEnable", "disableResizing", "errTaskColor", "futureCell", "ganttMainHeight", "ganttMainWidth", "isShowDel", "isShowLock", "isShowTool", "passedCell", "rowFont", "rowFontColor", "rowFontSize", "rowHeight", "rowWidth", "sizeAble", "taskHeight", "timeDividedLineEffective", "timeFormatter", "timeLineBackgroundColor", "timeLineColor", "timeLineFont", "timeLineFontColor", "timeLineFontSize", "toolPlace", "colorFillOrientation", "columns", "data", "endTime", "link", "mainTime", "startTime", "subTime", "timeDividedLine", "zooming"],
  32: ["show", "attributes", "propertys", "prototypeName", "adaptFontSize", "miniFontSize", "showCheckbox", "indent", "expandOnClickNode", "draggable", "highlightCurrent", "defaultExpandAll", "accordion", "autoExpandParent", "renderAfterExpand"],
  33: ["showDropdown", "showMenu", "property", "attributes", "propertys", "prototypeName", "adaptFontSize", "miniFontSize", "trigger", "placement", "hideOnClick", "hideTimeout", "showTimeout", "splitButton", "tabindex", "text", "type"],
  34: ["show", "attributes", "propertys", "prototypeName", "adaptFontSize", "miniFontSize", "mode", "backgroundColor", "textColor", "activeTextColor", "collapse", "defaultActive", "menuTrigger", "uniqueOpened", "collapseTransition"],
  38: ["value", "maxlength", "showWordLimit", "placeholder", "showPassword", "disabled", "clearable", "prefixIcon", "suffixIcon", "readonly", "max", "min", "step", "type", "prepend", "append"],
  39: ["placeholder", "disabled", "clearable", "showAllLevels", "collapseTags", "filterable", "separator", "debounce", "refresh"],
  40: ["value", "type", "placeholder", "startPlaceholder", "endPlaceholder", "rangeSeparator", "format", "align", "clearable", "editable", "readonly", "unlinkPanels", "disabled"],
  43: ["defaultData", "connectObj", "isChangeFixedSize", "isChangeFont", "buttonShow", "disabled", "treeShow"],
  45: ["dialogVisible", "attributes", "propertys", "prototypeName", "adaptFontSize", "miniFontSize", "action", "autoUpload", "disabled", "drag", "limit", "listType", "multiple", "showFileList", "submitButtonType", "uploadButtonType", "uploadTip"],
  46: ["filterable", "filterPlaceholder", "targetOrder"],
  50: ["closable", "disableTransitions", "hit", "effect", "addable"],
  51: ["reverse"],
  52: ["active", "direction", "space", "processStatus", "finishStatus", "alignCenter", "simple"],
  31: ["border", "customPagination", "defaultExpandAll", "emptyText", "fit", "highlightCurrentRow", "pagination", "showHeader", "showSummary", "stripe", "sumText"],
};

function knownControlFields(uiModelType: number): ReadonlySet<string> {
  const specific = CONTROL_SPECIFIC_FIELDS[uiModelType] ?? [];
  return new Set([...COMMON_CONTROL_FIELDS, ...specific]);
}

function unknownKeys(obj: Record<string, unknown>, known: ReadonlySet<string>): string[] {
  return Object.keys(obj).filter((key) => !known.has(key)).sort();
}

// ---------------------------------------------------------------------------
// 辅助函数
// ---------------------------------------------------------------------------

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function readJsonFile(p: string): Promise<unknown> {
  return JSON.parse(await readFile(p, "utf8")) as unknown;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number {
  return typeof value === "number" ? value : 0;
}

/**
 * 查找项目根目录
 *
 * 在解包的原生客户端工作区中，原生包是 `rootDir/<version>/...`; 检查器也接受一个
 * 直接包含 `project.json` 的目录。
 */
async function resolveProjectRoot(rootDir: string): Promise<string> {
  if (await exists(path.join(rootDir, "project.json"))) return rootDir;
  const entries = await readdir(rootDir, { withFileTypes: true });
  const versionDirs = entries
    .filter((e) => e.isDirectory() && VERSION_DIR_RE.test(e.name))
    .map((e) => e.name)
    .sort();
  if (versionDirs.length === 0) {
    throw new Error(`no client project found under ${rootDir} (no version directory and no project.json)`);
  }
  return path.join(rootDir, versionDirs[0] as string);
}

interface RawControl {
  guid: string;
  type: string;
  capabilityId: string;
  id: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kfType: number;
  nativeRuntimeType: ServerOwnedNativeControlType;
  rawPath: string;
  unknownFields: string[];
}

/**
 * Recursively collects controls from a page JSON. KF layout containers nest
 * controls under `objects`/`children`/`layoutItems`/`insiderObjects`; any
 * object carrying exactly one valid native envelope is classified by the
 * shared fail-closed discriminator. Container objects are recognized as well:
 * - easyui controls (`objectType === 3` or confirmed legacy absence) — identified by
 *   `uiExtendType` (proto), geometry on the top level;
 * - layout containers (`objectType === 2` or absent, with `layoutType`) —
 *   geometry under `baseProperty`, children under `insiderObjects`;
 * - KF special nodes (prototypeName in {CustomCharts,AlarmWindow,EventWindow,
 *   TrendChart,BarChart,PieChart,XYChart}) — priority after containers,
 *   CustomCharts geometry from `pageProperty.pagePos/pageSize`.
 * Container/special-node fields are never reported as unknown (they are
 * preserved in `raw`); static controls keep the existing unknown-field tracking.
 */
function collectControls(node: unknown, rawPath: string, out: RawControl[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectControls(item, `${rawPath}/${index}`, out));
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const record = node as Record<string, unknown>;
  const classification = classifyNativeRuntimeControl(record);
  if (classification.kind === "malformed") {
    const guid = typeof record["guid"] === "string" ? record["guid"] : "";
    const name = typeof record["name"] === "string" ? record["name"] : "";
    const baseProperty = asRecord(record["baseProperty"]);
    const semanticId = name !== "" ? name : guid !== "" ? guid : `malformed-${out.length}`;
    out.push({
      guid, type: "malformed", capabilityId: "malformed", id: semanticId, ...(name !== "" ? { name } : {}),
      x: asNumber(asRecord(record["leftTopPt"])["x"] ?? asRecord(baseProperty["leftTopPt"])["x"]),
      y: asNumber(asRecord(record["leftTopPt"])["y"] ?? asRecord(baseProperty["leftTopPt"])["y"]),
      width: asNumber(record["width"] ?? baseProperty["width"]), height: asNumber(record["height"] ?? baseProperty["height"]),
      kfType: -1, nativeRuntimeType: { kind: "malformed", reason: classification.reason }, rawPath, unknownFields: [],
    });
  } else if (classification.kind === "valid" && classification.nativeType.kind === "static") {
    const uiModelType = classification.nativeType.uiModelType;
    const guid = typeof record["guid"] === "string" ? (record["guid"]) : "";
    const name = typeof record["name"] === "string" ? (record["name"]) : "";
    const knownSet = knownControlFields(uiModelType);
    // Stable semantic id: KF control `name` first, KF GUID second (controls
    // like spacers serialize WITHOUT a name — verified across 11k+ SDB spacer
    // objects — and a traversal ordinal would drift when controls are added or
    // removed), and only then a positional fallback.
    const semanticId = name !== "" ? name : guid !== "" ? guid : `control-${out.length}`;
    const type = CONTROL_TYPE_BY_UIMODEL_TYPE[uiModelType] ?? `kf-${uiModelType}`;
    out.push({
      guid,
      type,
      capabilityId: type,
      id: semanticId,
      ...(name !== "" ? { name } : {}),
      x: asNumber((asRecord(record["leftTopPt"])["x"]) ?? 0),
      y: asNumber((asRecord(record["leftTopPt"])["y"]) ?? 0),
      width: asNumber(record["width"]),
      height: asNumber(record["height"]),
      kfType: uiModelType,
      nativeRuntimeType: classification.nativeType,
      rawPath,
      unknownFields: unknownKeys(record, knownSet),
    });
  } else if (classification.kind === "valid" && classification.nativeType.kind === "easyui") {
    // easyui 控件：reviewed objectType=3 或确认过的 objectType-less legacy envelope。
    // 字段不丢（raw 完整保留），不报 unknownFields。
    const proto = asNumber(record["uiExtendType"]);
    const guid = typeof record["guid"] === "string" ? (record["guid"]) : "";
    const name = typeof record["name"] === "string" ? (record["name"]) : "";
    const semanticId = name !== "" ? name : guid !== "" ? guid : `easyui-${out.length}`;
    out.push({
      guid,
      type: "easyui",
      capabilityId: `easyui.${proto}`,
      id: semanticId,
      ...(name !== "" ? { name } : {}),
      x: asNumber((asRecord(record["leftTopPt"])["x"]) ?? 0),
      y: asNumber((asRecord(record["leftTopPt"])["y"]) ?? 0),
      width: asNumber(record["width"]),
      height: asNumber(record["height"]),
      kfType: proto,
      nativeRuntimeType: classification.nativeType,
      rawPath,
      unknownFields: [],
    });
  } else if (classification.kind === "valid" && classification.nativeType.kind === "layout") {
    // 布局容器：objectType=2 或确认过的 objectType-less legacy layout；几何在 baseProperty。
    const layoutType = classification.nativeType.layoutType;
    const baseProperty = asRecord(record["baseProperty"]);
    const guid =
      typeof record["guid"] === "string"
        ? (record["guid"])
        : typeof baseProperty["guid"] === "string"
          ? (baseProperty["guid"])
          : "";
    const name =
      typeof record["name"] === "string"
        ? (record["name"])
        : typeof baseProperty["name"] === "string"
          ? (baseProperty["name"])
          : "";
    const semanticId = name !== "" ? name : guid !== "" ? guid : `layout-${out.length}`;
    out.push({
      guid,
      type: "layout",
      capabilityId: `layout.${layoutType}`,
      id: semanticId,
      ...(name !== "" ? { name } : {}),
      x: asNumber((asRecord(baseProperty["leftTopPt"])["x"]) ?? 0),
      y: asNumber((asRecord(baseProperty["leftTopPt"])["y"]) ?? 0),
      width: asNumber(baseProperty["width"]),
      height: asNumber(baseProperty["height"]),
      kfType: layoutType,
      nativeRuntimeType: classification.nativeType,
      rawPath,
      unknownFields: [],
    });
  } else if (classification.kind === "valid" && classification.nativeType.kind === "prototype") {
    // KF 特殊节点（优先级在容器之后）：prototypeName 特判，无数字类型码。
    const prototypeName = classification.nativeType.prototypeName;
    const geometry = specialNodeGeometry(record, prototypeName);
    const guid = typeof record["guid"] === "string" ? (record["guid"]) : "";
    const name =
      typeof record["name"] === "string" && record["name"] !== ""
        ? (record["name"])
        : prototypeName === "CustomCharts" && typeof asRecord(record["pageProperty"])["name"] === "string"
          ? (asRecord(record["pageProperty"])["name"] as string)
          : "";
    const semanticId = name !== "" ? name : guid !== "" ? guid : `prototype-${prototypeName}`;
    out.push({
      guid,
      type: "prototype",
      capabilityId: `prototype.${prototypeName}`,
      id: semanticId,
      ...(name !== "" ? { name } : {}),
      x: geometry.x,
      y: geometry.y,
      width: geometry.width,
      height: geometry.height,
      kfType: 0,
      nativeRuntimeType: classification.nativeType,
      rawPath,
      unknownFields: [],
    });
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === "objects" || key === "children" || key === "layoutItems" || key === "insiderObjects") {
      collectControls(value, `${rawPath}/${key}`, out);
    }
  }
}

// ---------------------------------------------------------------------------
// KF → IR 反序列化（容器识别）
// ---------------------------------------------------------------------------

export interface KfObjectToIRResult {
  /**
   * 识别出的 IR 控件；对象既非 easyui/布局（且非静态控件分支）时为 null。
   * 静态控件（uiModelType 为数字）由 index 层 uiModelType 分支识别，
   * 本函数返回 null —— uiModelType 判型始终优先于 objectType 判型。
   */
  control: ControlIR | null;
  /** 转换中未进入 IR 但必须保留的字段名（容器已受控，通常为空）。 */
  unknownFields: string[];
}

/**
 * 把单个 KF 控件对象反序列化为 IR（KF JSON → IR）。
 *
 * 判型由共享判别器完成；互斥 envelope 混合时直接拒绝识别：
 * 1. 单一 `uiModelType` 为数字 → 静态控件，由 index 层识别（此处返回 null）；
 * 2. `objectType === 3`，或 `uiExtendType` 为已知 easyui proto（含 DateBox 等
 *    **无 objectType** 的 KMUIExtendBase 系控件，由共享原生类型判别器识别）
 *    → easyui 控件（`type: "easyui"`，proto = `uiExtendType`，几何在顶层
 *    leftTopPt/width/height，`EASYUI_PROTO_FIELDS[proto]` 中存在的字段透传）；
 * 3. `objectType === 2`（或无 objectType）且含 `layoutType` → 布局容器
 *    （`type: "layout"`，children = `insiderObjects` 原样保留，panels = `dPanelsOption`，
 *     几何从 `baseProperty.leftTopPt/width/height`）；
 * 4. `prototypeName` ∈ {CustomCharts,AlarmWindow,EventWindow,TrendChart,BarChart,
 *    PieChart,XYChart}（且无 uiModelType/objectType=3/layoutType）→ KF 特殊节点
 *    （`type: "prototype"`，几何 CustomCharts 从 pageProperty.pagePos/pageSize 提取、
 *    其余从顶层 leftTopPt/width/height，其余字段 passthrough 宽容保留）。
 *
 * 未知字段不丢（KF 原始树由 raw 完整保留），容器/特殊节点不累积 unknownFields。
 */
export function kfObjectToControl(node: unknown): KfObjectToIRResult {
  const record = asRecord(node);
  const classification = classifyNativeRuntimeControl(record);
  if (classification.kind !== "valid" || classification.nativeType.kind === "static") return { control: null, unknownFields: [] };
  if (classification.nativeType.kind === "easyui") return easyuiToIR(record);
  if (classification.nativeType.kind === "layout") return layoutToIR(record);
  if (classification.nativeType.kind === "prototype") return prototypeToIR(record);
  return { control: null, unknownFields: [] };
}

function easyuiToIR(node: Record<string, unknown>): KfObjectToIRResult {
  const proto = asNumber(node["uiExtendType"]);
  const name = typeof node["name"] === "string" ? node["name"] : "";
  const guid = typeof node["guid"] === "string" ? node["guid"] : "";
  const id = name !== "" ? name : guid !== "" ? guid : `easyui-${proto}`;
  const ir: Record<string, unknown> = {
    id,
    type: "easyui",
    x: asNumber(asRecord(node["leftTopPt"])["x"]),
    y: asNumber(asRecord(node["leftTopPt"])["y"]),
    width: asNumber(node["width"]),
    height: asNumber(node["height"]),
    proto,
    uiExtendType: proto,
  };
  // EASYUI_PROTO_FIELDS 白名单字段透传（schema 中均为宽松 optional 字段）。
  // 排除 IR 保留字段：textbox 白名单含 `type`（KF 的 textbox 输入类型），
  // 若透传会覆盖 ir.type="easyui" 判别值导致 safeParse 失败（与编译层 RESERVED_IR_FIELDS 一致）。
  const RESERVED_IR_FIELDS = new Set([
    "type", "proto", "uiExtendType", "id", "name", "guid",
    "x", "y", "width", "height", "uiModelType",
  ]);
  for (const field of EASYUI_PROTO_FIELDS[proto] ?? []) {
    if (RESERVED_IR_FIELDS.has(field)) continue;
    if (node[field] !== undefined) ir[field] = node[field];
  }
  if (proto === 1) {
    const tableData = inspectReviewedTableData(node);
    if (tableData !== undefined) ir["tableData"] = tableData;
  }
  const parsed = EasyuiControlIR.safeParse(ir);
  if (!parsed.success) {
    return { control: null, unknownFields: [] };
  }
  return { control: parsed.data, unknownFields: [] };
}

function inspectReviewedTableData(node: Record<string, unknown>): ReturnType<typeof parseTableData> | undefined {
  try {
    const dataDescriptor = Object.getOwnPropertyDescriptor(node, "data");
    const columnsDescriptor = Object.getOwnPropertyDescriptor(node, "columns");
    const pageSizeDescriptor = Object.getOwnPropertyDescriptor(node, "pageSize");
    if (dataDescriptor?.get !== undefined || dataDescriptor?.set !== undefined
      || columnsDescriptor?.get !== undefined || columnsDescriptor?.set !== undefined
      || pageSizeDescriptor?.get !== undefined || pageSizeDescriptor?.set !== undefined) return undefined;
    const rows: unknown = dataDescriptor?.value;
    const columnRows: unknown = columnsDescriptor?.value;
    const pageSize: unknown = pageSizeDescriptor?.value ?? 20;
    if (!Array.isArray(rows) || !Array.isArray(columnRows) || columnRows.length !== 1
      || !Array.isArray(columnRows[0])) return undefined;
    const columns = columnRows[0].map((raw: unknown) => {
      if (!isPlainRecord(raw)) throw new Error("unsafe column");
      const keys = Reflect.ownKeys(raw);
      if (keys.some((key) => typeof key !== "string")
        || keys.some((key) => !["field", "title", "width", "align"].includes(key as string))) {
        throw new Error("unknown column field");
      }
      const field = ownDataValue(raw, "field");
      const title = ownDataValue(raw, "title");
      const align = ownDataValue(raw, "align") ?? "left";
      if (typeof field !== "string" || typeof title !== "string"
        || (align !== "left" && align !== "center" && align !== "right")) {
        throw new Error("invalid column");
      }
      return { key: field, label: title, align };
    });
    const semanticRows = rows.map((raw: unknown) => {
      if (!isPlainRecord(raw)) throw new Error("unsafe row");
      const output: Record<string, string | number | boolean | null> = {};
      for (const key of Reflect.ownKeys(raw)) {
        if (typeof key !== "string" || /^(?:__proto__|prototype|constructor)$/i.test(key)) {
          throw new Error("dangerous row field");
        }
        const value = ownDataValue(raw, key);
        if (value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") {
          throw new Error("invalid row value");
        }
        output[key] = value;
      }
      return output;
    });
    return parseTableData({
      columns,
      rows: semanticRows,
      pageSize,
    });
  } catch {
    // Imported unknown/native structures remain losslessly available in raw,
    // but are never projected into the reviewed semantic IR.
    return undefined;
  }
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function ownDataValue(record: Record<string, unknown>, key: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined) {
    throw new Error("accessor field");
  }
  return descriptor.value;
}

function layoutToIR(node: Record<string, unknown>): KfObjectToIRResult {
  const layoutType = asNumber(node["layoutType"]);
  const baseProperty = asRecord(node["baseProperty"]);
  const name =
    typeof node["name"] === "string"
      ? node["name"]
      : typeof baseProperty["name"] === "string"
        ? baseProperty["name"]
        : "";
  const guid =
    typeof node["guid"] === "string"
      ? node["guid"]
      : typeof baseProperty["guid"] === "string"
        ? baseProperty["guid"]
        : "";
  const id = name !== "" ? name : guid !== "" ? guid : `layout-${layoutType}`;
  const ir: Record<string, unknown> = {
    id,
    type: "layout",
    x: asNumber(asRecord(baseProperty["leftTopPt"])["x"]),
    y: asNumber(asRecord(baseProperty["leftTopPt"])["y"]),
    width: asNumber(baseProperty["width"]),
    height: asNumber(baseProperty["height"]),
    layoutType,
  };
  if (Array.isArray(node["insiderObjects"])) {
    ir["children"] = node["insiderObjects"]; // 子对象原样保留（宽容 record）
  }
  if (Array.isArray(node["dPanelsOption"])) {
    ir["panels"] = node["dPanelsOption"];
  }
  const parsed = LayoutContainerIR.safeParse(ir);
  if (!parsed.success) {
    return { control: null, unknownFields: [] };
  }
  return { control: parsed.data, unknownFields: [] };
}

/**
 * 提取 KF 特殊节点的几何：
 * - **CustomCharts**（窗口型容器）：name/几何都在 pageProperty
 *   {name, pagePos{x,y}, pageSize{width,height}}，IR 层 x/y/width/height 从
 *   pageProperty 提取（顶层无 leftTopPt/width/height）；
 * - **其余**（图表型 / 告警窗 / 事件窗）：几何在顶层 leftTopPt/width/height。
 */
function specialNodeGeometry(
  node: Record<string, unknown>,
  prototypeName: string,
): { x: number; y: number; width: number; height: number } {
  if (prototypeName === "CustomCharts") {
    const pageProperty = asRecord(node["pageProperty"]);
    return {
      x: asNumber(asRecord(pageProperty["pagePos"])["x"]),
      y: asNumber(asRecord(pageProperty["pagePos"])["y"]),
      width: asNumber(asRecord(pageProperty["pageSize"])["width"]),
      height: asNumber(asRecord(pageProperty["pageSize"])["height"]),
    };
  }
  return {
    x: asNumber(asRecord(node["leftTopPt"])["x"]),
    y: asNumber(asRecord(node["leftTopPt"])["y"]),
    width: asNumber(node["width"]),
    height: asNumber(node["height"]),
  };
}

function prototypeToIR(node: Record<string, unknown>): KfObjectToIRResult {
  const prototypeName = node["prototypeName"] as string;
  const geometry = specialNodeGeometry(node, prototypeName);
  // 稳定语义 id：KF 控件 `name` 优先（CustomCharts 的 name 在 pageProperty.name），
  // 其次 KF GUID，最后按 prototypeName 兜底。
  const name =
    typeof node["name"] === "string" && node["name"] !== ""
      ? node["name"]
      : typeof asRecord(node["pageProperty"])["name"] === "string"
        ? (asRecord(node["pageProperty"])["name"] as string)
        : "";
  const guid = typeof node["guid"] === "string" ? node["guid"] : "";
  const id = name !== "" ? name : guid !== "" ? guid : `prototype-${prototypeName}`;
  const ir: Record<string, unknown> = {
    ...node, // 其余字段（pageProperty / objects JSON 字符串 / areas / title /
    // linkMng / modlePrototype 等）passthrough 宽容保留，不丢不报
    id,
    type: "prototype",
    prototypeName,
    x: geometry.x,
    y: geometry.y,
    width: geometry.width,
    height: geometry.height,
  };
  const parsed = SpecialNodeIR.safeParse(ir);
  if (!parsed.success) {
    return { control: null, unknownFields: [] };
  }
  return { control: parsed.data, unknownFields: [] };
}

export interface KfControlsToIRResult {
  /** 页面上所有识别出的容器控件（easyui/布局），递归展平（含布局 insiderObjects 内的嵌套子对象）。 */
  controls: ControlIR[];
  /** 转换中累计的 unknownFields（容器已受控，正常为空）。 */
  unknownFields: string[];
}

/**
 * 把 KF 页面 `objects` 数组反序列化为 IR 控件列表（KF JSON → IR）。
 *
 * 递归识别布局容器 `insiderObjects`（以及 `objects`/`children`/`layoutItems`）
 * 内的嵌套子对象：子 easyui 控件与子布局容器都会作为独立 IR 控件出现在
 * `controls` 中；布局 IR 的 `children` 字段同时原样保留 insiderObjects。
 */
export function kfControlToIR(objects: unknown): KfControlsToIRResult {
  const controls: ControlIR[] = [];
  const unknownFields: string[] = [];
  collectIRControls(objects, controls, unknownFields);
  return { controls, unknownFields };
}

function collectIRControls(node: unknown, out: ControlIR[], unknownFields: string[]): void {
  if (Array.isArray(node)) {
    node.forEach((item) => collectIRControls(item, out, unknownFields));
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const record = node as Record<string, unknown>;
  const result = kfObjectToControl(record);
  if (result.control !== null) {
    out.push(result.control);
    unknownFields.push(...result.unknownFields);
  }
  for (const key of ["objects", "children", "layoutItems", "insiderObjects"]) {
    if (record[key] !== undefined) {
      collectIRControls(record[key], out, unknownFields);
    }
  }
}

// ---------------------------------------------------------------------------
// Inspector
// ---------------------------------------------------------------------------

export async function inspectClientProject(
  rootDir: string,
  options?: InspectOptions,
): Promise<InspectResult> {
  let runtimeBinding: Readonly<{ readonly workspaceId: string; readonly baseRevisionId: string }> | undefined;
  if (options?.runtimeBinding !== undefined) {
    const binding = options.runtimeBinding;
    const keys = Object.keys(binding).sort();
    if (keys.length !== 2 || keys[0] !== "baseRevisionId" || keys[1] !== "workspaceId") {
      throw new Error("runtimeBinding must contain exactly workspaceId and baseRevisionId");
    }
    const valid = (value: unknown): value is string => typeof value === "string" && value.length > 0
      && value.length <= 200 && value.trim() === value;
    if (!valid(binding.workspaceId) || !valid(binding.baseRevisionId)) {
      throw new Error("runtimeBinding identities must be bounded exact non-empty strings");
    }
    runtimeBinding = Object.freeze({ workspaceId: binding.workspaceId, baseRevisionId: binding.baseRevisionId });
  }
  const limits: SummaryLimits = { ...DEFAULT_SUMMARY_LIMITS, ...options?.summaryLimits };
  const warnings: string[] = [];
  const projectRoot = await resolveProjectRoot(rootDir);

  // --- project metadata -----------------------------------------------------
  const projectPath = path.join(projectRoot, "project.json");
  const project = (await exists(projectPath)) ? await readJsonFile(projectPath) : {};
  const projectMeta = asRecord(project);
  const projectGuid = typeof projectMeta["guid"] === "string" ? (projectMeta["guid"]) : undefined;
  const projectName = typeof projectMeta["name"] === "string" ? (projectMeta["name"]) : path.basename(projectRoot);
  const projectVersion = typeof projectMeta["version"] === "string" ? (projectMeta["version"]) : undefined;

  // --- page manager ---------------------------------------------------------
  const pageManagerPath = path.join(projectRoot, "project", "pageManager.json");
  const pageManager = (await exists(pageManagerPath)) ? await readJsonFile(pageManagerPath) : undefined;
  const pageManagerRecord = asRecord(pageManager);
  const managerPages: Array<Record<string, unknown>> = Array.isArray(pageManagerRecord["Pages"])
    ? (pageManagerRecord["Pages"] as Array<Record<string, unknown>>)
    : [];

  // --- pages ----------------------------------------------------------------
  const pageDir = path.join(projectRoot, "project", "page");
  const pageFiles = (await exists(pageDir))
    ? (await readdir(pageDir)).filter((f) => f.toLowerCase().endsWith(".json")).sort()
    : [];

  const rawPages: Record<string, unknown> = {};
  const pagesIndex: Record<string, PageIndexEntry> = {};
  const controlsIndex: Record<string, ControlIndexEntry> = {};
  const nativeRuntimeTypeByControlGuid = new Map<string, ServerOwnedNativeControlType>();
  const controlsProvenance: Record<string, ControlProvenance> = {};
  const pagesProvenance: Record<string, PageProvenance> = {};
  const summaryPages: PageSummary[] = [];

  const pageMetaByName = new Map(managerPages.map((p) => [p["name"], p]));

  for (const file of pageFiles) {
    const filePath = path.join(pageDir, file);
    let pageJson: Record<string, unknown>;
    try {
      pageJson = asRecord(await readJsonFile(filePath));
    } catch (err) {
      warnings.push(`skipping unreadable page file ${file}: ${String(err)}`);
      continue;
    }
    const guid = typeof pageJson["guid"] === "string" ? (pageJson["guid"]) : file.replace(/\.json$/i, "");
    const name =
      (typeof asRecord(pageJson["pageProperty"])["name"] === "string"
        ? (asRecord(pageJson["pageProperty"])["name"] as string)
        : null) ??
      (typeof pageJson["name"] === "string" ? (pageJson["name"]) : guid);
    const meta = pageMetaByName.get(name);
    const width =
      asNumber(asRecord(asRecord(pageJson["pageProperty"])["pageSize"])["width"]) ||
      asNumber(pageJson["pageViewWidth"]) ||
      (typeof meta?.["width"] === "number" ? (meta["width"]) : undefined);
    const height =
      asNumber(asRecord(asRecord(pageJson["pageProperty"])["pageSize"])["height"]) ||
      asNumber(pageJson["pageViewHeight"]) ||
      (typeof meta?.["height"] === "number" ? (meta["height"]) : undefined);

    rawPages[guid] = pageJson; // lossless: keep the entire page tree
    const controls: RawControl[] = [];
    collectControls(pageJson["objects"], `project/page/${file}#/objects`, controls);

    const controlGuids: string[] = [];
    const pageControls: ControlSummary[] = [];
    const unknownFields = unknownKeys(pageJson, KNOWN_PAGE_FIELDS);

    for (let i = 0; i < controls.length; i += 1) {
      const control = controls[i] as RawControl;
      if (control.guid !== "") {
        nativeRuntimeTypeByControlGuid.set(control.guid, control.nativeRuntimeType);
        controlsIndex[control.guid] = {
          guid: control.guid,
          pageGuid: guid,
          type: control.type,
          capabilityId: control.capabilityId,
          x: control.x,
          y: control.y,
          width: control.width,
          height: control.height,
          id: control.id,
          ...(control.name !== undefined ? { name: control.name } : {}),
          rawPath: control.rawPath,
          unknownFields: control.unknownFields,
        };
        controlsProvenance[control.guid] = {
          rawPath: control.rawPath,
          sourceFile: `project/page/${file}`,
          kfType: control.kfType,
          mappedType: control.type,
          unknownFields: control.unknownFields,
        };
        controlGuids.push(control.guid);
      }
      if (pageControls.length < limits.controlsPerPage) {
        pageControls.push({
          guid: control.guid,
          id: control.id,
          type: control.type,
          ...(control.name !== undefined ? { name: control.name } : {}),
          x: control.x,
          y: control.y,
          width: control.width,
          height: control.height,
          unknownFields: control.unknownFields,
        });
      }
    }

    pagesIndex[guid] = {
      guid,
      id: name,
      name,
      file: `project/page/${file}`,
      controlGuids,
      unknownFields,
    };
    pagesProvenance[guid] = { file: `project/page/${file}`, unknownFields };
    summaryPages.push({
      guid,
      id: name,
      name,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      controlCount: controls.length,
      controls: pageControls,
      unknownFields,
    });
  }

  summaryPages.sort((a, b) => (a.guid < b.guid ? -1 : a.guid > b.guid ? 1 : 0));

  // --- variables (Tag files) ------------------------------------------------
  const tagDir = path.join(projectRoot, "project", "Tag");
  const rawVariables: Record<string, unknown> = {};
  const variablesIndex: Record<string, VariableIndexEntry> = {};
  let variableCount = 0;

  if (await exists(tagDir)) {
    const variableFiles = (await readdir(tagDir, { withFileTypes: true }))
      .filter((e) => e.name.toLowerCase().endsWith(".json") && e.isFile())
      .map((e) => e.name)
      .sort();
    for (const file of variableFiles) {
      const filePath = path.join(tagDir, file);
      let tagJson: Record<string, unknown>;
      try {
        tagJson = asRecord(await readJsonFile(filePath));
      } catch (err) {
        warnings.push(`skipping unreadable Tag file ${file}: ${String(err)}`);
        continue;
      }
      rawVariables[file] = tagJson;
      const variables = Array.isArray(tagJson["Variables"]) ? (tagJson["Variables"] as Array<Record<string, unknown>>) : [];
      for (const variable of variables) {
        const name = typeof variable["name"] === "string" ? (variable["name"]) : "";
        if (name === "") continue;
        const id = typeof variable["id"] === "string" || typeof variable["id"] === "number" ? String(variable["id"]) : name;
        variablesIndex[id] = { guid: id, id: name, name, file: `project/Tag/${file}` };
        variableCount += 1;
      }
    }
    // nested group variable files: project/Tag/variables/*.json
    const nestedVarDir = path.join(tagDir, "variables");
    if (await exists(nestedVarDir)) {
      const nestedFiles = (await readdir(nestedVarDir)).filter((f) => f.toLowerCase().endsWith(".json")).sort();
      for (const file of nestedFiles) {
        const filePath = path.join(nestedVarDir, file);
        let tagJson: Record<string, unknown>;
        try {
          tagJson = asRecord(await readJsonFile(filePath));
        } catch (err) {
          warnings.push(`skipping unreadable Tag file variables/${file}: ${String(err)}`);
          continue;
        }
        rawVariables[file.replace(/\.json$/i, "")] = tagJson;
        const variables = Array.isArray(tagJson["Variables"]) ? (tagJson["Variables"] as Array<Record<string, unknown>>) : [];
        for (const variable of variables) {
          const name = typeof variable["name"] === "string" ? (variable["name"]) : "";
          if (name === "") continue;
          const id = typeof variable["id"] === "string" || typeof variable["id"] === "number" ? String(variable["id"]) : name;
          variablesIndex[id] = { guid: id, id: name, name, file: `project/Tag/variables/${file}` };
          variableCount += 1;
        }
      }
    }
  }

  // --- scripts ---------------------------------------------------------------
  const rawScripts: Record<string, unknown> = {};
  const scriptsIndex: ScriptIndexEntry[] = [];

  const globalScriptJs = path.join(projectRoot, "project", "km_global_script.js");
  if (await exists(globalScriptJs)) {
    const text = await readFile(globalScriptJs, "utf8");
    rawScripts["km_global_script.js"] = text;
    scriptsIndex.push({ id: "km_global_script.js", file: "project/km_global_script.js", kind: "global" });
  }
  const globalScriptManager = path.join(projectRoot, "project", "globalScriptManager.json");
  if (await exists(globalScriptManager)) {
    rawScripts["globalScriptManager.json"] = await readJsonFile(globalScriptManager);
    scriptsIndex.push({ id: "globalScriptManager.json", file: "project/globalScriptManager.json", kind: "global" });
  }

  const summary: ClientProjectSummary = {
    schema: "kf-client-project-summary/v1",
    project: {
      ...(projectGuid !== undefined ? { guid: projectGuid } : {}),
      name: projectName,
      ...(projectVersion !== undefined ? { version: projectVersion } : {}),
    },
    pageCount: summaryPages.length,
    variableCount,
    scriptCount: scriptsIndex.length,
    pages: summaryPages.slice(0, limits.pagesPerSummary),
  };

  const index: EntityIndex = {
    controls: controlsIndex,
    pages: pagesIndex,
    variables: variablesIndex,
    scripts: scriptsIndex,
  };

  const raw: RawTrees = {
    project,
    pageManager,
    pages: rawPages,
    variables: rawVariables,
    scripts: rawScripts,
  };

  const provenance: Provenance = {
    controls: controlsProvenance,
    pages: pagesProvenance,
  };

  const result: InspectResult = { raw, index, summary, provenance, warnings };
  const runtimeIdentitySnapshot: ServerOwnedRuntimeIdentitySnapshot = Object.freeze({
    ...(runtimeBinding === undefined ? {} : { runtimeBinding }),
    controls: Object.freeze(Object.entries(controlsIndex).flatMap(([guid, control]) => {
      const nativeType = nativeRuntimeTypeByControlGuid.get(guid);
      if (control.name === undefined || nativeType === undefined) return [];
      return [Object.freeze({
        guid: control.guid,
        pageGuid: control.pageGuid,
        name: control.name,
        nativeType: Object.freeze({ ...nativeType }),
      })];
    }).sort((left, right) => left.name.localeCompare(right.name, "en-US"))),
    pageGuids: Object.freeze(Object.keys(pagesIndex).sort()),
  });
  serverOwnedInspectResults.set(result, runtimeIdentitySnapshot);
  return result;
}
