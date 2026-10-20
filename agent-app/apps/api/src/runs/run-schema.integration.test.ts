// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/kf_agent_test_agent_next";

import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({
  url: process.env.DATABASE_URL,
  allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET,
  expectedPrefix: "kf_agent_test_",
});

import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let prisma: PrismaClient;
const tenantIds: string[] = [];
const workspaceIds: string[] = [];
const conversationIds: string[] = [];

type Scope = { tenantId: string; workspaceId: string; conversationId: string };

const createScope = async (label: string): Promise<Scope> => {
  const tenant = await prisma.tenant.create({ data: { name: `${label}-${randomUUID()}` } });
  tenantIds.push(tenant.id);
  const workspace = await prisma.solutionWorkspace.create({
    data: { tenantId: tenant.id, name: `${label}-ws-${randomUUID()}` },
  });
  workspaceIds.push(workspace.id);
  const conversation = await prisma.conversation.create({
    data: { tenantId: tenant.id, workspaceId: workspace.id, title: `${label}-conv` },
  });
  conversationIds.push(conversation.id);
  return { tenantId: tenant.id, workspaceId: workspace.id, conversationId: conversation.id };
};

const runData = (scope: Scope, overrides: Record<string, unknown> = {}) => ({
  tenantId: scope.tenantId,
  workspaceId: scope.workspaceId,
  conversationId: scope.conversationId,
  requestedByUserId: "user-1",
  clientRequestId: randomUUID(),
  requestHash: "hash",
  mode: "build",
  action: { type: "message", text: "生成页面" },
  baseRevisionId: null,
  ...overrides,
});

beforeAll(() => {
  prisma = new PrismaClient();
});

afterAll(async () => {
  await prisma.agentRun.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.message.deleteMany({ where: { tenantId: { in: tenantIds } } });
  await prisma.conversation.deleteMany({ where: { id: { in: conversationIds } } });
  await prisma.solutionWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
  await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
  await prisma.$disconnect();
});

describe("agent run schema constraints", () => {
  it("rejects a run whose conversation belongs to another tenant", async () => {
    const tenantA = await createScope("a");
    const tenantB = await createScope("b");

    await expect(prisma.agentRun.create({
      data: runData(tenantA, { conversationId: tenantB.conversationId }),
    })).rejects.toThrow();

    await expect(prisma.agentRun.create({
      data: runData(tenantA, { workspaceId: tenantB.workspaceId }),
    })).rejects.toThrow();
  });

  it("enforces idempotency on tenant, conversation and clientRequestId", async () => {
    const scope = await createScope("idem");
    const clientRequestId = randomUUID();
    await prisma.agentRun.create({ data: runData(scope, { clientRequestId }) });

    await expect(prisma.agentRun.create({ data: runData(scope, { clientRequestId }) }))
      .rejects.toThrow();
  });

  it("keeps event sequence unique per run and cascades on run deletion", async () => {
    const scope = await createScope("events");
    const run = await prisma.agentRun.create({ data: runData(scope) });

    await prisma.agentRunEvent.create({
      data: { runId: run.id, tenantId: scope.tenantId, seq: 1, type: "run.queued", payload: { mode: "build" } },
    });
    await expect(prisma.agentRunEvent.create({
      data: { runId: run.id, tenantId: scope.tenantId, seq: 1, type: "run.started", payload: { attempt: 1 } },
    })).rejects.toThrow();

    await prisma.agentRun.delete({ where: { id: run.id } });
    expect(await prisma.agentRunEvent.count({ where: { runId: run.id } })).toBe(0);
  });

  it("keeps legacy messages readable after the additive migration", async () => {
    const scope = await createScope("legacy");
    const legacy = await prisma.message.create({
      data: { tenantId: scope.tenantId, conversationId: scope.conversationId, role: "user", content: "旧消息正文" },
    });

    const found = await prisma.message.findMany({ where: { conversationId: scope.conversationId } });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: legacy.id, content: "旧消息正文", runId: null, clientMessageId: null, parts: null });
  });
});
// end
