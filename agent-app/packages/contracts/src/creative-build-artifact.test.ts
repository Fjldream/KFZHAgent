import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import {
  CreativeBuildArtifactSchema,
  TrustedNativeMaterializationSchema,
  canonicalCreativeBuildArtifactHash,
  canonicalTrustedNativeMaterializationHash,
  canonicalServerHash,
  canonicalChangePlanHash,
  canonicalServerPlanSigningBytes,
  compareCreativeIdentifiers,
  validateCreativeArtifactMaterializationProjection,
  validateServerPlanEnvelopeData,
} from "./index.js";

const blueprint = {
  schema: "kf-design-plan/v3", displayName: "创意工程", objective: "完成页面交互", audiences: ["客户"], scenarios: ["查看详情"],
  pages: [{ id: "bp-home", title: "首页", purpose: "展示内容", readingOrder: ["hero"], regions: [{
    id: "hero", purpose: "引导查看", semanticRoles: ["hero"], dataShape: "content", density: "comfortable",
    importance: "primary", content: ["欢迎"], sampleData: [], interactions: ["打开详情"], states: ["ready"], visualIntent: "清晰",
  }] }],
  journeys: [{ id: "open-detail", actor: "客户", goal: "查看详情", steps: [{ pageId: "bp-home", regionId: "hero", action: "点击", result: "显示详情" }], completion: "详情可见" }],
  visualDirection: { tone: "专业", colors: ["蓝色"], typography: "清晰", spacingAndSurfaces: "舒适" },
  acceptanceScenarios: ["详情可见"], openQuestions: [],
};

const candidates = {
  schema: "kf-capability-candidates/v1", knowledgeCatalogVersion: "1.0.0", blueprintHash: canonicalServerHash(blueprint),
  regions: [{ pageId: "bp-home", regionId: "hero",
    controls: ["button", "text", "image"].map((id, index) => ({ id, score: 3 - index, reasons: ["适用"], limitations: [], knowledgeVersion: "1.0.0" })),
    layouts: [{ id: "layout.4", score: 3, reasons: ["适用"], limitations: [], knowledgeVersion: "1.0.0" }],
    recipes: [{ id: "content.hero", score: 3, reasons: ["适用"], limitations: [], knowledgeVersion: "1.0.0" }],
  }],
  detailedCapabilityIds: ["button", "image", "layout.4", "text"], generatedAtPolicy: "deterministic-no-timestamp",
};

const plan = {
  schema: "kf-solution-implementation/v1", projectKey: "creative", blueprintHash: canonicalServerHash(blueprint),
  candidateBundleHash: canonicalServerHash(candidates),
  theme: { background: "#fff", surface: "#fff", primary: "#123456", accent: "#654321", textPrimary: "#111", textSecondary: "#555", fontFamily: "Inter", spacingUnit: 8, radiusScale: { small: 4, medium: 8, large: 16 } },
  roleStyles: [{ role: "action", declarations: {}, states: {} }], mockData: [], localState: [], overlays: [], scripts: [],
  pages: [{ id: "home", title: "首页", purpose: "首页", canvas: "desktop", sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["hero"], initialStateIds: [], root: {
    id: "open", kind: "control", capabilityId: "button", content: "打开", properties: [], tabIds: [], styleRole: "action", sourceBlueprintRegionIds: ["hero"],
    intent: { importance: "primary", visualWeight: 3, readingOrder: 0, density: "comfortable", groupWith: [], width: { mode: "fixed", value: 120 }, height: { mode: "fixed", value: 40 }, align: "start" },
    eventBindings: [{ semanticEvent: "click", actionIds: ["navigate"] }],
  } }],
  actions: [{ id: "navigate", kind: "navigate-page", targetPageId: "home", afterActionIds: [], journeyStepRefs: [{ journeyId: "open-detail", stepIndex: 0 }] }],
};

