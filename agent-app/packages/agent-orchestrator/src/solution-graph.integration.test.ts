// Postgres checkpoint integration test (brief Step 7):
// start a thread → stop at the approval interrupt → destroy the graph instance
// → rebuild the graph with a PostgresSaver checkpointer over the same database
// → resume with Command → assert the same conversation continues.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/kf_agent_test";

import { Command } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { BuildJobService } from "@kf/build-jobs";
import {
  ModulePlanSchema,
  solutionId,
  type ChangePlan,
  type CustomerEffectBlueprint,
  type DesignPlan,
  type ModulePlan,
  type SolutionIR,
  type UIComponentSpec,
  type UIImplementationSpec,
} from "@kf/contracts";
import { PrismaClient, Prisma } from "@prisma/client";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
import {
  compileModulePlan,
  createDefaultModuleRegistry,
} from "@kf/domain-client";
import {
  acceptedArtifactForPlan,
  verifiedCompilationFor,
} from "../../domain-client/src/modules/testing/module-artifact-test-helpers.js";
import type {
  BuildJobPort,
  ChangePlanRepository,
  SolutionGraphDeps,
  WorkspaceQueryPort,
} from "./ports.js";
import type { ModelPort, ModelPortContext } from "./model-port.js";
import type { GraphMessage, ApprovalInterrupt } from "./state.js";
import type { Intent } from "./schemas/intent.js";
import { compileSolutionGraph } from "./solution-graph.js";
import { TEST_SERVER_PLAN_SIGNER } from "./test-server-plan-signer.js";

type CompiledGraph = ReturnType<typeof compileSolutionGraph>;

let prisma: PrismaClient;
let pool: pg.Pool;
let counter = 0;

const BUSINESS_TABLES = [
  "AuditLog",
  "ValidationReport",
  "Artifact",
  "BuildJob",
  "DomainProjectRevision",
  "SolutionRevision",
  "ChangePlan",
  "ChangeRequest",
  "Message",
  "Conversation",
  "SolutionWorkspace",
  "UserSession",
  "User",
  "Tenant",
];

const CHECKPOINT_TABLES = ["checkpoint_writes", "checkpoint_blobs", "checkpoints", "checkpoint_migrations"];

beforeAll(async () => {
  prisma = new PrismaClient();
  pool = new pg.Pool({
    connectionString:
      process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/kf_agent_test",
  });
  await new PostgresSaver(pool).setup();
});

const GOLDEN_CAPABILITIES = [
  "layout.2", "text", "button", "image", "tabs", "input", "tag", "easyui.1",
  "prototype.TrendChart", "prototype.BarChart", "prototype.PieChart",
] as const;

async function readGoldenPlan(name: string): Promise<ModulePlan> {
  const url = new URL(`../../../tests/fixtures/module-plans/${name}.json`, import.meta.url);
  return ModulePlanSchema.parse(JSON.parse(await readFile(url, "utf8")) as unknown);
}

function resolvedAssets(plan: ModulePlan) {
  return Object.fromEntries(plan.assets.map((asset) => [asset.id, {
    assetId: asset.id,
    status: "resolved" as const,
    resolvedName: asset.name,
  }]));
}

function assertGoldenGeometry(pages: readonly { width: number; height: number; components: readonly UIComponentSpec[] }[]) {
  for (const page of pages) {
    for (const component of page.components) {
      const box = component.geometry;
      expect(box.x, component.id).toBeGreaterThanOrEqual(0);
      expect(box.y, component.id).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, component.id).toBeLessThanOrEqual(page.width);
      expect(box.y + box.height, component.id).toBeLessThanOrEqual(page.height);
    }
    const byId = new Map(page.components.map((component) => [component.id, component]));
    const isAncestor = (ancestorId: string, component: UIComponentSpec): boolean => {
      const visited = new Set<string>();
      let parentId = component.properties.parentId;
      while (typeof parentId === "string" && !visited.has(parentId)) {
        if (parentId === ancestorId) return true;
        visited.add(parentId);
        parentId = byId.get(parentId)?.properties.parentId;
      }
      return false;
    };
    for (let leftIndex = 0; leftIndex < page.components.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < page.components.length; rightIndex += 1) {
        const left = page.components[leftIndex]!;
        const right = page.components[rightIndex]!;
        if (isAncestor(left.id, right) || isAncestor(right.id, left)) continue;
        const a = left.geometry;
        const b = right.geometry;
        const overlap = a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
        expect(overlap, `${left.id} overlaps ${right.id}`).toBe(false);
      }
    }
  }
}

