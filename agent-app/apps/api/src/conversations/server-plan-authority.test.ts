import { describe, expect, it } from "vitest";
import { createServerPlanAuthorityFromEnvironment } from "./server-plan-authority.js";

describe("API server plan authority configuration", () => {
  it.each([{}, { KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(8).toString("base64") }])(
    "fails startup when the shared server-only HMAC key is missing or short",
    (environment) => expect(() => createServerPlanAuthorityFromEnvironment(environment)).toThrow(/HMAC key/i),
  );

  it("creates the authority from a 256-bit key without exposing the key", () => {
    const authority = createServerPlanAuthorityFromEnvironment({
      KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x31).toString("base64"),
    });
    expect(Object.keys(authority).sort()).toEqual(["sign", "verify"]);
  });
});
