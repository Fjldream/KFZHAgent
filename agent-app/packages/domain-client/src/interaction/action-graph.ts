import {
  ActionGraphSchema,
  type ActionEffect,
  type ActionGraph,
  type ScriptPlan,
  type SolutionImplementationPlan,
  type SolutionNode,
  type UIImplementationSpecV2,
  UIImplementationSpecV2Schema,
} from "@kf/contracts";

export type ActionGraphErrorCode =
  | "ACTION_DEPENDENCY_CYCLE"
  | "ACTION_DEPENDENCY_UNKNOWN"
  | "ACTION_INPUT_INVALID"
  | "ACTION_IMPLEMENTATION_INVALID"
  | "ACTION_OVERLAY_HOST_OWNERSHIP_MISMATCH"
  | "ACTION_OVERLAY_HOST_DUPLICATE"
  | "ACTION_OVERLAY_HOST_EXTRA"
  | "ACTION_OVERLAY_HOST_METADATA_MISMATCH"
  | "ACTION_OVERLAY_HOST_MISSING"
  | "ACTION_OVERLAY_HOST_PROVENANCE_MISMATCH"
  | "ACTION_OVERLAY_PLAN_DUPLICATE"
  | "ACTION_RUNTIME_CORRELATION_EXTRA"
  | "ACTION_RUNTIME_CORRELATION_MISSING"
  | "ACTION_RUNTIME_CORRELATION_ALIAS"
  | "ACTION_SCRIPT_ORPHANED"
  | "ACTION_TRIGGER_MISSING"
  | "ACTION_TRIGGER_OWNERSHIP_MISMATCH"
  | "ACTION_TRIGGER_RUNTIME_AMBIGUOUS"
  | "ACTION_TRIGGER_RUNTIME_MISSING"
  | "ACTION_UNKNOWN";

export class ActionGraphNormalizationError extends Error {
  constructor(
    readonly code: ActionGraphErrorCode,
    readonly nodeId: string,
    detail?: string,
    options?: ErrorOptions,
  ) {
    super(`${code}: ${nodeId}${detail === undefined ? "" : ` (${detail})`}`, options);
    this.name = "ActionGraphNormalizationError";
  }
}

export interface ScriptClosureCandidate {
  readonly status: "unverified";
  readonly candidateOutputRefs: readonly {
    readonly refKind: "mock-data" | "local-state" | "control";
    readonly refId: string;
  }[];
}

export interface NormalizedActionGraph {
  readonly graph: ActionGraph;
  readonly executionOrder: readonly string[];
  readonly scriptsById: ReadonlyMap<string, ScriptPlan>;
  readonly scriptClosures: ReadonlyMap<string, ScriptClosureCandidate>;
}

export interface TrustedActionCompilationContext {
  readonly graph: ActionGraph;
  readonly controls: readonly {
    readonly semanticControlId: string;
    readonly instanceName: string;
    readonly capabilityId: string;
    readonly pageId: string;
  }[];
  readonly pages: readonly { readonly semanticPageId: string; readonly pageGuid: string }[];
  readonly overlayHosts: readonly { readonly overlayId: string; readonly controlId: string; readonly pageId: string }[];
  readonly scripts: readonly ScriptPlan[];
  readonly scriptClosures: readonly { readonly scriptId: string; readonly closure: ScriptClosureCandidate }[];
}

const trustedContexts = new WeakMap<NormalizedActionGraph, TrustedActionCompilationContext>();

export function getTrustedActionCompilationContext(
  normalized: NormalizedActionGraph,
): TrustedActionCompilationContext | undefined {
  return trustedContexts.get(normalized);
}

export interface NormalizeActionGraphInput {
  readonly plan: SolutionImplementationPlan;
  readonly implementation: unknown;
}

type NativeControl = Extract<UIImplementationSpecV2["pages"][number], { compatibility: "native" }>["controls"][number];
type TriggerOwner = { readonly controlId: string; readonly semanticEvent: string };

