import { CONTROL_TYPE_BY_UIMODEL_TYPE } from "@kf/domain-client";
import type { ClientProjectIR, ControlIR, PageIR } from "@kf/domain-client";

const DEFAULT_PAGE_WIDTH = 1024;
const DEFAULT_PAGE_HEIGHT = 768;
/** 画布自适应时控件边界外的留白。 */
const EDGE_PADDING = 40;
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
    case "radiolegacy": {
      const options = control.options
        .map((option) => {
          const selected = option.value === control.value;
          const marker = selected ? "●" : "○";
          return `<span${selected ? ' class="is-selected"' : ""}>${marker} ${escapeHtml(option.label)}</span>`;
        })
        .join("");
      return `${base}<label class="kf-radio-option">${options}</label></div>`;
    }
    case "checkboxlegacy":
      return `${base}<label><input type="checkbox"${control.checked ? " checked" : ""} disabled>${escapeHtml(control.label ?? "")}</label></div>`;
    case "combobox": {
      const current = control.options.find((o) => o.value === control.value)?.label ?? control.options[0]?.label ?? "";
      const options = control.options
        .map((o) => `<span class="kf-select-option">${escapeHtml(o.label)}</span>`)
        .join("");
      return `${base}<span class="kf-select"><span class="kf-select-current">${escapeHtml(current)}</span><span class="kf-select-options">${options}</span></span></div>`;
    }
    case "scale": {
      const min = control.min ?? 0;
      const max = control.max ?? 100;
      const value = control.value ?? min;
      const pct = max > min ? Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100)) : 0;
      return `${base}<div class="kf-scale"><div class="kf-scale-track"><div class="kf-scale-fill" style="width:${pct}%"></div></div><span class="kf-scale-value">${escapeHtml(String(value))}</span></div></div>`;
    }
    case "list": {
      const items = control.options
        .map((o) => `<li class="kf-list-item">${escapeHtml(o.label)}</li>`)
        .join("");
      return `${base}<ul class="kf-list">${items}</ul></div>`;
    }
    case "treeview":
      return `${base}<div class="kf-tree">${control.showCheckbox ? '<span class="kf-tree-check">☐</span>' : ""}树节点…</div></div>`;
    case "webcontainer":
      return `${base}<div class="kf-webcontainer"><iframe class="kf-iframe" src="${escapeHtml(control.url ?? "")}" title="web"></iframe></div></div>`;
    case "gantt":
      return `${base}<div class="kf-gantt">甘特图</div></div>`;
    case "factorycalendar":
      return `${base}<div class="kf-factorycalendar"><span>日历 ${escapeHtml(control.value ?? "")}</span></div></div>`;
    case "input": {
      const inputType = control.inputType ?? "text";
      return `${base}<input class="kf-input" type="${escapeHtml(inputType)}" value="${escapeHtml(control.value ?? "")}" placeholder="${escapeHtml(control.placeholder ?? "")}" disabled></div>`;
    }
    case "cascader":
      return `${base}<span class="kf-cascader">${escapeHtml(control.placeholder ?? "请选择")} ▾</span></div>`;
    case "datetimepicker":
      return `${base}<span class="kf-datetimepicker">${escapeHtml(control.value ?? control.placeholder ?? "")} ▾</span></div>`;
    case "dropdown": {
      const options = (control.options ?? [])
        .map((o) => `<span class="kf-select-option">${escapeHtml(o.label)}</span>`)
        .join("");
      return `${base}<span class="kf-dropdown"><button class="kf-btn">${escapeHtml(control.text ?? "下拉")}</button><span class="kf-select-options">${options}</span></span></div>`;
    }
    case "navmenu":
      return `${base}<div class="kf-navmenu">导航菜单</div></div>`;
    case "tree":
      return `${base}<div class="kf-tree">${control.showCheckbox ? '<span class="kf-tree-check">☐</span>' : ""}树节点…</div></div>`;
    case "upload":
      return `${base}<button class="kf-btn">上传${control.multiple ? "（多文件）" : ""}</button></div>`;
    case "transfer":
      return `${base}<div class="kf-transfer">穿梭框</div></div>`;
    case "tag": {
      const effect = control.effect ?? "light";
      return `${base}<span class="kf-tag kf-tag-${escapeHtml(effect)}">${control.closable ? "× " : ""}标签</span></div>`;
    }
    case "timeline": {
      const items = control.items
        .map((item) => `<li class="kf-timeline-item"><span class="kf-timeline-dot"></span><span>${escapeHtml(item.title)}</span></li>`)
        .join("");
      return `${base}<ul class="kf-timeline">${items}</ul></div>`;
    }
    case "steps": {
      const steps = [{ title: "步骤1" }, { title: "步骤2" }, { title: "步骤3" }];
      const html = steps
        .map((s, i) => `<span class="kf-step${i <= (control.active ?? 0) ? " is-active" : ""}">${escapeHtml(s.title)}</span>`)
        .join(" → ");
      return `${base}<div class="kf-steps">${html}</div></div>`;
    }
  }
}

