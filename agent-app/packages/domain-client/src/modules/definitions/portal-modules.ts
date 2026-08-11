import { z } from "zod";
import type { ModuleDeliveryGap, UIComponentSpec } from "@kf/contracts";
import type { ModuleCompileInput, ModuleCompileOutput, ModuleDefinition, ModuleRuntimeEvidence } from "../types.js";
import type { ModuleRegistry } from "../module-registry.js";
import { actionButton, formRow, imageSlot, labeledValue, repeatedCard, sectionTitle, surface, type LocalBounds } from "./shared-primitives.js";

const VERSION = "1.0.0";
const IMAGE_SLOT = Object.freeze([{ id: "image", required: false, allowedKinds: ["image"] as const }]);
const NO_ASSETS = Object.freeze([]);

const text = (max = 240) => z.string().trim().min(1).max(max);
const items = <T extends z.ZodTypeAny>(schema: T, max = 8) => z.array(schema).min(1).max(max);
const titleSchema = z.object({ title: text(), subtitle: text().optional(), description: text(800).optional() }).strict();
const definitionSchema = <T extends z.ZodTypeAny>(schema: T): z.ZodType<Record<string, unknown>> => schema as unknown as z.ZodType<Record<string, unknown>>;

function layout(regions: readonly ModuleDefinition["layout"]["regions"][number][], interactions: readonly ModuleDefinition["layout"]["interactions"][number][], minColumnSpan = 1, min = 120, max = 960): ModuleDefinition["layout"] {
  const preferred = Object.freeze({ compact: min, small: Math.max(min, 180), medium: Math.max(min, 300), large: Math.max(min, 520), full: max });
  return Object.freeze({ regions: Object.freeze([...regions]), minColumnSpan, maxColumnSpan: 12, preferredHeights: Object.freeze(["compact", "small", "medium", "large", "full"] as const), interactions: Object.freeze([...interactions]), height: Object.freeze({ min, preferred, max }) });
}

function define(input: Omit<ModuleDefinition, "version" | "maturity" | "runtimeEvidenceTarget">): ModuleDefinition {
  const compile = input.compile;
  return Object.freeze({ ...input, compilerIdentity: input.compilerIdentity ?? compile.toString(), quality: input.quality ?? Object.freeze({ minimumComponentCount: 2, minimumCriticalComponentCount: 1, requiredRoles: Object.freeze(["surface"]), requiredCriticalRoles: Object.freeze(["surface"]), requiredCapabilityIds: Object.freeze(["layout.2"]) }), version: VERSION, runtimeEvidenceTarget: { runtimeFamily: "KingFusion", runtimeVersion: "3.6", baselineId: "kf36-portal-v1" }, maturity: "beta", compile: (input: ModuleCompileInput): ModuleCompileOutput => {
    const result = compile(input); const { width, height } = input.context.bounds;
    const invalid = result.components.some((component) => { const g = component.geometry; return !Number.isInteger(g.x) || !Number.isInteger(g.y) || !Number.isInteger(g.width) || !Number.isInteger(g.height) || g.width <= 0 || g.height <= 0 || g.x < 0 || g.y < 0 || g.x + g.width > width || g.y + g.height > height; });
    return invalid ? { components: [], deliveryGaps: [...result.deliveryGaps, { moduleId: input.context.instance.id, requirement: "Module local bounds", severity: "blocking" as const, status: "unresolved" as const, reason: "module-bounds-insufficient", alternatives: ["Increase module span or semantic height."] }] } : result;
  } });
}

function output(components: readonly UIComponentSpec[], deliveryGaps: readonly ModuleDeliveryGap[] = []) {
  // The compiler intentionally verifies plain mutable Array descriptors at the
  // definition boundary. Return fresh arrays; it freezes its canonical result.
  return { components: [...components], deliveryGaps: [...deliveryGaps] };
}

function bounds(width: number, height: number): LocalBounds { return { x: 0, y: 0, width, height }; }

function insufficient(context: { instance: { id: string } }): ReturnType<typeof output> {
  return output([], [{ moduleId: context.instance.id, requirement: "Module local bounds", severity: "blocking", status: "unresolved", reason: "module-bounds-insufficient", alternatives: ["Increase module span or semantic height."] }]);
}

