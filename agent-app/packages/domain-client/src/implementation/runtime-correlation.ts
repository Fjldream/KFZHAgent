import { createHash } from "node:crypto";
import {
  CompilerInstanceNameSchema,
  UIImplementationSpecV2Schema,
  type UIImplementationSpecV2,
} from "@kf/contracts";
import { deriveGuid } from "../compile/guid-factory.js";

export type ExistingRuntimeSource = "uploaded-existing" | "workspace-derived";

export interface VerifiedExistingControlCorrelation {
  readonly source: ExistingRuntimeSource;
  readonly semanticControlId: string;
  readonly instanceName: string;
}

export interface VerifiedExistingPageCorrelation {
  readonly source: ExistingRuntimeSource;
  readonly semanticPageId: string;
  readonly pageGuid: string;
}

export interface VerifiedExistingRuntimeCorrelation {
  readonly controls: readonly VerifiedExistingControlCorrelation[];
  readonly pages: readonly VerifiedExistingPageCorrelation[];
}

export interface AttachRuntimeCorrelationInput {
  readonly workspaceId: string;
  readonly implementation: UIImplementationSpecV2;
  readonly verifiedExisting?: VerifiedExistingRuntimeCorrelation;
}

export class RuntimeCorrelationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuntimeCorrelationError";
  }
}

