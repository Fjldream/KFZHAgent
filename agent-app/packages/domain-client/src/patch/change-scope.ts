import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { FieldPatch } from "@kf/contracts";
import { inspectClientProject, type EntityIndex } from "../inspect/client-inspector.js";
import { resolveControlPathFor } from "./allowlist.js";
import {
  PatchConflictError,
  escapeToken,
  joinPointer,
  isObject,
  parseFragmentPointer,
  pointerCovers,
} from "./json-pointer.js";

/**
 * Change-scope hashing (brief Step 5).
 *
 * Before a single file is patched the whole base workspace is content-hashed
 * (SHA-256 per file) and every JSON pointer the confirmed plan is allowed to
 * touch is recorded. After patching, the candidate tree is hashed again and
 * any file whose hash changed — or any JSON field whose semantic diff is not
 * covered by a planned pointer — is reported as a scope violation. This is the
 * losslessness guarantee: nothing the plan did not confirm may ever change.
 */

export interface ChangeScope {
  /** Files the plan legitimately changes, relative to the workspace root. */
  touchedFiles: Set<string>;
  /**
   * Planned JSON pointers per file (file relative to the version directory,
   * e.g. `project/page/Page1.json`). Pointers start with `#`.
   */
  touchedPointers: Map<string, Set<string>>;
  /** Version directory name relative to the workspace root (`"."` when root). */
  versionDir: string;
}

export interface ScopeViolation {
  kind: "file" | "pointer";
  detail: string;
}

export interface ScopeVerifyResult {
  violations: ScopeViolation[];
  warnings: string[];
}

export type EntityKind = "control" | "page" | "variable";

/** Structural operation shape accepted by scope computation (contract + normalized plans). */
export interface ScopeOperation {
  op: string;
  entityType?: string;
  entityId: string;
  changes?: FieldPatch[];
  properties?: Record<string, unknown>;
  destructiveConfirmed?: boolean;
  digest?: string;
}

export interface ScopePlan {
  operations: ScopeOperation[];
}

export interface EntityLocation {
  kind: EntityKind;
  /** File relative to the version directory, e.g. `project/page/Page1.json`. */
  file: string;
  /** JSON pointer of the entity root inside that file, e.g. `#/objects/0`. */
  pointer: string;
  /** IR control type for controls (`button`, `text`, ...). */
  controlType?: string;
  /** KF GUID for controls — identity used to re-locate the entity in the candidate. */
  guid?: string;
  /** Semantic variable name for variables — identity used to re-locate the entity. */
  name?: string;
}

export function isControlLocation(loc: EntityLocation): loc is EntityLocation & { kind: "control" } {
  return loc.kind === "control";
}

// ---------------------------------------------------------------------------
// Hashing + helpers
// ---------------------------------------------------------------------------

async function readJsonAt(rootDir: string, versionDir: string, file: string): Promise<unknown> {
  const full = versionDir === "." ? path.join(rootDir, file) : path.join(rootDir, versionDir, file);
  return JSON.parse(await readFile(full, "utf8")) as unknown;
}

/** Returns the version directory name relative to rootDir (`.`, or the x.y.z.w dir). */
export async function resolveVersionDirName(rootDir: string): Promise<string> {
  if (existsSync(path.join(rootDir, "project.json"))) return ".";
  const entries = await readdir(rootDir, { withFileTypes: true });
  const versions = entries
    .filter((e) => e.isDirectory() && /^\d+\.\d+\.\d+\.\d+$/.test(e.name))
    .map((e) => e.name)
    .sort();
  if (versions.length === 0) {
    throw new Error(`no client project found under ${rootDir}`);
  }
  return versions[0] as string;
}

/** SHA-256 of every file under rootDir, keyed by slash-separated relative path. */
export async function hashTree(rootDir: string): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  async function walk(dir: string, rel: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const nextRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(full, nextRel);
      } else if (entry.isFile()) {
        const data = await readFile(full);
        out.set(nextRel, createHash("sha256").update(data).digest("hex"));
      }
    }
  }
  await walk(rootDir, "");
  return out;
}

