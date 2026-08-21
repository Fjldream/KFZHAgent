import { z } from "zod";

const implementationOwnedNames = new Set([
  "configuredata", "coordinates", "coords", "css", "geometry", "guid", "javascript", "js", "lefttoppt", "linkid",
  "objecttype", "onclick", "script", "selector", "styledata", "styledatanew", "uimodeltype", "x", "y",
]);
const safeOnNames = new Set(["onboardingstage", "onlinestatus", "onlypending"]);
const implementationPropertyNames = new Set([
  "animation", "background", "backgroundcolor", "backgroundimage", "border", "bordercolor", "borderradius", "borderstyle",
  "borderwidth", "bounds", "bottom", "boxshadow", "color", "coordinate", "display", "flex", "flexbasis", "flexdirection",
  "flexgrow", "flexshrink", "flexwrap", "font", "fontfamily", "fontsize", "fontstyle", "fontweight", "gap", "grid",
  "gridarea", "gridcolumn", "gridrow", "gridtemplatecolumns", "gridtemplaterows", "height", "left", "lineheight", "margin",
  "marginbottom", "marginleft", "marginright", "margintop", "opacity", "padding", "paddingbottom", "paddingleft", "paddingright",
  "paddingtop", "position", "rect", "right", "textalign", "textcolor", "top", "transform", "transformorigin", "transition",
  "transitionduration", "width", "xpos", "ypos", "zindex",
]);