const MAX_INPUT_DEPTH = 96;
const MAX_INPUT_NODES = 1_500_000;
const MAX_ARRAY_LENGTH = 10_000;
const MAX_OBJECT_KEYS = 512;
const MAX_STRING_CODE_UNITS = 20_000_000;
const KF_PAGE_GUID = /^k[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function fail(code: string, detail: string): never {
  throw new RuntimeCorrelationError(`${code}: ${detail}`);
}

function inspected<T>(operation: () => T): T {
  try {
    return operation();
  } catch (error) {
    if (error instanceof RuntimeCorrelationError) throw error;
    fail("INPUT_INSPECTION_FAILED", error instanceof Error ? error.message : "unknown inspection failure");
  }
}

function clonePlainData(input: unknown): unknown {
  const budget = { nodes: 0, stringCodeUnits: 0 };
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

    const prototype: unknown = inspected(() => Object.getPrototypeOf(value) as unknown);
    const keys = inspected(() => Reflect.ownKeys(value));
    if (Array.isArray(value)) {
      if (prototype !== Array.prototype) fail("INPUT_NON_PLAIN_DATA", "array prototype is not allowed");
      if (value.length > MAX_ARRAY_LENGTH) fail("INPUT_BUDGET_EXCEEDED", "array length exceeded");
      const cloned: unknown[] = [];
      for (const key of keys) {
        if (key === "length") continue;
        if (typeof key !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(key) || Number(key) >= value.length) {
          fail("INPUT_NON_PLAIN_DATA", "array properties must be dense numeric indices");
        }
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
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail("INPUT_INVALID", `${path} must contain exactly ${wanted.join(", ")}`);
  }
}

function nonEmptyString(value: unknown, path: string, maximum = 200): string {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum || value.trim() !== value) {
    fail("INPUT_INVALID", `${path} must be a bounded non-empty string without surrounding whitespace`);
  }
  return value;
}

function runtimeInstanceName(workspaceId: string, semanticControlId: string): string {
  const digest = createHash("sha256")
    .update("kf-runtime-control\0", "utf8")
    .update(workspaceId, "utf8")
    .update("\0", "utf8")
    .update(semanticControlId, "utf8")
    .digest("hex");
  return `KF${digest}0`;
}

function runtimePageGuid(workspaceId: string, semanticPageId: string): string {
  return `k${deriveGuid({ seed: workspaceId }, semanticPageId)}`;
}

function assertNoCaseAliases(values: readonly string[], kind: string): void {
  const byFolded = new Map<string, string>();
  values.forEach((value) => {
    const folded = value.toLowerCase();
    const previous = byFolded.get(folded);
    if (previous !== undefined) fail("SEMANTIC_CASE_ALIAS", `${kind} ${previous} aliases ${value}`);
    byFolded.set(folded, value);
  });
}

function parseExisting(
  raw: unknown,
  workspaceId: string,
  controlIds: ReadonlySet<string>,
  pageIds: ReadonlySet<string>,
): { controlById: Map<string, string>; pageById: Map<string, string> } {
  if (raw === undefined) return { controlById: new Map(), pageById: new Map() };
  const root = record(raw, "verifiedExisting");
  exactKeys(root, ["controls", "pages"], "verifiedExisting");
  if (!Array.isArray(root.controls) || !Array.isArray(root.pages)) fail("INPUT_INVALID", "verifiedExisting collections must be arrays");
  const controlById = new Map<string, string>();
  const pageById = new Map<string, string>();
  const foldedControlIds = new Set<string>();
  const foldedPageIds = new Set<string>();

  root.controls.forEach((candidate, index) => {
    const entry = record(candidate, `verifiedExisting.controls[${index}]`);
    exactKeys(entry, ["source", "semanticControlId", "instanceName"], `verifiedExisting.controls[${index}]`);
    if (entry.source !== "uploaded-existing" && entry.source !== "workspace-derived") fail("INPUT_INVALID", `invalid control source at ${index}`);
    const semanticId = nonEmptyString(entry.semanticControlId, `verifiedExisting.controls[${index}].semanticControlId`, 100);
    const instanceName = nonEmptyString(entry.instanceName, `verifiedExisting.controls[${index}].instanceName`, 100);
    const foldedId = semanticId.toLowerCase();
    if (foldedControlIds.has(foldedId)) fail("DUPLICATE_CORRELATION", `control ${semanticId}`);
    foldedControlIds.add(foldedId);
    if (!controlIds.has(semanticId)) fail("UNKNOWN_CORRELATION", `control ${semanticId}`);
    const parsedName = CompilerInstanceNameSchema.safeParse(instanceName);
    if (!parsedName.success || parsedName.data !== instanceName) fail("INVALID_INSTANCE_NAME", semanticId);
    if (entry.source === "workspace-derived" && instanceName !== runtimeInstanceName(workspaceId, semanticId)) {
      fail("FORGED_WORKSPACE_DERIVATION", semanticId);
    }
    controlById.set(semanticId, instanceName);
  });

  root.pages.forEach((candidate, index) => {
    const entry = record(candidate, `verifiedExisting.pages[${index}]`);
    exactKeys(entry, ["source", "semanticPageId", "pageGuid"], `verifiedExisting.pages[${index}]`);
    if (entry.source !== "uploaded-existing" && entry.source !== "workspace-derived") fail("INPUT_INVALID", `invalid page source at ${index}`);
    const semanticId = nonEmptyString(entry.semanticPageId, `verifiedExisting.pages[${index}].semanticPageId`, 100);
    const pageGuid = nonEmptyString(entry.pageGuid, `verifiedExisting.pages[${index}].pageGuid`, 100);
    const foldedId = semanticId.toLowerCase();
    if (foldedPageIds.has(foldedId)) fail("DUPLICATE_CORRELATION", `page ${semanticId}`);
    foldedPageIds.add(foldedId);
    if (!pageIds.has(semanticId)) fail("UNKNOWN_CORRELATION", `page ${semanticId}`);
    if (!KF_PAGE_GUID.test(pageGuid)) fail("INVALID_PAGE_GUID", semanticId);
    if (entry.source === "workspace-derived" && pageGuid !== runtimePageGuid(workspaceId, semanticId)) {
      fail("FORGED_WORKSPACE_DERIVATION", semanticId);
    }
    pageById.set(semanticId, pageGuid);
  });
  return { controlById, pageById };
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Reflect.ownKeys(value).forEach((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor !== undefined && "value" in descriptor) deepFreeze(descriptor.value);
    });
    Object.freeze(value);
  }
  return value;
}

