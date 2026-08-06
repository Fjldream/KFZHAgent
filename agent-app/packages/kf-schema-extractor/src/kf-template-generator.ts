#!/usr/bin/env node
/**
 * generate-templates —— 从 KF 开发态源码自动生成全部控件模板 JSON（v2）。
 *
 * 模板结构（对齐现有 text.json/button.json 的平铺风格）：
 *   { uiModelType, ...defaultData 属性默认值, sizePolicy, attributes?, connectArray?, ... }
 *
 * 序列化白名单依据（源码实证）：
 *   - ElementUI 控件：objectToJson 输出 = propertys（基类白名单）∪ attributes（$vm 属性）
 *     ∪ linkMng ∪ setPrimary；属性默认值来自 defaultData（含枚举引用如 buttonType.PRIMARY）
 *   - 老式控件：objectToJson 输出 = 构造器字段（排除 thisElement/linkMng/$Parent*）∪ 显式补充字段
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  extractConstructorBody,
  extractControlSource,
  extractFieldDefaults,
  extractPropertys,
  filterRuntimeFields,
  jsLiteralToJSON,
  mergeDefaults,
} from "./template-extractor.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** 12 种 IR 控件 → 源码文件 + 基类 */
const CONTROLS: Record<string, { file: string; base: string | null; templateName: string }> = {
  text: { file: "Common/Graphic/UI/kmui_textbox.js", base: "KMUIModelBase", templateName: "text" },
  richtext: { file: "Common/Graphic/UI/kmui_richtext.js", base: "KMUIModelBase", templateName: "richtext" },
  button: { file: "Common/Graphic/ElementUI/kmui_elementui_button.js", base: "KMUIElementBase", templateName: "button" },
  inputnumber: { file: "Common/Graphic/ElementUI/kmui_elementui_inputnumber.js", base: "KMUIElementBase", templateName: "inputnumber" },
  switch: { file: "Common/Graphic/ElementUI/kmui_elementui_switch.js", base: "KMUIElementBase", templateName: "switch" },
  checkbox: { file: "Common/Graphic/ElementUI/kmui_elementui_checkbox.js", base: "KMUIElementBase", templateName: "checkbox" },
  radio: { file: "Common/Graphic/ElementUI/kmui_elementui_radio.js", base: "KMUIElementBase", templateName: "radio" },
  select: { file: "Common/Graphic/ElementUI/kmui_elementui_select.js", base: "KMUIElementBase", templateName: "select" },
  image: { file: "Common/Graphic/ElementUI/kmui_elementui_image.js", base: "KMUIElementBase", templateName: "image" },
  tabs: { file: "Common/Graphic/ElementUI/kmui_elementui_tabs.js", base: "KMUIElementBase", templateName: "tabs" },
  table: { file: "Common/Graphic/ElementUI/kmui_elementui_table.js", base: "KMUIElementBase", templateName: "table" },
  spacer: { file: "Common/Graphic/UI/kmui_vertical_spacer.js", base: "KMUIModelBase", templateName: "spacer" },
};

/** 基类源码文件 */
const BASES: Record<string, string> = {
  KMUIModelBase: "Common/Graphic/UI/kmui_modelbase.js",
  KMUIElementBase: "Common/Graphic/ElementUI/kmui_elementui_base.js",
};

/** 解析 kmui_zh_resource.js 的 var IDS_XXX="中文" */
export async function parseIdsZh(resourceJs: string): Promise<Record<string, string>> {
  const src = await readFile(resourceJs, "utf8");
  const map: Record<string, string> = {};
  const re = /IDS_([A-Z0-9_]+)="((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    map[m[1] ?? ""] = (m[2] ?? "")
      .replace(/\\u([0-9a-fA-F]{4})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)))
      .replace(/\\"/g, '"');
  }
  return map;
}

