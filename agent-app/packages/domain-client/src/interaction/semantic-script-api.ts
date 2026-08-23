import { types as utilTypes } from "node:util";
import { UIImplementationSpecV2Schema, type ScriptCapabilityProfile } from "@kf/contracts";
import { requireScriptCapabilityProfile } from "../design-knowledge/script-capability-registry.js";

const API_NAMES = [
  "$control.getValue", "$control.setValue", "$control.setData", "$event.record",
  "$control.setVisible", "$control.setEnabled", "$page.navigate", "$overlay.open", "$overlay.close",
  "$state.get", "$state.set", "$data.get", "$data.set", "$feedback.show", "$timer.after", "$timer.repeat",
] as const;

type SemanticApiName = (typeof API_NAMES)[number];
type JsonData = null | string | number | boolean | JsonData[] | { [key: string]: JsonData };
type RuntimeMemberEvidence = ScriptCapabilityProfile["events"][number]["evidence"];

export type SemanticScriptApiErrorCode =
  | "SCRIPT_API_CONTEXT_INVALID"
  | "SCRIPT_API_CONTEXT_UNTRUSTED"
  | "SCRIPT_API_INPUT_INVALID"
  | "SCRIPT_API_UNSUPPORTED"
  | "SCRIPT_CONTROL_NOT_FOUND"
  | "SCRIPT_CONTROL_CROSS_PAGE"
  | "SCRIPT_EVENT_NOT_SUPPORTED"
  | "SCRIPT_METHOD_UNSUPPORTED"
  | "SCRIPT_PAGE_NOT_FOUND";

export class SemanticScriptApiError extends Error {
  constructor(readonly code: SemanticScriptApiErrorCode, readonly nodeId: string, detail?: string, options?: ErrorOptions) {
    super(`${code}: ${nodeId}${detail === undefined ? "" : ` (${detail})`}`, options);
    this.name = "SemanticScriptApiError";
  }
}

export interface SemanticScriptApiContext {
  readonly schema: "kf-semantic-script-api-context/v1";
}

interface RuntimeControl {
  readonly semanticControlId: string;
  readonly instanceName: string;
  readonly capabilityId: string;
  readonly pageId: string;
}

interface TrustedContext {
  readonly owner: RuntimeControl;
  readonly controls: ReadonlyMap<string, RuntimeControl>;
  readonly pages: ReadonlyMap<string, string>;
  readonly overlays: ReadonlySet<string>;
  readonly activeEvent?: { readonly controlId: string; readonly semanticEvent: string };
}

const trustedContexts = new WeakMap<SemanticScriptApiContext, TrustedContext>();

function invalidContext(nodeId: string, detail: string, options?: ErrorOptions): never {
  throw new SemanticScriptApiError("SCRIPT_API_CONTEXT_INVALID", nodeId, detail, options);
}

function clonePureData(
  value: unknown,
  nodeId: string,
  depth = 0,
  seen = new WeakSet<object>(),
  budget = { nodes: 0 },
): JsonData {
  budget.nodes += 1;
  if (budget.nodes > 50_000) return invalidContext(nodeId, "input node budget exceeds 50000");
  if (depth > 128) return invalidContext(nodeId, "input depth exceeds 128");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return invalidContext(nodeId, "input numbers must be finite");
    return value;
  }
  if (typeof value !== "object" || utilTypes.isProxy(value)) return invalidContext(nodeId, "input must contain descriptor-safe JSON data");
  if (seen.has(value)) return invalidContext(nodeId, "input contains a cycle");
  seen.add(value);
  let prototype: object | null;
  let keys: readonly PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch (error) {
    return invalidContext(nodeId, "input descriptor inspection failed", { cause: error });
  }
  if (keys.some((key) => typeof key === "symbol")) return invalidContext(nodeId, "symbol properties are forbidden");
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype || value.length > 10_000) return invalidContext(nodeId, "invalid input array");
    const elementKeys = keys.filter((key) => key !== "length");
    if (elementKeys.length !== value.length) return invalidContext(nodeId, "input arrays must be dense and index-only");
    const result: JsonData[] = [];
    for (let index = 0; index < value.length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) {
        return invalidContext(nodeId, "input arrays require enumerable data properties");
      }
      result.push(clonePureData(descriptor.value, nodeId, depth + 1, seen, budget));
    }
    seen.delete(value);
    return result;
  }
  if (prototype !== Object.prototype && prototype !== null) return invalidContext(nodeId, "input contains a non-plain prototype");
  if (keys.length > 1_000) return invalidContext(nodeId, "input object property budget exceeded");
  const result: Record<string, JsonData> = {};
  for (const key of keys) {
    if (typeof key !== "string") return invalidContext(nodeId, "symbol properties are forbidden");
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) {
      return invalidContext(nodeId, "input objects require enumerable data properties");
    }
    result[key] = clonePureData(descriptor.value, nodeId, depth + 1, seen, budget);
  }
  seen.delete(value);
  return result;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function ownRecord(value: JsonData, nodeId: string): Record<string, JsonData> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return invalidContext(nodeId, "input must be an object");
  return value;
}

