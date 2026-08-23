import { describe, expect, it } from "vitest";
import { canonicalServerHash, workspaceAssetIdToModelId, type SolutionImplementationPlan, type UIImplementationSpecV2 } from "@kf/contracts";
import { compileCreativeUIImplementationV2 } from "./ui-implementation-v2-compiler.js";
import { compileClientProject } from "../compile/client-compiler.js";
import { inspectClientProject } from "../inspect/client-inspector.js";
import { attachRuntimeCorrelation, verifyExistingRuntimeCorrelation } from "./runtime-correlation.js";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createHmacServerPlanAuthority } from "@kf/build-jobs";

const theme = { background: "#fff", surface: "#fff", primary: "#123456", accent: "#654321", textPrimary: "#111", textSecondary: "#555", fontFamily: "Inter", spacingUnit: 8, radiusScale: { small: 4, medium: 8, large: 16 } } as const;
const intent = { importance: "primary" as const, visualWeight: 3, readingOrder: 0, density: "comfortable" as const, groupWith: [], width: { mode: "fixed" as const, value: 120 }, height: { mode: "fixed" as const, value: 40 }, align: "start" as const };

function input() {
  const blueprint = {
    schema: "kf-design-plan/v3" as const, displayName: "工程", objective: "完成交互", audiences: ["客户"], scenarios: ["查看详情"],
    pages: ["home", "detail"].map((id) => ({ id: `bp-${id}`, title: id, purpose: "展示", readingOrder: [`region-${id}`], regions: [{ id: `region-${id}`, purpose: "展示", semanticRoles: ["content"], dataShape: "records", density: "comfortable" as const, importance: "primary" as const, content: ["内容"], sampleData: [], interactions: id === "home" ? ["打开"] : [], states: ["ready"], visualIntent: "清晰" }] })),
    journeys: [{ id: "open-detail", actor: "客户", goal: "查看详情", steps: [{ pageId: "bp-home", regionId: "region-home", action: "点击", result: "详情可见" }], completion: "详情可见" }],
    visualDirection: { tone: "专业", colors: ["蓝色"], typography: "清晰", spacingAndSurfaces: "舒适" }, acceptanceScenarios: ["详情可见"], openQuestions: [],
  };
  const blueprintHash = canonicalServerHash(blueprint);
  const ranked = (id: string) => ({ id, score: 1, reasons: ["适用"], limitations: [], knowledgeVersion: "1.0.0" });
  const candidateBundle = {
    schema: "kf-capability-candidates/v1" as const, knowledgeCatalogVersion: "1.0.0", blueprintHash,
    regions: ["home", "detail"].map((id) => ({ pageId: `bp-${id}`, regionId: `region-${id}`, controls: [ranked("button"), ranked("text"), ranked("easyui.1")], layouts: [ranked("layout.4")], recipes: [ranked("content.hero")] })),
    detailedCapabilityIds: ["button", "easyui.1", "layout.4", "text"], generatedAtPolicy: "deterministic-no-timestamp" as const,
  };
  const candidateBundleHash = canonicalServerHash(candidateBundle);
  const semanticPlan: SolutionImplementationPlan = {
    schema: "kf-solution-implementation/v1" as const, projectKey: "creative", blueprintHash, candidateBundleHash, theme,
    roleStyles: [{ role: "content", declarations: {}, states: {} }], mockData: [{ id: "records", purpose: "记录", fields: [{ key: "id", label: "编号", type: "text" as const }], records: [{ values: [{ field: "id", value: "1" }] }] }], localState: [], overlays: [], scripts: [],
    pages: [
      { id: "home", title: "首页", purpose: "首页", canvas: "desktop" as const, sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region-home"], initialStateIds: [], root: { id: "root", kind: "layout" as const, layout: "column" as const, sourceBlueprintRegionIds: ["region-home"], intent, children: [{ id: "open", kind: "control" as const, capabilityId: "button", content: "打开", properties: [], tabIds: [], styleRole: "content", sourceBlueprintRegionIds: ["region-home"], intent, eventBindings: [{ semanticEvent: "click", actionIds: ["navigate"] }] }] } },
      { id: "detail", title: "详情", purpose: "详情", canvas: "desktop" as const, sourceBlueprintPageId: "bp-detail", sourceBlueprintRegionIds: ["region-detail"], initialStateIds: [], root: { id: "grid", kind: "control" as const, capabilityId: "easyui.1", content: null, properties: [], tabIds: [], styleRole: "content", sourceBlueprintRegionIds: ["region-detail"], intent, mockDataId: "records", eventBindings: [] } },
    ],
    actions: [{ id: "navigate", kind: "navigate-page" as const, targetPageId: "detail", afterActionIds: [], journeyStepRefs: [{ journeyId: "open-detail", stepIndex: 0 }] }],
  };
  const planHash = canonicalServerHash(semanticPlan);
  const implementation: UIImplementationSpecV2 = {
    schema: "kf-ui-implementation/v2", compatibility: "native", sourceSolutionPlanHash: planHash, theme, compiledRoleStyles: {},
    pages: [
      { compatibility: "native", id: "home", width: 1440, height: 900, sourceBlueprintPageId: "bp-home", controls: [
        { id: "open", parentId: "root", role: "content", capabilityId: "button", content: "打开", depth: 1, zIndex: 1, geometry: { x: 20, y: 20, width: 120, height: 40 }, nativeProperties: {}, compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] }, sourceSolutionNodeId: "open", sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region-home"], eventBindings: [{ id: "kf$binding:navigate", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001, phase: "event", scriptModuleIds: [], nativeActionIds: ["kf$action:navigate"] }] },
        { id: "root", role: "content", capabilityId: "layout.4", depth: 0, zIndex: 0, geometry: { x: 0, y: 0, width: 1440, height: 900 }, compiledLayout: { kind: "column", overflow: "visible" }, nativeProperties: {}, compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] }, sourceSolutionNodeId: "root", sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region-home"], eventBindings: [] },
      ] },
      { compatibility: "native", id: "detail", width: 1280, height: 760, sourceBlueprintPageId: "bp-detail", controls: [{ id: "grid", role: "content", capabilityId: "easyui.1", depth: 0, zIndex: 0, geometry: { x: 0, y: 0, width: 900, height: 500 }, nativeProperties: { pagination: true }, compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [{ code: "STYLE_CAPABILITY_PRESERVE_ONLY", message: "Capability easyui.1 style is preserve-only; existing appearance is retained" }] }, dataBinding: { mockDataId: "records", records: [{ id: "1" }] }, sourceSolutionNodeId: "grid", sourceBlueprintPageId: "bp-detail", sourceBlueprintRegionIds: ["region-detail"], eventBindings: [] }] },
    ],
    compiledActions: [{ id: "kf$action:navigate", sourceActionId: "navigate", ownerInstanceName: "Button1", kind: "navigate-page", targetPageGuid: "k00000000-0000-4000-8000-000000000002" }], compiledScripts: [],
    runtimeCorrelation: { controls: [{ semanticControlId: "open", instanceName: "Button1" }, { semanticControlId: "root", instanceName: "Layout1" }, { semanticControlId: "grid", instanceName: "Datagrid1" }], pages: [{ semanticPageId: "home", pageGuid: "k00000000-0000-4000-8000-000000000001" }, { semanticPageId: "detail", pageGuid: "k00000000-0000-4000-8000-000000000002" }] },
  };
  const correlationInput = structuredClone(implementation);
  delete correlationInput.runtimeCorrelation;
  correlationInput.compiledActions = [];
  correlationInput.compiledScripts = [];
  correlationInput.pages.forEach((page) => { if (page.compatibility === "native") page.controls.forEach((control) => { control.eventBindings = []; }); });
  const correlation = attachRuntimeCorrelation({ workspaceId: "workspace", baseRevisionId: "revision", implementation: correlationInput }).runtimeCorrelation!;
  implementation.runtimeCorrelation = structuredClone(correlation);
  const instanceById = new Map(correlation.controls.map((entry) => [entry.semanticControlId, entry.instanceName]));
  const pageById = new Map(correlation.pages.map((entry) => [entry.semanticPageId, entry.pageGuid]));
  const navigate = implementation.compiledActions[0]!; if (navigate.kind !== "navigate-page") throw new Error("navigate fixture required");
  navigate.ownerInstanceName = instanceById.get("open")!;
  navigate.targetPageGuid = pageById.get("detail")!;
  const home = implementation.pages[0]!; if (home.compatibility !== "native") throw new Error("native fixture required");
  home.controls[0]!.eventBindings[0]!.ownerInstanceName = instanceById.get("open")!;
  return { workspaceId: "workspace", baseRevisionId: "revision", blueprint, candidateBundle, semanticPlan, implementation, compilerVersion: "1.0.0", evidenceVersion: "1.0.0", approvedAssets: [] as unknown[] };
}

