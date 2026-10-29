// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { describe, expect, it, vi } from "vitest";
import { VISUAL_RUN_PLAN_VERSION } from "@kf/contracts";
import { PrismaRunQueries } from "./run-query.service.js";
describe("public run retry policy", () => {
  it.each([
    [{ planVersion: VISUAL_RUN_PLAN_VERSION }, null, "new-visual-review"],
    [null, { visualAdmission: { private: "receipt" } }, "new-visual-review"],
    [{ planVersion: "run-plan@6" }, null, "new-run"],
  ] as const)("projects only recovery metadata for %j", async (configSnapshot, inputSnapshot, retryPolicy) => {
    const row = { id: "run", tenantId: "tenant", workspaceId: "workspace", conversationId: "conversation", status: "FAILED", lastSeq: 2,
      baseRevisionId: "base", buildJobId: null, resultRevisionId: null, failureCode: "MODEL_TIMEOUT", supersededByRunId: null, configSnapshot, inputSnapshot };
    const prisma = { agentRun: { findFirst: vi.fn().mockResolvedValue(row) } };
    const snapshot = await new PrismaRunQueries(prisma as never).snapshot("tenant", "run");
    expect(snapshot.retryPolicy).toBe(retryPolicy); expect(snapshot).not.toHaveProperty("configSnapshot"); expect(snapshot).not.toHaveProperty("inputSnapshot");
    expect(JSON.stringify(snapshot)).not.toContain("receipt"); expect(prisma.agentRun.findFirst).toHaveBeenCalledWith({ where: { id: "run", tenantId: "tenant" } });
  });
});
// end
