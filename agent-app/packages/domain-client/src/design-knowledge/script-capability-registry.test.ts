import { describe, expect, it } from "vitest";
import {
  getScriptCapabilityProfile,
  listScriptCapabilityProfiles,
  requireScriptCapabilityProfile,
} from "./script-capability-registry.js";

describe("script capability knowledge", () => {
  it("records every phase-one control even when behavior is only planned", () => {
    expect(listScriptCapabilityProfiles()).toHaveLength(26);
  });

  it("ties supported select events to the native template", () => {
    const select = requireScriptCapabilityProfile("select");
    expect(select.events.map((event) => event.kfEvent)).toEqual([
      "Change", "visible-Change", "Remove-Tag", "Clear", "Blur", "Focus",
    ]);
    expect(select.events.every((event) => event.evidence.some((item) =>
      item.ref === "templates/control-templates/select.json#connectArray",
    ))).toBe(true);
  });

  it("preserves the reviewed image event identifiers from the native template", () => {
    expect(requireScriptCapabilityProfile("image").events).toMatchObject([
      { semanticEvent: "load", kfEvent: "Load", linkId: 200001 },
      { semanticEvent: "error", kfEvent: "Error", linkId: 200002 },
    ]);
  });

  it("records the reviewed button restricted actions", () => {
    const button = requireScriptCapabilityProfile("button");
    expect(button.actions.map((action) => action.semanticAction)).toEqual([
      "navigate-page", "set-variable", "open-dialog",
    ]);
    expect(button.actions.every((action) => action.implementation === "restricted-action")).toBe(true);
    expect(button.actions.find((action) => action.semanticAction === "open-dialog")?.availability)
      .toBe("planned");
    expect(button.actions.filter((action) => action.availability === "supported")
      .map((action) => action.semanticAction)).toEqual(["navigate-page", "set-variable"]);
  });

  it("does not claim planned datagrid methods as supported", () => {
    const table = requireScriptCapabilityProfile("easyui.1");
    expect(table.availability).toBe("planned");
    expect(table.methods.every((method) => method.availability === "planned")).toBe(true);
  });

  it("gives every supported member repository evidence", () => {
    for (const profile of listScriptCapabilityProfiles()) {
      for (const member of [...profile.actions, ...profile.events, ...profile.methods]) {
        if (member.availability === "supported") expect(member.evidence.length).toBeGreaterThan(0);
      }
    }
  });

  it("returns undefined for an optional absent lookup and identifies required lookup failures", () => {
    expect(getScriptCapabilityProfile("prototype.Unknown")).toBeUndefined();
    expect(() => requireScriptCapabilityProfile("prototype.Unknown"))
      .toThrow("SCRIPT_CAPABILITY_PROFILE_NOT_FOUND: prototype.Unknown");
  });
});