/** Attaches server-owned KF runtime identities before interaction compilation. */
export function attachRuntimeCorrelation(input: AttachRuntimeCorrelationInput): UIImplementationSpecV2 {
  const clonedRoot = record(clonePlainData(input), "$input");
  exactKeys(clonedRoot, clonedRoot.verifiedExisting === undefined
    ? ["workspaceId", "implementation"]
    : ["workspaceId", "implementation", "verifiedExisting"], "$input");
  const workspaceId = nonEmptyString(clonedRoot.workspaceId, "workspaceId");
  const rawImplementation = record(clonedRoot.implementation, "implementation");
  if (rawImplementation.compatibility !== "native") fail("NATIVE_IMPLEMENTATION_REQUIRED", "adapted-v1 is not supported");
  const actions = rawImplementation.compiledActions;
  const scripts = rawImplementation.compiledScripts;
  const rawPages = rawImplementation.pages;
  const hasBindings = Array.isArray(rawPages) && rawPages.some((page) => {
    const candidate = page !== null && typeof page === "object" ? page as Record<string, unknown> : {};
    return Array.isArray(candidate.controls) && candidate.controls.some((control) => {
      const nativeControl = control !== null && typeof control === "object" ? control as Record<string, unknown> : {};
      return Array.isArray(nativeControl.eventBindings) && nativeControl.eventBindings.length > 0;
    });
  });
  if ((Array.isArray(actions) && actions.length > 0) || (Array.isArray(scripts) && scripts.length > 0) || hasBindings) {
    fail("INTERACTIONS_ALREADY_COMPILED", "runtime correlation must precede interaction compilation");
  }
  const candidate = { ...rawImplementation };
  delete candidate.runtimeCorrelation;
  const parsed = UIImplementationSpecV2Schema.safeParse(candidate);
  if (!parsed.success) fail("IMPLEMENTATION_INVALID", parsed.error.issues[0]?.message ?? "invalid UI implementation v2");
  const implementation = parsed.data;
  if (implementation.compatibility !== "native") fail("NATIVE_IMPLEMENTATION_REQUIRED", "adapted-v1 is not supported");

  const pages = implementation.pages;
  const pageIds = pages.map((page) => page.id);
  const controlIds = pages.flatMap((page) => page.compatibility === "native" ? page.controls.map((control) => control.id) : []);
  assertNoCaseAliases([...pageIds, ...controlIds], "semantic entity");
  const existing = parseExisting(clonedRoot.verifiedExisting, workspaceId, new Set(controlIds), new Set(pageIds));

  const controls = [...controlIds].sort().map((semanticControlId) => ({
    semanticControlId,
    instanceName: existing.controlById.get(semanticControlId) ?? runtimeInstanceName(workspaceId, semanticControlId),
  }));
  const correlatedPages = [...pageIds].sort().map((semanticPageId) => ({
    semanticPageId,
    pageGuid: existing.pageById.get(semanticPageId) ?? runtimePageGuid(workspaceId, semanticPageId),
  }));
  const names = new Map<string, string>();
  controls.forEach((entry) => {
    const folded = entry.instanceName.toLowerCase();
    const previous = names.get(folded);
    if (previous !== undefined) fail("RUNTIME_IDENTITY_ALIAS", `controls ${previous} and ${entry.semanticControlId}`);
    names.set(folded, entry.semanticControlId);
  });
  const guids = new Map<string, string>();
  correlatedPages.forEach((entry) => {
    const folded = entry.pageGuid.toLowerCase();
    const previous = guids.get(folded);
    if (previous !== undefined) fail("RUNTIME_IDENTITY_ALIAS", `pages ${previous} and ${entry.semanticPageId}`);
    guids.set(folded, entry.semanticPageId);
  });

  const result = UIImplementationSpecV2Schema.safeParse({
    ...implementation,
    runtimeCorrelation: { controls, pages: correlatedPages },
  });
  if (!result.success) fail("CORRELATION_INVALID", result.error.issues[0]?.message ?? "invalid runtime correlation");
  return deepFreeze(result.data);
}
