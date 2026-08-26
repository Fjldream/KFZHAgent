import { cp, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  canonicalChangePlanHash,
  canonicalServerHash,
  workspaceAssetIdToModelId,
  type SolutionImplementationPlan,
  type SolutionNode,
  type UIImplementationSpecV2,
} from "@kf/contracts";
import {
  createHmacCreativeBuildFacade,
  resolveBuildAssets,
  resolveStoredPlan,
} from "@kf/build-jobs";
import { describe, expect, it } from "vitest";
import { compileClientProject } from "../compile/client-compiler.js";
import { inspectClientProject } from "../inspect/client-inspector.js";
import { createCreativeUIImplementationV2Compiler } from "../implementation/ui-implementation-v2-compiler.js";
import {
  attachRuntimeCorrelation,
  verifyExistingRuntimeCorrelation,
  type VerifiedExistingRuntimeCorrelationHandle,
} from "../implementation/runtime-correlation.js";
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

function creativeInput(
  verifiedExisting?: VerifiedExistingRuntimeCorrelationHandle,
  extraControlCount = 0,
  includePrivilegedTableData = false,
  fractionalBoundary = false,
  scrollOverflow = false,
  includeOverlay = false,
) {
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
      controls: [ranked("button"), ranked("image"), ranked("text"), ranked("easyui.1")],
      layouts: [ranked("layout.4")], recipes: [ranked("content.hero")] })),
    detailedCapabilityIds: ["button", "easyui.1", "image", "layout.4", "text"],
    generatedAtPolicy: "deterministic-no-timestamp" as const,
  };
  const candidateBundleHash = canonicalServerHash(candidateBundle);
  const semanticPlan: SolutionImplementationPlan = {
    schema: "kf-solution-implementation/v1", projectKey: "creative", blueprintHash, candidateBundleHash,
    theme, roleStyles: [
      { role: "content", declarations: {}, states: {} },
      { role: "action", declarations: { backgroundColor: "#0b6bcb", borderRadius: 8 }, states: {} },
    ],
    mockData: [{ id: "records", purpose: "记录", fields: [{ key: "id", label: "编号", type: "text" }],
      records: [{ values: [{ field: "id", value: "1" }] }] }],
    localState: [], overlays: [],
    scripts: [{ id: "refresh", purpose: "刷新记录", kind: "custom", programVersion: "semantic-js/v1",
      source: '$control.setData("grid", []);', inputs: [],
      outputs: [{ name: "records", description: "记录", refKind: "control", refId: "grid" }] }],
    pages: [
      { id: "home", title: "首页", purpose: "首页", canvas: "desktop", sourceBlueprintPageId: "bp-home",
        sourceBlueprintRegionIds: ["region-home"], initialStateIds: [], root: {
          id: "root", kind: "layout", layout: scrollOverflow ? "scroll-region" : "column", sourceBlueprintRegionIds: ["region-home"],
          intent: structuredClone(intent), children: [
            { id: "open", kind: "control", capabilityId: "button",
              content: "打开", properties: [], tabIds: [], styleRole: "content",
              sourceBlueprintRegionIds: ["region-home"], intent: structuredClone(intent),
              eventBindings: [{ semanticEvent: "click", actionIds: ["navigate"] }] },
            { id: "portrait", kind: "control", capabilityId: "image", content: null,
              properties: [], tabIds: [], styleRole: "content", sourceBlueprintRegionIds: ["region-home"],
              intent: structuredClone(intent), eventBindings: [] },
          ],
        } },
      { id: "detail", title: "详情", purpose: "详情", canvas: "desktop", sourceBlueprintPageId: "bp-detail",
        sourceBlueprintRegionIds: ["region-detail"], initialStateIds: [], root: {
          id: "detail-root", kind: "layout", layout: "column", sourceBlueprintRegionIds: ["region-detail"],
          intent: structuredClone(intent), children: [
            { id: "grid", kind: "control", capabilityId: "easyui.1", content: null, properties: [], tabIds: [],
              styleRole: "content", sourceBlueprintRegionIds: ["region-detail"], intent: structuredClone(intent),
              mockDataId: "records", eventBindings: [{ semanticEvent: "row-click", actionIds: ["refresh-grid"] }] },
            { id: "styled", kind: "control", capabilityId: "button", content: "样式", properties: [], tabIds: [],
              styleRole: "action", sourceBlueprintRegionIds: ["region-detail"], intent: structuredClone(intent),
              eventBindings: [] },
            { id: "detail-image", kind: "control", capabilityId: "image", content: null, properties: [], tabIds: [],
              styleRole: "content", sourceBlueprintRegionIds: ["region-detail"], intent: structuredClone(intent),
              eventBindings: [] },
          ],
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
    compiledRoleStyles: {
      content: { role: "content", declarations: {}, states: {} },
      action: { role: "action", declarations: { backgroundColor: "#0b6bcb", borderRadius: 8 }, states: {} },
    },
    compiledActions: [], compiledScripts: [], pages: [
      { compatibility: "native", id: "home", width: 1440, height: 900,
        sourceBlueprintPageId: "bp-home", controls: [
          { id: "open", parentId: "root", role: "content", capabilityId: "button", content: "打开",
            depth: 1, zIndex: 2, geometry: scrollOverflow
              ? { x: 20, y: 140, width: 120, height: 40 }
              : fractionalBoundary
                ? { x: 1100.31, y: 768, width: 120, height: 30 }
                : { x: 20, y: 20, width: 120, height: 40 },
            nativeProperties: { parentId: "root" },
            compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] }, sourceSolutionNodeId: "open",
            sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region-home"], eventBindings: [] },
          { id: "portrait", parentId: "root", role: "content", capabilityId: "image", depth: 1, zIndex: 1,
            geometry: scrollOverflow
              ? { x: 20, y: 30, width: 160, height: 60 }
              : fractionalBoundary
                ? { x: 1100.31, y: 688.4, width: 160, height: 60 }
                : { x: 40, y: 80, width: 200, height: 160 },
            nativeProperties: { src: "static/images/images/image1.png" },
            compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] }, sourceSolutionNodeId: "portrait",
            sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region-home"], eventBindings: [] },
          { id: "root", role: "content", capabilityId: "layout.4", depth: 0, zIndex: 0,
            geometry: scrollOverflow
              ? { x: 20, y: 20, width: 300, height: 100 }
              : fractionalBoundary
                ? { x: 1100.31, y: 688.4, width: 283.69, height: 109.6 }
                : { x: 0, y: 0, width: 1440, height: 900 },
            compiledLayout: scrollOverflow
              ? { kind: "scroll-region", overflow: "local-scroll", scrollContentExtent: { width: 300, height: 160 } }
              : { kind: "column", overflow: "visible" }, nativeProperties: {},
            compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] }, sourceSolutionNodeId: "root",
            sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region-home"], eventBindings: [] },
        ] },
      { compatibility: "native", id: "detail", width: 1280, height: 760,
        sourceBlueprintPageId: "bp-detail", controls: [
          { id: "detail-root", role: "content", capabilityId: "layout.4", depth: 0, zIndex: 0,
            geometry: { x: 0, y: 0, width: 1280, height: 760 }, compiledLayout: { kind: "column", overflow: "visible" },
            nativeProperties: {}, compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] },
            sourceSolutionNodeId: "detail-root", sourceBlueprintPageId: "bp-detail",
            sourceBlueprintRegionIds: ["region-detail"], eventBindings: [] },
          { id: "grid", parentId: "detail-root", role: "content", capabilityId: "easyui.1", depth: 1, zIndex: 0,
            geometry: { x: 0, y: 0, width: 900, height: 500 }, nativeProperties: includePrivilegedTableData
              ? { parentId: "detail-root", pagination: false, pageSize: 1,
                tableData: { columns: [{ key: "id", label: "编号", align: "left" }], rows: [{ id: "1" }], pageSize: 1 } }
              : { pagination: true },
            compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [{ code: "STYLE_CAPABILITY_PRESERVE_ONLY",
              message: "Capability easyui.1 style is preserve-only; existing appearance is retained" }] },
            dataBinding: { mockDataId: "records", records: [{ id: "1" }] }, sourceSolutionNodeId: "grid",
            sourceBlueprintPageId: "bp-detail", sourceBlueprintRegionIds: ["region-detail"], eventBindings: [] },
          { id: "styled", parentId: "detail-root", role: "action", capabilityId: "button", content: "样式",
            depth: 1, zIndex: 1, geometry: { x: 0, y: 520, width: 120, height: 40 },
            nativeProperties: { backgroundColor: "#0b6bcb" },
            compiledStyle: { nativeFields: { backgroundColor: "#0b6bcb" },
              cssFragments: [{ selectorToken: "root", state: "normal", declarations: { borderRadius: 8 } }], warnings: [] },
            sourceSolutionNodeId: "styled", sourceBlueprintPageId: "bp-detail",
            sourceBlueprintRegionIds: ["region-detail"], eventBindings: [] },
          { id: "detail-image", parentId: "detail-root", role: "content", capabilityId: "image", depth: 1,
            zIndex: 2, geometry: { x: 140, y: 520, width: 160, height: 120 },
            nativeProperties: { src: "static/images/images/image1.png" },
            compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] },
            sourceSolutionNodeId: "detail-image", sourceBlueprintPageId: "bp-detail",
            sourceBlueprintRegionIds: ["region-detail"], eventBindings: [] },
        ] },
    ],
  };
  if (includeOverlay) {
    const semanticDetail = semanticPlan.pages.find((page) => page.id === "detail")!;
    if (semanticDetail.root.kind !== "layout") throw new Error("detail layout fixture required");
    const semanticStyled = semanticDetail.root.children.find((node) => node.id === "styled")!;
    if (semanticStyled.kind !== "control") throw new Error("styled control fixture required");
    semanticStyled.eventBindings = [{ semanticEvent: "click", actionIds: ["open-review-overlay"] }];
    semanticPlan.localState.push({ id: "review-overlay-visible", purpose: "控制审核弹层显隐", type: "boolean", initialValue: false });
    semanticPlan.overlays.push({
      id: "review-overlay", title: "审核确认", purpose: "确认处理结果", presentation: "dialog",
      hostPageId: "detail", sourceBlueprintPageId: "bp-detail", sourceBlueprintRegionIds: ["region-detail"],
      visibleStateId: "review-overlay-visible", dismissible: true,
      root: {
        id: "review-overlay-root", kind: "layout", layout: "column", sourceBlueprintRegionIds: ["region-detail"],
        intent: { ...structuredClone(intent), readingOrder: 20 },
        children: [{
          id: "review-overlay-close", kind: "control", capabilityId: "button", content: "关闭", properties: [], tabIds: [],
          styleRole: "content", sourceBlueprintRegionIds: ["region-detail"], intent: { ...structuredClone(intent), readingOrder: 21 },
          eventBindings: [{ semanticEvent: "click", actionIds: ["close-review-overlay"] }],
        }],
      },
    });
    semanticPlan.actions.push(
      { id: "open-review-overlay", kind: "open-overlay", overlayId: "review-overlay", afterActionIds: [], journeyStepRefs: [] },
      { id: "close-review-overlay", kind: "close-overlay", overlayId: "review-overlay", afterActionIds: [], journeyStepRefs: [] },
    );
    const implementationDetail = implementationBase.pages.find((page) => page.id === "detail")!;
    if (implementationDetail.compatibility !== "native") throw new Error("native detail fixture required");
    implementationDetail.controls.push(
      {
        id: "review-overlay-root", role: "layout", capabilityId: "layout.4", depth: 0, zIndex: 10,
        geometry: { x: 320, y: 160, width: 640, height: 360 }, compiledLayout: { kind: "column", overflow: "visible" }, nativeProperties: {},
        compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] }, sourceSolutionNodeId: "review-overlay-root",
        sourceBlueprintPageId: "bp-detail", sourceBlueprintRegionIds: ["region-detail"], eventBindings: [],
        overlayHost: { overlayId: "review-overlay", hostPageId: "detail", presentation: "dialog", visibleStateId: "review-overlay-visible", dismissible: true, initiallyVisible: false },
      },
      {
        id: "review-overlay-close", parentId: "review-overlay-root", role: "content", capabilityId: "button", content: "关闭",
        depth: 1, zIndex: 11, geometry: { x: 760, y: 440, width: 96, height: 40 }, nativeProperties: { parentId: "review-overlay-root" },
        compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] }, sourceSolutionNodeId: "review-overlay-close",
        sourceBlueprintPageId: "bp-detail", sourceBlueprintRegionIds: ["region-detail"], eventBindings: [],
      },
    );
    implementationBase.sourceSolutionPlanHash = canonicalServerHash(semanticPlan);
    implementationBase.sourceModuleRegistryHash = solutionModuleRegistryHash(semanticPlan, createDefaultModuleRegistry());
  }
  if (extraControlCount > 0) {
    // Keep the scale fixture focused on native page materialization. Script
    // compilation intentionally snapshots the full semantic plan into its
    // reviewed context and has a separate 50k-node budget.
    semanticPlan.scripts = [];
    semanticPlan.actions = semanticPlan.actions.filter((action) => action.id !== "refresh-grid");
    const semanticDetail = semanticPlan.pages.find((page) => page.id === "detail")!;
    if (semanticDetail.root.kind !== "layout") throw new Error("detail layout fixture required");
    const semanticGrid = semanticDetail.root.children.find((node) => node.id === "grid")!;
    if (semanticGrid.kind !== "control") throw new Error("grid fixture required");
    semanticGrid.eventBindings = [];
    const semanticHome = semanticPlan.pages.find((page) => page.id === "home")!;
    if (semanticHome.root.kind !== "layout") throw new Error("home layout fixture required");
    const semanticRoot = semanticHome.root;
    const implementationHome = implementationBase.pages.find((page) => page.id === "home")!;
    if (implementationHome.compatibility !== "native") throw new Error("native home fixture required");
    type SemanticLayout = Extract<SolutionNode, { kind: "layout" }>;
    let emitted = 0;
    const addLayout = (parent: SemanticLayout, parentId: string, depth: number): SemanticLayout => {
      const id = `bulk-layout-${String(emitted).padStart(4, "0")}`;
      emitted += 1;
      const node: SemanticLayout = {
        id, kind: "layout", layout: "column", sourceBlueprintRegionIds: ["region-home"],
        intent: { ...structuredClone(intent), readingOrder: emitted + 2 }, children: [],
      };
      parent.children.push(node);
      implementationHome.controls.push({
        id, parentId, role: "content", capabilityId: "layout.4", depth, zIndex: emitted + 3,
        geometry: { x: 0, y: 0, width: 1440, height: 900 }, compiledLayout: { kind: "column", overflow: "visible" },
        nativeProperties: {}, compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] }, sourceSolutionNodeId: id,
        sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region-home"], eventBindings: [],
      });
      return node;
    };
    const addButton = (parent: SemanticLayout, parentId: string, depth: number): void => {
      const id = `bulk-button-${String(emitted).padStart(4, "0")}`;
      emitted += 1;
      parent.children.push({
        id, kind: "control", capabilityId: "button", content: id, properties: [], tabIds: [],
        styleRole: "content", sourceBlueprintRegionIds: ["region-home"],
        intent: { ...structuredClone(intent), readingOrder: emitted + 2 }, eventBindings: [],
      });
      implementationHome.controls.push({
        id, parentId, role: "content", capabilityId: "button", content: id,
        depth, zIndex: emitted + 3, geometry: { x: 0, y: 0, width: 1, height: 1 }, nativeProperties: {},
        compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] }, sourceSolutionNodeId: id,
        sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["region-home"], eventBindings: [],
      });
    };
    if (extraControlCount <= 22) {
      while (emitted < extraControlCount) addButton(semanticRoot, "root", 1);
    } else {
      const firstLevel = Array.from({ length: 22 }, () => addLayout(semanticRoot, "root", 1));
      let parents = firstLevel.map((node) => ({ node, id: node.id, depth: 2 }));
      let remaining = extraControlCount - emitted;
      if (remaining > firstLevel.length * 24) {
        const secondLevelCount = Math.ceil(remaining / 25);
        const secondLevel: typeof parents = [];
        for (let index = 0; index < secondLevelCount; index += 1) {
          const parent = firstLevel[index % firstLevel.length]!;
          const node = addLayout(parent, parent.id, 2);
          secondLevel.push({ node, id: node.id, depth: 3 });
        }
        parents = secondLevel;
        remaining = extraControlCount - emitted;
      }
      for (let index = 0; index < remaining; index += 1) {
        const parent = parents[index % parents.length]!;
        addButton(parent.node, parent.id, parent.depth);
      }
    }
    if (emitted !== extraControlCount) throw new Error("bulk fixture count mismatch");
    implementationBase.sourceSolutionPlanHash = canonicalServerHash(semanticPlan);
    implementationBase.sourceModuleRegistryHash = solutionModuleRegistryHash(semanticPlan, createDefaultModuleRegistry());
  }
  const correlated = attachRuntimeCorrelation({
    workspaceId: "workspace", baseRevisionId: "revision", implementation: implementationBase,
    ...(verifiedExisting === undefined ? {} : { verifiedExisting }),
  });
  const compiled = compileInteractions({ blueprint, plan: semanticPlan, implementation: correlated });
  if (compiled.diagnostics.errors.length > 0 || compiled.diagnostics.requests.length > 0) {
    throw new Error(JSON.stringify(compiled.diagnostics));
  }
  return {
    workspaceId: "workspace", baseRevisionId: "revision", blueprint, candidateBundle, semanticPlan,
    implementation: structuredClone(compiled.implementation), compilerVersion: "1.0.0", evidenceVersion: "1.0.0",
    ...(verifiedExisting === undefined ? {} : { verifiedExisting }),
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

function decodedModules(source: string) {
  const marker = "// kf-compiled-event/v1 ";
  const result: Array<{ metadata: Record<string, unknown>; body: string }> = [];
  let cursor = 0;
  while (true) {
    const start = source.indexOf(marker, cursor);
    if (start < 0) return result;
    const newline = source.indexOf("\n", start);
    const metadata = JSON.parse(Buffer.from(source.slice(start + marker.length, newline), "base64url").toString("utf8")) as Record<string, unknown>;
    const bodyStartBytes = Buffer.byteLength(source.slice(0, newline + 1));
    const all = Buffer.from(source, "utf8");
    const body = all.subarray(bodyStartBytes, bodyStartBytes + Number(metadata["bodyByteLength"])).toString("utf8");
    result.push({ metadata, body });
    cursor = Buffer.from(source, "utf8").subarray(0, bodyStartBytes + Number(metadata["bodyByteLength"])).toString("utf8").length;
  }
}

async function signedFixture(
  extraControlCount = 0,
  includePrivilegedTableData = false,
  fractionalBoundary = false,
  scrollOverflow = false,
  includeOverlay = false,
) {
  const facade = createHmacCreativeBuildFacade(Buffer.alloc(32, 0x41), createCreativeUIImplementationV2Compiler);
  const result = facade.compiler.compiler.compile(creativeInput(
    undefined,
    extraControlCount,
    includePrivilegedTableData,
    fractionalBoundary,
    scrollOverflow,
    includeOverlay,
  ));
  const envelope = facade.authority.sign({
    plan: result.plan, revisionId: "revision", semanticOperations: result.semanticOperations,
    creative: result.trustedCreativePayload,
  });
  const planHash = canonicalChangePlanHash(result.plan);
  const resolved = resolveStoredPlan(JSON.parse(JSON.stringify(envelope)), {
    expectedPlanHash: planHash, expectedRevisionId: "revision",
  }, facade.authority) as ReturnType<typeof resolveStoredPlan> & { creativeMaterialization: unknown };
  return { result, resolved, planHash, envelope, facade };
}

async function baseWorkspace() {
  return compileClientProject({
    schema: "kf-client-project-ir/v1", id: "base", name: "Base", version: "1.0.0.1",
    pages: [{ id: "untouched", name: "Untouched", width: 800, height: 600, controls: [] }],
    variables: [], scripts: [],
  }, { seed: "base" });
}

async function existingSignedFixture(withImageAsset = false) {
  const base = await compileClientProject({
    schema: "kf-client-project-ir/v1", id: "existing-base", name: "Existing", version: "1.0.0.1",
    pages: [{ id: "detail-existing", name: "DetailExisting", width: 1024, height: 700, controls: [
      { id: "Layout1", type: "layout", layoutType: 4, x: 0, y: 0, width: 1024, height: 700 },
      { id: "Datagrid1", type: "easyui", proto: 1, x: 10, y: 10, width: 640, height: 400 },
      { id: "Button1", type: "button", x: 10, y: 430, width: 100, height: 40, text: "旧样式" },
      { id: "Image1", type: "image", x: 140, y: 430, width: 160, height: 120, src: "legacy.png" },
    ] }],
    variables: [], scripts: [],
  }, { seed: "existing-base" });
  let inspection = await inspectClientProject(base.rootDir);
  const page = inspection.summary.pages[0]!;
  const pagePath = path.join(base.rootDir, "1.0.0.1", inspection.index.pages[page.guid]!.file);
  const pageJson = JSON.parse(await readFile(pagePath, "utf8")) as Record<string, unknown>;
  const native = new Map(walkControls(pageJson).flatMap((control) => {
    const name = control["name"] ?? (control["baseProperty"] as Record<string, unknown> | undefined)?.["name"];
    return typeof name === "string" ? [[name, control] as const] : [];
  }));
  const layout = native.get("Layout1")!;
  const grid = native.get("Datagrid1")!;
  const styled = native.get("Button1")!;
  const image = native.get("Image1")!;
  layout["insiderObjects"] = [grid, styled, image];
  pageJson["objects"] = [layout];
  grid["data"] = [{ id: "old" }];
  grid["customerGridField"] = { preserved: true };
  styled["styleDataNew"] = "#legacy{color:red}";
  styled["backgroundColor"] = "#333333";
  styled["customerButtonField"] = { preserved: true };
  await writeFile(pagePath, JSON.stringify(pageJson, null, 2));
  inspection = await inspectClientProject(base.rootDir, {
    runtimeBinding: { workspaceId: "workspace", baseRevisionId: "revision" },
  });
  const generated = creativeInput().implementation.runtimeCorrelation!;
  const verifiedExisting = verifyExistingRuntimeCorrelation({
    workspaceId: "workspace", baseRevisionId: "revision", inspection,
    correlations: {
      pages: generated.pages.map((entry) => entry.semanticPageId === "detail"
        ? { source: "uploaded-existing" as const, semanticPageId: entry.semanticPageId, pageGuid: page.guid }
        : { source: "workspace-derived" as const, ...entry }),
      controls: generated.controls.map((entry) => {
        const existingName = entry.semanticControlId === "detail-root" ? "Layout1"
          : entry.semanticControlId === "grid" ? "Datagrid1"
            : entry.semanticControlId === "styled" ? "Button1"
              : entry.semanticControlId === "detail-image" ? "Image1" : undefined;
        return existingName === undefined
          ? { source: "workspace-derived" as const, ...entry }
          : { source: "uploaded-existing" as const, semanticControlId: entry.semanticControlId, instanceName: existingName };
      }),
    },
  });
  const facade = createHmacCreativeBuildFacade(Buffer.alloc(32, 0x42), createCreativeUIImplementationV2Compiler);
  const compilerInput = creativeInput(verifiedExisting);
  const assetBytes = Buffer.from("reviewed creative image bytes");
  const workspaceAssetId = "00000000-0000-4000-8000-000000000001";
  const assetId = workspaceAssetIdToModelId(workspaceAssetId);
  const sha256 = createHash("sha256").update(assetBytes).digest("hex");
  const assetFacts = {
    assetId,
    approvedAsset: {
      workspaceAssetId, targetPath: `project/res/images/${sha256}.png`, mediaType: "image/png" as const,
      sha256, sizeBytes: assetBytes.byteLength,
    },
  };
  if (withImageAsset) {
    const semanticDetail = compilerInput.semanticPlan.pages.find((page) => page.id === "detail")!;
    if (semanticDetail.root.kind !== "layout") throw new Error("detail layout fixture required");
    const semanticImage = semanticDetail.root.children.find((node) => node.id === "detail-image")!;
    if (semanticImage.kind !== "control") throw new Error("image control fixture required");
    semanticImage.properties = [{ name: "src", value: assetId }];
    const detail = compilerInput.implementation.pages.find((page) => page.id === "detail")!;
    if (detail.compatibility !== "native") throw new Error("native fixture required");
    const implementationImage = detail.controls.find((control) => control.id === "detail-image")!;
    implementationImage.assetIds = [assetId];
    implementationImage.nativeProperties.src = assetFacts.approvedAsset.targetPath;
    compilerInput.implementation.sourceSolutionPlanHash = canonicalServerHash(compilerInput.semanticPlan);
  }
  const result = facade.compiler.compiler.compile({
    ...compilerInput,
    ...(withImageAsset ? { verifiedAssets: facade.compiler.assetProofResolver.attestResolvedAssets({
      workspaceId: "workspace", assets: [assetFacts],
    }) } : {}),
  });
  const envelope = facade.authority.sign({
    plan: result.plan, revisionId: "revision", semanticOperations: [], creative: result.trustedCreativePayload,
  });
  const planHash = canonicalChangePlanHash(result.plan);
  const resolved = resolveStoredPlan(JSON.parse(JSON.stringify(envelope)), {
    expectedPlanHash: planHash, expectedRevisionId: "revision",
  }, facade.authority) as ReturnType<typeof resolveStoredPlan> & { creativeMaterialization: unknown };
  return { base, result, resolved, planHash, assetBytes, assetFacts };
}

describe("creative native materializer", () => {
  it("packages an initially hidden overlay with exact compiler-authored open and close visibility scripts", async () => {
    const { result, resolved, planHash } = await signedFixture(0, false, false, false, true);
    const base = await baseWorkspace();
    const pack = createKingClientDomainPack({ nativeAccepted: true });
    const candidate = await pack.patch({
      baseWorkspace: base, changePlan: result.plan, expectedPlanHash: planHash,
      creativeMaterialization: resolved.creativeMaterialization,
    });
    const overlay = result.materialization.controls.find((control) => control.semanticControlId === "review-overlay-root")!;
    const open = result.materialization.controls.find((control) => control.semanticControlId === "styled")!;
    const close = result.materialization.controls.find((control) => control.semanticControlId === "review-overlay-close")!;
    const inspectOverlay = (inspection: Awaited<ReturnType<typeof inspectClientProject>>) => {
      const controls = Object.values(inspection.raw.pages).flatMap((page) => walkControls(page));
      const nativeOverlay = controls.find((control) => control["baseProperty"] !== undefined
        && (control["baseProperty"] as Record<string, unknown>)["name"] === overlay.instanceName)!;
      const nativeByName = (name: string) => controls.find((control) => control["name"] === name)!;
      const visibilityLink = (owner: string, operation: "open-overlay" | "close-overlay") =>
        ((nativeByName(owner)["linkMng"] as { linkList: Array<Record<string, unknown>> }).linkList)
          .find((link) => (link["kfCompilerAction"] as Record<string, unknown> | undefined)?.["operation"] === operation)!;
      expect((nativeOverlay["baseProperty"] as Record<string, unknown>)["visible"]).toBe(false);
      for (const [owner, operation, visible] of [[open.instanceName, "open-overlay", true], [close.instanceName, "close-overlay", false]] as const) {
        const link = visibilityLink(owner, operation);
        expect(link["kfCompilerAction"]).toMatchObject({
          schema: "kf-compiled-action/v2", operation, targetSemanticControlId: overlay.semanticControlId,
          targetInstanceName: overlay.instanceName, visible,
        });
        expect(decodedModules(String(link["script"]))[0]?.body).toBe(`${overlay.instanceName}.Visible = ${String(visible)};\n`);
      }
      return { nativeOverlay, openLink: visibilityLink(open.instanceName, "open-overlay") };
    };
    const inspection = await inspectClientProject(candidate.rootDir);
    inspectOverlay(inspection);
    const report = await pack.validate({
      baseWorkspace: base, candidateWorkspace: candidate, changePlan: result.plan,
      creativeMaterialization: resolved.creativeMaterialization,
    });
    expect(report.status, report.warnings.join("\n")).toBe("pass");
    const imported = await importNativeClientPackage(
      (await pack.package({ workspace: candidate })).bytes,
      await mkdtemp(path.join(tmpdir(), "kf-overlay-import-")),
    );
    inspectOverlay(await inspectClientProject(imported));

    const detailPage = inspection.index.pages[overlay.pageGuid]!;
    const pagePath = path.join(candidate.rootDir, "1.0.0.1", detailPage.file);
    const pageJson = JSON.parse(await readFile(pagePath, "utf8")) as Record<string, unknown>;
    const pageControls = walkControls(pageJson);
    const tamperedOverlay = pageControls.find((control) =>
      (control["baseProperty"] as Record<string, unknown> | undefined)?.["name"] === overlay.instanceName)!;
    (tamperedOverlay["baseProperty"] as Record<string, unknown>)["visible"] = true;
    const tamperedOpen = pageControls.find((control) => control["name"] === open.instanceName)!;
    const tamperedOpenLink = ((tamperedOpen["linkMng"] as { linkList: Array<Record<string, unknown>> }).linkList)
      .find((link) => (link["kfCompilerAction"] as Record<string, unknown> | undefined)?.["operation"] === "open-overlay")!;
    tamperedOpenLink["script"] = String(tamperedOpenLink["script"]).replace("Visible = true", "Visible = false");
    await writeFile(pagePath, JSON.stringify(pageJson, null, 2));
    const tamperedReport = await pack.validate({
      baseWorkspace: base, candidateWorkspace: candidate, changePlan: result.plan,
      creativeMaterialization: resolved.creativeMaterialization,
    });
    expect(tamperedReport.status).toBe("fail");
    expect(tamperedReport.warnings.join("\n")).toMatch(/overlay|compiled script|materialization|hash/i);
  }, 30_000);

  it("loads, indexes, and flushes each creative page once as control count grows", async () => {
    const { result, resolved, planHash } = await signedFixture(993);
    const base = await baseWorkspace();
    const patchCounts = { loads: 0, indexes: 0, flushes: 0 };
    const candidate = await applyClientPatch(base.rootDir, result.plan, {
      planHash, creativeMaterialization: resolved.creativeMaterialization,
      creativeInstrumentation: {
        onPageLoad: () => { patchCounts.loads += 1; },
        onPageIndex: () => { patchCounts.indexes += 1; },
        onPageFlush: () => { patchCounts.flushes += 1; },
      },
    } as ApplyPatchOptions & { creativeMaterialization: unknown; creativeInstrumentation: unknown });
    expect(result.materialization.controls).toHaveLength(1_000);
    expect(patchCounts).toEqual({ loads: 2, indexes: 2, flushes: 2 });

    let validationIndexes = 0;
    const report = await validateClientProject(base.rootDir, candidate, result.plan, {
      skipRoundTrip: true, creativeMaterialization: resolved.creativeMaterialization,
      creativeInstrumentation: { onPageIndex: () => { validationIndexes += 1; } },
    } as Parameters<typeof validateClientProject>[3] & {
      creativeMaterialization: unknown;
      creativeInstrumentation: unknown;
    });
    expect(report.status, report.warnings.join("\n")).toBe("pass");
    expect(validationIndexes).toBe(2);
  }, 120_000);

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
    expect((byName.get(root.instanceName)?.["insiderObjects"] as Array<Record<string, unknown>>)
      .map((control) => control["name"])).toEqual([
      result.materialization.controls.find((control) => control.semanticControlId === "portrait")!.instanceName,
      open.instanceName,
    ]);
    expect(byName.get(open.instanceName)).toMatchObject({
      leftTopPt: { x: open.geometry.x, y: open.geometry.y },
      width: open.geometry.width,
      height: open.geometry.height,
    });
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
    const importedOpen = importedControls.find((control) => control["name"] === open.instanceName)!;
    expect(((importedOpen["linkMng"] as { linkList: Array<Record<string, unknown>> }).linkList)
      .find((entry) => entry["action"] === "navigatePage"))
      .toMatchObject({ pageId: result.materialization.pages.find((page) => page.semanticPageId === "detail")!.pageGuid });
    expect(importedControls.some((control) => control["name"] === grid.instanceName
      && String(((control["linkMng"] as { linkList: Array<Record<string, unknown>> }).linkList)
        .find((entry) => entry["linkId"] === 200024)?.["script"]).includes(`${grid.instanceName}.SetData([])`))).toBe(true);
  }, 30_000);

  it("carries exact signed Datagrid authorization through the verified creative patch path", async () => {
    const { result, resolved, planHash } = await signedFixture(0, true);
    const base = await baseWorkspace();
    expect(resolved.semanticOperations).toHaveLength(1);

    const candidate = await applyClientPatch(base.rootDir, result.plan, {
      planHash,
      semanticOperations: resolved.semanticOperations,
      creativeMaterialization: resolved.creativeMaterialization,
    } as ApplyPatchOptions & { creativeMaterialization: unknown });
    const inspection = await inspectClientProject(candidate.rootDir);
    const grid = result.materialization.controls.find((control) => control.semanticControlId === "grid")!;
    const parent = result.materialization.controls.find((control) => control.semanticControlId === "detail-root")!;
    const controls = Object.values(inspection.raw.pages).flatMap((page) => walkControls(page));
    const native = controls
      .find((control) => control["name"] === grid.instanceName)!;
    const nativeParent = controls.find((control) =>
      (control["baseProperty"] as Record<string, unknown> | undefined)?.["name"] === parent.instanceName)!;
    expect(grid.parentInstanceName).toBe(parent.instanceName);
    expect((nativeParent["insiderObjects"] as Array<Record<string, unknown>>)
      .some((child) => child["name"] === grid.instanceName)).toBe(true);
    expect(native["data"]).toEqual([{ id: "1" }]);
    expect(native["columns"]).toEqual([[expect.objectContaining({ field: "id", title: "编号" })]]);
    expect(native["pageSize"]).toBe(1);
    expect(native).not.toHaveProperty("parentId");
    expect(native).not.toHaveProperty("tableData");
    const report = await validateClientProject(base.rootDir, candidate.rootDir, result.plan, {
      skipRoundTrip: true,
      semanticOperations: resolved.semanticOperations,
      creativeMaterialization: resolved.creativeMaterialization,
    } as Parameters<typeof validateClientProject>[3] & {
      semanticOperations: unknown;
      creativeMaterialization: unknown;
    });
    expect(report.status, report.warnings.join("\n")).toBe("pass");

    const imported = await importNativeClientPackage(
      (await createKingClientDomainPack({ nativeAccepted: true }).package({ workspace: candidate })).bytes,
      await mkdtemp(path.join(tmpdir(), "kf-table-parent-import-")),
    );
    const importedControls = Object.values((await inspectClientProject(imported)).raw.pages)
      .flatMap((page) => walkControls(page));
    const importedGrid = importedControls.find((control) => control["name"] === grid.instanceName)!;
    const importedParent = importedControls.find((control) =>
      (control["baseProperty"] as Record<string, unknown> | undefined)?.["name"] === parent.instanceName)!;
    expect((importedParent["insiderObjects"] as Array<Record<string, unknown>>)
      .some((child) => child["name"] === grid.instanceName)).toBe(true);
    expect(importedGrid).toMatchObject({ data: [{ id: "1" }], pageSize: 1 });
    expect(importedGrid).not.toHaveProperty("parentId");
    expect(importedGrid).not.toHaveProperty("tableData");

    const page = inspection.index.pages[grid.pageGuid]!;
    const pagePath = path.join(candidate.rootDir, "1.0.0.1", page.file);
    const pageJson = JSON.parse(await readFile(pagePath, "utf8")) as Record<string, unknown>;
    const injected = walkControls(pageJson).find((control) => control["name"] === grid.instanceName)!;
    injected["parentId"] = "detail-root";
    injected["tableData"] = { columns: [{ key: "id", label: "伪造" }], rows: [{ id: "forged" }] };
    await writeFile(pagePath, JSON.stringify(pageJson, null, 2));
    const injectedReport = await validateClientProject(base.rootDir, candidate.rootDir, result.plan, {
      skipRoundTrip: true,
      semanticOperations: resolved.semanticOperations,
      creativeMaterialization: resolved.creativeMaterialization,
    } as Parameters<typeof validateClientProject>[3] & {
      semanticOperations: unknown;
      creativeMaterialization: unknown;
    });
    expect(injectedReport.status).toBe("fail");
    expect(injectedReport.warnings.join("\n")).toMatch(/parentId|tableData|native candidate|materialization/i);
  });

  it("accepts compiler geometry that lands exactly on a fractional parent boundary", async () => {
    const { result, resolved, planHash } = await signedFixture(0, false, true);
    const base = await baseWorkspace();

    const candidate = await applyClientPatch(base.rootDir, result.plan, {
      planHash,
      semanticOperations: resolved.semanticOperations,
      creativeMaterialization: resolved.creativeMaterialization,
    } as ApplyPatchOptions & { creativeMaterialization: unknown });
    const report = await validateClientProject(base.rootDir, candidate.rootDir, result.plan, {
      skipRoundTrip: true,
      creativeMaterialization: resolved.creativeMaterialization,
    } as Parameters<typeof validateClientProject>[3] & { creativeMaterialization: unknown });
    expect(report.status, report.warnings.join("\n")).toBe("pass");
  });

  it("materializes a child beyond a compiler-signed scroll viewport without relaxing ordinary parent bounds", async () => {
    const { result, resolved, planHash } = await signedFixture(0, false, false, true);
    const base = await baseWorkspace();

    const candidate = await applyClientPatch(base.rootDir, result.plan, {
      planHash,
      semanticOperations: resolved.semanticOperations,
      creativeMaterialization: resolved.creativeMaterialization,
    } as ApplyPatchOptions & { creativeMaterialization: unknown });
    const report = await validateClientProject(base.rootDir, candidate.rootDir, result.plan, {
      skipRoundTrip: true,
      creativeMaterialization: resolved.creativeMaterialization,
    } as Parameters<typeof validateClientProject>[3] & { creativeMaterialization: unknown });
    expect(report.status, report.warnings.join("\n")).toBe("pass");
  });

  it("reports signed geometry and native sibling z-order tampering explicitly", async () => {
    const { result, resolved, planHash } = await signedFixture();
    const base = await baseWorkspace();
    const pack = createKingClientDomainPack({ nativeAccepted: true });
    const candidate = await pack.patch({
      baseWorkspace: base, changePlan: result.plan, expectedPlanHash: planHash,
      creativeMaterialization: resolved.creativeMaterialization,
    });
    const open = result.materialization.controls.find((control) => control.semanticControlId === "open")!;
    const root = result.materialization.controls.find((control) => control.semanticControlId === "root")!;
    const inspection = await inspectClientProject(candidate.rootDir);
    const home = inspection.raw.pages[open.pageGuid];
    const byInstanceName = (control: Record<string, unknown>) => control["name"]
      ?? (control["baseProperty"] as Record<string, unknown> | undefined)?.["name"];
    const nativeOpen = walkControls(home).find((control) => byInstanceName(control) === open.instanceName)!;
    (nativeOpen["leftTopPt"] as Record<string, unknown>)["x"] = open.geometry.x + 1;
    const nativeRoot = walkControls(home).find((control) => byInstanceName(control) === root.instanceName)!;
    (nativeRoot["insiderObjects"] as unknown[]).reverse();
    await writeFile(path.join(candidate.rootDir, "1.0.0.1", inspection.index.pages[open.pageGuid]!.file), JSON.stringify(home));

    const report = await validateClientProject(base.rootDir, candidate.rootDir, result.plan, {
      skipRoundTrip: true, creativeMaterialization: resolved.creativeMaterialization,
    } as Parameters<typeof validateClientProject>[3] & { creativeMaterialization: unknown });
    expect(report.status).toBe("fail");
    expect(report.warnings.join("\n")).toMatch(/creative geometry mismatch: open/);
    expect(report.warnings.join("\n")).toMatch(/creative z-order mismatch/);
  }, 30_000);

  it("validates exact creative scope in a flat-root native workspace without ./ path aliases", async () => {
    const { result, resolved, planHash } = await signedFixture();
    const versioned = await baseWorkspace();
    const flatRoot = await mkdtemp(path.join(tmpdir(), "kf-creative-flat-root-"));
    await cp(path.join(versioned.rootDir, "1.0.0.1"), flatRoot, { recursive: true });
    const base = { ...versioned, rootDir: flatRoot, path: flatRoot };
    const pack = createKingClientDomainPack({ nativeAccepted: true });
    const candidate = await pack.patch({
      baseWorkspace: base, changePlan: result.plan, expectedPlanHash: planHash,
      creativeMaterialization: resolved.creativeMaterialization,
    });
    const report = await validateClientProject(base.rootDir, candidate.rootDir, result.plan, {
      skipRoundTrip: true, creativeMaterialization: resolved.creativeMaterialization,
    } as Parameters<typeof validateClientProject>[3] & { creativeMaterialization: unknown });
    expect(report.status, report.warnings.join("\n")).toBe("pass");
    expect(report.warnings.join("\n")).not.toContain('"./');
  }, 30_000);

  it("fails closed without the HMAC-verified creative materialization and detects marker tampering", async () => {
    const { result, resolved, planHash, envelope, facade } = await signedFixture();
    const creativeMaterialization = resolved.creativeMaterialization!;
    expect(Object.keys(creativeMaterialization)).toEqual([]);
    expect(creativeMaterialization).not.toBe(envelope);
    const verifiedEnvelope = facade.authority.verify(JSON.parse(JSON.stringify(envelope)), {
      expectedPlanHash: planHash, expectedRevisionId: "revision",
    });
    expect(() => resolveStoredPlan(envelope, {
      expectedPlanHash: planHash, expectedRevisionId: "revision",
    }, { verify: () => verifiedEnvelope })).toThrow(/authority|verifier|UNVERIFIED/i);
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

  it.each([
    ["extra unsigned control", (page: Record<string, unknown>, controls: Map<string, Record<string, unknown>>) => {
      const portrait = structuredClone(controls.get("portrait")!);
      portrait["name"] = "UnsignedImage1";
      portrait["guid"] = "00000000-0000-4000-8000-000000000099";
      (page["objects"] as unknown[]).push(portrait);
    }],
    ["extra unmarked executable action", (_page: Record<string, unknown>, controls: Map<string, Record<string, unknown>>, detailGuid: string) => {
      const links = (controls.get("open")!["linkMng"] as { linkList: Array<Record<string, unknown>> }).linkList;
      links.push({ action: "navigatePage", pageId: detailGuid, enable: true, name: "legacyExtra" });
    }],
    ["deleted unrelated legacy handler", (_page: Record<string, unknown>, controls: Map<string, Record<string, unknown>>) => {
      const links = (controls.get("portrait")!["linkMng"] as { linkList: Array<Record<string, unknown>> }).linkList;
      links.pop();
    }],
    ["configureData legacy drift", (_page: Record<string, unknown>, controls: Map<string, Record<string, unknown>>) => {
      controls.get("open")!["configureData"] = "legacyDrift();";
    }],
  ] as const)("rejects %s outside the exact expected native candidate", async (_label, mutate) => {
    const { result, resolved, planHash } = await signedFixture();
    const base = await baseWorkspace();
    const candidate = await applyClientPatch(base.rootDir, result.plan, {
      planHash, creativeMaterialization: resolved.creativeMaterialization,
    } as ApplyPatchOptions & { creativeMaterialization: unknown });
    const inspection = await inspectClientProject(candidate.rootDir);
    const home = result.materialization.pages.find((page) => page.semanticPageId === "home")!;
    const detail = result.materialization.pages.find((page) => page.semanticPageId === "detail")!;
    const pagePath = path.join(candidate.rootDir, "1.0.0.1", inspection.index.pages[home.pageGuid]!.file);
    const pageJson = JSON.parse(await readFile(pagePath, "utf8")) as Record<string, unknown>;
    const controls = new Map(walkControls(pageJson).flatMap((control) => {
      const name = control["name"] ?? (control["baseProperty"] as Record<string, unknown> | undefined)?.["name"];
      const semantic = result.materialization.controls.find((entry) => entry.instanceName === name)?.semanticControlId;
      return semantic === undefined ? [] : [[semantic, control] as const];
    }));
    mutate(pageJson, controls, detail.pageGuid);
    await writeFile(pagePath, JSON.stringify(pageJson, null, 2));
    const report = await validateClientProject(base.rootDir, candidate, result.plan, {
      skipRoundTrip: true, creativeMaterialization: resolved.creativeMaterialization,
    } as Parameters<typeof validateClientProject>[3] & { creativeMaterialization: unknown });
    expect(report.status, report.warnings.join("\n")).toBe("fail");
  }, 30_000);

  it("rejects metadata drift on a signed page-manager entry", async () => {
    const { result, resolved, planHash } = await signedFixture();
    const base = await baseWorkspace();
    const candidate = await applyClientPatch(base.rootDir, result.plan, {
      planHash, creativeMaterialization: resolved.creativeMaterialization,
    } as ApplyPatchOptions & { creativeMaterialization: unknown });
    const managerPath = path.join(candidate.rootDir, "1.0.0.1", "project/pageManager.json");
    const manager = JSON.parse(await readFile(managerPath, "utf8")) as { Pages: Array<Record<string, unknown>> };
    const home = result.materialization.pages.find((page) => page.semanticPageId === "home")!;
    manager.Pages.find((page) => page["id"] === home.pageGuid)!["user"] = "attacker";
    await writeFile(managerPath, JSON.stringify(manager, null, 2));
    const report = await validateClientProject(base.rootDir, candidate, result.plan, {
      skipRoundTrip: true, creativeMaterialization: resolved.creativeMaterialization,
    } as Parameters<typeof validateClientProject>[3] & { creativeMaterialization: unknown });
    expect(report.status, report.warnings.join("\n")).toBe("fail");
  }, 30_000);

  it("applies signed style/data to uploaded controls while preserving unrelated native bytes", async () => {
    const { base, result, resolved, planHash } = await existingSignedFixture();
    const patchCounts = { loads: 0, indexes: 0, flushes: 0 };
    const candidate = await applyClientPatch(base.rootDir, result.plan, {
      planHash, creativeMaterialization: resolved.creativeMaterialization,
      creativeInstrumentation: {
        onPageLoad: () => { patchCounts.loads += 1; },
        onPageIndex: () => { patchCounts.indexes += 1; },
        onPageFlush: () => { patchCounts.flushes += 1; },
      },
    } as ApplyPatchOptions & { creativeMaterialization: unknown; creativeInstrumentation: unknown });
    expect(patchCounts).toEqual({ loads: 2, indexes: 2, flushes: 2 });
    const inspection = await inspectClientProject(candidate.rootDir);
    const detail = result.materialization.pages.find((page) => page.semanticPageId === "detail")!;
    const pageJson = inspection.raw.pages[detail.pageGuid];
    const native = new Map(walkControls(pageJson).flatMap((control) => {
      const name = control["name"] ?? (control["baseProperty"] as Record<string, unknown> | undefined)?.["name"];
      return typeof name === "string" ? [[name, control] as const] : [];
    }));
    expect(native.get("Datagrid1")).toMatchObject({
      data: [{ id: "1" }], customerGridField: { preserved: true },
    });
    expect(native.get("Button1")).toMatchObject({
      backgroundColor: "#0b6bcb", customerButtonField: { preserved: true },
    });
    expect(String(native.get("Button1")!["styleDataNew"])).toContain("#legacy{color:red}");
    expect(String(native.get("Button1")!["styleDataNew"])).toContain("#domId .el-button{border-radius:8px}");

    let validationIndexes = 0;
    const report = await validateClientProject(base.rootDir, candidate, result.plan, {
      skipRoundTrip: true, creativeMaterialization: resolved.creativeMaterialization,
      creativeInstrumentation: { onPageIndex: () => { validationIndexes += 1; } },
    } as Parameters<typeof validateClientProject>[3] & {
      creativeMaterialization: unknown;
      creativeInstrumentation: unknown;
    });
    expect(report.status, report.warnings.join("\n")).toBe("pass");
    expect(validationIndexes).toBe(2);
  }, 30_000);

  it("round-trips a Worker-resolved image and validates uploaded src as the native basename", async () => {
    const { base, result, resolved, planHash, assetBytes, assetFacts } = await existingSignedFixture(true);
    const workerAssets = await resolveBuildAssets({
      tenantId: "tenant", workspaceId: "workspace",
      prisma: { workspaceAsset: { findMany: async () => [{
        id: assetFacts.approvedAsset.workspaceAssetId, type: "image",
        mediaType: assetFacts.approvedAsset.mediaType, storageKey: "creative-image",
        sha256: assetFacts.approvedAsset.sha256, sizeBytes: assetFacts.approvedAsset.sizeBytes,
      }] } },
      storage: { open: async () => Readable.from([assetBytes]) },
      bindings: result.plan.assetBindings!,
    });
    const pack = createKingClientDomainPack({ nativeAccepted: true });
    const candidate = await pack.patch({
      baseWorkspace: base, changePlan: result.plan, expectedPlanHash: planHash, assets: workerAssets,
      creativeMaterialization: resolved.creativeMaterialization,
    });
    const imageCorrelation = result.materialization.controls.find((control) => control.semanticControlId === "detail-image")!;
    const inspection = await inspectClientProject(candidate.rootDir);
    const image = walkControls(inspection.raw.pages[imageCorrelation.pageGuid])
      .find((control) => control["name"] === imageCorrelation.instanceName)!;
    expect(image["src"]).toBe(path.basename(assetFacts.approvedAsset.targetPath));
    expect(await readFile(path.join(candidate.rootDir, "1.0.0.1", assetFacts.approvedAsset.targetPath)))
      .toEqual(assetBytes);
    const report = await pack.validate({
      baseWorkspace: base, candidateWorkspace: candidate, changePlan: result.plan, assets: workerAssets,
      creativeMaterialization: resolved.creativeMaterialization,
    });
    expect(report.status, report.warnings.join("\n")).toBe("pass");
    const imported = await importNativeClientPackage(
      (await pack.package({ workspace: candidate })).bytes,
      await mkdtemp(path.join(tmpdir(), "kf-creative-image-import-")),
    );
    const importedInspection = await inspectClientProject(imported);
    const importedImage = walkControls(importedInspection.raw.pages[imageCorrelation.pageGuid])
      .find((control) => control["name"] === imageCorrelation.instanceName)!;
    expect(importedImage["src"]).toBe(path.basename(assetFacts.approvedAsset.targetPath));
    expect(await readFile(path.join(imported, "1.0.0.1", assetFacts.approvedAsset.targetPath))).toEqual(assetBytes);

    await writeFile(
      path.join(candidate.rootDir, "1.0.0.1", assetFacts.approvedAsset.targetPath),
      Buffer.from("tampered creative image bytes"),
    );
    const tamperedReport = await pack.validate({
      baseWorkspace: base, candidateWorkspace: candidate, changePlan: result.plan, assets: workerAssets,
      creativeMaterialization: resolved.creativeMaterialization,
    });
    expect(tamperedReport.status).toBe("fail");
    expect(tamperedReport.warnings.join("\n")).toMatch(/creative asset bytes mismatch/);
  }, 30_000);

  it("validates signed interactions after an image rewrite canonicalizes the containing page JSON", async () => {
    const compilerInput = creativeInput();
    const assetBytes = Buffer.from("reviewed generated-page image bytes");
    const workspaceAssetId = "00000000-0000-4000-8000-000000000002";
    const assetId = workspaceAssetIdToModelId(workspaceAssetId);
    const sha256 = createHash("sha256").update(assetBytes).digest("hex");
    const assetFacts = {
      assetId,
      approvedAsset: {
        workspaceAssetId,
        targetPath: `project/res/images/${sha256}.png`,
        mediaType: "image/png" as const,
        sha256,
        sizeBytes: assetBytes.byteLength,
      },
    };
    const semanticHome = compilerInput.semanticPlan.pages.find((page) => page.id === "home")!;
    if (semanticHome.root.kind !== "layout") throw new Error("home layout fixture required");
    const semanticImage = semanticHome.root.children.find((node) => node.id === "portrait")!;
    if (semanticImage.kind !== "control") throw new Error("image control fixture required");
    semanticImage.properties = [{ name: "src", value: assetId }];
    const implementationHome = compilerInput.implementation.pages.find((page) => page.id === "home")!;
    if (implementationHome.compatibility !== "native") throw new Error("native home fixture required");
    const implementationImage = implementationHome.controls.find((control) => control.id === "portrait")!;
    implementationImage.assetIds = [assetId];
    implementationImage.nativeProperties.src = assetFacts.approvedAsset.targetPath;
    compilerInput.implementation.sourceSolutionPlanHash = canonicalServerHash(compilerInput.semanticPlan);

    const facade = createHmacCreativeBuildFacade(Buffer.alloc(32, 0x43), createCreativeUIImplementationV2Compiler);
    const result = facade.compiler.compiler.compile({
      ...compilerInput,
      verifiedAssets: facade.compiler.assetProofResolver.attestResolvedAssets({
        workspaceId: "workspace",
        assets: [assetFacts],
      }),
    });
    const envelope = facade.authority.sign({
      plan: result.plan,
      revisionId: "revision",
      semanticOperations: result.semanticOperations,
      creative: result.trustedCreativePayload,
    });
    const planHash = canonicalChangePlanHash(result.plan);
    const resolved = resolveStoredPlan(JSON.parse(JSON.stringify(envelope)), {
      expectedPlanHash: planHash,
      expectedRevisionId: "revision",
    }, facade.authority) as ReturnType<typeof resolveStoredPlan> & { creativeMaterialization: unknown };
    const workerAssets = await resolveBuildAssets({
      tenantId: "tenant",
      workspaceId: "workspace",
      prisma: { workspaceAsset: { findMany: async () => [{
        id: workspaceAssetId,
        type: "image",
        mediaType: "image/png",
        storageKey: "generated-page-image",
        sha256,
        sizeBytes: assetBytes.byteLength,
      }] } },
      storage: { open: async () => Readable.from([assetBytes]) },
      bindings: result.plan.assetBindings!,
    });
    const base = await baseWorkspace();
    const pack = createKingClientDomainPack({ nativeAccepted: true });
    const candidate = await pack.patch({
      baseWorkspace: base,
      changePlan: result.plan,
      expectedPlanHash: planHash,
      assets: workerAssets,
      creativeMaterialization: resolved.creativeMaterialization,
    });

    const report = await pack.validate({
      baseWorkspace: base,
      candidateWorkspace: candidate,
      changePlan: result.plan,
      assets: workerAssets,
      creativeMaterialization: resolved.creativeMaterialization,
    });

    expect(report.status, report.warnings.join("\n")).toBe("pass");
  }, 30_000);
});
