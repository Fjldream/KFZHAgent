import {
  ScriptPlanSchema,
  StableSemanticIdSchema,
  type ScriptPlan,
} from "@kf/contracts";
import { types as utilTypes } from "node:util";
import { z } from "zod";

export type ScriptTemplateId =
  | "form-validate-submit"
  | "master-detail-fill"
  | "multi-filter"
  | "record-mutate"
  | "reset-controls";

export interface ScriptTemplateDescriptor {
  readonly id: ScriptTemplateId;
  readonly semanticCalls: readonly string[];
  readonly availability: "supported" | "planned";
  readonly diagnostic?: string;
  readonly operations?: readonly ["append", "update", "remove"];
}

type TemplatePlan = Extract<ScriptPlan, { kind: "template" }>;
type ScriptPort = TemplatePlan["inputs"][number];
type ScriptParameter = TemplatePlan["parameters"][number];
type DataValue = null | boolean | number | string | DataValue[] | { [key: string]: DataValue };

const scalar = z.union([z.string(), z.number().finite(), z.boolean(), z.null()]);
const fieldName = StableSemanticIdSchema;
const feedbackMessage = z.string().trim().min(1).max(400);
const matchMode = z.enum(["equals", "not-equals", "contains", "starts-with", "gte", "lte"]);
const recordFields = z.array(z.object({ field: fieldName, controlId: StableSemanticIdSchema }).strict())
  .min(1)
  .max(8)
  .superRefine((fields, ctx) => {
    const names = new Set<string>();
    fields.forEach((field, index) => {
      const normalized = normalizedFieldName(field.field);
      if (names.has(normalized)) ctx.addIssue({ code: "custom", path: [index, "field"], message: "record field aliases must be unique" });
      names.add(normalized);
    });
  });

const MultiFilterParametersSchema = z.object({
  combine: z.enum(["all", "any"]),
  recordsId: StableSemanticIdSchema,
  viewId: StableSemanticIdSchema,
  criteria: z.array(z.object({
    field: fieldName,
    mode: matchMode,
    valueControlId: StableSemanticIdSchema,
  }).strict()).min(1).max(8),
}).strict();

const MasterDetailParametersSchema = z.object({
  missingMessage: feedbackMessage,
  mappings: z.array(z.object({
    field: fieldName,
    targetControlId: StableSemanticIdSchema,
  }).strict()).min(1).max(12),
}).strict();

const FormValidateParametersSchema = z.object({
  submittedStateId: StableSemanticIdSchema,
  successMessage: feedbackMessage,
  fields: z.array(z.object({
    controlId: StableSemanticIdSchema,
    required: z.boolean(),
    message: feedbackMessage.optional(),
  }).strict().superRefine((entry, ctx) => {
    if (entry.required !== (entry.message !== undefined)) {
      ctx.addIssue({ code: "custom", message: "required fields require exactly one validation message" });
    }
  })).min(1).max(8),
}).strict();

const RecordMutateParametersSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("append"),
    recordsId: StableSemanticIdSchema,
    updatedId: StableSemanticIdSchema,
    viewId: StableSemanticIdSchema.optional(),
    successMessage: feedbackMessage,
    keyField: fieldName,
    keySource: z.object({ kind: z.enum(["control", "local-state"]), id: StableSemanticIdSchema }).strict(),
    fields: recordFields,
  }).strict().superRefine(rejectKeyFieldOverwrite),
  z.object({
    operation: z.literal("update"),
    recordsId: StableSemanticIdSchema,
    updatedId: StableSemanticIdSchema,
    viewId: StableSemanticIdSchema.optional(),
    successMessage: feedbackMessage,
    keyField: fieldName,
    keySource: z.object({ kind: z.enum(["control", "local-state"]), id: StableSemanticIdSchema }).strict(),
    fields: recordFields,
  }).strict().superRefine(rejectKeyFieldOverwrite),
  z.object({
    operation: z.literal("remove"),
    recordsId: StableSemanticIdSchema,
    updatedId: StableSemanticIdSchema,
    viewId: StableSemanticIdSchema.optional(),
    successMessage: feedbackMessage,
    keyField: fieldName,
    keySource: z.object({ kind: z.enum(["control", "local-state"]), id: StableSemanticIdSchema }).strict(),
    fields: z.array(z.never()).max(0),
  }).strict(),
]);

