import {
  StateGraph,
  START,
  END,
  type BaseCheckpointSaver,
} from "@langchain/langgraph";
import type { AgentGraphStateValue } from "./state.js";
import { AgentGraphState } from "./state.js";
import type { SolutionGraphDeps } from "./ports.js";
import { createLoadContextNode } from "./nodes/load-context.js";
import { createClassifyIntentNode } from "./nodes/classify-intent.js";
import { createPlanChangeNode } from "./nodes/plan-change.js";
import { createApprovalNode, createCancelPlanNode } from "./nodes/approval.js";
import { createEnqueueBuildNode } from "./nodes/enqueue-build.js";

/**
 * Compiled single-agent solution workflow (brief Task 10).
 *
 * Graph shape:
 *
 *   START → load-context → classify-intent ──(conditional)──► ...
 *        ... plan-change → approval ──(conditional)──► enqueue-build / plan-change / cancel-plan / END
 *
 * Intent routing (brief Step 4) is fully deterministic:
 *   QUESTION            → idle (assistant reply persisted)
 *   NEW_REQUIREMENT     → plan-change
 *   MODIFY_REQUIREMENT  → plan-change
 *   CONFIRM_PLAN        → approval
 *   CANCEL_PLAN         → cancel-plan
 *   ROLLBACK            → idle + ROLLBACK_NOT_SUPPORTED
 *   BUILD               → enqueue-build
 *   unsupported domain  → pendingRequirements, idle, never built
 *
 * thread_id is the conversationId (brief contract); the checkpointer
 * (MemorySaver in tests, PostgresSaver in production) makes every run
 * resumable across process restarts.
 */
export function compileSolutionGraph(
  deps: SolutionGraphDeps,
  options?: { checkpointer?: BaseCheckpointSaver },
) {
  const graph = new StateGraph(AgentGraphState)
    .addNode("load-context", createLoadContextNode(deps))
    .addNode("classify-intent", createClassifyIntentNode(deps))
    .addNode("plan-change", createPlanChangeNode(deps))
    .addNode("approval", createApprovalNode())
    .addNode("cancel-plan", createCancelPlanNode(deps))
    .addNode("enqueue-build", createEnqueueBuildNode(deps))
    .addEdge(START, "load-context")
    .addEdge("load-context", "classify-intent")
    .addConditionalEdges("classify-intent", routeAfterClassify)
    .addConditionalEdges("approval", routeAfterApproval)
    .addEdge("plan-change", "approval")
    .addEdge("cancel-plan", END)
    .addEdge("enqueue-build", END)
    .compile(options);
  return graph;
}

/** Deterministic intent routing after classification (brief Step 4). */
function routeAfterClassify(state: AgentGraphStateValue): string {
  if (state.pendingRequirements !== undefined && state.pendingRequirements.length > 0) {
    // Unsupported domain requests never reach planning or the build queue.
    return END;
  }
  switch (state.intent) {
    case "QUESTION":
    case "ROLLBACK":
      return END;
    case "NEW_REQUIREMENT":
    case "MODIFY_REQUIREMENT":
      return "plan-change";
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
