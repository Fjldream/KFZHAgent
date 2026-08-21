import {
  canonicalServerHash,
  CapabilityCandidateBundleSchema,
  type CapabilityCandidateBundle,
  type CustomerSolutionBlueprint,
  type SolutionImplementationPlan,
} from "@kf/contracts";
import { describe, expect, it } from "vitest";
import { getDesignKnowledgeSnapshot } from "../design-knowledge/design-knowledge-catalog.js";
import { buildBlueprintRegionQueries } from "./blueprint-region-query.js";
import {
  __capabilityRetrievalTestHooks,
  assertSolutionPlanUsesCandidates,
  layoutCapabilityIdsFor,
  retrieveCapabilities,
} from "./capability-retrieval.js";

const portfolioBlueprint: CustomerSolutionBlueprint = {
  schema: "kf-design-plan/v3",
  displayName: "独立设计师作品集",
  objective: "展示精选项目并帮助访客了解设计方法",
  audiences: ["潜在客户"],
  scenarios: ["浏览作品", "了解案例"],
  pages: [{
    id: "portfolio-home",
    title: "作品首页",
    purpose: "以叙事方式介绍设计师并展示代表作品",
    readingOrder: ["selected-work"],
    regions: [{
      id: "selected-work",
      purpose: "图片主导的作品展示和案例集合",
      semanticRoles: ["media", "heading", "narrative-content", "primary-action", "category-label"],
      dataShape: "media-list",
      density: "comfortable",
      importance: "primary",
      content: ["项目图片", "项目标题", "案例摘要", "查看详情"],
      sampleData: [{ 项目标题: "城市公共空间", 案例摘要: "连接社区与自然" }],
      interactions: [],
      states: ["initial", "focused"],
      visualIntent: "强调媒体叙事、作品层次和舒适留白",
    }],
  }],
  journeys: [{
    id: "browse-work",
    actor: "潜在客户",
    goal: "了解代表项目",
    steps: [{ pageId: "portfolio-home", regionId: "selected-work", action: "浏览精选作品", result: "看到案例摘要" }],
    completion: "访客理解项目价值",
  }],
  visualDirection: {
    tone: "克制而有表现力",
    colors: ["暖白", "深灰"],
    typography: "标题鲜明且正文易读",
    spacingAndSurfaces: "使用宽松留白区分项目",
  },
  acceptanceScenarios: ["访客可以浏览代表作品"],
  openQuestions: [],
};

function canonicalHash(value: unknown): string {
  return canonicalServerHash(value);
}

function planFor(
  bundle: CapabilityCandidateBundle,
  overrides: Partial<SolutionImplementationPlan> = {},
): SolutionImplementationPlan {
  const region = bundle.regions[0]!;
  const controlId = region.controls[0]!.id;
  const recipeId = region.recipes[0]!.id;
  const layoutId = region.layouts[0]!.id;
  const layout = layoutId === "layout.5" ? "dock" : layoutId === "layout.2" ? "row" : "column";
  return {
    schema: "kf-solution-implementation/v1",
    projectKey: "portfolio-demo",
    blueprintHash: bundle.blueprintHash,
    candidateBundleHash: canonicalHash(bundle),
    theme: {} as SolutionImplementationPlan["theme"],
    roleStyles: [],
    mockData: [],
    localState: [],
    pages: [{
      id: "portfolio-page",
      title: "作品首页",
      purpose: "展示精选作品",
      canvas: "responsive",
      sourceBlueprintPageId: "portfolio-home",
      sourceBlueprintRegionIds: ["selected-work"],
      initialStateIds: [],
      root: {
        kind: "layout",
        id: "portfolio-root",
        sourceBlueprintRegionIds: ["selected-work"],
        intent: {} as never,
        layout,
        recipeId,
        children: [{
          kind: "control",
          id: "portfolio-control",
          sourceBlueprintRegionIds: ["selected-work"],
          intent: {} as never,
          capabilityId: controlId,
          content: "精选作品",
          properties: [],
          tabIds: [],
          styleRole: "featured-work",
          eventBindings: [],
        }, {
          kind: "registered-module",
          id: "portfolio-module",
          sourceBlueprintRegionIds: ["selected-work"],
          intent: {} as never,
          moduleKind: "content.card-grid",
          templateVersion: "1.0.0",
          variant: "portfolio",
          title: "作品集合",
          eventBindings: [],
          slots: [],
        }],
      },
    }],
    overlays: [],
    actions: [],
    scripts: [],
    ...overrides,
  };
}

