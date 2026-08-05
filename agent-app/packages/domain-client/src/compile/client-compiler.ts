import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type {
  ClientProjectIR,
  ControlIR,
  PageIR,
  RestrictedAction,
  VariableIR,
} from "../ir/client-project-ir.js";
import {
  ModelOutputInvalidError,
  assertNoStringForeignFields,
  hasReviewedTemplate,
  supportedControlTypes,
  type CompileContext,
} from "./control-compiler.js";
import { deriveGuid, type BuildSeed } from "./guid-factory.js";
import { compilePage } from "./page-compiler.js";
import type { TemplateJson } from "../templates/merge-template.js";

export * from "./guid-factory.js";
export {
  MODEL_OUTPUT_INVALID,
  ModelOutputInvalidError,
  compileControl,
  compileAction,
  supportedControlTypes,
  hasReviewedTemplate,
  assertNoStringForeignFields,
  type CompiledAction,
  type CompileContext,
} from "./control-compiler.js";
export { compilePage, SKELETON_DEFAULT_WIDTH, SKELETON_DEFAULT_HEIGHT } from "./page-compiler.js";

/**
 * Deterministic client compiler (brief Step 5).
 *
 * `compileClientProject(ir, seed)` produces a full, unpackable KF native
 * client workspace on disk:
 *
 *   <workspace>/<version>/
 *     project.json
 *     project/
 *       pageManager.json
 *       page/<PageName>.json
 *       Tag/globalVariableMng.json
 *       Tag/variables/<groupGuid>.json
 *       km_global_script.js            (only when global scripts exist)
 *
 * Determinism: every value in the workspace is a pure function of (IR, seed) —
 * GUIDs via `deriveGuid`, JSON via stable key ordering, no timestamps, no
 * random ids. Compiling the same IR + seed twice yields byte-identical
 * directories (hashDirectory-equal).
 */

export interface ClientWorkspace {
  /** Deterministic workspace id (derived from the project semantic id). */
  id: string;
  /**
   * Absolute path of the workspace root. It directly contains the version
   * directory, so `packageNativeClientProject(rootDir)` produces a package
   * that `importNativeClientPackage` can unpack, and the inspector can read it.
   */
  rootDir: string;
  mode: "candidate";
  /** Alias of `rootDir` (used by the compiler tests from the task brief). */
  path: string;
}

interface ValidatedIr {
  id: string;
  name: string;
  version: string;
  pages: PageIR[];
  variables: VariableIR[];
  scripts: string[];
}

const DEFAULT_VERSION = "1.0.0.1";
const VERSION_RE = /^\d+\.\d+\.\d+\.\d+$/;

