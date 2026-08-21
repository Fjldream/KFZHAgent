import { createHash } from "node:crypto";
import {
  CompiledEventBindingSchema,
  CompiledNativeActionSchema,
  type ActionCondition,
  type ActionEffect,
  type CompiledEventBinding,
  type CompiledNativeAction,
  type ScriptCapabilityProfile,
  type UIImplementationSpecV2,
} from "@kf/contracts";
import { requireScriptCapabilityProfile } from "../design-knowledge/script-capability-registry.js";
import type { NormalizedActionGraph } from "./action-graph.js";

export type ScriptRequestReason =
  | "ACTION_CAPABILITY_UNSUPPORTED"
  | "ACTION_CONDITIONS_REQUIRE_SCRIPT"
  | "ACTION_VALUE_REQUIRES_SCRIPT"
  | "RUN_SCRIPT_REQUIRES_VALIDATION"
  | "TARGET_CAPABILITY_UNSUPPORTED"
  | "TRIGGER_EVENT_UNSUPPORTED";

export interface TypedScriptRequest {
  readonly actionId: string;
  readonly ownerControlId: string;
  readonly semanticEvent: string;
  readonly requestedTier: "script-template" | "custom-script";
  readonly reason: ScriptRequestReason;
  readonly effects: readonly ActionEffect[];
  readonly conditions: readonly ActionCondition[];
  readonly semanticReferenceIds: readonly string[];
  readonly templateId?: string;
  readonly sourceScriptId?: string;
  readonly closureStatus: "unverified";
}

export interface CompileNativeActionsInput {
  readonly normalized: NormalizedActionGraph;
  readonly implementation: UIImplementationSpecV2;
}

export interface NativeActionCompilation {
  readonly actions: readonly CompiledNativeAction[];
  readonly bindings: readonly CompiledEventBinding[];
  readonly scriptRequests: readonly TypedScriptRequest[];
}

function compilerId(kind: "action" | "binding", semanticId: string): string {
  const prefix = `kf$${kind}:`;
  if (prefix.length + semanticId.length <= 100) return `${prefix}${semanticId}`;
  const digest = createHash("sha256").update(semanticId).digest("hex").slice(0, 12);
  return `${prefix}${semanticId.slice(0, 100 - prefix.length - digest.length - 1)}-${digest}`;
}

function supported<T extends { availability: string; evidence: readonly unknown[] }>(member: T | undefined): member is T {
  return member?.availability === "supported" && member.evidence.length > 0;
}

function semanticActionOf(effect: ActionEffect): string {
  switch (effect.kind) {
    case "open-overlay": return "open-dialog";
    case "close-overlay": return "close-dialog";
    case "set-control-value": return "set-value";
    default: return effect.kind;
  }
}

function semanticReferences(effect: ActionEffect): string[] {
  switch (effect.kind) {
    case "navigate-page": return [effect.targetPageId];
    case "open-overlay":
    case "close-overlay": return [effect.overlayId];
    case "set-visibility":
    case "switch-tab": return [effect.targetId];
    case "set-state": return [effect.stateId];
    case "set-control-value": return [effect.targetId, ...(effect.value.kind === "local-state" ? [effect.value.stateId] : effect.value.kind === "mock-data" ? [effect.value.mockDataId] : [])];
    case "run-script": return [effect.scriptId];
    case "show-feedback": return [];
  }
}

function request(
  action: NormalizedActionGraph["graph"]["actions"][number],
  reason: ScriptRequestReason,
  normalized: NormalizedActionGraph,
): TypedScriptRequest {
  const scriptEffect = action.effects.find((effect) => effect.kind === "run-script");
  const script = scriptEffect?.kind === "run-script" ? normalized.scriptsById.get(scriptEffect.scriptId) : undefined;
  return {
    actionId: action.id,
    ownerControlId: action.trigger.controlId,
    semanticEvent: action.trigger.semanticEvent,
    requestedTier: script?.kind === "template" ? "script-template" : "custom-script",
    reason,
    effects: action.effects.map((effect) => structuredClone(effect)),
    conditions: action.conditions.map((condition) => structuredClone(condition)),
    semanticReferenceIds: Array.from(new Set(action.effects.flatMap(semanticReferences))).sort(),
    ...(script?.kind === "template" ? { templateId: script.template } : {}),
    ...(scriptEffect?.kind === "run-script" ? { sourceScriptId: scriptEffect.scriptId } : {}),
    closureStatus: "unverified",
  };
}