function local(context: { bounds: { width: number; height: number } }, minWidth: number, minHeight: number): LocalBounds | undefined {
  return context.bounds.width >= minWidth && context.bounds.height >= minHeight ? bounds(context.bounds.width, context.bounds.height) : undefined;
}

function interactionGaps(context: { instance: { id: string; interactions: readonly { type: string }[] } }, actionCount: number): readonly ModuleDeliveryGap[] {
  const navigations = context.instance.interactions.filter((entry) => entry.type === "navigate").length;
  const unsupported = context.instance.interactions.length - navigations;
  if (navigations === actionCount && unsupported === 0) return [];
  return [{ moduleId: context.instance.id, requirement: "Declared native navigation actions", severity: "warning", status: "unresolved", reason: "navigate-interaction-mismatch", alternatives: ["Supply exactly one navigate interaction for each actionable label."] }];
}

function navigateAction(context: { instance: { interactions: readonly { type: string; pageId?: string }[] } }, index = 0): { kind: "navigate"; pageId: string } | undefined {
  const interaction = context.instance.interactions.filter((candidate) => candidate.type === "navigate")[index];
  return interaction?.pageId === undefined ? undefined : { kind: "navigate", pageId: interaction.pageId };
}

const navigationTop = define({
  kind: "navigation.top", category: "navigation", variants: ["default", "compact"], contentSchema: definitionSchema(z.object({ logo: text(80), items: items(text(80), 8) }).strict()), assetSlots: NO_ASSETS, requiredKfCapabilities: ["layout.2", "text", "button"], layout: layout(["header"], ["navigate"]),
  compile: ({ context }) => {
    const content = context.content as { logo: string; items: string[] };
    const box = local(context, 160, 40); if (!box) return insufficient(context);
    const logoWidth = Math.min(220, Math.floor(box.width / 3));
    const menuX = logoWidth + 16; const menuWidth = box.width - menuX - 8; const itemWidth = Math.floor(menuWidth / content.items.length); if (itemWidth < 40) return insufficient(context); const components: UIComponentSpec[] = [surface("surface", box), sectionTitle("logo", content.logo, { x: 8, y: 4, width: logoWidth, height: Math.min(28, box.height - 8) }, "surface")]; content.items.forEach((label, index) => components.push(actionButton(`nav-${index + 1}`, label, { x: menuX + index * itemWidth, y: 4, width: index === content.items.length - 1 ? menuWidth - index * itemWidth : itemWidth - 4, height: box.height - 8 }, "surface", navigateAction(context, index)))); return output(components, interactionGaps(context, content.items.length));
  },
});

const hero = define({
  kind: "content.hero", category: "content", variants: ["portrait-left", "portrait-right", "no-portrait"], contentSchema: definitionSchema(titleSchema.extend({ primaryAction: text(80).optional(), secondaryAction: text(80).optional() }).strict()), assetSlots: Object.freeze([{ id: "portrait", required: false, requiredForVariants: ["portrait-left", "portrait-right"], allowedKinds: ["image"] as const }]), requiredKfCapabilities: ["layout.2", "text", "image", "button"], layout: layout(["main"], ["navigate"]),
  compile: ({ context }) => {
    const content = context.content as { title: string; subtitle?: string; description?: string; primaryAction?: string; secondaryAction?: string };
    const box = local(context, context.instance.variant === "no-portrait" ? 240 : 480, 180); if (!box) return insufficient(context);
    const portrait = context.instance.variant !== "no-portrait"; const pad = 16; const photoWidth = portrait ? Math.min(Math.floor(box.width * .3), Math.floor(box.height * .7)) : 0; const textX = context.instance.variant === "portrait-left" ? pad + photoWidth + pad : pad; const photoX = context.instance.variant === "portrait-left" ? pad : box.width - pad - photoWidth; const textWidth = portrait ? box.width - photoWidth - pad * 3 : box.width - pad * 2;
    const components: UIComponentSpec[] = [surface("surface", box), sectionTitle("title", content.title, { x: textX, y: pad, width: textWidth, height: 36 }, "surface")];
    if (content.subtitle !== undefined) components.push(labeledValue("subtitle", "", content.subtitle, { x: textX, y: 58, width: textWidth, height: 28 }, "surface"));
    if (content.description !== undefined) components.push(labeledValue("description", "", content.description, { x: textX, y: 94, width: textWidth, height: Math.max(28, box.height - 150) }, "surface"));
    if (portrait) components.push(imageSlot("portrait", `${content.title} portrait`, { x: photoX, y: pad, width: photoWidth, height: box.height - pad * 2 }, "surface"));
    if (content.primaryAction !== undefined) components.push(actionButton("primary-action", content.primaryAction, { x: textX, y: box.height - 48, width: Math.min(140, textWidth), height: 32 }, "surface", navigateAction(context)));
    if (content.secondaryAction !== undefined) components.push(actionButton("secondary-action", content.secondaryAction, { x: textX + Math.min(148, textWidth), y: box.height - 48, width: Math.min(140, textWidth), height: 32 }, "surface", navigateAction(context, 1)));
    return output(components, interactionGaps(context, (content.primaryAction ? 1 : 0) + (content.secondaryAction ? 1 : 0)));
  },
});

