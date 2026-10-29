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
 * 模型编写的 ModulePlan 中绝不会出现可选的、仅供求解器使用的事实。修订期间会把先前布局用作锚点参考。
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

/** 整数商/余数边界避免在非除法网格中丢失像素。 */
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
  // 原生工具栏模块需要一个 48 像素可用的行；64 像素的壳外边框 chrome 剩下那个，正好是 8 像素的顶部/底部填充。
  const toolbarHeight = 64;
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
      // 即使一个不可放置的请求也会消耗一个确定的行脚印。
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
    // 一个被拒绝的模块仍然拥有其请求的槽位。稍后的兄弟必须不能填充它，否则修复会改变无关的固定布局几何。
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

  // 第一个计算的差异是修订的影响范围。只有有效的未更改前缀才能借用先前的对象；稍后的值总是新鲜的确定性解决方案，锚点从不覆盖约束。
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
 * 使用整数算术解决模块放置问题。它从不全局缩放页面：垂直流增长，而固定画布报告可修复的问题。
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
