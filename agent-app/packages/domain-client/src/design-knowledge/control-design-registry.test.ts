import { describe, expect, it } from "vitest";
import {
  getControlDesignProfile,
  listControlDesignProfiles,
  requireControlDesignProfile,
} from "./control-design-registry.js";
import { createKnowledgeRegistry } from "./registry.js";

const expectedIds = [
  "button", "checkbox", "datetimepicker", "easyui.1", "easyui.12", "easyui.18", "easyui.19",
  "easyui.2", "easyui.22", "easyui.6", "image", "input", "inputnumber", "layout.2", "layout.4",
  "layout.5", "list", "navmenu", "radio", "richtext", "select", "switch", "tabs", "tag", "text", "tree",
];

const expectedProfiles: readonly {
  id: string;
  role: string;
  avoidFor: string;
  minimumSize?: { width: number; height: number };
}[] = [
  { id: "button", role: "primary-action", avoidFor: "没有动作含义的导航装饰" },
  { id: "checkbox", role: "form-input", avoidFor: "只读内容展示" },
  { id: "datetimepicker", role: "date-time-value", avoidFor: "只读内容展示" },
  { id: "easyui.1", role: "structured-record-list", avoidFor: "图片主导的作品展示", minimumSize: { width: 640, height: 240 } },
  { id: "easyui.12", role: "modal-detail", avoidFor: "永久的主页面布局", minimumSize: { width: 320, height: 180 } },
  { id: "easyui.18", role: "hierarchical-record-list", avoidFor: "平铺叙事内容", minimumSize: { width: 520, height: 240 } },
  { id: "easyui.19", role: "modal-detail", avoidFor: "永久的主页面布局", minimumSize: { width: 320, height: 180 } },
  { id: "easyui.2", role: "primary-action", avoidFor: "没有动作含义的导航装饰" },
  { id: "easyui.22", role: "pagination", avoidFor: "没有结果视图时单独使用" },
  { id: "easyui.6", role: "record-search", avoidFor: "单独作为内容区块" },
  { id: "image", role: "media", avoidFor: "没有内容目的的装饰填充" },
  { id: "input", role: "form-input", avoidFor: "只读内容展示" },
  { id: "inputnumber", role: "numeric-value", avoidFor: "只读内容展示" },
  { id: "layout.2", role: "row-layout", avoidFor: "客户可见的内容", minimumSize: { width: 160, height: 40 } },
  { id: "layout.4", role: "column-layout", avoidFor: "客户可见的内容", minimumSize: { width: 160, height: 80 } },
  { id: "layout.5", role: "dock-layout", avoidFor: "客户可见的内容", minimumSize: { width: 480, height: 320 } },
  { id: "list", role: "simple-record-list", avoidFor: "高列数比较" },
  { id: "navmenu", role: "primary-navigation", avoidFor: "单个放大的首页按钮" },
  { id: "radio", role: "single-choice", avoidFor: "只读内容展示" },
  { id: "richtext", role: "narrative-content", avoidFor: "结构化记录或交互控件的替代品" },
  { id: "select", role: "bounded-choice", avoidFor: "只读内容展示" },
  { id: "switch", role: "immediate-toggle", avoidFor: "只读内容展示" },
  { id: "tabs", role: "view-switcher", avoidFor: "单一区块的装饰" },
  { id: "tag", role: "status-label", avoidFor: "长段落文本或主要操作" },
  { id: "text", role: "narrative-content", avoidFor: "结构化记录或交互控件的替代品" },
  { id: "tree", role: "hierarchy-navigation", avoidFor: "平铺且彼此无关的记录" },
];

describe("control design registry", () => {
  it("publishes the exact phase-one baseline in deterministic order", () => {
    expect(listControlDesignProfiles().map((profile) => profile.capabilityId)).toEqual(expectedIds);
  });

  it("records strong negative semantics for structured tables", () => {
    const table = requireControlDesignProfile("easyui.1");
    expect(table.semanticRoles).toContain("structured-record-list");
    expect(table.useFor).toContain("可筛选的同构记录");
    expect(table.avoidFor).toContain("图片主导的作品展示");
    expect(table.avoidFor).toContain("品牌叙事内容");
  });

  it("keeps every reviewed profile in its intended role family, limits, and required sizes", () => {
    for (const expected of expectedProfiles) {
      const profile = requireControlDesignProfile(expected.id);
      expect(profile.semanticRoles).toContain(expected.role);
      expect(profile.avoidFor).toContain(expected.avoidFor);
      if (expected.minimumSize !== undefined) expect(profile.minimumSize).toEqual(expected.minimumSize);
    }
  });

  it("keeps layout and atomic alternatives available for creative composition", () => {
    const table = requireControlDesignProfile("easyui.1");
    expect(table.alternatives).toContainEqual({
      when: "内容强调图片和叙事",
      capabilityIds: ["image", "text", "button", "layout.2"],
    });
  });

  it("returns undefined for absent optional lookup and throws for require", () => {
    expect(getControlDesignProfile("prototype.Unknown")).toBeUndefined();
    expect(() => requireControlDesignProfile("prototype.Unknown"))
      .toThrow("CONTROL_DESIGN_PROFILE_NOT_FOUND: prototype.Unknown");
  });

  it("deep-freezes canonical records", () => {
    const profile = requireControlDesignProfile("button");
    expect(Object.isFrozen(profile)).toBe(true);
    expect(Object.isFrozen(profile.useFor)).toBe(true);
    expect(Object.isFrozen(profile.alternatives)).toBe(true);
    expect(Object.isFrozen(profile.minimumSize)).toBe(true);

    const table = requireControlDesignProfile("easyui.1");
    expect(Object.isFrozen(table.alternatives[0])).toBe(true);
    expect(Object.isFrozen(table.alternatives[0]?.capabilityIds)).toBe(true);
  });

  it("rejects duplicate generic registry keys", () => {
    expect(() => createKnowledgeRegistry(
      [{ id: "same" }, { id: "same" }],
      (record) => record.id,
      "RECORD_NOT_FOUND",
    )).toThrow("KNOWLEDGE_RECORD_DUPLICATE: same");
  });
});
