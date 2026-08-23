import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";
import { parse, type Node, type Program } from "acorn";
import { walk, type Node as WalkerNode } from "estree-walker";
import type { SemanticScriptApiContext, SemanticScriptValidationIdentity } from "./semantic-script-api.js";
import {
  assertSemanticRecordListCompatibility,
  assertSemanticRecordCompatibility,
  requireSemanticScriptValidationIdentity,
  resolveSemanticApiCall,
} from "./semantic-script-api.js";

type RefKind = "control" | "local-state" | "mock-data";

export interface CustomScriptPort {
  readonly name: string;
  readonly description: string;
  readonly refKind: RefKind;
  readonly refId: string;
}

export interface CustomScriptValidationInput {
  readonly source: string;
  readonly scriptId?: string;
  readonly inputs: readonly (CustomScriptPort | string)[];
  readonly outputs: readonly (CustomScriptPort | string)[];
  readonly context?: SemanticScriptApiContext;
  readonly currentScriptIdentity?: SemanticScriptValidationIdentity;
}

export interface ValidatedSemanticCall {
  readonly api: string;
  readonly namespace: string;
  readonly method: string;
  readonly targetId?: string;
  readonly availability: "supported" | "planned" | "unresolved";
  readonly execution?: "conditional";
}

export interface ValidatedScriptAst {
  readonly schema: "kf-validated-script-ast/v1";
  readonly sourceHash: string;
  readonly calls: readonly ValidatedSemanticCall[];
  readonly inputReads: readonly string[];
  readonly outputWrites: readonly string[];
  readonly scheduledScriptIds: readonly string[];
  readonly staticFunctionCalls: Readonly<Record<string, readonly string[]>>;
}

export type CustomScriptValidationErrorCode =
  | "CUSTOM_SCRIPT_FORBIDDEN"
  | "CUSTOM_SCRIPT_INPUT_INVALID"
  | "CUSTOM_SCRIPT_INPUT_NOT_READ"
  | "CUSTOM_SCRIPT_LIMIT"
  | "CUSTOM_SCRIPT_OUTPUT_NOT_WRITTEN"
  | "CUSTOM_SCRIPT_OUTPUT_WRITTEN_MULTIPLE_TIMES"
  | "CUSTOM_SCRIPT_PARSE"
  | "CUSTOM_SCRIPT_SELF_SCHEDULE"
  | "CUSTOM_SCRIPT_UNDECLARED_INPUT"
  | "CUSTOM_SCRIPT_UNDECLARED_OUTPUT"
  | "CUSTOM_SCRIPT_UNTRUSTED_AST";

export class CustomScriptValidationError extends Error {
  constructor(readonly code: CustomScriptValidationErrorCode, detail: string, options?: ErrorOptions) {
    super(`${code}: ${detail}`, options);
    this.name = "CustomScriptValidationError";
  }
}

type AstNode = Node & Record<string, unknown>;
type ValueKind = "array" | "string" | "record" | "scalar" | "unknown";

interface LexicalScope {
  readonly id: number;
  readonly functionOwner: string;
  readonly parent?: LexicalScope;
}

interface LexicalBinding {
  readonly name: string;
  readonly scope: LexicalScope;
  readonly declaredAt: number;
  readonly initializedAt: number;
  readonly mutable: boolean;
  readonly functionOwner: string;
  readonly hoisted: boolean;
  readonly functionName?: string;
  kind: ValueKind;
  boundedArray: boolean;
  maxArrayLength?: number;
  aliasRoots?: Set<string>;
  capacityRoots?: Set<string>;
  abstractValue?: AbstractValue;
  abstractConflicted?: boolean;
}

type AbstractValue =
  | { readonly kind: "exact"; readonly value: unknown }
  | { readonly kind: "typed"; readonly valueType: "array" | "boolean" | "number" | "string" }
  | { readonly kind: "record-list"; readonly dataId: string };

interface ActiveLoop {
  readonly counter?: string;
  readonly iteratedRoots?: ReadonlySet<string>;
}

interface FunctionCallSite {
  readonly caller: string;
  readonly callee: string;
  readonly start: number;
  readonly conditional: boolean;
  readonly conditionalPath: readonly string[];
  readonly repeated: boolean;
}

interface SemanticEffect {
  readonly call: ValidatedSemanticCall;
  readonly api: string;
  readonly start: number;
  readonly targetId?: string;
  readonly inputId?: string;
  readonly outputId?: string;
  readonly scheduledScriptId?: string;
  readonly conditional: boolean;
  readonly conditionalPath: readonly string[];
  readonly repeated: boolean;
}

interface PortSnapshot {
  readonly name: string;
  readonly description: string;
  readonly refKind: RefKind | "unknown";
  readonly refId: string;
}

interface InputSnapshot {
  readonly source: string;
  readonly scriptId?: string;
  readonly inputs: readonly PortSnapshot[];
  readonly outputs: readonly PortSnapshot[];
  readonly context?: SemanticScriptApiContext;
  readonly currentScriptIdentity?: SemanticScriptValidationIdentity;
}

interface ValidatedProgramMetadata {
  readonly program: Program;
  readonly context?: SemanticScriptApiContext;
  readonly validationIdentity?: SemanticScriptValidationIdentity;
  readonly authoritativeScript?: ReturnType<typeof requireSemanticScriptValidationIdentity>;
}

const validatedPrograms = new WeakMap<ValidatedScriptAst, ValidatedProgramMetadata>();
const semanticNamespaces = new Set(["$control", "$event", "$page", "$overlay", "$state", "$data", "$feedback", "$timer"]);
const semanticApis = new Set([
  "$control.getValue", "$control.setValue", "$control.setData", "$event.record",
  "$control.setVisible", "$control.setEnabled", "$page.navigate", "$overlay.open", "$overlay.close",
  "$state.get", "$state.set", "$data.get", "$data.set", "$feedback.show", "$timer.after", "$timer.repeat",
]);
const readApis: Readonly<Record<string, RefKind>> = {
  "$control.getValue": "control", "$state.get": "local-state", "$data.get": "mock-data",
};
const writeApis: Readonly<Record<string, RefKind>> = {
  "$control.setValue": "control", "$control.setData": "control", "$control.setVisible": "control",
  "$control.setEnabled": "control", "$state.set": "local-state", "$data.set": "mock-data",
};
const arrayMethods = new Set(["slice", "filter", "push"]);
const stringMethods = new Set(["trim", "includes", "startsWith"]);
const mathMethods = new Set(["abs", "ceil", "floor", "max", "min", "round", "trunc"]);
const forbiddenIdentifiers = new Set([
  "document", "window", "globalThis", "navigator", "location", "localStorage", "sessionStorage",
  "fetch", "XMLHttpRequest", "WebSocket", "eval", "Function", "require", "process", "Proxy", "Reflect",
  "Object", "RegExp", "setTimeout", "setInterval", "queueMicrotask",
  "arguments",
]);
const allowedNodeTypes = new Set([
  "Program", "VariableDeclaration", "VariableDeclarator", "Identifier", "Literal", "ExpressionStatement",
  "CallExpression", "MemberExpression", "ArrayExpression", "ObjectExpression", "Property", "SpreadElement",
  "ArrowFunctionExpression", "FunctionDeclaration", "BlockStatement", "ReturnStatement", "IfStatement",
  "BinaryExpression", "LogicalExpression", "AssignmentExpression", "UpdateExpression", "UnaryExpression",
  "ConditionalExpression", "ForStatement", "ForOfStatement", "EmptyStatement", "TemplateLiteral", "TemplateElement",
]);
const reservedKeys = new Set(["__proto__", "prototype", "constructor"]);

function fail(code: CustomScriptValidationErrorCode, detail: string, options?: ErrorOptions): never {
  throw new CustomScriptValidationError(code, detail, options);
}

function cloneInput(input: unknown): InputSnapshot {
  if (input === null || typeof input !== "object" || utilTypes.isProxy(input)) return fail("CUSTOM_SCRIPT_INPUT_INVALID", "input must be descriptor-safe plain data");
  let prototype: object | null;
  let keys: readonly PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(input) as object | null;
    keys = Reflect.ownKeys(input);
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch (error) {
    return fail("CUSTOM_SCRIPT_INPUT_INVALID", "input descriptor inspection failed", { cause: error });
  }
  if ((prototype !== Object.prototype && prototype !== null) || keys.some((key) => typeof key !== "string" || reservedKeys.has(key))) {
    return fail("CUSTOM_SCRIPT_INPUT_INVALID", "input must be a plain string-keyed object");
  }
  const allowed = new Set(["source", "scriptId", "inputs", "outputs", "context", "currentScriptIdentity"]);
  if (keys.some((key) => !allowed.has(String(key)))) return fail("CUSTOM_SCRIPT_INPUT_INVALID", "unknown input field");
  const valueOf = (key: string): unknown => {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) return fail("CUSTOM_SCRIPT_INPUT_INVALID", `data property required: ${key}`);
    return descriptor.value;
  };
  const source = valueOf("source");
  const inputs = valueOf("inputs");
  const outputs = valueOf("outputs");
  const scriptId = descriptors.scriptId === undefined ? undefined : valueOf("scriptId");
  const context = descriptors.context === undefined ? undefined : valueOf("context");
  const currentScriptIdentity = descriptors.currentScriptIdentity === undefined ? undefined : valueOf("currentScriptIdentity");
  if (typeof source !== "string" || source.length < 1 || source.length > 8_000) return fail("CUSTOM_SCRIPT_INPUT_INVALID", "source must contain 1..8000 characters");
  if (scriptId !== undefined && (typeof scriptId !== "string" || scriptId.length === 0)) return fail("CUSTOM_SCRIPT_INPUT_INVALID", "scriptId must be non-empty");
  const clonePorts = (value: unknown, label: string): readonly PortSnapshot[] => {
    if (!Array.isArray(value) || utilTypes.isProxy(value)) return fail("CUSTOM_SCRIPT_INPUT_INVALID", `${label} must be a bounded array`);
    let prototype: object | null;
    let keys: readonly PropertyKey[];
    let descriptors: PropertyDescriptorMap;
    try {
      prototype = Object.getPrototypeOf(value) as object | null;
      keys = Reflect.ownKeys(value);
      descriptors = Object.getOwnPropertyDescriptors(value) as unknown as PropertyDescriptorMap;
    } catch (error) {
      return fail("CUSTOM_SCRIPT_INPUT_INVALID", `${label} descriptor inspection failed`, { cause: error });
    }
    const length: unknown = descriptors.length?.value as unknown;
    if (prototype !== Array.prototype || typeof length !== "number" || !Number.isInteger(length) || length < 0 || length > 32
      || keys.length !== length + 1 || keys.some((key, index) => key !== (index === length ? "length" : String(index)))) {
      return fail("CUSTOM_SCRIPT_INPUT_INVALID", `${label} must be a dense bounded array`);
    }
    const result: PortSnapshot[] = [];
    for (let index = 0; index < length; index += 1) {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) return fail("CUSTOM_SCRIPT_INPUT_INVALID", `${label}.${index} must be a data property`);
      result.push(clonePort(descriptor.value, `${label}.${index}`));
    }
    return Object.freeze(result);
  };
  return Object.freeze({
    source,
    inputs: clonePorts(inputs, "inputs"),
    outputs: clonePorts(outputs, "outputs"),
    ...(scriptId === undefined ? {} : { scriptId }),
    ...(context === undefined ? {} : { context: context as SemanticScriptApiContext }),
    ...(currentScriptIdentity === undefined ? {} : { currentScriptIdentity: currentScriptIdentity as SemanticScriptValidationIdentity }),
  });
}