/**
 * Render one page as a `<section class="kf-page">` fragment. Page size falls
 * back to 1024×768 when the IR omits width/height.
 */
export function renderPagePreview(page: PageIR): string {
  // KF 页面坐标是自由画布：容器尺寸以「页面声明尺寸」为基准，但必须
  // 至少包住最底部/最右侧控件（超界的按钮等不会溢出不可见）。
  const declaredWidth = page.width ?? DEFAULT_PAGE_WIDTH;
  const declaredHeight = page.height ?? DEFAULT_PAGE_HEIGHT;
  const maxBottom = page.controls.reduce(
    (max, control) => Math.max(max, control.y + control.height),
    0,
  );
  const maxRight = page.controls.reduce(
    (max, control) => Math.max(max, control.x + control.width),
    0,
  );
  const width = Math.max(declaredWidth, maxRight + EDGE_PADDING);
  const height = Math.max(declaredHeight, maxBottom + EDGE_PADDING);
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
.kf-spacer{background:transparent;border-top:1px dashed #2a3342}
.kf-scale{display:flex;flex-direction:column;justify-content:center;gap:4px;height:100%;padding:0 6px}
.kf-scale-track{height:8px;border-radius:4px;background:#2a3342;overflow:hidden}
.kf-scale-fill{height:100%;background:${THEME_COLOR}}
.kf-scale-value{font-size:13px;color:#e8ecf4;text-align:center}
.kf-list{list-style:none;display:flex;flex-direction:column;gap:4px;height:100%;overflow:auto;padding:4px 6px}
.kf-list-item{font-size:13px;color:#e8ecf4;padding:2px 4px}
.kf-tree{font-size:13px;color:#e8ecf4;height:100%;padding:4px 6px;overflow:auto}
.kf-tree-check{margin-right:4px;color:#9fb0c9}
.kf-webcontainer{width:100%;height:100%;border:1px solid #2a3342;border-radius:4px;overflow:hidden;background:#12161f}
.kf-iframe{width:100%;height:100%;border:0;background:#ffffff}
.kf-gantt,.kf-factorycalendar,.kf-navmenu,.kf-transfer{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:13px;color:#9fb0c9;border:1px dashed #2a3342;border-radius:4px}
.kf-cascader,.kf-datetimepicker{display:flex;align-items:center;height:100%;font-size:14px;color:#e8ecf4;border:1px solid #2a3342;border-radius:4px;background:#12161f;padding:0 8px}
.kf-dropdown{display:inline-flex;flex-direction:column;justify-content:center;gap:2px;height:100%;min-width:0}
.kf-tag{display:inline-flex;align-items:center;gap:4px;height:100%;padding:0 10px;border-radius:4px;font-size:13px}
.kf-tag-light{background:#2a3342;color:#e8ecf4}
.kf-tag-dark{background:#0f1522;color:#ffffff}
.kf-tag-plain{background:transparent;color:#e8ecf4;border:1px solid #2a3342}
.kf-timeline{list-style:none;display:flex;flex-direction:column;gap:6px;height:100%;overflow:auto;padding:4px 8px}
.kf-timeline-item{display:flex;align-items:center;gap:8px;font-size:13px;color:#e8ecf4}
.kf-timeline-dot{width:8px;height:8px;border-radius:50%;background:${THEME_COLOR};flex-shrink:0}
.kf-steps{display:flex;align-items:center;gap:6px;height:100%;padding:0 8px;font-size:13px;overflow:hidden}
.kf-step{color:#9fb0c9;white-space:nowrap}
.kf-step.is-active{color:${THEME_COLOR};font-weight:600}`;

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

// ---------------------------------------------------------------------------
// KF 原生页面 JSON → IR 转换（preview 数据源：构建产物解包后的 page/*.json）
// ---------------------------------------------------------------------------

/** KF uiModelType → IR 控件类型（fallback "text" 保证可渲染）。 */
function kfControlType(uiModelType: unknown): string {
  return typeof uiModelType === "number"
    ? (CONTROL_TYPE_BY_UIMODEL_TYPE[uiModelType] ?? "text")
    : "text";
}

function kfNum(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/** KF 控件对象 → ControlIR 形状（宽容提取渲染所需字段）。 */
function kfControlToIR(rec: Record<string, unknown>): Record<string, unknown> {
  const lp = (rec["leftTopPt"] ?? {}) as Record<string, unknown>;
  const base: Record<string, unknown> = {
    id: typeof rec["name"] === "string" ? rec["name"] : `c${Math.floor(kfNum(rec["x"]))}`,
    type: kfControlType(rec["uiModelType"]),
    x: kfNum(lp["x"]),
    y: kfNum(lp["y"]),
    width: kfNum(rec["width"]),
    height: kfNum(rec["height"]),
  };
  const pickAll = (keys: string[]): void => {
    for (const key of keys) {
      if (rec[key] !== undefined) {
        base[key] = rec[key];
      }
    }
  };
  // 各类型可选字段（KF 字段名宽容：IR 名优先，兼容 KF 别名；收集全部存在的）
  pickAll(["text", "value", "activeText", "inactiveText", "label", "checked"]);
  pickAll(["options", "selectData", "radioData"]);
  pickAll(["src", "fit", "alt"]);
  pickAll(["tabs", "activeId"]);
  // 新增控件字段（KF 字段名 → IR 字段名：input.type→inputType、datetimepicker.type→pickerType）
  pickAll(["placeholder", "maxlength", "disabled", "clearable"]);
  if (rec["uiModelType"] === 38) base["inputType"] = rec["type"]; // INPUT
  if (rec["uiModelType"] === 40) base["pickerType"] = rec["type"]; // DATETIMEPICKER
  pickAll(["url", "scrolling"]);
  pickAll(["effect", "closable", "hit"]);
  pickAll(["active", "direction", "processStatus"]);
  pickAll(["showCheckbox", "indent", "expandOnClickNode", "accordion", "defaultExpandAll"]);
  pickAll(["mode", "backgroundColor", "textColor"]);
  pickAll(["splitButton", "trigger", "placement"]);
  pickAll(["min", "max", "step"]);
  pickAll(["action", "accept", "multiple"]);
  if (rec["precision"] !== undefined) base["decimals"] = rec["precision"];
  return base;
}

/** 单个 KF 页面 JSON（{name,width,height,objects[]}）→ PageIR 形状。 */
export function kfPageToPageIR(kfPage: unknown): PageIR {
  const doc = (kfPage ?? {}) as Record<string, unknown>;
  const objects = Array.isArray(doc["objects"]) ? (doc["objects"] as unknown[]) : [];
  return {
    id: typeof doc["name"] === "string" ? doc["name"] : "page",
    name: typeof doc["name"] === "string" ? doc["name"] : "页面",
    width: kfNum(doc["width"]) || 1024,
    height: kfNum(doc["height"]) || 768,
    controls: objects.map((o) => kfControlToIR(o as Record<string, unknown>)) as ControlIR[],
  };
}

/** 多 KF 页面 → 完整预览 HTML（工程名 + 页面数组）。 */
export function renderKfProject(projectName: string, kfPages: unknown[]): string {
  const pages = kfPages.map((p) => kfPageToPageIR(p));
  const ir: ClientProjectIR = {
    schema: "kf-client-project-ir/v1",
    id: projectName,
    name: projectName,
    pages,
  };
  return renderClientProjectPreview(ir);
}