const ResetParametersSchema = z.object({
  successMessage: feedbackMessage,
  targets: z.array(z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("control"), targetId: StableSemanticIdSchema, value: scalar }).strict(),
    z.object({ kind: z.literal("local-state"), targetId: StableSemanticIdSchema, value: scalar }).strict(),
    z.object({ kind: z.literal("mock-data"), targetId: StableSemanticIdSchema, sourceId: StableSemanticIdSchema }).strict(),
  ])).min(1).max(12),
}).strict();

const descriptors: readonly ScriptTemplateDescriptor[] = deepFreeze([
  { id: "form-validate-submit", availability: "supported", semanticCalls: ["$control.getValue", "$state.set", "$feedback.show"] },
  { id: "master-detail-fill", availability: "planned", diagnostic: "SCRIPT_TEMPLATE_INPUT_WRITE_UNVERIFIED", semanticCalls: ["$event.record", "$control.setValue", "$feedback.show"] },
  { id: "multi-filter", availability: "supported", semanticCalls: ["$data.get", "$control.getValue", "$control.setData"] },
  {
    id: "record-mutate", availability: "planned", diagnostic: "SCRIPT_TEMPLATE_PERSISTENT_DATA_MUTATION_UNVERIFIED",
    semanticCalls: ["$data.get", "$control.getValue", "$state.get", "$data.set", "$control.setData", "$feedback.show"],
    operations: ["append", "update", "remove"],
  },
  { id: "reset-controls", availability: "planned", diagnostic: "SCRIPT_TEMPLATE_RESET_WRITE_UNVERIFIED", semanticCalls: ["$control.setValue", "$state.set", "$data.get", "$data.set", "$feedback.show"] },
]);

const descriptorById = new Map(descriptors.map((descriptor) => [descriptor.id, descriptor]));

export class ScriptTemplateError extends Error {
  constructor(
    readonly code: "SCRIPT_TEMPLATE_OUTPUT_INVALID" | "SCRIPT_TEMPLATE_PARAMETER_INVALID" | "SCRIPT_TEMPLATE_UNKNOWN",
    readonly templateId: string,
    detail?: string,
  ) {
    super(`${code}: ${templateId}${detail === undefined ? "" : ` (${detail})`}`);
    this.name = "ScriptTemplateError";
  }
}

export function listScriptTemplates(): readonly ScriptTemplateDescriptor[] {
  return descriptors;
}

export function requireScriptTemplate(id: string): ScriptTemplateDescriptor {
  const descriptor = descriptorById.get(id as ScriptTemplateId);
  if (descriptor === undefined) throw new ScriptTemplateError("SCRIPT_TEMPLATE_UNKNOWN", id);
  return descriptor;
}

export function renderScriptTemplate(id: string, invocation: object): string {
  requireScriptTemplate(id);
  const clone = clonePlainData(invocation, id);
  const parsed = ScriptPlanSchema.safeParse(clone);
  if (!parsed.success || parsed.data.kind !== "template") {
    const detail = id === "record-mutate" && hasInvalidRecordOperation(clone)
      ? "parameters.operation:append|update|remove"
      : parsed.success ? "kind" : issuePath(parsed.error.issues[0]?.path);
    invalid(id, detail);
  }
  const plan = deepFreeze(parsed.data);
  if (plan.template !== id) invalid(id, "template");
  assertUnique(plan, id);
  let source: string;
  switch (id) {
    case "form-validate-submit": source = renderFormValidate(parseFormValidate(plan, id)); break;
    case "master-detail-fill": source = renderMasterDetail(parseMasterDetail(plan, id)); break;
    case "multi-filter": source = renderMultiFilter(parseMultiFilter(plan, id)); break;
    case "record-mutate": source = renderRecordMutate(parseRecordMutate(plan, id)); break;
    case "reset-controls": source = renderReset(parseReset(plan, id)); break;
    default: throw new ScriptTemplateError("SCRIPT_TEMPLATE_UNKNOWN", id);
  }
  return validateRenderedSource(plan, source, id);
}

class InvocationReader {
  private readonly inputs = new Map<string, ScriptPort>();
  private readonly outputs = new Map<string, ScriptPort>();
  private readonly parameters = new Map<string, ScriptParameter>();
  private readonly usedInputs = new Set<string>();
  private readonly usedOutputs = new Set<string>();
  private readonly usedParameters = new Set<string>();

