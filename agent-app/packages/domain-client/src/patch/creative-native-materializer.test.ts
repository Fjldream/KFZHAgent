import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  canonicalChangePlanHash,
  canonicalServerHash,
  type SolutionImplementationPlan,
  type UIImplementationSpecV2,
} from "@kf/contracts";
import {
  createHmacCreativeBuildFacade,
  resolveStoredPlan,
} from "@kf/build-jobs";
import { describe, expect, it } from "vitest";
import { compileClientProject } from "../compile/client-compiler.js";
import { inspectClientProject } from "../inspect/client-inspector.js";
import { createCreativeUIImplementationV2Compiler } from "../implementation/ui-implementation-v2-compiler.js";
import { attachRuntimeCorrelation } from "../implementation/runtime-correlation.js";
import { compileInteractions } from "../interaction/interaction-compiler.js";
import { createDefaultModuleRegistry } from "../modules/module-registry.js";
import { importNativeClientPackage } from "../package/native-client-package.js";
import { createKingClientDomainPack } from "../domain-pack/king-client-domain-pack.js";
import { solutionModuleRegistryHash } from "../solution-compile/solution-provenance.js";
import { validateClientProject } from "../validate/client-validator.js";
import { applyClientPatch, type ApplyPatchOptions } from "./client-patcher.js";