function reattachCorrelation(source: ReturnType<typeof input>): void {
  const correlationInput = structuredClone(source.implementation);
  delete correlationInput.runtimeCorrelation;
  correlationInput.compiledActions = [];
  correlationInput.compiledScripts = [];
  correlationInput.pages.forEach((page) => { if (page.compatibility === "native") page.controls.forEach((control) => { control.eventBindings = []; }); });
  const correlation = attachRuntimeCorrelation({ workspaceId: source.workspaceId, baseRevisionId: source.baseRevisionId, implementation: correlationInput }).runtimeCorrelation!;
  source.implementation.runtimeCorrelation = structuredClone(correlation);
  const instanceById = new Map(correlation.controls.map((entry) => [entry.semanticControlId, entry.instanceName]));
  const pageById = new Map(correlation.pages.map((entry) => [entry.semanticPageId, entry.pageGuid]));
  const navigate = source.implementation.compiledActions[0]!; if (navigate.kind !== "navigate-page") throw new Error("navigate fixture required");
  navigate.ownerInstanceName = instanceById.get("open")!;
  navigate.targetPageGuid = pageById.get("detail")!;
  const home = source.implementation.pages[0]!; if (home.compatibility !== "native") throw new Error("native fixture required");
  home.controls[0]!.eventBindings[0]!.ownerInstanceName = instanceById.get("open")!;
}

