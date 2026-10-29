import type { ControlDesignProfile, NodeIntent, RegisteredModuleNode, SemanticValue } from "@kf/contracts";
import type { ModuleLayoutContract } from "../modules/module-registry.js";

const MAX_DIMENSION = 8_192;
const MAX_TEXT_LINES = 4;
const MAX_GRID_ROWS = 12;

export type IntrinsicOverflow = "wrap" | "clip" | "scroll";
export type IntrinsicDensity = "compact" | "comfortable" | "spacious";
export type ResolvedSemanticValue = string | number | boolean | null | { readonly kind: "list"; readonly items: readonly ResolvedSemanticValue[] } | { readonly kind: "record"; readonly fields: readonly Readonly<{ name: string; value: ResolvedSemanticValue }>[] };

export interface IntrinsicSize {
  readonly minWidth: number; readonly preferredWidth: number; readonly maxWidth: number;
  readonly minHeight: number; readonly preferredHeight: number; readonly maxHeight: number;
  readonly overflow: IntrinsicOverflow;
}
export interface IntrinsicFontMetrics {
  readonly fontSize: number; readonly lineHeight: number; readonly letterSpacing?: number;
  /** 侧边解析值 */
  readonly padding?: Readonly<{ horizontal: number; vertical: number }>;
  /** 侧边解析值 */
  readonly border?: Readonly<{ horizontal: number; vertical: number }>;
}
export interface IntrinsicWidthConstraint { readonly available: number; readonly min?: number; readonly max?: number; }
export interface ExpandedControlMeasureNode {
  readonly kind: "control"; readonly id: string; readonly capabilityId: string; readonly content: SemanticValue;
  readonly properties: readonly Readonly<{ name: string; value: SemanticValue }>[]; readonly tabIds: readonly string[];
  readonly intent: Pick<NodeIntent, "density">;
}
export interface ExpandedLayoutMeasureNode {
  readonly kind: "layout"; readonly id: string;
  readonly layout: "row" | "column" | "grid" | "asymmetric-grid" | "split" | "stack" | "dock" | "sidebar-content" | "master-detail" | "scroll-region" | "overlay-anchor";
  readonly intent: Pick<NodeIntent, "density">;
}
export type ExpandedRegisteredModuleMeasureNode = Pick<RegisteredModuleNode, "kind" | "id" | "moduleKind" | "templateVersion" | "variant" | "title"> & Readonly<{ intent: Pick<NodeIntent, "density"> }>;
export interface DataGridMeasureFacts { readonly recordCount: number; readonly headerHeight?: number; readonly rowHeight?: number; readonly visibleRowLimit?: number; }
export interface ImageMeasureFacts { readonly aspectRatio: Readonly<{ width: number; height: number }>; }
export interface ResolvedControlStyleFacts { readonly truncate?: boolean; }
interface BaseInput { readonly density: IntrinsicDensity; readonly width: IntrinsicWidthConstraint; readonly font: IntrinsicFontMetrics; }
interface ControlBase extends BaseInput { readonly kind: "control"; readonly node: ExpandedControlMeasureNode; readonly profile: Pick<ControlDesignProfile, "capabilityId" | "minimumSize">; readonly style: ResolvedControlStyleFacts; }
export interface GenericControlIntrinsicMeasureInput extends ControlBase { readonly family: "generic"; }
export interface DataGridControlIntrinsicMeasureInput extends ControlBase { readonly family: "datagrid"; readonly dataGrid: DataGridMeasureFacts; }
export interface ImageControlIntrinsicMeasureInput extends ControlBase { readonly family: "image"; readonly image: ImageMeasureFacts; }
export type ControlIntrinsicMeasureInput = GenericControlIntrinsicMeasureInput | DataGridControlIntrinsicMeasureInput | ImageControlIntrinsicMeasureInput;
export interface LayoutIntrinsicMeasureInput extends BaseInput { readonly kind: "layout"; readonly node: ExpandedLayoutMeasureNode; readonly childMeasures: readonly IntrinsicSize[]; readonly gap?: number; }
export interface RegisteredModuleIntrinsicMeasureInput extends BaseInput { readonly kind: "registered-module"; readonly node: ExpandedRegisteredModuleMeasureNode; readonly layoutContract: Pick<ModuleLayoutContract, "minColumnSpan" | "maxColumnSpan" | "height">; readonly columnWidth?: number; }
export type IntrinsicMeasureInput = ControlIntrinsicMeasureInput | LayoutIntrinsicMeasureInput | RegisteredModuleIntrinsicMeasureInput;

