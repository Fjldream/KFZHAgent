/**
 * Component identities are deterministic semantic references, never KF GUIDs.
 * The slash avoids ambiguities that a hyphen-only concatenation would create.
 */
export function stableModuleComponentId(moduleId: string, slot: string): string {
  if (!isStableSegment(moduleId) || !isStableSegment(slot)) {
    throw new Error(`INVALID_STABLE_COMPONENT_ID: ${moduleId}/${slot}`);
  }
  const readable = `${moduleId}/${slot}`;
  if (readable.length <= 100) return readable;
  // Keep both semantic sides recognizable while suffixing a stable hash of the
  // complete pair. The hash prevents truncation collisions across pages.
  const hash = createHash("sha256").update(`${moduleId}\u0000${slot}`).digest("hex").slice(0, 32);
  return `${moduleId.slice(0, 30)}-${hash}/${slot.slice(0, 36)}`;
}

function isStableSegment(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(value)
    && !/^k?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

import { createHash } from "node:crypto";
