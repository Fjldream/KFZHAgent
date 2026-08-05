import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { ValidationReport } from "@kf/contracts";
import { inspectClientProject } from "../inspect/client-inspector.js";
import { CONTROL_TYPE_BY_UIMODEL_TYPE } from "../ir/client-project-ir.js";
import { importNativeClientPackage, packageNativeClientProject } from "../package/native-client-package.js";
import { resolveVersionDirName, verifyChangeScope } from "../patch/change-scope.js";
import { deleteOperationDigest, normalizeChangePlan, type NormalizedPlan } from "../patch/client-patcher.js";
import type { ClientWorkspace } from "../compile/client-compiler.js";
import {
  fail,
  makeReport,
  pass,
  type CheckKey,
  type CheckOutcome,
} from "./report.js";

/**
 * Six-layer client validator (brief Step 6).
 *
 * `validateClientProject(base, candidate, plan)` is the ONLY authority that
 * can pass or fail a modified workspace. Each layer is independent and each
 * returns pass/warn/fail; `status` is "pass" only when every required check
 * passes. Warnings (e.g. a planned change with no observable effect) are
 * collected in the report and never override a failure.
 *
 *  1. packageStructure — the candidate is a valid, unpackable workspace,
 *  2. jsonSchema      — every JSON file parses and page/control shapes hold,
 *  3. references      — GUID uniqueness + pageManager / action references,
 *  4. businessRules   — known uiModelTypes, in-bounds geometry, well-formed
 *                       script actions, confirmed destructive deletes,
 *  5. changeScope     — nothing outside the confirmed plan changed,
 *  6. roundTrip       — pack candidate and unpack it again: byte-identical.
 */

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function listJsonFiles(versionRoot: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, rel: string): Promise<void> {
    if (!(await exists(dir))) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const nextRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(full, nextRel);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) out.push(nextRel);
    }
  }
  await walk(versionRoot, "");
  return out.sort();
}

/** Recursively walks page trees, invoking cb on every object with a uiModelType. */
function walkControls(
  node: unknown,
  where: string,
  cb: (control: Record<string, unknown>, where: string) => void,
): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => walkControls(item, `${where}/${index}`, cb));
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const record = node as Record<string, unknown>;
  if (typeof record["uiModelType"] === "number") cb(record, where);
  for (const key of ["objects", "children", "layoutItems", "insiderObjects"]) {
    if (key in record) walkControls(record[key], `${where}/${key}`, cb);
  }
}

function rootPath(candidate: string, versionDir: string): string {
  return versionDir === "." ? candidate : path.join(candidate, versionDir);
}

// ---------------------------------------------------------------------------
// Layer 1: packageStructure
// ---------------------------------------------------------------------------

async function checkPackageStructure(candidate: string, versionDir: string): Promise<CheckOutcome> {
  const issues: string[] = [];
  const root = rootPath(candidate, versionDir);

  if (!(await exists(path.join(root, "project.json")))) {
    issues.push("missing project.json");
  } else {
    try {
      const project = asRecord(JSON.parse(await readFile(path.join(root, "project.json"), "utf8")));
      if (typeof project["name"] !== "string") issues.push("project.json has no name");
    } catch {
      issues.push("project.json is not valid JSON");
    }
  }

  if (!(await exists(path.join(root, "project", "pageManager.json")))) {
    issues.push("missing project/pageManager.json");
  } else {
    try {
      const manager = asRecord(JSON.parse(await readFile(path.join(root, "project", "pageManager.json"), "utf8")));
      if (!Array.isArray(manager["Pages"])) issues.push("project/pageManager.json has no Pages array");
    } catch {
      issues.push("project/pageManager.json is not valid JSON");
    }
  }

  const pageDir = path.join(root, "project", "page");
  if (!(await exists(pageDir))) {
    issues.push("missing project/page/ directory");
  } else {
    const pageFiles = (await readdir(pageDir)).filter((f) => f.toLowerCase().endsWith(".json"));
    if (pageFiles.length === 0) issues.push("no page files under project/page/");
  }

  return issues.length > 0 ? fail(issues) : pass();
}

// ---------------------------------------------------------------------------
// Layer 2: jsonSchema
// ---------------------------------------------------------------------------

