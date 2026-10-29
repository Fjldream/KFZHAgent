// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { describe, expect, it } from "vitest";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { canonicalChangePlanHash, canonicalServerHash, CustomerSolutionBlueprintSchema, SolutionImplementationPlanSchema } from "@kf/contracts";
import { createHmacCreativeBuildFacade, resolveStoredPlan } from "@kf/build-jobs";
import { compileClientProject } from "../compile/client-compiler.js";
import { getDesignKnowledgeSnapshot } from "../design-knowledge/design-knowledge-catalog.js";
import { retrieveCapabilities } from "../planning/capability-retrieval.js";
import { createDefaultModuleRegistry } from "../modules/module-registry.js";
import { compileSolutionImplementationWithProvenance } from "../solution-compile/solution-compiler.js";
import { attachRuntimeCorrelation, verifyExistingRuntimeCorrelation, type VerifiedExistingRuntimeCorrelationHandle } from "../implementation/runtime-correlation.js";
import { createCreativeUIImplementationV2Compiler } from "../implementation/ui-implementation-v2-compiler.js";
import { compileInteractions } from "../interaction/interaction-compiler.js";
import { inspectClientProject } from "../inspect/client-inspector.js";
import { applyClientPatch } from "./client-patcher.js";
import { validateClientProject } from "../validate/client-validator.js";

const workspaceId = "mixed-geometry-workspace";
function inputFor(key: "a" | "b", headerSize: number, verifiedExisting?: VerifiedExistingRuntimeCorrelationHandle) {
  const label = `设备${key.toUpperCase()}`;
  const blueprint = CustomerSolutionBlueprintSchema.parse({ schema: "kf-design-plan/v3", displayName: "设备概况", objective: "阅读演示设备",
    audiences: ["操作员"], scenarios: ["设备概况"], pages: [{ id: "bp-overview", title: "设备概览", purpose: "阅读设备", readingOrder: ["devices"],
      regions: [{ id: "devices", purpose: "展示设备", semanticRoles: ["text", "status-summary"], dataShape: "summary", density: "comfortable", importance: "primary",
        content: [label], sampleData: [], interactions: [], states: ["初始"], visualIntent: "清晰" }] }],
    journeys: [{ id: "read-devices", actor: "操作员", goal: "阅读演示设备", steps: [{ kind: "observe", pageId: "bp-overview", regionId: "devices",
      action: "阅读设备名称", result: "看到设备名称", expectedTexts: [label] }], completion: "名称可见" }],
    visualDirection: { tone: "清晰", colors: ["蓝色"], typography: "清晰", spacingAndSurfaces: "舒适" }, acceptanceScenarios: ["设备名称正确"], openQuestions: [] });
  const candidateBundle = retrieveCapabilities({ blueprint, knowledge: getDesignKnowledgeSnapshot() });
  const intent = { importance: "primary", visualWeight: 1, readingOrder: 0, density: "comfortable", groupWith: [], width: { mode: "fill" }, height: { mode: "content" }, align: "start" };
  const semanticPlan = SolutionImplementationPlanSchema.parse({ schema: "kf-solution-implementation/v1", projectKey: "devices",
    blueprintHash: canonicalServerHash(blueprint), candidateBundleHash: canonicalServerHash(candidateBundle),
    theme: { background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32", textPrimary: "#14212b", textSecondary: "#52616d",
      fontFamily: "Inter", spacingUnit: 8, radiusScale: { small: 4, medium: 8, large: 16 } },
    roleStyles: [{ role: "content", declarations: {}, states: {} }, { role: "role-heading", declarations: { fontSize: headerSize, lineHeight: 1.3 }, states: {} },
      { role: "role-panel", declarations: { padding: 20 }, states: {} }],
    localState: [], actions: [], scripts: [], overlays: [],
    mockData: [{ id: "devices", purpose: "演示设备", fields: [{ key: "id", label: "标识", type: "text" }, { key: "label", label: "设备", type: "text" }],
      records: [{ values: [{ field: "id", value: key }, { field: "label", value: label }] }] }],
    pages: [{ id: "overview", title: "设备概览", purpose: "阅读设备", canvas: "desktop", sourceBlueprintPageId: "bp-overview", sourceBlueprintRegionIds: ["devices"], initialStateIds: [],
      root: { id: "page-root", kind: "layout", layout: "column", sourceBlueprintRegionIds: ["devices"], intent: { ...intent, height: { mode: "viewport" } }, children: [
        { id: "heading", kind: "control", capabilityId: "text", content: "设备概览", properties: [], tabIds: [], styleRole: "role-heading", eventBindings: [],
          sourceBlueprintRegionIds: ["devices"], intent },
        { id: "panel", kind: "layout", layout: "column", styleRole: "role-panel", sourceBlueprintRegionIds: ["devices"], intent, children: [
          { id: "device-list", kind: "repeater", mockDataId: "devices", itemAlias: "device", keyField: "id", maxItems: 1,
            sourceBlueprintRegionIds: ["devices"], intent, template: { id: "device-label", kind: "control", capabilityId: "text",
              content: { kind: "repeater-field", itemAlias: "device", field: "label" }, properties: [], tabIds: [], styleRole: "content", eventBindings: [],
              sourceBlueprintRegionIds: ["devices"], intent } },
        ] },
      ] } }],
  });
  const compiled = compileSolutionImplementationWithProvenance({ plan: semanticPlan, candidateBundle, moduleRegistry: createDefaultModuleRegistry(),
    approvedAssets: [], activeCatalogVersion: candidateBundle.knowledgeCatalogVersion });
  const correlated = attachRuntimeCorrelation({ workspaceId, baseRevisionId: "revision", implementation: compiled.implementation,
    ...(verifiedExisting ? { verifiedExisting } : {}) });
  const interaction = compileInteractions({ blueprint, plan: semanticPlan, implementation: correlated });
  expect(interaction.diagnostics.errors).toEqual([]);
  return { workspaceId, baseRevisionId: "revision", blueprint, candidateBundle, semanticPlan, implementation: interaction.implementation,
    compilerVersion: "1.0.0", evidenceVersion: "1.0.0", ...(verifiedExisting ? { verifiedExisting } : {}) };
}

