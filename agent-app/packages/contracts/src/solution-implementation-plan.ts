import { z } from "zod";
import { projectKeySchema } from "./solution.js";
import { StyleDeclarationSchema, ThemeSpecSchema } from "./ui-style.js";

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canonicalUuidToken = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const forbiddenSemanticNames = new Set([
  "configuredata",
  "coordinates",
  "coords",
  "css",
  "geometry",
  "guid",
  "javascript",
  "js",
  "lefttoppt",
  "linkid",
  "objecttype",
  "script",
  "selector",
  "source",
  "styledata",
  "styledatanew",
  "uimodeltype",
  "x",
  "y",
]);

function normalizeName(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function isForbiddenSemanticName(value: string): boolean {
  return forbiddenSemanticNames.has(normalizeName(value));
}

const stableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine((value) => !canonicalUuid.test(value), "GUID-shaped identifiers are not allowed")
  .refine((value) => !isForbiddenSemanticName(value), "implementation identifiers are not allowed");

const semanticNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine((value) => !isForbiddenSemanticName(value), "implementation names are not allowed");

/** Blueprint provenance also accepts legacy bounded human labels losslessly. */
const provenanceIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .refine((value) => !canonicalUuidToken.test(value), "GUID-shaped provenance identifiers are not allowed")
  .refine((value) => !/<\/?script\b|\b(?:javascript|vbscript)\s*:/i.test(value), "executable provenance identifiers are not allowed");

/** Capability identity is syntactic here; signed-candidate membership belongs to Task 4. */
const capabilityIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_.-]*$/)
  .refine((value) => !canonicalUuid.test(value), "GUID-shaped capability identifiers are not allowed");

const moduleKindSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z0-9][A-Za-z0-9_-]*)*$/)
  .refine((value) => !canonicalUuid.test(value), "GUID-shaped module identifiers are not allowed");

const templateVersionSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[0-9A-Za-z][0-9A-Za-z._-]*$/);

const semanticTextSchema = z.string().trim().min(1).max(2_000);
const shortTextSchema = z.string().trim().min(1).max(400);
const declarativeStepTextSchema = semanticTextSchema.superRefine((value, ctx) => {
  if (
    /\b(?:if|else|for|while|switch|try|catch|throw|async|await)\b|[{};]/.test(value)
    || /(?:^|\s)[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\.[A-Za-z_$][A-Za-z0-9_$]*)|(?:\[[^\]]+\]))*\s*(?:=|\+=|-=|\*=|\/=|\+\+|--)/.test(value)
    || /\b[A-Za-z_$][A-Za-z0-9_$]*\s*(?:\[[^\]]+\]|\.[A-Za-z_$][A-Za-z0-9_$]*)\s*(?:\(|\[)/.test(value)
    || /\b[A-Za-z_$][A-Za-z0-9_$]*\(/.test(value)
    || /\b(?:alert|setTimeout|setInterval|eval|Function)\s+\(/.test(value)
  ) {
    ctx.addIssue({ code: "custom", message: "custom-script steps must be declarative prose, not executable syntax" });
  }
});
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);

export const SemanticScalarSchema = z.union([
  z.string().trim().max(2_000),
  z.number().finite().min(-1_000_000_000).max(1_000_000_000),
  z.boolean(),
  z.null(),
]);

export type SemanticScalar = z.infer<typeof SemanticScalarSchema>;
export type SemanticValue =
  | SemanticScalar
  | { kind: "list"; items: SemanticValue[] }
  | { kind: "record"; fields: Array<{ name: string; value: SemanticValue }> };

const SemanticValueSchema: z.ZodType<SemanticValue> = z.lazy(() =>
  z.union([
    SemanticScalarSchema,
    z.object({ kind: z.literal("list"), items: z.array(SemanticValueSchema).max(32) }).strict(),
    z
      .object({
        kind: z.literal("record"),
        fields: z.array(z.object({ name: semanticNameSchema, value: SemanticValueSchema }).strict()).max(32),
      })
      .strict()
      .superRefine((value, ctx) => {
        const names = new Set<string>();
        value.fields.forEach((field, index) => {
          if (names.has(field.name)) {
            ctx.addIssue({ code: "custom", path: ["fields", index, "name"], message: `duplicate semantic field: ${field.name}` });
          }
          names.add(field.name);
        });
      }),
  ]),
);

const WidthIntentSchema = z
  .object({
    mode: z.enum(["content", "fixed", "fill", "ratio", "minmax"]),
    value: z.number().positive().max(100_000).optional(),
    min: z.number().positive().max(100_000).optional(),
    max: z.number().positive().max(100_000).optional(),
  })
  .strict()
  .superRefine(validateSizingIntent);

const HeightIntentSchema = z
  .object({
    mode: z.enum(["content", "fixed", "fill", "viewport", "ratio", "minmax"]),
    value: z.number().positive().max(100_000).optional(),
    min: z.number().positive().max(100_000).optional(),
    max: z.number().positive().max(100_000).optional(),
  })
  .strict()
  .superRefine(validateSizingIntent);

function validateSizingIntent(
  value: { mode: string; value?: number | undefined; min?: number | undefined; max?: number | undefined },
  ctx: z.RefinementCtx,
): void {
  if ((value.mode === "fixed" || value.mode === "ratio") && value.value === undefined) {
    ctx.addIssue({ code: "custom", path: ["value"], message: `${value.mode} sizing requires a value` });
  }
  if (value.mode === "minmax" && (value.min === undefined || value.max === undefined)) {
    ctx.addIssue({ code: "custom", message: "minmax sizing requires min and max" });
  }
  if (value.min !== undefined && value.max !== undefined && value.min > value.max) {
    ctx.addIssue({ code: "custom", path: ["max"], message: "max must be greater than or equal to min" });
  }
}

