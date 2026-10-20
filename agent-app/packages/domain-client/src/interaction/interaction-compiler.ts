import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";
import { parse } from "acorn";
import {
  canonicalServerHash,
  CustomerSolutionBlueprintSchema,
  SolutionImplementationPlanSchema,
  UIImplementationSpecV2Schema,
  type CompiledEventBinding,
  type CompiledScriptModule,
  type CustomerSolutionBlueprint,
  type SolutionImplementationPlan,
  type UIImplementationSpecV2,
} from "@kf/contracts";
import { createDefaultModuleRegistry } from "../modules/module-registry.js";
import { solutionModuleRegistryHash } from "../solution-compile/solution-provenance.js";
import { compileNativeActions, type TypedScriptRequest } from "./action-compiler.js";
import { normalizeActionGraph } from "./action-graph.js";
import { lowerReviewedInteractionIntents } from "./interaction-intent-lowering.js";
import { analyzeObservableClosure } from "./observable-closure.js";
import { validateCustomScript, type ValidatedSemanticCall } from "./custom-script-validator.js";
import {
  createSemanticScriptApiContext,
  createSemanticScriptValidationIdentity,
} from "./semantic-script-api.js";
import { compileScriptPlan, type CompiledScriptPlan } from "./script-compiler.js";

export type InteractionDiagnosticCode =
  | "INTERACTION_BINDING_TIER_ORDER_UNREPRESENTABLE"
  | "INTERACTION_BINDING_DUPLICATE"
  | "INTERACTION_CAPACITY_OVERFLOW"
  | "INTERACTION_CLOSURE_MISSING"
  | "INTERACTION_CONDITIONAL_CLOSURE_UNPROVEN"
  | "INTERACTION_COMPILED_SOURCE_INVALID"
  | "INTERACTION_SCRIPT_BLOCKED"
  | "INTERACTION_SCRIPT_CYCLE"
  | "INTERACTION_OUTPUT_CONSUMER_MISSING"
  | "JOURNEY_REFERENCE_UNKNOWN"
  | "JOURNEY_REFERENCE_AMBIGUOUS"
  | "JOURNEY_STEP_UNCOVERED"
  | "JOURNEY_TRIGGER_OWNERSHIP_MISMATCH"
  | "JOURNEY_CLOSURE_MISSING";

export interface InteractionDiagnostic {
  readonly code: InteractionDiagnosticCode;
  readonly nodeId: string;
  readonly message: string;
}

export interface InteractionCompilationRequest {
  readonly actionId: string;
  readonly sourceScriptId?: string;
  readonly status: "blocked";
  readonly reason: string;
}

/**
 * 描述故意省略的交互边而不是不安全或编译错误的程序。API 可以将这些作为兼容性警告显示，而其他交互错误仍然保持阻塞。
 */
export const RECOVERABLE_INTERACTION_DIAGNOSTIC_CODES: ReadonlySet<InteractionDiagnosticCode> = new Set([
  "INTERACTION_CLOSURE_MISSING",
]);

export function interactionDiagnosticsBlockCompilation(
  diagnostics: Readonly<{
    errors: readonly InteractionDiagnostic[];
    requests: readonly InteractionCompilationRequest[];
  }>,
  recoverableRequestActionIds: ReadonlySet<string> = new Set(),
): boolean {
  return diagnostics.errors.some((diagnostic) =>
    diagnostic.code !== "INTERACTION_CLOSURE_MISSING"
      || !recoverableRequestActionIds.has(diagnostic.nodeId))
    || diagnostics.requests.some((request) => !recoverableRequestActionIds.has(request.actionId));
}

export interface InteractionCompilationResult {
  /** 权威原始模型计划的哈希值。 */
  readonly sourceSolutionPlanHash: string;
  /** 用于编译的服务器衍生计划的哈希值。 */
  readonly loweredSolutionPlanHash: string;
  readonly implementation: UIImplementationSpecV2;
  readonly diagnostics: {
    readonly errors: readonly InteractionDiagnostic[];
    readonly warnings: readonly InteractionDiagnostic[];
    readonly requests: readonly InteractionCompilationRequest[];
  };
}

interface TrustedTrace {
  readonly actions: ReadonlyMap<string, { readonly successors: readonly string[]; readonly triggerKey: string }>;
  readonly triggers: ReadonlyMap<string, readonly string[]>;
}

const traces = new WeakMap<InteractionCompilationResult, TrustedTrace>();
const RESERVED_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function failInput(code: string, detail: string): never {
  throw new Error(`${code}: ${detail}`);
}

