import type { ModulePlanModule, ModulePlanPage } from "@kf/contracts";
import type { ModuleDefinition } from "../types.js";
import type { ModuleRegistry } from "../module-registry.js";
import type { PageLayoutIssue } from "./layout-errors.js";

const DEFAULT_CANVAS_WIDTH = 1440;
const DEFAULT_CANVAS_HEIGHT = 900;
const DEFAULT_PADDING = 48;
const DEFAULT_MODULE_GAP = 24;
const GRID_COLUMNS = 12;

export interface ModuleBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PageLayoutResult {
  readonly pageId: string;
  readonly mode: PageLayoutInput["mode"];
  readonly width: number;
  readonly height: number;
  readonly boundsByModuleId: Readonly<Record<string, ModuleBounds>>;
  readonly issues: readonly PageLayoutIssue[];
}

/**
 * Optional solver-only facts never appear in a model-authored ModulePlan.
 * The previous layout is used as an anchor reference during a revision.
 */
export interface PageLayoutInput extends Pick<ModulePlanPage, "id" | "mode" | "modules"> {
  readonly canvasWidth?: number;
  readonly canvasHeight?: number;
  readonly padding?: number;
  readonly moduleGap?: number;
  readonly previousLayout?: PageLayoutResult;
}

interface RegionBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly paddingX: number;
  readonly paddingY: number;
  readonly gap: number;
  readonly chrome?: true;
}

interface Candidate {
  readonly module: ModulePlanModule;
  readonly definition: ModuleDefinition;
  readonly validDefinitionRegion: boolean;
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const leftPoint = leftPoints[index]!.codePointAt(0)!;
    const rightPoint = rightPoints[index]!.codePointAt(0)!;
    if (leftPoint !== rightPoint) return leftPoint < rightPoint ? -1 : 1;
  }
  return leftPoints.length === rightPoints.length ? 0 : leftPoints.length < rightPoints.length ? -1 : 1;
}

function isPositiveInteger(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value > 0;
}

function clampPositiveInteger(value: number | undefined, fallback: number): number {
  return isPositiveInteger(value) ? value : fallback;
}

function resolveHeight(candidate: Candidate): number | undefined {
  const { height } = candidate.definition.layout;
  const min = height.min;
  const preferred = height.preferred[candidate.module.placement.preferredHeight];
  const max = height.max;
  if (!Number.isInteger(min) || !Number.isInteger(preferred) || !Number.isInteger(max) || min <= 0 || max < min) {
    return undefined;
  }
  return Math.max(min, Math.min(preferred, max));
}

function regionContent(region: RegionBounds): RegionBounds {
  return {
    ...region,
    x: region.x + region.paddingX,
    y: region.y + region.paddingY,
    width: region.width - (region.paddingX * 2),
    height: region.height - (region.paddingY * 2),
  };
}

interface GridSlot {
  readonly x: number;
  readonly width: number;
}

/** Integer quotient/remainder boundaries avoid a lost pixel in non-divisible grids. */
function gridSlot(region: RegionBounds, column: number, span: number): GridSlot | undefined {
  const distributedWidth = region.width - ((GRID_COLUMNS - 1) * region.gap);
  if (distributedWidth < GRID_COLUMNS || column < 0 || span < 1 || column + span > GRID_COLUMNS) return undefined;
  const start = Math.floor((distributedWidth * column) / GRID_COLUMNS);
  const end = Math.floor((distributedWidth * (column + span)) / GRID_COLUMNS);
  return {
    x: region.x + start + (region.gap * column),
    width: (end - start) + (region.gap * (span - 1)),
  };
}

function alignedBounds(candidate: Candidate, region: RegionBounds, column: number, slot: GridSlot, y: number, height: number): ModuleBounds | undefined {
  const naturalSpan = Math.min(candidate.module.placement.columnSpan, candidate.definition.layout.minColumnSpan);
  const natural = gridSlot(region, column, naturalSpan);
  if (natural === undefined) return undefined;
  if (candidate.module.placement.alignment === "stretch") {
    return Object.freeze({ x: slot.x, y, width: slot.width, height });
  }
  const offset = candidate.module.placement.alignment === "center"
    ? Math.floor((slot.width - natural.width) / 2)
    : candidate.module.placement.alignment === "end" ? slot.width - natural.width : 0;
  return Object.freeze({ x: slot.x + offset, y, width: natural.width, height });
}

function issue(code: PageLayoutIssue["code"], moduleId: string): PageLayoutIssue {
  return Object.freeze({ code, moduleId });
}

