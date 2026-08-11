import {
  CustomerEffectBlueprintSchema,
  ModuleDeliveryGapSchema,
  ModuleDeliveryReportSchema,
  ModulePlanSchema,
  ModuleTraceSchema,
  UIImplementationSpecSchema,
  type CustomerEffectBlueprint,
  type ModuleDeliveryGap,
  type ModuleDeliveryReport,
  type ModulePlan,
  type ModuleTrace,
  type UIComponentSpec,
  type UIImplementationSpec,
} from "@kf/contracts";
import type { ResolvedAssetBinding } from "./module-compiler.js";

export interface EvaluateModuleDeliveryInput {
  readonly blueprint: CustomerEffectBlueprint;
  readonly plan: ModulePlan;
  readonly implementation?: UIImplementationSpec;
  readonly traces: readonly ModuleTrace[];
  readonly assetBindings: readonly ResolvedAssetBinding[];
  readonly gaps: readonly ModuleDeliveryGap[];
}

export interface ModuleDeliveryEvaluation {
  readonly report: ModuleDeliveryReport;
}

const COMPLEX_MODULE_KINDS = new Set([
  "metric.kpi-grid", "content.card-grid", "content.timeline", "data.chart-panel", "data.status-grid",
  "data.table", "data.detail", "interaction.tabs-filter", "form.record-editor", "action.toolbar", "feedback.alert-list",
]);
const TEMPLATE_TEXT = /(?:^|\s)(?:hello|default(?:\s+(?:label|text|title))?)(?:\s|$)/i;
const PLACEHOLDER_IMAGE = /(?:placeholder|default[-_ ]?image|\.svg$)/i;

export function evaluateModuleDelivery(input: EvaluateModuleDeliveryInput): ModuleDeliveryEvaluation {
  assertSafeJson(input);
  const blueprint = CustomerEffectBlueprintSchema.parse(input.blueprint);
  const plan = ModulePlanSchema.parse(input.plan);
  const implementation = input.implementation === undefined ? undefined : UIImplementationSpecSchema.parse(input.implementation);
  const traces = input.traces.map((trace) => ModuleTraceSchema.parse(trace));
  const inherited = input.gaps.map((gap) => ModuleDeliveryGapSchema.parse(gap));
  const gaps: ModuleDeliveryGap[] = [...inherited];
  const planModules = plan.pages.flatMap((page) => page.modules.map((module) => ({ pageId: page.id, module })));
  const moduleIds = new Set(planModules.map(({ module }) => module.id));

  for (const module of blueprint.modules) {
    if (!moduleIds.has(module.id)) gaps.push(gap(module.id, "Map this confirmed blueprint module to a registered module.", "BLUEPRINT_MODULE_UNMAPPED"));
  }
  for (const { module } of planModules) {
    if (!blueprint.modules.some((candidate) => candidate.id === module.id)) gaps.push(gap(module.id, "Use a stable ID from the confirmed blueprint module.", "MODULE_NOT_IN_BLUEPRINT"));
  }

  if (implementation === undefined) {
    for (const { module } of planModules) gaps.push(gap(module.id, "Compile required module controls.", "MODULE_IMPLEMENTATION_MISSING"));
  } else {
    inspectImplementation(plan, implementation, traces, input.assetBindings, gaps);
  }

  const report = ModuleDeliveryReportSchema.parse({
    schema: "kf-module-delivery/v1",
    projectKey: plan.projectKey,
    status: statusFor(gaps),
    gaps: finalizeGaps(gaps),
  });
  return Object.freeze({ report });
}

