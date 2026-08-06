import { describe, expect, it } from "vitest";
import { Command, MemorySaver } from "@langchain/langgraph";
import { deriveGuid, planHash } from "@kf/domain-client";
import { solutionId, type ChangePlan, type DesignPlan, type SolutionIR } from "@kf/contracts";
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
  plans = new Map<string, { planHash: string }>();
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
  async savePlan(input: { id: string; planHash: string }): Promise<void> {
    this.plans.set(input.id, { planHash: input.planHash });
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
  createdPlans: ChangePlan[] = [];
  /** When true, createChangePlan/reviseChangePlan return a schema-invalid plan. */
  invalidPlan = false;
  /** When true, classifyIntent returns a schema-invalid intent (I1). */
  invalidIntent = false;
  /** When true, createProjectDesign returns a schema-invalid design (I1). */
  invalidDesign = false;
  private seq = 0;

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

  async createDesignPlan(): Promise<DesignPlan> {
    return {
      schema: "kf-design-plan/v1",
      displayName: "设计",
      summary: "设计",
      layoutConcept: "布局",
      styleDirection: "风格",
      sections: [{ id: "main", label: "主区", controls: [{ type: "text" }] }],
      signature: "签名",
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
}

interface Bed {
  deps: SolutionGraphDeps;
  graph: CompiledGraph;
  workspace: FakeWorkspaceQuery;
  repo: FakeChangePlanRepository;
  builds: FakeBuildJobPort;
  model: FakeModelPort;
}

function createBed(): Bed {
  const workspace = new FakeWorkspaceQuery();
  const repo = new FakeChangePlanRepository();
  const builds = new FakeBuildJobPort();
  const model = new FakeModelPort();
  const deps: SolutionGraphDeps = {
    modelPort: model,
    workspaceQuery: workspace,
    changePlanRepository: repo,
    buildJobPort: builds,
    isDomainSupported: () => true,
  };
  const graph = compileSolutionGraph(deps, { checkpointer: new MemorySaver() });
  return { deps, graph, workspace, repo, builds, model };
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
  bed.model.queueIntent("NEW_REQUIREMENT");
  await sendUser(bed, ctx, text);
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
    expect(bed.model.createCalls).toHaveLength(1);
    expect(bed.model.createCalls[0]?.currentRevisionId).toBe(REVISION_1);
    expect(bed.repo.plans.size).toBe(1);
    expect(bed.repo.statusOf(`cr:${WORKSPACE_ID}:${CONVERSATION_ID}`)).toBe("OPEN");
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

    expect(bed.model.reviseCalls).toHaveLength(1);
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
      domainKind: "kingclient",
    });
    expect(result.buildJobId).toBe("job-1");
    expect(result.stage).toBe("preview-review");
    expect(bed.repo.statusOf(payload.changeRequestId)).toBe("APPROVED");
  });

  it("build success enters preview-review with a hint message; CONFIRM_BUILD lands (stage=done)", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");

    const built = await approve(bed, ctx, payload);

    expect(built.stage).toBe("preview-review");
    expect(built.buildJobId).toBe("job-1");
    expect(bed.workspace.appendCalls).toContainEqual(
      expect.objectContaining({
        role: "assistant",
        content: expect.stringContaining("确认落地"),
      }),
    );

    // 预览反馈循环：用户确认落地 → 终态 done
    bed.model.queueIntent("CONFIRM_BUILD");
    await sendUser(bed, ctx, "确认落地");
    const landed = await bed.graph.invoke(
      { ...input(ctx), stage: "preview-review" },
      config(ctx),
    );

    expect(landed.stage).toBe("done");
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
    expect(result.designRevision).toBe(1);
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
    expect(bed.model.reviseCalls).toHaveLength(1);
  });

  it("preview feedback is re-classified by keywords when the model disagrees (preview-review fallback)", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");
    await approve(bed, ctx, payload);

    // 模型把"确认落地"分类成 QUESTION，但预览阶段的确认词兜底为 CONFIRM_BUILD
    bed.model.queueIntent("QUESTION");
    await sendUser(bed, ctx, "确认落地");
    const result = await bed.graph.invoke(
      { ...input(ctx), stage: "preview-review" },
      config(ctx),
    );

    expect(result.stage).toBe("done");
  });

  it("keeps a pending approval resumable when a non-resume message arrives", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    const payload = await planNewRequirement(bed, ctx, "新增一个按钮");

    // A plain (non-resume) message while paused must be rejected, not silently
    // turn the approval into idle.
    bed.model.queueIntent("QUESTION");
    await sendUser(bed, ctx, "还在吗");
    await expect(bed.graph.invoke(input(ctx), config(ctx))).rejects.toThrow(
      ApprovalResumeRequiredError,
    );

    // The rejected plain message produced no assistant reply.
    expect(bed.workspace.appendCalls.filter((call) => call.role === "assistant")).toHaveLength(0);

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
    const result = await bed.graph.invoke(input(ctx), config(ctx));

    expect(result.stage).toBe("planning");
    expect(result.lastErrorCode).toBe("BUILD_FAILED");
    expect(result.buildJobId).toBe(jobId);
  });

  it("returns to idle and refreshes the current revision after a successful build", async () => {
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
    const result = await bed.graph.invoke(input(ctx), config(ctx));

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

    expect(bed.model.createCalls).toHaveLength(2);
    expect(bed.model.createCalls[1]?.currentRevisionId).toBe("rev-2");
    expect(second).toBeDefined();
    expect(second?.planHash).not.toBe(payload.planHash);
  });

  it("rejects an invalid model plan with INVALID_MODEL_OUTPUT and no side effects", async () => {
    const bed = createBed();
    const ctx = seed(bed);
    bed.model.queueIntent("NEW_REQUIREMENT");
    bed.model.invalidPlan = true;
    await sendUser(bed, ctx, "新增一个按钮");

    const result = await bed.graph.invoke(input(ctx), config(ctx));

    expect(result.lastErrorCode).toBe("INVALID_MODEL_OUTPUT");
    expect(result.stage).toBe("idle");
    expect(bed.repo.plans.size).toBe(0);
    expect(bed.builds.enqueues).toHaveLength(0);
    // The user message is recorded, but no assistant reply is fabricated.
    expect(bed.workspace.appendCalls.filter((call) => call.role === "assistant")).toHaveLength(0);
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

  it("rejects an invalid project design with INVALID_MODEL_OUTPUT and no summary side effect (I1)", async () => {
    const bed = createBed();
    // Brand-new workspace: no current revision yet → createProjectDesign path.
    const ctx: Ctx = {
      tenantId: TENANT_ID,
      userId: USER_ID,
      workspaceId: WORKSPACE_ID,
      conversationId: CONVERSATION_ID,
    };
    bed.model.queueIntent("NEW_REQUIREMENT");
    bed.model.invalidDesign = true;
    await sendUser(bed, ctx, "请新建一个工程");

    const result = await bed.graph.invoke(input(ctx), config(ctx));

    expect(result.lastErrorCode).toBe("INVALID_MODEL_OUTPUT");
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
    // Keep the invoke result referenced: under vitest's transform an unused
    // return value can let the final checkpoint flush be skipped, making the
    // following getState() miss the interrupt.
    const held2 = await bed.graph.invoke(input(ctx), config(ctx));
    void held2;
    const payload2 = await interruptPayload(bed, ctx);
    expect(payload2).toBeDefined();
    expect(payload2?.planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(bed.model.createCalls).toHaveLength(1);
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
    const held4 = await bed.graph.invoke(input(ctx), config(ctx));
    void held4;
    const payload4 = await interruptPayload(bed, ctx);
    expect(payload4).toBeDefined();
    expect(bed.model.createCalls).toHaveLength(2);
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
    // plan the model produced, so approve → enqueue builds the approved plan.
    expect(bed.model.createdPlans).toHaveLength(1);
    expect(payload.planHash).toBe(planHash(bed.model.createdPlans[0] as unknown));
    // And it is the same hash persisted for the deterministic plan id.
    expect(bed.repo.plans.has(`plan:${WORKSPACE_ID}:${payload.planHash}`)).toBe(true);
  });
});
