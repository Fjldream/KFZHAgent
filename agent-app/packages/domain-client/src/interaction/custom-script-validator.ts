import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";
import { parse, type Node, type Program } from "acorn";
import { walk, type Node as WalkerNode } from "estree-walker";
import type { SemanticScriptApiContext } from "./semantic-script-api.js";
import { resolveSemanticApiCall } from "./semantic-script-api.js";

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
}

export interface ValidatedSemanticCall {
  readonly api: string;
  readonly namespace: string;
  readonly method: string;
  readonly targetId?: string;
  readonly availability: "supported" | "planned" | "unresolved";
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
  readonly mutable: boolean;
  readonly functionOwner: string;
  readonly hoisted: boolean;
  readonly functionName?: string;
  kind: ValueKind;
  boundedArray: boolean;
  aliasRoot?: string;
  abstractValue?: { readonly known: true; readonly value: unknown };
  abstractConflicted?: boolean;
}

interface ActiveLoop {
  readonly counter?: string;
  readonly iteratedRoot?: string;
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
}

const validatedPrograms = new WeakMap<ValidatedScriptAst, Program>();
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
  const allowed = new Set(["source", "scriptId", "inputs", "outputs", "context"]);
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
  const loopCallSites: Array<{ readonly callee: string; readonly loops: readonly ActiveLoop[] }> = [];
  const programCallSites: Array<{ readonly callee: string; readonly start: number }> = [];
  const activeLoops: ActiveLoop[] = [];
  const allowedLoopUpdates = new WeakSet<object>();
  let currentFunction = "<program>";
  let nextScopeId = 1;
  functionCalls.set(currentFunction, new Set());
  functionMutations.set(currentFunction, new Set());
  functionCaptures.set(currentFunction, new Set());

  const newScope = (parent?: LexicalScope, functionOwner = parent?.functionOwner ?? "<program>"): LexicalScope => Object.freeze({
    id: nextScopeId++, functionOwner, ...(parent === undefined ? {} : { parent }),
  });
  const declareBinding = (name: string | undefined, declaration: AstNode, scope: LexicalScope, mutable: boolean, functionName?: string, hoisted = false): void => {
    if (name === undefined || semanticNamespaces.has(name) || forbiddenIdentifiers.has(name)) fail("CUSTOM_SCRIPT_FORBIDDEN", "bindings require unique safe identifiers");
    if (bindings.has(name)) fail("CUSTOM_SCRIPT_FORBIDDEN", `binding shadowing is forbidden: ${name}`);
    const binding: LexicalBinding = {
      name, scope, declaredAt: declaration.start, mutable: functionName === undefined && mutable,
      functionOwner: scope.functionOwner, hoisted,
      kind: "unknown", boundedArray: false, ...(functionName === undefined ? {} : { functionName }),
    };
    bindings.set(name, binding);
    if (functionName !== undefined) {
      functionNames.add(functionName);
      functionCalls.set(functionName, new Set());
      functionMutations.set(functionName, new Set());
      functionCaptures.set(functionName, new Set());
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
          declareBinding(name, childNode(declaration.id) ?? declaration, scope, statement.kind === "let", functionName);
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
    if (!binding.hoisted && node.start < binding.declaredAt) {
      if (currentFunction === "<program>" || binding.functionOwner === currentFunction) fail("CUSTOM_SCRIPT_FORBIDDEN", `use before declaration: ${name}`);
      functionCaptures.get(currentFunction)?.add(name);
    }
    return binding;
  };
  const bindingRoot = (name: string): string => bindings.get(name)?.aliasRoot ?? name;
  const recordMutation = (name: string): void => {
    functionMutations.get(currentFunction)?.add(bindingRoot(name));
  };
  const mergeAbstractValue = (binding: LexicalBinding, value: { known: boolean; value?: unknown }): void => {
    if (!value.known || binding.abstractConflicted === true) {
      delete binding.abstractValue;
      binding.abstractConflicted = true;
      return;
    }
    if (binding.abstractValue === undefined) {
      binding.abstractValue = { known: true, value: value.value };
      return;
    }
    if (abstractValueType(binding.abstractValue.value) !== abstractValueType(value.value)) {
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
    if (node?.type === "ArrayExpression") return true;
    if (node?.type === "Identifier") return bindings.get(identifierName(node) ?? "")?.boundedArray === true;
    if (node?.type !== "CallExpression") return false;
    const member = memberParts(childNode(node.callee));
    if (member?.property !== "slice") return false;
    const args = nodeArray(node.arguments);
    return args.length === 2 && literalValue(args[0]) === 0 && typeof literalValue(args[1]) === "number"
      && (literalValue(args[1]) as number) >= 0 && (literalValue(args[1]) as number) <= 1000;
  };

  const abstractJson = (node: AstNode): { known: boolean; value?: unknown } => {
    const concrete = staticJson(node);
    if (concrete.known) return concrete;
    if (node.type === "Identifier") return bindings.get(identifierName(node) ?? "")?.abstractValue ?? { known: false };
    if (node.type === "BinaryExpression") {
      if (["===", "!==", "<", "<=", ">", ">="].includes(String(node.operator))) return { known: true, value: false };
      const kind = expressionKind(node);
      if (kind === "string") return { known: true, value: "" };
      if (kind === "scalar") return { known: true, value: 0 };
    }
    if (node.type === "LogicalExpression") return { known: true, value: false };
    if (node.type === "CallExpression") {
      const callee = childNode(node.callee);
      const direct = identifierName(callee);
      if (direct === "String") return { known: true, value: "" };
      if (direct === "Number") return { known: true, value: 0 };
      if (direct === "Boolean") return { known: true, value: false };
      const member = memberParts(callee);
      const objectName = member === undefined ? undefined : identifierName(member.object);
      const api = member === undefined || objectName === undefined ? undefined : `${objectName}.${member.property}`;
      if (api === "$data.get" || member?.property === "slice" || member?.property === "filter") return { known: true, value: [] };
    }
    if (expressionKind(node) === "array") return { known: true, value: [] };
    return { known: false };
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
      const value = binding?.abstractValue?.value;
      if (binding === undefined || binding.abstractConflicted === true
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
    if (refKind !== undefined) {
      const refId = target!.value;
      const port = inputs.get(refId);
      if (port === undefined || (port.refKind !== refKind && port.refKind !== "unknown")) fail("CUSTOM_SCRIPT_UNDECLARED_INPUT", refId);
      inputReads.add(refId);
    }
    const writeKind = writeApis[api];
    if (writeKind !== undefined) {
      const refId = target!.value;
      const port = outputs.get(refId);
      if (port === undefined || (port.refKind !== writeKind && port.refKind !== "unknown")) fail("CUSTOM_SCRIPT_UNDECLARED_OUTPUT", refId);
      outputWrites.set(refId, (outputWrites.get(refId) ?? 0) + 1);
    }
    if (api === "$timer.after" || api === "$timer.repeat") {
      const scriptArg = args[api === "$timer.after" ? 1 : 2];
      const scriptId = foldStringExpression(scriptArg)?.value;
      if (scriptId === undefined) fail("CUSTOM_SCRIPT_FORBIDDEN", `${api} requires a static script ID`);
      if (snapshot.scriptId === undefined) fail("CUSTOM_SCRIPT_INPUT_INVALID", "scriptId is required for timer calls");
      if (scriptId === snapshot.scriptId) fail("CUSTOM_SCRIPT_SELF_SCHEDULE", scriptId);
      if (snapshot.context === undefined) fail("CUSTOM_SCRIPT_UNDECLARED_INPUT", scriptId);
      const delay = literalValue(args[0]);
      if (typeof delay !== "number" || !Number.isInteger(delay) || delay < 100 || delay > 60_000) fail("CUSTOM_SCRIPT_FORBIDDEN", `${api} delay must be 100..60000ms`);
      if (api === "$timer.repeat") {
        const repetitions = literalValue(args[1]);
        if (typeof repetitions !== "number" || !Number.isInteger(repetitions) || repetitions < 1 || repetitions > 10) fail("CUSTOM_SCRIPT_FORBIDDEN", "$timer.repeat count must be 1..10");
      }
      scheduled.add(scriptId);
    }
    let availability: ValidatedSemanticCall["availability"] = "unresolved";
    if (snapshot.context !== undefined) {
      const resolvedArgs = args.map(abstractJson);
      if (!resolvedArgs.every((value) => value.known)) fail("CUSTOM_SCRIPT_FORBIDDEN", `${api} dynamic argument type cannot be proven in trusted context`);
      const resolution = resolveSemanticApiCall({ api, args: resolvedArgs.map((value) => value.value) }, snapshot.context);
      availability = resolution.availability;
    }
    calls.push(Object.freeze({ api, namespace, method, ...(target === undefined ? {} : { targetId: target.value }), availability }));
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
        if (init?.type === "Identifier") binding.aliasRoot = bindingRoot(identifierName(init)!);
        if (init !== undefined) {
          const abstract = abstractJson(init);
          mergeAbstractValue(binding, abstract);
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
      const iteratedName = identifierName(right);
      activeLoops.push({ ...(iteratedName === undefined ? {} : { iteratedRoot: bindingRoot(iteratedName) }) });
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
        functionCalls.get(currentFunction)!.add(callbackName);
        if (currentFunction === "<program>") programCallSites.push({ callee: callbackName, start: node.start });
      }
      if (member.property === "push") {
        if (nodeArray(node.arguments).length !== 1) fail("CUSTOM_SCRIPT_FORBIDDEN", "push requires one value");
        const receiver = identifierName(member.object);
        if (receiver !== undefined && activeLoops.some((loop) => loop.iteratedRoot === bindingRoot(receiver))) {
          fail("CUSTOM_SCRIPT_FORBIDDEN", `cannot mutate an iterated array: ${receiver}`);
        }
        if (receiver !== undefined) recordMutation(receiver);
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
      if (activeLoops.some((loop) => loop.iteratedRoot === bindingRoot(name))) fail("CUSTOM_SCRIPT_FORBIDDEN", `cannot rebind an iterated array or alias: ${name}`);
      const right = childNode(node.right);
      if (right !== undefined) {
        mergeAbstractValue(binding, abstractJson(right));
      }
      recordMutation(name);
      return;
    }
    if (left?.type !== "MemberExpression" || left.computed !== true) fail("CUSTOM_SCRIPT_FORBIDDEN", "property assignment is forbidden");
    const arrayName = identifierName(childNode(left.object));
    if (arrayName === undefined || bindings.get(arrayName)?.boundedArray !== true) fail("CUSTOM_SCRIPT_FORBIDDEN", "only bounded local array elements may be assigned");
    if (activeLoops.some((loop) => loop.iteratedRoot === bindingRoot(arrayName))) fail("CUSTOM_SCRIPT_FORBIDDEN", `cannot assign an iterated array element: ${arrayName}`);
    if (!safeArrayIndex(childNode(left.property), bindings)) fail("CUSTOM_SCRIPT_FORBIDDEN", "array assignment requires a bounded local index");
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

  const recursionState = new Map<string, "visiting" | "done">();
  const detectRecursion = (name: string): void => {
    if (recursionState.get(name) === "visiting") fail("CUSTOM_SCRIPT_FORBIDDEN", `function recursion is forbidden: ${name}`);
    if (recursionState.get(name) === "done") return;
    recursionState.set(name, "visiting");
    functionCalls.get(name)?.forEach(detectRecursion);
    recursionState.set(name, "done");
  };
  functionCalls.forEach((_calls, name) => detectRecursion(name));

  let effectsChanged = true;
  for (let iteration = 0; effectsChanged && iteration <= functionCalls.size; iteration += 1) {
    effectsChanged = false;
    for (const [caller, callees] of functionCalls) {
      const effects = functionMutations.get(caller) ?? new Set<string>();
      functionMutations.set(caller, effects);
      for (const callee of callees) {
        for (const mutation of functionMutations.get(callee) ?? []) {
          if (!effects.has(mutation)) {
            effects.add(mutation);
            effectsChanged = true;
          }
        }
      }
    }
  }
  for (const callSite of loopCallSites) {
    const effects = functionMutations.get(callSite.callee) ?? new Set<string>();
    for (const loop of callSite.loops) {
      if ((loop.counter !== undefined && effects.has(loop.counter))
        || (loop.iteratedRoot !== undefined && effects.has(loop.iteratedRoot))) {
        fail("CUSTOM_SCRIPT_FORBIDDEN", `called function mutates an active loop dependency: ${callSite.callee}`);
      }
    }
  }
  let capturesChanged = true;
  for (let iteration = 0; capturesChanged && iteration <= functionCalls.size; iteration += 1) {
    capturesChanged = false;
    for (const [caller, callees] of functionCalls) {
      const captures = functionCaptures.get(caller) ?? new Set<string>();
      functionCaptures.set(caller, captures);
      for (const callee of callees) {
        for (const capture of functionCaptures.get(callee) ?? []) {
          if (!captures.has(capture)) {
            captures.add(capture);
            capturesChanged = true;
          }
        }
      }
    }
  }
  for (const callSite of programCallSites) {
    for (const capture of functionCaptures.get(callSite.callee) ?? []) {
      const binding = bindings.get(capture);
      if (binding !== undefined && binding.declaredAt > callSite.start) fail("CUSTOM_SCRIPT_FORBIDDEN", `use before declaration through ${callSite.callee}: ${capture}`);
    }
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
  validatedPrograms.set(result, program);
  return result;
}

export function getValidatedScriptProgram(validated: ValidatedScriptAst): Program {
  const program = validatedPrograms.get(validated);
  if (program === undefined) return fail("CUSTOM_SCRIPT_UNTRUSTED_AST", "validated AST identity is not compiler-owned");
  return program;
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

function abstractValueType(value: unknown): "array" | "boolean" | "null" | "number" | "object" | "string" | "unknown" {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (typeof value === "string") return "string";
  if (typeof value === "object") return "object";
  return "unknown";
}

function hasLiteralUpperBound(node: AstNode, counter: string): boolean {
  if (node.type === "LogicalExpression" && node.operator === "&&") {
    return hasLiteralUpperBound(ast(node.left), counter) || hasLiteralUpperBound(ast(node.right), counter);
  }
  if (node.type !== "BinaryExpression" || (node.operator !== "<" && node.operator !== "<=")) return false;
  if (identifierName(childNode(node.left)) !== counter) return false;
  const bound = literalValue(childNode(node.right));
  return typeof bound === "number" && Number.isInteger(bound) && bound >= 0 && bound <= 1000;
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
  if (typeof literal === "number" && Number.isInteger(literal) && literal >= 0 && literal <= 1000) return true;
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
