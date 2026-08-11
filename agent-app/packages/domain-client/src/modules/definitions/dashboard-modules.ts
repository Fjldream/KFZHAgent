import { z } from "zod";
import type { ModuleDeliveryGap, UIComponentSpec } from "@kf/contracts";
import type { ModuleCompileInput, ModuleCompileOutput, ModuleDefinition, ModuleRuntimeEvidence } from "../types.js";
import type { ModuleRegistry } from "../module-registry.js";
import { actionButton, labeledValue, sectionTitle, surface, type LocalBounds } from "./shared-primitives.js";
import { parseChartData } from "./native-data-adapters.js";

const VERSION = "1.0.0";
const NO_ASSETS = Object.freeze([]);
const text = (max = 180) => z.string().trim().min(1).max(max);
const schema = <T extends z.ZodTypeAny>(value: T): z.ZodType<Record<string, unknown>> => value as unknown as z.ZodType<Record<string, unknown>>;

function layout(regions: readonly ModuleDefinition["layout"]["regions"][number][], interactions: readonly ModuleDefinition["layout"]["interactions"][number][], min: number, max: number): ModuleDefinition["layout"] {
  const height = (target: number) => Math.min(max, Math.max(min, target));
  return Object.freeze({ regions: Object.freeze([...regions]), minColumnSpan: 1, maxColumnSpan: 12, preferredHeights: Object.freeze(["compact", "small", "medium", "large", "full"] as const), interactions: Object.freeze([...interactions]), height: Object.freeze({ min, preferred: Object.freeze({ compact: min, small: height(180), medium: height(300), large: height(460), full: max }), max }) });
}

function gap(id: string): ModuleCompileOutput { return { components: [], deliveryGaps: [{ moduleId: id, requirement: "Module local bounds", severity: "blocking", status: "unresolved", reason: "module-bounds-insufficient", alternatives: ["Increase module span or semantic height."] }] }; }
function safe(definition: Omit<ModuleDefinition, "version" | "maturity" | "runtimeEvidenceTarget">): ModuleDefinition {
  const compile = definition.compile;
  return Object.freeze({ ...definition, compilerFingerprint: definition.compilerFingerprint ?? `kf36-${definition.kind.replace(".", "-")}-compiler-v1`, layoutFingerprint: definition.layoutFingerprint ?? `kf36-${definition.kind.replace(".", "-")}-layout-v1`, quality: definition.quality ?? Object.freeze({ minimumComponentCount: 2, minimumCriticalComponentCount: 1, requiredRoles: Object.freeze(["surface"]), requiredCriticalRoles: Object.freeze(["surface"]), requiredCapabilityIds: Object.freeze(["layout.2"]) }), version: VERSION, maturity: "beta", runtimeEvidenceTarget: { runtimeFamily: "KingFusion", runtimeVersion: "3.6", baselineId: "kf36-dashboard-admin-v1" }, compile: (input: ModuleCompileInput): ModuleCompileOutput => {
    const result = compile(input); const { width, height } = input.context.bounds;
    const bad = result.components.some((component) => { const box = component.geometry; return !Number.isInteger(box.x) || !Number.isInteger(box.y) || !Number.isInteger(box.width) || !Number.isInteger(box.height) || box.x < 0 || box.y < 0 || box.width <= 0 || box.height <= 0 || box.x + box.width > width || box.y + box.height > height; });
    return bad ? gap(input.context.instance.id) : result;
  } });
}
function local(input: ModuleCompileInput, minWidth: number, minHeight: number): LocalBounds | undefined { const { width, height } = input.context.bounds; return width >= minWidth && height >= minHeight ? { x: 0, y: 0, width, height } : undefined; }
function makeTag(id: string, bounds: LocalBounds, parentId: string): UIComponentSpec { return Object.freeze({ id, role: "status-tag", capabilityId: "tag", critical: true, geometry: Object.freeze(bounds), properties: Object.freeze({ effect: "dark", closable: false, hit: false, parentId }), style: Object.freeze({ role: "accent", declarations: Object.freeze({}), states: Object.freeze({}) }) }); }
function action(input: ModuleCompileInput, index: number): { kind: "navigate"; pageId: string } | undefined { const item = input.context.instance.interactions.filter((entry) => entry.type === "navigate")[index]; return item?.type === "navigate" ? { kind: "navigate", pageId: item.pageId } : undefined; }
function actionGaps(input: ModuleCompileInput, expected: number): readonly ModuleDeliveryGap[] { const navigations = input.context.instance.interactions.filter((entry) => entry.type === "navigate").length; return navigations === expected && input.context.instance.interactions.length === expected ? [] : [{ moduleId: input.context.instance.id, requirement: "Declared native navigation actions", severity: "warning", status: "unresolved", reason: "navigate-interaction-mismatch", alternatives: ["Supply exactly one navigate interaction for each action."] }]; }

