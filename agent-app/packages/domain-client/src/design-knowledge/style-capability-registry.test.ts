import { describe, expect, it } from "vitest";
import type { ComponentStyleSpec } from "@kf/contracts";
import { getStyleAdapter } from "../style/adapters/base-adapters.js";
import {
  listStyleCapabilityProfiles,
  requireStyleCapabilityProfile,
} from "./style-capability-registry.js";

describe("style capability knowledge", () => {
  it("has a profile for every phase-one control design profile", () => {
    expect(listStyleCapabilityProfiles()).toHaveLength(26);
  });

  it("never calls a part supported when no adapter exists", () => {
    for (const profile of listStyleCapabilityProfiles()) {
      if (profile.parts.some((part) => part.availability === "supported")) {
        expect(getStyleAdapter(profile.capabilityId)).toBeDefined();
      }
    }
  });

  it("documents rich internal parts as planned until dedicated adapters exist", () => {
    const table = requireStyleCapabilityProfile("easyui.1");
    expect(table.parts.map((part) => [part.id, part.availability])).toEqual([
      ["root", "planned"],
      ["header", "planned"],
      ["row", "planned"],
      ["cell", "planned"],
      ["empty", "planned"],
    ]);
  });

  it("exposes button interaction states on the reviewed root adapter", () => {
    const root = requireStyleCapabilityProfile("button").parts.find((part) => part.id === "root");
    expect(root).toMatchObject({ availability: "supported" });
    expect(root?.states).toEqual(["hover", "active", "focus", "disabled", "selected"]);
  });

  it("aligns form-root state knowledge with the states each reviewed adapter compiles", () => {
    const formStates = ["hover", "active", "focus", "disabled", "error"] as const;
    const selectableStates = ["hover", "active", "focus", "disabled", "selected"] as const;
    const expectedStates = {
      input: formStates,
      inputnumber: formStates,
      datetimepicker: formStates,
      select: selectableStates,
      checkbox: selectableStates,
      radio: selectableStates,
      switch: selectableStates,
    } as const;

    for (const [capabilityId, states] of Object.entries(expectedStates)) {
      const root = requireStyleCapabilityProfile(capabilityId).parts.find((part) => part.id === "root");
      const adapter = getStyleAdapter(capabilityId);
      const stateDeclarations = Object.fromEntries(
        states.map((state) => [state, { opacity: 0.5 }]),
      ) as ComponentStyleSpec["states"];

      expect(root?.states).toEqual(states);
      expect(adapter?.compile({ declarations: {}, states: stateDeclarations }).unsupported).toEqual([]);
    }
  });
});
