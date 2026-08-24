import { beforeEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";

const mocks = vi.hoisted(() => ({
  compileSolutionGraph: vi.fn<(...args: unknown[]) => unknown>(() => ({ graph: "compiled" })),
  createCheckpointSaver: vi.fn().mockResolvedValue({ saver: "checkpoint" }),
}));

vi.mock("@kf/agent-orchestrator", async () => {
  const actual = await vi.importActual<typeof import("@kf/agent-orchestrator")>("@kf/agent-orchestrator");
  return { ...actual, compileSolutionGraph: mocks.compileSolutionGraph };
});

vi.mock("./checkpointer.js", async () => {
  const actual = await vi.importActual<typeof import("./checkpointer.js")>("./checkpointer.js");
  return { ...actual, createCheckpointSaver: mocks.createCheckpointSaver };
});

import { ARTIFACT_STORAGE } from "../artifacts/artifact-storage.js";
import { AssetService } from "../assets/asset.service.js";
import { AuditService } from "../audit/audit.service.js";
import { DeliverySnapshotService } from "../delivery/delivery-snapshot.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PG_POOL } from "./checkpointer.js";
import { ConversationService } from "./conversation.service.js";
import { CAPABILITY_RETRIEVAL_PORT, CREATIVE_SOLUTION_COMPILER_PORT } from "./graph-ports.js";
import { MODEL_PORT } from "./model-port.js";
import { MODULE_ARTIFACT_AUTHORITY, SERVER_PLAN_AUTHORITY } from "./server-plan-authority.js";

describe("ConversationService graph dependency wiring", () => {
  beforeEach(() => {
    mocks.compileSolutionGraph.mockClear();
    mocks.createCheckpointSaver.mockClear();
  });

  it("passes the CAPABILITY_RETRIEVAL_PORT override to the compiled graph", async () => {
    const injectedRetrieval = { retrieve: vi.fn() };
    const creativeSolutionCompiler = { compile: vi.fn() };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditService, useValue: {} },
        { provide: MODEL_PORT, useValue: {} },
        { provide: PG_POOL, useValue: {} },
        { provide: ARTIFACT_STORAGE, useValue: {} },
        { provide: SERVER_PLAN_AUTHORITY, useValue: {} },
        { provide: CREATIVE_SOLUTION_COMPILER_PORT, useValue: creativeSolutionCompiler },
        { provide: MODULE_ARTIFACT_AUTHORITY, useValue: {} },
        { provide: AssetService, useValue: {} },
        { provide: DeliverySnapshotService, useValue: {} },
        { provide: CAPABILITY_RETRIEVAL_PORT, useValue: injectedRetrieval },
      ],
    }).compile();
    const service = moduleRef.get(ConversationService);

    await (service as unknown as { getGraph(): Promise<unknown> }).getGraph();

    expect(mocks.compileSolutionGraph).toHaveBeenCalledWith(
      expect.objectContaining({
        capabilityRetrieval: injectedRetrieval,
        creativeSolutionCompiler: expect.objectContaining({ compile: expect.any(Function) }),
      }),
      { checkpointer: { saver: "checkpoint" } },
    );
  });

  it("serializes concurrent confirmations for one conversation through the complete graph stream", async () => {
    let stage = "design-review";
    const effects = { compile: 0, persist: 0, enqueue: 0 };
    const graph = {
      getState: vi.fn(async () => ({ values: { stage }, tasks: [] })),
      stream: vi.fn(async (input: { stage: string }) => {
        async function* events() {
          if (input.stage === "design-review") {
            effects.compile += 1;
            effects.persist += 1;
            effects.enqueue += 1;
            stage = "building";
          }
          yield { "compile-creative-solution": { stage } };
        }
        return events();
      }),
    };
    mocks.compileSolutionGraph.mockReturnValue(graph);
    const pool = advisoryLockPool();
    const prisma = {
      solutionWorkspace: {},
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: "conversation", tenantId: "tenant", workspaceId: "workspace" }) },
      message: { create: vi.fn().mockResolvedValue({}) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: {} },
        { provide: MODEL_PORT, useValue: {} },
        { provide: PG_POOL, useValue: pool },
        { provide: ARTIFACT_STORAGE, useValue: {} },
        { provide: SERVER_PLAN_AUTHORITY, useValue: {} },
        { provide: CREATIVE_SOLUTION_COMPILER_PORT, useValue: { compile: vi.fn() } },
        { provide: MODULE_ARTIFACT_AUTHORITY, useValue: {} },
        { provide: AssetService, useValue: {} },
        { provide: DeliverySnapshotService, useValue: {} },
        { provide: CAPABILITY_RETRIEVAL_PORT, useValue: { retrieve: vi.fn() } },
      ],
    }).compile();
    const service = moduleRef.get(ConversationService);
    const principal = { userId: "user", tenantId: "tenant", role: "member" as const, sessionId: "session" };

    const first = await service.startTurn(principal, "conversation", "确认设计");
    let secondSettled = false;
    const secondPromise = service.startTurn(principal, "conversation", "确认设计")
      .then((value) => { secondSettled = true; return value; });
    await Promise.resolve();
    expect(secondSettled).toBe(false);
    for await (const event of first) void event;
    const second = await secondPromise;
    for await (const event of second) void event;

    expect(effects).toEqual({ compile: 1, persist: 1, enqueue: 1 });
    expect(graph.stream).toHaveBeenCalledTimes(2);
    expect(pool.lockCalls).toBe(2);
    expect(pool.unlockCalls).toBe(2);
  });

  it("preserves the graph failure and destroys the connection when advisory unlock fails", async () => {
    const graphFailure = new Error("checkpoint unavailable");
    mocks.compileSolutionGraph.mockReturnValue({
      getState: vi.fn().mockRejectedValue(graphFailure),
    });
    const release = vi.fn();
    const query = vi.fn()
      .mockResolvedValueOnce({ rows: [] })
      .mockRejectedValueOnce(new Error("advisory unlock failed"));
    const pool = { connect: vi.fn().mockResolvedValue({ query, release }) };
    const prisma = {
      solutionWorkspace: {},
      conversation: { findFirst: vi.fn().mockResolvedValue({ id: "conversation", tenantId: "tenant", workspaceId: "workspace" }) },
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: {} },
        { provide: MODEL_PORT, useValue: {} },
        { provide: PG_POOL, useValue: pool },
        { provide: ARTIFACT_STORAGE, useValue: {} },
        { provide: SERVER_PLAN_AUTHORITY, useValue: {} },
        { provide: CREATIVE_SOLUTION_COMPILER_PORT, useValue: { compile: vi.fn() } },
        { provide: MODULE_ARTIFACT_AUTHORITY, useValue: {} },
        { provide: AssetService, useValue: {} },
        { provide: DeliverySnapshotService, useValue: {} },
        { provide: CAPABILITY_RETRIEVAL_PORT, useValue: { retrieve: vi.fn() } },
      ],
    }).compile();
    const service = moduleRef.get(ConversationService);
    const principal = { userId: "user", tenantId: "tenant", role: "member" as const, sessionId: "session" };

    await expect(service.startTurn(principal, "conversation", "确认设计")).rejects.toBe(graphFailure);
    expect(release).toHaveBeenCalledWith(true);
  });
});

function advisoryLockPool() {
  let locked = false;
  const waiters: Array<() => void> = [];
  const pool = {
    lockCalls: 0,
    unlockCalls: 0,
    async connect() {
      return {
        async query(sql: string) {
          if (sql.includes("pg_advisory_lock(")) {
            pool.lockCalls += 1;
            if (locked) await new Promise<void>((resolve) => waiters.push(resolve));
            locked = true;
          } else if (sql.includes("pg_advisory_unlock(")) {
            pool.unlockCalls += 1;
            locked = false;
            waiters.shift()?.();
          }
          return { rows: [] };
        },
        release: vi.fn(),
      };
    },
  };
  return pool;
}