const sidebar = safe({
  kind: "navigation.sidebar", category: "navigation", variants: ["default", "collapsed"], contentSchema: schema(z.object({ groups: z.array(z.object({ label: text(80), items: z.array(text(80)).min(1).max(12) }).strict()).min(1).max(8) }).strict()), assetSlots: NO_ASSETS, requiredKfCapabilities: ["layout.2", "text", "button"], layout: layout(["sidebar"], ["navigate"], 160, 720),
  compile: (input) => { const box = local(input, input.context.instance.variant === "collapsed" ? 100 : 160, 120); if (!box) return gap(input.context.instance.id); const content = input.context.content as { groups: Array<{ label: string; items: string[] }> }; const rows = content.groups.reduce((total, group) => total + group.items.length + 1, 0); if (box.height < rows * 34 + 16) return gap(input.context.instance.id); const result: UIComponentSpec[] = [surface("surface", box)]; let y = 8; let actionIndex = 0; content.groups.forEach((group, groupIndex) => { result.push(sectionTitle(`group-${groupIndex + 1}`, input.context.instance.variant === "collapsed" ? group.label.slice(0, 1) : group.label, { x: 10, y, width: box.width - 20, height: 26 }, "surface")); y += 30; group.items.forEach((label, itemIndex) => { result.push(actionButton(`item-${groupIndex + 1}-${itemIndex + 1}`, input.context.instance.variant === "collapsed" ? label.slice(0, 1) : label, { x: 10, y, width: box.width - 20, height: 28 }, "surface", action(input, actionIndex++))); y += 34; }); }); return { components: result, deliveryGaps: actionGaps(input, actionIndex) }; },
});

const chartPanel = safe({
  kind: "data.chart-panel", category: "data", variants: ["line", "bar", "pie"], contentSchema: schema(z.object({ chart: z.unknown() }).strict().superRefine((value, ctx) => { try { parseChartData(value.chart); } catch (error) { ctx.addIssue({ code: "custom", path: ["chart"], message: error instanceof Error ? error.message : "invalid chart" }); } })), assetSlots: NO_ASSETS, requiredKfCapabilities: ["layout.2", "text", "prototype.TrendChart", "prototype.BarChart", "prototype.PieChart"], layout: layout(["main"], [], 180, 900),
  compile: (input) => { const box = local(input, 280, 180); if (!box) return gap(input.context.instance.id); const chart = parseChartData((input.context.content as { chart: unknown }).chart); if (chart.kind !== input.context.instance.variant) return { components: [], deliveryGaps: [{ moduleId: input.context.instance.id, requirement: "Chart variant", severity: "blocking", status: "unresolved", reason: "chart-kind-variant-mismatch", alternatives: ["Select the module variant matching chart.kind."] }] }; return { components: [], deliveryGaps: [{ moduleId: input.context.instance.id, requirement: "Static chart series", severity: "blocking", status: "unresolved", reason: "kf36-static-chart-series-mapping-unverified", alternatives: ["Provide a KF 3.6 chart fixture with persisted static point values, or bind verified runtime data sources."] }] }; },
});

const statusGrid = safe({
  kind: "data.status-grid", category: "data", variants: ["default", "compact"], contentSchema: schema(z.object({ items: z.array(z.object({ name: text(100), severity: z.enum(["online", "warning", "critical", "offline"]), detail: text(180).optional() }).strict()).min(1).max(24) }).strict()), assetSlots: NO_ASSETS, requiredKfCapabilities: ["layout.2", "text", "tag"], layout: layout(["main"], [], 140, 900),
  compile: (input) => { const box = local(input, 200, 140); if (!box) return gap(input.context.instance.id); const items = (input.context.content as { items: Array<{ name: string; severity: string; detail?: string }> }).items; const columns = Math.max(1, Math.min(4, Math.floor(box.width / 200))); const rows = Math.ceil(items.length / columns); const cellHeight = input.context.instance.variant === "compact" ? 58 : 82; if (box.height < 42 + rows * cellHeight) return gap(input.context.instance.id); const cellWidth = Math.floor((box.width - 16) / columns); const components: UIComponentSpec[] = [surface("surface", box), sectionTitle("title", input.context.instance.title, { x: 8, y: 8, width: box.width - 16, height: 26 }, "surface")]; items.forEach((item, index) => { const x = 8 + (index % columns) * cellWidth; const y = 42 + Math.floor(index / columns) * cellHeight; components.push(makeTag(`status-${index + 1}-tag`, { x, y, width: 24, height: 24 }, "surface"), labeledValue(`status-${index + 1}`, item.name, `${item.severity.toUpperCase()}${item.detail ? ` · ${item.detail}` : ""}`, { x: x + 32, y, width: cellWidth - 40, height: cellHeight - 8 }, "surface")); }); return { components, deliveryGaps: [] }; },
});

export function registerDashboardModules(registry: ModuleRegistry, evidence: readonly ModuleRuntimeEvidence[] = []): void {
  for (const definition of [sidebar, chartPanel, statusGrid]) {
    const accepted = evidence.some((entry) => entry.kind === definition.kind && entry.version === definition.version
      && entry.runtimeFamily === definition.runtimeEvidenceTarget?.runtimeFamily && entry.runtimeVersion === definition.runtimeEvidenceTarget?.runtimeVersion
      && entry.baselineId === definition.runtimeEvidenceTarget?.baselineId && definition.requiredKfCapabilities.every((capability) => entry.verifiedCapabilities.includes(capability)));
    registry.register(accepted ? { ...definition, maturity: "stable" } : definition);
  }
}
