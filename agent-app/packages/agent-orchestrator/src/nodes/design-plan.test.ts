import { describe, expect, it, vi } from "vitest";
import { createDesignPlanNode } from "./design-plan.js";
import { createPlanChangeNode } from "./plan-change.js";
import { intentValues } from "../schemas/intent.js";
import type { DesignPlan } from "@kf/contracts";

const designPlan: DesignPlan = {
  schema: "kf-design-plan/v1",
  displayName: "监控大屏",
  summary: "深色工业风",
  layoutConcept: "顶部标题 + 中部趋势区",
  styleDirection: "深色工业风",
  sections: [{ id: "kpi", label: "KPI 区", controls: [{ type: "text", text: "产量" }] }],
  signature: "趋势联动 KPI",
};

function makeDesignDeps() {
  const modelPort = { createDesignPlan: vi.fn().mockResolvedValue(designPlan) };
  const workspaceQuery = { appendMessage: vi.fn().mockResolvedValue(undefined) };
  return {
    deps: { modelPort, workspaceQuery } as never,
    modelPort,
    workspaceQuery,
  };
}

function baseState(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: "t1",
    userId: "u1",
    workspaceId: "w1",
    conversationId: "c1",
    recentMessages: [{ id: "m1", role: "user", content: "生成监控大屏" }],
    requirementText: "生成监控大屏",
    stage: "design-review",
    ...overrides,
  };
}

describe("intent schema design-loop values", () => {
  it("adds CONFIRM_DESIGN and REVISE_DESIGN to the intent enum", () => {
    expect(intentValues).toContain("CONFIRM_DESIGN");
    expect(intentValues).toContain("REVISE_DESIGN");
  });
});

describe("design-plan node", () => {
  it("generates a design plan, hashes it, shows it, and returns to design-review", async () => {
    const { deps, modelPort, workspaceQuery } = makeDesignDeps();
    const node = createDesignPlanNode(deps);
    const update = await node(baseState() as never);

    expect(update.designPlan).toEqual(designPlan);
    expect(update.designPlanHash).toMatch(/^[0-9a-f]{64}$/);
    expect(update.designRevision).toBe(1);
    expect(update.stage).toBe("design-review");
    expect(update.revising).toBeUndefined();
    expect(modelPort.createDesignPlan).toHaveBeenCalledWith(
      expect.objectContaining({ requirementText: "生成监控大屏", conversationId: "c1" }),
      { revising: false },
    );
    expect(workspaceQuery.appendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "t1",
        conversationId: "c1",
        role: "assistant",
        content: expect.stringContaining("设计计划"),
      }),
    );
  });

  it("shows the display name, style, sections and the confirm/revise prompt", async () => {
    const { deps, workspaceQuery } = makeDesignDeps();
    const node = createDesignPlanNode(deps);
    await node(baseState() as never);

    const content = workspaceQuery.appendMessage.mock.calls[0]?.[0]?.content as string;
    expect(content).toContain("设计计划 v1");
    expect(content).toContain("监控大屏");
    expect(content).toContain("深色工业风");
    expect(content).toContain("KPI 区");
    expect(content).toContain("回复调整意见或「确认」");
  });

  it("revises (not regenerates) when revising=true, bumping revision and changing the hash", async () => {
    const { deps, modelPort, workspaceQuery } = makeDesignDeps();
    modelPort.createDesignPlan.mockResolvedValue({ ...designPlan, summary: "修订版" });
    const node = createDesignPlanNode(deps);
    const update = await node(
      baseState({
        recentMessages: [{ role: "user", content: "把标题改红色" }],
        designPlan,
        designPlanHash: "a".repeat(64),
        designRevision: 1,
        revising: true,
      }) as never,
    );

    expect(update.designPlan?.summary).toBe("修订版");
    expect(update.designRevision).toBe(2);
    expect(update.designPlanHash).not.toBe("a".repeat(64));
    expect(modelPort.createDesignPlan).toHaveBeenCalledWith(
      expect.objectContaining({ requirementText: "把标题改红色", designPlan }),
      { revising: true },
    );
    expect(workspaceQuery.appendMessage).toHaveBeenCalledTimes(1);
  });

  it("treats a REVISE_DESIGN intent as a revision even without the revising flag", async () => {
    const { deps, modelPort } = makeDesignDeps();
    const node = createDesignPlanNode(deps);
    await node(baseState({ intent: "REVISE_DESIGN", revising: false }) as never);

    expect(modelPort.createDesignPlan).toHaveBeenCalledWith(expect.anything(), {
      revising: true,
    });
  });

  it("computes a stable hash that changes when the plan content changes", async () => {
    const { deps, modelPort } = makeDesignDeps();
    const node = createDesignPlanNode(deps);
    const first = await node(baseState() as never);
    const second = await node(baseState() as never);
    expect(first.designPlanHash).toBe(second.designPlanHash);

    modelPort.createDesignPlan.mockResolvedValue({ ...designPlan, summary: "改了" });
    const third = await node(baseState() as never);
    expect(third.designPlanHash).not.toBe(first.designPlanHash);
  });
});

