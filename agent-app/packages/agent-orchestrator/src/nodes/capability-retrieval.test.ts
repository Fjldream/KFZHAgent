import { canonicalServerHash, type CapabilityCandidateBundle, type CustomerSolutionBlueprint } from "@kf/contracts";
import { END } from "@langchain/langgraph";
import { describe, expect, it, vi } from "vitest";
import { routeAfterClassify, routeAfterDesignConfirmation } from "../solution-graph.js";
import { createCapabilityRetrievalNode } from "./capability-retrieval.js";

const blueprint: CustomerSolutionBlueprint = {
  schema: "kf-design-plan/v3",
  displayName: "访客中心",
  objective: "帮助前台查看访客预约",
  audiences: ["园区前台"],
  scenarios: ["预约审核"],
  pages: [{
    id: "visitor-page",
    title: "访客总览",
    purpose: "查看当日预约",
    readingOrder: ["visitor-list", "visitor-summary"],
    regions: [{
      id: "visitor-list",
      purpose: "浏览访客记录",
      semanticRoles: ["record-list"],
      dataShape: "record-list",
      density: "comfortable",
      importance: "primary",
      content: ["访客姓名"],
      sampleData: [{ 访客姓名: "陈嘉宁" }],
      interactions: ["选择访客"],
      states: ["initial"],
      visualIntent: "清晰可信",
    }, {
      id: "visitor-summary",
      purpose: "概览访客数量",
      semanticRoles: ["status-summary"],
      dataShape: "summary",
      density: "comfortable",
      importance: "secondary",
      content: ["今日访客数"],
      sampleData: [{ 今日访客数: "12" }],
      interactions: ["查看访客列表"],
      states: ["initial"],
      visualIntent: "醒目简洁",
    }],
  }],
  journeys: [{
    id: "review-visitor",
    actor: "园区前台",
    goal: "查看预约",
    steps: [{ pageId: "visitor-page", regionId: "visitor-list", action: "选择访客", result: "显示访客" }],
    completion: "完成预约查看",
  }],
  visualDirection: {
    tone: "专业友好",
    colors: ["深海蓝"],
    typography: "层级清晰",
    spacingAndSurfaces: "舒适留白",
  },
  acceptanceScenarios: ["可以查看访客预约"],
  openQuestions: [],
};

function candidates(blueprintHash = canonicalServerHash(blueprint)): CapabilityCandidateBundle {
  const ranked = (id: string) => ({
    id,
    score: 10,
    reasons: ["语义匹配"],
    limitations: [],
    knowledgeVersion: "1.0.0",
  });
  return {
    schema: "kf-capability-candidates/v1",
    knowledgeCatalogVersion: "1.0.0",
    blueprintHash,
    regions: [{
      pageId: "visitor-page",
      regionId: "visitor-list",
      controls: [ranked("text"), ranked("button"), ranked("easyui.1")],
      layouts: [ranked("layout.2")],
      recipes: [ranked("list-workspace")],
    }, {
      pageId: "visitor-page",
      regionId: "visitor-summary",
      controls: [ranked("text"), ranked("button"), ranked("easyui.1")],
      layouts: [ranked("layout.2")],
      recipes: [ranked("list-workspace")],
    }],
    detailedCapabilityIds: ["button", "easyui.1", "layout.2", "text"],
    generatedAtPolicy: "deterministic-no-timestamp",
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    conversationId: "conversation-1",
    recentMessages: [{ role: "user", content: "创建访客中心" }],
    generationWorkflow: "creative-v2",
    designPlan: blueprint,
    designPlanHash: canonicalServerHash(blueprint),
    stage: "design-review",
    ...overrides,
  };
}