export function createSemanticScriptApiContext(input: unknown): SemanticScriptApiContext {
  const cloned = ownRecord(clonePureData(input, "context"), "context");
  const keys = Object.keys(cloned).sort();
  const allowedKeys = cloned.activeEvent === undefined
    ? ["implementation", "ownerControlId"]
    : ["activeEvent", "implementation", "ownerControlId"];
  if (keys.length !== allowedKeys.length || keys.some((key, index) => key !== allowedKeys[index])) {
    return invalidContext("context", "context must contain only implementation, ownerControlId, and optional activeEvent");
  }
  if (typeof cloned.ownerControlId !== "string") return invalidContext("ownerControlId", "ownerControlId must be a semantic ID");
  const parsed = UIImplementationSpecV2Schema.safeParse(cloned.implementation);
  if (!parsed.success || parsed.data.compatibility !== "native" || parsed.data.runtimeCorrelation === undefined) {
    return invalidContext("implementation", parsed.success ? "native runtime correlation is required" : parsed.error.issues[0]?.message ?? "invalid UI implementation", parsed.success ? undefined : { cause: parsed.error });
  }
  const instances = new Map(parsed.data.runtimeCorrelation.controls.map((entry) => [entry.semanticControlId, entry.instanceName]));
  const controls = new Map<string, RuntimeControl>();
  const overlays = new Set<string>();
  for (const page of parsed.data.pages) {
    if (page.compatibility !== "native") continue;
    for (const control of page.controls) {
      const instanceName = instances.get(control.id);
      if (instanceName === undefined) return invalidContext(control.id, "runtime correlation is missing");
      controls.set(control.id, deepFreeze({ semanticControlId: control.id, instanceName, capabilityId: control.capabilityId, pageId: page.id }));
      if (control.overlayHost !== undefined) overlays.add(control.overlayHost.overlayId);
    }
  }
  const owner = controls.get(cloned.ownerControlId);
  if (owner === undefined) return invalidContext(cloned.ownerControlId, "owner control is not compiled");
  let activeEvent: TrustedContext["activeEvent"];
  if (cloned.activeEvent !== undefined) {
    const record = ownRecord(cloned.activeEvent, "activeEvent");
    if (Object.keys(record).sort().join("\0") !== "controlId\0semanticEvent"
      || typeof record.controlId !== "string" || typeof record.semanticEvent !== "string") {
      return invalidContext("activeEvent", "activeEvent requires only controlId and semanticEvent");
    }
    if (record.controlId !== owner.semanticControlId) return invalidContext("activeEvent", "active event must belong to the context owner");
    activeEvent = deepFreeze({ controlId: record.controlId, semanticEvent: record.semanticEvent });
  }
  const context = Object.freeze({ schema: "kf-semantic-script-api-context/v1" as const });
  trustedContexts.set(context, {
    owner,
    controls,
    pages: new Map(parsed.data.runtimeCorrelation.pages.map((entry) => [entry.semanticPageId, entry.pageGuid])),
    overlays,
    ...(activeEvent === undefined ? {} : { activeEvent }),
  });
  return context;
}

function requireContext(context: SemanticScriptApiContext): TrustedContext {
  const trusted = trustedContexts.get(context);
  if (trusted === undefined) throw new SemanticScriptApiError("SCRIPT_API_CONTEXT_UNTRUSTED", "context");
  return trusted;
}

