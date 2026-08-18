import {
  CapabilityCandidateBundleSchema,
  CustomerSolutionBlueprintSchema,
  canonicalServerHash,
} from "@kf/contracts";
import type { SolutionGraphDeps } from "../ports.js";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";

const FAILED_UPDATE = {
  capabilityCandidates: undefined,
  capabilityCandidatesHash: undefined,
  solutionImplementationPlan: undefined,
  solutionImplementationPlanHash: undefined,
  solutionPlanRepairAttempt: undefined,
  stage: "idle",
  lastErrorCode: "CAPABILITY_RETRIEVAL_FAILED",
} as const;

/** Retrieves a bounded candidate bundle without invoking the model. */
export function createCapabilityRetrievalNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    if (state.generationWorkflow !== "creative-v2" || deps.capabilityRetrieval === undefined) {
      return FAILED_UPDATE;
    }
    const parsedBlueprint = CustomerSolutionBlueprintSchema.safeParse(state.designPlan);
    if (!parsedBlueprint.success) return FAILED_UPDATE;

    const blueprint = parsedBlueprint.data;
    const blueprintHash = canonicalServerHash(blueprint);
    try {
      const parsedBundle = CapabilityCandidateBundleSchema.safeParse(
        await deps.capabilityRetrieval.retrieve({ blueprint }),
      );
      if (!parsedBundle.success || parsedBundle.data.blueprintHash !== blueprintHash) {
        return FAILED_UPDATE;
      }
      const bundle = parsedBundle.data;
      return {
        capabilityCandidates: bundle,
        capabilityCandidatesHash: canonicalServerHash(bundle),
        solutionImplementationPlan: undefined,
        solutionImplementationPlanHash: undefined,
        solutionPlanRepairAttempt: undefined,
        stage: "implementation-planning",
        lastErrorCode: undefined,
      };
    } catch {
      return FAILED_UPDATE;
    }
  };
}
