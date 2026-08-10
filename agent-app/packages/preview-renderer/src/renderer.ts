import {
  CONTROL_TYPE_BY_UIMODEL_TYPE,
  EASYUI_PROTO_FIELDS,
  easyuiTypeName,
} from "@kf/domain-client";
import type {
  ClientProjectIR,
  ContainerChildIR,
  ControlIR,
  EasyuiControlIR,
  LayoutContainerIR,
  PageIR,
  SpecialNodeIR,
} from "@kf/domain-client";

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

/**
 * 控件渲染上下文。`relative: true` 表示渲染在布局容器内（flex item /
 * region 面板）：使用相对定位、不输出 left/top，避免脱离 flex 流。
 */
interface RenderOptions {
  relative?: boolean;
}

function renderControl(control: ControlIR, options?: RenderOptions): string {
  const positionStyle = options?.relative
    ? `width:${control.width}px;height:${control.height}px`
    : layoutStyle(control);
  const relativeClass = options?.relative ? " kf-control-relative" : "";
  const base = `<div class="kf-control kf-${control.type}${relativeClass}" style="${positionStyle}" data-type="${control.type}">`;
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
    case "easyui":
      return renderEasyuiControl(control, base);
    case "layout":
      return renderLayoutContainer(control as LayoutContainerIR, options);
    case "prototype":
      return renderSpecialNode(control as SpecialNodeIR, base);
  }
  return base;
}

// ---------------------------------------------------------------------------
// KF 特殊节点渲染（type="prototype"，按 prototypeName 分派）
// ---------------------------------------------------------------------------

/** 图表型 prototypeName → 中文类型标签（参考工程 KF 源码语义）。 */
const SPECIAL_CHART_LABELS: Readonly<Record<string, string>> = {
  TrendChart: "趋势图",
  BarChart: "柱状图",
  PieChart: "饼图",
  XYChart: "XY曲线",
};

/** 告警/事件窗 prototypeName → 中文类型标签。 */
const SPECIAL_WINDOW_LABELS: Readonly<Record<string, string>> = {
  AlarmWindow: "告警窗口",
  EventWindow: "事件窗口",
};

/** 宽容读取未知对象字段（特殊节点复杂配置不建模，全部走 passthrough）。 */
function unknownField(obj: unknown, key: string): unknown {
  if (obj && typeof obj === "object") return (obj as Record<string, unknown>)[key];
  return undefined;
}

/** 提取非空字符串字段；缺失/非字符串返回空串。 */
function unknownString(value: unknown): string {
  return typeof value === "string" && value !== "" ? value : "";
}

/** 图表型标题：title.text 优先，回退 prototypeName。 */
function specialChartTitle(control: SpecialNodeIR): string {
  const text = unknownString(unknownField(control.title, "text"));
  return text !== "" ? text : control.prototypeName;
}

/** CustomCharts 标题：pageProperty.name 优先，回退 prototypeName。 */
function specialCustomTitle(control: SpecialNodeIR): string {
  const name = unknownString(unknownField(control.pageProperty, "name"));
  return name !== "" ? name : control.prototypeName;
}

/** 告警/事件窗标题：titleName 优先，其次 name，最后 prototypeName。 */
function specialWindowTitle(control: SpecialNodeIR): string {
  const titleName = unknownString(control.titleName);
  if (titleName !== "") return titleName;
  const name = unknownString(control.name);
  if (name !== "") return name;
  return control.prototypeName;
}

function renderSpecialNode(control: SpecialNodeIR, base: string): string {
  const { prototypeName } = control;
  if (prototypeName in SPECIAL_CHART_LABELS) return renderSpecialChart(control, base);
  if (prototypeName === "CustomCharts") return renderSpecialCustom(control, base);
  if (prototypeName in SPECIAL_WINDOW_LABELS) return renderSpecialWindow(control, base);
  return base; // 未知 prototypeName：仅保留几何占位框
}

/** 图表型占位：标题 + 类型标签（如 趋势图/柱状图/饼图/XY曲线）。 */
function renderSpecialChart(control: SpecialNodeIR, base: string): string {
  const title = escapeHtml(specialChartTitle(control));
  const label = escapeHtml(SPECIAL_CHART_LABELS[control.prototypeName] ?? control.prototypeName);
  return `${base}<div class="kf-special-chart"><span class="kf-special-icon">📈</span><span class="kf-special-title">${title}</span><span class="kf-special-tag">${label}</span></div></div>`;
}

