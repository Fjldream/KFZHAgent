import type {
  AssetRecord,
  ChangePlan,
  CustomerEffectBlueprint,
  DesignPlan,
  ModulePlan,
  ModulePlanOperation,
  UIImplementationSpec,
  ValidationReport,
} from "@kf/contracts";
import {
  canonicalModuleCompilationHash,
  AssetRecordSchema,
  changePlanSchema,
  CustomerEffectBlueprintSchema,
  ModulePlanSchema,
  solutionId,
  UIImplementationSpecSchema,
} from "@kf/contracts";
import { readVerifiedAcceptedBlueprintArtifact } from "@kf/build-jobs";
import { listControlCapabilities } from "@kf/domain-client";
import { KF_DESIGN_PRINCIPLES_FULL, KF_MODULE_PLANNING_PRINCIPLES } from "./kf-design-principles.js";
import type {
  ClassifyIntentResult,
  EditableEntity,
  ModelPort,
  ModelPortContext,
  ProjectDesign,
} from "@kf/agent-orchestrator";
import { ClassifyIntentResultSchema } from "@kf/agent-orchestrator";

/**
 * DeepSeek-backed ModelPort (OpenAI-compatible chat completions).
 *
 * Every planning method sends the bounded ModelPortContext (never raw uploads,
 * secrets, or full page JSON) plus the editable-entity list with exact KF
 * GUIDs, and demands strict JSON output. Output is zod-gated here before it
 * reaches the graph, and change plans referencing hallucinated GUIDs are
 * rejected — the graph can never build a plan that references entities that
 * do not exist.
 *
 * Env wiring (conversations.module.ts): `MODEL_PORT_MODE=deepseek` +
 * `DEEPSEEK_API_KEY` (and optional DEEPSEEK_BASE_URL / DEEPSEEK_MODEL).
 */

export interface DeepSeekModelOptions {
  apiKey: string;
  /** OpenAI-compatible base URL (default https://api.deepseek.com). */
  baseUrl?: string;
  /** Model name (default deepseek-chat). */
  model?: string;
  /** Test seam. */
  fetch?: typeof fetch;
  timeoutMs?: number;
}

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-chat";
const DEFAULT_TIMEOUT_MS = 60_000;

/** Raised when the LLM output cannot be turned into a valid plan/design. */
export class DeepSeekModelOutputError extends Error {
  override name = "DeepSeekModelOutputError";
  constructor(detail: string) {
    super(`deepseek model output rejected: ${detail}`);
  }
}

type JsonRepairCode = "JSON_PARSE" | "JSON_TRUNCATED" | "NO_JSON_OBJECT";
class JsonExtractionError extends DeepSeekModelOutputError {
  constructor(readonly code: JsonRepairCode, detail: string) { super(detail); }
}

const SYSTEM_PROMPT = `你以礼貌、专业的客服顾问口吻与客户沟通，回复简洁自然，像真人顾问在对话，避免机械罗列。

你是 KingFusion（KF）客户端工程生成 Agent 的规划模型。你负责把用户需求转成结构化输出，绝不执行任何代码。

领域知识：
- KF 客户端工程由页面（默认 1440x900）和控件组成。
- 支持生成/修改的控件类型（静态控件 31 种 + 容器控件）：
  - 文本类：text（静态文本）、richtext（富文本）、input（输入框，value/placeholder/clearable）、inputnumber（数值输入，variableId 绑定变量、decimals 小数位）、combobox（可编辑下拉）、list（列表）、treeview（树视图）
  - 按钮动作类：button（按钮，text 为按钮文字）、dropdown（下拉菜单，text+options）、navmenu（导航菜单）、upload（文件上传，action/accept/multiple）
  - 选择类：checkbox/checkboxlegacy（复选）、radio/radiolegacy（单选，options 数组）、select（下拉选择，options/multiple/placeholder）、cascader（级联选择，options 树）、transfer（穿梭框，options/titles）
  - 展示类：image（图片，src/fit/alt）、tabs（页签，tabs 数组）、table（表格）、tag（标签，effect/closable）、timeline（时间线，items 数组）、steps（步骤条，active/direction）、scale（刻度，min/max/value/step）、factorycalendar（日历）、webcontainer（网页容器，url）、gantt（甘特图）、spacer（占位，axis 水平/垂直）
  - 容器类（承载静态控件，可嵌套）：
    - easyui 容器：datagrid（数据表格，可内嵌列）、linkbutton（按钮组，text/toggle/group）、tree/treegrid（树/树表）、sidemenu（侧边菜单）、combobox（下拉）、propertygrid（属性列表）、textbox（文本框）、datebox（日期框）等主要 proto（datebox proto 11 序列化不带 objectType）
    - 布局容器 layout：layoutType 2=水平、4=垂直、3=选项卡、5=Docking 区域、0=折叠、6=导航；children 递归嵌套子控件（布局可嵌布局，如 datagrid 内嵌列、布局内嵌子控件）
  - 容器硬约束（违反会导致 KF 页面崩溃或区域空白，详见设计原则"容器序列化硬约束"）：
    - children 里不得写 type/uiModelType 字段；easyui 子控件几何在顶层 leftTopPt/width/height，无 baseProperty
    - Docking 子对象用顶层 region 定位，水平/垂直子对象用 internalVertex:{left,top}
    - Docking 必须给 panels（每项含 region + size 或 width/height），region 与 children 对应
    - tree/sidemenu 必须给非空 data 数组（tree: [{id,text,state,children}]；sidemenu: [{text,iconCls,state,children}]），空 data 渲染空白
  - 特殊节点（type=prototype，复杂配置节点，KF 渲染时才出真图）：
    - CustomCharts 自定义图表、AlarmWindow 告警窗口、EventWindow 事件窗口、TrendChart 趋势图、BarChart 柱状图、PieChart 饼图、XYChart XY曲线
    - 对话生成时只需给 type=prototype + prototypeName + 几何（x/y/width/height）+ title；内部复杂配置（ECharts option/告警列/数据源/areas 等）不对话生成、由工具原样保留，不得凭空编造或重写
    - 与容器一致的硬约束：prototype 节点内不得输出 type/uiModelType 字段（type 是 IR 判别保留字、uiModelType:null 会覆盖节点导致不渲染）
    - 图表占位：这些是占位节点，KF 渲染时才出真图，需要图表时用特殊节点承载，不得用按钮冒充
- 控件动作只允许受限 DSL：{"kind":"setVariable","variableId":"$变量名","value":数字} 或 {"kind":"navigatePage","pageId":"页面名"}。
- 禁止输出任意 JavaScript、脚本字符串、自由文本代码。

输出规则：
- 只输出合法 JSON，不要 Markdown 围栏、注释或额外说明。
- 计划中的 entityId 必须是用户提供的实体清单里的 GUID，禁止编造。
- 修改字段只允许控件受控字段，如 /text、/backgroundColor、/x、/y、/width、/height。

${KF_DESIGN_PRINCIPLES_FULL}`;

/**
 * UI implementation has a different trust boundary from the legacy
 * ChangePlan planner. Keeping this prompt separate prevents the legacy GUID
 * and native-container instructions from overriding semantic component IDs
 * or encouraging raw KF fields in UIImplementationSpec.
 */
const UI_IMPLEMENTATION_SYSTEM_PROMPT = `你是 KingFusion UI 实施规划 Agent，只负责输出受约束的 UIImplementationSpec JSON。

- 只输出合法 JSON，不要 Markdown、注释或说明。
- UIImplementationSpec 的 component.id 必须使用稳定语义 ID，不是 GUID。
- 仅当输出 ChangePlan 时 entityId 才遵循 KF GUID 规则；本任务不输出 ChangePlan。
- 禁止输出 KF 原始 JSON、objectType、uiModelType、styleDataNew、原始 CSS、选择器、JavaScript、脚本或工程文件。
- 所有布局、内容、控件能力和样式都必须通过 UIImplementationSpec 的结构化字段表达。
- 每个确认蓝图模块都必须由至少一个带对应 sourceModuleId 的组件实现。`;

/** Module planning is deliberately separate from both the legacy ChangePlan and raw KF implementation prompts. */
const MODULE_PLAN_SYSTEM_PROMPT = `你是 KingFusion 模块规划 Agent，只输出严格的 kf-module-plan/v1 JSON。

- 你只选择服务器登记且明确列出的 stable 模块、版本、变体、语义区域、顺序、列宽、期望高度、对齐、层级、内容、交互和 assetId。
- 你绝不输出逐控件坐标、geometry、CSS、选择器、工程文件路径、存储键、KF 原生字段、objectType、uiModelType、styleDataNew、脚本、JavaScript 或 HTML。
- 已确认蓝图事实、模块 kind/category/交互约束、资产目录和稳定目录均由服务器授权；不得编造、替换或扩展它们。
- 只输出合法 JSON；不要 Markdown 围栏、解释、注释或额外文本。

${KF_MODULE_PLANNING_PRINCIPLES}`;

