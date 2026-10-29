import { describe, expect, it } from "vitest";
import { listControlCapabilities } from "../control-capability-registry.js";
import { KF36_RUNTIME_PROFILE } from "../runtime-profile.js";
import { getStyleAdapter, listStyleAdapters } from "./base-adapters.js";

describe("base style adapters", () => {
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("emits layout backgrounds as CSS because the native layout JSON reader has no backgroundColor case", () => {
    expect(getStyleAdapter("layout.4")!.compile({ declarations: { backgroundColor: "#f0f5f8" }, states: {} })).toEqual({
      nativeFields: {}, cssDeclarations: { normal: { backgroundColor: "#f0f5f8" } }, unsupported: [],
    });
  });
  // end
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

  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("emits ElementUI backgrounds as CSS because its JSON reader has no backgroundColor case", () => {
  // end
    const adapter = getStyleAdapter("button");

    expect(adapter).toBeDefined();
    expect(adapter!.compile({
      declarations: { backgroundColor: "#2563eb", fontSize: 14 },
      states: {},
    })).toEqual({
      // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      nativeFields: {},
      cssDeclarations: { normal: { backgroundColor: "#2563eb", fontSize: 14 } },
      // end
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
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    expect(root.nativeProperties).toEqual([]);
    // end
  });

  it("leaves margin and gap exclusively owned by semantic layout", () => {
    for (const adapter of listStyleAdapters()) {
      for (const part of adapter.parts) {
        expect(part.cssProperties, `${adapter.capabilityId}.${part.semanticPart}`).not.toContain("margin");
        expect(part.cssProperties, `${adapter.capabilityId}.${part.semanticPart}`).not.toContain("gap");
      }
    }
    const buttonRoot = getStyleAdapter("button")!.parts.find((part) => part.semanticPart === "root")!;
    expect(buttonRoot.cssProperties).toEqual(expect.arrayContaining([
      "padding", "paddingHorizontal", "paddingVertical", "letterSpacing",
    ]));
  });

  it("allows the evidenced cursor property only on the Button root", () => {
    expect(getStyleAdapter("button")!.parts[0]!.cssProperties).toContain("cursor");
    expect(getStyleAdapter("text")!.parts[0]!.cssProperties).not.toContain("cursor");
    expect(getStyleAdapter("easyui.2")!.parts[0]!.cssProperties).not.toContain("cursor");
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