// ---------------------------------------------------------------------------
// Entity location (shared with the patcher)
// ---------------------------------------------------------------------------

async function variablePointer(
  baseRoot: string,
  versionDir: string,
  file: string,
  variableName: string,
): Promise<string> {
  const doc = (await readJsonAt(baseRoot, versionDir, file)) as Record<string, unknown>;
  const variables = Array.isArray(doc["Variables"]) ? (doc["Variables"] as Array<Record<string, unknown>>) : [];
  const index = variables.findIndex((v) => v["name"] === variableName);
  if (index < 0) throw new PatchConflictError(`variable "${variableName}" not found in ${file}`);
  return `#/Variables/${index}`;
}

/**
 * Locates the variable group file a created variable should be appended to
 * (brief M4): prefers the group file that already holds an indexed variable,
 * otherwise derives the file from the group id in globalVariableMng.json.
 * Never hard-codes a fixture-specific file name.
 */
export async function resolveVariableGroupFile(
  index: EntityIndex,
  baseRoot: string,
  versionDir: string,
): Promise<string> {
  const groupFiles = new Set<string>();
  for (const entry of Object.values(index.variables)) {
    if (entry.file.startsWith("project/Tag/variables/")) groupFiles.add(entry.file);
  }
  const files = [...groupFiles].sort();
  if (files.length > 0) return files[0]!;

  const manager = (await readJsonAt(baseRoot, versionDir, "project/Tag/globalVariableMng.json")) as Record<string, unknown>;
  const groups = isObject(manager["Groups"]) ? manager["Groups"] : {};
  if (typeof groups["id"] === "string") {
    return `project/Tag/variables/${groups["id"]}.json`;
  }
  throw new PatchConflictError(
    "cannot locate a variable group file for the create-variable operation",
  );
}

/**
 * Locates an entity by GUID (KF GUID, numeric variable id, or semantic name).
 * Throws PATCH_CONFLICT when the id matches nothing.
 */
export async function locateEntity(
  baseRoot: string,
  index: EntityIndex,
  versionDir: string,
  entityId: string,
  entityTypeHint?: string,
): Promise<EntityLocation> {
  const control = index.controls[entityId];
  if (control !== undefined) {
    const [file, fragment] = splitRawPath(control.rawPath);
    return {
      kind: "control",
      file,
      pointer: fragment === "" ? "#" : fragment,
      controlType: control.type,
      guid: entityId,
    };
  }
  const page = index.pages[entityId];
  if (page !== undefined) {
    return { kind: "page", file: page.file, pointer: "#" };
  }
  const variable =
    index.variables[entityId] ??
    Object.values(index.variables).find((v) => v.name === entityId);
  if (variable !== undefined) {
    const pointer = await variablePointer(baseRoot, versionDir, variable.file, variable.name);
    return { kind: "variable", file: variable.file, pointer, name: variable.name };
  }
  throw new PatchConflictError(
    `entity "${entityId}" not found in the base workspace (${entityTypeHint ?? "any kind"})`,
  );
}

function splitRawPath(rawPath: string): [string, string] {
  const hash = rawPath.indexOf("#");
  if (hash < 0) return [rawPath, ""];
  return [rawPath.slice(0, hash), rawPath.slice(hash)];
}

// ---------------------------------------------------------------------------
// Scope computation
// ---------------------------------------------------------------------------

async function pageManagerPages(
  baseRoot: string,
  versionDir: string,
): Promise<Array<Record<string, unknown>>> {
  const doc = (await readJsonAt(baseRoot, versionDir, "project/pageManager.json")) as Record<string, unknown>;
  return Array.isArray(doc["Pages"]) ? (doc["Pages"] as Array<Record<string, unknown>>) : [];
}

