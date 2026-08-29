import { describe, expect, it } from "vitest";
import { requireNativeActionCapability } from "./native-action-capability-registry.js";

describe("native action capability knowledge", () => {
  it("records reviewed navigation as a globally available native effect", () => {
    expect(requireNativeActionCapability("navigate-page")).toMatchObject({
      semanticAction: "navigate-page",
      availability: "supported",
      serialization: "navigate-command",
    });
  });

  it("rejects an action without exact evidence", () => {
    expect(() => requireNativeActionCapability("run-script"))
      .toThrow("NATIVE_ACTION_CAPABILITY_NOT_SUPPORTED");
  });
});
