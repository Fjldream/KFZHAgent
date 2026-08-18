import { describe, expect, it } from "vitest";
import { Command, MemorySaver } from "@langchain/langgraph";
import { deriveGuid, getDesignKnowledgeSnapshot, planHash, retrieveCapabilities } from "@kf/domain-client";
import {
  canonicalServerHash,
  solutionId,
  type ChangePlan,
  type CapabilityReport,
  type CustomerEffectBlueprint,
  type CustomerSolutionBlueprint,
  type DesignPlan,
  type ServerPlanEnvelope,
  type SolutionImplementationPlan,
  type SolutionIR,
  type UIImplementationSpec,
} from "@kf/contracts";
import type {
  AppendMessageInput,
  BuildJobInfo,
  BuildJobPort,
  ChangePlanRepository,
  EditableEntity,
  EnqueueBuildInput,
  SolutionGraphDeps,
  WorkspaceQueryPort,
} from "./ports.js";
import type { ModelPort, ModelPortContext } from "./model-port.js";
import type { GraphMessage, ApprovalInterrupt } from "./state.js";
import type { Intent } from "./schemas/intent.js";
import { compileSolutionGraph, ApprovalResumeRequiredError } from "./solution-graph.js";
import { decodeBlueprintMessage } from "./blueprint-message.js";
import { TEST_SERVER_PLAN_SIGNER } from "./test-server-plan-signer.js";

type CompiledGraph = ReturnType<typeof compileSolutionGraph>;

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

class FakeWorkspaceQuery implements WorkspaceQueryPort {
  currentRevision = new Map<string, string>();
  revisionSummaries = new Map<string, string>();
  summaries = new Map<string, string>();
  messages = new Map<string, GraphMessage[]>();
  appendCalls: AppendMessageInput[] = [];
  routing = new Map<string, { mode: "new" | "upload"; generationWorkflow: "legacy" | "module-v1" | "creative-v2" }>();

  async listRecentMessages({ conversationId }: { conversationId: string }): Promise<GraphMessage[]> {
    return this.messages.get(conversationId) ?? [];
  }
  async appendMessage(input: AppendMessageInput): Promise<void> {
    this.appendCalls.push(input);
    const list = this.messages.get(input.conversationId) ?? [];
    list.push({ role: input.role, content: input.content });
    this.messages.set(input.conversationId, list);
  }
  async getConversationSummary({ conversationId }: { conversationId: string }): Promise<string | undefined> {
    return this.summaries.get(conversationId);
  }
  async setConversationSummary({
    conversationId,
    summary,
  }: {
    conversationId: string;
    summary: string;
  }): Promise<void> {
    this.summaries.set(conversationId, summary);
  }
  async getCurrentRevisionId({ workspaceId }: { workspaceId: string }): Promise<string | undefined> {
    return this.currentRevision.get(workspaceId);
  }
  async getWorkspaceRouting({ workspaceId }: { workspaceId: string }) {
    return this.routing.get(workspaceId);
  }
  async getRevisionSummary({ revisionId }: { revisionId: string }): Promise<string | undefined> {
    return this.revisionSummaries.get(revisionId);
  }
  async getRevisionEntities(): Promise<EditableEntity[]> {
    return [];
  }
}

interface StoredRequest {
  id: string;
  status: string;
}

class FakeChangePlanRepository implements ChangePlanRepository {
  requests = new Map<string, StoredRequest>();
  plans = new Map<string, { planHash: string; plan: ChangePlan | ServerPlanEnvelope }>();
  statusCalls: { changeRequestId: string; status: string }[] = [];

  async findOpenChangeRequest({
    workspaceId,
    conversationId,
  }: {
    workspaceId: string;
    conversationId: string;
  }) {
    const request = this.requests.get(`cr:${workspaceId}:${conversationId}`);
    return request !== undefined && request.status === "OPEN" ? { id: request.id } : null;
  }
  async saveChangeRequest(input: { id: string; status: string }): Promise<void> {
    this.requests.set(input.id, { id: input.id, status: input.status });
  }
  async savePlan(input: { id: string; planHash: string; plan: ChangePlan | ServerPlanEnvelope }): Promise<void> {
    this.plans.set(input.id, { planHash: input.planHash, plan: input.plan });
  }
  async loadPlanHash({ changePlanId }: { changePlanId: string }): Promise<string | undefined> {
    return this.plans.get(changePlanId)?.planHash;
  }
  async setChangeRequestStatus(input: {
    changeRequestId: string;
    status: string;
  }): Promise<void> {
    this.statusCalls.push(input);
    const request = this.requests.get(input.changeRequestId);
    if (request !== undefined) request.status = input.status;
  }
  statusOf(changeRequestId: string): string | undefined {
    return this.requests.get(changeRequestId)?.status;
  }
}

class FakeBuildJobPort implements BuildJobPort {
  jobs = new Map<string, BuildJobInfo>();
  enqueues: EnqueueBuildInput[] = [];
  created: { id: string; input: EnqueueBuildInput }[] = [];

  async enqueue(input: EnqueueBuildInput): Promise<BuildJobInfo> {
    const id = `job-${this.enqueues.length + 1}`;
    this.enqueues.push(input);
    this.created.push({ id, input });
    this.jobs.set(id, { id, status: "QUEUED" });
    return { id, status: "QUEUED" };
  }
  async getJob({ jobId }: { jobId: string }): Promise<BuildJobInfo | null> {
    return this.jobs.get(jobId) ?? null;
  }
  setStatus(jobId: string, status: BuildJobInfo["status"]): void {
    const job = this.jobs.get(jobId);
    if (job !== undefined) job.status = status;
  }
}

class FakeModelPort implements ModelPort {
  intents: Intent[] = [];
  classifyInputs: ModelPortContext[] = [];
  createCalls: ModelPortContext[] = [];
  reviseCalls: ModelPortContext[] = [];
  implementationCreateCalls: ModelPortContext[] = [];
  implementationReviseCalls: ModelPortContext[] = [];
  designCalls: ModelPortContext[] = [];
  solutionCreateCalls: ModelPortContext[] = [];
  solutionReviseCalls: ModelPortContext[] = [];
  createdPlans: ChangePlan[] = [];
  /** When true, createChangePlan/reviseChangePlan return a schema-invalid plan. */
  invalidPlan = false;
  /** When true, classifyIntent returns a schema-invalid intent (I1). */
  invalidIntent = false;
  /** When true, createProjectDesign returns a schema-invalid design (I1). */
  invalidDesign = false;
  private seq = 0;
  private implementationSeq = 0;

  queueIntent(...intents: Intent[]): void {
    this.intents.push(...intents);
  }

