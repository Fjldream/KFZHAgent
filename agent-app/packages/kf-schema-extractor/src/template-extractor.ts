/**
 * kf-template-extractor —— 从 KF 开发态控件源码自动提取控件模板。
 *
 * 来源（KF 3.6 客户端源码，均验证存在）：
 *  - 控件构造器：UI/kmui_*.js（老式 function + KMUIModelBase.call）与
 *    ElementUI/kmui_elementui_*.js（ES6 class extends KMUIElementBase）
 *  - 枚举表：Global/kmui_glabolvar.js（kmUIModeTypeEnum / typeEnumArr /
 *    layoutStyleEnumArr / borderStyleEnum）
 *  - 中文文案：Global/kmui_zh_resource.js（IDS_XXX）
 *
 * 提取逻辑：构造器体内 `this.<path> = <literal>` 字面量赋值即为控件默认属性
 * 骨架（编译期模板），与 SDB 真实页面样本对照补全。
 */

/** kmUIModeTypeEnum 完整枚举（取自 kmui_glabolvar.js，注意 BUTTON:2 被 35 覆盖） */
export const KM_UI_MODE_TYPE_ENUM: Readonly<Record<string, number>> = {
  RADIO: 0,
  CHECKBOX: 1,
  COMBOBOX: 3,
  CLAENDAR: 4,
  DATATIME: 5,
  TEXTBOX: 6,
  RICHTEXT: 7,
  SCALE: 8,
  LIST: 9,
  MENU: 10,
  TREEVIEW: 11,
  WEBCONTAINER: 12,
  HORIZONTALSPACER: 13,
  VERTICALSPACER: 14,
  GANTT: 30,
  TABLE: 31,
  TREE: 32,
  DROPDOWN: 33,
  NAVMENU: 34,
  BUTTON: 35,
  ELEMENTRADIO: 36,
  ELEMENTCHECHECKBOX: 37,
  INPUT: 38,
  CASCADER: 39,
  DATETIMEPICKER: 40,
  IMAGE: 41,
  CUSTOMMODEL: 42,
  FACTORYCALENDAR: 43,
  SELECT: 44,
  UPLOAD: 45,
  TRANSFER: 46,
  TABS: 47,
  SWITCH: 48,
  INPUTNUMBER: 49,
  TAG: 50,
  TIMELINE: 51,
  STEPS: 52,
  REPORT: 53,
};

/** 控件类型（IR 12 种）→ 源码 uiModelType 枚举名 */
export const CONTROL_UI_MODEL_NAMES: Readonly<Record<string, string>> = {
  text: "TEXTBOX",
  richtext: "RICHTEXT",
  button: "BUTTON",
  inputnumber: "INPUTNUMBER",
  switch: "SWITCH",
  checkbox: "ELEMENTCHECHECKBOX",
  radio: "ELEMENTRADIO",
  select: "SELECT",
  image: "IMAGE",
  tabs: "TABS",
  table: "TABLE",
  spacer: "VERTICALSPACER",
};

export interface UiModelTypeInfo {
  /** 枚举名，如 TEXTBOX */
  name: string;
  /** 数字值，如 6 */
  value: number;
}

/** 跳过字符串/模板字符串/行注释，返回配平的大括号体 */
function balanced(src: string, start: number, open: string, close: string): string {
  let depth = 0;
  let i = start;
  while (i < src.length) {
    const c = src[i];
    if (c === "'" || c === '"') {
      const q = c;
      i++;
      while (i < src.length) {
        if (src[i] === "\\") i += 2;
        else if (src[i] === q) { i++; break; }
        else i++;
      }
      continue;
    }
    if (c === "`") {
      i++;
      while (i < src.length) {
        if (src[i] === "\\") i += 2;
        else if (src[i] === "`") { i++; break; }
        else i++;
      }
      continue;
    }
    if (c === "/" && src[i + 1] === "/") {
      while (i < src.length && src[i] !== "\n") i++;
      continue;
    }
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return src.slice(start, i);
    }
    i++;
  }
  return "";
}

/** 提取构造器体（function 或 class constructor） */
export function extractConstructorBody(src: string): string {
  // class X extends Y { ... constructor(){ ... } }
  const cls = src.match(/class\s+\w+[\s\S]*?constructor\s*\([^)]*\)\s*\{/);
  if (cls) {
    const start = src.indexOf(cls[0]) + cls[0].length - 1; // 指向 { 本身，depth 从 1 起
    return balanced(src, start, "{", "}");
  }
  // function KX(...){ ... }
  const fn = src.match(/function\s+KMU?\w*\s*\([^)]*\)\s*\{/);
  if (fn) {
    const start = src.indexOf(fn[0]) + fn[0].length - 1;
    return balanced(src, start, "{", "}");
  }
  return "";
}

