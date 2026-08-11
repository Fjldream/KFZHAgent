import {
  ModulePlanSchema,
  UIImplementationSpecSchema,
  type ModuleDeliveryGap,
  type ModulePlan,
  type ModulePlanModule,
  type ModuleTrace,
  type ResolvedAsset,
  type UIComponentSpec,
  type UIImplementationSpec,
} from "@kf/contracts";
import { solvePageLayout, type ModuleBounds } from "./layout/layout-engine.js";
import { ModuleRegistry } from "./module-registry.js";
import { stableModuleComponentId } from "./stable-ids.js";
import { resolveModuleComponentStyle, type ModuleThemeRole } from "./theme/module-theme.js";
import type { ModuleCompileOutput, ModuleValidationContext } from "./types.js";

export interface ResolvedAssetBinding {
  readonly moduleId: string;
  readonly assetId: string;
  readonly resolvedName?: string;
}

export interface ModuleCompilationResult {
  readonly implementation: UIImplementationSpec;
  readonly traces: readonly ModuleTrace[];
  readonly assetBindings: readonly ResolvedAssetBinding[];
  readonly gaps: readonly ModuleDeliveryGap[];
}

export interface CompileModulePlanInput {
  readonly plan: ModulePlan;
  readonly registry: ModuleRegistry;
  /** Opaque IDs resolve to safe metadata only; paths and storage keys never enter this boundary. */
  readonly assetsById: Readonly<Record<string, ResolvedAsset>>;
  readonly previousPlan?: ModulePlan;
  readonly previousImplementation?: UIImplementationSpec;
  /** Trusted capability and WebContainer authorization facts. Strictly empty by default. */
  readonly validationContext?: ModuleValidationContext;
}

const EMPTY_VALIDATION_CONTEXT: ModuleValidationContext = Object.freeze({
  availableKfCapabilities: Object.freeze([]),
  approvedAuthorizationRefs: Object.freeze([]),
});

const FORBIDDEN_PROPERTY_KEY = /^(?:css|native|guid|path|storagekey|styledata|script)/i;
const FORBIDDEN_TEXT = /<\/?script\b|javascript\s*:|data\s*:\s*text\s*\/\s*html|<style\b/i;
const GUID_VALUE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function compileModulePlan(input: CompileModulePlanInput): ModuleCompilationResult {
  const parsedPlan = ModulePlanSchema.safeParse(input.plan);
  if (!parsedPlan.success) throw new Error(`INVALID_MODULE_PLAN: ${parsedPlan.error.issues[0]?.message ?? "invalid plan"}`);
  const plan = parsedPlan.data;
  const previousPlan = input.previousPlan === undefined ? undefined : ModulePlanSchema.parse(input.previousPlan);
  const previousImplementation = input.previousImplementation === undefined
    ? undefined
    : UIImplementationSpecSchema.parse(input.previousImplementation);
  const validationContext = input.validationContext ?? EMPTY_VALIDATION_CONTEXT;
  const previousModules = previousModuleIndex(previousPlan);
  const previousComponents = previousComponentIndex(previousImplementation);
  const pages: UIImplementationSpec["pages"] = [];
  const traces: ModuleTrace[] = [];
  const gaps: ModuleDeliveryGap[] = [];
  const assetBindings: ResolvedAssetBinding[] = [];
  const seenIds = new Set<string>();

  for (const page of plan.pages) {
    const layout = solvePageLayout(page, input.registry);
    const pageComponents: UIComponentSpec[] = [];
    const traceEntries: ModuleTrace["entries"] = [];
    const modules = [...page.modules].sort(compareModules);

    for (const instance of modules) {
      const bounds = layout.boundsByModuleId[instance.id];
      if (bounds === undefined) {
        gaps.push(layoutGap(instance.id, "Module cannot be placed within the page layout."));
        continue;
      }
      const validation = validateModuleInstance(input.registry, instance, plan, validationContext, gaps);
      if (validation === undefined) continue;
      gaps.push(...validation.deliveryGaps);
      const resolvedAsset = resolveAsset(instance, input.assetsById, validation.asset, gaps);
      if (instance.assetId !== undefined && resolvedAsset === undefined && validation.asset !== undefined && requiredAsset(validation.definition.assetSlots)) {
        continue;
      }
      if (resolvedAsset?.status === "resolved" && instance.assetId !== undefined) {
        assetBindings.push(Object.freeze({
          moduleId: instance.id,
          assetId: instance.assetId,
          ...(resolvedAsset.resolvedName === undefined ? {} : { resolvedName: resolvedAsset.resolvedName }),
        }));
      }

      const compiled = validation.definition.compile({
        context: Object.freeze({
          definition: validation.definition,
          instance,
          content: validation.content,
          asset: resolvedAsset,
          validationContext,
        }),
      });
      const translated = translateModuleOutput(instance, bounds, compiled, plan.theme, seenIds);
      const prior = reusablePreviousComponents(instance, page.id, bounds, previousModules, previousComponents, translated);
      pageComponents.push(...(prior ?? translated));
      gaps.push(...compiled.deliveryGaps);
      traceEntries.push({ pageId: page.id, moduleId: instance.id, outputId: instance.id });
    }

    if (pageComponents.length === 0) {
      throw new Error(`MODULE_COMPILATION_BLOCKED: ${page.id} has no compilable components`);
    }
    pages.push({ id: page.id, width: layout.width, height: layout.height, components: pageComponents });
    traces.push({ schema: "kf-module-trace/v1", projectKey: plan.projectKey, entries: traceEntries });
  }

  const implementation = UIImplementationSpecSchema.safeParse({ schema: "kf-ui-implementation/v1", theme: plan.theme, pages });
  if (!implementation.success) throw new Error(`INVALID_COMPILED_UI_IMPLEMENTATION: ${implementation.error.issues[0]?.message ?? "invalid implementation"}`);
  return Object.freeze({
    implementation: implementation.data,
    traces: Object.freeze(traces),
    assetBindings: Object.freeze(assetBindings),
    gaps: Object.freeze(gaps),
  });
}

