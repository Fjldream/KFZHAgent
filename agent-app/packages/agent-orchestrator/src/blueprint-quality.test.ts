import { describe, expect, it } from "vitest";
import type { CustomerEffectBlueprint } from "@kf/contracts";
import { assessBlueprintRevision } from "./blueprint-quality.js";

const previous: CustomerEffectBlueprint = {
  schema: "kf-design-plan/v2",
  displayName: "个人求职作品集",
  overview: {
    objective: "向面试官展示个人能力",
    audiences: ["面试官"],
    scenarios: ["求职应聘"],
    valueProposition: "用项目成果证明能力",
  },
  informationArchitecture: {
    narrative: "个人介绍、项目、履历、联系方式",
    wireframe: "首屏 → 项目 → 履历 → 联系",
  },
  modules: [{
    id: "projects",
    name: "项目经历",
    purpose: "展示代表项目",
    content: ["项目背景", "职责", "成果"],
    sampleData: [{ label: "项目", value: "能源管理平台" }],
    interactions: ["展开项目详情"],
    presentation: "时间线卡片",
  }],
  visualDirection: {
    tone: "专业",
    colors: ["深蓝"],
    typography: "清晰层级",
    spacingAndSurfaces: "轻边框卡片",
  },
  highlights: ["成果时间线"],
  revisionNotes: { added: ["项目经历"], changed: [], retained: [] },
  acceptanceCriteria: ["至少展示三个项目"],
  openQuestions: [],
};

describe("assessBlueprintRevision", () => {
  it("rejects a revision whose customer-visible body is unchanged", () => {
    expect(assessBlueprintRevision(previous, previous)).toContain("蓝图主体没有实质变化");
  });

  it("rejects change prose that only claims retained content", () => {
    expect(
      assessBlueprintRevision(previous, {
        ...previous,
        revisionNotes: { added: [], changed: [], retained: ["保留原布局"] },
      }),
    ).toContain("修订没有声明新增或调整内容");
  });

  it("accepts a substantive module addition with truthful revision notes", () => {
    const changed: CustomerEffectBlueprint = {
      ...previous,
      modules: [
        ...previous.modules,
        {
          id: "products",
          name: "我的产品",
          purpose: "展示产品经验",
          content: ["定位", "职责", "成果"],
          sampleData: [{ label: "产品", value: "工业低代码平台" }],
          interactions: ["展开产品详情"],
          presentation: "产品卡片",
        },
      ],
      revisionNotes: {
        added: ["新增我的产品模块"],
        changed: [],
        retained: ["保留项目时间线"],
      },
      acceptanceCriteria: [...previous.acceptanceCriteria, "至少展示两个产品案例"],
    };
    expect(assessBlueprintRevision(previous, changed)).toEqual([]);
  });
});