function runtimeIndexes(implementation: UIImplementationSpecV2) {
  const controls = new Map<string, { instanceName: string; capabilityId: string }>();
  const controlById = new Map(implementation.pages.flatMap((page) => page.compatibility === "native" ? page.controls : []).map((control) => [control.id, control]));
  implementation.runtimeCorrelation?.controls.forEach((entry) => {
    const control = controlById.get(entry.semanticControlId);
    if (control !== undefined) controls.set(entry.semanticControlId, { instanceName: entry.instanceName, capabilityId: control.capabilityId });
  });
  const pages = new Map(implementation.runtimeCorrelation?.pages.map((entry) => [entry.semanticPageId, entry.pageGuid]) ?? []);
  const overlayHosts = new Map<string, string>();
  controlById.forEach((control) => {
    if (control.overlayHost !== undefined) overlayHosts.set(control.overlayHost.overlayId, control.id);
  });
  return { controls, pages, overlayHosts };
}

function compileEffect(
  action: NormalizedActionGraph["graph"]["actions"][number],
  effect: ActionEffect,
  ownerInstanceName: string,
  indexes: ReturnType<typeof runtimeIndexes>,
): CompiledNativeAction | undefined {
  const base = { id: compilerId("action", action.id), sourceActionId: action.id, ownerInstanceName };
  switch (effect.kind) {
    case "navigate-page": {
      const targetPageGuid = indexes.pages.get(effect.targetPageId);
      return targetPageGuid === undefined ? undefined : CompiledNativeActionSchema.parse({ ...base, kind: effect.kind, targetPageGuid });
    }
    case "open-overlay":
    case "close-overlay": {
      const targetId = indexes.overlayHosts.get(effect.overlayId);
      const targetInstanceName = targetId === undefined ? undefined : indexes.controls.get(targetId)?.instanceName;
      return targetInstanceName === undefined ? undefined : CompiledNativeActionSchema.parse({ ...base, kind: effect.kind, targetInstanceName });
    }
    case "set-visibility": {
      const targetInstanceName = indexes.controls.get(effect.targetId)?.instanceName;
      return targetInstanceName === undefined ? undefined : CompiledNativeActionSchema.parse({ ...base, kind: effect.kind, targetInstanceName, visible: effect.visible });
    }
    case "switch-tab": {
      const targetInstanceName = indexes.controls.get(effect.targetId)?.instanceName;
      return targetInstanceName === undefined ? undefined : CompiledNativeActionSchema.parse({ ...base, kind: effect.kind, targetInstanceName, tabId: effect.tabId });
    }
    case "set-control-value": {
      if (effect.value.kind !== "literal") return undefined;
      const targetInstanceName = indexes.controls.get(effect.targetId)?.instanceName;
      return targetInstanceName === undefined ? undefined : CompiledNativeActionSchema.parse({ ...base, kind: effect.kind, targetInstanceName, value: effect.value.value });
    }
    case "show-feedback": return CompiledNativeActionSchema.parse({ ...base, kind: effect.kind, level: effect.level, message: effect.message });
    case "set-state": return CompiledNativeActionSchema.parse({ ...base, kind: effect.kind, stateId: effect.stateId, value: effect.value });
    case "run-script": return undefined;
  }
}

function profileForControl(
  controlId: string | undefined,
  indexes: ReturnType<typeof runtimeIndexes>,
): ScriptCapabilityProfile | undefined {
  const target = controlId === undefined ? undefined : indexes.controls.get(controlId);
  if (target === undefined) return undefined;
  try {
    return requireScriptCapabilityProfile(target.capabilityId);
  } catch {
    return undefined;
  }
}