describe("creative mixed existing and new native geometry", () => {
  it("keeps reused parents and newly expanded repeater rows in the signed page coordinate space", async () => {
    const facade = createHmacCreativeBuildFacade(Buffer.alloc(32, 0x74), createCreativeUIImplementationV2Compiler);
    const firstInput = inputFor("a", 28);
    const first = facade.compiler.compiler.compile(firstInput);
    const firstHash = canonicalChangePlanHash(first.plan);
    const firstEnvelope = facade.authority.sign({ plan: first.plan, revisionId: "revision", semanticOperations: first.semanticOperations, creative: first.trustedCreativePayload });
    const firstResolved = resolveStoredPlan(firstEnvelope, { expectedPlanHash: firstHash, expectedRevisionId: "revision" }, facade.authority);
    const base = await compileClientProject({ schema: "kf-client-project-ir/v1", id: "solution", name: "Solution", version: "1.0.0.1",
      pages: [{ id: "page-home", name: "Page1", width: 1440, height: 900, controls: [] }], variables: [], scripts: [] }, { seed: "mixed-base" });
    const published = await applyClientPatch(base.rootDir, first.plan, { planHash: firstHash, creativeMaterialization: firstResolved.creativeMaterialization!, replaceGenerativeBootstrap: true });
    const firstInspection = await inspectClientProject(published.rootDir);
    const physicalPagePath = path.join(published.rootDir, "1.0.0.1", firstInspection.index.pages[first.materialization.pages[0]!.pageGuid]!.file);
    const firstPage = JSON.parse(await readFile(physicalPagePath, "utf8"));
    firstPage.futureUnmanagedMetadata = { keep: "unrelated native fields" };
    await writeFile(physicalPagePath, JSON.stringify(firstPage));
    const inspection = await inspectClientProject(published.rootDir, { runtimeBinding: { workspaceId, baseRevisionId: "revision" } });
    const nextInput = inputFor("b", 26);
    const prior = first.artifact.implementation.runtimeCorrelation!;
    const priorById = new Map(prior.controls.map(control => [control.semanticControlId, control]));
    const existing = verifyExistingRuntimeCorrelation({ workspaceId, baseRevisionId: "revision", inspection, correlations: {
      pages: prior.pages.map(page => ({ ...page, source: "uploaded-existing" })),
      controls: nextInput.implementation.runtimeCorrelation!.controls.map(control => priorById.has(control.semanticControlId)
        ? { ...priorById.get(control.semanticControlId)!, source: "uploaded-existing" } : { ...control, source: "workspace-derived" }),
    } });
    const second = facade.compiler.compiler.compile(inputFor("b", 26, existing));
    const secondHash = canonicalChangePlanHash(second.plan);
    const envelope = facade.authority.sign({ plan: second.plan, revisionId: "revision", semanticOperations: second.semanticOperations, creative: second.trustedCreativePayload });
    const resolved = resolveStoredPlan(envelope, { expectedPlanHash: secondHash, expectedRevisionId: "revision" }, facade.authority);
    const candidate = await applyClientPatch(published.rootDir, second.plan, { planHash: secondHash, creativeMaterialization: resolved.creativeMaterialization! });
    const finalInspection = await inspectClientProject(candidate.rootDir);
    const byName = new Map(Object.values(finalInspection.index.controls).map(control => [control.name, control]));
    const materializedByName = new Map(second.materialization.controls.map(control => [control.instanceName, control]));
    for (const control of second.materialization.controls) {
      const actual = byName.get(control.instanceName)!;
      const parent = control.parentInstanceName ? materializedByName.get(control.parentInstanceName) : undefined;
      expect.soft({ id: control.semanticControlId, x: actual.x, y: actual.y }).toEqual({ id: control.semanticControlId,
        x: control.geometry.x - (parent?.geometry.x ?? 0), y: control.geometry.y - (parent?.geometry.y ?? 0) });
    }
    const report = await validateClientProject(published.rootDir, candidate.rootDir, second.plan, { creativeMaterialization: resolved.creativeMaterialization! });
    expect(report.status, JSON.stringify(report.warnings)).toBe("pass");
    const finalPagePath = path.join(candidate.rootDir, "1.0.0.1", finalInspection.index.pages[second.materialization.pages[0]!.pageGuid]!.file);
    const pristine = await readFile(finalPagePath, "utf8");
    expect(JSON.parse(pristine).futureUnmanagedMetadata).toEqual({ keep: "unrelated native fields" });
    // Key replacement/removal requires a separate authorization policy. Geometry correction never deletes old data.
    expect(pristine).toContain("设备A");
    expect(pristine).toContain("设备B");
    type NativeRecord = Record<string, unknown>;
    const find = (objects: unknown, name: string): { parent: unknown[]; index: number; root: NativeRecord } | undefined => {
      if (!Array.isArray(objects)) return;
      for (let index = 0; index < objects.length; index += 1) {
        const root = objects[index] as NativeRecord;
        const base = root.baseProperty as NativeRecord | undefined;
        if ((root.name ?? base?.name) === name) return { parent: objects, index, root };
        const nested = find(root.insiderObjects, name);
        if (nested) return nested;
      }
    };
    const panelName = second.materialization.controls.find(control => control.semanticControlId === "panel")!.instanceName;
    const rowName = second.materialization.controls.find(control => control.semanticControlId === "device-list--b")!.instanceName;
    const rootName = second.materialization.controls.find(control => control.semanticControlId === "page-root")!.instanceName;
    for (const tamper of ["existing-x", "existing-y", "new-x", "new-y", "parent"] as const) {
      const document = JSON.parse(pristine) as NativeRecord;
      const target = find(document.objects, tamper.startsWith("existing") ? panelName : rowName)!;
      if (tamper === "parent") {
        target.parent.splice(target.index, 1);
        const outer = find(document.objects, rootName)!.root;
        (outer.insiderObjects as unknown[]).push(target.root);
      } else {
        const base = target.root.baseProperty as NativeRecord;
        const point = base.leftTopPt as Record<string, number>;
        const axis = tamper.endsWith("x") ? "x" : "y";
        point[axis] = point[axis]! + 1;
      }
      await writeFile(finalPagePath, JSON.stringify(document));
      const rejected = await validateClientProject(published.rootDir, candidate.rootDir, second.plan,
        { creativeMaterialization: resolved.creativeMaterialization! });
      expect(rejected.status, tamper).toBe("fail");
      expect(rejected.checks.businessRules, tamper).toBe("fail");
    }
    await writeFile(finalPagePath, pristine);
  });
});
// end
