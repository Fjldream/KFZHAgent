import { describe, expect, it } from "vitest";
import type { UIImplementationSpec } from "@kf/contracts";
import { compileUiImplementation } from "./ui-implementation-compiler.js";

const theme = {
  background: "#0b1220",
  surface: "#131d2e",
  primary: "#2563eb",
  accent: "#22c55e",
  textPrimary: "#f8fafc",
  textSecondary: "#94a3b8",
  fontFamily: "Microsoft YaHei",
  spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 12 },
} as const;

const context = {
  workspaceId: "w-1",
  pageGuidById: { overview: "page-guid-1" },
  existingControlGuidByComponentId: { ExistingTitle: "title-guid-1" },
} as const;

const specFixture: UIImplementationSpec = {
  schema: "kf-ui-implementation/v1",
  theme,
  pages: [{
    id: "overview",
    width: 1440,
    height: 900,
    components: [
      {
        id: "ExistingTitle",
        role: "page-title",
        capabilityId: "text",
        critical: true,
        geometry: { x: 40, y: 32, width: 320, height: 48 },
        properties: {},
        style: { declarations: { fontSize: 28 }, states: {} },
      },
      {
        id: "SubmitButton",
        role: "primary-action",
        capabilityId: "button",
        critical: true,
        content: "提交",
        geometry: { x: 40, y: 120, width: 120, height: 40 },
        properties: {},
        style: {
          declarations: { backgroundColor: "{theme.primary}", borderRadius: 8 },
          states: { hover: { backgroundColor: "#1d4ed8" } },
        },
      },
    ],
  }],
};

describe("compileUiImplementation", () => {
  it("creates new controls and styles existing controls in stable page and component order", () => {
    const result = compileUiImplementation(specFixture, context);

    expect(result.plan).toEqual({
      schema: "kf-change-plan/v1",
      workspaceId: "w-1",
      operations: [
        {
          op: "applyStyle",
          entityId: "title-guid-1",
          entityType: "control",
          style: specFixture.pages[0]!.components[0]!.style,
        },
        {
          op: "create",
          entityId: "SubmitButton",
          entityType: "control",
          properties: {
            pageId: "page-guid-1",
            type: "button",
            x: 40,
            y: 120,
            width: 120,
            height: 40,
            text: "提交",
            style: specFixture.pages[0]!.components[1]!.style,
          },
        },
      ],
    });
  });

  it("updates existing control content only when the spec declares content", () => {
    const result = compileUiImplementation({
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{ ...specFixture.pages[0]!.components[0]!, content: "新的标题" }],
      }],
    }, context);

    expect(result.plan.operations).toEqual([
      expect.objectContaining({ op: "applyStyle", entityId: "title-guid-1" }),
      {
        op: "update",
        entityId: "title-guid-1",
        entityType: "control",
        changes: [{ path: "/text", value: "新的标题" }],
      },
    ]);
  });

  it("fails on a critical unsupported control", () => {
    const unsupportedCriticalSpec: UIImplementationSpec = {
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[1]!,
          id: "UnsupportedWebContainer",
          capabilityId: "webcontainer",
        }],
      }],
    };

    expect(() => compileUiImplementation(unsupportedCriticalSpec, context))
      .toThrow(/UNSUPPORTED_CRITICAL_CAPABILITY/);
  });

  it("records every unsupported token against a verified non-critical fallback", () => {
    const result = compileUiImplementation({
      ...specFixture,
      pages: [{
        ...specFixture.pages[0]!,
        components: [{
          ...specFixture.pages[0]!.components[1]!,
          id: "LegacyTable",
          capabilityId: "table",
          critical: false,
          fallbackCapabilityId: "text",
          properties: {},
          style: { declarations: { backgroundColor: "#172338", fontSize: 16 }, states: {} },
        }],
      }],
    }, context);

    expect(result.plan.operations).toContainEqual(expect.objectContaining({
      op: "create",
      entityId: "LegacyTable",
      properties: expect.objectContaining({ type: "text" }),
    }));
    expect(result.capabilityReport.deliveryGaps).toContainEqual(expect.objectContaining({
      componentId: "LegacyTable",
      capability: "table",
      severity: "non-critical",
      fallback: "text",
      reason: expect.stringContaining("declarations.backgroundColor"),
    }));
    expect(result.capabilityReport.unsupported).toEqual([
      "LegacyTable:table:declarations.backgroundColor",
      "LegacyTable:table:declarations.fontSize",
    ]);
  });
});
