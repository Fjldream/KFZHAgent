export const MAX_CONTROL_GEOMETRY = 1_000_000_000;

export interface ControlGeometryInput {
  x?: number | undefined;
  y?: number | undefined;
  width?: number | undefined;
  height?: number | undefined;
}

export interface ControlGeometryIssue {
  field: keyof ControlGeometryInput;
  message: string;
}

/** 共享几何政策，用于生成IR和ChangePlan控制创建。 */
export function controlGeometryIssues(
  capabilityId: string,
  geometry: ControlGeometryInput,
): ControlGeometryIssue[] {
  const issues: ControlGeometryIssue[] = [];
  const docking = capabilityId === "layout.5";
  for (const field of ["x", "y"] as const) {
    const value = geometry[field] ?? 0;
    if (!Number.isFinite(value) || value > MAX_CONTROL_GEOMETRY) {
      issues.push({ field, message: `${field} must be a finite coordinate no greater than ${MAX_CONTROL_GEOMETRY}` });
    } else if (value < 0 && !(docking && value === -1)) {
      issues.push({ field, message: `${field} must be non-negative${docking ? " or exactly -1 for docking" : ""}` });
    }
  }
  for (const field of ["width", "height"] as const) {
    const value = geometry[field];
    if (value !== undefined && (!Number.isFinite(value) || value <= 0 || value > MAX_CONTROL_GEOMETRY)) {
      issues.push({ field, message: `${field} must be finite, positive, and no greater than ${MAX_CONTROL_GEOMETRY}` });
    }
  }
  return issues;
}
