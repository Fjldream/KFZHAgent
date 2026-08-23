import {
  CompilerInstanceNameSchema,
  UIImplementationSpecV2Schema,
  type UIImplementationSpecV2,
} from "@kf/contracts";
import { describe, expect, it } from "vitest";
import { deriveGuid } from "../compile/guid-factory.js";
import {
  RuntimeCorrelationError,
  attachRuntimeCorrelation,
  type VerifiedExistingRuntimeCorrelation,
} from "./runtime-correlation.js";

const theme = {
  background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32",
  textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;

function implementation(
  pageIds: readonly string[] = ["home", "detail"],
  controlIds: readonly string[] = ["home-root", "open-detail", "detail-root"],
): UIImplementationSpecV2 {
  const pages = pageIds.map((pageId, pageIndex) => ({
    compatibility: "native" as const,
    id: pageId,
    width: 1280,
    height: 720,
    sourceBlueprintPageId: `blueprint-${pageId}`,
    controls: controlIds
      .filter((_, controlIndex) => controlIndex % pageIds.length === pageIndex)
      .map((controlId) => ({
        id: controlId, role: "content", capabilityId: "text", depth: 0, zIndex: 0,
        geometry: { x: 0, y: 0, width: 200, height: 40 }, nativeProperties: {},
        sourceSolutionNodeId: `solution-${controlId}`,
        sourceBlueprintPageId: `blueprint-${pageId}`,
        sourceBlueprintRegionIds: [`region-${pageId}`], eventBindings: [],
      })),
  }));
  return UIImplementationSpecV2Schema.parse({
    schema: "kf-ui-implementation/v2", compatibility: "native", theme,
    compiledRoleStyles: {}, pages, compiledActions: [], compiledScripts: [],
  });
}

function correlationMaps(result: UIImplementationSpecV2) {
  return {
    controls: Object.fromEntries(result.runtimeCorrelation!.controls.map((entry) => [entry.semanticControlId, entry.instanceName])),
    pages: Object.fromEntries(result.runtimeCorrelation!.pages.map((entry) => [entry.semanticPageId, entry.pageGuid])),
  };
}

describe("attachRuntimeCorrelation", () => {
  it("attaches a complete immutable correlation without mutating its input", () => {
    const source = implementation();
    const before = structuredClone(source);
    const result = attachRuntimeCorrelation({ workspaceId: "workspace-1", implementation: source });

    expect(source).toEqual(before);
    expect(result).not.toBe(source);
    expect(result.runtimeCorrelation!.controls.map((entry) => entry.semanticControlId)).toEqual([
      "detail-root", "home-root", "open-detail",
    ]);
    expect(result.runtimeCorrelation!.pages).toEqual([
      { semanticPageId: "detail", pageGuid: `k${deriveGuid({ seed: "workspace-1" }, "detail")}` },
      { semanticPageId: "home", pageGuid: `k${deriveGuid({ seed: "workspace-1" }, "home")}` },
    ]);
    result.runtimeCorrelation!.controls.forEach((entry) => {
      expect(CompilerInstanceNameSchema.safeParse(entry.instanceName).success).toBe(true);
    });
    expect(UIImplementationSpecV2Schema.safeParse(result).success).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.runtimeCorrelation)).toBe(true);
    expect(Object.isFrozen(result.runtimeCorrelation!.controls[0])).toBe(true);
  });

  it("is idempotent, enumeration-order independent, and insertion-stable", () => {
    const first = attachRuntimeCorrelation({ workspaceId: "workspace-1", implementation: implementation() });
    const second = attachRuntimeCorrelation({ workspaceId: "workspace-1", implementation: first });
    expect(second).toEqual(first);

    const reordered = implementation(["detail", "home"], ["detail-root", "open-detail", "home-root"]);
    expect(correlationMaps(attachRuntimeCorrelation({ workspaceId: "workspace-1", implementation: reordered })))
      .toEqual(correlationMaps(first));

    const expanded = implementation(["home", "detail"], ["home-root", "open-detail", "detail-root", "unrelated-control"]);
    const expandedMap = correlationMaps(attachRuntimeCorrelation({ workspaceId: "workspace-1", implementation: expanded }));
    const firstMap = correlationMaps(first);
    Object.entries(firstMap.controls).forEach(([id, name]) => expect(expandedMap.controls[id]).toBe(name));
  });

  it("reuses uploaded native identities and valid compiler-derived identities", () => {
    const derived = attachRuntimeCorrelation({ workspaceId: "workspace-1", implementation: implementation() });
    const maps = correlationMaps(derived);
    const existing: VerifiedExistingRuntimeCorrelation = {
      controls: [
        { source: "uploaded-existing", semanticControlId: "home-root", instanceName: "UploadedLayout9" },
        { source: "workspace-derived", semanticControlId: "open-detail", instanceName: maps.controls["open-detail"]! },
      ],
      pages: [
        { source: "uploaded-existing", semanticPageId: "home", pageGuid: "k11111111-2222-4333-8444-555555555555" },
        { source: "workspace-derived", semanticPageId: "detail", pageGuid: maps.pages["detail"]! },
      ],
    };
    const result = attachRuntimeCorrelation({ workspaceId: "workspace-1", implementation: implementation(), verifiedExisting: existing });
    const correlated = correlationMaps(result);
    expect(correlated.controls["home-root"]).toBe("UploadedLayout9");
    expect(correlated.controls["open-detail"]).toBe(maps.controls["open-detail"]);
    expect(correlated.pages["home"]).toBe("k11111111-2222-4333-8444-555555555555");
    expect(correlated.pages["detail"]).toBe(maps.pages["detail"]);
  });

  it("rejects forged workspace-derived values while uploaded page GUIDs may be non-derived", () => {
    expect(() => attachRuntimeCorrelation({
      workspaceId: "workspace-1", implementation: implementation(),
      verifiedExisting: { controls: [{ source: "workspace-derived", semanticControlId: "home-root", instanceName: "Forged1" }], pages: [] },
    })).toThrowError(/FORGED_WORKSPACE_DERIVATION.*home-root/);
    expect(() => attachRuntimeCorrelation({
      workspaceId: "workspace-1", implementation: implementation(),
      verifiedExisting: { controls: [], pages: [{ source: "workspace-derived", semanticPageId: "home", pageGuid: "k11111111-2222-4333-8444-555555555555" }] },
    })).toThrowError(/FORGED_WORKSPACE_DERIVATION.*home/);
  });

  it.each([
    ["unknown", { controls: [{ source: "uploaded-existing", semanticControlId: "ghost", instanceName: "Ghost1" }], pages: [] }],
    ["duplicate", { controls: [
      { source: "uploaded-existing", semanticControlId: "home-root", instanceName: "One1" },
      { source: "uploaded-existing", semanticControlId: "home-root", instanceName: "Two2" },
    ], pages: [] }],
    ["semantic case alias", { controls: [{ source: "uploaded-existing", semanticControlId: "HOME-ROOT", instanceName: "One1" }], pages: [] }],
    ["runtime case alias", { controls: [
      { source: "uploaded-existing", semanticControlId: "home-root", instanceName: "Alias1" },
      { source: "uploaded-existing", semanticControlId: "open-detail", instanceName: "alias1" },
    ], pages: [] }],
    ["GUID alias", { controls: [], pages: [
      { source: "uploaded-existing", semanticPageId: "home", pageGuid: "k11111111-2222-4333-8444-555555555555" },
      { source: "uploaded-existing", semanticPageId: "detail", pageGuid: "k11111111-2222-4333-8444-555555555555" },
    ] }],
    ["invalid name", { controls: [{ source: "uploaded-existing", semanticControlId: "home-root", instanceName: "not-valid" }], pages: [] }],
    ["invalid GUID", { controls: [], pages: [{ source: "uploaded-existing", semanticPageId: "home", pageGuid: "11111111-2222-4333-8444-555555555555" }] }],
    ["missing field", { controls: [{ source: "uploaded-existing", semanticControlId: "home-root" }], pages: [] }],
  ])("rejects %s existing correlation", (_label, verifiedExisting) => {
    expect(() => attachRuntimeCorrelation({
      workspaceId: "workspace-1", implementation: implementation(),
      verifiedExisting: verifiedExisting as VerifiedExistingRuntimeCorrelation,
    })).toThrow(RuntimeCorrelationError);
  });

  it("rejects case-insensitive semantic aliases in the implementation", () => {
    const aliased = implementation(["Home", "home"], ["control-one", "control-two"]);
    expect(() => attachRuntimeCorrelation({ workspaceId: "workspace-1", implementation: aliased }))
      .toThrowError(/SEMANTIC_CASE_ALIAS/);
  });

  it("rejects adapted-v1 and already-compiled interactions", () => {
    const adapted = { ...implementation(), compatibility: "adapted-v1", pages: [] } as unknown as UIImplementationSpecV2;
    expect(() => attachRuntimeCorrelation({ workspaceId: "workspace-1", implementation: adapted }))
      .toThrowError(/NATIVE_IMPLEMENTATION_REQUIRED/);

    const compiled = structuredClone(implementation());
    compiled.compiledActions = [{ id: "unsafe" }] as never;
    expect(() => attachRuntimeCorrelation({ workspaceId: "workspace-1", implementation: compiled }))
      .toThrowError(/INTERACTIONS_ALREADY_COMPILED/);
  });

  it("rejects accessors and non-plain data before schema parsing", () => {
    const accessor = { workspaceId: "workspace-1", implementation: implementation() };
    Object.defineProperty(accessor, "verifiedExisting", { enumerable: true, get: () => ({ controls: [], pages: [] }) });
    expect(() => attachRuntimeCorrelation(accessor as never)).toThrowError(/INPUT_ACCESSOR_FORBIDDEN/);

    const nonPlain = { workspaceId: "workspace-1", implementation: implementation(), verifiedExisting: new Map() };
    expect(() => attachRuntimeCorrelation(nonPlain as never)).toThrowError(/INPUT_NON_PLAIN_DATA/);
  });
});