function inspectImplementation(
  plan: ModulePlan,
  implementation: UIImplementationSpec,
  traces: readonly ModuleTrace[],
  assetBindings: readonly ResolvedAssetBinding[],
  gaps: ModuleDeliveryGap[],
): void {
  const componentsByModule = new Map<string, UIComponentSpec[]>();
  const traceOutputIds = new Set<string>();
  for (const trace of traces) for (const entry of trace.entries) traceOutputIds.add(entry.outputId);

  for (const page of implementation.pages) {
    inspectPageGeometry(page.id, page.width, page.height, page.components, gaps);
    for (const component of page.components) {
      if (component.sourceModuleId === undefined) continue;
      const components = componentsByModule.get(component.sourceModuleId) ?? [];
      components.push(component);
      componentsByModule.set(component.sourceModuleId, components);
      if (hasTemplateResidue(component)) gaps.push(gap(component.sourceModuleId, "Replace template residue with confirmed content or a real asset.", "TEMPLATE_RESIDUE"));
    }
  }

  for (const page of plan.pages) for (const module of page.modules) {
    const components = componentsByModule.get(module.id) ?? [];
    if (!components.some((component) => component.critical)) gaps.push(gap(module.id, "Generate the module's required critical controls.", "CRITICAL_CONTROL_MISSING"));
    if (components.some((component) => !traceOutputIds.has(component.id))) gaps.push(gap(module.id, "Emit an exact module trace for every generated control.", "MODULE_TRACE_MISSING"));
    if (module.assetId !== undefined && !assetBindings.some((binding) => binding.moduleId === module.id && binding.assetId === module.assetId)) {
      gaps.push(gap(module.id, "Bind the requested module asset into the delivery package.", "ASSET_BINDING_MISSING"));
    }
    if (!module.interactions.every((interaction) => components.some((component) => hasInteraction(component, interaction)))) {
      gaps.push(gap(module.id, "Materialize every required registered interaction as a native action.", "CRITICAL_INTERACTION_MISSING"));
    }
    if (components.some((component) => component.fallbackCapabilityId !== undefined) && !gaps.some((entry) => entry.moduleId === module.id && /fallback/i.test(entry.reason))) {
      gaps.push(gap(module.id, "Document and approve every capability fallback.", "SILENT_FALLBACK"));
    }
    if (COMPLEX_MODULE_KINDS.has(module.kind) && components.length > 0 && components.every((component) => component.capabilityId === "text")) {
      gaps.push(gap(module.id, "Use registered native controls for this complex module.", "COMPLEX_MODULE_TEXT_COLLAPSE"));
    }
  }
}

function inspectPageGeometry(pageId: string, width: number, height: number, components: readonly UIComponentSpec[], gaps: ModuleDeliveryGap[]): void {
  for (const component of components) {
    const { x, y, width: componentWidth, height: componentHeight } = component.geometry;
    if (x < 0 || y < 0 || x + componentWidth > width || y + componentHeight > height) gaps.push(gap(component.sourceModuleId ?? component.id, `Keep ${component.id} inside the page canvas.`, "GEOMETRY_OVERFLOW"));
  }
  for (let leftIndex = 0; leftIndex < components.length; leftIndex += 1) for (let rightIndex = leftIndex + 1; rightIndex < components.length; rightIndex += 1) {
    const left = components[leftIndex]!;
    const right = components[rightIndex]!;
    if (!left.critical || !right.critical || left.sourceModuleId === right.sourceModuleId || parentRelated(left, right) || !overlaps(left, right)) continue;
    gaps.push(gap(left.sourceModuleId ?? left.id, `Resolve the critical overlap between ${left.id} and ${right.id} on ${pageId}.`, "CRITICAL_COMPONENT_OVERLAP"));
  }
}

function parentRelated(left: UIComponentSpec, right: UIComponentSpec): boolean {
  return left.properties.parentId === right.id || right.properties.parentId === left.id || (typeof left.properties.parentId === "string" && left.properties.parentId === right.properties.parentId);
}

