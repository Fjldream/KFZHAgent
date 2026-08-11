import { z } from "zod";

const stableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/);

/**
 * Registered logical asset metadata. Physical paths, storage credentials, and
 * executable content are intentionally resolved outside the planning boundary.
 */
export const AssetRecordSchema = z
  .object({
    id: stableIdSchema,
    kind: z.enum(["image", "icon", "document", "media", "data"]),
    name: z.string().trim().min(1).max(200),
    mimeType: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(1_000),
  })
  .strict();

/** A non-sensitive result of resolving a registered asset for a module. */
export const ResolvedAssetSchema = z
  .object({
    assetId: stableIdSchema,
    status: z.enum(["resolved", "unavailable", "pending"]),
    resolvedName: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export type AssetRecord = z.infer<typeof AssetRecordSchema>;
export type ResolvedAsset = z.infer<typeof ResolvedAssetSchema>;