function clonePureData(value: unknown, path = "input", depth = 0, seen = new WeakSet<object>(), budget = { nodes: 0 }): unknown {
  budget.nodes += 1;
  if (budget.nodes > 250_000 || depth > 128) return failInput("INTERACTION_INPUT_INVALID", `${path} exceeds input bounds`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : failInput("INTERACTION_INPUT_INVALID", `${path} contains a non-finite number`);
  if (typeof value !== "object" || utilTypes.isProxy(value)) return failInput("INTERACTION_INPUT_INVALID", `${path} must be descriptor-safe JSON data`);
  if (seen.has(value)) return failInput("INTERACTION_INPUT_INVALID", `${path} contains a cycle`);
  seen.add(value);
  let prototype: object | null;
  let keys: readonly PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return failInput("INTERACTION_INPUT_INVALID", `${path} descriptor inspection failed`);
  }
  if (keys.some((key) => typeof key !== "string" || RESERVED_KEYS.has(key))) return failInput("INTERACTION_INPUT_INVALID", `${path} has an unsafe key`);
  const cloneValue = (key: string): unknown => {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) return failInput("INTERACTION_INPUT_INVALID", `${path}.${key} must be an enumerable data property`);
    return clonePureData(descriptor.value, `${path}.${key}`, depth + 1, seen, budget);
  };
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype || keys.filter((key) => key !== "length").length !== value.length) return failInput("INTERACTION_INPUT_INVALID", `${path} must be a dense array`);
    const result = Array.from({ length: value.length }, (_, index) => cloneValue(String(index)));
    seen.delete(value);
    return result;
  }
  if (prototype !== Object.prototype && prototype !== null) return failInput("INTERACTION_INPUT_INVALID", `${path} must be a plain object`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) Object.defineProperty(result, key, { value: cloneValue(key), enumerable: true });
  seen.delete(value);
  return result;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function rawRecord(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
}

/**
 * The plan schema correctly rejects multiple propagated trigger owners, but its
 * aggregate error cannot identify the crossing edge. Inspect the already
 * descriptor-safe clone before schema refinement so this compiler can fail on
 * the exact edge instead of accepting an ambiguous interaction graph.
 */
function rejectRawCrossTriggerEdges(rawPlan: unknown): void {
  const plan = rawRecord(rawPlan);
  if (plan === undefined) return;
  const directTriggers = new Map<string, Set<string>>();
  const pending: unknown[] = [];
  for (const pageValue of Array.isArray(plan.pages) ? plan.pages : []) {
    const page = rawRecord(pageValue);
    if (page !== undefined) pending.push(page.root);
  }
  for (const overlayValue of Array.isArray(plan.overlays) ? plan.overlays : []) {
    const overlay = rawRecord(overlayValue);
    if (overlay !== undefined) pending.push(overlay.root);
  }
  while (pending.length > 0) {
    const node = rawRecord(pending.pop());
    if (node === undefined) continue;
    if (typeof node.id === "string" && Array.isArray(node.eventBindings)) {
      for (const bindingValue of node.eventBindings) {
        const binding = rawRecord(bindingValue);
        if (binding === undefined || typeof binding.semanticEvent !== "string" || !Array.isArray(binding.actionIds)) continue;
        for (const actionId of binding.actionIds) {
          if (typeof actionId !== "string") continue;
          const triggers = directTriggers.get(actionId) ?? new Set<string>();
          triggers.add(`${node.id}\0${binding.semanticEvent}`);
          directTriggers.set(actionId, triggers);
        }
      }
    }
    if (node.kind === "layout" && Array.isArray(node.children)) node.children.forEach((child: unknown) => pending.push(child));
    if (node.kind === "registered-module" && Array.isArray(node.slots)) {
      for (const slotValue of node.slots) {
        const slot = rawRecord(slotValue);
        if (slot !== undefined && Array.isArray(slot.children)) slot.children.forEach((child: unknown) => pending.push(child));
      }
    }
    if (node.kind === "repeater") pending.push(node.template);
  }
  for (const actionValue of Array.isArray(plan.actions) ? plan.actions : []) {
    const action = rawRecord(actionValue);
    if (action === undefined || typeof action.id !== "string" || !Array.isArray(action.afterActionIds)) continue;
    const source = directTriggers.get(action.id);
    if (source?.size !== 1) continue;
    for (const successorId of action.afterActionIds) {
      if (typeof successorId !== "string") continue;
      const successor = directTriggers.get(successorId);
      if (successor?.size === 1 && [...source][0] !== [...successor][0]) {
        return failInput("INTERACTION_CROSS_TRIGGER_EDGE", `${action.id} -> ${successorId}`);
      }
    }
  }
}

