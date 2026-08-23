import { createHash } from "node:crypto";
import { types as utilTypes } from "node:util";
import type { Node, Program } from "acorn";
import {
  CompiledEventBindingSchema,
  CompiledScriptModuleSchema,
  ScriptPlanSchema,
  type CompiledEventBinding,
  type CompiledScriptModule,
  type ScriptPlan,
} from "@kf/contracts";
import { requireScriptCapabilityProfile } from "../design-knowledge/script-capability-registry.js";
import {
  getValidatedScriptProgram,
  requireValidatedScriptProgram,
  validateCustomScript,
  type ValidatedScriptAst,
} from "./custom-script-validator.js";
import { renderScriptTemplate } from "./script-template-registry.js";
import {
  assertSemanticScriptActiveEvent,
  requireSemanticScriptValidationIdentity,
  requireSemanticScriptPlan,
  resolveEventBinding,
  resolveSemanticApiCall,
  resolveSemanticScriptOwner,
  type SemanticScriptApiContext,
  type SemanticScriptValidationIdentity,
} from "./semantic-script-api.js";

type AstNode = Node & Record<string, unknown>;

export type ScriptCompilerErrorCode =
  | "SCRIPT_COMPILER_API_UNSUPPORTED"
  | "SCRIPT_COMPILER_BINDING_INVALID"
  | "SCRIPT_COMPILER_INPUT_INVALID"
  | "SCRIPT_COMPILER_OUTPUT_INVALID"
  | "SCRIPT_COMPILER_UNSUPPORTED_SYNTAX"
  | "SCRIPT_COMPILER_UNTRUSTED_AST";

export class ScriptCompilerError extends Error {
  constructor(readonly code: ScriptCompilerErrorCode, readonly nodeId: string, detail?: string, options?: ErrorOptions) {
    super(`${code}: ${nodeId}${detail === undefined ? "" : ` (${detail})`}`, options);
    this.name = "ScriptCompilerError";
  }
}

export interface CompileScriptPlanInput {
  readonly script: ScriptPlan;
  readonly context: SemanticScriptApiContext;
  readonly placement?: "event" | "configure-data";
  readonly binding?: { readonly controlId: string; readonly semanticEvent: string; readonly phase?: "event" | "after-event" };
  readonly validationIdentity?: SemanticScriptValidationIdentity;
  readonly validatedAst?: ValidatedScriptAst;
}

export interface CompiledScriptPlan {
  readonly module: CompiledScriptModule;
  readonly binding?: CompiledEventBinding;
  readonly scheduledScriptIds: readonly string[];
  readonly staticFunctionCalls: Readonly<Record<string, readonly string[]>>;
}

interface CompileInputSnapshot {
  readonly script: unknown;
  readonly context: SemanticScriptApiContext;
  readonly placement?: "event" | "configure-data";
  readonly binding?: CompileScriptPlanInput["binding"];
  readonly validationIdentity?: SemanticScriptValidationIdentity;
  readonly validatedAst?: ValidatedScriptAst;
}

const RESERVED_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function fail(code: ScriptCompilerErrorCode, nodeId: string, detail?: string, options?: ErrorOptions): never {
  throw new ScriptCompilerError(code, nodeId, detail, options);
}

