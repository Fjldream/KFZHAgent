import baseFields from "../templates/base-fields.json" with { type: "json" };
import buttonTemplate from "../templates/control-templates/button.json" with { type: "json" };
import inputNumberTemplate from "../templates/control-templates/inputnumber.json" with { type: "json" };
import textTemplate from "../templates/control-templates/text.json" with { type: "json" };
import type { ControlIR, RestrictedAction } from "../ir/client-project-ir.js";
import { mergeControlTemplate, type TemplateJson } from "../templates/merge-template.js";
import { deriveGuid, type BuildSeed } from "./guid-factory.js";

/**
 * Per-control compilation (brief Step 5 + Step 6).
 *
 * Every KF control object is built as:
 *
 *   result = mergeControlTemplate(mergeControlTemplate(baseFields, template), overrides)
 *          = { ...baseFields, ...template, ...overrides }
 *
 * - `baseFields` and the per-type `template` come from the REVIEWED templates
 *   under `src/templates/`; the compiler never invents fields.
 * - `overrides` contains ONLY schema-approved runtime values: the KF `name`,
 *   the derived KF GUID, geometry, and the type-specific semantic values
 *   (text / precision / restricted actions).
 * - Model-provided raw fields are never copied: foreign OBJECT fields are
 *   ignored (template wins), while foreign STRING fields are rejected with
 *   MODEL_OUTPUT_INVALID because a raw string is the vehicle for arbitrary
 *   JavaScript injection (brief Step 6).
 */

export const MODEL_OUTPUT_INVALID = "MODEL_OUTPUT_INVALID";

export class ModelOutputInvalidError extends Error {
  constructor(detail: string) {
    super(`${MODEL_OUTPUT_INVALID}: ${detail}`);
    this.name = "ModelOutputInvalidError";
  }
}

/** Lookups the compiler needs while resolving semantic references to KF values. */
export interface CompileContext {
  /** KF group GUID shared by page-manager entries and the variable group file. */
  variableGroupGuid: string;
  /** Resolves a `navigate.pageId` SEMANTIC PAGE ID (page name) to its KF GUID. */
  resolvePageGuid(semanticPageName: string): string;
  /** Validates a `setVariable.variableId` SEMANTIC VARIABLE ID (variable name). */
  resolveVariableName(semanticVariableId: string): string;
}

/**
 * Serialized restricted-action command placed in `linkMng.linkList`.
 * `openDialog` is an encoded action form supported by the serializer; the
 * current IR schema only produces `navigatePage` and `setVariable`.
 */
export type CompiledAction = {
  action: "navigatePage" | "setVariable" | "openDialog";
  pageId?: string;
  variableId?: string;
  value?: string | number | boolean;
};

const BASE_FIELDS: TemplateJson = baseFields;

const CONTROL_TEMPLATES: Readonly<Record<string, TemplateJson>> = {
  text: textTemplate,
  button: buttonTemplate,
  inputnumber: inputNumberTemplate,
};

/** IR fields every control variant carries (everything the schema defines). */
const COMMON_IR_FIELDS = new Set(["id", "type", "x", "y", "width", "height"]);
const TYPE_IR_FIELDS: Readonly<Record<string, ReadonlySet<string>>> = {
  text: new Set(["text"]),
  button: new Set(["text", "action"]),
  inputnumber: new Set(["variableId", "decimals"]),
};

/**
 * Returns the only control types with a REVIEWED template. Any other IR
 * control type is rejected (MODEL_OUTPUT_INVALID) because the compiler must
 * not fabricate a KF field layout for it.
 */
export function supportedControlTypes(): readonly string[] {
  return Object.keys(CONTROL_TEMPLATES);
}

export function hasReviewedTemplate(controlType: string): boolean {
  return CONTROL_TEMPLATES[controlType] !== undefined;
}

/**
 * Rejects foreign string fields on a control. The IR schema only knows
 * COMMON_IR_FIELDS + the type-specific fields; a string in any other field is
 * the injection vehicle for raw JavaScript / arbitrary model strings.
 */
export function assertNoStringForeignFields(
  control: Record<string, unknown>,
  controlType: string,
): void {
  const known = new Set([...COMMON_IR_FIELDS, ...(TYPE_IR_FIELDS[controlType] ?? [])]);
  for (const [key, value] of Object.entries(control)) {
    if (!known.has(key) && typeof value === "string") {
      throw new ModelOutputInvalidError(
        `control "${String(control["id"])}" carries a raw string field "${key}" ` +
          "(raw JavaScript / arbitrary model strings are rejected)",
      );
    }
  }
}

/**
 * Compiles one IR control into its full KF control object using the reviewed
 * templates and the single merge rule from merge-template.ts.
 */
export function compileControl(
  build: BuildSeed,
  control: ControlIR,
  ctx: CompileContext,
): TemplateJson {
  const template = CONTROL_TEMPLATES[control.type];
  if (template === undefined) {
    throw new ModelOutputInvalidError(
      `control type "${control.type}" has no reviewed template ` +
        `(supported: ${supportedControlTypes().join(", ")})`,
    );
  }
  const merged = mergeControlTemplate(BASE_FIELDS, template);
  return mergeControlTemplate(merged, applySchemaOverrides(build, control, ctx));
}

function applySchemaOverrides(
  build: BuildSeed,
  control: ControlIR,
  ctx: CompileContext,
): TemplateJson {
  const common = {
    name: control.id,
    guid: deriveGuid(build, control.id),
    leftTopPt: { x: control.x, y: control.y },
    width: control.width,
    height: control.height,
  };
  switch (control.type) {
    case "text":
      return { ...common, text: control.text };
    case "button": {
      const links =
        control.action === undefined || control.action.kind === "noop"
          ? []
          : [compileAction(control.action, ctx)];
      return { ...common, text: control.text, linkMng: { linkList: links } };
    }
    case "inputnumber":
      return { ...common, precision: control.decimals };
    default:
      throw new ModelOutputInvalidError(
        `control type "${control.type}" has no reviewed template`,
      );
  }
}

/**
 * Compiles one IR restricted action into a serialized command. Only explicit,
 * declarative actions are allowed; `navigate` becomes `navigatePage` with the
 * page KF GUID resolved at compile time, `setVariable` keeps the semantic
 * variable name as its target. `noop` is handled by the caller (empty list).
 */
export function compileAction(
  action: RestrictedAction,
  ctx: CompileContext,
): CompiledAction {
  switch (action.kind) {
    case "navigate":
      return { action: "navigatePage", pageId: ctx.resolvePageGuid(action.pageId) };
    case "setVariable":
      return {
        action: "setVariable",
        variableId: ctx.resolveVariableName(action.variableId),
        value: action.value,
      };
    case "noop":
      throw new ModelOutputInvalidError(
        "noop actions are not serialized as explicit commands (caller must skip them)",
      );
  }
}
