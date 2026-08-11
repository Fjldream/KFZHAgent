import { describe, expect, it } from "vitest";
import {
  ComponentStyleSpecSchema,
  ControlCapabilitySchema,
  UIImplementationSpecSchema,
} from "./ui-style.js";

describe("KF UI style contracts", () => {
  it("accepts structured style intent without raw CSS", () => {
    const parsed = ComponentStyleSpecSchema.parse({
      role: "primary-action",
      declarations: {
        backgroundColor: "{theme.primary}",
        textColor: "#ffffff",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 600,
      },
      states: { hover: { backgroundColor: "#1d4ed8" } },
    });
    expect(parsed.role).toBe("primary-action");
  });

  it("rejects raw CSS and unknown declaration keys", () => {
    expect(ComponentStyleSpecSchema.safeParse({ css: "body{display:none}" }).success).toBe(false);
    expect(ComponentStyleSpecSchema.safeParse({ declarations: { position: "fixed" } }).success).toBe(false);
  });

  it("requires every capability dimension", () => {
    expect(ControlCapabilitySchema.safeParse({ id: "button" }).success).toBe(false);
  });

  it("requires stable page and component ids", () => {
    expect(UIImplementationSpecSchema.safeParse({ schema: "kf-ui-implementation/v1", theme: {}, pages: [] }).success).toBe(false);
  });

  it("keeps a bounded blueprint module trace on implementation components", () => {
    const component = {
      id: "hero-title",
      role: "heading",
      sourceModuleId: "brand",
      capabilityId: "text",
      critical: true,
      content: "张伟",
      geometry: { x: 40, y: 40, width: 320, height: 48 },
      properties: {},
      style: { declarations: {}, states: {} },
    };

    expect(UIImplementationSpecSchema.shape.pages.element.shape.components.element.parse(component))
      .toMatchObject({ sourceModuleId: "brand" });
    expect(UIImplementationSpecSchema.shape.pages.element.shape.components.element.safeParse({
      ...component,
      sourceModuleId: "x".repeat(101),
    }).success).toBe(false);
  });
});