function sortCandidates(candidates: readonly Candidate[]): Candidate[] {
  return [...candidates].sort((left, right) => {
    const region = compareCodePoints(left.module.placement.region, right.module.placement.region);
    if (region !== 0) return region;
    if (left.module.placement.order !== right.module.placement.order) {
      return left.module.placement.order - right.module.placement.order;
    }
    return compareCodePoints(left.module.id, right.module.id);
  });
}

function fixedRegionBounds(mode: PageLayoutInput["mode"], width: number, height: number, padding: number, gap: number): Record<string, RegionBounds> {
  if (mode === "dashboard-grid") {
    return {
      main: { x: 0, y: 0, width, height, paddingX: padding, paddingY: padding, gap },
    };
  }

  const headerHeight = 64;
  const sidebarWidth = 240;
  const toolbarHeight = 48;
  const footerHeight = 48;
  const bodyBottom = height - footerHeight;
  const mainX = sidebarWidth + gap;
  return {
    header: { x: 0, y: 0, width, height: headerHeight, paddingX: 24, paddingY: 12, gap: 12, chrome: true },
    sidebar: { x: 0, y: headerHeight, width: sidebarWidth, height: bodyBottom - headerHeight, paddingX: 24, paddingY: 24, gap: 12, chrome: true },
    toolbar: { x: mainX, y: headerHeight, width: width - mainX, height: toolbarHeight, paddingX: 24, paddingY: 8, gap: 12, chrome: true },
    main: { x: mainX, y: headerHeight + toolbarHeight, width: width - mainX, height: bodyBottom - headerHeight - toolbarHeight, paddingX: 24, paddingY: 12, gap },
    footer: { x: 0, y: bodyBottom, width, height: footerHeight, paddingX: 24, paddingY: 12, gap: 12, chrome: true },
  };
}

function addFixedRegion(
  candidates: readonly Candidate[],
  region: RegionBounds,
  bounds: Record<string, ModuleBounds>,
  issues: PageLayoutIssue[],
): void {
  const content = regionContent(region);
  let y = content.y;
  let rowHeight = 0;
  let column = 0;
  for (const candidate of candidates) {
    const requestedHeight = resolveHeight(candidate);
    let slot = gridSlot(content, column, candidate.module.placement.columnSpan);
    if (slot === undefined) {
      column = 0;
      y += rowHeight + content.gap;
      rowHeight = 0;
      slot = gridSlot(content, column, candidate.module.placement.columnSpan);
    }
    if (requestedHeight === undefined || slot === undefined) {
      issues.push(issue("MODULE_TOO_SMALL", candidate.module.id));
      // Even an unplaceable request consumes a deterministic row footprint.
      column = GRID_COLUMNS;
      rowHeight = Math.max(rowHeight, requestedHeight ?? candidate.definition.layout.height.min);
      continue;
    }
    const height = region.chrome ? Math.min(requestedHeight, content.height) : requestedHeight;
    const consumeSlot = (): void => {
      column += candidate.module.placement.columnSpan;
      rowHeight = Math.max(rowHeight, height);
    };
    if (candidate.module.placement.columnSpan < candidate.definition.layout.minColumnSpan) {
      issues.push(issue("MODULE_TOO_SMALL", candidate.module.id));
      consumeSlot();
      continue;
    }
    if (height < candidate.definition.layout.height.min) {
      issues.push(issue("MODULE_TOO_SMALL", candidate.module.id));
      consumeSlot();
      continue;
    }
    const candidateBounds = alignedBounds(candidate, content, column, slot, y, height);
    // A rejected module still owns its requested slot. Later siblings must not
    // backfill it, otherwise a repair changes unrelated fixed-layout geometry.
    if (!candidate.validDefinitionRegion || candidateBounds === undefined) {
      issues.push(issue(!candidate.validDefinitionRegion ? "INVALID_REGION" : "MODULE_TOO_SMALL", candidate.module.id));
      consumeSlot();
      continue;
    }
    if (y + height > content.y + content.height) {
      const code = requestedHeight > content.height ? "MODULE_TOO_SMALL" : "LAYOUT_OVERFLOW";
      issues.push(issue(code, candidate.module.id));
      consumeSlot();
      continue;
    }
    bounds[candidate.module.id] = candidateBounds;
    consumeSlot();
  }
}