export const NodeIntentSchema = z
  .object({
    importance: z.enum(["primary", "secondary", "supporting"]),
    visualWeight: z.number().int().min(1).max(5),
    readingOrder: z.number().int().min(0).max(1_000),
    density: z.enum(["compact", "comfortable", "spacious"]),
    groupWith: z.array(stableIdSchema).max(12),
    width: WidthIntentSchema,
    height: HeightIntentSchema,
    align: z.enum(["start", "center", "end", "stretch"]),
  })
  .strict();

export type NodeIntent = z.infer<typeof NodeIntentSchema>;

interface SolutionNodeBase {
  id: string;
  sourceBlueprintRegionIds: string[];
  intent: NodeIntent;
}

export interface LayoutNode extends SolutionNodeBase {
  kind: "layout";
  layout: "row" | "column" | "grid" | "asymmetric-grid" | "split" | "stack" | "dock" | "sidebar-content" | "master-detail" | "scroll-region" | "overlay-anchor";
  recipeId?: string | undefined;
  children: SolutionNode[];
}

export interface RegisteredModuleNode extends SolutionNodeBase {
  kind: "registered-module";
  moduleKind: string;
  templateVersion: string;
  variant: string;
  title: string;
  content?: SemanticValue | undefined;
  assetId?: string | undefined;
  slots: Array<{ slotId: string; children: SolutionNode[] }>;
}

export interface ControlNode extends SolutionNodeBase {
  kind: "control";
  capabilityId: string;
  content: SemanticValue;
  properties: Array<{ name: string; value: SemanticValue }>;
  tabIds: string[];
  mockDataId?: string | undefined;
  styleRole: string;
  styleOverride?: z.infer<typeof StyleOverrideSchema> | undefined;
  eventActionIds: string[];
}

export interface RepeaterNode extends SolutionNodeBase {
  kind: "repeater";
  mockDataId: string;
  itemAlias: string;
  keyField: string;
  maxItems: number;
  template: SolutionNode;
}

export type SolutionNode = LayoutNode | RegisteredModuleNode | ControlNode | RepeaterNode;

const nodeCommonShape = {
  id: stableIdSchema,
  sourceBlueprintRegionIds: z.array(provenanceIdSchema).min(1).max(12),
  intent: NodeIntentSchema,
};

const StyleStatesSchema = z
  .object({
    hover: StyleDeclarationSchema.optional(),
    active: StyleDeclarationSchema.optional(),
    focus: StyleDeclarationSchema.optional(),
    disabled: StyleDeclarationSchema.optional(),
    selected: StyleDeclarationSchema.optional(),
    error: StyleDeclarationSchema.optional(),
  })
  .strict();

const StyleOverrideSchema = z
  .object({
    declarations: StyleDeclarationSchema.default({}),
    states: StyleStatesSchema.default({}),
  })
  .strict();

export const LayoutNodeSchema = z
  .object({
    ...nodeCommonShape,
    kind: z.literal("layout"),
    layout: z.enum([
      "row",
      "column",
      "grid",
      "asymmetric-grid",
      "split",
      "stack",
      "dock",
      "sidebar-content",
      "master-detail",
      "scroll-region",
      "overlay-anchor",
    ]),
    recipeId: stableIdSchema.optional(),
    children: z.array(z.lazy(() => SolutionNodeSchema)).min(1).max(24),
  })
  .strict();

export const RegisteredModuleNodeSchema = z
  .object({
    ...nodeCommonShape,
    kind: z.literal("registered-module"),
    moduleKind: moduleKindSchema,
    templateVersion: templateVersionSchema,
    variant: stableIdSchema,
    title: semanticTextSchema,
    content: SemanticValueSchema.optional(),
    assetId: stableIdSchema.optional(),
    slots: z
      .array(
        z
          .object({
            slotId: stableIdSchema,
            children: z.array(z.lazy(() => SolutionNodeSchema)).min(1).max(24),
          })
          .strict(),
      )
      .max(16),
  })
  .strict();

const SemanticPropertySchema = z.object({ name: semanticNameSchema, value: SemanticValueSchema }).strict();

export const ControlNodeSchema = z
  .object({
    ...nodeCommonShape,
    kind: z.literal("control"),
    capabilityId: capabilityIdSchema,
    content: SemanticValueSchema,
    properties: z.array(SemanticPropertySchema).max(32),
    tabIds: z.array(stableIdSchema).max(32).default([]),
    mockDataId: stableIdSchema.optional(),
    styleRole: stableIdSchema,
    styleOverride: StyleOverrideSchema.optional(),
    eventActionIds: z.array(stableIdSchema).max(16),
  })
  .strict();

export const RepeaterNodeSchema = z
  .object({
    ...nodeCommonShape,
    kind: z.literal("repeater"),
    mockDataId: stableIdSchema,
    itemAlias: semanticNameSchema,
    keyField: semanticNameSchema,
    maxItems: z.number().int().min(1).max(100),
    template: z.lazy(() => SolutionNodeSchema),
  })
  .strict();

export const SolutionNodeSchema: z.ZodType<SolutionNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    LayoutNodeSchema,
    RegisteredModuleNodeSchema,
    ControlNodeSchema,
    RepeaterNodeSchema,
  ]),
);

export const RoleStyleIntentSchema = z
  .object({
    role: stableIdSchema,
    declarations: StyleDeclarationSchema.default({}),
    states: StyleStatesSchema.default({}),
  })
  .strict();

const MockFieldSchema = z
  .object({
    key: semanticNameSchema,
    label: shortTextSchema,
    type: z.enum(["text", "number", "boolean", "date"]),
  })
  .strict();

const MockRecordSchema = z
  .object({
    values: z.array(z.object({ field: semanticNameSchema, value: SemanticScalarSchema }).strict()).min(1).max(32),
  })
  .strict();