function snapshotInput(input: unknown): { blueprint: CustomerSolutionBlueprint; plan: SolutionImplementationPlan; implementation: UIImplementationSpecV2 } {
  const cloned = clonePureData(input) as Record<string, unknown>;
  if (cloned === null || typeof cloned !== "object" || Array.isArray(cloned)
    || Object.keys(cloned).sort().join("\0") !== "blueprint\0implementation\0plan") {
    return failInput("INTERACTION_INPUT_INVALID", "exact blueprint, plan and implementation fields are required");
  }
  rejectRawCrossTriggerEdges(cloned.plan);
  const blueprint = CustomerSolutionBlueprintSchema.safeParse(cloned.blueprint);
  const plan = SolutionImplementationPlanSchema.safeParse(cloned.plan);
  const implementation = UIImplementationSpecV2Schema.safeParse(cloned.implementation);
  if (!blueprint.success) return failInput("INTERACTION_INPUT_INVALID", `blueprint: ${blueprint.error.issues[0]?.message ?? "invalid"}`);
  if (!plan.success) return failInput("INTERACTION_INPUT_INVALID", `plan: ${plan.error.issues[0]?.message ?? "invalid"}`);
  if (!implementation.success || implementation.data.compatibility !== "native") {
    return failInput("INTERACTION_INPUT_INVALID", `implementation: ${implementation.success ? "native v2 required" : implementation.error.issues[0]?.message ?? "invalid"}`);
  }
  if (implementation.data.sourceSolutionPlanHash !== canonicalServerHash(plan.data)) {
    return failInput("INTERACTION_INPUT_PROVENANCE_MISMATCH", "solution-plan hash does not match authoritative plan bytes");
  }
  if (plan.data.blueprintHash !== canonicalServerHash(blueprint.data)) {
    return failInput("INTERACTION_INPUT_PROVENANCE_MISMATCH", "blueprint hash does not match the authoritative confirmed blueprint");
  }
  let registryHash: string;
  try {
    registryHash = solutionModuleRegistryHash(plan.data, createDefaultModuleRegistry());
  } catch {
    return failInput("INTERACTION_INPUT_PROVENANCE_MISMATCH", "module-registry hash cannot be recomputed from the trusted default registry");
  }
  if (implementation.data.sourceModuleRegistryHash !== registryHash) {
    return failInput("INTERACTION_INPUT_PROVENANCE_MISMATCH", "module-registry hash does not match the trusted default registry");
  }
  const hasBindings = implementation.data.pages.some((page) => page.compatibility === "native" && page.controls.some((control) => control.eventBindings.length > 0));
  if (implementation.data.compiledActions.length > 0 || implementation.data.compiledScripts.length > 0 || hasBindings) {
    return failInput("INTERACTION_INPUT_ALREADY_COMPILED", "compileInteractions accepts only authoritative phase-three UI v2 input");
  }
  return { blueprint: blueprint.data, plan: plan.data, implementation: implementation.data };
}