/** CustomCharts 占位：标题 + ECharts 自定义图表标注。 */
function renderSpecialCustom(control: SpecialNodeIR, base: string): string {
  const title = escapeHtml(specialCustomTitle(control));
  return `${base}<div class="kf-special-custom"><span class="kf-special-icon">📊</span><span class="kf-special-title">${title}</span><span class="kf-special-tag">ECharts 自定义图表</span></div></div>`;
}

/** AlarmWindow/EventWindow 占位：标题 + 告警/事件窗口标签。 */
function renderSpecialWindow(control: SpecialNodeIR, base: string): string {
  const title = escapeHtml(specialWindowTitle(control));
  const label = escapeHtml(SPECIAL_WINDOW_LABELS[control.prototypeName] ?? control.prototypeName);
  return `${base}<div class="kf-special-alarm"><span class="kf-special-icon">🔔</span><span class="kf-special-title">${title}</span><span class="kf-special-tag">${label}</span></div></div>`;
}

// ---------------------------------------------------------------------------
// easyui 控件渲染（type="easyui"，按 EASYUI_PROTO_TYPES 分派）
// ---------------------------------------------------------------------------

function renderEasyuiControl(control: EasyuiControlIR, base: string): string {
  const proto = control.proto;
  const semantic = easyuiTypeName(proto);
  const inner = `<div class="kf-easyui kf-easyui-${semantic}" data-proto="${proto}">`;
  switch (semantic) {
    case "datagrid":
      return `${base}${inner}${renderEasyuiDatagrid(control)}</div></div>`;
    case "linkbutton":
      return `${base}${inner}${renderEasyuiLinkbutton(control)}</div></div>`;
    case "textbox":
    case "combobox":
    case "numberspinner":
    case "numberbox":
    case "spinner":
    case "searchbox":
    case "timespinner":
    case "validatebox":
    case "datetimebox":
    case "datebox":
    case "filebox":
      return `${base}${inner}${renderEasyuiInput(control)}</div></div>`;
    case "switchbutton":
      return `${base}${inner}${renderEasyuiSwitch(control)}</div></div>`;
    case "tree":
    case "treegrid":
      return `${base}${inner}${renderEasyuiTree(control)}</div></div>`;
    case "sidemenu":
      return `${base}${inner}${renderEasyuiSidemenu(control)}</div></div>`;
    default:
      return `${base}${inner}${renderEasyuiGeneric(semantic)}</div></div>`;
  }
}

/** 从 easyui `columns` 数组提取列名（宽容：title/field/text/name 或字符串）。 */
function easyuiColumnTitle(col: unknown): string {
  if (typeof col === "string") return col;
  if (col && typeof col === "object") {
    const c = col as Record<string, unknown>;
    for (const key of ["title", "field", "text", "name"]) {
      const v = c[key];
      if (typeof v === "string" && v !== "") return v;
    }
  }
  return "列";
}

function renderEasyuiDatagrid(control: EasyuiControlIR): string {
  const columns = Array.isArray(control.columns) ? control.columns : [];
  const colNames = columns.length > 0 ? columns.map(easyuiColumnTitle) : ["列1", "列2", "列3"];
  const showHeader = control.showHeader !== false;
  const striped = control.striped === true;
  const rownumbers = control.rownumbers === true;
  const headerCells = colNames.map((c) => `<th>${escapeHtml(c)}</th>`).join("");
  const header = showHeader
    ? `<thead><tr>${rownumbers ? '<th class="kf-easyui-rownumber">#</th>' : ""}${headerCells}</tr></thead>`
    : "";
  const colSpan = colNames.length + (rownumbers ? 1 : 0);
  return `<table class="kf-easyui-table${striped ? " kf-easyui-striped" : ""}">${header}<tbody><tr class="kf-easyui-empty"><td colspan="${colSpan}">暂无数据</td></tr></tbody></table>`;
}

