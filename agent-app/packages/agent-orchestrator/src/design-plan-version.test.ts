import { describe, expect, it } from "vitest";
import { hashDesignPlan } from "./design-plan-version.js";

describe("design plan version hash", () => {
  it("hashes recursively sorted canonical JSON together with the revision", () => {
    expect(hashDesignPlan({ b: 2, a: { d: 4, c: 3 } } as never, 1)).toBe(
      "598e09ee40e70b5dd020f895f184e3c79b1a3617a01d372fbc84055b2baf658c",
    );
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects invalid revision %s",
    (revision) => {
      expect(() => hashDesignPlan({} as never, revision)).toThrow("DESIGN_REVISION_INVALID");
    },
  );
});