/** Computes the set of files and JSON pointers the plan is confirmed to touch. */
export async function computeChangeScope(
  baseRoot: string,
  plan: ScopePlan,
): Promise<ChangeScope> {
  const versionDir = await resolveVersionDirName(baseRoot);
  const touchedFiles = new Set<string>();
  const touchedPointers = new Map<string, Set<string>>();

  const touchPointer = (file: string, pointer: string): void => {
    touchedFiles.add(relFile(file, versionDir));
    let set = touchedPointers.get(file);
    if (set === undefined) {
      set = new Set<string>();
      touchedPointers.set(file, set);
    }
    set.add(pointer);
  };

  const inspection = await inspectClientProject(baseRoot);

  // Pre-scan: every confirmed delete on a page/group file shifts where a
  // confirmed create on the SAME page/group file lands (the patcher applies
  // the plan in order, so creates are pushed onto the array after deletes
  // have shrunk it). Creating a control next to a same-page delete would
  // otherwise be reported at a stale base-length index and wrongly fail.
  const deleteCountByPage = new Map<string, number>();
  const deleteCountByVarFile = new Map<string, number>();
  for (const op of plan.operations) {
    if (op.op !== "delete") continue;
    const loc = await locateEntity(baseRoot, inspection.index, versionDir, op.entityId, op.entityType);
    if (loc.kind === "control") {
      const pageGuid = inspection.index.controls[op.entityId]?.pageGuid;
      if (pageGuid !== undefined) {
        deleteCountByPage.set(pageGuid, (deleteCountByPage.get(pageGuid) ?? 0) + 1);
      }
    } else if (loc.kind === "variable") {
      deleteCountByVarFile.set(loc.file, (deleteCountByVarFile.get(loc.file) ?? 0) + 1);
    }
  }
  const createCountByPage = new Map<string, number>();
  const createCountByVarFile = new Map<string, number>();
  const shiftCtx = { deleteCountByPage, deleteCountByVarFile, createCountByPage, createCountByVarFile };

  for (const op of plan.operations) {
    if (op.op === "create") {
      await trackCreate(baseRoot, versionDir, op, inspection.index, touchPointer, shiftCtx);
    } else if (op.op === "update") {
      const loc = await locateEntity(
        baseRoot,
        inspection.index,
        versionDir,
        op.entityId,
        op.entityType,
      );
      for (const change of op.changes ?? []) {
        // Semantic data updates never name arbitrary native fields in the
        // change plan. The patcher owns this marker and deterministically
        // materializes only the reviewed EasyUI datagrid fields below.
        if (change.path === "/__kfModuleTableData") {
          if (!(isControlLocation(loc) && loc.controlType === "easyui" && inspection.index.controls[op.entityId]?.capabilityId === "easyui.1")) {
            throw new PatchConflictError("reviewed table data scope may only target an EasyUI datagrid");
          }
          touchPointer(loc.file, joinPointer(loc.pointer, "/data"));
          touchPointer(loc.file, joinPointer(loc.pointer, "/columns"));
          touchPointer(loc.file, joinPointer(loc.pointer, "/pageSize"));
          continue;
        }
        const capabilityId = inspection.index.controls[op.entityId]?.capabilityId;
        const prototypeName = capabilityId?.startsWith("prototype.")
          ? capabilityId.slice("prototype.".length)
          : undefined;
        const resolved = isControlLocation(loc)
          ? resolveControlPathFor(loc.controlType, change.path, prototypeName)
          : change.path;
        touchPointer(loc.file, joinPointer(loc.pointer, resolved));
      }
    } else {
      const loc = await locateEntity(
        baseRoot,
        inspection.index,
        versionDir,
        op.entityId,
        op.entityType,
      );
      if (loc.kind === "control" || loc.kind === "variable") {
        touchPointer(loc.file, loc.pointer);
      } else {
        // page: whole file removed + pageManager entry removed
        touchedFiles.add(relFile(loc.file, versionDir));
        const pages = await pageManagerPages(baseRoot, versionDir);
        const entryIndex = pages.findIndex((p) => p["id"] === op.entityId);
        touchPointer("project/pageManager.json", `#/Pages/${entryIndex < 0 ? 0 : entryIndex}`);
      }
    }
  }

  return { touchedFiles, touchedPointers, versionDir };
}