describe("blueprint region query extraction", () => {
  it("copies only bounded semantic retrieval fields", () => {
    expect(buildBlueprintRegionQueries(portfolioBlueprint)).toEqual([{
      pageId: "portfolio-home",
      regionId: "selected-work",
      semanticRoles: ["media", "heading", "narrative-content", "primary-action", "category-label"],
      dataShape: "media-list",
      density: "comfortable",
      purpose: "图片主导的作品展示和案例集合",
      interactions: [],
      visualIntent: "强调媒体叙事、作品层次和舒适留白",
    }]);
  });
});

describe("deterministic scoring", () => {
  const zeroComponents = {
    roleOverlap: 0,
    dataShapeMatch: 0,
    regionMatch: 0,
    densityMatch: 0,
    interactionCoverage: 0,
    companionCompatibility: 0,
    avoidForMatch: 0,
    technicalLimitationMatch: 0,
  };

  it("uses the literal component weights without changing the arithmetic result", () => {
    expect(__capabilityRetrievalTestHooks.scoreValue({
      roleOverlap: 0.5,
      dataShapeMatch: 0.25,
      regionMatch: 0.2,
      densityMatch: 0.1,
      interactionCoverage: 0.3,
      companionCompatibility: 0.5,
      avoidForMatch: 0.05,
      technicalLimitationMatch: 0.1,
    })).toBe(32.25);
  });

  it("orders distinct close scores before applying the code-point ID tie-break", () => {
    const higher = __capabilityRetrievalTestHooks.scoreValue({ ...zeroComponents, roleOverlap: 0.25000001 });
    const lower = __capabilityRetrievalTestHooks.scoreValue({ ...zeroComponents, roleOverlap: 0.25 });
    expect(higher).toBe(10.0000004);
    expect(lower).toBe(10);
    expect([
      { id: "a-lower", score: lower },
      { id: "z-higher", score: higher },
    ].sort(__capabilityRetrievalTestHooks.compareRankedCandidates).map((candidate) => candidate.id))
      .toEqual(["z-higher", "a-lower"]);
  });
});