/** 从源码提取控件专属枚举（如 buttonType={PRIMARY:"primary",...}），供 defaultData 引用求值 */
function extractControlEnums(src: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  // 匹配 标识符={字面量对象}（值全为字面量）
  const re = /([A-Za-z_$][\w$]*)=\{((?:[^{}]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const name = m[1] ?? "";
    try {
      const v: unknown = JSON.parse(jsLiteralToJSON(`{${m[2]}}`));
      if (isScalarEnum(v)) out[name] = v;
    } catch {
      /* 非纯字面量枚举，跳过 */
    }
  }
  return out;
}

/** 枚举对象：属性值全为标量（字符串/数字/布尔/null） */
function isScalarEnum(v: unknown): v is Record<string, unknown> {
  if (v === null || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.values(v).every(
    (x) => x === null || ["string", "number", "boolean"].includes(typeof x),
  );
}

/** 从源码提取 defaultData 对象的枚举引用 ctx（全局 + 本地枚举） */
export function buildIdentifierCtx(
  src: string,
  ids: Record<string, string>,
  globalSrc?: string,
): Record<string, unknown> {
  const ctx: Record<string, unknown> = {
    ...(globalSrc ? extractControlEnums(globalSrc) : {}),
    ...extractControlEnums(src),
  };
  // 常用全局枚举：typeEnumArr/layoutStyleEnumArr 元素是 IDS_ 标识符 → 中文
  for (const [k, v] of Object.entries(ctx)) {
    ctx[k] = resolveIdsInObject(v, ids);
  }
  return ctx;
}

function resolveIdsInObject(v: unknown, ids: Record<string, string>): unknown {
  if (typeof v === "string" && v.startsWith("IDS_") && v in ids) return ids[v];
  if (Array.isArray(v)) return v.map((x) => resolveIdsInObject(x, ids));
  if (v !== null && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) out[k] = resolveIdsInObject(x, ids);
    return out;
  }
  return v;
}

export interface GeneratedTemplate {
  name: string;
  uiModelType: number;
  uiModelTypeName: string;
  className: string;
  baseClassName: string | null;
  /** 序列化白名单（ElementUI propertys；老式为 null 表示构造器字段全集） */
  whitelist: string[] | null;
  attributes: string[] | undefined;
  connectArray: string[] | undefined;
  defaults: Record<string, unknown>;
}

export async function generateTemplates(
  kfRoot: string,
): Promise<{ templates: GeneratedTemplate[]; ids: Record<string, string> }> {
  const ids = await parseIdsZh(path.join(kfRoot, "Common/Global/kmui_zh_resource.js"));
  // 全局枚举源（buttonType/typeEnum 等 defaultData 引用）
  let globalEnumsSrc = "";
  try {
    globalEnumsSrc = await readFile(path.join(kfRoot, "Common/Global/kmui_glabolvar.js"), "utf8");
  } catch {
    globalEnumsSrc = "";
  }
  const baseDefaults: Record<string, Record<string, unknown>> = {};
  for (const [baseName, baseFile] of Object.entries(BASES)) {
    const src = await readFile(path.join(kfRoot, baseFile), "utf8");
    baseDefaults[baseName] = filterRuntimeFields(extractFieldDefaults(src));
  }

  const templates: GeneratedTemplate[] = [];
  for (const [type, spec] of Object.entries(CONTROLS)) {
    const src = await readFile(path.join(kfRoot, spec.file), "utf8");
    const extraction = extractControlSource(src);
    if (!extraction) {
      console.warn(`[skip] ${type}: 未找到 uiModelType 注册 (${spec.file})`);
      continue;
    }
    const ctx = buildIdentifierCtx(src, ids, globalEnumsSrc);
    const own = filterRuntimeFields(extractFieldDefaults(src, { identifierValues: ctx }));
    const base = spec.base ? (baseDefaults[spec.base] ?? {}) : {};
    const defaults = mergeDefaults(base, own);
    const propertys = extractPropertys(src);
    templates.push({
      name: spec.templateName,
      uiModelType: extraction.uiModelType,
      uiModelTypeName: extraction.uiModelTypeName,
      className: extraction.className,
      baseClassName: extraction.baseClassName,
      whitelist: propertys,
      attributes: Array.isArray(defaults.attributes) ? (defaults.attributes as string[]) : undefined,
      connectArray: Array.isArray(defaults.connectArray) ? (defaults.connectArray as string[]) : undefined,
      defaults,
    });
  }
  return { templates, ids };
}

function parseArgs(argv: string[]): { kfRoot: string; out: string } {
  let kfRoot = "";
  let out = "";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--kf-root") kfRoot = argv[++i] ?? "";
    else if (argv[i] === "--out") out = argv[++i] ?? "";
  }
  return { kfRoot, out };
}

/** 老式控件枚举表达式求值：this.type=typeEnumArr[...] / borderStyleEnum.X / IDS_X / layoutStyleEnumArr[...] */
export function evalEnumExpressions(
  src: string,
  enums: Record<string, unknown>,
  ids: Record<string, string>,
): Record<string, unknown> {
  const body = extractConstructorBody(src);
  if (!body) return {};
  const out: Record<string, unknown> = {};
  const enumObj = enums as Record<string, Record<string, number>>;
  const arrOf = (name: string): string[] => {
    const arr = enums[name];
    if (!Array.isArray(arr)) return [];
    return arr.map((x) => (typeof x === "string" && x.startsWith("IDS_") ? (ids[x.slice(4)] ?? x) : String(x)));
  };
  const typeEnumArr = arrOf("typeEnumArr");
  const layoutStyleEnumArr = arrOf("layoutStyleEnumArr");
  const re = /this\.([A-Za-z_$][\w$]*)\s*=\s*((?:IDS_[A-Z0-9_]+|typeEnumArr\[typeEnum\.\w+\]|layoutStyleEnumArr\[layoutStyleEnum\.\w+\]|borderStyleEnum\.\w+))/g;
  let mm: RegExpExecArray | null;
  while ((mm = re.exec(body)) !== null) {
    const field = mm[1] ?? "";
    const expr = mm[2] ?? "";
    if (expr.startsWith("IDS_")) {
      out[field] = ids[expr.slice(4)] ?? expr;
    } else if (expr.startsWith("typeEnumArr[")) {
      const key = expr.match(/typeEnum\.(\w+)/)?.[1] ?? "";
      const idx = enumObj.typeEnum?.[key];
      if (idx !== undefined) out[field] = typeEnumArr[idx] ?? "";
    } else if (expr.startsWith("layoutStyleEnumArr[")) {
      const key = expr.match(/layoutStyleEnum\.(\w+)/)?.[1] ?? "";
      const idx = enumObj.layoutStyleEnum?.[key];
      if (idx !== undefined) out[field] = layoutStyleEnumArr[idx] ?? "";
    } else if (expr.startsWith("borderStyleEnum.")) {
      const key = expr.slice("borderStyleEnum.".length);
      const v = enumObj.borderStyleEnum?.[key];
      if (v !== undefined) out[field] = v;
    }
  }
  return out;
}

/** 提取数组字面量（如 typeEnumArr=[...]），元素为 IDS 标识符或字符串 */
export function extractArrayLiteral(src: string, name: string): string[] | null {
  const re = new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`);
  const m = src.match(re);
  if (!m) return null;
  return (m[1] ?? "")
    .split(",")
    .map((s) => s.trim().replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1"))
    .filter(Boolean);
}

async function main(): Promise<void> {
  const { kfRoot, out } = parseArgs(process.argv.slice(2));
  if (!kfRoot || !out) {
    console.error("用法: node scripts/generate-templates.ts --kf-root <KF源码> --out <模板目录>");
    process.exit(1);
  }
  const { templates } = await generateTemplates(kfRoot);
  const ids = await parseIdsZh(path.join(kfRoot, "Common/Global/kmui_zh_resource.js"));
  let globalEnumsSrc = "";
  try {
    globalEnumsSrc = await readFile(path.join(kfRoot, "Common/Global/kmui_glabolvar.js"), "utf8");
  } catch {
    /* ignore */
  }
  const globalEnums = globalEnumsSrc
    ? { ...extractControlEnumsSafe(globalEnumsSrc, ids), ...parseIdsArrayEnums(globalEnumsSrc) }
    : {};
  const CONTROLS_SRC: Record<string, string> = {};
  for (const [, spec] of Object.entries(CONTROLS)) {
    CONTROLS_SRC[spec.file] ??= await readFile(path.join(kfRoot, spec.file), "utf8");
  }

  await mkdir(out, { recursive: true });
  let written = 0;
  for (const t of templates) {
    const src = (CONTROLS[t.name]?.file ? CONTROLS_SRC[CONTROLS[t.name]!.file] : undefined) ?? "";
    // 序列化字段平铺：ElementUI = attributes × defaultData；老式 = defaults + 枚举求值
    let flat: Record<string, unknown>;
    if (t.attributes && t.defaults.defaultData && typeof t.defaults.defaultData === "object") {
      const dd = t.defaults.defaultData as Record<string, unknown>;
      const camel = (s: string): string => s.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      flat = {};
      for (const a of t.attributes) {
        const key = camel(a);
        if (key in dd) flat[key] = dd[key];
      }
      if (t.defaults.sizePolicy) flat.sizePolicy = t.defaults.sizePolicy;
      if (t.defaults.showUiExtendType) flat.showUiExtendType = t.defaults.showUiExtendType;
    } else {
      flat = { ...t.defaults };
      Object.assign(flat, evalEnumExpressions(src, globalEnums, ids));
      if (t.defaults.sizePolicy) flat.sizePolicy = t.defaults.sizePolicy;
    }
    const payload: Record<string, unknown> = {
      uiModelType: t.uiModelType,
      ...flat,
    };
    // 统一 KF 序列化 sizePolicy 结构（uibase 权威：[3,3,0,0]/[5,5]/[16777215,16777215]/fixedSize）
    const sp = (flat.sizePolicy ?? t.defaults.sizePolicy) as
      | { fixedSize?: number[] }
      | undefined;
    payload.sizePolicy = {
      sizePolicy: [3, 3, 0, 0],
      minSize: [5, 5],
      maxSize: [16777215, 16777215],
      fixedSize: sp?.fixedSize ?? [100, 30],
    };
    const file = path.join(out, `${t.name}.json`);
    await writeFile(file, JSON.stringify(payload, null, 2) + "\n");
    written++;
    console.log(
      `[write] ${t.name} (uiModelType=${t.uiModelType} ${t.uiModelTypeName}, ${Object.keys(flat).length} 序列化字段)`,
    );
  }
  console.log(`完成：${written} 个模板 → ${out}`);
}

/** 提取对象枚举并解析 IDS（供 evalEnumExpressions） */
function extractControlEnumsSafe(src: string, ids: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const re = /([A-Za-z_$][\w$]*)=\{((?:[^{}]|"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    try {
      const v: unknown = JSON.parse(jsLiteralToJSON(`{${m[2]}}`));
      out[m[1] ?? ""] = resolveIdsInObject(v, ids);
    } catch {
      /* skip */
    }
  }
  return out;
}

/** 提取 IDS 标识符数组（typeEnumArr/layoutStyleEnumArr）并解析中文 */
function parseIdsArrayEnums(src: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const name of ["typeEnumArr", "layoutStyleEnumArr"]) {
    const m = src.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`));
    if (m) out[name] = (m[1] ?? "").split(",").map((s) => s.trim().replace(/^"|"$/g, ""));
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}

export { __dirname };
