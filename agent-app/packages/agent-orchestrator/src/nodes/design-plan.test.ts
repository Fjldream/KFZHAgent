import { describe, expect, it, vi } from "vitest";
import { createDesignPlanNode } from "./design-plan.js";
import { createCapabilityRetrievalNode } from "./capability-retrieval.js";
import { createPlanChangeNode } from "./plan-change.js";
import { intentValues } from "../schemas/intent.js";
import type { CustomerEffectBlueprint, CustomerSolutionBlueprint } from "@kf/contracts";
import { decodeBlueprintMessage } from "../blueprint-message.js";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { canonicalServerHash } from "@kf/contracts";
// end

const designPlan: CustomerEffectBlueprint = {
  schema: "kf-design-plan/v2",
  displayName: "生产监控大屏",
  overview: {
    objective: "让值班人员快速掌握生产状态",
    audiences: ["值班人员"],
    scenarios: ["生产监控"],
    valueProposition: "集中呈现产量、趋势和异常",
  },
  informationArchitecture: {
    narrative: "从总览到趋势和异常",
    wireframe: "总览 → 趋势 → 异常",
  },
  modules: [{
    id: "kpi",
    name: "生产 KPI",
    purpose: "展示关键生产指标",
    content: ["产量", "达成率", "异常数"],
    sampleData: [{ label: "当日产量", value: "12,680 件" }],
    interactions: ["点击指标查看详情"],
    presentation: "顶部指标卡片",
  }],
  visualDirection: {
    tone: "专业工业感",
    colors: ["深蓝", "青绿"],
    typography: "指标数字突出",
    spacingAndSurfaces: "深色卡片与清晰留白",
  },
  highlights: ["指标与趋势联动"],
  revisionNotes: { added: ["生产 KPI 模块"], changed: [], retained: [] },
  acceptanceCriteria: ["首屏展示产量、达成率和异常数"],
  openQuestions: [],
};

const revisedDesignPlan: CustomerEffectBlueprint = {
  ...designPlan,
  modules: [
    ...designPlan.modules,
    {
      id: "alerts",
      name: "异常追踪",
      purpose: "说明当前异常与处理状态",
      content: ["异常名称", "级别", "负责人"],
      sampleData: [{ label: "异常", value: "二号线温度偏高" }],
      interactions: ["点击查看处置过程"],
      presentation: "右侧异常列表",
    },
  ],
  revisionNotes: {
    added: ["异常追踪模块"],
    changed: [],
    retained: ["保留生产 KPI 模块"],
  },
  acceptanceCriteria: [...designPlan.acceptanceCriteria, "展示异常级别和负责人"],
};

const creativeBlueprint: CustomerSolutionBlueprint = {
  schema: "kf-design-plan/v3",
  displayName: "访客协同中心",
  objective: "帮助园区前台处理访客预约",
  audiences: ["园区前台"],
  scenarios: ["预约审核"],
  pages: [{
    id: "visitor-overview",
    title: "访客总览",
    purpose: "处理当日预约",
    readingOrder: ["visitor-list"],
    regions: [{
      id: "visitor-list",
      purpose: "浏览访客记录",
      semanticRoles: ["record-list"],
      dataShape: "record-list",
      density: "comfortable",
      importance: "primary",
      content: ["访客姓名", "预约时段"],
      sampleData: [{ 访客姓名: "陈嘉宁", 预约时段: "14:30" }],
      interactions: [],
      states: ["待审核"],
      visualIntent: "清晰可信",
    }],
  }],
  journeys: [{
    id: "review-visitor",
    actor: "园区前台",
    goal: "审核预约",
    steps: [{ pageId: "visitor-overview", regionId: "visitor-list", action: "选择预约", result: "显示详情" }],
    completion: "完成预约审核",
  }],
  visualDirection: { tone: "专业友好", colors: ["深海蓝"], typography: "层级清晰", spacingAndSurfaces: "舒适留白" },
  acceptanceScenarios: ["可以查看并审核预约"],
  openQuestions: [],
};

