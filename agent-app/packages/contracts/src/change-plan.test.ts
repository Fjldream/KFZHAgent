import { describe, expect, it } from "vitest";
import {
  changePlanSchema,
  internalChangePlanSchema,
} from "./change-plan.js";
import { canonicalChangePlanHash } from "./server-plan-envelope.js";

/**
 * Change-plan contract tests.
 *
 * These guard the fields Task 10/11 depend on when they run plans through
 * zod `changePlanSchema.parse()`: zod strips unknown keys by default, so a
 * field used by the patcher/validator must be a declared schema field or it
 * silently disappears. `digest` (delete) and `entityType` (update hint) are
 * exactly such fields.
 */

describe("change plan schema", () => {
  const sha256 = "1".repeat(64);
  const assetBinding = {
    assetId: "asset-00000000000040008000000000000001",
    workspaceAssetId: "00000000-0000-4000-8000-000000000001",
    entityId: "hero/portrait",
    controlId: "hero/portrait",
    capabilityId: "image",
    targetPath: `project/res/images/${sha256}.png`,
    mediaType: "image/png",
    sha256,
    sizeBytes: 128,
  };

  it("keeps compiler-owned asset bindings only in the internal plan contract", () => {
    const input = {
      schema: "kf-change-plan/v1" as const,
      workspaceId: "w-1",
      operations: [],
      assetBindings: [assetBinding],
    };

    expect(changePlanSchema.safeParse(input).success).toBe(false);
    expect(internalChangePlanSchema.parse(input).assetBindings).toEqual([assetBinding]);
  });

  it("binds asset authorization into the canonical plan hash", () => {
    const plain = {
      schema: "kf-change-plan/v1" as const,
      workspaceId: "w-1",
      operations: [],
    };
    const bound = { ...plain, assetBindings: [assetBinding] };

    expect(canonicalChangePlanHash(bound)).not.toBe(canonicalChangePlanHash(plain));
  });

  it("keeps creative hash references internal and makes the plan hash sensitive to them", () => {
    const plain = { schema: "kf-change-plan/v1" as const, workspaceId: "w-1", operations: [] };
    const creative = {
      ...plain,
      creative: { artifactHash: "a".repeat(64), materializationHash: "b".repeat(64) },
    };
    expect(changePlanSchema.safeParse(creative).success).toBe(false);
    expect(internalChangePlanSchema.parse(creative).creative).toEqual(creative.creative);
    expect(canonicalChangePlanHash(creative)).not.toBe(canonicalChangePlanHash(plain));
  });

  it("rejects ambiguous duplicate asset bindings for one control", () => {
    expect(internalChangePlanSchema.safeParse({
      schema: "kf-change-plan/v1",
      workspaceId: "w-1",
      operations: [],
      assetBindings: [assetBinding, { ...assetBinding, assetId: "asset-00000000000040008000000000000002" }],
    }).success).toBe(false);
  });

  it("rejects legacy id-only bindings so they must be replanned with signed facts", () => {
    expect(internalChangePlanSchema.safeParse({
      schema: "kf-change-plan/v1",
      workspaceId: "w-1",
      operations: [],
      assetBindings: [{
        assetId: assetBinding.assetId,
        entityId: assetBinding.entityId,
      }],
    }).success).toBe(false);
  });

  it("keeps the delete operation digest after parsing", () => {
    const parsed = changePlanSchema.parse({
      schema: "kf-change-plan/v1",
      workspaceId: "w-1",
      operations: [
        {
          op: "delete",
          entityId: "button-guid-1",
          destructiveConfirmed: true,
          digest: "abc123",
        },
      ],
    });
    const op = parsed.operations[0]!;
    expect(op.op).toBe("delete");
    if (op.op === "delete") {
      expect(op.digest).toBe("abc123");
      expect(op.destructiveConfirmed).toBe(true);
    }
  });

  it("rejects a delete without a digest", () => {
    expect(
      changePlanSchema.safeParse({
        schema: "kf-change-plan/v1",
        workspaceId: "w-1",
        operations: [{ op: "delete", entityId: "x", destructiveConfirmed: true }],
      }).success,
    ).toBe(false);
  });

  it("keeps the optional update entityType hint after parsing", () => {
    const parsed = changePlanSchema.parse({
      schema: "kf-change-plan/v1",
      workspaceId: "w-1",
      operations: [
        {
          op: "update",
          entityId: "button-guid-1",
          entityType: "control",
          changes: [{ path: "/backgroundColor", value: "#ff0000" }],
        },
      ],
    });
    expect(parsed.operations[0]).toMatchObject({ entityType: "control" });
  });

  it("keeps entityType absent when the planner did not send it", () => {
    const parsed = changePlanSchema.parse({
      schema: "kf-change-plan/v1",
      workspaceId: "w-1",
      operations: [{ op: "update", entityId: "button-guid-1", changes: [] }],
    });
    const op = parsed.operations[0]!;
    if (op.op === "update") {
      expect(op.entityType).toBeUndefined();
    }
  });

  it("round-trips a create operation with its properties", () => {
    const parsed = changePlanSchema.parse({
      schema: "kf-change-plan/v1",
      workspaceId: "w-1",
      operations: [
        {
          op: "create",
          entityType: "control",
          entityId: "FreshButton",
          properties: { pageId: "page-guid-1", type: "button", x: 10 },
        },
      ],
    });
    expect(parsed.operations[0]).toMatchObject({
      entityType: "control",
      properties: { pageId: "page-guid-1", type: "button", x: 10 },
    });
  });

  it("keeps a structured applyStyle operation after parsing", () => {
    const parsed = changePlanSchema.parse({
      schema: "kf-change-plan/v1",
      workspaceId: "w-1",
      operations: [{
        op: "applyStyle",
        entityId: "button-guid-1",
        entityType: "control",
        style: {
          declarations: { backgroundColor: "#2563eb", borderRadius: 8 },
          states: { hover: { backgroundColor: "#1d4ed8" } },
        },
      }],
    });
    expect(parsed.operations[0]).toMatchObject({ op: "applyStyle", entityId: "button-guid-1" });
  });

  it("rejects applyStyle raw CSS", () => {
    expect(changePlanSchema.safeParse({
      schema: "kf-change-plan/v1",
      workspaceId: "w-1",
      operations: [{ op: "applyStyle", entityId: "x", entityType: "control", style: { css: "*{}" } }],
    }).success).toBe(false);
  });

  it.each([
    { name: "create", operation: { op: "create", entityType: "control", entityId: "   ", properties: {} } },
    { name: "update", operation: { op: "update", entityId: "   ", changes: [] } },
    { name: "delete", operation: { op: "delete", entityId: "   ", destructiveConfirmed: true, digest: "x" } },
    { name: "applyStyle", operation: { op: "applyStyle", entityId: "   ", entityType: "control", style: {} } },
  ])("rejects a blank $name entityId", ({ operation }) => {
    expect(changePlanSchema.safeParse({
      schema: "kf-change-plan/v1",
      workspaceId: "w-1",
      operations: [operation],
    }).success).toBe(false);
  });

  it("trims valid entity IDs and rejects IDs beyond the reviewed bound", () => {
    const parsed = changePlanSchema.parse({
      schema: "kf-change-plan/v1",
      workspaceId: "w-1",
      operations: [{ op: "create", entityType: "control", entityId: "  FreshButton  ", properties: {} }],
    });
    expect(parsed.operations[0]?.entityId).toBe("FreshButton");
    expect(changePlanSchema.safeParse({
      schema: "kf-change-plan/v1",
      workspaceId: "w-1",
      operations: [{ op: "update", entityId: "x".repeat(101), changes: [] }],
    }).success).toBe(false);
  });
});
