import {
  UIImplementationSpecSchema,
  type CapabilityReport,
  type ChangeOperation,
  type ChangePlan,
  type ComponentStyleSpec,
  type ControlCapability,
  type UIComponentSpec,
  type UIImplementationSpec,
} from "@kf/contracts";
import { getControlCapability } from "../style/control-capability-registry.js";
import { KF36_RUNTIME_PROFILE } from "../style/runtime-profile.js";
import { compileControlStyle, listStyleCompilationIssues } from "../style/style-engine.js";
import { resolveComponentStyle } from "../style/theme-resolver.js";
import { allowedFieldsFor } from "../patch/allowlist.js";
import {
  validateCreateComponentProperties,
  validateGeneratedComponentProperties,
} from "./component-properties.js";
import { isDeepStrictEqual } from "node:util";

export interface ImplementationCompileContext {
  workspaceId: string;
  pageGuidById: Readonly<Record<string, string>>;
  existingControlGuidByComponentId: Readonly<Record<string, string>>;
  existingControlCapabilityIdByComponentId: Readonly<Record<string, string>>;
  existingControlGeometryByComponentId?: Readonly<Record<string, UIComponentSpec["geometry"]>>;
  /** Last confirmed model spec, used only to emit true semantic deltas. */
  previousImplementation?: UIImplementationSpec;
}

export interface UiImplementationCompileResult {
  plan: ChangePlan;
  capabilityReport: CapabilityReport;
}

interface CapabilityIssue {
  token: string;
  reason: string;
}

interface SelectedCapability {
  id: string;
  capability: ControlCapability;
}

interface ControlVariant {
  type: string;
  proto?: number;
  layoutType?: number;
  prototypeName?: string;
}

const PROPERTY_KEYS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  checkbox: ["label", "checked"],
  checkboxlegacy: ["label", "checked"],
  combobox: ["options", "value", "editable"],
  cascader: ["options", "placeholder", "filterable", "clearable"],
  datetimepicker: ["value", "placeholder", "format"],
  dropdown: ["options", "text", "splitButton"],
  factorycalendar: ["value", "dateFormat"],
  image: ["src", "fit", "alt"],
  input: ["value", "placeholder", "disabled", "clearable", "maxlength"],
  inputnumber: ["precision"],
  list: ["options"],
  navmenu: ["mode", "options"],
  radio: ["options", "value"],
  radiolegacy: ["options", "value"],
  scale: ["min", "max", "value", "step"],
  select: ["options", "value", "multiple", "placeholder"],
  spacer: ["axis"],
  switch: ["value", "activeText", "inactiveText"],
  tabs: ["tabs", "activeId"],
  tag: ["effect", "closable", "hit"],
  timeline: ["items"],
  transfer: ["options", "titles"],
  tree: ["showCheckbox", "indent", "expandOnClickNode"],
  treeview: ["showCheckbox"],
  upload: ["action", "accept", "multiple"],
  webcontainer: ["url", "scrollbar"],
  "easyui.1": ["striped", "pagination", "pageSize"],
  "easyui.2": ["text"],
  "easyui.9": ["value", "readonly"],
  "layout.0": ["children", "panels"],
  "layout.2": ["children", "panels"],
  "layout.3": ["children", "panels"],
  "layout.4": ["children", "panels"],
  "layout.5": ["children", "panels"],
  "layout.6": ["children", "panels"],
  "prototype.CustomCharts": ["region"],
  "prototype.TrendChart": ["title", "areas", "comment"],
  "prototype.BarChart": ["title", "areas", "comment"],
  "prototype.PieChart": ["title", "areas", "comment"],
  "prototype.XYChart": ["title", "areas", "comment"],
});

const CONTENT_CAPABILITIES = new Set(["button", "text", "richtext"]);
const EMPTY_STYLE: ComponentStyleSpec = Object.freeze({ declarations: {}, states: {} });

/**
 * Compiles a validated UI implementation spec into a deterministic, structured
 * ChangePlan. Styles remain structured intent: this layer compiles styles only
 * to verify capability coverage, never to copy generated CSS into the plan.
 */