function clonePort(value: unknown, label: string): PortSnapshot {
  if (typeof value === "string" && value.length > 0) return Object.freeze({ name: value, description: value, refKind: "unknown", refId: value });
  if (value === null || typeof value !== "object" || utilTypes.isProxy(value)) {
    return fail("CUSTOM_SCRIPT_INPUT_INVALID", `${label} must be a plain object`);
  }
  let prototype: object | null;
  let keys: readonly PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch (error) {
    return fail("CUSTOM_SCRIPT_INPUT_INVALID", `${label} descriptor inspection failed`, { cause: error });
  }
  if (prototype !== Object.prototype && prototype !== null) return fail("CUSTOM_SCRIPT_INPUT_INVALID", `${label} must be a plain object`);
  const expected = ["description", "name", "refId", "refKind"];
  if (keys.length !== expected.length || keys.map(String).sort().some((key, index) => key !== expected[index])) return fail("CUSTOM_SCRIPT_INPUT_INVALID", `${label} has invalid fields`);
  const read = (key: string): unknown => {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) return fail("CUSTOM_SCRIPT_INPUT_INVALID", `${label}.${key} must be a data property`);
    return descriptor.value;
  };
  const name = read("name");
  const description = read("description");
  const refKind = read("refKind");
  const refId = read("refId");
  if (typeof name !== "string" || typeof description !== "string" || typeof refId !== "string"
    || (refKind !== "control" && refKind !== "local-state" && refKind !== "mock-data")) {
    return fail("CUSTOM_SCRIPT_INPUT_INVALID", `${label} contains an invalid port`);
  }
  return Object.freeze({ name, description, refKind, refId });
}

function ast(value: unknown): AstNode {
  return value as AstNode;
}

function childNode(value: unknown): AstNode | undefined {
  return value !== null && typeof value === "object" && typeof (value as { type?: unknown }).type === "string" ? ast(value) : undefined;
}

function nodeArray(value: unknown): readonly AstNode[] {
  return Array.isArray(value) ? value.map(ast) : [];
}

function identifierName(node: AstNode | undefined): string | undefined {
  return node?.type === "Identifier" && typeof node.name === "string" ? node.name : undefined;
}

function literalValue(node: AstNode | undefined): unknown {
  return node?.type === "Literal" ? node.value : undefined;
}

function staticString(node: AstNode | undefined): { value: string; composed: boolean } | undefined {
  if (node === undefined) return undefined;
  if (node.type === "Literal" && typeof node.value === "string") return { value: node.value, composed: false };
  if (node.type === "BinaryExpression" && node.operator === "+") {
    const left = staticPrimitive(childNode(node.left));
    const right = staticPrimitive(childNode(node.right));
    return left !== undefined && right !== undefined && (typeof left === "string" || typeof right === "string")
      ? { value: String(left) + String(right), composed: true }
      : undefined;
  }
  if (node.type === "TemplateLiteral") {
    const quasis = nodeArray(node.quasis);
    const expressions = nodeArray(node.expressions);
    let value = "";
    for (let index = 0; index < quasis.length; index += 1) {
      const quasiValue = quasis[index]?.value;
      if (quasiValue === null || typeof quasiValue !== "object" || typeof (quasiValue as { cooked?: unknown }).cooked !== "string") return undefined;
      value += (quasiValue as { cooked: string }).cooked;
      if (index < expressions.length) {
        const expression = staticPrimitive(expressions[index]);
        if (expression === undefined) return undefined;
        value += String(expression);
      }
    }
    return { value, composed: true };
  }
  return undefined;
}

function staticPrimitive(node: AstNode | undefined): null | string | number | boolean | undefined {
  if (node?.type === "Literal" && (node.value === null || typeof node.value === "string" || typeof node.value === "number" || typeof node.value === "boolean")) return node.value;
  return staticString(node)?.value;
}

function memberParts(node: AstNode | undefined): { object: AstNode; property: string } | undefined {
  if (node?.type !== "MemberExpression" || node.computed === true) return undefined;
  const object = childNode(node.object);
  const property = identifierName(childNode(node.property));
  return object === undefined || property === undefined ? undefined : { object, property };
}