/** JS 对象/数组字面量 → JSON（处理无引号属性名、单引号字符串） */
export function jsLiteralToJSON(s: string): string {
  // 1. 提取字符串字面量（单/双引号）为占位符
  const strings: string[] = [];
  let out = s.replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, (m) => {
    let content = m.slice(1, -1);
    if (m[0] === "'") {
      content = content.replace(/\\'/g, "'").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    }
    strings.push(JSON.stringify(content));
    return `__KFS${strings.length - 1}__`;
  });
  // 2. 无引号属性名补引号：{foo:1, "bar":2} → {"foo":1, "bar":2}
  out = out.replace(/([{,]\s*)([A-Za-z_$][\w$]*)(\s*:)/g, '$1"$2"$3');
  // 2.5 JS 布尔简写 !0/!1 → true/false（字符串已被占位隔离）
  out = out.replace(/!0/g, "true").replace(/!1/g, "false");
  // 3. 还原字符串
  out = out.replace(/__KFS(\d+)__/g, (_, i) => strings[Number(i)] ?? "");
  return out;
}

function skipWs(src: string, i: number): number {
  while (i < src.length && /\s/.test(src[i] ?? "")) i++;
  return i;
}

/** 读取标量 token（字符串/数字/!0/!1/true/false/null/undefined/标识符） */
function readScalar(src: string, i: number): { value: unknown; next: number } | null {
  const c = src[i];
  if (c === "'" || c === '"') {
    let j = i + 1;
    while (j < src.length) {
      if (src[j] === "\\") j += 2;
      else if (src[j] === c) break;
      else j++;
    }
    const raw = src.slice(i, j + 1);
    try {
      return { value: JSON.parse(raw[0] === '"' ? raw : '"' + raw.slice(1, -1).replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"'), next: j + 1 };
    } catch {
      return { value: raw.slice(1, -1), next: j + 1 };
    }
  }
  const m = src.slice(i).match(/^(?:-?\d+(?:\.\d+)?|!0|!1|true|false|null|undefined|[A-Za-z_$][\w$]*)/);
  if (!m) return null;
  const token = m[0];
  let value: unknown;
  switch (token) {
    case "!0": value = true; break;
    case "!1": value = false; break;
    case "true": value = true; break;
    case "false": value = false; break;
    case "null": value = null; break;
    case "undefined": return null; // 跳过
    default:
      if (/^-?\d+(\.\d+)?$/.test(token)) value = Number(token);
      else return null; // 标识符（非字面量）
  }
  return { value, next: i + token.length };
}

/** 从 { 或 [ 起平衡读取完整字面量串 */
function readBalanced(src: string, i: number): string {
  const open = src[i] ?? "";
  const close = open === "{" ? "}" : "]";
  const end = balanced(src, i, open, close);
  return end ? src.slice(i, i + end.length + 1) : "";
}

/** 解析一个值（字面量或平衡对象/数组），非字面量返回 undefined */
function parseValueAt(
  src: string,
  i: number,
  ctx: ExtractionContext = {},
): { value: unknown; next: number } | null {
  const c = src[i];
  if (c === "{" || c === "[") {
    const raw = readBalanced(src, i);
    if (!raw) return null;
    try {
      const withIds = resolveIdentifierRefs(raw, ctx);
      const v: unknown = JSON.parse(jsLiteralToJSON(withIds));
      return { value: v, next: i + raw.length };
    } catch {
      return null; // 含非字面量（标识符/函数），跳过
    }
  }
  return readScalar(src, i);
}

/** 把已登记标识符（如 buttonType.PRIMARY）替换为字面量，使对象可 JSON 化 */
function resolveIdentifierRefs(raw: string, ctx: ExtractionContext): string {
  const values = ctx.identifierValues;
  if (!values) return raw;
  return raw.replace(/([A-Za-z_$][\w$]*)\.([A-Za-z_$][\w$]*)/g, (ref, a: string, b: string) => {
    const va: unknown = values[a];
    if (va !== null && typeof va === "object" && b in (va as Record<string, unknown>)) {
      const entry: unknown = (va as Record<string, unknown>)[b];
      return JSON.stringify(entry);
    }
    return ref;
  });
}

function setPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(".");
  let cur: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]!;
    if (typeof cur[k] !== "object" || cur[k] === null) cur[k] = {};
    cur = cur[k] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]!] = value;
}

export interface ExtractionContext {
  /** 标识符 → 值（如 buttonType.PRIMARY → "primary"）用于 defaultData 内枚举引用 */
  identifierValues?: Record<string, unknown>;
}

