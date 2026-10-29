// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import type { VisualRegion } from "@kf/contracts";

export type VisualContainerArrangement = { axis: "row" | "column"; horizontalBands: number; verticalBands: number };

/** Geometry is a reviewable suggestion, never a new capability or an edit to an accepted mapping. */
export function suggestVisualContainerArrangement(region: VisualRegion, regions: readonly VisualRegion[]): VisualContainerArrangement | null {
  if (!["header", "sidebar", "content", "card", "form"].includes(region.role) || regions.length > 100) return null;
  const children = regions.filter(child => child.parentId === region.id);
  if (children.length < 2) return null;
  const tolerance = 0.000001;
  if (children.some(child => child.box.x < region.box.x - tolerance || child.box.y < region.box.y - tolerance
    || child.box.x + child.box.width > region.box.x + region.box.width + tolerance
    || child.box.y + child.box.height > region.box.y + region.box.height + tolerance)) return null;
  const bands = (axis: "x" | "y", size: "width" | "height"): number => {
    const intervals = children.map(child => ({ start: child.box[axis], end: child.box[axis] + child.box[size] }))
      .sort((left, right) => left.start - right.start || left.end - right.end);
    const minimumGap = Math.max(tolerance, region.box[size] * 0.005);
    let count = 0;
    let maximumEnd = -Infinity;
    for (const interval of intervals) {
      if (interval.start - maximumEnd > minimumGap) count++;
      maximumEnd = Math.max(maximumEnd, interval.end);
    }
    return count;
  };
  const horizontalBands = bands("x", "width");
  const verticalBands = bands("y", "height");
  if (horizontalBands > 1 && verticalBands === 1) return { axis: "row", horizontalBands, verticalBands };
  if (verticalBands > 1 && horizontalBands === 1) return { axis: "column", horizontalBands, verticalBands };
  return null; // Nested/overlapping boxes and two-axis grids do not imply a single arrangement.
}
// end
