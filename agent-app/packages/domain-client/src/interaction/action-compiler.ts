import { createHash } from "node:crypto";
import {
  CompiledEventBindingSchema,
  CompiledNativeActionSchema,
  type ActionCondition,
  type ActionEffect,
  type CompiledEventBinding,
  type CompiledNativeAction,
  type ScriptCapabilityProfile,
} from "@kf/contracts";
import { requireScriptCapabilityProfile } from "../design-knowledge/script-capability-registry.js";
import { requireNativeActionCapability } from "../design-knowledge/native-action-capability-registry.js";
import {
  getTrustedActionCompilationContext,
  type NormalizedActionGraph,
  type TrustedActionCompilationContext,
} from "./action-graph.js";

export type ScriptRequestReason =
  | "ACTION_CAPABILITY_UNSUPPORTED"
  | "ACTION_CONTEXT_CROSS_PAGE"
  | "ACTION_CONDITIONS_REQUIRE_SCRIPT"
  | "ACTION_VALUE_REQUIRES_SCRIPT"
  | "BINDING_CAPACITY_EXCEEDED"
  | "EVENT_ALIAS_EVIDENCE_CONFLICT"
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
}

export type NativeActionCompilationErrorCode = "ACTION_CONTEXT_UNTRUSTED" | "NATIVE_ACTION_CONTRACT_INVALID";

export class NativeActionCompilationError extends Error {
  constructor(readonly code: NativeActionCompilationErrorCode, readonly nodeId: string, detail?: string, options?: ErrorOptions) {
    super(`${code}: ${nodeId}${detail === undefined ? "" : ` (${detail})`}`, options);
    this.name = "NativeActionCompilationError";
  }
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
  scriptsById: ReadonlyMap<string, TrustedActionCompilationContext["scripts"][number]>,
): TypedScriptRequest {
  const scriptEffect = action.effects.find((effect) => effect.kind === "run-script");
  const script = scriptEffect?.kind === "run-script" ? scriptsById.get(scriptEffect.scriptId) : undefined;
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

function runtimeIndexes(context: TrustedActionCompilationContext) {
  const controls = new Map(context.controls.map((control) => [control.semanticControlId, {
    instanceName: control.instanceName,
    capabilityId: control.capabilityId,
    pageId: control.pageId,
  }]));
  const pages = new Map(context.pages.map((entry) => [entry.semanticPageId, entry.pageGuid]));
  const overlayHosts = new Map(context.overlayHosts.map((entry) => [entry.overlayId, { controlId: entry.controlId, pageId: entry.pageId }]));
  return { controls, pages, overlayHosts };
}

function parseNativeAction(value: unknown, nodeId: string): CompiledNativeAction {
  const result = CompiledNativeActionSchema.safeParse(value);
  if (!result.success) throw new NativeActionCompilationError("NATIVE_ACTION_CONTRACT_INVALID", nodeId, result.error.issues[0]?.message, { cause: result.error });
  return result.data;
}

function parseBinding(value: unknown, nodeId: string): CompiledEventBinding {
  const result = CompiledEventBindingSchema.safeParse(value);
  if (!result.success) throw new NativeActionCompilationError("NATIVE_ACTION_CONTRACT_INVALID", nodeId, result.error.issues[0]?.message, { cause: result.error });
  return result.data;
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
      return targetPageGuid === undefined ? undefined : parseNativeAction({ ...base, kind: effect.kind, targetPageGuid }, action.id);
    }
    case "open-overlay":
    case "close-overlay": {
      const target = indexes.overlayHosts.get(effect.overlayId);
      const targetInstanceName = target === undefined ? undefined : indexes.controls.get(target.controlId)?.instanceName;
      return targetInstanceName === undefined || target === undefined ? undefined : parseNativeAction({
        ...base,
        kind: effect.kind,
        ownerSemanticControlId: action.trigger.controlId,
        targetSemanticControlId: target.controlId,
        targetInstanceName,
      }, action.id);
    }
    case "set-visibility": {
      const targetInstanceName = indexes.controls.get(effect.targetId)?.instanceName;
      return targetInstanceName === undefined ? undefined : parseNativeAction({ ...base, kind: effect.kind, targetInstanceName, visible: effect.visible }, action.id);
    }
    case "switch-tab": {
      const targetInstanceName = indexes.controls.get(effect.targetId)?.instanceName;
      return targetInstanceName === undefined ? undefined : parseNativeAction({ ...base, kind: effect.kind, targetInstanceName, tabId: effect.tabId }, action.id);
    }
    case "set-control-value": {
      if (effect.value.kind !== "literal") return undefined;
      const targetInstanceName = indexes.controls.get(effect.targetId)?.instanceName;
      return targetInstanceName === undefined ? undefined : parseNativeAction({ ...base, kind: effect.kind, targetInstanceName, value: effect.value.value }, action.id);
    }
    case "show-feedback": return parseNativeAction({ ...base, kind: effect.kind, level: effect.level, message: effect.message }, action.id);
    case "set-state": return parseNativeAction({ ...base, kind: effect.kind, stateId: effect.stateId, value: effect.value }, action.id);
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
    const profile = requireScriptCapabilityProfile(target.capabilityId);
    return profile.availability === "supported" ? profile : undefined;
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
    return false;
  }
  if (effect.kind === "open-overlay" || effect.kind === "close-overlay") {
    const targetId = indexes.overlayHosts.get(effect.overlayId)?.controlId;
    const profile = profileForControl(targetId, indexes);
    const method = profile?.methods.find((candidate) => candidate.semanticMethod === "set-visible");
    return supported(method) && method.kfMethod === "setVisible"
      && method.parameters.length === 1 && method.parameters[0] === "visible" && method.returns === "void";
  }
  return true;
}

