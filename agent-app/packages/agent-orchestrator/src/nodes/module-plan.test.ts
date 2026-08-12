import { describe, expect, it } from "vitest";
import {
  canonicalModuleCompilationHash,
  type AcceptedBlueprintArtifact,
  type AssetRecord,
  type ChangePlan,
  type CustomerEffectBlueprint,
  type DesignPlan,
  type ModuleDeliveryGap,
  type ModulePlan,
  type ServerPlanEnvelope,
} from "@kf/contracts";
import { createHmacModuleArtifactAuthority } from "@kf/build-jobs";
import type { ModuleCompilationOutcome, ModulePlanningSummary } from "@kf/domain-client";
import type { ModelPort, ModelPortContext } from "../model-port.js";
import type {
  AssetCatalogPort,
  ChangePlanRepository,
  ModulePlanCompilerPort,
  SolutionGraphDeps,
  WorkspaceQueryPort,
} from "../ports.js";
import type { AgentGraphStateValue } from "../state.js";
import { TEST_SERVER_PLAN_SIGNER } from "../test-server-plan-signer.js";
import { createModulePlanNode } from "./module-plan.js";
import { routeAfterClassify, routeAfterModulePlan } from "../solution-graph.js";

const authority = createHmacModuleArtifactAuthority(Buffer.alloc(32, 0x71));
const blueprint: CustomerEffectBlueprint = {
  schema: "kf-design-plan/v2",
  displayName: "Portal",
  overview: { objective: "Show", audiences: ["Customer"], scenarios: ["Review"], valueProposition: "Clear" },
  informationArchitecture: { narrative: "Panel", wireframe: "Panel" },
  modules: [{ id: "source-panel", name: "Panel", purpose: "Show", content: ["Title"], sampleData: [], interactions: [], expectedKind: "test.panel", expectedCategory: "test", presentation: "Panel" }],
  visualDirection: { tone: "Clean", colors: ["Blue"], typography: "Clear", spacingAndSurfaces: "Spacious" },
  highlights: ["Panel"],
  revisionNotes: { added: ["Panel"], changed: [], retained: [] },
  acceptanceCriteria: ["Panel visible"],
  openQuestions: [],
};
const theme = { background: "#101827", surface: "#1E293B", primary: "#2563EB", accent: "#38BDF8", textPrimary: "#F8FAFC", textSecondary: "#94A3B8", fontFamily: "Inter", spacingUnit: 8, radiusScale: { small: 4, medium: 8, large: 16 } } as const;

function modulePlan(title = "Panel"): ModulePlan {
  return {
    schema: "kf-module-plan/v1",
    projectKey: "kingclient",
    theme,
    assets: [],
    operations: [],
    pages: [{
      id: "home", title: "Home", mode: "vertical-flow",
      modules: [{
        id: "panel", kind: "test.panel", templateVersion: "1.0.0", variant: "default",
        title, content: JSON.stringify({ title }), sourceBlueprintModuleIds: ["source-panel"],
        placement: { region: "main", order: 0, columnSpan: 12, preferredHeight: "medium", alignment: "stretch", emphasis: "primary" },
        interactions: [],
      }],
    }],
  };
}

const catalog: readonly ModulePlanningSummary[] = [{
  kind: "test.panel", version: "1.0.0", maturity: "stable", variants: ["default"], slots: [], interactions: [],
  layout: { regions: ["main"], minColumnSpan: 1, maxColumnSpan: 12, preferredHeights: ["medium"] },
}];

function acceptedArtifact(revisionId = "revision-1"): AcceptedBlueprintArtifact {
  return authority.signAcceptedBlueprint({
    schema: "kf-accepted-blueprint-artifact/v1",
    projectKey: "kingclient",
    revisionId,
    blueprintHash: canonicalModuleCompilationHash(blueprint),
    modules: [{ blueprintModuleId: "source-panel", expectedKind: "test.panel", expectedCategory: "test", interactionRequirements: [] }],
  });
}

