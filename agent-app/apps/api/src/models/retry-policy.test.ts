// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { expect, it } from "vitest";
import { decideRetry } from "./retry-policy.js";

const base = { code: "MODEL_RATE_LIMIT", transportRetries: 0, semanticRepairs: 0,
  remainingInvocations: 2, aborted: false };

it("retries transport failures once and stops when exhausted", () => {
  expect(decideRetry(base)).toBe("retry_transport");
  expect(decideRetry({ ...base, transportRetries: 1 })).toBe("stop");
  expect(decideRetry({ ...base, code: "MODEL_TRANSIENT" })).toBe("retry_transport");
});

it("repairs semantic failures once", () => {
  expect(decideRetry({ ...base, code: "SCHEMA_INVALID" })).toBe("repair_semantic");
  expect(decideRetry({ ...base, code: "SCHEMA_INVALID", semanticRepairs: 1 })).toBe("stop");
  expect(decideRetry({ ...base, code: "JSON_INVALID", semanticRepairs: 0 })).toBe("repair_semantic");
});

it("never retries terminal errors, aborted runs or exhausted budgets", () => {
  expect(decideRetry({ ...base, code: "MODEL_AUTH_ERROR" })).toBe("stop");
  expect(decideRetry({ ...base, code: "MODEL_PROTOCOL_ERROR" })).toBe("stop");
  expect(decideRetry({ ...base, aborted: true })).toBe("stop");
  expect(decideRetry({ ...base, remainingInvocations: 0 })).toBe("stop");
});
// end
