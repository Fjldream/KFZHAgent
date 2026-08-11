import { describe, expect, it, vi } from "vitest";
import type {
  CapabilityReport,
  ChangePlan,
  CustomerEffectBlueprint,
  UIImplementationSpec,
} from "@kf/contracts";
import type { ModelPort } from "../model-port.js";
import type {
  BuildJobPort,
  ChangePlanRepository,
  SolutionGraphDeps,
  UiImplementationCompilerPort,
  WorkspaceQueryPort,
} from "../ports.js";
import type { AgentGraphStateValue } from "../state.js";
import { createImplementationPlanNode } from "./implementation-plan.js";

const blueprint: CustomerEffectBlueprint = {
  schema: "kf-design-plan/v2",
  displayName: "个人作品集",
  overview: {
    objective: "完整展示个人产品和项目能力",
    audiences: ["招聘经理"],
    scenarios: ["求职应聘"],
    valueProposition: "以案例建立信任",
  },
  informationArchitecture: { narrative: "产品到项目", wireframe: "产品 → 项目" },
  modules: [
    {
      id: "products",
      name: "我的产品",
      purpose: "展示产品",
      content: ["产品名称"],
      sampleData: [{ label: "产品", value: "KingFusion" }],
      interactions: ["查看详情"],
      presentation: "产品卡片",
    },
    {
      id: "projects",
      name: "项目经历",
      purpose: "展示项目",
      content: ["项目名称"],
      sampleData: [{ label: "项目", value: "能源平台" }],
      interactions: ["展开详情"],
      presentation: "项目时间线",
    },
  ],
  visualDirection: {
    tone: "专业",
    colors: ["深蓝"],
    typography: "层级清晰",
    spacingAndSurfaces: "卡片留白",
  },
  highlights: ["案例完整"],
  revisionNotes: { added: ["产品与项目"], changed: [], retained: [] },
  acceptanceCriteria: ["产品和项目模块均可见"],
  openQuestions: [],
};

const theme = {
  background: "#0f172a",
  surface: "#111827",
  primary: "#2563eb",
  accent: "#38bdf8",
  textPrimary: "#f8fafc",
  textSecondary: "#cbd5e1",
  fontFamily: "Arial",
  spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
};

function implementation(moduleIds = ["products", "projects"]): UIImplementationSpec {
  return {
    schema: "kf-ui-implementation/v1",
    theme,
    pages: [{
      id: "Page1",
      width: 1440,
      height: 900,
      components: moduleIds.map((sourceModuleId, index) => ({
        id: `${sourceModuleId}-title`,
        role: "section-heading",
        sourceModuleId,
        capabilityId: "text",
        critical: true,
        content: sourceModuleId,
        geometry: { x: 60, y: 60 + index * 80, width: 320, height: 40 },
        properties: {},
        style: { declarations: { fontSize: 24 }, states: {} },
      })),
    }],
  };
}

const capabilityReport: CapabilityReport = {
  status: "warning",
  full: [],
  partial: ["text"],
  unsupported: [],
  deliveryGaps: [],
};

function compiledPlan(spec: UIImplementationSpec): ChangePlan {
  return {
    schema: "kf-change-plan/v1",
    workspaceId: "w1",
    operations: spec.pages[0]!.components.map((component) => ({
      op: "create" as const,
      entityType: "control",
      entityId: component.id,
      properties: { pageId: "page-guid", type: "text", text: component.content },
    })),
  };
}

function state(): AgentGraphStateValue {
  return {
    tenantId: "t1",
    userId: "u1",
    workspaceId: "w1",
    conversationId: "c1",
    currentRevisionId: "r1",
    intent: "CONFIRM_DESIGN",
    stage: "design-review",
    recentMessages: [{ role: "user", content: "确认" }],
    designPlan: blueprint,
    designPlanHash: "a".repeat(64),
  } as AgentGraphStateValue;
}

