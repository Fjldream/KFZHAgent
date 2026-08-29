import { types as utilTypes } from "node:util";
import {
  SolutionImplementationPlanSchema,
  type ScriptPlan,
  type SolutionImplementationPlan,
  type SolutionNode,
} from "@kf/contracts";

type CustomScript = Extract<ScriptPlan, { kind: "custom" }>;
type TemplateScript = Extract<ScriptPlan, { kind: "template" }>;
type ControlNode = Extract<SolutionNode, { kind: "control" }>;
type SemanticScalar = string | number | boolean | null;

const RESERVED_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const FILTER_MODES = new Set(["equals", "not-equals", "contains", "starts-with", "gte", "lte"]);

function invalid(detail: string): never {
  throw new Error(`INTERACTION_INTENT_INPUT_INVALID: ${detail}`);
}

function clonePureData(
  value: unknown,
  path = "plan",
  depth = 0,
  seen = new WeakSet<object>(),
  budget = { nodes: 0 },
): unknown {
  budget.nodes += 1;
  if (budget.nodes > 250_000 || depth > 128) return invalid(`${path} exceeds input bounds`);
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : invalid(`${path} contains a non-finite number`);
  if (typeof value !== "object" || utilTypes.isProxy(value)) return invalid(`${path} must be descriptor-safe JSON data`);
  if (seen.has(value)) return invalid(`${path} contains a cycle`);
  seen.add(value);
  let prototype: object | null;
  let keys: readonly PropertyKey[];
  let descriptors: PropertyDescriptorMap;
  try {
    prototype = Object.getPrototypeOf(value) as object | null;
    keys = Reflect.ownKeys(value);
    descriptors = Object.getOwnPropertyDescriptors(value);
  } catch {
    return invalid(`${path} descriptor inspection failed`);
  }
  if (keys.some((key) => typeof key !== "string" || RESERVED_KEYS.has(key))) return invalid(`${path} has an unsafe key`);
  const cloneValue = (key: string): unknown => {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !("value" in descriptor) || descriptor.enumerable !== true) {
      return invalid(`${path}.${key} must be an enumerable data property`);
    }
    return clonePureData(descriptor.value, `${path}.${key}`, depth + 1, seen, budget);
  };
  if (Array.isArray(value)) {
    if (prototype !== Array.prototype || keys.filter((key) => key !== "length").length !== value.length) {
      return invalid(`${path} must be a dense array`);
    }
    const result = Array.from({ length: value.length }, (_, index) => cloneValue(String(index)));
    seen.delete(value);
    return result;
  }
  if (prototype !== Object.prototype && prototype !== null) return invalid(`${path} must be a plain object`);
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys as string[]) Object.defineProperty(result, key, { value: cloneValue(key), enumerable: true });
  seen.delete(value);
  return result;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

function collectControls(plan: SolutionImplementationPlan): Map<string, ControlNode> {
  const controls = new Map<string, ControlNode>();
  const visit = (node: SolutionNode): void => {
    if (node.kind === "control") {
      controls.set(node.id, node);
    } else if (node.kind === "layout") {
      node.children.forEach(visit);
    } else if (node.kind === "registered-module") {
      node.slots.forEach((slot) => slot.children.forEach(visit));
    } else {
      visit(node.template);
    }
  };
  plan.pages.forEach((page) => visit(page.root));
  plan.overlays.forEach((overlay) => visit(overlay.root));
  return controls;
}

function oneProperty(control: ControlNode, name: string): SemanticScalar | undefined {
  const matches = control.properties.filter((property) => property.name === name);
  if (matches.length !== 1) return undefined;
  const value = matches[0]!.value;
  return value === null || ["string", "number", "boolean"].includes(typeof value)
    ? value as SemanticScalar
    : undefined;
}

function ownerControl(
  plan: SolutionImplementationPlan,
  scriptId: string,
  controls: ReadonlyMap<string, ControlNode>,
): ControlNode | undefined {
  const actions = plan.actions.filter((action) => action.kind === "run-script" && action.scriptId === scriptId);
  if (actions.length !== 1) return undefined;
  const owners = [...controls.values()].filter((control) => control.eventBindings.some((binding) => binding.actionIds.includes(actions[0]!.id)));
  return owners.length === 1 ? owners[0] : undefined;
}

function workflowCandidate(script: CustomScript): "multi-filter" | "form-validate-submit" | undefined {
  if (script.programVersion !== "declarative-steps/v1" || script.steps?.length !== 1) return undefined;
  const stepIntent = script.steps[0]!.intent.trim();
  if (/^按已声明[^、，,；;]*条件筛选记录并更新表格$/.test(stepIntent)
    || /^filter declared records and update (?:the )?(?:table|view)$/i.test(stepIntent)) return "multi-filter";
  if (/^校验已声明字段并模拟提交$/.test(stepIntent)
    || /^validate declared fields and simulate submission$/i.test(stepIntent)) return "form-validate-submit";
  return undefined;
}

function exactNames(entries: readonly { readonly name: string }[], names: readonly string[]): boolean {
  return entries.length === names.length && entries.every((entry, index) => entry.name === names[index]);
}

function exactStrings(entries: readonly string[], names: readonly string[]): boolean {
  return entries.length === names.length && entries.every((entry, index) => entry === names[index]);
}

