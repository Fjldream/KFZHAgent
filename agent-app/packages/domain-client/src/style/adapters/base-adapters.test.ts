import { describe, expect, it } from "vitest";
import { listControlCapabilities } from "../control-capability-registry.js";
import { KF36_RUNTIME_PROFILE } from "../runtime-profile.js";
import { getStyleAdapter, listStyleAdapters } from "./base-adapters.js";

describe("base style adapters", () => {
  it("registers every pending capability plus only the evidence-mapped preserve-only rollout", () => {
    const pendingCapabilityIds = listControlCapabilities()
      .filter((capability) => capability.style.status === "pending-verification")
      .map((capability) => capability.id);
    const evidenceMappedPreserveOnly = [
      "easyui.1", "easyui.12", "easyui.19", "list", "navmenu", "tree",
    ];

    expect(listStyleAdapters().map((adapter) => adapter.capabilityId).sort())
      .toEqual([...pendingCapabilityIds, ...evidenceMappedPreserveOnly].sort());
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

  it("consumes exact trusted runtime selectors through the semantic-part adapter contract", () => {
    const tabs = getStyleAdapter("tabs")!;

    expect(tabs.parts.map((part) => ({
      semanticPart: part.semanticPart,
      selector: part.selector,
      supportedStates: part.supportedStates,
    }))).toEqual([
      { semanticPart: "root", selector: "#domId .el-tabs", supportedStates: [] },
      { semanticPart: "tab", selector: "#domId .el-tabs__item", supportedStates: ["hover", "selected"] },
      { semanticPart: "active-indicator", selector: "#domId .el-tabs__active-bar", supportedStates: [] },
      { semanticPart: "panel", selector: "#domId .el-tabs__content", supportedStates: [] },
    ]);
    expect(tabs.parts[2]!.selector)
      .toBe(KF36_RUNTIME_PROFILE.selectors.tabs!.parts["active-indicator"]!.selector);
  });

  it("derives root state support only from proved runtime hosts", () => {
    for (const capabilityId of ["text", "richtext"]) {
      expect(getStyleAdapter(capabilityId)!.parts.find((part) => part.semanticPart === "root")!.supportedStates,
        capabilityId).toEqual([]);
    }
    expect(getStyleAdapter("checkbox")!.parts[0]!.supportedStates)
      .toEqual(["hover", "focus", "disabled", "selected"]);
    expect(getStyleAdapter("radio")!.parts[0]!.supportedStates)
      .toEqual(["hover", "focus", "disabled", "selected"]);
    expect(getStyleAdapter("switch")!.parts[0]!.supportedStates)
      .toEqual(["disabled", "selected"]);
    expect(getStyleAdapter("datetimepicker")!.parts[0]!.supportedStates)
      .toEqual(["hover", "disabled"]);
    expect(getStyleAdapter("easyui.2")!.parts[0]).toMatchObject({
      semanticPart: "root",
      selector: "#domId .l-btn",
      supportedStates: ["hover", "active", "focus", "disabled"],
    });
  });

  it("assigns overflow to CSS ownership on the evidenced layout surface and never to native patches", () => {
    const root = getStyleAdapter("layout.4")!.parts.find((part) => part.semanticPart === "root")!;

    expect(root.cssProperties).toContain("overflow");
    expect(root.nativeProperties).not.toContain("overflow");
    expect(root.nativeProperties).toEqual(["backgroundColor"]);
  });

  it("keeps unsupported semantic parts absent instead of falling back to root", () => {
    expect(getStyleAdapter("tabs")!.parts.some((part) => part.semanticPart === "label")).toBe(false);
    expect(getStyleAdapter("easyui.1")!.parts.some((part) => part.semanticPart === "empty")).toBe(false);
  });

  it("exposes evidence adapters without changing preserve-only capability policy", () => {
    for (const capabilityId of ["easyui.1", "easyui.12", "easyui.19", "list", "navmenu", "tree"]) {
      expect(getStyleAdapter(capabilityId)).toBeDefined();
      expect(listControlCapabilities().find((capability) => capability.id === capabilityId)?.style.status)
        .toBe("preserve-only");
    }
  });
});
