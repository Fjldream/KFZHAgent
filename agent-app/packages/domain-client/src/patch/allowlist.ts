/**
 * Per-entity native field allowlists are defined in @kf/contracts so the
 * patcher, creative lowerer, and signed-artifact validator share one policy.
 * This module keeps the historical domain-client exports plus raw-KF path
 * resolution, which remains patcher-specific.
 */

export {
  COMMON_CONTROL_ALLOWED_FIELDS,
  CONTROL_TYPE_ALLOWED_FIELDS,
  PAGE_ALLOWED_FIELDS,
  PROTOTYPE_ALLOWED_FIELDS,
  PROTOTYPE_ALLOWED_FIELDS_BY_NAME,
  VARIABLE_ALLOWED_FIELDS,
  allowedFieldsFor,
  type AllowlistKind,
  type AllowlistLookup,
} from "@kf/contracts";

/** Geometry alias: `x` -> `leftTopPt.x`, `y` -> `leftTopPt.y`. */
export const CONTROL_GEOMETRY_ALIASES: Readonly<Record<string, string>> = {
  "/x": "/leftTopPt/x",
  "/y": "/leftTopPt/y",
  "/width": "/width",
  "/height": "/height",
};

/**
 * KF layout IR paths map to nested raw fields. EasyUI fields are already
 * top-level and therefore need no equivalent table.
 */
export const CONTROL_LAYOUT_PATH_ALIASES: Readonly<Record<string, string>> = {
  "/x": "/baseProperty/leftTopPt/x",
  "/y": "/baseProperty/leftTopPt/y",
  "/leftTopPt": "/baseProperty/leftTopPt",
  "/width": "/baseProperty/width",
  "/height": "/baseProperty/height",
  "/children": "/insiderObjects",
  "/panels": "/dPanelsOption",
};

/** CustomCharts stores geometry below pageProperty rather than at the root. */
export const PROTOTYPE_GEOMETRY_ALIASES_BY_NAME: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = {
  CustomCharts: {
    "/x": "/pageProperty/pagePos/x",
    "/y": "/pageProperty/pagePos/y",
    "/leftTopPt": "/pageProperty/pagePos",
    "/width": "/pageProperty/pageSize/width",
    "/height": "/pageProperty/pageSize/height",
  },
};

/** Resolves a relative change path to the effective raw-KF path. */
export function resolveControlPath(relativePath: string): string {
  return CONTROL_GEOMETRY_ALIASES[relativePath] ?? relativePath;
}

/** Resolves type-specific layout/prototype aliases before patch application. */
export function resolveControlPathFor(
  controlType: string | undefined,
  relativePath: string,
  prototypeName?: string,
): string {
  if (controlType === "layout") {
    return CONTROL_LAYOUT_PATH_ALIASES[relativePath] ?? relativePath;
  }
  if (controlType === "prototype" && prototypeName !== undefined) {
    const aliases = PROTOTYPE_GEOMETRY_ALIASES_BY_NAME[prototypeName];
    if (aliases !== undefined) return aliases[relativePath] ?? relativePath;
  }
  return resolveControlPath(relativePath);
}
