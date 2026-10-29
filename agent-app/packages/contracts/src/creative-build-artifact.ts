import { createHash } from "node:crypto";
import { z } from "zod";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { validateObservationJourneys } from "./observation-journeys.js";
// end
import { ApprovedAssetFactsSchema } from "./asset.js";
import { CapabilityCandidateBundleSchema } from "./capability-candidates.js";
import { CompiledNativeActionSchema, CompilerPageGuidSchema } from "./action-graph.js";
import { CustomerSolutionBlueprintSchema } from "./solution-blueprint.js";
import { SolutionImplementationPlanSchema } from "./solution-implementation-plan.js";
import { CompiledEventBindingSchema, CompiledScriptModuleSchema } from "./script-program.js";
import { allowedFieldsForCapability } from "./native-delta-allowlist.js";
import {
  CompiledStyleSpecSchema,
  CompiledLayoutMetadataSchema,
  ComponentStyleSpecV2Schema,
  ImplementationDataRecordSchema,
  OverlayHostMetadataSchema,
  TabPaneOwnershipSchema,
  UIImplementationSpecV2Schema,
} from "./ui-style.js";

const hash = z.string().regex(/^[0-9a-f]{64}$/);
const boundedId = z.string().trim().min(1).max(100);
const version = z.string().trim().min(1).max(100).regex(/^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/);
const pageIdentity = CompilerPageGuidSchema;
const instanceName = z.string().min(2).max(100).regex(/^[A-Za-z_$][A-Za-z0-9_$]*\d$/);
const geometry = z.object({
  x: z.number().finite().min(-1_000_000).max(1_000_000),
  y: z.number().finite().min(-1_000_000).max(1_000_000),
  width: z.number().finite().positive().max(1_000_000),
  height: z.number().finite().positive().max(1_000_000),
}).strict();
const dataRecord = ImplementationDataRecordSchema;

export const VerifiedCreativeAssetSchema = z.object({
  assetId: boundedId,
  approvedAsset: ApprovedAssetFactsSchema,
}).strict();

const ExistingDeltaSchema = z.object({
  path: z.string().regex(/^\/[A-Za-z0-9_/-]+$/),
  value: z.unknown(),
}).strict();

