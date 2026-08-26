import { types as utilTypes } from "node:util";
import {
  ApprovedAssetFactsSchema,
  CapabilityCandidateBundleSchema,
  CreativeBuildArtifactSchema,
  CustomerSolutionBlueprintSchema,
  SolutionImplementationPlanSchema,
  TrustedNativeMaterializationSchema,
  UIImplementationSpecV2Schema,
  VerifiedCreativeAssetSchema,
  allowedFieldsForCapability,
  canonicalCreativeBuildArtifactHash,
  canonicalServerHash,
  canonicalTrustedNativeMaterializationHash,
  compareCreativeIdentifiers,
  internalChangePlanSchema,
  modelAssetIdToWorkspaceAssetId,
  nativeControlVariantForCapability,
  semanticPayloadHash,
  validateCreativeArtifactMaterializationProjection,
  type CapabilityReport,
  type ChangeOperation,
  type ChangePlanAssetBinding,
  type CreativeBuildArtifact,
  type InternalChangePlan,
  type SolutionImplementationPlan,
  type TrustedNativeMaterialization,
  type TrustedSemanticOperationInput,
  type UIImplementationControlV2,
  type UIImplementationSpecV2,
  type VerifiedCreativeAsset,
} from "@kf/contracts";
import type { TrustedCreativePayloadHandle } from "@kf/build-jobs";
import { getControlCapability } from "../style/control-capability-registry.js";
import { compileResolvedStyle } from "../style/style-engine.js";
import { resolveStyle } from "../style/theme-resolver.js";
import { KF36_RUNTIME_PROFILE } from "../style/runtime-profile.js";
import { validateGeneratedComponentProperties } from "./component-properties.js";
import { compileInteractions } from "../interaction/interaction-compiler.js";
import {
  attachRuntimeCorrelation,
  readVerifiedExistingRuntimeCorrelation,
  type VerifiedExistingRuntimeCorrelationHandle,
} from "./runtime-correlation.js";

export interface CompileCreativeUIImplementationV2Input {
  readonly workspaceId: string;
  readonly baseRevisionId: string;
  readonly blueprint: unknown;
  readonly candidateBundle: unknown;
  readonly semanticPlan: unknown;
  readonly implementation: unknown;
  readonly compilerVersion: string;
  readonly evidenceVersion: string;
  readonly verifiedAssets?: VerifiedCreativeAssetProofHandle;
  readonly verifiedExisting?: VerifiedExistingRuntimeCorrelationHandle;
}

declare const verifiedCreativeAssetProofBrand: unique symbol;
export interface VerifiedCreativeAssetProofHandle { readonly [verifiedCreativeAssetProofBrand]: true }

export interface CreativeUIImplementationV2Compiler {
  compile(input: CompileCreativeUIImplementationV2Input): CreativeUIImplementationV2CompileResult;
}

export interface CreativeAssetProofResolver {
  attestResolvedAssets(input: { readonly workspaceId: string; readonly assets: unknown }): VerifiedCreativeAssetProofHandle;
}

export interface CreativeUIImplementationV2CompilerBundle {
  readonly compiler: CreativeUIImplementationV2Compiler;
  readonly assetProofResolver: CreativeAssetProofResolver;
}

interface ServerScopedCreativePayloadIssuer {
  issue(input: {
    readonly plan: InternalChangePlan;
    readonly artifact: CreativeBuildArtifact;
    readonly materialization: TrustedNativeMaterialization;
  }): TrustedCreativePayloadHandle;
}

export interface CreativeUIImplementationV2CompileResult {
  readonly plan: InternalChangePlan;
  /** Compiler-owned authorization for exact Datagrid payloads present in the emitted plan. */
  readonly semanticOperations: readonly TrustedSemanticOperationInput[];
  readonly capabilityReport: CapabilityReport;
  readonly verifiedAssets: readonly VerifiedCreativeAsset[];
  readonly artifact: CreativeBuildArtifact;
  readonly materialization: TrustedNativeMaterialization;
  readonly trustedCreativePayload: TrustedCreativePayloadHandle;
}

const EMPTY_STYLE = Object.freeze({ declarations: Object.freeze({}), states: Object.freeze({}) });
const MAX_NODES = 1_500_000;
const MAX_DEPTH = 96;
const MAX_KEYS = 512;
const MAX_ARRAY = 20_000;

function fail(code: string, detail: string): never { throw new Error(`${code}: ${detail}`); }