const kpiGrid = define({
  kind: "metric.kpi-grid", category: "metric", variants: ["default", "compact"], contentSchema: definitionSchema(z.object({ items: items(z.object({ label: text(80), value: text(80), trend: text(80).optional() }).strict(), 6) }).strict()), assetSlots: NO_ASSETS, requiredKfCapabilities: ["layout.2", "text"], layout: layout(["main"], []),
  compile: ({ context }) => {
    const values = (context.content as { items: Array<{ label: string; value: string; trend?: string }> }).items;
    const box = local(context, 180, 150); if (!box) return insufficient(context); const gap = 12; const columns = Math.max(1, Math.min(values.length, Math.floor((box.width + gap) / 180))); const cardWidth = Math.floor((box.width - gap * (columns - 1)) / columns); const rows = Math.ceil(values.length / columns); const cardHeight = 132; const required = 44 + rows * cardHeight + Math.max(0, rows - 1) * gap + 12; if (box.height < required) return insufficient(context);
    const components: UIComponentSpec[] = [surface("surface", box), sectionTitle("title", context.instance.title, { x: 8, y: 8, width: box.width - 16, height: 28 }, "surface")];
    values.forEach((item, index) => { const col = index % columns; const row = Math.floor(index / columns); const card = { x: col * (cardWidth + gap), y: 44 + row * (cardHeight + gap), width: cardWidth, height: cardHeight }; components.push(...repeatedCard(`kpi-${index + 1}`, item.label, item.value, card)); if (item.trend) components.push(labeledValue(`kpi-${index + 1}-trend`, "", item.trend, { x: card.x + 12, y: card.y + 94, width: card.width - 24, height: 24 }, `kpi-${index + 1}-surface`)); });
    return output(components);
  },
});

