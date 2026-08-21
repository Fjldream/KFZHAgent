import {
  ApprovedAssetFactsSchema,
  NativeThemeSpecSchema,
  modelAssetIdToWorkspaceAssetId,
  type AdvancedStyleDeclaration,
  type ApprovedAssetFacts,
} from "@kf/contracts";

export interface LegacyRawStylePair {
  readonly property: string;
  readonly value: string;
}

export interface ResolvedStyleAsset {
  readonly assetId: string;
  readonly targetPath: string;
  readonly token: string;
}

export interface SerializedAdvancedStyle {
  readonly cssProperty: "background-image" | "transform";
  readonly cssValue: string;
  readonly resolvedAsset?: ResolvedStyleAsset;
}

export interface CompiledAdvancedStyles {
  readonly declarations: readonly SerializedAdvancedStyle[];
  readonly resolvedAssets: readonly ResolvedStyleAsset[];
}

const MAX_ADVANCED_DECLARATIONS = 8;
const MAX_GRADIENT_STOPS = 5;
const RAW_ADVANCED_PROPERTIES = new Set(["backgroundImage", "transform", "color"]);
const RAW_VALUE_FORBIDDEN = /(?:\b(?:url|var|calc|expression)\s*\(|javascript\s*:|@|[{};]|!important|(?:^|\s)[.[]|[>~*])/i;

function valueForbidden(detail: string): never {
  throw new Error(`STYLE_VALUE_FORBIDDEN: ${detail}`);
}

function hasPrecision(value: number, decimalPlaces: number): boolean {
  const factor = 10 ** decimalPlaces;
  return Number.isFinite(value) && Math.round(value * factor) / factor === value;
}

function boundedNumber(
  value: number,
  minimum: number,
  maximum: number,
  decimalPlaces: number,
  label: string,
): number {
  if (!hasPrecision(value, decimalPlaces) || value < minimum || value > maximum) {
    return valueForbidden(label);
  }
  return value;
}

function formatNumber(value: number): string {
  return Object.is(value, -0) ? "0" : String(value);
}

function serializeColor(value: string): string {
  if (RAW_VALUE_FORBIDDEN.test(value) || value.includes("{theme.")) {
    return valueForbidden("unsafe or unresolved color");
  }
  const parsed = NativeThemeSpecSchema.shape.background.safeParse(value);
  if (!parsed.success) return valueForbidden("invalid color");
  return parsed.data;
}

function resolveApprovedAsset(
  assetId: string,
  approvedAssets: readonly ApprovedAssetFacts[],
): ResolvedStyleAsset {
  let workspaceAssetId: string;
  try {
    workspaceAssetId = modelAssetIdToWorkspaceAssetId(assetId);
  } catch {
    throw new Error(`STYLE_ASSET_NOT_APPROVED: ${assetId}`);
  }
  const matches = approvedAssets.filter((asset) => asset.workspaceAssetId === workspaceAssetId);
  if (matches.length === 0) throw new Error(`STYLE_ASSET_NOT_APPROVED: ${assetId}`);
  if (matches.length !== 1) throw new Error(`STYLE_ASSET_APPROVAL_AMBIGUOUS: ${assetId}`);
  const parsed = ApprovedAssetFactsSchema.safeParse(matches[0]);
  if (!parsed.success) throw new Error(`STYLE_ASSET_FACTS_INVALID: ${assetId}`);
  return Object.freeze({
    assetId,
    targetPath: parsed.data.targetPath,
    token: `asset-sha256:${parsed.data.sha256}`,
  });
}

function rejectRawPair(input: LegacyRawStylePair): never {
  if (!RAW_ADVANCED_PROPERTIES.has(input.property)) {
    throw new Error(`STYLE_PROPERTY_FORBIDDEN: ${input.property}`);
  }
  if (RAW_VALUE_FORBIDDEN.test(input.value)) {
    return valueForbidden(input.property);
  }
  throw new Error(`STYLE_PROPERTY_FORBIDDEN: raw ${input.property}`);
}

function serializeGradient(
  declaration: Extract<AdvancedStyleDeclaration, { kind: "gradient" }>,
): SerializedAdvancedStyle {
  const angle = boundedNumber(declaration.angle, 0, 360, 2, "gradient angle");
  if (declaration.stops.length < 2 || declaration.stops.length > MAX_GRADIENT_STOPS) {
    return valueForbidden("gradient stop budget");
  }
  let previousOffset = -1;
  const stops = declaration.stops.map((stop) => {
    const offset = boundedNumber(stop.offset, 0, 1, 4, "gradient stop offset");
    if (offset < previousOffset) return valueForbidden("gradient stops must be ordered");
    previousOffset = offset;
    return `${serializeColor(stop.color)} ${formatNumber(offset * 100)}%`;
  });
  return Object.freeze({
    cssProperty: "background-image",
    cssValue: `linear-gradient(${formatNumber(angle)}deg,${stops.join(",")})`,
  });
}

function serializeTransform(
  declaration: Extract<AdvancedStyleDeclaration, { kind: "transform" }>,
): SerializedAdvancedStyle {
  const operations: string[] = [];
  if (declaration.translateX !== undefined) {
    operations.push(`translateX(${formatNumber(boundedNumber(declaration.translateX, -200, 200, 2, "translateX"))}px)`);
  }
  if (declaration.translateY !== undefined) {
    operations.push(`translateY(${formatNumber(boundedNumber(declaration.translateY, -200, 200, 2, "translateY"))}px)`);
  }
  if (declaration.scale !== undefined) {
    operations.push(`scale(${formatNumber(boundedNumber(declaration.scale, 0.8, 1.2, 2, "scale"))})`);
  }
  if (declaration.rotate !== undefined) {
    operations.push(`rotate(${formatNumber(boundedNumber(declaration.rotate, -15, 15, 2, "rotate"))}deg)`);
  }
  if (operations.length === 0) return valueForbidden("empty transform");
  return Object.freeze({ cssProperty: "transform", cssValue: operations.join(" ") });
}

/** Parses only the Task 1 structured union; legacy property/value input always fails. */
export function parseAdvancedStyle(
  declaration: AdvancedStyleDeclaration | LegacyRawStylePair,
  approvedAssets: readonly ApprovedAssetFacts[],
): SerializedAdvancedStyle {
  if ("property" in declaration) return rejectRawPair(declaration);
  if (declaration.kind === "gradient") return serializeGradient(declaration);
  if (declaration.kind === "transform") return serializeTransform(declaration);
  const resolvedAsset = resolveApprovedAsset(declaration.assetId, approvedAssets);
  return Object.freeze({
    cssProperty: "background-image",
    cssValue: `url("${resolvedAsset.targetPath}")`,
    resolvedAsset,
  });
}

/** Serializes a bounded advanced list with stable property ordering and deduplication. */
export function compileAdvancedStyles(
  declarations: readonly AdvancedStyleDeclaration[],
  approvedAssets: readonly ApprovedAssetFacts[],
): CompiledAdvancedStyles {
  if (declarations.length > MAX_ADVANCED_DECLARATIONS) {
    throw new Error(`STYLE_BUDGET_EXCEEDED: advanced declarations exceed ${MAX_ADVANCED_DECLARATIONS}`);
  }
  const assetLayerCount = declarations.filter((declaration) => declaration.kind === "background-image").length;
  if (assetLayerCount > 1) {
    throw new Error("STYLE_ASSET_LAYER_BUDGET: KF setStyleFormat rewrites only one URL per declaration set");
  }
  const parsed = declarations.map((declaration) => parseAdvancedStyle(declaration, approvedAssets));
  const backgroundLayers = [...new Set(
    parsed.filter((entry) => entry.cssProperty === "background-image").map((entry) => entry.cssValue),
  )];
  const transforms = [...new Set(
    parsed.filter((entry) => entry.cssProperty === "transform").map((entry) => entry.cssValue),
  )];
  if (transforms.length > 1) return valueForbidden("multiple transforms");
  const output: SerializedAdvancedStyle[] = [];
  if (backgroundLayers.length > 0) {
    output.push(Object.freeze({ cssProperty: "background-image", cssValue: backgroundLayers.join(",") }));
  }
  if (transforms[0] !== undefined) {
    output.push(Object.freeze({ cssProperty: "transform", cssValue: transforms[0] }));
  }
  const resolvedAssets = new Map<string, ResolvedStyleAsset>();
  parsed.forEach((entry) => {
    if (entry.resolvedAsset !== undefined) resolvedAssets.set(entry.resolvedAsset.assetId, entry.resolvedAsset);
  });
  return Object.freeze({
    declarations: Object.freeze(output),
    resolvedAssets: Object.freeze([...resolvedAssets.values()].sort((left, right) =>
      left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0)),
  });
}
