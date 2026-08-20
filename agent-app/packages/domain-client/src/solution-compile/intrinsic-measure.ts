import type {
  ControlDesignProfile,
  NodeIntent,
  SemanticValue,
} from "@kf/contracts";
import type { ModuleLayoutContract } from "../modules/module-registry.js";

const MAX_MEASURED_WIDTH = 8_192;
const MAX_MEASURED_HEIGHT = 8_192;
const MAX_TEXT_LINES = 12;
const MAX_GRID_ROWS = 12;
const DEFAULT_FONT_SIZE = 16;
const DEFAULT_LINE_HEIGHT = 1.5;
const DEFAULT_TEXT_LINE_CLAMP = 4;

export type IntrinsicOverflow = "wrap" | "clip" | "scroll";
export type IntrinsicDensity = "compact" | "comfortable" | "spacious";

export interface IntrinsicSize {
  readonly minWidth: number;
  readonly preferredWidth: number;
  readonly maxWidth: number;
  readonly minHeight: number;
  readonly preferredHeight: number;
  readonly maxHeight: number;
  readonly overflow: IntrinsicOverflow;
}

/** Resolved, numeric style facts. `lineHeight` is the CSS multiplier, not a browser measurement. */
export interface IntrinsicFontMetrics {
  readonly fontSize: number;
  readonly lineHeight: number;
  readonly letterSpacing?: number;
  readonly padding?: Readonly<{ horizontal: number; vertical: number }>;
  readonly border?: Readonly<{ horizontal: number; vertical: number }>;
}

export interface IntrinsicWidthConstraint {
  readonly available: number;
  readonly min?: number;
  readonly max?: number;
}

/** Expanded nodes have already resolved repeater-field values and cannot contain a repeater. */
export interface ExpandedControlMeasureNode {
  readonly kind: "control";
  readonly id: string;
  readonly capabilityId: string;
  readonly content: SemanticValue;
  readonly properties: readonly Readonly<{ name: string; value: SemanticValue }>[];
  readonly tabIds: readonly string[];
  readonly intent: Pick<NodeIntent, "density">;
}

export interface ExpandedLayoutMeasureNode {
  readonly kind: "layout";
  readonly id: string;
  readonly layout: "row" | "column" | "grid" | "asymmetric-grid" | "split" | "stack" | "dock" | "sidebar-content" | "master-detail" | "scroll-region" | "overlay-anchor";
  readonly intent: Pick<NodeIntent, "density">;
}

export interface ExpandedRegisteredModuleMeasureNode {
  readonly kind: "registered-module";
  readonly id: string;
  readonly moduleKind: string;
  readonly templateVersion: string;
  readonly variant: string;
  readonly title: string;
}

export interface DataGridMeasureFacts {
  readonly recordCount: number;
  readonly headerHeight?: number;
  readonly rowHeight?: number;
  readonly visibleRowLimit?: number;
}

export interface ImageMeasureFacts {
  readonly aspectRatio: Readonly<{ width: number; height: number }>;
  readonly preferredWidth?: number;
}

interface IntrinsicMeasureInputBase {
  readonly density: IntrinsicDensity;
  readonly width: IntrinsicWidthConstraint;
  readonly font: IntrinsicFontMetrics;
}

export interface ControlIntrinsicMeasureInput extends IntrinsicMeasureInputBase {
  readonly kind: "control";
  readonly node: ExpandedControlMeasureNode;
  /** A trusted subset of a reviewed control design profile. */
  readonly profile: Pick<ControlDesignProfile, "capabilityId" | "minimumSize">;
  readonly lineClamp?: number;
  readonly dataGrid?: DataGridMeasureFacts;
  readonly image?: ImageMeasureFacts;
  readonly overflow?: IntrinsicOverflow;
}

export interface LayoutIntrinsicMeasureInput extends IntrinsicMeasureInputBase {
  readonly kind: "layout";
  readonly node: ExpandedLayoutMeasureNode;
  /** Measurements are supplied by the recursive solver; this function never measures a child twice. */
  readonly childMeasures: readonly IntrinsicSize[];
  readonly gap?: number;
}

