import { describe, expect, it } from "vitest";
import { ModuleDeliveryReportSchema, ModuleTraceSchema } from "./module-delivery.js";

describe("module delivery contracts", () => {
  it("accepts each delivery state only with its permitted unresolved gaps", () => {
    const reports = [
      { status: "ready", gaps: [] },
      {
        status: "ready_with_warnings",
        gaps: [{ moduleId: "hero", requirement: "品牌标识", severity: "warning", status: "unresolved", reason: "尚未注册可用资源", alternatives: ["使用文字标题"] }],
      },
      {
        status: "blocked",
        gaps: [{ moduleId: "hero", requirement: "品牌标识", severity: "blocking", status: "unresolved", reason: "缺少必需资源" }],
      },
    ] as const;
    for (const report of reports) {
      expect(ModuleDeliveryReportSchema.safeParse({
        schema: "kf-module-delivery/v1",
        projectKey: "portal-demo",
        ...report,
      }).success).toBe(true);
    }
  });

  it("rejects delivery statuses that misrepresent unresolved gaps", () => {
    const blockingGap = { moduleId: "hero", requirement: "品牌标识", severity: "blocking", status: "unresolved", reason: "缺少必需资源" };
    const warningGap = { moduleId: "hero", requirement: "品牌标识", severity: "warning", status: "unresolved", reason: "尚未注册可用资源" };
    for (const report of [
      { status: "ready", gaps: [warningGap] },
      { status: "ready", gaps: [blockingGap] },
      { status: "ready_with_warnings", gaps: [blockingGap] },
      { status: "blocked", gaps: [warningGap] },
    ]) {
      expect(ModuleDeliveryReportSchema.safeParse({ schema: "kf-module-delivery/v1", projectKey: "portal-demo", ...report }).success).toBe(false);
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
      entries: [{ pageId: "home", moduleId: "hero", outputId: "hero/title" }],
    }).success).toBe(true);
    expect(ModuleTraceSchema.safeParse({
      schema: "kf-module-trace/v1",
      projectKey: "portal-demo",
      entries: [{ pageId: "home", moduleId: "hero", outputId: "hero/title", coordinates: { x: 0, y: 0 } }],
    }).success).toBe(false);
    expect(ModuleTraceSchema.safeParse({
      schema: "kf-module-trace/v1",
      projectKey: "portal-demo",
      entries: [
        { pageId: "home", moduleId: "hero", outputId: "hero/title" },
        { pageId: "home", moduleId: "announcement", outputId: "hero/title" },
      ],
    }).success).toBe(false);
  });

  it("rejects GUID-shaped trace ids and executable delivery text", () => {
    expect(ModuleTraceSchema.safeParse({
      schema: "kf-module-trace/v1",
      projectKey: "portal-demo",
      entries: [{ pageId: "home", moduleId: "hero", outputId: "a0b1c2d3-e4f5-6789-abcd-ef0123456789" }],
    }).success).toBe(false);
    expect(ModuleDeliveryReportSchema.safeParse({
      schema: "kf-module-delivery/v1",
      projectKey: "portal-demo",
      status: "blocked",
      gaps: [{ moduleId: "hero", requirement: "品牌标识", severity: "blocking", status: "unresolved", reason: "javascript:alert(1)" }],
    }).success).toBe(false);
  });
});