describe("module generation V1 golden fixtures", () => {
  it.each([
    ["personal-portal", "ready_with_warnings"],
    ["admin-console", "ready_with_warnings"],
  ] as const)("compiles %s with exact blueprint coverage, native structures, and beta maturity evidence", async (name, expectedDelivery) => {
    const plan = await readGoldenPlan(name);
    const registry = createDefaultModuleRegistry();
    const result = compileModulePlan({
      plan,
      acceptedBlueprintArtifact: acceptedArtifactForPlan(plan, registry),
      registry,
      assetsById: resolvedAssets(plan),
      validationContext: { availableKfCapabilities: GOLDEN_CAPABILITIES, approvedAuthorizationRefs: [] },
    });
    expect(result.status).toBe("compiled");
    if (result.status !== "compiled") return;
    expect(result.deliveryReport?.status).toBe(expectedDelivery);
    expect(result.deliveryReport?.gaps.filter((gap) => /registered as beta/.test(gap.reason)).map((gap) => gap.moduleId).sort())
      .toEqual(plan.pages.flatMap((page) => page.modules.map((module) => module.id)).sort());
    expect(result.metadata.blueprintMappings).toHaveLength(plan.pages.flatMap((page) => page.modules).length);
    expect(new Set(result.metadata.blueprintMappings.map((mapping) => mapping.blueprintModuleId)).size)
      .toBe(plan.pages.flatMap((page) => page.modules).length);
    assertGoldenGeometry(result.implementation.pages);

    for (const module of plan.pages.flatMap((page) => page.modules)) {
      const quality = registry.require(module.kind, module.templateVersion).quality;
      expect(quality, `${module.id} missing quality contract`).toBeDefined();
      const controls = result.implementation.pages.flatMap((page) => page.components).filter((component) => component.sourceModuleId === module.id);
      expect(controls.length, `${module.id} required controls`).toBeGreaterThanOrEqual(quality!.minimumComponentCount);
      expect(controls.filter((control) => control.critical).length, `${module.id} required critical controls`).toBeGreaterThanOrEqual(quality!.minimumCriticalComponentCount);
      for (const capability of quality!.requiredCapabilityIds) {
        expect(controls.some((control) => control.capabilityId === capability), `${module.id} missing ${capability}`).toBe(true);
      }
    }
    for (const asset of plan.assets) expect(result.assetBindings).toContainEqual(expect.objectContaining({ assetId: asset.id }));

    const repeated = compileModulePlan({
      plan,
      acceptedBlueprintArtifact: acceptedArtifactForPlan(plan, registry),
      previousPlan: plan,
      previousImplementation: result.implementation,
      previousCompilationArtifact: verifiedCompilationFor(result),
      registry,
      assetsById: resolvedAssets(plan),
      validationContext: { availableKfCapabilities: GOLDEN_CAPABILITIES, approvedAuthorizationRefs: [] },
    });
    expect(repeated.status).toBe("compiled");
    if (repeated.status !== "compiled") return;
    expect(repeated.implementation).toEqual(result.implementation);
    expect(repeated.diff?.unexpectedChanges).toEqual([]);
  });

  it("keeps the industrial chart golden blocked on its exact unverified KF 3.6 static-series gap", async () => {
    const plan = await readGoldenPlan("industrial-dashboard");
    const registry = createDefaultModuleRegistry();
    const result = compileModulePlan({
      plan,
      acceptedBlueprintArtifact: acceptedArtifactForPlan(plan, registry),
      registry,
      assetsById: {},
      validationContext: { availableKfCapabilities: GOLDEN_CAPABILITIES, approvedAuthorizationRefs: [] },
    });
    expect(result.status).toBe("blocked");
    expect(result.deliveryReport?.status).toBe("blocked");
    expect(result.gaps).toContainEqual(expect.objectContaining({ moduleId: "dashboard-chart", severity: "blocking", reason: "kf36-static-chart-series-mapping-unverified" }));
    const blocking = result.gaps.filter((gap) => gap.severity === "blocking");
    expect(blocking.length).toBeGreaterThan(0);
    expect(blocking.every((gap) => gap.moduleId === "dashboard-chart")).toBe(true);
    expect(result.implementation).toBeDefined();
    if (result.implementation !== undefined) assertGoldenGeometry(result.implementation.pages);
    const statusControls = result.implementation?.pages.flatMap((page) => page.components).filter((component) => component.sourceModuleId === "dashboard-status") ?? [];
    const statusQuality = registry.require("data.status-grid", "1.0.0").quality!;
    expect(statusControls.length).toBeGreaterThanOrEqual(statusQuality.minimumComponentCount);
    for (const capability of statusQuality.requiredCapabilityIds) expect(statusControls.some((component) => component.capabilityId === capability)).toBe(true);
    expect(statusControls.some((component) => component.capabilityId === "tag")).toBe(true);
  });

  it("rebuilds only one portal module without unexpected implementation drift", async () => {
    const plan = await readGoldenPlan("personal-portal");
    const registry = createDefaultModuleRegistry();
    const context = { availableKfCapabilities: GOLDEN_CAPABILITIES, approvedAuthorizationRefs: [] };
    const before = compileModulePlan({ plan, acceptedBlueprintArtifact: acceptedArtifactForPlan(plan, registry), registry, assetsById: resolvedAssets(plan), validationContext: context });
    expect(before.status).toBe("compiled");
    if (before.status !== "compiled") return;
    const revisedContent = JSON.stringify({ items: [{ label: "Experience", value: "6 years", trend: "Growing" }, { label: "Projects", value: "40+" }, { label: "Clients", value: "12" }] });
    const revised: ModulePlan = {
      ...plan,
      pages: plan.pages.map((page) => ({ ...page, modules: page.modules.map((module) => module.id === "portal-kpis" ? { ...module, content: revisedContent } : module) })),
      operations: [{ op: "update", pageId: "Page1", moduleId: "portal-kpis", changes: { content: revisedContent } }],
    };
    const after = compileModulePlan({
      plan: revised,
      acceptedBlueprintArtifact: acceptedArtifactForPlan(revised, registry),
      previousPlan: plan,
      previousImplementation: before.implementation,
      previousCompilationArtifact: verifiedCompilationFor(before),
      registry,
      assetsById: resolvedAssets(revised),
      validationContext: context,
    });
    expect(after.status).toBe("compiled");
    if (after.status !== "compiled") return;
    expect(after.diff?.changedModules).toEqual(["portal-kpis"]);
    expect(after.diff?.unexpectedChanges).toEqual([]);
  });
});

