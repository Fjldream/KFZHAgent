import {
  canonicalServerHash,
  SolutionImplementationPlanSchema,
  type CapabilityCandidateBundle,
  type CustomerSolutionBlueprint,
  type NodeIntent,
  type SolutionImplementationPlan,
} from "@kf/contracts";
import { assertSolutionPlanUsesCandidates } from "@kf/domain-client";
import { describe, expect, it, vi } from "vitest";
import { createSolutionImplementationPlanNode } from "./solution-implementation-plan.js";

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
    readingOrder: ["visitor-list"],
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

const ranked = (id: string) => ({
  id,
  score: 10,
  reasons: ["语义匹配"],
  limitations: [],
  knowledgeVersion: "1.0.0",
});

const capabilityCandidates: CapabilityCandidateBundle = {
  schema: "kf-capability-candidates/v1",
  knowledgeCatalogVersion: "1.0.0",
  blueprintHash: canonicalServerHash(blueprint),
  regions: [{
    pageId: "visitor-page",
    regionId: "visitor-list",
    controls: [ranked("text"), ranked("button"), ranked("easyui.1")],
    layouts: [ranked("layout.2")],
    recipes: [ranked("list-workspace")],
  }],
  detailedCapabilityIds: ["button", "easyui.1", "layout.2", "text"],
  generatedAtPolicy: "deterministic-no-timestamp",
};

const intent: NodeIntent = {
  importance: "primary",
  visualWeight: 4,
  readingOrder: 0,
  density: "comfortable",
  groupWith: [],
  width: { mode: "fill" },
  height: { mode: "content" },
  align: "stretch",
};

function plan(capabilityId = "text"): SolutionImplementationPlan {
  return {
    schema: "kf-solution-implementation/v1",
    projectKey: "visitor-center",
    blueprintHash: canonicalServerHash(blueprint),
    candidateBundleHash: canonicalServerHash(capabilityCandidates),
    theme: {
      background: "#f4f7fb",
      surface: "#ffffff",
      primary: "#163a5f",
      accent: "#e47b32",
      textPrimary: "#14212b",
      textSecondary: "#52616d",
      fontFamily: "Inter",
      spacingUnit: 8,
      radiusScale: { small: 4, medium: 8, large: 16 },
    },
    roleStyles: [{ role: "record-title", declarations: {}, states: {} }],
    mockData: [],
    localState: [],
    pages: [{
      id: "visitor-solution-page",
      title: "访客总览",
      purpose: "查看当日预约",
      canvas: "responsive",
      sourceBlueprintPageId: "visitor-page",
      sourceBlueprintRegionIds: ["visitor-list"],
      initialStateIds: [],
      root: {
        kind: "layout",
        id: "visitor-root",
        sourceBlueprintRegionIds: ["visitor-list"],
        intent,
        layout: "row",
        children: [{
          kind: "control",
          id: "visitor-title",
          sourceBlueprintRegionIds: ["visitor-list"],
          intent,
          capabilityId,
          content: "今日访客",
          properties: [],
          tabIds: [],
          styleRole: "record-title",
          eventBindings: [],
        }],
      },
    }],
    overlays: [],
    actions: [],
    scripts: [],
  };
}

function state(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "tenant-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    conversationId: "conversation-1",
    currentRevisionId: "revision-1",
    recentMessages: [{ role: "user", content: "创建访客中心" }],
    conversationSummary: "用户需要访客管理。",
    revisionSummary: "当前为空工程。",
    generationWorkflow: "creative-v2",
    designPlan: blueprint,
    designPlanHash: canonicalServerHash(blueprint),
    capabilityCandidates,
    capabilityCandidatesHash: canonicalServerHash(capabilityCandidates),
    stage: "implementation-planning",
    ...overrides,
  };
}

function bed(initial: unknown, repaired: unknown = plan()) {
  const modelPort = {
    createSolutionImplementationPlan: vi.fn().mockResolvedValue(initial),
    reviseSolutionImplementationSubtree: vi.fn().mockResolvedValue(repaired),
  };
  return {
    modelPort,
    node: createSolutionImplementationPlanNode({
      modelPort,
      assetCatalog: { list: vi.fn().mockResolvedValue([]) },
    } as never),
  };
}