const theme = {
  background: "#fff", surface: "#fff", primary: "#123456", accent: "#654321",
  textPrimary: "#111", textSecondary: "#555", fontFamily: "Inter", spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;
const intent = {
  importance: "primary" as const, visualWeight: 3, readingOrder: 0,
  density: "comfortable" as const, groupWith: [],
  width: { mode: "fixed" as const, value: 120 },
  height: { mode: "fixed" as const, value: 40 }, align: "start" as const,
};

function creativeInput() {
  const blueprint = {
    schema: "kf-design-plan/v3" as const, displayName: "工程", objective: "完成交互",
    audiences: ["客户"], scenarios: ["查看详情"],
    pages: ["home", "detail"].map((id) => ({
      id: `bp-${id}`, title: id, purpose: "展示", readingOrder: [`region-${id}`],
      regions: [{ id: `region-${id}`, purpose: "展示", semanticRoles: ["content"],
        dataShape: "records", density: "comfortable" as const, importance: "primary" as const,
        content: ["内容"], sampleData: [], interactions: id === "home" ? ["打开"] : [],
        states: ["ready"], visualIntent: "清晰" }],
    })),
    journeys: [{ id: "open-detail", actor: "客户", goal: "查看详情",
      steps: [{ pageId: "bp-home", regionId: "region-home", action: "点击", result: "详情可见" }],
      completion: "详情可见" }],
    visualDirection: { tone: "专业", colors: ["蓝色"], typography: "清晰", spacingAndSurfaces: "舒适" },
    acceptanceScenarios: ["详情可见"], openQuestions: [],
  };
  const blueprintHash = canonicalServerHash(blueprint);
  const ranked = (id: string) => ({ id, score: 1, reasons: ["适用"], limitations: [], knowledgeVersion: "1.0.0" });
  const candidateBundle = {
    schema: "kf-capability-candidates/v1" as const, knowledgeCatalogVersion: "1.0.0", blueprintHash,
    regions: ["home", "detail"].map((id) => ({ pageId: `bp-${id}`, regionId: `region-${id}`,
      controls: [ranked("button"), ranked("text"), ranked("easyui.1")],
      layouts: [ranked("layout.4")], recipes: [ranked("content.hero")] })),
    detailedCapabilityIds: ["button", "easyui.1", "layout.4", "text"],
    generatedAtPolicy: "deterministic-no-timestamp" as const,
  };
  const candidateBundleHash = canonicalServerHash(candidateBundle);
  const semanticPlan: SolutionImplementationPlan = {
    schema: "kf-solution-implementation/v1", projectKey: "creative", blueprintHash, candidateBundleHash,
    theme, roleStyles: [{ role: "content", declarations: {}, states: {} }],
    mockData: [{ id: "records", purpose: "记录", fields: [{ key: "id", label: "编号", type: "text" }],
      records: [{ values: [{ field: "id", value: "1" }] }] }],
    localState: [], overlays: [],
    scripts: [{ id: "refresh", purpose: "刷新记录", kind: "custom", programVersion: "semantic-js/v1",
      source: '$control.setData("grid", []);', inputs: [],
      outputs: [{ name: "records", description: "记录", refKind: "control", refId: "grid" }] }],
    pages: [
      { id: "home", title: "首页", purpose: "首页", canvas: "desktop", sourceBlueprintPageId: "bp-home",
        sourceBlueprintRegionIds: ["region-home"], initialStateIds: [], root: {
          id: "root", kind: "layout", layout: "column", sourceBlueprintRegionIds: ["region-home"],
          intent: structuredClone(intent), children: [{ id: "open", kind: "control", capabilityId: "button",
            content: "打开", properties: [], tabIds: [], styleRole: "content",
            sourceBlueprintRegionIds: ["region-home"], intent: structuredClone(intent),
            eventBindings: [{ semanticEvent: "click", actionIds: ["navigate"] }] }],
        } },
      { id: "detail", title: "详情", purpose: "详情", canvas: "desktop", sourceBlueprintPageId: "bp-detail",
        sourceBlueprintRegionIds: ["region-detail"], initialStateIds: [], root: {
          id: "grid", kind: "control", capabilityId: "easyui.1", content: null, properties: [], tabIds: [],
          styleRole: "content", sourceBlueprintRegionIds: ["region-detail"], intent: structuredClone(intent),
          mockDataId: "records", eventBindings: [{ semanticEvent: "row-click", actionIds: ["refresh-grid"] }],
        } },
    ],
    actions: [
      { id: "navigate", kind: "navigate-page", targetPageId: "detail", afterActionIds: [],
        journeyStepRefs: [{ journeyId: "open-detail", stepIndex: 0 }] },
      { id: "refresh-grid", kind: "run-script", scriptId: "refresh", afterActionIds: [], journeyStepRefs: [] },
    ],
  };
  const implementationBase: UIImplementationSpecV2 = {
    schema: "kf-ui-implementation/v2", compatibility: "native",
    sourceSolutionPlanHash: canonicalServerHash(semanticPlan),
    sourceModuleRegistryHash: solutionModuleRegistryHash(semanticPlan, createDefaultModuleRegistry()),
    theme: structuredClone(theme),
    compiledRoleStyles: { content: { role: "content", declarations: {}, states: {} } },
    compiledActions: [], compiledScripts: [], pages: [
      { compatibility: "native", id: "home", width: 1440, height: 900,
        sourceBlueprintPageId: "bp-home", controls: [
          { id: "open", parentId: "root", role: "content", capabilityId: "button", content: "打开",
            depth: 1, zIndex: 1, geometry: { x: 20, y: 20, width: 120, height: 40 }, nativeProperties: {},
            compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] }, sourceSolutionNodeId: "open",
            sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region-home"], eventBindings: [] },
          { id: "root", role: "content", capabilityId: "layout.4", depth: 0, zIndex: 0,
            geometry: { x: 0, y: 0, width: 1440, height: 900 },
            compiledLayout: { kind: "column", overflow: "visible" }, nativeProperties: {},
            compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] }, sourceSolutionNodeId: "root",
            sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region-home"], eventBindings: [] },
        ] },
      { compatibility: "native", id: "detail", width: 1280, height: 760,
        sourceBlueprintPageId: "bp-detail", controls: [
          { id: "grid", role: "content", capabilityId: "easyui.1", depth: 0, zIndex: 0,
            geometry: { x: 0, y: 0, width: 900, height: 500 }, nativeProperties: { pagination: true },
            compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [{ code: "STYLE_CAPABILITY_PRESERVE_ONLY",
              message: "Capability easyui.1 style is preserve-only; existing appearance is retained" }] },
            dataBinding: { mockDataId: "records", records: [{ id: "1" }] }, sourceSolutionNodeId: "grid",
            sourceBlueprintPageId: "bp-detail", sourceBlueprintRegionIds: ["region-detail"], eventBindings: [] },
        ] },
    ],
  };
  const correlated = attachRuntimeCorrelation({
    workspaceId: "workspace", baseRevisionId: "revision", implementation: implementationBase,
  });
  const compiled = compileInteractions({ blueprint, plan: semanticPlan, implementation: correlated });
  if (compiled.diagnostics.errors.length > 0 || compiled.diagnostics.requests.length > 0) {
    throw new Error(JSON.stringify(compiled.diagnostics));
  }
  return {
    workspaceId: "workspace", baseRevisionId: "revision", blueprint, candidateBundle, semanticPlan,
    implementation: structuredClone(compiled.implementation), compilerVersion: "1.0.0", evidenceVersion: "1.0.0",
  };
}