describe("deterministic capability retrieval", () => {
  it("ranks a bounded, technically valid portfolio candidate bundle deterministically", () => {
    const bundle = retrieveCapabilities({
      blueprint: portfolioBlueprint,
      knowledge: getDesignKnowledgeSnapshot(),
    });
    const gallery = bundle.regions.find((region) => region.regionId === "selected-work")!;

    expect(gallery.controls.map((item) => item.id)).toContain("image");
    expect(gallery.controls.map((item) => item.id)).not.toContain("easyui.1");
    expect(gallery.controls).toHaveLength(5);
    expect(gallery.layouts.length).toBeGreaterThanOrEqual(1);
    expect(gallery.layouts.length).toBeLessThanOrEqual(3);
    expect(gallery.recipes.length).toBeGreaterThanOrEqual(1);
    expect(gallery.recipes.length).toBeLessThanOrEqual(3);
    expect(gallery.recipes[0]?.id).toBe("media-card-gallery");
    expect(bundle.detailedCapabilityIds.length).toBeLessThanOrEqual(25);
    expect(CapabilityCandidateBundleSchema.parse(bundle)).toEqual(bundle);
    expect(retrieveCapabilities({ blueprint: portfolioBlueprint, knowledge: getDesignKnowledgeSnapshot() }))
      .toEqual(bundle);
  });

  it("never ranks a technical record that is absent from control design knowledge", () => {
    const sourceKnowledge = structuredClone(getDesignKnowledgeSnapshot());
    const knowledge = {
      ...sourceKnowledge,
      controlDesignProfiles: sourceKnowledge.controlDesignProfiles.filter((profile) => profile.capabilityId !== "image"),
    };
    const bundle = retrieveCapabilities({ blueprint: portfolioBlueprint, knowledge });
    expect(bundle.regions[0]!.controls.map((candidate) => candidate.id)).not.toContain("image");
  });

  it("blocks instead of padding a region when required interactions lack three supported controls", () => {
    for (const interaction of ["change", "open-dialog", "click"]) {
      const blueprint = structuredClone(portfolioBlueprint);
      blueprint.pages[0]!.regions[0]!.interactions = [interaction];
      expect(() => retrieveCapabilities({ blueprint, knowledge: getDesignKnowledgeSnapshot() }), interaction)
        .toThrow("CAPABILITY_RETRIEVAL_BLOCKED");
    }
  });

  it.each([
    "点击记录查看详情",
    "筛选并搜索访客记录",
    "切换标签页",
    "打开和关闭对话框",
    "选择并更改审核状态",
  ])("normalizes a natural Chinese interaction and fails closed when three supported controls do not exist: %s", (interaction) => {
    const blueprint = structuredClone(portfolioBlueprint);
    blueprint.pages[0]!.regions[0]!.interactions = [interaction];

    expect(() => retrieveCapabilities({ blueprint, knowledge: getDesignKnowledgeSnapshot() }))
      .toThrow("CAPABILITY_RETRIEVAL_BLOCKED");
  });

  it("does not return technically inert candidates for 点击记录查看详情", () => {
    const blueprint = structuredClone(portfolioBlueprint);
    blueprint.pages[0]!.regions[0]!.interactions = ["点击记录查看详情"];

    expect(() => retrieveCapabilities({ blueprint, knowledge: getDesignKnowledgeSnapshot() }))
      .toThrow("CAPABILITY_RETRIEVAL_BLOCKED");
  });

  it("keeps every one of 96 regions bounded under the global detail budget", () => {
    const blueprint = structuredClone(portfolioBlueprint);
    blueprint.pages = Array.from({ length: 8 }, (_, pageIndex) => {
      const pageId = `portfolio-page-${pageIndex + 1}`;
      const regions = Array.from({ length: 12 }, (_, regionIndex) => ({
        ...portfolioBlueprint.pages[0]!.regions[0]!,
        id: `work-${pageIndex + 1}-${regionIndex + 1}`,
      }));
      return {
        ...portfolioBlueprint.pages[0]!,
        id: pageId,
        readingOrder: regions.map((region) => region.id),
        regions,
      };
    });
    blueprint.journeys = [{
      ...portfolioBlueprint.journeys[0]!,
      steps: [{
        ...portfolioBlueprint.journeys[0]!.steps[0]!,
        pageId: "portfolio-page-1",
        regionId: "work-1-1",
      }],
    }];

    const bundle = retrieveCapabilities({ blueprint, knowledge: getDesignKnowledgeSnapshot() });
    expect(bundle.regions).toHaveLength(96);
    expect(bundle.detailedCapabilityIds.length).toBeLessThanOrEqual(25);
    expect(bundle.regions.every((region) =>
      region.controls.length >= 3 && region.controls.length <= 5
      && region.layouts.length >= 1 && region.layouts.length <= 3
      && region.recipes.length >= 1 && region.recipes.length <= 3,
    )).toBe(true);
    expect(CapabilityCandidateBundleSchema.safeParse(bundle).success).toBe(true);
  });
});

