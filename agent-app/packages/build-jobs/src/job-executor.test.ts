import { describe, expect, it } from "vitest";
import {
  semanticPayloadHash,
  type ChangePlan,
  type TrustedSemanticOperationInput,
} from "@kf/contracts";
import { resolveStoredPlan } from "./job-executor.js";
import { createHmacServerPlanAuthority } from "./server-plan-authority.js";

const authority = createHmacServerPlanAuthority(Buffer.alloc(32, 0x54));

const table = {
  columns: [{ key: "name", label: "设备", align: "left" }],
  rows: [{ name: "泵 A" }],
  pageSize: 20,
};

function stored(plan: ChangePlan, semanticOperations: TrustedSemanticOperationInput[]) {
  return authority.sign({ plan, revisionId: "rev-1", semanticOperations });
}

describe("resolveStoredPlan", () => {
  it.each([
    ["create", {
      schema: "kf-change-plan/v1" as const,
      workspaceId: "w",
      operations: [{ op: "create" as const, entityType: "control", entityId: "table", properties: { type: "easyui", proto: 1, tableData: table } }],
    }],
    ["modify", {
      schema: "kf-change-plan/v1" as const,
      workspaceId: "w",
      operations: [{ op: "update" as const, entityType: "control", entityId: "table", changes: [{ path: "/__kfModuleTableData", value: table }] }],
    }],
  ])("unwraps a Prisma JSON-roundtripped semantic table %s plan", (_label, plan) => {
    const semanticOperations = [{
      kind: "kf.table-data/v1" as const,
      entityId: "table",
      capabilityId: "easyui.1" as const,
      sourceModuleId: "module-table",
      payloadHash: semanticPayloadHash(table),
    }];
    const envelope = stored(plan, semanticOperations);
    const result = resolveStoredPlan(JSON.parse(JSON.stringify(envelope)), {
      expectedPlanHash: envelope.planHash,
      expectedRevisionId: "rev-1",
    }, authority);
    expect(result.plan).toEqual(plan);
    expect(result.semanticOperations).toEqual(envelope.semanticOperations);
  });

  it("rejects a plain/model-facing plan that self-authors the internal semantic marker", () => {
    const plan: ChangePlan = {
      schema: "kf-change-plan/v1",
      workspaceId: "w",
      operations: [{ op: "update", entityId: "table", changes: [{ path: "/__kfModuleTableData", value: table }] }],
    };
    expect(() => resolveStoredPlan(plan, {
      expectedPlanHash: "0".repeat(64),
      expectedRevisionId: "rev-1",
    })).toThrow(/semantic.*server envelope/i);
  });
});
