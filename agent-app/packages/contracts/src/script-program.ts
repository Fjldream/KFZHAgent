import { z } from "zod";
import {
  ActionScalarSchema,
  CompilerInstanceNameSchema,
  CompilerActionIdSchema,
  CompilerBindingIdSchema,
  CompilerPageGuidSchema,
  CompilerScriptIdSchema,
  semanticImplementationTextIssue,
  StableSemanticIdSchema,
} from "./action-graph.js";

const semanticName = StableSemanticIdSchema;
const semanticText = z.string().trim().min(1).max(2_000)
  .refine((value) => semanticImplementationTextIssue(value, "semantic-text") === undefined, "implementation text is not allowed in script descriptions");
const shortText = z.string().trim().min(1).max(400)
  .refine((value) => semanticImplementationTextIssue(value, "semantic-text") === undefined, "implementation text is not allowed in script descriptions");
const scalar = ActionScalarSchema;

const declarativeIntent = semanticText.refine(
  (value) => semanticImplementationTextIssue(value, "semantic-text") === undefined,
  "custom-script steps must be declarative prose, not executable syntax",
);

const semanticSource = z.string().min(1).max(8_000).refine(
  (value) => semanticImplementationTextIssue(value, "semantic-js-source") === undefined,
  "SCRIPT_SOURCE_IMPLEMENTATION_LEAKAGE",
);
const compiledSource = z.string().min(1).max(32_000).refine(
  (value) => semanticImplementationTextIssue(value, "compiled-js") === undefined,
  "COMPILED_SCRIPT_FORBIDDEN_TOKEN",
);

export const ScriptPortSchema = z.object({
  name: semanticName,
  description: shortText,
  refKind: z.enum(["mock-data", "local-state", "control"]),
  refId: StableSemanticIdSchema,
}).strict();

export const ScriptParameterSchema = z.object({
  name: semanticName,
  value: scalar.optional(),
  refKind: z.enum(["mock-data", "local-state", "control"]).optional(),
  refId: StableSemanticIdSchema.optional(),
}).strict().superRefine((parameter, ctx) => {
  const literal = parameter.value !== undefined;
  const reference = parameter.refKind !== undefined || parameter.refId !== undefined;
  if (literal === reference || (parameter.refKind === undefined) !== (parameter.refId === undefined)) {
    ctx.addIssue({ code: "custom", message: "script parameter requires exactly one literal value or complete semantic reference" });
  }
});

const scriptBase = {
  id: StableSemanticIdSchema,
  purpose: semanticText,
  inputs: z.array(ScriptPortSchema).max(32),
  outputs: z.array(ScriptPortSchema).max(32),
};

const TemplateScriptPlanSchema = z.object({
  ...scriptBase,
  kind: z.literal("template"),
  template: StableSemanticIdSchema,
  parameters: z.array(ScriptParameterSchema).max(32),
}).strict();

const DeclarativeStepSchema = z.object({
  order: z.number().int().min(1).max(100),
  intent: declarativeIntent,
  inputNames: z.array(semanticName).max(32),
  outputNames: z.array(semanticName).max(32),
}).strict();

const CustomScriptPlanSchema = z.object({
  ...scriptBase,
  kind: z.literal("custom"),
  programVersion: z.enum(["declarative-steps/v1", "semantic-js/v1"]).default("declarative-steps/v1"),
  steps: z.array(DeclarativeStepSchema).min(1).max(100).optional(),
  source: semanticSource.optional(),
}).strict().superRefine((script, ctx) => {
  if (script.programVersion === "declarative-steps/v1") {
    if (script.steps === undefined) ctx.addIssue({ code: "custom", path: ["steps"], message: "SCRIPT_DECLARATIVE_STEPS_REQUIRED" });
    if (script.source !== undefined) ctx.addIssue({ code: "custom", path: ["source"], message: "SCRIPT_SOURCE_VERSION_MISMATCH" });
  } else {
    if (script.source === undefined) ctx.addIssue({ code: "custom", path: ["source"], message: "SCRIPT_SEMANTIC_SOURCE_REQUIRED" });
    if (script.steps !== undefined) ctx.addIssue({ code: "custom", path: ["steps"], message: "SCRIPT_STEPS_VERSION_MISMATCH" });
  }
  const inputNames = new Set(script.inputs.map((input) => input.name));
  const outputNames = new Set(script.outputs.map((output) => output.name));
  if (new Set([...inputNames, ...outputNames]).size !== script.inputs.length + script.outputs.length) {
    ctx.addIssue({ code: "custom", message: "SCRIPT_PORT_DUPLICATE" });
  }
  script.steps?.forEach((step, index) => {
    if (step.order !== index + 1) ctx.addIssue({ code: "custom", path: ["steps", index, "order"], message: "custom-script steps must be consecutively ordered from one" });
    if (new Set(step.inputNames).size !== step.inputNames.length) ctx.addIssue({ code: "custom", path: ["steps", index, "inputNames"], message: "SCRIPT_STEP_INPUT_DUPLICATE" });
    if (new Set(step.outputNames).size !== step.outputNames.length) ctx.addIssue({ code: "custom", path: ["steps", index, "outputNames"], message: "SCRIPT_STEP_OUTPUT_DUPLICATE" });
    step.inputNames.forEach((name, nameIndex) => {
      if (!inputNames.has(name)) ctx.addIssue({ code: "custom", path: ["steps", index, "inputNames", nameIndex], message: `unknown script input: ${name}` });
    });
    step.outputNames.forEach((name, nameIndex) => {
      if (!outputNames.has(name)) ctx.addIssue({ code: "custom", path: ["steps", index, "outputNames", nameIndex], message: `unknown script output: ${name}` });
    });
  });
});

