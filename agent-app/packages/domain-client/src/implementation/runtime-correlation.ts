import { createHash } from "node:crypto";
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { MAX_NATIVE_DEVELOPMENT_NAME_LENGTH } from "../compile/native-page-name.js";
// end
import { types as utilTypes } from "node:util";
import {
  CompilerInstanceNameSchema,
  CompilerPageGuidSchema,
  UIImplementationSpecV2Schema,
  type UIImplementationSpecV2,
} from "@kf/contracts";
import { deriveGuid } from "../compile/guid-factory.js";
import {
  serverOwnedRuntimeIdentitySnapshot,
  type InspectResult,
  type ServerOwnedNativeControlType,
} from "../inspect/client-inspector.js";
import { sameNativeRuntimeControlType, type NativeRuntimeControlType } from "../inspect/native-runtime-type.js";

export type ExistingRuntimeSource = "uploaded-existing" | "workspace-derived";
export interface ExistingControlRuntimeDisposition { readonly source: ExistingRuntimeSource; readonly semanticControlId: string; readonly instanceName: string }
export interface ExistingPageRuntimeDisposition { readonly source: ExistingRuntimeSource; readonly semanticPageId: string; readonly pageGuid: string }
export interface ExistingRuntimeCorrelationDisposition {
  readonly controls: readonly ExistingControlRuntimeDisposition[];
  readonly pages: readonly ExistingPageRuntimeDisposition[];
}
declare const verifiedRuntimeCorrelationBrand: unique symbol;
export interface VerifiedExistingRuntimeCorrelationHandle { readonly [verifiedRuntimeCorrelationBrand]: true }
export interface VerifyExistingRuntimeCorrelationInput {
  readonly workspaceId: string;
  readonly baseRevisionId: string;
  readonly inspection: InspectResult;
  readonly correlations: ExistingRuntimeCorrelationDisposition;
}
export interface AttachRuntimeCorrelationInput {
  readonly workspaceId: string;
  readonly baseRevisionId: string;
  readonly implementation: UIImplementationSpecV2;
  readonly semanticStateIds?: readonly string[];
  readonly verifiedExisting?: VerifiedExistingRuntimeCorrelationHandle;
}
export interface VerifiedExistingRuntimeCorrelationProjection {
  readonly controls: readonly Readonly<ExistingControlRuntimeDisposition & { readonly nativeGuid?: string; readonly pageGuid?: string }>[];
  readonly pages: readonly Readonly<ExistingPageRuntimeDisposition>[];
}

export class RuntimeCorrelationError extends Error {
  constructor(message: string) { super(message); this.name = "RuntimeCorrelationError"; }
}

