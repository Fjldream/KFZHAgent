import {
  CompilerInstanceNameSchema,
  UIImplementationSpecV2Schema,
  type UIImplementationSpecV2,
} from "@kf/contracts";
import { describe, expect, it } from "vitest";
import { beforeAll } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { compileClientProject } from "../compile/client-compiler.js";
import { deriveGuid } from "../compile/guid-factory.js";
import { inspectClientProject, serverOwnedRuntimeIdentitySnapshot, type InspectResult } from "../inspect/client-inspector.js";
import {
  attachRuntimeCorrelation,
  readVerifiedExistingRuntimeCorrelation,
  verifyExistingRuntimeCorrelation,
  type ExistingRuntimeCorrelationDisposition,
  type VerifiedExistingRuntimeCorrelationHandle,
} from "./runtime-correlation.js";

const theme = {
  background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32",
  textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;
const WORKSPACE_ID = "workspace-1";
const BASE_REVISION_ID = "revision-1";

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
        id: controlId, role: "content",
        capabilityId: controlId === "open-detail" ? "button" : controlId === "detail-root" ? "easyui.1"
          : controlId === "layout-host" ? "layout.4" : controlId === "layout-two" ? "layout.2" : "text",
        depth: 0, zIndex: 0,
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
  let realInspection: InspectResult;
  let unboundInspection: InspectResult;
  let wrongWorkspaceInspection: InspectResult;
  let oldRevisionInspection: InspectResult;
  let mixedEnvelopeInspection: InspectResult;
  let legacyLayoutInspection: InspectResult;
  let ownershipInspection: InspectResult;
  let opaqueInspection: InspectResult;
  let realWorkspacePath: string;
  let uploadedPageGuid: string;
  let legacyLayoutPageGuid: string;
  let ownershipPageGuids: readonly string[];
  const runtimeBinding = { workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID } as const;
  beforeAll(async () => {
    const workspace = await compileClientProject({
      schema: "kf-client-project-ir/v1", id: "existing-project", name: "Existing", version: "1.0.0.1",
      pages: [{ id: "existing-page", name: "Page1", width: 1280, height: 720, controls: [
        { id: "Button1", type: "button", x: 10, y: 10, width: 90, height: 40, text: "Existing" },
        { id: "Text1", type: "text", x: 10, y: 60, width: 90, height: 40, text: "Existing" },
        { id: "Table1", type: "table", x: 10, y: 110, width: 320, height: 180 },
        { id: "Datagrid1", type: "easyui", proto: 1, x: 10, y: 300, width: 320, height: 180 },
        { id: "Layout1", type: "layout", layoutType: 4, x: 350, y: 10, width: 320, height: 480, children: [] },
      ] }], variables: [], scripts: [],
    }, { seed: "uploaded-workspace" });
    realWorkspacePath = workspace.path;
    unboundInspection = await inspectClientProject(workspace.path);
    wrongWorkspaceInspection = await inspectClientProject(workspace.path, {
      runtimeBinding: { workspaceId: "workspace-2", baseRevisionId: BASE_REVISION_ID },
    });
    oldRevisionInspection = await inspectClientProject(workspace.path, {
      runtimeBinding: { workspaceId: WORKSPACE_ID, baseRevisionId: "revision-0" },
    });
    realInspection = await inspectClientProject(workspace.path, { runtimeBinding });
    uploadedPageGuid = Object.keys(realInspection.index.pages)[0]!;

    const inspectMutated = async (seed: string, control: Record<string, unknown>, mutate: (native: Record<string, unknown>) => void) => {
      const candidate = await compileClientProject({
        schema: "kf-client-project-ir/v1", id: seed, name: seed, version: "1.0.0.1",
        pages: [{ id: "existing-page", name: "Page1", width: 1280, height: 720, controls: [control] }], variables: [], scripts: [],
      } as never, { seed });
      const pageFile = path.join(candidate.path, "1.0.0.1", "project", "page", "Page1.json");
      const page = JSON.parse(await readFile(pageFile, "utf8")) as { objects: Array<Record<string, unknown>> };
      mutate(page.objects[0]!);
      await writeFile(pageFile, JSON.stringify(page));
      return inspectClientProject(candidate.path, { runtimeBinding });
    };
    mixedEnvelopeInspection = await inspectMutated("mixed-envelope", {
      id: "Button1", type: "button", x: 10, y: 10, width: 90, height: 40, text: "Existing",
    }, (native) => { native.objectType = 3; native.uiExtendType = 1; });
    legacyLayoutInspection = await inspectMutated("legacy-layout", {
      id: "Layout1", type: "layout", layoutType: 4, x: 0, y: 0, width: 320, height: 480, children: [],
    }, (native) => { delete native.objectType; });
    legacyLayoutPageGuid = Object.keys(legacyLayoutInspection.index.pages)[0]!;

    const ownershipWorkspace = await compileClientProject({
      schema: "kf-client-project-ir/v1", id: "ownership-project", name: "Ownership", version: "1.0.0.1",
      pages: [
        { id: "first-page", name: "FirstPage", width: 1280, height: 720, controls: [
          { id: "Text1", type: "text", x: 0, y: 0, width: 100, height: 30, text: "First" },
        ] },
        { id: "second-page", name: "SecondPage", width: 1280, height: 720, controls: [
          { id: "Text2", type: "text", x: 0, y: 0, width: 100, height: 30, text: "Second" },
        ] },
      ], variables: [], scripts: [],
    }, { seed: "ownership-workspace" });
    ownershipInspection = await inspectClientProject(ownershipWorkspace.path, { runtimeBinding });
    ownershipPageGuids = Object.keys(ownershipInspection.index.pages);

    const opaqueWorkspace = await compileClientProject({
      schema: "kf-client-project-ir/v1", id: "opaque-project", name: "Opaque", version: "1.0.0.1",
      pages: [{ id: "opaque-page", name: "OpaquePage", width: 1280, height: 720, controls: [
        { id: "Text1", type: "text", x: 0, y: 0, width: 100, height: 30, text: "Opaque" },
      ] }], variables: [], scripts: [],
    }, { seed: "opaque-workspace" });
    const opaquePagePath = path.join(opaqueWorkspace.path, "1.0.0.1", "project", "page", "OpaquePage.json");
    const opaquePage = JSON.parse(await readFile(opaquePagePath, "utf8")) as Record<string, unknown>;
    opaquePage.guid = "7UJ0lvKq8Q708A6Zl0C02";
    await writeFile(opaquePagePath, JSON.stringify(opaquePage));
    const managerPath = path.join(opaqueWorkspace.path, "1.0.0.1", "project", "pageManager.json");
    const manager = JSON.parse(await readFile(managerPath, "utf8")) as { Pages: Array<Record<string, unknown>> };
    manager.Pages[0]!.id = "7UJ0lvKq8Q708A6Zl0C02";
    await writeFile(managerPath, JSON.stringify(manager));
    opaqueInspection = await inspectClientProject(opaqueWorkspace.path, { runtimeBinding });
  });

  function verified(correlations: ExistingRuntimeCorrelationDisposition): VerifiedExistingRuntimeCorrelationHandle {
    return verifyExistingRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, inspection: realInspection, correlations,
    });
  }

  it("projects a frozen compiler-only verified existing disposition bound to workspace and revision", () => {
    const handle = verified({
      controls: [{ source: "uploaded-existing", semanticControlId: "existing", instanceName: "Button1" }],
      pages: [{ source: "uploaded-existing", semanticPageId: "existing-page", pageGuid: uploadedPageGuid }],
    });
    const projection = readVerifiedExistingRuntimeCorrelation(handle, WORKSPACE_ID, BASE_REVISION_ID);
    expect(projection.controls[0]).toMatchObject({ semanticControlId: "existing", instanceName: "Button1", source: "uploaded-existing" });
    expect(projection.controls[0]!.nativeGuid).toMatch(/./);
    expect(Object.isFrozen(projection.controls)).toBe(true);
    expect(() => readVerifiedExistingRuntimeCorrelation(handle, "other", BASE_REVISION_ID)).toThrow(/VERIFIED_IDENTITY_MISMATCH/);
  });

  it("attaches a complete immutable correlation without mutating its input", () => {
    const source = implementation();
    const before = structuredClone(source);
    const result = attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: source });

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
    const names = correlationMaps(result).controls;
    expect(names["open-detail"]).toMatch(/^Button\d+$/);
    expect(names["detail-root"]).toMatch(/^Datagrid\d+$/);
    expect(names["home-root"]).toMatch(/^Text\d+$/);
    expect(UIImplementationSpecV2Schema.safeParse(result).success).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.runtimeCorrelation)).toBe(true);
    expect(Object.isFrozen(result.runtimeCorrelation!.controls[0])).toBe(true);
  });

  it("is idempotent, enumeration-order independent, and insertion-stable", () => {
    const first = attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: implementation() });
    const second = attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: first });
    expect(second).toEqual(first);

    const reordered = implementation(["detail", "home"], ["detail-root", "open-detail", "home-root"]);
    expect(correlationMaps(attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: reordered })))
      .toEqual(correlationMaps(first));

    const expanded = implementation(["home", "detail"], ["home-root", "open-detail", "detail-root", "unrelated-control"]);
    const expandedMap = correlationMaps(attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: expanded }));
    const firstMap = correlationMaps(first);
    Object.entries(firstMap.controls).forEach(([id, name]) => expect(expandedMap.controls[id]).toBe(name));
  });

  it("reuses uploaded native identities and valid compiler-derived identities", () => {
    const derived = attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: implementation() });
    const maps = correlationMaps(derived);
    const existing = verified({
      controls: [
        { source: "uploaded-existing", semanticControlId: "home-root", instanceName: "Text1" },
        { source: "workspace-derived", semanticControlId: "open-detail", instanceName: maps.controls["open-detail"]! },
        { source: "workspace-derived", semanticControlId: "detail-root", instanceName: maps.controls["detail-root"]! },
      ],
      pages: [
        { source: "uploaded-existing", semanticPageId: "home", pageGuid: uploadedPageGuid },
        { source: "workspace-derived", semanticPageId: "detail", pageGuid: maps.pages["detail"]! },
      ],
    });
    const result = attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: implementation(), verifiedExisting: existing });
    const correlated = correlationMaps(result);
    expect(correlated.controls["home-root"]).toBe("Text1");
    expect(correlated.controls["open-detail"]).toBe(maps.controls["open-detail"]);
    expect(correlated.pages["home"]).toBe(uploadedPageGuid);
    expect(correlated.pages["detail"]).toBe(maps.pages["detail"]);
  });

  it("binds uploaded identities to the implementation capability's exact native runtime type", () => {
    const derived = allDerived(WORKSPACE_ID);
    const withUploadedDatagrid = (instanceName: string) => verified({
      controls: derived.controls.map((entry) => entry.semanticControlId === "detail-root"
        ? { source: "uploaded-existing" as const, semanticControlId: entry.semanticControlId, instanceName }
        : entry),
      pages: derived.pages.map((entry) => entry.semanticPageId === "home"
        ? { source: "uploaded-existing" as const, semanticPageId: entry.semanticPageId, pageGuid: uploadedPageGuid }
        : entry),
    });
    for (const forgedName of ["Table1", "Button1"]) {
      expect(() => attachRuntimeCorrelation({
        workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: implementation(),
        verifiedExisting: withUploadedDatagrid(forgedName),
      })).toThrowError(/UPLOADED_NATIVE_TYPE_MISMATCH.*detail-root/);
    }
    const textAsButton = verified({
      controls: derived.controls.map((entry) => entry.semanticControlId === "home-root"
        ? { source: "uploaded-existing" as const, semanticControlId: entry.semanticControlId, instanceName: "Button1" }
        : entry),
      pages: derived.pages.map((entry) => entry.semanticPageId === "home"
        ? { source: "uploaded-existing" as const, semanticPageId: entry.semanticPageId, pageGuid: uploadedPageGuid }
        : entry),
    });
    expect(() => attachRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: implementation(), verifiedExisting: textAsButton,
    })).toThrowError(/UPLOADED_NATIVE_TYPE_MISMATCH.*home-root/);
    const accepted = attachRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: implementation(),
      verifiedExisting: withUploadedDatagrid("Datagrid1"),
    });
    expect(correlationMaps(accepted).controls["detail-root"]).toBe("Datagrid1");
  });

  it("captures deeply immutable exact native types in the server-owned inspection snapshot", () => {
    const snapshot = serverOwnedRuntimeIdentitySnapshot(realInspection);
    if (snapshot === undefined) throw new Error("server-owned snapshot missing");
    expect(snapshot.controls.find((control) => control.name === "Button1")?.nativeType)
      .toEqual({ kind: "static", uiModelType: 35 });
    expect(snapshot.controls.find((control) => control.name === "Datagrid1")?.nativeType)
      .toEqual({ kind: "easyui", objectType: 3, uiExtendType: 1 });
    expect(snapshot.controls.find((control) => control.name === "Layout1")?.nativeType)
      .toEqual({ kind: "layout", objectType: 2, layoutType: 4 });
    expect(snapshot.runtimeBinding).toEqual(runtimeBinding);
    expect(snapshot.controls.find((control) => control.name === "Button1")).toMatchObject({
      guid: expect.any(String), pageGuid: uploadedPageGuid,
    });
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(Object.isFrozen(snapshot.runtimeBinding)).toBe(true);
    expect(Object.isFrozen(snapshot.controls)).toBe(true);
    expect(snapshot.controls.every((control) => Object.isFrozen(control) && Object.isFrozen(control.nativeType))).toBe(true);
  });

  it("requires inspection-owned exact workspace and base revision provenance", () => {
    const correlations = allDerived(WORKSPACE_ID);
    for (const inspection of [unboundInspection, wrongWorkspaceInspection, oldRevisionInspection]) {
      expect(() => verifyExistingRuntimeCorrelation({
        workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, inspection, correlations,
      })).toThrowError(/INSPECTION_BINDING_MISMATCH/);
    }
    expect(() => verifyExistingRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, inspection: realInspection, correlations,
    })).not.toThrow();
  });

  it("rejects malformed or unbounded server runtime inspection bindings", async () => {
    await expect(inspectClientProject(realWorkspacePath, {
      runtimeBinding: { workspaceId: " workspace-1", baseRevisionId: BASE_REVISION_ID },
    })).rejects.toThrow(/bounded exact/);
    await expect(inspectClientProject(realWorkspacePath, {
      runtimeBinding: { workspaceId: "x".repeat(201), baseRevisionId: BASE_REVISION_ID },
    })).rejects.toThrow(/bounded exact/);
    await expect(inspectClientProject(realWorkspacePath, {
      runtimeBinding: { workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, extra: true } as never,
    })).rejects.toThrow(/exactly workspaceId and baseRevisionId/);
  });

  it("binds uploaded controls to the exact uploaded implementation page", () => {
    const source = implementation(["home"], ["home-root"]);
    const [firstPageGuid, secondPageGuid] = ownershipPageGuids;
    if (firstPageGuid === undefined || secondPageGuid === undefined) throw new Error("ownership pages missing");
    const proof = (instanceName: string, pageGuid: string) => verifyExistingRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, inspection: ownershipInspection,
      correlations: {
        controls: [{ source: "uploaded-existing", semanticControlId: "home-root", instanceName }],
        pages: [{ source: "uploaded-existing", semanticPageId: "home", pageGuid }],
      },
    });
    expect(correlationMaps(attachRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: source,
      verifiedExisting: proof("Text1", firstPageGuid),
    })).controls["home-root"]).toBe("Text1");
    expect(() => attachRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: source,
      verifiedExisting: proof("Text2", firstPageGuid),
    })).toThrowError(/UPLOADED_CONTROL_PAGE_MISMATCH.*home-root/);
  });

  it("round-trips an exact case-preserved opaque uploaded page identity", () => {
    const source = implementation(["home"], ["home-root"]);
    const pageGuid = "7UJ0lvKq8Q708A6Zl0C02";
    const proof = verifyExistingRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, inspection: opaqueInspection,
      correlations: {
        controls: [{ source: "uploaded-existing", semanticControlId: "home-root", instanceName: "Text1" }],
        pages: [{ source: "uploaded-existing", semanticPageId: "home", pageGuid }],
      },
    });
    const attached = attachRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: source, verifiedExisting: proof,
    });
    expect(attached.runtimeCorrelation!.pages[0]!.pageGuid).toBe(pageGuid);
    expect(UIImplementationSpecV2Schema.parse(attached).runtimeCorrelation!.pages[0]!.pageGuid).toBe(pageGuid);
    for (const invalid of ["bad page", "../page"]) {
      expect(() => verifyExistingRuntimeCorrelation({
        workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, inspection: opaqueInspection,
        correlations: { controls: [], pages: [{ source: "uploaded-existing", semanticPageId: "home", pageGuid: invalid }] },
      })).toThrowError(/INVALID_PAGE_GUID/);
    }
  });

  it("accepts the exact compiler/template layout envelope for uploaded layout capabilities", () => {
    const source = implementation(["home"], ["layout-host"]);
    const proof = verified({
      controls: [{ source: "uploaded-existing", semanticControlId: "layout-host", instanceName: "Layout1" }],
      pages: [{ source: "uploaded-existing", semanticPageId: "home", pageGuid: uploadedPageGuid }],
    });
    expect(correlationMaps(attachRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: source, verifiedExisting: proof,
    })).controls["layout-host"]).toBe("Layout1");
  });

  it("rejects inspector-branded mixed envelopes before uploaded type binding", () => {
    const source = implementation(["home"], ["open-detail"]);
    const derived = correlationMaps(attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: source }));
    const proof = verifyExistingRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, inspection: mixedEnvelopeInspection,
      correlations: {
        controls: [{ source: "uploaded-existing", semanticControlId: "open-detail", instanceName: "Button1" }],
        pages: [{ source: "workspace-derived", semanticPageId: "home", pageGuid: derived.pages.home! }],
      },
    });
    expect(() => attachRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: source, verifiedExisting: proof,
    })).toThrowError(/UPLOADED_NATIVE_TYPE_MISMATCH.*open-detail/);
  });

  it("accepts only the confirmed objectType-less legacy envelope for matching layout types", () => {
    const source = implementation(["home"], ["layout-host"]);
    const proof = verifyExistingRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, inspection: legacyLayoutInspection,
      correlations: {
        controls: [{ source: "uploaded-existing", semanticControlId: "layout-host", instanceName: "Layout1" }],
        pages: [{ source: "uploaded-existing", semanticPageId: "home", pageGuid: legacyLayoutPageGuid }],
      },
    });
    expect(correlationMaps(attachRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: source, verifiedExisting: proof,
    })).controls["layout-host"]).toBe("Layout1");

    for (const [semanticControlId, instanceName] of [["layout-two", "Layout1"], ["layout-host", "Button1"], ["layout-host", "Datagrid1"]] as const) {
      const candidate = implementation(["home"], [semanticControlId]);
      const mismatched = verified({
        controls: [{ source: "uploaded-existing", semanticControlId, instanceName }],
        pages: [{ source: "uploaded-existing", semanticPageId: "home", pageGuid: uploadedPageGuid }],
      });
      expect(() => attachRuntimeCorrelation({
        workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: candidate, verifiedExisting: mismatched,
      })).toThrowError(/UPLOADED_NATIVE_TYPE_MISMATCH/);
    }
  });

  it("rejects forged workspace-derived values while uploaded page GUIDs may be non-derived", () => {
    expect(() => attachRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: implementation(),
      verifiedExisting: verified({
        controls: [
          { source: "workspace-derived", semanticControlId: "home-root", instanceName: "Forged1" },
          { source: "workspace-derived", semanticControlId: "open-detail", instanceName: mapsFor("workspace-1").controls["open-detail"]! },
          { source: "workspace-derived", semanticControlId: "detail-root", instanceName: mapsFor("workspace-1").controls["detail-root"]! },
        ],
        pages: [
          { source: "workspace-derived", semanticPageId: "home", pageGuid: mapsFor("workspace-1").pages["home"]! },
          { source: "workspace-derived", semanticPageId: "detail", pageGuid: mapsFor("workspace-1").pages["detail"]! },
        ],
      }),
    })).toThrowError(/FORGED_WORKSPACE_DERIVATION.*home-root/);
    expect(() => attachRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: implementation(),
      verifiedExisting: verified({
        controls: allDerived("workspace-1").controls,
        pages: [
          { source: "workspace-derived", semanticPageId: "home", pageGuid: "k11111111-2222-4333-8444-555555555555" },
          { source: "workspace-derived", semanticPageId: "detail", pageGuid: mapsFor("workspace-1").pages["detail"]! },
        ],
      }),
    })).toThrowError(/FORGED_WORKSPACE_DERIVATION.*home/);
  });

  function mapsFor(workspaceId: string) {
    return correlationMaps(attachRuntimeCorrelation({ workspaceId, baseRevisionId: BASE_REVISION_ID, implementation: implementation() }));
  }

  function allDerived(workspaceId: string): ExistingRuntimeCorrelationDisposition {
    const maps = mapsFor(workspaceId);
    return {
      controls: Object.entries(maps.controls).map(([semanticControlId, instanceName]) => ({ source: "workspace-derived", semanticControlId, instanceName })),
      pages: Object.entries(maps.pages).map(([semanticPageId, pageGuid]) => ({ source: "workspace-derived", semanticPageId, pageGuid })),
    };
  }

  it("rejects plain proof declarations, untrusted inspections, and incomplete dispositions", () => {
    const declaration = allDerived("workspace-1");
    expect(() => attachRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: implementation(), verifiedExisting: declaration as never,
    })).toThrowError(/INVALID_VERIFIED_HANDLE/);
    expect(() => verifyExistingRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, inspection: structuredClone(realInspection), correlations: declaration }))
      .toThrowError(/UNTRUSTED_INSPECTION/);
    const partial = verified({ controls: declaration.controls.slice(1), pages: declaration.pages });
    expect(() => attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: implementation(), verifiedExisting: partial }))
      .toThrowError(/MISSING_CORRELATION/);
  });

  it("rejects duplicate, invalid, aliased, and inspector-mismatched declarations", () => {
    const duplicate = allDerived("workspace-1");
    expect(() => verified({ ...duplicate, controls: [...duplicate.controls, { ...duplicate.controls[0]! }] }))
      .toThrowError(/DUPLICATE_CORRELATION/);
    expect(() => verified({ controls: [{ source: "uploaded-existing", semanticControlId: "home-root", instanceName: "Missing1" }], pages: [] }))
      .toThrowError(/UPLOADED_ENTITY_MISMATCH/);
    expect(() => verified({ controls: [], pages: [{ source: "uploaded-existing", semanticPageId: "home", pageGuid: "k11111111-2222-4333-8444-555555555555" }] }))
      .toThrowError(/UPLOADED_ENTITY_MISMATCH/);
    expect(() => verified({ controls: [{ source: "workspace-derived", semanticControlId: "home-root", instanceName: "not-valid" }], pages: [] }))
      .toThrowError(/INVALID_INSTANCE_NAME/);
  });

  it("uses the immutable identity snapshot rather than a mutated branded inspection", () => {
    realInspection.index.controls.fake = {
      guid: "fake", pageGuid: uploadedPageGuid, type: "button", capabilityId: "button",
      x: 0, y: 0, width: 1, height: 1, id: "Forged1", name: "Forged1", rawPath: "fake", unknownFields: [],
    };
    try {
      expect(() => verified({ controls: [{ source: "uploaded-existing", semanticControlId: "home-root", instanceName: "Forged1" }], pages: [] }))
        .toThrowError(/UPLOADED_ENTITY_MISMATCH/);
    } finally {
      delete realInspection.index.controls.fake;
    }
  });

  it("requires the same verified proof when an uploaded or mixed correlation is attached again", () => {
    const derived = allDerived("workspace-1");
    const mixed = verified({
      controls: derived.controls.map((entry) => entry.semanticControlId === "home-root"
        ? { source: "uploaded-existing" as const, semanticControlId: entry.semanticControlId, instanceName: "Text1" }
        : entry),
      pages: derived.pages.map((entry) => entry.semanticPageId === "home"
        ? { source: "uploaded-existing" as const, semanticPageId: entry.semanticPageId, pageGuid: uploadedPageGuid }
        : entry),
    });
    const first = attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: implementation(), verifiedExisting: mixed });
    expect(() => attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: first }))
      .toThrowError(/EXISTING_CORRELATION_PROOF_REQUIRED/);
    expect(attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: first, verifiedExisting: mixed })).toEqual(first);
  });

  it("binds verified proof to exact workspace and base revision identity", () => {
    expect(() => attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, implementation: implementation() } as never))
      .toThrowError(/INPUT_INVALID.*incomplete/);
    const handle = verified(allDerived(WORKSPACE_ID));
    expect(() => attachRuntimeCorrelation({
      workspaceId: "workspace-2", baseRevisionId: BASE_REVISION_ID, implementation: implementation(), verifiedExisting: handle,
    })).toThrowError(/VERIFIED_IDENTITY_MISMATCH/);
    expect(() => attachRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: "revision-2", implementation: implementation(), verifiedExisting: handle,
    })).toThrowError(/VERIFIED_IDENTITY_MISMATCH/);
    const first = attachRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: implementation(), verifiedExisting: handle,
    });
    expect(attachRuntimeCorrelation({
      workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: first, verifiedExisting: handle,
    })).toEqual(first);
  });

  it("rejects case-insensitive semantic aliases in the implementation", () => {
    const aliased = implementation(["Home", "home"], ["control-one", "control-two"]);
    expect(() => attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: aliased }))
      .toThrowError(/SEMANTIC_CASE_ALIAS/);
  });

  it("rejects adapted-v1 and already-compiled interactions", () => {
    const adapted = { ...implementation(), compatibility: "adapted-v1", pages: [] } as unknown as UIImplementationSpecV2;
    expect(() => attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: adapted }))
      .toThrowError(/NATIVE_IMPLEMENTATION_REQUIRED/);

    const compiled = structuredClone(implementation());
    compiled.compiledActions = [{ id: "unsafe" }] as never;
    expect(() => attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: compiled }))
      .toThrowError(/INTERACTIONS_ALREADY_COMPILED/);
  });

  it("rejects accessors and non-plain data before schema parsing", () => {
    const accessor = { workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: implementation() };
    Object.defineProperty(accessor, "verifiedExisting", { enumerable: true, get: () => ({ controls: [], pages: [] }) });
    expect(() => attachRuntimeCorrelation(accessor as never)).toThrowError(/INPUT_ACCESSOR_FORBIDDEN/);

    const nonPlainImplementation = implementation();
    const nonPlainControl = nonPlainImplementation.pages[0]!.compatibility === "native" ? nonPlainImplementation.pages[0]!.controls[0]! : undefined;
    if (nonPlainControl === undefined) throw new Error("fixture drift");
    nonPlainControl.nativeProperties = { invalid: new Map() as never };
    const nonPlain = { workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: nonPlainImplementation };
    expect(() => attachRuntimeCorrelation(nonPlain as never)).toThrowError(/INPUT_NON_PLAIN_DATA/);
  });

  it("rejects proxies before invoking reflection traps and rejects shared aliases", () => {
    let traps = 0;
    const proxied = new Proxy({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: implementation() }, {
      getPrototypeOf: () => { traps += 1; return Object.prototype; },
      ownKeys: () => { traps += 1; return []; },
      getOwnPropertyDescriptor: () => { traps += 1; return undefined; },
    });
    expect(() => attachRuntimeCorrelation(proxied)).toThrowError(/INPUT_PROXY_FORBIDDEN/);
    expect(traps).toBe(0);

    const correlationProxy = new Proxy(allDerived("workspace-1"), {
      ownKeys: () => { traps += 1; return []; },
      getPrototypeOf: () => { traps += 1; return Object.prototype; },
    });
    expect(() => verifyExistingRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, inspection: realInspection, correlations: correlationProxy }))
      .toThrowError(/INPUT_PROXY_FORBIDDEN/);
    expect(traps).toBe(0);

    const aliased = implementation();
    const shared = { safe: true };
    const control = aliased.pages[0]!.compatibility === "native" ? aliased.pages[0]!.controls[0]! : undefined;
    if (control === undefined) throw new Error("fixture drift");
    control.nativeProperties = { first: shared, second: shared };
    expect(() => attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: aliased }))
      .toThrowError(/INPUT_ALIAS_FORBIDDEN/);
  });

  it("fails closed for an unreviewed capability prefix", () => {
    const unknown = implementation();
    if (unknown.pages[0]!.compatibility !== "native") throw new Error("fixture drift");
    unknown.pages[0]!.controls[0]!.capabilityId = "unknown-runtime-control";
    expect(() => attachRuntimeCorrelation({ workspaceId: WORKSPACE_ID, baseRevisionId: BASE_REVISION_ID, implementation: unknown }))
      .toThrowError(/RUNTIME_PREFIX_UNSUPPORTED/);
  });
});
