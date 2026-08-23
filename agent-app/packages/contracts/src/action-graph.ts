import { z } from "zod";

const implementationOwnedNames = new Set([
  "configuredata", "coordinates", "coords", "css", "geometry", "guid", "javascript", "js", "lefttoppt", "linkid",
  "objecttype", "onclick", "script", "selector", "styledata", "styledatanew", "uimodeltype", "x", "y",
]);
const safeOnNames = new Set(["onboardingstage", "onlinestatus", "onlypending"]);
const implementationPropertyNames = new Set([
  "animation", "background", "backgroundcolor", "backgroundimage", "border", "bordercolor", "borderradius", "borderstyle",
  "borderwidth", "bounds", "bottom", "boxshadow", "color", "coordinate", "display", "flex", "flexbasis", "flexdirection",
  "flexgrow", "flexshrink", "flexwrap", "font", "fontfamily", "fontsize", "fontstyle", "fontweight", "gap", "grid",
  "gridarea", "gridcolumn", "gridrow", "gridtemplatecolumns", "gridtemplaterows", "height", "left", "lineheight", "margin",
  "marginbottom", "marginleft", "marginright", "margintop", "opacity", "padding", "paddingbottom", "paddingleft", "paddingright",
  "paddingtop", "position", "rect", "right", "textalign", "textcolor", "top", "transform", "transformorigin", "transition",
  "transitionduration", "width", "xpos", "ypos", "zindex",
]);
const prototypeSensitiveKeys = new Set(["__proto__", "prototype", "constructor"]);