function snapshotCompileInput(input: unknown): CompileInputSnapshot {
  if (input === null || typeof input !== "object" || utilTypes.isProxy(input)) return fail("SCRIPT_COMPILER_INPUT_INVALID", "input", "plain descriptor-safe object required");
  let prototype: object | null;
  let keys: readonly PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(input) as object | null;
    keys = Reflect.ownKeys(input);
    descriptors = Object.getOwnPropertyDescriptors(input);
  } catch (error) {
    return fail("SCRIPT_COMPILER_INPUT_INVALID", "input", "descriptor inspection failed", error instanceof Error ? { cause: error } : undefined);
  }
  const allowed = new Set(["script", "context", "placement", "binding", "validationIdentity", "validatedAst"]);
  if ((prototype !== Object.prototype && prototype !== null) || keys.some((key) => typeof key !== "string" || !allowed.has(key))) {
    return fail("SCRIPT_COMPILER_INPUT_INVALID", "input", "unknown field or prototype");
  }
  const read = (key: string, required = false): unknown => {
    const descriptor = descriptors[key];
    if (descriptor === undefined) {
      if (required) return fail("SCRIPT_COMPILER_INPUT_INVALID", key, "required data property");
      return undefined;
    }
    if (!("value" in descriptor) || !descriptor.enumerable) return fail("SCRIPT_COMPILER_INPUT_INVALID", key, "enumerable data property required");
    return descriptor.value;
  };
  const placement = read("placement");
  if (placement !== undefined && placement !== "event" && placement !== "configure-data") return fail("SCRIPT_COMPILER_INPUT_INVALID", "placement");
  const rawBinding = descriptors.binding === undefined ? undefined : clonePureData(read("binding"), "binding");
  let binding: CompileScriptPlanInput["binding"];
  if (rawBinding !== undefined) {
    if (rawBinding === null || typeof rawBinding !== "object" || Array.isArray(rawBinding)) return fail("SCRIPT_COMPILER_INPUT_INVALID", "binding", "plain binding required");
    const record = rawBinding as Record<string, unknown>;
    const bindingKeys = Object.keys(record).sort();
    const allowedBindingKeys = record.phase === undefined
      ? ["controlId", "semanticEvent"]
      : ["controlId", "phase", "semanticEvent"];
    if (bindingKeys.length !== allowedBindingKeys.length || bindingKeys.some((key, index) => key !== allowedBindingKeys[index])
      || typeof record.controlId !== "string" || typeof record.semanticEvent !== "string"
      || (record.phase !== undefined && record.phase !== "event" && record.phase !== "after-event")) {
      return fail("SCRIPT_COMPILER_INPUT_INVALID", "binding", "exact controlId, semanticEvent, and optional phase required");
    }
    binding = {
      controlId: record.controlId,
      semanticEvent: record.semanticEvent,
      ...(record.phase === undefined ? {} : { phase: record.phase }),
    };
  }
  return {
    script: read("script", true),
    context: read("context", true) as SemanticScriptApiContext,
    ...(placement === undefined ? {} : { placement }),
    ...(binding === undefined ? {} : { binding }),
    ...(descriptors.validationIdentity === undefined ? {} : { validationIdentity: read("validationIdentity") as SemanticScriptValidationIdentity }),
    ...(descriptors.validatedAst === undefined ? {} : { validatedAst: read("validatedAst") as ValidatedScriptAst }),
  };
}

function clonePureData(
  value: unknown,
  label: string,
  depth = 0,
  seen = new WeakSet<object>(),
  budget = { nodes: 0 },
): unknown {
  budget.nodes += 1;
  if (budget.nodes > 50_000) return fail("SCRIPT_COMPILER_INPUT_INVALID", label, "input exceeds 50000 nodes");
  if (depth > 64) return fail("SCRIPT_COMPILER_INPUT_INVALID", label, "input exceeds depth 64");
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return fail("SCRIPT_COMPILER_INPUT_INVALID", label, "numbers must be finite");
    return value;
  }
  if (typeof value !== "object" || utilTypes.isProxy(value)) return fail("SCRIPT_COMPILER_INPUT_INVALID", label, "descriptor-safe JSON data required");
  if (seen.has(value)) return fail("SCRIPT_COMPILER_INPUT_INVALID", label, "cyclic input");
  seen.add(value);
  let prototype: object | null;
  let keys: readonly PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch (error) {
    return fail("SCRIPT_COMPILER_INPUT_INVALID", label, "descriptor inspection failed", error instanceof Error ? { cause: error } : undefined);
  }
  if (keys.some((key) => typeof key !== "string" || RESERVED_KEYS.has(key))) return fail("SCRIPT_COMPILER_INPUT_INVALID", label, "unsafe property key");
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype || keys.filter((key) => key !== "length").length !== value.length) return fail("SCRIPT_COMPILER_INPUT_INVALID", label, "dense plain array required");
    const result = Array.from({ length: value.length }, (_, index) => {
      const descriptor = descriptors[String(index)];
      if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) return fail("SCRIPT_COMPILER_INPUT_INVALID", label, "array data property required");
      return clonePureData(descriptor.value, `${label}.${index}`, depth + 1, seen, budget);
    });
    seen.delete(value);
    return result;
  }
  if (prototype !== Object.prototype && prototype !== null) return fail("SCRIPT_COMPILER_INPUT_INVALID", label, "plain object required");
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[String(key)];
    if (descriptor === undefined || !("value" in descriptor) || !descriptor.enumerable) return fail("SCRIPT_COMPILER_INPUT_INVALID", label, "object data property required");
    Object.defineProperty(result, key, {
      value: clonePureData(descriptor.value, `${label}.${String(key)}`, depth + 1, seen, budget), enumerable: true,
    });
  }
  seen.delete(value);
  return result;
}