function solveVerticalFlow(
  candidates: readonly Candidate[],
  width: number,
  padding: number,
  gap: number,
  minimumPageHeight: number,
  bounds: Record<string, ModuleBounds>,
  issues: PageLayoutIssue[],
): number {
  const content: RegionBounds = { x: padding, y: padding, width: width - (padding * 2), height: Number.MAX_SAFE_INTEGER, paddingX: 0, paddingY: 0, gap };
  let y = content.y;
  for (const candidate of candidates) {
    const height = resolveHeight(candidate);
    const slot = gridSlot(content, 0, candidate.module.placement.columnSpan);
    if (height === undefined || slot === undefined || candidate.module.placement.columnSpan < candidate.definition.layout.minColumnSpan) {
      issues.push(issue("MODULE_TOO_SMALL", candidate.module.id));
      continue;
    }
    const candidateBounds = alignedBounds(candidate, content, 0, slot, y, height);
    if (!candidate.validDefinitionRegion || candidateBounds === undefined) {
      issues.push(issue(!candidate.validDefinitionRegion ? "INVALID_REGION" : "MODULE_TOO_SMALL", candidate.module.id));
      y += height + gap;
      continue;
    }
    bounds[candidate.module.id] = candidateBounds;
    y += height + gap;
  }
  return Math.max(minimumPageHeight, y - gap + padding);
}

function isIntegerBounds(bounds: ModuleBounds): boolean {
  return [bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isInteger)
    && bounds.width > 0 && bounds.height > 0;
}

function overlaps(left: ModuleBounds, right: ModuleBounds): boolean {
  return left.x < right.x + right.width && left.x + left.width > right.x
    && left.y < right.y + right.height && left.y + left.height > right.y;
}

function reusableAnchors(
  page: PageLayoutInput,
  ordered: readonly Candidate[],
  current: Record<string, ModuleBounds>,
): void {
  const previous = page.previousLayout;
  if (previous?.pageId !== page.id || previous.mode !== page.mode || previous.width <= 0 || previous.height <= 0) return;
  const prior = ordered
    .map((candidate) => ({ candidate, bounds: previous.boundsByModuleId[candidate.module.id] }))
    .filter((entry): entry is { candidate: Candidate; bounds: ModuleBounds } => entry.bounds !== undefined);
  if (prior.some(({ bounds }) => !isIntegerBounds(bounds)) || prior.some((entry, index) => prior.slice(index + 1).some((other) => overlaps(entry.bounds, other.bounds)))) return;

  // The first calculated difference is the revision's affected range. Only a
  // valid unchanged prefix may borrow prior objects; later values are always
  // the fresh deterministic solution and anchors never override constraints.
  let affected = false;
  for (const candidate of ordered) {
    const next = current[candidate.module.id];
    const old = previous.boundsByModuleId[candidate.module.id];
    if (next === undefined || old === undefined
      || old.x !== next.x || old.y !== next.y || old.width !== next.width || old.height !== next.height) {
      affected = true;
      continue;
    }
    if (!affected) current[candidate.module.id] = old;
  }
}

/**
 * Solves module placement using only integer arithmetic. It never rescales a
 * page globally: vertical flow grows, while fixed canvases report repairable issues.
 */
export function solvePageLayout(page: PageLayoutInput, registry: ModuleRegistry): PageLayoutResult {
  const width = clampPositiveInteger(page.canvasWidth, DEFAULT_CANVAS_WIDTH);
  const fixedHeight = clampPositiveInteger(page.canvasHeight, DEFAULT_CANVAS_HEIGHT);
  const padding = clampPositiveInteger(page.padding, DEFAULT_PADDING);
  const gap = clampPositiveInteger(page.moduleGap, DEFAULT_MODULE_GAP);
  const bounds: Record<string, ModuleBounds> = {};
  const issues: PageLayoutIssue[] = [];
  const candidates: Candidate[] = [];

  for (const module of page.modules) {
    let definition: ModuleDefinition;
    try {
      definition = registry.require(module.kind, module.templateVersion);
    } catch {
      issues.push(issue("INVALID_REGION", module.id));
      continue;
    }
    candidates.push({ module, definition, validDefinitionRegion: definition.layout.regions.includes(module.placement.region) });
  }

  const ordered = sortCandidates(candidates);
  const height = page.mode === "vertical-flow"
    ? solveVerticalFlow(ordered, width, padding, gap, fixedHeight, bounds, issues)
    : fixedHeight;
  if (page.mode !== "vertical-flow") {
    const regions = fixedRegionBounds(page.mode, width, fixedHeight, padding, gap);
    for (const [regionName, region] of Object.entries(regions)) {
      addFixedRegion(ordered.filter((candidate) => candidate.module.placement.region === regionName), region, bounds, issues);
    }
    for (const candidate of ordered) {
      if (!(candidate.module.placement.region in regions)) {
        issues.push(issue("INVALID_REGION", candidate.module.id));
      }
    }
  }

  reusableAnchors(page, ordered, bounds);

  return Object.freeze({
    pageId: page.id,
    mode: page.mode,
    width,
    height,
    boundsByModuleId: Object.freeze(bounds),
    issues: Object.freeze(issues),
  });
}