function makeDesignDeps() {
  const modelPort = { createDesignPlan: vi.fn().mockResolvedValue(designPlan) };
  const workspaceQuery = {
    appendMessage: vi.fn().mockResolvedValue(undefined),
    getRevisionEntities: vi.fn().mockResolvedValue([{ kind: "page", name: "Page1", type: "page", guid: "page-guid" }]),
  };
  const modulePlanCompiler = {
    listPlanningCatalog: vi.fn().mockResolvedValue([
      {
        kind: "content.hero",
        version: "1.0.0",
        maturity: "stable",
        variants: ["no-portrait"],
        slots: [],
        interactions: [],
      },
    ]),
  };
  return {
    deps: { modelPort, workspaceQuery, modulePlanCompiler } as never,
    modelPort,
    modulePlanCompiler,
    workspaceQuery,
  };
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "t1",
    userId: "u1",
    workspaceId: "w1",
    conversationId: "c1",
    recentMessages: [{ id: "m1", role: "user", content: "生成监控大屏" }],
    requirementText: "生成监控大屏",
    stage: "design-review",
    ...overrides,
  };
}

// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
function acceptedReference(title = "参考标题") {
  const spec = { schemaVersion: 1, sourceAssetId: "reference1", sourceHash: "a".repeat(64), viewport: { width: 1440, height: 900 },
    regions: [{ id: "heading", parentId: null, role: "text", box: { x: 0, y: 0, width: 1, height: 1 }, text: [title], confidence: 0.9, interactionHint: null }],
    designTokens: { background: "#fff", foreground: "#111", accent: "#123456", spacing: [8], radius: [4] }, uncertainties: [] };
  const reference = { schemaVersion: 1, analysisId: "analysis1", specHash: canonicalServerHash(spec), spec,
    mappings: [{ regionId: "heading", controlType: "text", capabilityId: "text", support: "supported_unverified", reason: "尚未原生验证", evidenceIds: [], fallback: null }],
    acceptedDifferences: [{ regionId: "heading", disposition: "accept-unverified", capabilityId: "text", reason: "接受未验证控件" }] };
  const reviewHash = "b".repeat(64);
  return { schema: "kf-accepted-visual-planning/v1", reviewHash, confirmationHash: canonicalServerHash({ reviewHash, reference }), reference };
}
describe("independent visual blueprint planning", () => {
  function setup(result: unknown = creativeBlueprint) {
    const messages: string[] = []; let textCalls = 0; const received: unknown[] = [];
    const deps = { modelPort: {
      createDesignPlan: async () => { textCalls++; return creativeBlueprint; },
      createVisualDesignPlan: async (context: unknown) => { received.push(context); return result; },
    }, workspaceQuery: { appendMessage: async (message: { content: string }) => { messages.push(message.content); } } };
    return { deps, messages, received, textCalls: () => textCalls };
  }
  const visualState = (extra: Record<string, unknown> = {}) => baseState({ generationWorkflow: "creative-v2", planVersion: "run-plan@7",
    acceptedVisualPlanningInput: acceptedReference(), currentRevisionId: "base1", ...extra });
  it("uses only the visual port, displays a separately confirmable blueprint and clears old engineering authority", async () => {
    const test = setup(); const accepted = acceptedReference();
    const update = await createDesignPlanNode(test.deps as never)(visualState({ designPlan: creativeBlueprint,
      designPlanHash: "c".repeat(64), buildAuthorization: "confirmed-blueprint", buildJobId: "old-job", creativeConfirmationId: "d".repeat(64),
      recentMessages: [{ role: "assistant", content: "旧蓝图已批准" }, { role: "user", content: "根据图片重新规划" }] }) as never);
    expect(update).toMatchObject({ stage: "design-review", designPlan: creativeBlueprint, visualBlueprintConfirmationHash: accepted.confirmationHash });
    expect(update.buildAuthorization).toBeUndefined(); expect(update.buildJobId).toBeUndefined(); expect(update.creativeConfirmationId).toBeUndefined();
    expect(test.textCalls()).toBe(0); expect(test.received).toHaveLength(1);
    expect(test.received[0]).toMatchObject({ visualReference: accepted.reference, currentRevisionId: "base1", recentMessages: [{ role: "user", content: "根据图片重新规划" }] });
    expect((test.received[0] as { designPlan?: unknown }).designPlan).toBeUndefined();
    expect(test.messages).toHaveLength(1); expect(decodeBlueprintMessage(test.messages[0]!)).not.toBeNull();
  });
  it.each(["protocol", "confirmation", "orphan"] as const)("rejects %s mismatch before calling either model or displaying a blueprint", async change => {
    const test = setup(); const accepted = acceptedReference();
    const extra = change === "protocol" ? { planVersion: "run-plan@6" } : change === "confirmation"
      ? { acceptedVisualPlanningInput: { ...accepted, confirmationHash: "e".repeat(64) } }
      : { acceptedVisualPlanningInput: null, visualBlueprintConfirmationHash: "e".repeat(64) };
    const update = await createDesignPlanNode(test.deps as never)(visualState(extra) as never);
    expect(update).toMatchObject({ stage: "idle", lastErrorCode: "VISUAL_PLANNING_INPUT_INVALID", visualBlueprintConfirmationHash: null });
    expect(test.textCalls()).toBe(0); expect(test.received).toHaveLength(0); expect(test.messages).toHaveLength(0);
  });
  it("does not fall back to the text method when the visual port is absent", async () => {
    const test = setup(); const modelPort = { createDesignPlan: test.deps.modelPort.createDesignPlan };
    const update = await createDesignPlanNode({ ...test.deps, modelPort } as never)(visualState() as never);
    expect(update).toMatchObject({ stage: "idle", lastErrorCode: "VISUAL_BLUEPRINT_MODEL_NOT_CONFIGURED" });
    expect(test.textCalls()).toBe(0); expect(test.messages).toHaveLength(0);
  });
  it("does not silently repair or retain an old approved blueprint after invalid visual output", async () => {
    const test = setup({ schema: "kf-design-plan/v3", displayName: "不完整" });
    const update = await createDesignPlanNode(test.deps as never)(visualState({ designPlan: creativeBlueprint, buildAuthorization: "confirmed-blueprint" }) as never);
    expect(update).toMatchObject({ stage: "idle", lastErrorCode: "INVALID_MODEL_OUTPUT", visualBlueprintConfirmationHash: null });
    expect(update.designPlan).toBeUndefined(); expect(update.buildAuthorization).toBeUndefined();
    expect(test.received).toHaveLength(1); expect(test.textCalls()).toBe(0); expect(test.messages).toHaveLength(0);
  });
  it("does not reuse a blueprint memo across two differently confirmed visual inputs", async () => {
    const test = setup(); const saved = new Map<string, unknown>();
    const memo = { find: async (step: string, hash: string) => saved.get(`${step}:${hash}`) ?? null,
      save: async (step: string, hash: string, output: unknown) => { saved.set(`${step}:${hash}`, output); } };
    const node = createDesignPlanNode({ ...test.deps, resolveRunStepMemo: () => memo } as never);
    const first = visualState({ runId: "visual-design-run", acceptedVisualPlanningInput: acceptedReference("标题A") });
    const second = visualState({ runId: "visual-design-run", acceptedVisualPlanningInput: acceptedReference("标题B") });
    await node(first as never); await node(first as never); await node(second as never);
    expect(test.received).toHaveLength(2); expect(test.messages).toHaveLength(2); expect(test.textCalls()).toBe(0);
  });
  it.each(["IMAGE_EGRESS_NOT_ALLOWED", "VISUAL_RUN_NOT_ACTIVE"])("retains the safe stop reason %s instead of calling it invalid model output", async code => {
    const test = setup(); test.deps.modelPort.createVisualDesignPlan = async () => { throw new Error(code); };
    const update = await createDesignPlanNode(test.deps as never)(visualState() as never);
    expect(update).toMatchObject({ stage: "idle", lastErrorCode: code, visualBlueprintConfirmationHash: null });
    expect(test.messages).toHaveLength(0); expect(test.textCalls()).toBe(0);
  });
});
// end