function relFile(file: string, versionDir: string): string {
  return versionDir === "." ? file : `${versionDir}/${file}`;
}

function finiteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

async function trackDerivedPageGrowth(
  baseRoot: string,
  versionDir: string,
  page: { guid: string; file: string },
  geometry: { x: number; y: number; width: number; height: number },
  touchPointer: (file: string, pointer: string) => void,
): Promise<void> {
  const pageDoc = (await readJsonAt(baseRoot, versionDir, page.file)) as Record<string, unknown>;
  const pageProperty = isObject(pageDoc["pageProperty"])
    ? pageDoc["pageProperty"]
    : {};
  const pageSize = isObject(pageProperty["pageSize"])
    ? pageProperty["pageSize"]
    : {};
  const managerPages = await pageManagerPages(baseRoot, versionDir);
  const managerIndex = managerPages.findIndex((entry) => entry["id"] === page.guid);
  const managerPage = managerIndex >= 0 ? managerPages[managerIndex]! : {};
  const currentWidth =
    finiteNumber(pageSize["width"]) ||
    finiteNumber(pageDoc["pageViewWidth"]) ||
    finiteNumber(managerPage["width"]);
  const currentHeight =
    finiteNumber(pageSize["height"]) ||
    finiteNumber(pageDoc["pageViewHeight"]) ||
    finiteNumber(managerPage["height"]);
  const growsWidth = geometry.x + geometry.width > currentWidth;
  const growsHeight = geometry.y + geometry.height > currentHeight;
  if (!growsWidth && !growsHeight) return;

  if (growsWidth) {
    touchPointer(page.file, "#/pageProperty/pageSize/width");
    touchPointer(page.file, "#/pageProperty/windowSize/width");
    if (managerIndex >= 0) {
      touchPointer("project/pageManager.json", `#/Pages/${managerIndex}/width`);
    }
  }
  if (growsHeight) {
    touchPointer(page.file, "#/pageProperty/pageSize/height");
    touchPointer(page.file, "#/pageProperty/windowSize/height");
    if (managerIndex >= 0) {
      touchPointer("project/pageManager.json", `#/Pages/${managerIndex}/height`);
    }
  }
  if (managerIndex >= 0) {
    touchPointer("project/pageManager.json", `#/Pages/${managerIndex}/resolution`);
  }
}

/** Per-array confirmed-delete/create counters used to shift create landing spots. */
interface CreateShiftContext {
  deleteCountByPage: Map<string, number>;
  deleteCountByVarFile: Map<string, number>;
  createCountByPage: Map<string, number>;
  createCountByVarFile: Map<string, number>;
}

