import {
  modelAssetIdToWorkspaceAssetId,
  workspaceAssetIdToModelId,
} from "@kf/contracts";

/** 稳定、模型安全的别名，用于私有WorkspaceAsset UUID。 */
export function toModelAssetId(id: string): string {
  return workspaceAssetIdToModelId(id);
}

/** 严格反向映射；原始UUID和非标准别名被拒绝。 */
export function fromModelAssetId(id: string): string {
  return modelAssetIdToWorkspaceAssetId(id);
}