export function compileUiImplementation(
  input: UIImplementationSpec,
  context: ImplementationCompileContext,
): UiImplementationCompileResult {
  const parsed = UIImplementationSpecSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`INVALID_UI_IMPLEMENTATION_SPEC: ${parsed.error.issues[0]?.message ?? "invalid spec"}`);
  }
  const spec = parsed.data;
  const operations: ChangeOperation[] = [];
  const report = createReportAccumulator();
  const previous = previousComponentIndex(context.previousImplementation);
  const seenComponentIds = new Set<string>();
  const pageIds = new Set<string>();

  for (const page of spec.pages) {
    if (pageIds.has(page.id)) {
      throw new Error(`DUPLICATE_PAGE_ID: ${page.id}`);
    }
    pageIds.add(page.id);
  }

  for (const page of spec.pages) {
    const pageGuid = contextStringValue(
      context.pageGuidById,
      page.id,
      "UNKNOWN_PAGE_ID",
      "INVALID_PAGE_GUID",
    );
    for (const component of page.components) {
      if (seenComponentIds.has(component.id)) {
        throw new Error(`DUPLICATE_COMPONENT_ID: ${component.id}`);
      }
      seenComponentIds.add(component.id);
      assertGeometryInPage(component, page);
      operations.push(...compileComponent(
        component,
        previous.get(component.id),
        spec,
        pageGuid,
        context,
        report,
      ));
    }
  }

  return {
    plan: { schema: "kf-change-plan/v1", workspaceId: context.workspaceId, operations },
    capabilityReport: finalizeReport(report),
  };
}

function compileComponent(
  component: UIComponentSpec,
  previousComponent: UIComponentSpec | undefined,
  spec: UIImplementationSpec,
  pageGuid: string,
  context: ImplementationCompileContext,
  report: ReportAccumulator,
): ChangeOperation[] {
  const style = resolveComponentStyle(spec.theme, EMPTY_STYLE, EMPTY_STYLE, component.style);
  const existingGuid = optionalContextStringValue(
    context.existingControlGuidByComponentId,
    component.id,
    "INVALID_EXISTING_CONTROL_GUID",
  );
  let actualCapabilityId: string | undefined;
  if (existingGuid !== undefined) {
    actualCapabilityId = optionalContextStringValue(
      context.existingControlCapabilityIdByComponentId,
      component.id,
      "INVALID_EXISTING_CONTROL_CAPABILITY",
    );
    if (actualCapabilityId === undefined) {
      throw new Error(`MISSING_EXISTING_CONTROL_CAPABILITY: ${component.id}`);
    }
    if (actualCapabilityId !== component.capabilityId) {
      throw new Error(
        `EXISTING_CAPABILITY_MISMATCH: ${component.id} requested ${component.capabilityId} `
        + `but actual existing capability is ${actualCapabilityId}`,
      );
    }
  }

  const primaryCapabilityId = actualCapabilityId ?? component.capabilityId;
  const primary = selectCapability(primaryCapabilityId, style, spec);
  const primaryIssues = primary.issues;
  let selected = primary.selected;

  if (primaryIssues.length > 0) {
    const severity = component.critical ? "critical" : "non-critical";
    if (component.critical) {
      throw unsupportedCapabilityError("UNSUPPORTED_CRITICAL_CAPABILITY", component, primaryIssues);
    }
    if (component.fallbackCapabilityId === undefined) {
      throw unsupportedCapabilityError("UNSUPPORTED_NON_CRITICAL_CAPABILITY", component, primaryIssues);
    }
    if (existingGuid !== undefined) {
      throw unsupportedCapabilityError("UNSUPPORTED_EXISTING_CONTROL_FALLBACK", component, primaryIssues);
    }
    const fallback = selectCapability(component.fallbackCapabilityId, style, spec);
    if (fallback.selected === undefined || fallback.issues.length > 0) {
      throw unsupportedCapabilityError("UNVERIFIED_FALLBACK_CAPABILITY", component, fallback.issues);
    }
    selected = fallback.selected;
    for (const issue of primaryIssues) {
      report.unsupported.add(`${component.id}:${component.capabilityId}:${issue.token}`);
    }
    report.deliveryGaps.push({
      componentId: component.id,
      capability: component.capabilityId,
      severity,
      fallback: selected.id,
      reason: primaryIssues
        .slice()
        .sort(compareIssues)
        .map((issue) => `${issue.token}: ${issue.reason}`)
        .join("; "),
    });
  }

  if (selected === undefined) {
    throw unsupportedCapabilityError("UNSUPPORTED_CRITICAL_CAPABILITY", component, primaryIssues);
  }
  recordCapabilityStatus(report, selected);

  if (existingGuid !== undefined) {
    const existingOperations: ChangeOperation[] = [];
    const themeChanged = context.previousImplementation !== undefined
      && !isDeepStrictEqual(context.previousImplementation.theme, spec.theme);
    const styleChanged = previousComponent === undefined
      || !isDeepStrictEqual(previousComponent.style, component.style);
    if (hasStyleDelta(style) && (themeChanged || styleChanged)) {
      existingOperations.push({
        op: "applyStyle",
        entityId: existingGuid,
        entityType: "control",
        style,
      });
    }
    const changes = geometryChanges(component, context);
    changes.push(...existingPropertyChanges(component, previousComponent, selected.id));
    if (
      component.content !== undefined
      && (previousComponent === undefined || previousComponent.content !== component.content)
    ) {
      if (!CONTENT_CAPABILITIES.has(selected.id)) {
        throw new Error(`UNSUPPORTED_COMPONENT_CONTENT: ${component.id} for ${selected.id}`);
      }
      changes.push({ path: "/text", value: component.content });
    }
    if (changes.length > 0) {
      existingOperations.push({
        op: "update",
        entityId: existingGuid,
        entityType: "control",
        changes,
      });
    }
    return existingOperations;
  }

  return [{
    op: "create",
    entityId: component.id,
    entityType: "control",
    properties: createProperties(component, selected.id, pageGuid, style),
  }];
}