function compiledOutcome(plan: ModulePlan, revisionId = "revision-1"): ModuleCompilationOutcome {
  const implementation = {
    schema: "kf-ui-implementation/v1" as const,
    theme,
    pages: [{ id: "home", width: 1440, height: 900, components: [{
      id: "panel/title", role: "title", sourceModuleId: "panel", capabilityId: "text", critical: true,
      content: "Panel", geometry: { x: 48, y: 48, width: 400, height: 40 }, properties: {}, style: { declarations: {}, states: {} },
    }] }],
  };
  const metadata = {
    schema: "kf-module-compilation-metadata/v1" as const,
    projectKey: "kingclient",
    moduleDefinitions: [{ pageId: "home", moduleId: "panel", kind: "test.panel", templateVersion: "1.0.0", compilerFingerprint: "test-panel-compiler-v1", layoutFingerprint: "test-panel-layout-v1" }],
    assets: [],
    blueprintMappings: [{ blueprintModuleId: "source-panel", pageId: "home", moduleId: "panel", expectedKind: "test.panel", expectedCategory: "test", interactionBindings: [] }],
  };
  const deliveryReport = { schema: "kf-module-delivery/v1" as const, projectKey: "kingclient", status: "ready" as const, gaps: [] };
  return {
    status: "compiled",
    implementation,
    metadata,
    artifactCandidate: {
      schema: "kf-module-compilation-artifact/v1",
      projectKey: "kingclient",
      revisionId,
      acceptedBlueprintHash: canonicalModuleCompilationHash(blueprint),
      planHash: canonicalModuleCompilationHash(plan),
      implementationHash: canonicalModuleCompilationHash(implementation),
      metadataHash: canonicalModuleCompilationHash(metadata),
      sourceModuleIds: ["panel"],
      metadata,
    },
    traces: [], assetBindings: [], gaps: [], deliveryReport,
  };
}

function blockedOutcome(reason: string, requirement = "valid module coverage"): ModuleCompilationOutcome {
  const gap: ModuleDeliveryGap = { moduleId: "panel", requirement, severity: "blocking", status: "unresolved", reason };
  return {
    status: "blocked", traces: [], assetBindings: [], gaps: [gap],
    metadata: { schema: "kf-module-compilation-metadata/v1", projectKey: "kingclient", moduleDefinitions: [], assets: [], blueprintMappings: [] },
    deliveryReport: { schema: "kf-module-delivery/v1", projectKey: "kingclient", status: "blocked", gaps: [gap] },
  };
}

class ModuleModel implements ModelPort {
  createCalls: ModelPortContext[] = [];
  reviseCalls: ModelPortContext[] = [];
  candidates: ModulePlan[] = [modulePlan()];
  async createModulePlan(input: ModelPortContext): Promise<ModulePlan> { this.createCalls.push(input); return this.candidates.shift() ?? modulePlan(); }
  async reviseModulePlan(input: ModelPortContext): Promise<ModulePlan> { this.reviseCalls.push(input); return this.candidates.shift() ?? modulePlan("Repaired"); }
  classifyIntent(): never { throw new Error("unused"); }
  createProjectDesign(): never { throw new Error("unused"); }
  createChangePlan(): never { throw new Error("unused"); }
  reviseChangePlan(): never { throw new Error("unused"); }
  createDesignPlan(): never { throw new Error("unused"); }
  createUiImplementation(): never { throw new Error("unused"); }
  reviseUiImplementation(): never { throw new Error("unused"); }
  explainValidation(): never { throw new Error("unused"); }
}

function state(overrides: Partial<AgentGraphStateValue> = {}): AgentGraphStateValue {
  return {
    tenantId: "tenant", userId: "user", workspaceId: "workspace", conversationId: "conversation",
    currentRevisionId: "revision-1", designPlan: blueprint, designPlanHash: "d".repeat(64),
    intent: "CONFIRM_DESIGN", stage: "design-review", recentMessages: [{ role: "user", content: "确认" }],
    ...overrides,
  } as AgentGraphStateValue;
}

