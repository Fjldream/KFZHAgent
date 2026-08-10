import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { CONTROL_TYPE_BY_UIMODEL_TYPE } from "../ir/client-project-ir.js";

/**
 * Lossless client project inspector.
 *
 * Consumes an unpacked native client workspace (as produced by
 * `importNativeClientPackage`) and produces:
 * - `raw`: the complete, untouched JSON trees (pages, variables, scripts,
 *   project metadata) — nothing is dropped, unknown fields included;
 * - `index`: an entity index keyed by KF GUID (pages, controls, variables);
 * - `summary`: a bounded, LLM-friendly digest of the project (counts plus a
 *   capped representative control list per page);
 * - `provenance`: for every mapped entity, its source file/JSON path and the
 *   list of fields that the IR/templates do not yet understand.
 *
 * Unknown fields are never interpreted: they are preserved in `raw` and only
 * reported as names in `index`/`summary`/`provenance`.
 */

export interface SummaryLimits {
  /** Maximum number of representative controls listed per page. */
  controlsPerPage: number;
  /** Maximum number of pages listed in the summary. */
  pagesPerSummary: number;
}

export const DEFAULT_SUMMARY_LIMITS: SummaryLimits = {
  controlsPerPage: 50,
  pagesPerSummary: 200,
};

export interface InspectOptions {
  summaryLimits?: Partial<SummaryLimits>;
}

const VERSION_DIR_RE = /^\d+\.\d+\.\d+\.\d+$/;

// ---------------------------------------------------------------------------
// Index shapes
// ---------------------------------------------------------------------------

export interface ControlIndexEntry {
  guid: string;
  pageGuid: string;
  type: string;
  /** Stable semantic id (the KF control `name`), never a KF GUID. */
  id: string;
  name?: string;
  /** JSON-pointer-ish path inside the unpacked workspace, e.g. `project/page/Page1.json#/objects/0`. */
  rawPath: string;
  unknownFields: string[];
}

export interface PageIndexEntry {
  guid: string;
  /** Stable semantic page id (the KF page `name`; fallback to guid), never a KF GUID reference target. */
  id: string;
  name: string;
  file: string;
  controlGuids: string[];
  unknownFields: string[];
}

export interface VariableIndexEntry {
  guid: string;
  /** Stable semantic variable id (the KF variable `name`, e.g. `$TestVar`; fallback to the numeric id). */
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
// Raw trees
// ---------------------------------------------------------------------------

export interface RawTrees {
  project: unknown;
  pageManager: unknown;
  /** pageGuid -> full page JSON tree (never modified). */
  pages: Record<string, unknown>;
  /** source file basename -> parsed JSON tree (variables/Tag files). */
  variables: Record<string, unknown>;
  /** source file basename -> script text (JS) or parsed JSON tree. */
  scripts: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Bounded summary
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
  /** Stable semantic page id (the KF page `name`; fallback to guid). */
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

// ---------------------------------------------------------------------------
// Known-field sets (sourced from kmui_*.js serialization + real SDB pages)
// ---------------------------------------------------------------------------

/** Top-level keys of a KF page JSON file (verified against SDB `project/page/*.json`). */
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

/** Fields shared by every control (KMUIModelBase + KMUIElementBase.propertys + SDB pages). */
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
  // Layout/container glue fields shared across controls (verified in SDB pages):
  "region",
  "baseProperty",
  "insiderObjects",
  "objects",
  "children",
  "layoutItems",
]);

/** Control-specific serialized fields per KF uiModelType (constructor defaults + SDB pages). */
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
// Helpers
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
 * Locates the project root inside an unpacked native client workspace.
 * A native package is `rootDir/<version>/...`; the inspector also accepts a
 * directory that directly contains `project.json`.
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
  id: string;
  name?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  kfType: number;
  rawPath: string;
  unknownFields: string[];
}

/**
 * Recursively collects controls from a page JSON. KF layout containers nest
 * controls under `objects`/`children`/`layoutItems`; any object carrying a
 * numeric `uiModelType` is treated as a control.
 */
function collectControls(node: unknown, rawPath: string, out: RawControl[]): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => collectControls(item, `${rawPath}/${index}`, out));
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const record = node as Record<string, unknown>;
  const uiModelType = record["uiModelType"];
  if (typeof uiModelType === "number") {
    const guid = typeof record["guid"] === "string" ? (record["guid"]) : "";
    const name = typeof record["name"] === "string" ? (record["name"]) : "";
    const knownSet = knownControlFields(uiModelType);
    // Stable semantic id: KF control `name` first, KF GUID second (controls
    // like spacers serialize WITHOUT a name — verified across 11k+ SDB spacer
    // objects — and a traversal ordinal would drift when controls are added or
    // removed), and only then a positional fallback.
    const semanticId = name !== "" ? name : guid !== "" ? guid : `control-${out.length}`;
    out.push({
      guid,
      type: CONTROL_TYPE_BY_UIMODEL_TYPE[uiModelType] ?? `kf-${uiModelType}`,
      id: semanticId,
      ...(name !== "" ? { name } : {}),
      x: asNumber((asRecord(record["leftTopPt"])["x"]) ?? 0),
      y: asNumber((asRecord(record["leftTopPt"])["y"]) ?? 0),
      width: asNumber(record["width"]),
      height: asNumber(record["height"]),
      kfType: uiModelType,
      rawPath,
      unknownFields: unknownKeys(record, knownSet),
    });
  }
  for (const [key, value] of Object.entries(record)) {
    if (key === "objects" || key === "children" || key === "layoutItems" || key === "insiderObjects") {
      collectControls(value, `${rawPath}/${key}`, out);
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
        controlsIndex[control.guid] = {
          guid: control.guid,
          pageGuid: guid,
          type: control.type,
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

  return { raw, index, summary, provenance, warnings };
}
