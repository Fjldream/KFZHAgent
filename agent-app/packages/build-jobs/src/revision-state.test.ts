import { describe, expect, it } from "vitest";
import {
  replaceRevisionProjectBuildState,
  resolveRevisionProjectIr,
} from "./revision-state.js";

const TAG = "kf-solution-revision-state/v1";

describe("tagged solution revision state", () => {
  it("rejects a non-array projects field on create", () => {
    expect(() => resolveRevisionProjectIr(
      { schema: TAG, projects: { projectKey: "client-main" } },
      "client-main",
      "kingclient",
    )).toThrow(/invalid solution revision state/);
  });

  it("rejects a non-array projects field on modify", () => {
    expect(() => replaceRevisionProjectBuildState(
      { schema: TAG, projects: { projectKey: "client-main" } },
      "client-main",
      "kingclient",
      { mode: "patch" },
    )).toThrow(/invalid solution revision state/);
  });

  it.each([
    ["missing projectKey", { domainKind: "kingclient", projectIr: {} }],
    ["missing domain", { projectKey: "client-main", projectIr: {} }],
    ["unsafe projectKey", { projectKey: "client/main", domainKind: "kingclient" }],
  ])("rejects a malformed project item: %s", (_label, project) => {
    const state = { schema: TAG, projects: [project] };
    expect(() => resolveRevisionProjectIr(state, "client-main", "kingclient"))
      .toThrow(/invalid solution revision state/);
    expect(() => replaceRevisionProjectBuildState(
      state,
      "client-main",
      "kingclient",
      { mode: "patch" },
    )).toThrow(/invalid solution revision state/);
  });

  it("rejects a duplicate projectKey even when the domains differ", () => {
    const state = {
      schema: TAG,
      projects: [
        { projectKey: "shared", domainKind: "kingclient", projectIr: {} },
        { projectKey: "shared", domainKind: "kingcalculation", projectIr: {} },
      ],
    };

    expect(() => resolveRevisionProjectIr(state, "shared", "kingclient"))
      .toThrow(/duplicate projectKey/);
    expect(() => replaceRevisionProjectBuildState(
      state,
      "shared",
      "kingclient",
      { mode: "patch" },
    )).toThrow(/duplicate projectKey/);
  });

  it("reports a projectKey bound to another domain as a conflict", () => {
    const state = {
      schema: TAG,
      projects: [
        { projectKey: "shared", domainKind: "kingclient", projectIr: {} },
      ],
    };

    expect(() => resolveRevisionProjectIr(state, "shared", "kingcalculation"))
      .toThrow(/projectKey shared belongs to domain kingclient/);
    expect(() => replaceRevisionProjectBuildState(
      state,
      "shared",
      "kingcalculation",
      { mode: "patch" },
    )).toThrow(/projectKey shared belongs to domain kingclient/);
  });

  it("keeps non-tagged legacy single-project state compatible", () => {
    const legacy = { schema: "kf-client-project-ir/v1", id: "legacy" };

    expect(resolveRevisionProjectIr(legacy, "kingclient", "kingclient")).toBe(legacy);
    expect(replaceRevisionProjectBuildState(
      legacy,
      "kingclient",
      "kingclient",
      { mode: "compile" },
    )).toEqual({ mode: "compile" });
  });
});
