import { describe, expect, it } from "vitest";
import { ChangePlanController } from "./change-plan.controller.js";

function controller(plan: unknown, verifiedPlan: unknown) {
  return new ChangePlanController({
    changePlan: { findFirst: async () => ({ id: "plan-1", planHash: "a".repeat(64), plan }) },
  } as never, {
    verify: () => ({ plan: verifiedPlan, semanticOperations: [] }),
  } as never);
}

const request = { principal: { tenantId: "tenant-1" } } as never;

describe("ChangePlanController creative boundary", () => {
  it("fails closed instead of exposing a creative internal plan before a safe behavior summary exists", async () => {
    const internal = {
      schema: "kf-change-plan/v1", workspaceId: "workspace", operations: [],
      creative: { artifactHash: "b".repeat(64), materializationHash: "c".repeat(64) },
    };
    await expect(controller({ schema: "kf-server-plan-envelope/v1" }, internal).get("plan-1", request))
      .rejects.toThrow(/stored change plan is invalid/i);
  });

  it("projects a verified non-creative internal plan through the strict public schema", async () => {
    const internal = {
      schema: "kf-change-plan/v1", workspaceId: "workspace",
      operations: [{ op: "update", entityId: "Button1", changes: [{ path: "/text", value: "保存" }] }],
      assetBindings: [{ private: true }],
    };
    const result = await controller({ schema: "kf-server-plan-envelope/v1" }, internal).get("plan-1", request);
    expect(result.plan).toEqual({ schema: "kf-change-plan/v1", workspaceId: "workspace", operations: internal.operations });
    expect(result.plan).not.toHaveProperty("assetBindings");
  });
});
