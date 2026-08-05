import { describe, expect, it } from "vitest";
import { solutionId } from "./ids.js";

describe("solutionId", () => {
  it("brands a non-empty string", () => {
    expect(solutionId("solution-1")).toBe("solution-1");
  });
  it("rejects an empty string", () => {
    expect(() => solutionId("")).toThrow("solution id is required");
  });
});