function compareModules(left: ModulePlanModule, right: ModulePlanModule): number {
  return left.placement.order - right.placement.order || compareCodePoints(left.id, right.id);
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requiredAsset(slots: readonly { required: boolean }[]): boolean {
  return slots.some((slot) => slot.required);
}

function resolveAsset(
  instance: ModulePlanModule,
  assetsById: Readonly<Record<string, ResolvedAsset>>,
  asset: unknown,
  gaps: ModuleDeliveryGap[],
): ResolvedAsset | undefined {
  if (instance.assetId === undefined) return undefined;
  const resolved = assetsById[instance.assetId];
  if (resolved?.assetId === instance.assetId && resolved.status === "resolved") return resolved;
  if (asset !== undefined) {
    gaps.push(Object.freeze({
      moduleId: instance.id,
      requirement: `Resolve required asset ${instance.assetId}.`,
      severity: "blocking",
      status: "unresolved",
      reason: `Asset ${instance.assetId} is not available to the module compiler.`,
      alternatives: ["Upload or select a registered asset before building."],
    }));
  }
  return undefined;
}

function layoutGap(moduleId: string, reason: string): ModuleDeliveryGap {
  return Object.freeze({
    moduleId,
    requirement: "Place the module within its registered layout contract.",
    severity: "blocking",
    status: "unresolved",
    reason,
    alternatives: ["Adjust the module placement, span, or variant."],
  });
}

function translateModuleOutput(
  instance: ModulePlanModule,
  bounds: ModuleBounds,
  compiled: ModuleCompileOutput,
  theme: ModulePlan["theme"],
  seenIds: Set<string>,
): UIComponentSpec[] {
  const output: UIComponentSpec[] = [];
  for (const component of compiled.components) {
    const id = stableModuleComponentId(instance.id, component.id);
    if (seenIds.has(id)) throw new Error(`DUPLICATE_STABLE_COMPONENT_ID: ${id}`);
    seenIds.add(id);
    assertSafeComponent(component, id);
    assertLocalBounds(component, bounds, id);
    const role = component.style.role as ModuleThemeRole | undefined;
    const style = resolveModuleComponentStyle(theme, role, component.style);
    output.push({
      ...component,
      id,
      sourceModuleId: instance.id,
      geometry: Object.freeze({
        x: bounds.x + component.geometry.x,
        y: bounds.y + component.geometry.y,
        width: component.geometry.width,
        height: component.geometry.height,
      }),
      style,
    });
  }
  return output;
}

function assertLocalBounds(component: UIComponentSpec, bounds: ModuleBounds, id: string): void {
  const { x, y, width, height } = component.geometry;
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > bounds.width || y + height > bounds.height) {
    throw new Error(`MODULE_COMPILER_OUTPUT_OUT_OF_BOUNDS: ${id}`);
  }
}

