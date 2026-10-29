import type { CapabilityStatus, ControlCapability } from "@kf/contracts";
import {
  supportedControlTypes,
  supportedEasyuiProtos,
  supportedPrototypeNames,
} from "../compile/control-compiler.js";

const LAYOUT_TYPES = Object.freeze([0, 2, 3, 4, 5, 6]);
const NON_STATIC_CONTROL_TYPES = new Set(["easyui", "layout", "prototype"]);

interface InteractiveCapabilityNode {
  readonly capabilityId: string;
  readonly eventBindings: readonly {
    readonly semanticEvent: string;
    readonly actionIds: readonly string[];
  }[];
}

/**
 * 将语义触发所有权映射到证据支持的原生触发所有者。
 * 不支持的控件，包括图像，保留其原始能力，以便交互编译器可以发出一个精确的未触发触发诊断。
 */
export function effectiveInteractiveCapability(node: InteractiveCapabilityNode): string {
  if (node.capabilityId !== "text") return node.capabilityId;
  return node.eventBindings.some((binding) =>
    binding.semanticEvent === "click" && binding.actionIds.length > 0)
    ? "button"
    : node.capabilityId;
}

function dimension(
  status: CapabilityStatus,
  supported: string[] = [],
  unsupported: string[] = [],
) {
  return { status, supported, unsupported };
}

function pendingCapability(
  id: string,
  category: ControlCapability["category"],
  displayName: string,
): ControlCapability {
  return {
    id,
    category,
    displayName,
    generation: dimension("pending-verification", ["local deterministic implementation"]),
    style: {
      ...dimension("pending-verification", ["local deterministic implementation"]),
      adapter: id,
    },
    preview: dimension("pending-verification", ["local deterministic implementation"]),
    dataBinding: dimension("pending-verification", ["local deterministic implementation"]),
    interaction: dimension("pending-verification", ["local deterministic implementation"]),
    runtimeVerification: { status: "unverified" },
    limitations: ["Real KF 3.6 runtime verification and screenshot baseline are deferred."],
  };
}

function deferredCapability(
  id: string,
  category: ControlCapability["category"],
  displayName: string,
  styleStatus: Extract<CapabilityStatus, "partial" | "preserve-only" | "unsupported">,
  limitation: string,
): ControlCapability {
  return {
    id,
    category,
    displayName,
    generation: dimension("partial", ["reviewed template compilation"]),
    style: dimension(styleStatus, [], ["structured style declarations"]),
    preview: dimension("preserve-only", ["existing serialized appearance"]),
    dataBinding: dimension("preserve-only", ["existing native configuration"]),
    interaction: dimension("preserve-only", ["existing native configuration"]),
    runtimeVerification: { status: "unverified" },
    limitations: [limitation],
  };
}

function freezeDimension<T extends { supported: string[]; unsupported: string[] }>(dimension: T): T {
  Object.freeze(dimension.supported);
  Object.freeze(dimension.unsupported);
  return Object.freeze(dimension);
}

function freezeCapability(capability: ControlCapability): ControlCapability {
  freezeDimension(capability.generation);
  freezeDimension(capability.style);
  freezeDimension(capability.preview);
  freezeDimension(capability.dataBinding);
  freezeDimension(capability.interaction);
  Object.freeze(capability.runtimeVerification);
  Object.freeze(capability.limitations);
  return Object.freeze(capability);
}

/**
 * 每台编译器库存记录的显式能力记录。新编译器库存必须在这里故意添加；assertCapabilityCoverage() 会使得意外遗漏快速失败，而不是默认支持。
 */