async function trackCreate(
  baseRoot: string,
  versionDir: string,
  op: ScopeOperation,
  index: EntityIndex,
  touchPointer: (file: string, pointer: string) => void,
  shift: CreateShiftContext,
): Promise<void> {
  if (op.op !== "create") {
    throw new PatchConflictError(`trackCreate expected a create operation, got "${op.op}"`);
  }
  switch (op.entityType) {
    case "control": {
      const pageId = op.properties?.["pageId"];
      if (typeof pageId !== "string") {
        throw new PatchConflictError(`create control requires properties.pageId (page GUID)`);
      }
      const page = index.pages[pageId];
      if (page === undefined) {
        throw new PatchConflictError(`create control: page "${pageId}" not found`);
      }
      const pageDoc = (await readJsonAt(baseRoot, versionDir, page.file)) as Record<string, unknown>;
      const objects = Array.isArray(pageDoc["objects"]) ? (pageDoc["objects"] as unknown[]) : [];
      const deletes = shift.deleteCountByPage.get(pageId) ?? 0;
      const creates = shift.createCountByPage.get(pageId) ?? 0;
      const insertion = Math.max(0, objects.length - deletes + creates);
      touchPointer(page.file, `#/objects/${insertion}`);
      await trackDerivedPageGrowth(
        baseRoot,
        versionDir,
        page,
        {
          x: finiteNumber(op.properties?.["x"]),
          y: finiteNumber(op.properties?.["y"]),
          width: finiteNumber(op.properties?.["width"]) || 90,
          height: finiteNumber(op.properties?.["height"]) || 60,
        },
        touchPointer,
      );
      shift.createCountByPage.set(pageId, creates + 1);
      break;
    }
    case "variable": {
      const groupFile = await resolveVariableGroupFile(index, baseRoot, versionDir);
      const doc = (await readJsonAt(baseRoot, versionDir, groupFile)) as Record<string, unknown>;
      const variables = Array.isArray(doc["Variables"]) ? (doc["Variables"] as unknown[]) : [];
      const deletes = shift.deleteCountByVarFile.get(groupFile) ?? 0;
      const creates = shift.createCountByVarFile.get(groupFile) ?? 0;
      const insertion = Math.max(0, variables.length - deletes + creates);
      touchPointer(groupFile, `#/Variables/${insertion}`);
      shift.createCountByVarFile.set(groupFile, creates + 1);
      break;
    }
    case "page": {
      const fileName = `${op.entityId}.json`;
      if (/[\\/\0]/.test(op.entityId) || op.entityId === "") {
        throw new PatchConflictError(`unsafe page name "${op.entityId}"`);
      }
      touchPointer(`project/page/${fileName}`, "#");
      const pages = await pageManagerPages(baseRoot, versionDir);
      touchPointer("project/pageManager.json", `#/Pages/${pages.length}`);
      break;
    }
    default:
      throw new PatchConflictError(`create entityType "${op.entityType}" is not supported`);
  }
}

// ---------------------------------------------------------------------------
// Semantic JSON diff
// ---------------------------------------------------------------------------

export interface JsonDiff {
  pointer: string;
  kind: "add" | "remove" | "replace";
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((value, i) => deepEqual(value, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    return keysA.every((key) => key in b && deepEqual(a[key], b[key]));
  }
  return false;
}

/** Stable identity key for array elements: KF GUID, then name, then id. */
function identityOf(value: unknown): string | undefined {
  if (isObject(value)) {
    const record = value;
    if (typeof record["guid"] === "string" && record["guid"] !== "") return `guid:${record["guid"]}`;
    if (typeof record["name"] === "string" && record["name"] !== "") return `name:${record["name"]}`;
    if (typeof record["id"] === "string" && record["id"] !== "") return `id:${record["id"]}`;
    if (typeof record["id"] === "number") return `id:${String(record["id"])}`;
  }
  return undefined;
}

function diffArrays(base: unknown[], cand: unknown[], pointer: string, out: JsonDiff[]): void {
  const baseIdentifiable = base.length > 0 && base.every((v) => identityOf(v) !== undefined);
  const candIdentifiable = cand.length > 0 && cand.every((v) => identityOf(v) !== undefined);
  if (baseIdentifiable && candIdentifiable) {
    diffArraysByIdentity(base, cand, pointer, out);
    return;
  }
  diffArraysByPosition(base, cand, pointer, out);
}

/**
 * Identity diff for arrays whose elements carry a stable identity (controls:
 * guid; variables: name; pageManager: id). Elements are matched by identity
 * across reordering/insertion/deletion and matched pairs are content-diffed at
 * their BASE index. This is what keeps a head-delete + tail-create combination
 * (or a middle delete) from misaligning untouched elements.
 */
function diffArraysByIdentity(base: unknown[], cand: unknown[], pointer: string, out: JsonDiff[]): void {
  const baseById = new Map<string, number>();
  const candById = new Map<string, number>();
  for (let i = 0; i < base.length; i += 1) {
    const id = identityOf(base[i]);
    if (id !== undefined) baseById.set(id, i);
  }
  for (let i = 0; i < cand.length; i += 1) {
    const id = identityOf(cand[i]);
    if (id !== undefined) candById.set(id, i);
  }

  const matchedIds = new Set<string>();
  const usedCand = new Set<number>();
  const usedBase = new Set<number>();

  // Identity-matched pairs: recurse content diff at the BASE index.
  for (const [id, bi] of baseById) {
    const ci = candById.get(id);
    if (ci === undefined) continue;
    matchedIds.add(id);
    usedBase.add(bi);
    usedCand.add(ci);
    diffJson(base[bi], cand[ci], `${pointer}/${bi}`, out);
  }

  // Removed base elements (no identity match, not equal to any unused cand element).
  for (let i = 0; i < base.length; i += 1) {
    if (usedBase.has(i)) continue;
    const id = identityOf(base[i]);
    if (id !== undefined && matchedIds.has(id)) continue;
    const stillPresent = cand.some(
      (c, ci) => !usedCand.has(ci) && deepEqual(c, base[i]),
    );
    if (!stillPresent) out.push({ pointer: `${pointer}/${i}`, kind: "remove" });
  }

  // Added cand elements.
  for (let i = 0; i < cand.length; i += 1) {
    if (usedCand.has(i)) continue;
    const id = identityOf(cand[i]);
    if (id !== undefined && matchedIds.has(id)) continue;
    out.push({ pointer: `${pointer}/${i}`, kind: "add" });
  }
}

/**
 * Content-aware diff for arrays whose elements carry no GUID (variables
 * `Variables[]`, `linkMng.linkList`, ...). The longest common prefix and
 * suffix are matched by deep equality — unchanged head/tail elements are never
 * reported — and only the remaining middle is diffed index-aligned. This makes
 * a tail append (create variable/control) report exactly one `add`, while a
 * mid-array insertion or deletion stays detectable without index drift.
 */
function diffArraysByPosition(base: unknown[], cand: unknown[], pointer: string, out: JsonDiff[]): void {
  let prefix = 0;
  while (
    prefix < base.length &&
    prefix < cand.length &&
    deepEqual(base[prefix], cand[prefix])
  ) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < base.length - prefix &&
    suffix < cand.length - prefix &&
    deepEqual(base[base.length - 1 - suffix], cand[cand.length - 1 - suffix])
  ) {
    suffix += 1;
  }

