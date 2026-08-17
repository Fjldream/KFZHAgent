import { describe, expect, it } from "vitest";
import {
  listCompositionRecipes,
  requireCompositionRecipe,
} from "./composition-recipe-registry.js";
import { listControlDesignProfiles } from "./control-design-registry.js";

describe("composition recipe registry", () => {
  it("publishes the exact initial recipe set", () => {
    expect(listCompositionRecipes().map((recipe) => recipe.id)).toEqual([
      "filtered-record-workspace",
      "form-dialog-flow",
      "master-detail-workspace",
      "media-card-gallery",
      "sidebar-admin-shell",
      "split-hero",
    ]);
  });

  it("keeps recipes substitutable rather than fixed templates", () => {
    const gallery = requireCompositionRecipe("media-card-gallery");
    expect(gallery.substitutions).toContainEqual({
      when: "内容没有可用图片",
      replaceRole: "media",
      withCapabilities: ["richtext", "tag"],
    });
  });

  it("keeps the filtered workspace semantically separate from media content", () => {
    const recipe = requireCompositionRecipe("filtered-record-workspace");
    expect(recipe.avoidFor).toContain("图片主导的作品展示");
    expect(recipe.requiredRoles.find((role) => role.role === "record-list")?.capabilityCandidates)
      .toEqual(["easyui.1", "list", "easyui.18"]);
  });

  it("only references registered controls in candidates and substitutions", () => {
    const controlIds = new Set(listControlDesignProfiles().map((profile) => profile.capabilityId));
    for (const recipe of listCompositionRecipes()) {
      const candidates = [
        ...recipe.requiredRoles.flatMap((role) => role.capabilityCandidates),
        ...recipe.optionalRoles.flatMap((role) => role.capabilityCandidates),
        ...recipe.substitutions.flatMap((substitution) => substitution.withCapabilities),
      ];
      expect(candidates.every((capabilityId) => controlIds.has(capabilityId))).toBe(true);
    }
  });
});