interface CanonicalDisposition {
  readonly controls: readonly Readonly<ExistingControlRuntimeDisposition>[];
  readonly pages: readonly Readonly<ExistingPageRuntimeDisposition>[];
}
interface VerifiedDispositionPayload {
  readonly workspaceId: string;
  readonly baseRevisionId: string;
  readonly inspectedControls: readonly {
    readonly guid: string;
    readonly pageGuid: string;
    readonly name: string;
    readonly nativeType: ServerOwnedNativeControlType;
  }[];
  readonly disposition: CanonicalDisposition;
}
const verifiedDispositionByHandle = new WeakMap<object, VerifiedDispositionPayload>();
const MAX_INPUT_DEPTH = 96;
const MAX_INPUT_NODES = 1_500_000;
const MAX_ARRAY_LENGTH = 10_000;
const MAX_OBJECT_KEYS = 512;
const MAX_STRING_CODE_UNITS = 20_000_000;
const KF_PAGE_GUID = /^k[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fail(code: string, detail: string): never { throw new RuntimeCorrelationError(`${code}: ${detail}`); }
function inspected<T>(operation: () => T): T {
  try { return operation(); } catch (error) {
    if (error instanceof RuntimeCorrelationError) throw error;
    fail("INPUT_INSPECTION_FAILED", error instanceof Error ? error.message : "unknown inspection failure");
  }
}
function rejectProxy(value: unknown): void {
  if (typeof value === "object" && value !== null && utilTypes.isProxy(value)) fail("INPUT_PROXY_FORBIDDEN", "proxy values are not allowed");
}

function clonePlainData(input: unknown): unknown {
  const budget = { nodes: 0, stringCodeUnits: 0 };
  const seen = new WeakSet<object>();
  const clone = (value: unknown, depth: number): unknown => {
    budget.nodes += 1;
    if (budget.nodes > MAX_INPUT_NODES) fail("INPUT_BUDGET_EXCEEDED", "node budget exceeded");
    if (depth > MAX_INPUT_DEPTH) fail("INPUT_BUDGET_EXCEEDED", "depth budget exceeded");
    if (value === null || value === undefined || typeof value === "boolean") return value;
    if (typeof value === "number") {
      if (!Number.isFinite(value)) fail("INPUT_NON_PLAIN_DATA", "numbers must be finite");
      return value;
    }
    if (typeof value === "string") {
      budget.stringCodeUnits += value.length;
      if (budget.stringCodeUnits > MAX_STRING_CODE_UNITS) fail("INPUT_BUDGET_EXCEEDED", "string budget exceeded");
      return value;
    }
    if (typeof value !== "object") fail("INPUT_NON_PLAIN_DATA", `unsupported ${typeof value} value`);
    rejectProxy(value);
    if (seen.has(value)) fail("INPUT_ALIAS_FORBIDDEN", "cycles and shared object aliases are not allowed");
    seen.add(value);
    const prototype: unknown = inspected(() => Object.getPrototypeOf(value) as unknown);
    const keys = inspected(() => Reflect.ownKeys(value));
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) fail("INPUT_NON_PLAIN_DATA", "array prototype is not allowed");
      if (value.length > MAX_ARRAY_LENGTH) fail("INPUT_BUDGET_EXCEEDED", "array length exceeded");
      const cloned: unknown[] = [];
      for (const key of keys) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length) fail("INPUT_NON_PLAIN_DATA", "array properties must be dense numeric indices");
        const descriptor = inspected(() => Object.getOwnPropertyDescriptor(value, key));
        if (descriptor === undefined || !("value" in descriptor)) fail("INPUT_ACCESSOR_FORBIDDEN", String(key));
        if (descriptor.enumerable !== true) fail("INPUT_NON_PLAIN_DATA", `non-enumerable array entry ${key}`);
      }
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = inspected(() => Object.getOwnPropertyDescriptor(value, String(index)));
        if (descriptor === undefined) fail("INPUT_NON_PLAIN_DATA", `sparse array entry ${index}`);
        if (!("value" in descriptor)) fail("INPUT_ACCESSOR_FORBIDDEN", String(index));
        cloned.push(clone(descriptor.value, depth + 1));
      }
      return cloned;
    }
    if (prototype !== Object.prototype && prototype !== null) fail("INPUT_NON_PLAIN_DATA", "object prototype is not allowed");
    if (keys.length > MAX_OBJECT_KEYS) fail("INPUT_BUDGET_EXCEEDED", "object key budget exceeded");
    const cloned: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const key of keys) {
      if (typeof key !== "string") fail("INPUT_NON_PLAIN_DATA", "symbol keys are not allowed");
      const descriptor = inspected(() => Object.getOwnPropertyDescriptor(value, key));
      if (descriptor === undefined || !("value" in descriptor)) fail("INPUT_ACCESSOR_FORBIDDEN", key);
      if (descriptor.enumerable !== true) fail("INPUT_NON_PLAIN_DATA", `non-enumerable property ${key}`);
      cloned[key] = clone(descriptor.value, depth + 1);
    }
    return cloned;
  };
  return clone(input, 0);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) fail("INPUT_INVALID", `${path} must be an object`);
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, expected: readonly string[], path: string): void {
  const actual = Object.keys(value).sort(); const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) fail("INPUT_INVALID", `${path} must contain exactly ${wanted.join(", ")}`);
}
function rootDescriptors(input: unknown, allowedKeys: readonly string[], path: string): Map<string, unknown> {
  rejectProxy(input);
  if (input === null || typeof input !== "object" || Array.isArray(input)) fail("INPUT_INVALID", `${path} must be an object`);
  const prototype: unknown = inspected(() => Object.getPrototypeOf(input) as unknown);
  if (prototype !== Object.prototype && prototype !== null) fail("INPUT_NON_PLAIN_DATA", `${path} prototype is not allowed`);
  const keys = inspected(() => Reflect.ownKeys(input));
  if (keys.some((key) => typeof key !== "string") || keys.length > allowedKeys.length || keys.some((key) => typeof key === "string" && !allowedKeys.includes(key))) fail("INPUT_INVALID", `${path} has unknown properties`);
  const values = new Map<string, unknown>();
  keys.forEach((key) => {
    if (typeof key !== "string") return;
    const descriptor = inspected(() => Object.getOwnPropertyDescriptor(input, key));
    if (descriptor === undefined || !("value" in descriptor)) fail("INPUT_ACCESSOR_FORBIDDEN", `${path}.${key}`);
    if (descriptor.enumerable !== true) fail("INPUT_NON_PLAIN_DATA", `${path}.${key} must be enumerable`);
    values.set(key, descriptor.value);
  });
  return values;
}
function nonEmptyString(value: unknown, path: string, maximum = 200): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.trim() !== value) fail("INPUT_INVALID", `${path} must be a bounded non-empty string without surrounding whitespace`);
  return value;
}
interface RuntimeCapabilityDescriptor {
  readonly prefix: string;
  readonly acceptedNativeTypes: readonly NativeRuntimeControlType[];
}
const staticDescriptor = (prefix: string, uiModelType: number): RuntimeCapabilityDescriptor =>
  Object.freeze({ prefix, acceptedNativeTypes: Object.freeze([Object.freeze({ kind: "static" as const, uiModelType })]) });