function safeClone(input: unknown): unknown {
  const seen = new WeakSet<object>();
  const active = new WeakSet<object>();
  let nodes = 0;
  const clone = (value: unknown, depth: number): unknown => {
    nodes += 1; if (nodes > MAX_NODES || depth > MAX_DEPTH) fail("CREATIVE_INPUT_BUDGET_EXCEEDED", "plain-data budget exceeded");
    if (value === null || value === undefined || typeof value === "string" || typeof value === "boolean") return value;
    if (typeof value === "number") { if (!Number.isFinite(value)) fail("CREATIVE_INPUT_INVALID", "non-finite number"); return value; }
    if (typeof value !== "object") fail("CREATIVE_INPUT_INVALID", `unsupported ${typeof value}`);
    if (utilTypes.isProxy(value)) fail("CREATIVE_INPUT_PROXY_FORBIDDEN", "proxy values are not allowed");
    if (active.has(value)) fail("CREATIVE_INPUT_CYCLE_FORBIDDEN", "cyclic values are not allowed");
    if (seen.has(value)) fail("CREATIVE_INPUT_ALIAS_FORBIDDEN", "shared object aliases are not allowed");
    seen.add(value);
    active.add(value);
    let inspectedPrototype: unknown; let keys: PropertyKey[];
    try { inspectedPrototype = Object.getPrototypeOf(value) as unknown; keys = Reflect.ownKeys(value); } catch { return fail("CREATIVE_INPUT_INSPECTION_FAILED", "reflection failed"); }
    if (inspectedPrototype !== null && typeof inspectedPrototype !== "object") fail("CREATIVE_INPUT_INVALID", "invalid prototype");
    const proto = inspectedPrototype;
    if (Array.isArray(value)) {
      if (proto !== Array.prototype || value.length > MAX_ARRAY || keys.length !== value.length + 1) fail("CREATIVE_INPUT_INVALID", "invalid array");
      const output: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) fail("CREATIVE_INPUT_ACCESSOR_FORBIDDEN", `array[${index}]`);
        output.push(clone(descriptor.value, depth + 1));
      }
      active.delete(value); return output;
    }
    if (proto !== Object.prototype && proto !== null || keys.length > MAX_KEYS) fail("CREATIVE_INPUT_INVALID", "non-plain object");
    const output: Record<string, unknown> = {};
    for (const key of keys) {
      if (typeof key !== "string") fail("CREATIVE_INPUT_INVALID", "symbol key");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) fail("CREATIVE_INPUT_ACCESSOR_FORBIDDEN", key);
      output[key] = clone(descriptor.value, depth + 1);
    }
    active.delete(value); return output;
  };
  return clone(input, 0);
}

function rootValues(input: unknown): { plain: Record<string, unknown>; existing?: VerifiedExistingRuntimeCorrelationHandle; assets?: VerifiedCreativeAssetProofHandle } {
  if (typeof input !== "object" || input === null || Array.isArray(input) || utilTypes.isProxy(input)) fail("CREATIVE_INPUT_PROXY_FORBIDDEN", "input must be a plain non-proxy object");
  const prototype: unknown = Object.getPrototypeOf(input) as unknown;
  if (prototype !== Object.prototype && prototype !== null) fail("CREATIVE_INPUT_NON_PLAIN", "input must have a plain prototype");
  const allowed = new Set(["workspaceId", "baseRevisionId", "blueprint", "candidateBundle", "semanticPlan", "implementation", "compilerVersion", "evidenceVersion", "verifiedAssets", "verifiedExisting"]);
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(input);
  if (keys.some((key) => typeof key !== "string" || !allowed.has(key)) || keys.length < 8 || keys.length > 10) fail("CREATIVE_INPUT_UNKNOWN_FIELD", "invalid input keys");
  const plain: Record<string, unknown> = {};
  let existing: VerifiedExistingRuntimeCorrelationHandle | undefined;
  let assets: VerifiedCreativeAssetProofHandle | undefined;
  for (const key of keys) {
    if (typeof key !== "string") continue;
    const descriptor = descriptors[key]; if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) fail("CREATIVE_INPUT_ACCESSOR_FORBIDDEN", key);
    if (key === "verifiedExisting") existing = descriptor.value as VerifiedExistingRuntimeCorrelationHandle;
    else if (key === "verifiedAssets") assets = descriptor.value as VerifiedCreativeAssetProofHandle;
    else plain[key] = descriptor.value;
  }
  return { plain: safeClone(plain) as Record<string, unknown>, ...(existing === undefined ? {} : { existing }), ...(assets === undefined ? {} : { assets }) };
}