export const MockDataSetSchema = z
  .object({
    id: stableIdSchema,
    purpose: semanticTextSchema,
    fields: z.array(MockFieldSchema).min(1).max(32),
    records: z.array(MockRecordSchema).min(1).max(100),
  })
  .strict()
  .superRefine((dataSet, ctx) => {
    const fieldTypes = new Map<string, z.infer<typeof MockFieldSchema>["type"]>();
    dataSet.fields.forEach((field, index) => {
      if (fieldTypes.has(field.key)) {
        ctx.addIssue({ code: "custom", path: ["fields", index, "key"], message: `duplicate mock field: ${field.key}` });
      }
      fieldTypes.set(field.key, field.type);
    });
    dataSet.records.forEach((record, recordIndex) => {
      const recordFields = new Set<string>();
      record.values.forEach((entry, valueIndex) => {
        const fieldType = fieldTypes.get(entry.field);
        if (fieldType === undefined) {
          ctx.addIssue({ code: "custom", path: ["records", recordIndex, "values", valueIndex, "field"], message: `unknown mock field: ${entry.field}` });
        }
        if (recordFields.has(entry.field)) {
          ctx.addIssue({ code: "custom", path: ["records", recordIndex, "values", valueIndex, "field"], message: `duplicate mock record field: ${entry.field}` });
        }
        recordFields.add(entry.field);
        if (!mockValueMatches(fieldType, entry.value)) {
          ctx.addIssue({ code: "custom", path: ["records", recordIndex, "values", valueIndex, "value"], message: `mock value does not match ${fieldType ?? "unknown"} field` });
        }
        if (typeof entry.value === "string" && /\b(?:ONLINE|INFO|Item\s+\d+)\b|Lorem\s+ipsum/i.test(entry.value)) {
          ctx.addIssue({ code: "custom", path: ["records", recordIndex, "values", valueIndex, "value"], message: "technical placeholder mock content is not allowed" });
        }
      });
      dataSet.fields.forEach((field) => {
        if (!recordFields.has(field.key)) {
          ctx.addIssue({ code: "custom", path: ["records", recordIndex, "values"], message: `missing mock field: ${field.key}` });
        }
      });
    });
  });

function mockValueMatches(type: z.infer<typeof MockFieldSchema>["type"] | undefined, value: SemanticScalar): boolean {
  if (type === undefined || value === null) return false;
  if (type === "text" || type === "date") return typeof value === "string";
  return typeof value === type;
}

export const LocalStateDefinitionSchema = z
  .object({
    id: stableIdSchema,
    purpose: semanticTextSchema,
    type: z.enum(["boolean", "number", "text", "record-key", "record-key-list"]),
    initialValue: z.union([SemanticScalarSchema, z.array(stableIdSchema).max(100)]),
    mockDataId: stableIdSchema.optional(),
  })
  .strict()
  .superRefine((state, ctx) => {
    const valid =
      (state.type === "boolean" && typeof state.initialValue === "boolean")
      || (state.type === "number" && typeof state.initialValue === "number")
      || ((state.type === "text" || state.type === "record-key") && typeof state.initialValue === "string")
      || (state.type === "record-key-list" && Array.isArray(state.initialValue));
    if (!valid) ctx.addIssue({ code: "custom", path: ["initialValue"], message: `initial value does not match ${state.type}` });
    if ((state.type === "record-key" || state.type === "record-key-list") !== (state.mockDataId !== undefined)) {
      ctx.addIssue({ code: "custom", path: ["mockDataId"], message: "record-key state requires exactly one mock-data reference" });
    }
  });

export const SolutionPageSchema = z
  .object({
    id: stableIdSchema,
    title: semanticTextSchema,
    purpose: semanticTextSchema,
    canvas: z.enum(["responsive", "desktop", "large-display"]),
    sourceBlueprintPageId: provenanceIdSchema,
    sourceBlueprintRegionIds: z.array(provenanceIdSchema).min(1).max(12),
    initialStateIds: z.array(stableIdSchema).max(32),
    root: SolutionNodeSchema,
  })
  .strict();

export const OverlayPlanSchema = z
  .object({
    id: stableIdSchema,
    title: semanticTextSchema,
    purpose: semanticTextSchema,
    presentation: z.enum(["dialog", "window", "drawer", "confirmation"]),
    hostPageId: stableIdSchema,
    sourceBlueprintPageId: provenanceIdSchema,
    sourceBlueprintRegionIds: z.array(provenanceIdSchema).min(1).max(12),
    visibleStateId: stableIdSchema,
    dismissible: z.boolean(),
    root: SolutionNodeSchema,
  })
  .strict();

const actionBaseShape = {
  id: stableIdSchema,
  afterActionIds: z.array(stableIdSchema).max(16).default([]),
};

export const ValueExpressionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: SemanticValueSchema }).strict(),
  z.object({ kind: z.literal("local-state"), stateId: stableIdSchema }).strict(),
  z.object({ kind: z.literal("mock-data"), mockDataId: stableIdSchema }).strict(),
]);

export const ActionPlanSchema = z.discriminatedUnion("kind", [
  z.object({ ...actionBaseShape, kind: z.literal("navigate-page"), targetPageId: stableIdSchema }).strict(),
  z.object({ ...actionBaseShape, kind: z.literal("open-overlay"), overlayId: stableIdSchema }).strict(),
  z.object({ ...actionBaseShape, kind: z.literal("close-overlay"), overlayId: stableIdSchema, result: SemanticScalarSchema.optional() }).strict(),
  z.object({ ...actionBaseShape, kind: z.literal("set-visibility"), targetId: stableIdSchema, visible: z.boolean() }).strict(),
  z.object({ ...actionBaseShape, kind: z.literal("switch-tab"), targetId: stableIdSchema, tabId: stableIdSchema }).strict(),
  z.object({ ...actionBaseShape, kind: z.literal("set-state"), stateId: stableIdSchema, value: SemanticValueSchema }).strict(),
  z.object({ ...actionBaseShape, kind: z.literal("set-control-value"), targetId: stableIdSchema, value: ValueExpressionSchema }).strict(),
  z.object({ ...actionBaseShape, kind: z.literal("show-feedback"), level: z.enum(["success", "info", "warning", "error"]), message: shortTextSchema }).strict(),
  z.object({ ...actionBaseShape, kind: z.literal("run-script"), scriptId: stableIdSchema }).strict(),
]);

