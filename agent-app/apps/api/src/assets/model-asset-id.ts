import {
  modelAssetIdToWorkspaceAssetId,
  workspaceAssetIdToModelId,
} from "@kf/contracts";

/** Stable, model-safe alias for a private WorkspaceAsset UUID. */
export function toModelAssetId(id: string): string {
  return workspaceAssetIdToModelId(id);
}

/** Strict reverse mapping; raw UUIDs and non-canonical aliases are rejected. */
export function fromModelAssetId(id: string): string {
  return modelAssetIdToWorkspaceAssetId(id);
}
