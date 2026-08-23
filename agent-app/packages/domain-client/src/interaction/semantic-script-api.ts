import { types as utilTypes } from "node:util";
import {
  canonicalServerHash,
  SolutionImplementationPlanSchema,
  UIImplementationSpecV2Schema,
  type MockDataSet,
  type ScriptCapabilityProfile,
  type SolutionImplementationPlan,
} from "@kf/contracts";
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
  readonly mockDataId?: string;
}

interface TrustedContext {
  readonly owner: RuntimeControl;
  readonly controls: ReadonlyMap<string, RuntimeControl>;
  readonly pages: ReadonlyMap<string, string>;
  readonly overlays: ReadonlySet<string>;
  readonly localState: ReadonlyMap<string, SolutionImplementationPlan["localState"][number]>;
  readonly mockData: ReadonlyMap<string, MockDataSet>;
  readonly scripts: ReadonlySet<string>;
  readonly activeEvent?: { readonly controlId: string; readonly semanticEvent: string };
}

const trustedContexts = new WeakMap<SemanticScriptApiContext, TrustedContext>();
const RESERVED_DATA_KEYS = new Set(["__proto__", "prototype", "constructor"]);

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
  const result = Object.create(null) as Record<string, JsonData>;
  for (const key of keys) {
    if (typeof key !== "string") return invalidContext(nodeId, "symbol properties are forbidden");
    if (RESERVED_DATA_KEYS.has(key)) return invalidContext(nodeId, `reserved object key is forbidden: ${key}`);
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) {
      return invalidContext(nodeId, "input objects require enumerable data properties");
    }
    Object.defineProperty(result, key, {
      value: clonePureData(descriptor.value, nodeId, depth + 1, seen, budget),
      enumerable: true,
      configurable: false,
      writable: false,
    });
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
    ? ["implementation", "ownerControlId", "plan"]
    : ["activeEvent", "implementation", "ownerControlId", "plan"];
  if (keys.length !== allowedKeys.length || keys.some((key, index) => key !== allowedKeys[index])) {
    return invalidContext("context", "context must contain only plan, implementation, ownerControlId, and optional activeEvent");
  }
  if (typeof cloned.ownerControlId !== "string") return invalidContext("ownerControlId", "ownerControlId must be a semantic ID");
  const parsedPlan = SolutionImplementationPlanSchema.safeParse(cloned.plan);
  if (!parsedPlan.success) {
    return invalidContext("plan", parsedPlan.error.issues[0]?.message ?? "invalid solution implementation plan", { cause: parsedPlan.error });
  }
  const parsed = UIImplementationSpecV2Schema.safeParse(cloned.implementation);
  if (!parsed.success || parsed.data.compatibility !== "native" || parsed.data.runtimeCorrelation === undefined) {
    return invalidContext("implementation", parsed.success ? "native runtime correlation is required" : parsed.error.issues[0]?.message ?? "invalid UI implementation", parsed.success ? undefined : { cause: parsed.error });
  }
  if (parsed.data.sourceSolutionPlanHash !== canonicalServerHash(parsedPlan.data)) {
    return invalidContext("implementation", "solution-plan hash does not match the authoritative plan");
  }
  const instances = new Map(parsed.data.runtimeCorrelation.controls.map((entry) => [entry.semanticControlId, entry.instanceName]));
  const planPages = new Map(parsedPlan.data.pages.map((page) => [page.id, page]));
  type PlanNode = SolutionImplementationPlan["pages"][number]["root"];
  const indexNodes = (root: PlanNode): ReadonlyMap<string, PlanNode> => {
    const nodes = new Map<string, PlanNode>();
    const visit = (node: PlanNode): void => {
      nodes.set(node.id, node);
      if (node.kind === "layout") node.children.forEach(visit);
      else if (node.kind === "registered-module") node.slots.forEach((slot) => slot.children.forEach(visit));
      else if (node.kind === "repeater") visit(node.template);
    };
    visit(root);
    return nodes;
  };
  const pageNodes = new Map(parsedPlan.data.pages.map((page) => [page.id, indexNodes(page.root)]));
  const overlayNodes = new Map(parsedPlan.data.overlays.map((overlay) => [overlay.id, indexNodes(overlay.root)]));
  const controls = new Map<string, RuntimeControl>();
  if (parsed.data.pages.length !== parsedPlan.data.pages.length) {
    return invalidContext("implementation", "implementation page set does not match the authoritative plan");
  }
  const planOverlays = new Map(parsedPlan.data.overlays.map((overlay) => [overlay.id, overlay]));
  const observedOverlayHosts = new Map<string, number>();
  for (const page of parsed.data.pages) {
    if (page.compatibility !== "native") continue;
    const planPage = planPages.get(page.id);
    if (planPage === undefined || planPage.sourceBlueprintPageId !== page.sourceBlueprintPageId) {
      return invalidContext(page.id, "implementation page provenance does not match the authoritative plan");
    }
    const controlsById = new Map(page.controls.map((control) => [control.id, control]));
    const overlayByControl = new Map<string, string>();
    for (const control of page.controls) {
      const path = new Set<string>();
      let root = control;
      while (root.parentId !== undefined) {
        if (path.has(root.id)) return invalidContext(control.id, "implementation control parent cycle");
        path.add(root.id);
        const parent = controlsById.get(root.parentId);
        if (parent === undefined) return invalidContext(control.id, "implementation control parent is missing");
        root = parent;
      }
      if (root.overlayHost !== undefined) overlayByControl.set(control.id, root.overlayHost.overlayId);
    }
    for (const control of page.controls) {
      const instanceName = instances.get(control.id);
      if (instanceName === undefined) return invalidContext(control.id, "runtime correlation is missing");
      const overlayId = overlayByControl.get(control.id);
      const sourceNode = overlayId === undefined
        ? pageNodes.get(page.id)?.get(control.sourceSolutionNodeId)
        : overlayNodes.get(overlayId)?.get(control.sourceSolutionNodeId);
      if (sourceNode === undefined || control.sourceBlueprintPageId !== page.sourceBlueprintPageId) {
        return invalidContext(control.id, "implementation control page ownership or provenance does not match the authoritative plan");
      }
      if (sourceNode.kind === "control" && sourceNode.capabilityId !== control.capabilityId) {
        return invalidContext(control.id, "implementation control capability does not match the authoritative plan");
      }
      if (control.overlayHost !== undefined) {
        const overlay = planOverlays.get(control.overlayHost.overlayId);
        if (control.parentId !== undefined
          || overlay === undefined
          || overlay.hostPageId !== page.id
          || overlay.sourceBlueprintPageId !== control.sourceBlueprintPageId
          || overlay.root.id !== control.sourceSolutionNodeId
          || overlay.presentation !== control.overlayHost.presentation
          || overlay.visibleStateId !== control.overlayHost.visibleStateId
          || overlay.dismissible !== control.overlayHost.dismissible) {
          return invalidContext(control.id, "implementation overlay provenance does not match the authoritative plan");
        }
        observedOverlayHosts.set(overlay.id, (observedOverlayHosts.get(overlay.id) ?? 0) + 1);
      }
      const mockDataId = sourceNode.kind === "control" || sourceNode.kind === "repeater" ? sourceNode.mockDataId : undefined;
      controls.set(control.id, deepFreeze({
        semanticControlId: control.id,
        instanceName,
        capabilityId: control.capabilityId,
        pageId: page.id,
        ...(mockDataId === undefined ? {} : { mockDataId }),
      }));
    }
  }
  for (const overlay of parsedPlan.data.overlays) {
    if (observedOverlayHosts.get(overlay.id) !== 1) return invalidContext(overlay.id, "plan overlay must have exactly one implementation overlay host");
  }
  const owner = controls.get(cloned.ownerControlId);
  if (owner === undefined) return invalidContext(cloned.ownerControlId, "owner control is not compiled");
  const ownerPage = planPages.get(owner.pageId)!;
  const ownerStateIds = new Set(ownerPage.initialStateIds);
  const ownerMockDataIds = new Set<string>();
  const collectMockData = (nodes: ReadonlyMap<string, PlanNode>): void => {
    nodes.forEach((node) => {
      if ((node.kind === "control" || node.kind === "repeater") && node.mockDataId !== undefined) ownerMockDataIds.add(node.mockDataId);
    });
  };
  collectMockData(pageNodes.get(owner.pageId)!);
  parsedPlan.data.overlays.filter((overlay) => overlay.hostPageId === owner.pageId)
    .forEach((overlay) => collectMockData(overlayNodes.get(overlay.id)!));
  const dataById = new Map(parsedPlan.data.mockData.map((data) => [data.id, data]));
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
    overlays: new Set(parsedPlan.data.overlays.filter((overlay) => overlay.hostPageId === owner.pageId).map((overlay) => overlay.id)),
    localState: new Map(parsedPlan.data.localState.filter((state) => ownerStateIds.has(state.id)).map((state) => [state.id, state])),
    mockData: new Map([...ownerMockDataIds].flatMap((id) => {
      const data = dataById.get(id);
      return data === undefined ? [] : [[id, data] as const];
    })),
    scripts: new Set(parsedPlan.data.scripts.map((script) => script.id)),
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
  if (record.controlId !== trusted.owner.semanticControlId) {
    throw new SemanticScriptApiError("SCRIPT_EVENT_NOT_SUPPORTED", record.controlId, "event binding must belong to the trusted owner control");
  }
  return resolveEventInternal(record.controlId, record.semanticEvent, trusted);
}

