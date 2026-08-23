import { z } from "zod";
import { projectKeySchema } from "./solution.js";
import {
  ActionPlanSchema,
  semanticImplementationTextIssue,
  SemanticEventBindingSchema,
  type ActionPlan,
  type SemanticEventBinding,
} from "./action-graph.js";
import { ScriptPlanSchema, type ScriptPlan } from "./script-program.js";
export { ActionPlanSchema, JourneyStepReferenceSchema, SemanticEventBindingSchema, ValueExpressionSchema } from "./action-graph.js";
export type { ActionPlan, JourneyStepReference, SemanticEventBinding } from "./action-graph.js";
export { ScriptPlanSchema } from "./script-program.js";
export type { ScriptPlan } from "./script-program.js";
import {
  isImplementationOwnedFieldName as isForbiddenSemanticName,
  NativeThemeSpecSchema,
  normalizeImplementationOwnedFieldName as normalizeName,
  StyleDeclarationSchema,
  StyleDeclarationV2Schema,
  StyleStatesV2Schema,
  ThemeSpecSchema,
} from "./ui-style.js";

const canonicalUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const canonicalUuidToken = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const forbiddenImplementationPropertyNames = new Set([
  "animation",
  "background",
  "backgroundcolor",
  "backgroundimage",
  "border",
  "bordercolor",
  "borderradius",
  "borderstyle",
  "borderwidth",
  "bounds",
  "bottom",
  "boxshadow",
  "display",
  "color",
  "coordinate",
  "flex",
  "flexbasis",
  "flexdirection",
  "flexgrow",
  "flexshrink",
  "flexwrap",
  "font",
  "fontfamily",
  "fontsize",
  "fontstyle",
  "fontweight",
  "gap",
  "grid",
  "gridarea",
  "gridcolumn",
  "gridrow",
  "gridtemplatecolumns",
  "gridtemplaterows",
  "height",
  "left",
  "lineheight",
  "margin",
  "marginbottom",
  "marginleft",
  "marginright",
  "margintop",
  "opacity",
  "padding",
  "paddingbottom",
  "paddingleft",
  "paddingright",
  "paddingtop",
  "position",
  "rect",
  "right",
  "top",
  "textalign",
  "textcolor",
  "transform",
  "transformorigin",
  "transition",
  "transitionduration",
  "width",
  "xpos",
  "ypos",
  "zindex",
]);

