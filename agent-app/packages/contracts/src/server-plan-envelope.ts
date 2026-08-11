import { createHash } from "node:crypto";
import { z } from "zod";
import { changePlanSchema, type ChangePlan } from "./change-plan.js";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const TrustedSemanticOperationSchema = z.object({
  kind: z.literal("kf.table-data/v1"),
  entityId: z.string().trim().min(1).max(100),
  capabilityId: z.literal("easyui.1"),
  sourceModuleId: z.string().trim().min(1).max(100),
  payloadHash: Sha256Schema,
}).strict();

export const TrustedSemanticOperationInputSchema = TrustedSemanticOperationSchema;

export const ServerPlanEnvelopeSchema = z.object({
  schema: z.literal("kf-server-plan-envelope/v1"),
  plan: changePlanSchema,
  planHash: Sha256Schema,
  revisionId: z.string().trim().min(1).max(100),
  semanticOperations: z.array(TrustedSemanticOperationSchema).max(500),
  /** HMAC-SHA-256 issued by the server; never returned by the public API. */
  signature: Sha256Schema,
}).strict();

export type TrustedSemanticOperationInput = z.infer<typeof TrustedSemanticOperationInputSchema>;
export type TrustedSemanticOperation = z.infer<typeof TrustedSemanticOperationSchema>;
export type ServerPlanEnvelope = z.infer<typeof ServerPlanEnvelopeSchema>;

export interface ServerPlanEnvelopeExpectations {
  expectedPlanHash?: string;
  expectedRevisionId?: string;
}

/**
 * Persisted-plan pre-parse budgets. These are intentionally above the
 * reviewed limits of 500 semantic operations and a 500x32 table payload,
 * while bounding work before Zod, canonical sorting, or hashing.
 */
export const SERVER_PLAN_RAW_LIMITS = Object.freeze({
  maxDepth: 128,
  maxNodes: 50_000,
  maxArrayLength: 10_000,
  maxKeysPerObject: 1_000,
  maxTotalStringBytes: 16 * 1024 * 1024,
});

/** Stable public digest. This is integrity metadata, never authorization. */
export function canonicalServerHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export function semanticPayloadHash(value: unknown): string {
  return canonicalServerHash(value);
}

export function canonicalChangePlanHash(input: unknown): string {
  const plan = parseChangePlan(input);
  return canonicalServerHash({
    schema: "kf-change-plan/v1",
    workspaceId: plan.workspaceId,
    operations: plan.operations.map((operation) => {
      switch (operation.op) {
        case "create":
          return {
            op: "create",
            entityId: operation.entityId,
            entityType: operation.entityType,
            changes: [],
            properties: operation.properties,
            destructiveConfirmed: false,
          };
        case "update":
          return {
            op: "update",
            entityId: operation.entityId,
            ...(operation.entityType === undefined ? {} : { entityType: operation.entityType }),
            changes: operation.changes,
            properties: {},
            destructiveConfirmed: false,
          };
        case "delete":
          return {
            op: "delete",
            entityId: operation.entityId,
            changes: [],
            properties: {},
            destructiveConfirmed: operation.destructiveConfirmed,
            digest: operation.digest,
          };
        case "applyStyle":
          return {
            op: "applyStyle",
            entityId: operation.entityId,
            entityType: "control",
            changes: [],
            properties: {},
            destructiveConfirmed: false,
            style: operation.style,
          };
      }
    }),
  });
}

/**
 * Canonical bytes covered by the server HMAC. The signature itself is
 * deliberately excluded; every other persisted field, including schema
 * version and the complete semantic authorization list, is covered.
 */
export function canonicalServerPlanSigningBytes(input: ServerPlanEnvelope): Uint8Array {
  const envelope = parseServerPlanEnvelopeData(input);
  return Buffer.from(stableJson({
    schema: envelope.schema,
    plan: envelope.plan,
    planHash: envelope.planHash,
    revisionId: envelope.revisionId,
    semanticOperations: envelope.semanticOperations,
  }), "utf8");
}

/**
 * Strict structural and semantic consistency validation only. This function
 * does not establish authorization; server code must verify the HMAC first.
 */