  constructor(private readonly plan: TemplatePlan, private readonly templateId: string) {
    plan.inputs.forEach((entry) => this.inputs.set(entry.name, entry));
    plan.outputs.forEach((entry) => this.outputs.set(entry.name, entry));
    plan.parameters.forEach((entry) => this.parameters.set(entry.name, entry));
  }

  input(name: string, kinds: readonly ScriptPort["refKind"][]): ScriptPort {
    const entry = this.inputs.get(name);
    if (entry === undefined || !kinds.includes(entry.refKind)) invalid(this.templateId, `inputs.${name}`);
    this.usedInputs.add(name);
    return entry;
  }

  output(name: string, kinds: readonly ScriptPort["refKind"][]): ScriptPort {
    const entry = this.outputs.get(name);
    if (entry === undefined || !kinds.includes(entry.refKind)) invalid(this.templateId, `outputs.${name}`);
    this.usedOutputs.add(name);
    return entry;
  }

  optionalOutput(name: string, kinds: readonly ScriptPort["refKind"][]): ScriptPort | undefined {
    if (!this.outputs.has(name)) return undefined;
    return this.output(name, kinds);
  }

  literal(name: string): string | number | boolean | null {
    const entry = this.parameters.get(name);
    if (entry === undefined || entry.value === undefined) invalid(this.templateId, `parameters.${name}`);
    this.usedParameters.add(name);
    return entry.value;
  }

  optionalLiteral(name: string): string | number | boolean | null | undefined {
    if (!this.parameters.has(name)) return undefined;
    return this.literal(name);
  }

  hasAny(prefix: string): boolean {
    return [...this.inputs.keys(), ...this.outputs.keys(), ...this.parameters.keys()].some((name) => name.startsWith(prefix));
  }

  finish(): void {
    const extraInput = this.plan.inputs.find((entry) => !this.usedInputs.has(entry.name));
    if (extraInput !== undefined) invalid(this.templateId, `inputs.${extraInput.name}`);
    const extraOutput = this.plan.outputs.find((entry) => !this.usedOutputs.has(entry.name));
    if (extraOutput !== undefined) invalid(this.templateId, `outputs.${extraOutput.name}`);
    const extraParameter = this.plan.parameters.find((entry) => !this.usedParameters.has(entry.name));
    if (extraParameter !== undefined) invalid(this.templateId, `parameters.${extraParameter.name}`);
  }
}

function parseMultiFilter(plan: TemplatePlan, id: string): z.infer<typeof MultiFilterParametersSchema> {
  const reader = new InvocationReader(plan, id);
  const records = reader.input("records", ["mock-data"]);
  const view = reader.output("view", ["control"]);
  const combine = reader.literal("combine");
  const criteria: Array<{ field: string; mode: z.infer<typeof matchMode>; valueControlId: string }> = [];
  for (let index = 1; index <= 8; index += 1) {
    const prefix = `criterion-${index}-`;
    if (!reader.hasAny(prefix)) {
      if (reader.hasAny(`criterion-${index + 1}-`)) invalid(id, `criteria.${index}`);
      break;
    }
    const value = reader.input(`${prefix}value`, ["control"]);
    criteria.push({
      field: asString(reader.literal(`${prefix}field`), id, `${prefix}field`),
      mode: asMatchMode(reader.literal(`${prefix}mode`), id, `${prefix}mode`),
      valueControlId: value.refId,
    });
  }
  if (reader.hasAny("criterion-9-")) invalid(id, "criteria.9");
  reader.finish();
  return parseTemplateParameters(MultiFilterParametersSchema, {
    combine, recordsId: records.refId, viewId: view.refId, criteria,
  }, id);
}

function parseMasterDetail(plan: TemplatePlan, id: string): z.infer<typeof MasterDetailParametersSchema> {
  const reader = new InvocationReader(plan, id);
  const mappings: Array<{ field: string; targetControlId: string }> = [];
  for (let index = 1; index <= 12; index += 1) {
    const outputName = `target-${index}`;
    const parameterName = `mapping-${index}-field`;
    if (!reader.hasAny(outputName) && !reader.hasAny(`mapping-${index}-`)) {
      if (reader.hasAny(`target-${index + 1}`) || reader.hasAny(`mapping-${index + 1}-`)) invalid(id, `mappings.${index}`);
      break;
    }
    mappings.push({
      field: asString(reader.literal(parameterName), id, parameterName),
      targetControlId: reader.output(outputName, ["control"]).refId,
    });
  }
  if (reader.hasAny("target-13") || reader.hasAny("mapping-13-")) invalid(id, "mappings.13");
  const missingMessage = reader.literal("missing-message");
  reader.finish();
  return parseTemplateParameters(MasterDetailParametersSchema, { missingMessage, mappings }, id);
}

