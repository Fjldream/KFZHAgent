import {
  AcceptedBlueprintArtifactSchema,
  ModuleDeliveryGapSchema,
  ModuleDeliveryReportSchema,
  ModulePlanSchema,
  ModuleTraceSchema,
  UIImplementationSpecSchema,
  type AcceptedBlueprintArtifact,
  type ModuleDeliveryGap,
  type ModuleDeliveryReport,
  type ModulePlan,
  type ModuleTrace,
  type ModuleCompilationMetadata,
  type UIComponentSpec,
  type UIImplementationSpec,
} from "@kf/contracts";
import type { ResolvedAssetBinding } from "./module-compiler.js";
import type { ResolvedAsset } from "@kf/contracts";
import type { ModuleRegistry } from "./module-registry.js";
import { stableModuleComponentId } from "./stable-ids.js";

export interface EvaluateModuleDeliveryInput {
  readonly acceptedBlueprint: AcceptedBlueprintArtifact;
  readonly plan: ModulePlan;
  readonly implementation?: UIImplementationSpec;
  readonly traces: readonly ModuleTrace[];
  readonly assetBindings: readonly ResolvedAssetBinding[];
  readonly gaps: readonly ModuleDeliveryGap[];
  readonly registry: ModuleRegistry;
  readonly assetsById: Readonly<Record<string, ResolvedAsset>>;
  /** Trusted conversion-boundary provenance; plan declarations cannot authorize coverage. */
  readonly metadata: ModuleCompilationMetadata;
}

export interface ModuleDeliveryEvaluation {
  readonly report: ModuleDeliveryReport;
}

const COMPLEX_MODULE_KINDS = new Set([
  "metric.kpi-grid", "content.card-grid", "content.timeline", "data.chart-panel", "data.status-grid",
  "data.table", "data.detail", "interaction.tabs-filter", "form.record-editor", "action.toolbar", "feedback.alert-list",
]);
const PLACEHOLDER_VALUES = new Set(["__KF_SEED_PLACEHOLDER__", "__KF_PLACEHOLDER_IMAGE__", "seed-placeholder-image"]);

export function evaluateModuleDelivery(input: EvaluateModuleDeliveryInput): ModuleDeliveryEvaluation {
  assertSafeJson({ acceptedBlueprint: input.acceptedBlueprint, plan: input.plan, implementation: input.implementation, traces: input.traces, assetBindings: input.assetBindings, gaps: input.gaps, assetsById: input.assetsById, metadata: input.metadata });
  const acceptedBlueprint = AcceptedBlueprintArtifactSchema.parse(input.acceptedBlueprint);
  const plan = ModulePlanSchema.parse(input.plan);
  const implementation = input.implementation === undefined ? undefined : UIImplementationSpecSchema.parse(input.implementation);
  const traces = input.traces.map((trace) => ModuleTraceSchema.parse(trace));
  const inherited = input.gaps.map((gap) => ModuleDeliveryGapSchema.parse(gap));
  const gaps: ModuleDeliveryGap[] = [...inherited];
  const planModules = plan.pages.flatMap((page) => page.modules.map((module) => ({ pageId: page.id, module })));
  const owner = planModules[0]!.module.id;
  const trusted = input.metadata.blueprintMappings;
  const blueprintToModules = new Map<string, string[]>();
  for (const mapping of trusted) blueprintToModules.set(mapping.blueprintModuleId, [mapping.moduleId]);

  for (const module of acceptedBlueprint.modules) {
    const mapped = blueprintToModules.get(module.blueprintModuleId) ?? [];
    const mapping = trusted.find((entry) => entry.blueprintModuleId === module.blueprintModuleId);
    if (mapped.length !== 1) gaps.push(gap(owner, `Map confirmed blueprint module “${module.blueprintModuleId}” exactly once to a registered module.`, "BLUEPRINT_MODULE_UNMAPPED"));
    if (mapping !== undefined) {
      const candidate = planModules.find(({ module: planModule }) => planModule.id === mapping.moduleId)?.module;
      let definition;
      try { definition = candidate === undefined ? undefined : input.registry.require(candidate.kind, candidate.templateVersion); } catch { definition = undefined; }
      if (candidate === undefined || definition === undefined || candidate.kind !== module.expectedKind || definition.category !== module.expectedCategory || mapping.expectedKind !== module.expectedKind || mapping.expectedCategory !== module.expectedCategory) gaps.push(gap(owner, `Keep blueprint module “${module.blueprintModuleId}” mapped to its exact accepted registered kind/category.`, "BLUEPRINT_KIND_OR_CATEGORY_MISMATCH"));
    }
    if (module.interactionRequirements.length > 0 && !mapped.some((id) => planModules.some(({ module: candidate }) => candidate.id === id && candidate.interactions.length > 0))) gaps.push(gap(module.blueprintModuleId, "Map confirmed blueprint interactions to registered native interactions.", "BLUEPRINT_INTERACTION_UNMAPPED"));
  }
  const mappedModuleIds = new Set([...blueprintToModules.values()].flat());
  if (trusted.length === 0) gaps.push(gap(owner, "Provide accepted blueprint provenance metadata from the conversion boundary.", "BLUEPRINT_PROVENANCE_MISSING"));
  for (const { module } of planModules) {
    if (!mappedModuleIds.has(module.id)) gaps.push(gap(module.id, "Map this module through trusted blueprint provenance.", "MODULE_TRUSTED_PROVENANCE_MISSING"));
    const declared = [...(module.sourceBlueprintModuleIds ?? [])].sort();
    const expected = [...blueprintToModules.entries()].filter(([, ids]) => ids.includes(module.id)).map(([id]) => id).sort();
    if (JSON.stringify(declared) !== JSON.stringify(expected)) gaps.push(gap(module.id, "Keep ModulePlan provenance equal to accepted blueprint conversion metadata.", "MODULE_PROVENANCE_MISMATCH"));
    if ((module.sourceBlueprintModuleIds ?? []).some((id) => !acceptedBlueprint.modules.some((candidate) => candidate.blueprintModuleId === id))) gaps.push(gap(module.id, "Use only IDs from the confirmed blueprint.", "MODULE_BLUEPRINT_REFERENCE_UNKNOWN"));
  }

  if (implementation === undefined) {
    for (const { module } of planModules) gaps.push(gap(module.id, "Compile required module controls.", "MODULE_IMPLEMENTATION_MISSING"));
  } else {
    inspectImplementation(plan, implementation, traces, input.assetBindings, input.registry, input.assetsById, gaps);
    inspectBlueprintInteractionBindings(acceptedBlueprint, input.metadata, implementation, gaps);
  }

  const report = ModuleDeliveryReportSchema.parse({
    schema: "kf-module-delivery/v1",
    projectKey: plan.projectKey,
    status: statusFor(gaps),
    gaps: finalizeGaps(gaps),
  });
  return Object.freeze({ report });
}

