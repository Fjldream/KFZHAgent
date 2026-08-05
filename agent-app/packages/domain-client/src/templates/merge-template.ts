/**
 * Control template merging rules.
 *
 * The Task 6 client compiler builds a complete KF control object by merging
 * `base-fields.json` (fields every KF control carries) with a control template
 * from `control-templates/<type>.json` (fields specific to that KF uiModelType).
 *
 * Merge rule (single, documented source of truth):
 *   result = { ...baseFields, ...controlTemplate }
 *
 * - Shallow spread; the control template WINS on key conflicts.
 * - `sizePolicy` is deliberately NOT part of base-fields: legacy controls
 *   (text/richtext/spacer, verified against 14k+ SDB pages) serialize it as a
 *   flat array `[...]` plus a separate `fixedSize` array, while element-style
 *   controls (button/inputnumber/switch/...) serialize it as the object
 *   `{ sizePolicy, maxSize, minSize, fixedSize }`. Each control template owns
 *   the exact shape for its uiModelType, so the shallow spread never mixes the
 *   two shapes.
 * - Arrays and objects are replaced wholesale (no deep merge): a base field
 *   and a template field are never structurally merged.
 */
export type TemplateJson = Record<string, unknown>;

export function mergeControlTemplate(
  baseFields: TemplateJson,
  controlTemplate: TemplateJson,
): TemplateJson {
  return { ...baseFields, ...controlTemplate };
}