const easyuiDescriptor = (prefix: string, uiExtendType: number): RuntimeCapabilityDescriptor =>
  Object.freeze({ prefix, acceptedNativeTypes: Object.freeze([Object.freeze({ kind: "easyui" as const, objectType: 3 as const, uiExtendType })]) });
const layoutDescriptor = (layoutType: number): RuntimeCapabilityDescriptor =>
  Object.freeze({
    prefix: "Layout",
    acceptedNativeTypes: Object.freeze([
      Object.freeze({ kind: "layout" as const, objectType: 2 as const, layoutType }),
      Object.freeze({ kind: "layout" as const, objectType: null, layoutType }),
    ]),
  });
const RUNTIME_CAPABILITY_DESCRIPTORS: Readonly<Record<string, RuntimeCapabilityDescriptor>> = Object.freeze({
  button: staticDescriptor("Button", 35), checkbox: staticDescriptor("Checkbox", 37), datetimepicker: staticDescriptor("Datetimepicker", 40),
  "easyui.1": easyuiDescriptor("Datagrid", 1), datagrid: easyuiDescriptor("Datagrid", 1), "easyui.2": easyuiDescriptor("LinkButton", 2),
  "easyui.6": easyuiDescriptor("Searchbox", 6), "easyui.12": easyuiDescriptor("Dialog", 12), "easyui.18": easyuiDescriptor("Treegrid", 18),
  "easyui.19": easyuiDescriptor("Window", 19), "easyui.22": easyuiDescriptor("Pagination", 22), image: staticDescriptor("Image", 41),
  input: staticDescriptor("Input", 38), inputnumber: staticDescriptor("InputNumber", 49), list: staticDescriptor("List", 9),
  navmenu: staticDescriptor("Navmenu", 34), radio: staticDescriptor("Radio", 36), richtext: staticDescriptor("RichText", 7),
  select: staticDescriptor("Select", 44), switch: staticDescriptor("Switch", 48), tabs: staticDescriptor("Tabs", 47),
  tag: staticDescriptor("Tag", 50), text: staticDescriptor("Text", 6), tree: staticDescriptor("Tree", 32),
  "layout.2": layoutDescriptor(2), "layout.4": layoutDescriptor(4), "layout.5": layoutDescriptor(5),
});
function runtimeDescriptor(capabilityId: string): RuntimeCapabilityDescriptor {
  const descriptor = RUNTIME_CAPABILITY_DESCRIPTORS[capabilityId];
  if (descriptor === undefined) fail("RUNTIME_PREFIX_UNSUPPORTED", capabilityId);
  return descriptor;
}
function runtimeInstanceName(workspaceId: string, semanticControlId: string, capabilityId: string): string {
  const digest = createHash("sha256")
    .update("kf-runtime-control\0", "utf8").update(workspaceId, "utf8").update("\0", "utf8")
    .update(semanticControlId, "utf8").update("\0", "utf8").update(capabilityId, "utf8").digest("hex");
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  const prefix = runtimeDescriptor(capabilityId).prefix;
  const suffix = BigInt(`0x${digest}`).toString(10).slice(0, MAX_NATIVE_DEVELOPMENT_NAME_LENGTH - prefix.length);
  return `${prefix}${suffix}`;
  // end
}
function acceptsNativeType(descriptor: RuntimeCapabilityDescriptor, actual: ServerOwnedNativeControlType): boolean {
  if (actual.kind === "malformed") return false;
  return descriptor.acceptedNativeTypes.some((expected) => sameNativeRuntimeControlType(actual, expected));
}
function runtimePageGuid(workspaceId: string, semanticPageId: string): string { return `k${deriveGuid({ seed: workspaceId }, semanticPageId)}`; }

