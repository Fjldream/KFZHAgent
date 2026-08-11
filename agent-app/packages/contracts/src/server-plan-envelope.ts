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
  assertDescriptorSafeJson(input, "$", new Set());
  const parsed = ServerPlanEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`SERVER_PLAN_SCHEMA_INVALID: ${parsed.error.issues[0]?.message ?? "invalid envelope"}`);
  }
  assertDeepExact(input, parsed.data, "$", new Set());
  return parsed.data;
}

function assertDescriptorSafeJson(value: unknown, path: string, seen: Set<object>): void {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (Number.isFinite(value)) return;
    throw new Error(`SERVER_PLAN_RAW_INVALID: non-finite number at ${path}`);
  }
  if (typeof value !== "object") {
    throw new Error(`SERVER_PLAN_RAW_INVALID: non-JSON value at ${path}`);
  }
  if (seen.has(value)) throw new Error(`SERVER_PLAN_RAW_INVALID: cycle at ${path}`);
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new Error(`SERVER_PLAN_RAW_INVALID: array prototype at ${path}`);
      }
      const keys = Reflect.ownKeys(value);
      if (keys.some((key) => typeof key === "symbol")) {
        throw new Error(`SERVER_PLAN_RAW_INVALID: symbol array property at ${path}`);
      }
      const expected = new Set(["length", ...Array.from({ length: value.length }, (_, index) => String(index))]);
      if (keys.length !== expected.size || keys.some((key) => !expected.has(String(key)))) {
        throw new Error(`SERVER_PLAN_RAW_INVALID: array has extra property or hole at ${path}`);
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) {
          throw new Error(`SERVER_PLAN_RAW_INVALID: array accessor or non-enumerable item at ${path}[${index}]`);
        }
        assertDescriptorSafeJson(descriptor.value, `${path}[${index}]`, seen);
      }
      return;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new Error(`SERVER_PLAN_RAW_INVALID: object prototype at ${path}`);
    }
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key === "symbol") {
        throw new Error(`SERVER_PLAN_RAW_INVALID: symbol property at ${path}`);
      }
      if (key === "__proto__" || key === "prototype" || key === "constructor") {
        throw new Error(`SERVER_PLAN_RAW_INVALID: reserved property at ${path}.${key}`);
      }
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor)) {
        throw new Error(`SERVER_PLAN_RAW_INVALID: accessor at ${path}.${key}`);
      }
      if (!descriptor.enumerable) {
        throw new Error(`SERVER_PLAN_RAW_INVALID: non-enumerable property at ${path}.${key}`);
      }
      assertDescriptorSafeJson(descriptor.value, `${path}.${key}`, seen);
    }
  } finally {
    seen.delete(value);
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
