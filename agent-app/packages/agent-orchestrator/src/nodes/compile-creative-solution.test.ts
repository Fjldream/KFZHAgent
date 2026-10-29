import {
  canonicalServerHash,
  CapabilityCandidateBundleSchema,
  CustomerSolutionBlueprintSchema,
  SolutionImplementationPlanSchema,
  type CapabilityCandidateBundle,
  type CustomerSolutionBlueprint,
  type SolutionImplementationPlan,
} from "@kf/contracts";
import { describe, expect, it, vi } from "vitest";
import { hashDesignPlan } from "../design-plan-version.js";
import type { CreativeSolutionCompilerPort, SolutionGraphDeps } from "../ports.js";
import type { AgentGraphStateValue } from "../state.js";
import { createCompileCreativeSolutionNode } from "./compile-creative-solution.js";

const blueprint: CustomerSolutionBlueprint = CustomerSolutionBlueprintSchema.parse({
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
});

const ranked = (id: string) => ({
  id,
  score: 10,
  reasons: ["语义匹配"],
  limitations: [],
  knowledgeVersion: "1.0.0",
});

const candidates: CapabilityCandidateBundle = CapabilityCandidateBundleSchema.parse({
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
});

const semanticPlan: SolutionImplementationPlan = SolutionImplementationPlanSchema.parse({
  schema: "kf-solution-implementation/v1",
  projectKey: "visitor-center",
  blueprintHash: canonicalServerHash(blueprint),
  candidateBundleHash: canonicalServerHash(candidates),
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
      kind: "control",
      id: "visitor-title",
      sourceBlueprintRegionIds: ["visitor-list"],
      intent: {
        importance: "primary",
        visualWeight: 4,
        readingOrder: 0,
        density: "comfortable",
        groupWith: [],
        width: { mode: "fill" },
        height: { mode: "content" },
        align: "stretch",
      },
      capabilityId: "text",
      content: "今日访客",
      properties: [],
      tabIds: [],
      styleRole: "record-title",
      eventBindings: [],
    },
  }],
  overlays: [],
  actions: [],
  scripts: [],
});

const persistedPlanHash = "d".repeat(64);
const confirmationId = "e".repeat(64);

function state(overrides: Partial<AgentGraphStateValue> = {}): AgentGraphStateValue {
  return {
    tenantId: "tenant-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    conversationId: "conversation-1",
    currentRevisionId: "revision-1",
    generationWorkflow: "creative-v2",
    designPlan: blueprint,
    designPlanHash: hashDesignPlan(blueprint, 1),
    designRevision: 1,
    capabilityCandidates: candidates,
    capabilityCandidatesHash: canonicalServerHash(candidates),
    solutionImplementationPlan: semanticPlan,
    solutionImplementationPlanHash: canonicalServerHash(semanticPlan),
    stage: "solution-plan-ready",
    recentMessages: [],
    ...overrides,
  } as AgentGraphStateValue;
}

function bed(outcome?: Awaited<ReturnType<CreativeSolutionCompilerPort["compile"]>>) {
  const messages: string[] = [];
  const compile = vi.fn().mockResolvedValue(outcome ?? {
    status: "compiled",
    changeRequestId: `cr:workspace-1:conversation-1:${confirmationId}`,
    changePlanId: `plan:workspace-1:${confirmationId}:${persistedPlanHash}`,
    planHash: persistedPlanHash,
    operationCount: 1,
    confirmationId,
    projectKey: "visitor-center",
    domainKind: "kingclient",
    capabilityReport: {
      status: "warning",
      full: ["text"],
      partial: ["STYLE_WARNING: 使用了已审核降级样式"],
      unsupported: [],
      deliveryGaps: [],
    },
    warnings: [{ code: "STYLE_WARNING", nodeId: "visitor-title", message: "使用了已审核降级样式" }],
  });
  const deps = {
    creativeSolutionCompiler: { compile },
    workspaceQuery: {
      appendMessage: vi.fn().mockImplementation(async ({ content }: { content: string }) => { messages.push(content); }),
    },
  } as unknown as SolutionGraphDeps;
  return { deps, compile, messages };
}

