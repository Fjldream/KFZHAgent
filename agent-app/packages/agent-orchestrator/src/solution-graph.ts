import {
  StateGraph,
  START,
  END,
  isCommand,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import type { AgentGraphStateValue, AgentGraphUpdate } from "./state.js";
import { AgentGraphState } from "./state.js";
import type { SolutionGraphDeps } from "./ports.js";
import { createLoadContextNode } from "./nodes/load-context.js";
import { createClassifyIntentNode } from "./nodes/classify-intent.js";
import { createClarifyNode } from "./nodes/clarify.js";
import { createPlanChangeNode } from "./nodes/plan-change.js";
import { createDesignPlanNode } from "./nodes/design-plan.js";
import { createApprovalNode, createCancelPlanNode } from "./nodes/approval.js";
import { createEnqueueBuildNode } from "./nodes/enqueue-build.js";
import { createImplementationPlanNode } from "./nodes/implementation-plan.js";
import { createModulePlanNode } from "./nodes/module-plan.js";

/**
 * Thrown when the caller tries to run a conversation that is paused at the
 * approval interrupt with an input that is not a resume command. The pending
 * approval stays intact and resumable (see I2).
 */
export class ApprovalResumeRequiredError extends Error {
  override name = "ApprovalResumeRequiredError";
  constructor(threadId: string) {
    super(
      `conversation ${threadId} is paused at an approval interrupt; resume with Command({ resume: { action, planHash } })`,
    );
  }
}

/**
 * Compiled single-agent solution workflow (brief Task 10).
 *
 * Graph shape:
 *
 *   START → load-context → classify-intent ──(conditional)──► ...
 *        ... design-plan → plan-change ──(conditional)──► approval ──(conditional)──► enqueue-build / plan-change / cancel-plan / END
 *
 * Intent routing (brief Step 4 + design flow spec §5.2) is fully deterministic:
 *   QUESTION            → idle (assistant reply persisted)
 *   CLARIFY             → clarify (question persisted, clarificationCount+1, idle)
 *   NEW_REQUIREMENT     → plan-change
 *   MODIFY_REQUIREMENT  → plan-change
 *   CONFIRM_DESIGN      → implementation-plan (confirmed blueprint → deterministic ChangePlan)
 *   REVISE_DESIGN       → design-plan (revision loop, revising=true; also routes preview feedback)
 *   CONFIRM_BUILD       → done (preview-review loop lands, stage=done)
 *   MODIFY_REQUIREMENT  → plan-change (small tweaks; also routes preview feedback)
 *   CONFIRM_PLAN        → approval
 *   CANCEL_PLAN         → cancel-plan
 *   ROLLBACK            → idle + ROLLBACK_NOT_SUPPORTED
 *   BUILD               → enqueue-build (guarded: only an approved plan builds)
 *   unsupported domain  → pendingRequirements, idle, never built
 *
 * thread_id is the conversationId (brief contract); the checkpointer
 * (MemorySaver in tests, PostgresSaver in production) makes every run
 * resumable across process restarts.
 *
 * The returned graph wraps invoke/stream/streamEvents with an interrupt guard:
 * while a thread is paused at the approval interrupt, any non-resume input is
 * rejected with {@link ApprovalResumeRequiredError} instead of running a new
 * turn that would overwrite the pending approval (I2).
 */
export function compileSolutionGraph(
  deps: SolutionGraphDeps,
  options?: { checkpointer?: BaseCheckpointSaver },
) {
  const graph = new StateGraph(AgentGraphState)
    .addNode("load-context", createLoadContextNode(deps))
    .addNode("classify-intent", createClassifyIntentNode(deps))
    .addNode("clarify", createClarifyNode(deps))
    .addNode("design-plan", createDesignPlanNode(deps))
    .addNode("implementation-plan", createImplementationPlanNode(deps))
    .addNode("module-plan", createModulePlanNode(deps))
    .addNode("plan-change", createPlanChangeNode(deps))
    .addNode("approval", createApprovalNode())
    .addNode("cancel-plan", createCancelPlanNode(deps))
    .addNode("enqueue-build", createEnqueueBuildNode(deps))
    .addNode("done", createDoneNode(deps))
    .addEdge(START, "load-context")
    .addEdge("load-context", "classify-intent")
    .addConditionalEdges("classify-intent", (state) => routeAfterClassify(state, deps))
    .addConditionalEdges("implementation-plan", routeAfterPlanChange)
    .addConditionalEdges("module-plan", routeAfterModulePlan)
    .addConditionalEdges("plan-change", routeAfterPlanChange)
    .addConditionalEdges("approval", routeAfterApproval)
    .addEdge("cancel-plan", END)
    .addEdge("enqueue-build", END)
    .addEdge("done", END)
    .compile(options);
  return guardCompiledGraph(graph);
}

/** Deterministic intent routing after classification (brief Step 4 + spec §5.2). */
export function routeAfterClassify(state: AgentGraphStateValue, deps?: SolutionGraphDeps): string {
  if (state.pendingRequirements !== undefined && state.pendingRequirements.length > 0) {
    // Unsupported domain requests never reach planning or the build queue.
    return END;
  }
  switch (state.intent) {
    case "QUESTION":
    case "ROLLBACK":
      return END;
    case "CLARIFY":
      return "clarify";
    case "NEW_REQUIREMENT":
    case "MODIFY_REQUIREMENT":
      // 两遍流程（spec §5）：首次需求（无已确认设计计划）必须先出设计计划，
      // 客户确认后再进 implementation-plan；已有确认过的设计（如预览反馈小改）
      // 直接复用已确认蓝图和上一版实施规格。
      if (state.designPlanHash === undefined) return "design-plan";
      return useModuleWorkflow(state, deps)
        ? "module-plan"
        : state.designPlan?.schema === "kf-design-plan/v2" ? "implementation-plan" : "plan-change";
    case "CONFIRM_DESIGN":
      return useModuleWorkflow(state, deps) ? "module-plan" : state.designPlan?.schema === "kf-design-plan/v2" ? "implementation-plan" : "plan-change";
    case "REVISE_DESIGN":
      return "design-plan";
    case "CONFIRM_BUILD":
      // Preview-review landing: END is a langgraph built-in that cannot carry
      // a state update, so route through the explicit `done` node first.
      return "done";
    case "CONFIRM_PLAN":
      return "approval";
    case "CANCEL_PLAN":
      return "cancel-plan";
    case "BUILD":
      return "enqueue-build";
    default:
      return END;
  }
}

function useModuleWorkflow(state: AgentGraphStateValue, deps: SolutionGraphDeps | undefined): boolean {
  if (state.designPlan?.schema !== "kf-design-plan/v2") return false;
  // Only an acceptance-ready v2 blueprint has server-confirmable module
  // facts. Older v2 checkpoints created before expectedKind was introduced
  // remain compatibility inputs until the user reconfirms an adopted mapping.
  if (!state.designPlan.modules.every((module) => module.expectedKind !== undefined)) return false;
  // A checkpoint with an old UI implementation but no ModulePlan belongs to
  // the compatibility path (notably imported, not-yet-adopted controls).
  if (state.modulePlan === undefined && state.uiImplementation !== undefined) return false;
  // Old deployments/test harnesses without the module execution ports stay on
  // compatibility code. Production composition wires this complete set and
  // therefore every new v2 confirmation enters module planning.
  return deps?.modulePlanCompiler !== undefined
    && deps.assetCatalog !== undefined
    && deps.moduleArtifactAuthority !== undefined
    && deps.acceptedBlueprintConfirmation !== undefined
    && deps.uiImplementationCompiler !== undefined;
}

/**
 * Routes plan-change output. A successful plan ends in `approval` (where the
 * approval interrupt waits); a guarded/early return (DESIGN_NOT_CONFIRMED,
 * INVALID_MODEL_OUTPUT, INITIAL_DESIGN_CREATED) ends the run at `idle` so the
 * lastErrorCode is preserved instead of being overwritten by the approval node.
 */
function routeAfterPlanChange(state: AgentGraphStateValue): string {
  return state.stage === "approval" ? "approval" : END;
}

export function routeAfterModulePlan(state: AgentGraphStateValue): string {
  return state.stage === "building"
    && (state.buildAuthorization === "confirmed-blueprint" || state.buildAuthorization === "preview-feedback")
    ? "enqueue-build"
    : END;
}

/**
 * Terminal landing node for the preview-review loop (Task 9): CONFIRM_BUILD
 * routes here, persists a warm-professional thank-you message, and sets
 * stage=done. Written as a real node instead of routing CONFIRM_BUILD straight
 * to END because END accepts no state update.
 */
function createDoneNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    const job = state.buildJobId === undefined
      ? null
      : await deps.buildJobPort.getJob({
          tenantId: state.tenantId,
          jobId: state.buildJobId,
        });
    const previewReady =
      job?.status === "SUCCEEDED"
      && (state.stage === "preview-review" || state.stage === "building");
    if (!previewReady) {
      const buildInProgress =
        state.stage === "building"
        && (job?.status === "QUEUED"
          || job?.status === "RUNNING"
          || job?.status === "VALIDATING");
      await deps.workspaceQuery.appendMessage({
        tenantId: state.tenantId,
        conversationId: state.conversationId,
        role: "assistant" as const,
        content: buildInProgress
          ? "工程仍在构建和校验中，完成后右侧会自动显示预览，请稍后再确认落地。"
          : "当前还没有可确认的工程预览。请先完成效果蓝图确认、工程实施计划确认和构建；"
            + "如果实施计划生成失败，请重新生成实施计划后再继续。",
      });
      if (buildInProgress) {
        return {
          stage: "building",
          buildConfirmed: false,
          lastErrorCode: undefined,
        };
      }
      return {
        stage: "idle",
        buildConfirmed: false,
        lastErrorCode: "BUILD_PREVIEW_NOT_AVAILABLE",
      };
    }
    await deps.workspaceQuery.appendMessage({
      tenantId: state.tenantId,
      conversationId: state.conversationId,
      role: "assistant" as const,
      content: "方案已确认落地。感谢您的沟通！后续如需继续调整或新增需求，随时找我。",
    });
    return { stage: "done", buildConfirmed: true, lastErrorCode: undefined };
  };
}

