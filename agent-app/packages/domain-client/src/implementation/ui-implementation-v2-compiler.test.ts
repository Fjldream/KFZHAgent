import { describe, expect, it } from "vitest";
import { TrustedNativeMaterializationSchema, canonicalServerHash, semanticPayloadHash, workspaceAssetIdToModelId, type SolutionImplementationPlan, type UIImplementationSpecV2 } from "@kf/contracts";
import { createCreativeUIImplementationV2Compiler } from "./ui-implementation-v2-compiler.js";
import { compileClientProject } from "../compile/client-compiler.js";
import { inspectClientProject } from "../inspect/client-inspector.js";
import { attachRuntimeCorrelation, verifyExistingRuntimeCorrelation } from "./runtime-correlation.js";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createHmacCreativeBuildFacade, createHmacServerPlanAuthority } from "@kf/build-jobs";
import { compileInteractions } from "../interaction/interaction-compiler.js";
import { createDefaultModuleRegistry } from "../modules/module-registry.js";
import { solutionModuleRegistryHash } from "../solution-compile/solution-provenance.js";

const theme = { background: "#fff", surface: "#fff", primary: "#123456", accent: "#654321", textPrimary: "#111", textSecondary: "#555", fontFamily: "Inter", spacingUnit: 8, radiusScale: { small: 4, medium: 8, large: 16 } } as const;
const intent = { importance: "primary" as const, visualWeight: 3, readingOrder: 0, density: "comfortable" as const, groupWith: [], width: { mode: "fixed" as const, value: 120 }, height: { mode: "fixed" as const, value: 40 }, align: "start" as const };
const tableData = { columns: [{ key: "id", label: "编号", align: "left" as const }], rows: [{ id: "1" }], pageSize: 1 };
const creativeFacade = createHmacCreativeBuildFacade(Buffer.alloc(32, 0x41), createCreativeUIImplementationV2Compiler);
const authority = creativeFacade.authority;
const compiler = creativeFacade.compiler.compiler;
const assetResolver = creativeFacade.compiler.assetProofResolver;

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
      { id: "home", title: "首页", purpose: "首页", canvas: "desktop" as const, sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region-home"], initialStateIds: [], root: { id: "root", kind: "layout" as const, layout: "column" as const, sourceBlueprintRegionIds: ["region-home"], intent: structuredClone(intent), children: [{ id: "open", kind: "control" as const, capabilityId: "button", content: "打开", properties: [], tabIds: [], styleRole: "content", sourceBlueprintRegionIds: ["region-home"], intent: structuredClone(intent), eventBindings: [{ semanticEvent: "click", actionIds: ["navigate"] }] }] } },
      { id: "detail", title: "详情", purpose: "详情", canvas: "desktop" as const, sourceBlueprintPageId: "bp-detail", sourceBlueprintRegionIds: ["region-detail"], initialStateIds: [], root: { id: "grid", kind: "control" as const, capabilityId: "easyui.1", content: null, properties: [], tabIds: [], styleRole: "content", sourceBlueprintRegionIds: ["region-detail"], intent: structuredClone(intent), mockDataId: "records", eventBindings: [] } },
    ],
    actions: [{ id: "navigate", kind: "navigate-page" as const, targetPageId: "detail", afterActionIds: [], journeyStepRefs: [{ journeyId: "open-detail", stepIndex: 0 }] }],
  };
  const planHash = canonicalServerHash(semanticPlan);
  let implementation: UIImplementationSpecV2 = {
    schema: "kf-ui-implementation/v2", compatibility: "native", sourceSolutionPlanHash: planHash,
    sourceModuleRegistryHash: solutionModuleRegistryHash(semanticPlan, createDefaultModuleRegistry()),
    theme: structuredClone(theme), compiledRoleStyles: { content: { role: "content", declarations: {}, states: {} } },
    pages: [
      { compatibility: "native", id: "home", width: 1440, height: 900, sourceBlueprintPageId: "bp-home", controls: [
        { id: "open", parentId: "root", role: "content", capabilityId: "button", content: "打开", depth: 1, zIndex: 1, geometry: { x: 20, y: 20, width: 120, height: 40 }, nativeProperties: {}, compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] }, sourceSolutionNodeId: "open", sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region-home"], eventBindings: [] },
        { id: "root", role: "content", capabilityId: "layout.4", depth: 0, zIndex: 0, geometry: { x: 0, y: 0, width: 1440, height: 900 }, compiledLayout: { kind: "column", overflow: "visible" }, nativeProperties: {}, compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] }, sourceSolutionNodeId: "root", sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region-home"], eventBindings: [] },
      ] },
      { compatibility: "native", id: "detail", width: 1280, height: 760, sourceBlueprintPageId: "bp-detail", controls: [{ id: "grid", role: "content", capabilityId: "easyui.1", depth: 0, zIndex: 0, geometry: { x: 0, y: 0, width: 900, height: 500 }, nativeProperties: { pagination: false, pageSize: 1, tableData }, compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [{ code: "STYLE_CAPABILITY_PRESERVE_ONLY", message: "Capability easyui.1 style is preserve-only; existing appearance is retained" }] }, dataBinding: { mockDataId: "records", records: [{ id: "1" }] }, sourceSolutionNodeId: "grid", sourceBlueprintPageId: "bp-detail", sourceBlueprintRegionIds: ["region-detail"], eventBindings: [] }] },
    ],
    compiledActions: [], compiledScripts: [],
    runtimeCorrelation: { controls: [{ semanticControlId: "open", instanceName: "Button1" }, { semanticControlId: "root", instanceName: "Layout1" }, { semanticControlId: "grid", instanceName: "Datagrid1" }], pages: [{ semanticPageId: "home", pageGuid: "k00000000-0000-4000-8000-000000000001" }, { semanticPageId: "detail", pageGuid: "k00000000-0000-4000-8000-000000000002" }] },
  };
  const correlationInput = structuredClone(implementation);
  delete correlationInput.runtimeCorrelation;
  correlationInput.compiledActions = [];
  correlationInput.compiledScripts = [];
  correlationInput.pages.forEach((page) => { if (page.compatibility === "native") page.controls.forEach((control) => { control.eventBindings = []; }); });
  const correlation = attachRuntimeCorrelation({ workspaceId: "workspace", baseRevisionId: "revision", implementation: correlationInput }).runtimeCorrelation!;
  implementation.runtimeCorrelation = structuredClone(correlation);
  const compiled = compileInteractions({ blueprint, plan: semanticPlan, implementation });
  if (compiled.diagnostics.errors.length > 0 || compiled.diagnostics.requests.length > 0) throw new Error(JSON.stringify(compiled.diagnostics));
  implementation = structuredClone(compiled.implementation);
  return { workspaceId: "workspace", baseRevisionId: "revision", blueprint, candidateBundle, semanticPlan, implementation, compilerVersion: "1.0.0", evidenceVersion: "1.0.0" };
}

