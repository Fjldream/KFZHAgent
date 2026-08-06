import type { ClientProjectIR, ControlIR, PageIR } from "@kf/domain-client";

const DEFAULT_PAGE_WIDTH = 1024;
const DEFAULT_PAGE_HEIGHT = 768;
const THEME_COLOR = "#2f6fed";

/**
 * Escape a text value for safe embedding in HTML text nodes and attribute
 * values. Every non-richtext control payload passes through here.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function layoutStyle(control: ControlIR): string {
  return `left:${control.x}px;top:${control.y}px;width:${control.width}px;height:${control.height}px`;
}

function renderControl(control: ControlIR): string {
  const base = `<div class="kf-control kf-${control.type}" style="${layoutStyle(control)}" data-type="${control.type}">`;
  switch (control.type) {
    case "text":
      return `${base}<span>${escapeHtml(control.text)}</span></div>`;
    case "button":
      return `${base}<button class="kf-btn">${escapeHtml(control.text)}</button></div>`;
    case "inputnumber":
      return `${base}<input class="kf-input" value="0.0" disabled></div>`;
    case "switch": {
      const active = control.activeText ?? "开";
      const inactive = control.inactiveText ?? "关";
      const state = control.value ? "is-on" : "is-off";
      return `${base}<span class="kf-switch ${state}"><span class="kf-switch-on">${escapeHtml(active)}</span><span class="kf-switch-off">${escapeHtml(inactive)}</span></span></div>`;
    }
    case "checkbox":
      return `${base}<label><input type="checkbox"${control.checked ? " checked" : ""} disabled>${escapeHtml(control.label ?? "")}</label></div>`;
    case "radio": {
      const options = control.options
        .map((option) => {
          const selected = option.value === control.value;
          const marker = selected ? "●" : "○";
          const selectedAttr = selected ? ' class="is-selected"' : "";
          return `<span${selectedAttr}>${marker} ${escapeHtml(option.label)}</span>`;
        })
        .join("");
      return `${base}<label class="kf-radio-option">${options}</label></div>`;
    }
    case "select": {
      const current =
        control.options.find((option) => option.value === control.value)?.label ??
        control.options[0]?.label ??
        "";
      const options = control.options
        .map((option) => `<span class="kf-select-option">${escapeHtml(option.label)}</span>`)
        .join("");
      return `${base}<span class="kf-select"><span class="kf-select-current">${escapeHtml(current)}</span><span class="kf-select-options">${options}</span></span></div>`;
    }
    case "image":
      return `${base}<img src="${escapeHtml(control.src)}" alt="${escapeHtml(control.alt ?? "")}" style="object-fit:${escapeHtml(control.fit ?? "contain")}"></div>`;
    case "tabs": {
      const tabs = control.tabs
        .map((tab) => `<span class="kf-tab${tab.id === control.activeId ? " is-active" : ""}">${escapeHtml(tab.label)}</span>`)
        .join("");
      return `${base}<div class="kf-tabs">${tabs}</div></div>`;
    }
    case "table":
      return `${base}<table class="kf-table"><thead><tr><th>列1</th><th>列2</th></tr></thead></table></div>`;
    case "richtext":
      // Rich text is trusted project content passed through verbatim (design).
      return `${base}<div class="kf-richtext">${control.text}</div></div>`;
    case "spacer":
      return `${base}<div class="kf-spacer" title="spacer"></div></div>`;
  }
}

/**
 * Render one page as a `<section class="kf-page">` fragment. Page size falls
 * back to 1024×768 when the IR omits width/height.
 */
export function renderPagePreview(page: PageIR): string {
  const width = page.width ?? DEFAULT_PAGE_WIDTH;
  const height = page.height ?? DEFAULT_PAGE_HEIGHT;
  const controls = page.controls.map(renderControl).join("");
  return `<section class="kf-page" id="page-${escapeHtml(page.id)}" data-testid="kf-page" style="width:${width}px;height:${height}px">${controls}</section>`;
}

