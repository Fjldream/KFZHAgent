// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { describe, expect, it, vi } from "vitest";
import { RunAborted } from "./run-executor.js";
import { runGraphOnce, type GraphLike } from "./run-graph-runner.js";

const graph = (options: {
  chunks?: unknown[];
  interrupts?: unknown[];
  stage?: string;
}): GraphLike => ({
  stream: vi.fn(async () => (async function* () {
    for (const chunk of options.chunks ?? []) yield chunk;
  })()),
  getState: vi.fn(async () => ({
    tasks: [{ interrupts: [...(options.interrupts ?? [])] }],
    values: (options.stage === undefined
      ? {}
      : { stage: options.stage }) as Record<string, unknown>,
  })),
});

describe("runGraphOnce", () => {
  it("reports completion with the final stage", async () => {
    const outcome = await runGraphOnce({
      graph: graph({ chunks: [{ node: "load-context" }], stage: "done" }),
      input: { tenantId: "t1" },
      conversationId: "c1",
    });
    expect(outcome).toEqual({ kind: "completed", stage: "done" });
  });

  it("reports an interruption instead of success when the graph pauses for approval", async () => {
    const outcome = await runGraphOnce({
      graph: graph({ interrupts: [{ type: "plan-approval", planHash: "h" }], stage: "approval" }),
      input: {},
      conversationId: "c1",
    });
    expect(outcome).toEqual({ kind: "interrupted" });
  });

  it("stops when the signal is aborted mid-stream", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(runGraphOnce({
      graph: graph({ chunks: [1, 2], stage: "done" }),
      input: {},
      conversationId: "c1",
      signal: controller.signal,
    })).rejects.toBeInstanceOf(RunAborted);
  });

  it("treats a missing stage as null rather than guessing", async () => {
    const outcome = await runGraphOnce({ graph: graph({}), input: {}, conversationId: "c1" });
    expect(outcome).toEqual({ kind: "completed", stage: null });
  });
});
// end