function codePointCompare(left: string, right: string): number {
  const a = Array.from(left);
  const b = Array.from(right);
  const length = Math.min(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const difference = a[index]!.codePointAt(0)! - b[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

function effectOf(action: SolutionImplementationPlan["actions"][number]): ActionEffect {
  switch (action.kind) {
    case "navigate-page": return { kind: action.kind, targetPageId: action.targetPageId };
    case "open-overlay": return { kind: action.kind, overlayId: action.overlayId };
    case "close-overlay": return { kind: action.kind, overlayId: action.overlayId, ...(action.result === undefined ? {} : { result: action.result }) };
    case "set-visibility": return { kind: action.kind, targetId: action.targetId, visible: action.visible };
    case "switch-tab": return { kind: action.kind, targetId: action.targetId, tabId: action.tabId };
    case "set-state": return { kind: action.kind, stateId: action.stateId, value: action.value };
    case "set-control-value": return { kind: action.kind, targetId: action.targetId, value: action.value };
    case "show-feedback": return { kind: action.kind, level: action.level, message: action.message };
    case "run-script": return { kind: action.kind, scriptId: action.scriptId };
  }
}

function nodesOf(plan: SolutionImplementationPlan): SolutionNode[] {
  const result: SolutionNode[] = [];
  const pending: SolutionNode[] = [
    ...plan.pages.map((page) => page.root),
    ...plan.overlays.map((overlay) => overlay.root),
  ];
  while (pending.length > 0) {
    const node = pending.pop()!;
    result.push(node);
    if (node.kind === "layout") pending.push(...node.children);
    else if (node.kind === "registered-module") node.slots.forEach((slot) => pending.push(...slot.children));
    else if (node.kind === "repeater") pending.push(node.template);
  }
  return result;
}

function nativeControlsOf(implementation: UIImplementationSpecV2): NativeControl[] {
  if (implementation.compatibility !== "native") {
    throw new ActionGraphNormalizationError("ACTION_INPUT_INVALID", "implementation", "adapted-v1 interactions are not compilable");
  }
  return implementation.pages.flatMap((page) => page.compatibility === "native" ? page.controls : []);
}

function validateRuntimeCorrelation(
  plan: SolutionImplementationPlan,
  implementation: UIImplementationSpecV2,
  controls: readonly NativeControl[],
): void {
  const correlation = implementation.runtimeCorrelation;
  if (correlation === undefined) {
    throw new ActionGraphNormalizationError("ACTION_RUNTIME_CORRELATION_MISSING", "implementation");
  }
  const controlIds = new Set(controls.map((control) => control.id));
  const correlatedControls = new Set(correlation.controls.map((entry) => entry.semanticControlId));
  for (const control of controls) {
    if (!correlatedControls.has(control.id)) {
      throw new ActionGraphNormalizationError("ACTION_RUNTIME_CORRELATION_MISSING", control.id, "instance name");
    }
  }
  for (const entry of correlation.controls) {
    if (!controlIds.has(entry.semanticControlId)) {
      throw new ActionGraphNormalizationError("ACTION_RUNTIME_CORRELATION_MISSING", entry.semanticControlId, "unknown correlated control");
    }
  }
  const controlByNormalizedInstance = new Map<string, string>();
  for (const entry of correlation.controls) {
    const normalizedInstance = entry.instanceName.toLocaleLowerCase("en-US");
    const prior = controlByNormalizedInstance.get(normalizedInstance);
    if (prior !== undefined) {
      throw new ActionGraphNormalizationError("ACTION_RUNTIME_CORRELATION_ALIAS", entry.semanticControlId, `${prior}/${entry.instanceName}`);
    }
    controlByNormalizedInstance.set(normalizedInstance, entry.semanticControlId);
  }
  const correlatedPages = new Set(correlation.pages.map((entry) => entry.semanticPageId));
  const plannedPageIds = new Set(plan.pages.map((page) => page.id));
  for (const page of plan.pages) {
    if (!correlatedPages.has(page.id)) {
      throw new ActionGraphNormalizationError("ACTION_RUNTIME_CORRELATION_MISSING", page.id, "page GUID");
    }
  }
  for (const entry of correlation.pages) {
    if (!plannedPageIds.has(entry.semanticPageId)) {
      throw new ActionGraphNormalizationError("ACTION_RUNTIME_CORRELATION_EXTRA", entry.semanticPageId, "unplanned implementation page");
    }
  }
}

function validateOverlayOwnership(
  plan: SolutionImplementationPlan,
  implementation: UIImplementationSpecV2,
): void {
  type NativePage = Extract<UIImplementationSpecV2["pages"][number], { compatibility: "native" }>;
  type NativeControl = NativePage["controls"][number];
  const plannedOverlays = new Map(plan.overlays.map((overlay) => [overlay.id, overlay]));
  if (plannedOverlays.size !== plan.overlays.length) {
    const seen = new Set<string>();
    const duplicate = plan.overlays.find((overlay) => seen.has(overlay.id) || !seen.add(overlay.id));
    throw new ActionGraphNormalizationError("ACTION_OVERLAY_PLAN_DUPLICATE", duplicate?.id ?? "overlay");
  }
  const hosts = new Map<string, Array<{ pageId: string; control: NativeControl }>>();
  for (const page of implementation.pages) {
    if (page.compatibility !== "native") continue;
    for (const control of page.controls) {
      const host = control.overlayHost;
      if (host === undefined) continue;
      const entries = hosts.get(host.overlayId) ?? [];
      entries.push({ pageId: page.id, control });
      hosts.set(host.overlayId, entries);
    }
  }
  for (const [overlayId, entries] of hosts) {
    if (!plannedOverlays.has(overlayId)) throw new ActionGraphNormalizationError("ACTION_OVERLAY_HOST_EXTRA", overlayId);
    if (entries.length !== 1) throw new ActionGraphNormalizationError("ACTION_OVERLAY_HOST_DUPLICATE", overlayId, String(entries.length));
  }
  for (const overlay of plan.overlays) {
    const entry = hosts.get(overlay.id)?.[0];
    if (entry === undefined) throw new ActionGraphNormalizationError("ACTION_OVERLAY_HOST_MISSING", overlay.id);
    const host = entry.control.overlayHost!;
    if (entry.control.sourceSolutionNodeId !== overlay.root.id) {
      throw new ActionGraphNormalizationError(
        "ACTION_OVERLAY_HOST_PROVENANCE_MISMATCH",
        overlay.id,
        `${entry.control.sourceSolutionNodeId}/${overlay.root.id}`,
      );
    }
    if (entry.pageId !== overlay.hostPageId || host.hostPageId !== overlay.hostPageId) {
      throw new ActionGraphNormalizationError(
        "ACTION_OVERLAY_HOST_OWNERSHIP_MISMATCH",
        overlay.id,
        `${entry.pageId}/${host.hostPageId}/${overlay.hostPageId}`,
      );
    }
    if (host.presentation !== overlay.presentation
      || host.visibleStateId !== overlay.visibleStateId
      || host.dismissible !== overlay.dismissible
      || host.initiallyVisible !== false) {
      throw new ActionGraphNormalizationError("ACTION_OVERLAY_HOST_METADATA_MISMATCH", overlay.id);
    }
  }
}

function resolveTriggerControl(
  owner: SolutionNode,
  controls: readonly NativeControl[],
  correlatedIds: ReadonlySet<string>,
): NativeControl {
  const candidates = controls.filter((control) =>
    control.sourceSolutionNodeId === owner.id || (owner.kind === "registered-module" && control.sourceModuleId === owner.id));
  if (candidates.length === 0) {
    throw new ActionGraphNormalizationError("ACTION_TRIGGER_RUNTIME_MISSING", owner.id);
  }
  if (candidates.length !== 1) {
    throw new ActionGraphNormalizationError("ACTION_TRIGGER_RUNTIME_AMBIGUOUS", owner.id, String(candidates.length));
  }
  const candidate = candidates[0]!;
  if (!correlatedIds.has(candidate.id)) {
    throw new ActionGraphNormalizationError("ACTION_RUNTIME_CORRELATION_MISSING", owner.id, candidate.id);
  }
  return candidate;
}

function cloneInput(input: NormalizeActionGraphInput): NormalizeActionGraphInput {
  try {
    return structuredClone(input);
  } catch (error) {
    throw new ActionGraphNormalizationError("ACTION_INPUT_INVALID", "input", undefined, { cause: error });
  }
}

function deepFreeze<T>(value: T): T {
  const pending: object[] = [];
  if (value !== null && typeof value === "object") pending.push(value);
  const seen = new WeakSet<object>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current)) continue;
    seen.add(current);
    Reflect.ownKeys(current).forEach((key) => {
      const child = Reflect.get(current, key) as object | null;
      if (child !== null && typeof child === "object") pending.push(child);
    });
    Object.freeze(current);
  }
  return value;
}