function isForbiddenImplementationPropertyName(value: string): boolean {
  return isForbiddenSemanticName(value)
    || forbiddenImplementationPropertyNames.has(normalizeName(value));
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

const semanticPropertyNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine(
    (value) => !isForbiddenImplementationPropertyName(value),
    "implementation property names are not allowed",
  );

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
const hashSchema = z.string().regex(/^[0-9a-f]{64}$/);
export const LEGACY_MODULE_PLAN_CANDIDATE_BUNDLE_HASH = "3e147b2b8351b526f10dd9dfc47c4c93bbfc29814d791400e3e5b02c38220840";

/** Exact source-contract shapes admitted only by the legacy compatibility branch. */
const legacyStableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine((value) => !canonicalUuid.test(value), "GUID-shaped identifiers are not allowed");
const legacyProvenanceIdSchema = z.string().trim().min(1).max(100);
const legacyModuleTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .refine((value) => !/<script\b|javascript\s*:|data\s*:\s*text\s*\/\s*html/i.test(value));

export const SemanticScalarSchema = z.union([
  z.string().trim().max(2_000),
  z.number().finite().min(-1_000_000_000).max(1_000_000_000),
  z.boolean(),
  z.null(),
]);

export const RepeaterFieldReferenceSchema = z.object({
  kind: z.literal("repeater-field"),
  itemAlias: semanticNameSchema,
  field: semanticNameSchema,
}).strict();

export type SemanticScalar = z.infer<typeof SemanticScalarSchema>;
export type RepeaterFieldReference = z.infer<typeof RepeaterFieldReferenceSchema>;
export type SemanticValue =
  | SemanticScalar
  | { kind: "list"; items: SemanticValue[] }
  | { kind: "record"; fields: Array<{ name: string; value: SemanticValue }> }
  | RepeaterFieldReference;

type LegacySemanticValue =
  | SemanticScalar
  | { kind: "list"; items: LegacySemanticValue[] }
  | { kind: "record"; fields: Array<{ name: string; value: LegacySemanticValue }> };

const LegacySemanticValueShapeSchema: z.ZodType<LegacySemanticValue> = z.lazy(() =>
  z.union([
    SemanticScalarSchema,
    z.object({ kind: z.literal("list"), items: z.array(LegacySemanticValueShapeSchema).max(32) }).strict(),
    z
      .object({
        kind: z.literal("record"),
        fields: z.array(z.object({ name: semanticPropertyNameSchema, value: LegacySemanticValueShapeSchema }).strict()).max(32),
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

const SemanticValueShapeSchema: z.ZodType<SemanticValue> = z.lazy(() =>
  z.union([
    SemanticScalarSchema,
    z.object({ kind: z.literal("list"), items: z.array(SemanticValueShapeSchema).max(32) }).strict(),
    z
      .object({
        kind: z.literal("record"),
        fields: z.array(z.object({ name: semanticPropertyNameSchema, value: SemanticValueShapeSchema }).strict()).max(32),
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
    RepeaterFieldReferenceSchema,
  ]),
);

/** A standalone semantic value includes the same safety/depth checks as a native-v3 plan. */
export const SemanticValueSchema: z.ZodType<SemanticValue> = SemanticValueShapeSchema.superRefine((value, ctx) => {
  validateImplementationFree(value, ctx);
  validateSemanticValueDepth(value, ctx, [], 0);
});

const LegacySemanticValueSchema: z.ZodType<LegacySemanticValue> = LegacySemanticValueShapeSchema.superRefine((value, ctx) => {
  validateImplementationFree(value, ctx);
  validateSemanticValueDepth(value, ctx, [], 0);
});

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
  eventBindings: SemanticEventBinding[];
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
  eventBindings: SemanticEventBinding[];
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

const StyleOverrideSchema = z
  .object({
    declarations: StyleDeclarationV2Schema.default({}),
    states: StyleStatesV2Schema.default({}),
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
    eventBindings: z.array(SemanticEventBindingSchema).max(16),
    /** Task 4 validates these syntactic slot ids against the selected registry module declaration. */
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

const SemanticPropertySchema = z.object({ name: semanticPropertyNameSchema, value: SemanticValueSchema }).strict();

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
    eventBindings: z.array(SemanticEventBindingSchema).max(16),
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

const legacyNodeCommonShape = {
  id: legacyStableIdSchema,
  sourceBlueprintRegionIds: z.array(legacyProvenanceIdSchema).min(1).max(12),
  intent: NodeIntentSchema,
};

const LegacySolutionNodeSchema: z.ZodType<LayoutNode | RegisteredModuleNode> = z.lazy(() =>
  z.discriminatedUnion("kind", [
    z
      .object({
        ...legacyNodeCommonShape,
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
        children: z.array(z.lazy(() => LegacySolutionNodeSchema)).min(1).max(24),
      })
      .strict(),
    z
      .object({
        ...legacyNodeCommonShape,
        kind: z.literal("registered-module"),
        moduleKind: moduleKindSchema,
        templateVersion: templateVersionSchema,
        variant: legacyStableIdSchema,
        title: legacyModuleTextSchema,
        content: z.union([LegacySemanticValueSchema, legacyModuleTextSchema]).optional(),
        assetId: legacyStableIdSchema.optional(),
        eventBindings: z.array(SemanticEventBindingSchema).max(16),
        slots: z
          .array(
            z
              .object({
                slotId: legacyStableIdSchema,
                children: z.array(z.lazy(() => LegacySolutionNodeSchema)).min(1).max(24),
              })
              .strict(),
          )
          .max(0),
      })
      .strict(),
  ]),
);

export const RoleStyleIntentSchema = z
  .object({
    role: stableIdSchema,
    declarations: StyleDeclarationV2Schema.default({}),
    states: StyleStatesV2Schema.default({}),
  })
  .strict();

const LegacyStyleStatesSchema = z.object({
  hover: StyleDeclarationSchema.optional(),
  active: StyleDeclarationSchema.optional(),
  focus: StyleDeclarationSchema.optional(),
  disabled: StyleDeclarationSchema.optional(),
  selected: StyleDeclarationSchema.optional(),
  error: StyleDeclarationSchema.optional(),
}).strict();

const LegacyRoleStyleIntentSchema = z.object({
  role: stableIdSchema,
  declarations: StyleDeclarationSchema.default({}),
  states: LegacyStyleStatesSchema.default({}),
}).strict();

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
    keyField: semanticNameSchema.optional(),
  })
  .strict()
  .superRefine((state, ctx) => {
    const valid =
      (state.type === "boolean" && typeof state.initialValue === "boolean")
      || (state.type === "number" && typeof state.initialValue === "number")
      || (state.type === "text" && typeof state.initialValue === "string")
      || (state.type === "record-key" && (typeof state.initialValue === "string" || state.initialValue === null))
      || (state.type === "record-key-list" && Array.isArray(state.initialValue));
    if (!valid) ctx.addIssue({ code: "custom", path: ["initialValue"], message: `initial value does not match ${state.type}` });
    const isRecordState = state.type === "record-key" || state.type === "record-key-list";
    if (isRecordState !== (state.mockDataId !== undefined && state.keyField !== undefined)) {
      ctx.addIssue({ code: "custom", message: "record-key state requires exactly one mock-data reference and key field" });
    }
    if (!isRecordState && (state.mockDataId !== undefined || state.keyField !== undefined)) {
      ctx.addIssue({ code: "custom", message: "scalar state cannot declare record-key metadata" });
    }
    if (state.type === "record-key-list" && Array.isArray(state.initialValue) && new Set(state.initialValue).size !== state.initialValue.length) {
      ctx.addIssue({ code: "custom", path: ["initialValue"], message: "record-key-list initial values must be unique" });
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

const LegacySolutionPageSchema = z
  .object({
    id: legacyStableIdSchema,
    title: legacyModuleTextSchema,
    purpose: legacyModuleTextSchema,
    canvas: z.literal("responsive"),
    sourceBlueprintPageId: legacyProvenanceIdSchema,
    sourceBlueprintRegionIds: z.array(legacyProvenanceIdSchema).min(1).max(600),
    initialStateIds: z.array(legacyStableIdSchema).max(0),
    root: LegacySolutionNodeSchema,
  })
  .strict();

const LegacyNavigateActionSchema = z
  .object({
    id: legacyStableIdSchema,
    kind: z.literal("navigate-page"),
    targetPageId: legacyStableIdSchema,
    afterActionIds: z.array(legacyStableIdSchema).max(16).default([]),
  })
  .strict();

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

const NativeSolutionImplementationPlanObjectSchema = SolutionImplementationPlanObjectSchema.extend({
  theme: NativeThemeSpecSchema,
  candidateBundleHash: hashSchema.refine(
    (value) => value !== LEGACY_MODULE_PLAN_CANDIDATE_BUNDLE_HASH,
    "legacy compatibility discriminator is reserved for adapted ModulePlan snapshots",
  ),
});

const LegacySolutionImplementationPlanObjectSchema = SolutionImplementationPlanObjectSchema.extend({
  candidateBundleHash: z.literal(LEGACY_MODULE_PLAN_CANDIDATE_BUNDLE_HASH),
  roleStyles: z.array(LegacyRoleStyleIntentSchema).max(0),
  mockData: z.array(MockDataSetSchema).max(0),
  localState: z.array(LocalStateDefinitionSchema).max(0),
  pages: z.array(LegacySolutionPageSchema).min(1).max(5),
  overlays: z.array(OverlayPlanSchema).max(0),
  actions: z.array(LegacyNavigateActionSchema).max(3_000),
  scripts: z.array(ScriptPlanSchema).max(0),
});

export type RoleStyleIntent = z.infer<typeof RoleStyleIntentSchema>;
export type MockDataSet = z.infer<typeof MockDataSetSchema>;
export type LocalStateDefinition = z.infer<typeof LocalStateDefinitionSchema>;
export type SolutionPage = z.infer<typeof SolutionPageSchema>;
export type OverlayPlan = z.infer<typeof OverlayPlanSchema>;
export type ThemeIntent = z.infer<typeof ThemeSpecSchema>;
export type SolutionImplementationPlan = z.infer<typeof SolutionImplementationPlanObjectSchema>;

const NativeSolutionImplementationPlanSchema =
  NativeSolutionImplementationPlanObjectSchema.superRefine((plan, ctx) => {
    plan.actions.forEach((action, actionIndex) => {
      if (action.journeyStepRefs === undefined) {
        ctx.addIssue({ code: "custom", path: ["actions", actionIndex, "journeyStepRefs"], message: "native actions require confirmed journey step references" });
      }
    });
    validateImplementationFree(plan, ctx);
    validateSemanticValueContainers(plan, ctx);
    validateRepeaterFieldReferenceScopes(plan, ctx);
    validatePlanReferences(plan, ctx);
  });

const LegacySolutionImplementationPlanSchema =
  LegacySolutionImplementationPlanObjectSchema.superRefine((plan, ctx) => {
    validateSemanticValueContainers(plan, ctx);
    validatePlanReferences(plan, ctx);
  });

export const SolutionImplementationPlanSchema: z.ZodType<SolutionImplementationPlan> = z.union([
  NativeSolutionImplementationPlanSchema,
  LegacySolutionImplementationPlanSchema,
]);

function implementationTextIssue(value: string, path: Array<string | number>): string | undefined {
  const structuralIdentifier = path.at(-1) === "moduleKind" || path.at(-1) === "capabilityId";
  return semanticImplementationTextIssue(value, "semantic-text", { structuralIdentifier, strictSelectors: true });
}

function validateImplementationFree(value: unknown, ctx: z.RefinementCtx, path: Array<string | number> = []): void {
  if (typeof value === "string") {
    const semanticSource = path.length === 3 && path[0] === "scripts" && typeof path[1] === "number" && path[2] === "source";
    const issue = semanticSource
      ? semanticImplementationTextIssue(value, "semantic-js-source")
      : implementationTextIssue(value, path);
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

function validateSemanticValueDepth(value: SemanticValue | LegacySemanticValue, ctx: z.RefinementCtx, path: Array<string | number>, depth: number): void {
  if (depth > 8) {
    ctx.addIssue({ code: "custom", path, message: "semantic value nesting exceeds eight levels" });
    return;
  }
  if (typeof value !== "object" || value === null) return;
  if (value.kind === "list") {
    value.items.forEach((item, index) => validateSemanticValueDepth(item, ctx, [...path, "items", index], depth + 1));
  } else if (value.kind === "record") {
    value.fields.forEach((field, index) => validateSemanticValueDepth(field.value, ctx, [...path, "fields", index, "value"], depth + 1));
  }
}

function validateRepeaterFieldReferenceScopes(
  plan: SolutionImplementationPlan,
  ctx: z.RefinementCtx,
): void {
  const dataSets = new Map(plan.mockData.map((dataSet) => [dataSet.id, dataSet]));
  const validateValue = (
    value: SemanticValue,
    scopes: ReadonlyMap<string, MockDataSet>,
    path: Array<string | number>,
  ): void => {
    if (typeof value !== "object" || value === null) return;
    if (value.kind === "repeater-field") {
      const dataSet = scopes.get(value.itemAlias);
      if (dataSet === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "itemAlias"],
          message: `repeater-field alias is not in scope: ${value.itemAlias}`,
        });
      } else if (!dataSet.fields.some((field) => field.key === value.field)) {
        ctx.addIssue({
          code: "custom",
          path: [...path, "field"],
          message: `unknown repeater-field field for ${value.itemAlias}: ${value.field}`,
        });
      }
      return;
    }
    if (value.kind === "list") {
      value.items.forEach((item, index) => validateValue(item, scopes, [...path, "items", index]));
      return;
    }
    value.fields.forEach((field, index) => validateValue(field.value, scopes, [...path, "fields", index, "value"]));
  };
  const visitNode = (
    node: SolutionNode,
    scopes: ReadonlyMap<string, MockDataSet>,
    path: Array<string | number>,
  ): void => {
    if (node.kind === "control") {
      validateValue(node.content, scopes, [...path, "content"]);
      node.properties.forEach((property, index) => validateValue(property.value, scopes, [...path, "properties", index, "value"]));
      return;
    }
    if (node.kind === "registered-module") {
      if (node.content !== undefined) validateValue(node.content, scopes, [...path, "content"]);
      node.slots.forEach((slot, slotIndex) => slot.children.forEach((child, childIndex) =>
        visitNode(child, scopes, [...path, "slots", slotIndex, "children", childIndex])));
      return;
    }
    if (node.kind === "layout") {
      node.children.forEach((child, index) => visitNode(child, scopes, [...path, "children", index]));
      return;
    }
    const nestedScopes = new Map(scopes);
    const dataSet = dataSets.get(node.mockDataId);
    if (dataSet !== undefined) nestedScopes.set(node.itemAlias, dataSet);
    visitNode(node.template, nestedScopes, [...path, "template"]);
  };

  plan.pages.forEach((page, pageIndex) => visitNode(page.root, new Map(), ["pages", pageIndex, "root"]));
  plan.overlays.forEach((overlay, overlayIndex) => visitNode(overlay.root, new Map(), ["overlays", overlayIndex, "root"]));
  plan.actions.forEach((action, actionIndex) => {
    if (action.kind === "set-state") validateValue(action.value, new Map(), ["actions", actionIndex, "value"]);
    if (action.kind === "set-control-value" && action.value.kind === "literal") {
      validateValue(action.value.value, new Map(), ["actions", actionIndex, "value", "value"]);
    }
  });
}

function validatePlanReferences(plan: SolutionImplementationPlan, ctx: z.RefinementCtx): void {
  const legacyCompatibility = plan.candidateBundleHash === LEGACY_MODULE_PLAN_CANDIDATE_BUNDLE_HASH;
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
  const boundActionIds = new Set<string>();
  const triggerOwnersByActionId = new Map<string, Set<string>>();
  const dataSets = new Map(plan.mockData.map((dataSet) => [dataSet.id, dataSet]));
  const statesById = new Map(plan.localState.map((state) => [state.id, state]));
  const pagesById = new Map(plan.pages.map((page) => [page.id, page]));
  const nodeEntries: Array<{ node: SolutionNode; path: Array<string | number>; page: SolutionPage; depth: number }> = [];

  const registerId = (id: string, path: Array<string | number>): void => {
    if (allIds.has(id)) ctx.addIssue({ code: "custom", path, message: `duplicate global stable id: ${id}` });
    allIds.add(id);
  };
  const registerPageId = (id: string, path: Array<string | number>): void => {
    if (!legacyCompatibility) {
      registerId(id, path);
      return;
    }
    if (pageIds.has(id) || (allIds.has(id) && !nodeIds.has(id))) {
      ctx.addIssue({ code: "custom", path, message: `duplicate global stable id: ${id}` });
    }
    allIds.add(id);
  };
  const registerNodeId = (id: string, path: Array<string | number>): void => {
    if (!legacyCompatibility) {
      registerId(id, path);
      return;
    }
    if (nodeIds.has(id) || (allIds.has(id) && !pageIds.has(id))) {
      ctx.addIssue({ code: "custom", path, message: `duplicate global stable id: ${id}` });
    }
    allIds.add(id);
  };

  plan.roleStyles.forEach((style, index) => {
    if (roleIds.has(style.role)) ctx.addIssue({ code: "custom", path: ["roleStyles", index, "role"], message: `duplicate style role: ${style.role}` });
    roleIds.add(style.role);
    if (!legacyCompatibility) registerId(style.role, ["roleStyles", index, "role"]);
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
    validateRecordKeyState(state, index, dataSets, ctx);
  });

  const regionOwners = new Map<string, string>();
  plan.pages.forEach((page, pageIndex) => {
    registerPageId(page.id, ["pages", pageIndex, "id"]);
    pageIds.add(page.id);
    if (pageSourceIds.has(page.sourceBlueprintPageId)) {
      ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "sourceBlueprintPageId"], message: `duplicate blueprint page provenance: ${page.sourceBlueprintPageId}` });
    }
    pageSourceIds.add(page.sourceBlueprintPageId);
    page.sourceBlueprintRegionIds.forEach((regionId, regionIndex) => {
      const ownershipKey = `${page.sourceBlueprintPageId}\u0000${regionId}`;
      const owner = regionOwners.get(ownershipKey);
      if (owner !== undefined) {
        ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "sourceBlueprintRegionIds", regionIndex], message: `blueprint region already belongs to ${owner}: ${regionId}` });
      }
      regionOwners.set(ownershipKey, page.sourceBlueprintPageId);
    });
    page.initialStateIds.forEach((stateId, stateIndex) => {
      if (!stateIds.has(stateId)) ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "initialStateIds", stateIndex], message: `unknown state id: ${stateId}` });
    });
    collectNode(page.root, ["pages", pageIndex, "root"], page, 0, nodeEntries, registerNodeId, nodeIds, controlIds, ctx);
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
    collectNode(overlay.root, ["overlays", overlayIndex, "root"], hostPage, 0, nodeEntries, registerNodeId, nodeIds, controlIds, ctx);
  });

  plan.actions.forEach((action, index) => {
    registerId(action.id, ["actions", index, "id"]);
    actionIds.add(action.id);
  });
  plan.scripts.forEach((script, index) => {
    registerId(script.id, ["scripts", index, "id"]);
    scriptIds.add(script.id);
  });

  validateNodeReferences(nodeEntries, roleIds, mockDataIds, dataSets, actionIds, boundActionIds, triggerOwnersByActionId, nodeIds, ctx);
  const controlsById = new Map(
    nodeEntries
      .filter((entry): entry is typeof entry & { node: ControlNode } => entry.node.kind === "control")
      .map((entry) => [entry.node.id, entry.node]),
  );
  validateActions(plan.actions, pageIds, overlayIds, statesById, dataSets, nodeIds, controlsById, mockDataIds, actionIds, boundActionIds, triggerOwnersByActionId, scriptIds, ctx);
  validateScripts(plan.scripts, mockDataIds, stateIds, controlIds, ctx);
  const executableScriptIds = new Set(plan.actions.flatMap((action) => action.kind === "run-script" ? [action.scriptId] : []));
  plan.scripts.forEach((script, scriptIndex) => {
    if ((script.kind === "template" || script.programVersion === "semantic-js/v1") && !executableScriptIds.has(script.id)) {
      ctx.addIssue({ code: "custom", path: ["scripts", scriptIndex, "id"], message: `SCRIPT_ORPHANED: ${script.id}` });
    }
  });
}

function recordKeyDomain(
  state: LocalStateDefinition,
  statePath: Array<string | number>,
  dataSets: Map<string, MockDataSet>,
  ctx: z.RefinementCtx,
): Set<string> | undefined {
  if ((state.type !== "record-key" && state.type !== "record-key-list") || state.mockDataId === undefined || state.keyField === undefined) {
    return undefined;
  }
  const dataSet = dataSets.get(state.mockDataId);
  if (dataSet === undefined) return undefined;
  const field = dataSet.fields.find((candidate) => candidate.key === state.keyField);
  if (field === undefined) {
    ctx.addIssue({ code: "custom", path: [...statePath, "keyField"], message: `unknown record-key field: ${state.keyField}` });
    return undefined;
  }
  if (field.type !== "text") {
    ctx.addIssue({ code: "custom", path: [...statePath, "keyField"], message: "record-key field must be text" });
    return undefined;
  }
  const keys = new Set<string>();
  dataSet.records.forEach((record, recordIndex) => {
    const key = record.values.find((entry) => entry.field === state.keyField)?.value;
    if (typeof key !== "string" || !stableIdSchema.safeParse(key).success) {
      ctx.addIssue({ code: "custom", path: [...statePath, "keyField"], message: `record ${recordIndex} does not contain a stable record key` });
      return;
    }
    if (keys.has(key)) {
      ctx.addIssue({ code: "custom", path: [...statePath, "keyField"], message: `duplicate record key: ${key}` });
    }
    keys.add(key);
  });
  return keys;
}

function validateRecordKeyState(
  state: LocalStateDefinition,
  stateIndex: number,
  dataSets: Map<string, MockDataSet>,
  ctx: z.RefinementCtx,
): void {
  const path: Array<string | number> = ["localState", stateIndex];
  const keys = recordKeyDomain(state, path, dataSets, ctx);
  if (keys === undefined) return;
  if (state.type === "record-key" && typeof state.initialValue === "string" && !keys.has(state.initialValue)) {
    ctx.addIssue({ code: "custom", path: [...path, "initialValue"], message: `unknown initial record key: ${state.initialValue}` });
  }
  if (state.type === "record-key-list" && Array.isArray(state.initialValue)) {
    state.initialValue.forEach((key, index) => {
      if (!keys.has(key)) ctx.addIssue({ code: "custom", path: [...path, "initialValue", index], message: `unknown initial record key: ${key}` });
    });
  }
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
  boundActionIds: Set<string>,
  triggerOwnersByActionId: Map<string, Set<string>>,
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
      validateEventBindings(node.id, node.eventBindings, [...path, "eventBindings"], actionIds, boundActionIds, triggerOwnersByActionId, ctx);
      const propertyNames = new Set<string>();
      node.properties.forEach((property, index) => {
        if (propertyNames.has(property.name)) ctx.addIssue({ code: "custom", path: [...path, "properties", index, "name"], message: `duplicate control property: ${property.name}` });
        propertyNames.add(property.name);
      });
      if (new Set(node.tabIds).size !== node.tabIds.length) ctx.addIssue({ code: "custom", path: [...path, "tabIds"], message: "control tab ids must be unique" });
    }
    if (node.kind === "registered-module") {
      validateEventBindings(node.id, node.eventBindings, [...path, "eventBindings"], actionIds, boundActionIds, triggerOwnersByActionId, ctx);
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

function validateEventBindings(
  ownerId: string,
  bindings: SemanticEventBinding[],
  path: Array<string | number>,
  actionIds: Set<string>,
  boundActionIds: Set<string>,
  triggerOwnersByActionId: Map<string, Set<string>>,
  ctx: z.RefinementCtx,
): void {
  const events = new Set<string>();
  bindings.forEach((binding, bindingIndex) => {
    if (events.has(binding.semanticEvent)) {
      ctx.addIssue({ code: "custom", path: [...path, bindingIndex, "semanticEvent"], message: `duplicate semantic event binding: ${binding.semanticEvent}` });
    }
    events.add(binding.semanticEvent);
    const actions = new Set<string>();
    binding.actionIds.forEach((actionId, actionIndex) => {
      if (actions.has(actionId)) {
        ctx.addIssue({ code: "custom", path: [...path, bindingIndex, "actionIds", actionIndex], message: `duplicate bound action id: ${actionId}` });
      }
      actions.add(actionId);
      if (!actionIds.has(actionId)) {
        ctx.addIssue({ code: "custom", path: [...path, bindingIndex, "actionIds", actionIndex], message: `unknown action id: ${actionId}` });
      } else {
        boundActionIds.add(actionId);
        const owners = triggerOwnersByActionId.get(actionId) ?? new Set<string>();
        owners.add(`${ownerId}\u0000${binding.semanticEvent}`);
        triggerOwnersByActionId.set(actionId, owners);
      }
    });
  });
}

function validateActions(
  actions: ActionPlan[],
  pageIds: Set<string>,
  overlayIds: Set<string>,
  statesById: Map<string, LocalStateDefinition>,
  dataSets: Map<string, MockDataSet>,
  nodeIds: Set<string>,
  controlsById: Map<string, ControlNode>,
  mockDataIds: Set<string>,
  actionIds: Set<string>,
  boundActionIds: Set<string>,
  triggerOwnersByActionId: Map<string, Set<string>>,
  scriptIds: Set<string>,
  ctx: z.RefinementCtx,
): void {
  actions.forEach((action, index) => {
    action.conditions?.forEach((condition, conditionIndex) => {
      [condition.left, condition.right].forEach((operand, operandIndex) => {
        const operandPath = ["actions", index, "conditions", conditionIndex, operandIndex === 0 ? "left" : "right"];
        if (operand.kind === "local-state" && !statesById.has(operand.stateId)) ctx.addIssue({ code: "custom", path: operandPath, message: `unknown state id: ${operand.stateId}` });
        if (operand.kind === "control-value" && !controlsById.has(operand.controlId)) ctx.addIssue({ code: "custom", path: operandPath, message: `unknown control id: ${operand.controlId}` });
      });
    });
    const chainedActionIds = new Set<string>();
    action.afterActionIds.forEach((actionId, refIndex) => {
      if (chainedActionIds.has(actionId)) {
        ctx.addIssue({ code: "custom", path: ["actions", index, "afterActionIds", refIndex], message: `duplicate chained action id: ${actionId}` });
      }
      chainedActionIds.add(actionId);
      if (!actionIds.has(actionId)) ctx.addIssue({ code: "custom", path: ["actions", index, "afterActionIds", refIndex], message: `unknown action id: ${actionId}` });
      if (actionId === action.id) ctx.addIssue({ code: "custom", path: ["actions", index, "afterActionIds", refIndex], message: "an action cannot follow itself" });
    });
    if (action.kind === "navigate-page" && !pageIds.has(action.targetPageId)) ctx.addIssue({ code: "custom", path: ["actions", index, "targetPageId"], message: `unknown page id: ${action.targetPageId}` });
    if ((action.kind === "open-overlay" || action.kind === "close-overlay") && !overlayIds.has(action.overlayId)) ctx.addIssue({ code: "custom", path: ["actions", index, "overlayId"], message: `unknown overlay id: ${action.overlayId}` });
    if (action.kind === "set-state") {
      const state = statesById.get(action.stateId);
      if (state === undefined) ctx.addIssue({ code: "custom", path: ["actions", index, "stateId"], message: `unknown state id: ${action.stateId}` });
      else validateStateActionValue(state, action.value, dataSets, ["actions", index, "value"], ctx);
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

  const reachableActionIds = new Set<string>();
  const markReachable = (actionId: string): void => {
    if (reachableActionIds.has(actionId)) return;
    const entry = actionsById.get(actionId);
    if (entry === undefined) return;
    reachableActionIds.add(actionId);
    entry.action.afterActionIds.forEach(markReachable);
  };
  boundActionIds.forEach(markReachable);
  const ownershipByActionId = new Map<string, Set<string>>();
  const ownershipPending = Array.from(triggerOwnersByActionId, ([actionId, owners]) => ({ actionId, owners: Array.from(owners) }));
  while (ownershipPending.length > 0) {
    const current = ownershipPending.pop()!;
    const owners = ownershipByActionId.get(current.actionId) ?? new Set<string>();
    const before = owners.size;
    current.owners.forEach((owner) => owners.add(owner));
    ownershipByActionId.set(current.actionId, owners);
    if (owners.size === before) continue;
    actionsById.get(current.actionId)?.action.afterActionIds.forEach((dependencyId) => {
      ownershipPending.push({ actionId: dependencyId, owners: Array.from(owners) });
    });
  }
  actions.forEach((action, index) => {
    if (!reachableActionIds.has(action.id)) {
      ctx.addIssue({ code: "custom", path: ["actions", index, "id"], message: `action is unreachable from any semantic event binding: ${action.id}` });
    }
    if ((ownershipByActionId.get(action.id)?.size ?? 0) > 1) {
      ctx.addIssue({ code: "custom", path: ["actions", index, "id"], message: `ACTION_TRIGGER_OWNERSHIP_MISMATCH: ${action.id}` });
    }
  });
}

function validateStateActionValue(
  state: LocalStateDefinition,
  value: SemanticValue,
  dataSets: Map<string, MockDataSet>,
  path: Array<string | number>,
  ctx: z.RefinementCtx,
): void {
  if (state.type === "boolean" && typeof value === "boolean") return;
  if (state.type === "number" && typeof value === "number") return;
  if (state.type === "text" && typeof value === "string") return;
  const keys = recordKeyDomain(state, path, dataSets, ctx);
  if (state.type === "record-key" && (value === null || (typeof value === "string" && keys?.has(value)))) return;
  if (state.type === "record-key-list" && typeof value === "object" && value !== null && "kind" in value && value.kind === "list") {
    const items = value.items;
    if (items.every((item) => typeof item === "string") && new Set(items).size === items.length && items.every((item) => keys?.has(item))) return;
  }
  ctx.addIssue({ code: "custom", path, message: `state value does not match ${state.type} domain` });
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