export function measureIntrinsic(input: IntrinsicMeasureInput): IntrinsicSize {
  if (input.kind === "control") return measureControl(input);
  if (input.kind === "layout") return measureLayout(input);
  return measureModule(input);
}

function measureControl(input: ControlIntrinsicMeasureInput): IntrinsicSize {
  assertDensity(input.density, input.node.intent.density);
  assertProfile(input.node.capabilityId, input.profile.capabilityId);
  assertControlFamily(input.family, input.node.capabilityId);
  const content = resolveSemanticValue(input.node.content);
  input.node.properties.forEach((property) => resolveSemanticValue(property.value));
  const metrics = metricsFor(input.font);
  const envelope = widthEnvelope(input.width, input.profile.minimumSize.width);
  if (input.family === "datagrid") return measureDataGrid(input, metrics, envelope);
  if (input.family === "image") return measureImage(input, metrics, envelope);
  const textWidth = textMeasure(content, metrics);
  const preferredWidth = clamp(textWidth + metrics.horizontalInset, envelope.min, envelope.outer);
  const lineLimit = input.style.truncate === true ? 1 : MAX_TEXT_LINES;
  const lines = textWidth === 0 ? 1 : Math.min(lineLimit, Math.max(1, Math.ceil(textWidth / Math.max(1, envelope.outer - metrics.horizontalInset))));
  const profileHeight = dimension(input.profile.minimumSize.height, 0);
  const contentHeight = lines * metrics.lineHeight + metrics.verticalInset;
  if (isActionControl(input.node.capabilityId)) {
    if (profileHeight > 56) return size(envelope.min, preferredWidth, envelope.outer, profileHeight, profileHeight, profileHeight, "clip");
    const minimum = Math.max(32, profileHeight);
    return size(envelope.min, preferredWidth, envelope.outer, minimum, clamp(contentHeight, minimum, 56), 56, "clip");
  }
  const preferredHeight = Math.max(profileHeight, contentHeight);
  return size(envelope.min, preferredWidth, envelope.outer, profileHeight, preferredHeight, preferredHeight, input.style.truncate === true ? "clip" : "wrap");
}

function measureDataGrid(input: DataGridControlIntrinsicMeasureInput, metrics: Metrics, envelope: WidthEnvelope): IntrinsicSize {
  const facts = input.dataGrid;
  if (!Number.isInteger(facts.recordCount) || facts.recordCount < 0 || !boundedPositive(facts.headerHeight, MAX_DIMENSION) || !boundedPositive(facts.rowHeight, Math.floor(MAX_DIMENSION / MAX_GRID_ROWS)) || !optionalPositiveInteger(facts.visibleRowLimit)) throw new Error("INTRINSIC_MEASURE_DATAGRID_FACTS_INVALID");
  const defaults = input.density === "compact" ? { header: 32, row: 28 } : input.density === "spacious" ? { header: 40, row: 36 } : { header: 36, row: 32 };
  const header = facts.headerHeight ?? defaults.header;
  const row = facts.rowHeight ?? defaults.row;
  const limit = Math.min(facts.visibleRowLimit ?? MAX_GRID_ROWS, MAX_GRID_ROWS);
  const visible = Math.min(facts.recordCount, limit);
  const calculated = header + visible * row + metrics.verticalInset;
  if (!Number.isFinite(calculated) || calculated > MAX_DIMENSION) throw new Error("INTRINSIC_MEASURE_DATAGRID_FACTS_INVALID");
  const height = Math.max(dimension(input.profile.minimumSize.height, 0), calculated);
  return size(envelope.min, clamp(640, envelope.min, envelope.outer), envelope.outer, height, height, height, facts.recordCount > limit ? "scroll" : "clip");
}