function renderEasyuiLinkbutton(control: EasyuiControlIR): string {
  const pushBtn = (label: unknown, selected = false): string =>
    `<button class="kf-easyui-btn${selected ? " is-active" : ""}">${escapeHtml(typeof label === "string" ? label : "按钮")}</button>`;
  const group = Array.isArray(control.group) ? control.group : [];
  const buttons: string[] = [];
  if (typeof control.text === "string" && control.text !== "") {
    buttons.push(pushBtn(control.text));
  }
  for (const g of group) {
    if (typeof g === "string") {
      buttons.push(pushBtn(g));
    } else if (g && typeof g === "object") {
      const rec = g as Record<string, unknown>;
      buttons.push(pushBtn(rec["text"] ?? rec["title"] ?? "按钮", rec["selected"] === true));
    } else {
      buttons.push(pushBtn("按钮"));
    }
  }
  if (buttons.length === 0) buttons.push(pushBtn("按钮"));
  return `<div class="kf-easyui-btn-group">${buttons.join("")}</div>`;
}

function easyuiValue(control: EasyuiControlIR): string {
  const v = control.value;
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

/** textbox/combobox/numberspinner 等渲染成输入框（combobox 带下拉箭头、spinner 带微调符）。 */
function renderEasyuiInput(control: EasyuiControlIR): string {
  const value = easyuiValue(control);
  const prompt = typeof control.prompt === "string" ? control.prompt : "";
  const arrow =
    control.proto === 0
      ? '<span class="kf-easyui-arrow">▾</span>'
      : control.proto === 4 || control.proto === 8 || control.proto === 10
        ? '<span class="kf-easyui-spin">▲▼</span>'
        : "";
  return `<div class="kf-easyui-input-wrap"><input class="kf-input" value="${escapeHtml(value)}" placeholder="${escapeHtml(prompt)}" disabled>${arrow}</div>`;
}

function renderEasyuiSwitch(control: EasyuiControlIR): string {
  const on = control.checked === true || control.value === true;
  const onText = typeof control.onText === "string" ? control.onText : "开";
  const offText = typeof control.offText === "string" ? control.offText : "关";
  return `<span class="kf-switch ${on ? "is-on" : "is-off"}"><span class="kf-switch-on">${escapeHtml(onText)}</span><span class="kf-switch-off">${escapeHtml(offText)}</span></span>`;
}

/** tree/treegrid：缩进树列表骨架（无真实 data，用占位节点）。 */
function renderEasyuiTree(control: EasyuiControlIR): string {
  const checkbox = control.checkbox === true;
  const check = checkbox ? '<span class="kf-tree-check">☐</span>' : "";
  const nodes = [
    { level: 0, text: "根节点 1", open: true, hasChildren: true },
    { level: 1, text: "子节点 1-1", open: false, hasChildren: false },
    { level: 0, text: "根节点 2", open: false, hasChildren: false },
  ];
  const html = nodes
    .map(
      (n) =>
        `<div class="kf-easyui-tree-item" style="padding-left:${n.level * 16}px">${
          n.hasChildren ? '<span class="kf-tree-toggle">▸</span>' : '<span class="kf-tree-toggle"></span>'
        }${check}${escapeHtml(n.text)}</div>`,
    )
    .join("");
  return `<div class="kf-easyui-tree">${html}</div>`;
}

/** sidemenu：侧边菜单（取 `menu` 数据或占位项）。 */
function renderEasyuiSidemenu(control: EasyuiControlIR): string {
  const menu = Array.isArray(control.menu) ? control.menu : [];
  const texts =
    menu.length > 0
      ? menu.map((m) => {
          if (typeof m === "string") return m;
          if (m && typeof m === "object") {
            const rec = m as Record<string, unknown>;
            const t = rec["text"] ?? rec["title"] ?? rec["name"];
            if (typeof t === "string") return t;
          }
          return "菜单项";
        })
      : ["菜单项 1", "菜单项 2"];
  const html = texts
    .map((t, i) => `<div class="kf-easyui-sidemenu-item${i === 0 ? " is-active" : ""}">${escapeHtml(t)}</div>`)
    .join("");
  return `<div class="kf-easyui-sidemenu">${html}</div>`;
}

/** 其余 proto：通用带标签的控件框。 */
function renderEasyuiGeneric(semantic: string): string {
  return `<div class="kf-easyui-generic"><span class="kf-easyui-label">${escapeHtml(semantic)}</span></div>`;
}

// ---------------------------------------------------------------------------
// 布局容器渲染（type="layout"，按 layoutType 分派，children 递归）
// ---------------------------------------------------------------------------

function layoutClassName(layoutType: number): string {
  switch (layoutType) {
    case 2:
      return "kf-layout-horizontal";
    case 4:
      return "kf-layout-vertical";
    case 3:
      return "kf-layout-tab";
    case 5:
      return "kf-layout-docking";
    case 0:
      return "kf-layout-accordion";
    case 6:
      return "kf-layout-flowchart";
    default:
      return "kf-layout-generic";
  }
}

function renderLayoutContainer(control: LayoutContainerIR, options?: RenderOptions): string {
  const positionStyle = options?.relative
    ? `width:${control.width}px;height:${control.height}px`
    : layoutStyle(control);
  const relativeClass = options?.relative ? " kf-control-relative" : "";
  const inner = renderLayoutInner(control.layoutType, control.children ?? [], control.panels);
  return `<div class="kf-control kf-layout ${layoutClassName(control.layoutType)}${relativeClass}" style="${positionStyle}" data-type="layout" data-layout-type="${control.layoutType}">${inner}</div>`;
}

function renderLayoutInner(layoutType: number, children: ContainerChildIR[], panels?: ContainerChildIR[]): string {
  const items = children.map(renderLayoutChild).join("");
  switch (layoutType) {
    case 2: // HorizontalLayout 水平
      return `<div class="kf-layout-inner kf-layout-row">${items}</div>`;
    case 4: // VerticalLayout 垂直
      return `<div class="kf-layout-inner kf-layout-column">${items}</div>`;
    case 6: // ProjectFlowChart 流程图
      return `<div class="kf-layout-inner kf-layout-row">${items}</div>`;
    case 3: // Tab 选项卡
      return renderLayoutTabs(children);
    case 5: // DockingLayout 区域
      return renderLayoutDocking(children, panels);
    case 0: // Accordion 折叠
      return renderLayoutAccordion(children);
    default:
      return `<div class="kf-layout-inner kf-layout-row">${items}</div>`;
  }
}

function renderLayoutTabs(children: ContainerChildIR[]): string {
  if (children.length === 0) return `<div class="kf-layout-tabs"><div class="kf-layout-tabbar"></div></div>`;
  const bar = `<div class="kf-layout-tabbar">${children
    .map((c, i) => `<span class="kf-layout-tab${i === 0 ? " is-active" : ""}">${escapeHtml(childName(c) || "面板")}</span>`)
    .join("")}</div>`;
  const panels = children
    .map((c, i) => `<div class="kf-layout-tabpanel${i === 0 ? " is-active" : ""}">${renderLayoutChild(c)}</div>`)
    .join("");
  return `<div class="kf-layout-tabs">${bar}${panels}</div>`;
}

function renderLayoutAccordion(children: ContainerChildIR[]): string {
  const items = children
    .map((c, i) => {
      const open = i === 0;
      return `<div class="kf-accordion-item"><div class="kf-accordion-header${open ? " is-active" : ""}">${escapeHtml(childName(c) || "面板")}</div><div class="kf-accordion-body${open ? " is-open" : ""}">${renderLayoutChild(c)}</div></div>`;
    })
    .join("");
  return `<div class="kf-layout-accordion">${items}</div>`;
}

function isDockingRegion(value: string): boolean {
  return value === "north" || value === "south" || value === "west" || value === "east" || value === "center";
}

function childRegion(rec: Record<string, unknown>): string {
  const r = rec["region"];
  if (typeof r === "string" && isDockingRegion(r)) return r;
  const bp = rec["baseProperty"];
  if (bp && typeof bp === "object") {
    const r2 = (bp as Record<string, unknown>)["region"];
    if (typeof r2 === "string" && isDockingRegion(r2)) return r2;
  }
  return "";
}

/** docking：按 children 的 region 字段（回退到 panels 的 region 顺序）分派四边区域。 */
function renderLayoutDocking(children: ContainerChildIR[], panels?: ContainerChildIR[]): string {
  const regionFallbacks = (panels ?? [])
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>)["region"] : undefined))
    .filter((r): r is string => typeof r === "string" && isDockingRegion(r));
  let fallbackIndex = 0;
  const regions = children.map((c) => {
    const r = childRegion(c);
    if (r !== "") return r;
    const fb = regionFallbacks[fallbackIndex];
    if (fb) {
      fallbackIndex++;
      return fb;
    }
    return "center";
  });
  const items = children
    .map((c, i) => `<div class="kf-docking-region kf-docking-${regions[i]}">${renderLayoutChild(c)}</div>`)
    .join("");
  return `<div class="kf-layout-docking">${items}</div>`;
}

