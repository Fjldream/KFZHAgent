import { z } from "zod";
import type { ModuleDeliveryGap, UIComponentSpec } from "@kf/contracts";
import { getControlCapability } from "../../style/control-capability-registry.js";
import type { ModuleDefinition, ModuleRuntimeEvidence } from "../types.js";
import type { ModuleRegistry } from "../module-registry.js";
import { actionButton, formRow, imageSlot, labeledValue, repeatedCard, sectionTitle, surface, type LocalBounds } from "./shared-primitives.js";

const VERSION = "1.0.0";
const ALL_HEIGHTS = Object.freeze({ compact: 120, small: 180, medium: 260, large: 380, full: 520 });
const IMAGE_SLOT = Object.freeze([{ id: "image", required: false, allowedKinds: ["image"] as const }]);
const NO_ASSETS = Object.freeze([]);

const text = (max = 240) => z.string().trim().min(1).max(max);
const items = <T extends z.ZodTypeAny>(schema: T, max = 8) => z.array(schema).min(1).max(max);
const titleSchema = z.object({ title: text(), subtitle: text().optional(), description: text(800).optional() }).strict();
const definitionSchema = <T extends z.ZodTypeAny>(schema: T): z.ZodType<Record<string, unknown>> => schema as unknown as z.ZodType<Record<string, unknown>>;

function maturity(capabilities: readonly string[]): ModuleDefinition["maturity"] {
  return capabilities.every((id) => getControlCapability(id)?.runtimeVerification.status === "verified") ? "stable" : "beta";
}

function layout(regions: readonly ModuleDefinition["layout"]["regions"][number][], interactions: readonly ModuleDefinition["layout"]["interactions"][number][], minColumnSpan = 1): ModuleDefinition["layout"] {
  return Object.freeze({ regions: Object.freeze([...regions]), minColumnSpan, maxColumnSpan: 12, preferredHeights: Object.freeze(["compact", "small", "medium", "large", "full"] as const), interactions: Object.freeze([...interactions]), height: Object.freeze({ min: 120, preferred: ALL_HEIGHTS, max: 520 }) });
}

function define(input: Omit<ModuleDefinition, "version" | "maturity" | "runtimeEvidenceTarget">): ModuleDefinition {
  return Object.freeze({ ...input, version: VERSION, runtimeEvidenceTarget: { runtimeFamily: "KingFusion", runtimeVersion: "3.6", baselineId: "kf36-portal-v1" }, maturity: maturity(input.requiredKfCapabilities) });
}

function output(components: readonly UIComponentSpec[], deliveryGaps: readonly ModuleDeliveryGap[] = []) {
  // The compiler intentionally verifies plain mutable Array descriptors at the
  // definition boundary. Return fresh arrays; it freezes its canonical result.
  return { components: [...components], deliveryGaps: [...deliveryGaps] };
}

function bounds(width: number, height: number): LocalBounds { return { x: 0, y: 0, width, height }; }

function navigateAction(context: { instance: { interactions: readonly { type: string; pageId?: string }[] } }): { kind: "navigate"; pageId: string } | undefined {
  const interaction = context.instance.interactions.find((candidate) => candidate.type === "navigate");
  return interaction?.pageId === undefined ? undefined : { kind: "navigate", pageId: interaction.pageId };
}

function cols(width: number, count: number, index: number): LocalBounds {
  const gap = 16;
  const itemWidth = Math.floor((width - gap * (count - 1)) / count);
  return { x: index * (itemWidth + gap), y: 56, width: itemWidth, height: 180 };
}

