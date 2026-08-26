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
    const order: string[] = [];
    const streamReturn = vi.fn(async () => {
      order.push("return-settled");
      return { done: true as const, value: undefined };
    });
    mocks.compileSolutionGraph.mockReturnValue({
      getState: vi.fn().mockResolvedValue({ values: { stage: "design-review" }, tasks: [] }),
      stream: vi.fn().mockResolvedValue({
        next: vi.fn(),
        return: streamReturn,
        [Symbol.asyncIterator]() { return this; },
      }),
    });
    const leasePort = turnLeasePort({ onRelease: () => order.push("lease-release") });
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
    expect(order).toEqual(["return-settled", "lease-release"]);
  });

  it("does not admit a same-thread retry until delayed active graph cancellation completes", async () => {
    const order: string[] = [];
    let finishCancellation!: () => void;
    const cancellation = new Promise<void>((resolve) => { finishCancellation = resolve; });
    let finishNext!: (value: IteratorResult<unknown>) => void;
    const source = {
      next: vi.fn(() => new Promise<IteratorResult<unknown>>((resolve) => { finishNext = resolve; })),
      return: vi.fn(async () => {
        order.push("return-start");
        await cancellation;
        order.push("return-settled");
        finishNext({ done: true, value: undefined });
        return { done: true as const, value: undefined };
      }),
      [Symbol.asyncIterator]() { return this; },
    };
    async function* emptySource() { /* later retry */ }
    mocks.compileSolutionGraph.mockReturnValue({
      getState: vi.fn().mockResolvedValue({ values: { stage: "design-review" }, tasks: [] }),
      stream: vi.fn().mockResolvedValueOnce(source).mockResolvedValueOnce(emptySource()),
    });
    const leasePort = turnLeasePort({ onRelease: () => order.push("lease-release") });
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
    const activeNext = events.next();
    await vi.waitFor(() => expect(source.next).toHaveBeenCalledTimes(1));

    const disposing = events.dispose();
    await vi.waitFor(() => expect(source.return).toHaveBeenCalledTimes(1));
    expect(leasePort.release).not.toHaveBeenCalled();
    await expect(service.startTurn(
      { userId: "user", tenantId: "tenant", role: "member", sessionId: "session" },
      "conversation",
      "再次确认设计",
    )).rejects.toBeInstanceOf(ConversationTurnBusyError);

    finishCancellation();
    await disposing;
    await activeNext;

    expect(order).toEqual(["return-start", "return-settled", "lease-release"]);
    expect(leasePort.quarantine).not.toHaveBeenCalled();
    const retry = await service.startTurn(
      { userId: "user", tenantId: "tenant", role: "member", sessionId: "session" },
      "conversation",
      "再次确认设计",
    );
    await retry.dispose();
  });

  it("keeps same-thread admission closed when iterator cancellation fails", async () => {
    const order: string[] = [];
    let finishQuarantine!: () => void;
    const quarantineGate = new Promise<void>((resolve) => { finishQuarantine = resolve; });
    let finishNext!: (value: IteratorResult<unknown>) => void;
    const source = {
      next: vi.fn(() => new Promise<IteratorResult<unknown>>((resolve) => { finishNext = resolve; })),
      return: vi.fn(async () => {
        order.push("return-failed");
        finishNext({ done: true, value: undefined });
        throw new Error("iterator cleanup rejected");
      }),
      [Symbol.asyncIterator]() { return this; },
    };
    mocks.compileSolutionGraph.mockReturnValue({
      getState: vi.fn().mockResolvedValue({ values: { stage: "design-review" }, tasks: [] }),
      stream: vi.fn().mockResolvedValue(source),
    });
    const leasePort = turnLeasePort({
      onRelease: () => order.push("lease-release"),
      quarantineOperation: () => quarantineGate,
    });
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
    const activeNext = events.next();
    await vi.waitFor(() => expect(source.next).toHaveBeenCalledTimes(1));

    const disposal = events.dispose();
    await activeNext;

    expect(order).toEqual(["return-failed"]);
    expect(leasePort.release).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(leasePort.quarantine).toHaveBeenCalledTimes(1));
    await expect(settlesWithin(disposal, 25)).rejects.toThrow("disposal timed out");
    finishQuarantine();
    await disposal;
    await expect(service.startTurn(
      { userId: "user", tenantId: "tenant", role: "member", sessionId: "session" },
      "conversation",
      "再次确认设计",
    )).rejects.toBeInstanceOf(ConversationTurnBusyError);
  });

  it("bounds socket cleanup but retains admission when graph cancellation remains pending", async () => {
    let finishCancellation!: () => void;
    const cancellation = new Promise<void>((resolve) => { finishCancellation = resolve; });
    let finishNext!: (value: IteratorResult<unknown>) => void;
    const source = {
      next: vi.fn(() => new Promise<IteratorResult<unknown>>((resolve) => { finishNext = resolve; })),
      return: vi.fn(async () => {
        await cancellation;
        finishNext({ done: true, value: undefined });
        return { done: true as const, value: undefined };
      }),
      [Symbol.asyncIterator]() { return this; },
    };
    mocks.compileSolutionGraph.mockReturnValue({
      getState: vi.fn().mockResolvedValue({ values: { stage: "design-review" }, tasks: [] }),
      stream: vi.fn().mockResolvedValue(source),
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
    const activeNext = events.next();
    await vi.waitFor(() => expect(source.next).toHaveBeenCalledTimes(1));

    await expect(settlesWithin(events.dispose(), 500)).resolves.toBeUndefined();
    expect(leasePort.release).not.toHaveBeenCalled();
    expect(leasePort.quarantine).toHaveBeenCalledTimes(1);
    await expect(service.startTurn(
      { userId: "user", tenantId: "tenant", role: "member", sessionId: "session" },
      "conversation",
      "再次确认设计",
    )).rejects.toBeInstanceOf(ConversationTurnBusyError);

    finishCancellation();
    await activeNext;
    await vi.waitFor(() => expect(leasePort.release).toHaveBeenCalledTimes(1));
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

function turnLeasePort(options: {
  releaseError?: Error;
  onRelease?: () => void;
  quarantineOperation?: () => Promise<void>;
} = {}) {
  let active = false;
  const release = vi.fn(async () => {
    options.onRelease?.();
    active = false;
    if (options.releaseError !== undefined) throw options.releaseError;
  });
  const quarantine = vi.fn(async () => options.quarantineOperation?.());
  const acquire = vi.fn(async () => {
    if (active) throw new ConversationTurnBusyError();
    active = true;
    let disposed = false;
    return {
      quarantine,
      dispose: async () => {
        if (disposed) return;
        disposed = true;
        await release();
      },
    };
  });
  return { acquire, release, quarantine } satisfies ConversationTurnLeasePort & {
    release: typeof release;
    quarantine: typeof quarantine;
  };
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