function exactString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.length < 1 || value.length > 100 || value.trim() !== value) fail("CREATIVE_INPUT_INVALID", field);
  return value;
}

function existingDeltaProjection(control: UIImplementationControlV2): {
  existingDeltas: Array<{ path: string; value: unknown }>;
  deltaAllowlistPolicy: { capabilityId: string; allowedFields: string[]; policyHash: string };
} {
  const allowed = allowedFieldsForCapability(control.capabilityId);
  const allowedFields = [...allowed].sort(compareCreativeIdentifiers);
  const candidates: Array<[string, unknown]> = [["x", control.geometry.x], ["y", control.geometry.y], ["width", control.geometry.width], ["height", control.geometry.height]];
  for (const [key, value] of Object.entries(control.nativeProperties)) candidates.push([key, value]);
  if (control.content !== undefined) candidates.push(["text", control.content]);
  const policyProjection = { capabilityId: control.capabilityId, allowedFields };
  return {
    existingDeltas: candidates.filter(([key]) => allowed.has(key)).map(([key, value]) => ({
      path: control.capabilityId === "easyui.1" && key === "tableData" ? "/__kfModuleTableData" : `/${key}`,
      value,
    })),
    deltaAllowlistPolicy: { ...policyProjection, policyHash: canonicalServerHash(policyProjection) },
  };
}

function semanticRows(dataSet: SolutionImplementationPlan["mockData"][number]): Readonly<Record<string, unknown>>[] {
  return dataSet.records.map((record) => Object.fromEntries(record.values.map((entry) => [entry.field, entry.value])));
}

/**
 * Re-derives every authorized table payload from the validated semantic plan.
 * Neither model output nor a caller can provide an authorization list.
 */
function validateTableBindings(
  semanticPlan: SolutionImplementationPlan,
  controls: readonly UIImplementationControlV2[],
): ReadonlyMap<string, string> {
  const dataById = new Map(semanticPlan.mockData.map((dataSet) => [dataSet.id, dataSet]));
  const sourceByEntityId = new Map<string, string>();
  for (const control of controls) {
    const hasTableData = Object.hasOwn(control.nativeProperties, "tableData");
    if (control.dataBinding === undefined) {
      if (hasTableData) fail("CREATIVE_TABLE_DATA_BINDING_REQUIRED", control.id);
      continue;
    }
    if (control.capabilityId !== "easyui.1") fail("CREATIVE_TABLE_DATA_BINDING_CAPABILITY_MISMATCH", control.id);
    const dataSet = dataById.get(control.dataBinding.mockDataId);
    if (dataSet === undefined) fail("CREATIVE_TABLE_DATA_BINDING_MISSING", control.id);
    const rows = semanticRows(dataSet);
    const expectedBinding = { mockDataId: dataSet.id, records: rows };
    const expectedTableData = {
      columns: dataSet.fields.map((field) => ({ key: field.key, label: field.label, align: "left" as const })),
      rows,
      pageSize: Math.min(20, rows.length),
    };
    if (canonicalServerHash(control.dataBinding) !== canonicalServerHash(expectedBinding)) {
      fail("CREATIVE_TABLE_DATA_BINDING_MISMATCH", control.id);
    }
    // Legacy native/module materializations may carry these exact validated
    // records only in the signed creative stylesData projection. With no
    // ChangePlan tableData payload, no privileged semantic operation is needed.
    if (!hasTableData) continue;
    if (canonicalServerHash(control.nativeProperties["tableData"]) !== canonicalServerHash(expectedTableData)
      || control.nativeProperties["pageSize"] !== expectedTableData.pageSize
      || control.nativeProperties["pagination"] !== (rows.length > expectedTableData.pageSize)) {
      fail("CREATIVE_TABLE_DATA_BINDING_MISMATCH", control.id);
    }
    sourceByEntityId.set(control.id, control.sourceSolutionNodeId);
  }
  return sourceByEntityId;
}