function invalidCall(api: SemanticApiName, detail: string): never {
  throw new SemanticScriptApiError("SCRIPT_API_INPUT_INVALID", api, detail);
}

function exactArity(api: SemanticApiName, args: readonly JsonData[], expected: number): void {
  if (args.length !== expected) invalidCall(api, `expected ${expected} arguments, received ${args.length}`);
}

function stringId(api: SemanticApiName, value: JsonData | undefined, label: string): string {
  if (typeof value !== "string" || value.trim() !== value || value.length === 0) invalidCall(api, `${label} must be a semantic ID`);
  return value;
}

function validateRuntimeRecordList(api: SemanticApiName, value: JsonData | undefined, dataSet: MockDataSet): void {
  if (!Array.isArray(value)) invalidCall(api, "value must be a record-list");
  const fields = new Map(dataSet.fields.map((field) => [field.key, field.type]));
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) invalidCall(api, "value must be a schema-matching record-list");
    const keys = Object.keys(item);
    if (keys.length !== fields.size || keys.some((key) => !fields.has(key))) invalidCall(api, "value must be a schema-matching record-list");
    for (const [field, type] of fields) {
      const fieldValue = item[field];
      const valid = (type === "text" && typeof fieldValue === "string")
        || (type === "date" && typeof fieldValue === "string")
        || (type === "number" && typeof fieldValue === "number")
        || (type === "boolean" && typeof fieldValue === "boolean");
      if (!valid) invalidCall(api, `value must be a schema-matching record-list (${field}:${type})`);
    }
  }
}