describe("compile creative solution node", () => {
  it("compiles exact confirmed inputs, persists the signed creative envelope, and authorizes the build despite warnings", async () => {
    const fixture = bed();

    const result = await createCompileCreativeSolutionNode(fixture.deps)(state());

    expect(fixture.compile).toHaveBeenCalledWith(expect.objectContaining({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      conversationId: "conversation-1",
      baseRevisionId: "revision-1",
      projectKey: "visitor-center",
      domainKind: "kingclient",
      blueprint,
      candidateBundle: candidates,
      semanticPlan,
    }));
    expect(result).toMatchObject({
      stage: "building",
      buildAuthorization: "creative-solution",
      activeChangeRequestId: `cr:workspace-1:conversation-1:${confirmationId}`,
      changePlanId: `plan:workspace-1:${confirmationId}:${persistedPlanHash}`,
      planHash: persistedPlanHash,
      creativeConfirmationId: confirmationId,
      capabilityReport: { status: "warning" },
      lastErrorCode: undefined,
    });
    expect(fixture.messages.join("\n")).not.toContain("预览");
  });

  it("returns bounded actionable blocking diagnostics without persisting or authorizing", async () => {
    const fixture = bed({
      status: "blocked",
      diagnostics: Array.from({ length: 30 }, (_, index) => ({
        code: "SOLUTION_NODE_UNSUPPORTED",
        phase: "component",
        nodeId: `node-${index}`,
        message: `请改用已支持组件 ${"x".repeat(500)}`,
        alternatives: ["text", "button"],
      })),
      warnings: [],
    });

    const result = await createCompileCreativeSolutionNode(fixture.deps)(state());

    expect(result.stage).toBe("idle");
    expect(result.buildAuthorization).toBeUndefined();
    expect(result.lastErrorCode).toMatch(/^CREATIVE_SOLUTION_BLOCKED:/);
    expect(result.lastErrorCode!.length).toBeLessThanOrEqual(600);
    expect(result.lastErrorCode).toContain("node-0");
    expect(result.lastErrorCode).toContain("text");
    expect(fixture.messages.at(-1)).toContain("工程生成");
    expect(fixture.messages.at(-1)).not.toContain("预览");
  });

  it("fails closed before any legacy compiler path when a creative dependency or exact hash is absent", async () => {
    const missing = bed();
    delete (missing.deps as { creativeSolutionCompiler?: unknown }).creativeSolutionCompiler;
    const stale = bed();

    await expect(createCompileCreativeSolutionNode(missing.deps)(state())).resolves.toMatchObject({
      stage: "idle",
      lastErrorCode: "CREATIVE_SOLUTION_COMPILER_NOT_CONFIGURED",
      buildAuthorization: undefined,
    });
    await expect(createCompileCreativeSolutionNode(stale.deps)(state({
      solutionImplementationPlanHash: "f".repeat(64),
    }))).resolves.toMatchObject({
      stage: "idle",
      lastErrorCode: "CREATIVE_SOLUTION_INPUT_INVALID",
      buildAuthorization: undefined,
    });
    expect(missing.compile).not.toHaveBeenCalled();
    expect(stale.compile).not.toHaveBeenCalled();
  });

  it.each([
    ["stale hash", { designPlanHash: "a".repeat(64) }],
    ["missing revision", { designRevision: undefined }],
    ["stale revision", { designRevision: 2 }],
    ["old blueprint with a new hash", {
      designPlanHash: hashDesignPlan({ ...blueprint, displayName: "另一份蓝图" }, 1),
    }],
  ])("rejects %s before compiler persistence or enqueue authorization", async (_case, overrides) => {
    const fixture = bed();

    const result = await createCompileCreativeSolutionNode(fixture.deps)(state(overrides));

    expect(result).toMatchObject({
      stage: "idle",
      lastErrorCode: "CREATIVE_SOLUTION_INPUT_INVALID",
      buildAuthorization: undefined,
    });
    expect(fixture.compile).not.toHaveBeenCalled();
    expect(fixture.messages).toEqual([]);
  });

  it("rejects a contradictory compiled outcome whose capability report still fails", async () => {
    const fixture = bed({
      status: "compiled",
      changeRequestId: "cr",
      changePlanId: "plan",
      planHash: persistedPlanHash,
      operationCount: 1,
      confirmationId,
      projectKey: "visitor-center",
      domainKind: "kingclient",
      capabilityReport: {
        status: "fail",
        full: [],
        partial: [],
        unsupported: ["prototype.unreviewed"],
        deliveryGaps: [],
      },
      warnings: [],
    });

    const result = await createCompileCreativeSolutionNode(fixture.deps)(state());

    expect(result).toMatchObject({
      stage: "idle",
      lastErrorCode: "CREATIVE_SOLUTION_OUTPUT_INVALID",
      buildAuthorization: undefined,
    });
  });

  it("rejects malformed persisted compiler receipts without authorizing enqueue", async () => {
    const fixture = bed({
      status: "compiled",
      changeRequestId: "",
      changePlanId: "",
      planHash: "not-a-hash",
      operationCount: -1,
      confirmationId: "",
      projectKey: "visitor-center",
      domainKind: "kingclient",
      capabilityReport: {
        status: "pass",
        full: [],
        partial: [],
        unsupported: [],
        deliveryGaps: [],
      },
      warnings: [],
    });

    await expect(createCompileCreativeSolutionNode(fixture.deps)(state())).resolves.toMatchObject({
      stage: "idle",
      lastErrorCode: "CREATIVE_SOLUTION_OUTPUT_INVALID",
      buildAuthorization: undefined,
    });
  });

  it("maps compiler persistence failures to a bounded compilation error", async () => {
    const fixture = bed();
    fixture.compile.mockRejectedValueOnce(new Error("database detail must not escape"));

    await expect(createCompileCreativeSolutionNode(fixture.deps)(state())).resolves.toMatchObject({
      stage: "idle",
      lastErrorCode: "CREATIVE_SOLUTION_COMPILATION_FAILED",
      buildAuthorization: undefined,
    });
  });

  it("does not surface hostile compiler diagnostics or control characters", async () => {
    const fixture = bed({
      status: "blocked",
      diagnostics: [{
        code: "UNKNOWN_DEPENDENCY",
        phase: "composition",
        nodeId: "../../private/secret\u0000",
        message: "secret=token /Users/customer/private.sql\nAuthorization: Bearer abc",
        correlationId: "34be85be-d3a8-4c24-bb0b-b2ba07a355b1",
        alternatives: ["button", "../../secret", "x\u0000y"],
      }],
      warnings: [],
    });

    const result = await createCompileCreativeSolutionNode(fixture.deps)(state());

    expect(JSON.stringify(result)).not.toMatch(/secret|private|Bearer|token|\.\./i);
    expect(fixture.messages.at(-1)).not.toMatch(/secret|private|Bearer|token|\.\./i);
    expect(result.lastErrorCode).toContain("UNKNOWN_DEPENDENCY");
    expect(fixture.messages.at(-1)).toContain("34be85be-d3a8-4c24-bb0b-b2ba07a355b1");
  });
});

// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
function reviewedVisualInput(title = "访客标题") {
  const spec = { schemaVersion: 1, sourceAssetId: "reference1", sourceHash: "a".repeat(64), viewport: { width: 1440, height: 900 },
    regions: [{ id: "heading", parentId: null, role: "text", box: { x: 0, y: 0, width: 1, height: 1 }, text: [title], confidence: 0.9, interactionHint: null }],
    designTokens: { background: "#fff", foreground: "#111", accent: "#123456", spacing: [8], radius: [4] }, uncertainties: [] };
  const reference = { schemaVersion: 1, analysisId: "analysis1", specHash: canonicalServerHash(spec), spec,
    mappings: [{ regionId: "heading", controlType: "text", capabilityId: "text", support: "supported_unverified", reason: "未验证", evidenceIds: [], fallback: null }],
    acceptedDifferences: [{ regionId: "heading", disposition: "accept-unverified", capabilityId: "text", reason: "同意保留" }] };
  const reviewHash = "b".repeat(64);
  return { schema: "kf-accepted-visual-planning/v1", reviewHash, confirmationHash: canonicalServerHash({ reviewHash, reference }), reference };
}
const visualWrapper = () => ({ schema: "kf-visual-semantic-plan/v1", plan: semanticPlan, bindings: [{ regionId: "heading", nodeId: "visitor-title" }] });
const visualState = (accepted = reviewedVisualInput()) => state({ planVersion: "run-plan@7", acceptedVisualPlanningInput: accepted,
  visualSemanticPlan: visualWrapper(), visualPlanConfirmationHash: accepted.confirmationHash } as never);