function assertSafeComponent(component: UIComponentSpec, id: string): void {
  if (!component.id || component.id.includes("/") || FORBIDDEN_TEXT.test(component.content ?? "") || hasForbiddenPayload(component.properties)) {
    throw new Error(`MODULE_COMPILER_UNSAFE_OUTPUT: ${id}`);
  }
}

function hasForbiddenPayload(value: unknown): boolean {
  if (typeof value === "string") return FORBIDDEN_TEXT.test(value) || GUID_VALUE.test(value);
  if (Array.isArray(value)) return value.some(hasForbiddenPayload);
  if (value === null || typeof value !== "object") return false;
  return Object.entries(value).some(([key, nested]) => FORBIDDEN_PROPERTY_KEY.test(key) || hasForbiddenPayload(nested));
}

function validateModuleInstance(
  registry: ModuleRegistry,
  instance: ModulePlanModule,
  plan: ModulePlan,
  context: ModuleValidationContext,
  gaps: ModuleDeliveryGap[],
) {
  try {
    return registry.validateInstance({ instance, assets: plan.assets, context });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MODULE_VALIDATION_FAILED";
    if (!isBlockingCapabilityError(message)) throw error;
    gaps.push(Object.freeze({
      moduleId: instance.id,
      requirement: `Provide the KF capability required by ${instance.kind}.`,
      severity: "blocking",
      status: "unresolved",
      reason: message,
      alternatives: ["Select a registered native module variant or enable the required reviewed capability."],
    }));
    return undefined;
  }
}

function isBlockingCapabilityError(message: string): boolean {
  return message.startsWith("MODULE_KF_CAPABILITY_MISSING:")
    || message.startsWith("MODULE_WEBCONTAINER_DISALLOWED:")
    || message.startsWith("MODULE_WEBCONTAINER_UNAUTHORIZED:");
}

function previousModuleIndex(plan: ModulePlan | undefined): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const page of plan?.pages ?? []) {
    for (const module of page.modules) index.set(`${page.id}\u0000${module.id}`, stableJson(module));
  }
  return index;
}

function previousComponentIndex(implementation: UIImplementationSpec | undefined): ReadonlyMap<string, readonly UIComponentSpec[]> {
  const index = new Map<string, UIComponentSpec[]>();
  for (const page of implementation?.pages ?? []) {
    for (const component of page.components) {
      if (component.sourceModuleId === undefined) continue;
      const key = `${page.id}\u0000${component.sourceModuleId}`;
      const components = index.get(key) ?? [];
      components.push(component);
      index.set(key, components);
    }
  }
  return index;
}

function reusablePreviousComponents(
  instance: ModulePlanModule,
  pageId: string,
  bounds: ModuleBounds,
  previousModules: ReadonlyMap<string, string>,
  previousComponents: ReadonlyMap<string, readonly UIComponentSpec[]>,
  translated: readonly UIComponentSpec[],
): readonly UIComponentSpec[] | undefined {
  const key = `${pageId}\u0000${instance.id}`;
  if (previousModules.get(key) !== stableJson(instance)) return undefined;
  const prior = previousComponents.get(key);
  if (prior === undefined || prior.length !== translated.length) return undefined;
  const priorIds = prior.map((component) => component.id).sort(compareCodePoints);
  const nextIds = translated.map((component) => component.id).sort(compareCodePoints);
  if (priorIds.some((id, index) => id !== nextIds[index]) || prior.some((component) => !inBounds(component, bounds))) return undefined;
  return prior;
}

function inBounds(component: UIComponentSpec, bounds: ModuleBounds): boolean {
  const { x, y, width, height } = component.geometry;
  return x >= bounds.x && y >= bounds.y && x + width <= bounds.x + bounds.width && y + height <= bounds.y + bounds.height;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(compareCodePoints).map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}