function reattachCorrelation(source: ReturnType<typeof input>): void {
  const correlationInput = structuredClone(source.implementation);
  delete correlationInput.runtimeCorrelation;
  correlationInput.compiledActions = [];
  correlationInput.compiledScripts = [];
  correlationInput.pages.forEach((page) => { if (page.compatibility === "native") page.controls.forEach((control) => { control.eventBindings = []; }); });
  const correlation = attachRuntimeCorrelation({ workspaceId: source.workspaceId, baseRevisionId: source.baseRevisionId, implementation: correlationInput }).runtimeCorrelation!;
  source.implementation.runtimeCorrelation = structuredClone(correlation);
  compileFixtureInteractions(source);
}

function compileFixtureInteractions(source: ReturnType<typeof input>): void {
  const uncompiled = structuredClone(source.implementation);
  uncompiled.compiledActions = [];
  uncompiled.compiledScripts = [];
  uncompiled.pages.forEach((page) => { if (page.compatibility === "native") page.controls.forEach((control) => { control.eventBindings = []; }); });
  uncompiled.sourceSolutionPlanHash = canonicalServerHash(source.semanticPlan);
  uncompiled.sourceModuleRegistryHash = solutionModuleRegistryHash(source.semanticPlan, createDefaultModuleRegistry());
  const compiled = compileInteractions({ blueprint: source.blueprint, plan: source.semanticPlan, implementation: uncompiled });
  if (compiled.diagnostics.errors.length > 0 || compiled.diagnostics.requests.length > 0) throw new Error(JSON.stringify(compiled.diagnostics));
  source.implementation = structuredClone(compiled.implementation);
}