function geometryChanges(
  component: UIComponentSpec,
  context: ImplementationCompileContext,
): Array<{ path: string; value: unknown }> {
  const known = context.existingControlGeometryByComponentId;
  const current = known !== undefined && Object.hasOwn(known, component.id)
    ? known[component.id]
    : undefined;
  const entries = ["x", "y", "width", "height"] as const;
  return entries
    .filter((field) => current === undefined || current[field] !== component.geometry[field])
    .map((field) => ({ path: `/${field}`, value: component.geometry[field] }));
}

const EXISTING_PROPERTY_ALIASES: Readonly<Record<string, Readonly<Record<string, string>>>> = Object.freeze({
  checkbox: { label: "checkboxData", checked: "checkedData" },
  checkboxlegacy: { label: "span/thisElement/innerText", checked: "check" },
  input: { inputType: "type" },
  datetimepicker: { pickerType: "type" },
  radio: { options: "radioData", value: "radioValue" },
  radiolegacy: { options: "radioData" },
  select: { options: "selectData", value: "selectValue" },
  tabs: { tabs: "tabData", activeId: "activeName" },
  scale: { min: "minValue", max: "maxValue", value: "numerical" },
});

function existingPropertyChanges(
  component: UIComponentSpec,
  previousComponent: UIComponentSpec | undefined,
  capabilityId: string,
): Array<{ path: string; value: unknown }> {
  if (Object.keys(component.properties).length === 0) return [];
  const validated = validateGeneratedComponentProperties(capabilityId, component.properties);
  const variant = capabilityVariant(capabilityId);
  if (variant === undefined) throw new Error(`UNSUPPORTED_CAPABILITY_VARIANT: ${capabilityId}`);
  const allowed = allowedFieldsFor({ kind: "control", controlType: variant.type });
  const aliases = EXISTING_PROPERTY_ALIASES[variant.type] ?? {};
  const changes: Array<{ path: string; value: unknown }> = [];
  const checkboxLabelChanged = variant.type === "checkbox"
    && previousComponent !== undefined
    && !isDeepStrictEqual(previousComponent.properties["label"], validated["label"]);
  for (const [semanticKey, semanticValue] of Object.entries(validated)) {
    const coupledCheckedValue = checkboxLabelChanged
      && semanticKey === "checked"
      && semanticValue === true;
    if (
      previousComponent !== undefined
      && Object.hasOwn(previousComponent.properties, semanticKey)
      && isDeepStrictEqual(previousComponent.properties[semanticKey], semanticValue)
      && !coupledCheckedValue
    ) {
      continue;
    }
    if (semanticKey === "parentId") {
      throw new Error(`UNSUPPORTED_EXISTING_COMPONENT_PROPERTY: ${component.id}.parentId`);
    }
    const nativePath = aliases[semanticKey] ?? semanticKey;
    const nativeKey = nativePath.split("/", 1)[0]!;
    if (!allowed.has(nativeKey)) {
      throw new Error(
        `UNSUPPORTED_EXISTING_COMPONENT_PROPERTY: ${component.id}.${semanticKey} for ${capabilityId}`,
      );
    }
    let value = (variant.type === "radio" || variant.type === "radiolegacy")
      && semanticKey === "options"
      && Array.isArray(semanticValue)
      ? semanticValue.map((option) => ({
          text: (option as { label: string }).label,
          disabled: false,
          visible: true,
        }))
      : semanticValue;
    if (variant.type === "checkbox" && semanticKey === "label") {
      value = [{ text: semanticValue, label: semanticValue, disabled: false, visible: true }];
    } else if (variant.type === "checkbox" && semanticKey === "checked") {
      const label = validated["label"];
      value = semanticValue === true && typeof label === "string" ? [label] : [];
    }
    changes.push({ path: `/${nativePath}`, value });
  }
  return changes;
}