async function checkJsonSchema(candidate: string, versionDir: string): Promise<CheckOutcome> {
  const issues: string[] = [];
  const root = rootPath(candidate, versionDir);
  const jsonFiles = await listJsonFiles(root);

  for (const rel of jsonFiles) {
    try {
      JSON.parse(await readFile(path.join(root, rel), "utf8"));
    } catch {
      issues.push(`invalid JSON: ${rel}`);
    }
  }

  const pageDir = path.join(root, "project", "page");
  if (await exists(pageDir)) {
    for (const file of (await readdir(pageDir)).filter((f) => f.toLowerCase().endsWith(".json"))) {
      const rel = `project/page/${file}`;
      let page: Record<string, unknown>;
      try {
        page = asRecord(JSON.parse(await readFile(path.join(root, rel), "utf8")));
      } catch {
        continue; // already reported as invalid JSON
      }
      if (typeof page["guid"] !== "string") issues.push(`${rel}: page guid is not a string`);
      if (!Array.isArray(page["objects"])) issues.push(`${rel}: page objects is not an array`);
    }
  }

  return issues.length > 0 ? fail(issues) : pass();
}

// ---------------------------------------------------------------------------
// Layer 3: references
// ---------------------------------------------------------------------------

async function checkReferences(candidate: string): Promise<CheckOutcome> {
  const issues: string[] = [];
  let inspection;
  try {
    inspection = await inspectClientProject(candidate);
  } catch (err) {
    return fail([`candidate cannot be inspected: ${String(err)}`]);
  }

  const rawPages = inspection.raw.pages;
  const pageGuids = new Set(Object.keys(rawPages));

  // GUID uniqueness across all controls.
  const guidCount = new Map<string, string[]>();
  for (const [pageGuid, tree] of Object.entries(rawPages)) {
    walkControls(tree, `page ${pageGuid}`, (control, where) => {
      const guid = control["guid"];
      if (typeof guid === "string" && guid !== "") {
        const list = guidCount.get(guid);
        const loc = `${pageGuid} ${where}`;
        if (list === undefined) guidCount.set(guid, [loc]);
        else list.push(loc);
      }
    });
  }
  for (const [guid, locs] of guidCount) {
    if (locs.length > 1) issues.push(`duplicate control GUID ${guid} at ${locs.join(" and ")}`);
  }

  // pageManager <-> page files.
  const managerPages: Array<Record<string, unknown>> = Array.isArray(
    asRecord(inspection.raw.pageManager)["Pages"],
  )
    ? (asRecord(inspection.raw.pageManager)["Pages"] as Array<Record<string, unknown>>)
    : [];
  for (const entry of managerPages) {
    if (typeof entry["id"] === "string" && !pageGuids.has(entry["id"])) {
      issues.push(`pageManager references unknown page id "${entry["id"]}"`);
    }
  }
  for (const pageGuid of pageGuids) {
    if (!managerPages.some((m) => m["id"] === pageGuid)) {
      issues.push(`page ${pageGuid} is missing from pageManager`);
    }
  }

  // Serialized action references (navigatePage -> page GUID, setVariable -> variable name).
  const variableNames = new Set(Object.values(inspection.index.variables).map((v) => v.name));
  for (const [pageGuid, tree] of Object.entries(rawPages)) {
    walkControls(tree, `page ${pageGuid}`, (control) => {
      const links = asRecord(control["linkMng"])["linkList"];
      if (!Array.isArray(links)) return;
      for (const rawLink of links) {
        const link = asRecord(rawLink);
        if (link["action"] === "navigatePage") {
          if (typeof link["pageId"] !== "string") continue; // shape issue -> businessRules
          if (!pageGuids.has(link["pageId"])) {
            issues.push(`navigatePage references unknown page "${link["pageId"]}"`);
          }
        } else if (link["action"] === "setVariable") {
          if (typeof link["variableId"] !== "string") continue; // shape issue -> businessRules
          if (!variableNames.has(link["variableId"])) {
            issues.push(`setVariable references unknown variable "${link["variableId"]}"`);
          }
        }
      }
    });
  }

  return issues.length > 0 ? fail(issues) : pass();
}

// ---------------------------------------------------------------------------
// Layer 4: businessRules
// ---------------------------------------------------------------------------

