// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { canTransition, isTerminal, isWaiting } from "./run-state.js";

describe("run state machine", () => {
  it("protects terminal and approval state", () => {
    expect(canTransition("SUCCEEDED", "RUNNING")).toBe(false);
    expect(canTransition("WAITING_APPROVAL", "RUNNING")).toBe(false);
    expect(canTransition("RUNNING", "WAITING_APPROVAL")).toBe(true);
    expect(canTransition("CANCEL_REQUESTED", "CANCELLED")).toBe(true);
  });

  it("never resurrects a terminal run", () => {
    for (const terminal of ["SUCCEEDED", "FAILED", "CANCELLED"] as const) {
      for (const next of ["QUEUED", "RUNNING", "BUILDING"] as const) {
        expect(canTransition(terminal, next)).toBe(false);
      }
      expect(isTerminal(terminal)).toBe(true);
    }
  });

  it("only allows the documented forward edges", () => {
    expect(canTransition("QUEUED", "RUNNING")).toBe(true);
    expect(canTransition("RUNNING", "BUILDING")).toBe(true);
    expect(canTransition("BUILDING", "SUCCEEDED")).toBe(true);
    expect(canTransition("WAITING_INPUT", "CANCELLED")).toBe(true);
    expect(canTransition("RUNNING", "RUNNING")).toBe(false);
    expect(canTransition("QUEUED", "WAITING_APPROVAL")).toBe(false);
    expect(canTransition("WAITING_INPUT", "QUEUED")).toBe(false);
  });

  it("marks waiting states as business barriers that hold no lease", () => {
    expect(isWaiting("WAITING_INPUT")).toBe(true);
    expect(isWaiting("WAITING_APPROVAL")).toBe(true);
    expect(isWaiting("RUNNING")).toBe(false);
    expect(isWaiting("CANCEL_REQUESTED")).toBe(false);
  });
});
// end