export async function compileClientProject(
  input: ClientProjectIR,
  build: BuildSeed,
): Promise<ClientWorkspace> {
  const ir = validateIr(input);
  const variableGroupGuid = deriveGuid(build, "variables");

  // ---------------------------------------------------------------------
  // Semantic-id uniqueness + reference indexes (brief Step 4)
  // ---------------------------------------------------------------------
  const pageNameToGuid = new Map<string, string>();
  const pageNames = new Set<string>();
  const pageIds = new Set<string>();
  for (const page of ir.pages) {
    if (pageNames.has(page.name)) {
      throw new ModelOutputInvalidError(`duplicate semantic page name "${page.name}"`);
    }
    if (pageIds.has(page.id)) {
      throw new ModelOutputInvalidError(`duplicate page id "${page.id}"`);
    }
    pageNames.add(page.name);
    pageIds.add(page.id);
    pageNameToGuid.set(page.name, deriveGuid(build, page.name));

    const controlIds = new Set<string>();
    for (const control of page.controls) {
      if (controlIds.has(control.id)) {
        throw new ModelOutputInvalidError(
          `duplicate control id "${control.id}" on page "${page.name}"`,
        );
      }
      controlIds.add(control.id);
    }
  }

  const variableNames = new Set<string>();
  for (const variable of ir.variables) {
    if (variableNames.has(variable.name)) {
      throw new ModelOutputInvalidError(`duplicate variable name "${variable.name}"`);
    }
    variableNames.add(variable.name);
  }
  for (const page of ir.pages) {
    for (const control of page.controls) {
      if (control.type === "inputnumber" && !variableNames.has(control.variableId)) {
        throw new ModelOutputInvalidError(
          `inputnumber "${control.id}" references unknown variable "${control.variableId}"`,
        );
      }
    }
  }

  const ctx: CompileContext = {
    variableGroupGuid,
    resolvePageGuid(semanticPageName) {
      const guid = pageNameToGuid.get(semanticPageName);
      if (guid === undefined) {
        throw new ModelOutputInvalidError(
          `navigate references unknown page name "${semanticPageName}"`,
        );
      }
      return guid;
    },
    resolveVariableName(semanticVariableId) {
      if (!variableNames.has(semanticVariableId)) {
        throw new ModelOutputInvalidError(
          `setVariable references unknown variable "${semanticVariableId}"`,
        );
      }
      return semanticVariableId;
    },
  };

  // ---------------------------------------------------------------------
  // Compile in-memory structures
  // ---------------------------------------------------------------------
  const compiledPages = ir.pages.map((page) => compilePage(build, page, ctx));
  const variables = compileVariables(build, ir.variables, variableGroupGuid);

  // ---------------------------------------------------------------------
  // Write the workspace
  // ---------------------------------------------------------------------
  const rootDir = await mkdtemp(path.join(tmpdir(), "kf-client-build-"));
  const versionDir = path.join(rootDir, ir.version);
  const projectDir = path.join(versionDir, "project");
  const pageDir = path.join(projectDir, "page");
  const tagDir = path.join(projectDir, "Tag", "variables");
  await mkdir(pageDir, { recursive: true });
  await mkdir(tagDir, { recursive: true });

  const projectGuid = deriveGuid(build, ir.id);
  await writeJson(path.join(versionDir, "project.json"), {
    guid: projectGuid,
    name: ir.name,
    version: ir.version,
    projectData: { type: "kingclient" },
  });

  const homePageName = compiledPages[0]?.managerEntry["name"];
  await writeJson(path.join(projectDir, "pageManager.json"), {
    default: homePageName,
    appHomePage: homePageName,
    version: ir.version,
    Pages: compiledPages.map((page) => page.managerEntry),
  });

  for (const page of compiledPages) {
    await writeJson(path.join(pageDir, page.fileName), page.json);
  }

  await writeJson(path.join(projectDir, "Tag", "globalVariableMng.json"), variables.manager);
  await writeJson(path.join(tagDir, `${variableGroupGuid}.json`), variables.group);

  if (ir.scripts.length > 0) {
    await writeFile(
      path.join(projectDir, "km_global_script.js"),
      ir.scripts.join("\n"),
      "utf8",
    );
  }

  return { id: projectGuid, rootDir, mode: "candidate", path: rootDir };
}

// ---------------------------------------------------------------------------
// Validation (runtime, tolerant of foreign OBJECT fields but hostile to
// foreign STRING fields — the raw-JavaScript injection path)
// ---------------------------------------------------------------------------