function codePointCompare(left: string, right: string): number {
  const a = Array.from(left); const b = Array.from(right);
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index]!.codePointAt(0)! - b[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

function diagnostic(code: InteractionDiagnosticCode, nodeId: string, message: string): InteractionDiagnostic {
  return { code, nodeId, message };
}

function requestDiagnostic(request: TypedScriptRequest, reason: string): InteractionCompilationRequest {
  return {
    actionId: request.actionId,
    ...(request.sourceScriptId === undefined ? {} : { sourceScriptId: request.sourceScriptId }),
    status: "blocked",
    reason,
  };
}

function bindingKey(binding: CompiledEventBinding): string {
  return `${binding.ownerInstanceName}\0${binding.kfEvent}\0${binding.linkId ?? ""}\0${binding.phase}`;
}

function mergeBindings(
  bindings: readonly CompiledEventBinding[],
  errors: InteractionDiagnostic[],
  requests: InteractionCompilationRequest[],
  actionOrder: ReadonlyMap<string, number>,
  actionByNativeId: ReadonlyMap<string, string>,
  actionByScriptId: ReadonlyMap<string, string>,
  semanticControlByInstance: ReadonlyMap<string, string>,
): { bindings: CompiledEventBinding[]; blockedNativeIds: Set<string>; blockedScriptIds: Set<string> } {
  const groups = new Map<string, CompiledEventBinding[]>();
  bindings.forEach((binding) => groups.set(bindingKey(binding), [...(groups.get(bindingKey(binding)) ?? []), binding]));
  const merged: CompiledEventBinding[] = [];
  const blockedNativeIds = new Set<string>();
  const blockedScriptIds = new Set<string>();
  const byOrder = (map: ReadonlyMap<string, string>) => (left: string, right: string): number =>
    (actionOrder.get(map.get(left) ?? "") ?? Number.MAX_SAFE_INTEGER) - (actionOrder.get(map.get(right) ?? "") ?? Number.MAX_SAFE_INTEGER);
  for (const [key, group] of [...groups].sort(([left], [right]) => codePointCompare(left, right))) {
    const scriptModuleIds = Array.from(new Set(group.flatMap((binding) => binding.scriptModuleIds))).sort(byOrder(actionByScriptId));
    const nativeActionIds = Array.from(new Set(group.flatMap((binding) => binding.nativeActionIds))).sort(byOrder(actionByNativeId));
    if (scriptModuleIds.length > 16 || nativeActionIds.length > 16) {
      errors.push(diagnostic("INTERACTION_CAPACITY_OVERFLOW", group[0]!.ownerInstanceName, "binding exceeds sixteen scripts or actions"));
      continue;
    }
    const first = group[0]!;
    if (scriptModuleIds.length > 0 && nativeActionIds.length > 0) {
      scriptModuleIds.forEach((id) => blockedScriptIds.add(id));
      nativeActionIds.forEach((id) => blockedNativeIds.add(id));
      const actionIds = [...nativeActionIds.map((id) => actionByNativeId.get(id)), ...scriptModuleIds.map((id) => actionByScriptId.get(id))]
        .filter((id): id is string => id !== undefined).sort((left, right) => (actionOrder.get(left) ?? 0) - (actionOrder.get(right) ?? 0));
      const nodeId = semanticControlByInstance.get(first.ownerInstanceName) ?? first.ownerInstanceName;
      errors.push(diagnostic("INTERACTION_BINDING_TIER_ORDER_UNREPRESENTABLE", nodeId, `same-event native/script order cannot be represented: ${actionIds.join(" -> ")}`));
      actionIds.forEach((actionId) => requests.push({ actionId, status: "blocked", reason: "BINDING_TIER_ORDER_UNREPRESENTABLE" }));
      continue;
    }
    const identity = createHash("sha256").update(key).digest("hex").slice(0, 16);
    merged.push({
      id: group.length === 1 ? first.id : `kf$binding:merged-${identity}`,
      ownerInstanceName: first.ownerInstanceName, kfEvent: first.kfEvent,
      ...(first.linkId === undefined ? {} : { linkId: first.linkId }), phase: first.phase,
      scriptModuleIds, nativeActionIds,
    });
  }
  return { bindings: merged, blockedNativeIds, blockedScriptIds };
}

function verifyCompiledModule(module: CompiledScriptModule): string | undefined {
  const hash = createHash("sha256").update(module.source, "utf8").digest("hex");
  if (hash !== module.sourceHash) return "source hash mismatch";
  try { parse(module.source, { ecmaVersion: 2022, sourceType: "script" }); } catch (error) { return `ECMAScript 2022 parse failure: ${String(error)}`; }
  if (/\$(?:control|event|page|overlay|state|data|feedback|timer)\b/.test(module.source)) return "semantic API remains in emitted source";
  if (/\b(?:window|document|globalThis|fetch|XMLHttpRequest|WebSocket|eval|Function)\b/.test(module.source)) return "forbidden global remains in emitted source";
  for (const reference of module.instanceReferences) {
    if (!new RegExp(`\\b${reference.instanceName.replace(/[$]/g, "\\$")}\\b`).test(module.source)
      && reference.instanceName !== module.ownerInstanceName) return `declared instance reference is absent: ${reference.instanceName}`;
  }
  for (const reference of module.pageReferences) {
    if (!module.source.includes(JSON.stringify(reference.pageGuid))) return `declared page reference is absent: ${reference.pageGuid}`;
  }
  return undefined;
}

function findCycles(edges: ReadonlyMap<string, readonly string[]>): string[][] {
  const cycles: string[][] = [];
  const done = new Set<string>();
  const active: string[] = [];
  const visit = (id: string): void => {
    const position = active.indexOf(id);
    if (position >= 0) { cycles.push([...active.slice(position), id]); return; }
    if (done.has(id)) return;
    active.push(id);
    (edges.get(id) ?? []).forEach(visit);
    active.pop(); done.add(id);
  };
  [...edges.keys()].sort(codePointCompare).forEach(visit);
  return cycles;
}

function isVisibleCall(call: ValidatedSemanticCall): boolean {
  return ["$control.setData", "$control.setValue", "$control.setVisible", "$overlay.open", "$overlay.close", "$page.navigate", "$feedback.show"].includes(call.api);
}

export function compileInteractions(input: unknown): InteractionCompilationResult {
  const { blueprint, plan: sourcePlan, implementation } = snapshotInput(input);
  const sourceSolutionPlanHash = canonicalServerHash(sourcePlan);
  const plan = lowerReviewedInteractionIntents(sourcePlan);
  const loweredSolutionPlanHash = canonicalServerHash(plan);
  const normalized = normalizeActionGraph({ plan, implementation });
  const native = compileNativeActions({ normalized });
  const errors: InteractionDiagnostic[] = [];
  const warnings: InteractionDiagnostic[] = [];
  const requests: InteractionCompilationRequest[] = [];
  const compiledScripts: CompiledScriptModule[] = [];
  const scriptBindings: CompiledEventBinding[] = [];
  const actionByScriptModuleId = new Map<string, string>();
  const scheduledByScript = new Map<string, readonly string[]>();
  const visibleScriptIds = new Set<string>();
  const callsByAction = new Map<string, readonly ValidatedSemanticCall[]>();
  const scriptById = new Map(plan.scripts.map((script) => [script.id, script]));

  const actionOrder = new Map(normalized.executionOrder.map((id, index) => [id, index]));
  for (const request of [...native.scriptRequests].sort((left, right) => (actionOrder.get(left.actionId) ?? 0) - (actionOrder.get(right.actionId) ?? 0))) {
    if (request.reason !== "RUN_SCRIPT_REQUIRES_VALIDATION" || request.sourceScriptId === undefined) {
      requests.push(requestDiagnostic(request, request.reason));
      if (request.reason !== "TRIGGER_EVENT_UNSUPPORTED") {
        errors.push(diagnostic("INTERACTION_SCRIPT_BLOCKED", request.actionId, request.reason));
      }
      continue;
    }
    const script = scriptById.get(request.sourceScriptId);
    if (script === undefined) {
      errors.push(diagnostic("INTERACTION_SCRIPT_BLOCKED", request.sourceScriptId, "script is missing from the authoritative plan"));
      requests.push(requestDiagnostic(request, "SCRIPT_MISSING"));
      continue;
    }
    try {
      const context = createSemanticScriptApiContext({
        // The trusted API context independently reruns lowering from the raw
        // plan. No lowered hash is written into the model-owned implementation
        // provenance field.
        plan, sourcePlan, implementation, ownerControlId: request.ownerControlId,
        activeEvent: { controlId: request.ownerControlId, semanticEvent: request.semanticEvent },
      });
      let compiled: CompiledScriptPlan;
      let calls: readonly ValidatedSemanticCall[];
      if (script.kind === "custom") {
        if (script.programVersion !== "semantic-js/v1" || script.source === undefined) throw new Error("declarative script has no reviewed emitter");
        const identity = createSemanticScriptValidationIdentity(script, context);
        const validatedAst = validateCustomScript({ source: script.source, inputs: script.inputs, outputs: script.outputs, context, currentScriptIdentity: identity });
        // Scheduling edges are static semantic facts and remain authoritative
        // even when the target runtime API is still planned and emission is
        // blocked later. This prevents a planned timer from hiding a cycle.
        scheduledByScript.set(script.id, validatedAst.scheduledScriptIds);
        compiled = compileScriptPlan({ script, context, validationIdentity: identity, validatedAst, binding: { controlId: request.ownerControlId, semanticEvent: request.semanticEvent } });
        calls = validatedAst.calls;
      } else {
        compiled = compileScriptPlan({ script, context, binding: { controlId: request.ownerControlId, semanticEvent: request.semanticEvent } });
        // Template compilation uses the same validator internally; emitted KF
        // source is the authoritative visible-effect evidence at this layer.
        calls = [];
      }
      const sourceIssue = verifyCompiledModule(compiled.module);
      if (sourceIssue !== undefined) throw new Error(sourceIssue);
      compiledScripts.push(compiled.module);
      callsByAction.set(request.actionId, calls);
      actionByScriptModuleId.set(compiled.module.id, request.actionId);
      if (compiled.binding !== undefined) scriptBindings.push(compiled.binding);
      scheduledByScript.set(script.id, compiled.scheduledScriptIds);
      if (calls.some((call) => isVisibleCall(call) && call.execution !== "conditional")
        || (calls.length === 0 && /(?:\.(?:SetData|SetValue|SetVisible)|\bShowMessage)\s*\(/.test(compiled.module.source))) visibleScriptIds.add(script.id);
      if (calls.some((call) => isVisibleCall(call) && call.execution === "conditional")
        && !calls.some((call) => isVisibleCall(call) && call.execution !== "conditional")) {
        errors.push(diagnostic("INTERACTION_CLOSURE_MISSING", script.id, "conditional visible effects do not prove every branch terminates visibly"));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/conditional|unconditional execution/i.test(message)) {
        errors.push(diagnostic("INTERACTION_CONDITIONAL_CLOSURE_UNPROVEN", request.actionId, "script condition branches do not each prove a visible terminal result"));
      }
      errors.push(diagnostic("INTERACTION_SCRIPT_BLOCKED", script.id, message));
      requests.push(requestDiagnostic(request, message));
    }
  }

  for (const cycle of findCycles(scheduledByScript)) {
    errors.push(diagnostic("INTERACTION_SCRIPT_CYCLE", cycle[0]!, `scheduled script cycle: ${cycle.join(" -> ")}`));
  }

  const actionByNativeId = new Map(native.actions.map((action) => [action.id, action.sourceActionId]));
  const semanticControlByInstance = new Map(implementation.runtimeCorrelation?.controls.map((entry) => [entry.instanceName, entry.semanticControlId]) ?? []);
  const mergedBindings = mergeBindings(
    [...native.bindings, ...scriptBindings], errors, requests, actionOrder,
    actionByNativeId, actionByScriptModuleId, semanticControlByInstance,
  );
  const bindings = mergedBindings.bindings;
  const emittedActions = native.actions.filter((action) => !mergedBindings.blockedNativeIds.has(action.id));
  const emittedScripts = compiledScripts.filter((module) => !mergedBindings.blockedScriptIds.has(module.id));
  const emittedNativeActionIds = new Set(emittedActions.map((action) => action.sourceActionId));
  const emittedScriptActionIds = new Set(emittedScripts.map((module) => actionByScriptModuleId.get(module.id)).filter((id): id is string => id !== undefined));
  const visibleActionIds = new Set<string>();
  normalized.graph.actions.forEach((action) => {
    if (emittedNativeActionIds.has(action.id) && action.effects.some((effect) =>
      ["navigate-page", "open-overlay", "close-overlay", "set-visibility", "switch-tab", "set-control-value", "show-feedback"].includes(effect.kind))) visibleActionIds.add(action.id);
    if (emittedScriptActionIds.has(action.id) && action.effects.some((effect) => effect.kind === "run-script" && visibleScriptIds.has(effect.scriptId))) visibleActionIds.add(action.id);
    if (action.conditions.length > 0) {
      errors.push(diagnostic("INTERACTION_CONDITIONAL_CLOSURE_UNPROVEN", action.id, "the contract has no explicit else branch, so every conditional path cannot be proven visible"));
      visibleActionIds.delete(action.id);
    }
  });
  const graphActionById = new Map(normalized.graph.actions.map((action) => [action.id, action]));
  const triggerKeyByAction = new Map(normalized.graph.actions.map((action) => [
    action.id,
    `${action.trigger.controlId}\0${action.trigger.semanticEvent}`,
  ]));
  const actionIdsByTrigger = new Map<string, Set<string>>();
  normalized.graph.actions.forEach((action) => {
    const triggerKey = triggerKeyByAction.get(action.id)!;
    const actionIds = actionIdsByTrigger.get(triggerKey) ?? new Set<string>();
    actionIds.add(action.id);
    actionIdsByTrigger.set(triggerKey, actionIds);
    action.afterActionIds.forEach((successorId) => {
      const successorTriggerKey = triggerKeyByAction.get(successorId);
      if (successorTriggerKey !== undefined && successorTriggerKey !== triggerKey) {
        failInput("INTERACTION_CROSS_TRIGGER_EDGE", `${action.id} -> ${successorId}`);
      }
    });
  });
  const journeyById = new Map(blueprint.journeys.map((journey) => [journey.id, journey]));
  const triggerOwnerByControl = new Map<string, { pageId: string; regionIds: ReadonlySet<string> }>();
  implementation.pages.forEach((page) => {
    if (page.compatibility !== "native") return;
    page.controls.forEach((control) => triggerOwnerByControl.set(control.id, {
      pageId: page.sourceBlueprintPageId,
      regionIds: new Set(control.sourceBlueprintRegionIds),
    }));
  });
  const triggersByJourneyStep = new Map<string, Set<string>>();
  plan.actions.forEach((action) => {
    const graphAction = graphActionById.get(action.id);
    const triggerKey = triggerKeyByAction.get(action.id);
    (action.journeyStepRefs ?? []).forEach((reference) => {
      const stepKey = `${reference.journeyId}:${reference.stepIndex}`;
      const step = journeyById.get(reference.journeyId)?.steps[reference.stepIndex];
      if (step === undefined) {
        errors.push(diagnostic("JOURNEY_REFERENCE_UNKNOWN", action.id, `unknown journey step reference: ${stepKey}`));
        return;
      }
      const owner = graphAction === undefined ? undefined : triggerOwnerByControl.get(graphAction.trigger.controlId);
      if (owner === undefined || owner.pageId !== step.pageId || !owner.regionIds.has(step.regionId)) {
        errors.push(diagnostic("JOURNEY_TRIGGER_OWNERSHIP_MISMATCH", action.id, `trigger does not belong to ${step.pageId}/${step.regionId}`));
        return;
      }
      if (triggerKey !== undefined) {
        const triggerKeys = triggersByJourneyStep.get(stepKey) ?? new Set<string>();
        triggerKeys.add(triggerKey);
        triggersByJourneyStep.set(stepKey, triggerKeys);
      }
    });
  });
  triggersByJourneyStep.forEach((triggerKeys, stepKey) => {
    if (triggerKeys.size > 1) errors.push(diagnostic("JOURNEY_REFERENCE_AMBIGUOUS", stepKey, "journey step is mapped to more than one trigger closure"));
  });
  const reachable = new Set<string>();
  const observableClosureByTrigger = new Map<string, boolean>();
  for (const [triggerKey, actionIds] of actionIdsByTrigger) {
    const incoming = new Map(Array.from(actionIds, (id) => [id, 0]));
    actionIds.forEach((id) => graphActionById.get(id)?.afterActionIds.forEach((successorId) => {
      if (actionIds.has(successorId)) incoming.set(successorId, (incoming.get(successorId) ?? 0) + 1);
    }));
    const roots = normalized.executionOrder.filter((id) => actionIds.has(id) && incoming.get(id) === 0);
    const closure = analyzeObservableClosure(new Map([...actionIds].map((id) => {
      const action = graphActionById.get(id);
      return [id, {
        successors: (action?.afterActionIds ?? []).filter((successorId) => actionIds.has(successorId)),
        visible: visibleActionIds.has(id),
      }];
    })), roots);
    closure.reachable.forEach((id) => reachable.add(id));
    closure.missingRoots.forEach((root) => {
      errors.push(diagnostic("INTERACTION_CLOSURE_MISSING", root, "at least one trigger path has no visible terminal result"));
    });
    const observable = roots.length > 0 && !closure.missingObservablePath;
    observableClosureByTrigger.set(triggerKey, observable);
  }
  triggersByJourneyStep.forEach((triggerKeys, stepKey) => {
    if (triggerKeys.size === 1 && observableClosureByTrigger.get([...triggerKeys][0]!) !== true) {
      errors.push(diagnostic("JOURNEY_CLOSURE_MISSING", stepKey, "mapped trigger closure has no observable front-end result"));
    }
  });
  const observableJourneyCoverage = new Set<string>();
  triggersByJourneyStep.forEach((triggerKeys, stepKey) => {
    if ([...triggerKeys].some((triggerKey) => observableClosureByTrigger.get(triggerKey) === true)) {
      observableJourneyCoverage.add(stepKey);
    }
  });
  blueprint.journeys.forEach((journey) => journey.steps.forEach((_step, stepIndex) => {
    const stepKey = `${journey.id}:${stepIndex}`;
    if (!observableJourneyCoverage.has(stepKey)) {
      errors.push(diagnostic("JOURNEY_STEP_UNCOVERED", stepKey, "confirmed journey step has no ownership-correct observable trigger closure"));
    }
  }));
  normalized.executionOrder.filter((id) => !reachable.has(id)).forEach((id) =>
    errors.push(diagnostic("INTERACTION_CLOSURE_MISSING", id, "action is unreachable from every trigger root")));

  const uiMockDataConsumersByPage = new Map<string, Set<string>>();
  const pageByControlId = new Map<string, string>();
  implementation.pages.forEach((page) => page.compatibility === "native" && page.controls.forEach((control) => {
    pageByControlId.set(control.id, page.id);
    if (control.dataBinding !== undefined) {
      const consumers = uiMockDataConsumersByPage.get(page.id) ?? new Set<string>();
      consumers.add(control.dataBinding.mockDataId);
      uiMockDataConsumersByPage.set(page.id, consumers);
    }
  }));
  const uiStateConsumersByPage = new Map<string, Set<string>>();
  plan.overlays.forEach((overlay) => {
    const consumers = uiStateConsumersByPage.get(overlay.hostPageId) ?? new Set<string>();
    consumers.add(overlay.visibleStateId);
    uiStateConsumersByPage.set(overlay.hostPageId, consumers);
  });
  const emittedActionIds = new Set([...emittedNativeActionIds, ...emittedScriptActionIds]);
  const scriptInputsById = new Map(plan.scripts.map((script) => [script.id, script.inputs]));
  const planActionById = new Map(plan.actions.map((action) => [action.id, action]));
  const downstream = (producerId: string, consumerId: string): boolean => {
    if (producerId === consumerId || !emittedActionIds.has(consumerId)
      || triggerKeyByAction.get(producerId) !== triggerKeyByAction.get(consumerId)) return false;
    const pending = [...(graphActionById.get(producerId)?.afterActionIds ?? [])];
    const visited = new Set<string>();
    while (pending.length > 0) {
      const candidate = pending.pop()!;
      if (visited.has(candidate) || !emittedActionIds.has(candidate)
        || triggerKeyByAction.get(candidate) !== triggerKeyByAction.get(producerId)) continue;
      if (candidate === consumerId) return true;
      visited.add(candidate);
      pending.push(...(graphActionById.get(candidate)?.afterActionIds ?? []));
    }
    return false;
  };
  const hasEmittedConsumer = (producerId: string, refKind: "control" | "mock-data" | "local-state", refId: string): boolean =>
    normalized.graph.actions.some((candidate) => {
      if (!downstream(producerId, candidate.id)) return false;
      const scriptConsumes = candidate.effects.some((effect) => effect.kind === "run-script"
        && (scriptInputsById.get(effect.scriptId) ?? []).some((input) => input.refKind === refKind && input.refId === refId));
      if (scriptConsumes) return true;
      if (refKind !== "local-state" || !emittedNativeActionIds.has(candidate.id)) return false;
      const planAction = planActionById.get(candidate.id);
      return planAction?.conditions?.some((condition) => [condition.left, condition.right].some((operand) => operand.kind === "local-state" && operand.stateId === refId)) === true
        || planAction?.kind === "set-control-value" && planAction.value.kind === "local-state" && planAction.value.stateId === refId;
    });
  normalized.graph.actions.forEach((action) => action.effects.forEach((effect) => {
    if (effect.kind !== "run-script") return;
    if (!emittedScriptActionIds.has(action.id) || !reachable.has(action.id)) return;
    const calls = callsByAction.get(action.id) ?? [];
    const producerPageId = pageByControlId.get(action.trigger.controlId);
    for (const output of normalized.scriptClosures.get(effect.scriptId)?.candidateOutputRefs ?? []) {
      const authoritativeScript = scriptById.get(effect.scriptId);
      const reviewedTemplatePublishesOutput = authoritativeScript?.kind === "template"
        && authoritativeScript.outputs.some((declared) => declared.refKind === output.refKind && declared.refId === output.refId);
      const consumed = reviewedTemplatePublishesOutput || (output.refKind === "control"
        ? calls.some((call) => call.targetId === output.refId && isVisibleCall(call) && call.execution !== "conditional")
          || hasEmittedConsumer(action.id, "control", output.refId)
        : output.refKind === "mock-data" ? (producerPageId !== undefined && uiMockDataConsumersByPage.get(producerPageId)?.has(output.refId) === true)
            || hasEmittedConsumer(action.id, "mock-data", output.refId)
          : (producerPageId !== undefined && uiStateConsumersByPage.get(producerPageId)?.has(output.refId) === true)
            || hasEmittedConsumer(action.id, "local-state", output.refId));
      if (!consumed) errors.push(diagnostic("INTERACTION_OUTPUT_CONSUMER_MISSING", effect.scriptId, `${output.refKind} output has no proven UI or script consumer: ${output.refId}`));
    }
  }));
  const duplicateModuleIds = compiledScripts.map((module) => module.id).filter((id, index, all) => all.indexOf(id) !== index);
  duplicateModuleIds.forEach((id) => errors.push(diagnostic("INTERACTION_BINDING_DUPLICATE", id, "duplicate compiled module identity")));
  const bindingByInstance = new Map<string, CompiledEventBinding[]>();
  bindings.forEach((binding) => bindingByInstance.set(binding.ownerInstanceName, [...(bindingByInstance.get(binding.ownerInstanceName) ?? []), binding]));
  const instanceByControl = new Map(implementation.runtimeCorrelation?.controls.map((entry) => [entry.semanticControlId, entry.instanceName]) ?? []);
  const outputCandidate = {
    ...implementation,
    compiledActions: [...emittedActions].sort((left, right) => (actionOrder.get(left.sourceActionId) ?? 0) - (actionOrder.get(right.sourceActionId) ?? 0)),
    compiledScripts: [...emittedScripts].sort((left, right) => (actionOrder.get(actionByScriptModuleId.get(left.id) ?? "") ?? 0) - (actionOrder.get(actionByScriptModuleId.get(right.id) ?? "") ?? 0)),
    pages: implementation.pages.map((page) => page.compatibility !== "native" ? page : ({
      ...page,
      controls: page.controls.map((control) => ({
        ...control,
        eventBindings: [...(bindingByInstance.get(instanceByControl.get(control.id) ?? "") ?? [])]
          .sort((left, right) => codePointCompare(left.id, right.id)),
      })),
    })),
  };
  const parsedOutput = UIImplementationSpecV2Schema.safeParse(outputCandidate);
  if (!parsedOutput.success) {
    errors.push(diagnostic("INTERACTION_COMPILED_SOURCE_INVALID", "implementation", parsedOutput.error.issues[0]?.message ?? "compiled UI v2 is invalid"));
  }
  const result = deepFreeze({
    sourceSolutionPlanHash,
    loweredSolutionPlanHash,
    implementation: parsedOutput.success ? parsedOutput.data : implementation,
    diagnostics: {
      errors: errors.sort((left, right) => codePointCompare(`${left.code}\0${left.nodeId}\0${left.message}`, `${right.code}\0${right.nodeId}\0${right.message}`)),
      warnings, requests: requests.sort((left, right) => codePointCompare(`${left.actionId}\0${left.sourceScriptId ?? ""}`, `${right.actionId}\0${right.sourceScriptId ?? ""}`)),
    },
  }) as InteractionCompilationResult;
  const actionMap = new Map(normalized.graph.actions.map((action) => [action.id, {
    successors: action.afterActionIds,
    triggerKey: `${action.trigger.controlId}\0${action.trigger.semanticEvent}`,
  }]));
  const triggerMap = new Map<string, string[]>();
  const incomingByTrigger = new Map<string, number>();
  normalized.graph.actions.forEach((action) => action.afterActionIds.forEach((successorId) => {
    const successor = actionMap.get(successorId);
    const key = `${action.trigger.controlId}\0${action.trigger.semanticEvent}`;
    if (successor?.triggerKey === key) incomingByTrigger.set(successorId, (incomingByTrigger.get(successorId) ?? 0) + 1);
  }));
  normalized.executionOrder.forEach((actionId) => {
    if ((incomingByTrigger.get(actionId) ?? 0) !== 0) return;
    const key = actionMap.get(actionId)?.triggerKey;
    if (key !== undefined) triggerMap.set(key, [...(triggerMap.get(key) ?? []), actionId]);
  });
  traces.set(result, { actions: actionMap, triggers: triggerMap });
  return result;
}

export function traceInteraction(result: InteractionCompilationResult, controlId: string, semanticEvent: string): readonly string[] {
  const trace = traces.get(result);
  if (trace === undefined) throw new Error("INTERACTION_TRACE_UNTRUSTED: result is not compiler-owned");
  const output: string[] = [];
  const visited = new Set<string>();
  const visit = (id: string): void => {
    if (visited.has(id)) return;
    visited.add(id); output.push(id);
    const action = trace.actions.get(id);
    [...(action?.successors ?? [])].sort(codePointCompare).forEach((successorId) => {
      if (trace.actions.get(successorId)?.triggerKey === action?.triggerKey) visit(successorId);
    });
  };
  (trace.triggers.get(`${controlId}\0${semanticEvent}`) ?? []).forEach(visit);
  return Object.freeze(output);
}