describe("solution implementation planning node", () => {
  it("validates and hashes a plan, reaches the terminal non-build stage, and makes no repair call", async () => {
    const parsed = SolutionImplementationPlanSchema.safeParse(plan());
    expect(parsed.success, parsed.success ? undefined : parsed.error.message).toBe(true);
    expect(() => assertSolutionPlanUsesCandidates(plan(), capabilityCandidates)).not.toThrow();
    const { node, modelPort } = bed(plan());
    const priorBuild = {
      changePlanId: "change-1",
      buildJobId: "build-1",
      previewArtifactId: "preview-1",
      buildAuthorization: "confirmed-blueprint",
    };
    const update = await node(state(priorBuild) as never);

    expect(update).toMatchObject({
      solutionImplementationPlan: plan(),
      solutionImplementationPlanHash: canonicalServerHash(plan()),
      solutionPlanRepairAttempt: 0,
      stage: "solution-plan-ready",
      lastErrorCode: undefined,
    });
    expect(modelPort.createSolutionImplementationPlan).toHaveBeenCalledTimes(1);
    expect(modelPort.reviseSolutionImplementationSubtree).not.toHaveBeenCalled();
    const modelInput = modelPort.createSolutionImplementationPlan.mock.calls[0]?.[0];
    expect(modelInput.capabilityCandidates.detailedCapabilityIds.length).toBeLessThanOrEqual(25);
    expect(modelInput).toMatchObject({
      confirmedSolutionBlueprint: blueprint,
      capabilityCandidates,
    });
    expect({ ...state(priorBuild), ...update }).toMatchObject(priorBuild);
  });

  it("loads bounded model-safe asset metadata through AssetCatalogPort for semantic planning", async () => {
    const modelPort = {
      createSolutionImplementationPlan: vi.fn().mockResolvedValue(plan()),
      reviseSolutionImplementationSubtree: vi.fn().mockResolvedValue(plan()),
    };
    const assetCatalog = {
      list: vi.fn().mockResolvedValue([{
        id: "visitor-portrait",
        kind: "image",
        name: "访客头像",
        mimeType: "image/png",
        description: "已登记的访客详情图片",
      }]),
    };
    const node = createSolutionImplementationPlanNode({ modelPort, assetCatalog } as never);

    const update = await node(state() as never);

    expect(update).toMatchObject({ stage: "solution-plan-ready", lastErrorCode: undefined });
    expect(assetCatalog.list).toHaveBeenCalledWith({ tenantId: "tenant-1", workspaceId: "workspace-1" });
    expect(modelPort.createSolutionImplementationPlan).toHaveBeenCalledWith(expect.objectContaining({
      assetCatalog: [{
        id: "visitor-portrait",
        kind: "image",
        name: "访客头像",
        mimeType: "image/png",
        description: "已登记的访客详情图片",
      }],
    }));
  });

  it("fails closed before model access when asset metadata is missing or exceeds the bound", async () => {
    const modelPort = {
      createSolutionImplementationPlan: vi.fn().mockResolvedValue(plan()),
      reviseSolutionImplementationSubtree: vi.fn().mockResolvedValue(plan()),
    };
    const missingPort = createSolutionImplementationPlanNode({ modelPort } as never);
    const oversizedPort = createSolutionImplementationPlanNode({
      modelPort,
      assetCatalog: {
        list: vi.fn().mockResolvedValue(Array.from({ length: 101 }, (_, index) => ({
          id: `asset-${index}`,
          kind: "image",
          name: `资源 ${index}`,
          mimeType: "image/png",
          description: "模型安全元数据",
        }))),
      },
    } as never);

    await expect(missingPort(state() as never)).resolves.toMatchObject({
      stage: "idle",
      lastErrorCode: "SOLUTION_PLANNING_FAILED",
    });
    await expect(oversizedPort(state() as never)).resolves.toMatchObject({
      stage: "idle",
      lastErrorCode: "SOLUTION_PLANNING_FAILED",
    });
    expect(modelPort.createSolutionImplementationPlan).not.toHaveBeenCalled();
  });

  it("performs one localized repair after real candidate-reference validation fails", async () => {
    const invalid = plan("not-a-candidate");
    const { node, modelPort } = bed(invalid, plan());
    const update = await node(state() as never);

    expect(update).toMatchObject({
      solutionImplementationPlan: plan(),
      solutionPlanRepairAttempt: 1,
      stage: "solution-plan-ready",
    });
    expect(modelPort.createSolutionImplementationPlan).toHaveBeenCalledTimes(1);
    expect(modelPort.reviseSolutionImplementationSubtree).toHaveBeenCalledTimes(1);
    expect(modelPort.reviseSolutionImplementationSubtree).toHaveBeenCalledWith(expect.objectContaining({
      previousSolutionImplementationPlan: invalid,
      solutionPlanRejectionReasons: [expect.stringContaining("not-a-candidate")],
      confirmedSolutionBlueprint: blueprint,
      capabilityCandidates,
    }));
  });

  it("stops after one failed repair and never makes a third planning call", async () => {
    const invalid = plan("not-a-candidate");
    const { node, modelPort } = bed(invalid, invalid);
    const update = await node(state() as never);

    expect(update).toMatchObject({
      stage: "idle",
      lastErrorCode: "INVALID_MODEL_OUTPUT",
      solutionPlanRepairAttempt: 1,
      solutionImplementationPlan: undefined,
      solutionImplementationPlanHash: undefined,
    });
    expect(modelPort.createSolutionImplementationPlan).toHaveBeenCalledTimes(1);
    expect(modelPort.reviseSolutionImplementationSubtree).toHaveBeenCalledTimes(1);
  });

  it("does not treat a primary model-call failure as a schema/reference repair opportunity", async () => {
    const { node, modelPort } = bed(plan());
    modelPort.createSolutionImplementationPlan.mockRejectedValue(new Error("model unavailable"));
    const update = await node(state() as never);

    expect(update).toMatchObject({
      stage: "idle",
      lastErrorCode: "INVALID_MODEL_OUTPUT",
      solutionPlanRepairAttempt: 0,
    });
    expect(modelPort.createSolutionImplementationPlan).toHaveBeenCalledTimes(1);
    expect(modelPort.reviseSolutionImplementationSubtree).not.toHaveBeenCalled();
  });

  it("rejects stale candidate and non-v3 inputs before any model call", async () => {
    const { node, modelPort } = bed(plan());
    const staleBundle = { ...capabilityCandidates, blueprintHash: "a".repeat(64) };
    const stale = await node(state({
      capabilityCandidates: staleBundle,
      capabilityCandidatesHash: canonicalServerHash(staleBundle),
    }) as never);
    const nonV3 = await node(state({ designPlan: { schema: "kf-design-plan/v2" } }) as never);

    expect(stale).toMatchObject({ stage: "idle", lastErrorCode: "SOLUTION_PLANNING_FAILED" });
    expect(nonV3).toMatchObject({ stage: "idle", lastErrorCode: "SOLUTION_PLANNING_FAILED" });
    expect(modelPort.createSolutionImplementationPlan).not.toHaveBeenCalled();
    expect(modelPort.reviseSolutionImplementationSubtree).not.toHaveBeenCalled();
  });

  it("fails configuration preflight without calls when the primary planning method is missing", async () => {
    const reviseSolutionImplementationSubtree = vi.fn().mockResolvedValue(plan());
    const node = createSolutionImplementationPlanNode({
      modelPort: { reviseSolutionImplementationSubtree },
    } as never);

    const update = await node(state() as never);

    expect(update).toMatchObject({
      stage: "idle",
      lastErrorCode: "SOLUTION_PLANNING_MODEL_NOT_CONFIGURED",
      solutionPlanRepairAttempt: undefined,
    });
    expect(reviseSolutionImplementationSubtree).not.toHaveBeenCalled();
  });

  it("fails configuration preflight without a partial call when the repair method is missing", async () => {
    const createSolutionImplementationPlan = vi.fn().mockResolvedValue(plan());
    const node = createSolutionImplementationPlanNode({
      modelPort: { createSolutionImplementationPlan },
    } as never);

    const update = await node(state() as never);

    expect(update).toMatchObject({
      stage: "idle",
      lastErrorCode: "SOLUTION_PLANNING_MODEL_NOT_CONFIGURED",
      solutionPlanRepairAttempt: undefined,
    });
    expect(createSolutionImplementationPlan).not.toHaveBeenCalled();
  });
});