  const baseMid = base.slice(prefix, base.length - suffix);
  const candMid = cand.slice(prefix, cand.length - suffix);
  const midLen = Math.max(baseMid.length, candMid.length);
  for (let i = 0; i < midLen; i += 1) {
    if (i >= baseMid.length) {
      out.push({ pointer: `${pointer}/${prefix + i}`, kind: "add" });
    } else if (i >= candMid.length) {
      out.push({ pointer: `${pointer}/${prefix + i}`, kind: "remove" });
    } else {
      diffJson(baseMid[i], candMid[i], `${pointer}/${prefix + i}`, out);
    }
  }
}

function diffJson(base: unknown, cand: unknown, pointer: string, out: JsonDiff[]): void {
  if (deepEqual(base, cand)) return;
  if (Array.isArray(base) && Array.isArray(cand)) {
    diffArrays(base, cand, pointer, out);
    return;
  }
  if (isObject(base) && isObject(cand)) {
    const keys = new Set([...Object.keys(base), ...Object.keys(cand)]);
    for (const key of keys) {
      const token = escapeToken(key);
      if (!(key in base)) {
        out.push({ pointer: `${pointer}/${token}`, kind: "add" });
      } else if (!(key in cand)) {
        out.push({ pointer: `${pointer}/${token}`, kind: "remove" });
      } else {
        diffJson(base[key], cand[key], `${pointer}/${token}`, out);
      }
    }
    return;
  }
  out.push({ pointer, kind: "replace" });
}

