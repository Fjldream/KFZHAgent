import type {
  ClientProjectIR,
  ControlIR,
  PageIR,
  RestrictedAction,
} from "../ir/client-project-ir.js";

/**
 * Sanitized, self-contained HTML preview (brief Step 7).
 *
 * Security invariants:
 * - EVERY text value is HTML-escaped (no raw `& < > " '` reaches the markup).
 * - NO `<script>` tag is ever emitted; the preview is inert by construction.
 * - NO remote assets: no img/src/href, no external stylesheets or fonts.
 * - A Content-Security-Policy meta tag (suitable for iframe srcdoc) hardens the
 *   document: `default-src 'none'; img-src data:; style-src 'unsafe-inline'`.
 */

const DEFAULT_PAGE_WIDTH = 1280;
const DEFAULT_PAGE_HEIGHT = 720;

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

function renderControl(control: ControlIR): string {
  const style = `left:${control.x}px;top:${control.y}px;width:${control.width}px;height:${control.height}px`;
  const textOf = (c: ControlIR): string => {
    if (c.type === "text" || c.type === "button" || c.type === "richtext") return c.text;
    return c.type;
  };
  switch (control.type) {
    case "text":
      return `<div class="control text" style="${style}">${escapeHtml(control.text)}</div>`;
    case "button": {
      const actionNote =
        control.action === undefined || control.action.kind === "noop"
          ? ""
          : `<span class="action">${escapeHtml(describeAction(control.action))}</span>`;
      return `<div class="control button" style="${style}"><button type="button" disabled>${escapeHtml(control.text)}</button>${actionNote}</div>`;
    }
    case "inputnumber":
      return `<div class="control inputnumber" style="${style}"><input type="number" value="0" step="0.1" disabled><span class="bind">→ ${escapeHtml(control.variableId)}</span></div>`;
    default:
      return `<div class="control ${escapeHtml(control.type)}" style="${style}"><span class="placeholder">${escapeHtml(textOf(control))}</span></div>`;
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