const DeltaAllowlistPolicySchema = z.object({
  capabilityId: boundedId,
  allowedFields: z.array(z.string().regex(/^[A-Za-z0-9_-]+$/)).max(512),
  policyHash: hash,
}).strict().superRefine((policy, ctx) => {
  const sorted = [...policy.allowedFields].sort(compareCreativeIdentifiers);
  if (new Set(policy.allowedFields).size !== policy.allowedFields.length
    || stableJson(sorted) !== stableJson(policy.allowedFields)) {
    ctx.addIssue({ code: "custom", path: ["allowedFields"], message: "delta allowlist fields must be unique and canonically ordered" });
  }
  if (policy.policyHash !== canonicalJsonHash({ capabilityId: policy.capabilityId, allowedFields: policy.allowedFields })) {
    ctx.addIssue({ code: "custom", path: ["policyHash"], message: "delta allowlist policy hash mismatch" });
  }
});

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
export const ExistingGeneratedStateEvidenceSchema = z.object({
  baseRevisionId: boundedId, scope: z.literal("workspace-generated-local"),
  nativeId: z.number().int().positive(), file: z.string().max(256).regex(/^project\/Tag\/(?:variables\/)?[A-Za-z0-9_.-]+\.json$/),
  recordHash: hash, previousArtifactHash: hash, previousMaterializationHash: hash,
  stateType: z.enum(["boolean", "number", "text", "record-key", "record-key-list"]), dataType: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  defaultValue: z.union([z.boolean(), z.number().finite(), z.string().max(2000), z.null()]), comment: z.string().min(1).max(2000),
  recordScope: z.object({ mockDataId: boundedId, keyField: boundedId }).strict().optional(),
}).strict().superRefine((state, context) => {
  if ((state.stateType === "record-key" || state.stateType === "record-key-list") !== (state.recordScope !== undefined)) {
    context.addIssue({ code: "custom", path: ["recordScope"], message: "record state requires exact prior record scope" });
  }
});
export type ExistingGeneratedStateEvidence = z.infer<typeof ExistingGeneratedStateEvidenceSchema>;
// end
const CreativeBuildEvidenceSchema = z.object({
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  states: z.array(z.object({ semanticStateId: boundedId, variableName: z.string().min(1).max(100), existing: ExistingGeneratedStateEvidenceSchema }).strict()).max(64).optional(),
  // end
  pages: z.array(z.object({
    source: z.enum(["uploaded-existing", "workspace-derived"]),
    semanticPageId: boundedId,
    pageGuid: pageIdentity,
  }).strict()).min(1).max(32),
  controls: z.array(z.object({
    source: z.enum(["uploaded-existing", "workspace-derived"]),
    semanticControlId: boundedId,
    semanticPageId: boundedId,
    pageGuid: pageIdentity,
    instanceName,
    nativeGuid: boundedId.optional(),
    existingDeltas: z.array(ExistingDeltaSchema).max(256).optional(),
    deltaAllowlistPolicy: DeltaAllowlistPolicySchema.optional(),
  }).strict().superRefine((control, ctx) => {
    if ((control.source === "uploaded-existing") !== (control.nativeGuid !== undefined
      && control.existingDeltas !== undefined && control.deltaAllowlistPolicy !== undefined)) {
      ctx.addIssue({ code: "custom", path: ["nativeGuid"], message: "runtime evidence source mismatch" });
    }
  })).min(1).max(5_000),
  stylesData: z.array(z.object({
    semanticControlId: boundedId,
    structuredStyle: ComponentStyleSpecV2Schema,
    approvedAssets: z.array(VerifiedCreativeAssetSchema).max(64),
  }).strict()).max(5_000),
  verifiedAssets: z.array(VerifiedCreativeAssetSchema).max(256),
}).strict().superRefine((evidence, ctx) => {
  const dictionary = new Map<string, typeof evidence.verifiedAssets[number]>();
  evidence.verifiedAssets.forEach((asset, index) => {
    if (dictionary.has(asset.assetId)) ctx.addIssue({ code: "custom", path: ["verifiedAssets", index, "assetId"], message: "duplicate verified asset id" });
    else dictionary.set(asset.assetId, asset);
  });
  const used = new Set<string>();
  evidence.stylesData.forEach((style, styleIndex) => {
    const local = new Set<string>();
    style.approvedAssets.forEach((asset, assetIndex) => {
      if (local.has(asset.assetId)) ctx.addIssue({ code: "custom", path: ["stylesData", styleIndex, "approvedAssets", assetIndex], message: "duplicate style asset id" });
      local.add(asset.assetId); used.add(asset.assetId);
      const verified = dictionary.get(asset.assetId);
      if (verified === undefined || stableJson(verified) !== stableJson(asset)) {
        ctx.addIssue({ code: "custom", path: ["stylesData", styleIndex, "approvedAssets", assetIndex], message: "style asset facts differ from verified dictionary" });
      }
    });
  });
  evidence.verifiedAssets.forEach((asset, index) => {
    if (!used.has(asset.assetId)) ctx.addIssue({ code: "custom", path: ["verifiedAssets", index], message: "unused verified asset" });
  });
});

