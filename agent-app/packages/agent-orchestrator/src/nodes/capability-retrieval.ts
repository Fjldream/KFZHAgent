import {
  CapabilityCandidateBundleSchema,
  CustomerSolutionBlueprintSchema,
  canonicalServerHash,
} from "@kf/contracts";
import type { SolutionGraphDeps } from "../ports.js";
import type { AgentGraphStateValue, AgentGraphUpdate } from "../state.js";
import { hasCurrentDesignPlanVersion } from "../design-plan-version.js";

const FAILED_UPDATE = {
  capabilityCandidates: undefined,
  capabilityCandidatesHash: undefined,
  solutionImplementationPlan: undefined,
  solutionImplementationPlanHash: undefined,
  solutionPlanRepairAttempt: undefined,
  stage: "idle",
  lastErrorCode: "CAPABILITY_RETRIEVAL_FAILED",
} as const;

function pageRegionIdentity(pageId: string, regionId: string): string {
  return `${pageId}\u0000${regionId}`;
}

function hasExactPageRegionCoverage(
  blueprint: NonNullable<AgentGraphStateValue["designPlan"]> & { schema: "kf-design-plan/v3" },
  bundle: NonNullable<AgentGraphStateValue["capabilityCandidates"]>,
): boolean {
  const expected = new Set(blueprint.pages.flatMap((page) =>
    page.regions.map((region) => pageRegionIdentity(page.id, region.id)),
  ));
  const actual = new Set(bundle.regions.map((region) =>
    pageRegionIdentity(region.pageId, region.regionId),
  ));
  return expected.size === actual.size && [...expected].every((identity) => actual.has(identity));
}

/** Retrieves a bounded candidate bundle without invoking the model. */
export function createCapabilityRetrievalNode(deps: SolutionGraphDeps) {
  return async (state: AgentGraphStateValue): Promise<AgentGraphUpdate> => {
    if (state.generationWorkflow !== "creative-v2" || deps.capabilityRetrieval === undefined) {
      return FAILED_UPDATE;
    }
    const parsedBlueprint = CustomerSolutionBlueprintSchema.safeParse(state.designPlan);
    if (!parsedBlueprint.success) return FAILED_UPDATE;

    const blueprint = parsedBlueprint.data;
    if (!hasCurrentDesignPlanVersion(blueprint, state.designRevision, state.designPlanHash)) {
      return FAILED_UPDATE;
    }
    const blueprintHash = canonicalServerHash(blueprint);
    try {
      const parsedBundle = CapabilityCandidateBundleSchema.safeParse(
        // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
        await deps.capabilityRetrieval.retrieve({ blueprint, ...(state.acceptedVisualPlanningInput == null ? {} : { visualReference: state.acceptedVisualPlanningInput.reference }) }),
        // end
      );
      if (
        !parsedBundle.success
        || parsedBundle.data.blueprintHash !== blueprintHash
        || !hasExactPageRegionCoverage(blueprint, parsedBundle.data)
      ) {
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
