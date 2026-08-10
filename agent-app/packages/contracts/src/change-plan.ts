import { z } from "zod";
import { ComponentStyleSpecSchema } from "./ui-style.js";

/**
 * A JSON-pointer style field patch applied to a target entity.
 */
export const fieldPatchSchema = z.object({
  path: z.string(),
  value: z.unknown()
});
export type FieldPatch = z.infer<typeof fieldPatchSchema>;

/**
 * Create an entity in the target workspace.
 */
export const createOperationSchema = z.object({
  op: z.literal("create"),
  entityType: z.string(),
  entityId: z.string(),
  properties: z.record(z.string(), z.unknown()).default({})
});
export type CreateOperation = z.infer<typeof createOperationSchema>;

/**
 * Apply JSON-pointer field patches to an existing entity.
 *
 * `entityType` is an optional hint (control/page/variable) used by some
 * pipeline layers for validation/allowlist lookup; the entity itself is
 * located by `entityId` (KF GUID). It is optional so plans produced by older
 * planners keep parsing.
 */
export const updateOperationSchema = z.object({
  op: z.literal("update"),
  entityId: z.string(),
  entityType: z.string().optional(),
  changes: z.array(fieldPatchSchema)
});
export type UpdateOperation = z.infer<typeof updateOperationSchema>;

/**
 * Delete an entity; destructive operations must be explicitly confirmed.
 *
 * `digest` is the SHA-256 of the operation content
 * (`sha256(stableStringify({ op: "delete", entityId }))`) and is REQUIRED so a
 * confirmed delete can be checked against the exact operation the user agreed
 * to. It is a schema field (not a free extension) so zod parsing — which
 * strips unknown keys — never drops it.
 */
export const deleteOperationSchema = z.object({
  op: z.literal("delete"),
  entityId: z.string(),
  destructiveConfirmed: z.boolean(),
  digest: z.string()
});
export type DeleteOperation = z.infer<typeof deleteOperationSchema>;

/**
 * Apply a structured style specification to a control.
 */
export const applyStyleOperationSchema = z.object({
  op: z.literal("applyStyle"),
  entityId: z.string().min(1),
  entityType: z.literal("control"),
  style: ComponentStyleSpecSchema,
}).strict();
export type ApplyStyleOperation = z.infer<typeof applyStyleOperationSchema>;

export const changeOperationSchema = z.discriminatedUnion("op", [
  createOperationSchema,
  updateOperationSchema,
  deleteOperationSchema,
  applyStyleOperationSchema
]);
export type ChangeOperation = z.infer<typeof changeOperationSchema>;

export const changePlanSchema = z.object({
  schema: z.literal("kf-change-plan/v1"),
  workspaceId: z.string(),
  operations: z.array(changeOperationSchema)
});
export type ChangePlan = z.infer<typeof changePlanSchema>;
