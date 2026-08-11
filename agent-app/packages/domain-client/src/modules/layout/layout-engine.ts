import type { ModulePlanModule, ModulePlanPage } from "@kf/contracts";
import type { ModuleDefinition } from "../types.js";
import type { ModuleRegistry } from "../module-registry.js";
import type { PageLayoutIssue } from "./layout-errors.js";

const DEFAULT_CANVAS_WIDTH = 1440;
const DEFAULT_CANVAS_HEIGHT = 900;
const DEFAULT_PADDING = 48;
const DEFAULT_MODULE_GAP = 24;
const GRID_COLUMNS = 12;

const DEFAULT_HEIGHTS = {
  compact: 120,
  small: 200,
  medium: 320,
  large: 420,
  full: 520,
} as const;

export interface ModuleBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface PageLayoutResult {
  readonly pageId: string;
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
  const min = height?.min ?? 80;
  const preferred = height?.preferred[candidate.module.placement.preferredHeight]
    ?? DEFAULT_HEIGHTS[candidate.module.placement.preferredHeight];
  const max = height?.max ?? 1200;
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

function gridWidth(region: RegionBounds, span: number): number | undefined {
  const available = region.width - ((GRID_COLUMNS - 1) * region.gap);
  if (available < GRID_COLUMNS || span < 1 || span > GRID_COLUMNS) return undefined;
  const unit = Math.floor(available / GRID_COLUMNS);
  return (unit * span) + (region.gap * (span - 1));
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
  let x = content.x;
  let y = content.y;
  let rowHeight = 0;
  for (const candidate of candidates) {
    const requestedHeight = resolveHeight(candidate);
    const width = gridWidth(content, candidate.module.placement.columnSpan);
    if (requestedHeight === undefined || width === undefined || width > content.width) {
      issues.push(issue("MODULE_TOO_SMALL", candidate.module.id));
      continue;
    }
    const height = region.chrome ? Math.min(requestedHeight, content.height) : requestedHeight;
    if (height < (candidate.definition.layout.height?.min ?? 80)) {
      issues.push(issue("MODULE_TOO_SMALL", candidate.module.id));
      continue;
    }
    if (x + width > content.x + content.width) {
      x = content.x;
      y += rowHeight + content.gap;
      rowHeight = 0;
    }
    if (y + height > content.y + content.height) {
      const code = requestedHeight > content.height ? "MODULE_TOO_SMALL" : "LAYOUT_OVERFLOW";
      issues.push(issue(code, candidate.module.id));
      continue;
    }
    bounds[candidate.module.id] = Object.freeze({ x, y, width, height });
    x += width + content.gap;
    rowHeight = Math.max(rowHeight, height);
  }
}

function solveVerticalFlow(
  candidates: readonly Candidate[],
  width: number,
  padding: number,
  gap: number,
  bounds: Record<string, ModuleBounds>,
  issues: PageLayoutIssue[],
): number {
  const content: RegionBounds = { x: padding, y: padding, width: width - (padding * 2), height: Number.MAX_SAFE_INTEGER, paddingX: 0, paddingY: 0, gap };
  let y = content.y;
  for (const candidate of candidates) {
    const height = resolveHeight(candidate);
    const moduleWidth = gridWidth(content, candidate.module.placement.columnSpan);
    if (height === undefined || moduleWidth === undefined || moduleWidth > content.width) {
      issues.push(issue("MODULE_TOO_SMALL", candidate.module.id));
      continue;
    }
    bounds[candidate.module.id] = Object.freeze({ x: content.x, y, width: moduleWidth, height });
    y += height + gap;
  }
  return Math.max(DEFAULT_CANVAS_HEIGHT, y - gap + padding);
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
    if (!definition.layout.regions.includes(module.placement.region)) {
      issues.push(issue("INVALID_REGION", module.id));
      continue;
    }
    candidates.push({ module, definition });
  }

  const ordered = sortCandidates(candidates);
  const height = page.mode === "vertical-flow"
    ? solveVerticalFlow(ordered, width, padding, gap, bounds, issues)
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

  // Reuse exact prior bounds for the unchanged prefix/siblings. This keeps
  // revision identity stable without moving unaffected modules to repair a later one.
  if (page.previousLayout?.pageId === page.id) {
    for (const [moduleId, current] of Object.entries(bounds)) {
      const previous = page.previousLayout.boundsByModuleId[moduleId];
      if (previous !== undefined
        && previous.x === current.x
        && previous.y === current.y
        && previous.width === current.width
        && previous.height === current.height) {
        bounds[moduleId] = previous;
      }
    }
  }

  return Object.freeze({
    pageId: page.id,
    width,
    height,
    boundsByModuleId: Object.freeze(bounds),
    issues: Object.freeze(issues),
  });
}
