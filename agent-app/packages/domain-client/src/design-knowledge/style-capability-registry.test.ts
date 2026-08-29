import { describe, expect, it } from "vitest";
import { getStyleAdapter } from "../style/adapters/base-adapters.js";
import { KF36_RUNTIME_PROFILE } from "../style/runtime-profile.js";
import {
  listStyleCapabilityProfiles,
  requireStyleCapabilityProfile,
} from "./style-capability-registry.js";

describe("style capability knowledge", () => {
  it("has a profile for every phase-one control design profile", () => {
    expect(listStyleCapabilityProfiles()).toHaveLength(26);
  });

  it("promotes exactly evidence-mapped parts and aligns their states with the adapter", () => {
    for (const profile of listStyleCapabilityProfiles()) {
      const runtimeParts = KF36_RUNTIME_PROFILE.selectors[profile.capabilityId]?.parts ?? {};
      const adapter = getStyleAdapter(profile.capabilityId);

      for (const part of profile.parts) {
        const runtimePart = runtimeParts[part.id];
        expect(part.availability, `${profile.capabilityId}.${part.id}`)
          .toBe(runtimePart === undefined ? "planned" : "supported");

        if (runtimePart === undefined) {
          expect(adapter?.parts.some((candidate) => candidate.semanticPart === part.id) ?? false)
            .toBe(false);
          expect(part.states).toEqual([]);
          continue;
        }

        const adapterPart = adapter?.parts.find((candidate) => candidate.semanticPart === part.id);
        expect(adapterPart?.selector).toBe(runtimePart.selector);
        expect(adapterPart?.supportedStates).toEqual(Object.keys(runtimePart.stateSelectors));
        expect(part.states).toEqual(adapterPart?.supportedStates);
      }
    }
  });

  it("keeps selector-less parts planned and unavailable", () => {
    expect(requireStyleCapabilityProfile("easyui.1").parts.map((part) => [part.id, part.availability]))
      .toEqual([
        ["root", "supported"],
        ["header", "supported"],
        ["row", "supported"],
        ["cell", "supported"],
        ["empty", "planned"],
      ]);
    expect(requireStyleCapabilityProfile("button").parts.map((part) => [part.id, part.availability]))
      .toEqual([
        ["root", "supported"],
        ["label", "planned"],
        ["icon", "planned"],
      ]);
  });

  it("advertises cursor only where exact Button stylesheet evidence exists", () => {
    expect(requireStyleCapabilityProfile("button").parts[0]!.properties).toContain("cursor");
    expect(requireStyleCapabilityProfile("text").parts[0]!.properties).not.toContain("cursor");
    expect(requireStyleCapabilityProfile("easyui.2").parts[0]!.properties).not.toContain("cursor");
  });

  it("covers evidenced input, select, tabs, datagrid, tree/list, image, tag, navigation, overlays, and layouts", () => {
    const expectedSupportedParts = {
      input: ["root", "input", "placeholder"],
      inputnumber: ["root", "input", "indicator", "placeholder"],
      select: ["root", "input", "indicator", "placeholder"],
      tabs: ["root", "tab", "active-indicator", "panel"],
      "easyui.1": ["root", "header", "row", "cell"],
      tree: ["root", "node"],
      list: ["root", "item"],
      image: ["root", "media"],
      tag: ["root", "label", "icon"],
      navmenu: ["root", "item", "group"],
      "easyui.12": ["root", "header", "content"],
      "easyui.19": ["root", "header", "content"],
      "layout.2": ["root"],
      "layout.4": ["root"],
      "layout.5": ["root"],
    } as const;

    for (const [capabilityId, expected] of Object.entries(expectedSupportedParts)) {
      expect(requireStyleCapabilityProfile(capabilityId).parts
        .filter((part) => part.availability === "supported")
        .map((part) => part.id)).toEqual(expected);
    }
  });

  it("does not confuse selector evidence with preserve-only compilation permission", () => {
    for (const capabilityId of ["easyui.1", "easyui.12", "easyui.19", "list", "navmenu", "tree"]) {
      expect(requireStyleCapabilityProfile(capabilityId).parts.some((part) => part.availability === "supported"))
        .toBe(true);
    }
  });
});