function validateIr(input: unknown): ValidatedIr {
  const rec = requireRecord(input, "IR");
  if (rec["schema"] !== "kf-client-project-ir/v1") {
    throw new ModelOutputInvalidError('IR must declare schema "kf-client-project-ir/v1"');
  }
  const id = requireString(rec["id"], "IR.id");
  const name = requireString(rec["name"], "IR.name");
  const version = rec["version"] === undefined ? DEFAULT_VERSION : requireVersion(rec["version"]);

  const resources = rec["resources"] === undefined ? [] : requireArray(rec["resources"], "IR.resources");
  if (resources.length > 0) {
    throw new ModelOutputInvalidError(
      "IR.resources is not yet supported by the deterministic compiler",
    );
  }

  const pages = requireArray(rec["pages"], "IR.pages").map((page, index) =>
    validatePage(page, index),
  );
  if (pages.length === 0) {
    throw new ModelOutputInvalidError("IR.pages must contain at least one page");
  }

  const variables =
    rec["variables"] === undefined
      ? []
      : requireArray(rec["variables"], "IR.variables").map((variable, index) =>
          validateVariable(variable, index),
        );

  const scripts = validateScripts(rec["scripts"]);

  return { id, name, version, pages, variables, scripts };
}

function validateScripts(value: unknown): string[] {
  if (value === undefined) return [];
  const globalTexts: string[] = [];
  for (const item of requireArray(value, "IR.scripts")) {
    const rec = requireRecord(item, "IR.scripts[]");
    const kind = requireString(rec["kind"], "script.kind");
    const text = requireString(rec["text"], "script.text");
    if (kind === "global") {
      globalTexts.push(text);
    } else {
      throw new ModelOutputInvalidError(
        `script kind "${kind}" is not yet supported by the deterministic compiler ` +
          "(only global scripts are written; page/control scripts need a script DSL)",
      );
    }
  }
  return globalTexts;
}

function validatePage(value: unknown, index: number): PageIR {
  const rec = requireRecord(value, `IR.pages[${index}]`);
  const id = requireString(rec["id"], "page.id");
  const name = requireString(rec["name"], "page.name");
  if (name === "") throw new ModelOutputInvalidError("page.name must be non-empty");
  const width = rec["width"] === undefined ? undefined : requirePositiveNumber(rec["width"], "page.width");
  const height = rec["height"] === undefined ? undefined : requirePositiveNumber(rec["height"], "page.height");
  const controls = requireArray(rec["controls"], "page.controls").map((control, ci) =>
    validateControl(control, ci),
  );
  return {
    id,
    name,
    ...(width !== undefined ? { width } : {}),
    ...(height !== undefined ? { height } : {}),
    controls,
  };
}

function validateControl(value: unknown, index: number): ControlIR {
  const rec = requireRecord(value, `page.controls[${index}]`);
  const type = requireString(rec["type"], "control.type");
  assertNoStringForeignFields(rec, type);
  if (!hasReviewedTemplate(type)) {
    throw new ModelOutputInvalidError(
      `control type "${type}" has no reviewed template (supported: ${supportedControlTypes().join(", ")})`,
    );
  }
  const id = requireString(rec["id"], "control.id");
  const x = requireNonNegativeNumber(rec["x"], "control.x");
  const y = requireNonNegativeNumber(rec["y"], "control.y");
  const width = requirePositiveNumber(rec["width"], "control.width");
  const height = requirePositiveNumber(rec["height"], "control.height");
  const base = { id, x, y, width, height };
  switch (type) {
    case "text":
      return { ...base, type: "text", text: requireString(rec["text"], "control.text") };
    case "button": {
      const text = requireString(rec["text"], "control.text");
      const action =
        rec["action"] === undefined ? undefined : validateAction(rec["action"]);
      return action === undefined
        ? { ...base, type: "button", text }
        : { ...base, type: "button", text, action };
    }
    case "inputnumber": {
      const variableId = requireString(rec["variableId"], "control.variableId");
      const decimals = requireNumber(rec["decimals"], "control.decimals");
      if (!Number.isInteger(decimals) || decimals < 0 || decimals > 10) {
        throw new ModelOutputInvalidError(
          `control "${id}" has invalid decimals (must be an integer in 0..10)`,
        );
      }
      return { ...base, type: "inputnumber", variableId, decimals };
    }
    default:
      throw new ModelOutputInvalidError(
        `control type "${type}" has no reviewed template`,
      );
  }
}

