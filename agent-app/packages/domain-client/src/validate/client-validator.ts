import { mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { parse } from "acorn";
import { walk } from "estree-walker";
import {
  CompilerPageGuidSchema,
  canonicalChangePlanHash,
  type DomainAssetInput,
  type TrustedSemanticOperation,
  type ValidationReport,
} from "@kf/contracts";
import {
  readVerifiedCreativeMaterialization,
  type VerifiedCreativeMaterialization,
} from "@kf/build-jobs";
import { inspectClientProject } from "../inspect/client-inspector.js";
import {
  classifyNativeRuntimeControl,
  sameNativeRuntimeControlType,
  type NativeRuntimeControlType,
} from "../inspect/native-runtime-type.js";
import { CONTROL_TYPE_BY_UIMODEL_TYPE } from "../ir/client-project-ir.js";
import { importNativeClientPackage, packageNativeClientProject } from "../package/native-client-package.js";
import { resolveVersionDirName, verifyChangeScope } from "../patch/change-scope.js";
import {
  applyClientPatch,
  deleteOperationDigest,
  normalizeChangePlan,
  projectCreativeNativeProperties,
  type CreativePageInstrumentation,
  type NormalizedPlan,
} from "../patch/client-patcher.js";
import { serializeReviewedTabsInitialization } from "../implementation/component-properties.js";
import { parseTableData, toNativeTableProperties } from "../modules/definitions/native-data-adapters.js";
import { deriveGuid } from "../compile/guid-factory.js";
import { serializeReviewedNativeInteractions } from "../compile/control-compiler.js";
import { compileResolvedStyle } from "../style/style-engine.js";
import { KF36_RUNTIME_PROFILE } from "../style/runtime-profile.js";
import { mergeManagedStyleData } from "../style/style-data-merge.js";
import type { ClientWorkspace } from "../compile/client-compiler.js";
import {
  fail,
  makeReport,
  pass,
  type CheckKey,
  type CheckOutcome,
} from "./report.js";

/**
 * Six-layer client validator (brief Step 6).
 *
 * `validateClientProject(base, candidate, plan)` is the ONLY authority that
 * can pass or fail a modified workspace. Each layer is independent and each
 * returns pass/warn/fail; `status` is "pass" only when every required check
 * passes. Warnings (e.g. a planned change with no observable effect) are
 * collected in the report and never override a failure.
 *
 *  1. packageStructure — the candidate is a valid, unpackable workspace,
 *  2. jsonSchema      — every JSON file parses and page/control shapes hold,
 *  3. references      — GUID uniqueness + pageManager / action references,
 *  4. businessRules   — known uiModelTypes, in-bounds geometry, well-formed
 *                       script actions, confirmed destructive deletes,
 *  5. changeScope     — nothing outside the confirmed plan changed,
 *  6. roundTrip       — pack candidate and unpack it again: byte-identical.
 */

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function listJsonFiles(versionRoot: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string, rel: string): Promise<void> {
    if (!(await exists(dir))) return;
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const nextRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(full, nextRel);
      else if (entry.isFile() && entry.name.toLowerCase().endsWith(".json")) out.push(nextRel);
    }
  }
  await walk(versionRoot, "");
  return out.sort();
}

type RuntimeControlType = NativeRuntimeControlType;

const isUiModel = (type: RuntimeControlType | undefined, uiModelType: number): boolean =>
  type?.kind === "static" && type.uiModelType === uiModelType;
const isDatagrid = (type: RuntimeControlType | undefined): boolean =>
  type?.kind === "easyui" && type.objectType === 3 && type.uiExtendType === 1;

/** Recursively walks page trees, including malformed native control envelopes. */
function walkControls(
  node: unknown,
  where: string,
  cb: (control: Record<string, unknown>, where: string) => void,
): void {
  if (Array.isArray(node)) {
    node.forEach((item, index) => walkControls(item, `${where}/${index}`, cb));
    return;
  }
  if (typeof node !== "object" || node === null) return;
  const record = node as Record<string, unknown>;
  if (classifyNativeRuntimeControl(record).kind !== "non-control") cb(record, where);
  for (const key of ["objects", "children", "layoutItems", "insiderObjects"]) {
    if (key in record) walkControls(record[key], `${where}/${key}`, cb);
  }
}

function nativeInstanceName(control: Readonly<Record<string, unknown>>): string | undefined {
  const name = control["name"] ?? asRecord(control["baseProperty"])["name"];
  return typeof name === "string" ? name : undefined;
}

function rootPath(candidate: string, versionDir: string): string {
  return versionDir === "." ? candidate : path.join(candidate, versionDir);
}

interface CompilerOwnedScriptMetadata {
  readonly schema: "kf-compiled-event/v1";
  readonly moduleId: string;
  readonly sourceScriptId: string;
  readonly bodySha256: string;
  readonly bodyByteLength: number;
  readonly ownerInstanceName: string;
  readonly placement: "event" | "configure-data";
  readonly kfEvent: string | null;
  readonly linkId: number | null;
  readonly phase: "event" | "after-event" | null;
  readonly instanceReferences: readonly { readonly semanticId: string; readonly instanceName: string }[];
  readonly pageReferences: readonly { readonly semanticId: string; readonly pageGuid: string }[];
}

function compilerMetadata(value: unknown): CompilerOwnedScriptMetadata | undefined {
  const record = asRecord(value);
  if (record["schema"] !== "kf-compiled-event/v1") return undefined;
  const keys = Object.keys(record).sort();
  const expected = ["bodyByteLength", "bodySha256", "instanceReferences", "kfEvent", "linkId", "moduleId", "ownerInstanceName", "pageReferences", "phase", "placement", "schema", "sourceScriptId"];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) return undefined;
  const instanceReferences = record["instanceReferences"];
  const pageReferences = record["pageReferences"];
  const stableId = /^[A-Za-z][A-Za-z0-9_-]{0,99}$/;
  const instanceName = /^[A-Za-z_$][A-Za-z0-9_$]*[0-9]$/;
  if (typeof record["moduleId"] !== "string" || !/^kf\$script:[A-Za-z0-9][A-Za-z0-9_-]{0,89}$/.test(record["moduleId"])
    || typeof record["sourceScriptId"] !== "string" || !stableId.test(record["sourceScriptId"])
    || typeof record["bodySha256"] !== "string" || !Number.isInteger(record["bodyByteLength"]) || Number(record["bodyByteLength"]) < 1
    || Number(record["bodyByteLength"]) > 128_000 || typeof record["ownerInstanceName"] !== "string" || !instanceName.test(record["ownerInstanceName"])
    || !["event", "configure-data"].includes(String(record["placement"]))
    || (record["kfEvent"] !== null && typeof record["kfEvent"] !== "string")
    || (record["linkId"] !== null && !Number.isInteger(record["linkId"]))
    || (record["phase"] !== null && record["phase"] !== "event" && record["phase"] !== "after-event")
    || !Array.isArray(instanceReferences) || !instanceReferences.every((entry) => {
      const candidate = asRecord(entry); return Object.keys(candidate).sort().join("\0") === "instanceName\0semanticId"
        && typeof candidate["semanticId"] === "string" && stableId.test(candidate["semanticId"])
        && typeof candidate["instanceName"] === "string" && instanceName.test(candidate["instanceName"]);
    })
    || !Array.isArray(pageReferences) || !pageReferences.every((entry) => {
      const candidate = asRecord(entry); return Object.keys(candidate).sort().join("\0") === "pageGuid\0semanticId"
        && typeof candidate["semanticId"] === "string" && stableId.test(candidate["semanticId"])
        && typeof candidate["pageGuid"] === "string" && CompilerPageGuidSchema.safeParse(candidate["pageGuid"]).success;
    }) || instanceReferences.length > 128 || pageReferences.length > 32
    || new Set(instanceReferences.map((entry) => asRecord(entry)["semanticId"])).size !== instanceReferences.length
    || new Set(pageReferences.map((entry) => asRecord(entry)["semanticId"])).size !== pageReferences.length) return undefined;
  return record as unknown as CompilerOwnedScriptMetadata;
}

interface CompilerOwnedSegment { readonly metadata: CompilerOwnedScriptMetadata; readonly body: string; readonly encoded: string }

interface CompilerVisibilityActionMarker {
  readonly schema: "kf-compiled-action/v3";
  readonly actionId: string;
  readonly sourceActionId: string;
  readonly ownerInstanceName: string;
  readonly ownerSemanticControlId: string;
  readonly targetSemanticControlId: string;
  readonly targetInstanceName: string;
  readonly operation: "open-overlay" | "close-overlay";
  readonly visible: boolean;
  readonly kfEvent: string;
  readonly linkId: number | null;
  readonly phase: "event" | "after-event";
}

function compilerVisibilityActionMarker(value: unknown): { readonly marker?: CompilerVisibilityActionMarker; readonly issue?: string } {
  const record = asRecord(value);
  if (record["schema"] !== "kf-compiled-action/v3") return {};
  const expected = ["actionId", "kfEvent", "linkId", "operation", "ownerInstanceName", "ownerSemanticControlId", "phase", "schema", "sourceActionId", "targetInstanceName", "targetSemanticControlId", "visible"];
  const stableId = /^[A-Za-z][A-Za-z0-9_-]{0,99}$/;
  const compilerActionId = /^kf\$action:[A-Za-z0-9][A-Za-z0-9_-]{0,89}$/;
  const instanceName = /^[A-Za-z_$][A-Za-z0-9_$]*[0-9]$/;
  if (Object.keys(record).sort().join("\0") !== expected.join("\0")
    || typeof record["actionId"] !== "string" || !compilerActionId.test(record["actionId"])
    || typeof record["sourceActionId"] !== "string" || !stableId.test(record["sourceActionId"])
    || typeof record["ownerSemanticControlId"] !== "string" || !stableId.test(record["ownerSemanticControlId"])
    || typeof record["targetSemanticControlId"] !== "string" || !stableId.test(record["targetSemanticControlId"])
    || typeof record["ownerInstanceName"] !== "string" || !instanceName.test(record["ownerInstanceName"])
    || typeof record["targetInstanceName"] !== "string" || !instanceName.test(record["targetInstanceName"])
    || (record["operation"] !== "open-overlay" && record["operation"] !== "close-overlay")
    || typeof record["visible"] !== "boolean" || record["visible"] !== (record["operation"] === "open-overlay")
    || typeof record["kfEvent"] !== "string" || (record["linkId"] !== null && !Number.isInteger(record["linkId"]))
    || (record["phase"] !== "event" && record["phase"] !== "after-event")) {
    return { issue: "compiler-owned visibility action marker is malformed" };
  }
  return { marker: record as unknown as CompilerVisibilityActionMarker };
}

function canonicalCompilerMetadata(metadata: CompilerOwnedScriptMetadata): string {
  return JSON.stringify({
    schema: metadata.schema,
    moduleId: metadata.moduleId,
    sourceScriptId: metadata.sourceScriptId,
    bodySha256: metadata.bodySha256,
    bodyByteLength: metadata.bodyByteLength,
    ownerInstanceName: metadata.ownerInstanceName,
    placement: metadata.placement,
    kfEvent: metadata.kfEvent,
    linkId: metadata.linkId,
    phase: metadata.phase,
    instanceReferences: [...metadata.instanceReferences].sort((left, right) => left.semanticId.localeCompare(right.semanticId, "en-US")),
    pageReferences: [...metadata.pageReferences].sort((left, right) => left.semanticId.localeCompare(right.semanticId, "en-US")),
  });
}