const navigationTop = define({
  kind: "navigation.top", category: "navigation", variants: ["default", "compact"], contentSchema: definitionSchema(z.object({ logo: text(80), items: items(text(80), 8) }).strict()), assetSlots: NO_ASSETS, requiredKfCapabilities: ["layout.2", "text", "navmenu"], layout: layout(["header"], ["navigate"]),
  compile: ({ context }) => {
    const content = context.content as { logo: string; items: string[] };
    return output([surface("surface", bounds(1344, 40)), sectionTitle("logo", content.logo, { x: 12, y: 4, width: 220, height: 28 }), Object.freeze({ id: "menu", role: "navigation-menu", capabilityId: "navmenu", critical: true, content: undefined, geometry: { x: 260, y: 0, width: 1060, height: 40 }, properties: { mode: "horizontal", options: content.items.map((label, index) => ({ id: `nav-${index + 1}`, label })) }, style: { role: "surface", declarations: {}, states: {} } })]);
  },
});

const hero = define({
  kind: "content.hero", category: "content", variants: ["portrait-left", "portrait-right", "no-portrait"], contentSchema: definitionSchema(titleSchema.extend({ primaryAction: text(80).optional(), secondaryAction: text(80).optional() }).strict()), assetSlots: Object.freeze([{ id: "portrait", required: false, requiredForVariants: ["portrait-left", "portrait-right"], allowedKinds: ["image"] as const }]), requiredKfCapabilities: ["layout.2", "text", "image", "button"], layout: layout(["main"], ["navigate"]),
  compile: ({ context }) => {
    const content = context.content as { title: string; subtitle?: string; description?: string; primaryAction?: string; secondaryAction?: string };
    const portrait = context.instance.variant !== "no-portrait";
    const textX = context.instance.variant === "portrait-left" ? 400 : 40;
    const photoX = context.instance.variant === "portrait-left" ? 40 : 1040;
    const components: UIComponentSpec[] = [surface("surface", bounds(1344, 380)), sectionTitle("title", content.title, { x: textX, y: 54, width: portrait ? 580 : 1100, height: 44 })];
    if (content.subtitle !== undefined) components.push(labeledValue("subtitle", "", content.subtitle, { x: textX, y: 108, width: portrait ? 580 : 1100, height: 32 }));
    if (content.description !== undefined) components.push(labeledValue("description", "", content.description, { x: textX, y: 152, width: portrait ? 580 : 1100, height: 80 }));
    if (portrait) components.push(imageSlot("portrait", `${content.title} portrait`, { x: photoX, y: 40, width: 260, height: 300 }));
    if (content.primaryAction !== undefined) components.push(actionButton("primary-action", content.primaryAction, { x: textX, y: 266, width: 160, height: 40 }, "surface", navigateAction(context)));
    if (content.secondaryAction !== undefined) components.push(actionButton("secondary-action", content.secondaryAction, { x: textX + 176, y: 266, width: 160, height: 40 }, "surface", navigateAction(context)));
    return output(components);
  },
});

const kpiGrid = define({
  kind: "metric.kpi-grid", category: "metric", variants: ["default", "compact"], contentSchema: definitionSchema(z.object({ items: items(z.object({ label: text(80), value: text(80), trend: text(80).optional() }).strict(), 6) }).strict()), assetSlots: NO_ASSETS, requiredKfCapabilities: ["layout.2", "text"], layout: layout(["main"], []),
  compile: ({ context }) => {
    const values = (context.content as { items: Array<{ label: string; value: string; trend?: string }> }).items;
    const width = 1344;
    const components: UIComponentSpec[] = [surface("surface", bounds(width, 260)), sectionTitle("title", context.instance.title, { x: 0, y: 0, width, height: 36 }, "surface")];
    values.forEach((item, index) => { const card = cols(width, values.length, index); components.push(...repeatedCard(`kpi-${index + 1}`, item.label, item.value, card)); if (item.trend) components.push(labeledValue(`kpi-${index + 1}-trend`, "", item.trend, { x: card.x + 16, y: card.y + 112, width: card.width - 32, height: 28 })); });
    return output(components);
  },
});