const ScriptPortSchema = z
  .object({
    name: semanticNameSchema,
    description: shortTextSchema,
    refKind: z.enum(["mock-data", "local-state", "control"]),
    refId: stableIdSchema,
  })
  .strict();

const ScriptParameterSchema = z
  .object({
    name: semanticNameSchema,
    value: SemanticScalarSchema.optional(),
    refKind: z.enum(["mock-data", "local-state", "control"]).optional(),
    refId: stableIdSchema.optional(),
  })
  .strict()
  .superRefine((parameter, ctx) => {
    const hasValue = parameter.value !== undefined;
    const hasReference = parameter.refKind !== undefined || parameter.refId !== undefined;
    if (hasValue === hasReference || (parameter.refKind === undefined) !== (parameter.refId === undefined)) {
      ctx.addIssue({ code: "custom", message: "script parameter requires exactly one literal value or complete semantic reference" });
    }
  });

const scriptBaseShape = {
  id: stableIdSchema,
  purpose: semanticTextSchema,
  inputs: z.array(ScriptPortSchema).max(32),
  outputs: z.array(ScriptPortSchema).max(32),
};

const TemplateScriptPlanSchema = z
  .object({
    ...scriptBaseShape,
    kind: z.literal("template"),
    template: stableIdSchema,
    parameters: z.array(ScriptParameterSchema).max(32),
  })
  .strict();

