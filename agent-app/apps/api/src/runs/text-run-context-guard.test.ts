// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { describe, expect, it, vi } from "vitest";
import { RunExecutionService } from "./run-execution.service.js";
import { RUN_PLAN_VERSION } from "./run-execution-plan.js";
import { assertTextRunBaseMaySend } from "./text-run-context-guard.js";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { readFileSync } from "node:fs";
import { canonicalServerHash } from "@kf/contracts";
import { buildGenerationSnapshotContent } from "@kf/domain-client";
// end

function bed(snapshots: unknown[]) {
  const model = { classifyIntent: vi.fn(), createDesignPlan: vi.fn(), createSolutionImplementationPlan: vi.fn() };
  const run = { id: "run", tenantId: "tenant", workspaceId: "workspace", conversationId: "conversation", baseRevisionId: "base",
    configSnapshot: { schemaVersion: 1, planVersion: RUN_PLAN_VERSION }, action: { type: "message", text: "继续修改" } };
  const prisma = { agentRun: { findUnique: vi.fn().mockResolvedValue(run) }, generationSnapshot: { findMany: vi.fn().mockResolvedValue(snapshots) } };
  const store = { finish: vi.fn(async (_lease, _tenant, status, failureCode) => ({ status, failureCode })) };
  const execute = vi.fn(async () => { await model.classifyIntent(); await model.createDesignPlan(); await model.createSolutionImplementationPlan(); return { status: "SUCCEEDED" }; });
  const service = new RunExecutionService({ prisma, store, steps: {}, handlers: {}, executor: { execute } } as never);
  return { run, prisma, store, model, execute, call: () => service.executeLease({ runId: "run", ownerId: "worker", fence: 1, expiresAt: "2099-01-01T00:00:00.000Z" }, new AbortController().signal) };
}
describe("ordinary run visual content privacy preflight", () => {
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("preserves the regeneration diagnostic before handlers or provider access for an old generated long-name base", async () => {
    const legacy = JSON.parse(readFileSync(new URL("../../../../tests/fixtures/creative-legacy-runtime-names-20261027.json", import.meta.url), "utf8"));
    const envelope = legacy.envelope;
    const content = buildGenerationSnapshotContent({ workspaceId: envelope.trustedNativeMaterialization.workspaceId,
      baseRevisionId: envelope.trustedNativeMaterialization.baseRevisionId, artifact: envelope.creativeArtifact,
      materialization: envelope.trustedNativeMaterialization, assetManifest: [], visual: null });
    const value = bed([{ visualSpecId: null, content, contentHash: canonicalServerHash(content) }]);
    value.run.workspaceId = content.materialization.workspaceId;
    value.run.baseRevisionId = content.materialization.baseRevisionId;
    await expect(value.call()).resolves.toMatchObject({ status: "FAILED", failureCode: "CREATIVE_GENERATED_NATIVE_NAME_REGENERATION_REQUIRED" });
    expect(value.execute).not.toHaveBeenCalled();
    Object.values(value.model).forEach(spy => expect(spy).not.toHaveBeenCalled());
  });
  // end
  it.each([
    ["relational source marker", [{ visualSpecId: "visual-analysis", content: { visual: null }, contentHash: "irrelevant" }]],
    ["image-derived snapshot content", [{ visualSpecId: null, content: { visual: { spec: { regions: [{ text: ["private OCR marker"] }] } } }, contentHash: "irrelevant" }]],
  ])("rejects %s before cache, handlers or any model call", async (_case, snapshots) => {
    const value = bed(snapshots);
    await expect(value.call()).resolves.toMatchObject({ status: "FAILED", failureCode: "VISUAL_EXISTING_CONTENT_RECONSENT_REQUIRED" });
    expect(value.execute).not.toHaveBeenCalled();
    Object.values(value.model).forEach(spy => expect(spy).not.toHaveBeenCalled());
    expect(value.prisma.generationSnapshot.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: "tenant", workspaceId: "workspace", revisionId: "base" }, take: 2 }));
  });
  it("rejects corrupt or ambiguous provenance before model access", async () => {
    for (const rows of [[{ visualSpecId: null, content: {}, contentHash: "corrupt" }], [{ visualSpecId: null, content: { visual: null } }, { visualSpecId: null, content: { visual: null } }]]) {
      const value = bed(rows); await expect(value.call()).resolves.toMatchObject({ failureCode: "SOLUTION_EXISTING_CONTEXT_INVALID" });
      expect(value.execute).not.toHaveBeenCalled(); Object.values(value.model).forEach(spy => expect(spy).not.toHaveBeenCalled());
    }
  });
  it("keeps an initial ordinary generation enabled without a generated base", async () => {
    const value = bed([]); await expect(value.call()).resolves.toMatchObject({ status: "SUCCEEDED" });
    expect(value.model.classifyIntent).toHaveBeenCalledTimes(1);
  });
  it("does not query a floating latest revision when the run has no fixed base", async () => {
    const value = bed([]); await assertTextRunBaseMaySend(value.prisma as never, { ...value.run, baseRevisionId: null });
    expect(value.prisma.generationSnapshot.findMany).not.toHaveBeenCalled();
  });
});
// end
