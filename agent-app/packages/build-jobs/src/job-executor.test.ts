import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import {
  semanticPayloadHash,
  type ChangePlan,
  type TrustedSemanticOperationInput,
} from "@kf/contracts";
import { resolveBuildAssets, resolveStoredPlan } from "./job-executor.js";
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

describe("resolveBuildAssets", () => {
  const bytes = Buffer.from("approved bytes");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const internalId = "00000000-0000-4000-8000-000000000001";
  const modelAssetId = "asset-00000000000040008000000000000001";
  const row = {
    id: internalId,
    tenantId: "tenant-a",
    workspaceId: "workspace-a",
    type: "image",
    name: "portrait.png",
    mediaType: "image/png",
    storageKey: "private-blob",
    sha256,
    sizeBytes: bytes.byteLength,
  };

  function dependencies(rows = [row], body = bytes) {
    return {
      prisma: {
        workspaceAsset: {
          findMany: async ({ where }: { where: { tenantId: string; workspaceId: string; id: { in: string[] } } }) =>
            rows.filter((candidate) => candidate.tenantId === where.tenantId
              && candidate.workspaceId === where.workspaceId && where.id.in.includes(candidate.id)),
        },
      },
      storage: {
        open: async (tenantId: string, storageKey: string) => {
          if (tenantId !== "tenant-a" || storageKey !== "private-blob") throw new Error("not found");
          return Readable.from([body]);
        },
      },
    };
  }

  it("reverses the public id only inside tenant/workspace scope and verifies exact bytes", async () => {
    await expect(resolveBuildAssets({
      ...dependencies(), tenantId: "tenant-a", workspaceId: "workspace-a",
      bindings: [{ assetId: modelAssetId, entityId: "hero/portrait" }],
    })).resolves.toEqual([{
      assetId: modelAssetId,
      targetPath: `static/agent-assets/${sha256}.png`,
      mediaType: "image/png",
      sha256,
      bytes,
    }]);
  });

  it.each([
    ["tenant mismatch", { tenantId: "tenant-b", workspaceId: "workspace-a", deps: dependencies() }, /missing|scope/i],
    ["workspace mismatch", { tenantId: "tenant-a", workspaceId: "workspace-b", deps: dependencies() }, /missing|scope/i],
    ["deleted row", { tenantId: "tenant-a", workspaceId: "workspace-a", deps: dependencies([]) }, /missing/i],
    ["checksum mismatch", { tenantId: "tenant-a", workspaceId: "workspace-a", deps: dependencies([row], Buffer.from("tampered")) }, /checksum|size/i],
  ])("rejects %s", async (_label, value, expected) => {
    await expect(resolveBuildAssets({
      ...value.deps,
      tenantId: value.tenantId,
      workspaceId: value.workspaceId,
      bindings: [{ assetId: modelAssetId, entityId: "hero/portrait" }],
    })).rejects.toThrow(expected);
  });

  it("rejects aggregate asset bytes above the worker bound", async () => {
    await expect(resolveBuildAssets({
      ...dependencies(), tenantId: "tenant-a", workspaceId: "workspace-a",
      bindings: [{ assetId: modelAssetId, entityId: "hero/portrait" }],
      maxAggregateBytes: bytes.byteLength - 1,
    })).rejects.toThrow(/aggregate|size/i);
  });
});