const cardGrid = define({
  kind: "content.card-grid", category: "content", variants: ["default", "portfolio"], contentSchema: definitionSchema(z.object({ items: items(z.object({ title: text(120), summary: text(400), tag: text(80), action: text(80).optional() }).strict(), 12) }).strict()), assetSlots: IMAGE_SLOT, requiredKfCapabilities: ["layout.2", "text", "button", "image"], layout: layout(["main"], ["navigate"]),
  compile: ({ context }) => {
    const values = (context.content as { items: Array<{ title: string; summary: string; tag: string; action?: string }> }).items;
    const width = 1344; const count = Math.min(values.length, 3); const components: UIComponentSpec[] = [surface("surface", bounds(width, 380)), sectionTitle("title", context.instance.title, { x: 0, y: 0, width, height: 36 }, "surface")];
    values.forEach((item, index) => { const row = Math.floor(index / count); const card = { ...cols(width, count, index % count), y: 56 + row * 210 }; components.push(...repeatedCard(`card-${index + 1}`, item.title, item.summary, card)); components.push(Object.freeze({ id: `card-${index + 1}-tag`, role: "card-tag", capabilityId: "text", critical: true, content: item.tag, geometry: { x: card.x + 16, y: card.y + 112, width: 100, height: 28 }, properties: { parentId: `card-${index + 1}-surface` }, style: { role: "accent", declarations: {}, states: {} } })); if (context.asset?.status === "resolved") components.push(imageSlot(`card-${index + 1}-image`, item.title, { x: card.x + card.width - 96, y: card.y + 16, width: 80, height: 80 }, `card-${index + 1}-surface`)); if (item.action) components.push(actionButton(`card-${index + 1}-action`, item.action, { x: card.x + 16, y: card.y + 144, width: 120, height: 32 }, `card-${index + 1}-surface`)); });
    return output(components, values.length > 1 && context.asset?.status === "resolved" ? [{ moduleId: context.instance.id, requirement: "Per-item card assets", severity: "warning", status: "unresolved", reason: "per-item-assets-unsupported", alternatives: ["Use one shared cover image or provide a supported per-item asset catalog."] }] : []);
  },
});

const timeline = define({
  kind: "content.timeline", category: "content", variants: ["default", "experience"], contentSchema: definitionSchema(z.object({ items: items(z.object({ title: text(160), detail: text(400), date: text(80) }).strict(), 10) }).strict()), assetSlots: NO_ASSETS, requiredKfCapabilities: ["layout.2", "text"], layout: layout(["main"], []),
  compile: ({ context }) => {
    const values = (context.content as { items: Array<{ title: string; detail: string; date: string }> }).items;
    const components: UIComponentSpec[] = [surface("surface", bounds(1344, 260)), sectionTitle("title", context.instance.title, { x: 0, y: 0, width: 1344, height: 36 }, "surface")];
    values.forEach((item, index) => components.push(labeledValue(`event-${index + 1}`, item.date, `${item.title} · ${item.detail}`, { x: 36, y: 62 + index * 54, width: 900, height: 32 }, "surface")));
    return output(components, [{ moduleId: context.instance.id, requirement: "Native timeline", severity: "warning", status: "unresolved", reason: "native-timeline-not-implemented", alternatives: ["Use the generated text timeline or complete native timeline runtime verification."] }]);
  },
});

const tabsFilter = define({
  kind: "interaction.tabs-filter", category: "interaction", variants: ["default", "compact"], contentSchema: definitionSchema(z.object({ tabs: items(text(80), 8).refine((values) => new Set(values).size === values.length), active: text(80).optional() }).strict().superRefine((value, ctx) => { if (value.active !== undefined && !value.tabs.includes(value.active)) ctx.addIssue({ code: "custom", path: ["active"], message: "active must name a tab" }); })), assetSlots: NO_ASSETS, requiredKfCapabilities: ["tabs"], layout: layout(["main", "toolbar"], []),
  compile: ({ context }) => { const content = context.content as { tabs: string[]; active?: string }; const activeIndex = content.active === undefined ? 0 : content.tabs.indexOf(content.active); return output([surface("surface", bounds(800, 48)), Object.freeze({ id: "tabs", role: "filter-tabs", capabilityId: "tabs", critical: true, geometry: { x: 8, y: 4, width: 784, height: 40 }, properties: { tabs: content.tabs.map((label, index) => ({ id: `tab-${index + 1}`, label })), activeId: `tab-${activeIndex + 1}`, parentId: "surface" }, style: { role: "surface", declarations: {}, states: {} } })]); },
});