export function normalizeActionGraph(input: NormalizeActionGraphInput): NormalizedActionGraph {
  const cloned = cloneInput(input);
  const plan = cloned.plan;
  const implementationResult = UIImplementationSpecV2Schema.safeParse(cloned.implementation);
  if (!implementationResult.success) {
    throw new ActionGraphNormalizationError(
      "ACTION_IMPLEMENTATION_INVALID",
      "implementation",
      implementationResult.error.issues[0]?.message,
      { cause: implementationResult.error },
    );
  }
  const implementation = implementationResult.data;
  const controls = nativeControlsOf(implementation);
  validateRuntimeCorrelation(plan, implementation, controls);
  validateOverlayOwnership(plan, implementation);
  const correlatedIds = new Set(implementation.runtimeCorrelation?.controls.map((entry) => entry.semanticControlId) ?? []);
  const actionById = new Map(plan.actions.map((action) => [action.id, action]));
  const owners = new Map<string, Map<string, TriggerOwner>>();

  for (const owner of nodesOf(plan)) {
    if (owner.kind !== "control" && owner.kind !== "registered-module") continue;
    if (owner.eventBindings.length === 0) continue;
    const runtimeControl = resolveTriggerControl(owner, controls, correlatedIds);
    for (const binding of owner.eventBindings) {
      for (const actionId of binding.actionIds) {
        if (!actionById.has(actionId)) throw new ActionGraphNormalizationError("ACTION_UNKNOWN", actionId, owner.id);
        const key = `${runtimeControl.id}\u0000${binding.semanticEvent}`;
        const actionOwners = owners.get(actionId) ?? new Map<string, TriggerOwner>();
        actionOwners.set(key, { controlId: runtimeControl.id, semanticEvent: binding.semanticEvent });
        owners.set(actionId, actionOwners);
      }
    }
  }

  const indegree = new Map(plan.actions.map((action) => [action.id, 0]));
  for (const action of plan.actions) {
    for (const successorId of action.afterActionIds) {
      if (!actionById.has(successorId)) throw new ActionGraphNormalizationError("ACTION_DEPENDENCY_UNKNOWN", action.id, successorId);
      indegree.set(successorId, indegree.get(successorId)! + 1);
    }
  }
  const ready = plan.actions.filter((action) => indegree.get(action.id) === 0).map((action) => action.id).sort(codePointCompare);
  const executionOrder: string[] = [];
  while (ready.length > 0) {
    const actionId = ready.shift()!;
    executionOrder.push(actionId);
    const ownerEntries = owners.get(actionId);
    for (const successorId of actionById.get(actionId)!.afterActionIds) {
      if (ownerEntries !== undefined) {
        const successorOwners = owners.get(successorId) ?? new Map<string, TriggerOwner>();
        ownerEntries.forEach((owner, key) => successorOwners.set(key, owner));
        owners.set(successorId, successorOwners);
      }
      const next = indegree.get(successorId)! - 1;
      indegree.set(successorId, next);
      if (next === 0) {
        ready.push(successorId);
        ready.sort(codePointCompare);
      }
    }
  }
  if (executionOrder.length !== plan.actions.length) {
    const cyclicId = plan.actions.map((action) => action.id).filter((id) => !executionOrder.includes(id)).sort(codePointCompare)[0] ?? "graph";
    throw new ActionGraphNormalizationError("ACTION_DEPENDENCY_CYCLE", cyclicId);
  }

  for (const action of plan.actions) {
    const count = owners.get(action.id)?.size ?? 0;
    if (count === 0) throw new ActionGraphNormalizationError("ACTION_TRIGGER_MISSING", action.id);
    if (count !== 1) throw new ActionGraphNormalizationError("ACTION_TRIGGER_OWNERSHIP_MISMATCH", action.id, String(count));
  }

  const scriptsById = new Map(plan.scripts.map((script) => [script.id, script]));
  const invokedScripts = new Set(plan.actions.flatMap((action) => action.kind === "run-script" ? [action.scriptId] : []));
  for (const script of plan.scripts) {
    if (!invokedScripts.has(script.id)) throw new ActionGraphNormalizationError("ACTION_SCRIPT_ORPHANED", script.id);
  }
  const graphResult = ActionGraphSchema.safeParse({
    schema: "kf-action-graph/v1",
    references: {
      pageIds: plan.pages.map((page) => page.id),
      controlIds: controls.map((control) => control.id),
      overlayIds: plan.overlays.map((overlay) => overlay.id),
      stateIds: plan.localState.map((state) => state.id),
      mockDataIds: plan.mockData.map((data) => data.id),
      scriptIds: plan.scripts.map((script) => script.id),
    },
    actions: executionOrder.map((id) => {
      const action = actionById.get(id)!;
      return {
        id,
        trigger: Array.from(owners.get(id)!.values())[0]!,
        conditions: action.conditions ?? [],
        effects: [effectOf(action)],
        afterActionIds: [...action.afterActionIds],
      };
    }),
  });
  if (!graphResult.success) {
    const first = graphResult.error.issues[0];
    const actionIndex = first?.path[0] === "actions" && typeof first.path[1] === "number" ? first.path[1] : undefined;
    const nodeId = actionIndex === undefined ? "graph" : executionOrder[actionIndex] ?? "graph";
    throw new ActionGraphNormalizationError("ACTION_INPUT_INVALID", nodeId, first?.message, { cause: graphResult.error });
  }
  const graph = graphResult.data;
  const scriptClosures = new Map<string, ScriptClosureCandidate>();
  scriptsById.forEach((script, id) => scriptClosures.set(id, {
    status: "unverified",
    candidateOutputRefs: script.outputs.map((output) => ({ refKind: output.refKind, refId: output.refId })),
  }));
  const normalized: NormalizedActionGraph = {
    graph: deepFreeze(structuredClone(graph)),
    executionOrder: Object.freeze([...executionOrder]),
    scriptsById,
    scriptClosures,
  };
  const controlCorrelation = new Map(implementation.runtimeCorrelation!.controls.map((entry) => [entry.semanticControlId, entry.instanceName]));
  const controlSnapshots = implementation.pages.flatMap((page) => page.compatibility === "native" ? page.controls.map((control) => ({
    semanticControlId: control.id,
    instanceName: controlCorrelation.get(control.id)!,
    capabilityId: control.capabilityId,
    pageId: page.id,
  })) : []);
  const overlayHosts = implementation.pages.flatMap((page) => page.compatibility === "native" ? page.controls.flatMap((control) =>
    control.overlayHost === undefined ? [] : [{ overlayId: control.overlayHost.overlayId, controlId: control.id, pageId: page.id }]) : []);
  const context = deepFreeze({
    graph: structuredClone(graph),
    controls: controlSnapshots,
    pages: implementation.runtimeCorrelation!.pages.map((entry) => ({ ...entry })),
    overlayHosts,
    scripts: plan.scripts.map((script) => structuredClone(script)),
    scriptClosures: Array.from(scriptClosures, ([scriptId, closure]) => ({ scriptId, closure: structuredClone(closure) })),
  } satisfies TrustedActionCompilationContext);
  deepFreeze(normalized);
  trustedContexts.set(normalized, context);
  return normalized;
}