const CONTROL_CAPABILITIES: readonly ControlCapability[] = Object.freeze([
  pendingCapability("button", "static", "Button"),
  pendingCapability("text", "static", "Text"),
  pendingCapability("richtext", "static", "Rich text"),
  pendingCapability("image", "static", "Image"),
  pendingCapability("tag", "static", "Tag"),
  pendingCapability("input", "static", "Input"),
  pendingCapability("inputnumber", "static", "Number input"),
  pendingCapability("select", "static", "Select"),
  pendingCapability("checkbox", "static", "Checkbox"),
  pendingCapability("radio", "static", "Radio"),
  pendingCapability("switch", "static", "Switch"),
  pendingCapability("datetimepicker", "static", "Date/time picker"),
  pendingCapability("tabs", "static", "Tabs"),
  pendingCapability("spacer", "static", "Spacer"),
  deferredCapability("table", "static", "Table", "preserve-only", "Complex table styling requires a dedicated adapter."),
  deferredCapability("radiolegacy", "static", "Legacy radio", "preserve-only", "Legacy control styling has not been reviewed."),
  deferredCapability("checkboxlegacy", "static", "Legacy checkbox", "preserve-only", "Legacy control styling has not been reviewed."),
  deferredCapability("combobox", "static", "Combobox", "preserve-only", "Combobox styling is deferred to a dedicated adapter."),
  deferredCapability("scale", "static", "Scale", "preserve-only", "Scale styling is deferred to a dedicated adapter."),
  deferredCapability("list", "static", "List", "preserve-only", "List styling is deferred to a dedicated adapter."),
  deferredCapability("treeview", "static", "Tree view", "preserve-only", "Tree view styling is deferred to a dedicated adapter."),
  deferredCapability("webcontainer", "static", "Web container", "unsupported", "Web containers are not a native-style implementation surface."),
  deferredCapability("gantt", "static", "Gantt", "preserve-only", "Gantt styling and data rendering require a dedicated adapter."),
  deferredCapability("factorycalendar", "static", "Factory calendar", "preserve-only", "Factory calendar styling is deferred to a dedicated adapter."),
  deferredCapability("cascader", "static", "Cascader", "preserve-only", "Cascader styling is deferred to a dedicated adapter."),
  deferredCapability("dropdown", "static", "Dropdown", "preserve-only", "Dropdown styling is deferred to a dedicated adapter."),
  deferredCapability("navmenu", "static", "Navigation menu", "preserve-only", "Navigation menu styling is deferred to a dedicated adapter."),
  deferredCapability("tree", "static", "Tree", "preserve-only", "Tree styling is deferred to a dedicated adapter."),
  deferredCapability("upload", "static", "Upload", "preserve-only", "Upload styling is deferred to a dedicated adapter."),
  deferredCapability("transfer", "static", "Transfer", "preserve-only", "Transfer styling is deferred to a dedicated adapter."),
  deferredCapability("timeline", "static", "Timeline", "preserve-only", "Timeline styling is deferred to a dedicated adapter."),
  deferredCapability("steps", "static", "Steps", "preserve-only", "Steps styling is deferred to a dedicated adapter."),

  deferredCapability("easyui.0", "easyui", "EasyUI combobox", "preserve-only", "EasyUI combobox styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.1", "easyui", "EasyUI datagrid", "preserve-only", "Complex EasyUI datagrid styling is deferred to a dedicated adapter."),
  pendingCapability("easyui.2", "easyui", "EasyUI link button"),
  deferredCapability("easyui.3", "easyui", "EasyUI number box", "preserve-only", "EasyUI number box styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.4", "easyui", "EasyUI number spinner", "preserve-only", "EasyUI number spinner styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.5", "easyui", "EasyUI property grid", "preserve-only", "EasyUI property grid styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.6", "easyui", "EasyUI search box", "preserve-only", "EasyUI search box styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.7", "easyui", "EasyUI slider", "preserve-only", "EasyUI slider styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.8", "easyui", "EasyUI spinner", "preserve-only", "EasyUI spinner styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.9", "easyui", "EasyUI text box", "preserve-only", "EasyUI text box styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.10", "easyui", "EasyUI time spinner", "preserve-only", "EasyUI time spinner styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.11", "easyui", "EasyUI date box", "preserve-only", "EasyUI date box styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.12", "easyui", "EasyUI dialog", "preserve-only", "EasyUI dialog styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.13", "easyui", "EasyUI file box", "preserve-only", "EasyUI file box styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.14", "easyui", "EasyUI menu button", "preserve-only", "EasyUI menu button styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.15", "easyui", "EasyUI progress bar", "preserve-only", "EasyUI progress bar styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.16", "easyui", "EasyUI tooltip", "preserve-only", "EasyUI tooltip styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.17", "easyui", "EasyUI tree", "preserve-only", "EasyUI tree styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.18", "easyui", "EasyUI tree grid", "preserve-only", "EasyUI tree grid styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.19", "easyui", "EasyUI window", "preserve-only", "EasyUI window styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.20", "easyui", "EasyUI calendar", "preserve-only", "EasyUI calendar styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.21", "easyui", "EasyUI date/time box", "preserve-only", "EasyUI date/time box styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.22", "easyui", "EasyUI pagination", "preserve-only", "EasyUI pagination styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.24", "easyui", "EasyUI combo tree", "preserve-only", "EasyUI combo tree styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.25", "easyui", "EasyUI tag box", "preserve-only", "EasyUI tag box styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.26", "easyui", "EasyUI side menu", "preserve-only", "EasyUI side menu styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.27", "easyui", "EasyUI switch button", "preserve-only", "EasyUI switch button styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.28", "easyui", "EasyUI validate box", "preserve-only", "EasyUI validate box styling is deferred to a dedicated adapter."),
  deferredCapability("easyui.29", "easyui", "EasyUI image carousel", "preserve-only", "EasyUI image carousel styling is deferred to a dedicated adapter."),

  deferredCapability("layout.0", "layout", "Accordion layout", "preserve-only", "Accordion layout styling is deferred to a dedicated adapter."),
  pendingCapability("layout.2", "layout", "Horizontal layout"),
  deferredCapability("layout.3", "layout", "Tab layout", "preserve-only", "Tab layout styling is deferred to a dedicated adapter."),
  pendingCapability("layout.4", "layout", "Vertical layout"),
  pendingCapability("layout.5", "layout", "Docking layout"),
  pendingCapability("layout.6", "layout", "Project flow chart layout"),

  deferredCapability("prototype.CustomCharts", "prototype", "Custom charts", "preserve-only", "Generation is limited to an unconfigured shell; objects/options and styling require a positive dedicated schema."),
  deferredCapability("prototype.AlarmWindow", "prototype", "Alarm window", "preserve-only", "Alarm window styling is deferred to a dedicated adapter."),
  deferredCapability("prototype.EventWindow", "prototype", "Event window", "preserve-only", "Event window styling is deferred to a dedicated adapter."),
  deferredCapability("prototype.TrendChart", "prototype", "Trend chart", "preserve-only", "Trend chart styling and data rendering require a dedicated adapter."),
  deferredCapability("prototype.BarChart", "prototype", "Bar chart", "preserve-only", "Bar chart styling and data rendering require a dedicated adapter."),
  deferredCapability("prototype.PieChart", "prototype", "Pie chart", "preserve-only", "Pie chart styling and data rendering require a dedicated adapter."),
  deferredCapability("prototype.XYChart", "prototype", "XY chart", "preserve-only", "XY chart styling and data rendering require a dedicated adapter."),
].sort((left, right) => left.id.localeCompare(right.id)).map(freezeCapability));

