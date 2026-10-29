// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { describe, expect, it, vi } from "vitest";
import { claimTrialDatabase, supervisorExitCode, type TrialDatabaseClaim } from "./lifecycle.js";

describe("trial database ownership and supervisor failure boundaries", () => {
  it("never persists ownership after failed or racing database creation", async () => {
    const events: string[] = [];
    const claim: TrialDatabaseClaim = { exists: async () => false, create: async () => { events.push("create"); throw new Error("concurrent creator won"); },
      recordMarker: async () => { events.push("marker"); }, verifyMarker: async () => {}, persistConfig: async () => { events.push("persist"); } };
    await expect(claimTrialDatabase(claim, false)).rejects.toThrow("concurrent creator won");
    expect(events).toEqual(["create"]);
    claim.exists = async () => true;
    await expect(claimTrialDatabase(claim, false)).rejects.toThrow("WITHOUT_OWNERSHIP");
    expect(events).toEqual(["create"]);
  });
  it("requires database-side proof before resuming and never creates a missing owned database implicitly", async () => {
    const create = vi.fn(async () => {}); const persistConfig = vi.fn(async () => {});
    const claim: TrialDatabaseClaim = { exists: async () => true, create, recordMarker: async () => {},
      verifyMarker: async () => { throw new Error("TRIAL_DATABASE_OWNERSHIP_INVALID"); }, persistConfig };
    await expect(claimTrialDatabase(claim, true)).rejects.toThrow("OWNERSHIP_INVALID");
    expect(create).not.toHaveBeenCalled(); expect(persistConfig).not.toHaveBeenCalled();
    claim.exists = async () => false;
    await expect(claimTrialDatabase(claim, true)).rejects.toThrow("OWNED_DATABASE_MISSING");
  });
  it("records database proof only after creation, then publishes private config", async () => {
    const events: string[] = [];
    await claimTrialDatabase({ exists: async () => false, create: async () => { events.push("create"); },
      recordMarker: async () => { events.push("marker"); }, verifyMarker: async () => {}, persistConfig: async () => { events.push("persist"); } }, false);
    expect(events).toEqual(["create", "marker", "persist"]);
  });
  it("reports failure for post-ready child exit but success for explicit stop", () => {
    expect(supervisorExitCode(false, undefined)).toBe(1);
    expect(supervisorExitCode(false, 0)).toBe(1);
    expect(supervisorExitCode(true, undefined)).toBe(0);
    expect(supervisorExitCode(true, 1)).toBe(1);
  });
});
// end
