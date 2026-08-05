import { v5 as uuidV5 } from "uuid";

/**
 * Deterministic GUID derivation (brief Step 4).
 *
 * A compiled KF project replaces every semantic entity id (page name, control
 * name, variable name) with a UUID-compatible KF GUID derived ONLY from the
 * build seed and the semantic id:
 *
 *   guid = uuidV5(entityId, uuidV5(build.seed, KF_BUILD_NAMESPACE))
 *
 * The same IR + seed always yields the same GUIDs (byte-for-byte workspaces);
 * a different seed yields different GUIDs. uuid v5 uses SHA-1 per RFC 4122 via
 * the standard `uuid` package (pure JS + node:crypto, stable across Linux and
 * Windows), so results are reproducible on any host.
 */

export type BuildSeed = { seed: string };

/**
 * Fixed RFC 4122-style namespace for every KF build. Chosen once and frozen:
 * changing it would change every derived GUID for existing builds.
 */
export const KF_BUILD_NAMESPACE = "3c7c6a9e-1f4d-4e8b-9c5a-2b6f7d8e9a0b";

/**
 * Derives the RFC 4122 v5 UUID for a semantic entity id under a build seed.
 * `entityId` is a STABLE SEMANTIC id (page name, control name, variable name),
 * never a KF GUID and never a numeric internal id.
 */
export function deriveGuid(build: BuildSeed, entityId: string): string {
  return uuidV5(entityId, uuidV5(build.seed, KF_BUILD_NAMESPACE));
}
