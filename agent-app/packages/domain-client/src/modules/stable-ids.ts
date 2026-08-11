/**
 * Component identities are deterministic semantic references, never KF GUIDs.
 * The slash avoids ambiguities that a hyphen-only concatenation would create.
 */
export function stableModuleComponentId(moduleId: string, slot: string): string {
  if (!isStableSegment(moduleId) || !isStableSegment(slot)) {
    throw new Error(`INVALID_STABLE_COMPONENT_ID: ${moduleId}/${slot}`);
  }
  return `${moduleId}/${slot}`;
}

function isStableSegment(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9_-]*$/.test(value)
    && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
