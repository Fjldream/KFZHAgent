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
import inputNumberTemplate from "../templates/control-templates/inputnumber.json" with { type: "json" };
import textTemplate from "../templates/control-templates/text.json" with { type: "json" };
import pageSkeleton from "../templates/page-skeleton.json" with { type: "json" };
import { allowedFieldsFor, resolveControlPath } from "./allowlist.js";
import {
  PatchConflictError,
  parseJsonPointer,
  parseFragmentPointer,
  removeByTokens,
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
};

// ---------------------------------------------------------------------------
// Application
// ---------------------------------------------------------------------------

export interface ApplyPatchOptions {
  /** When given, the plan is re-hashed and must match, else PATCH_CONFLICT. */
  planHash?: string;
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

/** Locates the entity JSON root inside a candidate file, returning doc + subtree. */
async function entityRootOf(
  rootDir: string,
  versionDir: string,
  loc: EntityLocation,
): Promise<{ doc: Record<string, unknown>; root: Record<string, unknown> }> {
  const doc = await readJsonFile(rootDir, versionDir, loc.file);
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
  return { doc, root: node as Record<string, unknown> };
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
    const doc = await readJsonFile(candidate, versionDir, loc.file);
    removeByTokens(doc, parseFragmentPointer(loc.pointer));
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
  const candidate = await mkdtemp(path.join(tmpdir(), "kf-client-candidate-"));
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

  return { id: plan.workspaceId, rootDir: candidate, mode: "candidate", path: candidate };
}

export type { EntityIndex };