function parseRecordInput(value: unknown, nodeId: string, expectedKeys: readonly string[]): Record<string, JsonData> {
  let cloned: JsonData;
  try {
    cloned = clonePureData(value, nodeId);
  } catch (error) {
    if (error instanceof SemanticScriptApiError) throw new SemanticScriptApiError("SCRIPT_API_INPUT_INVALID", nodeId, error.message, { cause: error });
    throw error;
  }
  const record = ownRecord(cloned, nodeId);
  const keys = Object.keys(record).sort();
  const expected = [...expectedKeys].sort();
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new SemanticScriptApiError("SCRIPT_API_INPUT_INVALID", nodeId, `expected fields: ${expected.join(",")}`);
  }
  return record;
}

function supported(member: { readonly availability: string; readonly evidence: RuntimeMemberEvidence } | undefined): boolean {
  return member?.availability === "supported"
    && member.evidence.length > 0
    && member.evidence.every((evidence) => evidence.kind !== "product-source" || evidence.contentSha256 !== undefined);
}

function planned(api: SemanticApiName, reason: string) {
  return Object.freeze({ availability: "planned" as const, kind: "planned" as const, api, reason });
}

function targetControl(targetId: JsonData | undefined, trusted: TrustedContext): RuntimeControl {
  if (typeof targetId !== "string") throw new SemanticScriptApiError("SCRIPT_API_INPUT_INVALID", "control", "semantic control ID is required");
  const target = trusted.controls.get(targetId);
  if (target === undefined) throw new SemanticScriptApiError("SCRIPT_CONTROL_NOT_FOUND", targetId);
  if (target.pageId !== trusted.owner.pageId) throw new SemanticScriptApiError("SCRIPT_CONTROL_CROSS_PAGE", targetId, `${trusted.owner.pageId}/${target.pageId}`);
  return target;
}

function profileOf(target: RuntimeControl): ScriptCapabilityProfile | undefined {
  try {
    const profile = requireScriptCapabilityProfile(target.capabilityId);
    return profile.availability === "supported" ? profile : undefined;
  } catch {
    return undefined;
  }
}

function resolutionBase(target: RuntimeControl) {
  return {
    semanticControlId: target.semanticControlId,
    instanceName: target.instanceName,
    capabilityId: target.capabilityId,
    pageId: target.pageId,
  };
}

function resolveEventInternal(controlId: string, semanticEvent: string, trusted: TrustedContext) {
  const target = trusted.controls.get(controlId);
  if (target === undefined) throw new SemanticScriptApiError("SCRIPT_CONTROL_NOT_FOUND", controlId);
  const event = profileOf(target)?.events.find((candidate) => candidate.semanticEvent === semanticEvent);
  if (!supported(event)) throw new SemanticScriptApiError("SCRIPT_EVENT_NOT_SUPPORTED", controlId, semanticEvent);
  return deepFreeze({
    availability: "supported" as const,
    kind: "event" as const,
    ...resolutionBase(target),
    kfEvent: event!.kfEvent,
    ...(event!.linkId === undefined ? {} : { linkId: event!.linkId }),
    arguments: event!.arguments.map((argument) => ({ ...argument })),
    evidence: event!.evidence.map((evidence) => ({ ...evidence })),
  });
}

export function resolveEventBinding(input: unknown, context: SemanticScriptApiContext) {
  const trusted = requireContext(context);
  const record = parseRecordInput(input, "event-binding", ["controlId", "semanticEvent"]);
  if (typeof record.controlId !== "string" || typeof record.semanticEvent !== "string") {
    throw new SemanticScriptApiError("SCRIPT_API_INPUT_INVALID", "event-binding", "controlId and semanticEvent must be strings");
  }
  return resolveEventInternal(record.controlId, record.semanticEvent, trusted);
}