afterAll(async () => {
  await pool.end();
  await prisma.$disconnect();
});

beforeEach(async () => {
  for (const table of BUSINESS_TABLES) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
  for (const table of CHECKPOINT_TABLES) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
});

// --- real Prisma-backed ports -------------------------------------------------

function makePrismaPorts() {
  const summaries = new Map<string, string>();

  const workspaceQuery: WorkspaceQueryPort = {
    async listRecentMessages({ tenantId, conversationId, limit }) {
      const rows = await prisma.message.findMany({
        where: { tenantId, conversationId },
        orderBy: { createdAt: "asc" },
        take: limit,
      });
      return rows.map((row) => ({ role: row.role as "user" | "assistant", content: row.content }));
    },
    async appendMessage({ tenantId, conversationId, role, content }) {
      await prisma.message.create({ data: { tenantId, conversationId, role, content } });
    },
    async getConversationSummary({ conversationId }) {
      return summaries.get(conversationId);
    },
    async setConversationSummary({ conversationId, summary }) {
      summaries.set(conversationId, summary);
    },
    async getCurrentRevisionId({ tenantId, workspaceId }) {
      const workspace = await prisma.solutionWorkspace.findFirst({
        where: { id: workspaceId, tenantId },
      });
      return workspace?.currentRevisionId ?? undefined;
    },
    async getRevisionSummary({ revisionId }) {
      const revision = await prisma.solutionRevision.findUnique({ where: { id: revisionId } });
      if (revision?.state === null || typeof revision?.state !== "object") return undefined;
      return makeBoundedRevisionSummary(revision.state);
    },
    async getRevisionEntities() {
      return [];
    },
  };

  const changePlanRepository: ChangePlanRepository = {
    async findOpenChangeRequest({ tenantId, workspaceId, conversationId }) {
      // plan-change persists change requests under the deterministic id
      // `cr:{workspaceId}:{conversationId}`, so lookup by that id keeps
      // conversations isolated within a shared workspace.
      const request = await prisma.changeRequest.findFirst({
        where: { id: `cr:${workspaceId}:${conversationId}`, tenantId, status: "OPEN" },
      });
      return request === null ? null : { id: request.id };
    },
    async saveChangeRequest({ id, tenantId, workspaceId, title, status }) {
      await prisma.changeRequest.upsert({
        where: { id },
        create: { id, tenantId, workspaceId, title, status },
        update: { title, status },
      });
    },
    async savePlan({ id, tenantId, workspaceId, changeRequestId, planHash, plan }) {
      await prisma.changePlan.upsert({
        where: { id },
        create: { id, tenantId, workspaceId, changeRequestId, planHash, plan: plan as Prisma.InputJsonValue },
        update: { planHash, plan: plan as Prisma.InputJsonValue },
      });
    },
    async loadPlanHash({ changePlanId }) {
      const plan = await prisma.changePlan.findUnique({ where: { id: changePlanId } });
      return plan?.planHash ?? undefined;
    },
    async verifyPersistedCreativePlan() {
      return false;
    },
    async setChangeRequestStatus({ tenantId, changeRequestId, status }) {
      await prisma.changeRequest.updateMany({
        where: { id: changeRequestId, tenantId },
        data: { status },
      });
    },
  };

  const jobs = new BuildJobService(prisma, 30_000);
  const buildJobPort: BuildJobPort = {
    async enqueue(input) {
      const job = await jobs.enqueue(input);
      return { id: job.id, status: job.status };
    },
    async getJob({ jobId }) {
      const job = await prisma.buildJob.findUnique({ where: { id: jobId } });
      return job === null ? null : { id: job.id, status: job.status };
    },
  };

  return { workspaceQuery, changePlanRepository, buildJobPort };
}