function semanticOperationsForActualPlan(
  plan: InternalChangePlan,
  sourceByEntityId: ReadonlyMap<string, string>,
): readonly TrustedSemanticOperationInput[] {
  const output: TrustedSemanticOperationInput[] = [];
  for (const operation of plan.operations) {
    const sourceModuleId = sourceByEntityId.get(operation.entityId);
    if (sourceModuleId === undefined) continue;
    if (operation.op === "create" && operation.properties["type"] === "easyui"
      && operation.properties["proto"] === 1 && Object.hasOwn(operation.properties, "tableData")) {
      output.push({
        kind: "kf.table-data/v1", entityId: operation.entityId, capabilityId: "easyui.1", sourceModuleId,
        payloadHash: semanticPayloadHash(operation.properties["tableData"]),
      });
    }
    if (operation.op === "update") {
      operation.changes.filter((change) => change.path === "/__kfModuleTableData").forEach((change) => output.push({
        kind: "kf.table-data/v1", entityId: operation.entityId, capabilityId: "easyui.1", sourceModuleId,
        payloadHash: semanticPayloadHash(change.value),
      }));
    }
  }
  return Object.freeze(output);
}

function topologicalControls(pages: readonly Extract<UIImplementationSpecV2["pages"][number], { compatibility: "native" }>[]): UIImplementationControlV2[] {
  const pageOrder = new Map(pages.map((page, index) => [page.id, index]));
  const owner = new Map(pages.flatMap((page) => page.controls.map((control) => [control.id, page.id] as const)));
  const controls = pages.flatMap((page) => page.controls).slice().sort((left, right) =>
    pageOrder.get(owner.get(left.id)!)! - pageOrder.get(owner.get(right.id)!)!
      || left.depth - right.depth || compareCreativeIdentifiers(left.id, right.id));
  const seen = new Set<string>();
  for (const control of controls) {
    if (control.parentId !== undefined && (!seen.has(control.parentId) || owner.get(control.parentId) !== owner.get(control.id))) fail("CREATIVE_PARENT_ORDER_INVALID", control.id);
    seen.add(control.id);
  }
  return controls;
}

function deepFreeze<T>(input: T): T {
  if (input !== null && typeof input === "object" && !Object.isFrozen(input)) {
    Reflect.ownKeys(input).forEach((key) => { const descriptor = Object.getOwnPropertyDescriptor(input, key); if (descriptor !== undefined && "value" in descriptor) deepFreeze(descriptor.value); });
    Object.freeze(input);
  }
  return input;
}