export const CreativeBuildArtifactSchema = z.object({
  schema: z.literal("kf-creative-build-artifact/v1"),
  blueprint: CustomerSolutionBlueprintSchema,
  candidateBundle: CapabilityCandidateBundleSchema,
  semanticPlan: SolutionImplementationPlanSchema,
  implementation: UIImplementationSpecV2Schema,
  evidence: CreativeBuildEvidenceSchema,
  compilerVersion: version,
  evidenceVersion: version,
  hashes: z.object({
    blueprintHash: hash,
    candidateBundleHash: hash,
    semanticPlanHash: hash,
    implementationHash: hash,
    evidenceHash: hash,
  }).strict(),
}).strict().superRefine((artifact, ctx) => {
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  validateObservationJourneys(artifact.blueprint, artifact.semanticPlan, artifact.implementation).forEach((issue) =>
    ctx.addIssue({ code: "custom", path: ["implementation"], message: `unproven observation ${issue.stepKey}: ${issue.expectedText}` }));
  const journeys = new Map(artifact.blueprint.journeys.map((journey) => [journey.id, journey]));
  artifact.semanticPlan.actions.forEach((action, actionIndex) => (action.journeyStepRefs ?? []).forEach((reference) => {
    if (journeys.get(reference.journeyId)?.steps[reference.stepIndex]?.kind === "observe") {
      ctx.addIssue({ code: "custom", path: ["semanticPlan", "actions", actionIndex, "journeyStepRefs"], message: "observation cannot be covered by an action" });
    }
  }));
  // end
  const actual = {
    blueprintHash: canonicalJsonHash(artifact.blueprint),
    candidateBundleHash: canonicalJsonHash(artifact.candidateBundle),
    semanticPlanHash: canonicalJsonHash(artifact.semanticPlan),
    implementationHash: canonicalJsonHash(artifact.implementation),
    evidenceHash: canonicalJsonHash(artifact.evidence),
  };
  (Object.keys(actual) as Array<keyof typeof actual>).forEach((key) => {
    if (artifact.hashes[key] !== actual[key]) ctx.addIssue({ code: "custom", path: ["hashes", key], message: `${key} mismatch` });
  });
  if (artifact.candidateBundle.blueprintHash !== actual.blueprintHash
    || artifact.semanticPlan.blueprintHash !== actual.blueprintHash) {
    ctx.addIssue({ code: "custom", path: ["hashes", "blueprintHash"], message: "creative blueprint provenance mismatch" });
  }
  if (artifact.semanticPlan.candidateBundleHash !== actual.candidateBundleHash) {
    ctx.addIssue({ code: "custom", path: ["hashes", "candidateBundleHash"], message: "candidate provenance mismatch" });
  }
  if (artifact.implementation.compatibility !== "native"
    || artifact.implementation.sourceSolutionPlanHash !== actual.semanticPlanHash
    || artifact.implementation.runtimeCorrelation === undefined) {
    ctx.addIssue({ code: "custom", path: ["implementation"], message: "native interaction implementation provenance mismatch" });
  }
});

const MaterializedPageSchema = z.object({
  source: z.enum(["uploaded-existing", "workspace-derived"]),
  semanticPageId: boundedId,
  pageGuid: pageIdentity,
  width: z.number().finite().positive().max(1_000_000),
  height: z.number().finite().positive().max(1_000_000),
  order: z.number().int().nonnegative().max(31),
}).strict();

const MaterializedControlSchema = z.object({
  source: z.enum(["uploaded-existing", "workspace-derived"]),
  semanticControlId: boundedId,
  sourceSolutionNodeId: boundedId,
  semanticPageId: boundedId,
  pageGuid: pageIdentity,
  instanceName,
  capabilityId: boundedId,
  parentSemanticControlId: boundedId.optional(),
  parentInstanceName: instanceName.optional(),
  depth: z.number().int().min(0).max(32),
  zIndex: z.number().int().min(0).max(1_000_000),
  order: z.number().int().nonnegative().max(4_999),
  geometry,
  compiledLayout: CompiledLayoutMetadataSchema.optional(),
  overlayHost: OverlayHostMetadataSchema.optional(),
  tabPane: TabPaneOwnershipSchema.optional(),
  nativeProperties: dataRecord,
  nativeGuid: boundedId.optional(),
  content: z.string().max(2_000).optional(),
  existingDeltas: z.array(ExistingDeltaSchema).max(256).optional(),
}).strict().superRefine((control, ctx) => {
  if ((control.parentSemanticControlId === undefined) !== (control.parentInstanceName === undefined)) {
    ctx.addIssue({ code: "custom", path: ["parentInstanceName"], message: "parent provenance must be complete" });
  }
  if (control.source === "workspace-derived" && control.existingDeltas !== undefined) {
    ctx.addIssue({ code: "custom", path: ["existingDeltas"], message: "new controls cannot carry existing deltas" });
  }
  if (control.source === "uploaded-existing" && control.existingDeltas === undefined) {
    ctx.addIssue({ code: "custom", path: ["existingDeltas"], message: "existing controls require allowlisted deltas" });
  }
  if ((control.source === "uploaded-existing") !== (control.nativeGuid !== undefined)) {
    ctx.addIssue({ code: "custom", path: ["nativeGuid"], message: "uploaded native GUID provenance mismatch" });
  }
});

const MaterializedStyleDataSchema = z.object({
  semanticControlId: boundedId,
  instanceName,
  structuredStyle: ComponentStyleSpecV2Schema,
  compiledStyle: CompiledStyleSpecSchema,
  dataBinding: z.object({
    mockDataId: boundedId,
    field: boundedId.optional(),
    recordKey: z.union([z.string().max(2_000), z.number().finite(), z.boolean()]).optional(),
    records: z.array(dataRecord).max(100).optional(),
  }).strict().optional(),
  approvedAssets: z.array(VerifiedCreativeAssetSchema).max(64),
}).strict();

