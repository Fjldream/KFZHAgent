// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 仅测试 import 的 fixture，不进入生产导出。
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaRunStore, type StartRunInput } from "./run-store.js";

export type RunTestFixture = {
  prisma: PrismaClient;
  store: PrismaRunStore;
  tenantA: string;
  tenantB: string;
  conversationA: string;
  conversationB: string;
  workspaceA: string;
  /** 每个用例开一个新会话，避免排队任务互相干扰 claim。 */
  newConversation: () => Promise<string>;
  /** 清空两个租户下的 run 相关数据，让 claim 类用例从确定状态开始。 */
  resetRuns: () => Promise<void>;
  cleanup: () => Promise<void>;
};

type Scope = { tenantId: string; workspaceId: string; conversationId: string };

const scopeCache = new WeakMap<PrismaClient, Scope[]>();

const createScope = async (prisma: PrismaClient, label: string, scopes: Scope[]): Promise<Scope> => {
  const tenant = await prisma.tenant.create({ data: { name: `${label}-${randomUUID()}` } });
  const workspace = await prisma.solutionWorkspace.create({
    data: { tenantId: tenant.id, name: `${label}-ws-${randomUUID()}` },
  });
  const conversation = await prisma.conversation.create({
    data: { tenantId: tenant.id, workspaceId: workspace.id, title: `${label}-conv` },
  });
  const scope = { tenantId: tenant.id, workspaceId: workspace.id, conversationId: conversation.id };
  scopes.push(scope);
  return scope;
};

export async function createRunTestFixture(leaseMs = 30_000): Promise<RunTestFixture> {
  const prisma = new PrismaClient();
  const scopes: Scope[] = [];
  scopeCache.set(prisma, scopes);

  const a = await createScope(prisma, "run-a", scopes);
  const b = await createScope(prisma, "run-b", scopes);

  return {
    prisma,
    store: new PrismaRunStore(prisma, leaseMs),
    tenantA: a.tenantId,
    tenantB: b.tenantId,
    conversationA: a.conversationId,
    conversationB: b.conversationId,
    workspaceA: a.workspaceId,
    newConversation: async () => {
      const conversation = await prisma.conversation.create({
        data: { tenantId: a.tenantId, workspaceId: a.workspaceId, title: `run-fresh-${randomUUID()}` },
      });
      return conversation.id;
    },
    resetRuns: async () => {
      const tenantIds = [a.tenantId, b.tenantId];
      const runs = await prisma.agentRun.findMany({
        where: { tenantId: { in: tenantIds } },
        select: { id: true },
      });
      const runIds = runs.map((run) => run.id);
      await prisma.agentRunEvent.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.agentRunStep.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.modelInvocation.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.budgetReservation.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.runBudget.deleteMany({ where: { runId: { in: runIds } } });
      await prisma.agentRun.deleteMany({ where: { id: { in: runIds } } });
    },
    cleanup: async () => {
      const tenantIds = scopes.map((scope) => scope.tenantId);
      const runs = await prisma.agentRun.findMany({
        where: { tenantId: { in: tenantIds } },
        select: { id: true },
      });
      await prisma.agentRunEvent.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.agentRunStep.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.modelInvocation.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.budgetReservation.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.runBudget.deleteMany({ where: { runId: { in: runs.map((run) => run.id) } } });
      await prisma.agentRun.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.message.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.conversation.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.solutionWorkspace.deleteMany({ where: { tenantId: { in: tenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
      await prisma.$disconnect();
    },
  };
}

export const messageInput = (
  fixture: RunTestFixture,
  clientRequestId: string,
  text: string,
  overrides: Partial<StartRunInput> = {},
): StartRunInput => ({
  tenantId: fixture.tenantA,
  userId: "user-a",
  conversationId: fixture.conversationA,
  clientRequestId,
  clientMessageId: `msg-${clientRequestId}`,
  mode: "build",
  action: { type: "message", text },
  attachmentIds: [],
  ...overrides,
});
// end
