import {
  UIImplementationSpecSchema,
  type CapabilityReport,
  type ChangeOperation,
  type ChangePlan,
  type ControlCapability,
  type UIComponentSpec,
  type UIImplementationSpec,
} from "@kf/contracts";
import { getControlCapability } from "../style/control-capability-registry.js";
import { KF36_RUNTIME_PROFILE } from "../style/runtime-profile.js";
import { compileControlStyle } from "../style/style-engine.js";

export interface ImplementationCompileContext {
  workspaceId: string;
  pageGuidById: Readonly<Record<string, string>>;
  existingControlGuidByComponentId: Readonly<Record<string, string>>;
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
  layout: ["children", "panels"],
});

const CONTENT_CAPABILITIES = new Set(["button", "text", "richtext"]);

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
  const seenComponentIds = new Set<string>();

  for (const page of spec.pages) {
    const pageGuid = context.pageGuidById[page.id];
    if (pageGuid === undefined) {
      throw new Error(`UNKNOWN_PAGE_ID: ${page.id}`);
    }
    for (const component of page.components) {
      if (seenComponentIds.has(component.id)) {
        throw new Error(`DUPLICATE_COMPONENT_ID: ${component.id}`);
      }
      seenComponentIds.add(component.id);
      operations.push(...compileComponent(component, spec, pageGuid, context, report));
    }
  }

  return {
    plan: { schema: "kf-change-plan/v1", workspaceId: context.workspaceId, operations },
    capabilityReport: finalizeReport(report),
  };
}

function compileComponent(
  component: UIComponentSpec,
  spec: UIImplementationSpec,
  pageGuid: string,
  context: ImplementationCompileContext,
  report: ReportAccumulator,
): ChangeOperation[] {
  const primary = selectCapability(component.capabilityId, component, spec);
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
    if (context.existingControlGuidByComponentId[component.id] !== undefined) {
      throw unsupportedCapabilityError("UNSUPPORTED_EXISTING_CONTROL_FALLBACK", component, primaryIssues);
    }
    const fallback = selectCapability(component.fallbackCapabilityId, component, spec);
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

  const existingGuid = context.existingControlGuidByComponentId[component.id];
  if (existingGuid !== undefined) {
    const existingOperations: ChangeOperation[] = [{
      op: "applyStyle",
      entityId: existingGuid,
      entityType: "control",
      style: component.style,
    }];
    if (component.content !== undefined) {
      existingOperations.push({
        op: "update",
        entityId: existingGuid,
        entityType: "control",
        changes: [{ path: "/text", value: component.content }],
      });
    }
    return existingOperations;
  }

  return [{
    op: "create",
    entityId: component.id,
    entityType: "control",
    properties: createProperties(component, selected.id, pageGuid),
  }];
}

function selectCapability(
  capabilityId: string,
  component: UIComponentSpec,
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
  let compiled;
  try {
    compiled = compileControlStyle({
      capabilityId: capability.id,
      theme: spec.theme,
      instanceStyle: component.style,
      runtimeProfile: KF36_RUNTIME_PROFILE,
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { issues: [{ token: "style", reason: detail }] };
  }
  return {
    selected: { id: capability.id, capability },
    issues: compiled.unsupported.map((unsupported) => ({
      token: unsupported.token,
      reason: unsupported.reason,
    })),
  };
}

function createProperties(
  component: UIComponentSpec,
  capabilityId: string,
  pageId: string,
): Record<string, unknown> {
  const variant = capabilityVariant(capabilityId);
  if (variant === undefined) {
    throw new Error(`UNSUPPORTED_CAPABILITY_VARIANT: ${capabilityId}`);
  }
  const allowed = new Set([...(PROPERTY_KEYS[variant.type] ?? []), "parentId"]);
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
  return {
    pageId,
    ...variant,
    x: component.geometry.x,
    y: component.geometry.y,
    width: component.geometry.width,
    height: component.geometry.height,
    ...properties,
    style: component.style,
  };
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
