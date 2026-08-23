import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";
import { parse } from "acorn";
import {
  SolutionImplementationPlanSchema,
  UIImplementationSpecV2Schema,
  type CompiledEventBinding,
  type CompiledScriptModule,
  type SolutionImplementationPlan,
  type UIImplementationSpecV2,
} from "@kf/contracts";
import { compileNativeActions, type TypedScriptRequest } from "./action-compiler.js";
import { normalizeActionGraph } from "./action-graph.js";
import { validateCustomScript, type ValidatedSemanticCall } from "./custom-script-validator.js";
import {
  createSemanticScriptApiContext,
  createSemanticScriptValidationIdentity,
} from "./semantic-script-api.js";
import { compileScriptPlan, type CompiledScriptPlan } from "./script-compiler.js";

export type InteractionDiagnosticCode =
  | "INTERACTION_BINDING_DUPLICATE"
  | "INTERACTION_CAPACITY_OVERFLOW"
  | "INTERACTION_CLOSURE_MISSING"
  | "INTERACTION_COMPILED_SOURCE_INVALID"
  | "INTERACTION_SCRIPT_BLOCKED"
  | "INTERACTION_SCRIPT_CYCLE"
  | "JOURNEY_PROVENANCE_UNAVAILABLE";

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

export interface InteractionCompilationResult {
  readonly implementation: UIImplementationSpecV2;
  readonly diagnostics: {
    readonly errors: readonly InteractionDiagnostic[];
    readonly warnings: readonly InteractionDiagnostic[];
    readonly requests: readonly InteractionCompilationRequest[];
  };
}

