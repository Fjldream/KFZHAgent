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
  const envelope = parseEnvelopeShape(input);
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
  const envelope = parseEnvelopeShape(input);
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

function parseEnvelopeShape(input: unknown): ServerPlanEnvelope {
  const parsed = ServerPlanEnvelopeSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`SERVER_PLAN_SCHEMA_INVALID: ${parsed.error.issues[0]?.message ?? "invalid envelope"}`);
  }
  return parsed.data;
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