const recordEditor = define({
  kind: "form.record-editor", category: "form", variants: ["default", "contact"], contentSchema: definitionSchema(z.object({ fields: items(z.object({ id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/).max(80), label: text(80), placeholder: text(160) }).strict(), 8), submitLabel: text(80), resetLabel: text(80).optional() }).strict()), assetSlots: NO_ASSETS, requiredKfCapabilities: ["layout.2", "text", "input", "button"], layout: layout(["main"], []),
  compile: ({ context }) => { const content = context.content as { fields: Array<{ id: string; label: string; placeholder: string }>; submitLabel: string; resetLabel?: string }; const components: UIComponentSpec[] = [surface("surface", bounds(1344, 380)), sectionTitle("title", context.instance.title, { x: 24, y: 20, width: 700, height: 36 })]; content.fields.forEach((field, index) => components.push(...formRow(`field-${field.id}`, field.label, field.placeholder, { x: 24 + (index % 2) * 420, y: 72 + Math.floor(index / 2) * 92, width: 380, height: 76 }))); components.push(actionButton("submit", content.submitLabel, { x: 24, y: 300, width: 140, height: 40 })); if (content.resetLabel) components.push(actionButton("reset", content.resetLabel, { x: 180, y: 300, width: 140, height: 40 })); return output(components); },
});

const contactFooter = define({
  kind: "content.contact-footer", category: "content", variants: ["default", "compact"], contentSchema: definitionSchema(z.object({ contacts: items(z.object({ label: text(80), value: text(160) }).strict(), 6), copyright: text(160), action: text(80).optional() }).strict()), assetSlots: NO_ASSETS, requiredKfCapabilities: ["layout.2", "text", "button"], layout: layout(["footer", "main"], ["navigate"]),
  compile: ({ context }) => { const content = context.content as { contacts: Array<{ label: string; value: string }>; copyright: string; action?: string }; const components: UIComponentSpec[] = [surface("surface", bounds(1344, 180)), sectionTitle("copyright", content.copyright, { x: 20, y: 120, width: 500, height: 32 })]; content.contacts.forEach((contact, index) => components.push(labeledValue(`contact-${index + 1}`, contact.label, contact.value, { x: 20 + index * 210, y: 32, width: 190, height: 36 }))); if (content.action) components.push(actionButton("action", content.action, { x: 1120, y: 112, width: 160, height: 40 })); return output(components); },
});

export const PORTAL_MODULE_DEFINITIONS: readonly ModuleDefinition[] = Object.freeze([navigationTop, hero, kpiGrid, cardGrid, timeline, tabsFilter, recordEditor, contactFooter]);

export function registerPortalModules(registry: ModuleRegistry, evidence: readonly ModuleRuntimeEvidence[] = []): void {
  for (const definition of PORTAL_MODULE_DEFINITIONS) {
    const accepted = evidence.some((entry) => entry.kind === definition.kind && entry.version === definition.version
      && entry.runtimeFamily === definition.runtimeEvidenceTarget?.runtimeFamily && entry.runtimeVersion === definition.runtimeEvidenceTarget?.runtimeVersion
      && entry.baselineId === definition.runtimeEvidenceTarget?.baselineId && definition.requiredKfCapabilities.every((capability) => entry.verifiedCapabilities.includes(capability)));
    registry.register(accepted ? { ...definition, maturity: "stable" } : definition);
  }
}