function parseFormValidate(plan: TemplatePlan, id: string): z.infer<typeof FormValidateParametersSchema> {
  const reader = new InvocationReader(plan, id);
  const fields: Array<{ controlId: string; required: boolean; message?: string }> = [];
  for (let index = 1; index <= 8; index += 1) {
    const name = `field-${index}`;
    if (!reader.hasAny(name)) {
      if (reader.hasAny(`field-${index + 1}`)) invalid(id, `fields.${index}`);
      break;
    }
    const required = reader.literal(`${name}-required`);
    if (typeof required !== "boolean") invalid(id, `parameters.${name}-required`);
    const message = reader.optionalLiteral(`${name}-message`);
    fields.push({
      controlId: reader.input(name, ["control"]).refId,
      required,
      ...(message === undefined ? {} : { message: asString(message, id, `${name}-message`) }),
    });
  }
  if (reader.hasAny("field-9")) invalid(id, "fields.9");
  const submitted = reader.output("submitted", ["local-state"]);
  const successMessage = reader.literal("success-message");
  reader.finish();
  return parseTemplateParameters(FormValidateParametersSchema, {
    submittedStateId: submitted.refId, successMessage, fields,
  }, id);
}

function parseRecordMutate(plan: TemplatePlan, id: string): z.infer<typeof RecordMutateParametersSchema> {
  const reader = new InvocationReader(plan, id);
  const records = reader.input("records", ["mock-data"]);
  const updated = reader.output("updated", ["mock-data"]);
  const view = reader.optionalOutput("view", ["control"]);
  const operation = reader.literal("operation");
  const successMessage = reader.literal("success-message");
  const fields: Array<{ field: string; controlId: string }> = [];
  for (let index = 1; index <= 8; index += 1) {
    const name = `field-${index}`;
    if (!reader.hasAny(name)) {
      if (reader.hasAny(`field-${index + 1}`)) invalid(id, `fields.${index}`);
      break;
    }
    fields.push({
      field: asString(reader.literal(`${name}-name`), id, `${name}-name`),
      controlId: reader.input(name, ["control"]).refId,
    });
  }
  if (reader.hasAny("field-9")) invalid(id, "fields.9");
  const common = {
    recordsId: records.refId,
    updatedId: updated.refId,
    ...(view === undefined ? {} : { viewId: view.refId }),
    successMessage,
    fields,
  };
  let candidate: object;
  if (operation === "append" || operation === "update" || operation === "remove") {
    const keyField = reader.literal("key-field");
    const key = reader.input("key", ["control", "local-state"]);
    candidate = {
      operation,
      ...common,
      keyField,
      keySource: { kind: key.refKind, id: key.refId },
    };
  } else {
    invalid(id, "parameters.operation:append|update|remove");
  }
  reader.finish();
  return parseTemplateParameters(RecordMutateParametersSchema, candidate, id);
}

function parseReset(plan: TemplatePlan, id: string): z.infer<typeof ResetParametersSchema> {
  const reader = new InvocationReader(plan, id);
  const targets: Array<
    | { kind: "control" | "local-state"; targetId: string; value: string | number | boolean | null }
    | { kind: "mock-data"; targetId: string; sourceId: string }
  > = [];
  for (let index = 1; index <= 12; index += 1) {
    const outputName = `target-${index}`;
    if (!reader.hasAny(outputName) && !reader.hasAny(`source-${index}`)) {
      if (reader.hasAny(`target-${index + 1}`) || reader.hasAny(`source-${index + 1}`)) invalid(id, `targets.${index}`);
      break;
    }
    const output = reader.output(outputName, ["control", "local-state", "mock-data"]);
    if (output.refKind === "mock-data") {
      targets.push({ kind: output.refKind, targetId: output.refId, sourceId: reader.input(`source-${index}`, ["mock-data"]).refId });
    } else {
      targets.push({ kind: output.refKind, targetId: output.refId, value: reader.literal(`${outputName}-value`) });
    }
  }
  if (reader.hasAny("target-13") || reader.hasAny("source-13")) invalid(id, "targets.13");
  const successMessage = reader.literal("success-message");
  reader.finish();
  return parseTemplateParameters(ResetParametersSchema, { successMessage, targets }, id);
}