export function resolveSemanticApiCall(input: unknown, context: SemanticScriptApiContext) {
  const trusted = requireContext(context);
  const record = parseRecordInput(input, "api-call", ["api", "args"]);
  if (typeof record.api !== "string" || !Array.isArray(record.args)) {
    throw new SemanticScriptApiError("SCRIPT_API_INPUT_INVALID", "api-call", "api and dense args are required");
  }
  const api = API_NAMES.find((candidate) => candidate === record.api);
  if (api === undefined) {
    const code = record.api === "$control.deleteAll" ? "SCRIPT_METHOD_UNSUPPORTED" : "SCRIPT_API_UNSUPPORTED";
    throw new SemanticScriptApiError(code, record.api);
  }
  const args = record.args;
  const exactArity: Partial<Record<SemanticApiName, number>> = {
    "$control.getValue": 1,
    "$control.setValue": 2,
    "$control.setData": 2,
    "$event.record": 0,
    "$page.navigate": 1,
  };
  const requiredArity = exactArity[api];
  if (requiredArity !== undefined && args.length !== requiredArity) {
    throw new SemanticScriptApiError("SCRIPT_API_INPUT_INVALID", api, `expected ${requiredArity} arguments, received ${args.length}`);
  }
  if (api === "$control.getValue" || api === "$control.setValue") {
    const target = targetControl(args[0], trusted);
    const property = profileOf(target)?.properties.find((candidate) => candidate.semanticProperty === "value");
    const direction = api === "$control.getValue" ? "readable" : "writable";
    if (!supported(property)) return planned(api, "SCRIPT_PROPERTY_NOT_SUPPORTED");
    if (!property![direction]) return planned(api, direction === "readable" ? "SCRIPT_PROPERTY_NOT_READABLE" : "SCRIPT_PROPERTY_NOT_WRITABLE");
    return deepFreeze({
      availability: "supported" as const,
      kind: direction === "readable" ? "property-read" as const : "property-write" as const,
      api,
      ...resolutionBase(target),
      kfProperty: property!.kfProperty,
      evidence: property!.evidence.map((evidence) => ({ ...evidence })),
    });
  }
  if (api === "$control.setData") {
    const target = targetControl(args[0], trusted);
    const method = profileOf(target)?.methods.find((candidate) => candidate.semanticMethod === "set-data");
    if (!supported(method)) return planned(api, "SCRIPT_METHOD_NOT_SUPPORTED");
    return deepFreeze({
      availability: "supported" as const, kind: "method" as const, api, ...resolutionBase(target),
      kfMethod: method!.kfMethod, parameterNames: [...method!.parameters], returns: method!.returns,
      evidence: method!.evidence.map((evidence) => ({ ...evidence })),
    });
  }
  if (api === "$event.record") {
    if (trusted.activeEvent === undefined) return planned(api, "SCRIPT_EVENT_RECORD_NOT_PROVEN");
    const event = resolveEventInternal(trusted.activeEvent.controlId, trusted.activeEvent.semanticEvent, trusted);
    const argument = event.arguments.find((candidate) => candidate.valueKind === "record" && candidate.position !== undefined);
    if (argument === undefined) return planned(api, "SCRIPT_EVENT_RECORD_NOT_PROVEN");
    return deepFreeze({
      availability: "supported" as const, kind: "event-argument" as const, api,
      semanticControlId: event.semanticControlId, instanceName: event.instanceName, kfEvent: event.kfEvent,
      argumentName: argument.name, argumentPosition: argument.position, valueKind: argument.valueKind,
      evidence: event.evidence.map((evidence) => ({ ...evidence })),
    });
  }
  if (api === "$page.navigate") {
    const targetPageId = args[0];
    if (typeof targetPageId !== "string") throw new SemanticScriptApiError("SCRIPT_API_INPUT_INVALID", api, "semantic page ID is required");
    const targetPageGuid = trusted.pages.get(targetPageId);
    if (targetPageGuid === undefined) throw new SemanticScriptApiError("SCRIPT_PAGE_NOT_FOUND", targetPageId);
    const action = profileOf(trusted.owner)?.actions.find((candidate) => candidate.semanticAction === "navigate-page");
    if (!supported(action) || action!.implementation !== "restricted-action") return planned(api, "SCRIPT_PAGE_NAVIGATION_NOT_SUPPORTED");
    return Object.freeze({ availability: "supported" as const, kind: "restricted-action" as const, api, semanticAction: "navigate-page" as const, targetPageId, targetPageGuid });
  }
  if (api === "$control.setVisible" || api === "$control.setEnabled") {
    targetControl(args[0], trusted);
    return planned(api, api === "$control.setVisible" ? "SCRIPT_CONTROL_VISIBILITY_NOT_SERIALIZABLE" : "SCRIPT_CONTROL_ENABLED_NOT_SERIALIZABLE");
  }
  if (api === "$overlay.open" || api === "$overlay.close") return planned(api, "SCRIPT_OVERLAY_NOT_SERIALIZABLE");
  if (api === "$state.get" || api === "$state.set" || api === "$data.get" || api === "$data.set") return planned(api, "SCRIPT_PAGE_LOCAL_RUNTIME_UNAVAILABLE");
  if (api === "$feedback.show") return planned(api, "SCRIPT_FEEDBACK_NOT_SERIALIZABLE");
  return planned(api, "SCRIPT_TIMER_NOT_SERIALIZABLE");
}