async function checkBusinessRules(
  candidate: string,
  plan: NormalizedPlan,
): Promise<CheckOutcome> {
  const issues: string[] = [];
  if (plan.operations.length === 0) {
    issues.push(
      "change plan contains no operations (a confirmed plan must change at least one entity)",
    );
  }
  let inspection;
  try {
    inspection = await inspectClientProject(candidate);
  } catch (err) {
    return fail([`candidate cannot be inspected: ${String(err)}`]);
  }

  for (const [pageGuid, tree] of Object.entries(inspection.raw.pages)) {
    const page = asRecord(tree);
    const pageProperty = asRecord(page["pageProperty"]);
    const pageSize = asRecord(pageProperty["pageSize"]);
    const pageWidth =
      typeof pageSize["width"] === "number"
        ? (pageSize["width"])
        : typeof page["pageViewWidth"] === "number"
          ? (page["pageViewWidth"])
          : undefined;
    const pageHeight =
      typeof pageSize["height"] === "number"
        ? (pageSize["height"])
        : typeof page["pageViewHeight"] === "number"
          ? (page["pageViewHeight"])
          : undefined;

    walkControls(tree, `page ${pageGuid}`, (control, where) => {
      const uiModelType = control["uiModelType"];
      if (typeof uiModelType !== "number" || !(uiModelType in CONTROL_TYPE_BY_UIMODEL_TYPE)) {
        issues.push(`unknown uiModelType ${String(uiModelType)} at ${pageGuid} ${where}`);
        return;
      }
      const name = typeof control["name"] === "string" ? (control["name"]) : control["guid"];
      if (typeof pageWidth === "number" && typeof pageHeight === "number") {
        const leftTop = asRecord(control["leftTopPt"]);
        const x = typeof leftTop["x"] === "number" ? (leftTop["x"]) : 0;
        const y = typeof leftTop["y"] === "number" ? (leftTop["y"]) : 0;
        const width = typeof control["width"] === "number" ? (control["width"]) : 0;
        const height = typeof control["height"] === "number" ? (control["height"]) : 0;
        if (x < 0 || y < 0 || x + width > pageWidth || y + height > pageHeight) {
          issues.push(
            `control "${String(name)}" geometry (${x},${y} ${width}x${height}) outside page bounds ` +
              `${pageWidth}x${pageHeight}`,
          );
        }
      }
      // Well-formed serialized script actions.
      const links = asRecord(control["linkMng"])["linkList"];
      if (links === undefined) return;
      if (!Array.isArray(links)) {
        issues.push(`control "${String(name)}" has a malformed linkMng.linkList`);
        return;
      }
      for (const rawLink of links) {
        const link = asRecord(rawLink);
        const action = link["action"];
        if (typeof action !== "string") {
          issues.push(`control "${String(name)}" has a link without an action`);
          continue;
        }
        if (!["navigatePage", "setVariable", "openDialog"].includes(action)) {
          issues.push(`control "${String(name)}" has an unknown script action "${action}"`);
          continue;
        }
        if (action === "navigatePage" && typeof link["pageId"] !== "string") {
          issues.push(`control "${String(name)}" navigatePage action is missing pageId`);
        }
        if (action === "setVariable" && (typeof link["variableId"] !== "string" || !("value" in link))) {
          issues.push(`control "${String(name)}" setVariable action is missing variableId/value`);
        }
      }
    });
  }

  // Plan-level destructive confirmation.
  for (const op of plan.operations) {
    if (op.op !== "delete") continue;
    if (op.destructiveConfirmed !== true) {
      issues.push(`unconfirmed delete of "${op.entityId}" (destructiveConfirmed must be true)`);
    }
    const expected = deleteOperationDigest(op.entityId);
    if (op.digest !== expected) {
      issues.push(`delete of "${op.entityId}" has a mismatched operation digest`);
    }
  }

  return issues.length > 0 ? fail(issues) : pass();
}

// ---------------------------------------------------------------------------
// Layer 5: changeScope
// ---------------------------------------------------------------------------

