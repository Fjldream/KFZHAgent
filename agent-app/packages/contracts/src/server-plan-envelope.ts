import { createHash } from "node:crypto";
import { z } from "zod";
import { changePlanSchema, type ChangePlan } from "./change-plan.js";

const Sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);

export const TrustedSemanticOperationInputSchema = z.object({
  kind: z.literal("kf.table-data/v1"),
  entityId: z.string().trim().min(1).max(100),
  capabilityId: z.literal("easyui.1"),
  sourceModuleId: z.string().trim().min(1).max(100),
  payloadHash: Sha256Schema,
}).strict();

export const TrustedSemanticOperationSchema = TrustedSemanticOperationInputSchema.extend({
  /** Server-issued digest binding this authorization to one plan and revision. */
  bindingHash: Sha256Schema,
}).strict();

export const ServerPlanEnvelopeSchema = z.object({
  schema: z.literal("kf-server-plan-envelope/v1"),
  plan: changePlanSchema,
  planHash: Sha256Schema,
  revisionId: z.string().trim().min(1).max(100),
  semanticOperations: z.array(TrustedSemanticOperationSchema).max(500),
}).strict();

export type TrustedSemanticOperationInput = z.infer<typeof TrustedSemanticOperationInputSchema>;
export type TrustedSemanticOperation = z.infer<typeof TrustedSemanticOperationSchema>;
export type ServerPlanEnvelope = z.infer<typeof ServerPlanEnvelopeSchema>;

export interface ServerPlanEnvelopeExpectations {
  expectedPlanHash?: string;
  expectedRevisionId?: string;
}

/** Canonical JSON digest shared by the graph, Prisma boundary, and worker. */
export function canonicalServerHash(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

/** Digest of the exact typed semantic payload materialized by a native adapter. */
export function semanticPayloadHash(value: unknown): string {
  return canonicalServerHash(value);
}

/** Canonical hash of the normalized runtime patch shape used by every build job. */
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

export function createServerPlanEnvelope(input: {
  plan: ChangePlan;
  revisionId: string;
  semanticOperations: readonly TrustedSemanticOperationInput[];
}): ServerPlanEnvelope {
  const plan = parseChangePlan(input.plan);
  const planHash = canonicalChangePlanHash(plan);
  const semanticOperations = input.semanticOperations.map((raw) => {
    const operation = parseSemanticInput(raw);
    return {
      ...operation,
      bindingHash: semanticBindingHash(input.revisionId, planHash, operation),
    };
  });
  const envelope = parseEnvelopeShape({
    schema: "kf-server-plan-envelope/v1",
    plan,
    planHash,
    revisionId: input.revisionId,
    semanticOperations,
  });
  assertServerPlanEnvelope(envelope);
  return envelope;
}

/**
 * Parses a database/checkpoint clone and re-verifies every server-owned
 * binding. Merely satisfying the Zod shape is intentionally insufficient.
 */
export function parseServerPlanEnvelope(
  input: unknown,
  expected: ServerPlanEnvelopeExpectations = {},
): ServerPlanEnvelope {
  const envelope = parseEnvelopeShape(input);
  assertServerPlanEnvelope(envelope, expected);
  return envelope;
}

function assertServerPlanEnvelope(
  envelope: ServerPlanEnvelope,
  expected: ServerPlanEnvelopeExpectations = {},
): void {
  const actualPlanHash = canonicalChangePlanHash(envelope.plan);
  if (actualPlanHash !== envelope.planHash) {
    throw new Error(`SERVER_PLAN_HASH_MISMATCH: expected ${envelope.planHash}, got ${actualPlanHash}`);
  }
  if (expected.expectedPlanHash !== undefined && envelope.planHash !== expected.expectedPlanHash) {
    throw new Error("SERVER_PLAN_HASH_MISMATCH: persisted plan does not match the build job");
  }
  if (expected.expectedRevisionId !== undefined && envelope.revisionId !== expected.expectedRevisionId) {
    throw new Error("SERVER_PLAN_BINDING_MISMATCH: persisted plan belongs to another base revision");
  }

  const payloads = semanticPayloadsFromPlan(envelope.plan);
  const remaining = [...payloads];
  const seenBindings = new Set<string>();
  for (const operation of envelope.semanticOperations) {
    const expectedBinding = semanticBindingHash(envelope.revisionId, envelope.planHash, operation);
    if (operation.bindingHash !== expectedBinding || seenBindings.has(operation.bindingHash)) {
      throw new Error("SERVER_PLAN_BINDING_MISMATCH: semantic authorization was copied or rebound");
    }
    seenBindings.add(operation.bindingHash);
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

function semanticBindingHash(
  revisionId: string,
  planHash: string,
  operation: TrustedSemanticOperationInput,
): string {
  return canonicalServerHash({
    schema: "kf-server-semantic-binding/v1",
    revisionId,
    planHash,
    kind: operation.kind,
    entityId: operation.entityId,
    capabilityId: operation.capabilityId,
    sourceModuleId: operation.sourceModuleId,
    payloadHash: operation.payloadHash,
  });
}

function parseChangePlan(input: unknown): ChangePlan {
  const parsed = changePlanSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`SERVER_PLAN_SCHEMA_INVALID: ${parsed.error.issues[0]?.message ?? "invalid plan"}`);
  }
  return parsed.data;
}

function parseSemanticInput(input: unknown): TrustedSemanticOperationInput {
  const parsed = TrustedSemanticOperationInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`SERVER_PLAN_SCHEMA_INVALID: ${parsed.error.issues[0]?.message ?? "invalid semantic operation"}`);
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