function renderMultiFilter(parameters: z.infer<typeof MultiFilterParametersSchema>): string {
  const lines = [`const records = $data.get(${literal(parameters.recordsId)});`];
  parameters.criteria.forEach((criterion, index) => {
    lines.push(`const criterion${index + 1} = $control.getValue(${literal(criterion.valueControlId)});`);
  });
  const expressions = parameters.criteria.map((criterion, index) => criterionExpression(criterion, index + 1));
  lines.push(`const filtered = records.slice(0, 100).filter((record) => (${expressions.join(parameters.combine === "all" ? " && " : " || ")}));`);
  lines.push(`$control.setData(${literal(parameters.viewId)}, filtered);`);
  return lines.join("\n");
}

function criterionExpression(
  criterion: z.infer<typeof MultiFilterParametersSchema>["criteria"][number],
  index: number,
): string {
  const value = `record[${literal(criterion.field)}]`;
  const expected = `criterion${index}`;
  switch (criterion.mode) {
    case "equals": return `${value} === ${expected}`;
    case "not-equals": return `${value} !== ${expected}`;
    case "contains": return `String(${value}).includes(String(${expected}))`;
    case "starts-with": return `String(${value}).startsWith(String(${expected}))`;
    case "gte": return `${value} >= ${expected}`;
    case "lte": return `${value} <= ${expected}`;
  }
}

function renderMasterDetail(parameters: z.infer<typeof MasterDetailParametersSchema>): string {
  return [
    "const selectedRecord = $event.record();",
    "if (selectedRecord === null) {",
    `  $feedback.show("warning", ${literal(parameters.missingMessage)});`,
    "} else {",
    ...parameters.mappings.map((mapping) => `  $control.setValue(${literal(mapping.targetControlId)}, selectedRecord[${literal(mapping.field)}]);`),
    "}",
  ].join("\n");
}

function renderFormValidate(parameters: z.infer<typeof FormValidateParametersSchema>): string {
  const lines = parameters.fields.map((field, index) => `const field${index + 1} = $control.getValue(${literal(field.controlId)});`);
  lines.push("let valid = true;");
  parameters.fields.forEach((field, index) => {
    if (field.required) {
      lines.push(`if (field${index + 1} === null || String(field${index + 1}).trim() === "") { valid = false; $feedback.show("error", ${literal(field.message!)}); }`);
    }
  });
  lines.push(`$state.set(${literal(parameters.submittedStateId)}, Boolean(valid));`);
  lines.push(`if (valid) { $feedback.show("success", ${literal(parameters.successMessage)}); }`);
  return lines.join("\n");
}

function renderRecordMutate(parameters: z.infer<typeof RecordMutateParametersSchema>): string {
  const lines = [
    `const records = $data.get(${literal(parameters.recordsId)});`,
    "const nextRecords = records.slice(0, 100);",
  ];
  const keyRead = parameters.keySource.kind === "control"
    ? `$control.getValue(${literal(parameters.keySource.id)})`
    : `$state.get(${literal(parameters.keySource.id)})`;
  lines.push(`const recordKey = ${keyRead};`);
  if (parameters.operation === "append") {
    lines.push(`const nextRecord = { ${literal(parameters.keyField)}: recordKey, ${parameters.fields.map((field) => `${literal(field.field)}: $control.getValue(${literal(field.controlId)})`).join(", ")} };`);
    lines.push("if (nextRecords.length < 100) { nextRecords.push(nextRecord); }");
  } else {
    if (parameters.operation === "remove") {
      lines.push(`const changedRecords = nextRecords.filter((record) => record[${literal(parameters.keyField)}] !== recordKey);`);
    } else {
      const record = `{ ...nextRecords[index], ${parameters.fields.map((field) => `${literal(field.field)}: $control.getValue(${literal(field.controlId)})`).join(", ")}, ${literal(parameters.keyField)}: recordKey }`;
      lines.push(`for (let index = 0; index < 100 && index < nextRecords.length; index += 1) { if (nextRecords[index][${literal(parameters.keyField)}] === recordKey) { nextRecords[index] = ${record}; } }`);
    }
  }
  const resultName = parameters.operation === "remove" ? "changedRecords" : "nextRecords";
  lines.push(`$data.set(${literal(parameters.updatedId)}, ${resultName});`);
  if (parameters.viewId !== undefined) lines.push(`$control.setData(${literal(parameters.viewId)}, ${resultName});`);
  lines.push(`$feedback.show("success", ${literal(parameters.successMessage)});`);
  return lines.join("\n");
}

