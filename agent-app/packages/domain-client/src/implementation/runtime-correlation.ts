import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";
import { CompilerInstanceNameSchema, UIImplementationSpecV2Schema, type UIImplementationSpecV2 } from "@kf/contracts";
import { deriveGuid } from "../compile/guid-factory.js";
import { serverOwnedRuntimeIdentitySnapshot, type InspectResult } from "../inspect/client-inspector.js";

export type ExistingRuntimeSource = "uploaded-existing" | "workspace-derived";
export interface ExistingControlRuntimeDisposition { readonly source: ExistingRuntimeSource; readonly semanticControlId: string; readonly instanceName: string }
export interface ExistingPageRuntimeDisposition { readonly source: ExistingRuntimeSource; readonly semanticPageId: string; readonly pageGuid: string }
export interface ExistingRuntimeCorrelationDisposition {
  readonly controls: readonly ExistingControlRuntimeDisposition[];
  readonly pages: readonly ExistingPageRuntimeDisposition[];
}
declare const verifiedRuntimeCorrelationBrand: unique symbol;
export interface VerifiedExistingRuntimeCorrelationHandle { readonly [verifiedRuntimeCorrelationBrand]: true }
export interface VerifyExistingRuntimeCorrelationInput { readonly inspection: InspectResult; readonly correlations: ExistingRuntimeCorrelationDisposition }
export interface AttachRuntimeCorrelationInput {
  readonly workspaceId: string;
  readonly implementation: UIImplementationSpecV2;
  readonly verifiedExisting?: VerifiedExistingRuntimeCorrelationHandle;
}

export class RuntimeCorrelationError extends Error {
  constructor(message: string) { super(message); this.name = "RuntimeCorrelationError"; }
}

interface CanonicalDisposition {
  readonly controls: readonly Readonly<ExistingControlRuntimeDisposition>[];
  readonly pages: readonly Readonly<ExistingPageRuntimeDisposition>[];
}
const verifiedDispositionByHandle = new WeakMap<object, CanonicalDisposition>();
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
function runtimeInstanceName(workspaceId: string, semanticControlId: string): string {
  const digest = createHash("sha256").update("kf-runtime-control\0", "utf8").update(workspaceId, "utf8").update("\0", "utf8").update(semanticControlId, "utf8").digest("hex");
  return `KF${digest}0`;
}
function runtimePageGuid(workspaceId: string, semanticPageId: string): string { return `k${deriveGuid({ seed: workspaceId }, semanticPageId)}`; }

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
    if (!KF_PAGE_GUID.test(pageGuid)) fail("INVALID_PAGE_GUID", semanticPageId);
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
  const values = rootDescriptors(input, ["inspection", "correlations"], "$input");
  if (!values.has("inspection") || !values.has("correlations")) fail("INPUT_INVALID", "verification input is incomplete");
  const inspection = values.get("inspection");
  if (inspection === null || typeof inspection !== "object") fail("UNTRUSTED_INSPECTION", "inspection was not produced by inspectClientProject");
  const identitySnapshot = serverOwnedRuntimeIdentitySnapshot(inspection as InspectResult);
  if (identitySnapshot === undefined) fail("UNTRUSTED_INSPECTION", "inspection was not produced by inspectClientProject");
  const disposition = parseDisposition(clonePlainData(values.get("correlations")));
  disposition.controls.filter((entry) => entry.source === "uploaded-existing").forEach((entry) => {
    const exact = identitySnapshot.controlNames.filter((name) => name === entry.instanceName);
    const folded = identitySnapshot.controlNames.filter((name) => name.toLowerCase() === entry.instanceName.toLowerCase());
    if (exact.length !== 1 || folded.length !== 1) fail("UPLOADED_ENTITY_MISMATCH", `control ${entry.semanticControlId}`);
  });
  disposition.pages.filter((entry) => entry.source === "uploaded-existing").forEach((entry) => {
    const exact = identitySnapshot.pageGuids.filter((guid) => guid === entry.pageGuid);
    const folded = identitySnapshot.pageGuids.filter((guid) => guid.toLowerCase() === entry.pageGuid.toLowerCase());
    if (exact.length !== 1 || folded.length !== 1) fail("UPLOADED_ENTITY_MISMATCH", `page ${entry.semanticPageId}`);
  });
  const handle = Object.freeze(Object.create(null)) as VerifiedExistingRuntimeCorrelationHandle;
  verifiedDispositionByHandle.set(handle, disposition); return handle;
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