function compilerId(kind: "script" | "binding", semanticId: string, artifactIdentity: string): string {
  const prefix = `kf$${kind}:`;
  const digest = createHash("sha256").update(artifactIdentity, "utf8").digest("hex").slice(0, 16);
  return `${prefix}${semanticId.slice(0, 100 - prefix.length - digest.length - 1)}-${digest}`;
}

function ast(value: unknown): AstNode {
  return value as AstNode;
}

function child(value: unknown): AstNode | undefined {
  return value !== null && typeof value === "object" && typeof (value as { type?: unknown }).type === "string" ? ast(value) : undefined;
}

function children(value: unknown): readonly AstNode[] {
  return Array.isArray(value) ? value.filter((item) => item !== null).map(ast) : [];
}

function identifier(node: AstNode | undefined): string | undefined {
  return node?.type === "Identifier" && typeof node.name === "string" ? node.name : undefined;
}

function staticString(node: AstNode | undefined): string | undefined {
  return node?.type === "Literal" && typeof node.value === "string" ? node.value : undefined;
}

function semanticApi(node: AstNode): string | undefined {
  if (node.type !== "CallExpression") return undefined;
  const callee = child(node.callee);
  if (callee?.type !== "MemberExpression" || callee.computed === true) return undefined;
  const namespace = identifier(child(callee.object));
  const method = identifier(child(callee.property));
  return namespace?.startsWith("$") === true && method !== undefined ? `${namespace}.${method}` : undefined;
}

