import { describe, expect, it } from "vitest";
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
});