function renderReset(parameters: z.infer<typeof ResetParametersSchema>): string {
  const lines: string[] = [];
  parameters.targets.forEach((target, index) => {
    if (target.kind === "control") lines.push(`$control.setValue(${literal(target.targetId)}, ${literal(target.value)});`);
    else if (target.kind === "local-state") lines.push(`$state.set(${literal(target.targetId)}, ${literal(target.value)});`);
    else {
      lines.push(`const resetData${index + 1} = $data.get(${literal(target.sourceId)}).slice(0, 100);`);
      lines.push(`$data.set(${literal(target.targetId)}, resetData${index + 1});`);
    }
  });
  lines.push(`$feedback.show("info", ${literal(parameters.successMessage)});`);
  return lines.join("\n");
}

function assertUnique(plan: TemplatePlan, id: string): void {
  for (const [label, entries] of [["inputs", plan.inputs], ["outputs", plan.outputs], ["parameters", plan.parameters]] as const) {
    const names = new Set<string>();
    entries.forEach((entry) => {
      if (names.has(entry.name)) invalid(id, `${label}.${entry.name}`);
      names.add(entry.name);
    });
  }
  const refs = new Set<string>();
  [...plan.inputs, ...plan.outputs].forEach((entry) => {
    const key = `${entry.refKind}:${entry.refId}`;
    if (refs.has(key)) invalid(id, `references.${entry.refId}`);
    refs.add(key);
  });
}

function parseTemplateParameters<Output>(schema: z.ZodType<Output>, candidate: object, id: string): Output {
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) invalid(id, issuePath(parsed.error.issues[0]?.path));
  return deepFreeze(parsed.data);
}

function validateRenderedSource(plan: TemplatePlan, source: string, id: string): string {
  const result = ScriptPlanSchema.safeParse({
    id: plan.id,
    kind: "custom",
    programVersion: "semantic-js/v1",
    purpose: plan.purpose,
    inputs: plan.inputs,
    outputs: plan.outputs,
    source,
  });
  if (!result.success) {
    throw new ScriptTemplateError("SCRIPT_TEMPLATE_OUTPUT_INVALID", id, issuePath(result.error.issues[0]?.path));
  }
  if (result.data.kind !== "custom" || result.data.programVersion !== "semantic-js/v1" || result.data.source === undefined) {
    throw new ScriptTemplateError("SCRIPT_TEMPLATE_OUTPUT_INVALID", id, "source");
  }
  return result.data.source;
}

function asString(value: string | number | boolean | null, id: string, path: string): string {
  if (typeof value !== "string") invalid(id, `parameters.${path}`);
  return value;
}

function asMatchMode(value: string | number | boolean | null, id: string, path: string): z.infer<typeof matchMode> {
  const parsed = matchMode.safeParse(value);
  if (!parsed.success) invalid(id, `parameters.${path}`);
  return parsed.data;
}

function literal(value: string | number | boolean | null): string {
  return JSON.stringify(value);
}

function issuePath(path: PropertyKey[] | undefined): string {
  return path === undefined || path.length === 0 ? "invocation" : path.map(String).join(".");
}

function hasInvalidRecordOperation(value: DataValue): boolean {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const parameters = value.parameters;
  if (!Array.isArray(parameters)) return false;
  const operation = parameters.find((parameter) => parameter !== null
    && typeof parameter === "object"
    && !Array.isArray(parameter)
    && parameter.name === "operation");
  if (operation === undefined || operation === null || typeof operation !== "object" || Array.isArray(operation)) return false;
  return operation.value !== "append" && operation.value !== "update" && operation.value !== "remove";
}