function validateAction(value: unknown): RestrictedAction {
  const rec = requireRecord(value, "control.action");
  const kind = requireString(rec["kind"], "action.kind");
  switch (kind) {
    case "navigate":
      return { kind: "navigate", pageId: requireString(rec["pageId"], "action.pageId") };
    case "setVariable":
      return {
        kind: "setVariable",
        variableId: requireString(rec["variableId"], "action.variableId"),
        value: requireActionValue(rec["value"]),
      };
    case "noop":
      return { kind: "noop" };
    default:
      throw new ModelOutputInvalidError(`unsupported action kind "${kind}"`);
  }
}

function requireActionValue(value: unknown): string | number | boolean {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  throw new ModelOutputInvalidError("action.value must be a string, number, or boolean");
}

function validateVariable(value: unknown, index: number): VariableIR {
  const rec = requireRecord(value, `IR.variables[${index}]`);
  const id = requireString(rec["id"], "variable.id");
  const name = requireString(rec["name"], "variable.name");
  if (name === "") throw new ModelOutputInvalidError("variable.name must be non-empty");
  const dataType = requireNumber(rec["dataType"], "variable.dataType");
  const comment = rec["comment"] === undefined ? undefined : requireString(rec["comment"], "variable.comment");
  const defaultValue = rec["defaultValue"];
  return {
    id,
    name,
    dataType,
    ...(comment !== undefined ? { comment } : {}),
    ...(defaultValue !== undefined ? { defaultValue } : {}),
  };
}

function requireVersion(value: unknown): string {
  const version = requireString(value, "IR.version");
  if (!VERSION_RE.test(version)) {
    throw new ModelOutputInvalidError(
      `IR.version "${version}" must match x.y.z.w`,
    );
  }
  return version;
}

function requireRecord(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ModelOutputInvalidError(`${what} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, what: string): string {
  if (typeof value !== "string") {
    throw new ModelOutputInvalidError(`${what} must be a string`);
  }
  return value;
}

function requireNumber(value: unknown, what: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ModelOutputInvalidError(`${what} must be a finite number`);
  }
  return value;
}

function requireNonNegativeNumber(value: unknown, what: string): number {
  const n = requireNumber(value, what);
  if (n < 0) throw new ModelOutputInvalidError(`${what} must be non-negative`);
  return n;
}

function requirePositiveNumber(value: unknown, what: string): number {
  const n = requireNumber(value, what);
  if (n <= 0) throw new ModelOutputInvalidError(`${what} must be positive`);
  return n;
}

function requireArray(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new ModelOutputInvalidError(`${what} must be an array`);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Variables + deterministic serialization
// ---------------------------------------------------------------------------

function compileVariables(
  build: BuildSeed,
  variables: VariableIR[],
  groupGuid: string,
): { manager: TemplateJson; group: TemplateJson } {
  const list = variables.map((variable, index) => {
    const defaultValue = variable.defaultValue ?? 0;
    return {
      name: variable.name,
      dataType: variable.dataType,
      id: index + 1,
      guid: deriveGuid(build, variable.name),
      comment: variable.comment ?? "",
      defaultValue,
      isMap: false,
      basicItem: {
        defaultValue,
        maxValue: 999999,
        minValue: -999999,
        deadZone: 0,
      },
    };
  });
  return {
    manager: {
      Variables: [],
      Groups: {
        name: "工程变量",
        id: groupGuid,
        variables: [],
        groups: [],
      },
    },
    group: { Variables: list },
  };
}

function sortJsonKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonKeys);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      out[key] = sortJsonKeys((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** Serializes with stable key ordering so identical IR+seed yields identical bytes. */
export function stableStringify(value: unknown): string {
  return JSON.stringify(sortJsonKeys(value), null, 2);
}

async function writeJson(filePath: string, value: unknown): Promise<void> {
  await writeFile(filePath, stableStringify(value), "utf8");
}