export function validateServerPlanEnvelopeData(
  input: unknown,
  expected: ServerPlanEnvelopeExpectations = {},
): ServerPlanEnvelope {
  const envelope = parseServerPlanEnvelopeData(input);
  const actualPlanHash = canonicalChangePlanHash(envelope.plan);
  if (actualPlanHash !== envelope.planHash) {
    throw new Error("SERVER_PLAN_HASH_MISMATCH: persisted hash does not match the inner plan");
  }
  if (expected.expectedPlanHash !== undefined && envelope.planHash !== expected.expectedPlanHash) {
    throw new Error("SERVER_PLAN_HASH_MISMATCH: persisted plan does not match the build job");
  }
  if (expected.expectedRevisionId !== undefined && envelope.revisionId !== expected.expectedRevisionId) {
    throw new Error("SERVER_PLAN_BINDING_MISMATCH: persisted plan belongs to another base revision");
  }

  const remaining = semanticPayloadsFromPlan(envelope.plan);
  for (const operation of envelope.semanticOperations) {
    const match = remaining.findIndex((payload) =>
      payload.entityId === operation.entityId
      && payload.capabilityId === operation.capabilityId
      && payload.payloadHash === operation.payloadHash);
    if (match < 0) {
      throw new Error("SERVER_PLAN_SEMANTIC_MISMATCH: authorization has no exact plan payload");
    }
    remaining.splice(match, 1);
  }
  if (remaining.length > 0) {
    throw new Error("SERVER_PLAN_SEMANTIC_MISMATCH: plan payload has no server authorization");
  }
  return envelope;
}

function semanticPayloadsFromPlan(plan: ChangePlan): Array<{
  entityId: string;
  capabilityId: "easyui.1";
  payloadHash: string;
}> {
  const payloads: Array<{ entityId: string; capabilityId: "easyui.1"; payloadHash: string }> = [];
  for (const operation of plan.operations) {
    if (operation.op === "create" && Object.hasOwn(operation.properties, "tableData")) {
      if (operation.properties["type"] !== "easyui" || operation.properties["proto"] !== 1) {
        throw new Error("SERVER_PLAN_SEMANTIC_MISMATCH: tableData create is not an EasyUI datagrid");
      }
      payloads.push({
        entityId: operation.entityId,
        capabilityId: "easyui.1",
        payloadHash: semanticPayloadHash(operation.properties["tableData"]),
      });
    }
    if (operation.op === "update") {
      for (const change of operation.changes) {
        if (change.path !== "/__kfModuleTableData") continue;
        payloads.push({
          entityId: operation.entityId,
          capabilityId: "easyui.1",
          payloadHash: semanticPayloadHash(change.value),
        });
      }
    }
  }
  return payloads;
}

function parseChangePlan(input: unknown): ChangePlan {
  const parsed = changePlanSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`SERVER_PLAN_SCHEMA_INVALID: ${parsed.error.issues[0]?.message ?? "invalid plan"}`);
  }
  return parsed.data;
}

/**
 * Parses the exact raw persisted representation without allowing Zod to
 * silently strip unsigned fields at any nested ChangePlan level.
 */
export function parseServerPlanEnvelopeData(input: unknown): ServerPlanEnvelope {
  assertDescriptorSafeJson(input);
  const parsed = ServerPlanEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`SERVER_PLAN_SCHEMA_INVALID: ${parsed.error.issues[0]?.message ?? "invalid envelope"}`);
  }
  assertDeepExact(input, parsed.data, "$", new Set());
  return parsed.data;
}

function rawInvalid(detail: string): never {
  throw new Error(`SERVER_PLAN_RAW_INVALID: ${detail}`);
}