describe("solution plan candidate validation", () => {
  it.each([
    ["row", ["layout.2"]],
    ["column", ["layout.4"]],
    ["grid", ["layout.2", "layout.4"]],
    ["asymmetric-grid", ["layout.2", "layout.4"]],
    ["split", ["layout.2", "layout.4"]],
    ["stack", ["layout.4"]],
    ["dock", ["layout.5"]],
    ["sidebar-content", ["layout.5"]],
    ["master-detail", ["layout.2", "layout.5"]],
    ["scroll-region", ["layout.4"]],
    ["overlay-anchor", ["layout.5"]],
  ] as const)("publishes the single reviewed %s compatibility lookup", (kind, expected) => {
    const actual = layoutCapabilityIdsFor(kind);
    expect(actual).toEqual(expected);
    expect(Object.isFrozen(actual)).toBe(true);
  });

  it("accepts candidate-backed controls, layouts, recipes, and exact registered modules", () => {
    const bundle = retrieveCapabilities({ blueprint: portfolioBlueprint, knowledge: getDesignKnowledgeSnapshot() });
    expect(() => assertSolutionPlanUsesCandidates(planFor(bundle), bundle)).not.toThrow();
  });

  it("rejects a candidate-backed region when the owning blueprint page is wrong", () => {
    const bundle = retrieveCapabilities({ blueprint: portfolioBlueprint, knowledge: getDesignKnowledgeSnapshot() });
    const plan = planFor(bundle);
    plan.pages[0]!.sourceBlueprintPageId = "wrong-page";

    expect(() => assertSolutionPlanUsesCandidates(plan, bundle)).toThrow(
      "control portfolio-control: capability image is not a candidate for page-regions [wrong-page/selected-work]",
    );
  });

  it("rejects a native plan that omits a candidate-backed region from page provenance", () => {
    const sourceBundle = retrieveCapabilities({ blueprint: portfolioBlueprint, knowledge: getDesignKnowledgeSnapshot() });
    const sourceRegion = sourceBundle.regions[0]!;
    const bundle: CapabilityCandidateBundle = {
      ...sourceBundle,
      regions: [sourceRegion, { ...structuredClone(sourceRegion), regionId: "supporting-work" }],
    };
    const plan = planFor(bundle);

    expect(() => assertSolutionPlanUsesCandidates(plan, bundle)).toThrow(
      "missing plan page-region provenance [portfolio-home/supporting-work]",
    );
  });

  it("rejects a native plan that omits a candidate-backed page from provenance", () => {
    const sourceBundle = retrieveCapabilities({ blueprint: portfolioBlueprint, knowledge: getDesignKnowledgeSnapshot() });
    const sourceRegion = sourceBundle.regions[0]!;
    const bundle: CapabilityCandidateBundle = {
      ...sourceBundle,
      regions: [sourceRegion, {
        ...structuredClone(sourceRegion),
        pageId: "portfolio-detail",
        regionId: "project-detail",
      }],
    };
    const plan = planFor(bundle);

    expect(() => assertSolutionPlanUsesCandidates(plan, bundle)).toThrow(
      "missing plan page-region provenance [portfolio-detail/project-detail]",
    );
  });

  it("throws one stable, sorted mismatch without substituting invalid choices", () => {
    const bundle = retrieveCapabilities({ blueprint: portfolioBlueprint, knowledge: getDesignKnowledgeSnapshot() });
    const plan = planFor(bundle, {
      blueprintHash: "0".repeat(64),
      candidateBundleHash: "f".repeat(64),
    });
    const root = plan.pages[0]!.root;
    if (root.kind !== "layout") throw new Error("expected layout root");
    const controlNode = root.children[0];
    const moduleNode = root.children[1];
    if (controlNode?.kind !== "control" || moduleNode?.kind !== "registered-module") {
      throw new Error("expected control and module children");
    }
    root.children[0] = { ...controlNode, capabilityId: "unknown-control" };
    root.children[1] = {
      ...moduleNode,
      variant: "unknown-variant",
      slots: [{ slotId: "actions", children: [root.children[0]] }],
    };
    root.children.push({
      ...moduleNode,
      id: "missing-module",
      moduleKind: "missing.module",
      templateVersion: "9.9.9",
      variant: "default",
      slots: [],
    });

    const readError = (): string => {
      try {
        assertSolutionPlanUsesCandidates(plan, bundle);
      } catch (error) {
        return (error as Error).message;
      }
      throw new Error("expected mismatch");
    };
    const first = readError();
    expect(first).toBe(readError());
    expect(first).toMatch(/^SOLUTION_PLAN_CANDIDATE_MISMATCH: /);
    expect(first).toContain("unknown-control");
    expect(first).toContain("unknown-variant");
    expect(first).toContain("missing.module@9.9.9");
    expect(first).toContain("NEEDS_CONTEXT/BLOCKED");
    const issues = first.replace(/^SOLUTION_PLAN_CANDIDATE_MISMATCH: /, "").split("; ");
    expect(issues).toEqual([...issues].sort());
  });

  it("rejects layouts and adopted recipes outside their source-region candidates", () => {
    const sourceBundle = retrieveCapabilities({ blueprint: portfolioBlueprint, knowledge: getDesignKnowledgeSnapshot() });
    const plan = planFor(sourceBundle);
    const root = plan.pages[0]!.root;
    if (root.kind !== "layout") throw new Error("expected layout root");
    const disallowedLayoutId = root.layout === "row" ? "layout.4" : "layout.2";
    const sourceRegion = sourceBundle.regions[0]!;
    const replacementLayout = sourceRegion.layouts.find((candidate) => candidate.id === disallowedLayoutId)!;
    const bundle: CapabilityCandidateBundle = {
      ...sourceBundle,
      regions: [{
        ...sourceRegion,
        layouts: [replacementLayout],
      }],
    };
    root.recipeId = "unranked-recipe";
    plan.candidateBundleHash = canonicalHash(bundle);

    expect(() => assertSolutionPlanUsesCandidates(plan, bundle)).toThrow("recipe unranked-recipe");
    expect(() => assertSolutionPlanUsesCandidates(plan, bundle)).toThrow("not backed by a layout candidate");
  });
});
