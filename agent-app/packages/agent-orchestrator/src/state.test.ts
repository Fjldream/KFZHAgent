import { describe, expect, it } from "vitest";
import { AgentGraphState } from "./state.js";

const base = {
  tenantId: "t1",
  userId: "u1",
  workspaceId: "w1",
  conversationId: "c1",
  recentMessages: [],
};

const validPlan = {
  schema: "kf-design-plan/v1",
  displayName: "监控大屏",
  summary: "s",
  layoutConcept: "l",
  styleDirection: "d",
  sections: [{ id: "kpi", label: "顶部 KPI 区", controls: [{ type: "text", text: "产量" }] }],
  signature: "sig",
};

const validImplementation = {
  schema: "kf-ui-implementation/v1",
  theme: {
    background: "#0f172a",
    surface: "#111827",
    primary: "#2563eb",
    accent: "#38bdf8",
    textPrimary: "#f8fafc",
    textSecondary: "#cbd5e1",
    fontFamily: "Arial",
    spacingUnit: 8,
    radiusScale: { small: 4, medium: 8, large: 16 },
  },
  pages: [{
    id: "Page1",
    width: 1440,
    height: 900,
    components: [{
      id: "hero-title",
      role: "heading",
      sourceModuleId: "brand",
      capabilityId: "text",
      critical: true,
      content: "张伟",
      geometry: { x: 40, y: 40, width: 320, height: 48 },
      properties: {},
      style: { declarations: {}, states: {} },
    }],
  }],
};

const validCapabilityReport = {
  status: "pass",
  full: [],
  partial: ["text"],
  unsupported: [],
  deliveryGaps: [],
};

describe("AgentGraphState v2", () => {
  it("accepts clarificationCount and designPlan fields", async () => {
    await expect(
      AgentGraphState.validateInput({
        ...base,
        clarificationCount: 2,
        designPlan: validPlan,
        designPlanHash: "a".repeat(64),
        designRevision: 1,
        stage: "design-review",
      }),
    ).resolves.toBeDefined();
  });

  it("keeps the legacy stage values valid", async () => {
    for (const stage of ["idle", "planning", "approval", "building"]) {
      await expect(AgentGraphState.validateInput({ ...base, stage }), `stage=${stage}`).resolves.toBeDefined();
    }
  });

  it("accepts every newly appended stage value", async () => {
    for (const stage of [
      "clarifying",
      "design-review",
      "design-planning",
      "planning",
      "building",
      "preview-review",
      "done",
    ]) {
      await expect(AgentGraphState.validateInput({ ...base, stage }), `stage=${stage}`).resolves.toBeDefined();
    }
  });

  it("rejects unknown stage values", async () => {
    await expect(AgentGraphState.validateInput({ ...base, stage: "nope" })).rejects.toThrow();
  });

  it("bounds clarificationCount to 0..5", async () => {
    await expect(AgentGraphState.validateInput({ ...base, stage: "idle", clarificationCount: 0 })).resolves.toBeDefined();
    await expect(AgentGraphState.validateInput({ ...base, stage: "idle", clarificationCount: 5 })).resolves.toBeDefined();
    await expect(AgentGraphState.validateInput({ ...base, stage: "idle", clarificationCount: 6 })).rejects.toThrow();
    await expect(AgentGraphState.validateInput({ ...base, stage: "idle", clarificationCount: -1 })).rejects.toThrow();
  });

  it("rejects negative designRevision", async () => {
    await expect(AgentGraphState.validateInput({ ...base, stage: "idle", designRevision: -1 })).rejects.toThrow();
  });

  it("accepts designPlanHash and revising flag", async () => {
    await expect(
      AgentGraphState.validateInput({
        ...base,
        stage: "done",
        designPlanHash: "b".repeat(64),
        revising: true,
      }),
    ).resolves.toBeDefined();
  });

  it("rejects an invalid designPlan payload", async () => {
    await expect(
      AgentGraphState.validateInput({
        ...base,
        stage: "design-review",
        designPlan: { ...validPlan, sections: [] },
      }),
    ).rejects.toThrow();
  });

  it("persists a validated UI implementation and capability report", async () => {
    await expect(
      AgentGraphState.validateInput({
        ...base,
        stage: "implementation-planning",
        uiImplementation: validImplementation,
        uiImplementationHash: "c".repeat(64),
        capabilityReport: validCapabilityReport,
      }),
    ).resolves.toBeDefined();
  });

  it("rejects malformed UI implementation state", async () => {
    await expect(
      AgentGraphState.validateInput({
        ...base,
        stage: "implementation-planning",
        uiImplementation: { ...validImplementation, pages: [] },
      }),
    ).rejects.toThrow();
  });
});
