import type { ModulePlan, ModulePlanModule, ResolvedAsset, UIComponentSpec, UIImplementationSpec } from "@kf/contracts";
import { isDeepStrictEqual } from "node:util";

export interface UnexpectedModuleChange {
  readonly moduleId: string;
  readonly pageId: string;
  readonly reason: "UNTOUCHED_MODULE_IMPLEMENTATION_CHANGED" | "UNTOUCHED_MODULE_IMPLEMENTATION_MISSING" | "LAYOUT_AFFECTED_MODULE_NON_GEOMETRY_CHANGED" | "PRESERVED_LEGACY_IMPLEMENTATION_CHANGED";
}

export interface ModulePlanDiff {
  /** Modules whose declaration changed, was added, or was removed. */
  readonly changedModules: readonly string[];
  /** Modules with identical declarations in both revisions. */
  readonly unchangedModules: readonly string[];
  /** Untouched module geometry may change only inside this deterministic layout interval. */
  readonly layoutAffectedModules: readonly string[];
  readonly unexpectedChanges: readonly UnexpectedModuleChange[];
}

export interface DiffModulePlansInput {
  readonly previousPlan: ModulePlan;
  readonly plan: ModulePlan;
  readonly previousImplementation: UIImplementationSpec;
  readonly implementation: UIImplementationSpec;
  readonly previousAssetsById?: Readonly<Record<string, ResolvedAsset>>;
  readonly assetsById?: Readonly<Record<string, ResolvedAsset>>;
  /** Trusted registry compiler identities keyed by pageId + NUL + moduleId. */
  readonly previousDefinitionIdentities?: Readonly<Record<string, string>>;
  readonly definitionIdentities?: Readonly<Record<string, string>>;
  /** Trusted generated seed entities may be intentionally removed during import normalization. */
  readonly expectedLegacyRemovedIds?: readonly string[];
}

/**
 * Raised before a partial revision can be handed to the UI/KF compiler. The
 * diff is intentionally data-only so callers can persist an actionable repair
 * reason without exposing native implementation details to a model.
 */
export class UnexpectedModuleChangeError extends Error {
  readonly diff: ModulePlanDiff;

  constructor(diff: ModulePlanDiff) {
    super(`UNEXPECTED_MODULE_CHANGE: ${diff.unexpectedChanges.map((change) => `${change.pageId}/${change.moduleId}:${change.reason}`).join(", ")}`);
    this.name = "UnexpectedModuleChangeError";
    this.diff = diff;
  }
}

export function diffModulePlans(input: DiffModulePlansInput): ModulePlanDiff {
  assertSafeJson(input);
  const previous = indexModules(input.previousPlan);
  const current = indexModules(input.plan);
  const changed = new Set<string>();
  const unchanged = new Set<string>();

  for (const [key, module] of current) {
    const prior = previous.get(key);
    if (prior === undefined || !isDeepStrictEqual(prior, module)) changed.add(module.id);
    else unchanged.add(module.id);
  }
  for (const [key, module] of previous) if (!current.has(key)) changed.add(module.id);

  for (const [key, module] of current) {
    const priorIdentity = input.previousDefinitionIdentities?.[key];
    const identity = input.definitionIdentities?.[key];
    if (priorIdentity !== undefined && identity !== undefined && priorIdentity !== identity) changed.add(module.id);
  }

  const previousGroups = pageComponentGroups(input.previousImplementation);
  const currentGroups = pageComponentGroups(input.implementation);
  if (!isDeepStrictEqual(input.previousPlan.theme, input.plan.theme)) {
    for (const [pageId, modules] of previousGroups) for (const [moduleId, before] of modules) {
      const after = currentGroups.get(pageId)?.get(moduleId);
      if (after !== undefined && JSON.stringify(before.map((component) => component.style)) !== JSON.stringify(after.map((component) => component.style))) changed.add(moduleId);
    }
  }
  if (input.previousAssetsById !== undefined || input.assetsById !== undefined) for (const [key, module] of current) {
    const prior = previous.get(key);
    if (prior?.assetId !== undefined && prior.assetId === module.assetId && !isDeepStrictEqual(input.previousAssetsById?.[module.assetId], input.assetsById?.[module.assetId])) changed.add(module.id);
  }

  for (const id of changed) unchanged.delete(id);

  const layoutAffected = layoutAffectedModuleIds(input.previousPlan, input.plan);
  const protectedModules = new Set([...unchanged].filter((id) => !layoutAffected.includes(id)));
  const unexpected = [
    ...unexpectedModuleImplementationChanges(input.previousImplementation, input.implementation, protectedModules),
    ...unexpectedLayoutFieldChanges(input.previousImplementation, input.implementation, new Set(layoutAffected)),
    ...unexpectedLegacyImplementationChanges(input.previousImplementation, input.implementation, new Set(input.expectedLegacyRemovedIds ?? [])),
  ].sort(compareUnexpected);

  return Object.freeze({
    changedModules: freezeSorted(changed),
    unchangedModules: freezeSorted(unchanged),
    layoutAffectedModules: Object.freeze(layoutAffected),
    unexpectedChanges: Object.freeze(unexpected),
  });
}