/** Bounded revision summary: names and counts only, never full page JSON. */
function makeBoundedRevisionSummary(state: object): string {
  const record = state as Record<string, unknown>;
  const pages = Array.isArray(record["pages"]) ? (record["pages"] as Record<string, unknown>[]) : [];
  const names = pages
    .map((page) => {
      const name = page["name"];
      return typeof name === "string" ? name : "?";
    })
    .slice(0, 5)
    .join("、");
  return `页面 ${names.length > 0 ? names : "（无）"}；共 ${pages.length} 页`;
}

class StubModelPort implements ModelPort {
  private intents: Intent[] = [];

  queueIntent(intent: Intent): void {
    this.intents.push(intent);
  }

  async classifyIntent(input: ModelPortContext) {
    const intent = this.intents.shift() ?? "QUESTION";
    void input;
    return { intent, requestedDomains: ["kingclient"] };
  }
  async createDesignPlan(): Promise<DesignPlan> {
    const blueprint: CustomerEffectBlueprint = {
      schema: "kf-design-plan/v2",
      displayName: "客户效果方案",
      overview: {
        objective: "说明最终效果",
        audiences: ["业务用户"],
        scenarios: ["方案确认"],
        valueProposition: "提供完整方案信息",
      },
      informationArchitecture: { narrative: "总览到详情", wireframe: "总览 → 详情" },
      modules: [{
        id: "main",
        name: "核心内容",
        purpose: "展示主要信息",
        content: ["标题", "说明"],
        sampleData: [{ label: "指标", value: "98%" }],
        interactions: ["查看详情"],
        presentation: "重点卡片",
      }],
      visualDirection: {
        tone: "专业",
        colors: ["深蓝"],
        typography: "清晰层级",
        spacingAndSurfaces: "卡片留白",
      },
      highlights: ["信息清晰"],
      revisionNotes: { added: ["核心内容"], changed: [], retained: [] },
      acceptanceCriteria: ["完整展示核心信息"],
      openQuestions: [],
    };
    return blueprint;
  }
  async createProjectDesign(): Promise<SolutionIR> {
    return {
      schema: "kf-solution-ir/v1",
      solutionId: solutionId("sol"),
      displayName: "设计",
      projects: [],
      dependencies: [],
      pendingRequirements: [],
    };
  }
  async createUiImplementation(): Promise<UIImplementationSpec> {
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
        components: [{
          id: "MainTitle",
          role: "heading",
          sourceModuleId: "main",
          capabilityId: "text",
          critical: true,
          content: "hello",
          geometry: { x: 40, y: 40, width: 320, height: 48 },
          properties: {},
          style: { declarations: { fontSize: 24 }, states: {} },
        }],
      }],
    };
  }
  async reviseUiImplementation(input: ModelPortContext): Promise<UIImplementationSpec> {
    return input.uiImplementation ?? this.createUiImplementation();
  }
  async createModulePlan(): Promise<never> {
    throw new Error("module planning is not exercised by the legacy graph fixture");
  }
  async reviseModulePlan(): Promise<never> {
    throw new Error("module planning is not exercised by the legacy graph fixture");
  }
  async createSolutionImplementationPlan(): Promise<never> {
    throw new Error("creative-v2 planning is not exercised by the legacy graph fixture");
  }
  async reviseSolutionImplementationSubtree(): Promise<never> {
    throw new Error("creative-v2 repair is not exercised by the legacy graph fixture");
  }
  async createChangePlan(input: ModelPortContext): Promise<ChangePlan> {
    return {
      schema: "kf-change-plan/v1",
      workspaceId: input.workspaceId,
      operations: [
        {
          op: "update",
          entityId: `cp-${input.conversationId}`,
          entityType: "text",
          changes: [{ path: "/text", value: "hello" }],
        },
      ],
    };
  }
  async reviseChangePlan(input: ModelPortContext): Promise<ChangePlan> {
    return this.createChangePlan(input);
  }
  async explainValidation(): Promise<string> {
    return "ok";
  }
}

