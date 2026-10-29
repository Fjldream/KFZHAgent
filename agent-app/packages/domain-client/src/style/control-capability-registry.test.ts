import { describe, expect, it } from "vitest";
import {
  assertCapabilityCoverage,
  effectiveInteractiveCapability,
  getControlCapability,
  listControlCapabilities,
} from "./control-capability-registry.js";

describe("control capability registry", () => {
  it("covers every compiler type and variant exactly once", () => {
    expect(() => assertCapabilityCoverage()).not.toThrow();
    expect(new Set(listControlCapabilities().map((item) => item.id)).size)
      .toBe(listControlCapabilities().length);
  });

  it("does not claim full support without runtime verification", () => {
    for (const capability of listControlCapabilities()) {
      if (capability.runtimeVerification.status !== "verified") {
        expect(capability.style.status).not.toBe("full");
      }
    }
  });

  it("records unsupported style capability instead of omitting the control", () => {
    expect(getControlCapability("webcontainer")?.style.status)
      .toBe("unsupported");
  });

  it("normalizes only non-empty Text click bindings to reviewed Button capability", () => {
    const node = (capabilityId: string, semanticEvent: string, actionIds: string[]) => ({
      capabilityId,
      eventBindings: [{ semanticEvent, actionIds }],
    });

    expect(effectiveInteractiveCapability(node("text", "click", ["open"]))).toBe("button");
    expect(effectiveInteractiveCapability(node("text", "click", []))).toBe("text");
    expect(effectiveInteractiveCapability(node("text", "change", ["open"]))).toBe("text");
    expect(effectiveInteractiveCapability(node("image", "click", ["open"]))).toBe("image");
  });

  it("does not allow callers to mutate canonical capability records", () => {
    const fromLookup = getControlCapability("button");
    const fromList = listControlCapabilities().find((capability) => capability.id === "text");

    expect(fromLookup).toBeDefined();
    expect(fromList).toBeDefined();

    try {
      fromLookup!.style.status = "full";
      fromLookup!.limitations.push("forged limitation");
      fromList!.style.supported.push("forged token");
    } catch {
      // 冻结记录在严格模式的ESM中拒绝修改；快照可能相反地吸收它
    }

    expect(getControlCapability("button")?.style.status).toBe("pending-verification");
    expect(getControlCapability("button")?.limitations).not.toContain("forged limitation");
    expect(getControlCapability("text")?.style.supported).not.toContain("forged token");
  });
});
