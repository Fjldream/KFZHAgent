import type { ModulePlanModule } from "@kf/contracts";
import type { ModuleQualityManifestInput, ModuleRequiredOutputContract } from "./types.js";

const output = (
  outputId: string,
  role: string,
  capabilityId: string,
  extra: Partial<ModuleRequiredOutputContract> = {},
): ModuleRequiredOutputContract => Object.freeze({ outputId, role, capabilityId, critical: true, ...extra });

/**
 * Registry-owned, compiler-independent manifest derivation for the 15 V1 kinds.
 * It depends only on the accepted instance/variant and schema-parsed content.
 */
export function deriveV1RequiredOutputs(kind: string, input: ModuleQualityManifestInput): readonly ModuleRequiredOutputContract[] {
  const { instance, content } = input;
  const values: ModuleRequiredOutputContract[] = [];
  const push = (id: string, role: string, capability: string, extra: Partial<ModuleRequiredOutputContract> = {}) => values.push(output(id, role, capability, extra));
  const indexed = (count: number, add: (index: number) => void) => { for (let index = 0; index < count; index += 1) add(index); };

  switch (kind) {
    case "navigation.top": {
      const items = array(content.items); push("surface", "surface", "layout.2"); push("logo", "section-title", "text");
      indexed(items.length, (index) => push(`nav-${index + 1}`, "action", "button", actionContract(instance, index))); break;
    }
    case "navigation.sidebar": {
      const groups = array(content.groups) as Array<{ items?: unknown }>;
      push("surface", "surface", "layout.2");
      let actionIndex = 0;
      groups.forEach((group, groupIndex) => { push(`group-${groupIndex + 1}`, "section-title", "text"); indexed(array(group.items).length, (itemIndex) => push(`item-${groupIndex + 1}-${itemIndex + 1}`, "action", "button", actionContract(instance, actionIndex++))); }); break;
    }
    case "content.hero": {
      push("surface", "surface", "layout.2"); push("title", "section-title", "text");
      if (content.subtitle !== undefined) push("subtitle", "labeled-value", "text");
      if (content.description !== undefined) push("description", "labeled-value", "text");
      if (instance.variant !== "no-portrait") push("portrait", "image", "image", { assetSlotId: "portrait" });
      if (content.primaryAction !== undefined) push("primary-action", "action", "button", actionContract(instance, 0));
      if (content.secondaryAction !== undefined) push("secondary-action", "action", "button", actionContract(instance, 1));
      break;
    }
    case "metric.kpi-grid": {
      const items = array(content.items) as Array<{ trend?: unknown }>;
      push("surface", "surface", "layout.2"); push("title", "section-title", "text");
      items.forEach((item, index) => { const prefix = `kpi-${index + 1}`; push(`${prefix}-surface`, "card-surface", "layout.2"); push(`${prefix}-title`, "section-title", "text"); push(`${prefix}-summary`, "labeled-value", "text"); if (item.trend !== undefined) push(`${prefix}-trend`, "labeled-value", "text"); }); break;
    }
    case "content.card-grid": {
      const items = array(content.items) as Array<{ action?: unknown }>;
      push("surface", "surface", "layout.2"); push("title", "section-title", "text");
      let actionIndex = 0;
      items.forEach((item, index) => { const prefix = `card-${index + 1}`; push(`${prefix}-surface`, "card-surface", "layout.2"); push(`${prefix}-title`, "section-title", "text"); push(`${prefix}-summary`, "labeled-value", "text"); push(`${prefix}-tag`, "card-tag", "text"); if (instance.assetId !== undefined) push(`${prefix}-image`, "image", "image", { assetSlotId: "image" }); if (item.action !== undefined) push(`${prefix}-action`, "action", "button", actionContract(instance, actionIndex++)); }); break;
    }
    case "content.timeline": {
      const items = array(content.items); push("surface", "surface", "layout.2"); push("title", "section-title", "text"); indexed(items.length, (index) => push(`event-${index + 1}`, "labeled-value", "text")); break;
    }
    case "data.chart-panel": push("chart", "native-chart", chartCapability(instance.variant)); break;
    case "data.status-grid": {
      const items = array(content.items); push("surface", "surface", "layout.2"); push("title", "section-title", "text"); indexed(items.length, (index) => { push(`status-${index + 1}-tag`, "status-tag", "tag"); push(`status-${index + 1}`, "labeled-value", "text"); }); break;
    }
    case "data.table": { push("surface", "surface", "layout.2"); push("title", "section-title", "text"); push("datagrid", "native-datagrid", "easyui.1"); break; }
    case "data.detail": {
      const fields = array(content.fields) as Array<{ editable?: unknown }>;
      push("surface", "surface", "layout.2"); push("title", "section-title", "text");
      fields.forEach((field, index) => { push(`field-${index + 1}-label`, "labeled-value", "text"); if (field.editable === true || instance.variant === "edit") push(`field-${index + 1}-input`, "detail-input", "input"); }); break;
    }
    case "interaction.tabs-filter": { push("surface", "surface", "layout.2"); push("tabs", "filter-tabs", "tabs"); break; }
    case "form.record-editor": {
      const fields = array(content.fields) as Array<{ id?: unknown }>;
      push("surface", "surface", "layout.2"); push("title", "section-title", "text");
      fields.forEach((field) => { const id = String(field.id); push(`field-${id}-label`, "section-title", "text"); push(`field-${id}-input`, "form-input", "input"); });
      push("submit", "form-submit", "button"); if (content.resetLabel !== undefined) push("reset", "action", "button"); break;
    }
    case "action.toolbar": {
      const actions = array(content.actions); push("surface", "surface", "layout.2"); indexed(actions.length, (index) => push(`action-${index + 1}`, "action", "button", actionContract(instance, index))); break;
    }
    case "feedback.alert-list": {
      const alerts = array(content.alerts); push("surface", "surface", "layout.2"); indexed(alerts.length, (index) => { push(`alert-${index + 1}-tag`, "alert-tag", "tag"); push(`alert-${index + 1}`, "labeled-value", "text"); }); break;
    }
    case "content.contact-footer": {
      const contacts = array(content.contacts); push("surface", "surface", "layout.2"); indexed(contacts.length, (index) => push(`contact-${index + 1}`, "labeled-value", "text")); push("copyright", "section-title", "text"); if (content.action !== undefined) push("action", "action", "button", actionContract(instance, 0)); break;
    }
    default: throw new Error(`V1_REQUIRED_OUTPUT_MANIFEST_KIND_UNKNOWN: ${kind}`);
  }
  return Object.freeze(values);
}

function array(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function chartCapability(variant: ModulePlanModule["variant"]): string {
  if (variant === "line") return "prototype.TrendChart";
  if (variant === "bar") return "prototype.BarChart";
  return "prototype.PieChart";
}

function actionContract(instance: ModulePlanModule, index: number): Partial<ModuleRequiredOutputContract> {
  return instance.interactions.filter((interaction) => interaction.type === "navigate")[index] === undefined ? {} : { actionType: "navigate" };
}