function measureImage(input: ImageControlIntrinsicMeasureInput, metrics: Metrics, envelope: WidthEnvelope): IntrinsicSize {
  const { width, height } = input.image.aspectRatio;
  if (!positiveFinite(width) || !positiveFinite(height)) throw new Error("INTRINSIC_MEASURE_IMAGE_RATIO_INVALID");
  const contentWidth = Math.max(0, envelope.outer - metrics.horizontalInset);
  if (contentWidth <= 0) throw new Error("INTRINSIC_MEASURE_IMAGE_CONTENT_BOX_UNSATISFIABLE");
  const quotient = height / width;
  const ratioHeight = contentWidth * quotient + metrics.verticalInset;
  if (!Number.isFinite(quotient) || quotient <= 0 || quotient > MAX_DIMENSION || !Number.isFinite(ratioHeight) || ratioHeight < 0 || ratioHeight > MAX_DIMENSION) throw new Error("INTRINSIC_MEASURE_IMAGE_RATIO_INVALID");
  const profileHeight = dimension(input.profile.minimumSize.height, 0);
  const preferredHeight = Math.max(profileHeight, ratioHeight);
  return size(envelope.min, envelope.outer, envelope.outer, profileHeight, preferredHeight, preferredHeight, "clip");
}

function measureLayout(input: LayoutIntrinsicMeasureInput): IntrinsicSize {
  assertDensity(input.density, input.node.intent.density);
  if (input.childMeasures.length === 0) throw new Error("INTRINSIC_MEASURE_LAYOUT_CHILDREN_REQUIRED");
  const children = input.childMeasures.map(normalizeChild);
  const gap = nonnegative(input.gap);
  const layout = input.node.layout;
  if (layout === "stack" || layout === "overlay-anchor") return maxAxes(children, input, "wrap");
  if (layout === "row") return rowAxes(children, gap, input, "wrap");
  if (layout === "column") return columnAxes(children, gap, input, "wrap");
  if (layout === "scroll-region") return scrollAxes(children, gap, input);
  if (layout === "grid") return gridAxes(children, gap, input, false);
  if (layout === "asymmetric-grid") return gridAxes(children, gap, input, true);
  if (layout === "split" || layout === "sidebar-content" || layout === "master-detail") {
    if (children.length !== 2) throw new Error("INTRINSIC_MEASURE_LAYOUT_CHILD_COUNT");
    return rowAxes(children, gap, input, "wrap");
  }
  if (layout === "dock") return dockAxes(children, gap, input);
  throw new Error("INTRINSIC_MEASURE_LAYOUT_INVALID");
}

