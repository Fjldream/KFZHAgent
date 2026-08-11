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

export function sectionTitle(id: string, text: string, bounds: LocalBounds): UIComponentSpec {
  return component(id, "section-title", "text", text, bounds, { text }, "title");
}

export function labeledValue(id: string, label: string, value: string, bounds: LocalBounds): UIComponentSpec {
  return component(id, "labeled-value", "text", `${label}: ${value}`, bounds, { text: `${label}: ${value}` }, "description");
}

export function imageSlot(id: string, alt: string, bounds: LocalBounds): UIComponentSpec {
  return component(id, "image", "image", undefined, bounds, { src: "asset", fit: "cover", alt }, "accent");
}

export function actionButton(id: string, text: string, bounds: LocalBounds): UIComponentSpec {
  return component(id, "action", "button", text, bounds, { text }, "action");
}

export function repeatedCard(id: string, title: string, summary: string, bounds: LocalBounds): readonly UIComponentSpec[] {
  return Object.freeze([
    surface(`${id}-surface`, bounds),
    sectionTitle(`${id}-title`, title, { x: bounds.x + 16, y: bounds.y + 16, width: bounds.width - 32, height: 28 }),
    labeledValue(`${id}-summary`, "", summary, { x: bounds.x + 16, y: bounds.y + 52, width: bounds.width - 32, height: 40 }),
  ]);
}

export function formRow(id: string, label: string, placeholder: string, bounds: LocalBounds): readonly UIComponentSpec[] {
  return Object.freeze([
    sectionTitle(`${id}-label`, label, { x: bounds.x, y: bounds.y, width: Math.min(160, bounds.width), height: 28 }),
    component(`${id}-input`, "form-input", "input", undefined, { x: bounds.x, y: bounds.y + 32, width: bounds.width, height: bounds.height - 32 }, { placeholder, inputType: "text", disabled: false, clearable: true }, "surface"),
  ]);
}
