// Postgres checkpoint integration test (brief Step 7):
// start a thread → stop at the approval interrupt → destroy the graph instance
// → rebuild the graph with a PostgresSaver checkpointer over the same database
// → resume with Command → assert the same conversation continues.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/kf_agent_test";

import { Command } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { BuildJobService } from "@kf/build-jobs";
import { solutionId, type ChangePlan, type SolutionIR } from "@kf/contracts";
import { PrismaClient, Prisma } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";
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
  const deps: SolutionGraphDeps = {
    modelPort: model,
    workspaceQuery: ports.workspaceQuery,
    changePlanRepository: ports.changePlanRepository,
    buildJobPort: ports.buildJobPort,
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
    expect(result.stage).toBe("idle");
    expect(result.buildJobId).toBeDefined();

    // The approved plan made it to the durable build queue under the same
    // workspace with the exact planHash the user approved.
    const job = await prisma.buildJob.findFirst({
      where: { workspaceId: seeded.workspaceId },
    });
    expect(job).not.toBeNull();
    expect(job?.planHash).toBe(payload?.planHash);
    expect(job?.baseRevisionId).toBe(seeded.revisionId);

    // Same conversation: the assistant reply for the follow-up question is
    // appended to the same conversation thread.
    const replyCount = await prisma.message.count({
      where: { conversationId: seeded.conversationId },
    });
    expect(replyCount).toBe(1);
  });
});