function rowAxes(children: readonly IntrinsicSize[], gap: number, input: LayoutIntrinsicMeasureInput, overflow: IntrinsicOverflow): IntrinsicSize {
  const spaces = gap * (children.length - 1);
  return constrained(input, sum(children, "minWidth") + spaces, sum(children, "preferredWidth") + spaces, sum(children, "maxWidth") + spaces, max(children, "minHeight"), max(children, "preferredHeight"), max(children, "maxHeight"), overflow);
}
function columnAxes(children: readonly IntrinsicSize[], gap: number, input: LayoutIntrinsicMeasureInput, overflow: IntrinsicOverflow): IntrinsicSize {
  const spaces = gap * (children.length - 1);
  return constrained(input, max(children, "minWidth"), max(children, "preferredWidth"), max(children, "maxWidth"), sum(children, "minHeight") + spaces, sum(children, "preferredHeight") + spaces, sum(children, "maxHeight") + spaces, overflow);
}
function scrollAxes(children: readonly IntrinsicSize[], gap: number, input: LayoutIntrinsicMeasureInput): IntrinsicSize {
  const spaces = gap * (children.length - 1);
  return constrained(input, max(children, "minWidth"), max(children, "preferredWidth"), max(children, "maxWidth"), 0, sum(children, "preferredHeight") + spaces, sum(children, "maxHeight") + spaces, "scroll");
}
function maxAxes(children: readonly IntrinsicSize[], input: LayoutIntrinsicMeasureInput, overflow: IntrinsicOverflow): IntrinsicSize {
  return constrained(input, max(children, "minWidth"), max(children, "preferredWidth"), max(children, "maxWidth"), max(children, "minHeight"), max(children, "preferredHeight"), max(children, "maxHeight"), overflow);
}
function gridAxes(children: readonly IntrinsicSize[], gap: number, input: LayoutIntrinsicMeasureInput, asymmetric: boolean): IntrinsicSize {
  const outer = widthEnvelope(input.width, 0).outer;
  const minimumTrack = max(children, "minWidth");
  const fittingColumns = Math.max(1, Math.floor((outer + gap) / (minimumTrack + gap)));
  const columns = Math.min(children.length, 12, asymmetric ? 2 : 12, fittingColumns);
  const rows: IntrinsicSize[][] = [];
  children.forEach((child, index) => { const row = rows[Math.floor(index / columns)]; if (row === undefined) rows.push([child]); else row.push(child); });
  const rowHeight = (field: HeightField): number => rows.reduce((total, row) => total + max(row, field), 0) + gap * (rows.length - 1);
  const trackWidth = (field: WidthField): number => Math.max(...rows.map((row) => sum(row, field) + gap * (row.length - 1)));
  return constrained(input, minimumTrack, trackWidth("preferredWidth"), trackWidth("maxWidth"), rowHeight("minHeight"), rowHeight("preferredHeight"), rowHeight("maxHeight"), "wrap");
}
function dockAxes(children: readonly IntrinsicSize[], gap: number, input: LayoutIntrinsicMeasureInput): IntrinsicSize {
  if (children.length < 2 || children.length > 5) throw new Error("INTRINSIC_MEASURE_LAYOUT_CHILD_COUNT");
  const center = children[children.length - 1]!;
  const north = children.length >= 2 ? children[0] : undefined;
  const west = children.length >= 3 ? children[1] : undefined;
  const east = children.length >= 4 ? children[2] : undefined;
  const south = children.length === 5 ? children[3] : undefined;
  const middle = [west, center, east].filter((child): child is IntrinsicSize => child !== undefined);
  const width = (field: WidthField): number => Math.max(north === undefined ? 0 : north[field], south === undefined ? 0 : south[field], sum(middle, field) + gap * (middle.length - 1));
  const height = (field: HeightField): number => (north === undefined ? 0 : north[field]) + max(middle, field) + (south === undefined ? 0 : south[field]) + gap * ([north, south].filter((child) => child !== undefined).length);
  return constrained(input, width("minWidth"), width("preferredWidth"), width("maxWidth"), height("minHeight"), height("preferredHeight"), height("maxHeight"), "wrap");
}