const MAX_MODULE_PLANNING_CATALOG = 50;
const MAX_MODULE_PLANNING_ASSETS = 100;
const MAX_MODULE_REJECTION_REASONS = 12;
const MAX_MODULE_RECENT_MESSAGES = 20;
const MAX_MODULE_PROMPT_BYTES = 96_000;
const MAX_MODULE_REQUIREMENT_CHARS = 6_000;
const MAX_MODULE_CONTEXT_ITEM_CHARS = 800;
const FORBIDDEN_MODULE_TEXT = /<\/?script\b|<style\b|javascript\s*:|data\s*:\s*text\s*\/\s*html|(?:^|[;{])\s*(?:position|display|flex|grid|font-size|background|color|margin|padding)\s*:/i;
const PLANNING_MATURITIES = new Set(["stable", "beta", "unsupported"]);
const PLANNING_ASSET_KINDS = new Set(["image", "icon", "document", "media", "data"]);
const PLANNING_INTERACTIONS = new Set(["navigate", "scroll", "open-modal", "submit", "filter", "toggle"]);
const PLANNING_REGIONS = new Set(["header", "main", "sidebar", "footer", "toolbar"]);
const PLANNING_HEIGHTS = new Set(["compact", "small", "medium", "large", "full"]);
const PLANNING_KIND = /^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/;
const PLANNING_VERSION = /^[0-9A-Za-z][0-9A-Za-z._-]*$/;

/** Strict, dependency-free boundary parser for Registry.listForPlanning() summaries. */
function parsePlanningSummary(value: unknown): {
  readonly kind: string; readonly version: string; readonly maturity: "stable" | "beta" | "unsupported";
  readonly variants: readonly string[]; readonly slots: readonly { readonly id: string; readonly required: boolean; readonly requiredForVariants?: readonly string[]; readonly allowedKinds: readonly ("image" | "icon" | "document" | "media" | "data")[] }[];
  readonly interactions: readonly ("navigate" | "scroll" | "open-modal" | "submit" | "filter" | "toggle")[];
  readonly layout: { readonly regions: readonly ("header" | "main" | "sidebar" | "footer" | "toolbar")[]; readonly minColumnSpan: number; readonly maxColumnSpan: number; readonly preferredHeights: readonly ("compact" | "small" | "medium" | "large" | "full")[] };
} {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throwModulePlanError("planning catalog failed schema validation");
  const record = value as Record<string, unknown>;
  const allowed = new Set(["kind", "version", "maturity", "variants", "slots", "interactions", "layout"]);
  if (Object.keys(record).length !== allowed.size || Object.keys(record).some((key) => !allowed.has(key))) throwModulePlanError("planning catalog failed schema validation");
  const boundedText = (raw: unknown, expression: RegExp): string => typeof raw === "string" && raw.trim() === raw && raw.length > 0 && raw.length <= 100 && expression.test(raw)
    ? raw : throwModulePlanError("planning catalog failed schema validation");
  const boundedStrings = (raw: unknown, min: number, max: number, allowedValues?: ReadonlySet<string>): string[] => {
    if (!Array.isArray(raw) || raw.length < min || raw.length > max) throwModulePlanError("planning catalog failed schema validation");
    return raw.map((entry) => {
      const parsed = boundedText(entry, /^[A-Za-z][A-Za-z0-9_-]*$/);
      if (allowedValues !== undefined && !allowedValues.has(parsed)) throwModulePlanError("planning catalog failed schema validation");
      return parsed;
    });
  };
  const kind = boundedText(record.kind, PLANNING_KIND);
  const version = boundedText(record.version, PLANNING_VERSION);
  if (typeof record.maturity !== "string" || !PLANNING_MATURITIES.has(record.maturity)) throwModulePlanError("planning catalog failed schema validation");
  const variants = boundedStrings(record.variants, 1, 32);
  if (!Array.isArray(record.slots) || record.slots.length > 8) throwModulePlanError("planning catalog failed schema validation");
  const slots = record.slots.map((slot) => {
    if (slot === null || typeof slot !== "object" || Array.isArray(slot)) throwModulePlanError("planning catalog failed schema validation");
    const slotRecord = slot as Record<string, unknown>;
    const keys = Object.keys(slotRecord);
    if (keys.some((key) => !["id", "required", "requiredForVariants", "allowedKinds"].includes(key)) || !keys.includes("id") || !keys.includes("required") || !keys.includes("allowedKinds")) throwModulePlanError("planning catalog failed schema validation");
    if (typeof slotRecord.required !== "boolean") throwModulePlanError("planning catalog failed schema validation");
    const requiredForVariants = slotRecord.requiredForVariants === undefined ? undefined : boundedStrings(slotRecord.requiredForVariants, 0, 32);
    return { id: boundedText(slotRecord.id, /^[A-Za-z][A-Za-z0-9_-]*$/), required: slotRecord.required, ...(requiredForVariants === undefined ? {} : { requiredForVariants }), allowedKinds: boundedStrings(slotRecord.allowedKinds, 1, 5, PLANNING_ASSET_KINDS) as ("image" | "icon" | "document" | "media" | "data")[] };
  });
  if (record.layout === null || typeof record.layout !== "object" || Array.isArray(record.layout)) throwModulePlanError("planning catalog failed schema validation");
  const layout = record.layout as Record<string, unknown>;
  if (Object.keys(layout).length !== 4 || Object.keys(layout).some((key) => !["regions", "minColumnSpan", "maxColumnSpan", "preferredHeights"].includes(key))) throwModulePlanError("planning catalog failed schema validation");
  const integer = (raw: unknown): number => typeof raw === "number" && Number.isInteger(raw) && raw >= 1 && raw <= 12 ? raw : throwModulePlanError("planning catalog failed schema validation");
  const minColumnSpan = integer(layout.minColumnSpan);
  const maxColumnSpan = integer(layout.maxColumnSpan);
  if (minColumnSpan > maxColumnSpan) throwModulePlanError("planning catalog failed schema validation");
  return { kind, version, maturity: record.maturity as "stable" | "beta" | "unsupported", variants, slots, interactions: boundedStrings(record.interactions, 0, 12, PLANNING_INTERACTIONS) as ("navigate" | "scroll" | "open-modal" | "submit" | "filter" | "toggle")[], layout: { regions: boundedStrings(layout.regions, 1, 5, PLANNING_REGIONS) as ("header" | "main" | "sidebar" | "footer" | "toolbar")[], minColumnSpan, maxColumnSpan, preferredHeights: boundedStrings(layout.preferredHeights, 1, 5, PLANNING_HEIGHTS) as ("compact" | "small" | "medium" | "large" | "full")[] } };
}

function codePointCompare(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const leftPoint = leftPoints[index]!.codePointAt(0)!;
    const rightPoint = rightPoints[index]!.codePointAt(0)!;
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
  }
  return leftPoints.length === rightPoints.length ? 0 : leftPoints.length < rightPoints.length ? -1 : 1;
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(codePointCompare).map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`).join(",")}}`;
}

function stableEqual(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

/** Return a detached, canonical JSON value so audit operations never retain page-object references. */
function detachedCanonical<T>(value: T): T {
  assertDescriptorSafeJson(value, "revision delta payload");
  return JSON.parse(canonicalJson(value)) as T;
}

function moduleIndex(plan: ModulePlan): Map<string, { pageId: string; module: ModulePlan["pages"][number]["modules"][number] }> {
  return new Map(plan.pages.flatMap((page) => page.modules.map((module) => [module.id, { pageId: page.id, module }] as const)));
}

function operationSortKey(operation: ModulePlanOperation): string {
  const moduleId = operation.op === "add" ? operation.module.id : operation.moduleId;
  return `${operation.pageId}\u0000${moduleId}\u0000${operation.op}`;
}

function interactionTarget(interaction: ModulePlan["pages"][number]["modules"][number]["interactions"][number]): string {
  switch (interaction.type) {
    case "navigate": return interaction.pageId;
    case "scroll":
    case "open-modal": return interaction.moduleId;
    case "submit": return interaction.action;
    case "filter": return interaction.field;
    case "toggle": return interaction.target;
  }
}

function interactionIdentity(value: { type: string; target: string }): string {
  return `${value.type}\u0000${value.target}`;
}

export function deriveExactModulePlanOperations(previous: ModulePlan, current: ModulePlan, acceptedBlueprintIds: ReadonlySet<string>): readonly ModulePlanOperation[] {
  if (!stableEqual(previous.theme, current.theme)) throwModulePlanError("theme changes require an explicit supported operation");
  const previousPages = new Map(previous.pages.map((page) => [page.id, page]));
  const currentPages = new Map(current.pages.map((page) => [page.id, page]));
  if (previousPages.size !== currentPages.size || [...previousPages.keys()].some((id) => !currentPages.has(id))) {
    throwModulePlanError("page additions or removals require an explicit supported operation");
  }
  for (const [pageId, previousPage] of previousPages) {
    const currentPage = currentPages.get(pageId)!;
    if (previousPage.title !== currentPage.title || previousPage.mode !== currentPage.mode) {
      throwModulePlanError("page title or mode changes require an explicit supported operation");
    }
  }
  const before = moduleIndex(previous);
  const after = moduleIndex(current);
  const expected: ModulePlanOperation[] = [];
  for (const [id, previousEntry] of before) {
    const currentEntry = after.get(id);
    if (currentEntry === undefined) {
      if ((previousEntry.module.sourceBlueprintModuleIds ?? []).some((sourceId) => acceptedBlueprintIds.has(sourceId))) {
        throwModulePlanError(`accepted blueprint still requires removed module: ${id}`);
      }
      expected.push({ op: "remove", pageId: previousEntry.pageId, moduleId: id });
      continue;
    }
    if (previousEntry.pageId !== currentEntry.pageId) throwModulePlanError(`module page move is not supported: ${id}`);
    const previousModule = previousEntry.module;
    const currentModule = currentEntry.module;
    if (previousModule.kind !== currentModule.kind || previousModule.templateVersion !== currentModule.templateVersion) {
      throwModulePlanError(`kind or templateVersion changes are not supported for module: ${id}`);
    }
    const changes: Record<string, unknown> = {};
    if (previousModule.title !== currentModule.title) changes.title = currentModule.title;
    if (previousModule.content !== currentModule.content) {
      if (currentModule.content === undefined) throwModulePlanError(`content removal is not supported for module: ${id}`);
      changes.content = currentModule.content;
    }
    if (!stableEqual(previousModule.interactions, currentModule.interactions)) changes.interactions = detachedCanonical(currentModule.interactions);
    if (!stableEqual(previousModule.sourceBlueprintModuleIds, currentModule.sourceBlueprintModuleIds)) changes.sourceBlueprintModuleIds = detachedCanonical(currentModule.sourceBlueprintModuleIds);
    if (previousModule.assetId !== currentModule.assetId) {
      changes.assetId = currentModule.assetId ?? null;
    }
    if (Object.keys(changes).length > 0) expected.push({ op: "update", pageId: currentEntry.pageId, moduleId: id, changes });
    if (!stableEqual(previousModule.placement, currentModule.placement)) {
      const sameNonResizePlacement = previousModule.placement.region === currentModule.placement.region
        && previousModule.placement.order === currentModule.placement.order
        && previousModule.placement.alignment === currentModule.placement.alignment
        && previousModule.placement.emphasis === currentModule.placement.emphasis;
      expected.push(sameNonResizePlacement
        ? { op: "resize", pageId: currentEntry.pageId, moduleId: id, columnSpan: currentModule.placement.columnSpan, preferredHeight: currentModule.placement.preferredHeight }
        : { op: "move", pageId: currentEntry.pageId, moduleId: id, placement: detachedCanonical(currentModule.placement) });
    }
    if (previousModule.variant !== currentModule.variant) {
      expected.push({ op: "changeVariant", pageId: currentEntry.pageId, moduleId: id, templateVersion: currentModule.templateVersion, variant: currentModule.variant });
    }
  }
  for (const [id, currentEntry] of after) {
    if (!before.has(id)) expected.push({ op: "add", pageId: currentEntry.pageId, module: detachedCanonical(currentEntry.module) });
  }
  return Object.freeze(expected.sort((left, right) => codePointCompare(operationSortKey(left), operationSortKey(right))));
}

function throwModulePlanError(detail: string): never {
  throw new DeepSeekModelOutputError(`module plan ${detail}`);
}

/** Reject getters, symbols, prototypes, sparse arrays, and cycles before later validation/stringification can invoke them. */
export function assertDescriptorSafeJson(root: unknown, code: string, maxNodes = 20_000): void {
  const seen = new Set<object>();
  const active = new Set<object>();
  const pending: Array<{ value: unknown; exit?: true }> = [{ value: root }];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    nodes += 1;
    if (nodes > maxNodes) throwModulePlanError(`${code}: unsafe node budget exceeded`);
    const value = current.value;
    if (value === null || typeof value === "string" || typeof value === "boolean") continue;
    if (typeof value === "number") { if (Number.isFinite(value)) continue; throwModulePlanError(`${code}: unsafe number`); }
    if (typeof value !== "object") throwModulePlanError(`${code}: unsafe non-JSON value`);
    if (current.exit === true) { active.delete(value); seen.add(value); continue; }
    if (active.has(value) || seen.has(value)) throwModulePlanError(`${code}: unsafe cyclic or shared value`);
    active.add(value); pending.push({ value, exit: true });
    if (Array.isArray(value)) {
      if (Reflect.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) throwModulePlanError(`${code}: unsafe array`);
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) throwModulePlanError(`${code}: unsafe array item`);
        pending.push({ value: descriptor.value });
      }
      continue;
    }
    if (Reflect.getPrototypeOf(value) !== Object.prototype) throwModulePlanError(`${code}: unsafe object prototype`);
    for (const key of Reflect.ownKeys(value)) {
      const normalizedKey = typeof key === "string" ? key.normalize("NFKC").toLowerCase() : "";
      if (typeof key !== "string" || normalizedKey === "__proto__" || normalizedKey === "prototype" || normalizedKey === "constructor") throwModulePlanError(`${code}: unsafe key`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) throwModulePlanError(`${code}: unsafe property`);
      pending.push({ value: descriptor.value });
    }
  }
}