export interface RegisteredModuleIntrinsicMeasureInput extends IntrinsicMeasureInputBase {
  readonly kind: "registered-module";
  readonly node: ExpandedRegisteredModuleMeasureNode;
  /** Trusted registry declaration only. A module compiler is deliberately not accepted here. */
  readonly layoutContract: Pick<ModuleLayoutContract, "minColumnSpan" | "maxColumnSpan" | "height">;
  readonly columnWidth?: number;
}

export type IntrinsicMeasureInput =
  | ControlIntrinsicMeasureInput
  | LayoutIntrinsicMeasureInput
  | RegisteredModuleIntrinsicMeasureInput;

export function measureIntrinsic(input: IntrinsicMeasureInput): IntrinsicSize {
  switch (input.kind) {
    case "control": return measureControl(input);
    case "layout": return measureLayout(input);
    case "registered-module": return measureRegisteredModule(input);
  }
}

function measureControl(input: ControlIntrinsicMeasureInput): IntrinsicSize {
  const metrics = resolveMetrics(input.font);
  const minimumWidth = Math.max(safeDimension(input.profile.minimumSize.width, 0, MAX_MEASURED_WIDTH), safeDimension(input.width.min, 0, MAX_MEASURED_WIDTH));
  const maximumWidth = widthMaximum(input.width, minimumWidth);
  const capabilityId = input.node.capabilityId;

  if (isDataGrid(capabilityId, input.dataGrid)) return measureDataGrid(input, metrics, minimumWidth, maximumWidth);
  if (isImage(capabilityId, input.image)) return measureImage(input, metrics, minimumWidth, maximumWidth);

  const contentWidth = measureSemanticText(input.node.content, metrics);
  const preferredWidth = clamp(contentWidth + metrics.horizontalInset, minimumWidth, maximumWidth);
  const lineClamp = boundedInteger(input.lineClamp, DEFAULT_TEXT_LINE_CLAMP, 1, MAX_TEXT_LINES);
  const textLayout = textLines(input.node.content, metrics, preferredWidth - metrics.horizontalInset, lineClamp);
  const contentHeight = textLayout * metrics.resolvedLineHeight + metrics.verticalInset;
  const profileMinimumHeight = safeDimension(input.profile.minimumSize.height, 0, MAX_MEASURED_HEIGHT);

  if (isButton(capabilityId, input.profile.capabilityId)) {
    const minHeight = clamp(Math.max(32, profileMinimumHeight), 32, 56);
    const preferredHeight = clamp(Math.max(minHeight, contentHeight), minHeight, 56);
    return size(minimumWidth, preferredWidth, maximumWidth, minHeight, preferredHeight, 56, input.overflow ?? "clip");
  }

  const minHeight = profileMinimumHeight;
  const preferredHeight = Math.max(minHeight, contentHeight);
  return size(
    minimumWidth,
    preferredWidth,
    maximumWidth,
    minHeight,
    preferredHeight,
    preferredHeight,
    input.overflow ?? (isText(capabilityId) ? "wrap" : "clip"),
  );
}