/** 提取构造器体内 this.<path> = <literal> 全部默认字段（含嵌套路径、枚举引用） */
export function extractFieldDefaults(
  src: string,
  ctx: ExtractionContext = {},
): Record<string, unknown> {
  const body = extractConstructorBody(src);
  if (!body) return {};
  const fields: Record<string, unknown> = {};
  const re = /this\.([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\s*=/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    const path = m[1] ?? "";
    const after = skipWs(body, re.lastIndex);
    const parsed = parseValueAt(body, after, ctx);
    if (parsed) {
      setPath(fields, path, parsed.value);
      re.lastIndex = parsed.next;
    }
  }
  return fields;
}

/** 运行时/实例引用字段——序列化时被排除，不进入模板 */
export const RUNTIME_EXCLUDED_FIELDS = new Set([
  "thisElement",
  "domId",
  "UIId",
  "textInput",
  "currentEditor",
  "eventObj",
  "initialVue",
  "fontsizeTime",
  "buttonId",
  "switchId",
  "radioId",
  "checkboxId",
  "selectId",
  "tableId",
  "treeId",
  "uploadId",
  "cascaderId",
  "imgId",
  "tabId",
  "sliderId",
  "element",
  "$vm",
  "inputId",
]);

/** 提取 ElementUI 控件序列化白名单 this.propertys=[...] */
export function extractPropertys(src: string): string[] | null {
  const body = extractConstructorBody(src);
  if (!body) return null;
  const m = body.match(/this\.propertys\s*=\s*(\[[^\]]*\])/);
  if (!m) return null;
  const arr = m[1] ?? "";
  const vals = arr.match(/"[^"]*"|'[^']*'/g);
  return vals ? vals.map((v) => v.slice(1, -1)) : [];
}

/** 过滤运行时字段后的默认字段 */
export function filterRuntimeFields(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (RUNTIME_EXCLUDED_FIELDS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

/** 提取 uiModelType 注册（枚举名 + 数字值） */
export function extractUiModelType(src: string): UiModelTypeInfo | null {
  const body = extractConstructorBody(src);
  if (!body) return null;
  const m = body.match(/uiModelType\s*=\s*(?:kmUIModeTypeEnum\.)?(\w+|\d+)/);
  if (!m) return null;
  const token = m[1] ?? "";
  if (/^\d+$/.test(token)) return { name: String(token), value: Number(token) };
  const value = KM_UI_MODE_TYPE_ENUM[token];
  if (value === undefined) return null;
  return { name: token, value };
}

/** 提取继承基类名（class extends 或构造器内 Base.call(this)） */
export function extractBaseClassName(src: string): string | null {
  const cls = src.match(/class\s+(\w+)\s+extends\s+(\w+)/);
  if (cls) return cls[2]!;
  const call = src.match(/(KMUI\w+)\.call\(\s*this\s*\)/);
  if (call) return call[1]!;
  return null;
}

/** 提取控件构造器函数名（prototypeName 除外，取类/函数名） */
export function extractControlClassName(src: string): string | null {
  const cls = src.match(/class\s+(\w+)/);
  if (cls) return cls[1]!;
  const fn = src.match(/function\s+(KMU?\w*)/);
  if (fn) return fn[1]!;
  return null;
}

export interface ControlTemplateExtraction {
  /** uiModelType 数字值 */
  uiModelType: number;
  /** uiModelType 枚举名 */
  uiModelTypeName: string;
  /** 构造器函数/类名 */
  className: string;
  /** 基类名 */
  baseClassName: string | null;
  /** 提取的字段默认值 */
  defaults: Record<string, unknown>;
}

/** 从单个控件源码文件提取控件模板（不含基类合并） */
export function extractControlSource(src: string): ControlTemplateExtraction | null {
  const ui = extractUiModelType(src);
  if (!ui) return null;
  return {
    uiModelType: ui.value,
    uiModelTypeName: ui.name,
    className: extractControlClassName(src) ?? "",
    baseClassName: extractBaseClassName(src),
    defaults: extractFieldDefaults(src),
  };
}

/** 合并基类默认值（子类覆盖基类同名键；对象深合并） */
export function mergeDefaults(
  base: Record<string, unknown>,
  derived: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(derived)) {
    const prev = out[k];
    if (
      prev !== null &&
      typeof prev === "object" &&
      !Array.isArray(prev) &&
      v !== null &&
      typeof v === "object" &&
      !Array.isArray(v)
    ) {
      out[k] = mergeDefaults(prev as Record<string, unknown>, v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