export const ScriptPlanSchema = z.discriminatedUnion("kind", [TemplateScriptPlanSchema, CustomScriptPlanSchema]);

const kfEvent = z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9-]*$/);
const uniqueCompilerIds = (ids: string[], ctx: z.RefinementCtx, field: string): void => {
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: [field], message: `COMPILED_REFERENCE_DUPLICATE: ${field}` });
};

export const CompiledEventBindingSchema = z.object({
  id: CompilerBindingIdSchema,
  ownerInstanceName: CompilerInstanceNameSchema,
  kfEvent,
  linkId: z.number().int().min(0).max(2_147_483_647).optional(),
  phase: z.enum(["event", "after-event"]),
  scriptModuleIds: z.array(CompilerScriptIdSchema).max(16),
  nativeActionIds: z.array(CompilerActionIdSchema).max(16),
}).strict().superRefine((binding, ctx) => {
  uniqueCompilerIds(binding.scriptModuleIds, ctx, "scriptModuleIds");
  uniqueCompilerIds(binding.nativeActionIds, ctx, "nativeActionIds");
  if (binding.scriptModuleIds.length + binding.nativeActionIds.length === 0) ctx.addIssue({ code: "custom", message: "COMPILED_BINDING_EFFECT_REQUIRED" });
});

const InstanceReferenceSchema = z.object({
  semanticId: StableSemanticIdSchema,
  instanceName: CompilerInstanceNameSchema,
}).strict();

const PageReferenceSchema = z.object({
  semanticId: StableSemanticIdSchema,
  pageGuid: CompilerPageGuidSchema,
}).strict();

const hash = z.string().regex(/^[0-9a-f]{64}$/);

export const CompiledScriptModuleSchema = z.object({
  id: CompilerScriptIdSchema,
  sourceScriptId: StableSemanticIdSchema,
  placement: z.enum(["event", "configure-data"]),
  ownerInstanceName: CompilerInstanceNameSchema,
  instanceReferences: z.array(InstanceReferenceSchema).max(128),
  pageReferences: z.array(PageReferenceSchema).max(32),
  source: compiledSource,
  sourceHash: hash,
}).strict().superRefine((module, ctx) => {
  if (new Set(module.instanceReferences.map((reference) => reference.semanticId)).size !== module.instanceReferences.length) ctx.addIssue({ code: "custom", path: ["instanceReferences"], message: "COMPILED_INSTANCE_REFERENCE_DUPLICATE" });
  if (new Set(module.pageReferences.map((reference) => reference.semanticId)).size !== module.pageReferences.length) ctx.addIssue({ code: "custom", path: ["pageReferences"], message: "COMPILED_PAGE_REFERENCE_DUPLICATE" });
  if (!module.instanceReferences.some((reference) => reference.instanceName === module.ownerInstanceName)) ctx.addIssue({ code: "custom", path: ["ownerInstanceName"], message: "COMPILED_SCRIPT_OWNER_UNDECLARED" });
});

export type ScriptPlan = z.infer<typeof ScriptPlanSchema>;
export type CompiledEventBinding = z.infer<typeof CompiledEventBindingSchema>;
export type CompiledScriptModule = z.infer<typeof CompiledScriptModuleSchema>;