/** Derives a bounded compiler-owned KF variable name from exact semantic identity. */
export function runtimeVariableName(workspaceId: string, stateId: string): string {
  const exactWorkspaceId = nonEmptyString(workspaceId, "workspaceId");
  const exactStateId = nonEmptyString(stateId, "semanticStateId", 100);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(exactStateId)) fail("INVALID_SEMANTIC_STATE_ID", exactStateId);
  const prefix = exactStateId.toLocaleLowerCase("en-US").replace(/[-_]+/g, "_").slice(0, 80);
  const digest = createHash("sha256").update(exactWorkspaceId, "utf8").update("\0", "utf8")
    .update(exactStateId, "utf8").digest("hex").slice(0, 12);
  return `$kf_${prefix}_${digest}`;
}

function parseDisposition(raw: unknown): CanonicalDisposition {
  const root = record(raw, "correlations"); exactKeys(root, ["controls", "pages"], "correlations");
  if (!Array.isArray(root.controls) || !Array.isArray(root.pages)) fail("INPUT_INVALID", "correlation collections must be arrays");
  const controls: ExistingControlRuntimeDisposition[] = []; const pages: ExistingPageRuntimeDisposition[] = [];
  const semanticControls = new Set<string>(); const semanticPages = new Set<string>(); const instances = new Set<string>(); const pageGuids = new Set<string>();
  root.controls.forEach((candidate, index) => {
    const entry = record(candidate, `correlations.controls[${index}]`); exactKeys(entry, ["source", "semanticControlId", "instanceName"], `correlations.controls[${index}]`);
    if (entry.source !== "uploaded-existing" && entry.source !== "workspace-derived") fail("INPUT_INVALID", `invalid control source at ${index}`);
    const semanticControlId = nonEmptyString(entry.semanticControlId, `correlations.controls[${index}].semanticControlId`, 100);
    const instanceName = nonEmptyString(entry.instanceName, `correlations.controls[${index}].instanceName`, 100);
    const parsedName = CompilerInstanceNameSchema.safeParse(instanceName);
    if (!parsedName.success || parsedName.data !== instanceName) fail("INVALID_INSTANCE_NAME", semanticControlId);
    const foldedSemantic = semanticControlId.toLowerCase(); const foldedInstance = instanceName.toLowerCase();
    if (semanticControls.has(foldedSemantic)) fail("DUPLICATE_CORRELATION", `control ${semanticControlId}`);
    if (instances.has(foldedInstance)) fail("RUNTIME_IDENTITY_ALIAS", `control ${instanceName}`);
    semanticControls.add(foldedSemantic); instances.add(foldedInstance); controls.push({ source: entry.source, semanticControlId, instanceName });
  });
  root.pages.forEach((candidate, index) => {
    const entry = record(candidate, `correlations.pages[${index}]`); exactKeys(entry, ["source", "semanticPageId", "pageGuid"], `correlations.pages[${index}]`);
    if (entry.source !== "uploaded-existing" && entry.source !== "workspace-derived") fail("INPUT_INVALID", `invalid page source at ${index}`);
    const semanticPageId = nonEmptyString(entry.semanticPageId, `correlations.pages[${index}].semanticPageId`, 100);
    const pageGuid = nonEmptyString(entry.pageGuid, `correlations.pages[${index}].pageGuid`, 100);
    if (entry.source === "workspace-derived") {
      if (!KF_PAGE_GUID.test(pageGuid)) fail("INVALID_PAGE_GUID", semanticPageId);
    } else if (!CompilerPageGuidSchema.safeParse(pageGuid).success) fail("INVALID_PAGE_GUID", semanticPageId);
    const foldedSemantic = semanticPageId.toLowerCase(); const foldedGuid = pageGuid.toLowerCase();
    if (semanticPages.has(foldedSemantic)) fail("DUPLICATE_CORRELATION", `page ${semanticPageId}`);
    if (pageGuids.has(foldedGuid)) fail("RUNTIME_IDENTITY_ALIAS", `page ${pageGuid}`);
    semanticPages.add(foldedSemantic); pageGuids.add(foldedGuid); pages.push({ source: entry.source, semanticPageId, pageGuid });
  });
  controls.sort((a, b) => a.semanticControlId.localeCompare(b.semanticControlId, "en-US")); pages.sort((a, b) => a.semanticPageId.localeCompare(b.semanticPageId, "en-US"));
  return deepFreeze({ controls, pages });
}

