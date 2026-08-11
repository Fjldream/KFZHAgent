import { AssetRecordSchema } from "@kf/contracts";

const UUID_RE = /^([0-9a-f]{8})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{4})-([0-9a-f]{12})$/;
const MODEL_ASSET_ID_RE = /^asset-([0-9a-f]{32})$/;

/** Stable, model-safe alias for a private WorkspaceAsset UUID. */
export function toModelAssetId(id: string): string {
  const match = UUID_RE.exec(id);
  if (match === null) throw new Error("invalid workspace asset id");
  return AssetRecordSchema.shape.id.parse(`asset-${match.slice(1).join("")}`);
}

/** Strict reverse mapping; raw UUIDs and non-canonical aliases are rejected. */
export function fromModelAssetId(id: string): string {
  const match = MODEL_ASSET_ID_RE.exec(id);
  if (match === null) throw new Error("invalid model asset id");
  const hex = match[1]!;
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