const MaterializedStateSchema = z.object({
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  existing: ExistingGeneratedStateEvidenceSchema.optional(),
  // end
  semanticStateId: boundedId,
  variableName: z.string().trim().min(1).max(100).regex(/^\$kf_[a-z0-9_]+_[0-9a-f]{12}$/),
  stateType: z.enum(["boolean", "number", "text", "record-key", "record-key-list"]),
  dataType: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  defaultValue: z.union([z.boolean(), z.number().finite(), z.string().max(2_000), z.null()]),
  comment: z.string().min(1).max(2_000),
}).strict().superRefine((state, ctx) => {
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  if (state.existing && (state.existing.stateType !== state.stateType || state.existing.dataType !== state.dataType)) {
    ctx.addIssue({ code: "custom", path: ["existing"], message: "existing generated local state type cannot change" });
  }
  // end
  const compatible = state.stateType === "boolean" && state.dataType === 1 && typeof state.defaultValue === "boolean"
    || state.stateType === "number" && state.dataType === 2 && typeof state.defaultValue === "number"
    || state.stateType === "text" && state.dataType === 3 && typeof state.defaultValue === "string"
    || state.stateType === "record-key" && state.dataType === 3 && (typeof state.defaultValue === "string" || state.defaultValue === null)
    || state.stateType === "record-key-list" && state.dataType === 3 && typeof state.defaultValue === "string";
  if (!compatible) ctx.addIssue({ code: "custom", path: ["defaultValue"], message: "materialized state value does not match KF data type" });
  if (state.stateType === "record-key-list" && typeof state.defaultValue === "string") {
    try {
      const parsed = JSON.parse(state.defaultValue) as unknown;
      if (!Array.isArray(parsed) || parsed.length > 100
        || parsed.some((value) => typeof value !== "string" || !/^[A-Za-z][A-Za-z0-9_-]*$/.test(value))
        || new Set(parsed).size !== parsed.length || JSON.stringify(parsed) !== state.defaultValue) {
        ctx.addIssue({ code: "custom", path: ["defaultValue"], message: "record-key-list must be canonical bounded JSON text" });
      }
    } catch {
      ctx.addIssue({ code: "custom", path: ["defaultValue"], message: "record-key-list must be canonical bounded JSON text" });
    }
  }
});

