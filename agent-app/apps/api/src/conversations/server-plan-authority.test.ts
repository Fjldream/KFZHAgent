import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
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

  it.each(["start:api", "start:worker"])(
    "%s loads the deployment-local .env before server configuration is created",
    async (scriptName) => {
      const packageJson = JSON.parse(
        await readFile(new URL("../../../../package.json", import.meta.url), "utf8"),
      ) as { scripts?: Record<string, string> };
      const script = packageJson.scripts?.[scriptName];
      expect(script).toMatch(/^node --env-file=\.env /);
      expect(script).not.toMatch(/KF_SERVER_PLAN_HMAC_KEY_BASE64=/);
    },
  );
});
