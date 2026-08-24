import { beforeEach, describe, expect, it, vi } from "vitest";
import { Test } from "@nestjs/testing";

const mocks = vi.hoisted(() => ({
  compileSolutionGraph: vi.fn(() => ({ graph: "compiled" })),
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
import { CAPABILITY_RETRIEVAL_PORT } from "./graph-ports.js";
import { MODEL_PORT } from "./model-port.js";
import {
  CREATIVE_BUILD_FACADE,
  MODULE_ARTIFACT_AUTHORITY,
  SERVER_PLAN_AUTHORITY,
} from "./server-plan-authority.js";

describe("ConversationService graph dependency wiring", () => {
  beforeEach(() => {
    mocks.compileSolutionGraph.mockClear();
    mocks.createCheckpointSaver.mockClear();
  });

  it("passes the CAPABILITY_RETRIEVAL_PORT override to the compiled graph", async () => {
    const injectedRetrieval = { retrieve: vi.fn() };
    const creativeFacade = { authority: {}, compiler: {} };
    const moduleRef = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: PrismaService, useValue: {} },
        { provide: AuditService, useValue: {} },
        { provide: MODEL_PORT, useValue: {} },
        { provide: PG_POOL, useValue: {} },
        { provide: ARTIFACT_STORAGE, useValue: {} },
        { provide: SERVER_PLAN_AUTHORITY, useValue: {} },
        { provide: CREATIVE_BUILD_FACADE, useValue: creativeFacade },
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
});