function bed(outcomes: ModuleCompilationOutcome[]): {
  deps: SolutionGraphDeps;
  model: ModuleModel;
  messages: string[];
  plans: Map<string, ChangePlan | ServerPlanEnvelope>;
  compileCalls: number;
} {
  const model = new ModuleModel();
  const messages: string[] = [];
  const plans = new Map<string, ChangePlan | ServerPlanEnvelope>();
  let compileCalls = 0;
  const workspaceQuery: WorkspaceQueryPort = {
    listRecentMessages: async () => [], appendMessage: async (input) => { messages.push(input.content); },
    getConversationSummary: async () => undefined, setConversationSummary: async () => {},
    getCurrentRevisionId: async () => "revision-1", getRevisionSummary: async () => undefined,
    getRevisionEntities: async () => [],
  };
  const changePlanRepository: ChangePlanRepository = {
    findOpenChangeRequest: async () => null, saveChangeRequest: async () => {},
    savePlan: async (input) => { plans.set(input.id, input.plan); }, loadPlanHash: async () => undefined,
    setChangeRequestStatus: async () => {},
  };
  const modulePlanCompiler: ModulePlanCompilerPort = {
    listPlanningCatalog: async () => catalog,
    compile: async (input) => {
      const selected = outcomes[Math.min(compileCalls, outcomes.length - 1)] ?? compiledOutcome(input.plan);
      compileCalls += 1;
      return selected.status === "compiled"
        ? compiledOutcome(input.plan, selected.artifactCandidate.revisionId)
        : selected;
    },
  };
  const assetCatalog: AssetCatalogPort = { list: async (): Promise<AssetRecord[]> => [] };
  const deps: SolutionGraphDeps = {
    modelPort: model, workspaceQuery, changePlanRepository,
    buildJobPort: { enqueue: async () => ({ id: "job", status: "QUEUED" }), getJob: async () => null },
    uiImplementationCompiler: { compile: async ({ workspaceId }) => ({
      plan: { schema: "kf-change-plan/v1", workspaceId, operations: [{ op: "create", entityType: "control", entityId: "panel/title", properties: { pageId: "page-home", type: "text", text: "Panel" } }] },
      capabilityReport: { status: "pass", full: ["text"], partial: [], unsupported: [], deliveryGaps: [] },
    }) },
    serverPlanSigner: TEST_SERVER_PLAN_SIGNER, moduleArtifactAuthority: authority,
    modulePlanCompiler, assetCatalog,
    acceptedBlueprintConfirmation: { confirm: async (input) => acceptedArtifact(input.revisionId) },
    isDomainSupported: () => true, defaultDomainKind: "kingclient", defaultProjectKey: "kingclient",
  };
  return { deps, model, messages, plans, get compileCalls() { return compileCalls; } };
}

