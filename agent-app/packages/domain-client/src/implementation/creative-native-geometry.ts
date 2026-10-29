// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
/** Creative plans use page coordinates; KF child controls store parent-local coordinates. */
export function creativeNativeDeltaValue(
  delta: Readonly<{ path: string; value: unknown }>,
  parentGeometry: Readonly<{ x: number; y: number }> | undefined,
): unknown {
  if (delta.path !== "/x" && delta.path !== "/y") return delta.value;
  const parentCoordinate = delta.path === "/x" ? parentGeometry?.x ?? 0 : parentGeometry?.y ?? 0;
  if (typeof delta.value !== "number" || !Number.isFinite(delta.value) || !Number.isFinite(parentCoordinate)) {
    throw new Error("CREATIVE_NATIVE_GEOMETRY_INVALID");
  }
  return delta.value - parentCoordinate;
}
// end
