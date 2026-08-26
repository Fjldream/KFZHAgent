import { describe, expect, it } from "vitest";
import type { CustomerEffectBlueprint } from "@kf/contracts";
import {
  decodeBlueprintConfirmation,
  decodeBlueprintMessage,
  encodeBlueprintConfirmation,
  encodeBlueprintMessage,
} from "./blueprint-message.js";

const blueprint: CustomerEffectBlueprint = {
  schema: "kf-design-plan/v2",
  displayName: "个人求职作品集",
  overview: {
    objective: "展示产品与项目成果",
    audiences: ["面试官"],
    scenarios: ["求职应聘"],
    valueProposition: "用成果证明能力",
  },
  informationArchitecture: { narrative: "从定位到成果", wireframe: "首屏 → 产品 → 项目" },
  modules: [{
    id: "products",
    name: "我的产品",
    purpose: "展示产品经验",
    content: ["产品定位", "个人职责"],
    sampleData: [{ label: "产品名称", value: "工业低代码平台" }],
    interactions: ["展开详情"],
    presentation: "产品卡片",
  }],
  visualDirection: {
    tone: "专业",
    colors: ["深蓝"],
    typography: "清晰",
    spacingAndSurfaces: "大留白",
  },
  highlights: ["成果证据链"],
  revisionNotes: { added: ["产品模块"], changed: [], retained: [] },
  acceptanceCriteria: ["展示两个产品案例"],
  openQuestions: [],
};

describe("blueprint message codec", () => {
  it("round-trips a detailed blueprint and customer revision", () => {
    const designPlanHash = "a".repeat(64);
    const encoded = encodeBlueprintMessage(blueprint, 2, designPlanHash);
    expect(decodeBlueprintMessage(encoded)).toEqual({ blueprint, revision: 2, designPlanHash });
  });

  it("ignores ordinary and malformed assistant messages", () => {
    expect(decodeBlueprintMessage("您好，请补充需求")).toBeNull();
    expect(decodeBlueprintMessage("KF_BLUEPRINT_MESSAGE/1\n{broken")).toBeNull();
  });

  it("round-trips an exact displayed-blueprint confirmation receipt", () => {
    const designPlanHash = "b".repeat(64);
    const encoded = encodeBlueprintConfirmation(3, designPlanHash);
    expect(decodeBlueprintConfirmation(encoded)).toEqual({ revision: 3, designPlanHash });
  });

  it("rejects malformed confirmation receipts", () => {
    expect(decodeBlueprintConfirmation("确认")).toBeNull();
    expect(decodeBlueprintConfirmation("KF_BLUEPRINT_CONFIRM/1\n{broken")).toBeNull();
    expect(decodeBlueprintConfirmation(`KF_BLUEPRINT_CONFIRM/1\n${JSON.stringify({ revision: 1, designPlanHash: "short" })}`)).toBeNull();
  });
});
