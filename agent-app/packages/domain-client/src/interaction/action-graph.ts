import {
  ActionGraphSchema,
  type ActionEffect,
  type ActionGraph,
  type ScriptPlan,
  type SolutionImplementationPlan,
  type SolutionNode,
  type UIImplementationSpecV2,
} from "@kf/contracts";

export type ActionGraphErrorCode =
  | "ACTION_DEPENDENCY_CYCLE"
  | "ACTION_DEPENDENCY_UNKNOWN"
  | "ACTION_INPUT_INVALID"
  | "ACTION_RUNTIME_CORRELATION_MISSING"
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
  readonly ownerCapabilityIds: ReadonlyMap<string, string>;
  readonly scriptsById: ReadonlyMap<string, ScriptPlan>;
  readonly scriptClosures: ReadonlyMap<string, ScriptClosureCandidate>;
}

export interface NormalizeActionGraphInput {
  readonly plan: SolutionImplementationPlan;
  readonly implementation: UIImplementationSpecV2;
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
  const correlatedPages = new Set(correlation.pages.map((entry) => entry.semanticPageId));
  for (const page of plan.pages) {
    if (!correlatedPages.has(page.id)) {
      throw new ActionGraphNormalizationError("ACTION_RUNTIME_CORRELATION_MISSING", page.id, "page GUID");
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

export function normalizeActionGraph(input: NormalizeActionGraphInput): NormalizedActionGraph {
  const { plan, implementation } = cloneInput(input);
  const controls = nativeControlsOf(implementation);
  validateRuntimeCorrelation(plan, implementation, controls);
  const correlatedIds = new Set(implementation.runtimeCorrelation?.controls.map((entry) => entry.semanticControlId) ?? []);
  const actionById = new Map(plan.actions.map((action) => [action.id, action]));
  const owners = new Map<string, Map<string, TriggerOwner>>();
  const ownerCapabilityIds = new Map<string, string>();

  for (const owner of nodesOf(plan)) {
    if (owner.kind !== "control" && owner.kind !== "registered-module") continue;
    if (owner.eventBindings.length === 0) continue;
    const runtimeControl = resolveTriggerControl(owner, controls, correlatedIds);
    ownerCapabilityIds.set(runtimeControl.id, runtimeControl.capabilityId);
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
  return { graph, executionOrder: Object.freeze(executionOrder), ownerCapabilityIds, scriptsById, scriptClosures };
}