  async classifyIntent(input: ModelPortContext) {
    this.classifyInputs.push(input);
    if (this.invalidIntent) {
      // Garbage output a real LLM could emit: invented intent value.
      return { intent: "MADE_UP_INTENT" as unknown as Intent, requestedDomains: [] };
    }
    const intent = this.intents.shift() ?? "QUESTION";
    if (intent === "CLARIFY") {
      return {
        intent,
        requestedDomains: [],
        clarifyingQuestion: {
          question: "主题是哪种？",
          options: ["①生产监控", "②设备状态"],
        },
      };
    }
    return { intent, requestedDomains: ["kingclient"], reply: `reply:${intent}` };
  }

  async createDesignPlan(
    input: ModelPortContext,
    opts?: { revising?: boolean },
  ): Promise<DesignPlan> {
    this.designCalls.push(input);
    if (input.generationWorkflow === "creative-v2") return creativeBlueprint();
    const base: CustomerEffectBlueprint = {
      schema: "kf-design-plan/v2",
      displayName: "客户效果方案",
      overview: {
        objective: "让客户快速理解方案效果",
        audiences: ["业务用户"],
        scenarios: ["方案确认"],
        valueProposition: "用完整内容说明最终效果",
      },
      informationArchitecture: { narrative: "从总览到详情", wireframe: "总览 → 详情" },
      modules: [{
        id: "main",
        name: "核心内容",
        purpose: "展示主要信息",
        content: ["标题", "说明", "关键指标"],
        sampleData: [{ label: "示例指标", value: "98%" }],
        interactions: ["点击查看详情"],
        presentation: "重点卡片",
      }],
      visualDirection: {
        tone: "专业清晰",
        colors: ["深蓝"],
        typography: "标题突出",
        spacingAndSurfaces: "清晰留白",
      },
      highlights: ["信息层级清晰"],
      revisionNotes: { added: ["完整核心内容"], changed: [], retained: [] },
      acceptanceCriteria: ["客户能看到完整核心信息"],
      openQuestions: [],
    };
    if (opts?.revising !== true) return base;
    if (/产品|项目经历|内容要充实/.test(input.requirementText ?? "")) {
      return {
        ...base,
        displayName: "个人求职作品集",
        overview: {
          objective: "让招聘经理完整了解候选人的产品能力和项目成果",
          audiences: ["招聘经理", "面试官"],
          scenarios: ["求职应聘"],
          valueProposition: "用完整案例证明候选人的实际贡献",
        },
        informationArchitecture: {
          narrative: "从个人定位到产品、项目、履历和联系方式",
          wireframe: "首屏 → 我的产品 → 项目经历 → 履历 → 联系方式",
        },
        modules: [
          {
            id: "products",
            name: "我的产品",
            purpose: "展示主导或参与的代表产品",
            content: ["产品定位", "个人职责", "核心能力", "量化成果"],
            sampleData: [{ label: "产品名称", value: "KingFusion 工业低代码平台" }],
            interactions: ["点击产品卡片展开详情"],
            presentation: "大尺寸产品卡片",
          },
          {
            id: "projects",
            name: "项目经历",
            purpose: "用完整项目案例证明交付能力",
            content: ["项目背景", "个人职责", "解决方案", "量化成果"],
            sampleData: [{ label: "项目名称", value: "汽车工厂能源管理平台" }],
            interactions: ["展开项目详情"],
            presentation: "纵向时间线",
          },
        ],
        revisionNotes: {
          added: ["新增独立的我的产品模块"],
          changed: ["项目经历补充背景、职责、方案和成果"],
          retained: ["保留专业清晰的视觉方向"],
        },
        acceptanceCriteria: [
          "至少展示两个产品案例和三个包含背景、职责、方案、成果的项目案例",
        ],
      };
    }
    return {
      ...base,
      modules: [
        ...base.modules,
        {
          id: "detail",
          name: "补充详情",
          purpose: "落实客户新增内容",
          content: ["详细说明", "补充数据"],
          sampleData: [{ label: "补充项", value: "完整示例" }],
          interactions: ["展开补充详情"],
          presentation: "详情卡片",
        },
      ],
      revisionNotes: { added: ["补充详情模块"], changed: [], retained: ["核心内容"] },
      acceptanceCriteria: [...base.acceptanceCriteria, "补充详情可展开查看"],
    };
  }
  async createProjectDesign(): Promise<SolutionIR> {
    if (this.invalidDesign) {
      // Malformed design (wrong schema version) a real LLM could emit.
      return { schema: "kf-solution-ir/v0" } as unknown as SolutionIR;
    }
    return {
      schema: "kf-solution-ir/v1",
      solutionId: solutionId("sol-1"),
      displayName: "设计",
      projects: [],
      dependencies: [],
      pendingRequirements: [],
    };
  }

  async createUiImplementation(input: ModelPortContext): Promise<UIImplementationSpec> {
    this.implementationCreateCalls.push(input);
    return this.makeImplementation(input, "new");
  }

  async reviseUiImplementation(input: ModelPortContext): Promise<UIImplementationSpec> {
    this.implementationReviseCalls.push(input);
    return this.makeImplementation(input, "rev");
  }

  async createModulePlan(): Promise<never> {
    throw new Error("module planning is not exercised by the legacy graph fixture");
  }

  async reviseModulePlan(): Promise<never> {
    throw new Error("module planning is not exercised by the legacy graph fixture");
  }

  async createSolutionImplementationPlan(input: ModelPortContext): Promise<SolutionImplementationPlan> {
    this.solutionCreateCalls.push(input);
    return creativeImplementationPlan(input);
  }

  async reviseSolutionImplementationSubtree(input: ModelPortContext): Promise<SolutionImplementationPlan> {
    this.solutionReviseCalls.push(input);
    return creativeImplementationPlan(input);
  }

  async createChangePlan(input: ModelPortContext): Promise<ChangePlan> {
    this.createCalls.push(input);
    return this.recordPlan(this.makePlan(input.workspaceId, "new"));
  }
  async reviseChangePlan(input: ModelPortContext): Promise<ChangePlan> {
    this.reviseCalls.push(input);
    return this.recordPlan(this.makePlan(input.workspaceId, "rev"));
  }  async explainValidation(): Promise<string> {
    return "校验通过";
  }

  private recordPlan(plan: ChangePlan): ChangePlan {
    this.createdPlans.push(plan);
    if (this.invalidPlan) {
      // Shape-valid but schema-invalid: the graph must reject it.
      return { ...plan, schema: "kf-change-plan/v0" } as unknown as ChangePlan;
    }
    return plan;
  }

  private makePlan(workspaceId: string, tag: string): ChangePlan {
    this.seq += 1;
    const entityId = deriveGuid({ seed: workspaceId }, `Text${this.seq}`);
    return {
      schema: "kf-change-plan/v1",
      workspaceId,
      operations: [
        {
          op: "update",
          entityId,
          entityType: "text",
          changes: [{ path: "/text", value: `${tag}-${this.seq}` }],
        },
      ],
    };
  }

