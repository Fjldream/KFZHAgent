// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import "reflect-metadata";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({ url: process.env.DATABASE_URL, allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET, expectedPrefix: "kf_agent_test_" });
process.env.KF_SERVER_PLAN_HMAC_KEY_BASE64 = Buffer.alloc(32, 0x62).toString("base64");
process.env.AGENT_ALLOWED_ORIGINS = "http://localhost:5174";

import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { canonicalChangePlanHash, canonicalServerHash, RunEventSchema, CustomerSolutionBlueprintSchema, SolutionImplementationPlanSchema, type ChangePlan, type DesignPlan, type SolutionImplementationPlan } from "@kf/contracts";
// end
import type { ModelPortContext } from "@kf/agent-orchestrator";
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import type { ClassifyIntentResult } from "@kf/agent-orchestrator";
import { withAgentRunExecution } from "@kf/build-jobs";
import { threadConfig } from "./run-graph-runner.js";
import { Command } from "@langchain/langgraph";
import { createLeaseBoundStepMemo } from "./run-step-memo.adapter.js";
import { RUN_PLAN_VERSION } from "./run-execution-plan.js";
// end
import type { ArtifactStorage } from "@kf/artifact-storage";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { createKingClientDomainPack, importNativeClientPackage, inspectClientProject } from "@kf/domain-client";
// end
import { DomainRegistry } from "@kf/domain-registry";
import { readFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SessionService, SESSION_COOKIE_NAME } from "../auth/session.service.js";
import { DeterministicFakeModelPort } from "../conversations/fake-model.js";
import { MODEL_PORT } from "../conversations/model-port.js";
import { ConversationService } from "../conversations/conversation.service.js";
import { SERVER_PLAN_AUTHORITY } from "../conversations/server-plan-authority.js";
import { ARTIFACT_STORAGE } from "../artifacts/artifact-storage.js";
import { JobRunner } from "../../../worker/src/job-runner.js";
import { PrismaRunStore } from "./run-store.js";
import { PrismaRunStepStore } from "./run-step-store.js";
import { RunExecutionService } from "./run-execution.service.js";
import { createRunHandlerRegistry } from "./run-handler-registry.js";
import type { GraphLike } from "./run-graph-runner.js";

let golden: { blueprint: DesignPlan; plan: SolutionImplementationPlan; prompt: string };
class FlowModel extends DeterministicFakeModelPort {
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  forcedIntent: ClassifyIntentResult | undefined;
  observedBlueprintInput: ModelPortContext | undefined;
  override classifyIntent(input: ModelPortContext): Promise<ClassifyIntentResult> { return this.forcedIntent ? Promise.resolve(this.forcedIntent) : super.classifyIntent(input); }
  unchangedPlan: ChangePlan | undefined;
  override reviseChangePlan(input: ModelPortContext): Promise<ChangePlan> { return this.unchangedPlan ? Promise.resolve(structuredClone(this.unchangedPlan)) : super.reviseChangePlan(input); }
  // end
  beforePlan: (() => Promise<void>) | undefined;
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  observedSemanticInput: ModelPortContext | undefined;
  // end
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  override createDesignPlan(input?: ModelPortContext): Promise<DesignPlan> { this.observedBlueprintInput = input; return Promise.resolve(structuredClone(golden.blueprint)); }
  // end
  override async createSolutionImplementationPlan(input?: ModelPortContext): Promise<SolutionImplementationPlan> {
    if (!input) throw new Error("missing model input");
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    this.observedSemanticInput = structuredClone(input);
    // end
    await this.beforePlan?.();
    return { ...structuredClone(golden.plan), blueprintHash: canonicalServerHash(input.confirmedSolutionBlueprint), candidateBundleHash: canonicalServerHash(input.capabilityCandidates) };
  }
  override reviseSolutionImplementationSubtree(input?: ModelPortContext): Promise<SolutionImplementationPlan> { return this.createSolutionImplementationPlan(input); }
}
let app: INestApplication;
let prisma: PrismaService;
let cookie: string;
let tenantId: string;
let workspaceId: string;
let service: RunExecutionService;
let store: PrismaRunStore;
let runner: JobRunner;
let model: FlowModel;
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
const operatorErrors: unknown[] = [];
// end
beforeAll(async () => {
  golden = JSON.parse(await readFile(new URL("../../../../tests/fixtures/creative-goldens/industrial-dashboard.json", import.meta.url), "utf8")) as typeof golden;
  process.env.ARTIFACT_STORAGE_ROOT = await mkdtemp(path.join(tmpdir(), "kf-run-flow-"));
  model = new FlowModel();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MODEL_PORT).useValue(model).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  prisma = app.get(PrismaService);
  // 全局构建调度器会领取任意租户；专用库不能混入其他套件留下的假排队作业。
  if (await prisma.buildJob.count({ where: { status: { in: ["QUEUED", "RUNNING", "VALIDATING"] } } })) throw new Error("RUN_FLOW_REQUIRES_CLEAN_BUILD_QUEUE: use a fresh isolated test database");
  const tenant = await prisma.tenant.create({ data: { name: `run-flow-${randomUUID()}` } });
  tenantId = tenant.id;
  const user = await prisma.user.create({ data: { tenantId, username: `flow-${randomUUID()}`, passwordHash: "session-only-test", role: "tenant_admin", mustChangePassword: false } });
  const session = await app.get(SessionService).createSession(user.id);
  cookie = `${SESSION_COOKIE_NAME}=${session.token}`;
  const created = await request(app.getHttpServer()).post("/api/workspaces").set("Cookie", cookie).send({ name: `Flow ${randomUUID()}` }).expect(201);
  workspaceId = created.body.id as string;
  store = new PrismaRunStore(prisma);
  const conversations = app.get(ConversationService);
  service = new RunExecutionService({ prisma, store, steps: new PrismaRunStepStore(prisma), handlers: createRunHandlerRegistry({
    prisma, loadGraph: async () => await conversations.getGraph() as unknown as GraphLike,
    acquireTurn: id => conversations.acquireRunTurn(id), registerMemo: (id, memo) => conversations.registerRunMemo(id, memo), buildPollMs: 10,
  }) });
  const registry = new DomainRegistry();
  registry.register(createKingClientDomainPack({ nativeAccepted: false }));
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  runner = new JobRunner({ prisma, storage: app.get<ArtifactStorage>(ARTIFACT_STORAGE), registry, serverPlanVerifier: app.get(SERVER_PLAN_AUTHORITY),
    operatorLogger: { error: (_message, error) => { operatorErrors.push(error); } } });
  // end
}, 30000);
afterAll(async () => { await app?.close(); });
beforeEach(async () => {
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  process.env.AGENT_RUNS_V2 = "true";
  process.env.AGENT_WORKBENCH_V2 = "true";
  process.env.AGENT_FEATURE_TENANT_ALLOWLIST = tenantId;
  // end
  const created = await request(app.getHttpServer()).post("/api/workspaces").set("Cookie", cookie).send({ name: `Flow ${randomUUID()}` }).expect(201);
  workspaceId = created.body.id as string;
});

