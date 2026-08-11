import type { UIComponentSpec } from "@kf/contracts";

export interface LocalBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

type PrimitiveRole = "surface" | "title" | "description" | "action" | "accent";

function component(
  id: string,
  role: string,
  capabilityId: UIComponentSpec["capabilityId"],
  content: string | undefined,
  geometry: LocalBounds,
  properties: Record<string, unknown>,
  styleRole: PrimitiveRole,
): UIComponentSpec {
  return Object.freeze({
    id, role, capabilityId, critical: true,
    ...(content === undefined ? {} : { content }),
    geometry: Object.freeze({ ...geometry }),
    properties: Object.freeze({ ...properties }),
    style: Object.freeze({ role: styleRole, declarations: Object.freeze({}), states: Object.freeze({}) }),
  });
}

export function surface(id: string, bounds: LocalBounds): UIComponentSpec {
  return component(id, "surface", "layout.2", undefined, bounds, {}, "surface");
}

export function sectionTitle(id: string, text: string, bounds: LocalBounds, parentId?: string): UIComponentSpec {
  return component(id, "section-title", "text", text, bounds, parentId === undefined ? {} : { parentId }, "title");
}

export function labeledValue(id: string, label: string, value: string, bounds: LocalBounds, parentId?: string): UIComponentSpec {
  return component(id, "labeled-value", "text", `${label}: ${value}`, bounds, parentId === undefined ? {} : { parentId }, "description");
}

export function imageSlot(id: string, alt: string, bounds: LocalBounds, parentId?: string): UIComponentSpec {
  return component(id, "image", "image", undefined, bounds, { src: "asset", fit: "cover", alt, ...(parentId === undefined ? {} : { parentId }) }, "accent");
}

export function actionButton(id: string, text: string, bounds: LocalBounds, parentId?: string, action?: { kind: "navigate"; pageId: string }): UIComponentSpec {
  return component(id, "action", "button", text, bounds, { ...(parentId === undefined ? {} : { parentId }), ...(action === undefined ? {} : { action }) }, "action");
}

export function repeatedCard(id: string, title: string, summary: string, bounds: LocalBounds, parentId = "surface"): readonly UIComponentSpec[] {
  return Object.freeze([
    component(`${id}-surface`, "card-surface", "layout.2", undefined, bounds, { parentId }, "surface"),
    sectionTitle(`${id}-title`, title, { x: bounds.x + 16, y: bounds.y + 16, width: bounds.width - 32, height: 28 }, `${id}-surface`),
    labeledValue(`${id}-summary`, "", summary, { x: bounds.x + 16, y: bounds.y + 52, width: bounds.width - 32, height: 40 }, `${id}-surface`),
  ]);
}

export function formRow(id: string, label: string, placeholder: string, bounds: LocalBounds, parentId = "surface"): readonly UIComponentSpec[] {
  return Object.freeze([
    sectionTitle(`${id}-label`, label, { x: bounds.x, y: bounds.y, width: Math.min(160, bounds.width), height: 28 }, parentId),
    component(`${id}-input`, "form-input", "input", undefined, { x: bounds.x, y: bounds.y + 32, width: bounds.width, height: bounds.height - 32 }, { placeholder, disabled: false, clearable: true, parentId }, "surface"),
  ]);
}