interface Seeded {
  tenantId: string;
  userId: string;
  workspaceId: string;
  conversationId: string;
  revisionId: string;
}

async function seedWorkspace(): Promise<Seeded> {
  counter += 1;
  const suffix = `${Date.now()}-${counter}`;
  const tenant = await prisma.tenant.create({ data: { name: `CP-Tenant-${suffix}` } });
  const workspace = await prisma.solutionWorkspace.create({
    data: { tenantId: tenant.id, name: `CP-Workspace-${suffix}`, mode: "new" },
  });
  const revision = await prisma.solutionRevision.create({
    data: {
      tenantId: tenant.id,
      workspaceId: workspace.id,
      revisionNumber: 1,
      kind: "initial",
      state: {
        schema: "kf-client-project-ir/v1",
        id: "solution",
        name: "Solution",
        version: "1.0.0.1",
        pages: [{ id: "page-home", name: "Page1", width: 1440, height: 900, controls: [] }],
        variables: [],
        scripts: [],
      },
    },
  });
  await prisma.solutionWorkspace.update({
    where: { id: workspace.id },
    data: { currentRevisionId: revision.id },
  });
  const conversation = await prisma.conversation.create({
    data: { tenantId: tenant.id, workspaceId: workspace.id, title: `CP-Conversation-${suffix}` },
  });
  await prisma.message.create({
    data: {
      tenantId: tenant.id,
      conversationId: conversation.id,
      role: "user",
      content: "新增一个按钮",
    },
  });
  return {
    tenantId: tenant.id,
    userId: "user",
    workspaceId: workspace.id,
    conversationId: conversation.id,
    revisionId: revision.id,
  };
}

