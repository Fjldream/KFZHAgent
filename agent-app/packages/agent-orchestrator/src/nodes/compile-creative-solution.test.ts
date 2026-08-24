import {
  canonicalChangePlanHash,
  canonicalServerHash,
  CapabilityCandidateBundleSchema,
  CustomerSolutionBlueprintSchema,
  SolutionImplementationPlanSchema,
  type CapabilityCandidateBundle,
  type CustomerSolutionBlueprint,
  type InternalChangePlan,
  type ServerPlanEnvelope,
  type SolutionImplementationPlan,
} from "@kf/contracts";
import { describe, expect, it, vi } from "vitest";
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

const internalPlan: InternalChangePlan = {
  schema: "kf-change-plan/v1",
  workspaceId: "workspace-1",
  operations: [{
    op: "create",
    entityType: "page",
    entityId: "visitor-solution-page",
    properties: {},
  }],
  creative: { artifactHash: "a".repeat(64), materializationHash: "b".repeat(64) },
};

function signedPlan(): ServerPlanEnvelope {
  return {
    schema: "kf-server-plan-envelope/v1" as const,
    plan: internalPlan,
    planHash: canonicalChangePlanHash(internalPlan),
    revisionId: "revision-1",
    semanticOperations: [],
    creativeArtifact: { schema: "kf-creative-build-artifact/v1" },
    creativeArtifactHash: "a".repeat(64),
    trustedNativeMaterialization: { schema: "kf-trusted-native-materialization/v1" },
    nativeMaterializationHash: "b".repeat(64),
    signature: "c".repeat(64),
  } as unknown as ServerPlanEnvelope;
}

function state(overrides: Partial<AgentGraphStateValue> = {}): AgentGraphStateValue {
  return {
    tenantId: "tenant-1",
    userId: "user-1",
    workspaceId: "workspace-1",
    conversationId: "conversation-1",
    currentRevisionId: "revision-1",
    generationWorkflow: "creative-v2",
    designPlan: blueprint,
    designPlanHash: canonicalServerHash(blueprint),
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
  const saves: unknown[] = [];
  const editableEntities = [{ kind: "page" as const, name: "Page1", type: "page", guid: "page-guid" }];
  const compile = vi.fn().mockResolvedValue(outcome ?? {
    status: "compiled",
    plan: internalPlan,
    signedPlan: signedPlan(),
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
      getRevisionEntities: vi.fn().mockResolvedValue(editableEntities),
      appendMessage: vi.fn().mockImplementation(async ({ content }: { content: string }) => { messages.push(content); }),
    },
    changePlanRepository: {
      findOpenChangeRequest: vi.fn().mockResolvedValue(null),
      saveChangeRequest: vi.fn(),
      savePlan: vi.fn().mockImplementation((input: unknown) => { saves.push(input); }),
    },
  } as unknown as SolutionGraphDeps;
  return { deps, compile, editableEntities, messages, saves };
}

describe("compile creative solution node", () => {
  it("compiles exact confirmed inputs, persists the signed creative envelope, and authorizes the build despite warnings", async () => {
    const fixture = bed();

    const result = await createCompileCreativeSolutionNode(fixture.deps)(state());

    expect(fixture.compile).toHaveBeenCalledWith({
      tenantId: "tenant-1",
      workspaceId: "workspace-1",
      baseRevisionId: "revision-1",
      blueprint,
      candidateBundle: candidates,
      semanticPlan,
      editableEntities: fixture.editableEntities,
    });
    expect(fixture.saves).toEqual([expect.objectContaining({
      id: `plan:workspace-1:${canonicalChangePlanHash(internalPlan)}`,
      planHash: canonicalChangePlanHash(internalPlan),
      plan: signedPlan(),
    })]);
    expect(result).toMatchObject({
      stage: "building",
      buildAuthorization: "creative-solution",
      planHash: canonicalChangePlanHash(internalPlan),
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
    expect(fixture.saves).toHaveLength(0);
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
    expect(missing.saves).toHaveLength(0);
    expect(stale.saves).toHaveLength(0);
  });

  it("rejects a contradictory compiled outcome whose capability report still fails", async () => {
    const fixture = bed({
      status: "compiled",
      plan: internalPlan,
      signedPlan: signedPlan(),
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
    expect(fixture.saves).toHaveLength(0);
  });

  it("bounds malformed signed envelope data instead of throwing from canonical validation", async () => {
    const malformedEnvelope = { ...signedPlan(), plan: { schema: "forged" } };
    const fixture = bed({
      status: "compiled",
      plan: internalPlan,
      signedPlan: malformedEnvelope as never,
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
    expect(fixture.saves).toHaveLength(0);
  });

  it("maps repository lookup failures to a bounded persistence error", async () => {
    const fixture = bed();
    fixture.deps.changePlanRepository.findOpenChangeRequest = async () => {
      throw new Error("database detail must not escape");
    };

    await expect(createCompileCreativeSolutionNode(fixture.deps)(state())).resolves.toMatchObject({
      stage: "idle",
      lastErrorCode: "CREATIVE_SOLUTION_PERSIST_FAILED",
      buildAuthorization: undefined,
    });
    expect(fixture.saves).toHaveLength(0);
  });
});