/** Verifies uploaded identities against a server-produced inspector result and returns an opaque runtime handle. */
export function verifyExistingRuntimeCorrelation(input: VerifyExistingRuntimeCorrelationInput): VerifiedExistingRuntimeCorrelationHandle {
  const values = rootDescriptors(input, ["workspaceId", "baseRevisionId", "inspection", "correlations"], "$input");
  if (!values.has("workspaceId") || !values.has("baseRevisionId") || !values.has("inspection") || !values.has("correlations")) fail("INPUT_INVALID", "verification input is incomplete");
  const workspaceId = nonEmptyString(values.get("workspaceId"), "workspaceId");
  const baseRevisionId = nonEmptyString(values.get("baseRevisionId"), "baseRevisionId");
  const inspection = values.get("inspection");
  if (inspection === null || typeof inspection !== "object") fail("UNTRUSTED_INSPECTION", "inspection was not produced by inspectClientProject");
  const identitySnapshot = serverOwnedRuntimeIdentitySnapshot(inspection as InspectResult);
  if (identitySnapshot === undefined) fail("UNTRUSTED_INSPECTION", "inspection was not produced by inspectClientProject");
  if (identitySnapshot.runtimeBinding?.workspaceId !== workspaceId
    || identitySnapshot.runtimeBinding.baseRevisionId !== baseRevisionId) {
    fail("INSPECTION_BINDING_MISMATCH", `${workspaceId}/${baseRevisionId}`);
  }
  const disposition = parseDisposition(clonePlainData(values.get("correlations")));
  disposition.controls.filter((entry) => entry.source === "uploaded-existing").forEach((entry) => {
    const exact = identitySnapshot.controls.filter((control) => control.name === entry.instanceName);
    const folded = identitySnapshot.controls.filter((control) => control.name.toLowerCase() === entry.instanceName.toLowerCase());
    if (exact.length !== 1 || folded.length !== 1) fail("UPLOADED_ENTITY_MISMATCH", `control ${entry.semanticControlId}`);
  });
  disposition.pages.filter((entry) => entry.source === "uploaded-existing").forEach((entry) => {
    const exact = identitySnapshot.pageGuids.filter((guid) => guid === entry.pageGuid);
    const folded = identitySnapshot.pageGuids.filter((guid) => guid.toLowerCase() === entry.pageGuid.toLowerCase());
    if (exact.length !== 1 || folded.length !== 1) fail("UPLOADED_ENTITY_MISMATCH", `page ${entry.semanticPageId}`);
  });
  const handle = Object.freeze(Object.create(null)) as VerifiedExistingRuntimeCorrelationHandle;
  verifiedDispositionByHandle.set(handle, Object.freeze({
    workspaceId, baseRevisionId, inspectedControls: identitySnapshot.controls, disposition,
  }));
  return handle;
}

