import { z } from "zod";
import { ComponentStyleSpecSchema } from "./ui-style.js";
import { modelAssetIdToWorkspaceAssetId } from "./asset.js";

/**
 * 应用于目标实体的JSON-pointer风格字段修补。
 */
export const fieldPatchSchema = z.object({
  path: z.string(),
  value: z.unknown()
}).strict();
export type FieldPatch = z.infer<typeof fieldPatchSchema>;

/** 所有变更操作共用的规范有界标识符。 */
export const ChangeEntityIdSchema = z.string().trim().min(1).max(100);

/**
 * 在目标工作空间中创建一个实体。
 */
export const createOperationSchema = z.object({
  op: z.literal("create"),
  entityType: z.string(),
  entityId: ChangeEntityIdSchema,
  properties: z.record(z.string(), z.unknown()).default({})
}).strict();
export type CreateOperation = z.infer<typeof createOperationSchema>;

/**
 * 向现有实体应用 JSON Pointer 字段补丁。
 *
 * `entityType` 是可选提示（control/page/variable），某些管线层使用它进行校验或允许列表查询；实体本身通过 `entityId`（KF GUID）定位。该字段为可选项，以便旧版规划器生成的计划仍可解析。
 */
export const updateOperationSchema = z.object({
  op: z.literal("update"),
  entityId: ChangeEntityIdSchema,
  entityType: z.string().optional(),
  changes: z.array(fieldPatchSchema)
}).strict();
export type UpdateOperation = z.infer<typeof updateOperationSchema>;

/**
 * 删除实体；破坏性操作必须得到显式确认。
 *
 * `digest` 是操作内容的 SHA-256（`sha256(stableStringify({ op: "delete", entityId }))`），并且是必填字段，因此可以用用户确认的删除与其同意的确切操作进行核对。它是 schema 字段（不是自由扩展），所以 zod 解析不会将其作为未知键删除。
 */
export const deleteOperationSchema = z.object({
  op: z.literal("delete"),
  entityId: ChangeEntityIdSchema,
  destructiveConfirmed: z.boolean(),
  digest: z.string()
}).strict();
export type DeleteOperation = z.infer<typeof deleteOperationSchema>;

/**
 * 为控制应用结构化的样式规格
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

/** 模型/公共计划：服务器拥有资产绑定故意被排除 */
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

/** 从一个原生图像实体到一个目录资产的服务器/编译器拥有绑定 */
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
  creative: z.object({
    artifactHash: AssetSha256Schema,
    materializationHash: AssetSha256Schema,
  }).strict().optional(),
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
