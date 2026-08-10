import { describe, expect, it } from "vitest";
import {
  assertCapabilityCoverage,
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
      // Frozen records reject mutation in strict-mode ESM; snapshots may instead absorb it.
    }

    expect(getControlCapability("button")?.style.status).toBe("pending-verification");
    expect(getControlCapability("button")?.limitations).not.toContain("forged limitation");
    expect(getControlCapability("text")?.style.supported).not.toContain("forged token");
  });
});