  private makeImplementation(input: ModelPortContext, tag: string): UIImplementationSpec {
    this.implementationSeq += 1;
    const moduleIds = input.designPlan?.schema === "kf-design-plan/v2"
      ? input.designPlan.modules.map((module) => module.id)
      : ["main"];
    return {
      schema: "kf-ui-implementation/v1",
      theme: {
        background: "#0f172a",
        surface: "#111827",
        primary: "#2563eb",
        accent: "#38bdf8",
        textPrimary: "#f8fafc",
        textSecondary: "#cbd5e1",
        fontFamily: "Arial",
        spacingUnit: 8,
        radiusScale: { small: 4, medium: 8, large: 16 },
      },
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
          content: `${tag}-${this.implementationSeq}-${sourceModuleId}`,
          geometry: { x: 60, y: 60 + index * 80, width: 320, height: 40 },
          properties: {},
          style: { declarations: { fontSize: 24 }, states: {} },
        })),
      }],
    };
  }
}

function creativeBlueprint(): CustomerSolutionBlueprint {
  return {
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
}

function creativeImplementationPlan(input: ModelPortContext): SolutionImplementationPlan {
  const blueprint = input.confirmedSolutionBlueprint!;
  const candidates = input.capabilityCandidates!;
  const controlId = candidates.regions[0]!.controls[0]!.id;
  const intent = {
    importance: "primary" as const,
    visualWeight: 4,
    readingOrder: 0,
    density: "comfortable" as const,
    groupWith: [],
    width: { mode: "fill" as const },
    height: { mode: "content" as const },
    align: "stretch" as const,
  };
  return {
    schema: "kf-solution-implementation/v1",
    projectKey: "visitor-center",
    blueprintHash: canonicalServerHash(blueprint),
    candidateBundleHash: canonicalServerHash(candidates),
    theme: {
      background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32",
      textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8,
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
      sourceBlueprintPageId: "visitor-overview",
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
          capabilityId: controlId,
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

interface Bed {
  deps: SolutionGraphDeps;
  graph: CompiledGraph;
  workspace: FakeWorkspaceQuery;
  repo: FakeChangePlanRepository;
  builds: FakeBuildJobPort;
  model: FakeModelPort;
  capabilityRetrievalCalls: CustomerSolutionBlueprint[];
  assetCatalogCalls: Array<{ tenantId: string; workspaceId: string }>;
}

function createBed(): Bed {
  const workspace = new FakeWorkspaceQuery();
  const repo = new FakeChangePlanRepository();
  const builds = new FakeBuildJobPort();
  const model = new FakeModelPort();
  const capabilityRetrievalCalls: CustomerSolutionBlueprint[] = [];
  const assetCatalogCalls: Array<{ tenantId: string; workspaceId: string }> = [];
  const capabilityReport: CapabilityReport = {
    status: "warning",
    full: [],
    partial: ["text"],
    unsupported: [],
    deliveryGaps: [],
  };
  const deps: SolutionGraphDeps = {
    modelPort: model,
    workspaceQuery: workspace,
    changePlanRepository: repo,
    buildJobPort: builds,
    uiImplementationCompiler: {
      async compile({ workspaceId, spec }) {
        const plan: ChangePlan = {
          schema: "kf-change-plan/v1",
          workspaceId,
          operations: spec.pages.flatMap((page) => page.components.map((component) => ({
            op: "create" as const,
            entityType: "control",
            entityId: component.id,
            properties: {
              pageId: `page-${page.id}`,
              type: component.capabilityId,
              text: component.content,
            },
          }))),
        };
        if (model.invalidPlan) {
          return { plan: { ...plan, schema: "kf-change-plan/v0" } as unknown as ChangePlan, capabilityReport };
        }
        return { plan, capabilityReport };
      },
    },
    serverPlanSigner: TEST_SERVER_PLAN_SIGNER,
    capabilityRetrieval: {
      async retrieve({ blueprint }) {
        capabilityRetrievalCalls.push(blueprint);
        return retrieveCapabilities({ blueprint, knowledge: getDesignKnowledgeSnapshot() });
      },
    },
    assetCatalog: {
      async list(input) {
        assetCatalogCalls.push(input);
        return [];
      },
    },
    isDomainSupported: () => true,
  };
  const graph = compileSolutionGraph(deps, { checkpointer: new MemorySaver() });
  return { deps, graph, workspace, repo, builds, model, capabilityRetrievalCalls, assetCatalogCalls };
}

interface Ctx {
  tenantId: string;
  userId: string;
  workspaceId: string;
  conversationId: string;
}

const TENANT_ID = "tenant-1";
const USER_ID = "user-1";
const WORKSPACE_ID = "ws-1";
const CONVERSATION_ID = "conv-1";
const REVISION_1 = "rev-1";

function seed(bed: Bed, revisionId = REVISION_1): Ctx {
  bed.workspace.currentRevision.set(WORKSPACE_ID, revisionId);
  bed.workspace.revisionSummaries.set(revisionId, "页面 Page1；控件 Text1");
  return {
    tenantId: TENANT_ID,
    userId: USER_ID,
    workspaceId: WORKSPACE_ID,
    conversationId: CONVERSATION_ID,
  };
}

function config(ctx: Ctx) {
  return { configurable: { thread_id: ctx.conversationId } };
}

function input(ctx: Ctx) {
  return {
    tenantId: ctx.tenantId,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    conversationId: ctx.conversationId,
    stage: "idle" as const,
    recentMessages: [] as GraphMessage[],
  };
}

async function sendUser(bed: Bed, ctx: Ctx, text: string): Promise<void> {
  await bed.workspace.appendMessage({
    tenantId: ctx.tenantId,
    conversationId: ctx.conversationId,
    role: "user",
    content: text,
  });
}

async function interruptPayload(bed: Bed, ctx: Ctx): Promise<ApprovalInterrupt | undefined> {
  // Under vitest's module transform an invoke() result whose return value is
  // never referenced can let the final checkpoint flush be skipped, so the
  // interrupt write is not visible to getState(). Tests therefore keep the
  // invoke result referenced (`const r = await ...; void r;`). This helper
  // polls a few times as a defensive fallback.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const snapshot = await bed.graph.getState(config(ctx));
    const values = snapshot.tasks.flatMap((task) => task.interrupts.map((item) => item.value));
    if (values.length > 0) return values[0] as ApprovalInterrupt | undefined;
    await new Promise((resolve) => setImmediate(resolve));
  }
  return undefined;
}

/** Runs a NEW_REQUIREMENT turn up to the approval interrupt. */
async function planNewRequirement(bed: Bed, ctx: Ctx, text: string): Promise<ApprovalInterrupt> {
  // Two-pass flow (spec §5): a first requirement must go through the design
  // plan first, then CONFIRM_DESIGN routes into plan-change.
  bed.model.queueIntent("NEW_REQUIREMENT");
  await sendUser(bed, ctx, text);
  await bed.graph.invoke(input(ctx), config(ctx));
  bed.model.queueIntent("CONFIRM_DESIGN");
  await sendUser(bed, ctx, "确认");
  await bed.graph.invoke(input(ctx), config(ctx));
  const payload = await interruptPayload(bed, ctx);
  if (payload === undefined) throw new Error("expected an approval interrupt");
  return payload;
}

async function approve(bed: Bed, ctx: Ctx, payload: ApprovalInterrupt) {
  return bed.graph.invoke(
    new Command({ resume: { action: "approve", planHash: payload.planHash } }),
    config(ctx),
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SolutionGraph single-agent workflow (unit, MemorySaver)", () => {
  it("runs creative-v2 as exactly blueprint plus semantic-plan calls and stops without build authorization", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    bed.workspace.routing.set(WORKSPACE_ID, { mode: "new", generationWorkflow: "creative-v2" });

    bed.model.queueIntent("NEW_REQUIREMENT");
    await sendUser(bed, ctx, "创建园区访客协同中心");
    const design = await bed.graph.invoke(input(ctx), config(ctx));
    expect(design).toMatchObject({ stage: "design-review", designPlan: creativeBlueprint() });

    bed.model.queueIntent("CONFIRM_DESIGN");
    await sendUser(bed, ctx, "确认设计");
    const planned = await bed.graph.invoke(input(ctx), config(ctx));

    expect(planned).toMatchObject({
      stage: "solution-plan-ready",
      solutionPlanRepairAttempt: 0,
      lastErrorCode: undefined,
    });
    expect(bed.model.designCalls).toHaveLength(1);
    expect(bed.model.solutionCreateCalls).toHaveLength(1);
    expect(bed.model.solutionReviseCalls).toHaveLength(0);
    expect(bed.capabilityRetrievalCalls).toEqual([creativeBlueprint()]);
    expect(bed.assetCatalogCalls).toEqual([{ tenantId: TENANT_ID, workspaceId: WORKSPACE_ID }]);
    expect(bed.builds.enqueues).toHaveLength(0);
    expect(planned.changePlanId).toBeUndefined();
    expect(planned.planHash).toBeUndefined();
    expect(planned.buildAuthorization).toBeUndefined();
    expect(planned.buildJobId).toBeUndefined();
    expect(planned.previewArtifactId).toBeUndefined();
  });

  it("keeps every later creative-v2 intent in design review or terminal without legacy approval or build side effects", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    bed.workspace.routing.set(WORKSPACE_ID, { mode: "new", generationWorkflow: "creative-v2" });

    bed.model.queueIntent("NEW_REQUIREMENT");
    await sendUser(bed, ctx, "创建园区访客协同中心");
    await bed.graph.invoke(input(ctx), config(ctx));
    bed.model.queueIntent("CONFIRM_DESIGN");
    await sendUser(bed, ctx, "确认设计");
    const ready = await bed.graph.invoke(input(ctx), config(ctx));
    expect(ready.stage).toBe("solution-plan-ready");

    for (const [intent, message, expectedStage] of [
      ["CONFIRM_PLAN", "批准工程计划", "idle"],
      ["BUILD", "立即开始构建", "idle"],
      ["NEW_REQUIREMENT", "新增到访统计页", "design-review"],
      ["MODIFY_REQUIREMENT", "把审核旅程改得更清晰", "design-review"],
    ] as const) {
      bed.model.queueIntent(intent);
      await sendUser(bed, ctx, message);
      const result = await bed.graph.invoke(input(ctx), config(ctx));
      expect(result.stage).toBe(expectedStage);
      expect(result.changePlanId).toBeUndefined();
      expect(result.planHash).toBeUndefined();
      expect(result.activeChangeRequestId).toBeUndefined();
      expect(result.buildAuthorization).toBeUndefined();
      expect(result.buildJobId).toBeUndefined();
      expect(result.previewArtifactId).toBeUndefined();
      expect(result.lastErrorCode).toBeUndefined();
    }

    expect(bed.model.createCalls).toHaveLength(0);
    expect(bed.model.reviseCalls).toHaveLength(0);
    expect(bed.repo.requests.size).toBe(0);
    expect(bed.repo.plans.size).toBe(0);
    expect(bed.repo.statusCalls).toHaveLength(0);
    expect(bed.builds.enqueues).toHaveLength(0);
    expect(await interruptPayload(bed, ctx)).toBeUndefined();
  });

  it("routes an ordinary question to idle without planning or building", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    bed.model.queueIntent("QUESTION");
    await sendUser(bed, ctx, "你好，介绍一下这个工程");

    const result = await bed.graph.invoke(input(ctx), config(ctx));

    expect(result.intent).toBe("QUESTION");
    expect(result.stage).toBe("idle");
    expect(bed.model.createCalls).toHaveLength(0);
    expect(bed.builds.enqueues).toHaveLength(0);
    expect(bed.workspace.appendCalls).toContainEqual(
      expect.objectContaining({ role: "assistant", content: "reply:QUESTION" }),
    );
  });

  it("clarifies with a question+options, bumps the count, and never plans", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    bed.model.queueIntent("CLARIFY");
    await sendUser(bed, ctx, "生成一个监控大屏");

    const result = await bed.graph.invoke(input(ctx), config(ctx));

    expect(result.intent).toBe("CLARIFY");
    expect(result.clarificationCount).toBe(1);
    expect(result.stage).toBe("idle");
    expect(bed.model.createCalls).toHaveLength(0);
    expect(bed.builds.enqueues).toHaveLength(0);
    expect(bed.workspace.appendCalls).toContainEqual(
      expect.objectContaining({
        role: "assistant",
        content: expect.stringContaining("主题是哪种"),
      }),
    );
  });

  it("plans a new requirement and stops at the approval interrupt with the verbatim payload", async () => {
    const bed = createBed();
    const ctx = seed(bed);

    const payload = await planNewRequirement(bed, ctx, "新增一个输入框");

    expect(payload.type).toBe("plan-approval");
    expect(payload.changeRequestId).toBe(`cr:${WORKSPACE_ID}:${CONVERSATION_ID}`);
    expect(payload.planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(payload.summary).toContain("计划包含");
    expect(payload.diffArtifactId).toBeUndefined();
    expect(payload.previewArtifactId).toBeUndefined();
    expect(bed.model.implementationCreateCalls).toHaveLength(1);
    expect(bed.model.implementationCreateCalls[0]?.currentRevisionId).toBe(REVISION_1);
    expect(bed.repo.plans.size).toBe(1);
    expect(bed.repo.statusOf(`cr:${WORKSPACE_ID}:${CONVERSATION_ID}`)).toBe("OPEN");
  });

  it("routes a confirmed blueprint through UI implementation compilation instead of model-authored ChangePlan", async () => {
    const bed = createBed();
    const ctx = seed(bed);

    await planNewRequirement(bed, ctx, "新增一个输入框");

    expect(bed.model.implementationCreateCalls).toHaveLength(1);
    expect(bed.model.createCalls).toHaveLength(0);
    const stored = [...bed.repo.plans.values()][0];
    expect((stored?.plan as { plan: ChangePlan }).plan.operations).toEqual(expect.arrayContaining([
      expect.objectContaining({ entityId: "main-title" }),
    ]));
  });

  it("re-plans on a revise resume and interrupts again with a different planHash", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const first = await planNewRequirement(bed, ctx, "新增一个按钮");

    await bed.graph.invoke(
      new Command({ resume: { action: "revise", planHash: first.planHash } }),
      config(ctx),
    );
    const second = await interruptPayload(bed, ctx);

    expect(bed.model.implementationReviseCalls).toHaveLength(1);
    expect(second?.planHash).toBeDefined();
    expect(second?.planHash).not.toBe(first.planHash);
    expect(second?.changeRequestId).toBe(first.changeRequestId);
    expect(bed.builds.enqueues).toHaveLength(0);
  });

  it("cancels the change request on a cancel resume (rejection)", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");

    const result = await bed.graph.invoke(
      new Command({ resume: { action: "cancel", planHash: payload.planHash } }),
      config(ctx),
    );

    expect(result.stage).toBe("idle");
    expect(bed.repo.statusOf(payload.changeRequestId)).toBe("CLOSED");
    expect(bed.builds.enqueues).toHaveLength(0);
  });

  it("fails an approve resume whose planHash does not match, without side effects", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");

    const result = await bed.graph.invoke(
      new Command({ resume: { action: "approve", planHash: "deadbeef" } }),
      config(ctx),
    );

    expect(result.lastErrorCode).toBe("PLAN_HASH_MISMATCH");
    expect(result.stage).toBe("idle");
    expect(bed.builds.enqueues).toHaveLength(0);
    expect(bed.repo.statusOf(payload.changeRequestId)).toBe("OPEN");
    expect(bed.repo.statusCalls).toHaveLength(0);
  });

  it("rejects a BUILD intent without an approved plan and never enqueues", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    bed.model.queueIntent("BUILD");
    await sendUser(bed, ctx, "开始构建");

    const result = await bed.graph.invoke(input(ctx), config(ctx));

    expect(result.lastErrorCode).toBe("BUILD_REQUIRES_APPROVAL");
    expect(result.stage).toBe("idle");
    expect(bed.builds.enqueues).toHaveLength(0);
    expect(bed.repo.statusCalls).toHaveLength(0);
  });

  it("enqueues the build after an approve resume and marks the request APPROVED", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");

    const result = await approve(bed, ctx, payload);

    expect(bed.builds.enqueues).toHaveLength(1);
    expect(bed.builds.enqueues[0]).toMatchObject({
      tenantId: TENANT_ID,
      workspaceId: WORKSPACE_ID,
      baseRevisionId: REVISION_1,
      changePlanId: `plan:${WORKSPACE_ID}:${payload.planHash}`,
      planHash: payload.planHash,
      projectKey: "kingclient",
      domainKind: "kingclient",
      idempotencyKey:
        `${CONVERSATION_ID}:plan:${WORKSPACE_ID}:${payload.planHash}:${payload.planHash}`,
    });
    expect(result.buildJobId).toBe("job-1");
    expect(result.stage).toBe("building");
    expect(bed.repo.statusOf(payload.changeRequestId)).toBe("APPROVED");
  });

  it("scopes the idempotency key for a non-default project", async () => {
    const bed = createBed();
    bed.deps.defaultDomainKind = "kingcalculation";
    bed.deps.defaultProjectKey = "calculation-primary";
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个计算项目");

    await approve(bed, ctx, payload);

    expect(bed.builds.enqueues[0]?.idempotencyKey).toBe(
      `${CONVERSATION_ID}:calculation-primary:plan:${WORKSPACE_ID}:${payload.planHash}:${payload.planHash}`,
    );
  });

  it("canonicalizes a spaced project key before constructing the scoped idempotency key", async () => {
    const bed = createBed();
    bed.deps.defaultDomainKind = "kingcalculation";
    bed.deps.defaultProjectKey = " calc ";
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个计算项目");

    await approve(bed, ctx, payload);

    expect(bed.builds.enqueues[0]).toMatchObject({
      domainKind: "kingcalculation",
      projectKey: "calc",
      idempotencyKey:
        `${CONVERSATION_ID}:calc:plan:${WORKSPACE_ID}:${payload.planHash}:${payload.planHash}`,
    });
  });

  it("canonicalizes a spaced kingclient key before selecting the legacy idempotency key", async () => {
    const bed = createBed();
    bed.deps.defaultDomainKind = " kingclient ";
    bed.deps.defaultProjectKey = " kingclient ";
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");

    await approve(bed, ctx, payload);

    expect(bed.builds.enqueues[0]).toMatchObject({
      domainKind: "kingclient",
      projectKey: "kingclient",
      idempotencyKey:
        `${CONVERSATION_ID}:plan:${WORKSPACE_ID}:${payload.planHash}:${payload.planHash}`,
    });
  });

  it("enters preview review only after build success; CONFIRM_BUILD then lands", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");

    const built = await approve(bed, ctx, payload);

    expect(built.stage).toBe("building");
    expect(built.buildJobId).toBe("job-1");
    expect(bed.workspace.appendCalls).toContainEqual(
      expect.objectContaining({
        role: "assistant",
        content: expect.stringContaining("构建任务已提交"),
      }),
    );

    bed.builds.setStatus("job-1", "SUCCEEDED");

    // 预览反馈循环：用户确认落地 → 终态 done
    bed.model.queueIntent("CONFIRM_BUILD");
    await sendUser(bed, ctx, "确认落地");
    const landed = await bed.graph.invoke(
      { ...input(ctx), stage: "building" },
      config(ctx),
    );

    expect(landed.stage).toBe("done");
    // done 节点追加落地致谢消息（温和专业风）。
    expect(bed.workspace.appendCalls).toContainEqual(
      expect.objectContaining({
        role: "assistant",
        content: "方案已确认落地。感谢您的沟通！后续如需继续调整或新增需求，随时找我。",
      }),
    );
  });

  it("does not claim delivery while the tracked build is still queued", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");
    const queued = await approve(bed, ctx, payload);
    expect(queued.buildJobId).toBe("job-1");

    bed.model.queueIntent("CONFIRM_BUILD");
    await sendUser(bed, ctx, "确认落地");
    const result = await bed.graph.invoke({ ...input(ctx), stage: "building" }, config(ctx));

    expect(result.stage).toBe("building");
    expect(result.buildConfirmed).not.toBe(true);
    expect(result.lastErrorCode).toBeUndefined();
    expect(bed.workspace.appendCalls).toContainEqual(expect.objectContaining({
      content: expect.stringContaining("仍在构建和校验中"),
    }));
    expect(bed.workspace.appendCalls).not.toContainEqual(expect.objectContaining({
      content: expect.stringContaining("方案已确认落地"),
    }));
  });

  it("does not claim delivery when CONFIRM_BUILD arrives before any preview exists", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    bed.model.queueIntent("CONFIRM_BUILD");
    await sendUser(bed, ctx, "生成预览");

    const result = await bed.graph.invoke({ ...input(ctx), stage: "building" }, config(ctx));

    expect(result.stage).toBe("idle");
    expect(result.buildConfirmed).not.toBe(true);
    expect(result.lastErrorCode).toBe("BUILD_PREVIEW_NOT_AVAILABLE");
    expect(bed.workspace.appendCalls).toContainEqual(expect.objectContaining({
      role: "assistant",
      content: expect.stringContaining("还没有可确认的工程预览"),
    }));
    expect(bed.workspace.appendCalls).not.toContainEqual(expect.objectContaining({
      content: expect.stringContaining("方案已确认落地"),
    }));
  });

  it("revises the design instead of creating a ChangePlan when requirements are added during design review", async () => {
    const bed = createBed();
    const ctx = seed(bed);

    bed.model.queueIntent("NEW_REQUIREMENT");
    await sendUser(bed, ctx, "个人简历网站");
    const first = await bed.graph.invoke(input(ctx), config(ctx));
    expect(first.stage).toBe("design-review");
    expect(first.designRevision).toBe(1);
    expect(first.designPlan?.schema).toBe("kf-design-plan/v2");
    if (first.designPlan?.schema !== "kf-design-plan/v2") {
      throw new Error("expected a complete first customer effect blueprint");
    }
    expect(first.designPlan.overview.objective.length).toBeGreaterThan(10);
    expect(first.designPlan.modules[0]?.sampleData.length).toBeGreaterThan(0);
    expect(first.designPlan.acceptanceCriteria.length).toBeGreaterThan(0);

    bed.model.queueIntent("MODIFY_REQUIREMENT");
    await sendUser(
      bed,
      ctx,
      "我希望有我的产品，项目经历，可以使用假的数据占位，但是内容要充实",
    );
    const second = await bed.graph.invoke(
      { ...input(ctx), stage: first.stage },
      config(ctx),
    );

    expect(second.stage).toBe("design-review");
    expect(second.designRevision).toBe(2);
    if (second.designPlan?.schema !== "kf-design-plan/v2") {
      throw new Error("expected a revised customer effect blueprint");
    }
    expect(second.designPlan.modules.map((module) => module.name)).toEqual(
      expect.arrayContaining(["我的产品", "项目经历"]),
    );
    const products = second.designPlan.modules.find((module) => module.name === "我的产品");
    const projects = second.designPlan.modules.find((module) => module.name === "项目经历");
    expect(products?.sampleData.length).toBeGreaterThan(0);
    expect(projects?.content).toEqual(
      expect.arrayContaining(["项目背景", "个人职责", "解决方案", "量化成果"]),
    );
    expect(second.designPlan.revisionNotes.added).toContain("新增独立的我的产品模块");
    expect(second.designPlan.acceptanceCriteria).toContain(
      "至少展示两个产品案例和三个包含背景、职责、方案、成果的项目案例",
    );
    expect(bed.repo.requests.size).toBe(0);
    expect(bed.repo.plans.size).toBe(0);
    expect(bed.builds.enqueues).toHaveLength(0);
  });

  it("preview feedback REVISE_DESIGN routes back to design-plan (designRevision+1)", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");
    await approve(bed, ctx, payload);

    bed.model.queueIntent("REVISE_DESIGN");
    await sendUser(bed, ctx, "改成浅色风格");
    const result = await bed.graph.invoke(
      { ...input(ctx), stage: "preview-review" },
      config(ctx),
    );

    expect(result.stage).toBe("design-review");
    // 两遍流程第一遍已产出设计 v1；预览反馈修订 → v2
    expect(result.designRevision).toBe(2);
  });

  it("preview feedback MODIFY_REQUIREMENT routes back to plan-change", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");
    await approve(bed, ctx, payload);

    bed.model.queueIntent("MODIFY_REQUIREMENT");
    await sendUser(bed, ctx, "把按钮放大一点");
    const held = await bed.graph.invoke(
      { ...input(ctx), stage: "preview-review" },
      config(ctx),
    );
    void held;
    const next = await interruptPayload(bed, ctx);

    expect(next).toBeDefined();
    expect(next?.type).toBe("plan-approval");
    expect(bed.model.implementationReviseCalls).toHaveLength(1);
  });

  it("keeps legacy v1 design checkpoints on the direct ChangePlan compatibility path", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    bed.model.queueIntent("CONFIRM_DESIGN");
    await sendUser(bed, ctx, "确认");

    const held = await bed.graph.invoke({
      ...input(ctx),
      designPlan: {
        schema: "kf-design-plan/v1",
        displayName: "旧版设计",
        summary: "旧版持久化计划",
        layoutConcept: "单页",
        styleDirection: "简洁",
        sections: [{ id: "main", label: "主体", controls: [{ type: "text", text: "标题" }] }],
        signature: "legacy",
      },
      designPlanHash: "legacy-plan-hash",
    }, config(ctx));
    expect(held).toMatchObject({ stage: "approval" });

    expect(await interruptPayload(bed, ctx)).toBeDefined();
    expect(bed.model.createCalls).toHaveLength(1);
    expect(bed.model.implementationCreateCalls).toHaveLength(0);
    expect(bed.model.implementationReviseCalls).toHaveLength(0);
  });

  it("preview feedback is re-classified by keywords when the model disagrees (preview-review fallback)", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");
    await approve(bed, ctx, payload);
    bed.builds.setStatus("job-1", "SUCCEEDED");

    // 模型把"确认落地"分类成 QUESTION，但预览阶段的确认词兜底为 CONFIRM_BUILD
    bed.model.queueIntent("QUESTION");
    await sendUser(bed, ctx, "确认落地");
    const result = await bed.graph.invoke(
      { ...input(ctx), stage: "preview-review" },
      config(ctx),
    );

    expect(result.stage).toBe("done");
  });

  it("does not land when a confirm-prefixed message asks for a small change (P2-3)", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");
    await approve(bed, ctx, payload);

    // "好的，把按钮再放大一点" 含确认前缀但意图是修改：不得被终结为落地。
    bed.model.queueIntent("QUESTION");
    await sendUser(bed, ctx, "好的，把按钮再放大一点");
    const result = await bed.graph.invoke(
      { ...input(ctx), stage: "preview-review" },
      config(ctx),
    );

    expect(result.stage).not.toBe("done");
  });

  it("keeps a pending approval resumable when a non-resume message arrives", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");

    // A plain (non-resume) message while paused must be rejected, not silently
    // turn the approval into idle.
    const assistantBefore = bed.workspace.appendCalls.filter(
      (call) => call.role === "assistant",
    ).length;
    bed.model.queueIntent("QUESTION");
    await sendUser(bed, ctx, "还在吗");
    await expect(bed.graph.invoke(input(ctx), config(ctx))).rejects.toThrow(
      ApprovalResumeRequiredError,
    );

    // The rejected plain message produced no additional assistant reply.
    expect(
      bed.workspace.appendCalls.filter((call) => call.role === "assistant"),
    ).toHaveLength(assistantBefore);

    // The pending approval is intact: the exact planHash resume still enqueues.
    const result = await bed.graph.invoke(
      new Command({ resume: { action: "approve", planHash: payload.planHash } }),
      config(ctx),
    );
    expect(result.buildJobId).toBe("job-1");
    expect(bed.builds.enqueues).toHaveLength(1);
    expect(bed.repo.statusOf(payload.changeRequestId)).toBe("APPROVED");
  });

  it("returns to planning when the enqueued build failed", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");
    await approve(bed, ctx, payload);
    const jobId = bed.builds.created[0]?.id;
    if (jobId === undefined) throw new Error("expected an enqueued job");
    bed.builds.setStatus(jobId, "FAILED");

    // The next turn re-enters the workflow with no new user requirement.
    bed.model.queueIntent("CONFIRM_PLAN");
    const result = await bed.graph.invoke({ ...input(ctx), stage: "building" }, config(ctx));

    expect(result.stage).toBe("planning");
    expect(result.lastErrorCode).toBe("BUILD_FAILED");
    expect(result.buildJobId).toBe(jobId);
  });

  it("refreshes the current revision after a successful build", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");
    await approve(bed, ctx, payload);
    const jobId = bed.builds.created[0]?.id;
    if (jobId === undefined) throw new Error("expected an enqueued job");

    bed.workspace.currentRevision.set(WORKSPACE_ID, "rev-2");
    bed.workspace.revisionSummaries.set("rev-2", "页面 Page1（已更新）");
    bed.builds.setStatus(jobId, "SUCCEEDED");

    bed.model.queueIntent("QUESTION");
    await sendUser(bed, ctx, "构建完成了吗？");
    const result = await bed.graph.invoke({ ...input(ctx), stage: "building" }, config(ctx));

    expect(result.stage).toBe("idle");
    expect(result.currentRevisionId).toBe("rev-2");
    expect(result.lastErrorCode).toBeUndefined();
  });

  it("plans a new requirement against the latest revision after a successful build", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");
    await approve(bed, ctx, payload);
    const jobId = bed.builds.created[0]?.id;
    if (jobId === undefined) throw new Error("expected an enqueued job");

    bed.workspace.currentRevision.set(WORKSPACE_ID, "rev-2");
    bed.workspace.revisionSummaries.set("rev-2", "页面 Page1（已更新）");
    bed.builds.setStatus(jobId, "SUCCEEDED");

    bed.model.queueIntent("NEW_REQUIREMENT");
    await sendUser(bed, ctx, "再新增一个文本框");
    await bed.graph.invoke(input(ctx), config(ctx));
    const second = await interruptPayload(bed, ctx);

    expect(bed.model.implementationCreateCalls).toHaveLength(1);
    expect(bed.model.implementationReviseCalls).toHaveLength(1);
    expect(bed.model.implementationReviseCalls[0]?.currentRevisionId).toBe("rev-2");
    expect(second).toBeDefined();
    expect(second?.planHash).not.toBe(payload.planHash);
  });

  it("rejects an invalid compiled plan with UI_IMPLEMENTATION_INVALID and no side effects", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    bed.model.queueIntent("NEW_REQUIREMENT");
    await sendUser(bed, ctx, "新增一个按钮");
    await bed.graph.invoke(input(ctx), config(ctx));

    // 两遍流程：确认设计后进入 plan-change，此时 invalidPlan 触发 I1 防护。
    bed.model.queueIntent("CONFIRM_DESIGN");
    bed.model.invalidPlan = true;
    await sendUser(bed, ctx, "确认");
    const result = await bed.graph.invoke(input(ctx), config(ctx));

    expect(result.lastErrorCode).toBe("UI_IMPLEMENTATION_INVALID:compiled ChangePlan failed schema validation");
    expect(result.stage).toBe("idle");
    expect(bed.repo.plans.size).toBe(0);
    expect(bed.builds.enqueues).toHaveLength(0);
    // 两遍流程里 design-plan 已展示客户效果蓝图（流程预期的 assistant 消息）；
    // 校验失败阶段（CONFIRM_DESIGN 后的 plan-change）不得再新增 assistant 消息。
    const planShown = bed.workspace.appendCalls.some(
      (call) => call.role === "assistant" && decodeBlueprintMessage(call.content) !== null,
    );
    expect(planShown).toBe(true);
  });

  it("clears a stale UI implementation error when a later implementation succeeds", async () => {
    // 回归：plan-change 失败（INVALID_MODEL_OUTPUT）后残留错误码会阻断
    // 下一次成功的 plan-change 进入 approval（approval 节点检查 lastErrorCode）。
    // 修复：plan-change 成功返回必须清除 lastErrorCode。
    const bed = createBed();
    const ctx = seed(bed);
    bed.model.queueIntent("NEW_REQUIREMENT");
    await sendUser(bed, ctx, "新增一个按钮");
    await bed.graph.invoke(input(ctx), config(ctx));

    // 第一次 plan-change 失败（残留 INVALID_MODEL_OUTPUT）
    bed.model.queueIntent("CONFIRM_DESIGN");
    bed.model.invalidPlan = true;
    await sendUser(bed, ctx, "确认");
    const failed = await bed.graph.invoke(input(ctx), config(ctx));
    expect(failed.lastErrorCode).toBe("UI_IMPLEMENTATION_INVALID:compiled ChangePlan failed schema validation");

    // 第二次 plan-change 成功：必须清除错误码并进入 approval 中断
    bed.model.invalidPlan = false;
    bed.model.queueIntent("CONFIRM_DESIGN");
    await sendUser(bed, ctx, "确认");
    const ok = await bed.graph.invoke(input(ctx), config(ctx));
    expect(ok.lastErrorCode).toBeUndefined();
    expect(ok.stage).toBe("approval");
    const interrupt = await interruptPayload(bed, ctx);
    expect(interrupt?.type).toBe("plan-approval");
  });

  it("rejects an invalid model intent with INVALID_MODEL_OUTPUT and no side effects (I1)", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    bed.model.invalidIntent = true;
    await sendUser(bed, ctx, "随便说点什么");

    const result = await bed.graph.invoke(input(ctx), config(ctx));

    expect(result.lastErrorCode).toBe("INVALID_MODEL_OUTPUT");
    expect(result.stage).toBe("idle");
    // Garbage intent must not route anywhere: no plan, no build, no reply.
    expect(bed.model.createCalls).toHaveLength(0);
    expect(bed.repo.plans.size).toBe(0);
    expect(bed.builds.enqueues).toHaveLength(0);
    expect(bed.workspace.appendCalls.filter((call) => call.role === "assistant")).toHaveLength(0);
  });

  it("requires a base revision before compiling a confirmed implementation", async () => {
    const bed = createBed();
    // Brand-new workspace: no current revision yet → createProjectDesign path.
    const ctx: Ctx = {
      tenantId: TENANT_ID,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
    };
    bed.model.queueIntent("NEW_REQUIREMENT");
    await sendUser(bed, ctx, "请新建一个工程");
    await bed.graph.invoke(input(ctx), config(ctx));

    // 两遍流程：确认设计后进入 plan-change（无 revision → createProjectDesign），
    // 此时 invalidDesign 触发 I1 防护。
    bed.model.queueIntent("CONFIRM_DESIGN");
    bed.model.invalidDesign = true;
    await sendUser(bed, ctx, "确认");
    const result = await bed.graph.invoke(input(ctx), config(ctx));

    expect(result.lastErrorCode).toBe("IMPLEMENTATION_BASE_REVISION_REQUIRED");
    expect(result.stage).toBe("idle");
    // No fabricated "initial design created" summary and no plan/build.
    expect(bed.workspace.summaries.size).toBe(0);
    expect(bed.repo.plans.size).toBe(0);
    expect(bed.builds.enqueues).toHaveLength(0);
  });

  it("records pendingRequirements for unsupported domains and never enqueues a build", async () => {
    const bed = createBed();
    bed.deps.isDomainSupported = () => false;
    const ctx = seed(bed);
    bed.model.queueIntent("NEW_REQUIREMENT");
    await sendUser(bed, ctx, "接入外部 ERP 系统");

    const result = await bed.graph.invoke(input(ctx), config(ctx));

    expect(result.lastErrorCode).toBe("UNSUPPORTED_DOMAIN");
    expect(result.stage).toBe("idle");
    expect(result.pendingRequirements).toEqual([
      { text: "接入外部 ERP 系统", requestedDomains: ["kingclient"] },
    ]);
    expect(bed.model.createCalls).toHaveLength(0);
    expect(bed.builds.enqueues).toHaveLength(0);
  });

  it("isolates pendingRequirements across alternating unsupported/supported turns", async () => {
    const bed = createBed();
    const ctx = seed(bed);

    // Round 1: unsupported → idle with pendingRequirements.
    bed.deps.isDomainSupported = () => false;
    bed.model.queueIntent("NEW_REQUIREMENT");
    await sendUser(bed, ctx, "接入外部 ERP 系统");
    const r1 = await bed.graph.invoke(input(ctx), config(ctx));
    expect(r1.lastErrorCode).toBe("UNSUPPORTED_DOMAIN");
    expect(r1.pendingRequirements).toHaveLength(1);

    // Round 2: supported NEW_REQUIREMENT must plan and interrupt again — the
    // stale pendingRequirements from round 1 must not gate this turn (C1).
    bed.deps.isDomainSupported = () => true;
    bed.model.queueIntent("NEW_REQUIREMENT");
    await sendUser(bed, ctx, "新增一个按钮");
    await bed.graph.invoke(input(ctx), config(ctx));
    // 两遍流程：确认设计后进入 plan-change 并中断。
    bed.model.queueIntent("CONFIRM_DESIGN");
    await sendUser(bed, ctx, "确认");
    // Keep the invoke result referenced: under vitest's transform an unused
    // return value can let the final checkpoint flush be skipped, making the
    // following getState() miss the interrupt.
    const held2 = await bed.graph.invoke(input(ctx), config(ctx));
    void held2;
    const payload2 = await interruptPayload(bed, ctx);
    expect(payload2).toBeDefined();
    expect(payload2?.planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(bed.model.implementationCreateCalls).toHaveLength(1);
    await bed.graph.invoke(
      new Command({ resume: { action: "cancel", planHash: payload2!.planHash } }),
      config(ctx),
    );

    // Round 3: unsupported again.
    bed.deps.isDomainSupported = () => false;
    bed.model.queueIntent("MODIFY_REQUIREMENT");
    await sendUser(bed, ctx, "接入外部 ERP 系统");
    const r3 = await bed.graph.invoke(input(ctx), config(ctx));
    expect(r3.lastErrorCode).toBe("UNSUPPORTED_DOMAIN");
    expect(r3.pendingRequirements).toHaveLength(1);

    // Round 4: supported requirement plans again after the second unsupported.
    bed.deps.isDomainSupported = () => true;
    bed.model.queueIntent("NEW_REQUIREMENT");
    await sendUser(bed, ctx, "新增一个文本框");
    const revised4 = await bed.graph.invoke(input(ctx), config(ctx));
    expect(revised4.stage).toBe("design-review");
    expect(bed.model.implementationCreateCalls).toHaveLength(1);

    bed.model.queueIntent("CONFIRM_DESIGN");
    await sendUser(bed, ctx, "确认");
    const held4 = await bed.graph.invoke(
      { ...input(ctx), stage: revised4.stage },
      config(ctx),
    );
    void held4;
    const payload4 = await interruptPayload(bed, ctx);
    expect(payload4).toBeDefined();
    expect(bed.model.implementationReviseCalls).toHaveLength(1);
    expect(bed.builds.enqueues).toHaveLength(0);
  });

  it("clears a stale UNSUPPORTED_DOMAIN error on a later supported question", async () => {
    const bed = createBed();
    bed.deps.isDomainSupported = () => false;
    const ctx = seed(bed);
    bed.model.queueIntent("NEW_REQUIREMENT");
    await sendUser(bed, ctx, "接入外部 ERP 系统");
    const r1 = await bed.graph.invoke(input(ctx), config(ctx));
    expect(r1.lastErrorCode).toBe("UNSUPPORTED_DOMAIN");

    bed.deps.isDomainSupported = () => true;
    bed.model.queueIntent("QUESTION");
    await sendUser(bed, ctx, "现在支持了吗");
    const r2 = await bed.graph.invoke(input(ctx), config(ctx));
    expect(r2.lastErrorCode).toBeUndefined();
    expect(r2.pendingRequirements).toBeUndefined();
    expect(r2.stage).toBe("idle");
  });

  it("computes a canonical planHash that matches the stored plan", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个输入框");

    // The planHash the user approves must be the canonical hash of the exact
    // deterministic compiled plan, so approve → enqueue builds that plan.
    const stored = bed.repo.plans.get(`plan:${WORKSPACE_ID}:${payload.planHash}`);
    expect(stored).toBeDefined();
    const envelope = stored!.plan as ServerPlanEnvelope;
    expect(envelope.schema).toBe("kf-server-plan-envelope/v1");
    expect(payload.planHash).toBe(planHash(envelope.plan));
    expect(envelope.planHash).toBe(payload.planHash);
    // And it is the same hash persisted for the deterministic plan id.
    expect(bed.repo.plans.has(`plan:${WORKSPACE_ID}:${payload.planHash}`)).toBe(true);
  });
});
