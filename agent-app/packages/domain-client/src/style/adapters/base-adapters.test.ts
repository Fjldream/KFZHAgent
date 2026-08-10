import { describe, expect, it } from "vitest";
import { listControlCapabilities } from "../control-capability-registry.js";
import { getStyleAdapter, listStyleAdapters } from "./base-adapters.js";

describe("base style adapters", () => {
  it("registers exactly every pending-verification style capability", () => {
    const pendingCapabilityIds = listControlCapabilities()
      .filter((capability) => capability.style.status === "pending-verification")
      .map((capability) => capability.id)
      .sort();

    expect(listStyleAdapters().map((adapter) => adapter.capabilityId).sort())
      .toEqual(pendingCapabilityIds);
  });

  it("maps a reviewed common background field natively and leaves other approved declarations for CSS", () => {
    const adapter = getStyleAdapter("button");

    expect(adapter).toBeDefined();
    expect(adapter!.compile({
      declarations: { backgroundColor: "#2563eb", fontSize: 14 },
      states: {},
    })).toEqual({
      nativeFields: { backgroundColor: "#2563eb" },
      cssDeclarations: { normal: { fontSize: 14 } },
      unsupported: [],
    });
  });

  it("reports state declarations not reviewed for a display label", () => {
    const adapter = getStyleAdapter("text");

    expect(adapter!.compile({
      declarations: {},
      states: { selected: { backgroundColor: "#ffffff" } },
    }).unsupported).toEqual([{
      token: "states.selected.backgroundColor",
      reason: "State selected is not supported by the text adapter",
    }]);
  });
});