const FORBIDDEN_MODULE_KEY_TOKENS = new Set([
  "geometry", "css", "path", "storage", "native", "script", "html", "javascript", "selector",
  "proto", "prototype", "constructor", "styledata", "controlguid", "guid",
  // ModulePlan is semantic; any coordinate-like key is raw implementation data.
  "x", "y", "width", "height",
]);
const FORBIDDEN_MODULE_COMPACT_KEYS = new Set([
  "objecttype", "uimodeltype", "styledatanew", "styledata", "baseproperty", "lefttoppt",
  "insideobjects", "insiderobjects", "configuredata", "layouttype", "controlgeometry",
  "nativepayload", "scriptbody", "cssrules", "pathvalue",
]);
const MAX_NORMALIZED_MODULE_KEY_CHARS = 256;

function normalizedModuleKeyParts(key: string): { readonly tokens: readonly string[]; readonly compact: string } {
  const nfkc = key.normalize("NFKC");
  // Preserve camel, snake, kebab, and whitespace boundaries before lowercasing.
  // The second rule handles acronym boundaries such as CSSRules and UIModelType.
  const segmented = nfkc
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2");
  const tokens = segmented.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  return { tokens, compact: tokens.join("") };
}

function isModulePlacementPreferredHeight(path: readonly string[], key: string): boolean {
  // The exception is deliberately both exact and location-sensitive. An
  // embedded content object with the same spelling is not a ModulePlan field.
  if (key !== "preferredHeight") return false;
  const isIndex = (value: string | undefined): boolean => value !== undefined && /^(?:0|[1-9][0-9]*)$/.test(value);
  // resize carries the same constrained height enum directly on the operation.
  if (isIndex(path.at(-1)) && path.at(-2) === "operations") return true;
  if (path.at(-1) !== "placement") return false;
  // Final page snapshot: pages[n].modules[n].placement.preferredHeight.
  if (path.at(-3) === "modules" && isIndex(path.at(-2)) && path.at(-5) === "pages" && isIndex(path.at(-4))) return true;
  // Server-audited operation payloads: add.module.placement and move.placement.
  if (path.at(-2) === "module" && isIndex(path.at(-3)) && path.at(-4) === "operations") return true;
  if (isIndex(path.at(-2)) && path.at(-3) === "operations") return true;
  return false;
}

function forbiddenModuleKey(key: string, isSchemaDefinedPreferredHeight = false): boolean {
  const { tokens, compact } = normalizedModuleKeyParts(key);
  if (isSchemaDefinedPreferredHeight) return false;
  // Bound the substring scan, and fail closed rather than allowing a giant key
  // to turn a compact native implementation term into an allocation vector.
  if (compact.length > MAX_NORMALIZED_MODULE_KEY_CHARS) return true;
  return tokens.some((token) => FORBIDDEN_MODULE_KEY_TOKENS.has(token))
    || [...FORBIDDEN_MODULE_COMPACT_KEYS].some((term) => compact.includes(term));
}

/** Model reply has passed JSON.parse, but scan its JSON tree before schema parsing for disallowed implementation vocabulary. */
function assertSafeModulePlanOutput(root: unknown): void {
  assertDescriptorSafeJson(root, "model output");
  const pending: Array<{ value: unknown; path: readonly string[] }> = [{ value: root, path: [] }];
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    const { value, path } = current;
    nodes += 1;
    if (nodes > 20_000) throwModulePlanError("exceeds raw node budget");
    if (typeof value === "string") {
      if (FORBIDDEN_MODULE_TEXT.test(value)) throwModulePlanError("contains forbidden CSS or script text");
      const nested = value.trim();
      if (nested.length > 1 && nested.length <= 2_000 && (nested.startsWith("{") || nested.startsWith("["))) {
        let parsed: unknown;
        try {
          // `content` is intentionally a JSON string in ModulePlan. Inspect it
          // as data too, so forbidden native/storage fields cannot hide there.
          parsed = JSON.parse(nested) as unknown;
        } catch {
          // Content schemas decide whether non-JSON content is meaningful; the
          // safety scan must not reinterpret ordinary customer prose as JSON.
          continue;
        }
        assertDescriptorSafeJson(parsed, "embedded model JSON");
        pending.push({ value: parsed, path: [...path, "$embedded"] });
      }
      continue;
    }
    if (value === null || typeof value === "boolean" || typeof value === "number") continue;
    if (typeof value !== "object") throwModulePlanError("contains a non-JSON value");
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !("value" in descriptor)) throwModulePlanError("contains unsafe array item");
        pending.push({ value: descriptor.value, path: [...path, String(index)] });
      }
      continue;
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throwModulePlanError("contains unsafe non-string field");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) throwModulePlanError(`contains unsafe field: ${key}`);
      if (forbiddenModuleKey(key, isModulePlacementPreferredHeight(path, key))) throwModulePlanError(`contains forbidden field: ${key}`);
      pending.push({ value: descriptor.value, path: [...path, key] });
    }
  }
}

function acceptedModulePlanningFacts(input: ModelPortContext): {
  readonly blueprint: CustomerEffectBlueprint;
  readonly accepted: ReturnType<typeof readVerifiedAcceptedBlueprintArtifact>;
} {
  if (input.confirmedBlueprint === undefined) throwModulePlanError("requires a confirmed v2 blueprint");
  assertDescriptorSafeJson(input.confirmedBlueprint, "confirmed blueprint");
  const parsedBlueprint = CustomerEffectBlueprintSchema.safeParse(input.confirmedBlueprint);
  if (!parsedBlueprint.success) throwModulePlanError("confirmed blueprint failed schema validation");
  if (input.acceptedBlueprintArtifact === undefined) throwModulePlanError("requires a verified accepted blueprint artifact");
  let accepted: ReturnType<typeof readVerifiedAcceptedBlueprintArtifact>;
  try {
    accepted = readVerifiedAcceptedBlueprintArtifact(input.acceptedBlueprintArtifact);
  } catch (error) {
    throwModulePlanError(error instanceof Error ? error.message : "accepted blueprint artifact is invalid");
  }
  if (canonicalModuleCompilationHash(parsedBlueprint.data) !== accepted.blueprintHash) {
    throwModulePlanError("confirmed blueprint does not match accepted artifact");
  }
  if (input.currentProjectKey === undefined || input.currentProjectKey !== accepted.projectKey) {
    throwModulePlanError("accepted artifact projectKey does not match currentProjectKey");
  }
  if (input.currentRevisionId === undefined || input.currentRevisionId !== accepted.revisionId) {
    throwModulePlanError("accepted artifact revisionId does not match currentRevisionId");
  }
  const acceptedIds = accepted.modules.map((module) => module.blueprintModuleId).sort(codePointCompare);
  const blueprintIds = parsedBlueprint.data.modules.map((module) => module.id).sort(codePointCompare);
  if (!stableEqual(acceptedIds, blueprintIds)) throwModulePlanError("accepted artifact module set does not match confirmed blueprint");
  return { blueprint: parsedBlueprint.data, accepted };
}

/**
 * Normalize all server-owned planning inputs before either a real or fake
 * model can read them. This is deliberately exported so fake mode cannot
 * become a weaker authority boundary than production.
 */
