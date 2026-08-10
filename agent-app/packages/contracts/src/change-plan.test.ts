import { describe, expect, it } from "vitest";
import { changePlanSchema } from "./change-plan.js";

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