function normalizedName(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function isImplementationOwnedName(value: string): boolean {
  const normalized = normalizedName(value);
  return implementationOwnedNames.has(normalized) || (normalized.startsWith("on") && !safeOnNames.has(normalized));
}

function containsUnsafeCall(value: string): boolean {
  const calls = /\b([A-Za-z_$][A-Za-z0-9_$]*)\s*\(([^()]*)\)/g;
  for (const match of value.matchAll(calls)) {
    const name = match[1]!;
    const argumentsText = match[2]!;
    if (/^(?:rgb|rgba|hsl|hsla|var)$/i.test(name)) continue;
    if (/^[A-Z]{2,}$/.test(name) && /[\u3400-\u9fff]/.test(argumentsText)) continue;
    if (/^version$/i.test(name) && /^\s*\d+(?:\.\d+)+\s*$/.test(argumentsText)) continue;
    return true;
  }
  return false;
}

function isRawJsonText(value: string): boolean {
  const trimmed = value.trim();
  if (!/^[{[]/.test(trimmed)) return false;
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function isSafeActionText(value: string): boolean {
  const trimmed = value.trim();
  return !/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/i.test(value)
    && !isRawJsonText(value)
    && !/<\/?(?:script|style|iframe|object|embed)\b|\b(?:javascript|vbscript)\s*:/i.test(value)
    && !/\b(?:alert|eval|fetch|Function|setInterval|setTimeout|WebSocket|XMLHttpRequest)\s*\(/i.test(value)
    && !/\b(?:document|globalThis|window)\s*\./i.test(value)
    && !/\b(?:import|require)\s*\(/i.test(value)
    && !/=>|\$\{|\$(?:control|state|data|page|overlay|feedback)\b/.test(value)
    && !/(?:^|[\s(])[A-Za-z_$][A-Za-z0-9_$]*(?:(?:\.[A-Za-z_$][A-Za-z0-9_$]*)|(?:\[[^\]]+\]))*\s*(?:\|\|=|&&=|\?\?=|\+=|-=|\*=|\/=|%=|=|\+\+|--)/.test(value)
    && !containsUnsafeCall(value)
    && (/^#[0-9a-f]{3,8}$/i.test(trimmed) || !/^\s*(?:[.#][A-Za-z_-][A-Za-z0-9_-]*|\[[^\]\n]+\])(?:\s*[>+~ ]\s*(?:[.#]?[A-Za-z_-][A-Za-z0-9_-]*|\[[^\]\n]+\]))*(?::[A-Za-z-]+(?:\([^)]*\))?)?\s*$/.test(trimmed))
    && !/^(?:a|button|form|input|label|option|select|textarea):{1,2}[A-Za-z-]+(?:\([^)]*\))?$/i.test(trimmed)
    && !/^[A-Za-z][A-Za-z0-9-]*\s+(?:[.#]|\[)/.test(trimmed)
    && !/(?:^|[;{]\s*)(?:color|display|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?|background(?:-[a-z]+)?|border(?:-[a-z]+)?|font(?:-[a-z]+)?|opacity|position|transform|transition|animation|width|height)\s*:/i.test(value);
}

export const StableSemanticIdSchema = z.string().trim().min(1).max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine((value) => !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value), "GUID-shaped identifiers are not allowed")
  .refine((value) => !isImplementationOwnedName(value), "implementation identifiers are not allowed");

const semanticName = z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine((value) => !isImplementationOwnedName(value), "implementation names are not allowed");
const shortText = z.string().trim().min(1).max(400);

export const ActionScalarSchema = z.union([
  z.string().trim().max(2_000).refine(isSafeActionText, "implementation text is not allowed in action values"),
  z.number().finite().min(-1_000_000_000).max(1_000_000_000),
  z.boolean(),
  z.null(),
]);

type ActionValue = z.infer<typeof ActionScalarSchema>
  | { kind: "list"; items: ActionValue[] }
  | { kind: "record"; fields: Array<{ name: string; value: ActionValue }> };

const ActionValueShapeSchema: z.ZodType<ActionValue> = z.lazy(() => z.union([
  ActionScalarSchema,
  z.object({ kind: z.literal("list"), items: z.array(ActionValueShapeSchema).max(32) }).strict(),
  z.object({
    kind: z.literal("record"),
    fields: z.array(z.object({
      name: semanticName.refine((value) => !implementationPropertyNames.has(normalizedName(value)), "implementation property names are not allowed"),
      value: ActionValueShapeSchema,
    }).strict()).max(32),
  }).strict(),
]));

export const ActionValueSchema: z.ZodType<ActionValue> = ActionValueShapeSchema.superRefine((value, ctx) => {
  const pending: Array<{ value: ActionValue; depth: number }> = [{ value, depth: 0 }];
  let count = 0;
  while (pending.length > 0) {
    const current = pending.pop()!;
    count += 1;
    if (count > 1_000) {
      ctx.addIssue({ code: "custom", message: "ACTION_VALUE_BUDGET_EXCEEDED" });
      return;
    }
    if (current.depth > 8) {
      ctx.addIssue({ code: "custom", message: "ACTION_VALUE_DEPTH_EXCEEDED" });
      return;
    }
    if (current.value !== null && typeof current.value === "object") {
      if (current.value.kind === "list") {
        current.value.items.forEach((item) => pending.push({ value: item, depth: current.depth + 1 }));
      } else {
        const names = new Set<string>();
        current.value.fields.forEach((field) => {
          if (names.has(field.name)) ctx.addIssue({ code: "custom", message: `ACTION_VALUE_FIELD_DUPLICATE: ${field.name}` });
          names.add(field.name);
          pending.push({ value: field.value, depth: current.depth + 1 });
        });
      }
    }
  }
});

export const SemanticEventSchema = z.enum([
  "blur", "change", "clear", "click", "edit", "error", "filter", "focus", "input", "load", "navigate",
  "open-modal", "remove-tag", "row-click", "row-select", "scroll", "select", "submit", "tab-add", "tab-click",
  "tab-remove", "toggle", "visible-change",
]);

export const SemanticEventBindingSchema = z.object({
  semanticEvent: SemanticEventSchema,
  actionIds: z.array(StableSemanticIdSchema).min(1).max(16),
}).strict();

export const ValueExpressionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: ActionValueSchema }).strict(),
  z.object({ kind: z.literal("local-state"), stateId: StableSemanticIdSchema }).strict(),
  z.object({ kind: z.literal("mock-data"), mockDataId: StableSemanticIdSchema }).strict(),
]);

const ConditionOperandSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: ActionScalarSchema }).strict(),
  z.object({ kind: z.literal("local-state"), stateId: StableSemanticIdSchema }).strict(),
  z.object({ kind: z.literal("control-value"), controlId: StableSemanticIdSchema }).strict(),
]);

export const ActionConditionSchema = z.object({
  left: ConditionOperandSchema,
  operator: z.enum(["equals", "not-equals", "greater-than", "greater-than-or-equal", "less-than", "less-than-or-equal"]),
  right: ConditionOperandSchema,
}).strict();

const effectOptions = [
  z.object({ kind: z.literal("navigate-page"), targetPageId: StableSemanticIdSchema }).strict(),
  z.object({ kind: z.literal("open-overlay"), overlayId: StableSemanticIdSchema }).strict(),
  z.object({ kind: z.literal("close-overlay"), overlayId: StableSemanticIdSchema, result: ActionScalarSchema.optional() }).strict(),
  z.object({ kind: z.literal("set-visibility"), targetId: StableSemanticIdSchema, visible: z.boolean() }).strict(),
  z.object({ kind: z.literal("switch-tab"), targetId: StableSemanticIdSchema, tabId: StableSemanticIdSchema }).strict(),
  z.object({ kind: z.literal("set-state"), stateId: StableSemanticIdSchema, value: ActionValueSchema }).strict(),
  z.object({ kind: z.literal("set-control-value"), targetId: StableSemanticIdSchema, value: ValueExpressionSchema }).strict(),
  z.object({ kind: z.literal("show-feedback"), level: z.enum(["success", "info", "warning", "error"]), message: shortText }).strict(),
  z.object({ kind: z.literal("run-script"), scriptId: StableSemanticIdSchema }).strict(),
] as const;

export const ActionEffectSchema = z.discriminatedUnion("kind", effectOptions);

const actionBase = {
  id: StableSemanticIdSchema,
  conditions: z.array(ActionConditionSchema).max(8).optional(),
  afterActionIds: z.array(StableSemanticIdSchema).max(16).default([]),
};

export const ActionPlanSchema = z.discriminatedUnion("kind", [
  z.object({ ...actionBase, kind: z.literal("navigate-page"), targetPageId: StableSemanticIdSchema }).strict(),
  z.object({ ...actionBase, kind: z.literal("open-overlay"), overlayId: StableSemanticIdSchema }).strict(),
  z.object({ ...actionBase, kind: z.literal("close-overlay"), overlayId: StableSemanticIdSchema, result: ActionScalarSchema.optional() }).strict(),
  z.object({ ...actionBase, kind: z.literal("set-visibility"), targetId: StableSemanticIdSchema, visible: z.boolean() }).strict(),
  z.object({ ...actionBase, kind: z.literal("switch-tab"), targetId: StableSemanticIdSchema, tabId: StableSemanticIdSchema }).strict(),
  z.object({ ...actionBase, kind: z.literal("set-state"), stateId: StableSemanticIdSchema, value: ActionValueSchema }).strict(),
  z.object({ ...actionBase, kind: z.literal("set-control-value"), targetId: StableSemanticIdSchema, value: ValueExpressionSchema }).strict(),
  z.object({ ...actionBase, kind: z.literal("show-feedback"), level: z.enum(["success", "info", "warning", "error"]), message: shortText }).strict(),
  z.object({ ...actionBase, kind: z.literal("run-script"), scriptId: StableSemanticIdSchema }).strict(),
]);

const ReferenceIndexSchema = z.object({
  pageIds: z.array(StableSemanticIdSchema).max(32),
  controlIds: z.array(StableSemanticIdSchema).max(5_000),
  overlayIds: z.array(StableSemanticIdSchema).max(24),
  stateIds: z.array(StableSemanticIdSchema).max(64),
  mockDataIds: z.array(StableSemanticIdSchema).max(32),
  scriptIds: z.array(StableSemanticIdSchema).max(50),
}).strict();

const GraphActionSchema = z.object({
  id: StableSemanticIdSchema,
  trigger: z.object({ controlId: StableSemanticIdSchema, semanticEvent: SemanticEventSchema }).strict(),
  conditions: z.array(ActionConditionSchema).max(8),
  effects: z.array(ActionEffectSchema).min(1).max(16),
  afterActionIds: z.array(StableSemanticIdSchema).max(16),
}).strict();

function addUnknownEffectIssue(
  effect: z.infer<typeof ActionEffectSchema>,
  references: { pages: Set<string>; controls: Set<string>; overlays: Set<string>; states: Set<string>; data: Set<string>; scripts: Set<string> },
  ctx: z.RefinementCtx,
  path: Array<string | number>,
): void {
  const issue = (message: string, field: string): void => ctx.addIssue({ code: "custom", path: [...path, field], message });
  if (effect.kind === "navigate-page" && !references.pages.has(effect.targetPageId)) issue(`ACTION_PAGE_UNKNOWN: ${effect.targetPageId}`, "targetPageId");
  if ((effect.kind === "open-overlay" || effect.kind === "close-overlay") && !references.overlays.has(effect.overlayId)) issue(`ACTION_OVERLAY_UNKNOWN: ${effect.overlayId}`, "overlayId");
  if ((effect.kind === "set-visibility" || effect.kind === "set-control-value" || effect.kind === "switch-tab") && !references.controls.has(effect.targetId)) issue(`ACTION_TARGET_UNKNOWN: ${effect.targetId}`, "targetId");
  if (effect.kind === "set-state" && !references.states.has(effect.stateId)) issue(`ACTION_STATE_UNKNOWN: ${effect.stateId}`, "stateId");
  if (effect.kind === "run-script" && !references.scripts.has(effect.scriptId)) issue(`ACTION_SCRIPT_UNKNOWN: ${effect.scriptId}`, "scriptId");
  if (effect.kind === "set-control-value") {
    if (effect.value.kind === "local-state" && !references.states.has(effect.value.stateId)) issue(`ACTION_STATE_UNKNOWN: ${effect.value.stateId}`, "value");
    if (effect.value.kind === "mock-data" && !references.data.has(effect.value.mockDataId)) issue(`ACTION_DATA_UNKNOWN: ${effect.value.mockDataId}`, "value");
  }
}

export const ActionGraphSchema = z.object({
  schema: z.literal("kf-action-graph/v1"),
  references: ReferenceIndexSchema,
  actions: z.array(GraphActionSchema).max(200),
}).strict().superRefine((graph, ctx) => {
  const sets = {
    pages: new Set(graph.references.pageIds),
    controls: new Set(graph.references.controlIds),
    overlays: new Set(graph.references.overlayIds),
    states: new Set(graph.references.stateIds),
    data: new Set(graph.references.mockDataIds),
    scripts: new Set(graph.references.scriptIds),
  };
  Object.entries(graph.references).forEach(([kind, ids]) => {
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", path: ["references", kind], message: `ACTION_REFERENCE_DUPLICATE: ${kind}` });
  });
  const globalIds = new Set<string>();
  Object.entries(graph.references).forEach(([kind, ids]) => ids.forEach((id, index) => {
    if (globalIds.has(id)) ctx.addIssue({ code: "custom", path: ["references", kind, index], message: `ACTION_REFERENCE_GLOBAL_DUPLICATE: ${id}` });
    globalIds.add(id);
  }));
  const actionById = new Map<string, { index: number; dependencies: string[] }>();
  graph.actions.forEach((action, actionIndex) => {
    if (globalIds.has(action.id)) ctx.addIssue({ code: "custom", path: ["actions", actionIndex, "id"], message: `ACTION_ID_GLOBAL_DUPLICATE: ${action.id}` });
    globalIds.add(action.id);
    if (actionById.has(action.id)) ctx.addIssue({ code: "custom", path: ["actions", actionIndex, "id"], message: `ACTION_ID_DUPLICATE: ${action.id}` });
    else actionById.set(action.id, { index: actionIndex, dependencies: action.afterActionIds });
    if (!sets.controls.has(action.trigger.controlId)) ctx.addIssue({ code: "custom", path: ["actions", actionIndex, "trigger", "controlId"], message: `ACTION_TRIGGER_CONTROL_UNKNOWN: ${action.trigger.controlId}` });
    action.conditions.forEach((condition, conditionIndex) => {
      [condition.left, condition.right].forEach((operand, operandIndex) => {
        if (operand.kind === "local-state" && !sets.states.has(operand.stateId)) ctx.addIssue({ code: "custom", path: ["actions", actionIndex, "conditions", conditionIndex, operandIndex === 0 ? "left" : "right"], message: `ACTION_CONDITION_STATE_UNKNOWN: ${operand.stateId}` });
        if (operand.kind === "control-value" && !sets.controls.has(operand.controlId)) ctx.addIssue({ code: "custom", path: ["actions", actionIndex, "conditions", conditionIndex, operandIndex === 0 ? "left" : "right"], message: `ACTION_CONDITION_CONTROL_UNKNOWN: ${operand.controlId}` });
      });
    });
    action.effects.forEach((effect, effectIndex) => addUnknownEffectIssue(effect, sets, ctx, ["actions", actionIndex, "effects", effectIndex]));
    if (new Set(action.afterActionIds).size !== action.afterActionIds.length) ctx.addIssue({ code: "custom", path: ["actions", actionIndex, "afterActionIds"], message: `ACTION_DEPENDENCY_DUPLICATE: ${action.id}` });
  });
  graph.actions.forEach((action, actionIndex) => action.afterActionIds.forEach((dependencyId, dependencyIndex) => {
    if (!actionById.has(dependencyId)) ctx.addIssue({ code: "custom", path: ["actions", actionIndex, "afterActionIds", dependencyIndex], message: `ACTION_DEPENDENCY_UNKNOWN: ${dependencyId}` });
  }));
  const finished = new Set<string>();
  graph.actions.forEach((start) => {
    if (finished.has(start.id)) return;
    const active = new Set<string>();
    const stack: Array<{ id: string; next: number }> = [{ id: start.id, next: 0 }];
    while (stack.length > 0) {
      const frame = stack[stack.length - 1]!;
      const entry = actionById.get(frame.id);
      if (entry === undefined) { stack.pop(); continue; }
      active.add(frame.id);
      if (frame.next >= entry.dependencies.length) {
        active.delete(frame.id);
        finished.add(frame.id);
        stack.pop();
        continue;
      }
      const dependencyId = entry.dependencies[frame.next++]!;
      if (active.has(dependencyId)) {
        ctx.addIssue({ code: "custom", path: ["actions", entry.index, "afterActionIds", frame.next - 1], message: `ACTION_DEPENDENCY_CYCLE: ${dependencyId}` });
        continue;
      }
      if (!finished.has(dependencyId) && actionById.has(dependencyId)) stack.push({ id: dependencyId, next: 0 });
    }
  });
});

export const CompilerInstanceNameSchema = z.string().trim().min(2).max(100)
  .regex(/^[A-Za-z_$][A-Za-z0-9_$]*[0-9]$/, "compiler instance names must use an evidence-backed KF instance shape");
export const CompilerPageGuidSchema = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
export const CompilerOwnedIdSchema = z.string().trim().min(1).max(100)
  .regex(/^kf\$(?:action|binding|script):[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const CompilerActionIdSchema = z.string().trim().min(1).max(100).regex(/^kf\$action:[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const CompilerBindingIdSchema = z.string().trim().min(1).max(100).regex(/^kf\$binding:[A-Za-z0-9][A-Za-z0-9_-]*$/);
export const CompilerScriptIdSchema = z.string().trim().min(1).max(100).regex(/^kf\$script:[A-Za-z0-9][A-Za-z0-9_-]*$/);

const compiledActionBase = {
  id: CompilerActionIdSchema,
  sourceActionId: StableSemanticIdSchema,
  ownerInstanceName: CompilerInstanceNameSchema,
};

export const CompiledNativeActionSchema = z.discriminatedUnion("kind", [
  z.object({ ...compiledActionBase, kind: z.literal("navigate-page"), targetPageGuid: CompilerPageGuidSchema }).strict(),
  z.object({ ...compiledActionBase, kind: z.literal("open-overlay"), targetInstanceName: CompilerInstanceNameSchema }).strict(),
  z.object({ ...compiledActionBase, kind: z.literal("close-overlay"), targetInstanceName: CompilerInstanceNameSchema }).strict(),
  z.object({ ...compiledActionBase, kind: z.literal("set-visibility"), targetInstanceName: CompilerInstanceNameSchema, visible: z.boolean() }).strict(),
  z.object({ ...compiledActionBase, kind: z.literal("switch-tab"), targetInstanceName: CompilerInstanceNameSchema, tabId: StableSemanticIdSchema }).strict(),
  z.object({ ...compiledActionBase, kind: z.literal("set-state"), stateId: StableSemanticIdSchema, value: ActionValueSchema }).strict(),
  z.object({ ...compiledActionBase, kind: z.literal("set-control-value"), targetInstanceName: CompilerInstanceNameSchema, value: ActionValueSchema }).strict(),
  z.object({ ...compiledActionBase, kind: z.literal("show-feedback"), level: z.enum(["success", "info", "warning", "error"]), message: shortText }).strict(),
]);

export type SemanticEventBinding = z.infer<typeof SemanticEventBindingSchema>;
export type ActionCondition = z.infer<typeof ActionConditionSchema>;
export type ActionEffect = z.infer<typeof ActionEffectSchema>;
export type ActionPlan = z.infer<typeof ActionPlanSchema>;
export type ActionGraph = z.infer<typeof ActionGraphSchema>;
export type CompiledNativeAction = z.infer<typeof CompiledNativeActionSchema>;