function unexpectedLayoutFieldChanges(previous: UIImplementationSpec, current: UIImplementationSpec, affected: ReadonlySet<string>): UnexpectedModuleChange[] {
  const output: UnexpectedModuleChange[] = [];
  const before = pageComponentGroups(previous); const after = pageComponentGroups(current);
  for (const [pageId, groups] of before) for (const [moduleId, oldComponents] of groups) {
    if (!affected.has(moduleId)) continue;
    const newComponents = after.get(pageId)?.get(moduleId);
    if (newComponents === undefined || oldComponents.length !== newComponents.length || oldComponents.some((component, index) => !sameExceptGeometry(component, newComponents[index]!))) output.push(Object.freeze({ pageId, moduleId, reason: "LAYOUT_AFFECTED_MODULE_NON_GEOMETRY_CHANGED" }));
  }
  return output;
}

function sameExceptGeometry(left: UIComponentSpec, right: UIComponentSpec): boolean {
  return left.id === right.id && left.role === right.role && left.sourceModuleId === right.sourceModuleId
    && left.capabilityId === right.capabilityId && left.critical === right.critical
    && left.fallbackCapabilityId === right.fallbackCapabilityId && left.content === right.content
    && isDeepStrictEqual(left.properties, right.properties) && isDeepStrictEqual(left.style, right.style);
}

function indexModules(plan: ModulePlan): ReadonlyMap<string, ModulePlanModule> {
  const output = new Map<string, ModulePlanModule>();
  for (const page of plan.pages) for (const module of page.modules) output.set(`${page.id}\u0000${module.id}`, module);
  return output;
}

function layoutAffectedModuleIds(previousPlan: ModulePlan, plan: ModulePlan): string[] {
  const output: string[] = [];
  const add = (id: string): void => { if (!output.includes(id)) output.push(id); };
  const previousPages = new Map(previousPlan.pages.map((page) => [page.id, page]));
  const currentPages = new Map(plan.pages.map((page) => [page.id, page]));
  for (const [pageId, page] of currentPages) {
    const previous = previousPages.get(pageId);
    if (previous === undefined || previous.mode !== page.mode) {
      page.modules.forEach((module) => add(module.id));
      continue;
    }
    const prior = ordered(previous.modules);
    const next = ordered(page.modules);
    const first = firstLayoutDifference(prior, next);
    if (first === undefined) continue;
    next.slice(first).forEach((module) => add(module.id));
  }
  return output;
}

function firstLayoutDifference(previous: readonly ModulePlanModule[], next: readonly ModulePlanModule[]): number | undefined {
  const length = Math.min(previous.length, next.length);
  for (let index = 0; index < length; index += 1) {
    const prior = previous[index]!;
    const current = next[index]!;
    if (prior.id !== current.id || !isDeepStrictEqual(prior.placement, current.placement)) return index;
  }
  return previous.length === next.length ? undefined : length;
}

function ordered(modules: readonly ModulePlanModule[]): ModulePlanModule[] {
  return [...modules].sort((left, right) => compareCodePoints(left.placement.region, right.placement.region)
    || left.placement.order - right.placement.order || compareCodePoints(left.id, right.id));
}

function unexpectedModuleImplementationChanges(
  previous: UIImplementationSpec,
  current: UIImplementationSpec,
  protectedModules: ReadonlySet<string>,
): UnexpectedModuleChange[] {
  const output: UnexpectedModuleChange[] = [];
  const previousByPage = pageComponentGroups(previous);
  const currentByPage = pageComponentGroups(current);
  for (const [pageId, modules] of previousByPage) {
    const currentModules = currentByPage.get(pageId);
    for (const [moduleId, previousComponents] of modules) {
      if (!protectedModules.has(moduleId)) continue;
      const currentComponents = currentModules?.get(moduleId);
      if (currentComponents === undefined) {
        output.push(Object.freeze({ pageId, moduleId, reason: "UNTOUCHED_MODULE_IMPLEMENTATION_MISSING" }));
      } else if (!byteIdentical(previousComponents, currentComponents)) {
        output.push(Object.freeze({ pageId, moduleId, reason: "UNTOUCHED_MODULE_IMPLEMENTATION_CHANGED" }));
      }
    }
  }
  return output;
}