describe("plan-change design guard (spec §5.4)", () => {
  function makeGuardDeps() {
    const modelPort = {
      createChangePlan: vi.fn().mockResolvedValue({
        schema: "kf-change-plan/v1",
        workspaceId: "w1",
        operations: [
          { op: "update", entityId: "e1", entityType: "text", changes: [{ path: "/text", value: "x" }] },
        ],
      }),
    };
    const workspaceQuery = { getRevisionEntities: vi.fn().mockResolvedValue([]) };
    const changePlanRepository = {
      findOpenChangeRequest: vi.fn().mockResolvedValue(null),
      saveChangeRequest: vi.fn().mockResolvedValue(undefined),
      savePlan: vi.fn().mockResolvedValue(undefined),
    };
    return { deps: { modelPort, workspaceQuery, changePlanRepository } as never, modelPort, changePlanRepository };
  }

  it("rejects CONFIRM_DESIGN when no confirmed design plan exists", async () => {
    const { deps, modelPort, changePlanRepository } = makeGuardDeps();
    const node = createPlanChangeNode(deps);
    const update = await node(
      baseState({
        intent: "CONFIRM_DESIGN",
        currentRevisionId: "rev-1",
      }) as never,
    );

    expect(update).toEqual({ stage: "idle", lastErrorCode: "DESIGN_NOT_CONFIRMED" });
    expect(modelPort.createChangePlan).not.toHaveBeenCalled();
    expect(changePlanRepository.savePlan).not.toHaveBeenCalled();
  });

  it("allows CONFIRM_DESIGN once a design plan hash is confirmed", async () => {
    const { deps, modelPort, changePlanRepository } = makeGuardDeps();
    const node = createPlanChangeNode(deps);
    const update = await node(
      baseState({
        intent: "CONFIRM_DESIGN",
        currentRevisionId: "rev-1",
        designPlanHash: "a".repeat(64),
        designPlan,
      }) as never,
    );

    expect(update.stage).toBe("approval");
    expect(update.planHash).toMatch(/^[0-9a-f]{64}$/);
    expect(modelPort.createChangePlan).toHaveBeenCalledTimes(1);
    expect(changePlanRepository.savePlan).toHaveBeenCalledTimes(1);
  });

  it("keeps legacy NEW_REQUIREMENT entry working without a design plan", async () => {
    const { deps, modelPort } = makeGuardDeps();
    const node = createPlanChangeNode(deps);
    const update = await node(
      baseState({
        intent: "NEW_REQUIREMENT",
        currentRevisionId: "rev-1",
      }) as never,
    );

    expect(update.stage).toBe("approval");
    expect(modelPort.createChangePlan).toHaveBeenCalledTimes(1);
  });
});