function quote(value: unknown): string {
  if (typeof value === "number" && Object.is(value, -0)) return "-0";
  const serialized = JSON.stringify(value);
  if (serialized === undefined) return fail("SCRIPT_COMPILER_UNSUPPORTED_SYNTAX", "literal", "literal is not JSON serializable");
  return serialized.replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

class ReviewedAstEmitter {
  private callIndex = 0;
  readonly instanceReferences = new Map<string, string>();
  readonly pageReferences = new Map<string, string>();

  constructor(
    private readonly validated: ValidatedScriptAst,
    private readonly context: SemanticScriptApiContext,
  ) {}

  program(program: Program): string {
    const source = this.statementList(children(program.body), 0);
    if (this.callIndex !== this.validated.calls.length) return fail("SCRIPT_COMPILER_UNTRUSTED_AST", "calls", "validated call count drifted");
    return `${source}\n`;
  }

  private indent(level: number): string { return "  ".repeat(level); }

  private statementList(nodes: readonly AstNode[], level: number): string {
    const emitted = nodes.map((node) => ({ node, source: this.statement(node, level) }));
    return [
      ...emitted.filter(({ node }) => node.type === "FunctionDeclaration"),
      ...emitted.filter(({ node }) => node.type !== "FunctionDeclaration"),
    ].map(({ source }) => source).join("\n");
  }

  private block(node: AstNode, level: number): string {
    const body = children(node.body);
    if (body.length === 0) return "{}";
    return `{\n${this.statementList(body, level + 1)}\n${this.indent(level)}}`;
  }

  private statement(node: AstNode, level: number): string {
    const pad = this.indent(level);
    switch (node.type) {
      case "VariableDeclaration": return `${pad}${String(node.kind)} ${children(node.declarations).map((item) => this.expression(item)).join(", ")};`;
      case "ExpressionStatement": return `${pad}${this.expression(child(node.expression)!)};`;
      case "ReturnStatement": return `${pad}return${node.argument === null || node.argument === undefined ? "" : ` ${this.expression(child(node.argument)!)}`};`;
      case "IfStatement": {
        const consequent = child(node.consequent)!;
        const alternate = child(node.alternate);
        const first = `${pad}if (${this.expression(child(node.test)!)}) ${consequent.type === "BlockStatement" ? this.block(consequent, level) : `\n${this.statement(consequent, level + 1)}`}`;
        if (alternate === undefined) return first;
        return `${first} else ${alternate.type === "BlockStatement" ? this.block(alternate, level) : `\n${this.statement(alternate, level + 1)}`}`;
      }
      case "FunctionDeclaration": return `${pad}const ${identifier(child(node.id))} = (${children(node.params).map((item) => this.expression(item)).join(", ")}) => ${this.block(child(node.body)!, level)};`;
      case "ForStatement": {
        const init = child(node.init);
        const initText = init?.type === "VariableDeclaration"
          ? `${String(init.kind)} ${children(init.declarations).map((item) => this.expression(item)).join(", ")}`
          : init === undefined ? "" : this.expression(init);
        const body = child(node.body)!;
        return `${pad}for (${initText}; ${node.test === null ? "" : this.expression(child(node.test)!)}; ${node.update === null ? "" : this.expression(child(node.update)!)}) ${body.type === "BlockStatement" ? this.block(body, level) : `\n${this.statement(body, level + 1)}`}`;
      }
      case "ForOfStatement": {
        const left = child(node.left)!;
        const leftText = left.type === "VariableDeclaration"
          ? `${String(left.kind)} ${children(left.declarations).map((item) => this.expression(item)).join(", ")}` : this.expression(left);
        const body = child(node.body)!;
        return `${pad}for (${leftText} of ${this.expression(child(node.right)!)}) ${body.type === "BlockStatement" ? this.block(body, level) : `\n${this.statement(body, level + 1)}`}`;
      }
      case "BlockStatement": return `${pad}${this.block(node, level)}`;
      case "EmptyStatement": return `${pad};`;
      default: return fail("SCRIPT_COMPILER_UNSUPPORTED_SYNTAX", node.type, "statement emitter has no reviewed branch");
    }
  }

  private expression(node: AstNode): string {
    switch (node.type) {
      case "Identifier": return identifier(node)!;
      case "Literal": {
        if (node.regex !== undefined || typeof node.value === "bigint") return fail("SCRIPT_COMPILER_UNSUPPORTED_SYNTAX", node.type, "regex and bigint literals are not emitted");
        return quote(node.value);
      }
      case "VariableDeclarator": return `${this.expression(child(node.id)!)}${node.init === null || node.init === undefined ? "" : ` = ${this.expression(child(node.init)!)}`}`;
      case "ArrayExpression": return `[${(Array.isArray(node.elements) ? node.elements : []).map((item) => item === null ? "" : this.expression(ast(item))).join(", ")}]`;
      case "ObjectExpression": return `{ ${children(node.properties).map((item) => this.expression(item)).join(", ")} }`;
      case "Property": {
        if (node.kind !== "init" || node.method === true) return fail("SCRIPT_COMPILER_UNSUPPORTED_SYNTAX", node.type, "only plain object properties are emitted");
        const keyNode = child(node.key)!;
        const literalKey = keyNode.type === "Literal" && (typeof keyNode.value === "string" || typeof keyNode.value === "number")
          ? quote(keyNode.value) : undefined;
        const key = node.computed === true ? `[${this.expression(keyNode)}]`
          : identifier(keyNode) ?? literalKey ?? fail("SCRIPT_COMPILER_UNSUPPORTED_SYNTAX", node.type, "object key is not statically serializable");
        return `${key}: ${this.expression(child(node.value)!)}`;
      }
      case "SpreadElement": return `...${this.expression(child(node.argument)!)}`;
      case "MemberExpression": return `${this.expression(child(node.object)!)}${node.computed === true ? `[${this.expression(child(node.property)!)}]` : `.${identifier(child(node.property))}`}`;
      case "CallExpression": return this.call(node);
      case "ArrowFunctionExpression": {
        const params = children(node.params).map((item) => this.expression(item)).join(", ");
        const body = child(node.body)!;
        const emittedBody = body.type === "BlockStatement" ? this.block(body, 0) : this.expression(body);
        return `(${params}) => ${body.type === "ObjectExpression" ? `(${emittedBody})` : emittedBody}`;
      }
      case "AssignmentExpression": return `(${this.expression(child(node.left)!)} ${String(node.operator)} ${this.expression(child(node.right)!)})`;
      case "UpdateExpression": return node.prefix === true
        ? `(${String(node.operator)}${this.expression(child(node.argument)!)})`
        : `(${this.expression(child(node.argument)!)}${String(node.operator)})`;
      case "UnaryExpression": return `(${String(node.operator)}${/[a-z]$/i.test(String(node.operator)) ? " " : ""}${this.expression(child(node.argument)!)})`;
      case "BinaryExpression":
      case "LogicalExpression": return `(${this.expression(child(node.left)!)} ${String(node.operator)} ${this.expression(child(node.right)!)})`;
      case "ConditionalExpression": return `(${this.expression(child(node.test)!)} ? ${this.expression(child(node.consequent)!)} : ${this.expression(child(node.alternate)!)})`;
      case "TemplateLiteral": {
        const quasis = children(node.quasis);
        const expressions = children(node.expressions);
        let result = "`";
        quasis.forEach((quasi, index) => {
          const cooked = (quasi.value as { cooked?: unknown } | undefined)?.cooked;
          if (typeof cooked !== "string") return fail("SCRIPT_COMPILER_UNSUPPORTED_SYNTAX", node.type, "invalid template element");
          result += cooked.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
          if (index < expressions.length) result += `\${${this.expression(expressions[index]!)}}`;
        });
        return `${result}\``;
      }
      default: return fail("SCRIPT_COMPILER_UNSUPPORTED_SYNTAX", node.type, "expression emitter has no reviewed branch");
    }
  }

  private call(node: AstNode): string {
    const api = semanticApi(node);
    const args = children(node.arguments);
    if (api === undefined) return `${this.expression(child(node.callee)!)}(${args.map((item) => this.expression(item)).join(", ")})`;
    const validatedCall = this.validated.calls[this.callIndex++];
    const targetId = staticString(args[0]);
    if (validatedCall === undefined || validatedCall.api !== api || validatedCall.targetId !== targetId && validatedCall.targetId !== undefined) {
      return fail("SCRIPT_COMPILER_UNTRUSTED_AST", api, "semantic call identity drifted from branded validation");
    }
    if (validatedCall.availability !== "supported") return fail("SCRIPT_COMPILER_API_UNSUPPORTED", api, validatedCall.availability);
    let resolution: ReturnType<typeof resolveSemanticApiCall>;
    if (api === "$control.getValue") resolution = resolveSemanticApiCall({ api, args: [targetId] }, this.context);
    else if (api === "$control.setData") resolution = resolveSemanticApiCall({ api, args: [targetId, []] }, this.context);
    else if (api === "$event.record") resolution = resolveSemanticApiCall({ api, args: [] }, this.context);
    else if (api === "$page.navigate") resolution = resolveSemanticApiCall({ api, args: [targetId] }, this.context);
    else return fail("SCRIPT_COMPILER_API_UNSUPPORTED", api, "no reviewed KF emitter");
    if (resolution.availability !== "supported") return fail("SCRIPT_COMPILER_API_UNSUPPORTED", api, resolution.availability);
    if ("semanticControlId" in resolution && "instanceName" in resolution) {
      this.instanceReferences.set(resolution.semanticControlId, resolution.instanceName);
    }
    if (resolution.kind === "property-read") return `${resolution.instanceName}.${resolution.kfProperty}`;
    if (resolution.kind === "method") return `${resolution.instanceName}.${resolution.kfMethod}(${args.slice(1).map((item) => this.expression(item)).join(", ")})`;
    if (resolution.kind === "event-argument") return `arguments[${resolution.argumentPosition}]`;
    if (resolution.kind === "restricted-action") {
      this.pageReferences.set(resolution.targetPageId, resolution.targetPageGuid);
      return fail("SCRIPT_COMPILER_API_UNSUPPORTED", api, "restricted actions must remain native actions");
    }
    return fail("SCRIPT_COMPILER_API_UNSUPPORTED", api, "unsupported resolution kind");
  }
}

function parseModule(value: unknown, scriptId: string): CompiledScriptModule {
  const parsed = CompiledScriptModuleSchema.safeParse(value);
  if (!parsed.success) return fail("SCRIPT_COMPILER_OUTPUT_INVALID", scriptId, parsed.error.issues[0]?.message, { cause: parsed.error });
  return parsed.data;
}

function parseBinding(value: unknown, scriptId: string): CompiledEventBinding {
  const parsed = CompiledEventBindingSchema.safeParse(value);
  if (!parsed.success) return fail("SCRIPT_COMPILER_OUTPUT_INVALID", scriptId, parsed.error.issues[0]?.message, { cause: parsed.error });
  return parsed.data;
}

export function compileScriptPlan(input: CompileScriptPlanInput): CompiledScriptPlan {
  const snapshot = snapshotCompileInput(input);
  // Local parsing gives Task6 errors for malformed data; the Task4 lookup then
  // proves the complete parsed value belongs to this exact trusted plan.
  const parsedScript = ScriptPlanSchema.safeParse(clonePureData(snapshot.script, "script"));
  if (!parsedScript.success) return fail("SCRIPT_COMPILER_INPUT_INVALID", "script", parsedScript.error.issues[0]?.message, { cause: parsedScript.error });
  const script = requireSemanticScriptPlan(parsedScript.data, snapshot.context);
  const placement = snapshot.placement ?? "event";
  const owner = resolveSemanticScriptOwner(snapshot.context);
  if (placement === "configure-data" && !requireScriptCapabilityProfile(owner.capabilityId).initialization.supportsConfigureData) {
    return fail("SCRIPT_COMPILER_API_UNSUPPORTED", script.id, `${owner.capabilityId} does not support configureData`);
  }
  let resolvedEvent: ReturnType<typeof resolveEventBinding> | undefined;
  const phase = snapshot.binding?.phase ?? "event";
  if (placement === "event") {
    if (snapshot.binding === undefined) return fail("SCRIPT_COMPILER_BINDING_INVALID", script.id, "event placement requires a semantic binding");
    try {
      assertSemanticScriptActiveEvent({ controlId: snapshot.binding.controlId, semanticEvent: snapshot.binding.semanticEvent }, snapshot.context);
      resolvedEvent = resolveEventBinding({ controlId: snapshot.binding.controlId, semanticEvent: snapshot.binding.semanticEvent }, snapshot.context);
    } catch (error) {
      return fail("SCRIPT_COMPILER_BINDING_INVALID", script.id, "binding does not match the exact active event", error instanceof Error ? { cause: error } : undefined);
    }
    if (resolvedEvent.instanceName !== owner.instanceName) return fail("SCRIPT_COMPILER_BINDING_INVALID", script.id, "binding owner does not match script owner");
  } else if (snapshot.binding !== undefined) {
    return fail("SCRIPT_COMPILER_BINDING_INVALID", script.id, "configure-data placement cannot declare an event binding");
  }
  let source: string;
  let validated: ValidatedScriptAst;
  let authoritativeCustom: ReturnType<typeof requireSemanticScriptValidationIdentity> | undefined;
  if (script.kind === "template") {
    source = renderScriptTemplate(script.template, script);
    validated = validateCustomScript({ source, inputs: script.inputs, outputs: script.outputs, context: snapshot.context });
  } else {
    if (script.programVersion !== "semantic-js/v1" || script.source === undefined || snapshot.validationIdentity === undefined || snapshot.validatedAst === undefined) {
      return fail("SCRIPT_COMPILER_UNTRUSTED_AST", script.id, "semantic-js identity and branded AST are required");
    }
    let authoritative: ReturnType<typeof requireSemanticScriptValidationIdentity>;
    try {
      authoritative = requireSemanticScriptValidationIdentity(snapshot.validationIdentity, snapshot.context);
    } catch (error) {
      return fail("SCRIPT_COMPILER_UNTRUSTED_AST", script.id, "validation identity is not owned by this context", error instanceof Error ? { cause: error } : undefined);
    }
    if (authoritative.id !== script.id || authoritative.source !== script.source) return fail("SCRIPT_COMPILER_UNTRUSTED_AST", script.id, "script differs from authoritative identity");
    authoritativeCustom = authoritative;
    source = script.source;
    validated = snapshot.validatedAst;
  }
  let program: Program;
  try {
    program = authoritativeCustom === undefined
      ? getValidatedScriptProgram(validated)
      : requireValidatedScriptProgram(validated, {
        context: snapshot.context,
        validationIdentity: snapshot.validationIdentity!,
        authoritativeScript: authoritativeCustom,
      });
  } catch (error) {
    return fail("SCRIPT_COMPILER_UNTRUSTED_AST", script.id, "AST identity is not compiler-owned", error instanceof Error ? { cause: error } : undefined);
  }
  const sourceHash = createHash("sha256").update(source, "utf8").digest("hex");
  if (validated.sourceHash !== sourceHash) return fail("SCRIPT_COMPILER_UNTRUSTED_AST", script.id, "source hash differs from branded AST");
  const emitter = new ReviewedAstEmitter(validated, snapshot.context);
  const compiledSource = emitter.program(program);
  emitter.instanceReferences.set(owner.semanticControlId, owner.instanceName);
  const artifactIdentity = JSON.stringify({
    scriptId: script.id,
    ownerSemanticId: owner.semanticControlId,
    ownerInstanceName: owner.instanceName,
    placement,
    semanticEvent: snapshot.binding?.semanticEvent ?? null,
    kfEvent: resolvedEvent?.kfEvent ?? null,
    linkId: resolvedEvent?.linkId ?? null,
    phase: placement === "event" ? phase : null,
  });
  const moduleId = compilerId("script", script.id, artifactIdentity);
  const module = parseModule({
    id: moduleId, sourceScriptId: script.id, placement, ownerInstanceName: owner.instanceName,
    instanceReferences: [...emitter.instanceReferences].sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([semanticId, instanceName]) => ({ semanticId, instanceName })),
    pageReferences: [...emitter.pageReferences].sort(([left], [right]) => left.localeCompare(right, "en-US"))
      .map(([semanticId, pageGuid]) => ({ semanticId, pageGuid })),
    source: compiledSource, sourceHash: createHash("sha256").update(compiledSource, "utf8").digest("hex"),
  }, script.id);
  let binding: CompiledEventBinding | undefined;
  if (placement === "event") {
    const event = resolvedEvent!;
    binding = parseBinding({
      id: compilerId("binding", `script-${script.id}`, artifactIdentity), ownerInstanceName: owner.instanceName, kfEvent: event.kfEvent,
      ...(event.linkId === undefined ? {} : { linkId: event.linkId }), phase,
      scriptModuleIds: [module.id], nativeActionIds: [],
    }, script.id);
  }
  return Object.freeze({
    module: Object.freeze(module), ...(binding === undefined ? {} : { binding: Object.freeze(binding) }),
    scheduledScriptIds: Object.freeze([...validated.scheduledScriptIds]),
    staticFunctionCalls: Object.freeze(Object.fromEntries(Object.entries(validated.staticFunctionCalls).map(([key, value]) => [key, Object.freeze([...value])]))),
  });
}