/** 布局子对象 → 相对定位渲染（子 easyui/子布局继续走对应 case）。 */
function renderLayoutChild(rec: unknown): string {
  if (!rec || typeof rec !== "object") return "";
  const ir = kfChildToControlIR(rec as Record<string, unknown>);
  if (!ir) return "";
  return renderControl(ir as ControlIR, { relative: true });
}

// ---------------------------------------------------------------------------
// KF 容器子对象 → IR 形状（宽容提取，与 kfControlToIR 同一套判型优先级）
// ---------------------------------------------------------------------------

function childGeometry(rec: Record<string, unknown>): { x: number; y: number; width: number; height: number } {
  const bp = rec["baseProperty"] && typeof rec["baseProperty"] === "object" ? (rec["baseProperty"] as Record<string, unknown>) : undefined;
  const top = rec["leftTopPt"] && typeof rec["leftTopPt"] === "object" ? (rec["leftTopPt"] as Record<string, unknown>) : undefined;
  const bpLp = bp?.["leftTopPt"] && typeof bp["leftTopPt"] === "object" ? (bp["leftTopPt"] as Record<string, unknown>) : undefined;
  const lp = top ?? bpLp ?? {};
  const width = kfNum(rec["width"] !== undefined ? rec["width"] : bp?.["width"]);
  const height = kfNum(rec["height"] !== undefined ? rec["height"] : bp?.["height"]);
  return { x: kfNum(lp["x"]), y: kfNum(lp["y"]), width, height };
}