export function prepareModulePlanningInputs(input: ModelPortContext): {
  readonly blueprint: CustomerEffectBlueprint;
  readonly accepted: ReturnType<typeof readVerifiedAcceptedBlueprintArtifact>;
  readonly catalog: readonly ReturnType<typeof parsePlanningSummary>[];
  readonly assets: readonly AssetRecord[];
} {
  const { blueprint, accepted } = acceptedModulePlanningFacts(input);
  const supplied = input.modulePlanningCatalog ?? [];
  assertDescriptorSafeJson(supplied, "planning catalog", 10_000);
  if (supplied.length > MAX_MODULE_PLANNING_CATALOG) throwModulePlanError("planning catalog exceeds bound");
  const catalog = supplied.map(parsePlanningSummary)
    .filter((entry) => entry.maturity === "stable")
    .map((entry) => ({
      kind: entry.kind, version: entry.version, maturity: entry.maturity,
      variants: [...entry.variants].sort(codePointCompare),
      slots: entry.slots.map((slot) => ({ id: slot.id, required: slot.required, ...(slot.requiredForVariants === undefined ? {} : { requiredForVariants: [...slot.requiredForVariants].sort(codePointCompare) }), allowedKinds: [...slot.allowedKinds].sort(codePointCompare) })),
      interactions: [...entry.interactions].sort(codePointCompare),
      layout: { regions: [...entry.layout.regions].sort(codePointCompare), minColumnSpan: entry.layout.minColumnSpan, maxColumnSpan: entry.layout.maxColumnSpan, preferredHeights: [...entry.layout.preferredHeights].sort(codePointCompare) },
    }))
    .sort((left, right) => codePointCompare(`${left.kind}@${left.version}`, `${right.kind}@${right.version}`));
  if (new Set(catalog.map((entry) => `${entry.kind}\u0000${entry.version}`)).size !== catalog.length) throwModulePlanError("planning catalog contains duplicate kind/version");
  const rawAssets = input.assetCatalog ?? [];
  assertDescriptorSafeJson(rawAssets, "asset catalog", 10_000);
  if (rawAssets.length > MAX_MODULE_PLANNING_ASSETS) throwModulePlanError("asset catalog exceeds bound");
  const assetResults = rawAssets.map((asset) => AssetRecordSchema.safeParse(asset));
  const assets: AssetRecord[] = [];
  for (const result of assetResults) {
    if (!result.success) throwModulePlanError("asset catalog failed schema validation");
    assets.push(result.data);
  }
  assets.sort((left, right) => codePointCompare(left.id, right.id));
  if (new Set(assets.map((asset) => asset.id)).size !== assets.length) throwModulePlanError("asset catalog contains duplicate IDs");
  const stableKinds = new Set(catalog.map((entry) => entry.kind));
  const unavailable = accepted.modules.filter((module) => !stableKinds.has(module.expectedKind)).map((module) => `${module.blueprintModuleId}:${module.expectedKind}`).sort(codePointCompare);
  if (catalog.length === 0) throwModulePlanError("no stable registry modules are currently available for planning");
  if (unavailable.length > 0) throwModulePlanError(`accepted blueprint requires unavailable stable modules: ${unavailable.join(", ")}`);
  return Object.freeze({ blueprint, accepted, catalog: Object.freeze(catalog), assets: Object.freeze(assets) });
}

/**
 * CLARIFY 输出若漏掉 clarifyingQuestion（模型只声明要澄清却没给问题），
 * 回填一个默认问题，防止“只澄清、没有问题”的空追问（Task 5）。
 */
function normalizeClarifyOutput(raw: unknown): unknown {
  const record = (raw ?? {}) as Record<string, unknown>;
  if (record["intent"] !== "CLARIFY") {
    // 防御：模型信息足够（intent 非 CLARIFY）却仍带澄清字段时，剥离它们，
    // 否则 superRefine 交叉校验会拒绝（非 CLARIFY 不得携带 clarifyingQuestion）。
    if (record["clarifyingQuestion"] !== undefined || record["needsClarification"] !== undefined) {
      const { clarifyingQuestion: _cq, needsClarification: _nc, ...rest } = record;
      void _cq;
      void _nc;
      return rest;
    }
    return raw;
  }
  const q = record["clarifyingQuestion"];
  const hasUsableQuestion =
    q !== undefined &&
    q !== null &&
    typeof q === "object" &&
    typeof (q as Record<string, unknown>)["question"] === "string" &&
    ((q as Record<string, unknown>)["question"] as string).length > 0;
  if (hasUsableQuestion) return raw;
  return {
    ...record,
    needsClarification: true,
    clarifyingQuestion: {
      question: "请补充需求信息（例如主题、页面或布局方向），以便生成设计方案。",
      options: ["①补充主题/业务场景", "②补充页面结构", "③补充风格偏好"],
    },
  };
}

/** 从 LLM 回复中提取 JSON（容忍 ```json 围栏与前后杂文本）。 */
export function extractJson(content: string): unknown {
  const trimmed = content.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1]!.trim() : trimmed;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    const beginsObject = start !== -1 && body.slice(start).trimStart().startsWith("{");
    throw new JsonExtractionError(beginsObject ? "JSON_TRUNCATED" : "NO_JSON_OBJECT", "no JSON object in model reply");
  }
  try {
    return JSON.parse(body.slice(start, end + 1));
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new JsonExtractionError(/unexpected end/i.test(detail) ? "JSON_TRUNCATED" : "JSON_PARSE", `unparseable JSON: ${detail}`);
  }
}

function knownGuidSet(entities: EditableEntity[] | undefined): Set<string> {
  return new Set((entities ?? []).map((entity) => entity.guid));
}