function assertDescriptorSafeJson(value: unknown): void {
  const stack: Array<{ value: unknown; path: string; depth: number }> = [{ value, path: "$", depth: 0 }];
  const seen = new Set<object>();
  let nodes = 0;
  let totalStringBytes = 0;
  const addStringBytes = (text: string, path: string) => {
    totalStringBytes += Buffer.byteLength(text, "utf8");
    if (totalStringBytes > SERVER_PLAN_RAW_LIMITS.maxTotalStringBytes) {
      rawInvalid(`total string budget exceeded at ${path}`);
    }
  };
  while (stack.length > 0) {
    const current = stack.pop()!;
    nodes += 1;
    if (nodes > SERVER_PLAN_RAW_LIMITS.maxNodes) rawInvalid(`node budget exceeded at ${current.path}`);
    if (current.depth > SERVER_PLAN_RAW_LIMITS.maxDepth) rawInvalid(`depth budget exceeded at ${current.path}`);
    const nested = current.value;
    if (nested === null || typeof nested === "boolean") continue;
    if (typeof nested === "string") {
      addStringBytes(nested, current.path);
      continue;
    }
    if (typeof nested === "number") {
      if (Number.isFinite(nested)) continue;
      rawInvalid(`non-finite number at ${current.path}`);
    }
    if (typeof nested !== "object") rawInvalid(`non-JSON value at ${current.path}`);
    if (seen.has(nested)) rawInvalid(`cyclic or shared object at ${current.path}`);
    seen.add(nested);
    if (Array.isArray(nested)) {
      if (Object.getPrototypeOf(nested) !== Array.prototype) rawInvalid(`array prototype at ${current.path}`);
      const lengthDescriptor = Object.getOwnPropertyDescriptor(nested, "length");
      const lengthValue: unknown = lengthDescriptor !== undefined && "value" in lengthDescriptor
        ? lengthDescriptor.value
        : undefined;
      if (typeof lengthValue !== "number" || !Number.isSafeInteger(lengthValue) || lengthValue < 0) {
        rawInvalid(`invalid array length at ${current.path}`);
      }
      const length = lengthValue;
      if (length > SERVER_PLAN_RAW_LIMITS.maxArrayLength) rawInvalid(`array length budget exceeded at ${current.path}`);
      const keys = Reflect.ownKeys(nested);
      if (keys.length !== length + 1) rawInvalid(`array has an extra property or hole at ${current.path}`);
      for (const key of keys) {
        if (typeof key === "symbol") rawInvalid(`symbol array property at ${current.path}`);
        if (key === "length") continue;
        if (!/^(?:0|[1-9]\d*)$/.test(key) || Number(key) >= length) {
          rawInvalid(`array has an extra property at ${current.path}`);
        }
      }
      for (let index = 0; index < length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(nested, String(index));
        if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
          rawInvalid(`array accessor or non-enumerable item at ${current.path}[${index}]`);
        }
        stack.push({ value: descriptor.value, path: `${current.path}[${index}]`, depth: current.depth + 1 });
      }
      continue;
    }
    if (Object.getPrototypeOf(nested) !== Object.prototype) rawInvalid(`object prototype at ${current.path}`);
    const keys = Reflect.ownKeys(nested);
    if (keys.length > SERVER_PLAN_RAW_LIMITS.maxKeysPerObject) {
      rawInvalid(`object key budget exceeded at ${current.path}`);
    }
    for (const key of keys) {
      if (typeof key === "symbol") rawInvalid(`symbol property at ${current.path}`);
      addStringBytes(key, current.path);
      if (key === "__proto__" || key === "prototype" || key === "constructor") {
        rawInvalid(`reserved property at ${current.path}.${key}`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(nested, key);
      if (descriptor === undefined || !("value" in descriptor)) rawInvalid(`accessor at ${current.path}.${key}`);
      if (!descriptor.enumerable) rawInvalid(`non-enumerable property at ${current.path}.${key}`);
      stack.push({ value: descriptor.value, path: `${current.path}.${key}`, depth: current.depth + 1 });
    }
  }
}

function assertDeepExact(raw: unknown, parsed: unknown, path: string, seen: Set<object>): void {
  if (raw === null || parsed === null || typeof raw !== "object" || typeof parsed !== "object") {
    if (!Object.is(raw, parsed)) throw new Error(`SERVER_PLAN_RAW_UNKNOWN_FIELD: normalized value at ${path}`);
    return;
  }
  if (seen.has(raw)) throw new Error(`SERVER_PLAN_RAW_INVALID: cycle at ${path}`);
  seen.add(raw);
  try {
    const rawKeys = Reflect.ownKeys(raw).filter((key) => key !== "length");
    const parsedKeys = Reflect.ownKeys(parsed).filter((key) => key !== "length");
    const parsedKeySet = new Set(parsedKeys);
    if (rawKeys.length !== parsedKeys.length
      || rawKeys.some((key) => !parsedKeySet.has(key))) {
      throw new Error(`SERVER_PLAN_RAW_UNKNOWN_FIELD: exact schema mismatch at ${path}`);
    }
    for (const key of rawKeys) {
      const rawDescriptor = Object.getOwnPropertyDescriptor(raw, key);
      const parsedDescriptor = Object.getOwnPropertyDescriptor(parsed, key);
      if (rawDescriptor === undefined || parsedDescriptor === undefined
        || !("value" in rawDescriptor) || !("value" in parsedDescriptor)) {
        throw new Error(`SERVER_PLAN_RAW_INVALID: descriptor mismatch at ${path}`);
      }
      assertDeepExact(rawDescriptor.value, parsedDescriptor.value, `${path}.${String(key)}`, seen);
    }
  } finally {
    seen.delete(raw);
  }
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value), null, 2);
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson);
  if (value !== null && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const key of Object.keys(value).sort()) {
      output[key] = sortJson((value as Record<string, unknown>)[key]);
    }
    return output;
  }
  return value;
}
