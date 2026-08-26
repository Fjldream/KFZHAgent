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
import {
  CONVERSATION_TURN_LEASE,
  ConversationTurnBusyError,
  type ConversationTurnLeasePort,
} from "./conversation-turn-lease.js";
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
        { provide: CONVERSATION_TURN_LEASE, useValue: turnLeasePort() },
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

  it("fails fast on a concurrent confirmation and lets a later replay observe the winner", async () => {
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
    const leasePort = turnLeasePort();
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
        { provide: PG_POOL, useValue: {} },
        { provide: CONVERSATION_TURN_LEASE, useValue: leasePort },
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
    await expect(service.startTurn(principal, "conversation", "确认设计"))
      .rejects.toBeInstanceOf(ConversationTurnBusyError);
    for await (const event of first) void event;
    const replay = await service.startTurn(principal, "conversation", "确认设计");
    for await (const event of replay) void event;

    expect(effects).toEqual({ compile: 1, persist: 1, enqueue: 1 });
    expect(graph.stream).toHaveBeenCalledTimes(2);
    expect(leasePort.acquire).toHaveBeenCalledTimes(3);
    expect(leasePort.release).toHaveBeenCalledTimes(2);
  });

  it("eagerly releases the lease when a returned stream is disposed before iteration", async () => {
    const streamReturn = vi.fn().mockResolvedValue({ done: true, value: undefined });
    mocks.compileSolutionGraph.mockReturnValue({
      getState: vi.fn().mockResolvedValue({ values: { stage: "design-review" }, tasks: [] }),
      stream: vi.fn().mockResolvedValue({
        next: vi.fn(),
        return: streamReturn,
        [Symbol.asyncIterator]() { return this; },
      }),
    });
    const leasePort = turnLeasePort();
    const service = await createService({
      leasePort,
      prisma: {
        solutionWorkspace: {},
        conversation: { findFirst: vi.fn().mockResolvedValue({ id: "conversation", tenantId: "tenant", workspaceId: "workspace" }) },
        message: { create: vi.fn().mockResolvedValue({}) },
      },
    });

    const events = await service.startTurn(
      { userId: "user", tenantId: "tenant", role: "member", sessionId: "session" },
      "conversation",
      "确认设计",
    );
    await events.dispose();

    expect(streamReturn).toHaveBeenCalledTimes(1);
    expect(leasePort.release).toHaveBeenCalledTimes(1);
  });

  it("does not retain the lease when a graph iterator ignores cancellation", async () => {
    const streamReturn = vi.fn().mockReturnValue(new Promise(() => {}));
    mocks.compileSolutionGraph.mockReturnValue({
      getState: vi.fn().mockResolvedValue({ values: { stage: "design-review" }, tasks: [] }),
      stream: vi.fn().mockResolvedValue({
        next: vi.fn(),
        return: streamReturn,
        [Symbol.asyncIterator]() { return this; },
      }),
    });
    const leasePort = turnLeasePort();
    const service = await createService({
      leasePort,
      prisma: {
        solutionWorkspace: {},
        conversation: { findFirst: vi.fn().mockResolvedValue({ id: "conversation", tenantId: "tenant", workspaceId: "workspace" }) },
        message: { create: vi.fn().mockResolvedValue({}) },
      },
    });
    const events = await service.startTurn(
      { userId: "user", tenantId: "tenant", role: "member", sessionId: "session" },
      "conversation",
      "确认设计",
    );

    await expect(settlesWithin(events.dispose(), 100)).resolves.toBeUndefined();
    expect(streamReturn).toHaveBeenCalledTimes(1);
    expect(leasePort.release).toHaveBeenCalledTimes(1);
  });

  it("preserves the graph failure when lease disposal also fails", async () => {
    const graphFailure = new Error("checkpoint unavailable");
    mocks.compileSolutionGraph.mockReturnValue({
      getState: vi.fn().mockRejectedValue(graphFailure),
    });
    const leasePort = turnLeasePort({ releaseError: new Error("advisory unlock failed") });
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
        { provide: PG_POOL, useValue: {} },
        { provide: CONVERSATION_TURN_LEASE, useValue: leasePort },
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
    expect(leasePort.release).toHaveBeenCalledTimes(1);
  });
});

function turnLeasePort(options: { releaseError?: Error } = {}) {
  let active = false;
  const release = vi.fn(async () => {
    active = false;
    if (options.releaseError !== undefined) throw options.releaseError;
  });
  const acquire = vi.fn(async () => {
    if (active) throw new ConversationTurnBusyError();
    active = true;
    let disposed = false;
    return {
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        await release();
      },
    };
  });
  return { acquire, release } satisfies ConversationTurnLeasePort & { release: typeof release };
}

async function createService(input: { leasePort: ConversationTurnLeasePort; prisma: object }) {
  const moduleRef = await Test.createTestingModule({
    providers: [
      ConversationService,
      { provide: PrismaService, useValue: input.prisma },
      { provide: AuditService, useValue: {} },
      { provide: MODEL_PORT, useValue: {} },
      { provide: PG_POOL, useValue: {} },
      { provide: CONVERSATION_TURN_LEASE, useValue: input.leasePort },
      { provide: ARTIFACT_STORAGE, useValue: {} },
      { provide: SERVER_PLAN_AUTHORITY, useValue: {} },
      { provide: CREATIVE_SOLUTION_COMPILER_PORT, useValue: { compile: vi.fn() } },
      { provide: MODULE_ARTIFACT_AUTHORITY, useValue: {} },
      { provide: AssetService, useValue: {} },
      { provide: DeliverySnapshotService, useValue: {} },
      { provide: CAPABILITY_RETRIEVAL_PORT, useValue: { retrieve: vi.fn() } },
    ],
  }).compile();
  return moduleRef.get(ConversationService);
}

async function settlesWithin(promise: Promise<void>, timeoutMs: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      promise,
      new Promise<void>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error("disposal timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
