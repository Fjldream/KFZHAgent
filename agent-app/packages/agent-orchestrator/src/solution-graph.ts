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
 *   CONFIRM_DESIGN      → plan-change (design plan confirmed; guard requires designPlanHash)
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
    .addNode("plan-change", createPlanChangeNode(deps))
    .addNode("approval", createApprovalNode())
    .addNode("cancel-plan", createCancelPlanNode(deps))
    .addNode("enqueue-build", createEnqueueBuildNode(deps))
    .addNode("done", createDoneNode())
    .addEdge(START, "load-context")
    .addEdge("load-context", "classify-intent")
    .addConditionalEdges("classify-intent", routeAfterClassify)
    .addConditionalEdges("plan-change", routeAfterPlanChange)
    .addConditionalEdges("approval", routeAfterApproval)
    .addEdge("cancel-plan", END)
    .addEdge("enqueue-build", END)
    .addEdge("done", END)
    .compile(options);
  return guardCompiledGraph(graph);
}

/** Deterministic intent routing after classification (brief Step 4 + spec §5.2). */
function routeAfterClassify(state: AgentGraphStateValue): string {
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
      return "plan-change";
    case "CONFIRM_DESIGN":
      return "plan-change";
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

/**
 * Routes plan-change output. A successful plan ends in `approval` (where the
 * approval interrupt waits); a guarded/early return (DESIGN_NOT_CONFIRMED,
 * INVALID_MODEL_OUTPUT, INITIAL_DESIGN_CREATED) ends the run at `idle` so the
 * lastErrorCode is preserved instead of being overwritten by the approval node.
 */
function routeAfterPlanChange(state: AgentGraphStateValue): string {
  return state.stage === "approval" ? "approval" : END;
}

/**
 * Terminal landing node for the preview-review loop (Task 9): CONFIRM_BUILD
 * routes here and sets stage=done. Written as a real node instead of routing
 * CONFIRM_BUILD straight to END because END accepts no state update.
 */
function createDoneNode() {
  return (_state: AgentGraphStateValue): AgentGraphUpdate => ({ stage: "done" });
}

/** Resume routing after the approval interrupt (brief Step 5). */
function routeAfterApproval(state: AgentGraphStateValue): string {
  switch (state.resumeAction) {
    case "approve":
      return "enqueue-build";
    case "revise":
      return "plan-change";
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