function compileCreativeUIImplementationV2(
  input: CompileCreativeUIImplementationV2Input,
  issuer: ServerScopedCreativePayloadIssuer,
  verifiedAssetPayloads: WeakMap<object, Readonly<{ workspaceId: string; assets: readonly VerifiedCreativeAsset[] }>>,
): CreativeUIImplementationV2CompileResult {
  const { plain, existing: handle, assets: assetProof } = rootValues(input);
  const workspaceId = exactString(plain.workspaceId, "workspaceId");
  const baseRevisionId = exactString(plain.baseRevisionId, "baseRevisionId");
  const blueprint = CustomerSolutionBlueprintSchema.parse(plain.blueprint);
  const candidateBundle = CapabilityCandidateBundleSchema.parse(plain.candidateBundle);
  const semanticPlan = SolutionImplementationPlanSchema.parse(plain.semanticPlan);
  if (plain.implementation === null || typeof plain.implementation !== "object"
    || !("runtimeCorrelation" in plain.implementation)) {
    fail("RUNTIME_CORRELATION_REQUIRED", "native final implementation must have complete runtime correlation");
  }
  const implementation = UIImplementationSpecV2Schema.parse(plain.implementation);
  if (implementation.compatibility !== "native" || implementation.runtimeCorrelation === undefined) fail("RUNTIME_CORRELATION_REQUIRED", "native final implementation must have complete runtime correlation");
  const correlationInput: UIImplementationSpecV2 = {
    ...implementation,
    pages: implementation.pages.map((page) => page.compatibility === "native"
      ? { ...page, controls: page.controls.map((control) => ({ ...control, eventBindings: [] })) }
      : page),
    compiledActions: [],
    compiledScripts: [],
  };
  delete correlationInput.runtimeCorrelation;
  const trustedCorrelation = attachRuntimeCorrelation({ workspaceId, baseRevisionId, implementation: correlationInput,
    ...(handle === undefined ? {} : { verifiedExisting: handle }) }).runtimeCorrelation;
  const normalizedCorrelation = (correlation: NonNullable<UIImplementationSpecV2["runtimeCorrelation"]>) => ({
    controls: [...correlation.controls].sort((left, right) => compareCreativeIdentifiers(left.semanticControlId, right.semanticControlId)),
    pages: [...correlation.pages].sort((left, right) => compareCreativeIdentifiers(left.semanticPageId, right.semanticPageId)),
  });
  if (canonicalServerHash(normalizedCorrelation(implementation.runtimeCorrelation)) !== canonicalServerHash(normalizedCorrelation(trustedCorrelation!))) {
    fail("RUNTIME_CORRELATION_PROVENANCE_MISMATCH", "runtime identities were not issued by the Task-2 correlator");
  }
  const interactionInput: UIImplementationSpecV2 = {
    ...implementation,
    pages: implementation.pages.map((page) => page.compatibility === "native"
      ? { ...page, controls: page.controls.map((control) => ({ ...control, eventBindings: [] })) }
      : page),
    compiledActions: [],
    compiledScripts: [],
  };
  const authoritativeInteractions = compileInteractions({ blueprint, plan: semanticPlan, implementation: interactionInput });
  if (authoritativeInteractions.diagnostics.errors.length > 0 || authoritativeInteractions.diagnostics.requests.length > 0) {
    fail("CREATIVE_INTERACTION_COMPILATION_BLOCKED", canonicalServerHash(authoritativeInteractions.diagnostics));
  }
  if (canonicalServerHash(authoritativeInteractions.implementation) !== canonicalServerHash(implementation)) {
    fail("CREATIVE_INTERACTION_PROVENANCE_MISMATCH", "compiled interactions differ from authoritative compiler output");
  }
  const compilerVersion = exactString(plain.compilerVersion, "compilerVersion");
  const evidenceVersion = exactString(plain.evidenceVersion, "evidenceVersion");
  const assetPayload = assetProof === undefined ? undefined : verifiedAssetPayloads.get(assetProof);
  if (assetProof !== undefined && assetPayload === undefined) fail("CREATIVE_ASSET_PROOF_REQUIRED", "assets were not verified by this compiler facade");
  if (assetPayload !== undefined && assetPayload.workspaceId !== workspaceId) fail("CREATIVE_ASSET_PROOF_BINDING_MISMATCH", workspaceId);
  const verifiedAssets = assetPayload?.assets ?? [];
  const assets = new Map<string, VerifiedCreativeAsset>();
  for (const asset of verifiedAssets) {
    if (assets.has(asset.assetId) || modelAssetIdToWorkspaceAssetId(asset.assetId) !== asset.approvedAsset.workspaceAssetId) fail("CREATIVE_ASSET_INVALID", asset.assetId);
    ApprovedAssetFactsSchema.parse(asset.approvedAsset); assets.set(asset.assetId, asset);
  }
  const projection = handle === undefined ? undefined : readVerifiedExistingRuntimeCorrelation(handle, workspaceId, baseRevisionId);
  const controlSource = new Map(projection?.controls.map((entry) => [entry.semanticControlId, entry]));
  const pageSource = new Map(projection?.pages.map((entry) => [entry.semanticPageId, entry]));
  const correlationControl = new Map(implementation.runtimeCorrelation.controls.map((entry) => [entry.semanticControlId, entry.instanceName]));
  const correlationPage = new Map(implementation.runtimeCorrelation.pages.map((entry) => [entry.semanticPageId, entry.pageGuid]));
  const nativePages = implementation.pages.filter((page): page is Extract<typeof page, { compatibility: "native" }> => page.compatibility === "native")
    .slice().sort((left, right) => compareCreativeIdentifiers(left.id, right.id));
  const controls = topologicalControls(nativePages);
  const tableSourceByEntityId = validateTableBindings(semanticPlan, controls);
  const deltaProjectionByControl = new Map(controls.map((control) => [control.id, existingDeltaProjection(control)]));
  const usedAssetIds = new Set(controls.flatMap((control) => control.assetIds ?? []));
  for (const assetId of assets.keys()) {
    if (!usedAssetIds.has(assetId)) fail("CREATIVE_ASSET_UNUSED", assetId);
  }
  const expectedRoleStyles = Object.fromEntries(semanticPlan.roleStyles.map((style) => [style.role,
    resolveStyle(semanticPlan.theme, { role: style.role, declarations: style.declarations, states: style.states }, EMPTY_STYLE),
  ]));
  if (canonicalServerHash(implementation.compiledRoleStyles) !== canonicalServerHash(expectedRoleStyles)) {
    fail("CREATIVE_COMPILED_ROLE_STYLE_MISMATCH", "compiled role styles differ from authoritative resolver output");
  }
  const pageByControl = new Map(nativePages.flatMap((page) => page.controls.map((control) => [control.id, page] as const)));
  const styleRecords = new Map(controls.map((control) => {
    if (getControlCapability(control.capabilityId) === undefined) fail("CREATIVE_CAPABILITY_UNSUPPORTED", control.capabilityId);
    const approved = [...(control.assetIds ?? [])].sort(compareCreativeIdentifiers)
      .map((assetId) => assets.get(assetId) ?? fail("CREATIVE_ASSET_NOT_APPROVED", assetId));
    const styleRole = control.style?.role ?? control.role;
    const roleStyle = semanticPlan.roleStyles.find((style) => style.role === styleRole)
      ?? { role: styleRole, declarations: {}, states: {} };
    const compiled = compileResolvedStyle({ componentId: control.id, capabilityId: control.capabilityId,
      theme: semanticPlan.theme, styleRole, roleStyle, instanceOverride: control.style ?? EMPTY_STYLE,
      approvedAssets: approved.map((asset) => asset.approvedAsset), runtimeProfile: KF36_RUNTIME_PROFILE });
    const compiledStyle = { nativeFields: compiled.nativeFields, cssFragments: compiled.cssFragments,
      warnings: compiled.warnings.map((warning) => ({ code: warning.code, message: warning.message })) };
    if (control.compiledStyle === undefined || canonicalServerHash(control.compiledStyle) !== canonicalServerHash(compiledStyle)) {
      fail("CREATIVE_COMPILED_STYLE_MISMATCH", control.id);
    }
    return [control.id, { approved, compiledStyle,
      structuredStyle: resolveStyle(semanticPlan.theme, roleStyle, control.style ?? EMPTY_STYLE) }] as const;
  }));
  const evidence = {
    pages: nativePages.map((page) => ({
      source: pageSource.get(page.id)?.source ?? "workspace-derived" as const,
      semanticPageId: page.id,
      pageGuid: correlationPage.get(page.id)!,
    })),
    controls: controls.map((control) => {
      const page = pageByControl.get(control.id)!;
      const verified = controlSource.get(control.id);
      const source = verified?.source ?? "workspace-derived" as const;
      return {
        source, semanticControlId: control.id, semanticPageId: page.id,
        pageGuid: correlationPage.get(page.id)!, instanceName: correlationControl.get(control.id)!,
        ...(source === "uploaded-existing" ? { nativeGuid: verified!.nativeGuid!, ...deltaProjectionByControl.get(control.id)! } : {}),
      };
    }),
    stylesData: controls.map((control) => ({
      semanticControlId: control.id, structuredStyle: styleRecords.get(control.id)!.structuredStyle,
      approvedAssets: styleRecords.get(control.id)!.approved,
    })),
    verifiedAssets: [...verifiedAssets].sort((left, right) => compareCreativeIdentifiers(left.assetId, right.assetId)),
  };
  const artifact = CreativeBuildArtifactSchema.parse({
    schema: "kf-creative-build-artifact/v1", blueprint, candidateBundle, semanticPlan, implementation, evidence, compilerVersion, evidenceVersion,
    hashes: {
      blueprintHash: canonicalServerHash(blueprint), candidateBundleHash: canonicalServerHash(candidateBundle),
      semanticPlanHash: canonicalServerHash(semanticPlan), implementationHash: canonicalServerHash(implementation), evidenceHash: canonicalServerHash(evidence),
    },
  });
  const artifactHash = canonicalCreativeBuildArtifactHash(artifact);
  const operations: ChangeOperation[] = [];
  const materializedPages = nativePages.map((page, order) => {
    const pageGuid = correlationPage.get(page.id)!; const source = pageSource.get(page.id)?.source ?? "workspace-derived";
    operations.push(source === "workspace-derived"
      ? { op: "create", entityType: "page", entityId: page.id, properties: { width: page.width, height: page.height } }
      : { op: "update", entityType: "page", entityId: page.id, changes: [{ path: "/pageViewWidth", value: page.width }, { path: "/pageViewHeight", value: page.height }] });
    return { source, semanticPageId: page.id, pageGuid, width: page.width, height: page.height, order };
  });
  const assetBindings: ChangePlanAssetBinding[] = [];
  const materializedControls = controls.map((control, order) => {
    if (getControlCapability(control.capabilityId) === undefined) fail("CREATIVE_CAPABILITY_UNSUPPORTED", control.capabilityId);
    const page = pageByControl.get(control.id)!; const pageGuid = correlationPage.get(page.id)!; const instanceName = correlationControl.get(control.id)!;
    const verified = controlSource.get(control.id); const source = verified?.source ?? "workspace-derived";
    const compiledNativeFields = styleRecords.get(control.id)!.compiledStyle.nativeFields;
    const semanticNativeProperties = { ...control.nativeProperties };
    for (const [key, value] of Object.entries(compiledNativeFields)) {
      if (!Object.hasOwn(semanticNativeProperties, key)
        || canonicalServerHash(semanticNativeProperties[key]) !== canonicalServerHash(value)) fail("CREATIVE_COMPILED_STYLE_MISMATCH", `${control.id}.${key}`);
      delete semanticNativeProperties[key];
    }
    const nativeProperties = { ...validateGeneratedComponentProperties(control.capabilityId, semanticNativeProperties), ...compiledNativeFields };
    const parentInstanceName = control.parentId === undefined ? undefined : correlationControl.get(control.parentId);
    const variant = nativeControlVariantForCapability(control.capabilityId);
    if (source === "workspace-derived") operations.push({ op: "create", entityType: "control", entityId: control.id, properties: {
      semanticPageId: page.id, ...variant, ...control.geometry, zIndex: control.zIndex,
      ...(control.compiledLayout === undefined ? {} : { compiledLayout: control.compiledLayout }),
      ...(control.overlayHost === undefined ? {} : { overlayHost: control.overlayHost }),
      ...nativeProperties, ...(control.content === undefined ? {} : { text: control.content }),
    } });
    else operations.push({ op: "update", entityType: "control", entityId: control.id, changes: deltaProjectionByControl.get(control.id)!.existingDeltas });
    for (const assetId of control.assetIds ?? []) {
      const asset = assets.get(assetId); if (asset === undefined) fail("CREATIVE_ASSET_NOT_APPROVED", assetId);
      if (control.capabilityId === "image") {
        assetBindings.push({ assetId, ...asset.approvedAsset, entityId: control.id, controlId: control.id, capabilityId: "image" });
      }
    }
    return { source, semanticControlId: control.id, sourceSolutionNodeId: control.sourceSolutionNodeId, semanticPageId: page.id, pageGuid, instanceName, capabilityId: control.capabilityId,
      ...(control.parentId === undefined ? {} : { parentSemanticControlId: control.parentId, parentInstanceName }),
      depth: control.depth, zIndex: control.zIndex, order, geometry: control.geometry,
      ...(control.compiledLayout === undefined ? {} : { compiledLayout: control.compiledLayout }),
      ...(control.overlayHost === undefined ? {} : { overlayHost: control.overlayHost }),
      nativeProperties, ...(control.content === undefined ? {} : { content: control.content }),
      ...(source === "uploaded-existing" ? { nativeGuid: verified!.nativeGuid, existingDeltas: deltaProjectionByControl.get(control.id)!.existingDeltas } : {}) };
  });
  const stylesData = controls.map((control) => {
    const styleRecord = styleRecords.get(control.id)!;
    return { semanticControlId: control.id, instanceName: correlationControl.get(control.id)!,
      structuredStyle: styleRecord.structuredStyle, compiledStyle: styleRecord.compiledStyle,
      ...(control.dataBinding === undefined ? {} : { dataBinding: control.dataBinding }), approvedAssets: styleRecord.approved };
  });
  const eventBindings = implementation.pages.flatMap((page) => page.compatibility === "native" ? page.controls.flatMap((control) => control.eventBindings) : []);
  const materialization = TrustedNativeMaterializationSchema.parse({
    schema: "kf-trusted-native-materialization/v1", workspaceId, baseRevisionId, creativeArtifactHash: artifactHash,
    implementationHash: artifact.hashes.implementationHash, pages: materializedPages, controls: materializedControls, stylesData,
    interactions: { actions: implementation.compiledActions, scripts: implementation.compiledScripts, eventBindings },
  });
  validateCreativeArtifactMaterializationProjection(artifact, materialization);
  const plan = internalChangePlanSchema.parse({ schema: "kf-change-plan/v1", workspaceId, operations,
    ...(assetBindings.length === 0 ? {} : { assetBindings }), creative: { artifactHash, materializationHash: canonicalTrustedNativeMaterializationHash(materialization) } });
  const semanticOperations = semanticOperationsForActualPlan(plan, tableSourceByEntityId);
  const selectedCapabilities = [...new Set(controls.map((control) => control.capabilityId))].sort();
  const full: string[] = [];
  const partial: string[] = [];
  selectedCapabilities.forEach((capabilityId) => {
    const capability = getControlCapability(capabilityId) ?? fail("CREATIVE_CAPABILITY_UNSUPPORTED", capabilityId);
    const fullyVerified = capability.runtimeVerification.status === "verified"
      && [capability.generation, capability.style, capability.preview, capability.dataBinding, capability.interaction]
        .every((dimension) => dimension.status === "full");
    (fullyVerified ? full : partial).push(capabilityId);
  });
  const capabilityReport: CapabilityReport = {
    status: partial.length === 0 ? "pass" : "warning",
    full,
    partial,
    unsupported: [],
    deliveryGaps: [],
  };
  const trustedCreativePayload = issuer.issue({ plan, artifact, materialization });
  return deepFreeze({ plan, semanticOperations, capabilityReport, verifiedAssets, artifact, materialization, trustedCreativePayload });
}

