import { z } from "zod";
import { ComponentStyleSpecSchema } from "./ui-style.js";
import { modelAssetIdToWorkspaceAssetId } from "./asset.js";

/**
 * A JSON-pointer style field patch applied to a target entity.
 */
export const fieldPatchSchema = z.object({
  path: z.string(),
  value: z.unknown()
}).strict();
export type FieldPatch = z.infer<typeof fieldPatchSchema>;

/** Canonical bounded identifier shared by every change operation. */
export const ChangeEntityIdSchema = z.string().trim().min(1).max(100);

/**
 * Create an entity in the target workspace.
 */
export const createOperationSchema = z.object({
  op: z.literal("create"),
  entityType: z.string(),
  entityId: ChangeEntityIdSchema,
  properties: z.record(z.string(), z.unknown()).default({})
}).strict();
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
  entityId: ChangeEntityIdSchema,
  entityType: z.string().optional(),
  changes: z.array(fieldPatchSchema)
}).strict();
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
  entityId: ChangeEntityIdSchema,
  destructiveConfirmed: z.boolean(),
  digest: z.string()
}).strict();
export type DeleteOperation = z.infer<typeof deleteOperationSchema>;

/**
 * Apply a structured style specification to a control.
 */
export const applyStyleOperationSchema = z.object({
  op: z.literal("applyStyle"),
  entityId: ChangeEntityIdSchema,
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

/** Model/public plan: server-owned asset bindings are deliberately absent. */
export const changePlanSchema = z.object({
  schema: z.literal("kf-change-plan/v1"),
  workspaceId: z.string(),
  operations: z.array(changeOperationSchema)
}).strict();
export type ChangePlan = z.infer<typeof changePlanSchema>;

const ModelAssetIdSchema = z.string().regex(/^asset-[0-9a-f]{32}$/);
const WorkspaceAssetIdSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
const AssetSha256Schema = z.string().regex(/^[0-9a-f]{64}$/);
const AssetMediaTypeSchema = z.enum(["image/png", "image/jpeg", "image/webp"]);

/** Server/compiler-owned binding from one native image entity to a catalog asset. */
export const ChangePlanAssetBindingSchema = z.object({
  assetId: ModelAssetIdSchema,
  workspaceAssetId: WorkspaceAssetIdSchema,
  entityId: ChangeEntityIdSchema,
  controlId: ChangeEntityIdSchema,
  capabilityId: z.literal("image"),
  targetPath: z.string().regex(/^project\/res\/images\/[0-9a-f]{64}\.(?:png|jpg|webp)$/),
  mediaType: AssetMediaTypeSchema,
  sha256: AssetSha256Schema,
  sizeBytes: z.number().int().positive().max(50 * 1024 * 1024),
}).strict().superRefine((binding, ctx) => {
  if (modelAssetIdToWorkspaceAssetId(binding.assetId) !== binding.workspaceAssetId) {
    ctx.addIssue({ code: "custom", path: ["workspaceAssetId"], message: "asset alias identity mismatch" });
  }
  const extension = binding.mediaType === "image/png" ? "png" : binding.mediaType === "image/jpeg" ? "jpg" : "webp";
  if (binding.targetPath !== `project/res/images/${binding.sha256}.${extension}`) {
    ctx.addIssue({ code: "custom", path: ["targetPath"], message: "asset target does not match signed media and checksum" });
  }
});
export type ChangePlanAssetBinding = z.infer<typeof ChangePlanAssetBindingSchema>;

/**
 * Durable internal plan persisted only inside the HMAC server envelope.
 * Keeping this separate from `changePlanSchema` makes model-authored
 * `assetBindings` a schema error instead of silently stripping the field.
 */
export const internalChangePlanSchema = z.object({
  schema: z.literal("kf-change-plan/v1"),
  workspaceId: z.string(),
  operations: z.array(changeOperationSchema),
  assetBindings: z.array(ChangePlanAssetBindingSchema).max(500).optional(),
}).strict().superRefine((plan, ctx) => {
  const entities = new Set<string>();
  const assetFacts = new Map<string, string>();
  for (const [index, binding] of (plan.assetBindings ?? []).entries()) {
    if (entities.has(binding.entityId)) {
      ctx.addIssue({
        code: "custom",
        path: ["assetBindings", index, "entityId"],
        message: `duplicate asset binding entity: ${binding.entityId}`,
      });
    }
    entities.add(binding.entityId);
    const facts = JSON.stringify({
      workspaceAssetId: binding.workspaceAssetId,
      targetPath: binding.targetPath,
      mediaType: binding.mediaType,
      sha256: binding.sha256,
      sizeBytes: binding.sizeBytes,
    });
    const previous = assetFacts.get(binding.assetId);
    if (previous !== undefined && previous !== facts) {
      ctx.addIssue({ code: "custom", path: ["assetBindings", index], message: "inconsistent signed facts for asset" });
    }
    assetFacts.set(binding.assetId, facts);
  }
});
export type InternalChangePlan = z.infer<typeof internalChangePlanSchema>;
