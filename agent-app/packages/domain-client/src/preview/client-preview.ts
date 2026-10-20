import type {
  ClientProjectIR,
  ControlIR,
  PageIR,
  RestrictedAction,
} from "../ir/client-project-ir.js";
import type { ComponentStyleSpec, StyleDeclaration, ThemeSpec } from "@kf/contracts";
import { serializeStyleColor } from "../style/css-compiler.js";
import { KF36_RUNTIME_PROFILE } from "../style/runtime-profile.js";
import { assertStyleCompilationAccepted, compileControlStyle } from "../style/style-engine.js";
import { resolveComponentStyle } from "../style/theme-resolver.js";

/**
 * 经过净化、完全自包含的 HTML 预览（简要步骤 7）。
 *
 * 安全不变量：
 * - 每个文本值都会进行 HTML 转义（原始 `& < > " '` 绝不会进入标记）。
 * - 绝不生成 `<script>` 标签；预览在结构上保持惰性。
 * - 不使用远程资产：没有 img/src/href，也没有外部样式表或字体。
 * - 使用适合 iframe srcdoc 的 Content-Security-Policy meta 标签强化文档：`default-src 'none'; img-src data:; style-src 'unsafe-inline'`。
 */

const DEFAULT_PAGE_WIDTH = 1280;
const DEFAULT_PAGE_HEIGHT = 720;

const PREVIEW_STYLE_THEME: ThemeSpec = Object.freeze({
  background: "#ffffff",
  surface: "#ffffff",
  primary: "#2563eb",
  accent: "#2563eb",
  textPrimary: "#111827",
  textSecondary: "#6b7280",
  fontFamily: "sans-serif",
  spacingUnit: 4,
  radiusScale: { small: 4, medium: 8, large: 12 },
});

const EMPTY_STYLE: ComponentStyleSpec = Object.freeze({
  declarations: Object.freeze({}),
  states: Object.freeze({}),
});

const PREVIEW_BOX_SHADOWS: Readonly<Record<NonNullable<StyleDeclaration["boxShadow"]>, string>> = {
  none: "none",
  small: "0 2px 8px rgba(0,0,0,.12)",
  medium: "0 8px 24px rgba(0,0,0,.18)",
  large: "0 16px 40px rgba(0,0,0,.24)",
};

export const PREVIEW_CSP =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'";

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function capabilityIdForControl(control: ControlIR): string {
  switch (control.type) {
    case "easyui":
      return `easyui.${control.proto}`;
    case "layout":
      return `layout.${control.layoutType}`;
    case "prototype":
      return `prototype.${control.prototypeName}`;
    default:
      return control.type;
  }
}

/**
 * Serializes resolved, contract-limited declarations for the inert preview.
 * This deliberately has no selector handling: KF runtime selectors and
 * `styleDataNew` remain compilation details and never enter preview markup.
 */
function serializePreviewDeclarations(declarations: StyleDeclaration): string {
  const values: Array<[string, string]> = [];
  if (declarations.backgroundColor !== undefined) values.push(["background-color", serializeStyleColor(declarations.backgroundColor)]);
  if (declarations.textColor !== undefined) values.push(["color", serializeStyleColor(declarations.textColor)]);
  if (declarations.borderColor !== undefined) values.push(["border-color", serializeStyleColor(declarations.borderColor)]);
  if (declarations.borderRadius !== undefined) values.push(["border-radius", `${declarations.borderRadius}px`]);
  if (declarations.fontSize !== undefined) values.push(["font-size", `${declarations.fontSize}px`]);
  if (declarations.fontWeight !== undefined) values.push(["font-weight", String(declarations.fontWeight)]);
  if (declarations.lineHeight !== undefined) values.push(["line-height", String(declarations.lineHeight)]);
  if (declarations.padding !== undefined) values.push(["padding", `${declarations.padding}px`]);
  if (declarations.margin !== undefined) values.push(["margin", `${declarations.margin}px`]);
  if (declarations.gap !== undefined) values.push(["gap", `${declarations.gap}px`]);
  if (declarations.boxShadow !== undefined) values.push(["box-shadow", PREVIEW_BOX_SHADOWS[declarations.boxShadow]]);
  if (declarations.opacity !== undefined) values.push(["opacity", String(declarations.opacity)]);
  if (declarations.textAlign !== undefined) values.push(["text-align", declarations.textAlign]);
  return values.map(([property, value]) => `${property}:${value}`).join(";");
}