describe("module planning node", () => {
  it("routes module-ready v2 confirmation and preview feedback directly through module planning and enqueue", () => {
    const deps = bed([compiledOutcome(modulePlan())]).deps;
    expect(routeAfterClassify(state(), deps)).toBe("module-plan");
    expect(routeAfterClassify(state({ intent: "MODIFY_REQUIREMENT", stage: "preview-review", modulePlan: modulePlan() }), deps)).toBe("module-plan");
    expect(routeAfterModulePlan(state({ stage: "building", buildAuthorization: "confirmed-blueprint" }))).toBe("enqueue-build");
    expect(routeAfterModulePlan(state({ stage: "building", buildAuthorization: "preview-feedback" }))).toBe("enqueue-build");
  });

  it("keeps legacy v1 and imported unadopted UI implementations on the technical approval path", () => {
    const legacy: DesignPlan = { schema: "kf-design-plan/v1", displayName: "Legacy", summary: "Summary", layoutConcept: "Layout", styleDirection: "Style", sections: [{ id: "main", label: "Main", controls: [{ type: "text", text: "Hello" }] }], signature: "sig" };
    const deps = bed([compiledOutcome(modulePlan())]).deps;
    expect(routeAfterClassify(state({ designPlan: legacy, intent: "CONFIRM_DESIGN" }), deps)).toBe("plan-change");
    const implementation = compiledOutcome(modulePlan());
    if (implementation.status !== "compiled") throw new Error("fixture");
    expect(routeAfterClassify(state({ uiImplementation: implementation.implementation, modulePlan: undefined }), deps)).toBe("implementation-plan");
    expect(routeAfterClassify(state({ workspaceMode: "upload", modulePlan: undefined }), deps)).toBe("implementation-plan");
  });

  it("blocks an unmapped v2 blueprint instead of falling back to technical approval", async () => {
    const testBed = bed([compiledOutcome(modulePlan())]);
    const unmapped = { ...blueprint, modules: blueprint.modules.map((module) => {
      const copy = { ...module };
      Reflect.deleteProperty(copy, "expectedKind");
      return copy;
    }) };
    expect(routeAfterClassify(state({ designPlan: unmapped, moduleWorkflowRequested: true }), testBed.deps)).toBe("module-plan");
    const result = await createModulePlanNode(testBed.deps)(state({ designPlan: unmapped }));
    expect(result.lastErrorCode).toBe("MODULE_BLUEPRINT_MAPPING_REQUIRED:source-panel");
    expect(result.stage).toBe("design-review");
    expect(testBed.model.createCalls).toHaveLength(0);
  });

  it("reports the empty stable catalog before asking an unmapped real-model blueprint for a mapping", async () => {
    const testBed = bed([compiledOutcome(modulePlan())]);
    testBed.deps.modulePlanCompiler = { ...testBed.deps.modulePlanCompiler!, listPlanningCatalog: async () => [] };
    const unmapped = { ...blueprint, modules: blueprint.modules.map((module) => {
      const copy = { ...module };
      Reflect.deleteProperty(copy, "expectedKind");
      return copy;
    }) };
    expect(routeAfterClassify(state({ designPlan: unmapped, moduleWorkflowRequested: true }), testBed.deps)).toBe("module-plan");
    const result = await createModulePlanNode(testBed.deps)(state({ designPlan: unmapped }));
    expect(result).toMatchObject({ stage: "design-review", lastErrorCode: "MODULE_STABLE_CATALOG_EMPTY" });
    expect(testBed.model.createCalls).toHaveLength(0);
  });

  it("creates, compiles, signs and persists an initial plan for direct preview build", async () => {
    const current = modulePlan();
    const testBed = bed([compiledOutcome(current)]);
    testBed.model.candidates = [current];
    const result = await createModulePlanNode(testBed.deps)(state());
    expect(result).toMatchObject({
      modulePlan: current,
      modulePlanHash: canonicalModuleCompilationHash(current),
      moduleRepairAttempt: 0,
      buildAuthorization: "confirmed-blueprint",
      stage: "building",
    });
    expect(result.moduleCompilationArtifact).toBeDefined();
    expect(result.uiImplementation).toBeDefined();
    expect(result.moduleDeliveryReport).toMatchObject({ status: "ready" });
    expect(testBed.plans.size).toBe(1);
    expect(testBed.model.createCalls).toHaveLength(1);
  });

  it.each([1, 2, 3])("repairs a blocked full plan exactly %i time(s)", async (repairCount) => {
    const outcomes = Array.from({ length: repairCount }, () => blockedOutcome("BLUEPRINT_MODULE_MISSING"));
    outcomes.push(compiledOutcome(modulePlan("Repaired")));
    const testBed = bed(outcomes);
    testBed.model.candidates = Array.from({ length: repairCount + 1 }, (_, index) => modulePlan(`Candidate ${index}`));
    const result = await createModulePlanNode(testBed.deps)(state());
    expect(result.lastErrorCode).toBeUndefined();
    expect(result.stage).toBe("building");
    expect(result.moduleRepairAttempt).toBe(repairCount);
    expect(testBed.model.reviseCalls).toHaveLength(repairCount);
    expect(testBed.model.reviseCalls.at(-1)?.modulePlanRejectionReasons).toEqual(["panel: valid module coverage — BLUEPRINT_MODULE_MISSING"]);
  });

  it("blocks the fourth failed compilation after at most three model repair calls", async () => {
    const testBed = bed([blockedOutcome("BLUEPRINT_MODULE_MISSING")]);
    const result = await createModulePlanNode(testBed.deps)(state());
    expect(result).toMatchObject({ stage: "idle", moduleRepairAttempt: 3 });
    expect(result.lastErrorCode).toMatch(/^MODULE_PLAN_REPAIR_EXHAUSTED:/);
    expect(testBed.compileCalls).toBe(4);
    expect(testBed.model.reviseCalls).toHaveLength(3);
    expect(testBed.plans.size).toBe(0);
    expect(result.moduleDeliveryOwnerMappings).toEqual([
      { blueprintModuleId: "source-panel", moduleId: "panel" },
    ]);
  });

  it("asks the user for a missing critical asset without hallucinating or repairing", async () => {
    const testBed = bed([blockedOutcome("MODULE_ASSET_NOT_FOUND", "portrait asset")]);
    const result = await createModulePlanNode(testBed.deps)(state());
    expect(result).toMatchObject({ stage: "design-review", moduleRepairAttempt: 0 });
    expect(result.lastErrorCode).toMatch(/^MODULE_ASSET_REQUIRED:/);
    expect(testBed.model.reviseCalls).toHaveLength(0);
    expect(testBed.messages.at(-1)).toContain("资源");
    expect(result.moduleDeliveryOwnerMappings).toEqual([
      { blueprintModuleId: "source-panel", moduleId: "panel" },
    ]);
  });

  it("returns an actionable capability block before calling the model when no stable module is available", async () => {
    const testBed = bed([compiledOutcome(modulePlan())]);
    testBed.deps.modulePlanCompiler = { ...testBed.deps.modulePlanCompiler!, listPlanningCatalog: async () => [] };
    const result = await createModulePlanNode(testBed.deps)(state());
    expect(result.lastErrorCode).toBe("MODULE_STABLE_CATALOG_EMPTY");
    expect(result.stage).toBe("design-review");
    expect(testBed.model.createCalls).toHaveLength(0);
    expect(testBed.messages.at(-1)).toContain("稳定模块");
  });

  it("bounds deterministic compiler failures and never persists or builds them", async () => {
    const testBed = bed([compiledOutcome(modulePlan())]);
    testBed.deps.modulePlanCompiler = {
      ...testBed.deps.modulePlanCompiler!,
      compile: async () => { throw new Error(`COMPILER_BUG:${"x".repeat(2_000)}`); },
    };
    const first = await createModulePlanNode(testBed.deps)(state());
    const second = await createModulePlanNode(testBed.deps)(state());
    expect(first.lastErrorCode).toBe(second.lastErrorCode);
    expect(first.lastErrorCode?.startsWith("MODULE_COMPILATION_FAILED:COMPILER_BUG:")).toBe(true);
    expect(first.lastErrorCode!.length).toBeLessThanOrEqual(520);
    expect(testBed.plans.size).toBe(0);
    expect(testBed.model.reviseCalls).toHaveLength(0);
  });

  it("revises from the previous verified artifact and preserves an omitted unaffected module", async () => {
    const previous = modulePlan("Previous");
    const previousCompiled = compiledOutcome(previous);
    if (previousCompiled.status !== "compiled") throw new Error("fixture");
    const signedPrevious = authority.signModuleCompilation(previousCompiled.artifactCandidate);
    const revised = { ...modulePlan("Revised"), pages: [{ ...modulePlan("Revised").pages[0]!, modules: [] }] } as ModulePlan;
    const expected = modulePlan("Previous");
    const testBed = bed([compiledOutcome(expected, "revision-2")]);
    testBed.model.candidates = [revised];
    const result = await createModulePlanNode(testBed.deps)(state({
      currentRevisionId: "revision-2",
      stage: "preview-review",
      intent: "MODIFY_REQUIREMENT",
      modulePlan: previous,
      modulePlanHash: canonicalModuleCompilationHash(previous),
      moduleCompilationArtifact: signedPrevious,
      uiImplementation: previousCompiled.implementation,
      uiImplementationHash: canonicalModuleCompilationHash(previousCompiled.implementation),
    }));
    expect(result.lastErrorCode).toBeUndefined();
    expect(testBed.model.reviseCalls).toHaveLength(1);
    expect(result.modulePlan?.pages[0]?.modules).toEqual(previous.pages[0]?.modules);
    expect(result.buildAuthorization).toBe("preview-feedback");
  });

  it("rejects a revision whose persisted plan hash does not bind the previous checkpoint", async () => {
    const previous = modulePlan("Previous");
    const previousCompiled = compiledOutcome(previous);
    if (previousCompiled.status !== "compiled") throw new Error("fixture");
    const testBed = bed([compiledOutcome(previous, "revision-2")]);
    const result = await createModulePlanNode(testBed.deps)(state({
      currentRevisionId: "revision-2",
      modulePlan: previous,
      modulePlanHash: "0".repeat(64),
      moduleCompilationArtifact: authority.signModuleCompilation(previousCompiled.artifactCandidate),
      uiImplementation: previousCompiled.implementation,
      uiImplementationHash: canonicalModuleCompilationHash(previousCompiled.implementation),
    }));
    expect(result.lastErrorCode).toBe("MODULE_REVISION_CHECKPOINT_HASH_MISMATCH");
    expect(testBed.model.reviseCalls).toHaveLength(0);
  });
});