const cardGrid = define({
  kind: "content.card-grid", category: "content", variants: ["default", "portfolio"], contentSchema: definitionSchema(z.object({ items: items(z.object({ title: text(120), summary: text(400), tag: text(80), action: text(80).optional() }).strict(), 12) }).strict()), assetSlots: IMAGE_SLOT, requiredKfCapabilities: ["layout.2", "text", "button", "image"], layout: layout(["main"], ["navigate"]),
  compile: ({ context }) => {
    const values = (context.content as { items: Array<{ title: string; summary: string; tag: string; action?: string }> }).items;
    const box = local(context, 200, 190); if (!box) return insufficient(context); const gap = 12; const columns = Math.max(1, Math.min(3, values.length, Math.floor((box.width + gap) / 200))); const cardWidth = Math.floor((box.width - gap * (columns - 1)) / columns); const cardHeight = 168; const rows = Math.ceil(values.length / columns); if (box.height < 44 + rows * cardHeight + (rows - 1) * gap + 8) return insufficient(context); const components: UIComponentSpec[] = [surface("surface", box), sectionTitle("title", context.instance.title, { x: 8, y: 8, width: box.width - 16, height: 28 }, "surface")];
    const nav = context.instance.interactions.filter((entry): entry is Extract<typeof entry, { type: "navigate" }> => entry.type === "navigate"); let actionIndex = 0;
    values.forEach((item, index) => { const card = { x: (index % columns) * (cardWidth + gap), y: 44 + Math.floor(index / columns) * (cardHeight + gap), width: cardWidth, height: cardHeight }; components.push(...repeatedCard(`card-${index + 1}`, item.title, item.summary, card)); components.push(Object.freeze({ id: `card-${index + 1}-tag`, role: "card-tag", capabilityId: "text", critical: true, content: item.tag, geometry: { x: card.x + 12, y: card.y + 96, width: card.width - 24, height: 24 }, properties: { parentId: `card-${index + 1}-surface` }, style: { role: "accent", declarations: {}, states: {} } })); if (context.asset?.status === "resolved") components.push(imageSlot(`card-${index + 1}-image`, item.title, { x: card.x + card.width - 68, y: card.y + 12, width: 56, height: 56 }, `card-${index + 1}-surface`)); if (item.action) { const link = nav[actionIndex++]; components.push(actionButton(`card-${index + 1}-action`, item.action, { x: card.x + 12, y: card.y + 128, width: Math.min(120, card.width - 24), height: 28 }, `card-${index + 1}-surface`, link?.pageId ? { kind: "navigate", pageId: link.pageId } : undefined)); } });
    const gaps = [...interactionGaps(context, values.filter((item) => item.action !== undefined).length), ...(values.length > 1 && context.asset?.status === "resolved" ? [{ moduleId: context.instance.id, requirement: "Per-item card assets", severity: "warning" as const, status: "unresolved" as const, reason: "per-item-assets-unsupported", alternatives: ["Use one shared cover image or provide a supported per-item asset catalog."] }] : [])]; return output(components, gaps);
  },
});

const timeline = define({
  kind: "content.timeline", category: "content", variants: ["default", "experience"], contentSchema: definitionSchema(z.object({ items: items(z.object({ title: text(160), detail: text(400), date: text(80) }).strict(), 10) }).strict()), assetSlots: NO_ASSETS, requiredKfCapabilities: ["layout.2", "text"], layout: layout(["main"], []),
  compile: ({ context }) => {
    const values = (context.content as { items: Array<{ title: string; detail: string; date: string }> }).items;
    const box = local(context, 180, 100); if (!box || box.height < 44 + values.length * 40) return insufficient(context); const components: UIComponentSpec[] = [surface("surface", box), sectionTitle("title", context.instance.title, { x: 8, y: 8, width: box.width - 16, height: 28 }, "surface")];
    values.forEach((item, index) => components.push(labeledValue(`event-${index + 1}`, item.date, `${item.title} · ${item.detail}`, { x: 12, y: 44 + index * 40, width: box.width - 24, height: 32 }, "surface")));
    return output(components, [{ moduleId: context.instance.id, requirement: "Native timeline", severity: "warning", status: "unresolved", reason: "native-timeline-not-implemented", alternatives: ["Use the generated text timeline or complete native timeline runtime verification."] }]);
  },
});

const tabsFilter = define({
  kind: "interaction.tabs-filter", category: "interaction", variants: ["default", "compact"], contentSchema: definitionSchema(z.object({ tabs: items(text(80), 8).refine((values) => new Set(values).size === values.length), active: text(80).optional() }).strict().superRefine((value, ctx) => { if (value.active !== undefined && !value.tabs.includes(value.active)) ctx.addIssue({ code: "custom", path: ["active"], message: "active must name a tab" }); })), assetSlots: NO_ASSETS, requiredKfCapabilities: ["tabs"], layout: layout(["main", "toolbar"], []),
  compile: ({ context }) => { const content = context.content as { tabs: string[]; active?: string }; const box = local(context, 120, 40); if (!box) return insufficient(context); const activeIndex = content.active === undefined ? 0 : content.tabs.indexOf(content.active); return output([surface("surface", box), Object.freeze({ id: "tabs", role: "filter-tabs", capabilityId: "tabs", critical: true, geometry: { x: 4, y: 4, width: box.width - 8, height: box.height - 8 }, properties: { tabs: content.tabs.map((label, index) => ({ id: `tab-${index + 1}`, label })), activeId: `tab-${activeIndex + 1}`, parentId: "surface" }, style: { role: "surface", declarations: {}, states: {} } })]); },
});

