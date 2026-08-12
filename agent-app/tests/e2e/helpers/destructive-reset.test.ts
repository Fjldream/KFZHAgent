import { describe, expect, it, vi } from "vitest";
import {
  assertE2eDestructiveResetAllowed,
  loadAfterE2eDestructiveResetGuard,
} from "./destructive-reset.js";

const SAFE_URL = "postgresql://test-user:test-password@127.0.0.1:5432/kf_agent_e2e_guard";

describe("E2E destructive reset guard", () => {
  it.each([
    "postgresql://test-user:test-password@localhost:5432/kf_agent_e2e_guard",
    "postgres://test-user:test-password@127.0.0.1:5432/kf_agent_e2e_guard",
    "postgresql://test-user:test-password@[::1]:5432/kf_agent_e2e_guard",
  ])("accepts an explicit local E2E target: %s", (databaseUrl) => {
    expect(() => assertE2eDestructiveResetAllowed({
      databaseUrl,
      allowDestructiveReset: "1",
    })).not.toThrow();
  });

  it.each([
    "postgresql://test-user:test-password@db.example.com:5432/kf_agent_e2e_guard",
    "postgresql:///kf_agent_e2e_guard?host=/var/run/postgresql",
    "postgresql://test-user:test-password@:5432/kf_agent_e2e_guard",
  ])("rejects remote, socket, or empty hosts without exposing the URL: %s", (databaseUrl) => {
    expect(() => assertE2eDestructiveResetAllowed({ databaseUrl, allowDestructiveReset: "1" }))
      .toThrow(/^E2E destructive reset refused: /);
    try {
      assertE2eDestructiveResetAllowed({ databaseUrl, allowDestructiveReset: "1" });
    } catch (error) {
      expect(String(error)).not.toContain("test-password");
      expect(String(error)).not.toContain(databaseUrl);
    }
  });

  it.each([
    "postgresql://test-user:test-password@127.0.0.1:5432/postgres",
    "postgresql://test-user:test-password@127.0.0.1:5432/production",
    "postgresql://test-user:test-password@127.0.0.1:5432/kf_agent_e2e",
    "postgresql://test-user:test-password@127.0.0.1:5432/kf_agent_e2e_guard%2Fproduction",
    "mysql://test-user:test-password@127.0.0.1:3306/kf_agent_e2e_guard",
  ])("rejects non-E2E database names and protocols: %s", (databaseUrl) => {
    expect(() => assertE2eDestructiveResetAllowed({ databaseUrl, allowDestructiveReset: "1" }))
      .toThrow(/^E2E destructive reset refused: /);
  });

  it("requires the explicit destructive reset sentinel", () => {
    expect(() => assertE2eDestructiveResetAllowed({ databaseUrl: SAFE_URL, allowDestructiveReset: undefined }))
      .toThrow("E2E destructive reset refused: explicit reset sentinel is missing");
  });

  it("does not load database dependencies when the seed guard fails", async () => {
    const loadDatabase = vi.fn(async () => ({ connected: true }));

    await expect(loadAfterE2eDestructiveResetGuard({
      databaseUrl: SAFE_URL,
      allowDestructiveReset: undefined,
    }, loadDatabase)).rejects.toThrow("explicit reset sentinel is missing");
    expect(loadDatabase).not.toHaveBeenCalled();
  });
});
