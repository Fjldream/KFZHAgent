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
});
