import { describe, expect, it } from "vitest";
import { canonicalChangePlanHash, semanticPayloadHash, type ChangePlan } from "@kf/contracts";
import {
  createHmacServerPlanAuthority,
  decodeServerPlanHmacKey,
} from "./server-plan-authority.js";

const keyA = Buffer.alloc(32, 0x41).toString("base64");
const keyB = Buffer.alloc(32, 0x42).toString("base64");
const tableData = {
  columns: [{ key: "name", label: "设备", align: "left" }],
  rows: [{ name: "泵 A" }],
  pageSize: 20,
};
const plan: ChangePlan = {
  schema: "kf-change-plan/v1",
  workspaceId: "w",
  operations: [{
    op: "create",
    entityType: "control",
    entityId: "table-guid",
    properties: { type: "easyui", proto: 1, tableData },
  }],
};

function signed() {
  return createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).sign({
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

describe("HMAC server plan authority", () => {
  it.each([undefined, "", Buffer.alloc(31, 0x41).toString("base64"), "not-base64***"])(
    "rejects missing, malformed, or short server-only key material",
    (raw) => expect(() => decodeServerPlanHmacKey(raw)).toThrow(/HMAC key/i),
  );

  it("verifies a JSON/Prisma roundtrip with the same key", () => {
    const envelope = signed();
    const cloned: unknown = JSON.parse(JSON.stringify(envelope));
    expect(createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).verify(cloned, {
      expectedPlanHash: envelope.planHash,
      expectedRevisionId: "revision-1",
    })).toEqual(envelope);
  });

  it("rejects a valid envelope signed by another server key", () => {
    expect(() => createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyB)).verify(signed(), {
      expectedPlanHash: signed().planHash,
      expectedRevisionId: "revision-1",
    })).toThrow(/signature/i);
  });

  it("rejects binding tampering even after public hashes are recomputed", () => {
    const tampered = structuredClone(signed());
    tampered.plan.workspaceId = "copied-workspace";
    tampered.planHash = canonicalChangePlanHash(tampered.plan);
    expect(() => createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).verify(tampered, {
      expectedPlanHash: tampered.planHash,
      expectedRevisionId: "revision-1",
    })).toThrow(/signature/i);
  });

  it.each([
    ["revision", (value: ReturnType<typeof signed>) => { value.revisionId = "revision-2"; }],
    ["entity", (value: ReturnType<typeof signed>) => { value.semanticOperations[0]!.entityId = "other"; }],
    ["capability", (value: ReturnType<typeof signed>) => { (value.semanticOperations[0] as { capabilityId: string }).capabilityId = "easyui.9"; }],
    ["source module", (value: ReturnType<typeof signed>) => { value.semanticOperations[0]!.sourceModuleId = "other-module"; }],
    ["payload", (value: ReturnType<typeof signed>) => { value.semanticOperations[0]!.payloadHash = "c".repeat(64); }],
  ])("rejects arbitrary signed %s binding tampering", (_label, mutate) => {
    const value = structuredClone(signed());
    mutate(value);
    expect(() => createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).verify(value)).toThrow(/(?:signature|schema)/i);
  });

  it.each([0, 2])("refuses to issue %i authorizations for one actual semantic operation", (count) => {
    const semantic = {
      kind: "kf.table-data/v1" as const,
      entityId: "table-guid",
      capabilityId: "easyui.1" as const,
      sourceModuleId: "table-module",
      payloadHash: semanticPayloadHash(tableData),
    };
    expect(() => createHmacServerPlanAuthority(decodeServerPlanHmacKey(keyA)).sign({
      plan,
      revisionId: "revision-1",
      semanticOperations: Array.from({ length: count }, () => semantic),
    })).toThrow(/SEMANTIC_MISMATCH/);
  });
});
