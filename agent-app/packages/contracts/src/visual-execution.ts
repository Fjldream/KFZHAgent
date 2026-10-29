// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { z } from "zod";
import { RunModeSchema } from "./agent-run.js";

const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const scope = { tenantId: identifier, workspaceId: identifier, runId: identifier, conversationId: identifier,
  baseRevisionId: identifier.nullable(), runConfigHash: hash };

/** Hash-pinned server configuration, not a user consent or reusable execution capability. */
export const VisualAnalysisConfigSnapshotSchema = z.object({
  schema: z.literal("kf-visual-analysis-config/v1"), ...scope,
  analysisVersion: z.literal("visual-analysis@1"), modelConfigHash: hash,
}).strict();
export const VisualAnalysisImageSnapshotSchema = z.object({
  schema: z.literal("kf-visual-analysis-image/v1"), ...scope, modelConfigHash: hash,
  assetId: identifier, sourceHash: hash, derivativeHash: hash, instructionHash: hash,
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  width: z.number().int().positive().max(8192), height: z.number().int().positive().max(8192),
  scale: z.number().finite().positive().max(1),
}).strict();

export const VisualEgressPolicyPatchSchema = z.object({ imageEgressAllowed: z.boolean() }).strict();
export const VisualEgressPolicySchema = z.object({ schemaVersion: z.literal(1), imageEgressAllowed: z.boolean(),
  coverage: z.literal("reference-images-and-derived-structure") }).strict();
export type VisualEgressPolicy = z.infer<typeof VisualEgressPolicySchema>;

export const VISUAL_EGRESS_NOTICE_VERSION = "visual-egress@1";
/** Versioned notice scope, not a replacement for administrator policy or blueprint approval. */
export const VISUAL_EGRESS_NOTICE = "将所选参考图的安全派生图片发送给服务器配置的视觉模型，并将识别出的文字和结构用于后续工程规划；原参考图默认不打包进工程。";
const attachmentIds = z.array(z.string().uuid()).min(1).max(3).refine(ids => new Set(ids).size === ids.length);
export const VisualRunOptionsSchema = z.object({
  primaryAssetId: z.string().uuid(),
  sendingConsent: z.object({ noticeVersion: z.literal(VISUAL_EGRESS_NOTICE_VERSION), accepted: z.literal(true) }).strict(),
}).strict();
export const VisualRunAdmissionRequestSchema = VisualRunOptionsSchema.extend({ attachmentIds })
  .refine(input => input.attachmentIds.includes(input.primaryAssetId));

/** Private server route: never accepted from HTTP bodies or exposed via workbench projections. */
export const FrozenVisualModelRouteSchema = z.object({
  provider: z.literal("deepseek"), baseUrl: z.string().url().max(2000).refine(value => {
    try {
      const url = new URL(value);
      return url.protocol === "https:" && !url.username && !url.password && !url.search && !url.hash;
    } catch { return false; }
  }),
  model: z.string().min(1).max(200).regex(/^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/),
  supportsJson: z.literal(true), supportsVision: z.literal(true), supportsThinking: z.boolean(),
  maxContextTokens: z.number().int().positive().max(10_000_000), timeoutMs: z.number().int().positive().max(120000),
  pricingVersion: z.string().min(1).max(128).nullable(),
}).strict();
export const FrozenReferenceTransformSchema = z.object({
  version: z.literal(1), autoOrient: z.literal(true),
  sourceWidth: z.number().int().positive().max(8192), sourceHeight: z.number().int().positive().max(8192),
  orientedWidth: z.number().int().positive().max(8192), orientedHeight: z.number().int().positive().max(8192),
  scaleX: z.number().finite().positive().max(1), scaleY: z.number().finite().positive().max(1), scale: z.number().finite().positive().max(1),
}).strict();
export const FrozenVisualReferenceSchema = z.object({
  assetId: z.string().uuid(), role: z.enum(["primary", "supplement"]), sourceHash: hash,
  sourceMimeType: z.enum(["image/png", "image/jpeg", "image/webp"]), sourceWidth: z.number().int().positive().max(8192),
  sourceHeight: z.number().int().positive().max(8192), sourceBytes: z.number().int().positive().max(10 * 1024 * 1024),
  derivative: z.object({ hash, mimeType: z.literal("image/webp"), width: z.number().int().positive().max(2048),
    height: z.number().int().positive().max(2048), byteSize: z.number().int().positive().max(10 * 1024 * 1024),
    scale: z.number().finite().positive().max(1), transform: FrozenReferenceTransformSchema,
  }).strict(),
}).strict().superRefine((image, ctx) => {
  const { transform } = image.derivative;
  if (image.sourceWidth * image.sourceHeight > 32_000_000 || transform.sourceWidth !== image.sourceWidth || transform.sourceHeight !== image.sourceHeight
    || !((transform.orientedWidth === image.sourceWidth && transform.orientedHeight === image.sourceHeight)
      || (transform.orientedWidth === image.sourceHeight && transform.orientedHeight === image.sourceWidth))
    || transform.scale !== image.derivative.scale || transform.scaleX !== image.derivative.width / transform.orientedWidth
    || transform.scaleY !== image.derivative.height / transform.orientedHeight
    || transform.scale !== Math.min(1, 2048 / Math.max(transform.orientedWidth, transform.orientedHeight))) {
    ctx.addIssue({ code: "custom", message: "VISUAL_REFERENCE_TRANSFORM_INVALID" });
  }
});
export const VisualRunAdmissionContentSchema = z.object({
  schema: z.literal("kf-visual-run-admission/v1"), tenantId: identifier, workspaceId: identifier, conversationId: identifier, runId: identifier,
  requestedByUserId: identifier, baseRevisionId: identifier, mode: RunModeSchema, runConfigHash: hash, actionHash: hash, instructionHash: hash,
  attachments: z.array(FrozenVisualReferenceSchema).min(1).max(3),
  analysisModel: z.object({ route: FrozenVisualModelRouteSchema, configHash: hash,
    promptVersion: z.string().min(1).max(128), analysisVersion: z.literal("visual-analysis@1") }).strict(),
  sendingConsent: z.object({ noticeVersion: z.literal(VISUAL_EGRESS_NOTICE_VERSION), noticeHash: hash, userId: identifier,
    acceptedAt: z.string().datetime(), coverage: z.literal("reference-images-and-derived-structure"), attachmentSetHash: hash,
  }).strict(),
}).strict().superRefine((input, ctx) => {
  if (input.attachments.filter(image => image.role === "primary").length !== 1
    || new Set(input.attachments.map(image => image.assetId)).size !== input.attachments.length
    || input.sendingConsent.userId !== input.requestedByUserId) ctx.addIssue({ code: "custom", message: "VISUAL_ADMISSION_IDENTITY_INVALID" });
});
export const VisualRunAdmissionSnapshotSchema = z.object({ content: VisualRunAdmissionContentSchema, inputHash: hash }).strict();
export const VisualRunInputSnapshotSchema = z.object({ attachmentIds, baseRevisionPolicy: z.literal("fixed"),
  visualAdmission: VisualRunAdmissionSnapshotSchema.optional() }).strict();
export type VisualRunAdmissionSnapshot = z.infer<typeof VisualRunAdmissionSnapshotSchema>;
export type FrozenVisualReference = z.infer<typeof FrozenVisualReferenceSchema>;
// end
