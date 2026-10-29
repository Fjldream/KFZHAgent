// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { describe, expect, it, vi } from "vitest";
import { isCommand } from "@langchain/langgraph";
import type { PrismaClient } from "@prisma/client";
import type { RunAction } from "@kf/contracts";
import { encodeBlueprintConfirmation } from "@kf/agent-orchestrator";
import { createRunHandlerRegistry } from "./run-handler-registry.js";
import type { StepContext } from "./run-execution.service.js";
import { RunPaused } from "./run-executor.js";

function setup(action: RunAction, initial: Record<string, unknown>, final: Record<string, unknown>, next?: string[]) {
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  const run = { id: "r", tenantId: "t", conversationId: "c", workspaceId: "w", requestedByUserId: "u", baseRevisionId: "base", mode: "build", buildJobId: null, status: "RUNNING" };
  // end
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  const prisma = { agentRun: { findFirst: vi.fn(async () => run) }, agentRunEvent: { findFirst: vi.fn(async () => null) }, message: { findFirst: vi.fn(async () => ({ content: "创建工程" })) } } as unknown as PrismaClient;
  // end
  let streamed = false;
  const graph = { getState: vi.fn(async () => ({ values: streamed ? final : initial,
    tasks: initial.stage === "approval" && !streamed ? [{ interrupts: [{ value: { type: "plan-approval", planHash: "hash", summary: "审批方案" } }] }] : [],
    ...(next === undefined ? {} : { next }),
  })), stream: vi.fn(async (input: unknown, config: unknown) => { void input; void config; streamed = true; return (async function* () { yield { classify: {} }; })(); }) };
  const dispose = vi.fn(async () => undefined);
  const unregister = vi.fn();
  const context: StepContext = { runId: "r", tenantId: "t", action, baseRevisionId: "base", stepKey: "graph",
    signal: new AbortController().signal, memo: { find: vi.fn(), save: vi.fn() },
    lease: { runId: "r", ownerId: "owner", fence: 1, expiresAt: new Date().toISOString() }, publish: vi.fn(async () => undefined),
  };
  const handlers = createRunHandlerRegistry({ prisma, loadGraph: async () => graph,
    acquireTurn: async () => ({ dispose }), registerMemo: () => unregister,
  });
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  return { execute: () => handlers.graph!(context), graph, context, dispose, unregister, run };
  // end
}

describe("durable graph action handling", () => {
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("clears visual-derived checkpoint channels before an ordinary message can reach a model", async () => {
    const fixture = setup({ type: "message", text: "创建工程" }, { runId: "old-visual", planVersion: "run-plan@7", stage: "design-review",
      designPlan: { content: "private OCR marker" }, conversationSummary: "private OCR summary", solutionImplementationPlan: { old: "private OCR" },
      acceptedVisualPlanningInput: { old: "consent" } }, { stage: "idle" });
    await fixture.execute();
    const input = fixture.graph.stream.mock.calls[0]![0] as Record<string, unknown>;
    expect(input).toMatchObject({ runId: "r", stage: "idle", designPlan: undefined, conversationSummary: undefined,
      solutionImplementationPlan: undefined, acceptedVisualPlanningInput: null });
    expect(JSON.stringify(input)).not.toContain("private OCR");
  });
  // end
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  it("preserves a committed native interrupt when cancellation arrives before the stream can project it", async () => {
    const fixture = setup({ type: "message", text: "创建工程" }, { stage: "idle" }, {});
    const controller = new AbortController();
    fixture.context.signal = controller.signal;
    fixture.graph.getState.mockResolvedValueOnce({ values: { stage: "idle" }, tasks: [] }).mockResolvedValue({
      values: { runId: "r", stage: "approval", planHash: "hash" }, tasks: [{ interrupts: [{ value: { type: "plan-approval", planHash: "hash", summary: "审批方案" } }] }],
    });
    fixture.graph.stream.mockImplementationOnce(async () => (async function* () {
      fixture.run.status = "CANCEL_REQUESTED";
      controller.abort();
      yield { classify: {} };
    })());
    await expect(fixture.execute()).rejects.toMatchObject({ name: "RunPaused", status: "WAITING_APPROVAL" });
    expect(fixture.context.publish).toHaveBeenCalledWith("approval.required", { planHash: "hash", summary: "审批方案" });
    expect(fixture.dispose).toHaveBeenCalledOnce();
  });
  // end
  it("uses a native Command for approval and shares the turn lease and memo lifetime", async () => {
    const fixture = setup({ type: "resume_approval", expectedRunId: "old", action: "cancel", planHash: "hash" }, { stage: "approval", planHash: "hash" }, { stage: "idle" });
    await fixture.execute();
    expect(isCommand(fixture.graph.stream.mock.calls[0]?.[0])).toBe(true);
    expect(fixture.dispose).toHaveBeenCalledOnce();
    expect(fixture.unregister).toHaveBeenCalledOnce();
  });
  it("refuses mismatched approval before graph execution", async () => {
    const fixture = setup({ type: "resume_approval", expectedRunId: "old", action: "approve", planHash: "stale" }, { stage: "approval", planHash: "hash" }, {});
    await expect(fixture.execute()).rejects.toMatchObject({ code: "PLAN_HASH_MISMATCH" });
    expect(fixture.graph.stream).not.toHaveBeenCalled();
    expect(fixture.dispose).toHaveBeenCalledOnce();
  });
  it("validates exact blueprint revision and hash before continuing", async () => {
    const fixture = setup({ type: "confirm_blueprint", expectedRunId: "old", receipt: encodeBlueprintConfirmation(2, "a".repeat(64)) }, { stage: "design-review", designRevision: 1, designPlanHash: "a".repeat(64) }, {});
    await expect(fixture.execute()).rejects.toMatchObject({ code: "BLUEPRINT_RECEIPT_MISMATCH" });
    expect(fixture.graph.stream).not.toHaveBeenCalled();
  });
  it("projects graph errors as failures, not successful stage returns", async () => {
    const fixture = setup({ type: "message", text: "创建工程" }, { stage: "idle" }, { stage: "idle", lastErrorCode: "CREATIVE_SOLUTION_BLOCKED: diagnostic" });
    await expect(fixture.execute()).rejects.toMatchObject({ code: "CREATIVE_SOLUTION_BLOCKED" });
  });
  it("recovers a completed own blueprint checkpoint without another model call", async () => {
    const fixture = setup({ type: "message", text: "创建工程" }, { runId: "r", stage: "design-review", designRevision: 1, designPlanHash: "a".repeat(64) }, {}, []);
    await expect(fixture.execute()).rejects.toBeInstanceOf(RunPaused);
    expect(fixture.graph.stream).not.toHaveBeenCalled();
    expect(fixture.context.publish).toHaveBeenCalledWith("input.required", { question: "请确认蓝图后继续生成工程", receipt: encodeBlueprintConfirmation(1, "a".repeat(64)) });
  });
});
// end
