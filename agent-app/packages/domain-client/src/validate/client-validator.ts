import { mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { parse } from "acorn";
import { walk } from "estree-walker";
import type { ValidationReport } from "@kf/contracts";
import { inspectClientProject } from "../inspect/client-inspector.js";
import { CONTROL_TYPE_BY_UIMODEL_TYPE } from "../ir/client-project-ir.js";
import { importNativeClientPackage, packageNativeClientProject } from "../package/native-client-package.js";
import { resolveVersionDirName, verifyChangeScope } from "../patch/change-scope.js";
import { deleteOperationDigest, normalizeChangePlan, type NormalizedPlan } from "../patch/client-patcher.js";
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

/** Recursively walks page trees, invoking cb on every object with a uiModelType. */
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
  if (typeof record["uiModelType"] === "number") cb(record, where);
  for (const key of ["objects", "children", "layoutItems", "insiderObjects"]) {
    if (key in record) walkControls(record[key], `${where}/${key}`, cb);
  }
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
    || Number(record["bodyByteLength"]) > 32_000 || typeof record["ownerInstanceName"] !== "string" || !instanceName.test(record["ownerInstanceName"])
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
        && typeof candidate["pageGuid"] === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(candidate["pageGuid"]);
    }) || instanceReferences.length > 128 || pageReferences.length > 32
    || new Set(instanceReferences.map((entry) => asRecord(entry)["semanticId"])).size !== instanceReferences.length
    || new Set(pageReferences.map((entry) => asRecord(entry)["semanticId"])).size !== pageReferences.length) return undefined;
  return record as unknown as CompilerOwnedScriptMetadata;
}

interface CompilerOwnedSegment { readonly metadata: CompilerOwnedScriptMetadata; readonly body: string; readonly encoded: string }

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

