// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AuthenticatedRequest } from "../auth/tenant.guard.js";
import { RunController } from "./run.controller.js";
import type { PrismaRunQueries } from "./run-query.service.js";
import type { RunService } from "./run.service.js";

const req = { principal: { tenantId: "t1", userId: "u1" } } as unknown as AuthenticatedRequest;

const fakeRes = () => {
  const res = {
    status: vi.fn(),
    setHeader: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    json: vi.fn(),
    writableEnded: false,
  };
  res.status.mockReturnValue(res);
  return res;
};

const controllerWith = (overrides: { runs?: Partial<RunService>; snapshot?: unknown } = {}) => {
  const runs = {
    start: vi.fn(async () => ({ id: "run-1" })),
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
  return { controller: new RunController(runs, queries), runs, queries };
};

describe("RunController", () => {
  it("starts a run for the authenticated principal", async () => {
    const { controller, runs } = controllerWith();
    await controller.start(req, "c1", { clientRequestId: "r1", clientMessageId: "m1" });
    expect(runs.start).toHaveBeenCalledWith({ tenantId: "t1", userId: "u1" }, "c1",
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
      runs: { events: vi.fn(async () => { throw new BadRequestException("INVALID_CURSOR"); }) },
    });
    const res = fakeRes();
    await controller.events(req, res as never, "missing", "0", "10");
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
  });
});
// end