function staysInOwnerPage(
  effect: ActionEffect,
  ownerPageId: string,
  indexes: ReturnType<typeof runtimeIndexes>,
): boolean {
  if (effect.kind === "set-visibility" || effect.kind === "set-control-value" || effect.kind === "switch-tab") {
    return indexes.controls.get(effect.targetId)?.pageId === ownerPageId;
  }
  if (effect.kind === "open-overlay" || effect.kind === "close-overlay") {
    return indexes.overlayHosts.get(effect.overlayId)?.pageId === ownerPageId;
  }
  return true;
}

export function compileNativeActions(input: CompileNativeActionsInput): NativeActionCompilation {
  const context = getTrustedActionCompilationContext(input.normalized);
  if (context === undefined) throw new NativeActionCompilationError("ACTION_CONTEXT_UNTRUSTED", "normalized");
  const indexes = runtimeIndexes(context);
  const scriptsById = new Map(context.scripts.map((script) => [script.id, script]));
  const actions: CompiledNativeAction[] = [];
  const requests: TypedScriptRequest[] = [];
  const bindings: CompiledEventBinding[] = [];
  type GraphAction = (typeof context.graph.actions)[number];
  type RuntimeControl = ReturnType<typeof runtimeIndexes>["controls"] extends Map<string, infer T> ? T : never;
  type RuntimeEvent = ScriptCapabilityProfile["events"][number];
  type ResolvedAction = { action: GraphAction; owner: RuntimeControl; profile: ScriptCapabilityProfile; event: RuntimeEvent };
  const groups = new Map<string, ResolvedAction[]>();
  for (const action of context.graph.actions) {
    const owner = indexes.controls.get(action.trigger.controlId);
    if (owner === undefined) {
      requests.push(request(action, "TRIGGER_EVENT_UNSUPPORTED", scriptsById));
      continue;
    }
    let profile;
    try {
      profile = requireScriptCapabilityProfile(owner.capabilityId);
    } catch {
      requests.push(request(action, "ACTION_CAPABILITY_UNSUPPORTED", scriptsById));
      continue;
    }
    if (profile.availability !== "supported") {
      requests.push(request(action, "ACTION_CAPABILITY_UNSUPPORTED", scriptsById));
      continue;
    }
    const event = profile.events.find((candidate) => candidate.semanticEvent === action.trigger.semanticEvent);
    if (!supported(event)) {
      requests.push(request(action, "TRIGGER_EVENT_UNSUPPORTED", scriptsById));
      continue;
    }
    const key = `${owner.instanceName}\u0000${event.kfEvent}\u0000event`;
    const group = groups.get(key) ?? [];
    group.push({ action, owner, profile, event });
    groups.set(key, group);
  }

  for (const group of groups.values()) {
    if (group.length > 16) {
      group.forEach(({ action }) => requests.push(request(action, "BINDING_CAPACITY_EXCEEDED", scriptsById)));
      continue;
    }
    const aliasSignatures = new Set(group.map(({ event }) => JSON.stringify({
      linkId: event.linkId === undefined ? null : event.linkId,
      arguments: event.arguments,
      evidence: event.evidence,
    })));
    if (aliasSignatures.size !== 1) {
      group.forEach(({ action }) => requests.push(request(action, "EVENT_ALIAS_EVIDENCE_CONFLICT", scriptsById)));
      continue;
    }
    const groupActions: CompiledNativeAction[] = [];
    for (const { action, owner } of group) {
      if (action.effects.some((effect) => effect.kind === "run-script")) {
        requests.push(request(action, "RUN_SCRIPT_REQUIRES_VALIDATION", scriptsById));
        continue;
      }
      if (action.conditions.length > 0) {
        requests.push(request(action, "ACTION_CONDITIONS_REQUIRE_SCRIPT", scriptsById));
        continue;
      }
      const effect = action.effects[0]!;
      if (!staysInOwnerPage(effect, owner.pageId, indexes)) {
        requests.push(request(action, "ACTION_CONTEXT_CROSS_PAGE", scriptsById));
        continue;
      }
      let actionCapability;
      try {
        actionCapability = requireNativeActionCapability(effect.kind);
      } catch {
        requests.push(request(action, "ACTION_CAPABILITY_UNSUPPORTED", scriptsById));
        continue;
      }
      if (!supported(actionCapability)) {
        requests.push(request(action, "ACTION_CAPABILITY_UNSUPPORTED", scriptsById));
        continue;
      }
      if (!targetCapabilitySupported(effect, indexes)) {
        requests.push(request(action, "TARGET_CAPABILITY_UNSUPPORTED", scriptsById));
        continue;
      }
      if (effect.kind === "set-control-value" && effect.value.kind !== "literal") {
        requests.push(request(action, "ACTION_VALUE_REQUIRES_SCRIPT", scriptsById));
        continue;
      }
      const compiled = compileEffect(action, effect, owner.instanceName, indexes);
      if (compiled === undefined) {
        requests.push(request(action, "TARGET_CAPABILITY_UNSUPPORTED", scriptsById));
        continue;
      }
      groupActions.push(compiled);
    }
    if (groupActions.length > 0) {
      const first = group[0]!;
      actions.push(...groupActions);
      bindings.push(parseBinding({
        id: compilerId("binding", first.action.id), ownerInstanceName: first.owner.instanceName, kfEvent: first.event.kfEvent,
        ...(first.event.linkId === undefined ? {} : { linkId: first.event.linkId }),
        phase: "event", scriptModuleIds: [], nativeActionIds: groupActions.map((action) => action.id),
      }, first.action.id));
    }
  }
  return {
    actions: Object.freeze(actions),
    bindings: Object.freeze(bindings),
    scriptRequests: Object.freeze(requests),
  };
}
