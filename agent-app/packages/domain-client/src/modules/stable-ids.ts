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
  const hash = fnv1a(`${moduleId}\u0000${slot}`);
  return `${moduleId.slice(0, 40)}-${hash}/${slot.slice(0, 43)}`;
}

function isStableSegment(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(value)
    && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (const char of value) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