describe("intent schema design-loop values", () => {
  it("adds CONFIRM_DESIGN and REVISE_DESIGN to the intent enum", () => {
    expect(intentValues).toContain("CONFIRM_DESIGN");
    expect(intentValues).toContain("REVISE_DESIGN");
  });
});

describe("design-plan node", () => {
  it("passes the bounded workflow discriminator and validates/encodes v3 only for creative-v2", async () => {
    const { deps, modelPort, workspaceQuery } = makeDesignDeps();
    modelPort.createDesignPlan.mockResolvedValue(creativeBlueprint);
    const node = createDesignPlanNode(deps);

    const update = await node(baseState({ generationWorkflow: "creative-v2" }) as never);

    expect(update).toMatchObject({ designPlan: creativeBlueprint, stage: "design-review" });
    expect(modelPort.createDesignPlan).toHaveBeenCalledWith(
      expect.objectContaining({ generationWorkflow: "creative-v2" }),
      { revising: false },
    );
    const encoded = workspaceQuery.appendMessage.mock.calls[0]?.[0]?.content as string;
    expect(decodeBlueprintMessage(encoded)).toEqual({
      blueprint: creativeBlueprint,
      revision: 1,
      designPlanHash: update.designPlanHash,
    });
  });

  it("does not accept a v3 blueprint from module-v1 or legacy design planning", async () => {
    const { deps, modelPort, workspaceQuery } = makeDesignDeps();
    modelPort.createDesignPlan.mockResolvedValue(creativeBlueprint);
    const node = createDesignPlanNode(deps);

    const moduleResult = await node(baseState({ generationWorkflow: "module-v1" }) as never);
    const legacyResult = await node(baseState({ generationWorkflow: "legacy" }) as never);

    expect(moduleResult).toMatchObject({ stage: "idle", lastErrorCode: "INVALID_MODEL_OUTPUT" });
    expect(legacyResult).toMatchObject({ stage: "idle", lastErrorCode: "INVALID_MODEL_OUTPUT" });
    expect(workspaceQuery.appendMessage).not.toHaveBeenCalled();
  });

  it("clears every downstream creative identity on a successful REVISE_DESIGN before later failures", async () => {
    const { deps, modelPort } = makeDesignDeps();
    modelPort.createDesignPlan.mockResolvedValue({
      ...creativeBlueprint,
      displayName: "访客协同中心修订版",
    });

    const staleState = baseState({
      generationWorkflow: "creative-v2",
      intent: "REVISE_DESIGN",
      designPlan: creativeBlueprint,
      designPlanHash: "a".repeat(64),
      designRevision: 1,
      capabilityCandidates: { stale: true },
      capabilityCandidatesHash: "b".repeat(64),
      solutionImplementationPlan: { stale: true },
      solutionImplementationPlanHash: "c".repeat(64),
      activeChangeRequestId: "stale-request",
      changePlanId: "stale-plan",
      planHash: "d".repeat(64),
      buildJobId: "stale-job",
      buildAuthorization: "creative-solution",
      creativeConfirmationId: "e".repeat(64),
      creativeProjectKey: "stale-project",
      creativeDomainKind: "kingclient",
      diffArtifactId: "stale-diff",
      previewArtifactId: "stale-preview",
    });
    const update = await createDesignPlanNode(deps)(staleState as never);

    expect(update).toMatchObject({
      stage: "design-review",
      designPlan: expect.objectContaining({ displayName: "访客协同中心修订版" }),
      capabilityCandidates: undefined,
      solutionImplementationPlan: undefined,
      activeChangeRequestId: undefined,
      changePlanId: undefined,
      planHash: undefined,
      buildJobId: undefined,
      buildAuthorization: undefined,
      creativeConfirmationId: undefined,
      creativeProjectKey: undefined,
      creativeDomainKind: undefined,
      diffArtifactId: undefined,
      previewArtifactId: undefined,
    });

    const laterFailure = await createCapabilityRetrievalNode({
      capabilityRetrieval: { retrieve: vi.fn().mockRejectedValue(new Error("catalog unavailable")) },
    } as never)({ ...staleState, ...update } as never);
    expect({ ...staleState, ...update, ...laterFailure }).toMatchObject({
      stage: "idle",
      lastErrorCode: "CAPABILITY_RETRIEVAL_FAILED",
      activeChangeRequestId: undefined,
      changePlanId: undefined,
      planHash: undefined,
      buildJobId: undefined,
      buildAuthorization: undefined,
      creativeConfirmationId: undefined,
      diffArtifactId: undefined,
      previewArtifactId: undefined,
    });
  });

  it("generates a design plan, hashes it, shows it, and returns to design-review", async () => {
    const { deps, modelPort, workspaceQuery } = makeDesignDeps();
    const node = createDesignPlanNode(deps);
    const update = await node(baseState() as never);

    expect(update.designPlan).toEqual(designPlan);
    expect(update.designPlanHash).toMatch(/^[0-9a-f]{64}$/);
    expect(update.designRevision).toBe(1);
    expect(update.stage).toBe("design-review");
    expect(update.revising).toBeUndefined();
    expect(modelPort.createDesignPlan).toHaveBeenCalledWith(
      expect.objectContaining({ requirementText: "生成监控大屏", conversationId: "c1" }),
      { revising: false },
    );
    const message = workspaceQuery.appendMessage.mock.calls[0]?.[0];
    expect(message).toEqual(expect.objectContaining({ tenantId: "t1", conversationId: "c1", role: "assistant" }));
    expect(decodeBlueprintMessage(message?.content as string)).toEqual({
      blueprint: designPlan,
      revision: 1,
      designPlanHash: update.designPlanHash,
    });
  });

  it("supplies only the stable planning catalog when a server-owned module workflow creates the blueprint", async () => {
    const { deps, modelPort, modulePlanCompiler, workspaceQuery } = makeDesignDeps();
    const node = createDesignPlanNode(deps);

    await node(baseState({ generationWorkflow: "module-v1", currentRevisionId: "revision-1" }) as never);

    expect(modulePlanCompiler.listPlanningCatalog).toHaveBeenCalledTimes(1);
    expect(modelPort.createDesignPlan).toHaveBeenCalledWith(
      expect.objectContaining({
        modulePlanningCatalog: [expect.objectContaining({ kind: "content.hero", maturity: "stable" })],
        editableEntities: [{ kind: "page", name: "Page1", type: "page", guid: "page-guid" }],
      }),
      { revising: false },
    );
    expect(workspaceQuery.getRevisionEntities).toHaveBeenCalledWith({ tenantId: "t1", workspaceId: "w1", revisionId: "revision-1" });
  });

  it("does not expose the module catalog to legacy workflow blueprints", async () => {
    const { deps, modelPort, modulePlanCompiler } = makeDesignDeps();
    const node = createDesignPlanNode(deps);

    await node(baseState({ generationWorkflow: "legacy" }) as never);

    expect(modulePlanCompiler.listPlanningCatalog).not.toHaveBeenCalled();
    expect(modelPort.createDesignPlan).toHaveBeenCalledWith(
      expect.not.objectContaining({ modulePlanningCatalog: expect.anything() }),
      { revising: false },
    );
  });

  it("encodes the complete first customer blueprint instead of a shallow control list", async () => {
    const { deps, workspaceQuery } = makeDesignDeps();
    const node = createDesignPlanNode(deps);
    await node(baseState() as never);

    const content = workspaceQuery.appendMessage.mock.calls[0]?.[0]?.content as string;
    const decoded = decodeBlueprintMessage(content);
    expect(decoded?.blueprint.schema).toBe("kf-design-plan/v2");
    if (decoded?.blueprint.schema !== "kf-design-plan/v2") throw new Error("expected v2 customer effect blueprint");
    expect(decoded.blueprint.overview.objective).toBe("让值班人员快速掌握生产状态");
    expect(decoded.blueprint.modules[0]?.sampleData).toEqual([{ label: "当日产量", value: "12,680 件" }]);
    expect(decoded.blueprint.acceptanceCriteria).toEqual(["首屏展示产量、达成率和异常数"]);
  });

  it("revises (not regenerates) when revising=true, bumping revision and changing the hash", async () => {
    const { deps, modelPort, workspaceQuery } = makeDesignDeps();
    modelPort.createDesignPlan.mockResolvedValue(revisedDesignPlan);
    const node = createDesignPlanNode(deps);
    const update = await node(
      baseState({
        recentMessages: [{ role: "user", content: "把标题改红色" }],
        designPlan,
        designPlanHash: "a".repeat(64),
        designRevision: 1,
        revising: true,
      }) as never,
    );

    expect(update.designPlan).toEqual(revisedDesignPlan);
    expect(update.designRevision).toBe(2);
    expect(update.designPlanHash).not.toBe("a".repeat(64));
    expect(modelPort.createDesignPlan).toHaveBeenCalledWith(
      expect.objectContaining({ requirementText: "把标题改红色", designPlan }),
      { revising: true },
    );
    expect(workspaceQuery.appendMessage).toHaveBeenCalledTimes(1);
  });

  it("treats a REVISE_DESIGN intent as a revision even without the revising flag", async () => {
    const { deps, modelPort } = makeDesignDeps();
    const node = createDesignPlanNode(deps);
    await node(baseState({ intent: "REVISE_DESIGN", revising: false }) as never);

    expect(modelPort.createDesignPlan).toHaveBeenCalledWith(expect.anything(), {
      revising: true,
    });
  });

  it("computes a stable hash that changes when the plan content changes", async () => {
    const { deps, modelPort } = makeDesignDeps();
    const node = createDesignPlanNode(deps);
    const first = await node(baseState() as never);
    const second = await node(baseState() as never);
    expect(first.designPlanHash).toBe(second.designPlanHash);

    modelPort.createDesignPlan.mockResolvedValue(revisedDesignPlan);
    const third = await node(baseState() as never);
    expect(third.designPlanHash).not.toBe(first.designPlanHash);
  });

  it("retries once when the first customer blueprint does not match the detailed schema", async () => {
    const { deps, modelPort, workspaceQuery } = makeDesignDeps();
    modelPort.createDesignPlan
      .mockResolvedValueOnce({
        schema: "kf-design-plan/v1",
        displayName: "简略方案",
        summary: "只有一句摘要",
        layoutConcept: "单页",
        styleDirection: "专业",
        sections: [{ id: "main", label: "主区", controls: [{ type: "text" }] }],
        signature: "无",
      })
      .mockResolvedValueOnce(designPlan);
    const node = createDesignPlanNode(deps);

    const update = await node(baseState() as never);

    expect(modelPort.createDesignPlan).toHaveBeenCalledTimes(2);
    expect(modelPort.createDesignPlan).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        revising: false,
        rejectionReasons: ["候选蓝图不符合完整客户效果蓝图结构"],
      }),
    );
    expect(update.designPlan).toEqual(designPlan);
    expect(update.designRevision).toBe(1);
    expect(workspaceQuery.appendMessage).toHaveBeenCalledTimes(1);
  });

  it("retries once when the model adapter rejects the first malformed blueprint", async () => {
    const { deps, modelPort } = makeDesignDeps();
    modelPort.createDesignPlan
      .mockRejectedValueOnce(new Error("design plan failed zod gate"))
      .mockResolvedValueOnce(designPlan);
    const node = createDesignPlanNode(deps);

    const update = await node(baseState() as never);

    expect(modelPort.createDesignPlan).toHaveBeenCalledTimes(2);
    expect(modelPort.createDesignPlan).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      expect.objectContaining({
        revising: false,
        rejectionReasons: ["模型未返回完整客户效果蓝图"],
      }),
    );
    expect(update.designPlan).toEqual(designPlan);
    expect(update.stage).toBe("design-review");
  });

  it("retries once with quality reasons when a revision body is unchanged", async () => {
    const { deps, modelPort } = makeDesignDeps();
    modelPort.createDesignPlan
      .mockResolvedValueOnce(designPlan)
      .mockResolvedValueOnce(revisedDesignPlan);
    const node = createDesignPlanNode(deps);

    const update = await node(
      baseState({
        intent: "REVISE_DESIGN",
        designPlan,
        designPlanHash: "a".repeat(64),
        designRevision: 1,
      }) as never,
    );

    expect(modelPort.createDesignPlan).toHaveBeenCalledTimes(2);
    expect(modelPort.createDesignPlan).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ designPlan }),
      expect.objectContaining({
        revising: true,
        rejectionReasons: expect.arrayContaining(["蓝图主体没有实质变化"]),
      }),
    );
    expect(update.designPlan).toEqual(revisedDesignPlan);
    expect(update.designRevision).toBe(2);
  });

  it("keeps the previous valid blueprint when both revision candidates are unchanged", async () => {
    const { deps, modelPort, workspaceQuery } = makeDesignDeps();
    modelPort.createDesignPlan.mockResolvedValue(designPlan);
    const node = createDesignPlanNode(deps);

    const update = await node(
      baseState({
        intent: "REVISE_DESIGN",
        designPlan,
        designPlanHash: "a".repeat(64),
        designRevision: 1,
      }) as never,
    );

    expect(modelPort.createDesignPlan).toHaveBeenCalledTimes(2);
    expect(update).toEqual({
      stage: "design-review",
      revising: undefined,
      lastErrorCode: "DESIGN_REVISION_NOT_APPLIED",
    });
    expect(workspaceQuery.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("没有充分体现到新蓝图中"),
      }),
    );
  });
});