function targetCapabilitySupported(effect: ActionEffect, indexes: ReturnType<typeof runtimeIndexes>): boolean {
  if (effect.kind === "set-visibility") {
    const property = profileForControl(effect.targetId, indexes)?.properties.find((candidate) => candidate.semanticProperty === "visible");
    return supported(property) && property.writable;
  }
  if (effect.kind === "set-control-value") {
    const property = profileForControl(effect.targetId, indexes)?.properties.find((candidate) => candidate.semanticProperty === "value");
    return supported(property) && property.writable;
  }
  if (effect.kind === "switch-tab") {
    const action = profileForControl(effect.targetId, indexes)?.actions.find((candidate) => candidate.semanticAction === "switch-tab");
    return supported(action) && action.implementation === "restricted-action";
  }
  if (effect.kind === "open-overlay" || effect.kind === "close-overlay") {
    const targetId = indexes.overlayHosts.get(effect.overlayId);
    const action = profileForControl(targetId, indexes)?.actions.find((candidate) => candidate.semanticAction === semanticActionOf(effect));
    return supported(action) && action.implementation === "restricted-action";
  }
  return true;
}

export function compileNativeActions(input: CompileNativeActionsInput): NativeActionCompilation {
  const indexes = runtimeIndexes(input.implementation);
  const actions: CompiledNativeAction[] = [];
  const requests: TypedScriptRequest[] = [];
  const bindings = new Map<string, CompiledEventBinding>();

  for (const action of input.normalized.graph.actions) {
    const owner = indexes.controls.get(action.trigger.controlId);
    if (owner === undefined) {
      requests.push(request(action, "TRIGGER_EVENT_UNSUPPORTED", input.normalized));
      continue;
    }
    if (action.effects.some((effect) => effect.kind === "run-script")) {
      requests.push(request(action, "RUN_SCRIPT_REQUIRES_VALIDATION", input.normalized));
      continue;
    }
    if (action.conditions.length > 0) {
      requests.push(request(action, "ACTION_CONDITIONS_REQUIRE_SCRIPT", input.normalized));
      continue;
    }
    let profile;
    try {
      profile = requireScriptCapabilityProfile(owner.capabilityId);
    } catch {
      requests.push(request(action, "ACTION_CAPABILITY_UNSUPPORTED", input.normalized));
      continue;
    }
    const event = profile.events.find((candidate) => candidate.semanticEvent === action.trigger.semanticEvent);
    if (!supported(event)) {
      requests.push(request(action, "TRIGGER_EVENT_UNSUPPORTED", input.normalized));
      continue;
    }
    const effect = action.effects[0]!;
    const actionCapability = profile.actions.find((candidate) => candidate.semanticAction === semanticActionOf(effect));
    if (!supported(actionCapability) || actionCapability.implementation !== "restricted-action") {
      requests.push(request(action, "ACTION_CAPABILITY_UNSUPPORTED", input.normalized));
      continue;
    }
    if (!targetCapabilitySupported(effect, indexes)) {
      requests.push(request(action, "TARGET_CAPABILITY_UNSUPPORTED", input.normalized));
      continue;
    }
    if (effect.kind === "set-control-value") {
      if (effect.value.kind !== "literal") {
        requests.push(request(action, "ACTION_VALUE_REQUIRES_SCRIPT", input.normalized));
        continue;
      }
    }
    const compiled = compileEffect(action, effect, owner.instanceName, indexes);
    if (compiled === undefined) {
      requests.push(request(action, "TARGET_CAPABILITY_UNSUPPORTED", input.normalized));
      continue;
    }
    actions.push(compiled);
    const key = `${owner.instanceName}\u0000${event.kfEvent}`;
    const existing = bindings.get(key);
    if (existing === undefined) {
      bindings.set(key, CompiledEventBindingSchema.parse({
        id: compilerId("binding", action.id), ownerInstanceName: owner.instanceName, kfEvent: event.kfEvent,
        ...(event.linkId === undefined ? {} : { linkId: event.linkId }),
        phase: "event", scriptModuleIds: [], nativeActionIds: [compiled.id],
      }));
    } else {
      bindings.set(key, CompiledEventBindingSchema.parse({ ...existing, nativeActionIds: [...existing.nativeActionIds, compiled.id] }));
    }
  }
  return {
    actions: Object.freeze(actions),
    bindings: Object.freeze(Array.from(bindings.values())),
    scriptRequests: Object.freeze(requests),
  };
}
