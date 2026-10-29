// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../auth/tenant.guard.js";
import { RunController } from "./run.controller.js";
import type { PrismaRunQueries } from "./run-query.service.js";
import type { RunService } from "./run.service.js";
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { EventEmitter } from "node:events";
import { RunEventStreamService } from "./run-event-stream.service.js";
// end

// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
const req = Object.assign(new EventEmitter(), { principal: { tenantId: "t1", userId: "u1" } }) as unknown as AuthenticatedRequest;
// end

const fakeRes = () => {
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  const res = Object.assign(new EventEmitter(), {
    status: vi.fn(),
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    json: vi.fn(),
    writableEnded: false,
    destroyed: false,
    writableLength: 0,
    flushHeaders: () => undefined,
  });
  res.write.mockReturnValue(true);
  // end
  res.status.mockReturnValue(res);
  return res;
};

const controllerWith = (overrides: { runs?: Partial<RunService>; snapshot?: unknown } = {}) => {
  const start = vi.fn(async () => ({ id: "run-1" }));
  const runs = {
    start,
    snapshot: vi.fn(),
    events: vi.fn(async () => []),
    ...overrides.runs,
  } as unknown as RunService;
  const queries = {
    snapshot: vi.fn(async () => overrides.snapshot ?? {
      id: "run-1", tenantId: "t1", workspaceId: "w1", conversationId: "c1",
      status: "SUCCEEDED", lastSeq: 1, baseRevisionId: "", buildJobId: null,
      resultRevisionId: null, failureCode: null, supersededByRunId: null,
    }),
  } as unknown as PrismaRunQueries;
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  const streams = new RunEventStreamService(runs, queries, { isSubscriptionActive: () => Promise.resolve(true) });
  return { controller: new RunController(runs, streams), runs, queries, start };
  // end
};

describe("RunController", () => {
  it("starts a run for the authenticated principal", async () => {
    const { controller, start } = controllerWith();
    await controller.start(req, "c1", { clientRequestId: "r1", clientMessageId: "m1" });
    expect(start).toHaveBeenCalledWith({ tenantId: "t1", userId: "u1" }, "c1",
      expect.objectContaining({ clientRequestId: "r1" }));
  });

  it("rejects a non-numeric cursor before writing any SSE frame", async () => {
    const { controller } = controllerWith();
    const res = fakeRes();
    await expect(controller.events(req, res as never, "run-1", "abc", "10"))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(res.write).not.toHaveBeenCalled();
  });

  it("streams the remaining events and closes on a terminal run", async () => {
    const event = { schemaVersion: 1 as const, runId: "run-1", seq: 1,
      type: "run.queued" as const, createdAt: "2026-10-20T00:00:00.000Z", payload: { mode: "build" } };
    const { controller } = controllerWith({ runs: { events: vi.fn(async () => [event]) } });
    const res = fakeRes();

    await controller.events(req, res as never, "run-1", "0", "10");
    expect(res.write).toHaveBeenCalledWith(expect.stringContaining("id: 1"));
    expect(res.end).toHaveBeenCalled();
  });

  it("returns 404 without opening a stream when the run is unknown", async () => {
    const { controller } = controllerWith({
      runs: { events: vi.fn(async () => { throw new NotFoundException("RUN_NOT_FOUND"); }) },
    });
    const res = fakeRes();
    await controller.events(req, res as never, "missing", "0", "10");
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
  });
});
// end
