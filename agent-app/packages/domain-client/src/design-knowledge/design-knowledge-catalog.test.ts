import { describe, expect, it } from "vitest";
import {
  __designKnowledgeIntegrityTestHooks,
  assertDesignKnowledgeIntegrity,
  getDesignKnowledgeSnapshot,
} from "./design-knowledge-catalog.js";

type Sources = Parameters<typeof __designKnowledgeIntegrityTestHooks.collectIssues>[0];
type Dependencies = Parameters<typeof __designKnowledgeIntegrityTestHooks.collectIssues>[1];

const ALL_PRESENT: Dependencies = {
  getControlCapability: () => ({}),
  getStyleAdapter: () => ({}),
};

function validSources(): Sources {
  const snapshot = structuredClone(getDesignKnowledgeSnapshot());
  return {
    controlDesignProfiles: snapshot.controlDesignProfiles,
    styleCapabilityProfiles: snapshot.styleCapabilityProfiles,
    scriptCapabilityProfiles: snapshot.scriptCapabilityProfiles,
    compositionRecipes: snapshot.compositionRecipes,
  };
}

function expectIntegrityFailure(
  sources: Sources,
  dependencies: Dependencies = ALL_PRESENT,
): string {
  try {
    __designKnowledgeIntegrityTestHooks.assertIntegrity(sources, dependencies);
  } catch (error) {
    expect(error).toBeInstanceOf(Error);
    return (error as Error).message;
  }
  throw new Error("expected design knowledge integrity failure");
}