async function checkChangeScope(
  base: string,
  candidate: string,
  plan: NormalizedPlan,
): Promise<{ outcome: CheckOutcome; warnings: string[] }> {
  try {
    const scope = await verifyChangeScope(base, candidate, plan);
    if (scope.violations.length > 0) {
      return {
        outcome: fail(scope.violations.map((v) => v.detail)),
        warnings: scope.warnings,
      };
    }
    return { outcome: pass(), warnings: scope.warnings };
  } catch (err) {
    // The validator is the authority and must always return a report:
    // a plan that cannot be located against the base (unknown entityId, bad
    // entityType, ...) fails the changeScope layer instead of throwing.
    return {
      outcome: fail([`change-scope verification failed: ${String(err)}`]),
      warnings: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Layer 6: roundTrip
// ---------------------------------------------------------------------------

async function collectTreeFiles(root: string): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  async function walk(dir: string, rel: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const nextRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(full, nextRel);
      else if (entry.isFile()) out.set(nextRel, await readFile(full));
    }
  }
  await walk(root, "");
  return out;
}

/**
 * Packs the candidate and unpacks it again, then compares every file
 * byte-for-byte (excluding nothing: a candidate carrying packer-excluded
 * paths like pagerecord/ cannot round-trip and must fail).
 */
async function checkRoundTrip(candidate: string): Promise<CheckOutcome> {
  try {
    const gz = await packageNativeClientProject(candidate);
    const dest = await mkdtemp(path.join(tmpdir(), "kf-client-roundtrip-"));
    const unpacked = await importNativeClientPackage(gz, dest);

    const [candFiles, unpackFiles] = await Promise.all([
      collectTreeFiles(candidate),
      collectTreeFiles(unpacked),
    ]);
    const candSet = new Set(candFiles.keys());
    const unpackSet = new Set(unpackFiles.keys());
    const problems: string[] = [];

    for (const rel of candSet) {
      const unpackedBytes = unpackFiles.get(rel);
      if (unpackedBytes === undefined) {
        problems.push(`file "${rel}" is missing after packing/unpacking (excluded by the packager?)`);
        continue;
      }
      const candBytes = candFiles.get(rel);
      if (candBytes !== undefined && !candBytes.equals(unpackedBytes)) {
        problems.push(`file "${rel}" differs after packing/unpacking`);
      }
    }
    for (const rel of unpackSet) {
      if (!candSet.has(rel)) problems.push(`extra file "${rel}" appeared after packing/unpacking`);
    }

    return problems.length > 0 ? fail(problems) : pass();
  } catch (err) {
    return fail([`pack/unpack round-trip failed: ${String(err)}`]);
  }
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export interface ValidateOptions {
  /** Skip the (expensive) package round-trip check. Defaults to false. */
  skipRoundTrip?: boolean;
}

export async function validateClientProject(
  base: string,
  candidateInput: string | ClientWorkspace,
  planInput: unknown,
  options?: ValidateOptions,
): Promise<ValidationReport> {
  const candidate = typeof candidateInput === "string" ? candidateInput : candidateInput.rootDir;

  let versionDir: string;
  try {
    versionDir = await resolveVersionDirName(candidate);
  } catch (err) {
    const message = String(err);
    return makeReport({
      packageStructure: fail([message]),
      jsonSchema: fail([message]),
      references: fail([message]),
      businessRules: fail([message]),
      changeScope: fail([message]),
      roundTrip: fail([message]),
    });
  }

  // A malformed plan must never bubble out of the validator: it is reported as
  // a businessRules/changeScope failure while the candidate-only layers
  // (structure, schema, references, round-trip) still run to full detail.
  let plan: NormalizedPlan;
  try {
    plan = normalizeChangePlan(planInput);
  } catch (err) {
    const message = `invalid change plan: ${String(err)}`;
    const outcomes: Record<CheckKey, CheckOutcome> = {
      packageStructure: await checkPackageStructure(candidate, versionDir),
      jsonSchema: await checkJsonSchema(candidate, versionDir),
      references: await checkReferences(candidate),
      businessRules: fail([message]),
      changeScope: fail([message]),
      roundTrip: options?.skipRoundTrip ? pass() : await checkRoundTrip(candidate),
    };
    return makeReport(outcomes);
  }

  const outcomes: Record<CheckKey, CheckOutcome> = {
    packageStructure: await checkPackageStructure(candidate, versionDir),
    jsonSchema: await checkJsonSchema(candidate, versionDir),
    references: await checkReferences(candidate),
    businessRules: await checkBusinessRules(candidate, plan),
    changeScope: pass(),
    roundTrip: options?.skipRoundTrip ? pass() : await checkRoundTrip(candidate),
  };

  const extraWarnings: string[] = [];

  const scope = await checkChangeScope(base, candidate, plan);
  outcomes.changeScope = scope.outcome;
  extraWarnings.push(...scope.warnings);

  return makeReport(outcomes, extraWarnings);
}
