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

interface ManagedEnvelope {
  bodyStart: number;
  end: number;
}

/** Finds exact ownership comments only at CSS top level, outside strings/comments/rules. */
function findManagedEnvelope(css: string): ManagedEnvelope | undefined {
  const markers: Array<{ kind: "start" | "end"; index: number }> = [];
  let depth = 0;
  let quote: "\"" | "'" | undefined;
  let inComment = false;
  let escaped = false;
  for (let index = 0; index < css.length;) {
    const char = css[index]!;
    if (escaped) {
      escaped = false;
      index += 1;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      index += 1;
      continue;
    }
    if (inComment) {
      if (char === "*" && css[index + 1] === "/") {
        inComment = false;
        index += 2;
      } else {
        index += 1;
      }
      continue;
    }
    if (quote !== undefined) {
      if (char === quote) quote = undefined;
      index += 1;
      continue;
    }
    if (char === "\"" || char === "'") {
      quote = char;
      index += 1;
      continue;
    }
    if (char === "/" && css[index + 1] === "*") {
      if (depth === 0 && css.startsWith(MANAGED_STYLE_START, index)) {
        markers.push({ kind: "start", index });
        index += MANAGED_STYLE_START.length;
        continue;
      }
      if (depth === 0 && css.startsWith(MANAGED_STYLE_END, index)) {
        markers.push({ kind: "end", index });
        index += MANAGED_STYLE_END.length;
        continue;
      }
      inComment = true;
      index += 2;
      continue;
    }
    if (char === "{") depth += 1;
    if (char === "}") {
      if (depth === 0) {
        throw new Error("MANAGED_STYLE_DATA_INVALID: unmatched closing brace");
      }
      depth -= 1;
    }
    index += 1;
  }

  if (escaped || quote !== undefined || inComment || depth !== 0) {
    throw new Error("MANAGED_STYLE_DATA_INVALID: incomplete CSS lexical state");
  }

  if (markers.length === 0) return undefined;
  if (markers.length !== 2 || markers[0]!.kind !== "start" || markers[1]!.kind !== "end") {
    throw new Error("MANAGED_STYLE_DATA_INVALID: ambiguous or corrupt compiler-owned envelope");
  }
  return {
    bodyStart: markers[0]!.index + MANAGED_STYLE_START.length,
    end: markers[1]!.index,
  };
}

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

  const envelope = findManagedEnvelope(existing);
  const deltaRules = parseManagedRules(compiledDelta);
  if (envelope === undefined) {
    const separator = existing !== "" && !existing.endsWith("\n") ? "\n" : "";
    return `${existing}${separator}${MANAGED_STYLE_START}${serializeRules(deltaRules)}${MANAGED_STYLE_END}`;
  }

  const managedBody = existing.slice(envelope.bodyStart, envelope.end);
  const merged = serializeRules(mergeRules(parseManagedRules(managedBody), deltaRules));
  return `${existing.slice(0, envelope.bodyStart)}${merged}${existing.slice(envelope.end)}`;
}