function cloneInput(source: ReturnType<typeof input>): ReturnType<typeof input> {
  return structuredClone(source);
}

describe("creative UI implementation v2 compiler", () => {
  it("lowers pages before parent-first controls with exact dimensions and runtime identities", () => {
    expect(compiler).not.toHaveProperty("verifyApprovedAssets");
    const source = input(); const before = cloneInput(source);
    const result = compiler.compile(source);
    const instanceById = new Map(source.implementation.runtimeCorrelation!.controls.map((entry) => [entry.semanticControlId, entry.instanceName]));
    expect(source).toEqual(before);
    expect(result.materialization.pages.map((page) => [page.semanticPageId, page.width, page.height])).toEqual([["detail", 1280, 760], ["home", 1440, 900]]);
    expect(result.materialization.controls.map((control) => control.semanticControlId)).toEqual(["grid", "root", "open"]);
    expect(result.materialization.controls.find((control) => control.semanticControlId === "open")).toMatchObject({ instanceName: instanceById.get("open"), parentInstanceName: instanceById.get("root") });
    expect(result.materialization.controls.find((control) => control.semanticControlId === "root")).toMatchObject({
      zIndex: 0, compiledLayout: { kind: "column", overflow: "visible" },
    });
    expect(result.materialization.controls.find((control) => control.semanticControlId === "grid")).toMatchObject({ capabilityId: "easyui.1", instanceName: instanceById.get("grid") });
    expect(result.materialization.stylesData.find((entry) => entry.semanticControlId === "grid")?.dataBinding?.records).toEqual([{ id: "1" }]);
    expect(result.plan.operations.slice(0, 2).every((operation) => operation.op === "create" && operation.entityType === "page")).toBe(true);
    expect(result.plan.operations.map((operation) => operation.entityId)).toEqual(["detail", "home", "grid", "root", "open"]);
    expect(JSON.stringify(result.plan.operations)).not.toContain(instanceById.get("open"));
    expect(result.semanticOperations).toEqual([{
      kind: "kf.table-data/v1", entityId: "grid", capabilityId: "easyui.1",
      sourceModuleId: "grid", payloadHash: semanticPayloadHash(tableData),
    }]);
    const envelope = authority.sign({ plan: result.plan, revisionId: "revision", semanticOperations: result.semanticOperations, creative: result.trustedCreativePayload });
    expect(authority.verify(JSON.parse(JSON.stringify(envelope))).nativeMaterializationHash).toBe(result.plan.creative?.materializationHash);
    const otherAuthority = createHmacServerPlanAuthority(Buffer.alloc(32, 0x41));
    expect(() => otherAuthority.sign({ plan: result.plan, revisionId: "revision", semanticOperations: result.semanticOperations, creative: result.trustedCreativePayload }))
      .toThrow(/UNTRUSTED_CREATIVE_PAYLOAD/);
    expect(Object.isFrozen(result)).toBe(true);
    expect(result.capabilityReport).toMatchObject({ status: "warning", unsupported: [], partial: ["button", "easyui.1", "layout.4"] });
  });

  it("derives table authorization only from an exact compiler-owned binding and preserves non-creative signing", () => {
    const unbound = input();
    const unboundRoot = unbound.semanticPlan.pages[1]!.root;
    if (unboundRoot.kind !== "control") throw new Error("datagrid fixture required");
    delete unboundRoot.mockDataId;
    const unboundPage = unbound.implementation.pages[1]!;
    if (unboundPage.compatibility !== "native") throw new Error("native fixture required");
    const unboundGrid = unboundPage.controls[0]!;
    delete unboundGrid.dataBinding;
    unboundGrid.nativeProperties = { pagination: false };
    compileFixtureInteractions(unbound);
    const unboundResult = compiler.compile(unbound);
    expect(unboundResult.semanticOperations).toEqual([]);
    expect(() => authority.sign({
      plan: unboundResult.plan, revisionId: "revision", semanticOperations: [], creative: unboundResult.trustedCreativePayload,
    })).not.toThrow();

    const tableWithoutBinding = input();
    const tableWithoutBindingPage = tableWithoutBinding.implementation.pages[1]!;
    if (tableWithoutBindingPage.compatibility !== "native") throw new Error("native fixture required");
    delete tableWithoutBindingPage.controls[0]!.dataBinding;
    expect(() => compiler.compile(tableWithoutBinding)).toThrow(/CREATIVE_TABLE_DATA_BINDING_REQUIRED/);

    const modelSuppliedAuthorization = input();
    (modelSuppliedAuthorization.semanticPlan as SolutionImplementationPlan & { semanticOperations?: unknown }).semanticOperations = [{
      kind: "kf.table-data/v1", entityId: "grid", capabilityId: "easyui.1", sourceModuleId: "model-forged",
      payloadHash: semanticPayloadHash(tableData),
    }];
    expect(() => compiler.compile(modelSuppliedAuthorization)).toThrow();

    const forged = input();
    const forgedPage = forged.implementation.pages[1]!;
    if (forgedPage.compatibility !== "native") throw new Error("native fixture required");
    forgedPage.controls[0]!.nativeProperties.tableData = {
      ...tableData,
      rows: [{ id: "forged" }],
    };
    expect(() => compiler.compile(forged)).toThrow(/TABLE_DATA.*BINDING|BINDING.*TABLE_DATA/);

    const result = compiler.compile(input());
    const planWithExtraTableData = structuredClone(result.plan);
    const open = planWithExtraTableData.operations.find((operation) => operation.entityId === "open");
    if (open?.op !== "create") throw new Error("create fixture required");
    open.properties.tableData = tableData;
    expect(() => authority.sign({
      plan: planWithExtraTableData,
      revisionId: "revision",
      semanticOperations: result.semanticOperations,
      creative: result.trustedCreativePayload,
    })).toThrow(/CREATIVE_PLAN_BINDING_MISMATCH/);
    expect(() => authority.sign({
      plan: result.plan,
      revisionId: "revision",
      semanticOperations: [...result.semanticOperations, {
        kind: "kf.table-data/v1", entityId: "open", capabilityId: "easyui.1",
        sourceModuleId: "forged", payloadHash: semanticPayloadHash(tableData),
      }],
      creative: result.trustedCreativePayload,
    })).toThrow(/SERVER_PLAN_SEMANTIC_MISMATCH/);

    const legacyPlan = { schema: "kf-change-plan/v1" as const, workspaceId: "legacy", operations: [{
      op: "create" as const, entityType: "control" as const, entityId: "legacy-text", properties: { type: "text", text: "兼容" },
    }] };
    expect(authority.verify(authority.sign({ plan: legacyPlan, revisionId: "legacy-revision", semanticOperations: [] })).plan)
      .toEqual(legacyPlan);
    const modulePlan = { schema: "kf-change-plan/v1" as const, workspaceId: "module", operations: [{
      op: "create" as const, entityType: "control" as const, entityId: "module-grid", properties: { type: "easyui", proto: 1, tableData },
    }] };
    const moduleAuthorization = [{
      kind: "kf.table-data/v1" as const, entityId: "module-grid", capabilityId: "easyui.1" as const,
      sourceModuleId: "module-table", payloadHash: semanticPayloadHash(tableData),
    }];
    expect(authority.verify(authority.sign({ plan: modulePlan, revisionId: "module-revision", semanticOperations: moduleAuthorization })).semanticOperations)
      .toEqual(moduleAuthorization);
    const modulePlanWithExtraTableData = structuredClone(modulePlan);
    modulePlanWithExtraTableData.operations.push({
      op: "create", entityType: "control", entityId: "module-extra-grid",
      properties: { type: "easyui", proto: 1, tableData },
    });
    expect(() => authority.sign({
      plan: modulePlanWithExtraTableData,
      revisionId: "module-revision",
      semanticOperations: moduleAuthorization,
    })).toThrow(/SERVER_PLAN_SEMANTIC_MISMATCH/);
  });

  it("is deterministic and rejects missing correlation, unapproved assets, proxies and aliases", () => {
    const first = input(); expect(compiler.compile(first)).toEqual(compiler.compile(cloneInput(first)));
    const missing = input(); delete missing.implementation.runtimeCorrelation;
    expect(() => compiler.compile(missing)).toThrow(/RUNTIME_CORRELATION_REQUIRED/);
    const asset = input(); const modelId = workspaceAssetIdToModelId("00000000-0000-4000-8000-000000000001");
    const assetPage = asset.implementation.pages[0]!; if (assetPage.compatibility !== "native") throw new Error("native fixture required");
    assetPage.controls[0]!.assetIds = [modelId];
    expect(() => compiler.compile(asset)).toThrow(/ASSET_NOT_APPROVED/);
    let trapped = false; const proxy = new Proxy(input(), { ownKeys() { trapped = true; return []; } });
    expect(() => compiler.compile(proxy)).toThrow(/PROXY_FORBIDDEN/); expect(trapped).toBe(false);
    let nestedTrap = false; const nestedProxy = input(); nestedProxy.implementation.theme = new Proxy(nestedProxy.implementation.theme, { ownKeys() { nestedTrap = true; return []; } });
    expect(() => compiler.compile(nestedProxy)).toThrow(/PROXY_FORBIDDEN/); expect(nestedTrap).toBe(false);
    let rawIssuerGetter = false; const rawIssuer = input() as ReturnType<typeof input> & { trustedPayloadIssuer?: unknown };
    Object.defineProperty(rawIssuer, "trustedPayloadIssuer", { enumerable: true, get() { rawIssuerGetter = true; return {}; } });
    expect(() => compiler.compile(rawIssuer)).toThrow(/UNKNOWN_FIELD/); expect(rawIssuerGetter).toBe(false);
    let factoryTrap = false; const proxyIssuer = new Proxy({}, { getPrototypeOf() { factoryTrap = true; return Object.prototype; }, ownKeys() { factoryTrap = true; return []; } });
    expect(() => createCreativeUIImplementationV2Compiler(proxyIssuer as never)).toThrow(/ISSUER.*PROXY|PROXY.*ISSUER/); expect(factoryTrap).toBe(false);
    let issuerGetter = false; const getterIssuer = {};
    Object.defineProperty(getterIssuer, "issue", { enumerable: true, get() { issuerGetter = true; return () => undefined; } });
    expect(() => createCreativeUIImplementationV2Compiler(getterIssuer as never)).toThrow(/ISSUER.*ACCESSOR|ACCESSOR.*ISSUER/); expect(issuerGetter).toBe(false);
    let getterRan = false; const accessor = input(); Object.defineProperty(accessor.blueprint, "displayName", { enumerable: true, get() { getterRan = true; return "bad"; } });
    expect(() => compiler.compile(accessor)).toThrow(/ACCESSOR_FORBIDDEN/); expect(getterRan).toBe(false);
    const nonPlain = Object.assign(Object.create({ inherited: true }) as ReturnType<typeof input>, input());
    expect(() => compiler.compile(nonPlain)).toThrow(/NON_PLAIN|INVALID/);
    const cyclic = input(); (cyclic.blueprint as unknown as Record<string, unknown>)["cycle"] = cyclic.blueprint;
    expect(() => compiler.compile(cyclic)).toThrow(/CYCLE_FORBIDDEN/);
    const deep = input(); let cursor = deep.blueprint as unknown as Record<string, unknown>; for (let index = 0; index < 100; index += 1) { const next = {}; cursor[`deep${index}`] = next; cursor = next; }
    expect(() => compiler.compile(deep)).toThrow(/BUDGET_EXCEEDED/);
    const alias = input(); alias.implementation.theme = alias.semanticPlan.theme;
    expect(() => compiler.compile(alias)).toThrow(/ALIAS/);
    const unsupported = input(); const unsupportedPage = unsupported.implementation.pages[0]!; if (unsupportedPage.compatibility !== "native") throw new Error("native fixture required");
    unsupportedPage.controls[0]!.capabilityId = "unknown.99";
    const unsupportedRoot = unsupported.semanticPlan.pages[0]!.root; if (unsupportedRoot.kind !== "layout" || unsupportedRoot.children[0]!.kind !== "control") throw new Error("control fixture required");
    unsupportedRoot.children[0]!.capabilityId = "unknown.99"; unsupported.implementation.sourceSolutionPlanHash = canonicalServerHash(unsupported.semanticPlan);
    expect(() => compiler.compile(unsupported)).toThrow(/CAPABILITY_UNSUPPORTED|RUNTIME_PREFIX_UNSUPPORTED/);
    const forgedStyle = input(); const forgedPage = forgedStyle.implementation.pages[0]!; if (forgedPage.compatibility !== "native") throw new Error("native fixture required");
    forgedPage.controls[0]!.compiledStyle!.warnings.push({ code: "FORGED_STYLE", message: "伪造" });
    expect(() => compiler.compile(forgedStyle)).toThrow(/COMPILED_STYLE_MISMATCH/);
    const forgedRole = input(); forgedRole.implementation.compiledRoleStyles.content!.declarations.textColor = "#ffffff";
    expect(() => compiler.compile(forgedRole)).toThrow(/COMPILED_ROLE_STYLE_MISMATCH/);
    const forgedRuntime = input(); forgedRuntime.implementation.runtimeCorrelation!.controls.find((entry) => entry.semanticControlId === "open")!.instanceName = "Button999";
    forgedRuntime.implementation.compiledActions[0]!.ownerInstanceName = "Button999";
    const forgedRuntimePage = forgedRuntime.implementation.pages[0]!; if (forgedRuntimePage.compatibility !== "native") throw new Error("native fixture required");
    forgedRuntimePage.controls[0]!.eventBindings[0]!.ownerInstanceName = "Button999";
    expect(() => compiler.compile(forgedRuntime)).toThrow(/RUNTIME_CORRELATION_PROVENANCE/);
    const forgedAction = input(); const forgedNavigate = forgedAction.implementation.compiledActions[0]!;
    if (forgedNavigate.kind !== "navigate-page") throw new Error("navigate fixture required");
    forgedNavigate.targetPageGuid = forgedAction.implementation.runtimeCorrelation!.pages.find((entry) => entry.semanticPageId === "home")!.pageGuid;
    expect(() => compiler.compile(forgedAction)).toThrow(/INTERACTION_PROVENANCE/);
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
    const result = compiler.compile({ ...source, verifiedExisting: handle });
    expect(result.materialization.pages.find((page) => page.semanticPageId === "home")?.pageGuid).toBe("7UJ0lvKq8Q708A6Zl0C02");
    expect(result.plan.operations.every((operation) => operation.op === "update")).toBe(true);
    expect(result.plan.operations.map((operation) => operation.entityId)).toEqual(["detail", "home", "grid", "root", "open"]);
    const deltaPaths = (id: string) => result.materialization.controls.find((control) => control.semanticControlId === id)?.existingDeltas?.map((delta) => delta.path);
    expect(deltaPaths("grid")).toEqual(["/x", "/y", "/width", "/height", "/pagination", "/pageSize"]);
    expect(deltaPaths("root")).toEqual(["/x", "/y", "/width", "/height"]);
    expect(deltaPaths("open")).toEqual(["/x", "/y", "/width", "/height", "/text"]);
    expect(result.artifact.evidence.controls.find((control) => control.semanticControlId === "grid")?.deltaAllowlistPolicy?.allowedFields)
      .toContain("pagination");
    expect(result.artifact.evidence.controls.find((control) => control.semanticControlId === "open")?.deltaAllowlistPolicy?.allowedFields)
      .toContain("text");
    expect(result.materialization.controls.find((control) => control.semanticControlId === "grid")?.nativeGuid).toEqual(expect.any(String));
  });

  it("materializes exact Datagrid data, onClickRow evidence and compiled SetData script", () => {
    const source = input();
    const datagridName = source.implementation.runtimeCorrelation!.controls.find((entry) => entry.semanticControlId === "grid")!.instanceName;
    const gridPlan = source.semanticPlan.pages[1]!.root;
    if (gridPlan.kind !== "control") throw new Error("grid fixture required");
    gridPlan.eventBindings = [{ semanticEvent: "row-click", actionIds: ["refresh-grid"] }];
    source.semanticPlan.scripts.push({ id: "refresh", purpose: "刷新记录", kind: "custom", programVersion: "semantic-js/v1", source: '$control.setData("grid", []);', inputs: [], outputs: [{ name: "records", description: "记录", refKind: "control", refId: "grid" }] });
    source.semanticPlan.actions.push({ id: "refresh-grid", kind: "run-script", scriptId: "refresh", afterActionIds: [], journeyStepRefs: [] });
    compileFixtureInteractions(source);
    const scriptSource = source.implementation.compiledScripts[0]!.source;
    const result = compiler.compile(source);
    expect(result.materialization.interactions.eventBindings).toContainEqual(expect.objectContaining({ ownerInstanceName: datagridName, kfEvent: "onClickRow", linkId: 200024 }));
    expect(result.materialization.interactions.scripts[0]).toMatchObject({ ownerInstanceName: datagridName, source: scriptSource });
    expect(result.materialization.stylesData.find((entry) => entry.semanticControlId === "grid")?.dataBinding?.records).toEqual([{ id: "1" }]);
  });

  it("publishes image assets in the plan while keeping non-image style assets in trusted materialization", () => {
    const source = input(); const workspaceAssetId = "00000000-0000-4000-8000-000000000001";
    const assetId = workspaceAssetIdToModelId(workspaceAssetId); const sha256 = "a".repeat(64);
    const page = source.implementation.pages[0]!; if (page.compatibility !== "native") throw new Error("native fixture required");
    page.controls[0]!.assetIds = [assetId];
    const assetFacts = { assetId, approvedAsset: { workspaceAssetId, targetPath: `project/res/images/${sha256}.png`, mediaType: "image/png" as const, sha256, sizeBytes: 100 } };
    const result = compiler.compile({ ...source, verifiedAssets: assetResolver.attestResolvedAssets({ workspaceId: "workspace", assets: [assetFacts] }) });
    expect(result.verifiedAssets).toHaveLength(1);
    expect(result.plan.assetBindings).toBeUndefined();
    expect(result.materialization.stylesData.find((style) => style.semanticControlId === "open")?.approvedAssets[0]?.approvedAsset.sha256).toBe(sha256);
    const shared = input();
    const sharedHome = shared.implementation.pages[0]!; const sharedDetail = shared.implementation.pages[1]!;
    if (sharedHome.compatibility !== "native" || sharedDetail.compatibility !== "native") throw new Error("native fixture required");
    sharedHome.controls[0]!.assetIds = [assetId]; sharedDetail.controls[0]!.assetIds = [assetId];
    const sharedResult = compiler.compile({ ...shared, verifiedAssets: assetResolver.attestResolvedAssets({ workspaceId: "workspace", assets: [assetFacts] }) });
    expect(sharedResult.materialization.stylesData.filter((style) => style.approvedAssets.some((asset) => asset.assetId === assetId))).toHaveLength(2);
    const conflictingStyles = structuredClone(sharedResult.materialization);
    conflictingStyles.stylesData.find((style) => style.semanticControlId === "grid")!.approvedAssets[0]!.approvedAsset.sizeBytes += 1;
    expect(TrustedNativeMaterializationSchema.safeParse(conflictingStyles).success).toBe(false);
    const image = input(); const imagePage = image.implementation.pages[1]!; if (imagePage.compatibility !== "native") throw new Error("native fixture required");
    imagePage.controls[0]!.capabilityId = "image"; imagePage.controls[0]!.assetIds = [assetId];
    delete imagePage.controls[0]!.dataBinding; imagePage.controls[0]!.nativeProperties = {};
    imagePage.controls[0]!.compiledStyle = { nativeFields: {}, cssFragments: [], warnings: [] };
    const imageRoot = image.semanticPlan.pages[1]!.root;
    if (imageRoot.kind !== "control") throw new Error("control fixture required");
    imageRoot.capabilityId = "image"; delete imageRoot.mockDataId;
    image.implementation.sourceSolutionPlanHash = canonicalServerHash(image.semanticPlan);
    reattachCorrelation(image);
    expect(compiler.compile({ ...image, verifiedAssets: assetResolver.attestResolvedAssets({ workspaceId: "workspace", assets: [assetFacts] }) }).plan.assetBindings?.[0])
      .toMatchObject({ assetId, entityId: "grid", controlId: "grid" });
    const forgedFacts = { assetId, approvedAsset: { ...assetFacts.approvedAsset, workspaceAssetId: "00000000-0000-4000-8000-000000000002" } };
    expect(() => assetResolver.attestResolvedAssets({ workspaceId: "workspace", assets: [forgedFacts] })).toThrow(/ASSET_INVALID/);
    expect(() => compiler.compile({ ...input(), verifiedAssets: assetResolver.attestResolvedAssets({ workspaceId: "workspace", assets: [assetFacts] }) })).toThrow(/ASSET_UNUSED/);
    expect(() => assetResolver.attestResolvedAssets({ workspaceId: "workspace", assets: [assetFacts, structuredClone(assetFacts)] })).toThrow(/ASSET_INVALID/);
    const conflicting = structuredClone(assetFacts); conflicting.approvedAsset.sizeBytes += 1;
    expect(() => assetResolver.attestResolvedAssets({ workspaceId: "workspace", assets: [assetFacts, conflicting] })).toThrow(/ASSET_INVALID/);
    let proxyTrap = false; const assetProxy = new Proxy([assetFacts], { ownKeys() { proxyTrap = true; return []; } });
    expect(() => assetResolver.attestResolvedAssets(assetProxy as never)).toThrow(/PROXY/); expect(proxyTrap).toBe(false);
    let getterTrap = false; const getterAsset = structuredClone(assetFacts);
    Object.defineProperty(getterAsset, "assetId", { enumerable: true, get() { getterTrap = true; return assetId; } });
    expect(() => assetResolver.attestResolvedAssets({ workspaceId: "workspace", assets: [getterAsset] })).toThrow(/ACCESSOR/); expect(getterTrap).toBe(false);
    const otherFacade = createHmacCreativeBuildFacade(Buffer.alloc(32, 0x42), createCreativeUIImplementationV2Compiler);
    const foreignProof = otherFacade.compiler.assetProofResolver.attestResolvedAssets({ workspaceId: "workspace", assets: [assetFacts] });
    expect(() => compiler.compile({ ...source, verifiedAssets: foreignProof })).toThrow(/ASSET_PROOF_REQUIRED/);
    const wrongWorkspace = assetResolver.attestResolvedAssets({ workspaceId: "other-workspace", assets: [assetFacts] });
    expect(() => compiler.compile({ ...source, verifiedAssets: wrongWorkspace })).toThrow(/ASSET_PROOF.*BINDING|BINDING.*ASSET_PROOF/);
  });
});
