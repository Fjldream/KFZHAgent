import { z } from "zod";

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
 */
export const updateOperationSchema = z.object({
  op: z.literal("update"),
  entityId: z.string(),
  changes: z.array(fieldPatchSchema)
});
export type UpdateOperation = z.infer<typeof updateOperationSchema>;

/**
 * Delete an entity; destructive operations must be explicitly confirmed.
 */
export const deleteOperationSchema = z.object({
  op: z.literal("delete"),
  entityId: z.string(),
  destructiveConfirmed: z.boolean()
});
export type DeleteOperation = z.infer<typeof deleteOperationSchema>;

export const changeOperationSchema = z.discriminatedUnion("op", [
  createOperationSchema,
  updateOperationSchema,
  deleteOperationSchema
]);
export type ChangeOperation = z.infer<typeof changeOperationSchema>;

export const changePlanSchema = z.object({
  schema: z.literal("kf-change-plan/v1"),
  workspaceId: z.string(),
  operations: z.array(changeOperationSchema)
});
export type ChangePlan = z.infer<typeof changePlanSchema>;