const PREVIEW_CSS = `*{box-sizing:border-box;margin:0;padding:0}
html,body{background:#1e2430}
body{color:#e8ecf4;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.kf-tabs-nav{position:sticky;top:0;z-index:10;display:flex;flex-wrap:wrap;gap:8px;padding:12px 16px;background:#161b26;border-bottom:1px solid #2a3342}
.kf-tabs-nav a{color:#9fb0c9;text-decoration:none;font-size:14px;padding:6px 14px;border-radius:6px;background:#1c2333;border:1px solid #2a3342}
.kf-tabs-nav a:hover{color:#ffffff;background:${THEME_COLOR};border-color:${THEME_COLOR}}
section.kf-page{display:none;position:relative;overflow:hidden;background:#1e2430;margin:16px auto;box-shadow:0 0 0 1px #2a3342}
section.kf-page:target{display:block}
section.kf-page:first-of-type{display:block}
/* 有任意页面命中 :target（切到非首页）时，抑制首屏兜底，避免两页堆叠 */
body:has(section.kf-page:target) section.kf-page:first-of-type{display:none}
.kf-control{position:absolute}
.kf-text{display:flex;align-items:center;font-size:16px;color:#e8ecf4;line-height:1.4}
.kf-btn{width:100%;height:100%;border:1px solid #1d4ed8;border-radius:6px;background:${THEME_COLOR};color:#ffffff;font-size:15px;cursor:pointer}
.kf-input{width:100%;height:100%;border:1px solid #2a3342;border-radius:4px;background:#12161f;color:#e8ecf4;font-size:16px;padding:0 8px}
.kf-switch{display:inline-flex;align-items:center;gap:6px;height:100%;font-size:14px}
.kf-switch .kf-switch-on{color:${THEME_COLOR};font-weight:600}
.kf-switch .kf-switch-off{color:#8b96a8}
.kf-switch.is-on .kf-switch-off{opacity:.45}
.kf-switch.is-off .kf-switch-on{opacity:.45}
.kf-control > label{display:flex;align-items:center;gap:6px;height:100%;font-size:14px}
.kf-radio-option{display:flex;align-items:center;gap:8px}
.kf-radio-option .is-selected{color:${THEME_COLOR};font-weight:600}
.kf-select{display:inline-flex;flex-direction:column;justify-content:center;gap:2px;height:100%;min-width:0}
.kf-select-current{font-size:14px;color:#e8ecf4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kf-select-options{display:flex;flex-wrap:wrap;gap:4px}
.kf-select-option{background:#1c2333;border:1px solid #2a3342;border-radius:4px;padding:0 6px;font-size:12px;color:#9fb0c9}
.kf-control > img{width:100%;height:100%;display:block}
.kf-tabs{display:flex;align-items:center;gap:2px;height:100%;border-bottom:2px solid #2a3342}
.kf-tab{padding:0 12px;font-size:14px;color:#9fb0c9;line-height:32px;border-bottom:2px solid transparent;white-space:nowrap}
.kf-tab.is-active{color:#ffffff;border-bottom-color:${THEME_COLOR};font-weight:600}
.kf-table{width:100%;height:100%;border-collapse:collapse;font-size:13px}
.kf-table th{background:#161b26;border:1px solid #2a3342;padding:6px 10px;text-align:left;font-weight:600;color:#e8ecf4}
.kf-richtext{overflow:auto;font-size:14px;line-height:1.5;color:#e8ecf4}
.kf-spacer{background:transparent;border-top:1px dashed #2a3342}`;

/**
 * Render a full static HTML document: doctype, inline `<style>`, page-tab
 * navigation and every page container. No `<script>` tags and no external
 * URLs are emitted; page switching relies on CSS `:target` + `:first-of-type`.
 */
export function renderClientProjectPreview(ir: ClientProjectIR): string {
  const nav = `<nav class="kf-tabs-nav">${ir.pages
    .map((page) => `<a href="#page-${escapeHtml(page.id)}">${escapeHtml(page.name)}</a>`)
    .join("")}</nav>`;
  const pages = ir.pages.map(renderPagePreview).join("");
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(ir.name)}</title>
<style>${PREVIEW_CSS}</style>
</head>
<body>
${nav}
${pages}
</body>
</html>`;
}