function inspectBlueprintInteractionBindings(blueprint: AcceptedBlueprintArtifact, metadata: ModuleCompilationMetadata, implementation: UIImplementationSpec, gaps: ModuleDeliveryGap[]): void {
  for (const requirementOwner of blueprint.modules) {
    const requirements = requirementOwner.interactionRequirements;
    const mapping = metadata.blueprintMappings.find((entry) => entry.blueprintModuleId === requirementOwner.blueprintModuleId);
    if (mapping === undefined) { gaps.push(gap("blueprint", `Map all interaction requirements for “${requirementOwner.blueprintModuleId}”.`, "BLUEPRINT_INTERACTION_UNMAPPED")); continue; }
    const outputs = implementation.pages.find((page) => page.id === mapping.pageId)?.components.filter((component) => component.sourceModuleId === mapping.moduleId) ?? [];
    for (const requirement of requirements) {
      const binding = mapping.interactionBindings.find((entry) => entry.type === requirement.type && entry.actionKind === requirement.actionKind && entry.target === requirement.target);
      const output = binding === undefined ? undefined : outputs.find((component) => component.id === binding.outputId);
      if (binding === undefined || output === undefined || !actionMatches(output, binding.actionKind, binding.target)) gaps.push(gap(mapping.moduleId, "Materialize each accepted blueprint interaction on its bound native output.", "BLUEPRINT_INTERACTION_BINDING_MISSING"));
    }
    if (mapping.interactionBindings.some((binding) => !requirements.some((requirement) => requirement.type === binding.type && requirement.actionKind === binding.actionKind && requirement.target === binding.target))) gaps.push(gap(mapping.moduleId, "Do not emit unrelated blueprint interaction bindings.", "BLUEPRINT_INTERACTION_BINDING_EXTRA"));
  }
}

function actionMatches(component: UIComponentSpec, actionKind: string, target: string): boolean {
  const action = component.properties.action;
  if (action === null || typeof action !== "object" || Array.isArray(action)) return false;
  const value = action as Record<string, unknown>;
  return value.kind === actionKind && (value.pageId === target || value.moduleId === target || value.action === target || value.field === target || value.target === target);
}