function bed(specs: UIImplementationSpec[], compileError?: Error) {
  const createUiImplementation = vi.fn().mockResolvedValue(specs[0]);
  const reviseUiImplementation = vi.fn().mockResolvedValue(specs[1] ?? specs[0]);
  const createChangePlan = vi.fn();
  const modelPort = {
    classifyIntent: vi.fn(),
    createProjectDesign: vi.fn(),
    createChangePlan,
    reviseChangePlan: vi.fn(),
    createDesignPlan: vi.fn(),
    createUiImplementation,
    reviseUiImplementation,
    explainValidation: vi.fn(),
  } as unknown as ModelPort;
  const savePlan = vi.fn();
  const changePlanRepository = {
    findOpenChangeRequest: vi.fn().mockResolvedValue(null),
    saveChangeRequest: vi.fn(),
    savePlan,
    loadPlanHash: vi.fn(),
    setChangeRequestStatus: vi.fn(),
  } satisfies ChangePlanRepository;
  const workspaceQuery = {
    listRecentMessages: vi.fn(),
    appendMessage: vi.fn(),
    getConversationSummary: vi.fn(),
    setConversationSummary: vi.fn(),
    getCurrentRevisionId: vi.fn(),
    getRevisionSummary: vi.fn(),
    getRevisionEntities: vi.fn().mockResolvedValue([
      { kind: "page", name: "Page1", type: "page", guid: "page-guid" },
      { kind: "control", name: "Text1", type: "text", guid: "text-guid" },
    ]),
  } satisfies WorkspaceQueryPort;
  const compile = compileError === undefined
    ? vi.fn((input) => Promise.resolve({
        plan: compiledPlan(input.spec),
        capabilityReport,
      }))
    : vi.fn()
        .mockRejectedValueOnce(compileError)
        .mockResolvedValue({ plan: compiledPlan(specs[1] ?? specs[0]!), capabilityReport });
  const uiImplementationCompiler = { compile } satisfies UiImplementationCompilerPort;
  const deps: SolutionGraphDeps = {
    modelPort,
    workspaceQuery,
    changePlanRepository,
    buildJobPort: {} as BuildJobPort,
    uiImplementationCompiler,
    isDomainSupported: () => true,
  };
  return {
    node: createImplementationPlanNode(deps),
    createUiImplementation,
    reviseUiImplementation,
    createChangePlan,
    compile,
    savePlan,
  };
}

describe("implementation-plan node", () => {
  it("compiles and persists a complete blueprint implementation without model-authored ChangePlan", async () => {
    const fixture = bed([implementation()]);

    const result = await fixture.node(state());

    expect(fixture.createUiImplementation).toHaveBeenCalledTimes(1);
    expect(fixture.createChangePlan).not.toHaveBeenCalled();
    expect(fixture.compile).toHaveBeenCalledTimes(1);
    expect(fixture.savePlan).toHaveBeenCalledWith(expect.objectContaining({
      plan: expect.objectContaining({ operations: expect.arrayContaining([
        expect.objectContaining({ entityId: "products-title" }),
        expect.objectContaining({ entityId: "projects-title" }),
      ]) }),
    }));
    expect(result).toMatchObject({
      stage: "approval",
      uiImplementation: implementation(),
      capabilityReport,
    });
    expect(result.uiImplementationHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("repairs a missing blueprint module once before compilation", async () => {
    const incomplete = implementation(["products"]);
    const complete = implementation();
    const fixture = bed([incomplete, complete]);

    const result = await fixture.node(state());

    expect(fixture.reviseUiImplementation).toHaveBeenCalledWith(expect.objectContaining({
      uiImplementation: incomplete,
      implementationRejectionReasons: ["missing blueprint module: projects"],
    }));
    expect(fixture.compile).toHaveBeenCalledTimes(1);
    expect(result.stage).toBe("approval");
  });

  it("repairs a deterministic compiler rejection once", async () => {
    const first = implementation();
    const repaired = implementation();
    const fixture = bed([first, repaired], new Error("COMPONENT_OUT_OF_PAGE_BOUNDS: products-title"));

    const result = await fixture.node(state());

    expect(fixture.reviseUiImplementation).toHaveBeenCalledWith(expect.objectContaining({
      implementationRejectionReasons: ["COMPONENT_OUT_OF_PAGE_BOUNDS: products-title"],
    }));
    expect(fixture.compile).toHaveBeenCalledTimes(2);
    expect(result.stage).toBe("approval");
  });

  it("stops before persistence when the repaired spec still misses a module", async () => {
    const fixture = bed([implementation(["products"]), implementation(["products"])]);

    const result = await fixture.node(state());

    expect(result).toMatchObject({
      stage: "idle",
      lastErrorCode: "UI_IMPLEMENTATION_INVALID:missing blueprint module: projects",
    });
    expect(fixture.compile).not.toHaveBeenCalled();
    expect(fixture.savePlan).not.toHaveBeenCalled();
  });

  it("preserves previously managed components omitted by a partial model revision", async () => {
    const previous = implementation();
    previous.pages[0]!.components.push({
      ...previous.pages[0]!.components[0]!,
      id: "products-detail",
      content: "产品详情",
      geometry: { x: 420, y: 60, width: 320, height: 40 },
    });
    const partialRevision = implementation();
    const fixture = bed([partialRevision]);
    const revisingState = { ...state(), uiImplementation: previous } as AgentGraphStateValue;

    const result = await fixture.node(revisingState);

    expect(fixture.reviseUiImplementation).toHaveBeenCalledTimes(1);
    expect(fixture.compile).toHaveBeenCalledWith(expect.objectContaining({
      previousSpec: previous,
      spec: expect.objectContaining({
        pages: [expect.objectContaining({
          components: expect.arrayContaining([
            expect.objectContaining({ id: "products-title" }),
            expect.objectContaining({ id: "projects-title" }),
            expect.objectContaining({ id: "products-detail" }),
          ]),
        })],
      }),
    }));
    expect(result.uiImplementation?.pages[0]?.components).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "products-detail" })]),
    );
  });
});
