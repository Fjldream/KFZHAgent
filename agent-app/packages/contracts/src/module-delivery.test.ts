import { describe, expect, it } from "vitest";
import { ModuleDeliveryReportSchema, ModuleTraceSchema } from "./module-delivery.js";

describe("module delivery contracts", () => {
  it("accepts each defined delivery state and a complete gap", () => {
    for (const status of ["ready", "ready_with_warnings", "blocked"] as const) {
      expect(ModuleDeliveryReportSchema.safeParse({
        schema: "kf-module-delivery/v1",
        projectKey: "portal-demo",
        status,
        gaps: [{
          moduleId: "hero",
          requirement: "品牌标识",
          severity: "warning",
          status: "unresolved",
          reason: "尚未注册可用资源",
          alternatives: ["使用文字标题"],
        }],
      }).success).toBe(true);
    }
  });

  it("requires all delivery-gap boundary fields", () => {
    expect(ModuleDeliveryReportSchema.safeParse({
      schema: "kf-module-delivery/v1",
      projectKey: "portal-demo",
      status: "blocked",
      gaps: [{ moduleId: "hero", requirement: "品牌标识", severity: "blocking", status: "unresolved" }],
    }).success).toBe(false);
  });

  it("traces declared modules without raw coordinates or storage details", () => {
    expect(ModuleTraceSchema.safeParse({
      schema: "kf-module-trace/v1",
      projectKey: "portal-demo",
      entries: [{ pageId: "home", moduleId: "hero", outputId: "page-home-hero" }],
    }).success).toBe(true);
    expect(ModuleTraceSchema.safeParse({
      schema: "kf-module-trace/v1",
      projectKey: "portal-demo",
      entries: [{ pageId: "home", moduleId: "hero", outputId: "page-home-hero", coordinates: { x: 0, y: 0 } }],
    }).success).toBe(false);
  });
});