describe("creative UI implementation v2 compiler", () => {
  it("lowers pages before parent-first controls with exact dimensions and runtime identities", () => {
    const source = input(); const homePage = source.implementation.pages[0]!; if (homePage.compatibility !== "native") throw new Error("native fixture required");
    homePage.controls.find((control) => control.id === "root")!.overlayHost = {
      overlayId: "detail-dialog", hostPageId: "home", presentation: "dialog", visibleStateId: "dialog-visible", dismissible: true, initiallyVisible: false,
    };
    const before = structuredClone(source);
    const result = compileCreativeUIImplementationV2(source);
    const instanceById = new Map(source.implementation.runtimeCorrelation!.controls.map((entry) => [entry.semanticControlId, entry.instanceName]));
    expect(source).toEqual(before);
    expect(result.materialization.pages.map((page) => [page.semanticPageId, page.width, page.height])).toEqual([["detail", 1280, 760], ["home", 1440, 900]]);
    expect(result.materialization.controls.map((control) => control.semanticControlId)).toEqual(["grid", "root", "open"]);
    expect(result.materialization.controls.find((control) => control.semanticControlId === "open")).toMatchObject({ instanceName: instanceById.get("open"), parentInstanceName: instanceById.get("root") });
    expect(result.materialization.controls.find((control) => control.semanticControlId === "root")).toMatchObject({
      zIndex: 0, compiledLayout: { kind: "column", overflow: "visible" }, overlayHost: { presentation: "dialog", initiallyVisible: false },
    });
    expect(result.materialization.controls.find((control) => control.semanticControlId === "grid")).toMatchObject({ capabilityId: "easyui.1", instanceName: instanceById.get("grid") });
    expect(result.materialization.stylesData.find((entry) => entry.semanticControlId === "grid")?.dataBinding?.records).toEqual([{ id: "1" }]);
    expect(result.plan.operations.slice(0, 2).every((operation) => operation.op === "create" && operation.entityType === "page")).toBe(true);
    expect(result.plan.operations.map((operation) => operation.entityId)).toEqual(["detail", "home", "grid", "root", "open"]);
    expect(JSON.stringify(result.plan.operations)).not.toContain(instanceById.get("open"));
    const authority = createHmacServerPlanAuthority(Buffer.alloc(32, 0x41));
    const envelope = authority.sign({ plan: result.plan, revisionId: "revision", semanticOperations: [], creative: result.trustedCreativePayload });
    expect(authority.verify(JSON.parse(JSON.stringify(envelope))).nativeMaterializationHash).toBe(result.plan.creative?.materializationHash);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.capabilityReport).toMatchObject({ status: "warning", unsupported: [], partial: ["button", "easyui.1", "layout.4"] });
  });

  it("is deterministic and rejects missing correlation, unapproved assets, proxies and aliases", () => {
    const first = input(); expect(compileCreativeUIImplementationV2(first)).toEqual(compileCreativeUIImplementationV2(structuredClone(first)));
    const missing = input(); delete missing.implementation.runtimeCorrelation;
    expect(() => compileCreativeUIImplementationV2(missing)).toThrow(/RUNTIME_CORRELATION_REQUIRED/);
    const asset = input(); const modelId = workspaceAssetIdToModelId("00000000-0000-4000-8000-000000000001");
    const assetPage = asset.implementation.pages[0]!; if (assetPage.compatibility !== "native") throw new Error("native fixture required");
    assetPage.controls[0]!.assetIds = [modelId];
    expect(() => compileCreativeUIImplementationV2(asset)).toThrow(/ASSET_NOT_APPROVED/);
    let trapped = false; const proxy = new Proxy(input(), { ownKeys() { trapped = true; return []; } });
    expect(() => compileCreativeUIImplementationV2(proxy)).toThrow(/PROXY_FORBIDDEN/); expect(trapped).toBe(false);
    let nestedTrap = false; const nestedProxy = input(); nestedProxy.implementation.theme = new Proxy(nestedProxy.implementation.theme, { ownKeys() { nestedTrap = true; return []; } });
    expect(() => compileCreativeUIImplementationV2(nestedProxy)).toThrow(/PROXY_FORBIDDEN/); expect(nestedTrap).toBe(false);
    let getterRan = false; const accessor = input(); Object.defineProperty(accessor.blueprint, "displayName", { enumerable: true, get() { getterRan = true; return "bad"; } });
    expect(() => compileCreativeUIImplementationV2(accessor)).toThrow(/ACCESSOR_FORBIDDEN/); expect(getterRan).toBe(false);
    const nonPlain = Object.assign(Object.create({ inherited: true }) as ReturnType<typeof input>, input());
    expect(() => compileCreativeUIImplementationV2(nonPlain)).toThrow(/NON_PLAIN|INVALID/);
    const cyclic = input(); (cyclic.blueprint as unknown as Record<string, unknown>)["cycle"] = cyclic.blueprint;
    expect(() => compileCreativeUIImplementationV2(cyclic)).toThrow(/CYCLE_FORBIDDEN/);
    const deep = input(); let cursor = deep.blueprint as unknown as Record<string, unknown>; for (let index = 0; index < 100; index += 1) { const next = {}; cursor[`deep${index}`] = next; cursor = next; }
    expect(() => compileCreativeUIImplementationV2(deep)).toThrow(/BUDGET_EXCEEDED/);
    const alias = input(); (alias as unknown as { shared?: unknown }).shared = alias.blueprint;
    expect(() => compileCreativeUIImplementationV2(alias as never)).toThrow(/UNKNOWN|ALIAS|INVALID/);
    const unsupported = input(); const unsupportedPage = unsupported.implementation.pages[0]!; if (unsupportedPage.compatibility !== "native") throw new Error("native fixture required");
    unsupportedPage.controls[0]!.capabilityId = "unknown.99";
    const unsupportedRoot = unsupported.semanticPlan.pages[0]!.root; if (unsupportedRoot.kind !== "layout" || unsupportedRoot.children[0]!.kind !== "control") throw new Error("control fixture required");
    unsupportedRoot.children[0]!.capabilityId = "unknown.99"; unsupported.implementation.sourceSolutionPlanHash = canonicalServerHash(unsupported.semanticPlan);
    expect(() => compileCreativeUIImplementationV2(unsupported)).toThrow(/CAPABILITY_UNSUPPORTED|RUNTIME_PREFIX_UNSUPPORTED/);
    const forgedStyle = input(); const forgedPage = forgedStyle.implementation.pages[0]!; if (forgedPage.compatibility !== "native") throw new Error("native fixture required");
    forgedPage.controls[0]!.compiledStyle!.warnings.push({ code: "FORGED_STYLE", message: "伪造" });
    expect(() => compileCreativeUIImplementationV2(forgedStyle)).toThrow(/COMPILED_STYLE_MISMATCH/);
    const forgedRuntime = input(); forgedRuntime.implementation.runtimeCorrelation!.controls.find((entry) => entry.semanticControlId === "open")!.instanceName = "Button999";
    forgedRuntime.implementation.compiledActions[0]!.ownerInstanceName = "Button999";
    const forgedRuntimePage = forgedRuntime.implementation.pages[0]!; if (forgedRuntimePage.compatibility !== "native") throw new Error("native fixture required");
    forgedRuntimePage.controls[0]!.eventBindings[0]!.ownerInstanceName = "Button999";
    expect(() => compileCreativeUIImplementationV2(forgedRuntime)).toThrow(/RUNTIME_CORRELATION_PROVENANCE/);
  });

  it("preserves exact opaque uploaded page identity and emits allowlisted semantic deltas only", async () => {
    const workspace = await compileClientProject({
      schema: "kf-client-project-ir/v1", id: "existing", name: "Existing", version: "1.0.0.1", variables: [], scripts: [], pages: [
        { id: "home", name: "Home", width: 1440, height: 900, controls: [
          { id: "Layout1", type: "layout", layoutType: 4, x: 0, y: 0, width: 1440, height: 900, children: [] },
          { id: "Button1", type: "button", x: 20, y: 20, width: 120, height: 40, text: "打开" },
        ] },
        { id: "detail", name: "Detail", width: 1280, height: 760, controls: [
          { id: "Datagrid1", type: "easyui", proto: 1, x: 0, y: 0, width: 900, height: 500 },
        ] },
      ],
    }, { seed: "creative-existing" });
    const homePath = path.join(workspace.path, "1.0.0.1", "project", "page", "Home.json");
    const home = JSON.parse(await readFile(homePath, "utf8")) as Record<string, unknown>; home.guid = "7UJ0lvKq8Q708A6Zl0C02"; await writeFile(homePath, JSON.stringify(home));
    const managerPath = path.join(workspace.path, "1.0.0.1", "project", "pageManager.json");
    const manager = JSON.parse(await readFile(managerPath, "utf8")) as { Pages: Array<Record<string, unknown>> };
    const managerHome = manager.Pages.find((page) => page["name"] === "Home") ?? manager.Pages[0]!; managerHome.id = "7UJ0lvKq8Q708A6Zl0C02"; await writeFile(managerPath, JSON.stringify(manager));
    const inspection = await inspectClientProject(workspace.path, { runtimeBinding: { workspaceId: "workspace", baseRevisionId: "revision" } });
    const detailGuid = Object.entries(inspection.index.pages).find(([, page]) => page.file.endsWith("Detail.json"))![0];
    const source = input(); source.implementation.runtimeCorrelation!.pages = [
      { semanticPageId: "home", pageGuid: "7UJ0lvKq8Q708A6Zl0C02" }, { semanticPageId: "detail", pageGuid: detailGuid },
    ];
    source.implementation.runtimeCorrelation!.controls = [
      { semanticControlId: "open", instanceName: "Button1" }, { semanticControlId: "root", instanceName: "Layout1" }, { semanticControlId: "grid", instanceName: "Datagrid1" },
    ];
    const navigate = source.implementation.compiledActions[0]!; if (navigate.kind !== "navigate-page") throw new Error("navigate fixture required");
    navigate.ownerInstanceName = "Button1";
    navigate.targetPageGuid = detailGuid;
    const sourceHome = source.implementation.pages[0]!; if (sourceHome.compatibility !== "native") throw new Error("native fixture required");
    sourceHome.controls[0]!.eventBindings[0]!.ownerInstanceName = "Button1";
    const handle = verifyExistingRuntimeCorrelation({ workspaceId: "workspace", baseRevisionId: "revision", inspection, correlations: {
      pages: [{ source: "uploaded-existing", semanticPageId: "home", pageGuid: "7UJ0lvKq8Q708A6Zl0C02" }, { source: "uploaded-existing", semanticPageId: "detail", pageGuid: detailGuid }],
      controls: [{ source: "uploaded-existing", semanticControlId: "open", instanceName: "Button1" }, { source: "uploaded-existing", semanticControlId: "root", instanceName: "Layout1" }, { source: "uploaded-existing", semanticControlId: "grid", instanceName: "Datagrid1" }],
    } });
    const result = compileCreativeUIImplementationV2({ ...source, verifiedExisting: handle });
    expect(result.materialization.pages.find((page) => page.semanticPageId === "home")?.pageGuid).toBe("7UJ0lvKq8Q708A6Zl0C02");
    expect(result.plan.operations.every((operation) => operation.op === "update")).toBe(true);
    expect(result.plan.operations.map((operation) => operation.entityId)).toEqual(["detail", "home", "grid", "root", "open"]);
    expect(result.materialization.controls.find((control) => control.semanticControlId === "grid")).toMatchObject({ nativeGuid: expect.any(String), existingDeltas: expect.any(Array) });
  });

  it("materializes exact Datagrid data, onClickRow evidence and compiled SetData script", () => {
    const source = input();
    const datagridName = source.implementation.runtimeCorrelation!.controls.find((entry) => entry.semanticControlId === "grid")!.instanceName;
    const gridPlan = source.semanticPlan.pages[1]!.root;
    if (gridPlan.kind !== "control") throw new Error("grid fixture required");
    gridPlan.eventBindings = [{ semanticEvent: "row-click", actionIds: ["refresh-grid"] }];
    source.semanticPlan.scripts.push({ id: "refresh", purpose: "刷新记录", kind: "custom", programVersion: "semantic-js/v1", source: '$control.setData("grid", []);', inputs: [], outputs: [{ name: "records", description: "记录", refKind: "control", refId: "grid" }] });
    source.semanticPlan.actions.push({ id: "refresh-grid", kind: "run-script", scriptId: "refresh", afterActionIds: [], journeyStepRefs: [] });
    source.implementation.sourceSolutionPlanHash = canonicalServerHash(source.semanticPlan);
    const scriptSource = `${datagridName}.SetData([]);\n`;
    source.implementation.compiledScripts = [{ id: "kf$script:refresh", sourceScriptId: "refresh", placement: "event", ownerInstanceName: datagridName, instanceReferences: [{ semanticId: "grid", instanceName: datagridName }], pageReferences: [], source: scriptSource, sourceHash: createHash("sha256").update(scriptSource).digest("hex") }];
    const detail = source.implementation.pages[1]!; if (detail.compatibility !== "native") throw new Error("native fixture required");
    detail.controls[0]!.eventBindings = [{ id: "kf$binding:refresh", ownerInstanceName: datagridName, kfEvent: "onClickRow", linkId: 200024, phase: "event", scriptModuleIds: ["kf$script:refresh"], nativeActionIds: [] }];
    const result = compileCreativeUIImplementationV2(source);
    expect(result.materialization.interactions.eventBindings).toContainEqual(expect.objectContaining({ ownerInstanceName: datagridName, kfEvent: "onClickRow", linkId: 200024 }));
    expect(result.materialization.interactions.scripts[0]).toMatchObject({ ownerInstanceName: datagridName, source: scriptSource });
    expect(result.materialization.stylesData.find((entry) => entry.semanticControlId === "grid")?.dataBinding?.records).toEqual([{ id: "1" }]);
  });

  it("publishes image assets in the plan while keeping non-image style assets in trusted materialization", () => {
    const source = input(); const workspaceAssetId = "00000000-0000-4000-8000-000000000001";
    const assetId = workspaceAssetIdToModelId(workspaceAssetId); const sha256 = "a".repeat(64);
    const page = source.implementation.pages[0]!; if (page.compatibility !== "native") throw new Error("native fixture required");
    page.controls[0]!.assetIds = [assetId];
    source.approvedAssets.push({ assetId, approvedAsset: { workspaceAssetId, targetPath: `project/res/images/${sha256}.png`, mediaType: "image/png", sha256, sizeBytes: 100 } });
    const result = compileCreativeUIImplementationV2(source);
    expect(result.verifiedAssets).toHaveLength(1);
    expect(result.plan.assetBindings).toBeUndefined();
    expect(result.materialization.stylesData.find((style) => style.semanticControlId === "open")?.approvedAssets[0]?.approvedAsset.sha256).toBe(sha256);
    const image = input(); const imagePage = image.implementation.pages[0]!; if (imagePage.compatibility !== "native") throw new Error("native fixture required");
    imagePage.controls[0]!.capabilityId = "image"; imagePage.controls[0]!.assetIds = [assetId];
    const imageRoot = image.semanticPlan.pages[0]!.root;
    if (imageRoot.kind !== "layout" || imageRoot.children[0]!.kind !== "control") throw new Error("control fixture required");
    imageRoot.children[0]!.capabilityId = "image";
    image.implementation.sourceSolutionPlanHash = canonicalServerHash(image.semanticPlan);
    image.approvedAssets.push({ assetId, approvedAsset: { workspaceAssetId, targetPath: `project/res/images/${sha256}.png`, mediaType: "image/png", sha256, sizeBytes: 100 } });
    reattachCorrelation(image);
    expect(compileCreativeUIImplementationV2(image).plan.assetBindings?.[0]).toMatchObject({ assetId, entityId: "open", controlId: "open" });
    const forged = input(); forged.approvedAssets.push({ assetId, approvedAsset: { workspaceAssetId: "00000000-0000-4000-8000-000000000002", targetPath: `project/res/images/${sha256}.png`, mediaType: "image/png", sha256, sizeBytes: 100 } });
    expect(() => compileCreativeUIImplementationV2(forged)).toThrow(/ASSET_INVALID/);
  });
});