function unexpectedLegacyImplementationChanges(previous: UIImplementationSpec, current: UIImplementationSpec, expectedRemovedIds: ReadonlySet<string>): UnexpectedModuleChange[] {
  const output: UnexpectedModuleChange[] = [];
  const previousLegacy = legacyComponentGroups(previous);
  const currentLegacy = legacyComponentGroups(current);
  for (const [pageId, components] of previousLegacy) {
    const retained = components.filter((component) => !expectedRemovedIds.has(component.id));
    if (!byteIdentical(retained, currentLegacy.get(pageId) ?? [])) {
      output.push(Object.freeze({ pageId, moduleId: "legacy", reason: "PRESERVED_LEGACY_IMPLEMENTATION_CHANGED" }));
    }
  }
  return output;
}

function pageComponentGroups(spec: UIImplementationSpec): ReadonlyMap<string, ReadonlyMap<string, readonly UIComponentSpec[]>> {
  const pages = new Map<string, ReadonlyMap<string, readonly UIComponentSpec[]>>();
  for (const page of spec.pages) {
    const mutable = new Map<string, UIComponentSpec[]>();
    for (const component of page.components) {
      if (component.sourceModuleId === undefined) continue;
      const components = mutable.get(component.sourceModuleId) ?? [];
      components.push(component);
      mutable.set(component.sourceModuleId, components);
    }
    pages.set(page.id, mutable);
  }
  return pages;
}

function legacyComponentGroups(spec: UIImplementationSpec): ReadonlyMap<string, readonly UIComponentSpec[]> {
  const output = new Map<string, readonly UIComponentSpec[]>();
  for (const page of spec.pages) output.set(page.id, page.components.filter((component) => component.sourceModuleId === undefined));
  return output;
}

function byteIdentical(left: readonly UIComponentSpec[], right: readonly UIComponentSpec[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const a = leftPoints[index]!.codePointAt(0)!;
    const b = rightPoints[index]!.codePointAt(0)!;
    if (a !== b) return a < b ? -1 : 1;
  }
  return leftPoints.length === rightPoints.length ? 0 : leftPoints.length < rightPoints.length ? -1 : 1;
}

function freezeSorted(values: ReadonlySet<string>): readonly string[] {
  return Object.freeze([...values].sort(compareCodePoints));
}

function compareUnexpected(left: UnexpectedModuleChange, right: UnexpectedModuleChange): number {
  return compareCodePoints(left.pageId, right.pageId)
    || compareCodePoints(left.moduleId, right.moduleId)
    || compareCodePoints(left.reason, right.reason);
}

/** Descriptor-only audit prevents a revision diff from executing model/input getters. */
function assertSafeJson(root: unknown): void {
  const seen = new Set<object>();
  const active = new Set<object>();
  const pending: Array<{ value: unknown; exit?: true }> = [{ value: root }];
  while (pending.length > 0) {
    const entry = pending.pop()!;
    const value = entry.value;
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === undefined) continue;
    if (typeof value !== "object") throw new Error("MODULE_DIFF_UNSAFE_INPUT");
    if (entry.exit === true) {
      active.delete(value);
      seen.add(value);
      continue;
    }
    if (active.has(value)) throw new Error("MODULE_DIFF_UNSAFE_INPUT");
    if (seen.has(value)) continue;
    active.add(value);
    pending.push({ value, exit: true });
    if (Array.isArray(value)) {
      if (Reflect.getPrototypeOf(value) !== Array.prototype) throw new Error("MODULE_DIFF_UNSAFE_INPUT");
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || keys.some((key) => key !== "length" && (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(key)))) throw new Error("MODULE_DIFF_UNSAFE_INPUT");
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) throw new Error("MODULE_DIFF_UNSAFE_INPUT");
        pending.push({ value: descriptor.value });
      }
      continue;
    }
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("MODULE_DIFF_UNSAFE_INPUT");
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || key === "__proto__" || key === "prototype" || key === "constructor") throw new Error("MODULE_DIFF_UNSAFE_INPUT");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) throw new Error("MODULE_DIFF_UNSAFE_INPUT");
      pending.push({ value: descriptor.value });
    }
  }
}
