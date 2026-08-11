import { describe, expect, it } from "vitest";
import { cp, mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { type ModulePlanModule } from "@kf/contracts";
import { createDefaultModuleRegistry } from "../module-registry.js";
import { compileModulePlan } from "../module-compiler.js";
import { compileUiImplementation } from "../../implementation/ui-implementation-compiler.js";
import { applyClientPatch } from "../../patch/client-patcher.js";
import { deriveGuid } from "../../compile/guid-factory.js";
import { inspectClientProject, kfObjectToControl } from "../../inspect/client-inspector.js";
import { validateClientProject } from "../../validate/client-validator.js";

const theme = { background: "#101827", surface: "#1E293B", primary: "#2563EB", accent: "#38BDF8", textPrimary: "#F8FAFC", textSecondary: "#94A3B8", fontFamily: "Inter", spacingUnit: 8, radiusScale: { small: 4, medium: 8, large: 16 } } as const;
const fixturesRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../../../../../tests/fixtures");
async function fixture(): Promise<string> { const root = await mkdtemp(join(tmpdir(), "kf-dashboard-module-")); await cp(join(fixturesRoot, "client-unknown-field"), root, { recursive: true }); return root; }
function records(input: unknown[]): Record<string, unknown>[] { return input.map((value) => value as Record<string, unknown>); }
function findControl(input: Record<string, unknown>[], name: string): Record<string, unknown> | undefined { for (const control of input) { const base = (control.baseProperty ?? control) as Record<string, unknown>; if (base.name === name || control.name === name) return control; const nested = Array.isArray(control.insiderObjects) ? findControl(records(control.insiderObjects), name) : undefined; if (nested) return nested; } return undefined; }

function instance(kind: string, content: Record<string, unknown>, variant = "default"): ModulePlanModule {
  return { id: "module", kind, templateVersion: "1.0.0", variant, title: "看板", content: JSON.stringify(content), placement: { region: kind === "navigation.sidebar" ? "sidebar" : "main", order: 0, columnSpan: 12, preferredHeight: "large", alignment: "stretch", emphasis: "primary" }, interactions: [] };
}

describe("dashboard modules", () => {
  it("promotes only exact runtime evidence to the public planning catalog", () => {
    const exact = { kind: "data.table", version: "1.0.0", runtimeFamily: "KingFusion", runtimeVersion: "3.6", baselineId: "kf36-dashboard-admin-v1", verifiedCapabilities: ["layout.2", "text", "easyui.1"] };
    expect(createDefaultModuleRegistry([exact]).listForPlanning()).toContainEqual(expect.objectContaining({ kind: "data.table", maturity: "stable" }));
    expect(createDefaultModuleRegistry([{ ...exact, baselineId: "wrong" }]).listForPlanning()).not.toContainEqual(expect.objectContaining({ kind: "data.table" }));
  });
  it.each([
    ["navigation.sidebar", { groups: [{ label: "生产", items: ["总览", "设备"] }] }, "default"],
    ["data.chart-panel", { chart: { kind: "line", labels: ["08:00", "09:00"], series: [{ name: "产量", values: [10, 12] }] } }, "line"],
    ["data.status-grid", { items: [{ name: "泵 A", severity: "warning", detail: "温度偏高" }] }, "default"],
  ])("materializes %s as a native, bounded control structure", (kind, content, variant) => {
    const registry = createDefaultModuleRegistry();
    const definition = registry.require(kind, "1.0.0");
    expect(definition.maturity).toBe("beta");
    const value = instance(kind, content, variant);
    const result = definition.compile({ context: { definition, instance: value, content: definition.contentSchema.parse(content), asset: undefined, validationContext: { availableKfCapabilities: [], approvedAuthorizationRefs: [] }, bounds: { x: 0, y: 0, width: 960, height: 520 } } });
    if (kind === "data.chart-panel") {
      expect(result.components).toEqual([]);
      expect(result.deliveryGaps).toContainEqual(expect.objectContaining({ severity: "blocking", reason: "kf36-static-chart-series-mapping-unverified" }));
      return;
    }
    expect(result.components.length).toBeGreaterThan(1);
    expect(result.components.some((component) => component.capabilityId === "layout.2")).toBe(true);
    if (kind === "data.status-grid") expect(result.components.some((component) => component.capabilityId === "tag")).toBe(true);
    for (const component of result.components) {
      expect(component.geometry.x + component.geometry.width).toBeLessThanOrEqual(960);
      expect(component.geometry.y + component.geometry.height).toBeLessThanOrEqual(520);
    }
  });

  it("returns a blocking owned gap instead of overflowing a fixed dashboard module", () => {
    const registry = createDefaultModuleRegistry();
    const definition = registry.require("data.chart-panel", "1.0.0");
    const content = { chart: { kind: "bar", labels: ["A"], series: [{ name: "值", values: [1] }] } };
    const value = instance("data.chart-panel", content, "bar");
    const result = definition.compile({ context: { definition, instance: value, content: definition.contentSchema.parse(content), asset: undefined, validationContext: { availableKfCapabilities: [], approvedAuthorizationRefs: [] }, bounds: { x: 0, y: 0, width: 200, height: 100 } } });
    expect(result.components).toEqual([]);
    expect(result.deliveryGaps).toContainEqual(expect.objectContaining({ severity: "blocking", reason: "module-bounds-insufficient" }));
  });

  it("runs the admin table golden flow through final KF JSON with real reviewed data/columns fields", async () => {
    const dashboardChart = instance("data.chart-panel", { chart: { kind: "line", title: "产量趋势", labels: ["08:00", "09:00"], series: [{ name: "产量", values: [12, 18] }] } }, "line");
    dashboardChart.id = "dashboard-chart"; dashboardChart.placement = { ...dashboardChart.placement, columnSpan: 6, preferredHeight: "medium" };
    const dashboardStatus = instance("data.status-grid", { items: [{ name: "泵 A", severity: "warning", detail: "温度偏高" }] });
    dashboardStatus.id = "dashboard-status"; dashboardStatus.placement = { ...dashboardStatus.placement, columnSpan: 6, preferredHeight: "medium" };
    const dashboard = { schema: "kf-module-plan/v1" as const, projectKey: "kingclient.dashboard", theme, assets: [], pages: [{ id: "Page1", title: "Dashboard", mode: "dashboard-grid" as const, modules: [dashboardChart, dashboardStatus] }], operations: [] };
    const adminSidebar = instance("navigation.sidebar", { groups: [{ label: "管理", items: ["设备"] }] }); adminSidebar.id = "admin-sidebar"; adminSidebar.placement = { ...adminSidebar.placement, region: "sidebar", preferredHeight: "large" };
    const adminToolbar = instance("action.toolbar", { actions: [{ label: "新增" }, { label: "导出" }] }); adminToolbar.id = "admin-toolbar"; adminToolbar.placement = { ...adminToolbar.placement, region: "toolbar", preferredHeight: "compact" };
    const adminTable = instance("data.table", { table: { columns: [{ key: "name", label: "设备" }, { key: "temperature", label: "温度", align: "right" }], rows: [{ name: "泵 A", temperature: 42 }] } }); adminTable.id = "admin-table"; adminTable.placement = { ...adminTable.placement, preferredHeight: "small" };
    const admin = { schema: "kf-module-plan/v1" as const, projectKey: "kingclient.admin", theme, assets: [], pages: [{ id: "Page1", title: "Admin", mode: "admin-shell" as const, modules: [adminSidebar, adminToolbar, adminTable] }], operations: [] };
    const registry = createDefaultModuleRegistry();
    const context = { availableKfCapabilities: ["layout.2", "text", "button", "tag", "input", "easyui.1", "prototype.TrendChart", "prototype.BarChart", "prototype.PieChart"], approvedAuthorizationRefs: [] };
    const blockedDashboard = compileModulePlan({ plan: dashboard, registry, assetsById: {}, validationContext: context });
    expect(blockedDashboard.status).toBe("blocked");
    expect(blockedDashboard.gaps).toContainEqual(expect.objectContaining({ moduleId: "dashboard-chart", severity: "blocking", reason: "kf36-static-chart-series-mapping-unverified" }));
    for (const [plan, expected] of [[admin, "admin-table/datagrid"]] as const) {
      const compiled = compileModulePlan({ plan, registry, assetsById: {}, validationContext: context });
      expect(compiled.status).toBe("compiled"); if (compiled.status !== "compiled") continue;
      const changes = compileUiImplementation(compiled.implementation, { workspaceId: "module-golden", pageGuidById: { Page1: "page-guid-1" }, existingControlGuidByComponentId: {}, existingControlCapabilityIdByComponentId: {}, trustedModuleImplementation: compiled.implementation });
      expect(changes.semanticOperations).toHaveLength(1);
      const base = await fixture();
      const persisted = JSON.parse(JSON.stringify(changes)) as typeof changes;
      const candidate = await applyClientPatch(base, persisted.plan, {
        semanticOperations: persisted.semanticOperations,
      });
      const inspection = await inspectClientProject(candidate.rootDir);
      expect(Object.values(inspection.index.controls).map((entry) => entry.id)).toContain(expected);
      expect((await validateClientProject(base, candidate, changes.plan)).status).toBe("pass");
      const page = JSON.parse(await readFile(join(candidate.rootDir, "1.0.0.1/project/page/Page1.json"), "utf8")) as Record<string, unknown>;
      const control = findControl(records(page.objects as unknown[]), expected);
      expect(control).toBeDefined();
      expect(kfObjectToControl(control!).control).toMatchObject({
        tableData: {
          columns: [{ key: "name", label: "设备", align: "left" }, { key: "temperature", label: "温度", align: "right" }],
          rows: [{ name: "泵 A", temperature: 42 }],
          pageSize: 20,
        },
      });
      expect(JSON.stringify(control)).not.toMatch(/chartData|tableData|<script|javascript:/i);
      expect(control?.configureData).toBe("");
      expect(control?.data).toEqual([{ name: "泵 A", temperature: 42 }]);
      expect(control?.columns).toEqual([[{ field: "name", title: "设备", width: "50%", align: "left" }, { field: "temperature", title: "温度", width: "50%", align: "right" }]]);

      const revisedAdmin = {
        ...admin,
        pages: [{
          ...admin.pages[0]!,
          modules: admin.pages[0]!.modules.map((module) => module.id === "admin-table"
            ? { ...module, content: JSON.stringify({ table: { columns: [{ key: "name", label: "设备名称" }, { key: "pressure", label: "压力", align: "right" }], rows: [{ name: "泵 A", pressure: 0.8 }] } }) }
            : module),
        }],
      };
      const revised = compileModulePlan({ plan: revisedAdmin, previousPlan: admin, previousImplementation: compiled.implementation, registry, assetsById: {}, validationContext: context });
      expect(revised.status).toBe("compiled"); if (revised.status !== "compiled") continue;
      const tableComponentId = "admin-table/datagrid";
      const existingComponents = compiled.implementation.pages.flatMap((page) => page.components);
      const existingControlGuidByComponentId = Object.fromEntries(existingComponents.map((component) => [
        component.id,
        deriveGuid({ seed: "module-golden" }, component.id),
      ]));
      const existingControlCapabilityIdByComponentId = Object.fromEntries(existingComponents.map((component) => [
        component.id,
        component.capabilityId,
      ]));
      const existingControlGeometryByComponentId = Object.fromEntries(existingComponents.map((component) => [
        component.id,
        component.geometry,
      ]));
      const toolbarOnlyAdmin = {
        ...admin,
        pages: [{
          ...admin.pages[0]!,
          modules: admin.pages[0]!.modules.map((module) => module.id === "admin-toolbar"
            ? { ...module, content: JSON.stringify({ actions: [{ label: "新建设备" }, { label: "导出" }] }) }
            : module),
        }],
      };
      const toolbarOnly = compileModulePlan({
        plan: toolbarOnlyAdmin,
        previousPlan: admin,
        previousImplementation: compiled.implementation,
        registry,
        assetsById: {},
        validationContext: context,
      });
      expect(toolbarOnly.status).toBe("compiled");
      if (toolbarOnly.status !== "compiled") continue;
      const toolbarDelta = compileUiImplementation(toolbarOnly.implementation, {
        workspaceId: "module-golden",
        pageGuidById: { Page1: "page-guid-1" },
        existingControlGuidByComponentId,
        existingControlCapabilityIdByComponentId,
        existingControlGeometryByComponentId,
        previousImplementation: compiled.implementation,
        trustedModuleImplementation: toolbarOnly.implementation,
      });
      expect(toolbarDelta.plan.operations.some((operation) => operation.op === "update"
        && operation.changes.some((change) => change.path === "/__kfModuleTableData"))).toBe(false);
      expect(toolbarDelta.semanticOperations).toEqual([]);

      const delta = compileUiImplementation(revised.implementation, {
        workspaceId: "module-golden",
        pageGuidById: { Page1: "page-guid-1" },
        existingControlGuidByComponentId,
        existingControlCapabilityIdByComponentId,
        existingControlGeometryByComponentId,
        previousImplementation: compiled.implementation,
        trustedModuleImplementation: revised.implementation,
      });
      expect(delta.plan.operations).toContainEqual(expect.objectContaining({
        op: "update",
        entityId: deriveGuid({ seed: "module-golden" }, tableComponentId),
        changes: expect.arrayContaining([expect.objectContaining({ path: "/__kfModuleTableData" })]),
      }));
      expect(delta.semanticOperations).toHaveLength(1);
      const revisedPersisted = JSON.parse(JSON.stringify(delta)) as typeof delta;
      const revisedCandidate = await applyClientPatch(candidate.rootDir, revisedPersisted.plan, {
        semanticOperations: revisedPersisted.semanticOperations,
      });
      const revisedValidation = await validateClientProject(candidate.rootDir, revisedCandidate, delta.plan);
      expect(revisedValidation.status, revisedValidation.warnings.join("\n")).toBe("pass");
      const revisedPage = JSON.parse(await readFile(join(revisedCandidate.rootDir, "1.0.0.1/project/page/Page1.json"), "utf8")) as Record<string, unknown>;
      const revisedControl = findControl(records(revisedPage.objects as unknown[]), expected);
      expect(revisedControl?.data).toEqual([{ name: "泵 A", pressure: 0.8 }]);
      expect(revisedControl?.columns).toEqual([[{ field: "name", title: "设备名称", width: "50%", align: "left" }, { field: "pressure", title: "压力", width: "50%", align: "right" }]]);
      expect(kfObjectToControl(revisedControl!).control).toMatchObject({
        tableData: {
          columns: [{ key: "name", label: "设备名称", align: "left" }, { key: "pressure", label: "压力", align: "right" }],
          rows: [{ name: "泵 A", pressure: 0.8 }],
          pageSize: 20,
        },
      });
    }
  });
});
