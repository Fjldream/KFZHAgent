import { describe, expect, it } from "vitest";
import type { SolutionGraphDeps } from "../ports.js";
import type { AgentGraphStateValue } from "../state.js";
import { createEnqueueBuildNode } from "./enqueue-build.js";

function state(overrides: Partial<AgentGraphStateValue> = {}): AgentGraphStateValue {
  return {
    tenantId: "tenant", userId: "user", workspaceId: "workspace", conversationId: "conversation",
    currentRevisionId: "revision", activeChangeRequestId: "request", changePlanId: "plan", planHash: "a".repeat(64),
    stage: "building", recentMessages: [], ...overrides,
  } as AgentGraphStateValue;
}

function bed() {
  const enqueues: unknown[] = [];
  const deps = {
    buildJobPort: { enqueue: async (input: unknown) => { enqueues.push(input); return { id: "job", status: "QUEUED" as const }; }, getJob: async () => null },
    changePlanRepository: { findOpenChangeRequest: async () => null, saveChangeRequest: async () => {}, savePlan: async () => {}, loadPlanHash: async () => undefined, setChangeRequestStatus: async () => {} },
    workspaceQuery: { listRecentMessages: async () => [], appendMessage: async () => {}, getConversationSummary: async () => undefined, setConversationSummary: async () => {}, getCurrentRevisionId: async () => undefined, getRevisionSummary: async () => undefined, getRevisionEntities: async () => [] },
    isDomainSupported: () => true,
  } as unknown as SolutionGraphDeps;
  return { deps, enqueues };
}

describe("enqueue build authorization", () => {
  it.each(["confirmed-blueprint", "preview-feedback"] as const)("accepts the proven %s module origin once", async (buildAuthorization) => {
    const testBed = bed();
    const result = await createEnqueueBuildNode(testBed.deps)(state({ buildAuthorization }));
    expect(result).toMatchObject({ buildJobId: "job", stage: "building" });
    expect(result.buildAuthorization).toBeUndefined();
    expect(testBed.enqueues).toHaveLength(1);
  });

  it("requires both approval origin and approve resume for the legacy path", async () => {
    const approved = bed();
    await expect(createEnqueueBuildNode(approved.deps)(state({ buildAuthorization: "legacy-plan-approval", resumeAction: "approve" }))).resolves.toMatchObject({ buildJobId: "job" });
    const missingResume = bed();
    await expect(createEnqueueBuildNode(missingResume.deps)(state({ buildAuthorization: "legacy-plan-approval" }))).resolves.toMatchObject({ lastErrorCode: "BUILD_REQUIRES_APPROVAL" });
    expect(missingResume.enqueues).toHaveLength(0);
  });

  it("rejects a direct or stale build and consumes authorization on success", async () => {
    const direct = bed();
    const rejected = await createEnqueueBuildNode(direct.deps)(state({ intent: "BUILD" }));
    expect(rejected).toMatchObject({ lastErrorCode: "BUILD_REQUIRES_APPROVAL", buildAuthorization: undefined });
    expect(direct.enqueues).toHaveLength(0);
  });
});