const conversation = async () => {
  const response = await request(app.getHttpServer()).post("/api/conversations").set("Cookie", cookie).send({ workspaceId, title: `Flow ${randomUUID()}` }).expect(201);
  return response.body.id as string;
};
const start = (id: string, action: unknown, mode = "build", clientRequestId = randomUUID()) => request(app.getHttpServer())
  .post(`/api/conversations/${id}/runs`).set("Cookie", cookie).set("Origin", "http://localhost:5174")
  .send({ clientRequestId, clientMessageId: randomUUID(), mode, action });
const execute = async (signal = new AbortController().signal) => {
  const lease = await store.claim("flow-agent", tenantId, new Date());
  if (!lease) throw new Error("run was not claimable");
  return service.executeLease(lease, signal);
};

describe("real durable run flow", () => {
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it.each(["literal", "stateful", "repeater"])("continues an exact generated project (%s) with verified identities and a second immutable delivery", async mode => {
    const stateful = mode === "stateful";
    const repeated = mode === "repeater";
    const id = await conversation();
    const originalGolden = structuredClone(golden);
    if (golden.blueprint.schema !== "kf-design-plan/v3") throw new Error("v3 fixture required");
    const oldText = stateful ? "华东精密制造中心 · 白班" : "设备A 正常";
    const newText = stateful ? "华东精密制造中心 · 夜班" : "设备B 待机";
    if (!stateful) {
    const blueprintPage = golden.blueprint.pages[0]!;
    const region = blueprintPage.regions[0]!;
    const blueprint = CustomerSolutionBlueprintSchema.parse({ ...golden.blueprint, displayName: "设备概览",
      pages: [{ ...blueprintPage, readingOrder: [region.id], regions: [{ ...region,
        content: ["设备概览", "设备A 正常", "设备A 型号：演示设备"], sampleData: [], interactions: [] }] }],
      journeys: [{ id: "read-device-status", actor: "用户", goal: "读取状态", completion: "读到状态", steps: [{ kind: "observe",
        pageId: blueprintPage.id, regionId: region.id, action: "阅读状态", result: "读到状态", expectedTexts: ["设备A 正常"] }] }],
    });
    const intent = { importance: "primary" as const, visualWeight: 2, readingOrder: 0, density: "comfortable" as const,
      groupWith: [], width: { mode: "fill" as const }, height: { mode: "content" as const }, align: "start" as const };
    const semanticPage = golden.plan.pages[0]!;
    golden = { prompt: "生成设备概览，正文设备A 正常", blueprint, plan: SolutionImplementationPlanSchema.parse({ ...golden.plan,
      roleStyles: [{ role: "static-text", declarations: {}, states: {} }], mockData: [], localState: [], overlays: [], actions: [], scripts: [],
      pages: [{ ...semanticPage, sourceBlueprintPageId: blueprintPage.id, sourceBlueprintRegionIds: [region.id], initialStateIds: [],
        root: { kind: "layout", id: "device-overview-root", layout: "column", sourceBlueprintRegionIds: [region.id], intent: structuredClone(intent),
          children: [["overview-title", "设备概览"], ["device-status", "设备A 正常"], ["device-model", "设备A 型号：演示设备"]].map(([nodeId, content], index) => ({
            kind: "control", id: nodeId, capabilityId: "text", content, properties: [], tabIds: [], styleRole: "static-text",
            sourceBlueprintRegionIds: [region.id], eventBindings: [], intent: { ...structuredClone(intent), readingOrder: index } })) } }],
    }) };
    }
    if (repeated) {
      const root = golden.plan.pages[0]!.root;
      if (root.kind !== "layout") throw new Error("layout fixture required");
      const template = root.children[1]!;
      if (template.kind !== "control") throw new Error("control fixture required");
      golden.plan.mockData = [{ id: "device-status-data", purpose: "演示设备状态", fields: [
        { key: "code", label: "稳定内部标识", type: "text" }, { key: "label", label: "显示状态", type: "text" },
      ], records: [{ values: [{ field: "code", value: "A" }, { field: "label", value: oldText }] }] }];
      root.children[1] = { kind: "repeater", id: "device-status", sourceBlueprintRegionIds: [...root.sourceBlueprintRegionIds],
        intent: structuredClone(template.intent), mockDataId: "device-status-data", itemAlias: "device", keyField: "code", maxItems: 10,
        template: { ...structuredClone(template), id: "device-status-label", content: { kind: "repeater-field", itemAlias: "device", field: "label" } } };
    }
    if (stateful) golden.plan.localState.push({ id: "continuation-shift-label", purpose: "本地班次标签", type: "text", initialValue: "白班" });
    const storage = app.get<ArtifactStorage>(ARTIFACT_STORAGE);
    async function buildTurn(text: string) {
      const planned = await start(id, { type: "message", text }).expect(202);
      expect(await execute()).toMatchObject({ id: planned.body.id, status: "WAITING_INPUT" });
      const event = await prisma.agentRunEvent.findFirstOrThrow({ where: { runId: planned.body.id as string, type: "input.required" } });
      const confirmed = await start(id, { type: "confirm_blueprint", expectedRunId: planned.body.id, receipt: (event.payload as { receipt: string }).receipt }).expect(202);
      const controller = new AbortController();
      const running = execute(controller.signal);
      const settled = running.then(value => ({ value }), error => ({ error }));
      try {
        let current = await prisma.agentRun.findUniqueOrThrow({ where: { id: confirmed.body.id as string } });
        for (let attempt = 0; attempt < 500 && !current.buildJobId && current.status !== "FAILED"; attempt++) {
          await delay(10);
          current = await prisma.agentRun.findUniqueOrThrow({ where: { id: current.id } });
        }
        expect(current, JSON.stringify({ status: current.status, failureCode: current.failureCode })).toMatchObject({ status: "BUILDING", buildJobId: expect.any(String) });
        const built = await runner.runOnce("continuation-real-build", new Date());
        const latestError = operatorErrors.at(-1);
        expect(built, latestError instanceof Error ? latestError.message : undefined).toMatchObject({ id: current.buildJobId, status: "SUCCEEDED" });
        const completed = await running;
        expect(completed.status).toBe("SUCCEEDED");
        const artifact = await prisma.artifact.findFirstOrThrow({ where: { tenantId, buildJobId: completed.buildJobId!, kind: "client-package" } });
        const stream = await storage.open(tenantId, artifact.storageKey);
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        const bytes = Buffer.concat(chunks);
        const root = await importNativeClientPackage(bytes, await mkdtemp(path.join(tmpdir(), "kf-continuation-")));
        return { completed, artifact, inspection: await inspectClientProject(root), root };
      } finally { controller.abort(); await settled; }
    }
    try {
      const first = await buildTurn(golden.prompt);
      const firstSnapshot = await prisma.generationSnapshot.findFirstOrThrow({ where: { tenantId, workspaceId, revisionId: first.completed.resultRevisionId! } });
      const oldPages = Object.keys(first.inspection.index.pages).sort();
      const oldControls = Object.values(first.inspection.index.controls).map(control => ({ guid: control.guid, name: control.name })).sort((left, right) => left.guid.localeCompare(right.guid));
      const updateHeading = (node: unknown): void => {
        if (!node || typeof node !== "object") return;
        const value = node as Record<string, unknown>;
        if (!repeated && value.id === (stateful ? "industrial-factory-title" : "device-status")) value.content = newText;
        if (Array.isArray(value.children)) value.children.forEach(updateHeading);
      };
      golden.plan.pages.forEach(page => updateHeading(page.root));
      if (repeated) golden.plan.mockData[0]!.records[0]!.values[1]!.value = newText;
      if (stateful) golden.plan.localState.find(state => state.id === "continuation-shift-label")!.initialValue = "夜班";
      else {
        if (golden.blueprint.schema !== "kf-design-plan/v3") throw new Error("v3 fixture required");
        const step = golden.blueprint.journeys[0]!.steps[0]!;
        if (step.kind !== "observe") throw new Error("observation fixture required");
        step.expectedTexts = [newText];
      }
      model.forcedIntent = { intent: "MODIFY_REQUIREMENT", requestedDomains: ["kingclient"] };
      const second = await buildTurn(`保留同一工程全部页面和控件，只修改正文${oldText}为${newText}`);
      expect(await prisma.generationSnapshot.findFirstOrThrow({ where: { id: firstSnapshot.id } })).toEqual(firstSnapshot);
      if (repeated) {
        expect(model.observedSemanticInput?.existingGeneratedStructure).toMatchObject({ schema: "kf-generated-project-structure/v2",
          repeaters: [{ id: "device-status", mockDataId: "device-status-data", keyField: "code", maxItems: 10 }],
          mockData: [{ id: "device-status-data", records: [{ values: [{ field: "code", value: "A" }, { field: "label", value: oldText }] }] }] });
        const secondSnapshot = await prisma.generationSnapshot.findFirstOrThrow({ where: { tenantId, workspaceId, revisionId: second.completed.resultRevisionId! } });
        expect((secondSnapshot.content as unknown as { artifact: { semanticPlan: SolutionImplementationPlan } }).artifact.semanticPlan.mockData[0]!.records[0]!.values)
          .toEqual([{ field: "code", value: "A" }, { field: "label", value: newText }]);
      }
      expect(second.completed.resultRevisionId).not.toBe(first.completed.resultRevisionId);
      expect(second.artifact.id).not.toBe(first.artifact.id);
      expect(second.artifact.sha256).not.toBe(first.artifact.sha256);
      expect(Object.keys(second.inspection.index.pages).sort()).toEqual(oldPages);
      expect(Object.values(second.inspection.index.controls).map(control => ({ guid: control.guid, name: control.name })).sort((left, right) => left.guid.localeCompare(right.guid))).toEqual(oldControls);
      const pages = await Promise.all(Object.values(second.inspection.index.pages).map(page => readFile(path.join(second.root, "1.0.0.1", page.file), "utf8")));
      expect(pages.join("\n")).toContain(newText);
      expect(pages.join("\n")).not.toContain(oldText);
      if (!stateful) expect(pages.join("\n")).toContain("设备A 型号：演示设备");
      expect(second.inspection.index.variables).toEqual(first.inspection.index.variables);
      if (stateful) {
        const oldVariables = Object.values(first.inspection.raw.variables).flatMap(value => (value as { Variables: Record<string, unknown>[] }).Variables ?? []);
        const nextVariables = Object.values(second.inspection.raw.variables).flatMap(value => (value as { Variables: Record<string, unknown>[] }).Variables ?? []);
        expect(nextVariables).toHaveLength(oldVariables.length);
        const previousState = oldVariables.find(variable => String(variable.name).includes("continuation_shift_label"))!;
        expect(previousState.defaultValue).toBe("白班");
        const expectedState = structuredClone(previousState);
        expectedState.defaultValue = "夜班"; (expectedState.basicItem as Record<string, unknown>).defaultValue = "夜班";
        expect(nextVariables.find(variable => variable.name === previousState.name)).toEqual(expectedState);
        for (const unrelated of oldVariables.filter(variable => variable.name !== previousState.name)) {
          expect(nextVariables.find(variable => variable.name === unrelated.name)).toEqual(unrelated);
        }
        const snapshots = await prisma.generationSnapshot.findMany({ where: { tenantId, workspaceId, revisionId: second.completed.resultRevisionId! } });
        expect(snapshots).toHaveLength(1);
        expect((snapshots[0]!.content as { materialization: { states: unknown[] } }).materialization.states).toEqual(expect.arrayContaining([expect.objectContaining({ existing: expect.objectContaining({ scope: "workspace-generated-local" }) })]));
      }
      expect(await prisma.buildJob.count({ where: { tenantId, workspaceId } })).toBe(2);
      expect(await prisma.solutionWorkspace.findUniqueOrThrow({ where: { id: workspaceId } })).toMatchObject({ currentRevisionId: second.completed.resultRevisionId });
    } finally { golden = originalGolden; model.forcedIntent = undefined; }
  }, 30000);
  // end
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  it("recovers the real approval graph after the decision memo commits but before its checkpoint without duplicate audit", async () => {
    const id = await conversation();
    await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { generationWorkflow: "legacy" } });
    const initial = await start(id, { type: "message", text: "待审批方案" }).expect(202);
    const initialLease = await store.claim("memo-gap-seed", tenantId, new Date());
    expect(initialLease?.runId).toBe(initial.body.id);
    const changeRequest = await prisma.changeRequest.create({ data: { tenantId, workspaceId, title: "decision checkpoint gap" } });
    const plan = await prisma.changePlan.create({ data: { tenantId, workspaceId, changeRequestId: changeRequest.id, planHash: "memo-gap-plan-hash" } });
    const conversations = app.get(ConversationService);
    const graph = await conversations.getGraph();
    model.forcedIntent = { intent: "CONFIRM_PLAN", requestedDomains: ["kingclient"] };
    try {
      await withAgentRunExecution({ runId: initial.body.id as string, tenantId, ownerId: initialLease!.ownerId, fence: initialLease!.fence, signal: new AbortController().signal }, () => graph.invoke({
        tenantId, userId: "fixture", workspaceId, conversationId: id, runId: initial.body.id as string, runMode: "build", currentRevisionId: initial.body.baseRevisionId as string,
        stage: "approval", activeChangeRequestId: changeRequest.id, changePlanId: plan.id, planHash: plan.planHash,
      }, threadConfig(id)));
    } finally { model.forcedIntent = undefined; }
    await store.append(initialLease!, tenantId, { type: "approval.required", payload: { planHash: plan.planHash } });
    await store.pause(initialLease!, tenantId, "WAITING_APPROVAL");
    const resumed = await start(id, { type: "resume_approval", action: "cancel", expectedRunId: initial.body.id, planHash: plan.planHash }).expect(202);
    const lease = await store.claim("before-checkpoint", tenantId, new Date());
    expect(lease?.runId).toBe(resumed.body.id);
    const memo = createLeaseBoundStepMemo({ steps: new PrismaRunStepStore(prisma), lease: lease!, tenantId });
    const unregister = conversations.registerRunMemo(lease!.runId, { find: (key, hash) => memo.find(key, hash), save: async (key, hash, output) => {
      await memo.save(key, hash, output);
      if (key === "approval-decision") throw new Error("SIMULATED_CHECKPOINT_GAP");
    } });
    try {
      await expect(withAgentRunExecution({ runId: lease!.runId, tenantId, ownerId: lease!.ownerId, fence: lease!.fence, signal: new AbortController().signal }, () => graph.invoke(new Command({
        resume: { action: "cancel", planHash: plan.planHash }, update: { runId: lease!.runId, runMode: "build", planVersion: RUN_PLAN_VERSION },
      }), threadConfig(id)))).rejects.toThrow("SIMULATED_CHECKPOINT_GAP");
    } finally { unregister(); }
    expect(await prisma.agentRunStep.count({ where: { runId: lease!.runId, stepKey: "approval-decision", status: "COMPLETED" } })).toBe(1);
    expect(await prisma.changeRequest.findUnique({ where: { id: changeRequest.id } })).toMatchObject({ status: "OPEN" });
    const pendingSnapshot = await graph.getState(threadConfig(id));
    expect(pendingSnapshot).toMatchObject({ values: { runId: lease!.runId, stage: "approval", planHash: plan.planHash }, next: [] });
    expect(pendingSnapshot.tasks.some(task => task.interrupts.length > 0)).toBe(true);
    await prisma.$executeRaw`UPDATE "AgentRun" SET "leaseExpiresAt" = ${new Date(Date.now() - 1000)} WHERE "id" = ${lease!.runId}`;
    const recovered = await store.recoverExpired("after-checkpoint-gap", tenantId, new Date());
    expect(recovered?.runId).toBe(lease!.runId);
    expect((await service.executeLease(recovered!, new AbortController().signal)).status).toBe("SUCCEEDED");
    expect(await prisma.changeRequest.findUnique({ where: { id: changeRequest.id } })).toMatchObject({ status: "CLOSED" });
    expect(await prisma.auditLog.findMany({ where: { tenantId, resourceId: lease!.runId, action: "PLAN_CANCELLED" } })).toMatchObject([{ detail: { phase: "approval_consumed", planHash: plan.planHash } }]);
    expect(await prisma.buildJob.count({ where: { tenantId, workspaceId } })).toBe(0);
  }, 30000);
  // end
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  it.each(["approve", "revise", "revise-unchanged"] as const)("audits a real native %s decision independently of the later build/replan result", async scenario => {
    const action = scenario === "approve" ? "approve" : "revise";
    const id = await conversation();
    await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { generationWorkflow: "legacy" } });
    const base = await prisma.solutionRevision.findFirstOrThrow({ where: { workspaceId, tenantId } });
    await prisma.solutionRevision.update({ where: { id: base.id }, data: { state: { pages: [{ name: "Main", controls: [] }] } } });
    const initial = await start(id, { type: "message", text: "待审批方案" }).expect(202);
    const lease = await store.claim("native-audit-seed", tenantId, new Date());
    expect(lease?.runId).toBe(initial.body.id);
    const changeRequest = await prisma.changeRequest.create({ data: { tenantId, workspaceId, title: "native audit" } });
    const planJson = { schema: "kf-change-plan/v1", workspaceId, operations: [{ op: "create", entityType: "page", entityId: "native-audit-page", properties: { name: "Audit Page" } }] } satisfies ChangePlan;
    const plan = await prisma.changePlan.create({ data: { tenantId, workspaceId, changeRequestId: changeRequest.id, planHash: canonicalChangePlanHash(planJson), plan: planJson } });
    if (scenario === "revise-unchanged") model.unchangedPlan = planJson;
    const graph = await app.get(ConversationService).getGraph();
    model.forcedIntent = { intent: "CONFIRM_PLAN", requestedDomains: ["kingclient"] };
    try {
      await withAgentRunExecution({ runId: initial.body.id as string, tenantId, ownerId: lease!.ownerId, fence: lease!.fence, signal: new AbortController().signal }, () => graph.invoke({
        tenantId, userId: "fixture", workspaceId, conversationId: id, runId: initial.body.id as string, runMode: "build", currentRevisionId: base.id,
        stage: "approval", activeChangeRequestId: changeRequest.id, changePlanId: plan.id, planHash: plan.planHash,
      }, threadConfig(id)));
    } finally { model.forcedIntent = undefined; }
    await store.append(lease!, tenantId, { type: "approval.required", payload: { planHash: plan.planHash } });
    await store.pause(lease!, tenantId, "WAITING_APPROVAL");
    const requestId = randomUUID();
    const decision = { type: "resume_approval", expectedRunId: initial.body.id, planHash: plan.planHash, action };
    const resumed = await start(id, decision, "build", requestId).expect(202);
    expect((await start(id, decision, "build", requestId).expect(202)).body.id).toBe(resumed.body.id);
    const signal = new AbortController();
    const running = execute(signal.signal);
    const settled = running.then(value => ({ value }), error => ({ error: error as unknown }));
    try {
      if (action === "approve") {
        let bound = false;
        for (let attempt = 0; attempt < 200; attempt++) {
          const row = await prisma.agentRun.findUniqueOrThrow({ where: { id: resumed.body.id as string } });
          if (row.buildJobId) { bound = true; break; }
          if (row.status === "FAILED") throw new Error(`approval failed: ${row.failureCode}`);
          await delay(10);
        }
        expect(bound).toBe(true);
        await request(app.getHttpServer()).post(`/api/runs/${resumed.body.id}/cancel`).set("Cookie", cookie).set("Origin", "http://localhost:5174").expect(200);
        expect((await running).status).toBe("CANCELLED");
      } else {
        expect((await running).status).toBe("WAITING_APPROVAL");
        if (scenario === "revise-unchanged") expect((await graph.getState(threadConfig(id))).values.planHash).toBe(plan.planHash);
        else expect((await graph.getState(threadConfig(id))).values.planHash).not.toBe(plan.planHash);
        const stop = await request(app.getHttpServer()).post(`/api/runs/${resumed.body.id}/cancel`).set("Cookie", cookie).set("Origin", "http://localhost:5174").expect(200);
        expect((await execute()).id).toBe(stop.body.id);
      }
      expect(await prisma.auditLog.findMany({ where: { tenantId, resourceId: resumed.body.id as string, action: action === "approve" ? "PLAN_CONFIRMED" : "PLAN_REVISED" } })).toMatchObject([
        { detail: { phase: "approval_consumed", approvalAction: action, planHash: plan.planHash, expectedRunId: initial.body.id } },
      ]);
    } finally { signal.abort(); await settled; model.unchangedPlan = undefined; }
  }, 30000);
  // end
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  it("keeps a queued requirement out of the blueprint, confirms first, then advances the real delivered baseline", async () => {
    const id = await conversation();
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    const planned = await start(id, { type: "message", text: golden.prompt }, "plan");
    expect(planned.status, JSON.stringify(planned.body)).toBe(202);
    // end
    const queuedText = "后续只讨论，不应进入前一轮蓝图";
    const queued = await start(id, { type: "message", text: queuedText }, "discuss").expect(202);
    expect((await execute()).id).toBe(planned.body.id);
    expect(model.observedBlueprintInput?.recentMessages.some(message => message.content === queuedText)).toBe(false);
    expect(await store.claim("blocked-while-confirming", tenantId, new Date())).toBeNull();
    const current = await request(app.getHttpServer()).get(`/api/conversations/${id}/runs/latest`).set("Cookie", cookie).expect(200);
    expect(current.body.id).toBe(planned.body.id);
    const event = await prisma.agentRunEvent.findFirstOrThrow({ where: { runId: planned.body.id as string, type: "input.required" } });
    const confirmed = await start(id, { type: "confirm_blueprint", expectedRunId: planned.body.id, receipt: (event.payload as { receipt: string }).receipt }).expect(202);
    const controller = new AbortController();
    const running = execute(controller.signal);
    const settled = running.then(value => ({ value }), error => ({ error: error as unknown }));
    try {
      let bound: Awaited<ReturnType<typeof prisma.agentRun.findUnique>> = null;
      for (let attempt = 0; attempt < 500; attempt++) {
        bound = await prisma.agentRun.findUnique({ where: { id: confirmed.body.id as string } });
        if (bound?.buildJobId || bound?.status === "FAILED") break;
        await delay(10);
      }
      expect(bound, JSON.stringify(bound)).toMatchObject({ status: "BUILDING", buildJobId: expect.any(String) });
      expect(await runner.runOnce("queue-real-build", new Date())).toMatchObject({ id: bound!.buildJobId, status: "SUCCEEDED" });
      const result = await running;
      expect(result.status).toBe("SUCCEEDED");
      const following = await execute();
      expect(following).toMatchObject({ id: queued.body.id, status: "SUCCEEDED", baseRevisionId: result.resultRevisionId });
      expect(await prisma.agentRunEvent.findMany({ where: { runId: queued.body.id as string, type: "baseline.changed" } })).toMatchObject([{ payload: { fromRevisionId: planned.body.baseRevisionId, toRevisionId: result.resultRevisionId } }]);
      expect(await prisma.buildJob.count({ where: { tenantId, workspaceId } })).toBe(1);
      // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
      expect(await prisma.auditLog.findMany({ where: { tenantId, resourceId: confirmed.body.id as string, action: "RUN_ACTION_ACCEPTED" } })).toMatchObject([
        { detail: { actionType: "confirm_blueprint", phase: "accepted", expectedRunId: planned.body.id } },
      ]);
      expect(await prisma.auditLog.findMany({ where: { tenantId, resourceId: bound!.buildJobId!, action: "BUILD_START" } })).toMatchObject([{ detail: { runId: confirmed.body.id, phase: "enqueued" } }]);
      expect(await prisma.auditLog.findMany({ where: { tenantId, resourceId: bound!.buildJobId!, action: "BUILD_RESULT" } })).toMatchObject([{ detail: { runId: confirmed.body.id, phase: "completed", status: "SUCCEEDED", resultRevisionId: result.resultRevisionId } }]);
      // end
    } finally { controller.abort(); await settled; }
  }, 30000);

  it.each(["waiting", "entering", "recovering"])("cancels a real native approval checkpoint while %s without releasing queued work onto an external base", async phase => {
    const id = await conversation();
    await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { generationWorkflow: "legacy" } });
    const created = await start(id, { type: "message", text: "查看待审批方案" }).expect(202);
    const lease = await store.claim("approval-seed", tenantId, new Date());
    expect(lease?.runId).toBe(created.body.id);
    const queued = await start(id, { type: "message", text: "审批之后再处理" }, "discuss").expect(202);
    const changeRequest = await prisma.changeRequest.create({ data: { tenantId, workspaceId, title: "pending native approval fixture" } });
    const plan = await prisma.changePlan.create({ data: { tenantId, workspaceId, changeRequestId: changeRequest.id, planHash: "real-pending-hash" } });
    const graph = await app.get(ConversationService).getGraph();
    model.forcedIntent = { intent: "CONFIRM_PLAN", requestedDomains: ["kingclient"] };
    try {
      await withAgentRunExecution({ runId: created.body.id as string, tenantId, ownerId: lease!.ownerId, fence: lease!.fence, signal: new AbortController().signal }, () => graph.invoke({
        tenantId, userId: "fixture", workspaceId, conversationId: id, runId: created.body.id as string, runMode: "build", currentRevisionId: created.body.baseRevisionId as string,
        stage: "approval", activeChangeRequestId: changeRequest.id, changePlanId: plan.id, planHash: plan.planHash,
      }, threadConfig(id)));
    } finally { model.forcedIntent = undefined; }
    expect((await graph.getState(threadConfig(id))).tasks.some(task => task.interrupts.length > 0)).toBe(true);
    await store.append(lease!, tenantId, { type: "approval.required", payload: { planHash: plan.planHash } });
    if (phase === "waiting") await store.pause(lease!, tenantId, "WAITING_APPROVAL");
    const external = await prisma.solutionRevision.create({ data: { tenantId, workspaceId, parentRevisionId: created.body.baseRevisionId as string, revisionNumber: 2 } });
    await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: external.id } });
    const stop = () => request(app.getHttpServer()).post(`/api/runs/${created.body.id}/cancel`).set("Cookie", cookie).set("Origin", "http://localhost:5174");
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    // rollout 停新受理仍必须能消费真实 native interrupt，不能只把状态改为取消。
    process.env.AGENT_RUNS_V2 = "false";
    // end
    const stopped = await stop().expect(200);
    expect((await stop().expect(200)).body.id).toBe(stopped.body.id);
    if (phase === "entering") {
      expect(stopped.body.status).toBe("CANCEL_REQUESTED");
      // 必须先保留真实审批屏障，由下一次领取安排原生 cancel，不能只把状态写成取消。
      expect((await store.pause(lease!, tenantId, "WAITING_APPROVAL")).status).toBe("WAITING_APPROVAL");
    }
    if (phase === "recovering") {
      const expiredAt = new Date(Date.now() - 1000);
      await prisma.$executeRaw`UPDATE "AgentRun" SET "leaseExpiresAt" = ${expiredAt} WHERE "id" = ${created.body.id as string}`;
      const recovered = await store.recoverExpired("approval-recovery", tenantId, new Date());
      expect(recovered?.runId).toBe(created.body.id);
      expect((await service.executeLease(recovered!, new AbortController().signal)).status).toBe("WAITING_APPROVAL");
    }
    const resumed = await execute();
    expect(resumed.status).toBe("SUCCEEDED");
    expect(await prisma.agentRun.findUnique({ where: { id: created.body.id as string } })).toMatchObject({ status: "CANCELLED", supersededByRunId: resumed.id });
    if (phase === "waiting") expect(resumed.id).toBe(stopped.body.id);
    expect((await graph.getState(threadConfig(id))).tasks.some(task => task.interrupts.length > 0)).toBe(false);
    expect(await prisma.agentRunEvent.count({ where: { runId: created.body.id as string, type: "approval.required" } })).toBe(1);
    expect(await prisma.changeRequest.findUnique({ where: { id: changeRequest.id } })).toMatchObject({ status: "CLOSED" });
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    expect(await prisma.auditLog.findMany({ where: { tenantId, resourceId: resumed.id, action: "PLAN_CANCELLED" } })).toMatchObject([
      { detail: { phase: "approval_consumed", planHash: plan.planHash, approvalAction: "cancel", expectedRunId: created.body.id } },
    ]);
    // end
    expect(await store.claim("stale-next", tenantId, new Date())).toBeNull();
    expect(await prisma.agentRun.findUnique({ where: { id: queued.body.id as string } })).toMatchObject({ status: "FAILED", failureCode: "BASE_REVISION_CONFLICT" });
    expect((await request(app.getHttpServer()).get(`/api/conversations/${id}/runs/latest`).set("Cookie", cookie).expect(200)).body.id).toBe(queued.body.id);
    expect(await prisma.buildJob.count({ where: { tenantId, workspaceId } })).toBe(0);
  }, 30000);
  // end
  it("cancels during semantic model work without enqueueing a build afterward", async () => {
    const id = await conversation();
    const planned = await start(id, { type: "message", text: golden.prompt }).expect(202);
    expect((await execute()).status).toBe("WAITING_INPUT");
    const event = await prisma.agentRunEvent.findFirstOrThrow({ where: { runId: planned.body.id as string, type: "input.required" } });
    const confirmed = await start(id, { type: "confirm_blueprint", expectedRunId: planned.body.id, receipt: (event.payload as { receipt: string }).receipt }).expect(202);
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    model.beforePlan = async () => { entered(); await gate; };
    const controller = new AbortController();
    const running = execute(controller.signal);
    try {
      await started;
      const cancelled = await request(app.getHttpServer()).post(`/api/runs/${confirmed.body.id}/cancel`).set("Cookie", cookie).set("Origin", "http://localhost:5174").expect(200);
      expect(cancelled.body.status).toBe("CANCEL_REQUESTED");
      release();
      expect((await running).status).toBe("CANCELLED");
      expect(await prisma.buildJob.count({ where: { tenantId, workspaceId } })).toBe(0);
      expect(await prisma.changePlan.count({ where: { tenantId, workspaceId } })).toBe(0);
    } finally {
      model.beforePlan = undefined;
      release();
      controller.abort();
      await running.catch(() => undefined);
    }
  }, 30000);
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("retries failed confirmed engineering from its original request and requires a fresh displayed blueprint", async () => {
    const id = await conversation();
    const planned = await start(id, { type: "message", text: golden.prompt }).expect(202);
    expect((await execute()).status).toBe("WAITING_INPUT");
    const pending = await prisma.agentRunEvent.findFirstOrThrow({ where: { runId: planned.body.id as string, type: "input.required" } });
    const oldReceipt = (pending.payload as { receipt: string }).receipt;
    const confirmed = await start(id, { type: "confirm_blueprint", expectedRunId: planned.body.id, receipt: oldReceipt }).expect(202);
    model.beforePlan = async () => { throw new Error("injected semantic model rejection"); };
    try { expect(await execute()).toMatchObject({ status: "FAILED", failureCode: "INVALID_MODEL_OUTPUT" }); }
    finally { model.beforePlan = undefined; }
    const clientRequestId = randomUUID();
    const retry = () => request(app.getHttpServer()).post(`/api/runs/${confirmed.body.id}/retry`).set("Cookie", cookie).set("Origin", "http://localhost:5174").send({ clientRequestId });
    const retried = await retry().expect(202);
    expect((await retry().expect(202)).body.id).toBe(retried.body.id);
    expect(await prisma.agentRun.findUniqueOrThrow({ where: { id: retried.body.id as string } })).toMatchObject({
      action: { type: "message", text: golden.prompt }, retryOfRunId: confirmed.body.id,
    });
    expect((await execute()).status).toBe("WAITING_INPUT");
    expect(model.observedBlueprintInput?.requirementText).toBe(golden.prompt);
    const refreshed = await prisma.agentRunEvent.findFirstOrThrow({ where: { runId: retried.body.id as string, type: "input.required" } });
    expect((refreshed.payload as { receipt: string }).receipt).not.toBe(oldReceipt);
    expect(await prisma.buildJob.count({ where: { tenantId, workspaceId } })).toBe(0);
    expect(await prisma.agentRunEvent.count({ where: { runId: retried.body.id as string, type: "approval.required" } })).toBe(0);
    await start(id, { type: "confirm_blueprint", expectedRunId: planned.body.id, receipt: oldReceipt }).expect(409);
    const cancelled = await request(app.getHttpServer()).post(`/api/runs/${retried.body.id}/cancel`).set("Cookie", cookie).set("Origin", "http://localhost:5174").expect(200);
    expect(cancelled.body.status).toBe("CANCELLED");
    await request(app.getHttpServer()).patch(`/api/v2/conversations/${id}`).set("Cookie", cookie).set("Origin", "http://localhost:5174").send({ archived: true }).expect(200);
    const archived = await request(app.getHttpServer()).post(`/api/runs/${retried.body.id}/retry`).set("Cookie", cookie).set("Origin", "http://localhost:5174").send({ clientRequestId: randomUUID() }).expect(409);
    expect(archived.body.message).toBe("CONVERSATION_ARCHIVED");
  }, 30000);
  // end
  it("cancels a queued run once and retries it as a new idempotent run", async () => {
    const id = await conversation();
    const created = await start(id, { type: "message", text: golden.prompt }, "plan").expect(202);
    const cancel = () => request(app.getHttpServer()).post(`/api/runs/${created.body.id}/cancel`).set("Cookie", cookie).set("Origin", "http://localhost:5174");
    expect((await cancel().expect(200)).body.status).toBe("CANCELLED");
    expect((await cancel().expect(200)).body.status).toBe("CANCELLED");
    expect(await store.claim("cancelled-worker", tenantId, new Date())).toBeNull();
    expect(await prisma.agentRunEvent.count({ where: { runId: created.body.id as string, type: "run.cancelled" } })).toBe(1);
    const clientRequestId = randomUUID();
    const retry = () => request(app.getHttpServer()).post(`/api/runs/${created.body.id}/retry`).set("Cookie", cookie).set("Origin", "http://localhost:5174").send({ clientRequestId });
    const retried = await retry().expect(202);
    expect(retried.body.id).not.toBe(created.body.id);
    expect((await retry().expect(202)).body.id).toBe(retried.body.id);
    expect(await prisma.agentRun.findUnique({ where: { id: retried.body.id as string } })).toMatchObject({ retryOfRunId: created.body.id, status: "QUEUED" });
    expect((await execute()).status).toBe("WAITING_INPUT");
  });
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  it("rejects unsupported input and missing origin but serializes concurrent different submissions", async () => {
    const id = await conversation();
    await start(id, { type: "accept_visual_reference", expectedRunId: "old", analysisId: "a", analysisHash: "h" }).expect(400);
    await request(app.getHttpServer()).post(`/api/conversations/${id}/runs`).set("Cookie", cookie).send({ clientRequestId: randomUUID(), clientMessageId: randomUUID(), action: { type: "message", text: "创建页面" } }).expect(403);
    const results = await Promise.all([start(id, { type: "message", text: "创建页面一" }), start(id, { type: "message", text: "创建页面二" })]);
    expect(results.map(result => result.status)).toEqual([202, 202]);
    const completed = await execute();
    expect(completed.status).toBe("WAITING_INPUT");
    const runId = completed.id;
    const queuedId = results.find(result => result.body.id !== runId)!.body.id as string;
    expect(await store.claim("blocked-next", tenantId, new Date())).toBeNull();
    await request(app.getHttpServer()).post(`/api/runs/${queuedId}/cancel`).set("Cookie", cookie).set("Origin", "http://localhost:5174").expect(200);
    await request(app.getHttpServer()).get(`/api/runs/${runId}/events?after=99999`).set("Cookie", cookie).expect(400);
    await request(app.getHttpServer()).get("/api/runs/does-not-exist/events").set("Cookie", cookie).expect(404);
  });
  // end
  it("guards control endpoints against cross-tenant access, stale baselines and unsafe retries", async () => {
    const id = await conversation();
    const created = await start(id, { type: "message", text: golden.prompt }).expect(202);
    const endpoint = `/api/runs/${created.body.id}`;
    await request(app.getHttpServer()).post(`${endpoint}/cancel`).set("Cookie", cookie).expect(403);
    await request(app.getHttpServer()).post(`${endpoint}/retry`).set("Cookie", cookie).set("Origin", "https://evil.example").send({ clientRequestId: randomUUID() }).expect(403);
    await request(app.getHttpServer()).post(`${endpoint}/retry`).set("Cookie", cookie).set("Origin", "http://localhost:5174").send({ clientRequestId: randomUUID() }).expect(409);
    const otherTenant = await prisma.tenant.create({ data: { name: `control-other-${randomUUID()}` } });
    const otherUser = await prisma.user.create({ data: { tenantId: otherTenant.id, username: `other-${randomUUID()}`, passwordHash: "session-only", role: "tenant_admin", mustChangePassword: false } });
    const otherSession = await app.get(SessionService).createSession(otherUser.id);
    const otherCookie = `${SESSION_COOKIE_NAME}=${otherSession.token}`;
    for (const operation of ["cancel", "retry"]) await request(app.getHttpServer()).post(`${endpoint}/${operation}`).set("Cookie", otherCookie).set("Origin", "http://localhost:5174").send({ clientRequestId: randomUUID() }).expect(404);
    await request(app.getHttpServer()).post(`${endpoint}/cancel`).set("Cookie", cookie).set("Origin", "http://localhost:5174").expect(200);
    await request(app.getHttpServer()).post(`${endpoint}/retry`).set("Cookie", cookie).set("Origin", "http://localhost:5174").send({ clientRequestId: " " }).expect(400);
    const baseline = await prisma.solutionWorkspace.findUniqueOrThrow({ where: { id: workspaceId } });
    const nextRevision = await prisma.solutionRevision.create({ data: { tenantId, workspaceId, parentRevisionId: baseline.currentRevisionId, revisionNumber: 2 } });
    await prisma.solutionWorkspace.update({ where: { id: workspaceId }, data: { currentRevisionId: nextRevision.id } });
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    const stale = await request(app.getHttpServer()).post(`${endpoint}/retry`).set("Cookie", cookie).set("Origin", "http://localhost:5174").send({ clientRequestId: randomUUID() });
    expect(stale.status, JSON.stringify({ message: stale.body.message, error: stale.body.error })).toBe(409);
    // end
    expect(stale.body.message).toBe("BASE_REVISION_CONFLICT");
    await prisma.agentRun.update({ where: { id: created.body.id as string }, data: { status: "FAILED", failureCode: "FORBIDDEN" } });
    const forbidden = await request(app.getHttpServer()).post(`${endpoint}/retry`).set("Cookie", cookie).set("Origin", "http://localhost:5174").send({ clientRequestId: randomUUID() }).expect(409);
    expect(forbidden.body.message).toBe("RUN_NOT_RETRYABLE");
  });
  it("enforces discuss/plan, confirms blueprint, waits for a real package and downloads it", async () => {
    const id = await conversation();
    const discussed = await start(id, { type: "message", text: golden.prompt }, "discuss").expect(202);
    expect((await execute()).status).toBe("SUCCEEDED");
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    expect(await prisma.buildJob.count({ where: { tenantId, workspaceId } })).toBe(0);
    // end
    expect(await prisma.message.count({ where: { conversationId: id, role: "assistant" } })).toBe(1);
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    const planned = await start(id, { type: "message", text: golden.prompt }, "plan");
    expect(planned.status, JSON.stringify(planned.body)).toBe(202);
    // end
    expect((await execute()).status).toBe("WAITING_INPUT");
    // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
    expect(await prisma.buildJob.count({ where: { tenantId, workspaceId } })).toBe(0);
    // end
    const pending = await prisma.agentRunEvent.findFirstOrThrow({ where: { runId: planned.body.id as string, type: "input.required" } });
    const receipt = (pending.payload as { receipt: string }).receipt;
    await start(id, { type: "confirm_blueprint", expectedRunId: discussed.body.id, receipt }).expect(409);
    const confirmationId = randomUUID();
    const action = { type: "confirm_blueprint", expectedRunId: planned.body.id, receipt };
    const confirmed = await start(id, action, "build", confirmationId).expect(202);
    expect(await prisma.agentRun.findUnique({ where: { id: planned.body.id as string } })).toMatchObject({ status: "CANCELLED", supersededByRunId: confirmed.body.id });
    expect((await start(id, action, "build", confirmationId).expect(202)).body.id).toBe(confirmed.body.id);
    let settled = false;
    const running = execute().finally(() => { settled = true; });
    let bound: Awaited<ReturnType<typeof prisma.agentRun.findUnique>> = null;
    for (let attempt = 0; attempt < 500; attempt++) {
      bound = await prisma.agentRun.findUnique({ where: { id: confirmed.body.id as string } });
      if (bound?.status === "BUILDING" || bound?.status === "FAILED") break;
      await delay(10);
    }
    expect(bound, JSON.stringify(bound)).toMatchObject({ status: "BUILDING", resultRevisionId: null });
    expect(settled).toBe(false);
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    const snapshotBeforeBuild = await prisma.generationSnapshot.findFirst({ where: { runId: confirmed.body.id as string } });
    // end
    const built = await runner.runOnce("flow-build", new Date());
    expect(built?.status).toBe("SUCCEEDED");
    const completed = await running;
    expect(completed.status).toBe("SUCCEEDED");
    expect(completed.resultRevisionId).toEqual(expect.any(String));
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    expect(snapshotBeforeBuild).toMatchObject({ revisionId: null, buildJobId: null, baseRevisionId: bound!.baseRevisionId });
    const deliveredSnapshot = await prisma.generationSnapshot.findFirstOrThrow({ where: { runId: confirmed.body.id as string } });
    expect(deliveredSnapshot).toMatchObject({ revisionId: completed.resultRevisionId, buildJobId: built!.id, contentHash: snapshotBeforeBuild!.contentHash });
    expect(canonicalServerHash(deliveredSnapshot.content)).toBe(deliveredSnapshot.contentHash);
    // end
    const events = await prisma.agentRunEvent.findMany({ where: { runId: confirmed.body.id as string }, orderBy: { seq: "asc" } });
    expect(events.map(event => event.seq)).toEqual(events.map((_event, index) => index + 1));
    const publicEvents = await request(app.getHttpServer()).get(`/api/runs/${confirmed.body.id}/events`).set("Cookie", cookie).expect(200);
    for (const line of publicEvents.text.split("\n").filter(line => line.startsWith("data: "))) expect(RunEventSchema.safeParse(JSON.parse(line.slice(6))).success).toBe(true);
    const delivery = await request(app.getHttpServer()).get(`/api/conversations/${id}/delivery?buildJobId=${completed.buildJobId}`).set("Cookie", cookie).expect(200);
    expect(delivery.body.projectDelivery.status).toBe("downloadable");
    const token = await request(app.getHttpServer()).post(`/api/artifacts/${delivery.body.artifactId}/download-token`).set("Cookie", cookie).expect(200);
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    const downloaded = await request(app.getHttpServer()).get(`/api/artifacts/download/${token.body.token}`).set("Cookie", cookie);
    expect(downloaded.status, JSON.stringify({ message: downloaded.body.message, error: downloaded.body.error })).toBe(200);
    // end
    expect(Number(downloaded.headers["content-length"])).toBeGreaterThan(1000);
    // 工作区前进后重发原始确认仍返回原 run，不能因为隐式基线改变而冲突。
    expect((await start(id, action, "build", confirmationId).expect(202)).body.id).toBe(confirmed.body.id);
    const latest = await request(app.getHttpServer()).get(`/api/conversations/${id}/runs/latest`).set("Cookie", cookie).expect(200);
    expect(latest.body.id).toBe(confirmed.body.id);
    const eventCount = await prisma.agentRunEvent.count({ where: { runId: confirmed.body.id as string } });
    const stopped = await request(app.getHttpServer()).post(`/api/runs/${confirmed.body.id}/cancel`).set("Cookie", cookie).set("Origin", "http://localhost:5174").expect(200);
    expect(stopped.body.status).toBe("SUCCEEDED");
    expect(await prisma.agentRunEvent.count({ where: { runId: confirmed.body.id as string } })).toBe(eventCount);
    expect(await prisma.artifact.count({ where: { buildJobId: completed.buildJobId! } })).toBeGreaterThan(0);
  }, 60000);
  it("does not publish a package when cancellation wins just before build commit", async () => {
    const id = await conversation();
    const planned = await start(id, { type: "message", text: golden.prompt }).expect(202);
    expect((await execute()).status).toBe("WAITING_INPUT");
    const event = await prisma.agentRunEvent.findFirstOrThrow({ where: { runId: planned.body.id as string, type: "input.required" } });
    const confirmed = await start(id, { type: "confirm_blueprint", expectedRunId: planned.body.id, receipt: (event.payload as { receipt: string }).receipt }).expect(202);
    const controller = new AbortController();
    const running = execute(controller.signal);
    let bound: Awaited<ReturnType<typeof prisma.agentRun.findUnique>> = null;
    for (let attempt = 0; attempt < 500; attempt++) {
      bound = await prisma.agentRun.findUnique({ where: { id: confirmed.body.id as string } });
      if (bound?.buildJobId || bound?.status === "FAILED") break;
      await delay(10);
    }
    expect(bound?.buildJobId, JSON.stringify(bound)).toEqual(expect.any(String));
    const base = await prisma.solutionWorkspace.findUniqueOrThrow({ where: { id: workspaceId } });
    let entered!: () => void;
    let release!: () => void;
    const started = new Promise<void>(resolve => { entered = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const registry = new DomainRegistry();
    registry.register(createKingClientDomainPack({ nativeAccepted: false }));
    const buildRunner = new JobRunner({ prisma, storage: app.get<ArtifactStorage>(ARTIFACT_STORAGE), registry, serverPlanVerifier: app.get(SERVER_PLAN_AUTHORITY), hooks: { beforeCommit: async () => { entered(); await gate; } } });
    const building = buildRunner.runOnce("cancel-at-commit", new Date());
    try {
      await Promise.race([started, building.then(() => { throw new Error("build finished without reaching the intended commit boundary"); })]);
      const requested = await request(app.getHttpServer()).post(`/api/runs/${confirmed.body.id}/cancel`).set("Cookie", cookie).set("Origin", "http://localhost:5174").expect(200);
      expect(requested.body.status).toBe("CANCEL_REQUESTED");
      release();
      expect(await building).toMatchObject({ status: "FAILED", terminalReason: "CANCELLED" });
      expect((await running).status).toBe("CANCELLED");
      expect(await prisma.artifact.count({ where: { buildJobId: bound!.buildJobId! } })).toBe(0);
      expect((await prisma.solutionWorkspace.findUniqueOrThrow({ where: { id: workspaceId } })).currentRevisionId).toBe(base.currentRevisionId);
      const retried = await request(app.getHttpServer()).post(`/api/runs/${confirmed.body.id}/retry`).set("Cookie", cookie).set("Origin", "http://localhost:5174").send({ clientRequestId: randomUUID() }).expect(202);
      expect(retried.body.id).not.toBe(confirmed.body.id);
      // 已取消的构建不能靠重试绕过新一轮蓝图确认。
      expect((await execute()).status).toBe("WAITING_INPUT");
    } finally {
      release();
      controller.abort();
      await Promise.allSettled([building, running]);
    }
  }, 30000);
  it("recovers an orphaned BUILDING run from its original job without regenerating", async () => {
    const id = await conversation();
    const planned = await start(id, { type: "message", text: golden.prompt }).expect(202);
    expect((await execute()).status).toBe("WAITING_INPUT");
    const event = await prisma.agentRunEvent.findFirstOrThrow({ where: { runId: planned.body.id as string, type: "input.required" } });
    const confirmed = await start(id, { type: "confirm_blueprint", expectedRunId: planned.body.id, receipt: (event.payload as { receipt: string }).receipt }).expect(202);
    const shutdown = new AbortController();
    const running = execute(shutdown.signal);
    // 立即安装 rejection handler；进程关闭不是用户取消，状态必须保持可恢复。
    const stopped = running.then(value => ({ value }), error => ({ error: error as unknown }));
    try {
      let bound: Awaited<ReturnType<typeof prisma.agentRun.findUnique>> = null;
      for (let attempt = 0; attempt < 500; attempt++) {
        bound = await prisma.agentRun.findUnique({ where: { id: confirmed.body.id as string } });
        if (bound?.buildJobId || bound?.status === "FAILED") break;
        await delay(10);
      }
      expect(bound, JSON.stringify(bound)).toMatchObject({ status: "BUILDING", buildJobId: expect.any(String) });
      shutdown.abort(new Error("test worker shutdown"));
      expect(await stopped).toHaveProperty("error");
      expect(await prisma.agentRun.findUnique({ where: { id: confirmed.body.id as string } })).toMatchObject({ status: "BUILDING", resultRevisionId: null });
      expect(await runner.runOnce("orphan-build", new Date())).toMatchObject({ id: bound!.buildJobId, status: "SUCCEEDED" });
      const expiredAt = new Date(Date.now() - 1000);
      await prisma.$executeRaw`UPDATE "AgentRun" SET "leaseExpiresAt" = ${expiredAt} WHERE "id" = ${confirmed.body.id as string}`;
      const recovered = await store.recoverExpired("replacement-agent", tenantId, new Date());
      expect(recovered).toMatchObject({ runId: confirmed.body.id, fence: bound!.fence + 1 });
      model.beforePlan = async () => { throw new Error("recovery must not call the model"); };
      const result = await service.executeLease(recovered!, new AbortController().signal);
      expect(result).toMatchObject({ status: "SUCCEEDED", buildJobId: bound!.buildJobId, resultRevisionId: expect.any(String) });
      expect(await prisma.buildJob.count({ where: { tenantId, workspaceId } })).toBe(1);
      expect(await prisma.agentRunEvent.count({ where: { runId: confirmed.body.id as string, type: "run.completed" } })).toBe(1);
      expect(await store.recoverExpired("another-agent", tenantId, new Date())).toBeNull();
    } finally {
      model.beforePlan = undefined;
      shutdown.abort();
      await stopped;
    }
  }, 30000);
});
// end