/** Resume routing after the approval interrupt (brief Step 5). */
function routeAfterApproval(state: AgentGraphStateValue): string {
  switch (state.resumeAction) {
    case "approve":
      return "enqueue-build";
    case "revise":
      return state.designPlan?.schema === "kf-design-plan/v2"
        ? "implementation-plan"
        : "plan-change";
    case "cancel":
      return "cancel-plan";
    default:
      // Invalid resume or planHash mismatch: return to idle, no side effects.
      return END;
  }
}

export type { AgentGraphStateValue };

// ---------------------------------------------------------------------------
// Interrupt guard
// ---------------------------------------------------------------------------

interface GuardedGraph {
  invoke: (input: unknown, options?: unknown) => Promise<unknown>;
  stream: (input: unknown, options?: unknown) => Promise<unknown>;
  streamEvents: (input: unknown, options?: unknown) => Promise<unknown>;
  getState: (config?: unknown) => Promise<unknown>;
}

interface StateSnapshotLike {
  tasks: { interrupts: { value: unknown }[] }[];
}

/** Wraps the compiled graph so a non-resume input cannot destroy a pending approval. */
function guardCompiledGraph<G extends object>(graph: G): G {
  const raw = graph as unknown as GuardedGraph;
  const invoke = raw.invoke.bind(raw);
  const stream = raw.stream.bind(raw);
  const streamEvents = raw.streamEvents.bind(raw);

  const guarded = Object.create(graph) as G & {
    invoke: (input: unknown, options?: unknown) => Promise<unknown>;
    stream: (input: unknown, options?: unknown) => Promise<unknown>;
    streamEvents: (input: unknown, options?: unknown) => Promise<unknown>;
    getState: (config?: unknown) => Promise<unknown>;
  };
  guarded.invoke = async (input, options) => {
    await assertNoPendingInterrupt(raw, input, options);
    return invoke(input, options);
  };
  guarded.stream = async (input, options) => {
    await assertNoPendingInterrupt(raw, input, options);
    return stream(input, options);
  };
  guarded.streamEvents = async (input, options) => {
    await assertNoPendingInterrupt(raw, input, options);
    return streamEvents(input, options);
  };
  // Delegate getState explicitly: LangGraph state reads may depend on
  // instance-private fields that an Object.create wrapper cannot carry.
  guarded.getState = (config) => raw.getState(config);
  return guarded;
}

async function assertNoPendingInterrupt(
  graph: GuardedGraph,
  input: unknown,
  config: unknown,
): Promise<void> {
  const isResume = isCommand(input) && (input as { resume?: unknown }).resume !== undefined;
  if (isResume) return;

  const snapshot = (await graph.getState(config)) as StateSnapshotLike;
  const pending = snapshot.tasks.some((task) => task.interrupts.length > 0);
  if (!pending) return;

  const threadId =
    (config as { configurable?: { thread_id?: string } } | undefined)?.configurable?.thread_id ??
    "unknown";
  throw new ApprovalResumeRequiredError(threadId);
}