/** Full semantic diff between two JSON documents (pointers start with `#`). */
export function diffJsonDocuments(base: unknown, cand: unknown): JsonDiff[] {
  const out: JsonDiff[] = [];
  diffJson(base, cand, "#", out);
  return out;
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export interface ScopeVerifyOptions {
  /** Report planned pointers with no observable effect as warnings. */
  reportNoopPlanned?: boolean;
  /** Worker-verified files deterministically added by signed asset bindings. */
  assetTargetPaths?: readonly string[];
}

/** Verifies the candidate deviates from the base only within the plan scope. */
export async function verifyChangeScope(
  baseRoot: string,
  candidateRoot: string,
  plan: ScopePlan,
  options?: ScopeVerifyOptions,
): Promise<ScopeVerifyResult> {
  const scope = await computeChangeScope(baseRoot, plan);
  for (const targetPath of options?.assetTargetPaths ?? []) {
    if (!/^static\/agent-assets\/[0-9a-f]{64}\.(?:png|jpg|webp)$/.test(targetPath)) {
      throw new Error(`invalid asset scope path: ${targetPath}`);
    }
    scope.touchedFiles.add(relFile(targetPath, scope.versionDir));
  }
  const violations: ScopeViolation[] = [];
  const warnings: string[] = [];

  const baseHashes = await hashTree(baseRoot);
  const candHashes = await hashTree(candidateRoot);
  const baseFiles = new Set(baseHashes.keys());
  const candFiles = new Set(candHashes.keys());

  // --- file-level diff -----------------------------------------------------
  for (const rel of candFiles) {
    const baseHash = baseHashes.get(rel);
    if (baseHash === undefined) {
      if (!scope.touchedFiles.has(rel)) {
        violations.push({ kind: "file", detail: `new file outside plan scope: ${rel}` });
      }
    } else if (baseHash !== candHashes.get(rel)) {
      if (!scope.touchedFiles.has(rel)) {
        violations.push({ kind: "file", detail: `changed file outside plan scope: ${rel}` });
      }
    }
  }
  for (const rel of baseFiles) {
    if (!candFiles.has(rel) && !scope.touchedFiles.has(rel)) {
      violations.push({ kind: "file", detail: `deleted file outside plan scope: ${rel}` });
    }
  }

  // --- pointer-level diff on touched JSON files ----------------------------
  for (const [file, pointers] of scope.touchedPointers) {
    const fullFile = relFile(file, scope.versionDir);
    const baseHash = baseHashes.get(fullFile);
    const candHash = candHashes.get(fullFile);

    if (candHash === undefined) {
      // File was removed entirely (e.g. delete page). Covered by touchedFiles;
      // nothing left to field-diff.
      if (baseHash !== undefined && !scope.touchedFiles.has(fullFile)) {
        violations.push({ kind: "pointer", detail: `planned file removed outside file scope: ${file}` });
      }
      continue;
    }
    if (baseHash === candHash) continue; // untouched

    let baseDoc: unknown;
    let candDoc: unknown;
    try {
      baseDoc = await readJsonAt(baseRoot, scope.versionDir, file);
      candDoc = await readJsonAt(candidateRoot, scope.versionDir, file);
    } catch (err) {
      if (baseHash === undefined) continue; // brand-new file (create page)
      violations.push({ kind: "pointer", detail: `cannot compare ${file}: ${String(err)}` });
      continue;
    }

    const diffs = diffJsonDocuments(baseDoc, candDoc);
    for (const diff of diffs) {
      const covered = [...pointers].some((p) => pointerCovers(p, diff.pointer));
      if (!covered) {
        violations.push({
          kind: "pointer",
          detail: `unplanned field change ${diff.pointer} (${diff.kind}) in ${file}`,
        });
      }
    }

    if (options?.reportNoopPlanned !== false) {
      for (const planned of pointers) {
        const observed = diffs.some((d) => pointerCovers(planned, d.pointer));
        if (!observed) {
          warnings.push(`planned change at ${file} ${planned} had no observable effect`);
        }
      }
    }
  }

  return { violations, warnings };
}

/** Convenience: converts an update operation's changes into covered pointers. */
export function changesOf(operation: ScopeOperation): FieldPatch[] {
  return operation.op === "update" ? (operation.changes ?? []) : [];
}

/** Re-exports so patcher/validator share one parse path. */
export { parseFragmentPointer };