export const TrustedNativeMaterializationSchema = z.object({
  schema: z.literal("kf-trusted-native-materialization/v1"),
  workspaceId: boundedId,
  baseRevisionId: boundedId,
  creativeArtifactHash: hash,
  implementationHash: hash,
  pages: z.array(MaterializedPageSchema).min(1).max(32),
  controls: z.array(MaterializedControlSchema).min(1).max(5_000),
  states: z.array(MaterializedStateSchema).max(64).optional(),
  stylesData: z.array(MaterializedStyleDataSchema).max(5_000),
  interactions: z.object({
    actions: z.array(CompiledNativeActionSchema).max(3_200),
    scripts: z.array(CompiledScriptModuleSchema).max(200),
    eventBindings: z.array(CompiledEventBindingSchema).max(10_000),
  }).strict(),
}).strict().superRefine((value, ctx) => {
  const pages = new Map<string, typeof value.pages[number]>();
  value.pages.forEach((page, index) => {
    if (page.order !== index || pages.has(page.semanticPageId)) ctx.addIssue({ code: "custom", path: ["pages", index], message: "pages must be unique and consecutively ordered" });
    pages.set(page.semanticPageId, page);
  });
  const controls = new Map<string, typeof value.controls[number]>();
  value.controls.forEach((control, index) => {
    if (control.order !== index || controls.has(control.semanticControlId)) ctx.addIssue({ code: "custom", path: ["controls", index], message: "controls must be unique and consecutively ordered" });
    const page = pages.get(control.semanticPageId);
    if (page?.pageGuid !== control.pageGuid) ctx.addIssue({ code: "custom", path: ["controls", index, "pageGuid"], message: "control page provenance mismatch" });
    if (control.source === "uploaded-existing" && page?.source !== "uploaded-existing") {
      ctx.addIssue({ code: "custom", path: ["controls", index, "source"], message: "uploaded control requires an uploaded page" });
    }
    if (control.parentSemanticControlId !== undefined) {
      const parent = controls.get(control.parentSemanticControlId);
      if (parent === undefined || parent.semanticPageId !== control.semanticPageId || parent.instanceName !== control.parentInstanceName || parent.depth >= control.depth) {
        ctx.addIssue({ code: "custom", path: ["controls", index, "parentSemanticControlId"], message: "parent must precede child on the same page" });
      }
      if (control.tabPane !== undefined) {
        const tabs = parent?.nativeProperties["tabs"];
        const matches = Array.isArray(tabs) ? tabs.filter((candidate) => candidate !== null
          && typeof candidate === "object" && !Array.isArray(candidate)
          && (candidate as Record<string, unknown>)["id"] === control.tabPane!.tabId
          && (candidate as Record<string, unknown>)["paneNodeId"] === control.sourceSolutionNodeId
          && (candidate as Record<string, unknown>)["regionId"] === control.tabPane!.sourceBlueprintRegionId) : [];
        if (control.parentSemanticControlId !== control.tabPane.ownerSemanticControlId
          || parent?.capabilityId !== "tabs" || matches.length !== 1) {
          ctx.addIssue({ code: "custom", path: ["controls", index, "tabPane"], message: "tab pane materialization provenance mismatch" });
        }
      }
    } else if (control.tabPane !== undefined) {
      ctx.addIssue({ code: "custom", path: ["controls", index, "tabPane"], message: "tab pane requires a preceding Tabs parent" });
    }
    controls.set(control.semanticControlId, control);
  });
  value.stylesData.forEach((style, index) => {
    if (controls.get(style.semanticControlId)?.instanceName !== style.instanceName) ctx.addIssue({ code: "custom", path: ["stylesData", index], message: "style provenance mismatch" });
  });
  const assetFacts = new Map<string, VerifiedCreativeAsset>();
  value.stylesData.forEach((style, styleIndex) => {
    const local = new Set<string>();
    style.approvedAssets.forEach((asset, assetIndex) => {
      if (local.has(asset.assetId)) ctx.addIssue({ code: "custom", path: ["stylesData", styleIndex, "approvedAssets", assetIndex], message: "duplicate materialized asset id" });
      local.add(asset.assetId);
      const prior = assetFacts.get(asset.assetId);
      if (prior !== undefined && stableJson(prior) !== stableJson(asset)) {
        ctx.addIssue({ code: "custom", path: ["stylesData", styleIndex, "approvedAssets", assetIndex], message: "conflicting materialized asset facts" });
      } else assetFacts.set(asset.assetId, asset);
    });
  });
  value.interactions.scripts.forEach((script, index) => {
    if (createHash("sha256").update(script.source).digest("hex") !== script.sourceHash) ctx.addIssue({ code: "custom", path: ["interactions", "scripts", index, "sourceHash"], message: "compiled script hash mismatch" });
  });
});

export type CreativeBuildArtifact = z.infer<typeof CreativeBuildArtifactSchema>;
export type VerifiedCreativeAsset = z.infer<typeof VerifiedCreativeAssetSchema>;
export type TrustedNativeMaterialization = z.infer<typeof TrustedNativeMaterializationSchema>;

export function canonicalCreativeBuildArtifactHash(input: unknown): string {
  return canonicalJsonHash(CreativeBuildArtifactSchema.parse(input));
}

export function canonicalTrustedNativeMaterializationHash(input: unknown): string {
  return canonicalJsonHash(TrustedNativeMaterializationSchema.parse(input));
}