function overlaps(left: UIComponentSpec, right: UIComponentSpec): boolean {
  const a = left.geometry; const b = right.geometry;
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function hasInteraction(component: UIComponentSpec, interaction: ModulePlan["pages"][number]["modules"][number]["interactions"][number]): boolean {
  const action = component.properties.action;
  if (action === null || typeof action !== "object" || Array.isArray(action)) return false;
  const record = action as Record<string, unknown>;
  if (interaction.type === "navigate") return record.kind === "navigate" && record.pageId === interaction.pageId;
  if (interaction.type === "scroll" || interaction.type === "open-modal") return record.kind === interaction.type && record.moduleId === interaction.moduleId;
  if (interaction.type === "submit") return record.kind === "submit" && record.action === interaction.action;
  if (interaction.type === "filter") return record.kind === "filter" && record.field === interaction.field;
  return record.kind === "toggle" && record.target === interaction.target;
}

function hasTemplateResidue(component: UIComponentSpec): boolean {
  if (component.content !== undefined && TEMPLATE_TEXT.test(component.content)) return true;
  for (const [key, value] of Object.entries(component.properties)) {
    if (typeof value !== "string") continue;
    if (TEMPLATE_TEXT.test(value)) return true;
    if ((key === "src" || key === "url" || key === "alt") && PLACEHOLDER_IMAGE.test(value)) return true;
  }
  return false;
}

function gap(moduleId: string, requirement: string, reason: string): ModuleDeliveryGap {
  return Object.freeze({ moduleId, requirement, severity: "blocking", status: "unresolved", reason, alternatives: ["Revise the ModulePlan and rebuild the module."] });
}

function statusFor(gaps: readonly ModuleDeliveryGap[]): ModuleDeliveryReport["status"] {
  if (gaps.some((entry) => entry.status === "unresolved" && entry.severity === "blocking")) return "blocked";
  return gaps.some((entry) => entry.status === "unresolved") ? "ready_with_warnings" : "ready";
}

function finalizeGaps(gaps: readonly ModuleDeliveryGap[]): readonly ModuleDeliveryGap[] {
  const unique = new Map<string, ModuleDeliveryGap>();
  for (const entry of gaps) unique.set(JSON.stringify(entry), entry);
  return Object.freeze([...unique.values()].sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || compareCodePoints(left.moduleId, right.moduleId) || compareCodePoints(left.reason, right.reason)).slice(0, 250));
}

function severityRank(value: ModuleDeliveryGap["severity"]): number { return value === "blocking" ? 3 : value === "warning" ? 2 : 1; }
function compareCodePoints(left: string, right: string): number { return left < right ? -1 : left > right ? 1 : 0; }

/** Descriptor-only audit keeps caller-controlled reports from running accessors during evaluation. */
function assertSafeJson(root: unknown): void {
  const seen = new Set<object>();
  const active = new Set<object>();
  const pending: Array<{ value: unknown; exit?: true }> = [{ value: root }];
  while (pending.length > 0) {
    const entry = pending.pop()!;
    const value = entry.value;
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value === undefined) continue;
    if (typeof value !== "object") throw new Error("MODULE_DELIVERY_UNSAFE_INPUT");
    if (entry.exit === true) {
      active.delete(value);
      seen.add(value);
      continue;
    }
    if (active.has(value)) throw new Error("MODULE_DELIVERY_UNSAFE_INPUT");
    if (seen.has(value)) continue;
    active.add(value);
    pending.push({ value, exit: true });
    if (Array.isArray(value)) {
      if (Reflect.getPrototypeOf(value) !== Array.prototype) throw new Error("MODULE_DELIVERY_UNSAFE_INPUT");
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1 || keys.some((key) => key !== "length" && (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(key)))) throw new Error("MODULE_DELIVERY_UNSAFE_INPUT");
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !("value" in descriptor)) throw new Error("MODULE_DELIVERY_UNSAFE_INPUT");
        pending.push({ value: descriptor.value });
      }
      continue;
    }
    const prototype = Reflect.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new Error("MODULE_DELIVERY_UNSAFE_INPUT");
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string" || key === "__proto__" || key === "prototype" || key === "constructor") throw new Error("MODULE_DELIVERY_UNSAFE_INPUT");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) throw new Error("MODULE_DELIVERY_UNSAFE_INPUT");
      pending.push({ value: descriptor.value });
    }
  }
}
