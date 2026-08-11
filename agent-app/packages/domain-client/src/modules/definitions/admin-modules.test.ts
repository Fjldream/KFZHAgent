import { describe, expect, it } from "vitest";
import type { ModulePlanModule } from "@kf/contracts";
import { createDefaultModuleRegistry } from "../module-registry.js";

function instance(kind: string, content: Record<string, unknown>): ModulePlanModule {
  return { id: "admin", kind, templateVersion: "1.0.0", variant: "default", title: "管理", content: JSON.stringify(content), placement: { region: kind === "action.toolbar" ? "toolbar" : "main", order: 0, columnSpan: 12, preferredHeight: "large", alignment: "stretch", emphasis: "primary" }, interactions: [] };
}

describe("admin modules", () => {
  it("reports an owned deterministic gap when toolbar actions do not have one reviewed interaction each", () => {
    const registry = createDefaultModuleRegistry(); const definition = registry.require("action.toolbar", "1.0.0"); const content = { actions: [{ label: "新增" }, { label: "导出" }] }; const value = instance("action.toolbar", content);
    const result = definition.compile({ context: { definition, instance: value, content: definition.contentSchema.parse(content), asset: undefined, validationContext: { availableKfCapabilities: [], approvedAuthorizationRefs: [] }, bounds: { x: 0, y: 0, width: 300, height: 80 } } });
    expect(result.deliveryGaps).toContainEqual(expect.objectContaining({ reason: "toolbar-interaction-mismatch" }));
  });
  it.each([
    ["data.table", { table: { columns: [{ key: "name", label: "名称" }], rows: [{ name: "设备 A" }] } }, "easyui.1"],
    ["data.detail", { fields: [{ label: "设备名称", value: "泵 A", editable: true }] }, "input"],
    ["action.toolbar", { actions: [{ label: "新增" }, { label: "导出" }] }, "button"],
    ["feedback.alert-list", { alerts: [{ title: "超温", message: "泵 A 温度过高", severity: "critical" }] }, "tag"],
  ])("materializes %s with reviewed native controls", (kind, content, requiredCapability) => {
    const registry = createDefaultModuleRegistry(); const definition = registry.require(kind, "1.0.0"); const value = instance(kind, content);
    const result = definition.compile({ context: { definition, instance: value, content: definition.contentSchema.parse(content), asset: undefined, validationContext: { availableKfCapabilities: [], approvedAuthorizationRefs: [] }, bounds: { x: 0, y: 0, width: 960, height: 600 } } });
    expect(definition.maturity).toBe("beta");
    expect(result.components.some((component) => component.capabilityId === requiredCapability)).toBe(true);
    expect(result.components.every((component) => component.geometry.x >= 0 && component.geometry.y >= 0 && component.geometry.x + component.geometry.width <= 960 && component.geometry.y + component.geometry.height <= 600)).toBe(true);
  });
});