function measureDataGrid(
  input: ControlIntrinsicMeasureInput,
  metrics: ResolvedMetrics,
  minimumWidth: number,
  maximumWidth: number,
): IntrinsicSize {
  const facts = input.dataGrid;
  if (facts === undefined) throw new Error("INTRINSIC_MEASURE_DATAGRID_FACTS_REQUIRED");
  const defaults = input.density === "compact"
    ? { header: 32, row: 28 }
    : input.density === "spacious"
      ? { header: 40, row: 36 }
      : { header: 36, row: 32 };
  const header = safeDimension(facts.headerHeight, defaults.header, MAX_MEASURED_HEIGHT);
  const row = safeDimension(facts.rowHeight, defaults.row, MAX_MEASURED_HEIGHT);
  const count = boundedInteger(facts.recordCount, 0, 0, 1_000_000);
  const visibleLimit = boundedInteger(facts.visibleRowLimit, MAX_GRID_ROWS, 1, MAX_GRID_ROWS);
  const visibleRows = Math.min(count, visibleLimit);
  const calculatedHeight = header + row * visibleRows + metrics.verticalInset;
  const minimumHeight = Math.max(safeDimension(input.profile.minimumSize.height, 0, MAX_MEASURED_HEIGHT), calculatedHeight);
  const preferredWidth = clamp(Math.max(minimumWidth, 640), minimumWidth, maximumWidth);
  return size(
    minimumWidth,
    preferredWidth,
    maximumWidth,
    minimumHeight,
    minimumHeight,
    minimumHeight,
    count > visibleLimit ? "scroll" : "clip",
  );
}

function measureImage(
  input: ControlIntrinsicMeasureInput,
  metrics: ResolvedMetrics,
  minimumWidth: number,
  maximumWidth: number,
): IntrinsicSize {
  const image = input.image;
  if (image === undefined) throw new Error("INTRINSIC_MEASURE_IMAGE_FACTS_REQUIRED");
  const ratioWidth = safeDimension(image.aspectRatio.width, 1, MAX_MEASURED_WIDTH);
  const ratioHeight = safeDimension(image.aspectRatio.height, 1, MAX_MEASURED_HEIGHT);
  const preferredWidth = clamp(safeDimension(image.preferredWidth, maximumWidth, MAX_MEASURED_WIDTH), minimumWidth, maximumWidth);
  const imageHeight = safeDimension(preferredWidth * ratioHeight / ratioWidth, 0, MAX_MEASURED_HEIGHT);
  const minimumHeight = safeDimension(input.profile.minimumSize.height, 0, MAX_MEASURED_HEIGHT);
  const preferredHeight = Math.max(minimumHeight, imageHeight + metrics.verticalInset);
  return size(minimumWidth, preferredWidth, maximumWidth, minimumHeight, preferredHeight, preferredHeight, input.overflow ?? "clip");
}

function measureLayout(input: LayoutIntrinsicMeasureInput): IntrinsicSize {
  const children = input.childMeasures.map(normalizeSize);
  const gap = safeDimension(input.gap, 0, MAX_MEASURED_WIDTH);
  if (children.length === 0) return size(0, 0, widthMaximum(input.width, 0), 0, 0, 0, input.node.layout === "scroll-region" ? "scroll" : "wrap");

  const direction = layoutDirection(input.node.layout);
  if (direction === "row") {
    const spaces = gap * Math.max(0, children.length - 1);
    return constrainedLayoutSize(
      children.reduce((total, child) => total + child.minWidth, 0) + spaces,
      children.reduce((total, child) => total + child.preferredWidth, 0) + spaces,
      children.reduce((total, child) => total + child.maxWidth, 0) + spaces,
      Math.max(...children.map((child) => child.minHeight)),
      Math.max(...children.map((child) => child.preferredHeight)),
      Math.max(...children.map((child) => child.maxHeight)),
      input,
    );
  }

  const spaces = gap * Math.max(0, children.length - 1);
  return constrainedLayoutSize(
    Math.max(...children.map((child) => child.minWidth)),
    Math.max(...children.map((child) => child.preferredWidth)),
    Math.max(...children.map((child) => child.maxWidth)),
    children.reduce((total, child) => total + child.minHeight, 0) + spaces,
    children.reduce((total, child) => total + child.preferredHeight, 0) + spaces,
    children.reduce((total, child) => total + child.maxHeight, 0) + spaces,
    input,
  );
}

function constrainedLayoutSize(
  minWidth: number,
  preferredWidth: number,
  maxWidth: number,
  minHeight: number,
  preferredHeight: number,
  maxHeight: number,
  input: LayoutIntrinsicMeasureInput,
): IntrinsicSize {
  const constrainedMaximum = Math.max(widthMaximum(input.width, minWidth), minWidth);
  return size(
    minWidth,
    clamp(preferredWidth, minWidth, constrainedMaximum),
    Math.min(Math.max(minWidth, maxWidth), constrainedMaximum),
    minHeight,
    preferredHeight,
    maxHeight,
    input.node.layout === "scroll-region" ? "scroll" : "wrap",
  );
}

