const MANAGED_STYLE_START = "/* KF_AGENT_MANAGED_STYLE_V1_START */";
const MANAGED_STYLE_END = "/* KF_AGENT_MANAGED_STYLE_V1_END */";

const SELECTOR_ORDER = [
  "#domId",
  "#domId:hover",
  "#domId:active",
  "#domId:focus",
  "#domId:disabled",
  "#domId.is-selected",
  "#domId.is-error",
] as const;

type Rules = Map<string, Map<string, string>>;

function parseManagedRules(css: string): Rules {
  const rules: Rules = new Map();
  const pattern = /([^{}]+)\{([^{}]*)\}/g;
  let consumed = "";
  for (const match of css.matchAll(pattern)) {
    consumed += match[0];
    const selector = match[1]!;
    if (!SELECTOR_ORDER.includes(selector as (typeof SELECTOR_ORDER)[number])) {
      throw new Error(`MANAGED_STYLE_DATA_INVALID: unexpected selector ${selector}`);
    }
    const declarations = rules.get(selector) ?? new Map<string, string>();
    if (match[2] !== "") {
      for (const declaration of match[2]!.split(";")) {
        const separator = declaration.indexOf(":");
        if (separator <= 0 || separator === declaration.length - 1) {
          throw new Error("MANAGED_STYLE_DATA_INVALID: malformed declaration");
        }
        declarations.set(declaration.slice(0, separator), declaration.slice(separator + 1));
      }
    }
    rules.set(selector, declarations);
  }
  if (consumed !== css) {
    throw new Error("MANAGED_STYLE_DATA_INVALID: malformed compiler-owned CSS");
  }
  return rules;
}

function mergeRules(existing: Rules, delta: Rules): Rules {
  for (const [selector, deltaDeclarations] of delta) {
    const declarations = existing.get(selector) ?? new Map<string, string>();
    for (const [property, value] of deltaDeclarations) declarations.set(property, value);
    existing.set(selector, declarations);
  }
  return existing;
}

function serializeRules(rules: Rules): string {
  return [...rules.entries()]
    .sort(([left], [right]) => SELECTOR_ORDER.indexOf(left as (typeof SELECTOR_ORDER)[number])
      - SELECTOR_ORDER.indexOf(right as (typeof SELECTOR_ORDER)[number]))
    .map(([selector, declarations]) => `${selector}{${[...declarations.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([property, value]) => `${property}:${value}`)
      .join(";")}}`)
    .join("");
}

/** Preserves unmanaged CSS and merges a deterministic compiler-owned delta. */
export function mergeManagedStyleData(existingValue: unknown, compiledDelta: string): string {
  const existing = typeof existingValue === "string" ? existingValue : "";
  if (compiledDelta === "") return existing;

  const start = existing.indexOf(MANAGED_STYLE_START);
  const end = existing.indexOf(MANAGED_STYLE_END);
  if ((start === -1) !== (end === -1) || (start !== -1 && end < start)) {
    throw new Error("MANAGED_STYLE_DATA_INVALID: incomplete compiler-owned block");
  }
  if (start !== -1 && (
    existing.indexOf(MANAGED_STYLE_START, start + MANAGED_STYLE_START.length) !== -1
    || existing.indexOf(MANAGED_STYLE_END, end + MANAGED_STYLE_END.length) !== -1
  )) {
    throw new Error("MANAGED_STYLE_DATA_INVALID: multiple compiler-owned blocks");
  }

  const deltaRules = parseManagedRules(compiledDelta);
  if (start === -1) {
    const separator = existing !== "" && !existing.endsWith("\n") ? "\n" : "";
    return `${existing}${separator}${MANAGED_STYLE_START}${serializeRules(deltaRules)}${MANAGED_STYLE_END}`;
  }

  const bodyStart = start + MANAGED_STYLE_START.length;
  const managedBody = existing.slice(bodyStart, end);
  const merged = serializeRules(mergeRules(parseManagedRules(managedBody), deltaRules));
  return `${existing.slice(0, bodyStart)}${merged}${existing.slice(end)}`;
}