function measureModule(input: RegisteredModuleIntrinsicMeasureInput): IntrinsicSize {
  assertDensity(input.density, input.node.intent.density);
  if (!validModuleWidth(input.width.available) || !validModuleWidth(input.width.min) || !validModuleWidth(input.width.max)) throw new Error("INTRINSIC_MEASURE_MODULE_WIDTH_INVALID");
  const contract = input.layoutContract;
  if (!Number.isInteger(contract.minColumnSpan) || !Number.isInteger(contract.maxColumnSpan) || contract.minColumnSpan < 1 || contract.maxColumnSpan > 12 || contract.minColumnSpan > contract.maxColumnSpan) throw new Error("INTRINSIC_MEASURE_MODULE_LAYOUT_INVALID");
  const height = contract.height;
  const keys = ["compact", "small", "medium", "large", "full"] as const;
  if (!Number.isInteger(height.min) || !Number.isInteger(height.max) || height.min <= 0 || height.max < height.min || keys.some((key) => !Number.isInteger(height.preferred[key]) || height.preferred[key] < height.min || height.preferred[key] > height.max)) throw new Error("INTRINSIC_MEASURE_MODULE_LAYOUT_INVALID");
  const columnWidth = input.columnWidth === undefined ? 80 : input.columnWidth;
  if (!Number.isFinite(columnWidth) || columnWidth < 1 || columnWidth > MAX_DIMENSION) throw new Error("INTRINSIC_MEASURE_MODULE_LAYOUT_INVALID");
  const contractMinimum = contract.minColumnSpan * columnWidth;
  const contractMaximum = contract.maxColumnSpan * columnWidth;
  if (!positiveFinite(contractMinimum) || !positiveFinite(contractMaximum) || contractMinimum > MAX_DIMENSION || contractMaximum > MAX_DIMENSION || contractMinimum > contractMaximum) throw new Error("INTRINSIC_MEASURE_MODULE_LAYOUT_INVALID");
  const available = nonnegative(input.width.available);
  const declaredMaximum = input.width.max === undefined ? available : nonnegative(input.width.max);
  const constraintMaximum = Math.min(available, declaredMaximum);
  const requestedMinimum = nonnegative(input.width.min);
  const minimum = Math.max(contractMinimum, requestedMinimum);
  const maximum = Math.min(contractMaximum, constraintMaximum);
  if (minimum > maximum) throw new Error("INTRINSIC_MEASURE_MODULE_WIDTH_UNSATISFIABLE");
  const preferredWidth = clamp(available, minimum, maximum);
  const key = input.density === "compact" ? "compact" : input.density === "spacious" ? "large" : "medium";
  return size(minimum, preferredWidth, maximum, height.min, height.preferred[key], height.max, "clip");
}