/** Exact deterministic projection check used before a server may sign materialization bytes. */
export function validateCreativeArtifactMaterializationProjection(
  artifactInput: unknown,
  materializationInput: unknown,
): TrustedNativeMaterialization {
  const artifact = CreativeBuildArtifactSchema.parse(artifactInput);
  const materialization = TrustedNativeMaterializationSchema.parse(materializationInput);
  const implementation = artifact.implementation;
  if (materialization.creativeArtifactHash !== canonicalCreativeBuildArtifactHash(artifact)
    || materialization.implementationHash !== artifact.hashes.implementationHash) {
    throw new Error("CREATIVE_MATERIALIZATION_PROJECTION_MISMATCH: artifact hash");
  }
  const pageGuid = new Map(implementation.runtimeCorrelation!.pages.map((entry) => [entry.semanticPageId, entry.pageGuid]));
  const instanceName = new Map(implementation.runtimeCorrelation!.controls.map((entry) => [entry.semanticControlId, entry.instanceName]));
  const variableName = new Map((implementation.runtimeCorrelation!.states ?? []).map((entry) => [entry.semanticStateId, entry.variableName]));
  const pages = implementation.pages.filter((page): page is Extract<typeof page, { compatibility: "native" }> => page.compatibility === "native")
    .slice().sort((left, right) => compareCreativeIdentifiers(left.id, right.id));
  const pageEvidence = new Map(artifact.evidence.pages.map((page) => [page.semanticPageId, page]));
  const expectedPageEvidenceIdentity = pages.map((page) => ({ semanticPageId: page.id, pageGuid: pageGuid.get(page.id) }));
  const actualPageEvidenceIdentity = artifact.evidence.pages.map(({ semanticPageId, pageGuid: guid }) => ({ semanticPageId, pageGuid: guid }));
  if (stableJson(expectedPageEvidenceIdentity) !== stableJson(actualPageEvidenceIdentity)) {
    throw new Error("CREATIVE_MATERIALIZATION_PROJECTION_MISMATCH: page evidence");
  }
  const expectedPages = pages.map((page, order) => ({
    source: pageEvidence.get(page.id)?.source, semanticPageId: page.id, pageGuid: pageGuid.get(page.id), width: page.width, height: page.height, order,
  }));
  const actualPages = materialization.pages.map(({ source, semanticPageId, pageGuid: guid, width, height, order }) => ({ source, semanticPageId, pageGuid: guid, width, height, order }));
  if (stableJson(expectedPages) !== stableJson(actualPages)) throw new Error("CREATIVE_MATERIALIZATION_PROJECTION_MISMATCH: pages");
  const expectedStates = [...artifact.semanticPlan.localState].sort((left, right) => compareCreativeIdentifiers(left.id, right.id)).map((state) => ({
    semanticStateId: state.id,
    variableName: variableName.get(state.id),
    stateType: state.type,
    dataType: state.type === "boolean" ? 1 : state.type === "number" ? 2 : 3,
    defaultValue: state.type === "record-key-list" ? JSON.stringify(state.initialValue) : state.initialValue,
    comment: state.purpose,
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    ...((artifact.evidence.states ?? []).find(entry => entry.semanticStateId === state.id)?.existing === undefined ? {} : {
      existing: (artifact.evidence.states ?? []).find(entry => entry.semanticStateId === state.id)!.existing,
    }),
    // end
  }));
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  const stateEvidence = artifact.evidence.states ?? [];
  if (new Set(stateEvidence.map(state => state.semanticStateId)).size !== stateEvidence.length
    || new Set(stateEvidence.map(state => `${state.existing.file}:${state.existing.nativeId}`)).size !== stateEvidence.length
    || stateEvidence.some(state => variableName.get(state.semanticStateId) !== state.variableName
      || state.existing.baseRevisionId !== materialization.baseRevisionId || !expectedStates.some(expected => expected.semanticStateId === state.semanticStateId)
      || artifact.semanticPlan.localState.find(semantic => semantic.id === state.semanticStateId)?.mockDataId !== state.existing.recordScope?.mockDataId
      || artifact.semanticPlan.localState.find(semantic => semantic.id === state.semanticStateId)?.keyField !== state.existing.recordScope?.keyField)) {
    throw new Error("CREATIVE_MATERIALIZATION_PROJECTION_MISMATCH: existing state evidence");
  }
  // end
  if (stableJson(expectedStates) !== stableJson(materialization.states ?? [])) {
    throw new Error("CREATIVE_MATERIALIZATION_PROJECTION_MISMATCH: states");
  }
  const pageIndex = new Map(pages.map((page, index) => [page.id, index]));
  const pageByControl = new Map(pages.flatMap((page) => page.controls.map((control) => [control.id, page] as const)));
  const controls = pages.flatMap((page) => page.controls).slice().sort((left, right) =>
    pageIndex.get(pageByControl.get(left.id)!.id)! - pageIndex.get(pageByControl.get(right.id)!.id)!
      || left.depth - right.depth || compareCreativeIdentifiers(left.id, right.id));
  const controlEvidence = new Map(artifact.evidence.controls.map((control) => [control.semanticControlId, control]));
  const expectedControlEvidenceIdentity = controls.map((control) => {
    const page = pageByControl.get(control.id)!;
    return { semanticControlId: control.id, semanticPageId: page.id, pageGuid: pageGuid.get(page.id), instanceName: instanceName.get(control.id) };
  });
  const actualControlEvidenceIdentity = artifact.evidence.controls.map(({ semanticControlId, semanticPageId, pageGuid: guid, instanceName: runtimeName }) => ({
    semanticControlId, semanticPageId, pageGuid: guid, instanceName: runtimeName,
  }));
  if (stableJson(expectedControlEvidenceIdentity) !== stableJson(actualControlEvidenceIdentity)) {
    throw new Error("CREATIVE_MATERIALIZATION_PROJECTION_MISMATCH: control evidence");
  }
  const expectedControls = controls.map((control, order) => {
    const page = pageByControl.get(control.id)!;
    const evidence = controlEvidence.get(control.id);
    return {
      source: evidence?.source, semanticControlId: control.id, sourceSolutionNodeId: control.sourceSolutionNodeId, semanticPageId: page.id,
      pageGuid: pageGuid.get(page.id), instanceName: instanceName.get(control.id), capabilityId: control.capabilityId,
      ...(control.parentId === undefined ? {} : { parentSemanticControlId: control.parentId, parentInstanceName: instanceName.get(control.parentId) }),
      depth: control.depth, zIndex: control.zIndex, order, geometry: control.geometry,
      ...(control.compiledLayout === undefined ? {} : { compiledLayout: control.compiledLayout }),
      ...(control.overlayHost === undefined ? {} : { overlayHost: control.overlayHost }),
      ...(control.tabPane === undefined ? {} : { tabPane: control.tabPane }),
      nativeProperties: control.nativeProperties,
      ...(control.content === undefined ? {} : { content: control.content }),
      ...(evidence?.nativeGuid === undefined ? {} : { nativeGuid: evidence.nativeGuid }),
      ...(evidence?.existingDeltas === undefined ? {} : { existingDeltas: evidence.existingDeltas }),
    };
  });
  const actualControls = materialization.controls.map((control) => ({
    source: control.source, semanticControlId: control.semanticControlId, sourceSolutionNodeId: control.sourceSolutionNodeId,
    semanticPageId: control.semanticPageId, pageGuid: control.pageGuid, instanceName: control.instanceName,
    capabilityId: control.capabilityId,
    ...(control.parentSemanticControlId === undefined ? {} : { parentSemanticControlId: control.parentSemanticControlId, parentInstanceName: control.parentInstanceName }),
    depth: control.depth, zIndex: control.zIndex, order: control.order, geometry: control.geometry,
    ...(control.compiledLayout === undefined ? {} : { compiledLayout: control.compiledLayout }),
    ...(control.overlayHost === undefined ? {} : { overlayHost: control.overlayHost }),
    ...(control.tabPane === undefined ? {} : { tabPane: control.tabPane }),
    nativeProperties: control.nativeProperties,
    ...(control.content === undefined ? {} : { content: control.content }),
    ...(control.nativeGuid === undefined ? {} : { nativeGuid: control.nativeGuid }),
    ...(control.existingDeltas === undefined ? {} : { existingDeltas: control.existingDeltas }),
  }));
  if (stableJson(expectedControls) !== stableJson(actualControls)) throw new Error("CREATIVE_MATERIALIZATION_PROJECTION_MISMATCH: controls");
  materialization.controls.forEach((control) => {
    if (control.source !== "uploaded-existing") return;
    const implementationControl = controls.find((candidate) => candidate.id === control.semanticControlId)!;
    const policy = controlEvidence.get(control.semanticControlId)?.deltaAllowlistPolicy;
    const canonicalAllowedFields = [...allowedFieldsForCapability(implementationControl.capabilityId)]
      .sort(compareCreativeIdentifiers);
    if (policy === undefined || policy.capabilityId !== implementationControl.capabilityId
      || stableJson(policy.allowedFields) !== stableJson(canonicalAllowedFields)) {
      throw new Error(`CREATIVE_MATERIALIZATION_PROJECTION_MISMATCH: canonical delta allowlist policy ${control.semanticControlId}`);
    }
    const allowedFields = new Set(canonicalAllowedFields);
    const candidates: Array<{ path: string; value: unknown }> = [
      { path: "/x", value: implementationControl.geometry.x }, { path: "/y", value: implementationControl.geometry.y },
      { path: "/width", value: implementationControl.geometry.width }, { path: "/height", value: implementationControl.geometry.height },
      ...Object.entries(implementationControl.nativeProperties).map(([key, value]) => ({ path: `/${key}`, value })),
      ...(implementationControl.content === undefined ? [] : [{ path: "/text", value: implementationControl.content }]),
    ].filter((candidate) => allowedFields.has(candidate.path.slice(1)));
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    // JSONB may reorder nativeProperties object keys, while signed delta arrays retain their order.
    // Compare distinct paths independently; stable sorting preserves order among repeated paths.
    const orderedDeltas = control.existingDeltas?.slice().sort((left, right) => compareCreativeIdentifiers(left.path, right.path));
    const orderedCandidates = candidates.slice().sort((left, right) => compareCreativeIdentifiers(left.path, right.path));
    if (stableJson(orderedDeltas) !== stableJson(orderedCandidates)) {
    // end
      throw new Error(`CREATIVE_MATERIALIZATION_PROJECTION_MISMATCH: delta allowlist policy ${control.semanticControlId}`);
    }
  });
  const styleEvidence = new Map(artifact.evidence.stylesData.map((style) => [style.semanticControlId, style]));
  const expectedStyles = controls.map((control) => {
    const evidence = styleEvidence.get(control.id);
    return {
      semanticControlId: control.id, instanceName: instanceName.get(control.id),
      structuredStyle: evidence?.structuredStyle,
      compiledStyle: control.compiledStyle ?? { nativeFields: {}, cssFragments: [], warnings: [] },
      ...(control.dataBinding === undefined ? {} : { dataBinding: control.dataBinding }),
      approvedAssets: evidence?.approvedAssets,
    };
  });
  const actualStyles = materialization.stylesData.map((style) => ({
    semanticControlId: style.semanticControlId, instanceName: style.instanceName,
    structuredStyle: style.structuredStyle, compiledStyle: style.compiledStyle,
    ...(style.dataBinding === undefined ? {} : { dataBinding: style.dataBinding }),
    approvedAssets: style.approvedAssets,
  }));
  if (stableJson(expectedStyles) !== stableJson(actualStyles)) throw new Error("CREATIVE_MATERIALIZATION_PROJECTION_MISMATCH: styles-data");
  const materializedAssets = new Map<string, VerifiedCreativeAsset>();
  materialization.stylesData.flatMap((style) => style.approvedAssets).forEach((asset) => materializedAssets.set(asset.assetId, asset));
  const expectedAssets = [...artifact.evidence.verifiedAssets].sort((left, right) => compareCreativeIdentifiers(left.assetId, right.assetId));
  const actualAssets = [...materializedAssets.values()].sort((left, right) => compareCreativeIdentifiers(left.assetId, right.assetId));
  if (stableJson(expectedAssets) !== stableJson(actualAssets)) throw new Error("CREATIVE_MATERIALIZATION_PROJECTION_MISMATCH: approved assets");
  const expectedBindings = implementation.pages.flatMap((page) => page.compatibility === "native"
    ? page.controls.flatMap((control) => control.eventBindings) : []);
  if (stableJson(materialization.interactions.actions) !== stableJson(implementation.compiledActions)
    || stableJson(materialization.interactions.scripts) !== stableJson(implementation.compiledScripts)
    || stableJson(materialization.interactions.eventBindings) !== stableJson(expectedBindings)) {
    throw new Error("CREATIVE_MATERIALIZATION_PROJECTION_MISMATCH: interactions");
  }
  return materialization;
}

function canonicalJsonHash(input: unknown): string {
  return createHash("sha256").update(stableJson(input)).digest("hex");
}

function stableJson(input: unknown): string { return JSON.stringify(sortJson(input), null, 2); }

function sortJson(input: unknown): unknown {
  if (Array.isArray(input)) return input.map(sortJson);
  if (input !== null && typeof input === "object") {
    return Object.fromEntries(Object.keys(input).sort().map((key) => [key, sortJson((input as Record<string, unknown>)[key])]));
  }
  return input;
}

export function compareCreativeIdentifiers(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  for (let index = 0; index < Math.min(leftPoints.length, rightPoints.length); index += 1) {
    const difference = leftPoints[index]!.codePointAt(0)! - rightPoints[index]!.codePointAt(0)!;
    if (difference !== 0) return difference;
  }
  return leftPoints.length - rightPoints.length;
}
