import { z } from "zod";
import { projectKeySchema } from "./solution.js";
import { canonicalServerHash } from "./server-plan-envelope.js";

const id = z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const kind = z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/);
const text = z.string().trim().min(1).max(200).refine((value) => !/<script\b|javascript\s*:|data\s*:\s*\/\s*html/i.test(value));
const fingerprint = z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9._:-]+$/);

const ModuleDefinitionMetadataSchema = z.object({
  pageId: id,
  moduleId: id,
  kind,
  templateVersion: z.string().trim().min(1).max(100).regex(/^[0-9A-Za-z][0-9A-Za-z._-]*$/),
  compilerFingerprint: fingerprint,
  layoutFingerprint: fingerprint,
}).strict();

const ModuleAssetMetadataSchema = z.object({
  pageId: id,
  moduleId: id,
  assetId: id,
  status: z.enum(["resolved", "unavailable", "pending"]),
  /** Opaque canonical identity; never a path, storage key, secret, or native payload. */
  assetIdentity: text,
}).strict();

const ModuleBlueprintMappingSchema = z.object({
  blueprintModuleId: z.string().trim().min(1).max(100),
  pageId: id,
  moduleId: id,
  expectedKind: kind.optional(),
  expectedCategory: text.optional(),
  interactionBindings: z.array(z.object({
    type: z.enum(["navigate", "scroll", "open-modal", "submit", "filter", "toggle"]),
    actionKind: text,
    target: text,
    outputId: z.string().trim().min(3).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*\/[A-Za-z][A-Za-z0-9_-]*$/),
  }).strict()).max(12),
}).strict().superRefine((value, ctx) => {
  const requirementKeys = value.interactionBindings.map(interactionRequirementKey);
  const outputIds = value.interactionBindings.map((binding) => binding.outputId);
  if (new Set(requirementKeys).size !== requirementKeys.length) ctx.addIssue({ code: "custom", path: ["interactionBindings"], message: "duplicate interaction binding" });
  if (new Set(outputIds).size !== outputIds.length) ctx.addIssue({ code: "custom", path: ["interactionBindings"], message: "interaction bindings must use unique outputs" });
  if (!isCodePointSorted(requirementKeys)) ctx.addIssue({ code: "custom", path: ["interactionBindings"], message: "interaction bindings must be canonically sorted" });
});

export const ModuleCompilationMetadataSchema = z.object({
  schema: z.literal("kf-module-compilation-metadata/v1"),
  projectKey: projectKeySchema,
  moduleDefinitions: z.array(ModuleDefinitionMetadataSchema).max(250),
  assets: z.array(ModuleAssetMetadataSchema).max(250),
  blueprintMappings: z.array(ModuleBlueprintMappingSchema).max(250),
}).strict().superRefine((value, ctx) => {
  const unique = (entries: readonly { pageId: string; moduleId?: string; entityId?: string }[], label: string) => {
    const seen = new Set<string>();
    entries.forEach((entry, index) => {
      const key = `${entry.pageId}\u0000${entry.moduleId ?? entry.entityId}`;
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: [label, index], message: `duplicate ${label} owner` });
      seen.add(key);
    });
  };
  unique(value.moduleDefinitions, "moduleDefinitions");
  unique(value.assets, "assets");
  const blueprintIds = new Set<string>();
  const boundOutputs = new Set<string>();
  value.blueprintMappings.forEach((entry, index) => {
    if (blueprintIds.has(entry.blueprintModuleId)) ctx.addIssue({ code: "custom", path: ["blueprintMappings", index, "blueprintModuleId"], message: "duplicate blueprint mapping" });
    blueprintIds.add(entry.blueprintModuleId);
    entry.interactionBindings.forEach((binding, bindingIndex) => {
      const owner = `${entry.pageId}\u0000${entry.moduleId}\u0000${binding.outputId}`;
      if (boundOutputs.has(owner)) ctx.addIssue({ code: "custom", path: ["blueprintMappings", index, "interactionBindings", bindingIndex, "outputId"], message: "interaction output must be unique across mapped module" });
      boundOutputs.add(owner);
    });
  });
});