const implementation = {
  schema: "kf-ui-implementation/v2", compatibility: "native", sourceSolutionPlanHash: canonicalServerHash(plan),
  theme: plan.theme, compiledRoleStyles: {},
  pages: [{ compatibility: "native", id: "home", width: 1280, height: 720, sourceBlueprintPageId: "bp-home", controls: [{
    id: "open", role: "action", capabilityId: "button", content: "打开", depth: 0, zIndex: 0,
    geometry: { x: 10, y: 10, width: 120, height: 40 }, nativeProperties: {}, sourceSolutionNodeId: "open",
    sourceBlueprintPageId: "bp-home", sourceBlueprintRegionIds: ["hero"],
    eventBindings: [{ id: "kf$binding:navigate", ownerInstanceName: "Button1", kfEvent: "onClick", linkId: 200001, phase: "event", scriptModuleIds: [], nativeActionIds: ["kf$action:navigate"] }],
  }] }],
  compiledActions: [{ id: "kf$action:navigate", sourceActionId: "navigate", ownerInstanceName: "Button1", kind: "navigate-page", targetPageGuid: "k00000000-0000-4000-8000-000000000001" }],
  compiledScripts: [], runtimeCorrelation: { controls: [{ semanticControlId: "open", instanceName: "Button1" }], pages: [{ semanticPageId: "home", pageGuid: "k00000000-0000-4000-8000-000000000001" }] },
};

function artifact() {
  const evidence = {
    pages: [{ source: "workspace-derived" as const, semanticPageId: "home", pageGuid: "k00000000-0000-4000-8000-000000000001" }],
    controls: [{ source: "workspace-derived" as const, semanticControlId: "open", semanticPageId: "home", pageGuid: "k00000000-0000-4000-8000-000000000001", instanceName: "Button1" }],
    stylesData: [{ semanticControlId: "open", structuredStyle: { role: "action", declarations: {}, states: {} }, approvedAssets: [] }],
    verifiedAssets: [],
  };
  const hashes = {
    blueprintHash: canonicalServerHash(blueprint), candidateBundleHash: canonicalServerHash(candidates),
    semanticPlanHash: canonicalServerHash(plan), implementationHash: canonicalServerHash(implementation), evidenceHash: canonicalServerHash(evidence),
  };
  return { schema: "kf-creative-build-artifact/v1", blueprint, candidateBundle: candidates, semanticPlan: plan, implementation,
    evidence, compilerVersion: "1.0.0", evidenceVersion: "1.0.0", hashes };
}

function materialization() {
  return {
    schema: "kf-trusted-native-materialization/v1", workspaceId: "workspace", baseRevisionId: "revision",
    creativeArtifactHash: canonicalCreativeBuildArtifactHash(CreativeBuildArtifactSchema.parse(artifact())),
    implementationHash: canonicalServerHash(implementation),
    pages: [{ source: "workspace-derived", semanticPageId: "home", pageGuid: "k00000000-0000-4000-8000-000000000001", width: 1280, height: 720, order: 0 }],
    controls: [{ source: "workspace-derived", semanticControlId: "open", sourceSolutionNodeId: "open", semanticPageId: "home", pageGuid: "k00000000-0000-4000-8000-000000000001", instanceName: "Button1", capabilityId: "button", depth: 0, zIndex: 0, order: 0, geometry: { x: 10, y: 10, width: 120, height: 40 }, nativeProperties: {}, content: "打开" }],
    stylesData: [{ semanticControlId: "open", instanceName: "Button1", structuredStyle: { role: "action", declarations: {}, states: {} }, compiledStyle: { nativeFields: {}, cssFragments: [], warnings: [] }, approvedAssets: [] }],
    interactions: { actions: implementation.compiledActions, scripts: [], eventBindings: implementation.pages[0]!.controls[0]!.eventBindings },
  };
}

