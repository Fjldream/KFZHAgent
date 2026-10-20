/**
 * 每种实体的原生字段允许列表定义在 @kf/contracts 中，使 patcher、creative lowerer 和签名制品 validator 共享同一策略。该模块保留历史 domain-client 导出以及原始 KF 路径解析；后者仍是 patcher 专用逻辑。
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

/** 几何别名：`x` -> `leftTopPt.x`，`y` -> `leftTopPt.y`。 */
export const CONTROL_GEOMETRY_ALIASES: Readonly<Record<string, string>> = {
  "/x": "/leftTopPt/x",
  "/y": "/leftTopPt/y",
  "/width": "/width",
  "/height": "/height",
};

/**
 * KF布局的IR路径映射到嵌套的原始字段。EasyUI字段已经是顶级字段，因此不需要等效的表格。
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

/** CustomCharts存储在pageProperty之下，而不是在根处。 */
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

/** 将相对变化路径转换为有效原始-KF路径。 */
export function resolveControlPath(relativePath: string): string {
  return CONTROL_GEOMETRY_ALIASES[relativePath] ?? relativePath;
}

/** 在应用布局/原型布局前，解决类型特定的布局/原型别名。 */
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