/** Attaches server-owned KF runtime identities before interaction compilation. */
export function attachRuntimeCorrelation(input: AttachRuntimeCorrelationInput): UIImplementationSpecV2 {
  const root = rootDescriptors(input, ["workspaceId", "implementation", "verifiedExisting"], "$input");
  if (!root.has("workspaceId") || !root.has("implementation")) fail("INPUT_INVALID", "attach input is incomplete");
  let verified: CanonicalDisposition | undefined;
  if (root.has("verifiedExisting")) {
    const handle = root.get("verifiedExisting");
    if (typeof handle !== "object" || handle === null || (verified = verifiedDispositionByHandle.get(handle)) === undefined) fail("INVALID_VERIFIED_HANDLE", "verifiedExisting was not issued by the verifier");
  }
  const safe = record(clonePlainData({ workspaceId: root.get("workspaceId"), implementation: root.get("implementation") }), "$input");
  const workspaceId = nonEmptyString(safe.workspaceId, "workspaceId"); const rawImplementation = record(safe.implementation, "implementation");
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
  assertNoSemanticCaseAliases([...pageIds, ...controlIds]);
  let controls: Array<{ semanticControlId: string; instanceName: string }>; let pages: Array<{ semanticPageId: string; pageGuid: string }>;
  if (verified === undefined) {
    controls = [...controlIds].sort((a, b) => a.localeCompare(b, "en-US")).map((semanticControlId) => ({ semanticControlId, instanceName: runtimeInstanceName(workspaceId, semanticControlId) }));
    pages = [...pageIds].sort((a, b) => a.localeCompare(b, "en-US")).map((semanticPageId) => ({ semanticPageId, pageGuid: runtimePageGuid(workspaceId, semanticPageId) }));
  } else {
    assertExactSemanticDisposition(verified, controlIds, pageIds);
    verified.controls.filter((entry) => entry.source === "workspace-derived").forEach((entry) => { if (entry.instanceName !== runtimeInstanceName(workspaceId, entry.semanticControlId)) fail("FORGED_WORKSPACE_DERIVATION", entry.semanticControlId); });
    verified.pages.filter((entry) => entry.source === "workspace-derived").forEach((entry) => { if (entry.pageGuid !== runtimePageGuid(workspaceId, entry.semanticPageId)) fail("FORGED_WORKSPACE_DERIVATION", entry.semanticPageId); });
    controls = verified.controls.map(({ semanticControlId, instanceName }) => ({ semanticControlId, instanceName }));
    pages = verified.pages.map(({ semanticPageId, pageGuid }) => ({ semanticPageId, pageGuid }));
  }
  const expectedCorrelation = { controls, pages };
  if (priorCorrelation !== undefined && JSON.stringify(priorCorrelation) !== JSON.stringify(expectedCorrelation)) fail(verified === undefined ? "EXISTING_CORRELATION_PROOF_REQUIRED" : "EXISTING_CORRELATION_MISMATCH", "existing runtime correlation differs from verified identities");
  const result = UIImplementationSpecV2Schema.safeParse({ ...implementation, runtimeCorrelation: expectedCorrelation });
  if (!result.success) fail("CORRELATION_INVALID", result.error.issues[0]?.message ?? "invalid runtime correlation");
  return deepFreeze(result.data);
}