function assertExactSemanticDisposition(disposition: CanonicalDisposition, controlIds: readonly string[], pageIds: readonly string[]): void {
  const expectedControls = [...controlIds].sort(); const expectedPages = [...pageIds].sort();
  const actualControls = disposition.controls.map((entry) => entry.semanticControlId); const actualPages = disposition.pages.map((entry) => entry.semanticPageId);
  const missing = expectedControls.find((id) => !actualControls.includes(id)) ?? expectedPages.find((id) => !actualPages.includes(id));
  if (missing !== undefined) fail("MISSING_CORRELATION", missing);
  const unknown = actualControls.find((id) => !expectedControls.includes(id)) ?? actualPages.find((id) => !expectedPages.includes(id));
  if (unknown !== undefined) fail("UNKNOWN_CORRELATION", unknown);
}
function assertNoSemanticCaseAliases(values: readonly string[]): void {
  const folded = new Set<string>(); values.forEach((value) => { const key = value.toLowerCase(); if (folded.has(key)) fail("SEMANTIC_CASE_ALIAS", value); folded.add(key); });
}
function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Reflect.ownKeys(value).forEach((key) => { const descriptor = Object.getOwnPropertyDescriptor(value, key); if (descriptor !== undefined && "value" in descriptor) deepFreeze(descriptor.value); });
    Object.freeze(value);
  }
  return value;
}

/** Compiler-only projection from the opaque Task-2 proof; never accepts plain disposition data. */
export function readVerifiedExistingRuntimeCorrelation(
  handle: VerifiedExistingRuntimeCorrelationHandle,
  workspaceId: string,
  baseRevisionId: string,
): VerifiedExistingRuntimeCorrelationProjection {
  const payload = handle !== null && typeof handle === "object" ? verifiedDispositionByHandle.get(handle) : undefined;
  if (payload === undefined) fail("INVALID_VERIFIED_HANDLE", "verifiedExisting was not issued by the verifier");
  if (payload.workspaceId !== workspaceId || payload.baseRevisionId !== baseRevisionId) {
    fail("VERIFIED_IDENTITY_MISMATCH", `${workspaceId}/${baseRevisionId}`);
  }
  return deepFreeze({
    controls: payload.disposition.controls.map((entry) => {
      if (entry.source !== "uploaded-existing") return { ...entry };
      const inspectedControl = payload.inspectedControls.find((control) => control.name === entry.instanceName);
      if (inspectedControl === undefined) fail("UPLOADED_ENTITY_MISMATCH", entry.semanticControlId);
      return { ...entry, nativeGuid: inspectedControl.guid, pageGuid: inspectedControl.pageGuid };
    }),
    pages: payload.disposition.pages.map((entry) => ({ ...entry })),
  });
}