export type ModuleCompilationMetadata = z.infer<typeof ModuleCompilationMetadataSchema>;

const hash = z.string().regex(/^[a-f0-9]{64}$/);
const signature = hash;
const revisionId = z.string().trim().min(1).max(100);
const BlueprintInteractionRequirementSchema = z.object({
  type: z.enum(["navigate", "scroll", "open-modal", "submit", "filter", "toggle"]),
  actionKind: text,
  target: text,
}).strict();

const AcceptedBlueprintModuleSchema = z.object({
  blueprintModuleId: z.string().trim().min(1).max(100),
  expectedKind: kind,
  expectedCategory: text,
  interactionRequirements: z.array(BlueprintInteractionRequirementSchema).max(12),
}).strict().superRefine((value, ctx) => {
  const keys = value.interactionRequirements.map(interactionRequirementKey);
  if (new Set(keys).size !== keys.length) ctx.addIssue({ code: "custom", path: ["interactionRequirements"], message: "duplicate accepted interaction requirement" });
  if (!isCodePointSorted(keys)) ctx.addIssue({ code: "custom", path: ["interactionRequirements"], message: "accepted interaction requirements must be canonically sorted" });
});

/** Server-signed durable authorization binding module metadata to exact persisted JSON. */
export const ModuleCompilationArtifactSchema = z.object({
  schema: z.literal("kf-module-compilation-artifact/v1"),
  projectKey: projectKeySchema,
  revisionId,
  acceptedBlueprintHash: hash,
  planHash: hash,
  implementationHash: hash,
  metadataHash: hash,
  sourceModuleIds: z.array(id).max(250),
  metadata: ModuleCompilationMetadataSchema,
  signature,
}).strict().superRefine((value, ctx) => {
  if (value.metadata.projectKey !== value.projectKey) ctx.addIssue({ code: "custom", path: ["metadata", "projectKey"], message: "metadata project mismatch" });
  if (canonicalModuleCompilationHash(value.metadata) !== value.metadataHash) ctx.addIssue({ code: "custom", path: ["metadataHash"], message: "metadata hash mismatch" });
  if (new Set(value.sourceModuleIds).size !== value.sourceModuleIds.length) ctx.addIssue({ code: "custom", path: ["sourceModuleIds"], message: "duplicate module source" });
  if (!isCodePointSorted(value.sourceModuleIds)) ctx.addIssue({ code: "custom", path: ["sourceModuleIds"], message: "module sources must be canonically sorted" });
});

export const AcceptedBlueprintArtifactSchema = z.object({
  schema: z.literal("kf-accepted-blueprint-artifact/v1"),
  projectKey: projectKeySchema,
  revisionId,
  blueprintHash: hash,
  modules: z.array(AcceptedBlueprintModuleSchema).min(1).max(12),
  signature,
}).strict().superRefine((value, ctx) => {
  const moduleIds = value.modules.map((module) => module.blueprintModuleId);
  if (new Set(moduleIds).size !== moduleIds.length) ctx.addIssue({ code: "custom", path: ["modules"], message: "duplicate accepted blueprint module" });
  if (!isCodePointSorted(moduleIds)) ctx.addIssue({ code: "custom", path: ["modules"], message: "accepted blueprint modules must be canonically sorted" });
});

export type ModuleCompilationArtifact = z.infer<typeof ModuleCompilationArtifactSchema>;
export type AcceptedBlueprintArtifact = z.infer<typeof AcceptedBlueprintArtifactSchema>;

