// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { assertSafeTestDatabase } from "./database-safety.js";

const SAFE_URL = "postgresql://postgres@127.0.0.1:5432/kf_agent_test_agent_next";

describe("database reset guard", () => {
  it("rejects absent and production databases", () => {
    for (const url of [undefined, "postgresql://localhost/production", "postgresql://localhost/kf_agent_test"]) {
      expect(() => assertSafeTestDatabase({ url, allowReset: "1", expectedPrefix: "kf_agent_test_" })).toThrow();
    }
  });

  it("requires both an explicit flag and isolated name", () => {
    const url = "postgresql://localhost/kf_agent_test_agent_next";
    expect(() => assertSafeTestDatabase({ url, allowReset: "0", expectedPrefix: "kf_agent_test_" })).toThrow();
    expect(() => assertSafeTestDatabase({ url, allowReset: "1", expectedPrefix: "kf_agent_test_" })).not.toThrow();
  });

  it("accepts credential shapes without changing the name rule", () => {
    for (const url of [
      "postgresql://postgres@localhost:5432/kf_agent_test_agent_next",
      "postgresql://postgres:@localhost:5432/kf_agent_test_agent_next",
      "postgres://user:secret@localhost:5432/kf_agent_test_agent_next",
      "postgresql://localhost/kf_agent_test_agent_next?schema=public",
    ]) {
      expect(() => assertSafeTestDatabase({ url, allowReset: "1", expectedPrefix: "kf_agent_test_" })).not.toThrow();
    }
  });

  it("decodes percent-encoded database names before matching", () => {
    expect(() => assertSafeTestDatabase({
      url: "postgresql://localhost/kf_agent_test%5Fagent_next",
      allowReset: "1",
      expectedPrefix: "kf_agent_test_",
    })).not.toThrow();
    expect(() => assertSafeTestDatabase({
      url: "postgresql://localhost/production%5Fkf_agent_test_x",
      allowReset: "1",
      expectedPrefix: "kf_agent_test_",
    })).toThrow("UNSAFE_TEST_DATABASE");
  });

  it("rejects non-postgres protocols, missing names and missing flags", () => {
    for (const url of [
      "mysql://localhost:3306/kf_agent_test_agent_next",
      "postgresql+ssl://localhost/kf_agent_test_agent_next",
      "postgresql://localhost/",
      "postgresql://localhost/kf_agent_e2e_other",
    ]) {
      expect(() => assertSafeTestDatabase({ url, allowReset: "1", expectedPrefix: "kf_agent_test_" }))
        .toThrow("UNSAFE_TEST_DATABASE");
    }
    expect(() => assertSafeTestDatabase({ url: SAFE_URL, allowReset: undefined, expectedPrefix: "kf_agent_test_" }))
      .toThrow("TEST_DATABASE_NOT_AUTHORIZED");
  });

  it("never echoes the connection string in the failure", () => {
    try {
      assertSafeTestDatabase({
        url: "postgresql://postgres:super-secret@127.0.0.1:5432/production",
        allowReset: "1",
        expectedPrefix: "kf_agent_test_",
      });
      throw new Error("guard should have rejected the production database");
    } catch (error) {
      expect(String(error)).not.toContain("super-secret");
      expect(String(error)).not.toContain("production");
    }
  });
});
// end