function normalizeStyleDeclarationAliases(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const declarations = { ...(raw as Record<string, unknown>) };
  if (declarations["textColor"] === undefined && typeof declarations["color"] === "string") {
    declarations["textColor"] = declarations["color"];
  }
  delete declarations["color"];
  if (typeof declarations["fontWeight"] === "string") {
    const weight = declarations["fontWeight"].trim().toLowerCase();
    if (weight === "bold") declarations["fontWeight"] = 700;
    else if (weight === "normal") declarations["fontWeight"] = 400;
    else if (/^[1-9]00$/.test(weight)) declarations["fontWeight"] = Number(weight);
  }
  for (const property of [
    "borderRadius",
    "fontSize",
    "lineHeight",
    "padding",
    "margin",
    "gap",
    "opacity",
  ]) {
    const value = declarations[property];
    if (typeof value !== "string") continue;
    const match = value.match(/^\s*(\d+(?:\.\d+)?|\.\d+)\s*(?:px)?\s*$/i);
    if (match !== null) declarations[property] = Number(match[1]);
  }
  const boxShadow = declarations["boxShadow"];
  if (
    typeof boxShadow === "string"
    && !["none", "small", "medium", "large"].includes(boxShadow)
  ) {
    const normalizedShadow = boxShadow.trim();
    const colorStart = normalizedShadow.search(/\s+(?=#|rgba?\()/i);
    const lengthPart = colorStart === -1
      ? normalizedShadow
      : normalizedShadow.slice(0, colorStart).trim();
    const colorPart = colorStart === -1 ? "" : normalizedShadow.slice(colorStart).trim();
    const lengths = lengthPart.split(/\s+/);
    const safeLength = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:px)?$/i;
    const safeColor = /^(?:#[0-9a-f]{3,8}|rgba?\(\s*(?:\d+(?:\.\d+)?|\.\d+)(?:\s*,\s*(?:\d+(?:\.\d+)?|\.\d+)){2,3}\s*\))$/i;
    if (
      lengths.length >= 2
      && lengths.length <= 4
      && lengths.every((length) => safeLength.test(length))
      && (colorPart.length === 0 || safeColor.test(colorPart))
    ) {
      const blur = lengths.length >= 3 ? Number.parseFloat(lengths[2]!) : 0;
      declarations["boxShadow"] = blur <= 4 ? "small" : blur <= 16 ? "medium" : "large";
    }
  }
  return declarations;
}

function fitComponentGeometryToPage(
  components: unknown[],
  pageWidth: unknown,
  pageHeight: unknown,
): unknown[] {
  if (
    typeof pageWidth !== "number"
    || !Number.isFinite(pageWidth)
    || pageWidth <= 0
    || typeof pageHeight !== "number"
    || !Number.isFinite(pageHeight)
    || pageHeight <= 0
  ) {
    return components;
  }
  const round = (value: number) => Math.round(value * 1_000_000) / 1_000_000;
  return components.map((component) => {
    if (component === null || typeof component !== "object" || Array.isArray(component)) {
      return component;
    }
    const geometry = (component as Record<string, unknown>)["geometry"];
    if (geometry === null || typeof geometry !== "object" || Array.isArray(geometry)) {
      return component;
    }
    const record = geometry as Record<string, unknown>;
    const { x, y, width, height } = record;
    if (![x, y, width, height].every(
      (value) => typeof value === "number" && Number.isFinite(value),
    )) return component;
    const fittedWidth = Math.min(Math.max(width as number, 0), pageWidth);
    const fittedHeight = Math.min(Math.max(height as number, 0), pageHeight);
    const fittedX = Math.min(Math.max(x as number, 0), pageWidth - fittedWidth);
    const fittedY = Math.min(Math.max(y as number, 0), pageHeight - fittedHeight);
    if (
      fittedX === x
      && fittedY === y
      && fittedWidth === width
      && fittedHeight === height
    ) return component;
    return {
      ...(component as Record<string, unknown>),
      geometry: {
        x: round(fittedX),
        y: round(fittedY),
        width: round(fittedWidth),
        height: round(fittedHeight),
      },
    };
  });
}

function stableTabId(label: string): string {
  const normalized = label.trim().normalize("NFKC").toLowerCase();
  const asciiSlug = normalized
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (asciiSlug.length > 0) return `tab-${asciiSlug}`;
  const codePoints = Array.from(normalized, (character) =>
    character.codePointAt(0)!.toString(36));
  return `tab-${codePoints.join("-") || "item"}`;
}

function normalizeUiImplementationAliases(raw: unknown): unknown {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return raw;
  const implementation = raw as Record<string, unknown>;
  if (!Array.isArray(implementation["pages"])) return raw;
  let normalizedTheme = implementation["theme"];
  if (
    normalizedTheme !== null
    && typeof normalizedTheme === "object"
    && !Array.isArray(normalizedTheme)
  ) {
    const themeRecord = normalizedTheme as Record<string, unknown>;
    const radiusScale = themeRecord["radiusScale"];
    if (radiusScale !== null && typeof radiusScale === "object" && !Array.isArray(radiusScale)) {
      const normalizedRadiusScale = { ...(radiusScale as Record<string, unknown>) };
      if (normalizedRadiusScale["small"] === undefined) {
        normalizedRadiusScale["small"] = normalizedRadiusScale["sm"];
      }
      if (normalizedRadiusScale["medium"] === undefined) {
        normalizedRadiusScale["medium"] = normalizedRadiusScale["md"];
      }
      if (normalizedRadiusScale["large"] === undefined) {
        normalizedRadiusScale["large"] = normalizedRadiusScale["lg"];
      }
      delete normalizedRadiusScale["sm"];
      delete normalizedRadiusScale["md"];
      delete normalizedRadiusScale["lg"];
      normalizedTheme = {
        ...themeRecord,
        radiusScale: normalizedRadiusScale,
      };
    }
  }
  return {
    ...implementation,
    theme: normalizedTheme,
    pages: (implementation["pages"] as unknown[]).map((page) => {
      if (page === null || typeof page !== "object" || Array.isArray(page)) return page;
      const pageRecord = page as Record<string, unknown>;
      if (!Array.isArray(pageRecord["components"])) return page;
      const normalizedComponents = (pageRecord["components"] as unknown[]).map((component) => {
        if (component === null || typeof component !== "object" || Array.isArray(component)) {
          return component;
        }
        const componentRecord = component as Record<string, unknown>;
        let normalizedContent = componentRecord["content"];
        let normalizedProperties = componentRecord["properties"];
        let inferredBorderRadius: number | undefined;
        if (
          (componentRecord["capabilityId"] === "text"
            || componentRecord["capabilityId"] === "richtext")
          && normalizedProperties !== null
          && typeof normalizedProperties === "object"
          && !Array.isArray(normalizedProperties)
        ) {
          const properties = { ...(normalizedProperties as Record<string, unknown>) };
          if (normalizedContent === undefined && typeof properties["content"] === "string") {
            normalizedContent = properties["content"];
          }
          delete properties["content"];
          normalizedProperties = properties;
        }
        if (
          componentRecord["capabilityId"] === "image"
          && normalizedProperties !== null
          && typeof normalizedProperties === "object"
          && !Array.isArray(normalizedProperties)
        ) {
          const properties = { ...(normalizedProperties as Record<string, unknown>) };
          const shape = properties["shape"];
          if (shape === "circle") inferredBorderRadius = 100;
          else if (shape === "rounded") inferredBorderRadius = 16;
          if (shape === "circle" || shape === "rounded") delete properties["shape"];
          if (typeof properties["src"] === "string") normalizedContent = undefined;
          normalizedProperties = properties;
        }
        if (
          componentRecord["capabilityId"] === "tabs"
          && normalizedProperties !== null
          && typeof normalizedProperties === "object"
          && !Array.isArray(normalizedProperties)
        ) {
          const properties = { ...(normalizedProperties as Record<string, unknown>) };
          if (Array.isArray(properties["tabs"])) {
            const tabs = properties["tabs"] as unknown[];
            const usedIds = new Set(
              tabs.flatMap((tab) => {
                if (tab === null || typeof tab !== "object" || Array.isArray(tab)) return [];
                const id = (tab as Record<string, unknown>)["id"];
                return typeof id === "string" && id.length > 0 ? [id] : [];
              }),
            );
            properties["tabs"] = tabs.map((tab) => {
              if (tab === null || typeof tab !== "object" || Array.isArray(tab)) return tab;
              const tabRecord = tab as Record<string, unknown>;
              if (typeof tabRecord["label"] !== "string" || tabRecord["id"] !== undefined) {
                return tab;
              }
              const baseId = stableTabId(tabRecord["label"]);
              let id = baseId;
              let suffix = 2;
              while (usedIds.has(id)) {
                id = `${baseId}-${suffix}`;
                suffix += 1;
              }
              usedIds.add(id);
              return { ...tabRecord, id };
            });
          }
          normalizedProperties = properties;
        }
        if (
          componentRecord["capabilityId"] === "button"
          && normalizedProperties !== null
          && typeof normalizedProperties === "object"
          && !Array.isArray(normalizedProperties)
        ) {
          const properties = { ...(normalizedProperties as Record<string, unknown>) };
          if (normalizedContent === undefined) {
            if (typeof properties["label"] === "string") {
              normalizedContent = properties["label"];
            } else if (typeof properties["text"] === "string") {
              normalizedContent = properties["text"];
            }
          }
          delete properties["label"];
          delete properties["text"];
          normalizedProperties = properties;
        }
        const style = componentRecord["style"];
        if (style === null || typeof style !== "object" || Array.isArray(style)) {
          return {
            ...componentRecord,
            content: normalizedContent,
            ...(normalizedProperties !== undefined ? { properties: normalizedProperties } : {}),
          };
        }
        const styleRecord = style as Record<string, unknown>;
        const states = styleRecord["states"];
        const normalizedStates =
          states !== null && typeof states === "object" && !Array.isArray(states)
            ? Object.fromEntries(
                Object.entries(states as Record<string, unknown>).map(([name, declarations]) => [
                  name,
                  normalizeStyleDeclarationAliases(declarations),
                ]),
              )
            : states;
        const normalizedDeclarations = normalizeStyleDeclarationAliases(styleRecord["declarations"]);
        const declarationsWithShape =
          inferredBorderRadius !== undefined
          && normalizedDeclarations !== null
          && typeof normalizedDeclarations === "object"
          && !Array.isArray(normalizedDeclarations)
          && (normalizedDeclarations as Record<string, unknown>)["borderRadius"] === undefined
            ? {
                ...(normalizedDeclarations as Record<string, unknown>),
                borderRadius: inferredBorderRadius,
              }
            : normalizedDeclarations;
        return {
          ...componentRecord,
          content: normalizedContent,
          ...(normalizedProperties !== undefined ? { properties: normalizedProperties } : {}),
          style: {
            ...styleRecord,
            declarations: declarationsWithShape,
            ...(normalizedStates !== undefined ? { states: normalizedStates } : {}),
          },
        };
      });
      return {
        ...pageRecord,
        components: fitComponentGeometryToPage(
          normalizedComponents,
          pageRecord["width"],
          pageRecord["height"],
        ),
      };
    }),
  };
}

export class DeepSeekModelPort implements ModelPort {
  private readonly baseUrl: string;
  private readonly model: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly options: DeepSeekModelOptions) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.model = options.model ?? DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetch ?? globalThis.fetch;
  }

  private async chatJson(
    system: string,
    user: string,
    options: { maxTokens?: number } = {},
  ): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
          response_format: { type: "json_object" },
          temperature: 0.2,
          max_tokens: options.maxTokens ?? 4000,
        }),
        signal: controller.signal,
      });
    } catch (error) {
      throw new DeepSeekModelOutputError(
        `api call failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new DeepSeekModelOutputError(`api http ${response.status}: ${text.slice(0, 300)}`);
    }
    const data = (await response.json()) as {
      choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
    };
    const choice = data.choices?.[0];
    const content = choice?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new DeepSeekModelOutputError("empty model reply");
    }
    if (choice?.finish_reason === "length") {
      throw new JsonExtractionError("JSON_TRUNCATED", "model reply was truncated at the output token limit");
    }
    return extractJson(content);
  }

  async classifyIntent(input: ModelPortContext): Promise<ClassifyIntentResult> {
    const userPrompt = [
      "根据用户最近的需求，判断意图（intent），可选值：",
      'QUESTION（提问/闲聊）、NEW_REQUIREMENT（新建工程需求）、MODIFY_REQUIREMENT（修改已有工程）、CONFIRM_DESIGN（明确确认设计蓝图）、REVISE_DESIGN（设计确认前补充或修改设计需求）、CONFIRM_PLAN（确认工程变更计划）、CANCEL_PLAN（取消计划）、BUILD（要求构建）、CONFIRM_BUILD（确认构建预览落地）、ROLLBACK（回滚）、CLARIFY（需求信息不足，需澄清）。',
      'requestedDomains：涉及的产品域（客户端工程为 ["kingclient"]）。',
      "reply：给用户的一句简短回复（可选）。",
      "needsClarification：是否需要补充信息（intent 为 CLARIFY 时为 true）。",
      'clarifyingQuestion：{"question":"具体问题","options":["选项1","选项2","选项3"]}（intent 为 CLARIFY 时必须输出）。',
      "",
      "澄清判定规则：",
      "判断需求信息是否足够生成设计方案：若主题/页面/布局/风格等关键信息缺失或模糊，intent 必须为 CLARIFY。",
      "CLARIFY 时：问题用礼貌开场，格式为「您好，为了帮您把方案做得更贴合需求，先确认一下：<具体问题>。请选择或直接告诉我。」",
      "选项必须带序号（①②③④⑤），最多 5 个，一次只问一个维度，选项简短具体（如「① 生产车间监控」）。",
      "信息足够时才返回 NEW_REQUIREMENT / MODIFY_REQUIREMENT，禁止猜测需求。",
      "若用户最近消息是在回答你上一个澄清问题（如回复「①」、选项序号、或包含上一轮选项的关键词，如「生产车间」），说明信息已补充，应转入 NEW_REQUIREMENT / MODIFY_REQUIREMENT，不得重复追问同一问题。",
      "若上一轮助手正在展示设计草案：只有用户明确表示确认时返回 CONFIRM_DESIGN；用户继续补充内容、布局、风格或模块时返回 REVISE_DESIGN。",
      "CONFIRM_PLAN 只用于用户明确批准已经展示的工程变更计划，不能用于确认设计草案。",
      "",
      "用户最近消息：",
      input.recentMessages.map((m) => `${m.role}: ${m.content}`).join("\n"),
      "最新需求：" + (input.requirementText ?? ""),
    ].join("\n");
    const raw = await this.chatJson(SYSTEM_PROMPT, userPrompt);
    const parsed = ClassifyIntentResultSchema.safeParse(normalizeClarifyOutput(raw));
    if (!parsed.success) {
      // 安全回退：无法理解时当作提问，绝不触碰构建路径。
      return {
        intent: "QUESTION",
        requestedDomains: ["kingclient"],
        reply: "（DeepSeek 模型输出未通过校验，已按提问处理）",
      };
    }
    return parsed.data;
  }

  async createDesignPlan(
    input: ModelPortContext,
    opts?: { revising?: boolean; rejectionReasons?: string[] },
  ): Promise<DesignPlan> {
    const revising = opts?.revising === true;
    const recentConversation = input.recentMessages
      .slice(-20)
      .map((message) => `${message.role}: ${message.content}`)
      .join("\n");
    const lines = [
      "你正在为客户编写可确认的《客户效果蓝图》，不是内部控件清单，也不是工程实施 JSON。使用专业、耐心、信息完整的顾问语言。",
      "第一次生成给客户的方案就必须完整详细；后续修订也必须保持完整，不能只列控件类型或增加占位数量。",
      "客户看不到内部 schema、KF GUID、坐标、变量 ID、原始工程 JSON 或工具调用细节；这些内容不得写入客户字段。",
      "设计遵循系统提示中的《KF 设计原则（KF_DESIGN_PRINCIPLES_FULL）》：布局有主次、避免模板脸、具有明确记忆点，模块文案具体可读。",
      "输出严格 JSON，schema 固定为 \"kf-design-plan/v2\"，所有字段必须齐全且不得为 null：",
      "displayName：客户可读的工程名称。",
      "overview：objective（方案目标）、audiences（目标受众数组）、scenarios（使用场景数组）、valueProposition（客户价值）。",
      "informationArchitecture：narrative（完整阅读/使用顺序）、wireframe（简洁 ASCII 或箭头线框）。",
      "modules：1-12 个页面模块；每项必须含 id、name、purpose、content（具体内容数组）、sampleData（示例数据数组，每项 label/value）、interactions（关键交互数组）、presentation（表现方式）。",
      "示例数据必须具体、可阅读且明显为模拟内容；客户要求内容充实时，相关模块 sampleData 不得为空。",
      "visualDirection：tone、colors 数组、typography、spacingAndSurfaces。",
      "highlights：客户可感知的方案亮点数组。",
      "revisionNotes：added、changed、retained 三个数组；首次方案在 added 中写主要方案要点，修订版逐条写真实新增、调整和保留内容。",
      "acceptanceCriteria：客户可观察的验收标准数组，例如模块数量、必须展示的信息和交互结果，不能写内部开发任务。",
      "openQuestions：仍值得客户确认但不妨碍当前方案成形的问题数组，没有则输出空数组。",
      "客户的每一条要求都必须落到具体模块、示例数据、交互、视觉决策或验收标准中，禁止遗漏。",
      "最近会话上下文：",
      recentConversation.length > 0 ? recentConversation : "（无）",
    ];
    if (revising) {
      lines.push(
        "客户修改意见：" + (input.requirementText ?? ""),
        "上一版设计计划：" + JSON.stringify(input.designPlan ?? "（无）"),
        "在上一版基础上修订，不要重来；保留未被客户要求修改的有效内容，并把每项改动同时体现在蓝图主体与 revisionNotes 中。",
      );
      const rejectionReasons = opts?.rejectionReasons ?? [];
      if (rejectionReasons.length > 0) {
        lines.push(
          "上一候选蓝图未通过质量门禁，必须修正以下问题：",
          ...rejectionReasons.map((reason) => `- ${reason}`),
          "请重新生成完整蓝图，不要只改 revisionNotes。",
        );
      }
    } else {
      lines.push("需求：" + (input.requirementText ?? ""));
    }
    const raw = await this.chatJson(SYSTEM_PROMPT, lines.join("\n"), { maxTokens: 8000 });
    const parsed = CustomerEffectBlueprintSchema.safeParse(raw);
    if (!parsed.success) {
      throw new DeepSeekModelOutputError(
        `design plan failed zod gate: ${parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
      );
    }
    return parsed.data;
  }

  async createProjectDesign(input: ModelPortContext): Promise<ProjectDesign> {
    const userPrompt = [
      "为一个全新的 KF 客户端工程生成初始设计。输出 JSON：",
      '{"displayName":"工程显示名","summary":"一句话设计说明"}',
      "需求：" + (input.requirementText ?? ""),
    ].join("\n");
    const raw = await this.chatJson(SYSTEM_PROMPT, userPrompt);
    const record = raw as Record<string, unknown>;
    const displayName =
      typeof record["displayName"] === "string" && record["displayName"].length > 0
        ? record["displayName"]
        : "KF 客户端工程";
    return {
      schema: "kf-solution-ir/v1",
      solutionId: solutionId(`sol-${input.workspaceId}`),
      displayName,
      projects: [],
      dependencies: [],
      pendingRequirements: [],
    };
  }

  private buildUiImplementationPrompt(input: ModelPortContext, revising: boolean): string {
    const pages = (input.editableEntities ?? [])
      .filter((entity) => entity.kind === "page")
      .map((entity) => entity.name);
    const controls = (input.editableEntities ?? [])
      .filter((entity) => entity.kind === "control")
      .map((entity) => `${entity.name} | capabilityId=${entity.type}`);
    const availableCapabilities = listControlCapabilities()
      .filter((capability) =>
        capability.generation.status !== "unsupported"
        && capability.generation.status !== "preserve-only");
    const capabilities = availableCapabilities
      .map((capability) => `${capability.id} (${capability.displayName})`);
    const styleUnavailable = availableCapabilities
      .filter((capability) => capability.style.adapter === undefined)
      .map((capability) => capability.id);
    return [
      "你是 UI 实施规划 Agent。把客户已经确认的效果蓝图转换为内部 UIImplementationSpec，不直接生成 ChangePlan 或 KF 工程 JSON。",
      "输出严格 JSON，schema 固定为 kf-ui-implementation/v1。",
      "顶层必须包含 theme 和 pages；theme 必须包含 background、surface、primary、accent、textPrimary、textSecondary、fontFamily、spacingUnit、radiusScale；radiusScale 必须使用 {\"small\":4,\"medium\":8,\"large\":16} 这三个完整键名，不得使用 sm/md/lg。",
      "pages 每项必须包含 id、width、height、components，且只能使用当前工程已有页面语义 ID。",
      "每个 component 必须包含 id、role、sourceModuleId、capabilityId、critical、geometry、properties、style。",
      "每个蓝图模块都必须至少由一个组件实现，sourceModuleId 必须逐字使用蓝图 modules[].id；禁止把多个模块都冒充映射到一个组件。",
      "控制输出规模：每个蓝图模块使用 1-2 个组件，总组件数不超过 24；需要承载多段说明时优先合并到 richtext 内容，避免为每行文字单独创建组件。",
      "component.id 使用稳定的英文语义 ID；若要修改已有控件，必须使用下方已有控件语义 ID；新组件使用新的唯一语义 ID。",
      "style 只能输出结构化 declarations/states；禁止输出原始 CSS、styleDataNew、选择器、JavaScript、KF GUID、objectType、uiModelType 或原始 KF 字段。",
      "style.declarations/states 仅允许 backgroundColor、textColor、borderColor、borderRadius、fontSize、fontWeight、lineHeight、padding、margin、gap、boxShadow、opacity、textAlign；borderRadius/fontSize/lineHeight/padding/margin/gap/opacity 必须是单个数值，不得带 px、不得写多值字符串；boxShadow 只能是 none/small/medium/large；文字颜色必须写 textColor，fontWeight 必须是 100-900 的数值（如 400/600/700），不能写 color、bold 或 normal。",
      "若蓝图包含当前样式白名单无法表达的悬停放大、过渡动画或鼠标样式，暂不实现该视觉细节；不得输出 transform、transition 或 cursor，优先保证其余内容可生成、可校验。",
      "布局坐标必须非负，且 x+width 不超过页面 width、y+height 不超过页面 height；组件不得重叠到不可阅读。",
      "首版优先使用页面绝对几何布局，以 text、richtext、image、tag、button、input、select、tabs、spacer 等扁平组件完成页面；除非确实需要 KF 容器语义，否则不要创建 layout.*。",
      "若使用 layout.*，properties 只能填写该 KF capability 已公开的语义属性，不得输出 justifyContent、alignItems、display、flexDirection、gridTemplateColumns 等 Web 布局字段。",
      "以下 capabilityId 只允许空 style（style 必须为 {declarations:{},states:{}}），不得添加任何 declarations/states；需要卡片化视觉时改用可样式化的 text/richtext/image："
        + (styleUnavailable.length > 0 ? styleUnavailable.join(", ") : "（无）"),
      "properties 只填写控件公开语义属性；button、text、richtext 的显示内容写在 component.content，不要放进 properties。",
      "tabs 控件的 properties.tabs 每项必须使用 {\"id\":\"稳定英文ID\",\"label\":\"显示名称\"}，不得省略 id。",
      "button 控件的显示文字必须写在 component.content，不得使用 properties.label 或 properties.text。",
      "image 控件只使用 properties.src/fit/alt，不得填写 component.content。",
      "客户确认蓝图：",
      JSON.stringify(input.designPlan ?? null),
      "当前工程摘要：" + (input.revisionSummary ?? "（无）"),
      "可用页面语义 ID：" + (pages.length > 0 ? pages.join(", ") : "Page1"),
      "已有控件（语义 ID | capabilityId）：" + (controls.length > 0 ? controls.join("\n") : "（无）"),
      "可选 capabilityId：" + capabilities.join(", "),
      ...(revising
        ? [
            "上一版 UIImplementationSpec：" + JSON.stringify(input.uiImplementation ?? null),
            "客户本次修改要求：" + (input.requirementText ?? ""),
            "仅修改受影响组件，保留未涉及模块的稳定 ID、内容、布局和样式。",
            ...((input.implementationRejectionReasons ?? []).length > 0
              ? [
                  "上一候选实施规格未通过确定性门禁，必须逐项修复：",
                  ...(input.implementationRejectionReasons ?? []).map((reason) => `- ${reason}`),
                ]
              : []),
          ]
        : []),
    ].join("\n");
  }

  private async requestUiImplementation(
    input: ModelPortContext,
    revising: boolean,
    recoveryInstruction?: string,
  ): Promise<UIImplementationSpec> {
    const raw = await this.chatJson(
      UI_IMPLEMENTATION_SYSTEM_PROMPT,
      [
        this.buildUiImplementationPrompt(input, revising),
        ...(recoveryInstruction !== undefined ? [recoveryInstruction] : []),
      ].join("\n"),
      { maxTokens: 8000 },
    );
    const parsed = UIImplementationSpecSchema.safeParse(normalizeUiImplementationAliases(raw));
    if (!parsed.success) {
      throw new DeepSeekModelOutputError(
        `UI implementation failed zod gate: ${parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
      );
    }
    return parsed.data;
  }

  private async generateUiImplementation(
    input: ModelPortContext,
    revising: boolean,
  ): Promise<UIImplementationSpec> {
    if (input.designPlan === undefined) {
      throw new DeepSeekModelOutputError("confirmed design plan is required for UI implementation");
    }
    try {
      return await this.requestUiImplementation(input, revising);
    } catch (error) {
      if (!(error instanceof DeepSeekModelOutputError)) throw error;
      const reason = error.message.slice(0, 300);
      return this.requestUiImplementation(
        input,
        revising,
        [
          "上一轮输出未形成完整合法 JSON，必须重新生成一份完整、可解析的 UIImplementationSpec，不要续写残片。",
          `上一轮失败原因：${reason}`,
          "本次务必压缩规模：每个蓝图模块 1-2 个组件，总组件数不超过 16；合并同模块的说明文字，所有 JSON 对象和数组必须完整闭合。",
          "删除所有不在结构化样式白名单内的效果，不得输出 transform、transition 或 cursor；不要用原始 CSS 补偿。",
        ].join("\n"),
      );
    }
  }

  createUiImplementation(input: ModelPortContext): Promise<UIImplementationSpec> {
    return this.generateUiImplementation(input, false);
  }

  reviseUiImplementation(input: ModelPortContext): Promise<UIImplementationSpec> {
    return this.generateUiImplementation(input, true);
  }

  private planningCatalog(input: ModelPortContext) {
    return prepareModulePlanningInputs(input).catalog;
  }

  private buildModulePlanPrompt(input: ModelPortContext, revising: boolean): string {
    const { blueprint, accepted, catalog, assets } = prepareModulePlanningInputs(input);

    const acceptedById = new Map(accepted.modules.map((module) => [module.blueprintModuleId, module]));
    const confirmedModules = blueprint.modules.map((module) => {
      const fact = acceptedById.get(module.id)!;
      return {
        id: module.id,
        name: module.name,
        purpose: module.purpose,
        content: module.content,
        sampleData: module.sampleData,
        presentation: module.presentation,
        interactions: module.interactions,
        expectedKind: fact.expectedKind,
        expectedCategory: fact.expectedCategory,
        interactionRequirements: fact.interactionRequirements,
      };
    });
    assertDescriptorSafeJson(input.recentMessages, "recent messages", 10_000);
    const recentMessages = input.recentMessages.map((message) => {
      if (message === null || typeof message !== "object" || Array.isArray(message)) throwModulePlanError("recent messages failed schema validation");
      const record = message as Record<string, unknown>;
      if ((record.role !== "user" && record.role !== "assistant") || typeof record.content !== "string") throwModulePlanError("recent messages failed schema validation");
      return { role: record.role, content: record.content };
    });
    const selectedRecentMessages = recentMessages.slice(-MAX_MODULE_RECENT_MESSAGES);
    const recentTruncated = recentMessages.length > MAX_MODULE_RECENT_MESSAGES || selectedRecentMessages.some((message) => message.content.length > MAX_MODULE_CONTEXT_ITEM_CHARS);
    const recentConversation = selectedRecentMessages
      .map((message) => `${message.role}: ${message.content.slice(0, MAX_MODULE_CONTEXT_ITEM_CHARS)}`)
      .join("\n");
    const rawReasons = input.modulePlanRejectionReasons ?? [];
    assertDescriptorSafeJson(rawReasons, "module rejection reasons", 10_000);
    if (rawReasons.some((reason) => typeof reason !== "string")) throwModulePlanError("module rejection reasons failed schema validation");
    const sortedReasons = [...rawReasons].sort(codePointCompare);
    const reasonsTruncated = sortedReasons.length > MAX_MODULE_REJECTION_REASONS || sortedReasons.some((reason) => reason.length > MAX_MODULE_CONTEXT_ITEM_CHARS);
    const rejectionReasons = sortedReasons.slice(0, MAX_MODULE_REJECTION_REASONS).map((reason) => reason.slice(0, MAX_MODULE_CONTEXT_ITEM_CHARS));
    const requirementText = input.requirementText ?? "（无）";
    if (typeof requirementText !== "string" || requirementText.length > MAX_MODULE_REQUIREMENT_CHARS) throwModulePlanError("requirement text exceeds prompt bound");
    let previousPlanForPrompt: ModulePlan | undefined;
    if (revising) {
      if (input.previousModulePlan === undefined) throwModulePlanError("revision requires a previous ModulePlan");
      assertDescriptorSafeJson(input.previousModulePlan, "previous ModulePlan");
      const previous = ModulePlanSchema.safeParse(input.previousModulePlan);
      if (!previous.success) throwModulePlanError("previous ModulePlan failed schema validation");
      previousPlanForPrompt = previous.data;
    }
    const prompt = [
      "把已经确认的客户效果蓝图转换成完整 ModulePlan，而不是 UIImplementationSpec、ChangePlan 或 KF JSON。",
      "输出 schema 固定为 kf-module-plan/v1，包含 projectKey、theme、assets、pages、operations。顶层 assets 由服务器强制替换为当前目录快照，模型不得决定它；模块只能在 assetId 中引用目录中的 id，绝不写路径、URL、storageKey 或文件名替代 ID。",
      "每个 module 只能使用稳定目录中逐字一致的 kind、version(templateVersion) 和 variant；beta、unsupported 或未列出的条目一律不可用。",
      "placement 只能表达 region、order、columnSpan、preferredHeight、alignment、emphasis；禁止输出 geometry、x、y、width、height 或任何 CSS。",
      "每个已确认蓝图模块 ID 必须且只能出现一次 sourceBlueprintModuleIds；其 module.kind 必须逐字匹配服务器已确认的 expectedKind。不要新增、删除或改写这些来源 ID。",
      "内容只能写 title 与 JSON 字符串 content；theme 只能使用 ModulePlan 的结构化 theme 字段。禁止原生 KF 字段、objectType、uiModelType、styleDataNew、脚本、HTML、JavaScript、CSS、文件路径与存储键。",
      "交互只能使用登记模块允许的 ModulePlan 交互类型，并匹配已确认蓝图交互要求。",
      revising
        ? "这是完整修订：pages 必须保留所有上一版模块；没有显式 operations 目标的旧模块必须逐字保持不变。不得把遗漏当作删除。"
        : "这是首次完整规划：所有已确认蓝图模块都必须落到 pages.modules。",
      "已确认且服务器签名的蓝图事实（模型不得改变其中 expectedKind/category/interactionRequirements）：",
      JSON.stringify({ projectKey: accepted.projectKey, revisionId: accepted.revisionId, modules: confirmedModules }),
      "生产稳定模块目录（来自 Registry.listForPlanning()）：",
      catalog.map((entry) => `${entry.kind}@${entry.version} variants=${entry.variants.join(",")} layout=${JSON.stringify(entry.layout)} interactions=${entry.interactions.join(",") || "none"} assetSlots=${JSON.stringify(entry.slots)}`).join("\n"),
      "服务器资产目录（只能按 id 引用；assets 顶层必须逐条原样回显）：",
      JSON.stringify(assets),
      "最近会话上下文：",
      recentConversation || "（无）",
      recentTruncated ? "[recentMessages truncated=true]" : "[recentMessages truncated=false]",
      "客户本次要求：" + requirementText,
      ...(revising ? ["上一版完整 ModulePlan：", JSON.stringify(previousPlanForPrompt)] : []),
      reasonsTruncated ? "[rejectionReasons truncated=true]" : "[rejectionReasons truncated=false]",
      ...(rejectionReasons.length > 0 ? ["上一候选未通过的确定性门禁（逐项修复，不得扩展范围）：", ...rejectionReasons.map((reason) => `- ${reason}`)] : []),
    ].join("\n");
    if (new TextEncoder().encode(prompt).byteLength > MAX_MODULE_PROMPT_BYTES) throwModulePlanError("module planning prompt exceeds aggregate bound");
    return prompt;
  }

  /** Pure server gate; fake mode calls the same gate and never bypasses it. */
  validateModulePlan(input: ModelPortContext, raw: unknown, revising: boolean): ModulePlan {
    assertSafeModulePlanOutput(raw);
    const { accepted, assets } = prepareModulePlanningInputs(input);
    // assets are a server-owned catalog snapshot. A model's echoed top-level
    // list is never authoritative; retain its page intent but overwrite the
    // snapshot before the strict ModulePlan parse and semantic gate.
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) throwModulePlanError("failed zod gate: plan must be an object");
    const parsed = ModulePlanSchema.safeParse({ ...(raw as Record<string, unknown>), assets });
    if (!parsed.success) {
      throwModulePlanError(`failed zod gate: ${parsed.error.issues.slice(0, 3).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
    }
    const plan = parsed.data;
    if (!revising && plan.operations.length !== 0) throwModulePlanError("create ModulePlan operations must be empty");
    if (plan.projectKey !== accepted.projectKey) throwModulePlanError("projectKey differs from accepted artifact");
    const catalog = this.planningCatalog(input);
    const definitionByKey = new Map(catalog.map((entry) => [`${entry.kind}\u0000${entry.version}`, entry]));
    const assetsById = new Map(assets.map((asset) => [asset.id, asset]));
    const acceptedByBlueprintId = new Map(accepted.modules.map((module) => [module.blueprintModuleId, module]));
    if (revising) {
      if (input.previousModulePlan === undefined) throwModulePlanError("revision requires a previous ModulePlan");
      assertDescriptorSafeJson(input.previousModulePlan, "previous ModulePlan");
      const previous = ModulePlanSchema.safeParse(input.previousModulePlan);
      if (!previous.success) throwModulePlanError("previous ModulePlan failed schema validation");
      if (previous.data.projectKey !== plan.projectKey) throwModulePlanError("revision projectKey differs from previous ModulePlan");
      const expectedOperations = deriveExactModulePlanOperations(
        previous.data,
        plan,
        new Set(accepted.modules.map((module) => module.blueprintModuleId)),
      );
      const actualOperations = [...plan.operations].sort((left, right) => codePointCompare(operationSortKey(left), operationSortKey(right)));
      if (!stableEqual(actualOperations, expectedOperations)) throwModulePlanError("operations do not exactly describe the revision delta");
    }
    const seenBlueprintIds = new Set<string>();
    for (const page of plan.pages) {
      for (const module of page.modules) {
        if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(module.id)) {
          throwModulePlanError(`module ID must be semantic and stable: ${module.id}`);
        }
        const definition = definitionByKey.get(`${module.kind}\u0000${module.templateVersion}`);
        if (definition === undefined || !definition.variants.includes(module.variant)) {
          throwModulePlanError(`uses unknown, beta, unsupported, or unavailable module: ${module.kind}@${module.templateVersion}/${module.variant}`);
        }
        if (!definition.layout.regions.includes(module.placement.region)
          || module.placement.columnSpan < definition.layout.minColumnSpan
          || module.placement.columnSpan > definition.layout.maxColumnSpan
          || !definition.layout.preferredHeights.includes(module.placement.preferredHeight)
          || module.interactions.some((interaction) => !definition.interactions.includes(interaction.type))) {
          throwModulePlanError(`uses invalid semantic placement or interaction for ${module.id}`);
        }
        const signedInteractions = (module.sourceBlueprintModuleIds ?? []).flatMap((blueprintId) => {
          const acceptedFact = acceptedByBlueprintId.get(blueprintId);
          return acceptedFact?.interactionRequirements.map((entry) => ({ type: entry.type, target: entry.target, actionKind: entry.actionKind })) ?? [];
        });
        const signedKeys = signedInteractions.map(interactionIdentity).sort(codePointCompare);
        if (new Set(signedKeys).size !== signedKeys.length) {
          throwModulePlanError(`accepted interaction requirements are ambiguous for ${module.id}`);
        }
        const actualInteractions = module.interactions.map((interaction) => ({ type: interaction.type, target: interactionTarget(interaction) }));
        const actualKeys = actualInteractions.map(interactionIdentity);
        if (new Set(actualKeys).size !== actualKeys.length || !stableEqual(actualKeys, signedKeys)) {
          throwModulePlanError(`interactions do not exactly match signed requirements for ${module.id}`);
        }
        const requiredSlot = definition.slots.find((slot) => slot.required || slot.requiredForVariants?.includes(module.variant));
        if (module.assetId === undefined && requiredSlot !== undefined) {
          throwModulePlanError(`omits required asset for ${module.id}: ${requiredSlot.id}`);
        }
        if (module.assetId !== undefined) {
          const asset = assetsById.get(module.assetId);
          if (asset === undefined) throwModulePlanError(`references unknown asset ID: ${module.assetId}`);
          if (!definition.slots.some((slot) => slot.allowedKinds.includes(asset.kind))) {
            throwModulePlanError(`uses asset kind unavailable to ${module.id}`);
          }
        }
        for (const blueprintId of module.sourceBlueprintModuleIds ?? []) {
          const acceptedFact = acceptedByBlueprintId.get(blueprintId);
          if (acceptedFact === undefined || acceptedFact.expectedKind !== module.kind || seenBlueprintIds.has(blueprintId)) {
            throwModulePlanError(`has invalid sourceBlueprintModuleIds declaration for ${module.id}`);
          }
          seenBlueprintIds.add(blueprintId);
        }
      }
    }
    const expectedBlueprintIds = accepted.modules.map((module) => module.blueprintModuleId).sort(codePointCompare);
    const actualBlueprintIds = [...seenBlueprintIds].sort(codePointCompare);
    if (!stableEqual(actualBlueprintIds, expectedBlueprintIds)) throwModulePlanError("does not cover every accepted blueprint module exactly once");

    return plan;
  }

  private async requestModulePlan(input: ModelPortContext, revising: boolean, repair?: string): Promise<ModulePlan> {
    const raw = await this.chatJson(
      MODULE_PLAN_SYSTEM_PROMPT,
      [this.buildModulePlanPrompt(input, revising), ...(repair === undefined ? [] : [repair])].join("\n"),
      { maxTokens: 8000 },
    );
    return this.validateModulePlan(input, raw, revising);
  }

  private async generateModulePlan(input: ModelPortContext, revising: boolean): Promise<ModulePlan> {
    try {
      return await this.requestModulePlan(input, revising);
    } catch (error) {
      if (!(error instanceof JsonExtractionError)) throw error;
      return this.requestModulePlan(input, revising, [
        "上一轮仅因 JSON 无法解析或被截断而失败。只修复 JSON 语法并输出完整对象；不要改变已确认蓝图、目录、资产或修订范围。",
        "只修复 JSON 语法，不要续写残片，不要添加解释、CSS、坐标或原生 KF 字段。",
      ].join("\n"));
    }
  }

  createModulePlan(input: ModelPortContext): Promise<ModulePlan> {
    return this.generateModulePlan(input, false);
  }

  reviseModulePlan(input: ModelPortContext): Promise<ModulePlan> {
    return this.generateModulePlan(input, true);
  }

  /** 构造 create/revise 共用的计划生成 prompt。 */
  private buildPlanPrompt(input: ModelPortContext, revising: boolean): string {
    const entities = input.editableEntities ?? [];
    const entityLines = entities.map((e) => `${e.name} | type=${e.type} | guid=${e.guid}`);
    return [
      revising
        ? "用户要求修改计划。请基于修订意见输出新的变更计划 JSON。"
        : "请根据需求输出变更计划 JSON。",
      "变更计划 JSON 格式（严格）：",
      '{"operations":[{"op":"update","entityId":"<清单中的 GUID>","entityType":"control","changes":[{"path":"/text","value":"..."}]}]}',
      "create（新增控件）格式：{\"op\":\"create\",\"entityType\":\"control\",\"entityId\":\"新语义id如NewTitle\",\"properties\":{\"pageId\":\"<清单中的页面GUID>\",\"type\":\"text|button|inputnumber|switch|checkbox|radio|select|image|tabs|table|richtext|spacer|radiolegacy|checkboxlegacy|combobox|scale|list|treeview|webcontainer|gantt|factorycalendar|input|cascader|datetimepicker|dropdown|navmenu|tree|upload|transfer|tag|timeline|steps|easyui|layout|prototype\",\"text\":\"控件文本\",\"x\":60,\"y\":50,\"width\":300,\"height\":40}}",
      "create 控件类型说明：静态控件用 type=上述枚举（text/button/input/...）；easyui 控件用 type=\"easyui\" + properties.proto（KF uiExtendType 数字，如 1=datagrid、2=linkbutton、11=datebox、17=tree、18=treegrid、26=sidemenu、5=propertygrid、9=textbox、0=combobox、28=validatebox）；布局用 type=\"layout\" + properties.layoutType；特殊节点用 type=\"prototype\" + properties.prototypeName（CustomCharts/AlarmWindow/TrendChart/BarChart/PieChart/XYChart/EventWindow）。",
      "delete 格式：{\"op\":\"delete\",\"entityId\":\"<清单中的 GUID>\",\"entityType\":\"control\",\"destructiveConfirmed\":true}",
      "规则：update/delete 的 entityId 必须来自下方实体清单的 GUID；create 的 entityId 是新的语义 id，entityType 固定为 control，控件类型放在 properties.type，properties.pageId 必须是清单中页面的 GUID。",
      "update 的 changes[].path 只能使用受控字段：text、value、visible、disabled、backgroundColor、width、height、x、y、fontInfo（字体大小写在 fontInfo.fontSize，不要单独用 /fontSize 路径）、borderColor、layoutStyle、options/radioData/selectData 等控件自身字段；禁止使用未列出的路径（如 /fontSize、/custom）。",
      "",
      "当前工程摘要：" + (input.revisionSummary ?? "（无）"),
      "",
      "可修改实体清单（name | type | guid）：",
      entityLines.length > 0 ? entityLines.join("\n") : "（无——只能 create 新控件或说明）",
      "",
      ...(input.designPlan !== undefined
        ? [
            "",
            "客户已确认的设计计划（必须据此落实为控件，每个分区 → 相应控件；新建场景用 create，修改场景用 update/delete）：",
            JSON.stringify(input.designPlan, null, 1),
          ]
        : []),
      "用户最新需求：" + (input.requirementText ?? ""),
    ].join("\n");
  }

  /** 校验并组装 ChangePlan；非法 GUID 的操作被拒绝（防止幻觉实体进入构建）。 */
  private assemblePlan(input: ModelPortContext, raw: unknown, revising: boolean): ChangePlan {
    const record = raw as Record<string, unknown>;
    const operations = Array.isArray(record["operations"]) ? record["operations"] : [];
    const known = knownGuidSet(input.editableEntities);
    const pageGuids = new Set(
      (input.editableEntities ?? [])
        .filter((entity) => entity.kind === "page")
        .map((entity) => entity.guid),
    );
    const filtered = operations.filter((op) => {
      const record = op as Record<string, unknown>;
      const entityId = record["entityId"];
      const opKind = record["op"];
      if (typeof entityId !== "string") return false;
      if (opKind === "create") {
        // create 的 entityId 是新的语义 id；pageId 必须命中清单中的页面 GUID。
        const pageId = (record["properties"] as Record<string, unknown> | undefined)?.["pageId"];
        return typeof pageId === "string" && pageGuids.has(pageId);
      }
      return known.has(entityId);
    });
    const plan: unknown = {
      schema: "kf-change-plan/v1",
      workspaceId: input.workspaceId,
      operations: filtered,
    };
    const parsed = changePlanSchema.safeParse(plan);
    if (!parsed.success) {
      throw new DeepSeekModelOutputError(
        `plan failed zod gate: ${parsed.error.issues
          .slice(0, 3)
          .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
          .join("; ")}`,
      );
    }
    if (revising && parsed.data.operations.length === 0) {
      throw new DeepSeekModelOutputError("revised plan has no valid operations");
    }
    return parsed.data;
  }

  async createChangePlan(input: ModelPortContext): Promise<ChangePlan> {
    const raw = await this.chatJson(SYSTEM_PROMPT, this.buildPlanPrompt(input, false));
    return this.assemblePlan(input, raw, false);
  }

  async reviseChangePlan(input: ModelPortContext): Promise<ChangePlan> {
    const raw = await this.chatJson(SYSTEM_PROMPT, this.buildPlanPrompt(input, true));
    return this.assemblePlan(input, raw, true);
  }

  async explainValidation(input: {
    tenantId: string;
    report: ValidationReport;
  }): Promise<string> {
    const userPrompt = [
      "用中文简短解释这份 KF 客户端工程校验报告（给用户看，两三句话）：",
      JSON.stringify(input.report, null, 2),
    ].join("\n");
    const raw = await this.chatJson(SYSTEM_PROMPT, userPrompt);
    const record = raw as Record<string, unknown>;
    if (typeof record["explanation"] === "string") {
      return record["explanation"];
    }
    return "（DeepSeek 模型未能生成校验解释）";
  }
}

/** Shared no-network validation entry point for deterministic fixtures. */
export function validateModulePlanForContext(input: ModelPortContext, raw: unknown, revising: boolean): ModulePlan {
  return new DeepSeekModelPort({
    apiKey: "internal-module-plan-validator",
    fetch: () => { throw new Error("module plan validator must not call network"); },
  }).validateModulePlan(input, raw, revising);
}