const recordEditor = define({
  kind: "form.record-editor", category: "form", variants: ["default", "contact"], contentSchema: definitionSchema(z.object({ fields: items(z.object({ id: z.string().regex(/^[A-Za-z][A-Za-z0-9_-]*$/).max(80), label: text(80), placeholder: text(160) }).strict(), 8), submitLabel: text(80), resetLabel: text(80).optional() }).strict()), assetSlots: NO_ASSETS, requiredKfCapabilities: ["layout.2", "text", "input", "button"], layout: layout(["main"], []),
  compile: ({ context }) => { const content = context.content as { fields: Array<{ id: string; label: string; placeholder: string }>; submitLabel: string; resetLabel?: string }; const box = local(context, 220, 150); if (!box) return insufficient(context); const gap = 12; const columns = box.width >= 520 ? 2 : 1; const fieldWidth = Math.floor((box.width - gap * (columns - 1) - 24) / columns); const rows = Math.ceil(content.fields.length / columns); const required = 48 + rows * 72 + Math.max(0, rows - 1) * gap + 48; if (box.height < required) return insufficient(context); const components: UIComponentSpec[] = [surface("surface", box), sectionTitle("title", context.instance.title, { x: 12, y: 8, width: box.width - 24, height: 28 }, "surface")]; content.fields.forEach((field, index) => components.push(...formRow(`field-${field.id}`, field.label, field.placeholder, { x: 12 + (index % columns) * (fieldWidth + gap), y: 44 + Math.floor(index / columns) * 84, width: fieldWidth, height: 72 }))); const actionY = box.height - 40; components.push(actionButton("submit", content.submitLabel, { x: 12, y: actionY, width: Math.min(140, fieldWidth), height: 28 }, "surface")); if (content.resetLabel) components.push(actionButton("reset", content.resetLabel, { x: 20 + Math.min(140, fieldWidth), y: actionY, width: Math.min(140, fieldWidth), height: 28 }, "surface")); return output(components, [{ moduleId: context.instance.id, requirement: "Native form submission", severity: "warning", status: "unresolved", reason: "native-submit-unsupported", alternatives: ["Wire submit/reset after native form runtime support is verified."] }]); },
});

const contactFooter = define({
  kind: "content.contact-footer", category: "content", variants: ["default", "compact"], contentSchema: definitionSchema(z.object({ contacts: items(z.object({ label: text(80), value: text(160) }).strict(), 6), copyright: text(160), action: text(80).optional() }).strict()), assetSlots: NO_ASSETS, requiredKfCapabilities: ["layout.2", "text", "button"], layout: layout(["footer", "main"], ["navigate"]),
  compile: ({ context }) => { const content = context.content as { contacts: Array<{ label: string; value: string }>; copyright: string; action?: string }; const box = local(context, 180, 100); if (!box) return insufficient(context); const gap = 12; const columns = Math.max(1, Math.min(content.contacts.length, Math.floor((box.width + gap) / 180))); const contactWidth = Math.floor((box.width - gap * (columns - 1)) / columns); const rows = Math.ceil(content.contacts.length / columns); const required = 16 + rows * 36 + 44; if (box.height < required) return insufficient(context); const components: UIComponentSpec[] = [surface("surface", box)]; content.contacts.forEach((contact, index) => components.push(labeledValue(`contact-${index + 1}`, contact.label, contact.value, { x: (index % columns) * (contactWidth + gap), y: 8 + Math.floor(index / columns) * 40, width: contactWidth, height: 32 }, "surface"))); components.push(sectionTitle("copyright", content.copyright, { x: 8, y: box.height - 32, width: Math.max(40, box.width - 16), height: 24 }, "surface")); const nav = context.instance.interactions.find((entry): entry is Extract<typeof entry, { type: "navigate" }> => entry.type === "navigate"); if (content.action) components.push(actionButton("action", content.action, { x: Math.max(8, box.width - 148), y: box.height - 64, width: 140, height: 28 }, "surface", nav ? { kind: "navigate", pageId: nav.pageId } : undefined)); return output(components, interactionGaps(context, content.action ? 1 : 0)); },
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