describe("plan-change design guard (spec §5.4)", () => {
  function makeGuardDeps() {
    const modelPort = {
      createChangePlan: vi.fn().mockResolvedValue({
        schema: "kf-change-plan/v1",
        workspaceId: "w1",
        operations: [
          { op: "update", entityId: "e1", entityType: "text", changes: [{ path: "/text", value: "x" }] },
        ],
      }),
    };
    const workspaceQuery = { getRevisionEntities: vi.fn().mockResolvedValue([]) };
    const changePlanRepository = {
      findOpenChangeRequest: vi.fn().mockResolvedValue(null),
      saveChangeRequest: vi.fn().mockResolvedValue(undefined),
      savePlan: vi.fn().mockResolvedValue(undefined),
    };
    return { deps: { modelPort, workspaceQuery, changePlanRepository } as never, modelPort, changePlanRepository };
  }

  it("rejects CONFIRM_DESIGN when no confirmed design plan exists", async () => {
    const { deps, modelPort, changePlanRepository } = makeGuardDeps();
    const node = createPlanChangeNode(deps);
    const update = await node(
      baseState({
        intent: "CONFIRM_DESIGN",
        currentRevisionId: "rev-1",
      }) as never,
    );

    expect(update).toEqual({ stage: "idle", lastErrorCode: "DESIGN_NOT_CONFIRMED" });
    expect(modelPort.createChangePlan).not.toHaveBeenCalled();
    expect(changePlanRepository.savePlan).not.toHaveBeenCalled();
  });

  it("allows CONFIRM_DESIGN once a design plan hash is confirmed", async () => {
    const { deps, modelPort, changePlanRepository } = makeGuardDeps();
    const node = createPlanChangeNode(deps);
    const update = await node(
      baseState({
        intent: "CONFIRM_DESIGN",
        currentRevisionId: "rev-1",
        designPlanHash: "a".repeat(64),
        designPlan,
      }) as never,
    );

    expect(update.stage).toBe("approval");
    expect(update.planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(modelPort.createChangePlan).toHaveBeenCalledTimes(1);
    expect(changePlanRepository.savePlan).toHaveBeenCalledTimes(1);
  });

  it("keeps legacy NEW_REQUIREMENT entry working without a design plan", async () => {
    const { deps, modelPort } = makeGuardDeps();
    const node = createPlanChangeNode(deps);
    const update = await node(
      baseState({
        intent: "NEW_REQUIREMENT",
        currentRevisionId: "rev-1",
      }) as never,
    );

    expect(update.stage).toBe("approval");
    expect(modelPort.createChangePlan).toHaveBeenCalledTimes(1);
  });
});
