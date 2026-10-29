import type { ArtifactStorage } from "@kf/artifact-storage";
import { LocalArtifactStorage } from "@kf/artifact-storage";
import path from "node:path";

/**
 * API服务后端私有存储的注入令牌。根目录可通过ARTIFACT_STORAGE_ROOT配置（默认为`<cwd>/.kf-artifacts`，仅在测试中通过`.env.*`风格的忽略来忽略；部署必须设置明确的持久路径）。
 */
export const ARTIFACT_STORAGE = Symbol("ARTIFACT_STORAGE");

export function createArtifactStorage(): ArtifactStorage {
  const root =
    process.env.ARTIFACT_STORAGE_ROOT ??
    path.resolve(process.cwd(), ".kf-artifacts");
  return new LocalArtifactStorage(root);
}
