import { describe, expect, it } from "vitest";
import { createWorkerServerPlanAuthorityFromEnvironment } from "./server-plan-authority.js";

describe("worker server plan authority configuration", () => {
  it.each([{}, { KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(16).toString("base64") }])(
    "fails before worker startup when the shared HMAC key is missing or short",
    (environment) => expect(() => createWorkerServerPlanAuthorityFromEnvironment(environment)).toThrow(/HMAC key/i),
  );
});