export function canonicalModuleCompilationArtifactSigningBytes(value: ModuleCompilationArtifact): Uint8Array {
  const parsed = parseModuleCompilationArtifactData(value);
  return canonicalBytes({
    schema: parsed.schema, projectKey: parsed.projectKey, revisionId: parsed.revisionId,
    acceptedBlueprintHash: parsed.acceptedBlueprintHash, planHash: parsed.planHash,
    implementationHash: parsed.implementationHash, metadataHash: parsed.metadataHash,
    sourceModuleIds: parsed.sourceModuleIds, metadata: parsed.metadata,
  });
}

export function canonicalModuleCompilationHash(value: unknown): string { return canonicalServerHash(value); }

export function canonicalAcceptedBlueprintArtifactSigningBytes(value: AcceptedBlueprintArtifact): Uint8Array {
  const parsed = parseAcceptedBlueprintArtifactData(value);
  return canonicalBytes({
    schema: parsed.schema, projectKey: parsed.projectKey, revisionId: parsed.revisionId,
    blueprintHash: parsed.blueprintHash, modules: parsed.modules,
  });
}

export function parseAcceptedBlueprintArtifactData(input: unknown): AcceptedBlueprintArtifact {
  return parseArtifact(input, AcceptedBlueprintArtifactSchema, "ACCEPTED_BLUEPRINT_ARTIFACT_SCHEMA_INVALID");
}

export function parseModuleCompilationArtifactData(input: unknown): ModuleCompilationArtifact {
  return parseArtifact(input, ModuleCompilationArtifactSchema, "MODULE_COMPILATION_ARTIFACT_SCHEMA_INVALID");
}

function parseArtifact<T>(input: unknown, schema: z.ZodType<T>, code: string): T {
  assertDescriptorSafeJson(input, code);
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new Error(`${code}: ${parsed.error.issues[0]?.message ?? "invalid artifact"}`);
  return parsed.data;
}

function canonicalBytes(value: unknown): Uint8Array {
  return Buffer.from(stableJson(value), "utf8");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(compareCodePoints).map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}

function isCodePointSorted(values: readonly string[]): boolean {
  return values.every((value, index) => index === 0 || compareCodePoints(values[index - 1]!, value) <= 0);
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function interactionRequirementKey(value: { type: string; actionKind: string; target: string }): string {
  return `${value.type}\u0000${value.actionKind}\u0000${value.target}`;
}

/** Artifact inputs may come from JSON columns; reject accessors/prototypes before Zod reads them. */
function assertDescriptorSafeJson(root: unknown, code: string): void {
  const seen = new Set<object>();
  const active = new Set<object>();
  const pending: Array<{ value: unknown; exit?: true }> = [{ value: root }];
  let nodes = 0;
  while (pending.length > 0) {
    const entry = pending.pop()!;
    const value = entry.value;
    nodes += 1;
    if (nodes > 50_000) throw new Error(`${code}: raw node budget exceeded`);
    if (value === null || typeof value === "string" || typeof value === "boolean") continue;
    if (typeof value === "number") { if (Number.isFinite(value)) continue; throw new Error(`${code}: non-finite number`); }
    if (typeof value !== "object") throw new Error(`${code}: non-JSON value`);
    if (entry.exit === true) { active.delete(value); seen.add(value); continue; }
    if (active.has(value) || seen.has(value)) throw new Error(`${code}: cyclic or shared object`);
    active.add(value); pending.push({ value, exit: true });
    if (Array.isArray(value)) {
      if (Reflect.getPrototypeOf(value) !== Array.prototype || Reflect.ownKeys(value).length !== value.length + 1) throw new Error(`${code}: unsafe array`);
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) throw new Error(`${code}: unsafe array item`);
        pending.push({ value: descriptor.value });
      }
      continue;
    }
    if (Reflect.getPrototypeOf(value) !== Object.prototype) throw new Error(`${code}: unsafe object prototype`);
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || key === "__proto__" || key === "prototype" || key === "constructor") throw new Error(`${code}: unsafe object key`);
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) throw new Error(`${code}: unsafe object property`);
      pending.push({ value: descriptor.value });
    }
  }
}
