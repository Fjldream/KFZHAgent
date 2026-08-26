import { describe, expect, it, vi } from "vitest";
import type { SolutionGraphDeps } from "../ports.js";
import type { AgentGraphStateValue } from "../state.js";
import { createEnqueueBuildNode } from "./enqueue-build.js";

function state(overrides: Partial<AgentGraphStateValue> = {}): AgentGraphStateValue {
  return {
    tenantId: "tenant", userId: "user", workspaceId: "workspace", conversationId: "conversation",
    currentRevisionId: "revision", activeChangeRequestId: "request", changePlanId: "plan", planHash: "a".repeat(64),
    creativeProjectKey: "kingclient", creativeDomainKind: "kingclient",
    stage: "building", recentMessages: [], ...overrides,
  } as AgentGraphStateValue;
}

function bed() {
  const enqueues: unknown[] = [];
  const messages: string[] = [];
  const deps = {
    buildJobPort: { enqueue: async (input: unknown) => { enqueues.push(input); return { id: "job", status: "QUEUED" as const }; }, getJob: async () => null },
    changePlanRepository: { findOpenChangeRequest: async () => null, saveChangeRequest: async () => {}, savePlan: async () => {}, loadPlanHash: async () => undefined, verifyPersistedCreativePlan: async () => false, setChangeRequestStatus: async () => {} },
    workspaceQuery: { listRecentMessages: async () => [], appendMessage: async (input: { content: string }) => { messages.push(input.content); }, getConversationSummary: async () => undefined, setConversationSummary: async () => {}, getCurrentRevisionId: async () => undefined, getRevisionSummary: async () => undefined, getRevisionEntities: async () => [] },
    isDomainSupported: () => true,
  } as unknown as SolutionGraphDeps;
  return { deps, enqueues, messages };
}