describe("capability retrieval node", () => {
  it("retrieves deterministically, binds the confirmed blueprint hash, and clears stale creative planning state", async () => {
    const retrieve = vi.fn().mockResolvedValue(candidates());
    const node = createCapabilityRetrievalNode({ capabilityRetrieval: { retrieve } } as never);
    const priorBuild = {
      changePlanId: "change-1",
      buildJobId: "build-1",
      previewArtifactId: "preview-1",
      buildAuthorization: "confirmed-blueprint",
    };

    const update = await node(state({
      ...priorBuild,
      solutionImplementationPlan: { stale: true },
      solutionImplementationPlanHash: "f".repeat(64),
      solutionPlanRepairAttempt: 1,
    }) as never);

    const bundle = candidates();
    expect(retrieve).toHaveBeenCalledWith({ blueprint });
    expect(update).toMatchObject({
      stage: "implementation-planning",
      capabilityCandidates: bundle,
      capabilityCandidatesHash: canonicalServerHash(bundle),
      solutionImplementationPlan: undefined,
      solutionImplementationPlanHash: undefined,
      solutionPlanRepairAttempt: undefined,
    });
    expect({ ...state(priorBuild), ...update }).toMatchObject(priorBuild);
  });

  it("rejects a non-v3 design without retrieving", async () => {
    const retrieve = vi.fn();
    const node = createCapabilityRetrievalNode({ capabilityRetrieval: { retrieve } } as never);
    const update = await node(state({ designPlan: { schema: "kf-design-plan/v2" } }) as never);

    expect(update).toMatchObject({ stage: "idle", lastErrorCode: "CAPABILITY_RETRIEVAL_FAILED" });
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("rejects a candidate bundle bound to a different blueprint hash", async () => {
    const retrieve = vi.fn().mockResolvedValue(candidates("a".repeat(64)));
    const node = createCapabilityRetrievalNode({ capabilityRetrieval: { retrieve } } as never);
    const update = await node(state() as never);

    expect(update).toMatchObject({
      stage: "idle",
      lastErrorCode: "CAPABILITY_RETRIEVAL_FAILED",
      capabilityCandidates: undefined,
      capabilityCandidatesHash: undefined,
    });
  });

  it("rejects a same-hash candidate bundle missing a confirmed blueprint page-region", async () => {
    const forged = candidates();
    forged.regions = forged.regions.slice(0, 1);
    const retrieve = vi.fn().mockResolvedValue(forged);
    const node = createCapabilityRetrievalNode({ capabilityRetrieval: { retrieve } } as never);

    const update = await node(state() as never);

    expect(forged.blueprintHash).toBe(canonicalServerHash(blueprint));
    expect(update).toMatchObject({ stage: "idle", lastErrorCode: "CAPABILITY_RETRIEVAL_FAILED" });
  });

  it("rejects a same-hash candidate bundle with an extra page-region identity", async () => {
    const forged = candidates();
    forged.regions = [...forged.regions, {
      ...forged.regions[0]!,
      pageId: "forged-page",
      regionId: "forged-region",
    }];
    const retrieve = vi.fn().mockResolvedValue(forged);
    const node = createCapabilityRetrievalNode({ capabilityRetrieval: { retrieve } } as never);

    const update = await node(state() as never);

    expect(forged.blueprintHash).toBe(canonicalServerHash(blueprint));
    expect(update).toMatchObject({ stage: "idle", lastErrorCode: "CAPABILITY_RETRIEVAL_FAILED" });
  });
});

describe("creative-v2 routing", () => {
  it("routes a confirmed v3 blueprint through capability retrieval", () => {
    expect(routeAfterDesignConfirmation(state() as never)).toBe("capability-retrieval");
  });

  it("rejects creative-v2 confirmation when the design is not v3", () => {
    expect(routeAfterDesignConfirmation(state({ designPlan: { schema: "kf-design-plan/v2" } }) as never)).toBe(END);
  });

  it("keeps module-v1 and uploaded projects on their existing routes", () => {
    const v2 = { schema: "kf-design-plan/v2" };
    const moduleDeps = {
      modulePlanCompiler: {},
      assetCatalog: {},
      moduleArtifactAuthority: {},
      acceptedBlueprintConfirmation: {},
      uiImplementationCompiler: {},
    };
    expect(routeAfterClassify(state({
      intent: "CONFIRM_DESIGN",
      generationWorkflow: "module-v1",
      workspaceMode: "new",
      designPlan: v2,
    }) as never, moduleDeps as never)).toBe("module-plan");
    expect(routeAfterClassify(state({
      intent: "CONFIRM_DESIGN",
      generationWorkflow: "legacy",
      workspaceMode: "upload",
      designPlan: v2,
    }) as never, moduleDeps as never)).toBe("implementation-plan");
  });
});