function walkControls(value: unknown, result: Array<Record<string, unknown>> = []): Array<Record<string, unknown>> {
  if (Array.isArray(value)) value.forEach((entry) => walkControls(entry, result));
  else if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record["name"] === "string" || record["baseProperty"] !== undefined) result.push(record);
    for (const key of ["objects", "children", "layoutItems", "insiderObjects"]) walkControls(record[key], result);
  }
  return result;
}

async function signedFixture() {
  const facade = createHmacCreativeBuildFacade(Buffer.alloc(32, 0x41), createCreativeUIImplementationV2Compiler);
  const result = facade.compiler.compiler.compile(creativeInput());
  const envelope = facade.authority.sign({
    plan: result.plan, revisionId: "revision", semanticOperations: [], creative: result.trustedCreativePayload,
  });
  const planHash = canonicalChangePlanHash(result.plan);
  const resolved = resolveStoredPlan(JSON.parse(JSON.stringify(envelope)), {
    expectedPlanHash: planHash, expectedRevisionId: "revision",
  }, facade.authority) as ReturnType<typeof resolveStoredPlan> & { creativeMaterialization: unknown };
  return { result, resolved, planHash };
}

async function baseWorkspace() {
  return compileClientProject({
    schema: "kf-client-project-ir/v1", id: "base", name: "Base", version: "1.0.0.1",
    pages: [{ id: "untouched", name: "Untouched", width: 800, height: 600, controls: [] }],
    variables: [], scripts: [],
  }, { seed: "base" });
}