function previewStyle(control: ControlIR): string {
  if (control.style === undefined) return "";

  try {
    const compiled = compileControlStyle({
      capabilityId: capabilityIdForControl(control),
      theme: PREVIEW_STYLE_THEME,
      instanceStyle: control.style,
      runtimeProfile: KF36_RUNTIME_PROFILE,
    });
    assertStyleCompilationAccepted(capabilityIdForControl(control), compiled);
    return serializePreviewDeclarations(resolveComponentStyle(
      PREVIEW_STYLE_THEME,
      EMPTY_STYLE,
      EMPTY_STYLE,
      control.style,
    ).declarations);
  } catch {
    // A preview must remain renderable and inert even if an unvalidated IR is
    // supplied directly by a caller. The compiler reports style errors instead.
    return "";
  }
}

function inlineStyle(value: string): string {
  return value === "" ? "" : ` style="${escapeHtml(value)}"`;
}

function renderControl(control: ControlIR): string {
  const layoutStyle = `left:${control.x}px;top:${control.y}px;width:${control.width}px;height:${control.height}px`;
  const resolvedStyle = previewStyle(control);
  const textOf = (c: ControlIR): string => {
    if (c.type === "text" || c.type === "button" || c.type === "richtext") return c.text;
    return c.type;
  };
  switch (control.type) {
    case "text":
      return `<div class="control text" style="${layoutStyle};${resolvedStyle}">${escapeHtml(control.text)}</div>`;
    case "button": {
      const actionNote =
        control.action === undefined || control.action.kind === "noop"
          ? ""
          : `<span class="action">${escapeHtml(describeAction(control.action))}</span>`;
      return `<div class="control button" style="${layoutStyle}"><button type="button" disabled${inlineStyle(resolvedStyle)}>${escapeHtml(control.text)}</button>${actionNote}</div>`;
    }
    case "inputnumber":
      return `<div class="control inputnumber" style="${layoutStyle}"><input type="number" value="0" step="0.1" disabled${inlineStyle(resolvedStyle)}><span class="bind">→ ${escapeHtml(control.variableId)}</span></div>`;
    default:
      return `<div class="control ${escapeHtml(control.type)}" style="${layoutStyle}"><span class="placeholder"${inlineStyle(resolvedStyle)}>${escapeHtml(textOf(control))}</span></div>`;
  }
}

function describeAction(action: RestrictedAction): string {
  switch (action.kind) {
    case "navigate":
      return `Navigate to page ${action.pageId}`;
    case "setVariable":
      return `Set ${action.variableId} = ${String(action.value)}`;
    case "noop":
      return "";
  }
}

function renderPage(page: PageIR): string {
  const width = page.width ?? DEFAULT_PAGE_WIDTH;
  const height = page.height ?? DEFAULT_PAGE_HEIGHT;
  const controls = page.controls.map(renderControl).join("");
  return `<section class="page" data-page="${escapeHtml(page.name)}" style="width:${width}px;height:${height}px">`
    + `<h2>${escapeHtml(page.name)}</h2>`
    + `<div class="canvas">${controls}</div>`
    + `</section>`;
}

/**
 * Renders a self-contained, sanitized HTML preview for an IR. Safe to embed
 * in an iframe via `srcdoc`.
 */
export function renderClientPreview(ir: ClientProjectIR): string {
  const pages = ir.pages.map(renderPage).join("\n");
  const title = escapeHtml(ir.name);
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${PREVIEW_CSP}">
<title>${title}</title>
<style>
  body { margin: 0; font-family: -apple-system, "Segoe UI", "Microsoft YaHei", sans-serif; background: #f5f5f5; }
  .page { position: relative; margin: 16px auto; background: #fff; border: 1px solid #ddd; border-radius: 4px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
  .page h2 { margin: 0; padding: 8px 12px; font-size: 14px; color: #333; border-bottom: 1px solid #eee; }
  .canvas { position: relative; width: 100%; height: calc(100% - 33px); }
  .control { position: absolute; display: flex; align-items: center; gap: 6px; }
  .control.text { font-size: 14px; color: #222; align-items: flex-start; }
  .control.button button { width: 100%; height: 100%; border-radius: 4px; border: 1px solid #409eff; background: #ecf5ff; color: #409eff; cursor: not-allowed; }
  .control.button .action { position: absolute; top: calc(100% + 2px); left: 0; font-size: 11px; color: #888; white-space: nowrap; }
  .control.inputnumber input { width: 100%; height: 100%; box-sizing: border-box; border: 1px solid #dcdfe6; border-radius: 4px; }
  .control.inputnumber .bind { position: absolute; top: calc(100% + 2px); left: 0; font-size: 11px; color: #888; white-space: nowrap; }
  .control .placeholder { font-size: 12px; color: #aaa; border: 1px dashed #ccc; border-radius: 4px; padding: 2px 6px; }
</style>
</head>
<body>
${pages}
</body>
</html>
`;
}