describe("reviewed visual compilation in the graph node", () => {
  it("forwards reviewed structure and validated semantic bindings to the existing compiler", async () => {
    const fixture = bed(); const accepted = reviewedVisualInput();
    const result = await createCompileCreativeSolutionNode(fixture.deps)(visualState(accepted));
    expect(result).toMatchObject({ stage: "building", buildAuthorization: "creative-solution" });
    expect(fixture.compile).toHaveBeenCalledWith(expect.objectContaining({ visual: { reference: accepted.reference, bindings: visualWrapper().bindings } }));
  });
  it("rejects torn review/protocol/binding state before compiler or message side effects", async () => {
    for (const overrides of [
      { acceptedVisualPlanningInput: null }, { planVersion: "run-plan@6" }, { visualSemanticPlan: null },
      { visualPlanConfirmationHash: "c".repeat(64) },
      { visualSemanticPlan: { ...visualWrapper(), bindings: [{ regionId: "heading", nodeId: "missing" }] } },
      { visualSemanticPlan: { ...visualWrapper(), plan: { ...semanticPlan, projectKey: "altered" } } },
    ]) {
      const fixture = bed();
      const result = await createCompileCreativeSolutionNode(fixture.deps)({ ...visualState(), ...overrides } as never);
      expect(result).toMatchObject({ stage: "idle", lastErrorCode: "VISUAL_PLANNING_INPUT_INVALID", buildAuthorization: undefined });
      expect(fixture.compile).not.toHaveBeenCalled();
      expect(fixture.messages).toEqual([]);
    }
  });
  it("does not reuse a compiled result when only the reviewed visual confirmation changes", async () => {
    const fixture = bed(); const cache = new Map<string, unknown>();
    const original = await fixture.compile();
    let calls = 0;
    fixture.compile.mockImplementation(async () => ({ ...original, changePlanId: `visual-plan-${++calls}` }));
    const node = createCompileCreativeSolutionNode({ ...fixture.deps, resolveRunStepMemo: () => ({
      find: async (key, hash) => cache.get(`${key}:${hash}`) ?? null,
      save: async (key, hash, output) => { cache.set(`${key}:${hash}`, output); },
    }) });
    const first = { ...visualState(reviewedVisualInput("标题A")), runId: "memo-run" };
    const second = { ...visualState(reviewedVisualInput("标题B")), runId: "memo-run" };
    expect((await node(first)).changePlanId).toBe("visual-plan-1");
    expect((await node(first)).changePlanId).toBe("visual-plan-1");
    expect((await node(second)).changePlanId).toBe("visual-plan-2");
    expect(await node({ ...first, visualSemanticPlan: { ...visualWrapper(), bindings: [] } } as never))
      .toMatchObject({ lastErrorCode: "VISUAL_PLANNING_INPUT_INVALID", buildAuthorization: undefined });
    expect(calls).toBe(2);
  });
});
// end