interface TrustedTrace {
  readonly actions: ReadonlyMap<string, { readonly successors: readonly string[] }>;
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

function snapshotInput(input: unknown): { plan: SolutionImplementationPlan; implementation: UIImplementationSpecV2 } {
  const cloned = clonePureData(input) as Record<string, unknown>;
  if (cloned === null || typeof cloned !== "object" || Array.isArray(cloned)
    || Object.keys(cloned).sort().join("\0") !== "implementation\0plan") {
    return failInput("INTERACTION_INPUT_INVALID", "exact plan and implementation fields are required");
  }
  const plan = SolutionImplementationPlanSchema.safeParse(cloned.plan);
  const implementation = UIImplementationSpecV2Schema.safeParse(cloned.implementation);
  if (!plan.success) return failInput("INTERACTION_INPUT_INVALID", `plan: ${plan.error.issues[0]?.message ?? "invalid"}`);
  if (!implementation.success || implementation.data.compatibility !== "native") {
    return failInput("INTERACTION_INPUT_INVALID", `implementation: ${implementation.success ? "native v2 required" : implementation.error.issues[0]?.message ?? "invalid"}`);
  }
  const hasBindings = implementation.data.pages.some((page) => page.compatibility === "native" && page.controls.some((control) => control.eventBindings.length > 0));
  if (implementation.data.compiledActions.length > 0 || implementation.data.compiledScripts.length > 0 || hasBindings) {
    return failInput("INTERACTION_INPUT_ALREADY_COMPILED", "compileInteractions accepts only authoritative phase-three UI v2 input");
  }
  return { plan: plan.data, implementation: implementation.data };
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

function mergeBindings(bindings: readonly CompiledEventBinding[], errors: InteractionDiagnostic[]): CompiledEventBinding[] {
  const groups = new Map<string, CompiledEventBinding[]>();
  bindings.forEach((binding) => groups.set(bindingKey(binding), [...(groups.get(bindingKey(binding)) ?? []), binding]));
  const merged: CompiledEventBinding[] = [];
  for (const [key, group] of [...groups].sort(([left], [right]) => codePointCompare(left, right))) {
    const scriptModuleIds = Array.from(new Set(group.flatMap((binding) => binding.scriptModuleIds))).sort(codePointCompare);
    const nativeActionIds = Array.from(new Set(group.flatMap((binding) => binding.nativeActionIds))).sort(codePointCompare);
    if (scriptModuleIds.length > 16 || nativeActionIds.length > 16) {
      errors.push(diagnostic("INTERACTION_CAPACITY_OVERFLOW", group[0]!.ownerInstanceName, "binding exceeds sixteen scripts or actions"));
      continue;
    }
    const first = group[0]!;
    const identity = createHash("sha256").update(key).digest("hex").slice(0, 16);
    merged.push({
      id: group.length === 1 ? first.id : `kf$binding:merged-${identity}`,
      ownerInstanceName: first.ownerInstanceName, kfEvent: first.kfEvent,
      ...(first.linkId === undefined ? {} : { linkId: first.linkId }), phase: first.phase,
      scriptModuleIds, nativeActionIds,
    });
  }
  return merged;
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
  const { plan, implementation } = snapshotInput(input);
  const normalized = normalizeActionGraph({ plan, implementation });
  const native = compileNativeActions({ normalized });
  const errors: InteractionDiagnostic[] = [diagnostic(
    "JOURNEY_PROVENANCE_UNAVAILABLE",
    plan.blueprintHash,
    "the solution plan carries only blueprintHash; acceptance journeys are unavailable, so only declared trigger closure can be proven",
  )];
  const warnings: InteractionDiagnostic[] = [];
  const requests: InteractionCompilationRequest[] = [];
  const compiledScripts: CompiledScriptModule[] = [];
  const scriptBindings: CompiledEventBinding[] = [];
  const scheduledByScript = new Map<string, readonly string[]>();
  const visibleScriptIds = new Set<string>();
  const scriptById = new Map(plan.scripts.map((script) => [script.id, script]));

  for (const request of [...native.scriptRequests].sort((left, right) => codePointCompare(left.actionId, right.actionId))) {
    if (request.reason !== "RUN_SCRIPT_REQUIRES_VALIDATION" || request.sourceScriptId === undefined) {
      errors.push(diagnostic("INTERACTION_SCRIPT_BLOCKED", request.actionId, request.reason));
      requests.push(requestDiagnostic(request, request.reason));
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
        plan, implementation, ownerControlId: request.ownerControlId,
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
      if (compiled.binding !== undefined) scriptBindings.push(compiled.binding);
      scheduledByScript.set(script.id, compiled.scheduledScriptIds);
      if (calls.some((call) => isVisibleCall(call) && call.execution !== "conditional")
        || (calls.length === 0 && /\.(?:SetData|SetValue|SetVisible)\s*\(/.test(compiled.module.source))) visibleScriptIds.add(script.id);
      if (calls.some((call) => isVisibleCall(call) && call.execution === "conditional")
        && !calls.some((call) => isVisibleCall(call) && call.execution !== "conditional")) {
        errors.push(diagnostic("INTERACTION_CLOSURE_MISSING", script.id, "conditional visible effects do not prove every branch terminates visibly"));
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      errors.push(diagnostic("INTERACTION_SCRIPT_BLOCKED", script.id, message));
      requests.push(requestDiagnostic(request, message));
    }
  }

  for (const cycle of findCycles(scheduledByScript)) {
    errors.push(diagnostic("INTERACTION_SCRIPT_CYCLE", cycle[0]!, `scheduled script cycle: ${cycle.join(" -> ")}`));
  }

  const compiledActionIds = new Set(native.actions.map((action) => action.sourceActionId));
  for (const action of normalized.graph.actions) {
    const visibleNative = compiledActionIds.has(action.id) && action.effects.some((effect) =>
      ["navigate-page", "open-overlay", "close-overlay", "set-visibility", "switch-tab", "set-control-value", "show-feedback"].includes(effect.kind));
    const visibleScript = action.effects.some((effect) => effect.kind === "run-script" && visibleScriptIds.has(effect.scriptId));
    if (!visibleNative && !visibleScript && !errors.some((entry) => entry.nodeId === action.id || action.effects.some((effect) => effect.kind === "run-script" && effect.scriptId === entry.nodeId))) {
      errors.push(diagnostic("INTERACTION_CLOSURE_MISSING", action.id, "declared trigger has no trigger-to-visible-result closure"));
    }
  }

  const bindings = mergeBindings([...native.bindings, ...scriptBindings], errors);
  const duplicateModuleIds = compiledScripts.map((module) => module.id).filter((id, index, all) => all.indexOf(id) !== index);
  duplicateModuleIds.forEach((id) => errors.push(diagnostic("INTERACTION_BINDING_DUPLICATE", id, "duplicate compiled module identity")));
  const bindingByInstance = new Map<string, CompiledEventBinding[]>();
  bindings.forEach((binding) => bindingByInstance.set(binding.ownerInstanceName, [...(bindingByInstance.get(binding.ownerInstanceName) ?? []), binding]));
  const instanceByControl = new Map(implementation.runtimeCorrelation?.controls.map((entry) => [entry.semanticControlId, entry.instanceName]) ?? []);
  const outputCandidate = {
    ...implementation,
    compiledActions: [...native.actions].sort((left, right) => codePointCompare(left.id, right.id)),
    compiledScripts: [...compiledScripts].sort((left, right) => codePointCompare(left.id, right.id)),
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
    implementation: parsedOutput.success ? parsedOutput.data : implementation,
    diagnostics: {
      errors: errors.sort((left, right) => codePointCompare(`${left.code}\0${left.nodeId}\0${left.message}`, `${right.code}\0${right.nodeId}\0${right.message}`)),
      warnings, requests: requests.sort((left, right) => codePointCompare(`${left.actionId}\0${left.sourceScriptId ?? ""}`, `${right.actionId}\0${right.sourceScriptId ?? ""}`)),
    },
  }) as InteractionCompilationResult;
  const actionMap = new Map(normalized.graph.actions.map((action) => [action.id, { successors: action.afterActionIds }]));
  const triggerMap = new Map<string, string[]>();
  normalized.graph.actions.forEach((action) => {
    const key = `${action.trigger.controlId}\0${action.trigger.semanticEvent}`;
    triggerMap.set(key, [...(triggerMap.get(key) ?? []), action.id].sort(codePointCompare));
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
    [...(trace.actions.get(id)?.successors ?? [])].sort(codePointCompare).forEach(visit);
  };
  (trace.triggers.get(`${controlId}\0${semanticEvent}`) ?? []).forEach(visit);
  return Object.freeze(output);
}
