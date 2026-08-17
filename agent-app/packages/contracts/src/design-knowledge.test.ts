import { describe, expect, it } from "vitest";
import {
  CompositionRecipeSchema,
  ControlDesignProfileSchema,
  ScriptCapabilityProfileSchema,
  StyleCapabilityProfileSchema,
} from "./design-knowledge.js";

const controlProfile = {
  schema: "kf-control-design-profile/v1",
  capabilityId: "easyui.1",
  version: "1.0.0",
  semanticRoles: ["structured-record-list", "record-selection"],
  useFor: ["字段稳定且需要选择记录的数据列表"],
  avoidFor: ["图片主导的作品展示", "品牌叙事内容"],
  dataShapes: ["record-list"],
  densities: ["compact", "comfortable"],
  regions: ["main", "workspace"],
  minimumSize: { width: 640, height: 240 },
  recommendedCompanions: ["easyui.6", "select", "easyui.22"],
  alternatives: [{ when: "内容强调图片和叙事", capabilityIds: ["image", "text", "button"] }],
  parentRoles: ["data-workspace"],
  childRoles: [],
  designNotes: ["表头、筛选工具栏和数据列需要形成统一对齐线"],
} as const;

describe("design knowledge contracts", () => {
  it("accepts a bounded control design profile", () => {
    expect(ControlDesignProfileSchema.parse(controlProfile).capabilityId).toBe("easyui.1");
  });

  it("rejects unknown fields and empty positive guidance", () => {
    expect(ControlDesignProfileSchema.safeParse({ ...controlProfile, css: "body{}" }).success).toBe(false);
    expect(ControlDesignProfileSchema.safeParse({ ...controlProfile, useFor: [] }).success).toBe(false);
  });

  it("rejects explicitly dangerous text payloads", () => {
    for (const unsafeText of [
      "控件 ID: 6F9619FF-8B86-D011-B42D-00C04FC964FF",
      "javascript:alert(1)",
      "https://example.com/spec",
      "<script>alert(1)</script>",
      "Authorization: Bearer token",
    ]) {
      expect(ControlDesignProfileSchema.safeParse({ ...controlProfile, useFor: [unsafeText] }).success).toBe(false);
    }
  });

  it("accepts descriptive Chinese, acronyms, references, and versions", () => {
    expect(ControlDesignProfileSchema.safeParse({
      ...controlProfile,
      version: "2.4.1",
      useFor: ["KPI(关键指标)用于概览", "参见 [Design-System] 的规范", "KPI: 关键指标", "状态 status: active"],
      designNotes: ["在高密度场景中保持信息层级清晰。"],
    }).success).toBe(true);
  });

  it("requires planned style parts to be explicit", () => {
    const profile = StyleCapabilityProfileSchema.parse({
      schema: "kf-style-capability-profile/v1",
      capabilityId: "button",
      version: "1.0.0",
      parts: [{
        id: "root",
        availability: "supported",
        semanticRoles: ["action-surface"],
        properties: ["backgroundColor", "textColor", "borderRadius"],
        states: ["hover", "active", "focus", "disabled"],
        notes: ["主要按钮必须有可辨识的 focus 状态"],
      }],
    });
    expect(profile.parts[0]?.availability).toBe("supported");
  });

  it("requires evidence for every supported script member", () => {
    const missingEvidence = {
      schema: "kf-script-capability-profile/v1",
      capabilityId: "select",
      version: "1.0.0",
      availability: "supported",
      actions: [],
      events: [{
        semanticEvent: "change",
        kfEvent: "Change",
        availability: "supported",
        arguments: [],
        evidence: [],
      }],
      methods: [],
      initialization: { supportsConfigureData: false, lifecycleEvents: [] },
      limitations: [],
    };
    expect(ScriptCapabilityProfileSchema.safeParse(missingEvidence).success).toBe(false);
  });

  it("requires evidence references to be repository-relative paths", () => {
    const profile = {
      schema: "kf-script-capability-profile/v1",
      capabilityId: "select",
      version: "1.0.0",
      availability: "supported",
      actions: [],
      events: [{
        semanticEvent: "change",
        kfEvent: "Change",
        availability: "supported",
        arguments: [],
        evidence: [{ kind: "fixture", ref: "agent-app/fixtures/select.json#Change" }],
      }],
      methods: [],
      initialization: { supportsConfigureData: false, lifecycleEvents: [] },
      limitations: [],
    };

    expect(ScriptCapabilityProfileSchema.safeParse(profile).success).toBe(true);
    for (const ref of ["/etc/passwd", "../secret.txt", "https://example.com/spec", "javascript:alert(1)"]) {
      expect(ScriptCapabilityProfileSchema.safeParse({
        ...profile,
        events: [{ ...profile.events[0], evidence: [{ kind: "fixture", ref }] }],
      }).success).toBe(false);
    }
  });

  it("requires every recipe role to offer real candidates", () => {
    const result = CompositionRecipeSchema.safeParse({
      schema: "kf-composition-recipe/v1",
      id: "filtered-record-workspace",
      version: "1.0.0",
      purpose: "筛选并选择结构化记录",
      useFor: ["设备列表"],
      avoidFor: [],
      requiredRoles: [{ role: "record-list", capabilityCandidates: [] }],
      optionalRoles: [],
      layoutPrinciples: ["筛选区位于数据区上方"],
      interactionFlow: ["修改筛选条件", "刷新结果"],
      substitutions: [],
      designNotes: [],
    });
    expect(result.success).toBe(false);
  });
});