function compilerSourceIssue(segment: CompilerOwnedSegment, instanceTypes: ReadonlyMap<string, number>): string | undefined {
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
    "FunctionDeclaration", "ArrowFunctionExpression", "FunctionExpression", "BlockStatement", "EmptyStatement",
    "Identifier", "Literal", "ArrayExpression", "ObjectExpression", "Property", "SpreadElement", "MemberExpression",
    "CallExpression", "AssignmentExpression", "UpdateExpression", "UnaryExpression", "BinaryExpression", "LogicalExpression",
    "ConditionalExpression", "TemplateLiteral", "TemplateElement", "ForStatement", "ForOfStatement",
  ]);
  interface LexicalScope { readonly parent?: LexicalScope; readonly names: Set<string>; readonly callableNames: Set<string> }
  const rootScope: LexicalScope = { names: new Set(), callableNames: new Set() };
  const scopeByNode = new WeakMap<object, LexicalScope>();
  let currentScope = rootScope;
  const boundaryNodes = new WeakSet<object>();
  const callableNames = new Set<string>();
  const boundedIterables = new Set<string>();
  const mutableNames = new Set<string>();
  let syntaxIssue: string | undefined;
  let unsupportedRuntimeMember: string | undefined;
  const identifierName = (value: unknown): string | undefined => {
    const record = value as Record<string, unknown> | undefined;
    return record?.["type"] === "Identifier" && typeof record["name"] === "string" ? record["name"] : undefined;
  };
  walk(program as never, {
    enter(node, parent) {
      const record = node as unknown as Record<string, unknown>;
      const type = record["type"];
      if (!allowedNodeTypes.has(String(type))) syntaxIssue ??= `syntax:${String(type)}`;
      if (type === "FunctionDeclaration") {
        const name = identifierName(record["id"]);
        if (name !== undefined) { currentScope.names.add(name); currentScope.callableNames.add(name); callableNames.add(name); }
      }
      if (type === "FunctionDeclaration" || type === "FunctionExpression" || type === "ArrowFunctionExpression" || type === "BlockStatement" || type === "CatchClause") {
        currentScope = { parent: currentScope, names: new Set(), callableNames: new Set() };
        boundaryNodes.add(node);
      }
      scopeByNode.set(node, currentScope);
      if (type === "FunctionExpression") {
        const name = identifierName(record["id"]); if (name !== undefined) currentScope.names.add(name);
      }
      if (type === "FunctionDeclaration" || type === "FunctionExpression" || type === "ArrowFunctionExpression") {
        const params = Array.isArray(record["params"]) ? record["params"] as Array<Record<string, unknown>> : [];
        params.forEach((param) => { const name = identifierName(param); if (name !== undefined) currentScope.names.add(name); });
      }
      if (type === "VariableDeclarator") {
        const name = identifierName(record["id"]);
        if (name !== undefined) {
          currentScope.names.add(name);
          if ((parent as unknown as Record<string, unknown> | null)?.["kind"] === "let") mutableNames.add(name);
          const init = record["init"] as Record<string, unknown> | undefined;
          if (init?.["type"] === "ArrowFunctionExpression" || init?.["type"] === "FunctionExpression") {
            callableNames.add(name);
            currentScope.callableNames.add(name);
          }
          if (init?.["type"] === "ArrayExpression" && Array.isArray(init["elements"]) && init["elements"].length <= 1_000) boundedIterables.add(name);
          if (init?.["type"] === "CallExpression") {
            const callee = init["callee"] as Record<string, unknown> | undefined;
            const property = callee?.["type"] === "MemberExpression" ? callee["property"] as Record<string, unknown> | undefined : undefined;
            const args = Array.isArray(init["arguments"]) ? init["arguments"] as Array<Record<string, unknown>> : [];
            if (property?.["name"] === "slice" && args.length >= 2 && args[1]?.["type"] === "Literal"
              && typeof args[1]["value"] === "number" && args[1]["value"] <= 1_000) boundedIterables.add(name);
          }
        }
      }
      if (type === "CatchClause") { const name = identifierName(record["param"]); if (name !== undefined) currentScope.names.add(name); }
    },
    leave(node) { if (boundaryNodes.has(node)) currentScope = currentScope.parent ?? rootScope; },
  });
  let undeclaredProjectInstance: string | undefined;
  let astIssue: string | undefined = syntaxIssue;
  const usedRuntimeRoots = new Set<string>();
  const functionCalls = new Map<string, Set<string>>();
  let currentFunction = "<program>";
  const functionStack: string[] = [];
  const resolvesLocal = (scope: LexicalScope | undefined, name: string): boolean => {
    for (let current = scope; current !== undefined; current = current.parent) if (current.names.has(name)) return true;
    return false;
  };
  const resolvesCallable = (scope: LexicalScope | undefined, name: string): boolean => {
    for (let current = scope; current !== undefined; current = current.parent) {
      if (current.names.has(name)) return current.callableNames.has(name);
    }
    return false;
  };
  walk(program as never, {
    enter(node, parent) {
      const record = node as unknown as Record<string, unknown>;
      const parentRecord = parent as unknown as Record<string, unknown> | null;
      const type = record["type"];
      if (type === "FunctionDeclaration" || type === "FunctionExpression" || type === "ArrowFunctionExpression") {
        functionStack.push(currentFunction);
        const directName = identifierName(record["id"]);
        const parentName = parentRecord?.["type"] === "VariableDeclarator" ? identifierName(parentRecord["id"]) : undefined;
        currentFunction = directName ?? parentName ?? `<anonymous:${functionStack.length}>`;
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
          || right?.["type"] !== "Literal" || typeof right["value"] !== "number" || right["value"] > 1_000
          || !Number.isInteger(right["value"]) || right["value"] < 0 || !monotonic) astIssue ??= "loop bound is not a monotonic unit range limited to 1000";
        const body = record["body"];
        if (counter !== undefined && body !== undefined && typeof body === "object") walk(body as never, {
          enter(bodyNode) {
            const candidate = bodyNode as unknown as Record<string, unknown>;
            const target = candidate["type"] === "AssignmentExpression" ? identifierName(candidate["left"])
              : candidate["type"] === "UpdateExpression" ? identifierName(candidate["argument"]) : undefined;
            if (target === counter) astIssue ??= "loop body mutates its counter";
          },
        });
      }
      if (type === "ForOfStatement") {
        const right = record["right"] as Record<string, unknown> | undefined;
        const bounded = right?.["type"] === "ArrayExpression" && Array.isArray(right["elements"]) && right["elements"].length <= 1_000
          || right?.["type"] === "Identifier" && typeof right["name"] === "string" && boundedIterables.has(right["name"]);
        if (!bounded) astIssue ??= "for-of iterable is not statically bounded";
        const iterable = identifierName(right);
        const body = record["body"];
        if (iterable !== undefined && body !== undefined && typeof body === "object") walk(body as never, {
          enter(bodyNode) {
            const candidate = bodyNode as unknown as Record<string, unknown>;
            const target = candidate["type"] === "AssignmentExpression" ? identifierName(candidate["left"])
              : candidate["type"] === "UpdateExpression" ? identifierName(candidate["argument"]) : undefined;
            const callee = candidate["type"] === "CallExpression" ? candidate["callee"] as Record<string, unknown> | undefined : undefined;
            const callObject = callee?.["type"] === "MemberExpression" ? identifierName(callee["object"]) : undefined;
            if (target === iterable || callObject === iterable) astIssue ??= "for-of body mutates its iterated array";
          },
        });
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
            || (name === "arguments" && metadata.placement === "event" && instanceTypes.get(metadata.ownerInstanceName) === 31 && metadata.kfEvent === "Cell-click")
            || declaredInstances.has(name) && instanceTypes.has(name);
          if (!isProperty && !isObjectKey && !isDeclaration && !resolvesLocal(scopeByNode.get(node), name) && !allowedGlobal) {
            astIssue ??= `undeclared global "${name}"`;
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
          }
        } else if (callee?.["type"] === "MemberExpression") {
          const object = callee["object"] as Record<string, unknown> | undefined;
          const property = callee["property"] as Record<string, unknown> | undefined;
          const objectName = identifierName(object);
          const member = identifierName(property);
          const runtimeCall = objectName !== undefined && declaredInstances.has(objectName) && member === "SetData" && instanceTypes.get(objectName) === 31;
          const standardCall = objectName === "Math" && ["abs", "ceil", "floor", "max", "min", "round", "trunc"].includes(member ?? "")
            || objectName === "Date" && ["parse", "UTC"].includes(member ?? "")
            || ["slice", "filter", "push", "trim", "includes", "startsWith"].includes(member ?? "");
          if (!runtimeCall && !standardCall) astIssue ??= "dynamic or unknown member call";
        } else astIssue ??= "dynamic or unknown call target";
      }
      if (type === "MemberExpression" && record["computed"] === true) {
        const property = record["property"] as Record<string, unknown> | undefined;
        if (property?.["type"] !== "Literal") astIssue ??= "dynamic computed member access";
      }
      if (type === "Property" && (record["kind"] !== "init" || record["method"] === true || record["computed"] === true)) astIssue ??= "getter, setter, method, or computed object property";
      if (type === "AssignmentExpression" || type === "UpdateExpression") {
        const target = type === "AssignmentExpression" ? record["left"] as Record<string, unknown> | undefined : record["argument"] as Record<string, unknown> | undefined;
        const targetName = identifierName(target);
        if (targetName !== undefined && !mutableNames.has(targetName)) astIssue ??= "assignment/update target is not a mutable local";
        if (targetName === undefined && target?.["type"] !== "MemberExpression") astIssue ??= "assignment/update target is not reviewed";
      }
      if (type !== "MemberExpression") return;
      const object = record["object"] as Record<string, unknown> | undefined;
      const name = object?.["type"] === "Identifier" && typeof object["name"] === "string" ? object["name"] : undefined;
      if (name === undefined || resolvesLocal(scopeByNode.get(node), name) || !instanceTypes.has(name)) return;
      usedRuntimeRoots.add(name);
      if (!declaredInstances.has(name)) { undeclaredProjectInstance ??= name; return; }
      const property = record["property"] as Record<string, unknown> | undefined;
      const member = property?.["type"] === "Identifier" && typeof property["name"] === "string" ? property["name"] : undefined;
      const called = parentRecord?.["type"] === "CallExpression" && parentRecord["callee"] === node;
      const uiModelType = instanceTypes.get(name);
      const supported = (uiModelType === 38 && /^Input\d+$/.test(name) && member === "Value" && !called)
        || (uiModelType === 31 && /^Table\d+$/.test(name) && member === "SetData" && called);
      if (!supported) unsupportedRuntimeMember ??= `${name}.${member ?? "?"}`;
    },
    leave(node) {
      const type = (node as unknown as Record<string, unknown>)["type"];
      if (type === "FunctionDeclaration" || type === "FunctionExpression" || type === "ArrowFunctionExpression") currentFunction = functionStack.pop() ?? "<program>";
    },
  });
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
    const reviewedEvent = (ownerType === 35 && /^Button\d+$/.test(metadata.ownerInstanceName) && metadata.kfEvent === "onClick" && metadata.linkId === 200001)
      || (ownerType === 31 && /^Table\d+$/.test(metadata.ownerInstanceName) && metadata.kfEvent === "Cell-click" && metadata.linkId === 200006);
    if (!reviewedEvent || metadata.phase === null) return "compiled script event is not in the evidence-backed allowlist";
  } else if (instanceTypes.get(metadata.ownerInstanceName) !== 31 || !/^Table\d+$/.test(metadata.ownerInstanceName) || metadata.kfEvent !== null || metadata.linkId !== null || metadata.phase !== null) {
    return "compiled configureData placement is not in the evidence-backed allowlist";
  }
  const declaredPages = new Set(metadata.pageReferences.map((reference) => reference.pageGuid.toLowerCase()));
  for (const { pageGuid } of metadata.pageReferences) {
    if (!source.includes(JSON.stringify(pageGuid))) return `compiled script does not use declared page reference "${pageGuid}"`;
  }
  for (const pageGuid of source.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi) ?? []) {
    if (!declaredPages.has(pageGuid.toLowerCase())) return `compiled script uses undeclared page reference "${pageGuid}"`;
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
      if (typeof control["name"] === "string") instanceNames.add(control["name"]);
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
  const projectInstanceTypes = new Map<string, number>();
  Object.values(inspection.raw.pages).forEach((tree) => walkControls(tree, "runtime-types", (control) => {
    if (typeof control["name"] === "string" && typeof control["uiModelType"] === "number") projectInstanceTypes.set(control["name"], control["uiModelType"]);
  }));

  for (const [pageGuid, tree] of Object.entries(inspection.raw.pages)) {
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
      const uiModelType = control["uiModelType"];
      if (typeof uiModelType !== "number" || !(uiModelType in CONTROL_TYPE_BY_UIMODEL_TYPE)) {
        issues.push(`unknown uiModelType ${String(uiModelType)} at ${pageGuid} ${where}`);
        return;
      }
      const name = typeof control["name"] === "string" ? (control["name"]) : control["guid"];
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
      const compilerModuleIds = new Set<string>();
      const links = asRecord(control["linkMng"])["linkList"];
      if (links !== undefined && !Array.isArray(links)) {
        issues.push(`control "${String(name)}" has a malformed linkMng.linkList`);
      }
      if (Array.isArray(links)) for (const rawLink of links) {
        const link = asRecord(rawLink);
        const action = link["action"];
        const script = link["script"];
        const parsedCompilerSource = typeof script === "string" ? compilerOwnedSegments(script) : { segments: [] as readonly CompilerOwnedSegment[] };
        if (parsedCompilerSource.issue !== undefined || parsedCompilerSource.segments.length > 0) {
          if (parsedCompilerSource.issue !== undefined) issues.push(`control "${String(name)}" ${parsedCompilerSource.issue}`);
          for (const segment of parsedCompilerSource.segments) {
            if (compilerModuleIds.has(segment.metadata.moduleId)) issues.push(`control "${String(name)}" duplicate compiled module identity`);
            compilerModuleIds.add(segment.metadata.moduleId);
            const sourceIssue = compilerSourceIssue(segment, projectInstanceTypes);
            if (sourceIssue !== undefined) issues.push(`control "${String(name)}" ${sourceIssue}`);
            const metadata = segment.metadata;
            if (metadata.placement !== "event") issues.push(`control "${String(name)}" event contains a non-event compiled module`);
            if (metadata.ownerInstanceName !== name) issues.push(`control "${String(name)}" compiler-owned script owner mismatch`);
            if (metadata.kfEvent !== link["name"] || metadata.linkId !== (link["linkId"] ?? null)) issues.push(`control "${String(name)}" compiler-owned event identity mismatch`);
            if (metadata.phase === null) issues.push(`control "${String(name)}" compiler-owned event phase is missing`);
          }
          if (link["enable"] !== true) issues.push(`control "${String(name)}" compiler-owned event must set enable true`);
          const moduleIds = parsedCompilerSource.segments.map((segment) => segment.metadata.moduleId);
          if (new Set(moduleIds).size !== moduleIds.length) issues.push(`control "${String(name)}" duplicate compiled module identity`);
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
        const parsedConfigure = compilerOwnedSegments(configureData);
        if (parsedConfigure.issue !== undefined) issues.push(`control "${String(name)}" ${parsedConfigure.issue}`);
        for (const segment of parsedConfigure.segments) {
          if (compilerModuleIds.has(segment.metadata.moduleId)) issues.push(`control "${String(name)}" duplicate compiled module identity`);
          compilerModuleIds.add(segment.metadata.moduleId);
          const sourceIssue = compilerSourceIssue(segment, projectInstanceTypes);
          if (sourceIssue !== undefined) issues.push(`control "${String(name)}" ${sourceIssue}`);
          if (segment.metadata.placement !== "configure-data" || segment.metadata.kfEvent !== null
            || segment.metadata.linkId !== null || segment.metadata.phase !== null) {
            issues.push(`control "${String(name)}" configureData compiler identity mismatch`);
          }
          if (segment.metadata.ownerInstanceName !== name) issues.push(`control "${String(name)}" configureData owner mismatch`);
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

  const outcomes: Record<CheckKey, CheckOutcome> = {
    packageStructure: await checkPackageStructure(candidate, versionDir),
    jsonSchema: await checkJsonSchema(candidate, versionDir),
    references: await checkReferences(candidate),
    businessRules: await checkBusinessRules(candidate, plan),
    changeScope: pass(),
    roundTrip: options?.skipRoundTrip ? pass() : await checkRoundTrip(candidate),
  };

  const extraWarnings: string[] = [];

  const scope = await checkChangeScope(base, candidate, plan, options?.assetTargetPaths ?? []);
  outcomes.changeScope = scope.outcome;
  extraWarnings.push(...scope.warnings);

  return makeReport(outcomes, extraWarnings);
}
