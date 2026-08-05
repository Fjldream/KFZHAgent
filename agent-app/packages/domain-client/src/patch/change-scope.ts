import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { FieldPatch } from "@kf/contracts";
import { inspectClientProject, type EntityIndex } from "../inspect/client-inspector.js";
import { resolveControlPath } from "./allowlist.js";
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
    return { kind: "variable", file: variable.file, pointer };
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

  for (const op of plan.operations) {
    if (op.op === "create") {
      await trackCreate(baseRoot, versionDir, op, inspection.index, touchPointer);
    } else if (op.op === "update") {
      const loc = await locateEntity(
        baseRoot,
        inspection.index,
        versionDir,
        op.entityId,
        op.entityType,
      );
      for (const change of op.changes ?? []) {
        const resolved = isControlLocation(loc) ? resolveControlPath(change.path) : change.path;
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

async function trackCreate(
  baseRoot: string,
  versionDir: string,
  op: ScopeOperation,
  index: EntityIndex,
  touchPointer: (file: string, pointer: string) => void,
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
      touchPointer(page.file, `#/objects/${objects.length}`);
      break;
    }
    case "variable": {
      const groupFile = "project/Tag/variables/group-guid-1.json";
      const doc = (await readJsonAt(baseRoot, versionDir, groupFile)) as Record<string, unknown>;
      const variables = Array.isArray(doc["Variables"]) ? (doc["Variables"] as unknown[]) : [];
      touchPointer(groupFile, `#/Variables/${variables.length}`);
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

function hasGuid(value: unknown): boolean {
  return isObject(value) && typeof value["guid"] === "string";
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

function diffArrays(base: unknown[], cand: unknown[], pointer: string, out: JsonDiff[]): void {
  const baseByGuid = new Map<string, number>();
  const candByGuid = new Map<string, number>();
  for (let i = 0; i < base.length; i += 1) {
    if (hasGuid(base[i])) baseByGuid.set((base[i] as Record<string, unknown>)["guid"] as string, i);
  }
  for (let i = 0; i < cand.length; i += 1) {
    if (hasGuid(cand[i])) candByGuid.set((cand[i] as Record<string, unknown>)["guid"] as string, i);
  }

  const matchedGuids = new Set<string>();
  const usedCand = new Set<number>();
  const usedBase = new Set<number>();

  // Guid-matched pairs: recurse content diff at the BASE index.
  for (const [guid, bi] of baseByGuid) {
    const ci = candByGuid.get(guid);
    if (ci === undefined) continue;
    matchedGuids.add(guid);
    usedBase.add(bi);
    usedCand.add(ci);
    diffJson(base[bi], cand[ci], `${pointer}/${bi}`, out);
  }

  // Removed base elements (no guid match, not equal to any unused cand element).
  for (let i = 0; i < base.length; i += 1) {
    if (usedBase.has(i)) continue;
    const baseGuid = guidOf(base[i]);
    if (baseGuid !== undefined && matchedGuids.has(baseGuid)) continue;
    const stillPresent = cand.some(
      (c, ci) => !usedCand.has(ci) && deepEqual(c, base[i]),
    );
    if (!stillPresent) out.push({ pointer: `${pointer}/${i}`, kind: "remove" });
  }

  // Added cand elements.
  for (let i = 0; i < cand.length; i += 1) {
    if (usedCand.has(i)) continue;
    const guid = guidOf(cand[i]);
    if (guid !== undefined && matchedGuids.has(guid)) continue;
    out.push({ pointer: `${pointer}/${i}`, kind: "add" });
  }
}

function guidOf(value: unknown): string | undefined {
  return isObject(value) && typeof value["guid"] === "string" ? value["guid"] : undefined;
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
}

/** Verifies the candidate deviates from the base only within the plan scope. */
export async function verifyChangeScope(
  baseRoot: string,
  candidateRoot: string,
  plan: ScopePlan,
  options?: ScopeVerifyOptions,
): Promise<ScopeVerifyResult> {
  const scope = await computeChangeScope(baseRoot, plan);
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