function previousComponentIndex(
  input: UIImplementationSpec | undefined,
): ReadonlyMap<string, UIComponentSpec> {
  if (input === undefined) return new Map();
  const parsed = UIImplementationSpecSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      `INVALID_PREVIOUS_UI_IMPLEMENTATION_SPEC: ${parsed.error.issues[0]?.message ?? "invalid spec"}`,
    );
  }
  return new Map(
    parsed.data.pages.flatMap((page) => page.components.map((component) => [component.id, component])),
  );
}

function selectCapability(
  capabilityId: string,
  style: ComponentStyleSpec,
  spec: UIImplementationSpec,
): { selected?: SelectedCapability; issues: CapabilityIssue[] } {
  const capability = getControlCapability(capabilityId);
  if (capability === undefined) {
    return {
      issues: [{ token: "capability", reason: `No reviewed capability is registered for ${capabilityId}` }],
    };
  }
  if (!capabilityVariant(capability.id)) {
    return {
      issues: [{ token: "capability", reason: `Capability ${capability.id} has no reviewed creation variant` }],
    };
  }
  const issues: CapabilityIssue[] = [];
  if (capability.generation.status === "unsupported" || capability.generation.status === "preserve-only") {
    issues.push({
      token: "generation",
      reason: `Capability ${capability.id} generation is ${capability.generation.status}`,
    });
  }
  let compiled;
  try {
    compiled = compileControlStyle({
      capabilityId: capability.id,
      theme: spec.theme,
      instanceStyle: style,
      runtimeProfile: KF36_RUNTIME_PROFILE,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { issues: [{ token: "style", reason: detail }] };
  }
  for (const issue of listStyleCompilationIssues(capability.id, compiled)) {
    issues.push({ token: issue.token, reason: `${issue.code}: ${issue.message}` });
  }
  return {
    selected: { id: capability.id, capability },
    issues: deduplicateIssues(issues),
  };
}

function createProperties(
  component: UIComponentSpec,
  capabilityId: string,
  pageId: string,
  style: ComponentStyleSpec,
): Record<string, unknown> {
  const variant = capabilityVariant(capabilityId);
  if (variant === undefined) {
    throw new Error(`UNSUPPORTED_CAPABILITY_VARIANT: ${capabilityId}`);
  }
  const allowed = new Set([
    ...(PROPERTY_KEYS[capabilityId] ?? PROPERTY_KEYS[variant.type] ?? []),
    ...(variant.type === "layout" || variant.type === "prototype" ? [] : ["parentId"]),
  ]);
  const properties: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(component.properties)) {
    if (!allowed.has(key)) {
      throw new Error(`UNSUPPORTED_COMPONENT_PROPERTY: ${component.id}.${key} for ${capabilityId}`);
    }
    properties[key] = value;
  }
  if (component.content !== undefined) {
    if (!CONTENT_CAPABILITIES.has(capabilityId)) {
      throw new Error(`UNSUPPORTED_COMPONENT_CONTENT: ${component.id} for ${capabilityId}`);
    }
    properties.text = component.content;
  }
  const validatedProperties = validateCreateComponentProperties(capabilityId, properties);
  return {
    pageId,
    ...variant,
    x: component.geometry.x,
    y: component.geometry.y,
    width: component.geometry.width,
    height: component.geometry.height,
    ...validatedProperties,
    style,
  };
}

function hasStyleDelta(style: ComponentStyleSpec): boolean {
  return Object.keys(style.declarations).length > 0
    || Object.values(style.states).some((declarations) => Object.keys(declarations ?? {}).length > 0);
}

function optionalContextStringValue(
  mapping: Readonly<Record<string, string>>,
  key: string,
  invalidCode: string,
): string | undefined {
  if (!Object.hasOwn(mapping, key)) return undefined;
  const value: unknown = mapping[key];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`${invalidCode}: ${key}`);
  }
  return value;
}

