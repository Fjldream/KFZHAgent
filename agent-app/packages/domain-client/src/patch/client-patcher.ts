import { createHash } from "node:crypto";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FieldPatch } from "@kf/contracts";
import { inspectClientProject, type EntityIndex, type InspectResult } from "../inspect/client-inspector.js";
import { stableStringify, type ClientWorkspace } from "../compile/client-compiler.js";
import { deriveGuid } from "../compile/guid-factory.js";
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
import pageSkeleton from "../templates/page-skeleton.json" with { type: "json" };
import { allowedFieldsFor, resolveControlPath } from "./allowlist.js";
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
  op: "create" | "update" | "delete";
  entityType?: string;
  entityId: string;
  changes: FieldPatch[];
  properties: Record<string, unknown>;
  destructiveConfirmed: boolean;
  digest?: string;
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
    const entityId = requireString(rec["entityId"], `operations[${index}].entityId`);
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
      default:
        throw new PatchConflictError(
          `operations[${index}] has unknown action "${op}" (expected create/update/delete)`,
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
  input: ["value", "placeholder", "type", "disabled", "clearable", "maxlength"],
  cascader: ["options", "placeholder", "filterable", "clearable"],
  datetimepicker: ["value", "type", "placeholder", "format"],
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
): Promise<void> {
  const loc = await locateEntity(baseRoot, inspection.index, versionDir, op.entityId, op.entityType);
  const { doc, root } = await entityRootOf(candidate, versionDir, loc);
  const allowed = allowedFieldsFor({
    kind: loc.kind,
    ...(isControlLocation(loc) && loc.controlType !== undefined
      ? { controlType: loc.controlType }
      : {}),
  });
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
    const resolvedPath = isControlLocation(loc) ? resolveControlPath(change.path) : change.path;
    setByTokens(root, parseJsonPointer(resolvedPath), change.value);
  }
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
      const pageId = op.properties["pageId"];
      if (typeof pageId !== "string") {
        throw new PatchConflictError("create control requires properties.pageId (page GUID)");
      }
      const page = inspection.index.pages[pageId];
      if (page === undefined) throw new PatchConflictError(`create control: page "${pageId}" not found`);
      const type = typeof op.properties["type"] === "string" ? (op.properties["type"]) : "button";
      const template = CONTROL_TEMPLATES[type];
      if (template === undefined) {
        throw new PatchConflictError(
          `create control: no reviewed template for type "${type}" (supported: ${Object.keys(CONTROL_TEMPLATES).join(", ")})`,
        );
      }
      const guid = deriveGuid(build, op.entityId);
      const doc = await readJsonFile(candidate, versionDir, page.file);
      const objects = Array.isArray(doc["objects"]) ? (doc["objects"] as unknown[]) : [];
      const overrides: TemplateJson = {
        name: op.entityId,
        guid,
        leftTopPt: { x: asNumber(op.properties["x"]), y: asNumber(op.properties["y"]) },
        width: asNumber(op.properties["width"]) || 90,
        height: asNumber(op.properties["height"]) || 60,
      };
      if (type === "button" || type === "text") {
        if (typeof op.properties["text"] === "string") overrides["text"] = op.properties["text"];
      }
      if (type === "inputnumber") {
        if (typeof op.properties["precision"] === "number") overrides["precision"] = op.properties["precision"];
      }
      for (const key of CREATE_PASS_THROUGH[type] ?? []) {
        const value = op.properties[key];
        if (value !== undefined) (overrides as Record<string, unknown>)[key] = value;
      }
      const control = mergeControlTemplate(mergeControlTemplate(BASE_FIELDS, template), overrides);
      objects.push(control);
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
      await applyUpdate(candidate, versionDir, inspection, base, op);
    } else {
      await applyDelete(candidate, versionDir, inspection, base, op);
    }
  }

  await growPagesToFitControls(candidate, versionDir, inspection, pagesNeedingBoundsCheck);

  return { id: plan.workspaceId, rootDir: candidate, mode: "candidate", path: candidate };
}

export type { EntityIndex };