/** Attaches server-owned KF runtime identities before interaction compilation. */
export function attachRuntimeCorrelation(input: AttachRuntimeCorrelationInput): UIImplementationSpecV2 {
  const root = rootDescriptors(input, ["workspaceId", "baseRevisionId", "implementation", "semanticStateIds", "verifiedExisting"], "$input");
  if (!root.has("workspaceId") || !root.has("baseRevisionId") || !root.has("implementation")) fail("INPUT_INVALID", "attach input is incomplete");
  let verifiedPayload: VerifiedDispositionPayload | undefined;
  if (root.has("verifiedExisting")) {
    const handle = root.get("verifiedExisting");
    if (typeof handle !== "object" || handle === null || (verifiedPayload = verifiedDispositionByHandle.get(handle)) === undefined) fail("INVALID_VERIFIED_HANDLE", "verifiedExisting was not issued by the verifier");
  }
  const safe = record(clonePlainData({
    workspaceId: root.get("workspaceId"),
    baseRevisionId: root.get("baseRevisionId"),
    implementation: root.get("implementation"),
    ...(root.has("semanticStateIds") ? { semanticStateIds: root.get("semanticStateIds") } : {}),
  }), "$input");
  const workspaceId = nonEmptyString(safe.workspaceId, "workspaceId");
  const baseRevisionId = nonEmptyString(safe.baseRevisionId, "baseRevisionId");
  if (verifiedPayload !== undefined && (verifiedPayload.workspaceId !== workspaceId || verifiedPayload.baseRevisionId !== baseRevisionId)) {
    fail("VERIFIED_IDENTITY_MISMATCH", `${workspaceId}/${baseRevisionId}`);
  }
  const verified = verifiedPayload?.disposition;
  const rawImplementation = record(safe.implementation, "implementation");
  if (rawImplementation.compatibility !== "native") fail("NATIVE_IMPLEMENTATION_REQUIRED", "adapted-v1 is not supported");
  const hasBindings = Array.isArray(rawImplementation.pages) && rawImplementation.pages.some((page) => {
    const candidate = page !== null && typeof page === "object" ? page as Record<string, unknown> : {};
    return Array.isArray(candidate.controls) && candidate.controls.some((control) => {
      const nativeControl = control !== null && typeof control === "object" ? control as Record<string, unknown> : {};
      return Array.isArray(nativeControl.eventBindings) && nativeControl.eventBindings.length > 0;
    });
  });
  if ((Array.isArray(rawImplementation.compiledActions) && rawImplementation.compiledActions.length > 0) || (Array.isArray(rawImplementation.compiledScripts) && rawImplementation.compiledScripts.length > 0) || hasBindings) fail("INTERACTIONS_ALREADY_COMPILED", "runtime correlation must precede interaction compilation");
  const priorCorrelation = rawImplementation.runtimeCorrelation; const candidate = { ...rawImplementation }; delete candidate.runtimeCorrelation;
  const parsed = UIImplementationSpecV2Schema.safeParse(candidate);
  if (!parsed.success) fail("IMPLEMENTATION_INVALID", parsed.error.issues[0]?.message ?? "invalid UI implementation v2");
  if (parsed.data.compatibility !== "native") fail("NATIVE_IMPLEMENTATION_REQUIRED", "adapted-v1 is not supported");
  const implementation = parsed.data; const pageIds = implementation.pages.map((page) => page.id);
  const controlIds = implementation.pages.flatMap((page) => page.compatibility === "native" ? page.controls.map((control) => control.id) : []);
  if (safe.semanticStateIds !== undefined && !Array.isArray(safe.semanticStateIds)) fail("INPUT_INVALID", "semanticStateIds must be an array");
  const semanticStateIds = (safe.semanticStateIds as unknown[] | undefined)?.map((value, index) =>
    nonEmptyString(value, `semanticStateIds[${index}]`, 100)) ?? [];
  const pageByControlId = new Map(implementation.pages.flatMap((page) => page.compatibility === "native"
    ? page.controls.map((control) => [control.id, page.id] as const) : []));
  const capabilityByControlId = new Map(implementation.pages.flatMap((page) => page.compatibility === "native"
    ? page.controls.map((control) => [control.id, control.capabilityId] as const) : []));
  capabilityByControlId.forEach((capabilityId) => { runtimeDescriptor(capabilityId); });
  assertNoSemanticCaseAliases([...pageIds, ...controlIds]);
  assertNoSemanticCaseAliases(semanticStateIds);
  let controls: Array<{ semanticControlId: string; instanceName: string }>; let pages: Array<{ semanticPageId: string; pageGuid: string }>;
  if (verified === undefined) {
    controls = [...controlIds].sort((a, b) => a.localeCompare(b, "en-US")).map((semanticControlId) => ({
      semanticControlId,
      instanceName: runtimeInstanceName(workspaceId, semanticControlId, capabilityByControlId.get(semanticControlId)!),
    }));
    pages = [...pageIds].sort((a, b) => a.localeCompare(b, "en-US")).map((semanticPageId) => ({ semanticPageId, pageGuid: runtimePageGuid(workspaceId, semanticPageId) }));
  } else {
    assertExactSemanticDisposition(verified, controlIds, pageIds);
    const pageDispositionById = new Map(verified.pages.map((entry) => [entry.semanticPageId, entry]));
    verified.controls.filter((entry) => entry.source === "uploaded-existing").forEach((entry) => {
      const inspectedControl = verifiedPayload?.inspectedControls.find((control) => control.name === entry.instanceName);
      const descriptor = runtimeDescriptor(capabilityByControlId.get(entry.semanticControlId)!);
      if (inspectedControl === undefined || !acceptsNativeType(descriptor, inspectedControl.nativeType)) {
        fail("UPLOADED_NATIVE_TYPE_MISMATCH", entry.semanticControlId);
      }
      const implementationPageId = pageByControlId.get(entry.semanticControlId)!;
      const pageDisposition = pageDispositionById.get(implementationPageId);
      if (pageDisposition?.source !== "uploaded-existing" || pageDisposition.pageGuid !== inspectedControl.pageGuid) {
        fail("UPLOADED_CONTROL_PAGE_MISMATCH", entry.semanticControlId);
      }
    });
    verified.controls.filter((entry) => entry.source === "workspace-derived").forEach((entry) => {
      if (entry.instanceName !== runtimeInstanceName(workspaceId, entry.semanticControlId, capabilityByControlId.get(entry.semanticControlId)!)) fail("FORGED_WORKSPACE_DERIVATION", entry.semanticControlId);
    });
    verified.pages.filter((entry) => entry.source === "workspace-derived").forEach((entry) => { if (entry.pageGuid !== runtimePageGuid(workspaceId, entry.semanticPageId)) fail("FORGED_WORKSPACE_DERIVATION", entry.semanticPageId); });
    controls = verified.controls.map(({ semanticControlId, instanceName }) => ({ semanticControlId, instanceName }));
    pages = verified.pages.map(({ semanticPageId, pageGuid }) => ({ semanticPageId, pageGuid }));
  }
  const stateVariableNames = new Set<string>();
  const states = [...semanticStateIds].sort((a, b) => a.localeCompare(b, "en-US")).map((semanticStateId) => {
    const variableName = runtimeVariableName(workspaceId, semanticStateId);
    const folded = variableName.toLocaleLowerCase("en-US");
    if (stateVariableNames.has(folded)) fail("RUNTIME_IDENTITY_ALIAS", `state ${variableName}`);
    stateVariableNames.add(folded);
    return { semanticStateId, variableName };
  });
  const expectedCorrelation = { controls, pages, states };
  let comparablePrior = priorCorrelation;
  if (comparablePrior !== undefined) {
    const priorRecord = record(comparablePrior, "runtimeCorrelation");
    comparablePrior = Object.hasOwn(priorRecord, "states") ? priorRecord : { ...priorRecord, states: [] };
  }
  if (comparablePrior !== undefined && JSON.stringify(comparablePrior) !== JSON.stringify(expectedCorrelation)) fail(verified === undefined ? "EXISTING_CORRELATION_PROOF_REQUIRED" : "EXISTING_CORRELATION_MISMATCH", "existing runtime correlation differs from verified identities");
  const result = UIImplementationSpecV2Schema.safeParse({ ...implementation, runtimeCorrelation: expectedCorrelation });
  if (!result.success) fail("CORRELATION_INVALID", result.error.issues[0]?.message ?? "invalid runtime correlation");
  return deepFreeze(result.data);
}
