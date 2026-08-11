import { z } from "zod";

const stableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine((value) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));

const modelTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_000)
  .refine((value) => !/<script\b|javascript\s*:|data\s*:\s*text\s*\/\s*html/i.test(value));

/**
 * Registered logical asset metadata. Physical paths, storage credentials, and
 * executable content are intentionally resolved outside the planning boundary.
 */
export const AssetRecordSchema = z
  .object({
    id: stableIdSchema,
    kind: z.enum(["image", "icon", "document", "media", "data"]),
    name: modelTextSchema.max(200),
    mimeType: z.string().trim().min(1).max(200),
    description: modelTextSchema,
  })
  .strict();

/** A non-sensitive result of resolving a registered asset for a module. */
export const ResolvedAssetSchema = z
  .object({
    assetId: stableIdSchema,
    status: z.enum(["resolved", "unavailable", "pending"]),
    resolvedName: modelTextSchema.max(200).optional(),
  })
  .strict();

export type AssetRecord = z.infer<typeof AssetRecordSchema>;
export type ResolvedAsset = z.infer<typeof ResolvedAssetSchema>;

const UUID_RE = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/;
const MODEL_ASSET_ID_RE = /^asset-([0-9a-f]{32})$/;

/** Public alias for a private WorkspaceAsset UUID; contains no storage metadata. */
export function workspaceAssetIdToModelId(id: string): string {
  const match = UUID_RE.exec(id);
  if (match === null) throw new Error("invalid workspace asset id");
  return AssetRecordSchema.shape.id.parse(`asset-${match.slice(1).join("")}`);
}

/** Strict reverse mapping used only before a tenant/workspace-scoped lookup. */
export function modelAssetIdToWorkspaceAssetId(id: string): string {
  const match = MODEL_ASSET_ID_RE.exec(id);
  if (match === null) throw new Error("invalid model asset id");
  const hex = match[1]!;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