function recordKeys(dataSet: MockDataSet, keyField: string): ReadonlySet<string> {
  return new Set(dataSet.records.flatMap((record) => {
    const value = record.values.find((entry) => entry.field === keyField)?.value;
    return typeof value === "string" ? [value] : [];
  }));
}

function validateControlValue(api: SemanticApiName, target: RuntimeControl, value: JsonData | undefined): void {
  const valid = target.capabilityId === "input"
    ? typeof value === "string"
    : target.capabilityId === "checkbox"
      ? typeof value === "boolean"
      : target.capabilityId === "select" && (typeof value === "string" || typeof value === "number");
  if (!valid) invalidCall(api, `${target.capabilityId} value does not match its capability-specific input value`);
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
  const supportedArity: Partial<Record<SemanticApiName, number>> = {
    "$control.getValue": 1,
    "$control.setValue": 2,
    "$control.setData": 2,
    "$event.record": 0,
    "$page.navigate": 1,
  };
  const requiredArity = supportedArity[api];
  if (requiredArity !== undefined && args.length !== requiredArity) {
    throw new SemanticScriptApiError("SCRIPT_API_INPUT_INVALID", api, `expected ${requiredArity} arguments, received ${args.length}`);
  }
  if (api === "$control.getValue" || api === "$control.setValue") {
    const target = targetControl(args[0], trusted);
    if (api === "$control.setValue") validateControlValue(api, target, args[1]);
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
    if (target.mockDataId === undefined) invalidCall(api, "target control is not bound to mock data");
    const dataSet = trusted.mockData.get(target.mockDataId);
    if (dataSet === undefined) invalidCall(api, "target mock data is not owned by the current page");
    validateRuntimeRecordList(api, args[1], dataSet);
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
    exactArity(api, args, 2);
    targetControl(args[0], trusted);
    if (typeof args[1] !== "boolean") invalidCall(api, "second argument must be boolean");
    return planned(api, api === "$control.setVisible" ? "SCRIPT_CONTROL_VISIBILITY_NOT_SERIALIZABLE" : "SCRIPT_CONTROL_ENABLED_NOT_SERIALIZABLE");
  }
  if (api === "$overlay.open" || api === "$overlay.close") {
    if (api === "$overlay.open") exactArity(api, args, 1);
    else if (args.length < 1 || args.length > 2) invalidCall(api, "expected overlay ID and optional result");
    const overlayId = stringId(api, args[0], "overlay ID");
    if (!trusted.overlays.has(overlayId)) invalidCall(api, `unknown overlay: ${overlayId}`);
    if (api === "$overlay.close" && args.length === 2) {
      const result = args[1];
      if (result !== null && typeof result !== "string" && typeof result !== "number" && typeof result !== "boolean") {
        invalidCall(api, "overlay close result must be a bounded scalar");
      }
    }
    return planned(api, "SCRIPT_OVERLAY_NOT_SERIALIZABLE");
  }
  if (api === "$state.get" || api === "$state.set") {
    exactArity(api, args, api === "$state.get" ? 1 : 2);
    const stateId = stringId(api, args[0], "state ID");
    const state = trusted.localState.get(stateId);
    if (state === undefined) invalidCall(api, `unknown local state: ${stateId}`);
    if (api === "$state.set") {
      const value = args[1];
      const valid = (state.type === "boolean" && typeof value === "boolean")
        || (state.type === "number" && typeof value === "number")
        || (state.type === "text" && typeof value === "string")
        || (state.type === "record-key" && (typeof value === "string" || value === null))
        || (state.type === "record-key-list" && Array.isArray(value) && value.every((item) => typeof item === "string"));
      if (!valid) invalidCall(api, `value does not match local state type: ${state.type}`);
      if ((state.type === "record-key" || state.type === "record-key-list") && state.mockDataId !== undefined && state.keyField !== undefined) {
        const dataSet = trusted.mockData.get(state.mockDataId);
        if (dataSet === undefined) invalidCall(api, `record-key data is not owned by the current page: ${state.mockDataId}`);
        const keys = recordKeys(dataSet, state.keyField);
        const requested = Array.isArray(value) ? value : [value];
        if (Array.isArray(value) && new Set(value).size !== value.length) invalidCall(api, "record-key-list values must be unique");
        if (requested.some((key) => typeof key !== "string" || !keys.has(key))) invalidCall(api, "unknown record key");
      }
    }
    return planned(api, "SCRIPT_PAGE_LOCAL_RUNTIME_UNAVAILABLE");
  }
  if (api === "$data.get" || api === "$data.set") {
    exactArity(api, args, api === "$data.get" ? 1 : 2);
    const dataId = stringId(api, args[0], "mock data ID");
    const dataSet = trusted.mockData.get(dataId);
    if (dataSet === undefined) invalidCall(api, `unknown mock data: ${dataId}`);
    if (api === "$data.set") validateRuntimeRecordList(api, args[1], dataSet);
    return planned(api, "SCRIPT_PAGE_LOCAL_RUNTIME_UNAVAILABLE");
  }
  if (api === "$feedback.show") {
    exactArity(api, args, 2);
    if (typeof args[0] !== "string" || !["success", "info", "warning", "error"].includes(args[0])) invalidCall(api, "level must be success, info, warning, or error");
    if (typeof args[1] !== "string" || args[1].trim().length === 0 || args[1].length > 400) invalidCall(api, "message must contain 1..400 characters");
    return planned(api, "SCRIPT_FEEDBACK_NOT_SERIALIZABLE");
  }
  if (api === "$timer.after" || api === "$timer.repeat") {
    exactArity(api, args, api === "$timer.after" ? 2 : 3);
    const delay = args[0];
    if (typeof delay !== "number" || !Number.isInteger(delay) || delay < 100 || delay > 60_000) invalidCall(api, "delay must be an integer from 100 to 60000ms");
    if (api === "$timer.repeat") {
      const repetitions = args[1];
      if (typeof repetitions !== "number" || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) invalidCall(api, "repeat count must be an integer from 1 to 10");
    }
    const scriptId = stringId(api, args[api === "$timer.after" ? 1 : 2], "script ID");
    if (!trusted.scripts.has(scriptId)) invalidCall(api, `unknown script: ${scriptId}`);
    return planned(api, "SCRIPT_TIMER_NOT_SERIALIZABLE");
  }
  return invalidCall(api, "unhandled semantic API");
}