function measureRegisteredModule(input: RegisteredModuleIntrinsicMeasureInput): IntrinsicSize {
  const contract = input.layoutContract;
  const columnWidth = safeDimension(input.columnWidth, 80, MAX_MEASURED_WIDTH);
  const minimumWidth = safeDimension(contract.minColumnSpan * columnWidth, 0, MAX_MEASURED_WIDTH);
  const contractMaximumWidth = safeDimension(contract.maxColumnSpan * columnWidth, minimumWidth, MAX_MEASURED_WIDTH);
  const maximumWidth = Math.max(minimumWidth, Math.min(contractMaximumWidth, widthMaximum(input.width, minimumWidth)));
  const preferredWidth = clamp(safeDimension(input.width.available, minimumWidth, MAX_MEASURED_WIDTH), minimumWidth, maximumWidth);
  const height = contract.height;
  const minimumHeight = safeDimension(height.min, 0, MAX_MEASURED_HEIGHT);
  const maximumHeight = Math.max(minimumHeight, safeDimension(height.max, minimumHeight, MAX_MEASURED_HEIGHT));
  const preferredHeight = clamp(safeDimension(height.preferred[moduleHeightKey(input.density)], minimumHeight, MAX_MEASURED_HEIGHT), minimumHeight, maximumHeight);
  return size(minimumWidth, preferredWidth, maximumWidth, minimumHeight, preferredHeight, maximumHeight, "clip");
}

function resolveMetrics(font: IntrinsicFontMetrics): ResolvedMetrics {
  const fontSize = safeDimension(font.fontSize, DEFAULT_FONT_SIZE, 200);
  const lineHeightMultiplier = safeDimension(font.lineHeight, DEFAULT_LINE_HEIGHT, 4);
  const padding = font.padding;
  const border = font.border;
  const horizontalInset = 2 * (safeDimension(padding?.horizontal, 0, MAX_MEASURED_WIDTH) + safeDimension(border?.horizontal, 0, MAX_MEASURED_WIDTH));
  const verticalInset = 2 * (safeDimension(padding?.vertical, 0, MAX_MEASURED_HEIGHT) + safeDimension(border?.vertical, 0, MAX_MEASURED_HEIGHT));
  return {
    fontSize,
    resolvedLineHeight: fontSize * lineHeightMultiplier,
    letterSpacing: safeSignedDimension(font.letterSpacing, 0, 100),
    horizontalInset,
    verticalInset,
  };
}

interface ResolvedMetrics {
  readonly fontSize: number;
  readonly resolvedLineHeight: number;
  readonly letterSpacing: number;
  readonly horizontalInset: number;
  readonly verticalInset: number;
}

function measureSemanticText(value: SemanticValue, metrics: ResolvedMetrics): number {
  const text = semanticText(value);
  if (text.length === 0) return 0;
  const glyphs = [...text];
  return glyphs.reduce((total, glyph, index) => total + glyphWidth(glyph, metrics.fontSize) + (index === 0 ? 0 : metrics.letterSpacing), 0);
}

function textLines(value: SemanticValue, metrics: ResolvedMetrics, contentWidth: number, lineClamp: number): number {
  const totalWidth = measureSemanticText(value, metrics);
  if (totalWidth === 0) return 1;
  const available = Math.max(1, safeDimension(contentWidth, 1, MAX_MEASURED_WIDTH));
  return Math.min(lineClamp, Math.max(1, Math.ceil(totalWidth / available)));
}

function semanticText(value: SemanticValue): string {
  if (value === null) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  if (value.kind === "repeater-field") return `${value.itemAlias}.${value.field}`;
  if (value.kind === "list") return value.items.map(semanticText).join(" ");
  return value.fields.map((field) => `${field.name} ${semanticText(field.value)}`).join(" ");
}