export function listControlCapabilities(): readonly ControlCapability[] {
  return CONTROL_CAPABILITIES;
}

export function getControlCapability(id: string): ControlCapability | undefined {
  return CONTROL_CAPABILITIES.find((capability) => capability.id === id);
}

// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
/** Visual generation cannot treat a reviewed template shell as a working UI adapter. */
export function supportsNewVisualGeneration(capability: ControlCapability): boolean {
  const complete = new Set<CapabilityStatus>(["full", "pending-verification"]);
  return complete.has(capability.generation.status) && complete.has(capability.style.status);
}
// end

/** 如果审查的编译器库存和明确的能力记录不一致，则抛出异常。 */
export function assertCapabilityCoverage(): void {
  const expectedIds = [
    ...supportedControlTypes()
      .filter((controlType) => !NON_STATIC_CONTROL_TYPES.has(controlType)),
    ...supportedEasyuiProtos().map((proto) => `easyui.${proto}`),
    ...LAYOUT_TYPES.map((layoutType) => `layout.${layoutType}`),
    ...supportedPrototypeNames().map((prototypeName) => `prototype.${prototypeName}`),
  ].sort();
  const actualIds = CONTROL_CAPABILITIES.map((capability) => capability.id).sort();
  const actualIdSet = new Set(actualIds);
  const duplicateIds = actualIds.filter((id, index) => index > 0 && id === actualIds[index - 1]);
  const missingIds = expectedIds.filter((id) => !actualIdSet.has(id));
  const expectedIdSet = new Set(expectedIds);
  const unexpectedIds = actualIds.filter((id) => !expectedIdSet.has(id));

  if (duplicateIds.length > 0 || missingIds.length > 0 || unexpectedIds.length > 0) {
    throw new Error(
      "CONTROL_CAPABILITY_COVERAGE_MISMATCH: " +
        `missing=[${missingIds.join(", ")}]; ` +
        `unexpected=[${unexpectedIds.join(", ")}]; ` +
        `duplicates=[${duplicateIds.join(", ")}]`,
    );
  }
}