describe("creative build contracts", () => {
  it("uses one code-point comparator for creative identity ordering", () => {
    expect(compareCreativeIdentifiers("A", "a")).toBeLessThan(0);
    expect(["a_", "😀", "a", "A", "a-", "á"].sort(compareCreativeIdentifiers))
      .toEqual(["A", "a", "a-", "a_", "á", "😀"]);
  });

  it("binds every exact creative input to canonical hashes", () => {
    const parsed = CreativeBuildArtifactSchema.parse(artifact());
    expect(canonicalCreativeBuildArtifactHash(parsed)).toMatch(/^[a-f0-9]{64}$/);
    const tampered = structuredClone(artifact()); tampered.implementation.pages[0]!.width += 1;
    expect(CreativeBuildArtifactSchema.safeParse(tampered).success).toBe(false);
  });

  it("keeps trusted native sections strict and hash-sensitive to CSS, actions and scripts", () => {
    const base = materialization();
    const parsed = TrustedNativeMaterializationSchema.parse(base);
    const first = canonicalTrustedNativeMaterializationHash(parsed);
    const css = structuredClone(base); (css.stylesData[0]!.compiledStyle.cssFragments as Array<unknown>)
      .push({ selectorToken: "root", state: "normal", declarations: { textColor: "#fff" } });
    expect(canonicalTrustedNativeMaterializationHash(TrustedNativeMaterializationSchema.parse(css))).not.toBe(first);
    const action = structuredClone(base); action.interactions.actions[0]!.targetPageGuid = "k00000000-0000-4000-8000-000000000002";
    expect(canonicalTrustedNativeMaterializationHash(TrustedNativeMaterializationSchema.parse(action))).not.toBe(first);
    const script = structuredClone(base); const source = "Button1.Click();\n"; const scriptId = "kf$script:refresh";
    (script.interactions.scripts as Array<unknown>).push({ id: scriptId, sourceScriptId: "refresh", placement: "event", ownerInstanceName: "Button1", instanceReferences: [{ semanticId: "open", instanceName: "Button1" }], pageReferences: [], source, sourceHash: createHash("sha256").update(source).digest("hex") });
    (script.interactions.eventBindings[0]!.scriptModuleIds as string[]) = [scriptId];
    const scriptHash = canonicalTrustedNativeMaterializationHash(TrustedNativeMaterializationSchema.parse(script));
    expect(scriptHash).not.toBe(first);
    const basePlan = { schema: "kf-change-plan/v1" as const, workspaceId: "workspace", operations: [], creative: { artifactHash: base.creativeArtifactHash, materializationHash: first } };
    expect(canonicalChangePlanHash({ ...basePlan, creative: { ...basePlan.creative, materializationHash: scriptHash } })).not.toBe(canonicalChangePlanHash(basePlan));
    const forgedExisting = structuredClone(base);
    forgedExisting.pages[0]!.source = "uploaded-existing";
    forgedExisting.controls[0]!.source = "uploaded-existing";
    Object.assign(forgedExisting.controls[0]!, { nativeGuid: "arbitrary-guid", existingDeltas: [{ path: "/forbidden", value: true }] });
    expect(() => validateCreativeArtifactMaterializationProjection(artifact(), forgedExisting)).toThrow(/pages|controls/);
  });

  it("rejects substituted uploaded native identity, partial deltas, and asset facts", () => {
    const uploadedArtifact = structuredClone(CreativeBuildArtifactSchema.parse(artifact()));
    uploadedArtifact.evidence.pages[0]!.source = "uploaded-existing";
    const runtimeEvidence = uploadedArtifact.evidence.controls[0]!;
    runtimeEvidence.source = "uploaded-existing";
    const completeDeltas = [{ path: "/x", value: 10 }, { path: "/y", value: 10 }, { path: "/width", value: 120 }, { path: "/height", value: 40 }, { path: "/text", value: "打开" }];
    Object.assign(runtimeEvidence, { nativeGuid: "native-button-guid", existingDeltas: completeDeltas });
    uploadedArtifact.hashes.evidenceHash = canonicalServerHash(uploadedArtifact.evidence);
    const uploadedMaterialization = TrustedNativeMaterializationSchema.parse(materialization());
    uploadedMaterialization.pages[0]!.source = "uploaded-existing";
    uploadedMaterialization.controls[0]!.source = "uploaded-existing";
    Object.assign(uploadedMaterialization.controls[0]!, { nativeGuid: "native-button-guid", existingDeltas: structuredClone(completeDeltas) });
    uploadedMaterialization.creativeArtifactHash = canonicalCreativeBuildArtifactHash(uploadedArtifact);
    expect(() => validateCreativeArtifactMaterializationProjection(uploadedArtifact, uploadedMaterialization)).not.toThrow();
    const forgedGuid = structuredClone(uploadedMaterialization); forgedGuid.controls[0]!.nativeGuid = "substituted-guid";
    expect(() => validateCreativeArtifactMaterializationProjection(uploadedArtifact, forgedGuid)).toThrow(/controls/);
    const partial = structuredClone(uploadedMaterialization); partial.controls[0]!.existingDeltas!.pop();
    expect(() => validateCreativeArtifactMaterializationProjection(uploadedArtifact, partial)).toThrow(/controls/);

    const assetArtifact = structuredClone(CreativeBuildArtifactSchema.parse(artifact()));
    const asset = { assetId: "asset-1", approvedAsset: { workspaceAssetId: "00000000-0000-4000-8000-000000000001", targetPath: `project/res/images/${"a".repeat(64)}.png`, mediaType: "image/png" as const, sha256: "a".repeat(64), sizeBytes: 10 } };
    assetArtifact.evidence.verifiedAssets = [asset]; assetArtifact.evidence.stylesData[0]!.approvedAssets = [asset];
    assetArtifact.hashes.evidenceHash = canonicalServerHash(assetArtifact.evidence);
    const assetMaterialization = TrustedNativeMaterializationSchema.parse(materialization()); assetMaterialization.stylesData[0]!.approvedAssets = [asset];
    assetMaterialization.creativeArtifactHash = canonicalCreativeBuildArtifactHash(assetArtifact);
    expect(() => validateCreativeArtifactMaterializationProjection(assetArtifact, assetMaterialization)).not.toThrow();
    const substituted = structuredClone(assetMaterialization); substituted.stylesData[0]!.approvedAssets[0]!.approvedAsset.sizeBytes += 1;
    expect(() => validateCreativeArtifactMaterializationProjection(assetArtifact, substituted)).toThrow(/styles-data|approved assets/);
  });

  it("independently rejects synchronized forbidden deltas and duplicate asset dictionaries", () => {
    const synchronizedArtifact = structuredClone(CreativeBuildArtifactSchema.parse(artifact()));
    synchronizedArtifact.evidence.pages[0]!.source = "uploaded-existing";
    Object.assign(synchronizedArtifact.evidence.controls[0]!, {
      source: "uploaded-existing", nativeGuid: "native-button-guid", existingDeltas: [{ path: "/forbidden", value: true }],
    });
    synchronizedArtifact.hashes.evidenceHash = canonicalServerHash(synchronizedArtifact.evidence);
    const synchronizedMaterialization = TrustedNativeMaterializationSchema.parse(materialization());
    synchronizedMaterialization.pages[0]!.source = "uploaded-existing";
    Object.assign(synchronizedMaterialization.controls[0]!, {
      source: "uploaded-existing", nativeGuid: "native-button-guid", existingDeltas: [{ path: "/forbidden", value: true }],
    });
    synchronizedMaterialization.creativeArtifactHash = canonicalCreativeBuildArtifactHash(synchronizedArtifact);
    expect(() => validateCreativeArtifactMaterializationProjection(synchronizedArtifact, synchronizedMaterialization)).toThrow(/existing delta/);

    const synchronizedMutations = [
      [{ path: "/x", value: 10 }, { path: "/y", value: 10 }, { path: "/width", value: 120 }, { path: "/height", value: 40 }],
      [{ path: "/x", value: 999 }, { path: "/y", value: 10 }, { path: "/width", value: 120 }, { path: "/height", value: 40 }, { path: "/text", value: "打开" }],
      [{ path: "/x", value: 10 }, { path: "/x", value: 10 }, { path: "/y", value: 10 }, { path: "/width", value: 120 }, { path: "/height", value: 40 }, { path: "/text", value: "打开" }],
    ];
    for (const deltas of synchronizedMutations) {
      const evidenceMutation = structuredClone(synchronizedArtifact); evidenceMutation.evidence.controls[0]!.existingDeltas = deltas;
      evidenceMutation.hashes.evidenceHash = canonicalServerHash(evidenceMutation.evidence);
      const materializationMutation = structuredClone(synchronizedMaterialization); materializationMutation.controls[0]!.existingDeltas = structuredClone(deltas);
      materializationMutation.creativeArtifactHash = canonicalCreativeBuildArtifactHash(evidenceMutation);
      expect(() => validateCreativeArtifactMaterializationProjection(evidenceMutation, materializationMutation)).toThrow(/existing delta/);
    }

    const duplicate = structuredClone(CreativeBuildArtifactSchema.parse(artifact()));
    const asset = { assetId: "asset-1", approvedAsset: { workspaceAssetId: "00000000-0000-4000-8000-000000000001", targetPath: `project/res/images/${"a".repeat(64)}.png`, mediaType: "image/png" as const, sha256: "a".repeat(64), sizeBytes: 10 } };
    duplicate.evidence.verifiedAssets = [asset, structuredClone(asset)];
    duplicate.hashes.evidenceHash = canonicalServerHash(duplicate.evidence);
    expect(CreativeBuildArtifactSchema.safeParse(duplicate).success).toBe(false);
  });

  it("binds a complete creative payload into envelope validation and signing bytes while keeping legacy compatible", () => {
    const creativeArtifact = CreativeBuildArtifactSchema.parse(artifact());
    const trustedNativeMaterialization = TrustedNativeMaterializationSchema.parse(materialization());
    const creativeArtifactHash = canonicalCreativeBuildArtifactHash(creativeArtifact);
    const nativeMaterializationHash = canonicalTrustedNativeMaterializationHash(trustedNativeMaterialization);
    const plan = { schema: "kf-change-plan/v1" as const, workspaceId: "workspace", operations: [
      { op: "create" as const, entityType: "page", entityId: "home", properties: { width: 1280, height: 720 } },
      { op: "create" as const, entityType: "control", entityId: "open", properties: { semanticPageId: "home", type: "button", x: 10, y: 10, width: 120, height: 40, zIndex: 0, text: "打开" } },
    ], creative: { artifactHash: creativeArtifactHash, materializationHash: nativeMaterializationHash } };
    const envelope = {
      schema: "kf-server-plan-envelope/v1" as const, plan, planHash: canonicalChangePlanHash(plan), revisionId: "revision", semanticOperations: [],
      creativeArtifact, creativeArtifactHash, trustedNativeMaterialization, nativeMaterializationHash, signature: "0".repeat(64),
    };
    expect(validateServerPlanEnvelopeData(envelope)).toEqual(envelope);
    const legacy = { schema: "kf-server-plan-envelope/v1" as const, plan: { schema: "kf-change-plan/v1" as const, workspaceId: "workspace", operations: [] }, planHash: "", revisionId: "revision", semanticOperations: [], signature: "0".repeat(64) };
    legacy.planHash = canonicalChangePlanHash(legacy.plan);
    expect(validateServerPlanEnvelopeData(legacy)).toEqual(legacy);
    expect(() => validateServerPlanEnvelopeData(legacy, { expectedCreativeArtifactHash: creativeArtifactHash }))
      .toThrow(/CREATIVE_MISMATCH/);
    expect(canonicalServerPlanSigningBytes(envelope)).not.toEqual(canonicalServerPlanSigningBytes(legacy));
    const tampered = structuredClone(envelope); tampered.trustedNativeMaterialization.controls[0]!.geometry.width += 1;
    tampered.nativeMaterializationHash = canonicalTrustedNativeMaterializationHash(tampered.trustedNativeMaterialization);
    tampered.plan.creative.materializationHash = tampered.nativeMaterializationHash;
    tampered.planHash = canonicalChangePlanHash(tampered.plan);
    expect(() => validateServerPlanEnvelopeData(tampered)).toThrow(/PROJECTION_MISMATCH/);
  });
});