function makeDeps() {
  const ports = makePrismaPorts();
  const model = new StubModelPort();
  model.queueIntent("NEW_REQUIREMENT");
  model.queueIntent("CONFIRM_DESIGN"); // 两遍流程：设计计划后确认再进 plan-change
  const deps: SolutionGraphDeps = {
    modelPort: model,
    workspaceQuery: ports.workspaceQuery,
    changePlanRepository: ports.changePlanRepository,
    buildJobPort: ports.buildJobPort,
    uiImplementationCompiler: {
      async compile({ workspaceId, spec }) {
        return {
          plan: {
            schema: "kf-change-plan/v1" as const,
            workspaceId,
            operations: spec.pages.flatMap((page) => page.components.map((component) => ({
              op: "create" as const,
              entityType: "control",
              entityId: component.id,
              properties: { pageId: `page-${page.id}`, type: component.capabilityId },
            }))),
          },
          capabilityReport: {
            status: "warning" as const,
            full: [],
            partial: ["text"],
            unsupported: [],
            deliveryGaps: [],
          },
        };
      },
    },
    serverPlanSigner: TEST_SERVER_PLAN_SIGNER,
    isDomainSupported: () => true,
  };
  return deps;
}

function graphConfig(conversationId: string) {
  return { configurable: { thread_id: conversationId } };
}

function graphInput(seeded: Seeded) {
  return {
    tenantId: seeded.tenantId,
    userId: seeded.userId,
    workspaceId: seeded.workspaceId,
    conversationId: seeded.conversationId,
    stage: "idle" as const,
    recentMessages: [] as GraphMessage[],
  };
}