describe("design knowledge catalog", () => {
  it("cross-validates all technical and semantic references", () => {
    expect(() => assertDesignKnowledgeIntegrity()).not.toThrow();
  });

  it("rejects profiles whose technical capability is absent", () => {
    const message = expectIntegrityFailure(validSources(), {
      ...ALL_PRESENT,
      getControlCapability: (id) => id === "button" ? undefined : {},
    });
    expect(message).toContain("control-design button: technical capability not found");
    expect(message).toContain("style-capability button: technical capability not found");
    expect(message).toContain("script-capability button: technical capability not found");
  });

  it.each([
    ["companion", (sources: Sources): Sources => ({
      ...sources,
      controlDesignProfiles: sources.controlDesignProfiles.map((profile) => profile.capabilityId === "button"
        ? { ...profile, recommendedCompanions: [...profile.recommendedCompanions, "missing-control"] }
        : profile),
    }), "companion profile not found missing-control"],
    ["alternative", (sources: Sources): Sources => ({
      ...sources,
      controlDesignProfiles: sources.controlDesignProfiles.map((profile) => profile.capabilityId === "button"
        ? { ...profile, alternatives: [...profile.alternatives, { when: "test", capabilityIds: ["missing-control"] }] }
        : profile),
    }), "alternative profile not found missing-control"],
    ["recipe candidate", (sources: Sources): Sources => ({
      ...sources,
      compositionRecipes: sources.compositionRecipes.map((recipe, index) => index === 0
        ? {
            ...recipe,
            requiredRoles: recipe.requiredRoles.map((role, roleIndex) => roleIndex === 0
              ? { ...role, capabilityCandidates: [...role.capabilityCandidates, "missing-control"] }
              : role),
          }
        : recipe),
    }), "candidate profile not found missing-control"],
  ] as const)("rejects a missing control profile referenced by a %s", (_label, mutate, expected) => {
    expect(expectIntegrityFailure(mutate(validSources()))).toContain(expected);
  });

  it("rejects style and script profiles without a control design profile", () => {
    const sources = validSources();
    const message = expectIntegrityFailure({
      ...sources,
      controlDesignProfiles: sources.controlDesignProfiles.filter((profile) => profile.capabilityId !== "button"),
    });
    expect(message).toContain("style-capability button: control design profile not found");
    expect(message).toContain("script-capability button: control design profile not found");
  });

  it("rejects a supported style part without a style adapter", () => {
    const message = expectIntegrityFailure(validSources(), {
      ...ALL_PRESENT,
      getStyleAdapter: (id) => id === "button" ? undefined : {},
    });
    expect(message).toContain("style-capability button: supported part has no style adapter");
  });

  it.each(["action", "event", "method"] as const)(
    "rejects a supported script %s without evidence",
    (memberKind) => {
      const sources = validSources();
      const scriptCapabilityProfiles = sources.scriptCapabilityProfiles.map((profile) => {
        if (memberKind === "action" && profile.capabilityId === "button") {
          return {
            ...profile,
            actions: profile.actions.map((action, index) => index === 0 ? { ...action, evidence: [] } : action),
          };
        }
        if (memberKind === "event" && profile.capabilityId === "checkbox") {
          return {
            ...profile,
            events: profile.events.map((event, index) => index === 0 ? { ...event, evidence: [] } : event),
          };
        }
        if (memberKind === "method" && profile.capabilityId === "easyui.1") {
          return {
            ...profile,
            methods: profile.methods.map((method, index) => index === 0
              ? { ...method, availability: "supported" as const, evidence: [] }
              : method),
          };
        }
        return profile;
      });
      expect(expectIntegrityFailure({ ...sources, scriptCapabilityProfiles }))
        .toContain(`supported ${memberKind} has no evidence`);
    },
  );

  it("rejects a role duplicated across required and optional recipe roles", () => {
    const sources = validSources();
    const compositionRecipes = sources.compositionRecipes.map((recipe, index) => index === 0
      ? {
          ...recipe,
          optionalRoles: [
            { ...recipe.optionalRoles[0]!, role: recipe.requiredRoles[0]!.role },
            ...recipe.optionalRoles.slice(1),
          ],
        }
      : recipe);
    expect(expectIntegrityFailure({ ...sources, compositionRecipes })).toContain("duplicate role");
  });

  it.each([
    ["control-design", (sources: Sources): Sources => ({
      ...sources,
      controlDesignProfiles: [sources.controlDesignProfiles[1]!, sources.controlDesignProfiles[0]!, ...sources.controlDesignProfiles.slice(1)],
    })],
    ["style-capability", (sources: Sources): Sources => ({
      ...sources,
      styleCapabilityProfiles: [sources.styleCapabilityProfiles[1]!, sources.styleCapabilityProfiles[0]!, ...sources.styleCapabilityProfiles.slice(1)],
    })],
    ["script-capability", (sources: Sources): Sources => ({
      ...sources,
      scriptCapabilityProfiles: [sources.scriptCapabilityProfiles[1]!, sources.scriptCapabilityProfiles[0]!, ...sources.scriptCapabilityProfiles.slice(1)],
    })],
    ["composition-recipe", (sources: Sources): Sources => ({
      ...sources,
      compositionRecipes: [sources.compositionRecipes[1]!, sources.compositionRecipes[0]!, ...sources.compositionRecipes.slice(1)],
    })],
  ] as const)("rejects duplicate and unsorted %s registry IDs", (label, mutate) => {
    const message = expectIntegrityFailure(mutate(validSources()));
    expect(message).toContain(`${label}: duplicate id`);
    expect(message).toContain(`${label}: ids are not code-point sorted`);
  });

  it("throws one deduplicated, code-point-sorted aggregate error", () => {
    const sources = validSources();
    const controlDesignProfiles = sources.controlDesignProfiles.map((profile) => profile.capabilityId === "button"
      ? {
          ...profile,
          recommendedCompanions: [...profile.recommendedCompanions, "missing-control", "missing-control"],
          alternatives: [...profile.alternatives, { when: "test", capabilityIds: ["missing-control"] }],
        }
      : profile);
    const message = expectIntegrityFailure(
      { ...sources, controlDesignProfiles },
      { ...ALL_PRESENT, getStyleAdapter: (id) => id === "button" ? undefined : {} },
    );
    expect(message).toBe(
      "DESIGN_KNOWLEDGE_INTEGRITY_FAILED: "
      + "control-design button: alternative profile not found missing-control; "
      + "control-design button: companion profile not found missing-control; "
      + "style-capability button: supported part has no style adapter",
    );
  });

  it("returns every registry in exact deterministic code-point order", () => {
    const snapshot = getDesignKnowledgeSnapshot();
    const expectedCapabilityIds = [
      "button", "checkbox", "datetimepicker", "easyui.1", "easyui.12", "easyui.18", "easyui.19",
      "easyui.2", "easyui.22", "easyui.6", "image", "input", "inputnumber", "layout.2", "layout.4",
      "layout.5", "list", "navmenu", "radio", "richtext", "select", "switch", "tabs", "tag", "text", "tree",
    ];
    expect(snapshot.controlDesignProfiles.map((profile) => profile.capabilityId)).toEqual(expectedCapabilityIds);
    expect(snapshot.styleCapabilityProfiles.map((profile) => profile.capabilityId)).toEqual(expectedCapabilityIds);
    expect(snapshot.scriptCapabilityProfiles.map((profile) => profile.capabilityId)).toEqual(expectedCapabilityIds);
    expect(snapshot.compositionRecipes.map((recipe) => recipe.id)).toEqual([
      "filtered-record-workspace", "form-dialog-flow", "master-detail-workspace",
      "media-card-gallery", "sidebar-admin-shell", "split-hero",
    ]);
  });

  it("deeply freezes representative nested records from all four registries", () => {
    const snapshot = getDesignKnowledgeSnapshot();
    const control = snapshot.controlDesignProfiles.find((profile) => profile.capabilityId === "easyui.1")!;
    const style = snapshot.styleCapabilityProfiles.find((profile) => profile.capabilityId === "button")!;
    const script = snapshot.scriptCapabilityProfiles.find((profile) => profile.capabilityId === "button")!;
    const recipe = snapshot.compositionRecipes[0]!;

    for (const value of [
      snapshot,
      snapshot.controlDesignProfiles,
      control,
      control.minimumSize,
      control.alternatives,
      control.alternatives[0],
      control.alternatives[0]?.capabilityIds,
      snapshot.styleCapabilityProfiles,
      style,
      style.parts,
      style.parts[0],
      style.parts[0]?.states,
      snapshot.scriptCapabilityProfiles,
      script,
      script.actions,
      script.actions[0],
      script.actions[0]?.evidence,
      snapshot.compositionRecipes,
      recipe,
      recipe.requiredRoles,
      recipe.requiredRoles[0],
      recipe.requiredRoles[0]?.capabilityCandidates,
    ]) {
      expect(Object.isFrozen(value)).toBe(true);
    }
  });

  it("exports defensive canonical data rather than mutable copies", () => {
    expect(getDesignKnowledgeSnapshot()).toBe(getDesignKnowledgeSnapshot());
  });
});