function normalizedName(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function isImplementationOwnedName(value: string): boolean {
  const normalized = normalizedName(value);
  return implementationOwnedNames.has(normalized) || (normalized.startsWith("on") && !safeOnNames.has(normalized));
}

const rawRuntimeNames = new Set([
  "configuredata", "coordinates", "coords", "geometry", "guid", "javascript", "lefttoppt", "linkid", "linkmng",
  "objecttype", "onclick", "selector", "styledata", "styledatanew", "uimodeltype",
]);
const domAndNetworkNames = new Set([
  "document", "window", "globalthis", "navigator", "location", "localstorage", "sessionstorage", "fetch",
  "xmlhttprequest", "websocket", "eval", "function", "require", "import",
]);
const canonicalSemanticSourceForbiddenIdentifiers = new Set([
  "document", "window", "globalThis", "navigator", "location", "localStorage", "sessionStorage",
  "fetch", "XMLHttpRequest", "WebSocket", "eval", "Function", "require", "import", "process", "Proxy", "Reflect",
  "Object", "RegExp", "setTimeout", "setInterval", "queueMicrotask",
]);
const selectorTagNames = new Set([
  "a", "button", "form", "input", "label", "option", "select", "textarea",
]);
const htmlTagNames = new Set([
  "a", "article", "body", "button", "div", "footer", "form", "header", "input", "label", "main", "nav",
  "section", "select", "span", "table", "td", "textarea", "tr",
]);
const cssPseudoNames = new Set([
  "active", "after", "before", "checked", "disabled", "empty", "enabled", "first-child", "first-of-type",
  "focus", "focus-visible", "hover", "last-child", "last-of-type", "not", "nth-child", "nth-of-type",
  "only-child", "placeholder", "required", "root", "selected", "visited",
]);

function javascriptLexicalView(value: string): { codeView: string; literals: string[] } {
  const characters = [...value];
  const literals: string[] = [];
  let literal = "";
  let state: "code" | "single" | "double" | "template" | "regex" | "line-comment" | "block-comment" = "code";
  let regexCharacterClass = false;
  const regexMayStart = (index: number): boolean => {
    let previous = index - 1;
    while (previous >= 0 && /\s/.test(characters[previous]!)) previous -= 1;
    if (previous < 0) return true;
    if (/[([{,:;=!?&|+*%^~<>-]/.test(characters[previous]!)) return true;
    const prefix = characters.slice(0, previous + 1).join("");
    return /\b(?:await|case|delete|in|instanceof|new|of|return|throw|typeof|void|yield)$/.test(prefix);
  };
  for (let index = 0; index < characters.length; index += 1) {
    const character = characters[index]!;
    const next = characters[index + 1];
    if (state === "code") {
      if (character === "'") { state = "single"; literal = ""; characters[index] = " "; continue; }
      else if (character === "\"") { state = "double"; literal = ""; characters[index] = " "; continue; }
      else if (character === "`") { state = "template"; literal = ""; characters[index] = " "; continue; }
      else if (character === "/" && next === "/") state = "line-comment";
      else if (character === "/" && next === "*") state = "block-comment";
      else if (character === "/" && regexMayStart(index)) { state = "regex"; regexCharacterClass = false; characters[index] = " "; continue; }
      else continue;
    } else if (state === "line-comment" && character === "\n") {
      state = "code";
      continue;
    } else if (state === "block-comment" && character === "*" && next === "/") {
      characters[index] = " ";
      characters[index + 1] = " ";
      index += 1;
      state = "code";
      continue;
    } else if (state === "regex" && character === "\\") {
      characters[index] = " ";
      if (index + 1 < characters.length) characters[++index] = " ";
      continue;
    } else if (state === "regex" && character === "[") {
      regexCharacterClass = true;
    } else if (state === "regex" && character === "]") {
      regexCharacterClass = false;
    } else if (state === "regex" && character === "/" && !regexCharacterClass) {
      characters[index] = " ";
      while (index + 1 < characters.length && /[A-Za-z]/.test(characters[index + 1]!)) characters[++index] = " ";
      state = "code";
      continue;
    } else if ((state === "single" && character === "'")
      || (state === "double" && character === "\"")
      || (state === "template" && character === "`")) {
      literals.push(literal);
      state = "code";
      characters[index] = " ";
      continue;
    } else if ((state === "single" || state === "double" || state === "template") && character === "\\") {
      characters[index] = " ";
      if (index + 1 < characters.length) {
        literal += characters[index + 1]!;
        characters[++index] = " ";
      }
      continue;
    }
    if (state === "single" || state === "double" || state === "template") literal += character;
    if (character !== "\n") characters[index] = " ";
  }
  if (state === "single" || state === "double" || state === "template") literals.push(literal);
  return { codeView: characters.join(""), literals };
}

function semanticFunctionDeclarationKeywords(codeView: string): ReadonlySet<number> {
  const starts = new Set<number>();
  const declaration = /(?:^|[;{}])\s*(function)(?=\s+(?!function\b)[A-Za-z_$][A-Za-z0-9_$]*\s*\()/g;
  for (const match of codeView.matchAll(declaration)) {
    const keywordOffset = match[0].lastIndexOf(match[1]!);
    starts.add((match.index ?? 0) + keywordOffset);
  }
  return starts;
}

function canonicalSemanticSourceRuntimeIssue(value: string): string | undefined {
  for (const match of value.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g)) {
    const identifier = match[0];
    if (canonicalSemanticSourceForbiddenIdentifiers.has(identifier)) {
      return `forbidden runtime token in canonical semantic source: ${identifier}`;
    }
    if (rawRuntimeNames.has(normalizedName(identifier))) {
      return `implementation runtime token in canonical semantic source: ${identifier}`;
    }
  }
  return undefined;
}

function containsUnsafeCall(value: string): boolean {
  const calls = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^()]*)\)/g;
  for (const match of value.matchAll(calls)) {
    const name = match[1]!;
    const argumentsText = match[2]!;
    if (/^(?:rgb|rgba|hsl|hsla|var)$/i.test(name)) continue;
    if (/^[A-Z]{2,}$/.test(name) && /[\u3400-\u9fff]/.test(argumentsText)) continue;
    if (/^version$/i.test(name) && /^\s*\d+(?:\.\d+)+\s*$/.test(argumentsText)) continue;
    return true;
  }
  return false;
}

function isRawJsonText(value: string): boolean {
  const trimmed = value.trim();
  if (!/^[{[]/.test(trimmed)) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function cssSelectorOrRuleIssue(value: string, strictSelectors: boolean, allowHashtag = false): string | undefined {
  const trimmed = value.trim();
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(trimmed)) return undefined;
  if (allowHashtag && (/^#[\u3400-\u9fff][\u3400-\u9fffA-Za-z0-9_-]*$/.test(trimmed)
    || /^#[A-Z][A-Za-z0-9_]*$/.test(trimmed)
    || /^#[A-Za-z][A-Za-z0-9]*-[A-Za-z0-9-]+$/.test(trimmed))) return undefined;
  if (/(?:^|["'`\s])(?:\.[A-Za-z_-][A-Za-z0-9_-]*|#[A-Za-z_-][A-Za-z0-9_-]*|\[[A-Za-z_-][^\]\n]*\])\s*,\s*(?:\.[A-Za-z_-][A-Za-z0-9_-]*|#[A-Za-z_-][A-Za-z0-9_-]*|\[[A-Za-z_-][^\]\n]*\])/.test(value)) return "CSS selector lists are not allowed";
  const selectorAtom = /^(?:[A-Za-z][A-Za-z0-9-]*|[.#][A-Za-z_-][A-Za-z0-9_-]*|\[[^\]\n]+\])$/;
  const selectorParts = trimmed.split(/\s*[>+~]\s*/);
  if (selectorParts.length > 1 && selectorParts.every((part) => selectorAtom.test(part.trim()))) return "CSS combinator selectors are not allowed";
  const selectorListParts = trimmed.split(/\s*,\s*/);
  if (selectorListParts.length > 1 && selectorListParts.every((part) => selectorAtom.test(part))
    && (selectorListParts.some((part) => part.startsWith(".") || part.startsWith("#") || part.startsWith("["))
      || selectorListParts.every((part) => htmlTagNames.has(part.toLowerCase()) || part.includes("-")))) {
    return "CSS selector lists are not allowed";
  }
  if (/^(?:\.[A-Za-z_-][A-Za-z0-9_-]*|#[A-Za-z_-][A-Za-z0-9_-]*|\[[^\]\n]+\])$/.test(trimmed)) return "CSS selectors are not allowed";
  if (/(?:^|["'`\s])\[[A-Za-z_-][^\]\n]*\](?=["'`\s;]|$)/.test(value)) return "CSS attribute selectors are not allowed";
  if (/^[.#][A-Za-z_-][A-Za-z0-9_-]*:{1,2}[A-Za-z-]+(?:\([^)]*\))?$/.test(trimmed)) return "CSS pseudo selectors are not allowed";
  const pseudo = /\b([A-Za-z][A-Za-z0-9-]*):{1,2}([A-Za-z-]+)(?:\([^)]*\))?/g;
  for (const match of value.matchAll(pseudo)) {
    const prefix = match[1]!.toLowerCase();
    const pseudoName = match[2]!.toLowerCase();
    if (cssPseudoNames.has(pseudoName)
      && (selectorTagNames.has(prefix) || (strictSelectors && (htmlTagNames.has(prefix) || prefix === "discard" || prefix === "unknown")))) return "CSS pseudo selectors are not allowed";
  }
  if (/(?:^|["'`\s])(?:\.[A-Za-z_-][A-Za-z0-9_-]*|#[A-Za-z_-][A-Za-z0-9_-]*|\[[^\]\n]+\])\s*(?:[>+~]|\s)\s*(?:\.?[A-Za-z_-][A-Za-z0-9_-]*|#[A-Za-z_-][A-Za-z0-9_-]*|\[[^\]\n]+\])/.test(value)) return "CSS combinator selectors are not allowed";
  if (/^[A-Za-z][A-Za-z0-9-]*\s+(?:[.#]|\[)/.test(trimmed)) return "CSS descendant selectors are not allowed";
  if (/^@(?:charset|container|font-face|import|keyframes|layer|media|namespace|page|property|supports)\b/i.test(trimmed)) return "CSS at-rules are not allowed";
  if (/(?:^|[;{]\s*)(?:--[A-Za-z0-9_-]+|animation|background(?:-[a-z]+)?|border(?:-[a-z]+)?|color|display|font(?:-[a-z]+)?|height|margin(?:-[a-z]+)?|opacity|overflow|padding(?:-[a-z]+)?|position|transform|transition|width|z-index)\s*:/i.test(value)) return "CSS declarations are not allowed";
  if (/[^{}\n]+\{\s*(?:--?[A-Za-z]|[A-Za-z][A-Za-z0-9-]*)\s*:/.test(value)) return "CSS rules are not allowed";
  return undefined;
}

export type SemanticImplementationTextMode = "semantic-text" | "semantic-js-source" | "implementation-data" | "compiled-js";

export function semanticImplementationTextIssue(
  value: string,
  mode: SemanticImplementationTextMode,
  options: { structuralIdentifier?: boolean; strictSelectors?: boolean; allowDottedIdentifier?: boolean } = {},
): string | undefined {
  const trimmed = value.trim();
  if (mode === "semantic-js-source" && /\\u(?:[0-9A-Fa-f]{4}|\{[0-9A-Fa-f]{1,6}\})/.test(value)) {
    return "Unicode escape syntax is not allowed in semantic JavaScript source";
  }
  if (mode === "semantic-js-source") {
    const runtimeIssue = canonicalSemanticSourceRuntimeIssue(value);
    if (runtimeIssue !== undefined) return runtimeIssue;
  }
  if (/^https?:\/\/\S+$/i.test(trimmed)
    || /^urn:[A-Za-z0-9][A-Za-z0-9:._-]*$/i.test(trimmed)
    || /^(?:[A-Za-z0-9-]+\.)+(?:com|org|net|io|cn|com\.cn|gov\.cn)$/i.test(trimmed)) return undefined;
  if (/^\{theme\.[A-Za-z][A-Za-z0-9]*\}$/.test(trimmed)) return undefined;
  const lexical = mode === "semantic-js-source" ? javascriptLexicalView(value) : undefined;
  const codeView = lexical?.codeView ?? value;
  const semanticFunctionKeywords = lexical === undefined ? undefined : semanticFunctionDeclarationKeywords(codeView);
  const screenedText = lexical === undefined ? value : `${codeView}\n${lexical.literals.join("\n")}`;
  if (/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i.test(screenedText)) return "GUID values are not allowed";
  if (/<\/?(?:script|style|iframe|object|embed)\b|\b(?:javascript|vbscript)\s*:/i.test(screenedText)) return "executable markup is not allowed";
  const selectorIssue = mode === "semantic-js-source"
    ? lexical!.literals.map((literalValue) => cssSelectorOrRuleIssue(literalValue, false, true)).find((issue) => issue !== undefined)
      ?? cssSelectorOrRuleIssue(codeView, true)
    : cssSelectorOrRuleIssue(value, options.strictSelectors ?? false);
  if (selectorIssue !== undefined) return selectorIssue;
  const identifiers = codeView.matchAll(/[A-Za-z_$][A-Za-z0-9_$]*/g);
  for (const match of identifiers) {
    const identifier = match[0];
    if (identifier === "function" && semanticFunctionKeywords?.has(match.index ?? -1)) continue;
    const normalized = normalizedName(identifier);
    if (domAndNetworkNames.has(normalized)) return `forbidden runtime name: ${identifier}`;
    if (rawRuntimeNames.has(normalized)) return `implementation runtime name: ${identifier}`;
  }
  if (mode === "semantic-js-source") {
    const literalAndCodeIdentifiers = screenedText.match(/[A-Za-z_$][A-Za-z0-9_$]*/g) ?? [];
    for (const identifier of literalAndCodeIdentifiers) {
      if (rawRuntimeNames.has(normalizedName(identifier))) return `implementation runtime name: ${identifier}`;
    }
  }
  if (mode === "semantic-js-source") {
    if (/\?\.\s*\[|\[\s*\]\s*(?:\?\.)?\s*\(/.test(codeView)) return "computed or optional bracket calls are not allowed";
    return undefined;
  }
  if (mode === "compiled-js") return undefined;
  if (mode === "implementation-data") {
    if (/=>/.test(value)) return "JavaScript syntax is not allowed";
    if (containsUnsafeCall(value) && !/^status\([^()]*\)$/i.test(trimmed)) return "code-like calls are not allowed";
    if (/\b[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\.|\?\.)[A-Za-z_$][A-Za-z0-9_$]*|(?:\?\.)?\[[^\]]+\])+(?:\?\.)?\s*\(/.test(trimmed)) return "code-like calls are not allowed";
    return undefined;
  }
  if (isRawJsonText(value)) return "raw JSON text is not allowed";
  if (/:\s*(?:\[\s*(?:-?\d|true\b|false\b|null\b|["'{[])|\{\s*(?:["']|[A-Za-z_$][A-Za-z0-9_$]*\s*:))/i.test(value)) return "embedded raw JSON text is not allowed";
  if (/=>|\$\{|\$(?:control|state|data|page|overlay|feedback|timer)\b/.test(value)) return "JavaScript syntax is not allowed";
  if (/(?:^|[\s(])[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\.[A-Za-z_$][A-Za-z0-9_$]*)|(?:\[[^\]]+\]))*\s*(?:\|\|=|&&=|\?\?=|>>>=|<<=|>>=|\+=|-=|\*\*=|\*=|\/=|%=|&=|\|=|\^=|=|\+\+|--)/.test(value)) return "executable assignment syntax is not allowed";
  if (/\b(?:const|let|var)\s+[A-Za-z_$][A-Za-z0-9_$]*\b|\bfunction\s*[A-Za-z_$]*\s*\(|\bclass\s+[A-Za-z_$][A-Za-z0-9_$]*\s*\{|^(?:\s*)(?:return|throw|await|yield|break|continue|debugger|delete)\b|^\s*export\s+(?:default\b|\{|\*)/m.test(value)) return "JavaScript statements are not allowed";
  if (!options.structuralIdentifier && containsUnsafeCall(value) && !/^status\([^()]*\)$/i.test(trimmed)) return "code-like calls are not allowed";
  if (!options.structuralIdentifier && /^[A-Za-z_$][A-Za-z0-9_$]*\?\.\s*\([^)]*\)$/.test(trimmed)) return "code-like calls are not allowed";
  if (!options.structuralIdentifier && /\b[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\.|\?\.)[A-Za-z_$][A-Za-z0-9_$]*|(?:\?\.)?\[[^\]]+\])+(?:\?\.)?\s*\(/.test(trimmed)) return "code-like calls are not allowed";
  if (!options.structuralIdentifier && !options.allowDottedIdentifier
    && /\b[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*|\[[^\]]+\])+/.test(trimmed)) return "executable member or index syntax is not allowed";
  return undefined;
}

export const StableSemanticIdSchema = z.string().trim().min(1).max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine((value) => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value), "GUID-shaped identifiers are not allowed")
  .refine((value) => !isImplementationOwnedName(value), "implementation identifiers are not allowed");

const semanticName = z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine((value) => !isImplementationOwnedName(value), "implementation names are not allowed");
const shortText = z.string().trim().min(1).max(400)
  .refine((value) => semanticImplementationTextIssue(value, "semantic-text") === undefined, "implementation text is not allowed");

export const ActionScalarSchema = z.union([
  z.string().trim().max(2_000).refine(
    (value) => semanticImplementationTextIssue(value, "semantic-text") === undefined,
    "implementation text is not allowed in action values",
  ),
  z.number().finite().min(-1_000_000_000).max(1_000_000_000),
  z.boolean(),
  z.null(),
]);

type ActionValue = z.infer<typeof ActionScalarSchema>
  | { kind: "list"; items: ActionValue[] }
  | { kind: "record"; fields: Array<{ name: string; value: ActionValue }> };

const ActionValueShapeSchema: z.ZodType<ActionValue> = z.lazy(() => z.union([
  ActionScalarSchema,
  z.object({ kind: z.literal("list"), items: z.array(ActionValueShapeSchema).max(32) }).strict(),
  z.object({
    kind: z.literal("record"),
    fields: z.array(z.object({
      name: semanticName.refine((value) => !implementationPropertyNames.has(normalizedName(value)), "implementation property names are not allowed"),
      value: ActionValueShapeSchema,
    }).strict()).max(32),
  }).strict(),
]));

function cloneActionValueDescriptorSafe(value: unknown, ctx: z.RefinementCtx): ActionValue | undefined {
  const holder: { value?: unknown } = {};
  const pending: Array<{ source: unknown; depth: number; assign: (clone: unknown) => void }> = [{
    source: value,
    depth: 0,
    assign: (clone) => { holder.value = clone; },
  }];
  const seen = new WeakSet<object>();
  let count = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    count += 1;
    if (count > 1_000) {
      ctx.addIssue({ code: "custom", message: "ACTION_VALUE_BUDGET_EXCEEDED" });
      return undefined;
    }
    if (current.depth > 8) {
      ctx.addIssue({ code: "custom", message: "ACTION_VALUE_DEPTH_EXCEEDED" });
      return undefined;
    }
    if (current.source === null || typeof current.source !== "object") {
      current.assign(current.source);
      continue;
    }
    if (seen.has(current.source)) {
      ctx.addIssue({ code: "custom", message: "ACTION_VALUE_CYCLE_OR_SHARED_REFERENCE" });
      return undefined;
    }
    seen.add(current.source);
    let descriptors: PropertyDescriptorMap;
    let keys: PropertyKey[];
    let prototype: object | null;
    try {
      descriptors = Object.getOwnPropertyDescriptors(current.source);
      keys = Reflect.ownKeys(current.source);
      prototype = Reflect.getPrototypeOf(current.source);
    } catch {
      ctx.addIssue({ code: "custom", message: "ACTION_VALUE_DESCRIPTOR_UNSAFE" });
      return undefined;
    }
    if (keys.some((key) => typeof key === "symbol")) {
      ctx.addIssue({ code: "custom", message: "ACTION_VALUE_SYMBOL_KEY_FORBIDDEN" });
      return undefined;
    }
    const sensitiveKey = keys.find((key) => prototypeSensitiveKeys.has(String(key)));
    if (sensitiveKey !== undefined) {
      ctx.addIssue({ code: "custom", message: `ACTION_VALUE_PROTOTYPE_KEY_FORBIDDEN: ${String(sensitiveKey)}` });
      return undefined;
    }
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) {
      ctx.addIssue({ code: "custom", message: "ACTION_VALUE_PROTOTYPE_FORBIDDEN" });
      return undefined;
    }
    for (const key of keys) {
      const descriptor = descriptors[String(key)];
      if (descriptor === undefined || descriptor.get !== undefined || descriptor.set !== undefined || !("value" in descriptor)) {
        ctx.addIssue({ code: "custom", message: "ACTION_VALUE_ACCESSOR_FORBIDDEN" });
        return undefined;
      }
    }
    if (Array.isArray(current.source)) {
      const lengthDescriptor = descriptors["length"];
      const length = lengthDescriptor?.value as unknown;
      if (typeof length !== "number" || !Number.isSafeInteger(length) || length < 0 || length > 32) {
        ctx.addIssue({ code: "custom", message: "ACTION_VALUE_ARRAY_BOUND_EXCEEDED" });
        return undefined;
      }
      if (keys.length !== length + 1) {
        ctx.addIssue({ code: "custom", message: "ACTION_VALUE_ARRAY_PROPERTY_FORBIDDEN" });
        return undefined;
      }
      const clone: unknown[] = new Array(length);
      current.assign(clone);
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (descriptor === undefined || !("value" in descriptor)) {
          ctx.addIssue({ code: "custom", message: "ACTION_VALUE_SPARSE_ARRAY_FORBIDDEN" });
          return undefined;
        }
        const source = descriptor.value as unknown;
        pending.push({ source, depth: current.depth, assign: (child) => { clone[index] = child; } });
      }
    } else {
      if (keys.length > 100) {
        ctx.addIssue({ code: "custom", message: "ACTION_VALUE_OBJECT_BOUND_EXCEEDED" });
        return undefined;
      }
      const kind = descriptors["kind"]?.value as unknown;
      const clone = Object.create(null) as Record<string, unknown>;
      current.assign(clone);
      keys.forEach((key) => {
        const nextDepth = (kind === "list" && key === "items") || (kind === "record" && key === "fields")
          ? current.depth + 1
          : current.depth;
        const name = String(key);
        const source = descriptors[name]!.value as unknown;
        pending.push({
          source,
          depth: nextDepth,
          assign: (child) => {
            Object.defineProperty(clone, name, { value: child, enumerable: true, configurable: true, writable: true });
          },
        });
      });
    }
  }
  return holder.value as ActionValue;
}

const ActionValuePreflightSchema = z.unknown()
  .transform((value, ctx) => {
    const clone = cloneActionValueDescriptorSafe(value, ctx);
    return clone === undefined ? z.NEVER : clone;
  });

export const ActionValueSchema: z.ZodType<ActionValue> = ActionValuePreflightSchema
  .pipe(ActionValueShapeSchema as z.ZodType<ActionValue, ActionValue>)
  .superRefine((value, ctx) => {
    const pending: ActionValue[] = [value];
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (current === null || typeof current !== "object") continue;
      if (current.kind === "list") pending.push(...current.items);
      else {
        const names = new Set<string>();
        current.fields.forEach((field) => {
          if (names.has(field.name)) ctx.addIssue({ code: "custom", message: `ACTION_VALUE_FIELD_DUPLICATE: ${field.name}` });
          names.add(field.name);
          pending.push(field.value);
        });
      }
    }
  });

export const SemanticEventSchema = z.enum([
  "blur", "change", "clear", "click", "edit", "error", "filter", "focus", "input", "load", "navigate",
  "open-modal", "remove-tag", "row-click", "row-select", "scroll", "select", "submit", "tab-add", "tab-click",
  "tab-remove", "toggle", "visible-change",
]);

export const SemanticEventBindingSchema = z.object({
  semanticEvent: SemanticEventSchema,
  actionIds: z.array(StableSemanticIdSchema).min(1).max(16),
}).strict();

export const ValueExpressionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: ActionValueSchema }).strict(),
  z.object({ kind: z.literal("local-state"), stateId: StableSemanticIdSchema }).strict(),
  z.object({ kind: z.literal("mock-data"), mockDataId: StableSemanticIdSchema }).strict(),
]);

const ConditionOperandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: ActionScalarSchema }).strict(),
  z.object({ kind: z.literal("local-state"), stateId: StableSemanticIdSchema }).strict(),
  z.object({ kind: z.literal("control-value"), controlId: StableSemanticIdSchema }).strict(),
]);

export const ActionConditionSchema = z.object({
  left: ConditionOperandSchema,
  operator: z.enum(["equals", "not-equals", "greater-than", "greater-than-or-equal", "less-than", "less-than-or-equal"]),
  right: ConditionOperandSchema,
}).strict();

export const JourneyStepReferenceSchema = z.object({
  journeyId: StableSemanticIdSchema,
  stepIndex: z.number().int().min(0).max(11),
}).strict();

const effectOptions = [
  z.object({ kind: z.literal("navigate-page"), targetPageId: StableSemanticIdSchema }).strict(),
  z.object({ kind: z.literal("open-overlay"), overlayId: StableSemanticIdSchema }).strict(),
  z.object({ kind: z.literal("close-overlay"), overlayId: StableSemanticIdSchema, result: ActionScalarSchema.optional() }).strict(),
  z.object({ kind: z.literal("set-visibility"), targetId: StableSemanticIdSchema, visible: z.boolean() }).strict(),
  z.object({ kind: z.literal("switch-tab"), targetId: StableSemanticIdSchema, tabId: StableSemanticIdSchema }).strict(),
  z.object({ kind: z.literal("set-state"), stateId: StableSemanticIdSchema, value: ActionValueSchema }).strict(),
  z.object({ kind: z.literal("set-control-value"), targetId: StableSemanticIdSchema, value: ValueExpressionSchema }).strict(),
  z.object({ kind: z.literal("show-feedback"), level: z.enum(["success", "info", "warning", "error"]), message: shortText }).strict(),
  z.object({ kind: z.literal("run-script"), scriptId: StableSemanticIdSchema }).strict(),
] as const;

export const ActionEffectSchema = z.discriminatedUnion("kind", effectOptions);

const actionBase = {
  id: StableSemanticIdSchema,
  conditions: z.array(ActionConditionSchema).max(8).optional(),
  afterActionIds: z.array(StableSemanticIdSchema).max(16).default([]),
  journeyStepRefs: z.array(JourneyStepReferenceSchema).min(1).max(12).superRefine((refs, ctx) => {
    const seen = new Set<string>();
    refs.forEach((ref, index) => {
      const key = `${ref.journeyId}\0${ref.stepIndex}`;
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: [index], message: "JOURNEY_STEP_REFERENCE_DUPLICATE" });
      seen.add(key);
    });
  }).optional(),
};

export const ActionPlanSchema = z.discriminatedUnion("kind", [
  z.object({ ...actionBase, kind: z.literal("navigate-page"), targetPageId: StableSemanticIdSchema }).strict(),
  z.object({ ...actionBase, kind: z.literal("open-overlay"), overlayId: StableSemanticIdSchema }).strict(),
  z.object({ ...actionBase, kind: z.literal("close-overlay"), overlayId: StableSemanticIdSchema, result: ActionScalarSchema.optional() }).strict(),
  z.object({ ...actionBase, kind: z.literal("set-visibility"), targetId: StableSemanticIdSchema, visible: z.boolean() }).strict(),
  z.object({ ...actionBase, kind: z.literal("switch-tab"), targetId: StableSemanticIdSchema, tabId: StableSemanticIdSchema }).strict(),
  z.object({ ...actionBase, kind: z.literal("set-state"), stateId: StableSemanticIdSchema, value: ActionValueSchema }).strict(),
  z.object({ ...actionBase, kind: z.literal("set-control-value"), targetId: StableSemanticIdSchema, value: ValueExpressionSchema }).strict(),
  z.object({ ...actionBase, kind: z.literal("show-feedback"), level: z.enum(["success", "info", "warning", "error"]), message: shortText }).strict(),
  z.object({ ...actionBase, kind: z.literal("run-script"), scriptId: StableSemanticIdSchema }).strict(),
]);

const ReferenceIndexSchema = z.object({
  pageIds: z.array(StableSemanticIdSchema).max(32),
  controlIds: z.array(StableSemanticIdSchema).max(5_000),
  overlayIds: z.array(StableSemanticIdSchema).max(24),
  stateIds: z.array(StableSemanticIdSchema).max(64),
  mockDataIds: z.array(StableSemanticIdSchema).max(32),
  scriptIds: z.array(StableSemanticIdSchema).max(50),
}).strict();

const GraphActionSchema = z.object({
  id: StableSemanticIdSchema,
  trigger: z.object({ controlId: StableSemanticIdSchema, semanticEvent: SemanticEventSchema }).strict(),
  conditions: z.array(ActionConditionSchema).max(8),
  effects: z.array(ActionEffectSchema).min(1).max(16),
  afterActionIds: z.array(StableSemanticIdSchema).max(16),
}).strict();

function addUnknownEffectIssue(
  effect: z.infer<typeof ActionEffectSchema>,
  references: { pages: Set<string>; controls: Set<string>; overlays: Set<string>; states: Set<string>; data: Set<string>; scripts: Set<string> },
  ctx: z.RefinementCtx,
  path: Array<string | number>,
): void {
  const issue = (message: string, field: string): void => ctx.addIssue({ code: "custom", path: [...path, field], message });
  if (effect.kind === "navigate-page" && !references.pages.has(effect.targetPageId)) issue(`ACTION_PAGE_UNKNOWN: ${effect.targetPageId}`, "targetPageId");
  if ((effect.kind === "open-overlay" || effect.kind === "close-overlay") && !references.overlays.has(effect.overlayId)) issue(`ACTION_OVERLAY_UNKNOWN: ${effect.overlayId}`, "overlayId");
  if ((effect.kind === "set-visibility" || effect.kind === "set-control-value" || effect.kind === "switch-tab") && !references.controls.has(effect.targetId)) issue(`ACTION_TARGET_UNKNOWN: ${effect.targetId}`, "targetId");
  if (effect.kind === "set-state" && !references.states.has(effect.stateId)) issue(`ACTION_STATE_UNKNOWN: ${effect.stateId}`, "stateId");
  if (effect.kind === "run-script" && !references.scripts.has(effect.scriptId)) issue(`ACTION_SCRIPT_UNKNOWN: ${effect.scriptId}`, "scriptId");
  if (effect.kind === "set-control-value") {
    if (effect.value.kind === "local-state" && !references.states.has(effect.value.stateId)) issue(`ACTION_STATE_UNKNOWN: ${effect.value.stateId}`, "value");
    if (effect.value.kind === "mock-data" && !references.data.has(effect.value.mockDataId)) issue(`ACTION_DATA_UNKNOWN: ${effect.value.mockDataId}`, "value");
  }
}

export const ActionGraphSchema = z.object({
  schema: z.literal("kf-action-graph/v1"),
  references: ReferenceIndexSchema,
  actions: z.array(GraphActionSchema).max(200),
}).strict().superRefine((graph, ctx) => {
  const sets = {
    pages: new Set(graph.references.pageIds),
    controls: new Set(graph.references.controlIds),
    overlays: new Set(graph.references.overlayIds),
    states: new Set(graph.references.stateIds),
    data: new Set(graph.references.mockDataIds),
    scripts: new Set(graph.references.scriptIds),
  };
  Object.entries(graph.references).forEach(([kind, ids]) => {
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["references", kind], message: `ACTION_REFERENCE_DUPLICATE: ${kind}` });
  });
  const globalIds = new Set<string>();
  Object.entries(graph.references).forEach(([kind, ids]) => ids.forEach((id, index) => {
    if (globalIds.has(id)) ctx.addIssue({ code: "custom", path: ["references", kind, index], message: `ACTION_REFERENCE_GLOBAL_DUPLICATE: ${id}` });
    globalIds.add(id);
  }));
  const actionById = new Map<string, { index: number; dependencies: string[] }>();
  const invokedScriptIds = new Set<string>();
  graph.actions.forEach((action, actionIndex) => {
    if (globalIds.has(action.id)) ctx.addIssue({ code: "custom", path: ["actions", actionIndex, "id"], message: `ACTION_ID_GLOBAL_DUPLICATE: ${action.id}` });
    globalIds.add(action.id);
    if (actionById.has(action.id)) ctx.addIssue({ code: "custom", path: ["actions", actionIndex, "id"], message: `ACTION_ID_DUPLICATE: ${action.id}` });
    else actionById.set(action.id, { index: actionIndex, dependencies: action.afterActionIds });
    if (!sets.controls.has(action.trigger.controlId)) ctx.addIssue({ code: "custom", path: ["actions", actionIndex, "trigger", "controlId"], message: `ACTION_TRIGGER_CONTROL_UNKNOWN: ${action.trigger.controlId}` });
    action.conditions.forEach((condition, conditionIndex) => {
      [condition.left, condition.right].forEach((operand, operandIndex) => {
        if (operand.kind === "local-state" && !sets.states.has(operand.stateId)) ctx.addIssue({ code: "custom", path: ["actions", actionIndex, "conditions", conditionIndex, operandIndex === 0 ? "left" : "right"], message: `ACTION_CONDITION_STATE_UNKNOWN: ${operand.stateId}` });
        if (operand.kind === "control-value" && !sets.controls.has(operand.controlId)) ctx.addIssue({ code: "custom", path: ["actions", actionIndex, "conditions", conditionIndex, operandIndex === 0 ? "left" : "right"], message: `ACTION_CONDITION_CONTROL_UNKNOWN: ${operand.controlId}` });
      });
    });
    action.effects.forEach((effect, effectIndex) => {
      addUnknownEffectIssue(effect, sets, ctx, ["actions", actionIndex, "effects", effectIndex]);
      if (effect.kind === "run-script") invokedScriptIds.add(effect.scriptId);
    });
    if (new Set(action.afterActionIds).size !== action.afterActionIds.length) ctx.addIssue({ code: "custom", path: ["actions", actionIndex, "afterActionIds"], message: `ACTION_DEPENDENCY_DUPLICATE: ${action.id}` });
  });
  graph.actions.forEach((action, actionIndex) => action.afterActionIds.forEach((dependencyId, dependencyIndex) => {
    if (!actionById.has(dependencyId)) ctx.addIssue({ code: "custom", path: ["actions", actionIndex, "afterActionIds", dependencyIndex], message: `ACTION_DEPENDENCY_UNKNOWN: ${dependencyId}` });
  }));
  graph.references.scriptIds.forEach((scriptId, scriptIndex) => {
    if (!invokedScriptIds.has(scriptId)) ctx.addIssue({ code: "custom", path: ["references", "scriptIds", scriptIndex], message: `ACTION_SCRIPT_ORPHANED: ${scriptId}` });
  });
  const finished = new Set<string>();
  graph.actions.forEach((start) => {
    if (finished.has(start.id)) return;
    const active = new Set<string>();
    const stack: Array<{ id: string; next: number }> = [{ id: start.id, next: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const entry = actionById.get(frame.id);
      if (entry === undefined) { stack.pop(); continue; }
      active.add(frame.id);
      if (frame.next >= entry.dependencies.length) {
        active.delete(frame.id);
        finished.add(frame.id);
        stack.pop();
        continue;
      }
      const dependencyId = entry.dependencies[frame.next++]!;
      if (active.has(dependencyId)) {
        ctx.addIssue({ code: "custom", path: ["actions", entry.index, "afterActionIds", frame.next - 1], message: `ACTION_DEPENDENCY_CYCLE: ${dependencyId}` });
        continue;
      }
      if (!finished.has(dependencyId) && actionById.has(dependencyId)) stack.push({ id: dependencyId, next: 0 });
    }
  });
});

export const CompilerInstanceNameSchema = z.string().trim().min(2).max(100)
  .regex(/^[A-Za-z_$][A-Za-z0-9_$]*[0-9]$/, "compiler instance names must use an evidence-backed KF instance shape");
export const CompilerPageGuidSchema = z.string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
  .transform((value) => value.toLowerCase());
export const CompilerOwnedIdSchema = z.string().trim().min(1).max(100)
  .regex(/^kf\$(?:action|binding|script):[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const CompilerActionIdSchema = z.string().trim().min(1).max(100).regex(/^kf\$action:[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const CompilerBindingIdSchema = z.string().trim().min(1).max(100).regex(/^kf\$binding:[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const CompilerScriptIdSchema = z.string().trim().min(1).max(100).regex(/^kf\$script:[A-Za-z0-9][A-Za-z0-9_-]*$/);

const compiledActionBase = {
  id: CompilerActionIdSchema,
  sourceActionId: StableSemanticIdSchema,
  ownerInstanceName: CompilerInstanceNameSchema,
};

export const CompiledNativeActionSchema = z.discriminatedUnion("kind", [
  z.object({ ...compiledActionBase, kind: z.literal("navigate-page"), targetPageGuid: CompilerPageGuidSchema }).strict(),
  z.object({ ...compiledActionBase, kind: z.literal("open-overlay"), targetInstanceName: CompilerInstanceNameSchema }).strict(),
  z.object({ ...compiledActionBase, kind: z.literal("close-overlay"), targetInstanceName: CompilerInstanceNameSchema }).strict(),
  z.object({ ...compiledActionBase, kind: z.literal("set-visibility"), targetInstanceName: CompilerInstanceNameSchema, visible: z.boolean() }).strict(),
  z.object({ ...compiledActionBase, kind: z.literal("switch-tab"), targetInstanceName: CompilerInstanceNameSchema, tabId: StableSemanticIdSchema }).strict(),
  z.object({ ...compiledActionBase, kind: z.literal("set-state"), stateId: StableSemanticIdSchema, value: ActionValueSchema }).strict(),
  z.object({ ...compiledActionBase, kind: z.literal("set-control-value"), targetInstanceName: CompilerInstanceNameSchema, value: ActionValueSchema }).strict(),
  z.object({ ...compiledActionBase, kind: z.literal("show-feedback"), level: z.enum(["success", "info", "warning", "error"]), message: shortText }).strict(),
]);

export type SemanticEventBinding = z.infer<typeof SemanticEventBindingSchema>;
export type ActionCondition = z.infer<typeof ActionConditionSchema>;
export type JourneyStepReference = z.infer<typeof JourneyStepReferenceSchema>;
export type ActionEffect = z.infer<typeof ActionEffectSchema>;
export type ActionPlan = z.infer<typeof ActionPlanSchema>;
export type ActionGraph = z.infer<typeof ActionGraphSchema>;
export type CompiledNativeAction = z.infer<typeof CompiledNativeActionSchema>;