const CustomScriptPlanSchema = z
  .object({
    ...scriptBaseShape,
    kind: z.literal("custom"),
    steps: z
      .array(
        z
          .object({
            order: z.number().int().min(1).max(100),
            intent: declarativeStepTextSchema,
            inputNames: z.array(semanticNameSchema).max(32),
            outputNames: z.array(semanticNameSchema).max(32),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict()
  .superRefine((script, ctx) => {
    const inputNames = new Set(script.inputs.map((input) => input.name));
    const outputNames = new Set(script.outputs.map((output) => output.name));
    script.steps.forEach((step, index) => {
      if (step.order !== index + 1) {
        ctx.addIssue({ code: "custom", path: ["steps", index, "order"], message: "custom-script steps must be consecutively ordered from one" });
      }
      step.inputNames.forEach((name, nameIndex) => {
        if (!inputNames.has(name)) ctx.addIssue({ code: "custom", path: ["steps", index, "inputNames", nameIndex], message: `unknown script input: ${name}` });
      });
      step.outputNames.forEach((name, nameIndex) => {
        if (!outputNames.has(name)) ctx.addIssue({ code: "custom", path: ["steps", index, "outputNames", nameIndex], message: `unknown script output: ${name}` });
      });
    });
  });

export const ScriptPlanSchema = z.discriminatedUnion("kind", [TemplateScriptPlanSchema, CustomScriptPlanSchema]);

const SolutionImplementationPlanObjectSchema = z
  .object({
    schema: z.literal("kf-solution-implementation/v1"),
    projectKey: projectKeySchema,
    blueprintHash: hashSchema,
    candidateBundleHash: hashSchema,
    theme: ThemeSpecSchema,
    roleStyles: z.array(RoleStyleIntentSchema).max(64),
    mockData: z.array(MockDataSetSchema).max(32),
    localState: z.array(LocalStateDefinitionSchema).max(64),
    pages: z.array(SolutionPageSchema).min(1).max(8),
    overlays: z.array(OverlayPlanSchema).max(24),
    actions: z.array(ActionPlanSchema).max(200),
    scripts: z.array(ScriptPlanSchema).max(50),
  })
  .strict();

export type RoleStyleIntent = z.infer<typeof RoleStyleIntentSchema>;
export type MockDataSet = z.infer<typeof MockDataSetSchema>;
export type LocalStateDefinition = z.infer<typeof LocalStateDefinitionSchema>;
export type SolutionPage = z.infer<typeof SolutionPageSchema>;
export type OverlayPlan = z.infer<typeof OverlayPlanSchema>;
export type ActionPlan = z.infer<typeof ActionPlanSchema>;
export type ScriptPlan = z.infer<typeof ScriptPlanSchema>;
export type ThemeIntent = z.infer<typeof ThemeSpecSchema>;
export type SolutionImplementationPlan = z.infer<typeof SolutionImplementationPlanObjectSchema>;

export const SolutionImplementationPlanSchema: z.ZodType<SolutionImplementationPlan> =
  SolutionImplementationPlanObjectSchema.superRefine((plan, ctx) => {
    validateImplementationFree(plan, ctx);
    validateSemanticValueContainers(plan, ctx);
    validatePlanReferences(plan, ctx);
  });

function implementationTextIssue(value: string): string | undefined {
  if (canonicalUuidToken.test(value)) return "GUID values are not allowed";
  const trimmed = value.trim();
  if (/^[{[]/.test(trimmed)) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (Array.isArray(parsed) || (parsed !== null && typeof parsed === "object")) return "raw JSON text is not allowed";
    } catch {
      // Descriptive text may legitimately begin with a bracket.
    }
  }
  if (/[{[]\s*["'][A-Za-z][A-Za-z0-9_. -]*["']\s*:/.test(value)) return "embedded raw JSON text is not allowed";
  if (/:\s*\[\s*(?:-?\d|true\b|false\b|null\b|["'{[])/i.test(value) || /:\s*\{\s*(?:["']|[A-Za-z_$][A-Za-z0-9_$]*\s*:)/.test(value)) return "embedded raw JSON text is not allowed";
  if (/<\/?script\b|<style\b|\b(?:javascript|vbscript)\s*:/i.test(value)) return "executable markup is not allowed";
  if (/\b(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\s*=|\bfunction\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\(|\breturn\b[^;\n]*;|\bclass\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\{|\b(?:import|require)\s*\(|\bnew\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\(|=>|\$control\b|\$state\b|\$data\b|\$page\b|\$overlay\b|\$feedback\b|`|\$\{/i.test(value)) return "JavaScript-shaped text is not allowed";
  if (/\b(?:document|window|globalThis|fetch|XMLHttpRequest|WebSocket|eval|Function)\s*\.?[A-Za-z_$]*\s*\(/i.test(value)) return "JavaScript API calls are not allowed";
  if (/\b(?!rgb(?:a)?\b|hsl(?:a)?\b|var\b)[A-Za-z_$][A-Za-z0-9_$]*\(/i.test(value)) return "code-like calls are not allowed";
  if (/^\.[A-Za-z_-][A-Za-z0-9_-]*$/.test(trimmed) || (/^#[A-Za-z_-][A-Za-z0-9_-]*$/.test(trimmed) && !/^#[0-9a-f]{3,8}$/i.test(trimmed)) || /^\[[A-Za-z_-][^\]]*\]$/.test(trimmed)) return "CSS selectors are not allowed";
  if (/^#[A-Za-z_-][A-Za-z0-9_-]*(?:\s+|\s*[>+~]\s*)/.test(trimmed) || /^(?:button|input|select|textarea|a|form|table|tr|td|div|span|section|main|header|footer|nav|label):[A-Za-z-]+(?:\([^)]*\))?$/.test(trimmed)) return "CSS selectors are not allowed";
  if (/(?:^|\s)(?:#[A-Za-z_-][A-Za-z0-9_-]*|\.[A-Za-z_-][A-Za-z0-9_-]*|\[[A-Za-z_-][^\]]*\]|(?:button|input|select|textarea|div|span|section|main|header|footer|nav):[A-Za-z-]+)\s*(?:\{|[>+~])/i.test(value)) return "CSS rules and selectors are not allowed";
  if (/(?:^|[;{]\s*)(?:color|display|position|width|height|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?|background(?:-[a-z]+)?|border(?:-[a-z]+)?|font(?:-[a-z]+)?|opacity|z-index|flex(?:-[a-z]+)?|grid(?:-[a-z]+)?|transform|transition|animation)\s*:\s*[^;{}\n]+(?:;|})/i.test(value)) return "CSS declarations are not allowed";
  if (/\b[A-Za-z_$][A-Za-z0-9_$]*\.[A-Za-z_$][A-Za-z0-9_$]*\s*\(/.test(value)) return "code-like calls are not allowed";
  return undefined;
}

function validateImplementationFree(value: unknown, ctx: z.RefinementCtx, path: Array<string | number> = []): void {
  if (typeof value === "string") {
    const issue = implementationTextIssue(value);
    if (issue !== undefined) ctx.addIssue({ code: "custom", path, message: issue });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateImplementationFree(item, ctx, [...path, index]));
    return;
  }
  if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => {
      if (isForbiddenSemanticName(key)) {
        ctx.addIssue({ code: "custom", path: [...path, key], message: "implementation-owned fields are not allowed" });
      }
      validateImplementationFree(item, ctx, [...path, key]);
    });
  }
}

function validateSemanticValueContainers(value: unknown, ctx: z.RefinementCtx, path: Array<string | number> = []): void {
  if (isSemanticContainer(value)) {
    validateSemanticValueDepth(value, ctx, path, 0);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateSemanticValueContainers(item, ctx, [...path, index]));
  } else if (value !== null && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => validateSemanticValueContainers(item, ctx, [...path, key]));
  }
}

function isSemanticContainer(value: unknown): value is Exclude<SemanticValue, SemanticScalar> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const kind = (value as { kind?: unknown }).kind;
  return kind === "list" || kind === "record";
}

function validateSemanticValueDepth(value: SemanticValue, ctx: z.RefinementCtx, path: Array<string | number>, depth: number): void {
  if (depth > 8) {
    ctx.addIssue({ code: "custom", path, message: "semantic value nesting exceeds eight levels" });
    return;
  }
  if (typeof value !== "object" || value === null) return;
  if (value.kind === "list") {
    value.items.forEach((item, index) => validateSemanticValueDepth(item, ctx, [...path, "items", index], depth + 1));
  } else {
    value.fields.forEach((field, index) => validateSemanticValueDepth(field.value, ctx, [...path, "fields", index, "value"], depth + 1));
  }
}

function validatePlanReferences(plan: SolutionImplementationPlan, ctx: z.RefinementCtx): void {
  const allIds = new Set<string>();
  const pageIds = new Set<string>();
  const pageSourceIds = new Set<string>();
  const overlayIds = new Set<string>();
  const actionIds = new Set<string>();
  const scriptIds = new Set<string>();
  const stateIds = new Set<string>();
  const mockDataIds = new Set<string>();
  const nodeIds = new Set<string>();
  const controlIds = new Set<string>();
  const roleIds = new Set<string>();
  const dataSets = new Map(plan.mockData.map((dataSet) => [dataSet.id, dataSet]));
  const statesById = new Map(plan.localState.map((state) => [state.id, state]));
  const pagesById = new Map(plan.pages.map((page) => [page.id, page]));
  const nodeEntries: Array<{ node: SolutionNode; path: Array<string | number>; page: SolutionPage; depth: number }> = [];

  const registerId = (id: string, path: Array<string | number>): void => {
    if (allIds.has(id)) ctx.addIssue({ code: "custom", path, message: `duplicate global stable id: ${id}` });
    allIds.add(id);
  };

  plan.roleStyles.forEach((style, index) => {
    if (roleIds.has(style.role)) ctx.addIssue({ code: "custom", path: ["roleStyles", index, "role"], message: `duplicate style role: ${style.role}` });
    roleIds.add(style.role);
  });
  plan.mockData.forEach((dataSet, index) => {
    registerId(dataSet.id, ["mockData", index, "id"]);
    mockDataIds.add(dataSet.id);
  });
  plan.localState.forEach((state, index) => {
    registerId(state.id, ["localState", index, "id"]);
    stateIds.add(state.id);
    if (state.mockDataId !== undefined && !mockDataIds.has(state.mockDataId)) {
      ctx.addIssue({ code: "custom", path: ["localState", index, "mockDataId"], message: `unknown mock-data id: ${state.mockDataId}` });
    }
  });

  const regionOwners = new Map<string, string>();
  plan.pages.forEach((page, pageIndex) => {
    registerId(page.id, ["pages", pageIndex, "id"]);
    pageIds.add(page.id);
    if (pageSourceIds.has(page.sourceBlueprintPageId)) {
      ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "sourceBlueprintPageId"], message: `duplicate blueprint page provenance: ${page.sourceBlueprintPageId}` });
    }
    pageSourceIds.add(page.sourceBlueprintPageId);
    page.sourceBlueprintRegionIds.forEach((regionId, regionIndex) => {
      const owner = regionOwners.get(regionId);
      if (owner !== undefined) {
        ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "sourceBlueprintRegionIds", regionIndex], message: `blueprint region already belongs to ${owner}: ${regionId}` });
      }
      regionOwners.set(regionId, page.sourceBlueprintPageId);
    });
    page.initialStateIds.forEach((stateId, stateIndex) => {
      if (!stateIds.has(stateId)) ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "initialStateIds", stateIndex], message: `unknown state id: ${stateId}` });
    });
    collectNode(page.root, ["pages", pageIndex, "root"], page, 0, nodeEntries, registerId, nodeIds, controlIds, ctx);
  });

  plan.overlays.forEach((overlay, overlayIndex) => {
    registerId(overlay.id, ["overlays", overlayIndex, "id"]);
    overlayIds.add(overlay.id);
    const hostPage = pagesById.get(overlay.hostPageId);
    if (hostPage === undefined) {
      ctx.addIssue({ code: "custom", path: ["overlays", overlayIndex, "hostPageId"], message: `unknown host page id: ${overlay.hostPageId}` });
      return;
    }
    if (overlay.sourceBlueprintPageId !== hostPage.sourceBlueprintPageId) {
      ctx.addIssue({ code: "custom", path: ["overlays", overlayIndex, "sourceBlueprintPageId"], message: "overlay blueprint page provenance must match its host page" });
    }
    overlay.sourceBlueprintRegionIds.forEach((regionId, regionIndex) => {
      if (!hostPage.sourceBlueprintRegionIds.includes(regionId)) {
        ctx.addIssue({ code: "custom", path: ["overlays", overlayIndex, "sourceBlueprintRegionIds", regionIndex], message: `unknown host-page blueprint region: ${regionId}` });
      }
    });
    if (!stateIds.has(overlay.visibleStateId)) {
      ctx.addIssue({ code: "custom", path: ["overlays", overlayIndex, "visibleStateId"], message: `unknown state id: ${overlay.visibleStateId}` });
    } else if (statesById.get(overlay.visibleStateId)?.type !== "boolean") {
      ctx.addIssue({ code: "custom", path: ["overlays", overlayIndex, "visibleStateId"], message: "overlay visibility requires a boolean state" });
    }
    validateOverlayNodeProvenance(overlay.root, new Set(overlay.sourceBlueprintRegionIds), ["overlays", overlayIndex, "root"], ctx);
    collectNode(overlay.root, ["overlays", overlayIndex, "root"], hostPage, 0, nodeEntries, registerId, nodeIds, controlIds, ctx);
  });

  plan.actions.forEach((action, index) => {
    registerId(action.id, ["actions", index, "id"]);
    actionIds.add(action.id);
  });
  plan.scripts.forEach((script, index) => {
    registerId(script.id, ["scripts", index, "id"]);
    scriptIds.add(script.id);
  });

  validateNodeReferences(nodeEntries, roleIds, mockDataIds, dataSets, actionIds, nodeIds, ctx);
  const controlsById = new Map(
    nodeEntries
      .filter((entry): entry is typeof entry & { node: ControlNode } => entry.node.kind === "control")
      .map((entry) => [entry.node.id, entry.node]),
  );
  validateActions(plan.actions, pageIds, overlayIds, statesById, nodeIds, controlsById, mockDataIds, actionIds, scriptIds, ctx);
  validateScripts(plan.scripts, mockDataIds, stateIds, controlIds, ctx);
}

function validateOverlayNodeProvenance(
  root: SolutionNode,
  allowedRegionIds: Set<string>,
  path: Array<string | number>,
  ctx: z.RefinementCtx,
): void {
  const coveredRegionIds = new Set<string>();
  const visit = (node: SolutionNode, nodePath: Array<string | number>): void => {
    node.sourceBlueprintRegionIds.forEach((regionId, index) => {
      if (!allowedRegionIds.has(regionId)) ctx.addIssue({ code: "custom", path: [...nodePath, "sourceBlueprintRegionIds", index], message: `unknown overlay blueprint region: ${regionId}` });
      coveredRegionIds.add(regionId);
    });
    if (node.kind === "layout") {
      node.children.forEach((child, index) => visit(child, [...nodePath, "children", index]));
    } else if (node.kind === "registered-module") {
      node.slots.forEach((slot, slotIndex) => slot.children.forEach((child, childIndex) => visit(child, [...nodePath, "slots", slotIndex, "children", childIndex])));
    } else if (node.kind === "repeater") {
      visit(node.template, [...nodePath, "template"]);
    }
  };
  visit(root, path);
  allowedRegionIds.forEach((regionId) => {
    if (!coveredRegionIds.has(regionId)) ctx.addIssue({ code: "custom", path, message: `uncovered overlay blueprint region: ${regionId}` });
  });
}

function collectNode(
  node: SolutionNode,
  path: Array<string | number>,
  page: SolutionPage,
  depth: number,
  entries: Array<{ node: SolutionNode; path: Array<string | number>; page: SolutionPage; depth: number }>,
  registerId: (id: string, path: Array<string | number>) => void,
  nodeIds: Set<string>,
  controlIds: Set<string>,
  ctx: z.RefinementCtx,
): void {
  registerId(node.id, [...path, "id"]);
  nodeIds.add(node.id);
  if (node.kind === "control") controlIds.add(node.id);
  entries.push({ node, path, page, depth });
  if (depth > 12) ctx.addIssue({ code: "custom", path, message: "solution-node depth exceeds twelve levels" });
  if (entries.length > 1_000) {
    ctx.addIssue({ code: "custom", path, message: "solution plan exceeds one thousand nodes" });
    return;
  }
  if (node.kind === "layout") {
    node.children.forEach((child, index) => collectNode(child, [...path, "children", index], page, depth + 1, entries, registerId, nodeIds, controlIds, ctx));
  } else if (node.kind === "registered-module") {
    const slots = new Set<string>();
    node.slots.forEach((slot, slotIndex) => {
      if (slots.has(slot.slotId)) ctx.addIssue({ code: "custom", path: [...path, "slots", slotIndex, "slotId"], message: `duplicate semantic module slot: ${slot.slotId}` });
      slots.add(slot.slotId);
      slot.children.forEach((child, childIndex) => collectNode(child, [...path, "slots", slotIndex, "children", childIndex], page, depth + 1, entries, registerId, nodeIds, controlIds, ctx));
    });
  } else if (node.kind === "repeater") {
    collectNode(node.template, [...path, "template"], page, depth + 1, entries, registerId, nodeIds, controlIds, ctx);
  }
}

function validateNodeReferences(
  entries: Array<{ node: SolutionNode; path: Array<string | number>; page: SolutionPage; depth: number }>,
  roleIds: Set<string>,
  mockDataIds: Set<string>,
  dataSets: Map<string, MockDataSet>,
  actionIds: Set<string>,
  nodeIds: Set<string>,
  ctx: z.RefinementCtx,
): void {
  const coveredRegionsByPage = new Map<string, Set<string>>();
  entries.forEach(({ node, path, page }) => {
    const allowedRegions = new Set(page.sourceBlueprintRegionIds);
    const covered = coveredRegionsByPage.get(page.id) ?? new Set<string>();
    coveredRegionsByPage.set(page.id, covered);
    node.sourceBlueprintRegionIds.forEach((regionId, index) => {
      if (!allowedRegions.has(regionId)) ctx.addIssue({ code: "custom", path: [...path, "sourceBlueprintRegionIds", index], message: `unknown page blueprint region: ${regionId}` });
      covered.add(regionId);
    });
    node.intent.groupWith.forEach((targetId, index) => {
      if (!nodeIds.has(targetId)) ctx.addIssue({ code: "custom", path: [...path, "intent", "groupWith", index], message: `unknown grouped node id: ${targetId}` });
      if (targetId === node.id) ctx.addIssue({ code: "custom", path: [...path, "intent", "groupWith", index], message: "a node cannot group with itself" });
    });
    if (node.kind === "control") {
      if (!roleIds.has(node.styleRole)) ctx.addIssue({ code: "custom", path: [...path, "styleRole"], message: `unknown style role: ${node.styleRole}` });
      if (node.mockDataId !== undefined && !mockDataIds.has(node.mockDataId)) ctx.addIssue({ code: "custom", path: [...path, "mockDataId"], message: `unknown mock-data id: ${node.mockDataId}` });
      node.eventActionIds.forEach((actionId, index) => {
        if (!actionIds.has(actionId)) ctx.addIssue({ code: "custom", path: [...path, "eventActionIds", index], message: `unknown action id: ${actionId}` });
      });
      const propertyNames = new Set<string>();
      node.properties.forEach((property, index) => {
        if (propertyNames.has(property.name)) ctx.addIssue({ code: "custom", path: [...path, "properties", index, "name"], message: `duplicate control property: ${property.name}` });
        propertyNames.add(property.name);
      });
      if (new Set(node.tabIds).size !== node.tabIds.length) ctx.addIssue({ code: "custom", path: [...path, "tabIds"], message: "control tab ids must be unique" });
    }
    if (node.kind === "repeater") {
      const dataSet = dataSets.get(node.mockDataId);
      if (dataSet === undefined) {
        ctx.addIssue({ code: "custom", path: [...path, "mockDataId"], message: `unknown mock-data id: ${node.mockDataId}` });
      } else if (!dataSet.fields.some((field) => field.key === node.keyField)) {
        ctx.addIssue({ code: "custom", path: [...path, "keyField"], message: `unknown repeater key field: ${node.keyField}` });
      } else {
        const keys = new Set<string>();
        dataSet.records.forEach((record, recordIndex) => {
          const key = record.values.find((entry) => entry.field === node.keyField)?.value;
          const canonicalKey = `${typeof key}:${String(key)}`;
          if (keys.has(canonicalKey)) ctx.addIssue({ code: "custom", path: [...path, "keyField"], message: `repeater key is not unique in record ${recordIndex}: ${String(key)}` });
          keys.add(canonicalKey);
        });
      }
    }
  });
  const pages = new Map(entries.map((entry) => [entry.page.id, entry.page]));
  pages.forEach((page) => {
    const covered = coveredRegionsByPage.get(page.id) ?? new Set<string>();
    page.sourceBlueprintRegionIds.forEach((regionId) => {
      if (!covered.has(regionId)) ctx.addIssue({ code: "custom", message: `uncovered blueprint region: ${page.sourceBlueprintPageId}/${regionId}` });
    });
  });
}

function validateActions(
  actions: ActionPlan[],
  pageIds: Set<string>,
  overlayIds: Set<string>,
  statesById: Map<string, LocalStateDefinition>,
  nodeIds: Set<string>,
  controlsById: Map<string, ControlNode>,
  mockDataIds: Set<string>,
  actionIds: Set<string>,
  scriptIds: Set<string>,
  ctx: z.RefinementCtx,
): void {
  actions.forEach((action, index) => {
    action.afterActionIds.forEach((actionId, refIndex) => {
      if (!actionIds.has(actionId)) ctx.addIssue({ code: "custom", path: ["actions", index, "afterActionIds", refIndex], message: `unknown action id: ${actionId}` });
      if (actionId === action.id) ctx.addIssue({ code: "custom", path: ["actions", index, "afterActionIds", refIndex], message: "an action cannot follow itself" });
    });
    if (action.kind === "navigate-page" && !pageIds.has(action.targetPageId)) ctx.addIssue({ code: "custom", path: ["actions", index, "targetPageId"], message: `unknown page id: ${action.targetPageId}` });
    if ((action.kind === "open-overlay" || action.kind === "close-overlay") && !overlayIds.has(action.overlayId)) ctx.addIssue({ code: "custom", path: ["actions", index, "overlayId"], message: `unknown overlay id: ${action.overlayId}` });
    if (action.kind === "set-state") {
      const state = statesById.get(action.stateId);
      if (state === undefined) ctx.addIssue({ code: "custom", path: ["actions", index, "stateId"], message: `unknown state id: ${action.stateId}` });
      else if (!stateValueMatches(state.type, action.value)) ctx.addIssue({ code: "custom", path: ["actions", index, "value"], message: `state value does not match ${state.type}` });
    }
    if (action.kind === "set-visibility" && !nodeIds.has(action.targetId)) ctx.addIssue({ code: "custom", path: ["actions", index, "targetId"], message: `unknown node id: ${action.targetId}` });
    if (action.kind === "switch-tab") {
      const control = controlsById.get(action.targetId);
      if (control === undefined) ctx.addIssue({ code: "custom", path: ["actions", index, "targetId"], message: `unknown control id: ${action.targetId}` });
      else if (!control.tabIds.includes(action.tabId)) ctx.addIssue({ code: "custom", path: ["actions", index, "tabId"], message: `unknown declared tab id: ${action.tabId}` });
    }
    if (action.kind === "set-control-value") {
      if (!controlsById.has(action.targetId)) ctx.addIssue({ code: "custom", path: ["actions", index, "targetId"], message: `unknown control id: ${action.targetId}` });
      if (action.value.kind === "local-state" && !statesById.has(action.value.stateId)) ctx.addIssue({ code: "custom", path: ["actions", index, "value", "stateId"], message: `unknown state id: ${action.value.stateId}` });
      if (action.value.kind === "mock-data" && !mockDataIds.has(action.value.mockDataId)) ctx.addIssue({ code: "custom", path: ["actions", index, "value", "mockDataId"], message: `unknown mock-data id: ${action.value.mockDataId}` });
    }
    if (action.kind === "run-script" && !scriptIds.has(action.scriptId)) ctx.addIssue({ code: "custom", path: ["actions", index, "scriptId"], message: `unknown script id: ${action.scriptId}` });
  });
  const actionsById = new Map(actions.map((action, index) => [action.id, { action, index }]));
  const visitState = new Map<string, "visiting" | "visited">();
  const visit = (actionId: string): void => {
    if (visitState.get(actionId) === "visited") return;
    const entry = actionsById.get(actionId);
    if (entry === undefined) return;
    visitState.set(actionId, "visiting");
    entry.action.afterActionIds.forEach((dependencyId, dependencyIndex) => {
      if (visitState.get(dependencyId) === "visiting") {
        ctx.addIssue({ code: "custom", path: ["actions", entry.index, "afterActionIds", dependencyIndex], message: `action dependency cycle reaches ${dependencyId}` });
      } else {
        visit(dependencyId);
      }
    });
    visitState.set(actionId, "visited");
  };
  actions.forEach((action) => visit(action.id));
}

function stateValueMatches(type: LocalStateDefinition["type"], value: SemanticValue): boolean {
  if (type === "boolean") return typeof value === "boolean";
  if (type === "number") return typeof value === "number";
  if (type === "text" || type === "record-key") return typeof value === "string";
  return typeof value === "object"
    && value !== null
    && "kind" in value
    && value.kind === "list"
    && value.items.every((item) => typeof item === "string");
}

function validateScripts(
  scripts: ScriptPlan[],
  mockDataIds: Set<string>,
  stateIds: Set<string>,
  controlIds: Set<string>,
  ctx: z.RefinementCtx,
): void {
  scripts.forEach((script, scriptIndex) => {
    const names = new Set<string>();
    [...script.inputs, ...script.outputs].forEach((port, portIndex) => {
      if (names.has(port.name)) ctx.addIssue({ code: "custom", path: ["scripts", scriptIndex, portIndex < script.inputs.length ? "inputs" : "outputs", portIndex < script.inputs.length ? portIndex : portIndex - script.inputs.length, "name"], message: `duplicate script port: ${port.name}` });
      names.add(port.name);
      validateScriptReference(port.refKind, port.refId, ["scripts", scriptIndex, portIndex < script.inputs.length ? "inputs" : "outputs", portIndex < script.inputs.length ? portIndex : portIndex - script.inputs.length, "refId"], mockDataIds, stateIds, controlIds, ctx);
    });
    if (script.kind === "template") {
      const parameterNames = new Set<string>();
      script.parameters.forEach((parameter, parameterIndex) => {
        if (parameterNames.has(parameter.name)) ctx.addIssue({ code: "custom", path: ["scripts", scriptIndex, "parameters", parameterIndex, "name"], message: `duplicate script parameter: ${parameter.name}` });
        parameterNames.add(parameter.name);
        if (parameter.refKind !== undefined && parameter.refId !== undefined) validateScriptReference(parameter.refKind, parameter.refId, ["scripts", scriptIndex, "parameters", parameterIndex, "refId"], mockDataIds, stateIds, controlIds, ctx);
      });
    }
  });
}

function validateScriptReference(
  kind: "mock-data" | "local-state" | "control",
  id: string,
  path: Array<string | number>,
  mockDataIds: Set<string>,
  stateIds: Set<string>,
  controlIds: Set<string>,
  ctx: z.RefinementCtx,
): void {
  const known = kind === "mock-data" ? mockDataIds.has(id) : kind === "local-state" ? stateIds.has(id) : controlIds.has(id);
  if (!known) ctx.addIssue({ code: "custom", path, message: `unknown ${kind} id: ${id}` });
}