function isUnsafeRegex(node: AstNode): boolean {
  if (node.type !== "Literal" || node.regex === undefined || node.regex === null || typeof node.regex !== "object") return false;
  const pattern = (node.regex as { pattern?: unknown }).pattern;
  if (typeof pattern !== "string") return true;
  return /\([^)]*(?:[+*]|\{\d+(?:,\d*)?\})[^)]*\)(?:[+*]|\{)/.test(pattern)
    || /(?:\+|\*|\{\d+(?:,\d*)?\})\s*(?:\+|\*|\{)/.test(pattern)
    || pattern.length > 200;
}

function constantLeak(node: AstNode): string | undefined {
  const folded = staticString(node);
  if (folded === undefined || !folded.composed) return undefined;
  return constantStringIssue(folded.value);
}

function constantStringIssue(input: string): string | undefined {
  const value = input.trim();
  const cssProperty = /^(?:--[\w-]+|background(?:-color)?|border(?:-[\w-]+)?|color|display|font(?:-[\w-]+)?|gap|height|margin(?:-[\w-]+)?|opacity|padding(?:-[\w-]+)?|position|transform|transition|width|z-index)\s*:/i;
  if (cssProperty.test(value) || /[{};]/.test(value)) return "css";
  if (/^(?:#|\.|\[)[A-Za-z_-]/.test(value)
    || /^(?:a|button|div|form|input|label|option|select|span|table|td|textarea|tr)(?:\s+(?:(?:a|button|div|form|input|label|option|select|span|table|td|textarea|tr)\b|[.#]|\[)|\s*[>{+~:])/i.test(value)) return "selector";
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) return "GUID";
  if (/^(?:Button|Input|Select|Text|Table|Layout)\d+$/i.test(value)) return "runtime instance";
  return undefined;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function validateCustomScript(input: unknown): ValidatedScriptAst {
  const snapshot = cloneInput(input);
  let authoritativeScriptId: string | undefined;
  let authoritativeScript: ReturnType<typeof requireSemanticScriptValidationIdentity> | undefined;
  if (snapshot.currentScriptIdentity !== undefined) {
    if (snapshot.context === undefined) fail("CUSTOM_SCRIPT_UNTRUSTED_AST", "current-script identity requires its trusted semantic context");
    let script: ReturnType<typeof requireSemanticScriptValidationIdentity>;
    try {
      script = requireSemanticScriptValidationIdentity(snapshot.currentScriptIdentity, snapshot.context);
    } catch (error) {
      return fail("CUSTOM_SCRIPT_UNTRUSTED_AST", "current-script identity is not trusted by this context", error instanceof Error ? { cause: error } : undefined);
    }
    authoritativeScript = script;
    const exactPorts = (left: readonly PortSnapshot[], right: typeof script.inputs): boolean => left.length === right.length
      && left.every((port, index) => {
        const expected = right[index];
        return expected !== undefined && port.name === expected.name && port.description === expected.description
          && port.refKind === expected.refKind && port.refId === expected.refId;
      });
    if (script.source !== snapshot.source || !exactPorts(snapshot.inputs, script.inputs) || !exactPorts(snapshot.outputs, script.outputs)) {
      fail("CUSTOM_SCRIPT_UNTRUSTED_AST", "source and ports must exactly match the authoritative semantic-js ScriptPlan");
    }
    authoritativeScriptId = script.id;
  }
  let program: Program;
  try {
    program = parse(snapshot.source, { ecmaVersion: 2022, sourceType: "script", allowAwaitOutsideFunction: false, allowReturnOutsideFunction: false });
  } catch (error) {
    return fail("CUSTOM_SCRIPT_PARSE", error instanceof Error ? error.message : "invalid ECMAScript 2022 script", error instanceof Error ? { cause: error } : undefined);
  }

  let nodes = 0;
  let depth = 0;
  walk(program as unknown as WalkerNode, {
    enter(node) {
      nodes += 1;
      depth += 1;
      if (nodes > 2_000) fail("CUSTOM_SCRIPT_LIMIT", "AST exceeds 2000 nodes");
      if (depth > 32) fail("CUSTOM_SCRIPT_LIMIT", "AST exceeds depth 32");
      if (!allowedNodeTypes.has(node.type)) fail("CUSTOM_SCRIPT_FORBIDDEN", `syntax node is not allowed: ${node.type}`);
    },
    leave() { depth -= 1; },
  });

  const inputs = new Map(snapshot.inputs.map((port) => [port.refId, port]));
  const outputs = new Map(snapshot.outputs.map((port) => [port.refId, port]));
  if (inputs.size !== snapshot.inputs.length || outputs.size !== snapshot.outputs.length) return fail("CUSTOM_SCRIPT_INPUT_INVALID", "port reference IDs must be unique within inputs and outputs");
  const inputReads = new Set<string>();
  const outputWrites = new Map<string, number>();
  const calls: ValidatedSemanticCall[] = [];
  const scheduled = new Set<string>();
  const bindings = new Map<string, LexicalBinding>();
  const scopeByNode = new WeakMap<object, LexicalScope>();
  const functionNameByNode = new WeakMap<object, string>();
  const functionNames = new Set<string>();
  const functionCalls = new Map<string, Set<string>>();
  const functionMutations = new Map<string, Set<string>>();
  const functionCaptures = new Map<string, Set<string>>();
  const semanticEffects = new Map<string, SemanticEffect[]>();
  const functionCallSites: FunctionCallSite[] = [];
  const repeatedFunctions = new Set<string>();
  const loopCallSites: Array<{ readonly callee: string; readonly loops: readonly ActiveLoop[] }> = [];
  const pushSites: Array<{ readonly owner: string; readonly roots: ReadonlySet<string> }> = [];
  const programCallSites: Array<{ readonly callee: string; readonly start: number }> = [];
  const activeLoops: ActiveLoop[] = [];
  const allowedLoopUpdates = new WeakSet<object>();
  let currentFunction = "<program>";
  let conditionalDepth = 0;
  const conditionalPath: string[] = [];
  let nextScopeId = 1;
  let analysisSteps = 0;
  const chargeAnalysis = (steps = 1): void => {
    analysisSteps += steps;
    if (analysisSteps > 50_000) fail("CUSTOM_SCRIPT_LIMIT", "static analysis exceeds 50000 steps");
  };
  functionCalls.set(currentFunction, new Set());
  functionMutations.set(currentFunction, new Set());
  functionCaptures.set(currentFunction, new Set());
  semanticEffects.set(currentFunction, []);

  const newScope = (parent?: LexicalScope, functionOwner = parent?.functionOwner ?? "<program>"): LexicalScope => Object.freeze({
    id: nextScopeId++, functionOwner, ...(parent === undefined ? {} : { parent }),
  });
  const declareBinding = (name: string | undefined, declaration: AstNode, scope: LexicalScope, mutable: boolean, functionName?: string, hoisted = false): void => {
    if (name === undefined || semanticNamespaces.has(name) || forbiddenIdentifiers.has(name)) fail("CUSTOM_SCRIPT_FORBIDDEN", "bindings require unique safe identifiers");
    if (bindings.has(name)) fail("CUSTOM_SCRIPT_FORBIDDEN", `binding shadowing is forbidden: ${name}`);
    const binding: LexicalBinding = {
      name, scope, declaredAt: declaration.start, initializedAt: declaration.end, mutable: functionName === undefined && mutable,
      functionOwner: scope.functionOwner, hoisted,
      kind: "unknown", boundedArray: false, ...(functionName === undefined ? {} : { functionName }),
    };
    bindings.set(name, binding);
    if (functionName !== undefined) {
      functionNames.add(functionName);
      functionCalls.set(functionName, new Set());
      functionMutations.set(functionName, new Set());
      functionCaptures.set(functionName, new Set());
      semanticEffects.set(functionName, []);
    }
  };
  const declareStatements = (statements: readonly AstNode[], scope: LexicalScope): void => {
    for (const statement of statements) {
      if (statement.type === "FunctionDeclaration") {
        const name = identifierName(childNode(statement.id));
        declareBinding(name, childNode(statement.id) ?? statement, scope, false, name, true);
        if (name !== undefined) functionNameByNode.set(statement, name);
      } else if (statement.type === "VariableDeclaration") {
        for (const declaration of nodeArray(statement.declarations)) {
          const name = identifierName(childNode(declaration.id));
          const functionName = childNode(declaration.init)?.type === "ArrowFunctionExpression" ? name : undefined;
          declareBinding(name, declaration, scope, statement.kind === "let", functionName);
          const init = childNode(declaration.init);
          if (functionName !== undefined && init !== undefined) functionNameByNode.set(init, functionName);
        }
      }
    }
  };
  const indexScopes = (node: AstNode, scope: LexicalScope): void => {
    if (node.type === "Program") {
      scopeByNode.set(node, scope);
      declareStatements(nodeArray(node.body), scope);
      nodeArray(node.body).forEach((child) => indexScopes(child, scope));
      return;
    }
    if (node.type === "BlockStatement") {
      const blockScope = newScope(scope);
      scopeByNode.set(node, blockScope);
      declareStatements(nodeArray(node.body), blockScope);
      nodeArray(node.body).forEach((child) => indexScopes(child, blockScope));
      return;
    }
    if (node.type === "ForStatement" || node.type === "ForOfStatement") {
      const loopScope = newScope(scope);
      scopeByNode.set(node, loopScope);
      const declaration = childNode(node.type === "ForStatement" ? node.init : node.left);
      if (declaration?.type === "VariableDeclaration") declareStatements([declaration], loopScope);
      for (const child of children(node)) indexScopes(child, loopScope);
      return;
    }
    if (node.type === "FunctionDeclaration" || node.type === "ArrowFunctionExpression") {
      const functionName = functionNameByNode.get(node) ?? `<callback:${node.start}>`;
      const functionScope = newScope(scope, functionName);
      scopeByNode.set(node, functionScope);
      for (const parameter of nodeArray(node.params)) {
        const name = identifierName(parameter);
        declareBinding(name, parameter, functionScope, false);
      }
      for (const child of children(node)) indexScopes(child, functionScope);
      return;
    }
    scopeByNode.set(node, scope);
    for (const child of children(node)) indexScopes(child, scope);
  };
  const programScope = newScope();
  indexScopes(ast(program), programScope);

  const scopeContains = (bindingScope: LexicalScope, referenceScope: LexicalScope): boolean => {
    for (let scope: LexicalScope | undefined = referenceScope; scope !== undefined; scope = scope.parent) {
      if (scope === bindingScope) return true;
    }
    return false;
  };
  const requireBinding = (name: string, node: AstNode): LexicalBinding => {
    const binding = bindings.get(name);
    const referenceScope = scopeByNode.get(node);
    if (binding === undefined || referenceScope === undefined || !scopeContains(binding.scope, referenceScope)) {
      return fail("CUSTOM_SCRIPT_FORBIDDEN", `undeclared or out-of-scope identifier: ${name}`);
    }
    if (!binding.hoisted && node.start < binding.initializedAt) {
      if (currentFunction === "<program>" || binding.functionOwner === currentFunction) fail("CUSTOM_SCRIPT_FORBIDDEN", `use before declaration: ${name}`);
      functionCaptures.get(currentFunction)?.add(name);
    }
    return binding;
  };
  const bindingRoots = (name: string): ReadonlySet<string> => {
    const roots = new Set<string>();
    const seen = new Set<string>();
    const pending = [name];
    while (pending.length > 0) {
      chargeAnalysis();
      const current = pending.pop()!;
      if (seen.has(current)) continue;
      seen.add(current);
      const aliases = bindings.get(current)?.aliasRoots;
      if (aliases === undefined || aliases.size === 0 || aliases.has(current)) roots.add(current);
      for (const alias of aliases ?? []) if (alias !== current) pending.push(alias);
    }
    if (roots.size === 0) seen.forEach((candidate) => roots.add(candidate));
    return roots;
  };
  const rootsIntersect = (left: ReadonlySet<string>, right: ReadonlySet<string>): boolean => {
    chargeAnalysis(Math.min(left.size, right.size));
    for (const root of left) if (right.has(root)) return true;
    return false;
  };
  const mayAlias = (name: string, roots: ReadonlySet<string>): boolean => rootsIntersect(bindingRoots(name), roots);
  const recordMutation = (name: string): void => {
    functionMutations.get(currentFunction)?.add(name);
  };
  const sameExactValue = (left: unknown, right: unknown): boolean => {
    if (Object.is(left, right)) return true;
    try { return JSON.stringify(left) === JSON.stringify(right); } catch { return false; }
  };
  const mergeAbstractValue = (binding: LexicalBinding, value: AbstractValue | undefined, initializing = false): void => {
    if (value === undefined || binding.abstractConflicted === true) {
      delete binding.abstractValue;
      binding.abstractConflicted = true;
      return;
    }
    if (initializing || binding.abstractValue === undefined) {
      binding.abstractValue = value;
      return;
    }
    const previous = binding.abstractValue;
    const compatible = previous.kind === "typed" && value.kind === "typed" && previous.valueType === value.valueType
      || previous.kind === "record-list" && value.kind === "record-list" && previous.dataId === value.dataId
      || previous.kind === "exact" && value.kind === "exact" && sameExactValue(previous.value, value.value);
    if (!compatible) {
      delete binding.abstractValue;
      binding.abstractConflicted = true;
    }
  };

  const expressionKind = (node: AstNode | undefined): ValueKind => {
    if (node === undefined) return "unknown";
    if (node.type === "ArrayExpression") return "array";
    if (node.type === "ObjectExpression") return "record";
    if (node.type === "Literal") return typeof node.value === "string" ? "string" : "scalar";
    if (node.type === "Identifier") return bindings.get(identifierName(node) ?? "")?.kind ?? "unknown";
    if (node.type === "ConditionalExpression") {
      const consequent = expressionKind(childNode(node.consequent));
      const alternate = expressionKind(childNode(node.alternate));
      return consequent === alternate ? consequent : "unknown";
    }
    if (node.type === "LogicalExpression") {
      const left = expressionKind(childNode(node.left));
      const right = expressionKind(childNode(node.right));
      return left === right ? left : "unknown";
    }
    if (node.type === "CallExpression") {
      const callee = childNode(node.callee);
      const name = identifierName(callee);
      if (name === "String") return "string";
      const member = memberParts(callee);
      if (member !== undefined) {
        const objectName = identifierName(member.object);
        const api = objectName === undefined ? undefined : `${objectName}.${member.property}`;
        if (api === "$data.get") return "array";
        if (api === "$event.record") return "record";
        if (member.property === "slice" || member.property === "filter") return "array";
        if (member.property === "trim") return "string";
      }
    }
    return "unknown";
  };

  const boundedArrayExpression = (node: AstNode | undefined): boolean => {
    if (node?.type === "ArrayExpression") return nodeArray(node.elements).length <= 1_000;
    if (node?.type === "Identifier") return bindings.get(identifierName(node) ?? "")?.boundedArray === true;
    if (node?.type === "ConditionalExpression") return boundedArrayExpression(childNode(node.consequent)) && boundedArrayExpression(childNode(node.alternate));
    if (node?.type === "LogicalExpression") return boundedArrayExpression(childNode(node.left)) && boundedArrayExpression(childNode(node.right));
    if (node?.type !== "CallExpression") return false;
    const member = memberParts(childNode(node.callee));
    if (member?.property !== "slice") return false;
    const args = nodeArray(node.arguments);
    return args.length === 2 && literalValue(args[0]) === 0 && typeof literalValue(args[1]) === "number"
      && (literalValue(args[1]) as number) >= 0 && (literalValue(args[1]) as number) <= 1000;
  };
  const arrayMaxLength = (node: AstNode | undefined): number | undefined => {
    if (node?.type === "ArrayExpression") return nodeArray(node.elements).length <= 1_000 ? nodeArray(node.elements).length : undefined;
    if (node?.type === "Identifier") return bindings.get(identifierName(node) ?? "")?.maxArrayLength;
    if (node?.type === "ConditionalExpression" || node?.type === "LogicalExpression") {
      const candidates = node.type === "ConditionalExpression"
        ? [childNode(node.consequent), childNode(node.alternate)] : [childNode(node.left), childNode(node.right)];
      const lengths = candidates.map(arrayMaxLength);
      return lengths.every((length): length is number => length !== undefined) ? Math.max(...lengths) : undefined;
    }
    if (node?.type !== "CallExpression") return undefined;
    const member = memberParts(childNode(node.callee));
    if (member?.property === "filter") return arrayMaxLength(member.object);
    if (member?.property !== "slice") return undefined;
    const args = nodeArray(node.arguments);
    const limit = literalValue(args[1]);
    if (args.length !== 2 || literalValue(args[0]) !== 0 || typeof limit !== "number" || !Number.isInteger(limit) || limit < 0 || limit > 1_000) return undefined;
    const receiverLength = arrayMaxLength(member.object);
    return receiverLength === undefined ? limit : Math.min(receiverLength, limit);
  };

  const arrayIdentityRoots = (node: AstNode | undefined): ReadonlySet<string> | undefined => {
    if (node === undefined) return undefined;
    if (node.type === "Identifier") {
      const name = identifierName(node)!;
      return expressionKind(node) === "array" ? bindingRoots(name) : undefined;
    }
    if (node.type === "ConditionalExpression" || node.type === "LogicalExpression") {
      const candidates = node.type === "ConditionalExpression"
        ? [childNode(node.consequent), childNode(node.alternate)]
        : [childNode(node.left), childNode(node.right)];
      const roots = new Set<string>();
      for (const candidate of candidates) {
        const candidateRoots = arrayIdentityRoots(candidate);
        if (candidateRoots === undefined) return undefined;
        candidateRoots.forEach((root) => roots.add(root));
      }
      return roots;
    }
    if (node.type === "ArrayExpression") return new Set();
    if (node.type === "CallExpression" && expressionKind(node) === "array") return new Set();
    return undefined;
  };
  const capacityRootsForExpression = (node: AstNode | undefined): ReadonlySet<string> | undefined => {
    if (node === undefined) return undefined;
    if (node.type === "Identifier") return bindings.get(identifierName(node) ?? "")?.capacityRoots;
    if (node.type === "ConditionalExpression" || node.type === "LogicalExpression") {
      const candidates = node.type === "ConditionalExpression"
        ? [childNode(node.consequent), childNode(node.alternate)] : [childNode(node.left), childNode(node.right)];
      const roots = new Set<string>();
      for (const candidate of candidates) {
        const candidateRoots = capacityRootsForExpression(candidate);
        if (candidateRoots === undefined) return undefined;
        candidateRoots.forEach((root) => roots.add(root));
      }
      return roots;
    }
    if (node.type === "CallExpression") {
      const member = memberParts(childNode(node.callee));
      if (member?.property === "filter" || member?.property === "slice") return capacityRootsForExpression(member.object);
    }
    return new Set<string>();
  };

  const abstractJson = (node: AstNode): AbstractValue | undefined => {
    const concrete = staticJson(node);
    if (concrete.known) return { kind: "exact", value: concrete.value };
    if (node.type === "Identifier") return bindings.get(identifierName(node) ?? "")?.abstractValue;
    if (node.type === "BinaryExpression") {
      if (["===", "!==", "<", "<=", ">", ">="].includes(String(node.operator))) return { kind: "typed", valueType: "boolean" };
      const kind = expressionKind(node);
      if (kind === "string") return { kind: "typed", valueType: "string" };
      if (kind === "scalar") return { kind: "typed", valueType: "number" };
    }
    if (node.type === "LogicalExpression") {
      if (node.operator !== "&&" && node.operator !== "||") return undefined;
      const left = abstractJson(childNode(node.left)!);
      const right = abstractJson(childNode(node.right)!);
      if (left?.kind === "exact") {
        const leftTruthy = left.value ? true : false;
        const choosesLeft = node.operator === "&&" ? !leftTruthy : leftTruthy;
        return choosesLeft ? left : right;
      }
      if (left?.kind === "typed" && right?.kind === "typed" && left.valueType === right.valueType) return left;
      if (left?.kind === "record-list" && right?.kind === "record-list" && left.dataId === right.dataId) return left;
      return undefined;
    }
    if (node.type === "UnaryExpression" && node.operator === "!") return { kind: "typed", valueType: "boolean" };
    if (node.type === "CallExpression") {
      const callee = childNode(node.callee);
      const direct = identifierName(callee);
      if (direct === "String") return { kind: "typed", valueType: "string" };
      if (direct === "Number") return { kind: "typed", valueType: "number" };
      if (direct === "Boolean") return { kind: "typed", valueType: "boolean" };
      const member = memberParts(callee);
      const objectName = member === undefined ? undefined : identifierName(member.object);
      const api = member === undefined || objectName === undefined ? undefined : `${objectName}.${member.property}`;
      if (objectName === "Math" || objectName === "Date") return { kind: "typed", valueType: "number" };
      if (api === "$data.get") {
        const dataId = foldStringExpression(nodeArray(node.arguments)[0])?.value;
        return dataId === undefined ? undefined : { kind: "record-list", dataId };
      }
      if (member?.property === "slice" || member?.property === "filter") return abstractJson(member.object);
    }
    if (expressionKind(node) === "array") return { kind: "typed", valueType: "array" };
    return undefined;
  };

  const foldPrimitiveExpression = (node: AstNode | undefined, seen = new Set<string>()): { value: null | string | number | boolean; composed: boolean } | undefined => {
    if (node === undefined) return undefined;
    if (node.type === "Literal" && (node.value === null || typeof node.value === "string" || typeof node.value === "number" || typeof node.value === "boolean")) {
      return { value: node.value, composed: false };
    }
    if (node.type === "Identifier") {
      const name = identifierName(node)!;
      if (seen.has(name)) return undefined;
      const binding = bindings.get(name);
      const value = binding?.abstractValue?.kind === "exact" ? binding.abstractValue.value : undefined;
      if (binding === undefined || binding.abstractConflicted === true || binding.abstractValue?.kind !== "exact"
        || (value !== null && typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean")) return undefined;
      return { value, composed: false };
    }
    if (node.type === "BinaryExpression" && node.operator === "+") {
      const left = foldPrimitiveExpression(childNode(node.left), seen);
      const right = foldPrimitiveExpression(childNode(node.right), seen);
      if (left === undefined || right === undefined || (typeof left.value !== "string" && typeof right.value !== "string")) return undefined;
      return { value: String(left.value) + String(right.value), composed: true };
    }
    if (node.type === "TemplateLiteral") {
      const quasis = nodeArray(node.quasis);
      const expressions = nodeArray(node.expressions);
      let value = "";
      for (let index = 0; index < quasis.length; index += 1) {
        const quasi = quasis[index]?.value;
        if (quasi === null || typeof quasi !== "object" || typeof (quasi as { cooked?: unknown }).cooked !== "string") return undefined;
        value += (quasi as { cooked: string }).cooked;
        if (index < expressions.length) {
          const expression = foldPrimitiveExpression(expressions[index], seen);
          if (expression === undefined) return undefined;
          value += String(expression.value);
        }
      }
      return { value, composed: true };
    }
    return undefined;
  };
  const foldStringExpression = (node: AstNode | undefined): { value: string; composed: boolean } | undefined => {
    const folded = foldPrimitiveExpression(node);
    return folded !== undefined && typeof folded.value === "string" ? { value: folded.value, composed: folded.composed } : undefined;
  };

  const semanticCall = (node: AstNode, api: string): void => {
    const args = nodeArray(node.arguments);
    const [namespace, method] = api.split(".") as [string, string];
    const arity = semanticApiArity(api);
    if (args.length < arity[0] || args.length > arity[1]) fail("CUSTOM_SCRIPT_FORBIDDEN", `${api} arity must be ${arity[0] === arity[1] ? arity[0] : `${arity[0]}..${arity[1]}`}`);
    const targetIndex = api === "$timer.after" ? 1 : api === "$timer.repeat" ? 2 : 0;
    const hasTarget = api !== "$event.record" && api !== "$feedback.show" && !api.startsWith("$timer.");
    const target = hasTarget ? foldStringExpression(args[targetIndex]) : undefined;
    if (hasTarget && target === undefined) fail("CUSTOM_SCRIPT_FORBIDDEN", `${api} requires a static semantic ID`);
    if (target !== undefined) {
      const leak = target.composed ? constantStringIssue(target.value) : undefined;
      if (leak !== undefined) fail("CUSTOM_SCRIPT_FORBIDDEN", `${leak} is not a semantic reference`);
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(target.value)) {
        fail("CUSTOM_SCRIPT_FORBIDDEN", "GUID is not a semantic reference");
      }
      if ((api.startsWith("$page.") || api.startsWith("$overlay.")) && snapshot.context === undefined) {
        fail("CUSTOM_SCRIPT_UNDECLARED_INPUT", target.value);
      }
    }
    const refKind = readApis[api];
    let inputId: string | undefined;
    if (refKind !== undefined) {
      const refId = target!.value;
      const port = inputs.get(refId);
      if (port === undefined || (port.refKind !== refKind && port.refKind !== "unknown")) fail("CUSTOM_SCRIPT_UNDECLARED_INPUT", refId);
      inputId = refId;
    }
    const writeKind = writeApis[api];
    let outputId: string | undefined;
    if (writeKind !== undefined) {
      const refId = target!.value;
      const port = outputs.get(refId);
      if (port === undefined || (port.refKind !== writeKind && port.refKind !== "unknown")) fail("CUSTOM_SCRIPT_UNDECLARED_OUTPUT", refId);
      outputId = refId;
    }
    let scheduledScriptId: string | undefined;
    if (api === "$timer.after" || api === "$timer.repeat") {
      const scriptArg = args[api === "$timer.after" ? 1 : 2];
      const scriptId = foldStringExpression(scriptArg)?.value;
      if (scriptId === undefined) fail("CUSTOM_SCRIPT_FORBIDDEN", `${api} requires a static script ID`);
      if (authoritativeScriptId === undefined) fail("CUSTOM_SCRIPT_UNTRUSTED_AST", "timer calls require an authoritative current-script identity");
      if (scriptId === authoritativeScriptId) fail("CUSTOM_SCRIPT_SELF_SCHEDULE", scriptId);
      if (snapshot.context === undefined) fail("CUSTOM_SCRIPT_UNDECLARED_INPUT", scriptId);
      const delay = literalValue(args[0]);
      if (typeof delay !== "number" || !Number.isInteger(delay) || delay < 100 || delay > 60_000) fail("CUSTOM_SCRIPT_FORBIDDEN", `${api} delay must be 100..60000ms`);
      if (api === "$timer.repeat") {
        const repetitions = literalValue(args[1]);
        if (typeof repetitions !== "number" || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) fail("CUSTOM_SCRIPT_FORBIDDEN", "$timer.repeat count must be 1..10");
      }
      scheduledScriptId = scriptId;
    }
    let availability: ValidatedSemanticCall["availability"] = "unresolved";
    if (snapshot.context !== undefined) {
      const resolvedArgs = args.map(abstractJson);
      const recordList = resolvedArgs.find((value) => value?.kind === "record-list");
      if (recordList?.kind === "record-list") {
        if ((api !== "$data.set" && api !== "$control.setData") || target === undefined || resolvedArgs[1] !== recordList) {
          fail("CUSTOM_SCRIPT_FORBIDDEN", `${api} does not accept record-list provenance here`);
        }
        assertSemanticRecordListCompatibility(api, target.value, recordList.dataId, snapshot.context);
      }
      if (resolvedArgs.some((value) => value === undefined)) fail("CUSTOM_SCRIPT_FORBIDDEN", `${api} dynamic argument type cannot be proven in trusted context`);
      const representative = resolvedArgs.map((value) => value!.kind === "exact" ? value!.value
        : value!.kind === "record-list" ? []
          : value!.valueType === "string" ? "dynamic"
            : value!.valueType === "array" ? [] : value!.valueType === "number" ? 0 : false);
      const resolution = resolveSemanticApiCall({ api, args: representative }, snapshot.context);
      availability = resolution.availability;
    }
    const call = Object.freeze({
      api, namespace, method, ...(target === undefined ? {} : { targetId: target.value }), availability,
      ...(conditionalDepth > 0 ? { execution: "conditional" as const } : {}),
    });
    semanticEffects.get(currentFunction)!.push(Object.freeze({
      call, api, start: node.start,
      ...(target === undefined ? {} : { targetId: target.value }),
      ...(inputId === undefined ? {} : { inputId }),
      ...(outputId === undefined ? {} : { outputId }),
      ...(scheduledScriptId === undefined ? {} : { scheduledScriptId }),
      conditional: conditionalDepth > 0,
      conditionalPath: Object.freeze([...conditionalPath]),
      repeated: activeLoops.length > 0 || repeatedFunctions.has(currentFunction),
    }));
  };

  const visit = (node: AstNode, parent?: AstNode): void => {
    const folded = foldStringExpression(node);
    const leak = folded?.composed === true ? constantStringIssue(folded.value) : constantLeak(node);
    if (leak !== undefined) fail("CUSTOM_SCRIPT_FORBIDDEN", `${leak} constructed from constant text`);
    if (isUnsafeRegex(node)) fail("CUSTOM_SCRIPT_FORBIDDEN", "unsafe regular expression");
    if (node.type === "Identifier") {
      const name = identifierName(node)!;
      if (forbiddenIdentifiers.has(name)) fail("CUSTOM_SCRIPT_FORBIDDEN", `forbidden global: ${name}`);
      const reference = isIdentifierReference(node, parent);
      if (reference && (semanticNamespaces.has(name) || name === "Math" || name === "Date")) {
        if (parent?.type !== "MemberExpression" || parent.object !== node) fail("CUSTOM_SCRIPT_FORBIDDEN", `global namespace aliases are forbidden: ${name}`);
      }
      if (reference && ["String", "Number", "Boolean"].includes(name)
        && (parent?.type !== "CallExpression" || parent.callee !== node)) fail("CUSTOM_SCRIPT_FORBIDDEN", `conversion aliases are forbidden: ${name}`);
      if (reference
        && !semanticNamespaces.has(name)
        && !["String", "Number", "Boolean", "Date", "Math"].includes(name)) {
        requireBinding(name, node);
      }
    }
    if (node.type === "VariableDeclaration") {
      if (node.kind !== "const" && node.kind !== "let") fail("CUSTOM_SCRIPT_FORBIDDEN", "only const and let declarations are allowed");
      for (const declaration of nodeArray(node.declarations)) {
        const name = identifierName(childNode(declaration.id));
        if (name === undefined) fail("CUSTOM_SCRIPT_FORBIDDEN", "variables require identifier bindings");
        const binding = bindings.get(name);
        if (binding === undefined) fail("CUSTOM_SCRIPT_FORBIDDEN", `binding index is missing: ${name}`);
        const init = childNode(declaration.init);
        binding.kind = expressionKind(init);
        binding.boundedArray = boundedArrayExpression(init);
        const initialMaxArrayLength = arrayMaxLength(init);
        if (initialMaxArrayLength === undefined) delete binding.maxArrayLength;
        else binding.maxArrayLength = initialMaxArrayLength;
        if (binding.kind === "array") {
          const roots = arrayIdentityRoots(init);
          binding.aliasRoots = roots === undefined || roots.size === 0 ? new Set([name]) : new Set(roots);
          const capacityRoots = capacityRootsForExpression(init);
          binding.capacityRoots = capacityRoots === undefined || capacityRoots.size === 0 ? new Set([name]) : new Set(capacityRoots);
        }
        if (init !== undefined) {
          const abstract = abstractJson(init);
          mergeAbstractValue(binding, abstract, true);
        }
      }
    }
    if (node.type === "FunctionDeclaration" || node.type === "ArrowFunctionExpression") {
      const previous = currentFunction;
      const declaredName = node.type === "FunctionDeclaration" ? identifierName(childNode(node.id)) : parent?.type === "VariableDeclarator" ? identifierName(childNode(parent.id)) : undefined;
      currentFunction = declaredName ?? `<callback:${node.start}>`;
      functionCalls.set(currentFunction, functionCalls.get(currentFunction) ?? new Set());
      for (const child of children(node)) visit(child, node);
      currentFunction = previous;
      return;
    }
    if (node.type === "IfStatement" || node.type === "ConditionalExpression") {
      const condition = childNode(node.test);
      const consequent = childNode(node.consequent);
      const alternate = childNode(node.alternate);
      if (condition !== undefined) visit(condition, node);
      conditionalDepth += 1;
      conditionalPath.push(`${node.start}:then`);
      if (consequent !== undefined) visit(consequent, node);
      conditionalPath.pop();
      conditionalPath.push(`${node.start}:else`);
      if (alternate !== undefined) visit(alternate, node);
      conditionalPath.pop();
      conditionalDepth -= 1;
      return;
    }
    if (node.type === "LogicalExpression") {
      if (node.operator !== "&&" && node.operator !== "||") fail("CUSTOM_SCRIPT_FORBIDDEN", `logical operator is not allowed: ${String(node.operator)}`);
      const left = childNode(node.left);
      const right = childNode(node.right);
      if (left !== undefined) visit(left, node);
      conditionalDepth += 1;
      conditionalPath.push(`${node.start}:then`);
      if (right !== undefined) visit(right, node);
      conditionalPath.pop();
      conditionalDepth -= 1;
      return;
    }
    if (node.type === "ForStatement") {
      const counter = validateFor(node);
      activeLoops.push({ counter });
      for (const child of children(node)) visit(child, node);
      activeLoops.pop();
      return;
    }
    if (node.type === "ForOfStatement") {
      const right = childNode(node.right);
      if (!boundedArrayExpression(right)) fail("CUSTOM_SCRIPT_FORBIDDEN", "for-of requires a statically bounded array");
      const iteratedRoots = arrayIdentityRoots(right);
      activeLoops.push({ ...(iteratedRoots === undefined || iteratedRoots.size === 0 ? {} : { iteratedRoots }) });
      for (const child of children(node)) visit(child, node);
      activeLoops.pop();
      return;
    }
    if (node.type === "CallExpression") validateCall(node);
    if (node.type === "MemberExpression") validateMember(node, parent);
    if (node.type === "AssignmentExpression") validateAssignment(node);
    if (node.type === "UpdateExpression") validateUpdate(node);
    if (node.type === "Property") {
      if (node.kind !== "init" || node.method === true || node.computed === true) fail("CUSTOM_SCRIPT_FORBIDDEN", "getters, setters, methods, and computed object keys are forbidden");
      const key = identifierName(childNode(node.key)) ?? (typeof literalValue(childNode(node.key)) === "string" ? literalValue(childNode(node.key)) as string : undefined);
      if (key !== undefined && reservedKeys.has(key)) fail("CUSTOM_SCRIPT_FORBIDDEN", `reserved property: ${key}`);
    }
    if (node.type === "UnaryExpression" && !["!", "+", "-"].includes(String(node.operator))) fail("CUSTOM_SCRIPT_FORBIDDEN", `unary operator is not allowed: ${String(node.operator)}`);
    if (node.type === "BinaryExpression" && !["===", "!==", "<", "<=", ">", ">=", "+", "-", "*", "/", "%"].includes(String(node.operator))) fail("CUSTOM_SCRIPT_FORBIDDEN", `binary operator is not allowed: ${String(node.operator)}`);
    if (node.type === "LogicalExpression" && node.operator !== "&&" && node.operator !== "||") fail("CUSTOM_SCRIPT_FORBIDDEN", `logical operator is not allowed: ${String(node.operator)}`);
    if (node.type === "SpreadElement") {
      const argument = childNode(node.argument);
      if (parent?.type !== "ObjectExpression" || argument?.type !== "MemberExpression" || argument.computed !== true) {
        fail("CUSTOM_SCRIPT_FORBIDDEN", "object spread requires a bounded local array element");
      }
      const arrayName = identifierName(childNode(argument.object));
      const indexName = identifierName(childNode(argument.property));
      if (arrayName === undefined || bindings.get(arrayName)?.boundedArray !== true || indexName === undefined || !bindings.has(indexName)) {
        fail("CUSTOM_SCRIPT_FORBIDDEN", "object spread requires a bounded local array element");
      }
    }
    for (const child of children(node)) visit(child, node);
  };

  const validateCall = (node: AstNode): void => {
    if (node.optional === true) fail("CUSTOM_SCRIPT_FORBIDDEN", "optional calls are forbidden");
    const callee = childNode(node.callee);
    const direct = identifierName(callee);
    if (direct !== undefined) {
      if (["String", "Number", "Boolean"].includes(direct)) {
        if (nodeArray(node.arguments).length !== 1) fail("CUSTOM_SCRIPT_FORBIDDEN", `${direct} conversion requires one argument`);
        return;
      }
      if (direct === "Date") fail("CUSTOM_SCRIPT_FORBIDDEN", "Date() current-time access is forbidden; use Date.parse/UTC conversion");
      if (functionNames.has(direct)) {
        const binding = requireBinding(direct, callee!);
        if (binding.functionName === undefined) fail("CUSTOM_SCRIPT_FORBIDDEN", `call target is not an immutable function: ${direct}`);
        functionCalls.get(currentFunction)!.add(binding.functionName);
        functionCallSites.push({
          caller: currentFunction, callee: binding.functionName, start: node.start,
          conditional: conditionalDepth > 0, repeated: activeLoops.length > 0 || repeatedFunctions.has(currentFunction),
          conditionalPath: Object.freeze([...conditionalPath]),
        });
        if (activeLoops.length > 0) loopCallSites.push({ callee: binding.functionName, loops: activeLoops.map((loop) => ({ ...loop })) });
        if (currentFunction === "<program>") programCallSites.push({ callee: binding.functionName, start: node.start });
        return;
      }
      fail("CUSTOM_SCRIPT_FORBIDDEN", `unknown direct call: ${direct}`);
    }
    const member = memberParts(callee);
    if (member === undefined) fail("CUSTOM_SCRIPT_FORBIDDEN", "computed or unknown calls are forbidden");
    const objectName = identifierName(member.object);
    if (objectName !== undefined && semanticNamespaces.has(objectName)) {
      const api = `${objectName}.${member.property}`;
      if (!semanticApis.has(api)) fail("CUSTOM_SCRIPT_FORBIDDEN", `unknown semantic API: ${api}`);
      semanticCall(node, api);
      return;
    }
    if (objectName === "Math") {
      if (!mathMethods.has(member.property)) fail("CUSTOM_SCRIPT_FORBIDDEN", `Math.${member.property} is not allowed`);
      return;
    }
    if (objectName === "Date") {
      if (member.property !== "parse" && member.property !== "UTC") fail("CUSTOM_SCRIPT_FORBIDDEN", `Date.${member.property} is not allowed`);
      if (nodeArray(node.arguments).length < 1 || nodeArray(node.arguments).length > 7) fail("CUSTOM_SCRIPT_FORBIDDEN", `Date.${member.property} conversion arity is invalid`);
      return;
    }
    const receiverKind = expressionKind(member.object);
    if (arrayMethods.has(member.property)) {
      if (receiverKind !== "array") fail("CUSTOM_SCRIPT_FORBIDDEN", `unknown array method receiver: ${member.property}`);
      if (member.property === "slice" && !boundedArrayExpression(node)) fail("CUSTOM_SCRIPT_FORBIDDEN", "slice requires literal bounds from 0 to 1000");
      if (member.property === "filter") {
        const argumentsList = nodeArray(node.arguments);
        if (argumentsList.length !== 1 || argumentsList[0]?.type !== "ArrowFunctionExpression") fail("CUSTOM_SCRIPT_FORBIDDEN", "filter requires one inline arrow callback");
        const callbackName = `<callback:${argumentsList[0].start}>`;
        functionCalls.set(callbackName, functionCalls.get(callbackName) ?? new Set());
        functionMutations.set(callbackName, functionMutations.get(callbackName) ?? new Set());
        functionCaptures.set(callbackName, functionCaptures.get(callbackName) ?? new Set());
        semanticEffects.set(callbackName, semanticEffects.get(callbackName) ?? []);
        repeatedFunctions.add(callbackName);
        functionCalls.get(currentFunction)!.add(callbackName);
        functionCallSites.push({
          caller: currentFunction, callee: callbackName, start: node.start,
          conditional: conditionalDepth > 0, repeated: true,
          conditionalPath: Object.freeze([...conditionalPath]),
        });
        if (currentFunction === "<program>") programCallSites.push({ callee: callbackName, start: node.start });
      }
      if (member.property === "push") {
        if (nodeArray(node.arguments).length !== 1) fail("CUSTOM_SCRIPT_FORBIDDEN", "push requires one value");
        if (activeLoops.length > 0 || repeatedFunctions.has(currentFunction)) fail("CUSTOM_SCRIPT_FORBIDDEN", "push cannot execute in a loop or repeated callback");
        const receiver = identifierName(member.object);
        if (receiver !== undefined && activeLoops.some((loop) => loop.iteratedRoots !== undefined && mayAlias(receiver, loop.iteratedRoots))) {
          fail("CUSTOM_SCRIPT_FORBIDDEN", `cannot mutate an iterated array: ${receiver}`);
        }
        const receiverBinding = receiver === undefined ? undefined : bindings.get(receiver);
        if (receiverBinding?.boundedArray !== true || receiverBinding.maxArrayLength === undefined || receiverBinding.maxArrayLength >= 1_000) {
          fail("CUSTOM_SCRIPT_FORBIDDEN", "push exceeds or lacks a proven array capacity");
        }
        pushSites.push({ owner: currentFunction, roots: new Set(receiverBinding.capacityRoots ?? [receiver!]) });
        recordMutation(receiver!);
        if (receiverBinding?.abstractValue?.kind === "record-list" && snapshot.context !== undefined) {
          const pushed = abstractJson(nodeArray(node.arguments)[0]!);
          if (pushed?.kind === "exact") {
            assertSemanticRecordCompatibility(receiverBinding.abstractValue.dataId, pushed.value, snapshot.context);
          } else {
            delete receiverBinding.abstractValue;
            receiverBinding.abstractConflicted = true;
          }
        }
      }
      return;
    }
    if (stringMethods.has(member.property)) {
      if (receiverKind !== "string") fail("CUSTOM_SCRIPT_FORBIDDEN", `unknown string method receiver: ${member.property}`);
      const expected = member.property === "trim" ? 0 : 1;
      if (nodeArray(node.arguments).length !== expected) fail("CUSTOM_SCRIPT_FORBIDDEN", `${member.property} requires ${expected} arguments`);
      return;
    }
    fail("CUSTOM_SCRIPT_FORBIDDEN", `method is not allowlisted: ${member.property}`);
  };

  const validateAssignment = (node: AstNode): void => {
    if (!["=", "+=", "-=", "*=", "/="].includes(String(node.operator))) fail("CUSTOM_SCRIPT_FORBIDDEN", `assignment operator is not allowed: ${String(node.operator)}`);
    const left = childNode(node.left);
    const name = identifierName(left);
    if (name !== undefined) {
      const binding = requireBinding(name, left!);
      if (!binding.mutable) fail("CUSTOM_SCRIPT_FORBIDDEN", `assignment requires a mutable non-function local: ${name}`);
      if (!allowedLoopUpdates.has(node) && activeLoops.some((loop) => loop.counter === name)) fail("CUSTOM_SCRIPT_FORBIDDEN", `loop counter may only change in its update clause: ${name}`);
      if (activeLoops.some((loop) => loop.iteratedRoots !== undefined && mayAlias(name, loop.iteratedRoots))) fail("CUSTOM_SCRIPT_FORBIDDEN", `cannot rebind an iterated array or alias: ${name}`);
      const right = childNode(node.right);
      if (right !== undefined) {
        if (node.operator === "=" && binding.kind === "array") {
          const assignedRoots = arrayIdentityRoots(right);
          if (assignedRoots === undefined) fail("CUSTOM_SCRIPT_FORBIDDEN", `array identity cannot be proven: ${name}`);
          if (activeLoops.some((loop) => loop.iteratedRoots !== undefined && rootsIntersect(assignedRoots, loop.iteratedRoots))) {
            fail("CUSTOM_SCRIPT_FORBIDDEN", `cannot create an alias to an iterated array: ${name}`);
          }
          const aliases = binding.aliasRoots ?? new Set<string>();
          (assignedRoots.size === 0 ? new Set([name]) : assignedRoots).forEach((root) => aliases.add(root));
          binding.aliasRoots = aliases;
          const assignedMaxArrayLength = arrayMaxLength(right);
          if (assignedMaxArrayLength === undefined) delete binding.maxArrayLength;
          else binding.maxArrayLength = assignedMaxArrayLength;
          const capacityRoots = capacityRootsForExpression(right);
          binding.capacityRoots = capacityRoots === undefined || capacityRoots.size === 0 ? new Set([name]) : new Set(capacityRoots);
        }
        const assigned = abstractJson(right);
        if (conditionalDepth > 0 && binding.abstractValue === undefined) mergeAbstractValue(binding, undefined);
        else mergeAbstractValue(binding, assigned);
      }
      recordMutation(name);
      return;
    }
    if (left?.type !== "MemberExpression" || left.computed !== true) fail("CUSTOM_SCRIPT_FORBIDDEN", "property assignment is forbidden");
    const arrayName = identifierName(childNode(left.object));
    if (arrayName === undefined || bindings.get(arrayName)?.boundedArray !== true) fail("CUSTOM_SCRIPT_FORBIDDEN", "only bounded local array elements may be assigned");
    if (activeLoops.some((loop) => loop.iteratedRoots !== undefined && mayAlias(arrayName, loop.iteratedRoots))) fail("CUSTOM_SCRIPT_FORBIDDEN", `cannot assign an iterated array element: ${arrayName}`);
    if (!safeArrayIndex(childNode(left.property), bindings)) fail("CUSTOM_SCRIPT_FORBIDDEN", "array assignment requires a bounded local index");
    if (repeatedFunctions.has(currentFunction)) fail("CUSTOM_SCRIPT_FORBIDDEN", "filter callbacks cannot mutate arrays");
    const arrayBinding = bindings.get(arrayName);
    if (arrayBinding?.abstractValue?.kind === "record-list" && snapshot.context !== undefined) {
      const replacement = abstractJson(childNode(node.right)!);
      if (replacement?.kind === "exact") {
        assertSemanticRecordCompatibility(arrayBinding.abstractValue.dataId, replacement.value, snapshot.context);
      } else {
        delete arrayBinding.abstractValue;
        arrayBinding.abstractConflicted = true;
      }
    }
    recordMutation(arrayName);
  };

  const validateMember = (node: AstNode, parent?: AstNode): void => {
    const property = childNode(node.property);
    const propertyName = node.computed === true ? staticString(property)?.value : identifierName(property);
    if (propertyName !== undefined && reservedKeys.has(propertyName)) fail("CUSTOM_SCRIPT_FORBIDDEN", `reserved member path: ${propertyName}`);
    const objectName = identifierName(childNode(node.object));
    const isDirectCall = parent?.type === "CallExpression" && parent.callee === node;
    if (objectName !== undefined && (semanticNamespaces.has(objectName) || objectName === "Math" || objectName === "Date")) {
      if (!isDirectCall || node.computed === true) fail("CUSTOM_SCRIPT_FORBIDDEN", `API members are direct static calls only: ${objectName}`);
      return;
    }
    if (!isDirectCall && propertyName !== undefined && (arrayMethods.has(propertyName) || stringMethods.has(propertyName))) {
      fail("CUSTOM_SCRIPT_FORBIDDEN", `method aliases are forbidden: ${propertyName}`);
    }
    if (node.computed === true) {
      if (propertyName !== undefined) return;
      if (safeArrayIndex(property, bindings) && expressionKind(childNode(node.object)) === "array") return;
      fail("CUSTOM_SCRIPT_FORBIDDEN", "computed property requires a literal field or bounded array index");
    }
    if (isDirectCall) return;
    if (propertyName === "length" && ["array", "string"].includes(expressionKind(childNode(node.object)))) return;
    if (expressionKind(childNode(node.object)) === "record") return;
    fail("CUSTOM_SCRIPT_FORBIDDEN", `unknown member access: ${propertyName ?? "computed"}`);
  };

  const validateUpdate = (node: AstNode): void => {
    const name = identifierName(childNode(node.argument));
    const argument = childNode(node.argument);
    if ((node.operator !== "++" && node.operator !== "--") || name === undefined || argument === undefined || !requireBinding(name, argument).mutable) {
      fail("CUSTOM_SCRIPT_FORBIDDEN", "update requires a local let variable");
    }
    if (!allowedLoopUpdates.has(node) && activeLoops.some((loop) => loop.counter === name)) fail("CUSTOM_SCRIPT_FORBIDDEN", `loop counter may only change in its update clause: ${name}`);
    recordMutation(name);
  };

  const validateFor = (node: AstNode): string => {
    const init = childNode(node.init);
    const test = childNode(node.test);
    const update = childNode(node.update);
    if (init?.type !== "VariableDeclaration" || init.kind !== "let" || nodeArray(init.declarations).length !== 1 || test === undefined || update === undefined) {
      fail("CUSTOM_SCRIPT_FORBIDDEN", "for requires an exact bounded loop");
    }
    const declaration = nodeArray(init.declarations)[0]!;
    const counter = identifierName(childNode(declaration.id));
    if (counter === undefined || literalValue(childNode(declaration.init)) !== 0 || !hasLiteralUpperBound(test, counter)) fail("CUSTOM_SCRIPT_FORBIDDEN", "for requires a literal bounded loop");
    const updateTarget = update.type === "UpdateExpression" ? identifierName(childNode(update.argument))
      : update.type === "AssignmentExpression" ? identifierName(childNode(update.left)) : undefined;
    const validUpdate = updateTarget === counter && ((update.type === "UpdateExpression" && update.operator === "++")
      || (update.type === "AssignmentExpression" && update.operator === "+=" && literalValue(childNode(update.right)) === 1));
    if (!validUpdate) fail("CUSTOM_SCRIPT_FORBIDDEN", "for requires a monotonic unit update");
    allowedLoopUpdates.add(update);
    return counter;
  };

  visit(ast(program));

  const functionNodes = [...functionCalls.keys()].sort((left, right) => left.localeCompare(right, "en-US"));
  const indegrees = new Map(functionNodes.map((name) => [name, 0]));
  for (const callees of functionCalls.values()) {
    for (const callee of callees) {
      chargeAnalysis();
      indegrees.set(callee, (indegrees.get(callee) ?? 0) + 1);
    }
  }
  const ready = functionNodes.filter((name) => indegrees.get(name) === 0);
  const topologicalOrder: string[] = [];
  while (ready.length > 0) {
    const name = ready.shift()!;
    topologicalOrder.push(name);
    for (const callee of [...(functionCalls.get(name) ?? [])].sort((left, right) => left.localeCompare(right, "en-US"))) {
      chargeAnalysis();
      const next = (indegrees.get(callee) ?? 0) - 1;
      indegrees.set(callee, next);
      if (next === 0) {
        ready.push(callee);
        ready.sort((left, right) => left.localeCompare(right, "en-US"));
      }
    }
  }
  if (topologicalOrder.length !== functionNodes.length) fail("CUSTOM_SCRIPT_FORBIDDEN", "function recursion is forbidden");

  for (const caller of [...topologicalOrder].reverse()) {
    const mutations = functionMutations.get(caller) ?? new Set<string>();
    functionMutations.set(caller, mutations);
    const captures = functionCaptures.get(caller) ?? new Set<string>();
    functionCaptures.set(caller, captures);
    for (const callee of functionCalls.get(caller) ?? []) {
      for (const mutation of functionMutations.get(callee) ?? []) {
        chargeAnalysis();
        mutations.add(mutation);
      }
      for (const capture of functionCaptures.get(callee) ?? []) {
        chargeAnalysis();
        captures.add(capture);
      }
    }
  }
  for (const callSite of loopCallSites) {
    const effects = functionMutations.get(callSite.callee) ?? new Set<string>();
    for (const loop of callSite.loops) {
      if ((loop.counter !== undefined && effects.has(loop.counter))
        || (loop.iteratedRoots !== undefined && [...effects].some((mutation) => mayAlias(mutation, loop.iteratedRoots!)))) {
        fail("CUSTOM_SCRIPT_FORBIDDEN", `called function mutates an active loop dependency: ${callSite.callee}`);
      }
    }
  }
  for (const callSite of functionCallSites) {
    if (callSite.repeated && (functionMutations.get(callSite.callee)?.size ?? 0) > 0) {
      fail("CUSTOM_SCRIPT_FORBIDDEN", `repeated callback cannot call a mutating function: ${callSite.callee}`);
    }
  }
  for (const callSite of programCallSites) {
    for (const capture of functionCaptures.get(callSite.callee) ?? []) {
      const binding = bindings.get(capture);
      if (binding !== undefined && binding.declaredAt > callSite.start) fail("CUSTOM_SCRIPT_FORBIDDEN", `use before declaration through ${callSite.callee}: ${capture}`);
    }
  }

  for (const callSite of functionCallSites) {
    for (const capture of functionCaptures.get(callSite.callee) ?? []) {
      const binding = bindings.get(capture);
      if (binding !== undefined && binding.functionOwner === callSite.caller && binding.initializedAt > callSite.start) {
        fail("CUSTOM_SCRIPT_FORBIDDEN", `use before declaration through ${callSite.callee}: ${capture}`);
      }
    }
  }

  const reachableFunctions = new Set<string>();
  const reachableQueue = ["<program>"];
  while (reachableQueue.length > 0) {
    const name = reachableQueue.shift()!;
    if (reachableFunctions.has(name)) continue;
    reachableFunctions.add(name);
    for (const callee of functionCalls.get(name) ?? []) {
      chargeAnalysis();
      reachableQueue.push(callee);
    }
  }
  for (const name of functionNames) {
    if (!reachableFunctions.has(name)) fail("CUSTOM_SCRIPT_FORBIDDEN", `unused function is forbidden: ${name}`);
  }
  for (const name of semanticEffects.keys()) {
    if (name.startsWith("<callback:") && !reachableFunctions.has(name)) fail("CUSTOM_SCRIPT_FORBIDDEN", `unused callback is forbidden: ${name}`);
  }

  const callSitesByCaller = new Map<string, FunctionCallSite[]>();
  for (const callSite of functionCallSites) {
    const sites = callSitesByCaller.get(callSite.caller) ?? [];
    sites.push(callSite);
    callSitesByCaller.set(callSite.caller, sites);
  }
  const branchHasVisibleCounterpart = (owner: string, effect: SemanticEffect): boolean => {
    const segment = effect.conditionalPath.at(-1);
    if (segment === undefined) return true;
    const separator = segment.lastIndexOf(":");
    const branchId = segment.slice(0, separator);
    const side = segment.slice(separator + 1);
    const counterpart = `${branchId}:${side === "then" ? "else" : "then"}`;
    const prefix = effect.conditionalPath.slice(0, -1);
    return (semanticEffects.get(owner) ?? []).some((candidate) => {
      if (candidate === effect || candidate.conditionalPath.at(-1) !== counterpart) return false;
      const candidatePrefix = candidate.conditionalPath.slice(0, -1);
      if (candidatePrefix.length !== prefix.length || candidatePrefix.some((value, index) => value !== prefix[index])) return false;
      return candidate.outputId !== undefined || candidate.api.startsWith("$feedback.")
        || candidate.api.startsWith("$page.") || candidate.api.startsWith("$overlay.");
    });
  };
  type SaturatedCount = 0 | 1 | "many";
  const addCounts = (left: SaturatedCount, right: SaturatedCount): SaturatedCount => left === "many" || right === "many" || left + right > 1
    ? "many" : left + right as SaturatedCount;
  const multiplyCounts = (left: SaturatedCount, right: SaturatedCount): SaturatedCount => left === 0 || right === 0 ? 0
    : left === "many" || right === "many" ? "many" : 1;
  interface LocalInvocation {
    readonly count: SaturatedCount;
    readonly guaranteed: boolean;
  }
  const localInvocations = new Map<string, Map<string, LocalInvocation>>();
  for (const [caller, sites] of callSitesByCaller) {
    const byCallee = new Map<string, FunctionCallSite[]>();
    for (const site of sites) {
      chargeAnalysis();
      const matches = byCallee.get(site.callee) ?? [];
      matches.push(site);
      byCallee.set(site.callee, matches);
    }
    const summaries = new Map<string, LocalInvocation>();
    for (const [callee, matches] of byCallee) {
      const repeated = matches.some((site) => site.repeated);
      const unconditional = matches.filter((site) => !site.conditional);
      const conditional = matches.filter((site) => site.conditional);
      let conditionalCount: SaturatedCount = conditional.length === 0 ? 0 : conditional.length === 1 ? 1 : "many";
      let conditionalGuaranteed = false;
      if (conditional.length > 0 && conditional.every((site) => site.conditionalPath.length === 1)) {
        const segments = conditional.map((site) => site.conditionalPath[0]!);
        const branchIds = new Set(segments.map((segment) => segment.slice(0, segment.lastIndexOf(":"))));
        const thenCount = segments.filter((segment) => segment.endsWith(":then")).length;
        const elseCount = segments.filter((segment) => segment.endsWith(":else")).length;
        if (branchIds.size === 1 && thenCount > 0 && elseCount > 0) {
          conditionalCount = Math.max(thenCount, elseCount) > 1 ? "many" : 1;
          conditionalGuaranteed = conditionalCount === 1;
        }
      }
      const directCount: SaturatedCount = unconditional.length === 0 ? 0 : unconditional.length === 1 ? 1 : "many";
      const count = repeated ? "many" : addCounts(directCount, conditionalCount);
      summaries.set(callee, Object.freeze({
        count,
        guaranteed: count === 1 && (unconditional.length === 1 || conditionalGuaranteed),
      }));
    }
    localInvocations.set(caller, summaries);
  }

  const functionExecutionCounts = new Map<string, SaturatedCount>([["<program>", 1]]);
  const functionExecutionGuaranteed = new Map<string, boolean>([["<program>", true]]);
  for (const caller of topologicalOrder) {
    const callerCount = functionExecutionCounts.get(caller) ?? 0;
    if (callerCount === 0) continue;
    for (const [callee, local] of localInvocations.get(caller) ?? []) {
      chargeAnalysis();
      const contribution = multiplyCounts(callerCount, local.count);
      const previous = functionExecutionCounts.get(callee) ?? 0;
      functionExecutionCounts.set(callee, addCounts(previous, contribution));
      const contributionGuaranteed = functionExecutionGuaranteed.get(caller) === true && local.guaranteed;
      functionExecutionGuaranteed.set(callee, previous === 0 && contribution === 1 && contributionGuaranteed);
    }
  }
  for (const name of reachableFunctions) {
    if ((functionExecutionCounts.get(name) ?? 0) !== "many") continue;
    const pureRepeatedCallback = name.startsWith("<callback:")
      && (semanticEffects.get(name)?.length ?? 0) === 0
      && (functionCalls.get(name)?.size ?? 0) === 0
      && (functionMutations.get(name)?.size ?? 0) === 0;
    if (!pureRepeatedCallback) fail("CUSTOM_SCRIPT_FORBIDDEN", `function execution count is not statically single: ${name}`);
  }
  const pushesByRoot = new Map<string, number>();
  for (const site of pushSites) {
    const count = functionExecutionCounts.get(site.owner) ?? 0;
    if (count !== 1) fail("CUSTOM_SCRIPT_FORBIDDEN", `push owner execution count is not statically one: ${site.owner}`);
    for (const root of site.roots) pushesByRoot.set(root, (pushesByRoot.get(root) ?? 0) + 1);
  }
  for (const [root, pushes] of pushesByRoot) {
    let initialMax: number | undefined;
    for (const binding of bindings.values()) {
      if (binding.capacityRoots?.has(root) !== true || binding.maxArrayLength === undefined) continue;
      initialMax = Math.max(initialMax ?? 0, binding.maxArrayLength);
    }
    if (initialMax === undefined || initialMax + pushes > 1_000) fail("CUSTOM_SCRIPT_FORBIDDEN", `push capacity exceeds 1000 for ${root}`);
  }
  const outputWriteEffects = new Map<string, SemanticEffect[]>();
  const orderedEffects = [...semanticEffects.entries()]
    .filter(([name]) => reachableFunctions.has(name))
    .flatMap(([owner, effects]) => effects.map((effect) => ({ owner, effect })))
    .sort((left, right) => left.effect.start - right.effect.start || left.owner.localeCompare(right.owner, "en-US"));
  for (const { owner, effect } of orderedEffects) {
    chargeAnalysis();
    const executionCount = functionExecutionCounts.get(owner) ?? 0;
    const conditional = functionExecutionGuaranteed.get(owner) !== true || effect.conditional;
    const repeated = executionCount === "many" || effect.repeated;
    const externalEffect = readApis[effect.api] === undefined && effect.api !== "$event.record";
    const conditionalOutputClosed = !conditional
      || (effect.conditional && effect.outputId !== undefined && branchHasVisibleCounterpart(owner, effect));
    if (externalEffect && (repeated || (effect.outputId !== undefined && !conditionalOutputClosed))) {
      fail("CUSTOM_SCRIPT_FORBIDDEN", `external side effect requires one unconditional execution: ${effect.api}`);
    }
    calls.push(conditional && effect.call.execution === undefined
      ? Object.freeze({ ...effect.call, execution: "conditional" as const })
      : effect.call);
    if (effect.inputId !== undefined) inputReads.add(effect.inputId);
    if (effect.outputId !== undefined) {
      const writes = outputWriteEffects.get(effect.outputId) ?? [];
      writes.push(effect);
      outputWriteEffects.set(effect.outputId, writes);
    }
    if (effect.scheduledScriptId !== undefined) scheduled.add(effect.scheduledScriptId);
  }
  for (const [outputId, effects] of outputWriteEffects) {
    let count = effects.length;
    if (effects.length > 1 && effects.every((effect) => effect.conditionalPath.length === 1)) {
      const segments = effects.map((effect) => effect.conditionalPath[0]!);
      const branchIds = new Set(segments.map((segment) => segment.slice(0, segment.lastIndexOf(":"))));
      const thenCount = segments.filter((segment) => segment.endsWith(":then")).length;
      const elseCount = segments.filter((segment) => segment.endsWith(":else")).length;
      if (branchIds.size === 1 && thenCount > 0 && elseCount > 0) count = Math.max(thenCount, elseCount);
    }
    outputWrites.set(outputId, count);
  }

  for (const port of snapshot.inputs) if (!inputReads.has(port.refId)) fail("CUSTOM_SCRIPT_INPUT_NOT_READ", port.refId);
  for (const port of snapshot.outputs) {
    const count = outputWrites.get(port.refId) ?? 0;
    if (count === 0) fail("CUSTOM_SCRIPT_OUTPUT_NOT_WRITTEN", port.refId);
    if (count > 1) fail("CUSTOM_SCRIPT_OUTPUT_WRITTEN_MULTIPLE_TIMES", port.refId);
  }
  const functionSnapshot = Object.fromEntries([...functionCalls.entries()].sort(([left], [right]) => left.localeCompare(right, "en-US"))
    .map(([name, dependencies]) => [name, Object.freeze([...dependencies].sort())]));
  const result = deepFreeze({
    schema: "kf-validated-script-ast/v1" as const,
    sourceHash: createHash("sha256").update(snapshot.source, "utf8").digest("hex"),
    calls: [...calls],
    inputReads: [...inputReads].sort(),
    outputWrites: [...outputWrites.keys()].sort(),
    scheduledScriptIds: [...scheduled].sort(),
    staticFunctionCalls: functionSnapshot,
  });
  deepFreeze(program);
  validatedPrograms.set(result, {
    program,
    ...(snapshot.context === undefined ? {} : { context: snapshot.context }),
    ...(snapshot.currentScriptIdentity === undefined ? {} : { validationIdentity: snapshot.currentScriptIdentity }),
    ...(authoritativeScript === undefined ? {} : { authoritativeScript }),
  });
  return result;
}

export function getValidatedScriptProgram(validated: ValidatedScriptAst): Program {
  const metadata = validatedPrograms.get(validated);
  if (metadata === undefined) return fail("CUSTOM_SCRIPT_UNTRUSTED_AST", "validated AST identity is not compiler-owned");
  return metadata.program;
}

export function requireValidatedScriptProgram(
  validated: ValidatedScriptAst,
  expected: {
    readonly context: SemanticScriptApiContext;
    readonly validationIdentity: SemanticScriptValidationIdentity;
    readonly authoritativeScript: ReturnType<typeof requireSemanticScriptValidationIdentity>;
  },
): Program {
  const metadata = validatedPrograms.get(validated);
  if (metadata === undefined
    || metadata.context !== expected.context
    || metadata.validationIdentity !== expected.validationIdentity
    || metadata.authoritativeScript !== expected.authoritativeScript) {
    return fail("CUSTOM_SCRIPT_UNTRUSTED_AST", "validated AST is not bound to the exact context, identity, script, source, and ports");
  }
  return metadata.program;
}

function staticJson(node: AstNode): { known: boolean; value?: null | string | number | boolean | readonly unknown[] | Readonly<Record<string, unknown>> } {
  const primitive = staticPrimitive(node);
  if (primitive !== undefined || (node.type === "Literal" && node.value === null)) return { known: true, value: primitive ?? null };
  if (node.type === "ArrayExpression") {
    const values = nodeArray(node.elements).map(staticJson);
    return values.every((value) => value.known) ? { known: true, value: values.map((value) => value.value) } : { known: false };
  }
  if (node.type === "ObjectExpression") {
    const result: Record<string, unknown> = {};
    for (const property of nodeArray(node.properties)) {
      if (property.type !== "Property" || property.computed === true || property.kind !== "init") return { known: false };
      const key = identifierName(childNode(property.key)) ?? staticString(childNode(property.key))?.value;
      const value = childNode(property.value);
      if (key === undefined || value === undefined) return { known: false };
      const parsed = staticJson(value);
      if (!parsed.known) return { known: false };
      Object.defineProperty(result, key, { value: parsed.value, enumerable: true, configurable: false, writable: false });
    }
    return { known: true, value: result };
  }
  return { known: false };
}

function hasLiteralUpperBound(node: AstNode, counter: string): boolean {
  if (node.type === "LogicalExpression" && node.operator === "&&") {
    return hasLiteralUpperBound(ast(node.left), counter) || hasLiteralUpperBound(ast(node.right), counter);
  }
  if (node.type !== "BinaryExpression" || (node.operator !== "<" && node.operator !== "<=")) return false;
  if (identifierName(childNode(node.left)) !== counter) return false;
  const bound = literalValue(childNode(node.right));
  return typeof bound === "number" && Number.isInteger(bound) && bound >= 0
    && (node.operator === "<" ? bound <= 1000 : bound < 1000);
}

function semanticApiArity(api: string): readonly [number, number] {
  const exact: Readonly<Record<string, number>> = {
    "$control.getValue": 1, "$control.setValue": 2, "$control.setData": 2, "$event.record": 0,
    "$control.setVisible": 2, "$control.setEnabled": 2, "$page.navigate": 1, "$overlay.open": 1,
    "$state.get": 1, "$state.set": 2, "$data.get": 1, "$data.set": 2, "$feedback.show": 2,
    "$timer.after": 2, "$timer.repeat": 3,
  };
  if (api === "$overlay.close") return [1, 2];
  const count = exact[api];
  return count === undefined ? fail("CUSTOM_SCRIPT_FORBIDDEN", `unknown semantic API arity: ${api}`) : [count, count];
}

function isIdentifierReference(node: AstNode, parent?: AstNode): boolean {
  if (parent === undefined) return true;
  if ((parent.type === "VariableDeclarator" && parent.id === node)
    || (parent.type === "FunctionDeclaration" && (parent.id === node || nodeArray(parent.params).includes(node)))
    || (parent.type === "ArrowFunctionExpression" && nodeArray(parent.params).includes(node))
    || (parent.type === "MemberExpression" && parent.property === node && parent.computed !== true)
    || (parent.type === "Property" && parent.key === node && parent.computed !== true && parent.shorthand !== true)) return false;
  return true;
}

function safeArrayIndex(node: AstNode | undefined, declared: ReadonlyMap<string, { readonly mutable: boolean }>): boolean {
  const literal = literalValue(node);
  if (typeof literal === "number" && Number.isInteger(literal) && literal >= 0 && literal < 1000) return true;
  const name = identifierName(node);
  return name !== undefined && declared.get(name)?.mutable === true;
}

function children(node: AstNode): readonly AstNode[] {
  const result: AstNode[] = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "start" || key === "end" || key === "loc" || key === "range") continue;
    const direct = childNode(value);
    if (direct !== undefined) result.push(direct);
    else if (Array.isArray(value)) value.forEach((entry) => {
      const child = childNode(entry);
      if (child !== undefined) result.push(child);
    });
  }
  return result;
}