function childName(rec: Record<string, unknown>): string {
  const name = rec["name"];
  if (typeof name === "string" && name !== "") return name;
  const bp = rec["baseProperty"];
  if (bp && typeof bp === "object") {
    const n = (bp as Record<string, unknown>)["name"];
    if (typeof n === "string" && n !== "") return n;
  }
  return "";
}

/** easyui 子对象（objectType=3）→ EasyuiControlIR 形状，透传 proto 白名单字段。 */
function kfEasyuiToIR(rec: Record<string, unknown>): Record<string, unknown> {
  const geo = childGeometry(rec);
  const proto = kfNum(rec["uiExtendType"]);
  const out: Record<string, unknown> = {
    id: childName(rec) || `easyui-${proto}`,
    type: "easyui",
    proto,
    x: geo.x,
    y: geo.y,
    width: geo.width,
    height: geo.height,
  };
  const allowed = EASYUI_PROTO_FIELDS[proto];
  if (allowed) {
    for (const key of allowed) {
      if (rec[key] !== undefined) out[key] = rec[key];
    }
  }
  // 渲染骨架需要的结构化数据（走 configureData 脚本，不在可修改字段白名单内）
  for (const key of ["columns", "data", "toolbar"]) {
    if (rec[key] !== undefined) out[key] = rec[key];
  }
  return out;
}

/** 布局子对象（objectType=2 + layoutType）→ LayoutContainerIR 形状，children/panels 原样保留。 */
function kfLayoutToIR(rec: Record<string, unknown>): Record<string, unknown> {
  const geo = childGeometry(rec);
  const layoutType = kfNum(rec["layoutType"]);
  const out: Record<string, unknown> = {
    id: childName(rec) || `layout-${layoutType}`,
    type: "layout",
    layoutType,
    x: geo.x,
    y: geo.y,
    width: geo.width,
    height: geo.height,
  };
  if (Array.isArray(rec["insiderObjects"])) out["children"] = rec["insiderObjects"];
  if (Array.isArray(rec["dPanelsOption"])) out["panels"] = rec["dPanelsOption"];
  return out;
}

