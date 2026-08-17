import { describe, expect, it } from "vitest";
import {
  getControlDesignProfile,
  listControlDesignProfiles,
  requireControlDesignProfile,
} from "./control-design-registry.js";

const expectedIds = [
  "button", "checkbox", "datetimepicker", "easyui.1", "easyui.12", "easyui.18", "easyui.19",
  "easyui.2", "easyui.22", "easyui.6", "image", "input", "inputnumber", "layout.2", "layout.4",
  "layout.5", "list", "navmenu", "radio", "richtext", "select", "switch", "tabs", "tag", "text", "tree",
];

describe("control design registry", () => {
  it("publishes the exact phase-one baseline in deterministic order", () => {
    expect(listControlDesignProfiles().map((profile) => profile.capabilityId)).toEqual(expectedIds);
  });

  it("records strong negative semantics for structured tables", () => {
    const table = requireControlDesignProfile("easyui.1");
    expect(table.semanticRoles).toContain("structured-record-list");
    expect(table.avoidFor).toContain("图片主导的作品展示");
    expect(table.avoidFor).toContain("品牌叙事内容");
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
  });
});