interface Metrics { readonly fontSize: number; readonly lineHeight: number; readonly letterSpacing: number; readonly horizontalInset: number; readonly verticalInset: number; }
interface WidthEnvelope { readonly min: number; readonly outer: number; }
type WidthField = "minWidth" | "preferredWidth" | "maxWidth";
type HeightField = "minHeight" | "preferredHeight" | "maxHeight";
function metricsFor(font: IntrinsicFontMetrics): Metrics {
  const fontSize = positiveFinite(font.fontSize) ? Math.min(font.fontSize, 200) : 16;
  const multiplier = positiveFinite(font.lineHeight) ? Math.min(font.lineHeight, 4) : 1.5;
  return { fontSize, lineHeight: fontSize * multiplier, letterSpacing: signed(font.letterSpacing), horizontalInset: 2 * (nonnegative(font.padding?.horizontal) + nonnegative(font.border?.horizontal)), verticalInset: 2 * (nonnegative(font.padding?.vertical) + nonnegative(font.border?.vertical)) };
}
function widthEnvelope(width: IntrinsicWidthConstraint, intrinsicMinimum: number): WidthEnvelope {
  const available = nonnegative(width.available);
  const declaredMaximum = width.max === undefined ? available : nonnegative(width.max);
  const minimum = Math.max(nonnegative(intrinsicMinimum), nonnegative(width.min));
  return { min: minimum, outer: Math.max(minimum, Math.min(available, declaredMaximum)) };
}
function textMeasure(value: ResolvedSemanticValue, metrics: Metrics): number {
  const glyphs = [...semanticText(value)];
  return glyphs.reduce((total, glyph, index) => total + glyphWidth(glyph, metrics.fontSize) + (index === 0 ? 0 : metrics.letterSpacing), 0);
}
function semanticText(value: ResolvedSemanticValue): string {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value === null ? "" : String(value);
  return value.kind === "list" ? value.items.map(semanticText).join(" ") : value.fields.map((field) => `${field.name} ${semanticText(field.value)}`).join(" ");
}
function glyphWidth(glyph: string, fontSize: number): number {
  if (/^[\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF\uFF01-\uFF60\uFFE0-\uFFE6]$/u.test(glyph)) return fontSize;
  return /^\p{ASCII}$/u.test(glyph) ? (glyph === " " ? fontSize * 0.28 : fontSize * 0.56) : fontSize;
}
function resolveSemanticValue(value: SemanticValue): ResolvedSemanticValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value.kind === "repeater-field") throw new Error("INTRINSIC_MEASURE_UNRESOLVED_REPEATER_FIELD");
  if (value.kind === "list") return Object.freeze({ kind: "list", items: Object.freeze(value.items.map(resolveSemanticValue)) });
  return Object.freeze({ kind: "record", fields: Object.freeze(value.fields.map((field) => Object.freeze({ name: field.name, value: resolveSemanticValue(field.value) }))) });
}
function assertProfile(capabilityId: string, profileId: string): void { if ((capabilityId === "datagrid" ? "easyui.1" : capabilityId) !== profileId) throw new Error("INTRINSIC_MEASURE_PROFILE_CAPABILITY_MISMATCH"); }
function assertDensity(input: IntrinsicDensity, node: IntrinsicDensity): void { if (input !== node) throw new Error("INTRINSIC_MEASURE_DENSITY_MISMATCH"); }
function assertControlFamily(family: ControlIntrinsicMeasureInput["family"], capabilityId: string): void {
  const expected = capabilityId === "easyui.1" || capabilityId === "datagrid" ? "datagrid" : capabilityId === "image" ? "image" : "generic";
  if (family !== expected) throw new Error("INTRINSIC_MEASURE_CONTROL_FAMILY_MISMATCH");
}
function normalizeChild(child: IntrinsicSize): IntrinsicSize { return size(child.minWidth, child.preferredWidth, child.maxWidth, child.minHeight, child.preferredHeight, child.maxHeight, child.overflow); }
function constrained(input: LayoutIntrinsicMeasureInput, minWidth: number, preferredWidth: number, maxWidth: number, minHeight: number, preferredHeight: number, maxHeight: number, overflow: IntrinsicOverflow): IntrinsicSize {
  const envelope = widthEnvelope(input.width, minWidth);
  return size(envelope.min, clamp(preferredWidth, envelope.min, envelope.outer), Math.min(envelope.outer, Math.max(envelope.min, maxWidth)), minHeight, preferredHeight, maxHeight, overflow);
}
function size(minWidth: number, preferredWidth: number, maxWidth: number, minHeight: number, preferredHeight: number, maxHeight: number, overflow: IntrinsicOverflow): IntrinsicSize {
  const minW = dimension(minWidth, 0); const maxW = Math.max(minW, dimension(maxWidth, minW)); const minH = dimension(minHeight, 0); const maxH = Math.max(minH, dimension(maxHeight, minH));
  return Object.freeze({ minWidth: round(minW), preferredWidth: round(clamp(dimension(preferredWidth, minW), minW, maxW)), maxWidth: round(maxW), minHeight: round(minH), preferredHeight: round(clamp(dimension(preferredHeight, minH), minH, maxH)), maxHeight: round(maxH), overflow });
}
function sum<T extends WidthField | HeightField>(children: readonly IntrinsicSize[], field: T): number { return children.reduce((total, child) => total + child[field], 0); }
function max<T extends WidthField | HeightField>(children: readonly IntrinsicSize[], field: T): number { return Math.max(...children.map((child) => child[field])); }
function positiveFinite(value: number): boolean { return Number.isFinite(value) && value > 0; }
function boundedPositive(value: number | undefined, maximum: number): boolean { return value === undefined || (positiveFinite(value) && value <= maximum); }
function optionalPositiveInteger(value: number | undefined): boolean { return value === undefined || (Number.isInteger(value) && value > 0); }
function validModuleWidth(value: number | undefined): boolean { return value === undefined || (Number.isFinite(value) && value >= 0); }
function nonnegative(value: number | undefined): number { return value === undefined || !Number.isFinite(value) || value < 0 ? 0 : Math.min(value, MAX_DIMENSION); }
function dimension(value: number, fallback: number): number { return Number.isFinite(value) && value >= 0 ? Math.min(value, MAX_DIMENSION) : fallback; }
function signed(value: number | undefined): number { return value === undefined || !Number.isFinite(value) ? 0 : clamp(value, -100, 100); }
function clamp(value: number, min: number, max: number): number { return Math.min(Math.max(value, min), max); }
function round(value: number): number { return Math.round(value * 100) / 100; }
function isActionControl(capabilityId: string): boolean { return capabilityId === "button" || capabilityId === "easyui.2"; }