/** KF 容器子对象 → IR 形状；无法识别时返回 null（判型优先级同 kfControlToIR）。 */
function kfChildToControlIR(rec: Record<string, unknown>): Record<string, unknown> | null {
  if (typeof rec["uiModelType"] === "number") return kfControlToIR(rec);
  if (rec["objectType"] === 3) return kfEasyuiToIR(rec);
  if (typeof rec["layoutType"] === "number" && (rec["objectType"] === 2 || rec["objectType"] == null)) {
    return kfLayoutToIR(rec);
  }
  return null;
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
  const controls = page.controls.map((control) => renderControl(control)).join("");
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
.kf-step.is-active{color:${THEME_COLOR};font-weight:600}
/* ---- KF 容器对象：easyui 控件 / 布局容器（dark 大屏主题） ---- */
.kf-control-relative{position:relative;flex-shrink:0}
.kf-easyui{position:relative;width:100%;height:100%;min-width:0;min-height:0;overflow:hidden}
.kf-easyui-table{width:100%;height:100%;border-collapse:collapse;font-size:13px;table-layout:fixed}
.kf-easyui-table th{background:#161b26;border:1px solid #2a3342;padding:4px 8px;text-align:left;font-weight:600;color:#e8ecf4}
.kf-easyui-table td{border:1px solid #2a3342;padding:4px 8px;color:#9fb0c9}
.kf-easyui-table.kf-easyui-striped tbody tr:nth-child(even){background:#161b26}
.kf-easyui-table .kf-easyui-rownumber{width:40px;color:#9fb0c9;text-align:center}
.kf-easyui-table .kf-easyui-empty td{text-align:center;color:#5c6b83;padding:12px 0}
.kf-easyui-btn-group{display:flex;flex-wrap:wrap;gap:4px;height:100%;align-items:center}
.kf-easyui-btn{border:1px solid #1d4ed8;border-radius:4px;background:${THEME_COLOR};color:#fff;font-size:13px;padding:4px 12px;cursor:pointer;height:28px}
.kf-easyui-btn.is-active{border-color:#ffffff;box-shadow:0 0 0 1px #ffffff inset}
.kf-easyui-input-wrap{display:flex;align-items:center;gap:4px;height:100%}
.kf-easyui-input-wrap .kf-input{flex:1;min-width:0}
.kf-easyui-arrow,.kf-easyui-spin{color:#9fb0c9;font-size:12px;white-space:nowrap}
.kf-easyui-tree{font-size:13px;color:#e8ecf4;height:100%;overflow:auto;padding:4px 6px}
.kf-easyui-tree-item{line-height:24px;white-space:nowrap}
.kf-tree-toggle{display:inline-block;width:14px;color:#9fb0c9}
.kf-easyui-sidemenu{height:100%;overflow:auto;background:#161b26;border-right:1px solid #2a3342}
.kf-easyui-sidemenu-item{padding:8px 14px;font-size:13px;color:#9fb0c9;border-left:3px solid transparent}
.kf-easyui-sidemenu-item.is-active{color:#fff;background:#1c2333;border-left-color:${THEME_COLOR}}
.kf-easyui-generic{display:flex;align-items:center;justify-content:center;width:100%;height:100%;font-size:13px;color:#9fb0c9;border:1px dashed #2a3342;border-radius:4px}
.kf-easyui-label{background:#1c2333;border:1px solid #2a3342;border-radius:4px;padding:2px 8px;font-size:12px;color:#e8ecf4}
.kf-layout{overflow:hidden}
.kf-layout-inner{position:absolute;inset:0;display:flex;gap:4px;padding:4px;overflow:auto}
.kf-layout-row{flex-direction:row;align-items:flex-start}
.kf-layout-column{flex-direction:column;align-items:flex-start}
.kf-layout-tabs{display:flex;flex-direction:column;height:100%}
.kf-layout-tabbar{display:flex;flex-shrink:0;gap:2px;background:#161b26;border-bottom:1px solid #2a3342;overflow-x:auto}
.kf-layout-tab{padding:0 12px;font-size:13px;color:#9fb0c9;line-height:30px;border-bottom:2px solid transparent;white-space:nowrap;cursor:pointer}
.kf-layout-tab.is-active{color:#fff;border-bottom-color:${THEME_COLOR};font-weight:600}
.kf-layout-tabpanel{display:none;flex:1;min-height:0;position:relative}
.kf-layout-tabpanel.is-active{display:block}
.kf-layout-docking{position:relative;width:100%;height:100%}
.kf-docking-region{position:absolute}
.kf-docking-north{top:0;left:0;right:0;z-index:1}
.kf-docking-south{bottom:0;left:0;right:0;z-index:1}
.kf-docking-west{top:0;left:0;bottom:0;z-index:1}
.kf-docking-east{top:0;right:0;bottom:0;z-index:1}
.kf-docking-center{inset:0;z-index:0}
.kf-layout-accordion{display:flex;flex-direction:column;gap:4px;height:100%;overflow:auto;padding:4px}
.kf-accordion-item{border:1px solid #2a3342;border-radius:4px;overflow:hidden;flex-shrink:0}
.kf-accordion-header{padding:6px 10px;font-size:13px;background:#161b26;color:#e8ecf4;cursor:pointer}
.kf-accordion-header.is-active{color:#fff;border-bottom:1px solid #2a3342}
.kf-accordion-body{display:none;padding:4px}
.kf-accordion-body.is-open{display:block}
/* ---- KF 特殊节点占位（type="prototype"：CustomCharts / 图表型 / 告警窗） ---- */
.kf-special-chart,.kf-special-custom,.kf-special-alarm{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;width:100%;height:100%;border:1px dashed #3d4d66;border-radius:6px;background:#161b26;color:#9fb0c9;text-align:center;overflow:hidden;padding:8px}
.kf-special-icon{font-size:28px;line-height:1;flex-shrink:0}
.kf-special-title{max-width:90%;font-size:15px;font-weight:600;color:#e8ecf4;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kf-special-tag{background:#1c2333;border:1px solid #2a3342;border-radius:4px;padding:2px 8px;font-size:12px;color:#8fb4ff}`;

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

/** KF 特殊节点 prototypeName 集合（与 domain-client inspect 的 SPECIAL_PROTOTYPE_NAMES 一致）。 */
const SPECIAL_PROTOTYPE_NAMES: ReadonlySet<string> = new Set([
  "CustomCharts",
  "AlarmWindow",
  "EventWindow",
  "TrendChart",
  "BarChart",
  "PieChart",
  "XYChart",
]);

/**
 * KF 特殊节点 JSON → SpecialNodeIR 形状：type="prototype" + prototypeName 特判，
 * 几何宽容提取（CustomCharts 在 pageProperty{pagePos,pageSize}，其余在顶层
 * leftTopPt/width/height），其余复杂配置（title/areas/objects/pageProperty/
 * columns 等）passthrough 原样保留，由 renderSpecialNode 消费。
 */
function kfSpecialToIR(rec: Record<string, unknown>): Record<string, unknown> {
  const prototypeName = rec["prototypeName"] as string;
  let geometry: { x: number; y: number; width: number; height: number };
  if (prototypeName === "CustomCharts") {
    const pageProperty = (rec["pageProperty"] ?? {}) as Record<string, unknown>;
    const pagePos = (pageProperty["pagePos"] ?? {}) as Record<string, unknown>;
    const pageSize = (pageProperty["pageSize"] ?? {}) as Record<string, unknown>;
    geometry = {
      x: kfNum(pagePos["x"]),
      y: kfNum(pagePos["y"]),
      width: kfNum(pageSize["width"]),
      height: kfNum(pageSize["height"]),
    };
  } else {
    const lp = (rec["leftTopPt"] ?? {}) as Record<string, unknown>;
    geometry = {
      x: kfNum(lp["x"]),
      y: kfNum(lp["y"]),
      width: kfNum(rec["width"]),
      height: kfNum(rec["height"]),
    };
  }
  return {
    ...rec,
    id: typeof rec["name"] === "string" ? rec["name"] : `prototype-${prototypeName}`,
    type: "prototype",
    prototypeName,
    ...geometry,
  };
}

/** KF 控件对象 → ControlIR 形状（宽容提取渲染所需字段）。 */
function kfControlToIR(rec: Record<string, unknown>): Record<string, unknown> {
  // 容器对象：easyui（objectType=3）/ 布局（layoutType）优先于静态兜底；
  // 特殊节点（prototypeName）在容器之后特判（与 inspect 判型优先级一致）。
  if (rec["objectType"] === 3) return kfEasyuiToIR(rec);
  if (typeof rec["layoutType"] === "number" && (rec["objectType"] === 2 || rec["objectType"] == null)) {
    return kfLayoutToIR(rec);
  }
  if (typeof rec["prototypeName"] === "string" && SPECIAL_PROTOTYPE_NAMES.has(rec["prototypeName"])) {
    return kfSpecialToIR(rec);
  }
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
