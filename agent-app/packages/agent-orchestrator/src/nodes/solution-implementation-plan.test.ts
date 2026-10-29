import {
  canonicalServerHash,
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  projectGeneratedStructure,
  // end
  SolutionImplementationPlanSchema,
  type CapabilityCandidateBundle,
  type CustomerSolutionBlueprint,
  type NodeIntent,
  type SolutionImplementationPlan,
} from "@kf/contracts";
import { assertSolutionPlanUsesCandidates } from "@kf/domain-client";
import { describe, expect, it, vi } from "vitest";
import { hashDesignPlan } from "../design-plan-version.js";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { stepInputHash } from "../run-step-memo.js";
// end
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
    designPlanHash: hashDesignPlan(blueprint, 1),
    designRevision: 1,
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
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("binds only project metadata to the exact existing base project without changing semantic content", async () => {
    const original = plan();
    const lookup = vi.fn().mockResolvedValue("device-overview-status");
    const modelPort = { createSolutionImplementationPlan: vi.fn().mockResolvedValue(original), reviseSolutionImplementationSubtree: vi.fn() };
    const node = createSolutionImplementationPlanNode({ modelPort, assetCatalog: { list: vi.fn().mockResolvedValue([]) },
      workspaceQuery: { getRevisionProjectKey: lookup } } as never);
    const update = await node(state() as never);
    expect(lookup).toHaveBeenCalledWith({ tenantId: "tenant-1", workspaceId: "workspace-1", revisionId: "revision-1", domainKind: "kingclient", defaultProjectKey: "kingclient" });
    expect(modelPort.createSolutionImplementationPlan).toHaveBeenCalledWith(expect.objectContaining({ currentProjectKey: "device-overview-status" }));
    expect(update).toMatchObject({ stage: "solution-plan-ready", solutionImplementationPlan: { ...original, projectKey: "device-overview-status" } });
    expect(original).toEqual(plan());
  });
  it("refuses missing or ambiguous project evidence before any model request", async () => {
    const modelPort = { createSolutionImplementationPlan: vi.fn(), reviseSolutionImplementationSubtree: vi.fn() };
    const node = createSolutionImplementationPlanNode({ modelPort, assetCatalog: { list: vi.fn().mockResolvedValue([]) },
      workspaceQuery: { getRevisionProjectKey: vi.fn().mockRejectedValue(new Error("CREATIVE_BASE_REVISION_EVIDENCE_AMBIGUOUS")) } } as never);
    await expect(node(state() as never)).resolves.toMatchObject({ stage: "idle", lastErrorCode: "SOLUTION_PROJECT_IDENTITY_INVALID" });
    expect(modelPort.createSolutionImplementationPlan).not.toHaveBeenCalled();
  });
  it("passes the verified old structure and repairs replacement IDs without changing the original content", async () => {
    const original = plan(); const existing = projectGeneratedStructure(original);
    const renamed = plan();
    if (renamed.pages[0]!.root.kind !== "layout") throw new Error("layout fixture required");
    renamed.pages[0]!.root.children[0]!.id = "replacement-title";
    const modelPort = { createSolutionImplementationPlan: vi.fn().mockResolvedValue(renamed), reviseSolutionImplementationSubtree: vi.fn().mockResolvedValue(original) };
    const node = createSolutionImplementationPlanNode({ modelPort, assetCatalog: { list: vi.fn().mockResolvedValue([]) },
      workspaceQuery: { getRevisionProjectKey: vi.fn().mockResolvedValue(original.projectKey), getGeneratedProjectStructure: vi.fn().mockResolvedValue(existing) } } as never);
    await expect(node(state() as never)).resolves.toMatchObject({ stage: "solution-plan-ready", solutionPlanRepairAttempt: 1 });
    expect(modelPort.createSolutionImplementationPlan).toHaveBeenCalledWith(expect.objectContaining({ existingGeneratedStructure: existing }));
    expect(modelPort.reviseSolutionImplementationSubtree).toHaveBeenCalledWith(expect.objectContaining({ existingGeneratedStructure: existing,
      solutionPlanRejectionReasons: [expect.stringContaining("visitor-title")] }));
    expect(original).toEqual(plan());
  });
  it.each([true, false])("gates repeater keys even through a fake model port (valid repair=%s)", async validRepair => {
    const original = plan(); const root = original.pages[0]!.root;
    if (root.kind !== "layout") throw new Error("layout fixture required");
    original.mockData = [{ id: "status-data", purpose: "演示状态", fields: [{ key: "code", label: "内部标识", type: "text" }, { key: "label", label: "状态", type: "text" }],
      records: [{ values: [{ field: "code", value: "A" }, { field: "label", value: "A正常" }] }] }];
    const template = root.children[0]!;
    if (template.kind !== "control") throw new Error("control fixture required");
    root.children.push({ kind: "repeater", id: "status-list", sourceBlueprintRegionIds: [...root.sourceBlueprintRegionIds], intent: structuredClone(root.intent),
      mockDataId: "status-data", itemAlias: "status", keyField: "code", maxItems: 10,
      template: { ...structuredClone(template), id: "status-label", content: { kind: "repeater-field", itemAlias: "status", field: "label" } } });
    const existing = projectGeneratedStructure(SolutionImplementationPlanSchema.parse(original));
    const corrected = structuredClone(original); corrected.mockData[0]!.records[0]!.values[1]!.value = "B待机";
    const wrong = structuredClone(corrected); wrong.mockData[0]!.records[0]!.values[0]!.value = "B";
    const modelPort = { createSolutionImplementationPlan: vi.fn().mockResolvedValue(wrong),
      reviseSolutionImplementationSubtree: vi.fn().mockResolvedValue(validRepair ? corrected : wrong) };
    const node = createSolutionImplementationPlanNode({ modelPort, assetCatalog: { list: vi.fn().mockResolvedValue([]) },
      workspaceQuery: { getRevisionProjectKey: vi.fn().mockResolvedValue(original.projectKey), getGeneratedProjectStructure: vi.fn().mockResolvedValue(existing) } } as never);
    const update = await node(state() as never);
    expect(update).toMatchObject(validRepair ? { stage: "solution-plan-ready", solutionPlanRepairAttempt: 1, solutionImplementationPlan: corrected }
      : { stage: "idle", lastErrorCode: "INVALID_MODEL_OUTPUT", solutionPlanRepairAttempt: 1 });
    expect(modelPort.createSolutionImplementationPlan).toHaveBeenCalledTimes(1);
    expect(modelPort.reviseSolutionImplementationSubtree).toHaveBeenCalledTimes(1);
    expect(modelPort.reviseSolutionImplementationSubtree).toHaveBeenCalledWith(expect.objectContaining({ existingGeneratedStructure: existing,
      solutionPlanRejectionReasons: [expect.stringContaining("Retain existing repeater status-list")] }));
    expect(wrong.mockData[0]!.records[0]!.values[0]!.value).toBe("B");
  });
  it("isolates TEXT v2 retention memo from old v1 output and from another immutable revision", async () => {
    const saved = new Map<string, unknown>();
    const input = state({ runId: "text-run", planVersion: "run-plan@7" });
    const legacyHash = stepInputHash("solution-implementation-plan", "run-plan@7", {
      designPlanHash: input.designPlanHash, capabilityCandidatesHash: input.capabilityCandidatesHash,
      designRevision: input.designRevision, currentRevisionId: input.currentRevisionId,
    });
    saved.set(legacyHash, { stage: "solution-plan-ready", solutionImplementationPlan: { ...plan(), projectKey: "stale-v1" } });
    const modelPort = { createSolutionImplementationPlan: vi.fn().mockResolvedValue(plan()), reviseSolutionImplementationSubtree: vi.fn() };
    const find = vi.fn(async (_key: string, hash: string) => saved.get(hash) ?? null);
    const node = createSolutionImplementationPlanNode({ modelPort, assetCatalog: { list: vi.fn().mockResolvedValue([]) },
      resolveRunStepMemo: () => ({ find, save: async (_key: string, hash: string, result: unknown) => { saved.set(hash, result); } }) } as never);
    await expect(node(input as never)).resolves.toMatchObject({ solutionImplementationPlan: { projectKey: "visitor-center" } });
    await node(input as never);
    expect(find.mock.calls[0]![1]).not.toBe(legacyHash);
    expect(modelPort.createSolutionImplementationPlan).toHaveBeenCalledTimes(1);
    await node({ ...input, currentRevisionId: "revision-2" } as never);
    expect(modelPort.createSolutionImplementationPlan).toHaveBeenCalledTimes(2);
  });
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it.each(["SOLUTION_EXISTING_CONTEXT_TOO_LARGE", "SOLUTION_EXISTING_CONTEXT_SENSITIVE", "VISUAL_EXISTING_CONTENT_RECONSENT_REQUIRED", "CREATIVE_GENERATED_NATIVE_NAME_REGENERATION_REQUIRED"])("refuses %s before calling any model", async code => {
  // end
    const modelPort = { createSolutionImplementationPlan: vi.fn(), reviseSolutionImplementationSubtree: vi.fn() };
    const node = createSolutionImplementationPlanNode({ modelPort, assetCatalog: { list: vi.fn().mockResolvedValue([]) },
      workspaceQuery: { getGeneratedProjectStructure: vi.fn().mockRejectedValue(new Error(code)) } } as never);
    await expect(node(state() as never)).resolves.toMatchObject({ lastErrorCode: code });
    expect(modelPort.createSolutionImplementationPlan).not.toHaveBeenCalled();
  });
  // end
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

  it.each([
    ["stale hash", { designPlanHash: "a".repeat(64) }],
    ["missing revision", { designRevision: undefined }],
    ["stale revision", { designRevision: 2 }],
    ["old blueprint with a new hash", {
      designPlanHash: hashDesignPlan({ ...blueprint, displayName: "另一份蓝图" }, 1),
    }],
  ])("rejects %s before asset or semantic model access", async (_case, overrides) => {
    const { node, modelPort } = bed(plan());

    const update = await node(state(overrides) as never);

    expect(update).toMatchObject({ stage: "idle", lastErrorCode: "SOLUTION_PLANNING_FAILED" });
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

// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
function acceptedVisual(title = "参考标题") {
  const spec = { schemaVersion: 1, sourceAssetId: "reference1", sourceHash: "a".repeat(64), viewport: { width: 1440, height: 900 },
    regions: [{ id: "heading", parentId: null, role: "text", box: { x: 0, y: 0, width: 1, height: 1 }, text: [title], confidence: 0.9, interactionHint: null }],
    designTokens: { background: "#fff", foreground: "#111", accent: "#123456", spacing: [8], radius: [4] }, uncertainties: [] };
  const reference = { schemaVersion: 1, analysisId: "analysis1", specHash: canonicalServerHash(spec), spec,
    mappings: [{ regionId: "heading", controlType: "text", capabilityId: "text", support: "supported_unverified", reason: "尚未原生验证", evidenceIds: [], fallback: null }],
    acceptedDifferences: [{ regionId: "heading", disposition: "accept-unverified", capabilityId: "text", reason: "接受未验证控件" }] };
  const reviewHash = "b".repeat(64);
  return { schema: "kf-accepted-visual-planning/v1", reviewHash, confirmationHash: canonicalServerHash({ reviewHash, reference }), reference };
}
const visualResponse = () => ({ schema: "kf-visual-semantic-plan/v1", plan: plan(), bindings: [{ regionId: "heading", nodeId: "visitor-title" }] });

describe("reviewed visual semantic planning in the graph node", () => {
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  it.each(["VISUAL_SEMANTIC_CONTEXT_TOO_LARGE", "VISUAL_SEMANTIC_REPAIR_CONTEXT_TOO_LARGE"])("reports %s without retrying through the text model", async code => {
    let textCalls = 0;
    const node = createSolutionImplementationPlanNode({ assetCatalog: { list: async () => [] }, modelPort: {
      createVisualSolutionImplementationPlan: async () => { throw new Error(code); },
      createSolutionImplementationPlan: async () => { textCalls++; return plan(); },
    } } as never);
    expect(await node(state({ planVersion: "run-plan@7", acceptedVisualPlanningInput: acceptedVisual() }) as never))
      .toMatchObject({ stage: "idle", lastErrorCode: code, visualSemanticPlan: null });
    expect(textCalls).toBe(0);
  });
  // end
  it("uses the visual-only port and persists its exact semantic wrapper bound to the confirmation", async () => {
    const accepted = acceptedVisual();
    let received: unknown;
    const node = createSolutionImplementationPlanNode({ assetCatalog: { list: async () => [] }, modelPort: {
      createVisualSolutionImplementationPlan: async (context: unknown) => { received = context; return visualResponse(); },
    } } as never);
    const result = await node(state({ planVersion: "run-plan@7", acceptedVisualPlanningInput: accepted }) as never);
    expect(result).toMatchObject({ stage: "solution-plan-ready", solutionImplementationPlan: plan(),
      visualSemanticPlan: visualResponse(), visualPlanConfirmationHash: accepted.confirmationHash, solutionPlanRepairAttempt: 0 });
    expect(received).toMatchObject({ visualReference: accepted.reference, confirmedSolutionBlueprint: blueprint, capabilityCandidates });
    expect(JSON.stringify(received)).not.toContain("base64");
  });
  it("does not silently route a missing visual implementation method through the text port", async () => {
    let calls = 0;
    const node = createSolutionImplementationPlanNode({ assetCatalog: { list: async () => [] }, modelPort: {
      createSolutionImplementationPlan: async () => { calls++; return plan(); },
      reviseSolutionImplementationSubtree: async () => { calls++; return plan(); },
    } } as never);
    expect(await node(state({ planVersion: "run-plan@7", acceptedVisualPlanningInput: acceptedVisual() }) as never))
      .toMatchObject({ stage: "idle", lastErrorCode: "VISUAL_PLANNING_MODEL_NOT_CONFIGURED" });
    expect(calls).toBe(0);
  });
  it("rejects old protocol or changed confirmation data before any external access", async () => {
    let calls = 0;
    const node = createSolutionImplementationPlanNode({ assetCatalog: { list: async () => { calls++; return []; } }, modelPort: {
      createVisualSolutionImplementationPlan: async () => { calls++; return visualResponse(); },
      createSolutionImplementationPlan: async () => { calls++; return plan(); }, reviseSolutionImplementationSubtree: async () => { calls++; return plan(); },
    } } as never);
    const accepted = acceptedVisual();
    for (const overrides of [{ planVersion: "run-plan@6", acceptedVisualPlanningInput: accepted },
      { planVersion: "run-plan@7", acceptedVisualPlanningInput: { ...accepted, confirmationHash: "c".repeat(64) } }]) {
      expect(await node(state(overrides) as never)).toMatchObject({ stage: "idle", lastErrorCode: "VISUAL_PLANNING_INPUT_INVALID" });
    }
    expect(calls).toBe(0);
  });
  it("strictly rejects invented regions, semantic nodes, native IDs and noncandidate controls without hidden repair", async () => {
    const badResponses = [
      { ...visualResponse(), bindings: [{ regionId: "unknown", nodeId: "visitor-title" }] },
      { ...visualResponse(), bindings: [{ regionId: "heading", nodeId: "missing-node" }] },
      { ...visualResponse(), bindings: [{ regionId: "heading", nodeId: "visitor-title", nativeIds: ["native1"] }] },
      { ...visualResponse(), plan: plan("invented-control") },
    ];
    for (const response of badResponses) {
      let calls = 0;
      const node = createSolutionImplementationPlanNode({ assetCatalog: { list: async () => [] }, modelPort: {
        createVisualSolutionImplementationPlan: async () => { calls++; return response; },
      } } as never);
      expect(await node(state({ planVersion: "run-plan@7", acceptedVisualPlanningInput: acceptedVisual() }) as never))
        .toMatchObject({ stage: "idle", lastErrorCode: "INVALID_MODEL_OUTPUT", visualSemanticPlan: null, visualPlanConfirmationHash: null });
      expect(calls).toBe(1);
    }
  });
  it("memoizes exact reviewed input but never reuses another review's output in the same Run", async () => {
    const saved = new Map<string, unknown>();
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    const memoHashes: string[] = [];
    // end
    let calls = 0;
    const node = createSolutionImplementationPlanNode({ assetCatalog: { list: async () => [] },
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      resolveRunStepMemo: () => ({ find: async (key: string, hash: string) => { memoHashes.push(hash); return saved.get(`${key}:${hash}`) ?? null; },
      // end
        save: async (key: string, hash: string, output: unknown) => { saved.set(`${key}:${hash}`, output); } }),
      modelPort: { createVisualSolutionImplementationPlan: async () => {
        calls++; const response = visualResponse(); response.plan.projectKey = calls === 1 ? "visual-a" : "visual-b"; return response;
      } },
    } as never);
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    const firstAcceptedInput = acceptedVisual("标题A");
    const first = state({ runId: "visual-run", planVersion: "run-plan@7", acceptedVisualPlanningInput: firstAcceptedInput });
    // end
    const second = state({ ...first, acceptedVisualPlanningInput: acceptedVisual("标题B") });
    expect(SolutionImplementationPlanSchema.parse((await node(first as never)).solutionImplementationPlan).projectKey).toBe("visual-a");
    expect(SolutionImplementationPlanSchema.parse((await node(first as never)).solutionImplementationPlan).projectKey).toBe("visual-a");
    expect(SolutionImplementationPlanSchema.parse((await node(second as never)).solutionImplementationPlan).projectKey).toBe("visual-b");
    expect(calls).toBe(2);
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    expect(memoHashes[0]).toBe(stepInputHash("solution-implementation-plan", "run-plan@7", {
      designPlanHash: first.designPlanHash, capabilityCandidatesHash: first.capabilityCandidatesHash, designRevision: first.designRevision,
      currentRevisionId: first.currentRevisionId, acceptedVisualPlanningInput: firstAcceptedInput,
    }));
    // end
  });
  it("rejects orphaned visual checkpoint outputs instead of silently falling back to text", async () => {
    const { node, modelPort } = bed(plan());
    const result = await node(state({ visualSemanticPlan: visualResponse(), visualPlanConfirmationHash: "b".repeat(64) }) as never);
    expect(result).toMatchObject({ stage: "idle", lastErrorCode: "VISUAL_PLANNING_INPUT_INVALID", visualSemanticPlan: null });
    expect(modelPort.createSolutionImplementationPlan).not.toHaveBeenCalled();
  });
});
// end