function lowerMultiFilter(
  plan: SolutionImplementationPlan,
  script: CustomScript,
  controls: ReadonlyMap<string, ControlNode>,
): TemplateScript | undefined {
  const criteria = script.inputs.slice(1);
  if (criteria.length < 1 || criteria.length > 8) return undefined;
  const step = script.steps?.[0];
  if (step === undefined) return undefined;
  const inputNames = ["records", ...criteria.map((_criterion, index) => `criterion-${index + 1}-value`)];
  if (!exactNames(script.inputs, inputNames) || !exactNames(script.outputs, ["view"])) return undefined;
  if (!exactStrings(step.inputNames, inputNames) || !exactStrings(step.outputNames, ["view"])) return undefined;
  if (script.inputs[0]?.refKind !== "mock-data" || script.outputs[0]?.refKind !== "control") return undefined;
  if (criteria.some((criterion) => criterion.refKind !== "control")) return undefined;
  const referenceIds = [...script.inputs, ...script.outputs].map((port) => port.refId);
  if (new Set(referenceIds).size !== referenceIds.length) return undefined;
  const records = plan.mockData.find((dataSet) => dataSet.id === script.inputs[0]!.refId);
  const view = controls.get(script.outputs[0].refId);
  if (records === undefined || view?.capabilityId !== "easyui.1" || view.mockDataId !== records.id) return undefined;
  const combine = oneProperty(view, "filterCombine");
  if (combine !== "all" && combine !== "any") return undefined;
  const parameters: TemplateScript["parameters"] = [{ name: "combine", value: combine }];
  for (let index = 0; index < criteria.length; index += 1) {
    const control = controls.get(criteria[index]!.refId);
    if (control === undefined) return undefined;
    const field = oneProperty(control, "filterField");
    const mode = oneProperty(control, "filterMode");
    if (typeof field !== "string" || !records.fields.some((candidate) => candidate.key === field)
      || typeof mode !== "string" || !FILTER_MODES.has(mode)) return undefined;
    parameters.push(
      { name: `criterion-${index + 1}-field`, value: field },
      { name: `criterion-${index + 1}-mode`, value: mode },
    );
  }
  return {
    id: script.id, kind: "template", template: "multi-filter", purpose: script.purpose,
    inputs: script.inputs, outputs: script.outputs, parameters,
  };
}

function lowerFormValidateSubmit(
  plan: SolutionImplementationPlan,
  script: CustomScript,
  controls: ReadonlyMap<string, ControlNode>,
): TemplateScript | undefined {
  if (script.inputs.length < 1 || script.inputs.length > 8) return undefined;
  const step = script.steps?.[0];
  if (step === undefined) return undefined;
  const inputNames = script.inputs.map((_field, index) => `field-${index + 1}`);
  if (!exactNames(script.inputs, inputNames) || !exactNames(script.outputs, ["submitted"])) return undefined;
  if (!exactStrings(step.inputNames, inputNames) || !exactStrings(step.outputNames, ["submitted"])) return undefined;
  if (script.inputs.some((field) => field.refKind !== "control") || script.outputs[0]?.refKind !== "local-state") return undefined;
  const referenceIds = [...script.inputs, ...script.outputs].map((port) => port.refId);
  if (new Set(referenceIds).size !== referenceIds.length) return undefined;
  const submitted = plan.localState.find((state) => state.id === script.outputs[0]!.refId);
  const owner = ownerControl(plan, script.id, controls);
  const successMessage = owner === undefined ? undefined : oneProperty(owner, "successMessage");
  if (submitted?.type !== "boolean" || typeof successMessage !== "string" || successMessage.trim().length === 0 || successMessage.length > 400) return undefined;
  const parameters: TemplateScript["parameters"] = [];
  for (let index = 0; index < script.inputs.length; index += 1) {
    const control = controls.get(script.inputs[index]!.refId);
    if (control === undefined) return undefined;
    const required = oneProperty(control, "required");
    const message = oneProperty(control, "validationMessage");
    if (typeof required !== "boolean") return undefined;
    if (required !== (typeof message === "string" && message.trim().length > 0 && message.length <= 400)) return undefined;
    parameters.push({ name: `field-${index + 1}-required`, value: required });
    if (required) parameters.push({ name: `field-${index + 1}-message`, value: message });
  }
  parameters.push({ name: "success-message", value: successMessage });
  return {
    id: script.id, kind: "template", template: "form-validate-submit", purpose: script.purpose,
    inputs: script.inputs, outputs: script.outputs, parameters,
  };
}

/**
 * Converts only exact, fully parameterized declarative intent into reviewed
 * templates. Model prose selects a candidate; all emitted parameters come
 * from schema-declared ports, control properties, local state, and mock data.
 */
export function lowerReviewedInteractionIntents(input: unknown): SolutionImplementationPlan {
  const cloned = clonePureData(input);
  const parsed = SolutionImplementationPlanSchema.safeParse(cloned);
  if (!parsed.success) return invalid(parsed.error.issues[0]?.message ?? "plan schema validation failed");
  const plan = parsed.data;
  const controls = collectControls(plan);
  const scripts = plan.scripts.map((script): ScriptPlan => {
    if (script.kind !== "custom") return script;
    const candidate = workflowCandidate(script);
    if (candidate === undefined) return script;
    const lowered = candidate === "multi-filter"
      ? lowerMultiFilter(plan, script, controls)
      : lowerFormValidateSubmit(plan, script, controls);
    return lowered ?? script;
  });
  const reparsed = SolutionImplementationPlanSchema.safeParse({ ...plan, scripts });
  if (!reparsed.success) return invalid(reparsed.error.issues[0]?.message ?? "lowered plan schema validation failed");
  return deepFreeze(reparsed.data);
}