function glyphWidth(glyph: string, fontSize: number): number {
  if (/^[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF\uFF01-\uFF60\uFFE0-\uFFE6]$/u.test(glyph)) return fontSize;
  if (/^\p{ASCII}$/u.test(glyph)) return glyph === " " ? fontSize * 0.28 : fontSize * 0.56;
  // Emoji and all other Unicode code points use a conservative full-em fallback.
  return fontSize;
}

function normalizeSize(value: IntrinsicSize): IntrinsicSize {
  return size(value.minWidth, value.preferredWidth, value.maxWidth, value.minHeight, value.preferredHeight, value.maxHeight, value.overflow);
}

function size(
  minWidth: number,
  preferredWidth: number,
  maxWidth: number,
  minHeight: number,
  preferredHeight: number,
  maxHeight: number,
  overflow: IntrinsicOverflow,
): IntrinsicSize {
  const safeMinWidth = safeDimension(minWidth, 0, MAX_MEASURED_WIDTH);
  const safeMaxWidth = Math.max(safeMinWidth, safeDimension(maxWidth, safeMinWidth, MAX_MEASURED_WIDTH));
  const safeMinHeight = safeDimension(minHeight, 0, MAX_MEASURED_HEIGHT);
  const safeMaxHeight = Math.max(safeMinHeight, safeDimension(maxHeight, safeMinHeight, MAX_MEASURED_HEIGHT));
  return Object.freeze({
    minWidth: quantize(safeMinWidth),
    preferredWidth: quantize(clamp(safeDimension(preferredWidth, safeMinWidth, MAX_MEASURED_WIDTH), safeMinWidth, safeMaxWidth)),
    maxWidth: quantize(safeMaxWidth),
    minHeight: quantize(safeMinHeight),
    preferredHeight: quantize(clamp(safeDimension(preferredHeight, safeMinHeight, MAX_MEASURED_HEIGHT), safeMinHeight, safeMaxHeight)),
    maxHeight: quantize(safeMaxHeight),
    overflow,
  });
}

function widthMaximum(width: IntrinsicWidthConstraint, minimum: number): number {
  const declaredMaximum = width.max === undefined
    ? safeDimension(width.available, 0, MAX_MEASURED_WIDTH)
    : safeDimension(width.max, 0, MAX_MEASURED_WIDTH);
  return Math.max(minimum, declaredMaximum);
}

function layoutDirection(layout: ExpandedLayoutMeasureNode["layout"]): "row" | "column" {
  return layout === "row" || layout === "split" || layout === "sidebar-content" || layout === "master-detail" || layout === "dock" ? "row" : "column";
}

function moduleHeightKey(density: IntrinsicDensity): "compact" | "medium" | "large" {
  return density === "compact" ? "compact" : density === "spacious" ? "large" : "medium";
}

function isButton(capabilityId: string, profileCapabilityId: string): boolean {
  return capabilityId === "button" || profileCapabilityId === "button" || capabilityId === "easyui.2";
}

function isDataGrid(capabilityId: string, facts: DataGridMeasureFacts | undefined): boolean {
  return facts !== undefined || capabilityId === "easyui.1" || capabilityId === "datagrid";
}

function isImage(capabilityId: string, facts: ImageMeasureFacts | undefined): boolean {
  return facts !== undefined || capabilityId === "image";
}

function isText(capabilityId: string): boolean {
  return capabilityId === "text" || capabilityId === "richtext";
}

function safeDimension(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value) || value < 0) return fallback;
  return Math.min(value, maximum);
}

function safeSignedDimension(value: number | undefined, fallback: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return clamp(value, -maximum, maximum);
}

function boundedInteger(value: number | undefined, fallback: number, minimum: number, maximum: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return clamp(Math.floor(value), minimum, maximum);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

function quantize(value: number): number {
  return Math.round(value * 100) / 100;
}
