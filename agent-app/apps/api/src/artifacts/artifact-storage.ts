import type { ArtifactStorage } from "@kf/artifact-storage";
import { LocalArtifactStorage } from "@kf/artifact-storage";
import path from "node:path";

/**
 * Injection token for the private artifact storage backing the API services.
 * The root directory is configurable via ARTIFACT_STORAGE_ROOT (defaults to
 * `<cwd>/.kf-artifacts`, which is gitignored through the `.env.*`-style ignore
 * only in tests; deployments must set an explicit durable path).
 */
export const ARTIFACT_STORAGE = Symbol("ARTIFACT_STORAGE");

export function createArtifactStorage(): ArtifactStorage {
  const root =
    process.env.ARTIFACT_STORAGE_ROOT ??
    path.resolve(process.cwd(), ".kf-artifacts");
  return new LocalArtifactStorage(root);
}