function inspectImplementation(
  plan: ModulePlan,
  implementation: UIImplementationSpec,
  traces: readonly ModuleTrace[],
  assetBindings: readonly ResolvedAssetBinding[],
  registry: ModuleRegistry,
  assetsById: Readonly<Record<string, ResolvedAsset>>,
  gaps: ModuleDeliveryGap[],
): void {
  const componentsByModule = new Map<string, UIComponentSpec[]>();
  const traceKeys = new Set<string>();
  for (const trace of traces) for (const entry of trace.entries) traceKeys.add(`${entry.pageId}\u0000${entry.moduleId}\u0000${entry.outputId}`);
  const expectedTraceKeys = new Set<string>();

  for (const page of implementation.pages) {
    inspectPageGeometry(page.id, page.width, page.height, page.components, gaps);
    for (const component of page.components) {
      if (component.sourceModuleId === undefined) continue;
      const components = componentsByModule.get(component.sourceModuleId) ?? [];
      components.push(component);
      componentsByModule.set(component.sourceModuleId, components);
      expectedTraceKeys.add(`${page.id}\u0000${component.sourceModuleId}\u0000${component.id}`);
      if (hasTemplateResidue(component)) gaps.push(gap(component.sourceModuleId, "Replace template residue with confirmed content or a real asset.", "TEMPLATE_RESIDUE"));
    }
  }

  for (const extra of traceKeys) if (!expectedTraceKeys.has(extra)) gaps.push(gap(extra.split("\u0000")[1] ?? "trace", "Emit traces only for generated controls on their owning page/module.", "MODULE_TRACE_EXTRA_OR_MISATTRIBUTED"));
  for (const page of plan.pages) for (const module of page.modules) {
    const components = componentsByModule.get(module.id) ?? [];
    let definition;
    try { definition = registry.require(module.kind, module.templateVersion); } catch { gaps.push(gap(module.id, "Use a registered module definition.", "MODULE_DEFINITION_UNREGISTERED")); continue; }
    const quality = definition.quality ?? { minimumComponentCount: 1, minimumCriticalComponentCount: 1, requiredRoles: [], requiredCriticalRoles: [], requiredCapabilityIds: [], variantRequiredOutputs: {} };
    if (components.length < quality.minimumComponentCount || quality.requiredRoles.some((role) => !components.some((component) => component.role === role)) || quality.requiredCapabilityIds.some((capability) => !components.some((component) => component.capabilityId === capability))) gaps.push(gap(module.id, "Generate the module's required registered structure.", "MODULE_REQUIRED_STRUCTURE_MISSING"));
    if (components.filter((component) => component.critical).length < quality.minimumCriticalComponentCount || quality.requiredCriticalRoles.some((role) => !components.some((component) => component.critical && component.role === role))) gaps.push(gap(module.id, "Generate the module's required critical controls.", "CRITICAL_CONTROL_MISSING"));
    for (const output of quality.variantRequiredOutputs[module.variant] ?? []) {
      const component = output.outputId === undefined
        ? components.find((candidate) => candidate.role === output.role)
        : components.find((candidate) => candidate.id === stableModuleComponentId(module.id, output.outputId!));
      if (component === undefined || component.role !== output.role || component.capabilityId !== output.capabilityId || component.critical !== output.critical) {
        gaps.push(gap(module.id, `Generate required ${module.variant} output ${output.outputId ?? output.role}.`, "MODULE_REQUIRED_OUTPUT_MISSING"));
        continue;
      }
      if (output.assetSlotId !== undefined && (module.assetId === undefined || assetsById[module.assetId]?.status !== "resolved" || component.properties.src !== "asset")) gaps.push(gap(module.id, `Bind required asset slot ${output.assetSlotId} to its native output.`, "MODULE_REQUIRED_ASSET_OUTPUT_MISSING"));
      if (output.actionType !== undefined) {
        const interactions = module.interactions.filter((interaction) => interaction.type === output.actionType);
        if (interactions.length > 0 && !interactions.some((interaction) => hasInteraction(component, interaction))) gaps.push(gap(module.id, `Bind required ${output.actionType} action to ${output.outputId ?? output.role}.`, "MODULE_REQUIRED_ACTION_OUTPUT_MISSING"));
      }
    }
    if (components.some((component) => !traceKeys.has(`${page.id}\u0000${module.id}\u0000${component.id}`))) gaps.push(gap(module.id, "Emit an exact module trace for every generated control.", "MODULE_TRACE_MISSING"));
    if (module.assetId !== undefined && !assetBindings.some((binding) => binding.moduleId === module.id && binding.assetId === module.assetId)) {
      gaps.push(gap(module.id, "Bind the requested module asset into the delivery package.", "ASSET_BINDING_MISSING"));
    }
    if (module.assetId !== undefined && assetsById[module.assetId]?.status !== "resolved") gaps.push(gap(module.id, "Resolve the requested module asset before delivery.", "ASSET_RESOLUTION_MISSING"));
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
  return containsPlaceholder(component.content) || containsPlaceholder(component.properties);
}

function containsPlaceholder(value: unknown): boolean {
  const seen = new Set<object>(); const pending = [value];
  while (pending.length > 0) { const current = pending.pop(); if (typeof current === "string") { if (PLACEHOLDER_VALUES.has(current)) return true; continue; } if (current === null || typeof current !== "object") continue; if (seen.has(current)) continue; seen.add(current); if (Array.isArray(current)) { for (const nested of current) pending.push(nested); continue; } for (const nested of Object.values(current as Record<string, unknown>)) pending.push(nested); }
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
  const ordered = [...unique.values()].sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || compareCodePoints(left.moduleId, right.moduleId) || compareCodePoints(left.reason, right.reason));
  if (ordered.length <= 250) return Object.freeze(ordered);
  const firstByModule = new Map<string, ModuleDeliveryGap>();
  for (const entry of ordered) if (!firstByModule.has(entry.moduleId)) firstByModule.set(entry.moduleId, entry);
  const retained = [...firstByModule.values()].sort((left, right) => compareCodePoints(left.moduleId, right.moduleId));
  return Object.freeze([...retained, ...ordered.filter((entry) => firstByModule.get(entry.moduleId) !== entry)].slice(0, 250));
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