function contextStringValue(
  mapping: Readonly<Record<string, string>>,
  key: string,
  missingCode: string,
  invalidCode: string,
): string {
  const value = optionalContextStringValue(mapping, key, invalidCode);
  if (value === undefined) throw new Error(`${missingCode}: ${key}`);
  return value;
}

function assertGeometryInPage(
  component: UIComponentSpec,
  page: UIImplementationSpec["pages"][number],
): void {
  const { x, y, width, height } = component.geometry;
  if (x + width > page.width || y + height > page.height) {
    throw new Error(
      `COMPONENT_OUT_OF_PAGE_BOUNDS: ${component.id} exceeds page ${page.id} ` +
        `(${x}+${width} <= ${page.width}; ${y}+${height} <= ${page.height})`,
    );
  }
}

function capabilityVariant(capabilityId: string): ControlVariant | undefined {
  const easyui = /^easyui\.(\d+)$/.exec(capabilityId);
  if (easyui) return { type: "easyui", proto: Number(easyui[1]) };
  const layout = /^layout\.(\d+)$/.exec(capabilityId);
  if (layout) return { type: "layout", layoutType: Number(layout[1]) };
  const prototype = /^prototype\.(.+)$/.exec(capabilityId);
  if (prototype) return { type: "prototype", prototypeName: prototype[1]! };
  return capabilityId.length > 0 ? { type: capabilityId } : undefined;
}

function unsupportedCapabilityError(
  code: string,
  component: UIComponentSpec,
  issues: readonly CapabilityIssue[],
): Error {
  const detail = issues
    .slice()
    .sort(compareIssues)
    .map((issue) => `${issue.token}: ${issue.reason}`)
    .join("; ");
  return new Error(`${code}: ${component.id} (${component.capabilityId})${detail ? ` — ${detail}` : ""}`);
}

function compareIssues(left: CapabilityIssue, right: CapabilityIssue): number {
  return left.token.localeCompare(right.token) || left.reason.localeCompare(right.reason);
}

function deduplicateIssues(issues: readonly CapabilityIssue[]): CapabilityIssue[] {
  const unique = new Map<string, CapabilityIssue>();
  for (const issue of issues) unique.set(`${issue.token}\u0000${issue.reason}`, issue);
  return [...unique.values()].sort(compareIssues);
}

interface ReportAccumulator {
  full: Set<string>;
  partial: Set<string>;
  unsupported: Set<string>;
  deliveryGaps: CapabilityReport["deliveryGaps"];
}

function createReportAccumulator(): ReportAccumulator {
  return { full: new Set(), partial: new Set(), unsupported: new Set(), deliveryGaps: [] };
}

function recordCapabilityStatus(report: ReportAccumulator, selected: SelectedCapability): void {
  const { capability } = selected;
  const isFull = capability.runtimeVerification.status === "verified"
    && [capability.generation, capability.style, capability.preview, capability.dataBinding, capability.interaction]
      .every((dimension) => dimension.status === "full");
  (isFull ? report.full : report.partial).add(selected.id);
}

function finalizeReport(report: ReportAccumulator): CapabilityReport {
  const full = [...report.full].sort();
  const partial = [...report.partial].sort();
  const unsupported = [...report.unsupported].sort();
  const deliveryGaps = report.deliveryGaps.slice().sort((left, right) =>
    left.componentId.localeCompare(right.componentId)
      || left.capability.localeCompare(right.capability)
      || left.reason.localeCompare(right.reason),
  );
  return {
    status: partial.length === 0 && unsupported.length === 0 ? "pass" : "warning",
    full,
    partial,
    unsupported,
    deliveryGaps,
  };
}
