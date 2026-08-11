import { describe, expect, it } from "vitest";
import {
  createServerPlanEnvelope,
  parseServerPlanEnvelope,
  semanticPayloadHash,
} from "./server-plan-envelope.js";

const tableData = {
  columns: [{ key: "name", label: "设备", align: "left" }],
  rows: [{ name: "泵 A" }],
  pageSize: 20,
};

const plan = {
  schema: "kf-change-plan/v1" as const,
  workspaceId: "w",
  operations: [{
    op: "create" as const,
    entityType: "control",
    entityId: "table-guid",
    properties: { type: "easyui", proto: 1, tableData },
  }],
};

function envelope() {
  return createServerPlanEnvelope({
    plan,
    revisionId: "revision-1",
    semanticOperations: [{
      kind: "kf.table-data/v1",
      entityId: "table-guid",
      capabilityId: "easyui.1",
      sourceModuleId: "table-module",
      payloadHash: semanticPayloadHash(tableData),
    }],
  });
}

describe("server-owned plan envelope", () => {
  it("survives a checkpoint/Prisma JSON clone and preserves a valid semantic binding", () => {
    const cloned: unknown = JSON.parse(JSON.stringify(envelope()));
    expect(parseServerPlanEnvelope(cloned, {
      expectedPlanHash: envelope().planHash,
      expectedRevisionId: "revision-1",
    })).toEqual(envelope());
  });

  it.each([
    ["revision rebind", (value: ReturnType<typeof envelope>) => ({ ...value, revisionId: "revision-2" })],
    ["inner plan copy", (value: ReturnType<typeof envelope>) => ({ ...value, plan: { ...value.plan, workspaceId: "copied" } })],
    ["entity rebind", (value: ReturnType<typeof envelope>) => ({ ...value, semanticOperations: [{ ...value.semanticOperations[0]!, entityId: "other-guid" }] })],
    ["capability rebind", (value: ReturnType<typeof envelope>) => ({ ...value, semanticOperations: [{ ...value.semanticOperations[0]!, capabilityId: "easyui.9" }] })],
    ["source-module rebind", (value: ReturnType<typeof envelope>) => ({ ...value, semanticOperations: [{ ...value.semanticOperations[0]!, sourceModuleId: "other-module" }] })],
    ["payload rebind", (value: ReturnType<typeof envelope>) => ({ ...value, semanticOperations: [{ ...value.semanticOperations[0]!, payloadHash: "c".repeat(64) }] })],
  ])("rejects %s without a freshly issued server binding", (_label, mutate) => {
    expect(() => parseServerPlanEnvelope(mutate(envelope()))).toThrow(/SERVER_PLAN_(?:SCHEMA|HASH|BINDING|SEMANTIC)/);
  });

  it("rejects a semantic authorization copied to a different payload", () => {
    const value = envelope();
    const copied = structuredClone(value);
    const create = copied.plan.operations[0];
    if (create?.op !== "create") throw new Error("expected create");
    create.properties["tableData"] = { ...tableData, rows: [{ name: "泵 B" }] };
    expect(() => parseServerPlanEnvelope(copied)).toThrow(/SERVER_PLAN_(?:HASH|SEMANTIC)/);
  });

  it("rejects semantic markers that have no exact server authorization", () => {
    const value = envelope();
    expect(() => createServerPlanEnvelope({
      plan: value.plan,
      revisionId: value.revisionId,
      semanticOperations: [],
    })).toThrow(/SERVER_PLAN_SEMANTIC/);
  });
});