describe("enqueue build authorization", () => {
  it.each(["confirmed-blueprint", "preview-feedback"] as const)("accepts the proven %s module origin once", async (buildAuthorization) => {
    const testBed = bed();
    const result = await createEnqueueBuildNode(testBed.deps)(state({ buildAuthorization }));
    expect(result).toMatchObject({ buildJobId: "job", stage: "building" });
    expect(result.buildAuthorization).toBeUndefined();
    expect(testBed.enqueues).toHaveLength(1);
  });

  it("accepts only a persisted creative-solution origin and keeps the queued input small", async () => {
    const accepted = bed();
    accepted.deps.changePlanRepository.verifyPersistedCreativePlan = async () => true;
    const setStatus = vi.fn().mockResolvedValue(undefined);
    accepted.deps.changePlanRepository.setChangeRequestStatus = setStatus;
    const result = await createEnqueueBuildNode(accepted.deps)(state({
      generationWorkflow: "creative-v2",
      buildAuthorization: "creative-solution",
      changePlanId: `plan:workspace:${"a".repeat(64)}`,
    }));
    expect(result).toMatchObject({ buildJobId: "job", stage: "building", buildAuthorization: undefined });
    expect(accepted.enqueues).toEqual([{
      tenantId: "tenant",
      workspaceId: "workspace",
      baseRevisionId: "revision",
      changePlanId: `plan:workspace:${"a".repeat(64)}`,
      planHash: "a".repeat(64),
      projectKey: "kingclient",
      domainKind: "kingclient",
      idempotencyKey: expect.any(String),
    }]);
    expect(JSON.stringify(accepted.enqueues)).not.toMatch(/creativeArtifact|materialization|signature/);
    expect(setStatus).toHaveBeenCalledWith({
      tenantId: "tenant",
      workspaceId: "workspace",
      changeRequestId: "request",
      status: "APPROVED",
    });
    expect(accepted.messages.at(-1)).toContain("工程包");
    expect(accepted.messages.at(-1)).not.toContain("预览");

    for (const overrides of [
      { generationWorkflow: "legacy" as const, buildAuthorization: "creative-solution" as const },
      { generationWorkflow: "creative-v2" as const, buildAuthorization: "confirmed-blueprint" as const },
      { generationWorkflow: "creative-v2" as const, buildAuthorization: "legacy-plan-approval" as const, resumeAction: "approve" as const },
    ]) {
      const rejected = bed();
      rejected.deps.changePlanRepository.verifyPersistedCreativePlan = async () => true;
      await expect(createEnqueueBuildNode(rejected.deps)(state({
        ...overrides,
        changePlanId: `plan:workspace:${"a".repeat(64)}`,
      }))).resolves.toMatchObject({
        lastErrorCode: "BUILD_REQUIRES_APPROVAL",
      });
      expect(rejected.enqueues).toHaveLength(0);
    }
    const missingPersisted = bed();
    await expect(createEnqueueBuildNode(missingPersisted.deps)(state({
      generationWorkflow: "creative-v2",
      buildAuthorization: "creative-solution" as never,
      changePlanId: `plan:workspace:${"a".repeat(64)}`,
    }))).resolves.toMatchObject({ lastErrorCode: "INCOMPLETE_PLAN" });
    expect(missingPersisted.enqueues).toHaveLength(0);
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

  it("keeps enqueue failures bounded and never persists raw stack or secret text", async () => {
    const testBed = bed();
    testBed.deps.buildJobPort.enqueue = async () => { throw new Error(`secret=token\n${"x".repeat(3_000)}\u0000`); };
    const result = await createEnqueueBuildNode(testBed.deps)(state({ buildAuthorization: "confirmed-blueprint" }));
    expect(result.lastErrorCode).toBe("ENQUEUE_FAILED");
    expect(JSON.stringify(result)).not.toContain("secret");
    expect(testBed.messages.at(-1)).toBe("构建任务提交失败，请稍后重试。");
  });

  it("reports creative enqueue failures only as engineering generation", async () => {
    const testBed = bed();
    testBed.deps.changePlanRepository.verifyPersistedCreativePlan = async () => true;
    testBed.deps.buildJobPort.enqueue = async () => { throw new Error("queue unavailable"); };

    const result = await createEnqueueBuildNode(testBed.deps)(state({
      generationWorkflow: "creative-v2",
      buildAuthorization: "creative-solution",
      changePlanId: `plan:workspace:${"a".repeat(64)}`,
    }));

    expect(result.lastErrorCode).toBe("ENQUEUE_FAILED");
    expect(testBed.messages.at(-1)).toContain("工程生成");
    expect(testBed.messages.at(-1)).not.toMatch(/预览|构建/);
  });

  it.each(["status-zero-row", "message"] as const)(
    "preserves the durable job and never re-enqueues when the post-enqueue %s write fails",
    async (failure) => {
      const testBed = bed();
      testBed.deps.changePlanRepository.verifyPersistedCreativePlan = async () => true;
      if (failure === "status-zero-row") {
        testBed.deps.changePlanRepository.setChangeRequestStatus = async () => {
          throw new Error("CHANGE_REQUEST_STATUS_SYNC_FAILED");
        };
      } else {
        testBed.deps.workspaceQuery.appendMessage = async () => {
          throw new Error("message path /private/db secret=token");
        };
      }

      const first = await createEnqueueBuildNode(testBed.deps)(state({
        generationWorkflow: "creative-v2",
        buildAuthorization: "creative-solution",
        changePlanId: `plan:workspace:confirmation:${"a".repeat(64)}`,
      }));

      expect(first).toMatchObject({
        buildJobId: "job",
        stage: "building",
        buildAuthorization: undefined,
        lastErrorCode: "BUILD_POST_ENQUEUE_SYNC_FAILED",
      });
      expect(JSON.stringify(first)).not.toMatch(/secret|private/);
      expect(testBed.enqueues).toHaveLength(1);

      const replay = await createEnqueueBuildNode(testBed.deps)(state({
        buildJobId: first.buildJobId,
        stage: "building",
        generationWorkflow: "creative-v2",
        buildAuthorization: undefined,
        changePlanId: `plan:workspace:confirmation:${"a".repeat(64)}`,
      }));
      expect(replay.lastErrorCode).toBe("BUILD_REQUIRES_APPROVAL");
      expect(testBed.enqueues).toHaveLength(1);
    },
  );
});