describe("creative native materializer", () => {
  it("materializes the verified semantic plan through native patch, validate, package and import", async () => {
    const { result, resolved, planHash } = await signedFixture();
    const base = await baseWorkspace();
    const pack = createKingClientDomainPack({ nativeAccepted: true });
    const candidate = await pack.patch({
      baseWorkspace: base, changePlan: result.plan, expectedPlanHash: planHash,
      creativeMaterialization: resolved.creativeMaterialization,
    });

    expect(JSON.stringify(result.plan.operations)).not.toContain("Button1");
    const inspection = await inspectClientProject(candidate.rootDir);
    for (const page of result.materialization.pages) {
      expect(inspection.index.pages[page.pageGuid]).toMatchObject({ id: page.semanticPageId });
      expect(inspection.summary.pages.find((entry) => entry.guid === page.pageGuid))
        .toMatchObject({ width: page.width, height: page.height });
    }
    const controls = Object.values(inspection.raw.pages).flatMap((page) => walkControls(page));
    const byName = new Map(controls.flatMap((control) => {
      const baseProperty = control["baseProperty"] as Record<string, unknown> | undefined;
      const name = control["name"] ?? baseProperty?.["name"];
      return typeof name === "string" ? [[name, control] as const] : [];
    }));
    const open = result.materialization.controls.find((control) => control.semanticControlId === "open")!;
    const root = result.materialization.controls.find((control) => control.semanticControlId === "root")!;
    const grid = result.materialization.controls.find((control) => control.semanticControlId === "grid")!;
    expect(byName.has(open.semanticControlId)).toBe(false);
    expect(byName.has(open.instanceName)).toBe(true);
    expect((byName.get(root.instanceName)?.["insiderObjects"] as unknown[]))
      .toEqual(expect.arrayContaining([expect.objectContaining({ name: open.instanceName })]));
    const nativeNavigate = (((byName.get(open.instanceName)?.["linkMng"] as { linkList: Array<Record<string, unknown>> }).linkList)
      .find((entry) => entry["action"] === "navigatePage"));
    expect(nativeNavigate).toMatchObject({
      action: "navigatePage",
      pageId: result.materialization.pages.find((page) => page.semanticPageId === "detail")!.pageGuid,
    });
    const nativeGrid = byName.get(grid.instanceName)!;
    expect(nativeGrid["data"]).toEqual([{ id: "1" }]);
    const rowClick = ((nativeGrid["linkMng"] as { linkList: Array<Record<string, unknown>> }).linkList)
      .find((entry) => entry["name"] === "onClickRow");
    expect(rowClick).toMatchObject({ linkId: 200024, enable: true });
    expect(String(rowClick?.["script"])).toContain(`${grid.instanceName}.SetData([])`);
    expect(String(rowClick?.["script"])).toContain("kf-compiled-event/v1");

    const report = await pack.validate({
      baseWorkspace: base, candidateWorkspace: candidate, changePlan: result.plan,
      creativeMaterialization: resolved.creativeMaterialization,
    });
    expect(report.status, report.warnings.join("\n")).toBe("pass");

    const packaged = (await pack.package({ workspace: candidate })).bytes;
    const imported = await importNativeClientPackage(packaged, await mkdtemp(path.join(tmpdir(), "kf-creative-import-")));
    const roundTripped = await inspectClientProject(imported);
    expect(roundTripped.index.pages[grid.pageGuid]?.controlGuids.length).toBeGreaterThan(0);
    const importedControls = Object.values(roundTripped.raw.pages).flatMap((page) => walkControls(page));
    expect(importedControls.some((control) => control["name"] === grid.instanceName
      && String(((control["linkMng"] as { linkList: Array<Record<string, unknown>> }).linkList)
        .find((entry) => entry["linkId"] === 200024)?.["script"]).includes(`${grid.instanceName}.SetData([])`))).toBe(true);
  }, 30_000);

  it("fails closed without the HMAC-verified creative materialization and detects marker tampering", async () => {
    const { result, resolved, planHash } = await signedFixture();
    const base = await baseWorkspace();
    await expect(applyClientPatch(base.rootDir, result.plan, { planHash }))
      .rejects.toThrow(/creative|materialization|verified/i);

    const candidate = await applyClientPatch(base.rootDir, result.plan, {
      planHash, creativeMaterialization: resolved.creativeMaterialization,
    } as ApplyPatchOptions & { creativeMaterialization: unknown });
    const inspection = await inspectClientProject(candidate.rootDir);
    const grid = result.materialization.controls.find((control) => control.semanticControlId === "grid")!;
    const page = inspection.index.pages[grid.pageGuid]!;
    const pagePath = path.join(candidate.rootDir, "1.0.0.1", page.file);
    const pageJson = JSON.parse(await readFile(pagePath, "utf8")) as Record<string, unknown>;
    const nativeGrid = walkControls(pageJson).find((control) => control["name"] === grid.instanceName)!;
    const rowClick = ((nativeGrid["linkMng"] as { linkList: Array<Record<string, unknown>> }).linkList)
      .find((entry) => entry["linkId"] === 200024)!;
    rowClick["script"] = String(rowClick["script"]).replace(`${grid.instanceName}.SetData([])`, `${grid.instanceName}.SetData([{ forged: true }])`);
    await writeFile(pagePath, JSON.stringify(pageJson, null, 2));

    const report = await validateClientProject(base.rootDir, candidate, result.plan, {
      skipRoundTrip: true, creativeMaterialization: resolved.creativeMaterialization,
    } as Parameters<typeof validateClientProject>[3] & { creativeMaterialization: unknown });
    expect(report.status).toBe("fail");
    expect(report.warnings.join("\n")).toMatch(/hash|materialization|compiler/i);
  }, 30_000);
});
