import { describe, expect, it } from "vitest";
import { DesignPlanSchema } from "./design-plan.js";

describe("DesignPlanSchema", () => {
  it("accepts a valid design plan", () => {
    const ok = DesignPlanSchema.safeParse({
      schema: "kf-design-plan/v1",
      displayName: "生产监控大屏",
      summary: "深色工业风监控大屏",
      layoutConcept: "顶部标题 + 中部趋势区 + 右侧状态区",
      styleDirection: "深色工业风 #0f172a + 青绿 #10b981",
      sections: [
        { id: "kpi", label: "顶部 KPI 区", controls: [{ type: "text", text: "产量", note: "KPI 数字" }] },
        { id: "trend", label: "中部趋势区", controls: [{ type: "text", text: "趋势曲线", note: "预留图表区" }] },
      ],
      signature: "中部趋势区联动 KPI 高亮",
    });
    expect(ok.success).toBe(true);
  });
  it("rejects unknown control types", () => {
    const bad = DesignPlanSchema.safeParse({
      schema: "kf-design-plan/v1",
      displayName: "x", summary: "s", layoutConcept: "l", styleDirection: "d",
      sections: [{ id: "a", label: "区", controls: [{ type: "gauge" }] }],
      signature: "sig",
    });
    expect(bad.success).toBe(false);
  });
  it("rejects >8 sections or >12 controls per section", () => {
    const manySections = Array.from({ length: 9 }, (_, i) => ({ id: `s${i}`, label: `区${i}`, controls: [{ type: "text" }] }));
    const bad = DesignPlanSchema.safeParse({
      schema: "kf-design-plan/v1", displayName: "x", summary: "s", layoutConcept: "l", styleDirection: "d",
      sections: manySections, signature: "sig",
    });
    expect(bad.success).toBe(false);
  });
});