export function createCreativeUIImplementationV2Compiler(
  issuer: ServerScopedCreativePayloadIssuer,
): CreativeUIImplementationV2CompilerBundle {
  if (typeof issuer !== "object" || issuer === null || utilTypes.isProxy(issuer)) {
    fail("CREATIVE_ISSUER_PROXY_FORBIDDEN", "issuer must be a non-proxy server capability");
  }
  let issuerPrototype: unknown; let issuerKeys: PropertyKey[]; let issueDescriptor: PropertyDescriptor | undefined;
  try {
    issuerPrototype = Object.getPrototypeOf(issuer) as unknown;
    issuerKeys = Reflect.ownKeys(issuer);
    issueDescriptor = Object.getOwnPropertyDescriptor(issuer, "issue");
  } catch {
    return fail("CREATIVE_ISSUER_INSPECTION_FAILED", "issuer reflection failed");
  }
  if (issuerPrototype !== Object.prototype || issuerKeys.length !== 1 || issuerKeys[0] !== "issue"
    || issueDescriptor === undefined || !("value" in issueDescriptor) || typeof issueDescriptor.value !== "function") {
    fail("CREATIVE_ISSUER_ACCESSOR_FORBIDDEN", "issuer must expose one own data method");
  }
  const verifiedAssetPayloads = new WeakMap<object, Readonly<{ workspaceId: string; assets: readonly VerifiedCreativeAsset[] }>>();
  const assetProofResolver: CreativeAssetProofResolver = Object.freeze({
    attestResolvedAssets(input: { readonly workspaceId: string; readonly assets: unknown }): VerifiedCreativeAssetProofHandle {
      const cloned = safeClone(input) as { workspaceId?: unknown; assets?: unknown };
      if (cloned === null || typeof cloned !== "object" || Object.keys(cloned).length !== 2
        || typeof cloned.workspaceId !== "string" || cloned.workspaceId.trim() !== cloned.workspaceId
        || cloned.workspaceId.length < 1 || cloned.workspaceId.length > 100 || !Array.isArray(cloned.assets)) {
        fail("CREATIVE_ASSET_INVALID", "resolved asset attestation input is invalid");
      }
      const verifiedAssets = cloned.assets.map((entry) => VerifiedCreativeAssetSchema.parse(entry))
        .sort((left, right) => compareCreativeIdentifiers(left.assetId, right.assetId));
      const seen = new Set<string>();
      for (const asset of verifiedAssets) {
        if (seen.has(asset.assetId) || modelAssetIdToWorkspaceAssetId(asset.assetId) !== asset.approvedAsset.workspaceAssetId) {
          fail("CREATIVE_ASSET_INVALID", asset.assetId);
        }
        seen.add(asset.assetId);
        ApprovedAssetFactsSchema.parse(asset.approvedAsset);
      }
      const handle = Object.freeze(Object.create(null)) as VerifiedCreativeAssetProofHandle;
      verifiedAssetPayloads.set(handle, deepFreeze({ workspaceId: cloned.workspaceId, assets: verifiedAssets }));
      return handle;
    },
  });
  const compiler: CreativeUIImplementationV2Compiler = Object.freeze({
    compile(input: CompileCreativeUIImplementationV2Input): CreativeUIImplementationV2CompileResult {
      return compileCreativeUIImplementationV2(input, issuer, verifiedAssetPayloads);
    },
  });
  return Object.freeze({ compiler, assetProofResolver });
}