function invalid(id: string, path: string): never {
  throw new ScriptTemplateError("SCRIPT_TEMPLATE_PARAMETER_INVALID", id, path);
}

function normalizedFieldName(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toLocaleLowerCase("en-US");
}

function rejectKeyFieldOverwrite(
  value: { readonly keyField: string; readonly fields: readonly { readonly field: string }[] },
  ctx: z.RefinementCtx,
): void {
  const key = normalizedFieldName(value.keyField);
  value.fields.forEach((field, index) => {
    if (normalizedFieldName(field.field) === key) {
      ctx.addIssue({ code: "custom", path: ["fields", index, "field"], message: "record fields cannot overwrite the key field" });
    }
  });
}

function deepFreeze<Value>(value: Value): Value {
  if (value === null || typeof value !== "object") return value;
  const pending: object[] = [value];
  const seen = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    Object.values(current as Record<string, DataValue>).forEach((child) => {
      if (child !== null && typeof child === "object") pending.push(child);
    });
    Object.freeze(current);
  }
  return value;
}

function clonePlainData(root: object, id: string): DataValue {
  const holder: { value?: DataValue } = {};
  const pending: Array<{ source: object; depth: number; assign: (value: DataValue) => void }> = [{
    source: root,
    depth: 0,
    assign: (value) => { holder.value = value; },
  }];
  const active = new WeakSet<object>();
  const completed = new WeakSet<object>();
  let nodes = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    nodes += 1;
    if (nodes > 2_000 || current.depth > 16) invalid(id, "invocation-budget");
    if (completed.has(current.source) || active.has(current.source)) invalid(id, "invocation-shared-reference");
    if (utilTypes.isProxy(current.source)) invalid(id, "invocation-proxy");
    let keys: PropertyKey[];
    let descriptors: PropertyDescriptorMap;
    let prototype: object | null;
    try {
      keys = Reflect.ownKeys(current.source);
      descriptors = Object.getOwnPropertyDescriptors(current.source);
      prototype = Reflect.getPrototypeOf(current.source);
    } catch {
      invalid(id, "invocation-descriptor");
    }
    if (keys.some((key) => typeof key === "symbol")) invalid(id, "invocation-symbol");
    const array = Array.isArray(current.source);
    if ((!array && prototype !== Object.prototype && prototype !== null) || (array && prototype !== Array.prototype)) {
      invalid(id, "invocation-prototype");
    }
    const dataKeys = keys.filter((key) => key !== "length").map(String);
    let arrayLength = 0;
    if (array) {
      const rawLength = descriptors.length?.value as PropertyKey | boolean | bigint | object | null | undefined;
      if (typeof rawLength !== "number" || !Number.isSafeInteger(rawLength) || rawLength < 0 || rawLength > 100) {
        invalid(id, "invocation-array-length");
      }
      arrayLength = rawLength;
      if (dataKeys.length !== arrayLength || dataKeys.some((key, index) => key !== String(index))) {
        invalid(id, "invocation-array-shape");
      }
    }
    active.add(current.source);
    const target: DataValue[] | { [key: string]: DataValue } = array
      ? new Array<DataValue>(arrayLength)
      : Object.create(null) as { [key: string]: DataValue };
    current.assign(target);
    if (dataKeys.length > 100) invalid(id, "invocation-properties");
    for (let index = dataKeys.length - 1; index >= 0; index -= 1) {
      const key = dataKeys[index]!;
      const descriptor = descriptors[key];
      if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || !("value" in descriptor) || !descriptor.enumerable) {
        invalid(id, `invocation.${key}`);
      }
      const value = descriptor.value as PropertyKey | boolean | bigint | object | null | undefined;
      const assign = (child: DataValue): void => {
        if (Array.isArray(target)) target[Number(key)] = child;
        else Object.defineProperty(target, key, { value: child, enumerable: true, configurable: true, writable: true });
      };
      if (value === null || typeof value === "string" || typeof value === "boolean") assign(value);
      else if (typeof value === "number") {
        if (!Number.isFinite(value)) invalid(id, `invocation.${key}`);
        assign(value);
      } else if (typeof value === "object") {
        pending.push({ source: value, depth: current.depth + 1, assign });
      } else invalid(id, `invocation.${key}`);
    }
    active.delete(current.source);
    completed.add(current.source);
  }
  if (holder.value === undefined) invalid(id, "invocation");
  return holder.value;
}