function compilerOwnedSegments(source: string): { readonly segments: readonly CompilerOwnedSegment[]; readonly issue?: string } {
  const token = "kf-compiled-event/v1";
  if (!source.includes(token)) return { segments: [] };
  const marker = Buffer.from(`// ${token} `, "utf8");
  const bytes = Buffer.from(source, "utf8");
  const segments: CompilerOwnedSegment[] = [];
  let searchFrom = 0;
  let previousBodyEnd = -1;
  while (true) {
    const start = bytes.indexOf(marker, searchFrom);
    if (start < 0) break;
    if (start > 0 && bytes[start - 1] !== 0x0a) return { segments, issue: "compiler marker is not at the start of a line" };
    if (segments.length === 0 && start > 0 && bytes.subarray(Math.max(0, start - 3), start).toString("utf8") !== "\n;\n") {
      return { segments, issue: "legacy/compiler boundary is not the canonical ASI-safe boundary" };
    }
    if (previousBodyEnd >= 0 && bytes.subarray(previousBodyEnd, start).toString("utf8") !== "\n;\n") {
      return { segments, issue: "compiler module boundary is malformed" };
    }
    const newline = bytes.indexOf(0x0a, start + marker.length);
    if (newline < 0) return { segments, issue: "compiler marker has no body newline" };
    const encoded = bytes.subarray(start + marker.length, newline).toString("ascii");
    if (!/^[A-Za-z0-9_-]+$/.test(encoded)) return { segments, issue: "compiler marker payload is not base64url" };
    let decoded: unknown;
    try { decoded = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")); } catch { return { segments, issue: "compiler marker payload is invalid JSON" }; }
    const metadata = compilerMetadata(decoded);
    if (metadata === undefined) return { segments, issue: "compiler marker payload has an invalid schema" };
    const canonicalEncoded = Buffer.from(canonicalCompilerMetadata(metadata), "utf8").toString("base64url");
    if (encoded !== canonicalEncoded) return { segments, issue: "compiler marker payload is not canonical" };
    const bodyStart = newline + 1;
    const bodyEnd = bodyStart + metadata.bodyByteLength;
    if (bodyEnd > bytes.length) return { segments, issue: "compiled script bodyByteLength exceeds field bytes" };
    const bodyBytes = bytes.subarray(bodyStart, bodyEnd);
    if (Buffer.byteLength(bodyBytes.toString("utf8"), "utf8") !== metadata.bodyByteLength) return { segments, issue: "compiled script bodyByteLength splits invalid UTF-8" };
    segments.push({ metadata, body: bodyBytes.toString("utf8"), encoded });
    previousBodyEnd = bodyEnd;
    searchFrom = bodyEnd;
  }
  if (segments.length === 0) return { segments, issue: "compiler marker token is malformed" };
  if (previousBodyEnd !== bytes.length) return { segments, issue: "unexpected bytes follow the final compiled module" };
  return { segments };
}

function compilerSourceIssue(
  segment: CompilerOwnedSegment,
  instanceTypes: ReadonlyMap<string, RuntimeControlType>,
  visibilityAction?: CompilerVisibilityActionMarker,
): string | undefined {
  const { body: source, metadata } = segment;
  if (!/^[0-9a-f]{64}$/.test(metadata.bodySha256)) return "compiled script bodySha256 is malformed";
  if (Buffer.byteLength(source, "utf8") !== metadata.bodyByteLength) return "compiled script bodyByteLength mismatch";
  if (createHash("sha256").update(source, "utf8").digest("hex") !== metadata.bodySha256) return "compiled script hash mismatch";
  try { parse(source, { ecmaVersion: 2022, sourceType: "script" }); } catch (error) { return `compiled script is not ECMAScript 2022: ${String(error)}`; }
  if (/\$(?:control|event|page|overlay|state|data|feedback|timer)\b/.test(source)) return "compiled script retains a semantic API";
  if (/\b(?:window|document|globalThis|fetch|XMLHttpRequest|WebSocket|eval|Function)\b/.test(source)) return "compiled script contains a forbidden global";
  const declaredInstances = new Set(metadata.instanceReferences.map((reference) => reference.instanceName));
  const program = parse(source, { ecmaVersion: 2022, sourceType: "script" }) as unknown as Record<string, unknown>;
  const allowedNodeTypes = new Set([
    "Program", "VariableDeclaration", "VariableDeclarator", "ExpressionStatement", "ReturnStatement", "IfStatement",
    "FunctionDeclaration", "ArrowFunctionExpression", "BlockStatement", "EmptyStatement",
    "Identifier", "Literal", "ArrayExpression", "ObjectExpression", "Property", "SpreadElement", "MemberExpression",
    "CallExpression", "AssignmentExpression", "UpdateExpression", "UnaryExpression", "BinaryExpression", "LogicalExpression",
    "ConditionalExpression", "TemplateLiteral", "TemplateElement", "ForStatement", "ForOfStatement",
  ]);
  interface LexicalScope {
    readonly parent?: LexicalScope;
    readonly names: Set<string>;
    readonly callableNames: Set<string>;
    readonly functionOwner: string;
  }
  const rootScope: LexicalScope = { names: new Set(), callableNames: new Set(), functionOwner: "<program>" };
  const scopeByNode = new WeakMap<object, LexicalScope>();
  let currentScope = rootScope;
  const boundaryNodes = new WeakSet<object>();
  const callableNames = new Set<string>();
  const boundedIterables = new Set<string>();
  const mutableNames = new Set<string>();
  const exactIntegerNames = new Map<string, number>();
  const declaredNames = new Set<string>();
  const initializedAt = new Map<string, number>();
  const declarationOwner = new Map<string, string>();
  let syntaxIssue: string | undefined;
  let unsupportedRuntimeMember: string | undefined;
  const identifierName = (value: unknown): string | undefined => {
    const record = value as Record<string, unknown> | undefined;
    return record?.["type"] === "Identifier" && typeof record["name"] === "string" ? record["name"] : undefined;
  };
  const nodeEnd = (value: Record<string, unknown> | undefined): number => typeof value?.["end"] === "number" ? value["end"] : Number.MAX_SAFE_INTEGER;
  const declareLocal = (name: string | undefined, declaration: Record<string, unknown> | undefined, callable = false, hoisted = false): void => {
    if (name === undefined) { syntaxIssue ??= "declaration requires an identifier"; return; }
    if (declaredNames.has(name)) { syntaxIssue ??= `binding shadowing is forbidden: ${name}`; return; }
    declaredNames.add(name);
    currentScope.names.add(name);
    if (name === "arguments") {
      initializedAt.set(name, hoisted ? -1 : nodeEnd(declaration));
      declarationOwner.set(name, currentScope.functionOwner);
      syntaxIssue ??= "reserved runtime binding cannot be declared: arguments";
      return;
    }
    if (callable) { currentScope.callableNames.add(name); callableNames.add(name); }
    initializedAt.set(name, hoisted ? -1 : nodeEnd(declaration));
    declarationOwner.set(name, currentScope.functionOwner);
  };
  walk(program as never, {
    enter(node, parent) {
      const record = node as unknown as Record<string, unknown>;
      const type = record["type"];
      if (!allowedNodeTypes.has(String(type))) syntaxIssue ??= `syntax:${String(type)}`;
      if (type === "FunctionDeclaration") {
        const name = identifierName(record["id"]);
        declareLocal(name, record["id"] as Record<string, unknown> | undefined, true, true);
      }
      if (type === "FunctionDeclaration" || type === "ArrowFunctionExpression" || type === "BlockStatement" || type === "CatchClause"
        || type === "ForStatement" || type === "ForOfStatement") {
        const directName = type === "FunctionDeclaration" ? identifierName(record["id"]) : undefined;
        const parentRecord = parent as unknown as Record<string, unknown> | null;
        const parentName = type === "ArrowFunctionExpression" && parentRecord?.["type"] === "VariableDeclarator" ? identifierName(parentRecord["id"]) : undefined;
        currentScope = {
          parent: currentScope,
          names: new Set(),
          callableNames: new Set(),
          functionOwner: type === "BlockStatement" || type === "CatchClause" || type === "ForStatement" || type === "ForOfStatement"
            ? currentScope.functionOwner : directName ?? parentName ?? `<anonymous:${String(record["start"])}>`,
        };
        boundaryNodes.add(node);
      }
      scopeByNode.set(node, currentScope);
      if (type === "FunctionDeclaration" || type === "ArrowFunctionExpression") {
        const params = Array.isArray(record["params"]) ? record["params"] as Array<Record<string, unknown>> : [];
        params.forEach((param) => declareLocal(identifierName(param), param));
      }
      if (type === "VariableDeclaration" && record["kind"] !== "const" && record["kind"] !== "let") syntaxIssue ??= "only const and let declarations are allowed";
      if (type === "VariableDeclarator") {
        const name = identifierName(record["id"]);
        if (name !== undefined) {
          const init = record["init"] as Record<string, unknown> | undefined;
          const callable = init?.["type"] === "ArrowFunctionExpression";
          declareLocal(name, record, callable);
          if ((parent as unknown as Record<string, unknown> | null)?.["kind"] === "let") mutableNames.add(name);
          if (init?.["type"] === "Literal" && typeof init["value"] === "number" && Number.isInteger(init["value"]) && init["value"] >= 0) {
            exactIntegerNames.set(name, init["value"]);
          }
          if (init?.["type"] === "ArrayExpression" && Array.isArray(init["elements"]) && init["elements"].length <= 1_000) boundedIterables.add(name);
          if (init?.["type"] === "CallExpression") {
            const callee = init["callee"] as Record<string, unknown> | undefined;
            const property = callee?.["type"] === "MemberExpression" ? callee["property"] as Record<string, unknown> | undefined : undefined;
            const args = Array.isArray(init["arguments"]) ? init["arguments"] as Array<Record<string, unknown>> : [];
            if (property?.["name"] === "slice" && args.length === 2 && args[0]?.["type"] === "Literal" && args[0]["value"] === 0
              && args[1]?.["type"] === "Literal" && typeof args[1]["value"] === "number"
              && args[1]["value"] >= 0 && args[1]["value"] <= 1_000) boundedIterables.add(name);
          }
        }
      }
      if (type === "CatchClause") declareLocal(identifierName(record["param"]), record["param"] as Record<string, unknown> | undefined);
    },
    leave(node) { if (boundaryNodes.has(node)) currentScope = currentScope.parent ?? rootScope; },
  });
  const aliasRoots = new Map<string, Set<string>>();
  const unsafeIterableAliases = new Set<string>();
  const rootsForExpression = (value: Record<string, unknown> | undefined, depth = 0): Set<string> | undefined => {
    if (value == null || depth > 64) return undefined;
    const direct = identifierName(value);
    if (direct !== undefined) return new Set(aliasRoots.get(direct) ?? [direct]);
    if (value["type"] === "ArrayExpression") return new Set<string>();
    if (value["type"] === "ConditionalExpression") {
      const consequent = rootsForExpression(value["consequent"] as Record<string, unknown> | undefined, depth + 1);
      const alternate = rootsForExpression(value["alternate"] as Record<string, unknown> | undefined, depth + 1);
      if (consequent === undefined || alternate === undefined) return undefined;
      return new Set([...consequent, ...alternate]);
    }
    if (value["type"] === "LogicalExpression") {
      const left = rootsForExpression(value["left"] as Record<string, unknown> | undefined, depth + 1);
      const right = rootsForExpression(value["right"] as Record<string, unknown> | undefined, depth + 1);
      if (left === undefined || right === undefined) return undefined;
      return new Set([...left, ...right]);
    }
    return undefined;
  };
  for (let iteration = 0; iteration <= declaredNames.size; iteration += 1) {
    let changed = false;
    walk(program as never, {
      enter(node) {
        const record = node as unknown as Record<string, unknown>;
        let target: string | undefined;
        let value: Record<string, unknown> | undefined;
        if (record["type"] === "VariableDeclarator") {
          target = identifierName(record["id"]);
          value = record["init"] as Record<string, unknown> | undefined;
        } else if (record["type"] === "AssignmentExpression" && record["operator"] === "=") {
          target = identifierName(record["left"]);
          value = record["right"] as Record<string, unknown> | undefined;
        }
        if (target === undefined || value == null) return;
        let roots = rootsForExpression(value);
        const isBoundedArray = value["type"] === "ArrayExpression" && Array.isArray(value["elements"]) && value["elements"].length <= 1_000;
        const callee = value["type"] === "CallExpression" ? value["callee"] as Record<string, unknown> | undefined : undefined;
        const property = callee?.["type"] === "MemberExpression" ? identifierName(callee["property"]) : undefined;
        const args = Array.isArray(value["arguments"]) ? value["arguments"] as Array<Record<string, unknown>> : [];
        const isBoundedSlice = property === "slice" && args.length === 2 && args[0]?.["type"] === "Literal" && args[0]["value"] === 0
          && args[1]?.["type"] === "Literal" && typeof args[1]["value"] === "number"
          && args[1]["value"] >= 0 && args[1]["value"] <= 1_000;
        if (isBoundedArray || isBoundedSlice) roots = new Set([target]);
        if (roots === undefined) { unsafeIterableAliases.add(target); return; }
        const existing = aliasRoots.get(target) ?? new Set<string>();
        const before = existing.size;
        (roots.size === 0 ? new Set([target]) : roots).forEach((root) => existing.add(root));
        aliasRoots.set(target, existing);
        if (existing.size !== before) changed = true;
        if (isBoundedArray || isBoundedSlice) boundedIterables.add(target);
      },
    });
    if (!changed) break;
  }
  const resolvedAliasRoots = (name: string): Set<string> => {
    const roots = new Set<string>();
    const pending = [name];
    const seen = new Set<string>();
    while (pending.length > 0) {
      const current = pending.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      const aliases = aliasRoots.get(current);
      if (aliases === undefined || aliases.size === 0 || aliases.has(current)) roots.add(current);
      for (const alias of aliases ?? []) if (alias !== current) pending.push(alias);
    }
    if (roots.size === 0) seen.forEach((candidate) => roots.add(candidate));
    return roots;
  };
  const aliasesIntersect = (name: string, roots: ReadonlySet<string>): boolean => [...resolvedAliasRoots(name)].some((root) => roots.has(root));
  const boundedIterable = (name: string): boolean => !unsafeIterableAliases.has(name)
    && [...resolvedAliasRoots(name)].every((root) => boundedIterables.has(root));
  type AbstractFact =
    | { readonly kind: "bounded-array"; readonly element: AbstractFact; readonly maxLength: number }
    | { readonly kind: "string" }
    | { readonly kind: "record"; readonly fields: ReadonlyMap<string, AbstractFact> }
    | { readonly kind: "open-record" }
    | { readonly kind: "scalar" }
    | { readonly kind: "unknown" };
  const unknownFact: AbstractFact = { kind: "unknown" };
  const facts = new Map<string, AbstractFact>();
  const factKey = (fact: AbstractFact): string => {
    if (fact.kind === "bounded-array") return `array:${fact.maxLength}:${factKey(fact.element)}`;
    if (fact.kind === "record") return `record:${[...fact.fields].map(([key, value]) => `${key}=${factKey(value)}`).join(",")}`;
    return fact.kind;
  };
  const mergeFacts = (left: AbstractFact, right: AbstractFact): AbstractFact => {
    if (factKey(left) === factKey(right)) return left;
    if (left.kind === "bounded-array" && right.kind === "bounded-array") {
      return { kind: "bounded-array", element: mergeFacts(left.element, right.element), maxLength: Math.max(left.maxLength, right.maxLength) };
    }
    if (left.kind === "record" && right.kind === "record") {
      const fields = new Map<string, AbstractFact>();
      for (const [key, value] of left.fields) {
        const other = right.fields.get(key);
        if (other !== undefined) fields.set(key, mergeFacts(value, other));
      }
      return { kind: "record", fields };
    }
    return unknownFact;
  };
  const staticMember = (value: Record<string, unknown> | undefined): string | undefined => {
    if (value?.["type"] === "Identifier" && typeof value["name"] === "string") return value["name"];
    if (value?.["type"] === "Literal" && typeof value["value"] === "string") return value["value"];
    return undefined;
  };
  const resolvesLocal = (scope: LexicalScope | undefined, name: string): boolean => {
    for (let current = scope; current !== undefined; current = current.parent) if (current.names.has(name)) return true;
    return false;
  };
  const isEventRecordAccess = (value: Record<string, unknown> | undefined): boolean => value?.["type"] === "MemberExpression"
    && identifierName(value["object"]) === "arguments" && value["computed"] === true
    && (value["property"] as Record<string, unknown> | undefined)?.["type"] === "Literal"
    && (value["property"] as Record<string, unknown> | undefined)?.["value"] === 3
    && !resolvesLocal(scopeByNode.get(value["object"] as object), "arguments")
    && scopeByNode.get(value)?.functionOwner === "<program>"
    && metadata.placement === "event" && isDatagrid(instanceTypes.get(metadata.ownerInstanceName))
    && metadata.kfEvent === "onClickRow" && metadata.linkId === 200024;
  const factOf = (value: Record<string, unknown> | undefined, depth = 0): AbstractFact => {
    if (value == null || depth > 64) return unknownFact;
    const direct = identifierName(value);
    if (direct !== undefined) return facts.get(direct) ?? unknownFact;
    if (value["type"] === "Literal") return typeof value["value"] === "string" ? { kind: "string" } : { kind: "scalar" };
    if (value["type"] === "ArrayExpression") {
      const elements = Array.isArray(value["elements"]) ? value["elements"] as Array<Record<string, unknown> | null> : [];
      const elementFacts = elements.filter((item): item is Record<string, unknown> => item !== null).map((item) => factOf(item, depth + 1));
      return { kind: "bounded-array", element: elementFacts.reduce(mergeFacts, elementFacts[0] ?? unknownFact), maxLength: elements.length };
    }
    if (value["type"] === "ObjectExpression") {
      const fields = new Map<string, AbstractFact>();
      for (const property of Array.isArray(value["properties"]) ? value["properties"] as Array<Record<string, unknown>> : []) {
        if (property["type"] !== "Property" || property["computed"] === true) continue;
        const key = staticMember(property["key"] as Record<string, unknown> | undefined);
        if (key !== undefined) fields.set(key, factOf(property["value"] as Record<string, unknown> | undefined, depth + 1));
      }
      return { kind: "record", fields };
    }
    if (value["type"] === "ConditionalExpression" || value["type"] === "LogicalExpression") {
      const left = factOf(value[value["type"] === "ConditionalExpression" ? "consequent" : "left"] as Record<string, unknown> | undefined, depth + 1);
      const right = factOf(value[value["type"] === "ConditionalExpression" ? "alternate" : "right"] as Record<string, unknown> | undefined, depth + 1);
      return mergeFacts(left, right);
    }
    if (value["type"] === "CallExpression") {
      const callee = value["callee"] as Record<string, unknown> | undefined;
      const directCall = identifierName(callee);
      if (directCall === "String") return { kind: "string" };
      if (["Number", "Boolean"].includes(directCall ?? "")) return { kind: "scalar" };
      if (callee?.["type"] === "MemberExpression") {
        const receiver = factOf(callee["object"] as Record<string, unknown> | undefined, depth + 1);
        const method = staticMember(callee["property"] as Record<string, unknown> | undefined);
        if (method === "slice" && receiver.kind === "bounded-array") {
          const args = Array.isArray(value["arguments"]) ? value["arguments"] as Array<Record<string, unknown>> : [];
          const limit = args[1]?.["type"] === "Literal" && typeof args[1]["value"] === "number" ? args[1]["value"] : receiver.maxLength;
          return { ...receiver, maxLength: Math.min(receiver.maxLength, limit) };
        }
        if (method === "filter" && receiver.kind === "bounded-array") return receiver;
        if (method === "trim" && receiver.kind === "string") return receiver;
        if (method === "includes" || method === "startsWith") return { kind: "scalar" };
        if (["Math", "Date"].includes(identifierName(callee["object"]) ?? "")) return { kind: "scalar" };
      }
      return unknownFact;
    }
    if (value["type"] === "MemberExpression") {
      const receiver = factOf(value["object"] as Record<string, unknown> | undefined, depth + 1);
      const member = staticMember(value["property"] as Record<string, unknown> | undefined);
      if (isEventRecordAccess(value)) return { kind: "open-record" };
      if (member === "length" && (receiver.kind === "bounded-array" || receiver.kind === "string")) return { kind: "scalar" };
      if (receiver.kind === "record" && member !== undefined) return receiver.fields.get(member) ?? unknownFact;
      if (receiver.kind === "bounded-array" && value["computed"] === true) return receiver.element;
    }
    if (["BinaryExpression", "UnaryExpression"].includes(String(value["type"]))) return { kind: "scalar" };
    return unknownFact;
  };
  // Binding names are globally unique in this restricted grammar, so a small
  // fixed point is enough to propagate aliases, callback element facts, and
  // call results without introducing flow-insensitive shadowing escapes.
  for (let iteration = 0; iteration <= declaredNames.size + 1; iteration += 1) {
    let changed = false;
    walk(program as never, {
      enter(node) {
        const record = node as unknown as Record<string, unknown>;
        if (record["type"] === "VariableDeclarator") {
          const name = identifierName(record["id"]);
          if (name !== undefined) {
            const next = factOf(record["init"] as Record<string, unknown> | undefined);
            if (next.kind !== "unknown" && factKey(facts.get(name) ?? unknownFact) !== factKey(next)) { facts.set(name, next); changed = true; }
          }
        }
        if (record["type"] === "AssignmentExpression" && record["operator"] === "=") {
          const name = identifierName(record["left"]);
          if (name !== undefined) {
            const assigned = factOf(record["right"] as Record<string, unknown> | undefined);
            const existing = facts.get(name);
            const next = existing === undefined ? assigned : mergeFacts(existing, assigned);
            if (next.kind === "unknown") facts.delete(name);
            else if (factKey(existing ?? unknownFact) !== factKey(next)) { facts.set(name, next); changed = true; }
          }
        }
        if (record["type"] === "CallExpression") {
          const callee = record["callee"] as Record<string, unknown> | undefined;
          if (callee?.["type"] !== "MemberExpression" || staticMember(callee["property"] as Record<string, unknown> | undefined) !== "filter") return;
          const receiver = factOf(callee["object"] as Record<string, unknown> | undefined);
          const callback = (Array.isArray(record["arguments"]) ? record["arguments"] as Array<Record<string, unknown>> : [])[0];
          const parameter = callback?.["type"] === "ArrowFunctionExpression" && Array.isArray(callback["params"])
            ? identifierName((callback["params"] as Array<Record<string, unknown>>)[0]) : undefined;
          if (parameter !== undefined && receiver.kind === "bounded-array"
            && factKey(facts.get(parameter) ?? unknownFact) !== factKey(receiver.element)) {
            facts.set(parameter, receiver.element); changed = true;
          }
        }
      },
    });
    if (!changed) break;
  }
  const capacityRoots = new Map<string, Set<string>>();
  const capacityRootsOf = (value: Record<string, unknown> | undefined, target: string, depth = 0): Set<string> | undefined => {
    if (value == null || depth > 64) return undefined;
    const direct = identifierName(value);
    if (direct !== undefined) return capacityRoots.get(direct);
    if (value["type"] === "ArrayExpression") return new Set([target]);
    if (value["type"] === "ConditionalExpression" || value["type"] === "LogicalExpression") {
      const left = capacityRootsOf(value[value["type"] === "ConditionalExpression" ? "consequent" : "left"] as Record<string, unknown> | undefined, target, depth + 1);
      const right = capacityRootsOf(value[value["type"] === "ConditionalExpression" ? "alternate" : "right"] as Record<string, unknown> | undefined, target, depth + 1);
      return left === undefined || right === undefined ? undefined : new Set([...left, ...right]);
    }
    if (value["type"] === "CallExpression") {
      const callee = value["callee"] as Record<string, unknown> | undefined;
      if (callee?.["type"] === "MemberExpression" && staticMember(callee["property"] as Record<string, unknown> | undefined) === "filter") {
        return capacityRootsOf(callee["object"] as Record<string, unknown> | undefined, target, depth + 1);
      }
      if (callee?.["type"] === "MemberExpression" && staticMember(callee["property"] as Record<string, unknown> | undefined) === "slice") {
        return capacityRootsOf(callee["object"] as Record<string, unknown> | undefined, target, depth + 1) ?? new Set([target]);
      }
    }
    return undefined;
  };
  for (let iteration = 0; iteration <= declaredNames.size; iteration += 1) {
    let changed = false;
    walk(program as never, { enter(node) {
      const record = node as unknown as Record<string, unknown>;
      if (record["type"] !== "VariableDeclarator") return;
      const name = identifierName(record["id"]);
      if (name === undefined || facts.get(name)?.kind !== "bounded-array") return;
      const roots = capacityRootsOf(record["init"] as Record<string, unknown> | undefined, name);
      if (roots !== undefined && [...roots].some((root) => capacityRoots.get(name)?.has(root) !== true)) {
        capacityRoots.set(name, new Set([...(capacityRoots.get(name) ?? []), ...roots])); changed = true;
      }
    } });
    if (!changed) break;
  }
  let undeclaredProjectInstance: string | undefined;
  let astIssue: string | undefined = syntaxIssue;
  const usedRuntimeRoots = new Set<string>();
  const functionCalls = new Map<string, Set<string>>();
  const functionMutations = new Map<string, Set<string>>();
  const functionCaptures = new Map<string, Set<string>>();
  const functionCallSites: Array<{ readonly caller: string; readonly callee: string; readonly start: number }> = [];
  const loopCallSites: Array<{
    readonly callee: string;
    readonly loops: readonly { readonly counter?: string; readonly iteratedRoots?: ReadonlySet<string> }[];
  }> = [];
  const pushSites: Array<{ readonly owner: string; readonly roots: ReadonlySet<string> }> = [];
  const activeLoops: Array<{ readonly counter?: string; readonly maxIndex?: number; readonly iteratedRoots?: ReadonlySet<string> }> = [];
  const allowedLoopUpdates = new WeakSet<object>();
  const exactIndexReads = new Set<string>();
  let currentFunction = "<program>";
  const functionStack: string[] = [];
  const resolvesCallable = (scope: LexicalScope | undefined, name: string): boolean => {
    for (let current = scope; current !== undefined; current = current.parent) {
      if (current.names.has(name)) return current.callableNames.has(name);
    }
    return false;
  };
  const recordMutation = (name: string): void => {
    const mutations = functionMutations.get(currentFunction) ?? new Set<string>();
    mutations.add(name);
    functionMutations.set(currentFunction, mutations);
  };
  walk(program as never, {
    enter(node, parent) {
      const record = node as unknown as Record<string, unknown>;
      const parentRecord = parent as unknown as Record<string, unknown> | null;
      const type = record["type"];
      if (type === "VariableDeclarator") {
        const name = identifierName(record["id"]);
        const next = factOf(record["init"] as Record<string, unknown> | undefined);
        if (name !== undefined && next.kind !== "unknown") facts.set(name, next);
      }
      if (type === "FunctionDeclaration" || type === "FunctionExpression" || type === "ArrowFunctionExpression") {
        functionStack.push(currentFunction);
        const directName = identifierName(record["id"]);
        const parentName = parentRecord?.["type"] === "VariableDeclarator" ? identifierName(parentRecord["id"]) : undefined;
        currentFunction = directName ?? parentName ?? `<anonymous:${String(record["start"])}>`;
        functionMutations.set(currentFunction, functionMutations.get(currentFunction) ?? new Set());
        functionCaptures.set(currentFunction, functionCaptures.get(currentFunction) ?? new Set());
      }
      if (type === "WhileStatement" || type === "DoWhileStatement") astIssue ??= "unbounded loop syntax";
      if (type === "ForStatement") {
        const init = record["init"] as Record<string, unknown> | undefined;
        const declarations = init?.["type"] === "VariableDeclaration" && Array.isArray(init["declarations"])
          ? init["declarations"] as Array<Record<string, unknown>> : [];
        const declaration = declarations[0];
        const counter = declaration === undefined ? undefined : identifierName(declaration["id"]);
        const initial = declaration?.["init"] as Record<string, unknown> | undefined;
        const test = record["test"] as Record<string, unknown> | undefined;
        const left = test?.["left"] as Record<string, unknown> | undefined;
        const right = test?.["right"] as Record<string, unknown> | undefined;
        const update = record["update"] as Record<string, unknown> | undefined;
        const updateTarget = update?.["type"] === "UpdateExpression" ? identifierName(update["argument"])
          : update?.["type"] === "AssignmentExpression" ? identifierName(update["left"]) : undefined;
        const monotonic = updateTarget === counter && (update?.["type"] === "UpdateExpression" && update["operator"] === "++"
          || update?.["type"] === "AssignmentExpression" && update["operator"] === "+="
            && (update["right"] as Record<string, unknown> | undefined)?.["value"] === 1);
        if (init?.["type"] !== "VariableDeclaration" || init["kind"] !== "let" || declarations.length !== 1
          || counter === undefined || initial?.["type"] !== "Literal" || initial["value"] !== 0
          || test?.["type"] !== "BinaryExpression" || identifierName(left) !== counter || !["<", "<="].includes(String(test["operator"]))
          || right?.["type"] !== "Literal" || typeof right["value"] !== "number"
          || (test["operator"] === "<" ? right["value"] > 1_000 : right["value"] >= 1_000)
          || !Number.isInteger(right["value"]) || right["value"] < 0 || !monotonic) astIssue ??= "loop bound is not a monotonic unit range limited to 1000";
        if (update !== undefined) allowedLoopUpdates.add(update);
        const body = record["body"];
        if (counter !== undefined && body !== undefined && typeof body === "object") walk(body as never, {
          enter(bodyNode) {
            const candidate = bodyNode as unknown as Record<string, unknown>;
            const target = candidate["type"] === "AssignmentExpression" ? identifierName(candidate["left"])
              : candidate["type"] === "UpdateExpression" ? identifierName(candidate["argument"]) : undefined;
            if (target === counter) astIssue ??= "loop body mutates its counter";
          },
        });
        const maxIndex = right?.["type"] === "Literal" && typeof right["value"] === "number"
          ? right["value"] - (test?.["operator"] === "<" ? 1 : 0) : undefined;
        activeLoops.push(counter === undefined ? {} : { counter, ...(maxIndex === undefined ? {} : { maxIndex }) });
      }
      if (type === "ForOfStatement") {
        const right = record["right"] as Record<string, unknown> | undefined;
        const bounded = right?.["type"] === "ArrayExpression" && Array.isArray(right["elements"]) && right["elements"].length <= 1_000
          || right?.["type"] === "Identifier" && typeof right["name"] === "string" && boundedIterable(right["name"]);
        if (!bounded) astIssue ??= "for-of iterable is not statically bounded";
        const iterable = identifierName(right);
        const iteratedRoots = iterable === undefined ? undefined : resolvedAliasRoots(iterable);
        const body = record["body"];
        if (iterable !== undefined && body !== undefined && typeof body === "object") walk(body as never, {
          enter(bodyNode) {
            const candidate = bodyNode as unknown as Record<string, unknown>;
            const target = candidate["type"] === "AssignmentExpression" ? identifierName(candidate["left"])
              : candidate["type"] === "UpdateExpression" ? identifierName(candidate["argument"]) : undefined;
            const callee = candidate["type"] === "CallExpression" ? candidate["callee"] as Record<string, unknown> | undefined : undefined;
            const callObject = callee?.["type"] === "MemberExpression" ? identifierName(callee["object"]) : undefined;
            if (target !== undefined && iteratedRoots !== undefined && aliasesIntersect(target, iteratedRoots)
              || callObject !== undefined && iteratedRoots !== undefined && aliasesIntersect(callObject, iteratedRoots)) astIssue ??= "for-of body mutates its iterated array";
          },
        });
        activeLoops.push(iteratedRoots === undefined ? {} : { iteratedRoots });
      }
      if (type === "Identifier") {
        const name = typeof record["name"] === "string" ? record["name"] : undefined;
        if (name !== undefined) {
          const isProperty = parentRecord?.["type"] === "MemberExpression" && parentRecord["property"] === node && parentRecord["computed"] !== true;
          const isObjectKey = parentRecord?.["type"] === "Property" && parentRecord["key"] === node && parentRecord["computed"] !== true;
          const isDeclaration = (parentRecord?.["type"] === "VariableDeclarator" && parentRecord["id"] === node)
            || ((parentRecord?.["type"] === "FunctionDeclaration" || parentRecord?.["type"] === "FunctionExpression") && parentRecord["id"] === node)
            || ((parentRecord?.["type"] === "FunctionDeclaration" || parentRecord?.["type"] === "FunctionExpression" || parentRecord?.["type"] === "ArrowFunctionExpression")
              && Array.isArray(parentRecord["params"]) && parentRecord["params"].includes(node));
          const allowedGlobal = ["String", "Number", "Boolean", "Math", "Date"].includes(name)
            || (name === "arguments" && metadata.placement === "event" && isDatagrid(instanceTypes.get(metadata.ownerInstanceName)) && metadata.kfEvent === "onClickRow")
            || declaredInstances.has(name) && instanceTypes.has(name);
          if (!isProperty && !isObjectKey && !isDeclaration && !resolvesLocal(scopeByNode.get(node), name) && !allowedGlobal) {
            astIssue ??= `undeclared global "${name}"`;
          } else if (!isProperty && !isObjectKey && !isDeclaration && resolvesLocal(scopeByNode.get(node), name)) {
            const declarationEnd = initializedAt.get(name);
            const referenceStart = typeof record["start"] === "number" ? record["start"] : -1;
            if (declarationEnd !== undefined && referenceStart < declarationEnd) {
              const referenceOwner = scopeByNode.get(node)?.functionOwner;
              if (referenceOwner === declarationOwner.get(name)) astIssue ??= `use before declaration: ${name}`;
              else {
                const captures = functionCaptures.get(currentFunction) ?? new Set<string>();
                captures.add(name);
                functionCaptures.set(currentFunction, captures);
              }
            }
          }
        }
      }
      if (type === "CallExpression") {
        const callee = record["callee"] as Record<string, unknown> | undefined;
        if (callee?.["type"] === "Identifier") {
          const name = typeof callee["name"] === "string" ? callee["name"] : undefined;
          if (name === undefined || (!resolvesCallable(scopeByNode.get(node), name) && !["String", "Number", "Boolean"].includes(name))) astIssue ??= "dynamic or unknown direct call";
          if (name !== undefined && resolvesCallable(scopeByNode.get(node), name)) {
            const edges = functionCalls.get(currentFunction) ?? new Set<string>(); edges.add(name); functionCalls.set(currentFunction, edges);
            const start = typeof record["start"] === "number" ? record["start"] : Number.MAX_SAFE_INTEGER;
            functionCallSites.push({ caller: currentFunction, callee: name, start });
            if (activeLoops.length > 0) loopCallSites.push({ callee: name, loops: activeLoops.map((loop) => ({ ...loop })) });
          }
        } else if (callee?.["type"] === "MemberExpression") {
          const object = callee["object"] as Record<string, unknown> | undefined;
          const property = callee["property"] as Record<string, unknown> | undefined;
          const objectName = identifierName(object);
          const member = staticMember(property);
          const args = Array.isArray(record["arguments"]) ? record["arguments"] as Array<Record<string, unknown>> : [];
          const receiver = factOf(object);
          const standardGlobal = objectName !== undefined && !resolvesLocal(object === undefined ? undefined : scopeByNode.get(object), objectName);
          const runtimeType = objectName === undefined ? undefined : instanceTypes.get(objectName);
          const exactOverlayVisibilityCall = visibilityAction !== undefined
            && objectName === visibilityAction.targetInstanceName
            && runtimeType?.kind === "layout"
            && member === "setVisible"
            && args.length === 1
            && args[0]?.["type"] === "Literal"
            && args[0]["value"] === visibilityAction.visible;
          const runtimeCall = objectName !== undefined && declaredInstances.has(objectName)
            && (member === "SetData" && (isUiModel(runtimeType, 31) || isDatagrid(runtimeType)) && args.length === 1
              || exactOverlayVisibilityCall);
          const mathCall = standardGlobal && (objectName === "Math" && ["abs", "ceil", "floor", "round", "trunc"].includes(member ?? "") && args.length === 1
            || objectName === "Math" && ["max", "min"].includes(member ?? "") && args.length >= 1 && args.length <= 1_000);
          const dateCall = standardGlobal && (objectName === "Date" && member === "parse" && args.length === 1
            || objectName === "Date" && member === "UTC" && args.length >= 1 && args.length <= 7);
          const arrayCall = receiver.kind === "bounded-array" && ["slice", "filter", "push"].includes(member ?? "");
          const stringCall = receiver.kind === "string" && ["trim", "includes", "startsWith"].includes(member ?? "");
          const standardCall = mathCall || dateCall || arrayCall || stringCall;
          if (!runtimeCall && !standardCall) astIssue ??= "dynamic or unknown member call";
          if (member === "slice") {
            if (args.length !== 2 || args[0]?.["type"] !== "Literal" || args[0]["value"] !== 0
              || args[1]?.["type"] !== "Literal" || typeof args[1]["value"] !== "number"
              || args[1]["value"] < 0 || args[1]["value"] > 1_000 || receiver.kind !== "bounded-array") astIssue ??= "slice requires a bounded receiver and literal bounds from 0 to 1000";
          }
          if (member === "filter") {
            if (receiver.kind !== "bounded-array" || args.length !== 1 || args[0]?.["type"] !== "ArrowFunctionExpression") {
              astIssue ??= "filter requires a bounded receiver and one inline arrow callback";
            } else {
              const callbackName = `<anonymous:${String(args[0]["start"])}>`;
              const edges = functionCalls.get(currentFunction) ?? new Set<string>();
              edges.add(callbackName); functionCalls.set(currentFunction, edges);
            }
          }
          if (member === "push" && (receiver.kind !== "bounded-array" || receiver.maxLength >= 1_000 || args.length !== 1)) {
            astIssue ??= "push requires a bounded receiver below capacity and one value";
          }
          if (member === "push") {
            const roots = objectName === undefined ? undefined : capacityRoots.get(objectName);
            if (activeLoops.length > 0 || currentFunction.startsWith("<anonymous:") || receiver.kind !== "bounded-array" || roots === undefined) {
              astIssue ??= "push cannot execute in a loop, repeated callback, or unproven array";
            } else pushSites.push({ owner: currentFunction, roots: new Set(roots) });
          }
          if (member === "trim" && (receiver.kind !== "string" || args.length !== 0)) astIssue ??= "trim requires a string receiver and no arguments";
          if ((member === "includes" || member === "startsWith") && (receiver.kind !== "string" || args.length !== 1)) {
            astIssue ??= `${member} requires a string receiver and one argument`;
          }
        } else astIssue ??= "dynamic or unknown call target";
      }
      if (type === "MemberExpression" && record["computed"] === true) {
        const property = record["property"] as Record<string, unknown> | undefined;
        const receiver = factOf(record["object"] as Record<string, unknown> | undefined);
        const literalIndex = property?.["type"] === "Literal" && typeof property["value"] === "number" && Number.isInteger(property["value"])
          && property["value"] >= 0 && receiver.kind === "bounded-array" && property["value"] < receiver.maxLength;
        const counter = identifierName(property);
        const boundedCounter = counter !== undefined && receiver.kind === "bounded-array"
          && activeLoops.some((loop) => loop.counter === counter && loop.maxIndex !== undefined && loop.maxIndex < receiver.maxLength);
        const exactIndex = counter === undefined ? undefined : exactIntegerNames.get(counter);
        const boundedExactIndex = exactIndex !== undefined && receiver.kind === "bounded-array" && exactIndex < receiver.maxLength;
        if (boundedExactIndex && !boundedCounter && counter !== undefined) exactIndexReads.add(counter);
        const literalField = property?.["type"] === "Literal" && typeof property["value"] === "string";
        if (!literalField && !literalIndex && !boundedCounter && !boundedExactIndex && !isEventRecordAccess(record)) astIssue ??= "dynamic computed member access";
      }
      if (type === "Property") {
        if (record["kind"] !== "init" || record["method"] === true || record["computed"] === true) astIssue ??= "getter, setter, method, or computed object property";
        const key = record["key"] as Record<string, unknown> | undefined;
        const propertyName = identifierName(key) ?? (key?.["type"] === "Literal" && typeof key["value"] === "string" ? key["value"] : undefined);
        if (["__proto__", "prototype", "constructor"].includes(propertyName ?? "")) astIssue ??= `reserved object property: ${propertyName}`;
      }
      if (type === "UnaryExpression" && !["!", "+", "-"].includes(String(record["operator"]))) astIssue ??= "unreviewed unary operator";
      if (type === "BinaryExpression" && !["===", "!==", "<", "<=", ">", ">=", "+", "-", "*", "/", "%"].includes(String(record["operator"]))) astIssue ??= "unreviewed binary operator";
      if (type === "LogicalExpression" && record["operator"] !== "&&" && record["operator"] !== "||") astIssue ??= "unreviewed logical operator";
      if (type === "AssignmentExpression" || type === "UpdateExpression") {
        const target = type === "AssignmentExpression" ? record["left"] as Record<string, unknown> | undefined : record["argument"] as Record<string, unknown> | undefined;
        const targetName = identifierName(target);
        if (type === "AssignmentExpression" && !["=", "+=", "-=", "*=", "/="].includes(String(record["operator"]))) astIssue ??= "unreviewed assignment operator";
        if (type === "UpdateExpression" && record["operator"] !== "++" && record["operator"] !== "--") astIssue ??= "unreviewed update operator";
        if (targetName !== undefined && !mutableNames.has(targetName)) astIssue ??= "assignment/update target is not a mutable local";
        if (targetName === undefined && target?.["type"] !== "MemberExpression") astIssue ??= "assignment/update target is not reviewed";
        if (targetName !== undefined) {
          recordMutation(targetName);
          if (!allowedLoopUpdates.has(node) && activeLoops.some((loop) => loop.counter === targetName
            || loop.iteratedRoots !== undefined && aliasesIntersect(targetName, loop.iteratedRoots))) astIssue ??= "loop dependency is mutated";
        } else if (target?.["type"] === "MemberExpression") {
          const targetObject = target["object"] as Record<string, unknown> | undefined;
          const targetProperty = target["property"] as Record<string, unknown> | undefined;
          const targetFact = factOf(targetObject);
          const literalIndex = targetProperty?.["type"] === "Literal" && typeof targetProperty["value"] === "number"
            && Number.isInteger(targetProperty["value"]) && targetProperty["value"] >= 0
            && targetFact.kind === "bounded-array" && targetProperty["value"] < targetFact.maxLength;
          const counter = identifierName(targetProperty);
          const boundedCounter = counter !== undefined && targetFact.kind === "bounded-array"
            && activeLoops.some((loop) => loop.counter === counter && loop.maxIndex !== undefined && loop.maxIndex < targetFact.maxLength);
          const objectName = identifierName(target["object"]);
          if (type !== "AssignmentExpression" || record["operator"] !== "=" || target["computed"] !== true || (!literalIndex && !boundedCounter)) {
            astIssue ??= "member assignment requires a proven bounded-array index";
          }
          if (objectName !== undefined) {
            recordMutation(objectName);
            if (activeLoops.some((loop) => loop.iteratedRoots !== undefined && aliasesIntersect(objectName, loop.iteratedRoots))) astIssue ??= "iterated array element is mutated";
          }
        }
      }
      if (type === "CallExpression") {
        const callee = record["callee"] as Record<string, unknown> | undefined;
        if (callee?.["type"] === "MemberExpression" && identifierName(callee["property"]) === "push") {
          const receiver = identifierName(callee["object"]);
          if (receiver !== undefined) {
            recordMutation(receiver);
            if (activeLoops.some((loop) => loop.iteratedRoots !== undefined && aliasesIntersect(receiver, loop.iteratedRoots))) astIssue ??= "iterated array alias is mutated";
          }
        }
      }
      if (type === "SpreadElement") {
        const argument = record["argument"] as Record<string, unknown> | undefined;
        if (parentRecord?.["type"] !== "ObjectExpression" || factOf(argument).kind !== "record") {
          astIssue ??= "spread requires a proven bounded record operand";
        }
      }
      if (type !== "MemberExpression") return;
      const object = record["object"] as Record<string, unknown> | undefined;
      const name = object?.["type"] === "Identifier" && typeof object["name"] === "string" ? object["name"] : undefined;
      const property = record["property"] as Record<string, unknown> | undefined;
      const member = property?.["type"] === "Identifier" && typeof property["name"] === "string" ? property["name"]
        : property?.["type"] === "Literal" && typeof property["value"] === "string" ? property["value"] : undefined;
      if (["__proto__", "prototype", "constructor"].includes(member ?? "")) { astIssue ??= `reserved member access: ${member}`; return; }
      const called = parentRecord?.["type"] === "CallExpression" && parentRecord["callee"] === node;
      if (["slice", "filter", "push", "trim", "includes", "startsWith"].includes(member ?? "") && !called) {
        astIssue ??= `method alias is forbidden: ${member}`;
      }
      if (name !== undefined && resolvesLocal(scopeByNode.get(node), name)) {
        const receiver = factOf(object);
        const literalIndex = property?.["type"] === "Literal" && typeof property["value"] === "number" && Number.isInteger(property["value"])
          && property["value"] >= 0 && receiver.kind === "bounded-array" && property["value"] < receiver.maxLength;
        const counter = identifierName(property);
        const boundedCounter = counter !== undefined && receiver.kind === "bounded-array"
          && activeLoops.some((loop) => loop.counter === counter && loop.maxIndex !== undefined && loop.maxIndex < receiver.maxLength);
        const exactIndex = counter === undefined ? undefined : exactIntegerNames.get(counter);
        const boundedExactIndex = exactIndex !== undefined && receiver.kind === "bounded-array" && exactIndex < receiver.maxLength;
        if (boundedExactIndex && !boundedCounter && counter !== undefined) exactIndexReads.add(counter);
        const exactField = receiver.kind === "record" && member !== undefined && receiver.fields.has(member);
        const openFieldName = receiver.kind === "open-record" ? (record["computed"] === false && property?.["type"] === "Identifier"
          && typeof property["name"] === "string" ? property["name"]
          : record["computed"] === true && property?.["type"] === "Literal" && typeof property["value"] === "string" ? property["value"] : undefined) : undefined;
        const openField = openFieldName !== undefined && !["__proto__", "prototype", "constructor"].includes(openFieldName);
        if (!called && !literalIndex && !boundedCounter && !boundedExactIndex
          && !(member === "length" && (receiver.kind === "bounded-array" || receiver.kind === "string")) && !exactField && !openField) {
          astIssue ??= `local member exactness is unproven: ${name}.${member ?? "?"}`;
        }
        return;
      }
      if (name === undefined || !instanceTypes.has(name)) return;
      usedRuntimeRoots.add(name);
      if (!declaredInstances.has(name)) { undeclaredProjectInstance ??= name; return; }
      const written = parentRecord?.["type"] === "AssignmentExpression" && parentRecord["left"] === node
        || parentRecord?.["type"] === "UpdateExpression" && parentRecord["argument"] === node;
      const runtimeType = instanceTypes.get(name);
      const supported = (isUiModel(runtimeType, 38) && member === "Value" && !called && !written)
        || (isUiModel(runtimeType, 31) && member === "SetData" && called)
        || (isDatagrid(runtimeType) && member === "SetData" && called)
        || (visibilityAction !== undefined && runtimeType?.kind === "layout"
          && name === visibilityAction.targetInstanceName && member === "setVisible" && called && !written);
      if (!supported) unsupportedRuntimeMember ??= `${name}.${member ?? "?"}`;
    },
    leave(node) {
      const type = (node as unknown as Record<string, unknown>)["type"];
      if (type === "FunctionDeclaration" || type === "FunctionExpression" || type === "ArrowFunctionExpression") currentFunction = functionStack.pop() ?? "<program>";
      if (type === "ForStatement" || type === "ForOfStatement") activeLoops.pop();
    },
  });
  for (let iteration = 0; iteration <= callableNames.size; iteration += 1) {
    let changed = false;
    for (const [caller, callees] of functionCalls) {
      const mutations = functionMutations.get(caller) ?? new Set<string>();
      const captures = functionCaptures.get(caller) ?? new Set<string>();
      functionMutations.set(caller, mutations);
      functionCaptures.set(caller, captures);
      const beforeMutations = mutations.size;
      const beforeCaptures = captures.size;
      for (const callee of callees) {
        (functionMutations.get(callee) ?? []).forEach((name) => mutations.add(name));
        (functionCaptures.get(callee) ?? []).forEach((name) => captures.add(name));
      }
      if (mutations.size !== beforeMutations || captures.size !== beforeCaptures) changed = true;
    }
    if (!changed) break;
  }
  for (const callSite of loopCallSites) {
    const mutations = functionMutations.get(callSite.callee) ?? new Set<string>();
    if (callSite.loops.some((loop) => loop.counter !== undefined && mutations.has(loop.counter)
      || loop.iteratedRoots !== undefined && [...mutations].some((name) => aliasesIntersect(name, loop.iteratedRoots!)))) {
      astIssue ??= `called function mutates an active loop dependency: ${callSite.callee}`;
    }
  }
  for (const callSite of functionCallSites) {
    for (const capture of functionCaptures.get(callSite.callee) ?? []) {
      if (declarationOwner.get(capture) === callSite.caller && callSite.start < (initializedAt.get(capture) ?? -1)) {
        astIssue ??= `use before declaration through ${callSite.callee}: ${capture}`;
      }
    }
  }
  for (const name of exactIndexReads) {
    if ((functionMutations.get("<program>") ?? new Set<string>()).has(name)) {
      astIssue ??= `exact integer index is mutated in the reachable call graph: ${name}`;
    }
  }
  interface ExecutionCallSite {
    readonly caller: string;
    readonly callee: string;
    readonly conditional: boolean;
    readonly conditionalPath: readonly string[];
    readonly repeated: boolean;
  }
  const executionCallSites: ExecutionCallSite[] = [];
  const astRecord = (value: unknown): Record<string, unknown> | undefined => typeof value === "object" && value !== null
    && typeof (value as Record<string, unknown>)["type"] === "string" ? value as Record<string, unknown> : undefined;
  const visitExecution = (
    node: Record<string, unknown>, owner: string, conditionalPath: readonly string[], repeated: boolean,
  ): void => {
    const type = String(node["type"]);
    const start = typeof node["start"] === "number" ? node["start"] : -1;
    if (type === "FunctionDeclaration" || type === "ArrowFunctionExpression" || type === "FunctionExpression") {
      const functionOwner = identifierName(node["id"])
        ?? `<anonymous:${String(node["start"])}>`;
      const body = astRecord(node["body"]);
      if (body !== undefined) visitExecution(body, functionOwner, [], false);
      return;
    }
    if (type === "VariableDeclarator") {
      const init = astRecord(node["init"]);
      if (init?.["type"] === "ArrowFunctionExpression") {
        const functionOwner = identifierName(node["id"]) ?? `<anonymous:${String(init["start"])}>`;
        const body = astRecord(init["body"]);
        if (body !== undefined) visitExecution(body, functionOwner, [], false);
        return;
      }
    }
    if (type === "IfStatement" || type === "ConditionalExpression") {
      const test = astRecord(node["test"]);
      if (test !== undefined) visitExecution(test, owner, conditionalPath, repeated);
      const consequent = astRecord(node["consequent"]);
      if (consequent !== undefined) visitExecution(consequent, owner, [...conditionalPath, `${start}:then`], repeated);
      const alternate = astRecord(node["alternate"]);
      if (alternate !== undefined) visitExecution(alternate, owner, [...conditionalPath, `${start}:else`], repeated);
      return;
    }
    if (type === "LogicalExpression") {
      const left = astRecord(node["left"]);
      if (left !== undefined) visitExecution(left, owner, conditionalPath, repeated);
      const right = astRecord(node["right"]);
      if (right !== undefined) visitExecution(right, owner, [...conditionalPath, `${start}:then`], repeated);
      return;
    }
    if (type === "ForStatement" || type === "ForOfStatement") {
      for (const key of ["init", "left", "right", "test", "update", "body"] as const) {
        const child = astRecord(node[key]);
        if (child !== undefined) visitExecution(child, owner, conditionalPath, true);
      }
      return;
    }
    if (type === "CallExpression") {
      const callee = astRecord(node["callee"]);
      const direct = identifierName(callee);
      if (direct !== undefined && resolvesCallable(callee === undefined ? undefined : scopeByNode.get(callee), direct)) {
        executionCallSites.push({ caller: owner, callee: direct, conditional: conditionalPath.length > 0, conditionalPath, repeated });
      }
      if (callee?.["type"] === "MemberExpression" && staticMember(callee["property"] as Record<string, unknown> | undefined) === "filter") {
        const callback = (Array.isArray(node["arguments"]) ? node["arguments"] as unknown[] : []).map(astRecord)
          .find((candidate) => candidate?.["type"] === "ArrowFunctionExpression");
        if (callback !== undefined) executionCallSites.push({
          caller: owner, callee: `<anonymous:${String(callback["start"])}>`, conditional: conditionalPath.length > 0,
          conditionalPath, repeated: true,
        });
      }
    }
    for (const [key, value] of Object.entries(node)) {
      if (["type", "start", "end", "loc", "range"].includes(key)) continue;
      const child = astRecord(value);
      if (child !== undefined) visitExecution(child, owner, conditionalPath, repeated);
      else if (Array.isArray(value)) for (const entry of value) {
        const item = astRecord(entry);
        if (item !== undefined) visitExecution(item, owner, conditionalPath, repeated);
      }
    }
  };
  visitExecution(program, "<program>", [], false);

  type SaturatedCount = 0 | 1 | "many";
  const addCounts = (left: SaturatedCount, right: SaturatedCount): SaturatedCount => left === "many" || right === "many" || left + right > 1
    ? "many" : left + right as SaturatedCount;
  const multiplyCounts = (left: SaturatedCount, right: SaturatedCount): SaturatedCount => left === 0 || right === 0 ? 0
    : left === "many" || right === "many" ? "many" : 1;
  const callSitesByCaller = new Map<string, ExecutionCallSite[]>();
  for (const site of executionCallSites) callSitesByCaller.set(site.caller, [...(callSitesByCaller.get(site.caller) ?? []), site]);
  const localInvocations = new Map<string, Map<string, SaturatedCount>>();
  for (const [caller, sites] of callSitesByCaller) {
    const byCallee = new Map<string, ExecutionCallSite[]>();
    for (const site of sites) byCallee.set(site.callee, [...(byCallee.get(site.callee) ?? []), site]);
    const summaries = new Map<string, SaturatedCount>();
    for (const [callee, matches] of byCallee) {
      const unconditional = matches.filter((site) => !site.conditional);
      const conditional = matches.filter((site) => site.conditional);
      let conditionalCount: SaturatedCount = conditional.length === 0 ? 0 : conditional.length === 1 ? 1 : "many";
      if (conditional.length > 0 && conditional.every((site) => site.conditionalPath.length === 1)) {
        const segments = conditional.map((site) => site.conditionalPath[0]!);
        const branchIds = new Set(segments.map((segment) => segment.slice(0, segment.lastIndexOf(":"))));
        const thenCount = segments.filter((segment) => segment.endsWith(":then")).length;
        const elseCount = segments.filter((segment) => segment.endsWith(":else")).length;
        if (branchIds.size === 1 && thenCount > 0 && elseCount > 0) conditionalCount = Math.max(thenCount, elseCount) > 1 ? "many" : 1;
      }
      const directCount: SaturatedCount = unconditional.length === 0 ? 0 : unconditional.length === 1 ? 1 : "many";
      summaries.set(callee, matches.some((site) => site.repeated) ? "many" : addCounts(directCount, conditionalCount));
    }
    localInvocations.set(caller, summaries);
  }
  const graphNodes = new Set<string>(["<program>", ...functionCalls.keys()]);
  for (const callees of functionCalls.values()) for (const callee of callees) graphNodes.add(callee);
  const indegrees = new Map([...graphNodes].map((name) => [name, 0]));
  for (const callees of functionCalls.values()) for (const callee of callees) indegrees.set(callee, (indegrees.get(callee) ?? 0) + 1);
  const ready = [...graphNodes].filter((name) => indegrees.get(name) === 0).sort((left, right) => left.localeCompare(right, "en-US"));
  const topologicalOrder: string[] = [];
  while (ready.length > 0) {
    const caller = ready.shift()!;
    topologicalOrder.push(caller);
    for (const callee of [...(functionCalls.get(caller) ?? [])].sort((left, right) => left.localeCompare(right, "en-US"))) {
      const next = (indegrees.get(callee) ?? 0) - 1;
      indegrees.set(callee, next);
      if (next === 0) { ready.push(callee); ready.sort((left, right) => left.localeCompare(right, "en-US")); }
    }
  }
  if (topologicalOrder.length !== graphNodes.size) astIssue ??= "function recursion is forbidden";
  const functionExecutionCounts = new Map<string, SaturatedCount>([["<program>", 1]]);
  for (const caller of topologicalOrder) {
    const callerCount = functionExecutionCounts.get(caller) ?? 0;
    for (const [callee, localCount] of localInvocations.get(caller) ?? []) {
      functionExecutionCounts.set(callee, addCounts(functionExecutionCounts.get(callee) ?? 0, multiplyCounts(callerCount, localCount)));
    }
  }
  const pushesByRoot = new Map<string, number>();
  for (const site of pushSites) {
    if ((functionExecutionCounts.get(site.owner) ?? 0) !== 1) { astIssue ??= `push owner execution count is not statically one: ${site.owner}`; continue; }
    for (const root of site.roots) pushesByRoot.set(root, (pushesByRoot.get(root) ?? 0) + 1);
  }
  for (const [root, pushes] of pushesByRoot) {
    let initialMax: number | undefined;
    for (const [name, fact] of facts) {
      if (fact.kind !== "bounded-array" || capacityRoots.get(name)?.has(root) !== true) continue;
      initialMax = Math.max(initialMax ?? 0, fact.maxLength);
    }
    if (initialMax === undefined || initialMax + pushes > 1_000) astIssue ??= `push capacity exceeds 1000 for ${root}`;
  }
  // Project-instance evidence is more specific than the generic global/call
  // grammar rejection discovered by the same walk. Both are fail-closed, but
  // surface the evidence failure so callers cannot mistake a forged instance
  // or method for a merely unsupported JavaScript construct.
  if (undeclaredProjectInstance !== undefined) return `compiled script uses undeclared instance reference "${undeclaredProjectInstance}"`;
  if (unsupportedRuntimeMember !== undefined) return `compiled script uses unsupported runtime member "${unsupportedRuntimeMember}"`;
  if (astIssue !== undefined) return `compiled script AST rejected ${astIssue}`;
  const cycleVisit = (name: string, active: Set<string>, done: Set<string>): boolean => {
    if (active.has(name)) return true;
    if (done.has(name)) return false;
    active.add(name);
    for (const target of functionCalls.get(name) ?? []) if (cycleVisit(target, active, done)) return true;
    active.delete(name); done.add(name); return false;
  };
  const callDone = new Set<string>();
  for (const name of functionCalls.keys()) if (cycleVisit(name, new Set(), callDone)) return "compiled script AST rejected recursive call graph";
  for (const { instanceName } of metadata.instanceReferences) {
    if (instanceName !== metadata.ownerInstanceName && !usedRuntimeRoots.has(instanceName)) return `compiled script does not use declared instance reference "${instanceName}"`;
  }
  if (metadata.placement === "event") {
    const ownerType = instanceTypes.get(metadata.ownerInstanceName);
    const reviewedEvent = (isUiModel(ownerType, 35) && metadata.kfEvent === "onClick" && metadata.linkId === 200001)
      || (isUiModel(ownerType, 31) && metadata.kfEvent === "Cell-click" && metadata.linkId === 200006)
      || (isDatagrid(ownerType) && metadata.kfEvent === "onClickRow" && metadata.linkId === 200024)
      || (isUiModel(ownerType, 47) && metadata.kfEvent === "Tab-click" && metadata.linkId === null);
    if (!reviewedEvent || metadata.phase === null) return "compiled script event is not in the evidence-backed allowlist";
  } else if (!(isUiModel(instanceTypes.get(metadata.ownerInstanceName), 31)
      || isDatagrid(instanceTypes.get(metadata.ownerInstanceName)))
    || metadata.kfEvent !== null || metadata.linkId !== null || metadata.phase !== null) {
    return "compiled configureData placement is not in the evidence-backed allowlist";
  }
  const declaredPages = new Set(metadata.pageReferences.map((reference) => reference.pageGuid));
  for (const { pageGuid } of metadata.pageReferences) {
    if (!source.includes(JSON.stringify(pageGuid))) return `compiled script does not use declared page reference "${pageGuid}"`;
  }
  for (const pageGuid of source.match(/(?<![A-Za-z0-9])k?[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}(?![A-Za-z0-9])/gi) ?? []) {
    if (!declaredPages.has(pageGuid)) return `compiled script uses undeclared page reference "${pageGuid}"`;
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Layer 1: packageStructure
// ---------------------------------------------------------------------------

async function checkPackageStructure(candidate: string, versionDir: string): Promise<CheckOutcome> {
  const issues: string[] = [];
  const root = rootPath(candidate, versionDir);

  if (!(await exists(path.join(root, "project.json")))) {
    issues.push("missing project.json");
  } else {
    try {
      const project = asRecord(JSON.parse(await readFile(path.join(root, "project.json"), "utf8")));
      if (typeof project["name"] !== "string") issues.push("project.json has no name");
    } catch {
      issues.push("project.json is not valid JSON");
    }
  }

  if (!(await exists(path.join(root, "project", "pageManager.json")))) {
    issues.push("missing project/pageManager.json");
  } else {
    try {
      const manager = asRecord(JSON.parse(await readFile(path.join(root, "project", "pageManager.json"), "utf8")));
      if (!Array.isArray(manager["Pages"])) issues.push("project/pageManager.json has no Pages array");
    } catch {
      issues.push("project/pageManager.json is not valid JSON");
    }
  }

  const pageDir = path.join(root, "project", "page");
  if (!(await exists(pageDir))) {
    issues.push("missing project/page/ directory");
  } else {
    const pageFiles = (await readdir(pageDir)).filter((f) => f.toLowerCase().endsWith(".json"));
    if (pageFiles.length === 0) issues.push("no page files under project/page/");
  }

  return issues.length > 0 ? fail(issues) : pass();
}

// ---------------------------------------------------------------------------
// Layer 2: jsonSchema
// ---------------------------------------------------------------------------

async function checkJsonSchema(candidate: string, versionDir: string): Promise<CheckOutcome> {
  const issues: string[] = [];
  const root = rootPath(candidate, versionDir);
  const jsonFiles = await listJsonFiles(root);

  for (const rel of jsonFiles) {
    try {
      JSON.parse(await readFile(path.join(root, rel), "utf8"));
    } catch {
      issues.push(`invalid JSON: ${rel}`);
    }
  }

  const pageDir = path.join(root, "project", "page");
  if (await exists(pageDir)) {
    for (const file of (await readdir(pageDir)).filter((f) => f.toLowerCase().endsWith(".json"))) {
      const rel = `project/page/${file}`;
      let page: Record<string, unknown>;
      try {
        page = asRecord(JSON.parse(await readFile(path.join(root, rel), "utf8")));
      } catch {
        continue; // already reported as invalid JSON
      }
      if (typeof page["guid"] !== "string") issues.push(`${rel}: page guid is not a string`);
      if (!Array.isArray(page["objects"])) issues.push(`${rel}: page objects is not an array`);
    }
  }

  return issues.length > 0 ? fail(issues) : pass();
}

// ---------------------------------------------------------------------------
// Layer 3: references
// ---------------------------------------------------------------------------

async function checkReferences(candidate: string): Promise<CheckOutcome> {
  const issues: string[] = [];
  let inspection;
  try {
    inspection = await inspectClientProject(candidate);
  } catch (err) {
    return fail([`candidate cannot be inspected: ${String(err)}`]);
  }
  const rawPages = inspection.raw.pages;
  const pageGuids = new Set(Object.keys(rawPages));
  const instanceNames = new Set<string>();
  for (const tree of Object.values(rawPages)) {
    walkControls(tree, "instances", (control) => {
      const name = nativeInstanceName(control);
      if (name !== undefined) instanceNames.add(name);
    });
  }

  const versionDir = await resolveVersionDirName(candidate);
  const versionRoot = versionDir === "." ? candidate : path.join(candidate, versionDir);
  for (const [pageGuid, tree] of Object.entries(rawPages)) {
    walkControls(tree, `page ${pageGuid}`, (control, where) => {
      const checkSourceReferences = (source: unknown): void => {
        if (typeof source !== "string") return;
        const parsed = compilerOwnedSegments(source);
        if (parsed.issue !== undefined) {
          issues.push(`${where}: ${parsed.issue}`);
          return;
        }
        for (const { metadata } of parsed.segments) {
          for (const reference of metadata.instanceReferences) {
            if (!instanceNames.has(reference.instanceName)) issues.push(`${where}: unknown compiler-owned instance reference "${reference.instanceName}"`);
          }
          for (const reference of metadata.pageReferences) {
            if (!pageGuids.has(reference.pageGuid)) issues.push(`${where}: unknown compiler-owned page reference "${reference.pageGuid}"`);
          }
        }
      };
      const links = asRecord(control["linkMng"])["linkList"];
      if (Array.isArray(links)) links.forEach((rawLink) => checkSourceReferences(asRecord(rawLink)["script"]));
      checkSourceReferences(control["configureData"]);
      const src = control["src"];
      if (typeof src !== "string" || !/^[0-9a-f]{64}\.(?:png|jpg|webp)$/.test(src)) return;
      if (!existsSync(path.join(versionRoot, "project", "res", "images", src))) {
        issues.push(`${where}: missing agent asset resource "${src}"`);
      }
    });
  }

  // GUID uniqueness across all controls.
  const guidCount = new Map<string, string[]>();
  for (const [pageGuid, tree] of Object.entries(rawPages)) {
    walkControls(tree, `page ${pageGuid}`, (control, where) => {
      const guid = control["guid"];
      if (typeof guid === "string" && guid !== "") {
        const list = guidCount.get(guid);
        const loc = `${pageGuid} ${where}`;
        if (list === undefined) guidCount.set(guid, [loc]);
        else list.push(loc);
      }
    });
  }
  for (const [guid, locs] of guidCount) {
    if (locs.length > 1) issues.push(`duplicate control GUID ${guid} at ${locs.join(" and ")}`);
  }

  // pageManager <-> page files.
  const managerPages: Array<Record<string, unknown>> = Array.isArray(
    asRecord(inspection.raw.pageManager)["Pages"],
  )
    ? (asRecord(inspection.raw.pageManager)["Pages"] as Array<Record<string, unknown>>)
    : [];
  for (const entry of managerPages) {
    if (typeof entry["id"] === "string" && !pageGuids.has(entry["id"])) {
      issues.push(`pageManager references unknown page id "${entry["id"]}"`);
    }
  }
  for (const pageGuid of pageGuids) {
    if (!managerPages.some((m) => m["id"] === pageGuid)) {
      issues.push(`page ${pageGuid} is missing from pageManager`);
    }
  }

  // Serialized action references (navigatePage -> page GUID, setVariable -> variable name).
  const variableNames = new Set(Object.values(inspection.index.variables).map((v) => v.name));
  for (const [pageGuid, tree] of Object.entries(rawPages)) {
    walkControls(tree, `page ${pageGuid}`, (control) => {
      const links = asRecord(control["linkMng"])["linkList"];
      if (!Array.isArray(links)) return;
      for (const rawLink of links) {
        const link = asRecord(rawLink);
        if (link["action"] === "navigatePage") {
          if (typeof link["pageId"] !== "string") continue; // shape issue -> businessRules
          if (!pageGuids.has(link["pageId"])) {
            issues.push(`navigatePage references unknown page "${link["pageId"]}"`);
          }
        } else if (link["action"] === "setVariable") {
          if (typeof link["variableId"] !== "string") continue; // shape issue -> businessRules
          if (!variableNames.has(link["variableId"])) {
            issues.push(`setVariable references unknown variable "${link["variableId"]}"`);
          }
        }
      }
    });
  }

  return issues.length > 0 ? fail(issues) : pass();
}

// ---------------------------------------------------------------------------
// Layer 4: businessRules
// ---------------------------------------------------------------------------

async function checkBusinessRules(
  candidate: string,
  plan: NormalizedPlan,
): Promise<CheckOutcome> {
  const issues: string[] = [];
  if (plan.operations.length === 0) {
    issues.push(
      "change plan contains no operations (a confirmed plan must change at least one entity)",
    );
  }
  let inspection;
  try {
    inspection = await inspectClientProject(candidate);
  } catch (err) {
    return fail([`candidate cannot be inspected: ${String(err)}`]);
  }
  const instanceTypesByPage = new Map<string, Map<string, RuntimeControlType>>();
  Object.entries(inspection.raw.pages).forEach(([pageGuid, tree]) => {
    const pageInstances = new Map<string, Array<{ readonly runtimeType: RuntimeControlType; readonly where: string }>>();
    walkControls(tree, `page ${pageGuid}`, (control, where) => {
      const classification = classifyNativeRuntimeControl(control);
      const instanceName = nativeInstanceName(control);
      if (instanceName === undefined || classification.kind !== "valid") return;
      const runtimeType = classification.nativeType;
      pageInstances.set(instanceName, [
        ...(pageInstances.get(instanceName) ?? []),
        { runtimeType, where: `${pageGuid} ${where}` },
      ]);
    });
    const pageTypes = new Map<string, RuntimeControlType>();
    for (const [instanceName, entries] of pageInstances) {
      if (entries.length !== 1) issues.push(`duplicate page instance name "${instanceName}" at ${entries.map((entry) => entry.where).join(" and ")}`);
      else pageTypes.set(instanceName, entries[0]!.runtimeType);
    }
    instanceTypesByPage.set(pageGuid, pageTypes);
  });
  const compilerModuleIds = new Set<string>();

  for (const [pageGuid, tree] of Object.entries(inspection.raw.pages)) {
    const pageInstanceTypes = instanceTypesByPage.get(pageGuid) ?? new Map<string, RuntimeControlType>();
    const page = asRecord(tree);
    const pageProperty = asRecord(page["pageProperty"]);
    const pageSize = asRecord(pageProperty["pageSize"]);
    const pageWidth =
      typeof pageSize["width"] === "number"
        ? (pageSize["width"])
        : typeof page["pageViewWidth"] === "number"
          ? (page["pageViewWidth"])
          : undefined;
    const pageHeight =
      typeof pageSize["height"] === "number"
        ? (pageSize["height"])
        : typeof page["pageViewHeight"] === "number"
          ? (page["pageViewHeight"])
          : undefined;

    walkControls(tree, `page ${pageGuid}`, (control, where) => {
      const classification = classifyNativeRuntimeControl(control);
      if (classification.kind === "malformed") {
        issues.push(`malformed runtime control type at ${pageGuid} ${where}: ${classification.reason}`);
        return;
      }
      if (classification.kind !== "valid") {
        issues.push(`unknown runtime control type at ${pageGuid} ${where}`);
        return;
      }
      const runtimeType = classification.nativeType;
      if (runtimeType.kind === "static" && !(runtimeType.uiModelType in CONTROL_TYPE_BY_UIMODEL_TYPE)) {
        issues.push(`unknown runtime control type at ${pageGuid} ${where}`);
        return;
      }
      const name = nativeInstanceName(control) ?? control["guid"];
      if (typeof pageWidth === "number" && typeof pageHeight === "number") {
        const leftTop = asRecord(control["leftTopPt"]);
        const x = typeof leftTop["x"] === "number" ? (leftTop["x"]) : 0;
        const y = typeof leftTop["y"] === "number" ? (leftTop["y"]) : 0;
        const width = typeof control["width"] === "number" ? (control["width"]) : 0;
        const height = typeof control["height"] === "number" ? (control["height"]) : 0;
        if (x < 0 || y < 0 || x + width > pageWidth || y + height > pageHeight) {
          issues.push(
            `control "${String(name)}" geometry (${x},${y} ${width}x${height}) outside page bounds ` +
              `${pageWidth}x${pageHeight}`,
          );
        }
      }
      // Well-formed serialized script actions.
      const links = asRecord(control["linkMng"])["linkList"];
      if (links !== undefined && !Array.isArray(links)) {
        issues.push(`control "${String(name)}" has a malformed linkMng.linkList`);
      }
      if (Array.isArray(links)) for (const rawLink of links) {
        const link = asRecord(rawLink);
        const action = link["action"];
        const script = link["script"];
        const visibilityMarkerResult = compilerVisibilityActionMarker(link["kfCompilerAction"]);
        if (visibilityMarkerResult.issue !== undefined) issues.push(`control "${String(name)}" ${visibilityMarkerResult.issue}`);
        const visibilityMarker = visibilityMarkerResult.marker;
        const parsedCompilerSource = typeof script === "string" ? compilerOwnedSegments(script) : { segments: [] as readonly CompilerOwnedSegment[] };
        if (parsedCompilerSource.issue !== undefined || parsedCompilerSource.segments.length > 0) {
          if (typeof script === "string" && script.length > 32_000) issues.push(`control "${String(name)}" compiled event script exceeds 32000 characters`);
          if (parsedCompilerSource.issue !== undefined) issues.push(`control "${String(name)}" ${parsedCompilerSource.issue}`);
          for (const segment of parsedCompilerSource.segments) {
            if (compilerModuleIds.has(segment.metadata.moduleId)) issues.push(`control "${String(name)}" duplicate compiled module identity`);
            compilerModuleIds.add(segment.metadata.moduleId);
            const sourceIssue = compilerSourceIssue(segment, pageInstanceTypes, visibilityMarker);
            if (sourceIssue !== undefined) issues.push(`control "${String(name)}" ${sourceIssue}`);
            const metadata = segment.metadata;
            if (metadata.placement !== "event") issues.push(`control "${String(name)}" event contains a non-event compiled module`);
            if (metadata.ownerInstanceName !== name) issues.push(`control "${String(name)}" compiler-owned script owner mismatch`);
            if (metadata.ownerInstanceName !== name || pageInstanceTypes.get(metadata.ownerInstanceName) === undefined
              || !sameNativeRuntimeControlType(pageInstanceTypes.get(metadata.ownerInstanceName)!, runtimeType)) {
              issues.push(`control "${String(name)}" compiler-owned script owner type mismatch`);
            }
            if (metadata.kfEvent !== link["name"] || metadata.linkId !== (link["linkId"] ?? null)) issues.push(`control "${String(name)}" compiler-owned event identity mismatch`);
            if (metadata.phase === null) issues.push(`control "${String(name)}" compiler-owned event phase is missing`);
          }
          if (link["enable"] !== true) issues.push(`control "${String(name)}" compiler-owned event must set enable true`);
          const moduleIds = parsedCompilerSource.segments.map((segment) => segment.metadata.moduleId);
          if (new Set(moduleIds).size !== moduleIds.length) issues.push(`control "${String(name)}" duplicate compiled module identity`);
          if (visibilityMarker !== undefined) {
            const segment = parsedCompilerSource.segments[0];
            const expectedBody = `${visibilityMarker.targetInstanceName}.setVisible(${String(visibilityMarker.visible)});\n`;
            const expectedModuleId = `kf$script:action-${createHash("sha256").update(visibilityMarker.actionId, "utf8").digest("hex").slice(0, 24)}`;
            const expectedReferences = [
              { semanticId: visibilityMarker.ownerSemanticControlId, instanceName: visibilityMarker.ownerInstanceName },
              { semanticId: visibilityMarker.targetSemanticControlId, instanceName: visibilityMarker.targetInstanceName },
            ].sort((left, right) => left.semanticId.localeCompare(right.semanticId, "en-US"));
            if (parsedCompilerSource.segments.length !== 1 || segment === undefined
              || segment.body !== expectedBody || segment.metadata.moduleId !== expectedModuleId
              || segment.metadata.sourceScriptId !== visibilityMarker.sourceActionId
              || segment.metadata.ownerInstanceName !== visibilityMarker.ownerInstanceName
              || segment.metadata.kfEvent !== visibilityMarker.kfEvent || segment.metadata.linkId !== visibilityMarker.linkId
              || segment.metadata.phase !== visibilityMarker.phase
              || JSON.stringify(segment.metadata.instanceReferences) !== JSON.stringify(expectedReferences)
              || segment.metadata.pageReferences.length !== 0
              || visibilityMarker.ownerInstanceName !== name
              || visibilityMarker.kfEvent !== link["name"] || visibilityMarker.linkId !== (link["linkId"] ?? null)
              || link["action"] !== undefined) {
              issues.push(`control "${String(name)}" compiler-owned visibility action provenance mismatch`);
            }
          }
          let afterEventSeen = false;
          for (const segment of parsedCompilerSource.segments) {
            if (segment.metadata.phase === "after-event") afterEventSeen = true;
            else if (afterEventSeen && segment.metadata.phase === "event") issues.push(`control "${String(name)}" compiler event phases are out of order`);
          }
          continue;
        }
        // ElementUI controls persist disabled native event slots (for example
        // Image Load/Error) in the same link list. They are inert metadata,
        // not executable restricted actions.
        const nativeImageEvent =
          action === undefined
          && link["enable"] === false
          && link["script"] === ""
          && ((link["linkId"] === 200001 && link["name"] === "Load")
            || (link["linkId"] === 200002 && link["name"] === "Error"));
        if (nativeImageEvent) {
          continue;
        }
        // Existing KF products also persist executable event scripts without
        // an `action` discriminator. They are outside this compiler's trust
        // boundary and must remain preserve-only, not be reclassified as an
        // invalid restricted action.
        if (action === undefined && typeof script === "string" && typeof link["name"] === "string") continue;
        if (typeof action !== "string") {
          issues.push(`control "${String(name)}" has a link without an action`);
          continue;
        }
        if (!["navigatePage", "setVariable", "openDialog"].includes(action)) {
          issues.push(`control "${String(name)}" has an unknown script action "${action}"`);
          continue;
        }
        if (action === "navigatePage" && typeof link["pageId"] !== "string") {
          issues.push(`control "${String(name)}" navigatePage action is missing pageId`);
        }
        if (action === "setVariable" && (typeof link["variableId"] !== "string" || !("value" in link))) {
          issues.push(`control "${String(name)}" setVariable action is missing variableId/value`);
        }
      }
      const configureData = control["configureData"];
      if (typeof configureData === "string") {
        if (configureData.includes("kf-compiled-event/v1") && configureData.length > 32_000) issues.push(`control "${String(name)}" compiled configureData exceeds 32000 characters`);
        const parsedConfigure = compilerOwnedSegments(configureData);
        if (parsedConfigure.issue !== undefined) issues.push(`control "${String(name)}" ${parsedConfigure.issue}`);
        for (const segment of parsedConfigure.segments) {
          if (compilerModuleIds.has(segment.metadata.moduleId)) issues.push(`control "${String(name)}" duplicate compiled module identity`);
          compilerModuleIds.add(segment.metadata.moduleId);
          const sourceIssue = compilerSourceIssue(segment, pageInstanceTypes);
          if (sourceIssue !== undefined) issues.push(`control "${String(name)}" ${sourceIssue}`);
          if (segment.metadata.placement !== "configure-data" || segment.metadata.kfEvent !== null
            || segment.metadata.linkId !== null || segment.metadata.phase !== null) {
            issues.push(`control "${String(name)}" configureData compiler identity mismatch`);
          }
          if (segment.metadata.ownerInstanceName !== name) issues.push(`control "${String(name)}" configureData owner mismatch`);
          if (segment.metadata.ownerInstanceName !== name || pageInstanceTypes.get(segment.metadata.ownerInstanceName) === undefined
            || !sameNativeRuntimeControlType(pageInstanceTypes.get(segment.metadata.ownerInstanceName)!, runtimeType)) {
            issues.push(`control "${String(name)}" configureData owner type mismatch`);
          }
        }
      }
    });
  }

  // Plan-level destructive confirmation.
  for (const op of plan.operations) {
    if (op.op !== "delete") continue;
    if (op.destructiveConfirmed !== true) {
      issues.push(`unconfirmed delete of "${op.entityId}" (destructiveConfirmed must be true)`);
    }
    const expected = deleteOperationDigest(op.entityId);
    if (op.digest !== expected) {
      issues.push(`delete of "${op.entityId}" has a mismatched operation digest`);
    }
  }

  return issues.length > 0 ? fail(issues) : pass();
}

// ---------------------------------------------------------------------------
// Layer 5: changeScope
// ---------------------------------------------------------------------------

type VerifiedCreativePayload = ReturnType<typeof readVerifiedCreativeMaterialization>;

function rawControlInstanceName(value: unknown): string | undefined {
  if (!isObjectRecord(value)) return undefined;
  const baseProperty = asRecord(value["baseProperty"]);
  const name = value["name"] ?? baseProperty["name"];
  return typeof name === "string" ? name : undefined;
}

function indexCreativeRawPage(
  node: unknown,
  controlsByName: Map<string, Record<string, unknown>>,
  createdByInstanceName: ReadonlyMap<string, { readonly zIndex: number; readonly order: number }>,
): boolean {
  if (Array.isArray(node)) {
    const actual = node.flatMap((value) => {
      const name = rawControlInstanceName(value);
      return name !== undefined && createdByInstanceName.has(name) ? [name] : [];
    });
    const expected = actual.slice().sort((left, right) => {
      const leftOrder = createdByInstanceName.get(left)!;
      const rightOrder = createdByInstanceName.get(right)!;
      return leftOrder.zIndex - rightOrder.zIndex || leftOrder.order - rightOrder.order;
    });
    let mismatch = actual.some((name, index) => name !== expected[index]);
    for (const value of node) {
      if (!isObjectRecord(value)) continue;
      const name = rawControlInstanceName(value);
      if (name !== undefined) controlsByName.set(name, value);
      for (const key of ["objects", "children", "layoutItems", "insiderObjects"]) {
        if (indexCreativeRawPage(value[key], controlsByName, createdByInstanceName)) mismatch = true;
      }
    }
    return mismatch;
  }
  if (!isObjectRecord(node)) return false;
  let mismatch = false;
  for (const key of ["objects", "children", "layoutItems", "insiderObjects"]) {
    if (indexCreativeRawPage(node[key], controlsByName, createdByInstanceName)) mismatch = true;
  }
  return mismatch;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

const CREATIVE_GEOMETRY_EPSILON = 1e-9;

function sameCreativeGeometry(left: number, right: number): boolean {
  return Math.abs(left - right) <= CREATIVE_GEOMETRY_EPSILON;
}

async function creativeMaterializationIssues(
  candidate: string,
  verified: VerifiedCreativePayload,
  instrumentation?: CreativePageInstrumentation,
): Promise<string[]> {
  const inspection = await inspectClientProject(candidate);
  const { materialization } = verified;
  const issues: string[] = [];
  const implementationByControl = new Map(verified.artifact.implementation.pages.flatMap((page) =>
    page.compatibility === "native" ? page.controls.map((control) => [control.id, control] as const) : []));
  const styleByControl = new Map(materialization.stylesData
    .map((style) => [style.semanticControlId, style] as const));
  const pageSummaryByGuid = new Map(inspection.summary.pages.map((page) => [page.guid, page] as const));
  const assetRuntimeSrcByControl = new Map((verified.plan.assetBindings ?? [])
    .map((binding) => [binding.entityId, path.basename(binding.targetPath)] as const));
  type CreativeAction = (typeof materialization.interactions.actions)[number];
  type CreativeScript = (typeof materialization.interactions.scripts)[number];
  type CreativeEventBinding = (typeof materialization.interactions.eventBindings)[number];
  const actionsByOwner = new Map<string, CreativeAction[]>();
  const scriptsByOwner = new Map<string, CreativeScript[]>();
  const bindingsByOwner = new Map<string, CreativeEventBinding[]>();
  for (const action of materialization.interactions.actions) {
    const owned = actionsByOwner.get(action.ownerInstanceName) ?? [];
    owned.push(action);
    actionsByOwner.set(action.ownerInstanceName, owned);
  }
  for (const script of materialization.interactions.scripts) {
    const owned = scriptsByOwner.get(script.ownerInstanceName) ?? [];
    owned.push(script);
    scriptsByOwner.set(script.ownerInstanceName, owned);
  }
  for (const binding of materialization.interactions.eventBindings) {
    const owned = bindingsByOwner.get(binding.ownerInstanceName) ?? [];
    owned.push(binding);
    bindingsByOwner.set(binding.ownerInstanceName, owned);
  }
  const controlEntryByName = new Map(Object.values(inspection.index.controls)
    .flatMap((entry) => entry.name === undefined ? [] : [[entry.name, entry] as const]));
  const materializedControlByName = new Map(materialization.controls
    .map((control) => [control.instanceName, control] as const));
  const createdZOrderByPage = new Map<string, Map<string, { zIndex: number; order: number }>>();
  for (const control of materialization.controls) {
    if (control.source !== "workspace-derived") continue;
    const page = createdZOrderByPage.get(control.pageGuid)
      ?? new Map<string, { zIndex: number; order: number }>();
    page.set(control.instanceName, { zIndex: control.zIndex, order: control.order });
    createdZOrderByPage.set(control.pageGuid, page);
  }
  const rawControlByName = new Map<string, Record<string, unknown>>();
  const zOrderMismatchPages = new Set<string>();
  for (const page of materialization.pages) {
    const file = inspection.index.pages[page.pageGuid]?.file ?? page.semanticPageId;
    instrumentation?.onPageIndex?.(page.pageGuid, file);
    if (indexCreativeRawPage(
      asRecord(inspection.raw.pages[page.pageGuid])["objects"],
      rawControlByName,
      createdZOrderByPage.get(page.pageGuid) ?? new Map(),
    )) zOrderMismatchPages.add(page.pageGuid);
  }
  for (const page of materialization.pages) {
    const entry = inspection.index.pages[page.pageGuid];
    const summary = pageSummaryByGuid.get(page.pageGuid);
    if (entry === undefined || (page.source === "workspace-derived" && entry.id !== page.semanticPageId)) {
      issues.push(`creative page correlation mismatch: ${page.semanticPageId}`);
    }
    if (summary?.width !== page.width || summary.height !== page.height) {
      issues.push(`creative page dimensions mismatch: ${page.semanticPageId}`);
    }
  }
  for (const control of materialization.controls) {
    const entry = controlEntryByName.get(control.instanceName);
    const expectedGuid = control.source === "uploaded-existing"
      ? control.nativeGuid
      : deriveGuid({ seed: materialization.workspaceId }, control.instanceName);
    if (entry === undefined || entry.guid !== expectedGuid || entry.pageGuid !== control.pageGuid
      || entry.capabilityId !== control.capabilityId) {
      issues.push(`creative control correlation/type mismatch: ${control.semanticControlId}`);
      continue;
    }
    const parentGeometry = control.parentInstanceName === undefined
      ? undefined
      : materializedControlByName.get(control.parentInstanceName)?.geometry;
    const expectedX = control.geometry.x - (parentGeometry?.x ?? 0);
    const expectedY = control.geometry.y - (parentGeometry?.y ?? 0);
    if (control.source === "workspace-derived"
      && (!sameCreativeGeometry(entry.x, expectedX)
        || !sameCreativeGeometry(entry.y, expectedY)
        || !sameCreativeGeometry(entry.width, control.geometry.width)
        || !sameCreativeGeometry(entry.height, control.geometry.height))) {
      issues.push(`creative geometry mismatch: ${control.semanticControlId}`);
    }
    if (control.parentInstanceName !== undefined) {
      const parent = controlEntryByName.get(control.parentInstanceName);
      if (parent === undefined || !entry.rawPath.startsWith(`${parent.rawPath}/insiderObjects/`)) {
        issues.push(`creative control parent mismatch: ${control.semanticControlId}`);
      }
    }
    const raw = rawControlByName.get(control.instanceName);
    if (raw === undefined) {
      issues.push(`creative native control missing: ${control.semanticControlId}`);
      continue;
    }
    if (control.tabPane !== undefined) {
      const owner = control.parentInstanceName === undefined
        ? undefined
        : materializedControlByName.get(control.parentInstanceName);
      const ownerRaw = control.parentInstanceName === undefined
        ? undefined
        : rawControlByName.get(control.parentInstanceName);
      const directChildren = Array.isArray(ownerRaw?.["insiderObjects"])
        ? ownerRaw["insiderObjects"] as unknown[]
        : [];
      const directMatches = directChildren.filter((child) => rawControlInstanceName(child) === control.instanceName);
      if (owner?.semanticControlId !== control.tabPane.ownerSemanticControlId
        || owner?.capabilityId !== "tabs"
        || ownerRaw?.["uiModelType"] !== 47
        || directMatches.length !== 1
        || raw["region"] !== control.tabPane.tabId) {
        issues.push(`creative Tabs pane region/owner mismatch: ${control.semanticControlId}`);
      }
    }
    if (control.overlayHost?.initiallyVisible === false) {
      const initiallyVisible = control.capabilityId.startsWith("layout.")
        ? asRecord(raw["baseProperty"])["visible"]
        : raw["runVisible"];
      if (initiallyVisible !== false) issues.push(`creative overlay initial visibility mismatch: ${control.semanticControlId}`);
    }
    const style = styleByControl.get(control.semanticControlId);
    if (control.source === "workspace-derived") {
      const directNative = projectCreativeNativeProperties(
        control.nativeProperties,
        new Set(Object.keys(style?.compiledStyle.nativeFields ?? {})),
        "native-direct",
      );
      for (const [field, value] of Object.entries(directNative)) {
        const expected = field === "src" ? assetRuntimeSrcByControl.get(control.semanticControlId) ?? value : value;
        if (!isDeepStrictEqual(raw[field], expected)) issues.push(`creative native field mismatch: ${control.semanticControlId}.${field}`);
      }
      for (const semanticOnly of ["parentId", "tableData", "tabs", "activeId"]) {
        if (Object.hasOwn(raw, semanticOnly)) issues.push(`creative semantic field leaked into native control: ${control.semanticControlId}.${semanticOnly}`);
      }
      if (control.nativeProperties.tableData !== undefined) {
        try {
          const expected = toNativeTableProperties(parseTableData(control.nativeProperties.tableData));
          for (const [field, value] of Object.entries(expected)) {
            if (!isDeepStrictEqual(raw[field], value)) issues.push(`creative table adapter mismatch: ${control.semanticControlId}.${field}`);
          }
        } catch {
          issues.push(`creative table adapter input invalid: ${control.semanticControlId}`);
        }
      }
      if (control.nativeProperties.tabs !== undefined) {
        try {
          const expected = serializeReviewedTabsInitialization(control.instanceName, control.nativeProperties);
          if (raw["configureData"] !== expected) issues.push(`creative Tabs initialization mismatch: ${control.semanticControlId}.configureData`);
          for (const inertField of ["tabData", "activeName"]) {
            if (Object.hasOwn(raw, inertField)) issues.push(`creative Tabs runtime-inert field leaked: ${control.semanticControlId}.${inertField}`);
          }
        } catch {
          issues.push(`creative Tabs adapter input invalid: ${control.semanticControlId}`);
        }
      }
    }
    if (control.source === "uploaded-existing") for (const delta of control.existingDeltas ?? []) {
      const field = delta.path.slice(1);
      const actual = field === "x" ? entry.x : field === "y" ? entry.y
        : field === "width" ? entry.width : field === "height" ? entry.height : raw[field];
      const expected = field === "src" ? assetRuntimeSrcByControl.get(control.semanticControlId) ?? delta.value : delta.value;
      if (!isDeepStrictEqual(actual, expected)) issues.push(`creative existing delta mismatch: ${control.semanticControlId}${delta.path}`);
    }
    if (style !== undefined) {
      for (const [field, value] of Object.entries(style.compiledStyle.nativeFields)) {
        if (!isDeepStrictEqual(raw[field], value)) issues.push(`creative style field mismatch: ${control.semanticControlId}.${field}`);
      }
      if (style.dataBinding?.records !== undefined && !isDeepStrictEqual(raw["data"], style.dataBinding.records)) {
        issues.push(`creative data binding mismatch: ${control.semanticControlId}`);
      }
      const implementation = implementationByControl.get(control.semanticControlId);
      if (implementation === undefined) issues.push(`creative style implementation provenance missing: ${control.semanticControlId}`);
      else {
        try {
          const compiled = compileResolvedStyle({
            componentId: control.semanticControlId, capabilityId: control.capabilityId,
            theme: verified.artifact.semanticPlan.theme, styleRole: implementation.role,
            roleStyle: { ...style.structuredStyle, role: implementation.role },
            instanceOverride: { declarations: {}, states: {} },
            approvedAssets: style.approvedAssets.map((asset) => asset.approvedAsset),
            runtimeProfile: KF36_RUNTIME_PROFILE,
          });
          const actualStyleData = typeof raw["styleDataNew"] === "string" ? raw["styleDataNew"] : "";
          const expectedStyleData = mergeManagedStyleData(actualStyleData, compiled.styleDataNew);
          if (actualStyleData !== expectedStyleData) {
            issues.push(`creative managed styleDataNew mismatch: ${control.semanticControlId}`);
          }
        } catch (error) {
          issues.push(`creative style validation failed: ${control.semanticControlId}: ${String(error)}`);
        }
      }
    }
    const actions = actionsByOwner.get(control.instanceName) ?? [];
    const modules = scriptsByOwner.get(control.instanceName) ?? [];
    const bindings = bindingsByOwner.get(control.instanceName) ?? [];
    if (actions.length > 0 || modules.length > 0 || bindings.length > 0
      || isObjectRecord(raw["linkMng"]) || typeof raw["configureData"] === "string") {
      try {
        const expected = serializeReviewedNativeInteractions(raw, {
          ownerInstanceName: control.instanceName, capabilityId: control.capabilityId,
          actions, modules, bindings,
        }, { ownerInstanceName: control.instanceName, capabilityId: control.capabilityId });
        if (!isDeepStrictEqual(expected, raw)) issues.push(`creative interaction materialization mismatch: ${control.semanticControlId}`);
      } catch (error) {
        issues.push(`creative interaction validation failed: ${control.semanticControlId}: ${String(error)}`);
      }
    }
  }
  for (const owner of materialization.controls.filter((control) => control.capabilityId === "tabs")) {
    const panes = materialization.controls.filter((control) =>
      control.tabPane?.ownerSemanticControlId === owner.semanticControlId);
    if (panes.length === 0) continue;
    const ownerRaw = rawControlByName.get(owner.instanceName);
    const directChildren = Array.isArray(ownerRaw?.["insiderObjects"])
      ? ownerRaw["insiderObjects"] as unknown[]
      : [];
    const expected = panes.map((pane) => `${pane.instanceName}\u0000${pane.tabPane!.tabId}`).sort();
    const actual = directChildren.flatMap((child) => {
      const name = rawControlInstanceName(child);
      const region = isObjectRecord(child) ? child["region"] : undefined;
      return typeof name === "string" && typeof region === "string" ? [`${name}\u0000${region}`] : [];
    }).sort();
    if (ownerRaw?.["uiModelType"] !== 47
      || expected.length !== actual.length
      || expected.some((entry, index) => entry !== actual[index])) {
      issues.push(`creative Tabs insiderObjects coverage mismatch: ${owner.semanticControlId}`);
    }
  }
  const versionDir = await resolveVersionDirName(candidate);
  const assets = new Map([
    ...(verified.plan.assetBindings ?? []).map((asset) => [asset.assetId, {
      targetPath: asset.targetPath, mediaType: asset.mediaType,
      sha256: asset.sha256, sizeBytes: asset.sizeBytes,
    }] as const),
    ...materialization.stylesData.flatMap((style) => style.approvedAssets)
      .map((asset) => [asset.assetId, asset.approvedAsset] as const),
  ]);
  for (const [assetId, facts] of assets) {
    try {
      const bytes = await readFile(path.join(rootPath(candidate, versionDir), facts.targetPath));
      if (bytes.byteLength !== facts.sizeBytes || createHash("sha256").update(bytes).digest("hex") !== facts.sha256) {
        issues.push(`creative asset bytes mismatch: ${assetId}`);
      }
    } catch (error) {
      issues.push(`creative asset missing: ${assetId}: ${String(error)}`);
    }
  }
  for (const pageGuid of zOrderMismatchPages) issues.push(`creative z-order mismatch: ${pageGuid}`);
  return issues;
}

async function checkCreativeChangeScope(
  base: string,
  candidate: string,
  verified: VerifiedCreativePayload,
  handle: VerifiedCreativeMaterialization,
  semanticOperations: readonly TrustedSemanticOperation[],
  assets: readonly DomainAssetInput[],
  materializationIssues: readonly string[],
): Promise<{ outcome: CheckOutcome; warnings: string[] }> {
  let expectedRoot: string | undefined;
  try {
    const expected = await applyClientPatch(base, verified.plan, {
      planHash: canonicalChangePlanHash(verified.plan),
      creativeMaterialization: handle,
      semanticOperations,
      assets,
    });
    expectedRoot = expected.rootDir;
    const [expectedFiles, candidateFiles] = await Promise.all([
      collectTreeFiles(expected.rootDir),
      collectTreeFiles(candidate),
    ]);
    const violations = [...materializationIssues];
    const allFiles = new Set([...expectedFiles.keys(), ...candidateFiles.keys()]);
    for (const file of allFiles) {
      const expectedBytes = expectedFiles.get(file);
      const candidateBytes = candidateFiles.get(file);
      if (expectedBytes === undefined) violations.push(`creative exact candidate contains unsigned file "${file}"`);
      else if (candidateBytes === undefined) violations.push(`creative exact candidate is missing signed file "${file}"`);
      else if (!expectedBytes.equals(candidateBytes)) violations.push(`creative exact candidate differs at "${file}"`);
    }
    return { outcome: violations.length === 0 ? pass() : fail(violations), warnings: [] };
  } catch (error) {
    return { outcome: fail([`creative change-scope verification failed: ${String(error)}`]), warnings: [] };
  } finally {
    if (expectedRoot !== undefined) await rm(expectedRoot, { recursive: true, force: true }).catch(() => {});
  }
}

async function checkChangeScope(
  base: string,
  candidate: string,
  plan: NormalizedPlan,
  assetTargetPaths: readonly string[],
): Promise<{ outcome: CheckOutcome; warnings: string[] }> {
  // C1 defense-in-depth: when the base and the candidate resolve to the same
  // directory while the confirmed plan still has operations, the patch was
  // never applied — an identical-tree diff would otherwise pass every layer
  // and silently ship a build that ignores the approved plan. Fail loudly
  // instead of reporting a no-op validator pass.
  if (base === candidate && plan.operations.length > 0) {
    return {
      outcome: fail([
        "base and candidate resolve to the same directory while the plan has operations (confirmed plan was not applied)",
      ]),
      warnings: [],
    };
  }
  try {
    const scope = await verifyChangeScope(base, candidate, plan, { assetTargetPaths });
    if (scope.violations.length > 0) {
      return {
        outcome: fail(scope.violations.map((v) => v.detail)),
        warnings: scope.warnings,
      };
    }
    return { outcome: pass(), warnings: scope.warnings };
  } catch (err) {
    // The validator is the authority and must always return a report:
    // a plan that cannot be located against the base (unknown entityId, bad
    // entityType, ...) fails the changeScope layer instead of throwing.
    return {
      outcome: fail([`change-scope verification failed: ${String(err)}`]),
      warnings: [],
    };
  }
}

// ---------------------------------------------------------------------------
// Layer 6: roundTrip
// ---------------------------------------------------------------------------

async function collectTreeFiles(root: string): Promise<Map<string, Buffer>> {
  const out = new Map<string, Buffer>();
  async function walk(dir: string, rel: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const nextRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
      if (entry.isDirectory()) await walk(full, nextRel);
      else if (entry.isFile()) out.set(nextRel, await readFile(full));
    }
  }
  await walk(root, "");
  return out;
}

/**
 * Packs the candidate and unpacks it again, then compares every file
 * byte-for-byte (excluding nothing: a candidate carrying packer-excluded
 * paths like pagerecord/ cannot round-trip and must fail).
 */
async function checkRoundTrip(candidate: string): Promise<CheckOutcome> {
  try {
    const gz = await packageNativeClientProject(candidate);
    const dest = await mkdtemp(path.join(tmpdir(), "kf-client-roundtrip-"));
    const unpacked = await importNativeClientPackage(gz, dest);

    const [candFiles, unpackFiles] = await Promise.all([
      collectTreeFiles(candidate),
      collectTreeFiles(unpacked),
    ]);
    const candSet = new Set(candFiles.keys());
    const unpackSet = new Set(unpackFiles.keys());
    const problems: string[] = [];

    for (const rel of candSet) {
      const unpackedBytes = unpackFiles.get(rel);
      if (unpackedBytes === undefined) {
        problems.push(`file "${rel}" is missing after packing/unpacking (excluded by the packager?)`);
        continue;
      }
      const candBytes = candFiles.get(rel);
      if (candBytes !== undefined && !candBytes.equals(unpackedBytes)) {
        problems.push(`file "${rel}" differs after packing/unpacking`);
      }
    }
    for (const rel of unpackSet) {
      if (!candSet.has(rel)) problems.push(`extra file "${rel}" appeared after packing/unpacking`);
    }

    return problems.length > 0 ? fail(problems) : pass();
  } catch (err) {
    return fail([`pack/unpack round-trip failed: ${String(err)}`]);
  }
}

// ---------------------------------------------------------------------------
// Public entry
// ---------------------------------------------------------------------------

export interface ValidateOptions {
  /** Skip the (expensive) package round-trip check. Defaults to false. */
  skipRoundTrip?: boolean;
  assetTargetPaths?: readonly string[];
  creativeAssets?: readonly DomainAssetInput[];
  /** Worker-verified semantic authorizations required by exact replay validation. */
  semanticOperations?: readonly TrustedSemanticOperation[];
  creativeMaterialization?: VerifiedCreativeMaterialization;
  /** Counting-only observer for bounded creative page indexing tests. */
  creativeInstrumentation?: CreativePageInstrumentation;
}

export async function validateClientProject(
  base: string,
  candidateInput: string | ClientWorkspace,
  planInput: unknown,
  options?: ValidateOptions,
): Promise<ValidationReport> {
  const candidate = typeof candidateInput === "string" ? candidateInput : candidateInput.rootDir;

  let versionDir: string;
  try {
    versionDir = await resolveVersionDirName(candidate);
  } catch (err) {
    const message = String(err);
    return makeReport({
      packageStructure: fail([message]),
      jsonSchema: fail([message]),
      references: fail([message]),
      businessRules: fail([message]),
      changeScope: fail([message]),
      roundTrip: fail([message]),
    });
  }

  // A malformed plan must never bubble out of the validator: it is reported as
  // a businessRules/changeScope failure while the candidate-only layers
  // (structure, schema, references, round-trip) still run to full detail.
  let plan: NormalizedPlan;
  try {
    plan = normalizeChangePlan(planInput);
  } catch (err) {
    const message = `invalid change plan: ${String(err)}`;
    const outcomes: Record<CheckKey, CheckOutcome> = {
      packageStructure: await checkPackageStructure(candidate, versionDir),
      jsonSchema: await checkJsonSchema(candidate, versionDir),
      references: await checkReferences(candidate),
      businessRules: fail([message]),
      changeScope: fail([message]),
      roundTrip: options?.skipRoundTrip ? pass() : await checkRoundTrip(candidate),
    };
    return makeReport(outcomes);
  }

  const rawPlan = planInput !== null && typeof planInput === "object" && !Array.isArray(planInput)
    ? planInput as Record<string, unknown>
    : undefined;
  let verifiedCreative: VerifiedCreativePayload | undefined;
  let verifiedCreativeHandle: VerifiedCreativeMaterialization | undefined;
  let creativeTrustIssue: string | undefined;
  if (rawPlan?.["creative"] !== undefined) {
    try {
      verifiedCreativeHandle = options?.creativeMaterialization;
      verifiedCreative = readVerifiedCreativeMaterialization(verifiedCreativeHandle);
      if (canonicalChangePlanHash(verifiedCreative.plan) !== canonicalChangePlanHash(planInput)) {
        creativeTrustIssue = "verified creative materialization does not bind the validated ChangePlan";
        verifiedCreative = undefined;
      }
    } catch (error) {
      creativeTrustIssue = `verified creative materialization is required: ${String(error)}`;
    }
  }

  const creativeIssues = verifiedCreative === undefined
    ? []
    : await creativeMaterializationIssues(candidate, verifiedCreative, options?.creativeInstrumentation);
  let businessRules = await checkBusinessRules(candidate, plan);
  if (creativeTrustIssue !== undefined) businessRules = fail([creativeTrustIssue]);
  else if (creativeIssues.length > 0) {
    businessRules = fail([...businessRules.issues, ...creativeIssues]);
  }

  const outcomes: Record<CheckKey, CheckOutcome> = {
    packageStructure: await checkPackageStructure(candidate, versionDir),
    jsonSchema: await checkJsonSchema(candidate, versionDir),
    references: await checkReferences(candidate),
    businessRules,
    changeScope: pass(),
    roundTrip: options?.skipRoundTrip ? pass() : await checkRoundTrip(candidate),
  };

  const extraWarnings: string[] = [];

  const scope = verifiedCreative === undefined
    ? creativeTrustIssue === undefined
      ? await checkChangeScope(base, candidate, plan, options?.assetTargetPaths ?? [])
      : { outcome: fail([creativeTrustIssue]), warnings: [] }
    : await checkCreativeChangeScope(
      base,
      candidate,
      verifiedCreative,
      verifiedCreativeHandle!,
      options?.semanticOperations ?? [],
      options?.creativeAssets ?? [],
      creativeIssues,
    );
  outcomes.changeScope = scope.outcome;
  extraWarnings.push(...scope.warnings);

  return makeReport(outcomes, extraWarnings);
}