describe("SolutionGraph Postgres checkpoint recovery", () => {
  it("resumes the same conversation from a fresh graph instance after interrupt", async () => {
    const seeded = await seedWorkspace();
    const deps = makeDeps();

    // Graph instance #1: run the new requirement and stop at the approval
    // interrupt. The checkpoint lands in Postgres, not in memory.
    const saver1 = new PostgresSaver(pool);
    await saver1.setup();
    const graph1: CompiledGraph = compileSolutionGraph(deps, { checkpointer: saver1 });
    const config = graphConfig(seeded.conversationId);

    await graph1.invoke(graphInput(seeded), config);
    // 两遍流程第二步：CONFIRM_DESIGN 进入 plan-change 并停在审批中断。
    await graph1.invoke(graphInput(seeded), config);
    const snapshot = await graph1.getState(config);
    const payload = snapshot.tasks[0]?.interrupts[0]?.value as ApprovalInterrupt | undefined;
    expect(payload?.type).toBe("plan-approval");
    expect(payload?.planHash).toMatch(/^[0-9a-f]{64}$/);

    // Destroy the graph instance (and its saver). All durable state is in
    // Postgres now; nothing is retained in the test process.
    const destroyed = graph1;
    void destroyed;

    // Graph instance #2: a brand-new compiled graph backed by a new
    // PostgresSaver over the same database resumes the same thread.
    const saver2 = new PostgresSaver(pool);
    await saver2.setup();
    const graph2: CompiledGraph = compileSolutionGraph(deps, { checkpointer: saver2 });

    const result = await graph2.invoke(
      new Command({ resume: { action: "approve", planHash: payload?.planHash ?? "" } }),
      config,
    );

    expect(result.conversationId).toBe(seeded.conversationId);
    expect(result.stage).toBe("building");
    expect(result.buildJobId).toBeDefined();

    // The approved plan made it to the durable build queue under the same
    // workspace with the exact planHash the user approved.
    const job = await prisma.buildJob.findFirst({
      where: { workspaceId: seeded.workspaceId },
    });
    expect(job).not.toBeNull();
    expect(job?.planHash).toBe(payload?.planHash);
    expect(job?.baseRevisionId).toBe(seeded.revisionId);

    // Same conversation: the assistant build-queued hint appended by enqueue-build
    // is persisted alongside the seeded user message.
    const replyCount = await prisma.message.count({
      where: { conversationId: seeded.conversationId },
    });
    // 两遍流程：设计计划展示 + 确认后的构建排队提示（enqueue-build）。
    expect(replyCount).toBe(3);
  });

  it("reuses a legacy default-project idempotency key when approval is replayed", async () => {
    const seeded = await seedWorkspace();
    const deps = makeDeps();
    deps.defaultDomainKind = " kingclient ";
    deps.defaultProjectKey = " kingclient ";
    const saver1 = new PostgresSaver(pool);
    await saver1.setup();
    const graph1: CompiledGraph = compileSolutionGraph(deps, { checkpointer: saver1 });
    const config = graphConfig(seeded.conversationId);

    await graph1.invoke(graphInput(seeded), config);
    await graph1.invoke(graphInput(seeded), config);
    const snapshot = await graph1.getState(config);
    const payload = snapshot.tasks[0]?.interrupts[0]?.value as ApprovalInterrupt | undefined;
    if (payload === undefined) throw new Error("expected a plan approval interrupt");
    const changePlanId = `plan:${seeded.workspaceId}:${payload.planHash}`;
    const legacyKey = `${seeded.conversationId}:${changePlanId}:${payload.planHash}`;
    const legacyJob = await prisma.buildJob.create({
      data: {
        tenantId: seeded.tenantId,
        workspaceId: seeded.workspaceId,
        baseRevisionId: seeded.revisionId,
        changePlanId,
        planHash: payload.planHash,
        projectKey: "kingclient",
        domainKind: "kingclient",
        idempotencyKey: legacyKey,
        status: "QUEUED",
      },
    });

    const saver2 = new PostgresSaver(pool);
    await saver2.setup();
    const graph2: CompiledGraph = compileSolutionGraph(deps, { checkpointer: saver2 });
    const result = await graph2.invoke(
      new Command({ resume: { action: "approve", planHash: payload.planHash } }),
      config,
    );

    expect(result.buildJobId).toBe(legacyJob.id);
    expect(await prisma.buildJob.count({ where: { workspaceId: seeded.workspaceId } })).toBe(1);
    expect(await prisma.solutionRevision.count({
      where: { workspaceId: seeded.workspaceId },
    })).toBe(1);
  });

  it("reuses the canonical scoped key when a spaced project approval is replayed", async () => {
    const seeded = await seedWorkspace();
    const deps = makeDeps();
    deps.defaultDomainKind = "kingcalculation";
    deps.defaultProjectKey = " calc ";
    const saver1 = new PostgresSaver(pool);
    await saver1.setup();
    const graph1: CompiledGraph = compileSolutionGraph(deps, { checkpointer: saver1 });
    const config = graphConfig(seeded.conversationId);

    await graph1.invoke(graphInput(seeded), config);
    await graph1.invoke(graphInput(seeded), config);
    const snapshot = await graph1.getState(config);
    const payload = snapshot.tasks[0]?.interrupts[0]?.value as ApprovalInterrupt | undefined;
    if (payload === undefined) throw new Error("expected a plan approval interrupt");
    const changePlanId = `plan:${seeded.workspaceId}:${payload.planHash}`;
    const canonicalKey = `${seeded.conversationId}:calc:${changePlanId}:${payload.planHash}`;
    const canonicalJob = await prisma.buildJob.create({
      data: {
        tenantId: seeded.tenantId,
        workspaceId: seeded.workspaceId,
        baseRevisionId: seeded.revisionId,
        changePlanId,
        planHash: payload.planHash,
        projectKey: "calc",
        domainKind: "kingcalculation",
        idempotencyKey: canonicalKey,
        status: "QUEUED",
      },
    });

    const saver2 = new PostgresSaver(pool);
    await saver2.setup();
    const graph2: CompiledGraph = compileSolutionGraph(deps, { checkpointer: saver2 });
    const result = await graph2.invoke(
      new Command({ resume: { action: "approve", planHash: payload.planHash } }),
      config,
    );

    expect(result.buildJobId).toBe(canonicalJob.id);
    expect(await prisma.buildJob.count({ where: { workspaceId: seeded.workspaceId } })).toBe(1);
  });
});
