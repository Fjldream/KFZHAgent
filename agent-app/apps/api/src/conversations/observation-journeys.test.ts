// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CustomerSolutionBlueprintSchema, type CustomerSolutionBlueprint } from "@kf/contracts";
import { getDesignKnowledgeSnapshot, retrieveCapabilities, createDefaultModuleRegistry, compileSolutionImplementationWithProvenance } from "@kf/domain-client";
import type { ModelPortContext } from "@kf/agent-orchestrator";
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
import { validateSemanticImplementationOutput, validateVisualSemanticOutput, buildVisualSemanticMessages, projectVisualReferenceReasons } from "./deepseek-model.js";
import { VisualPlanningContextSchema, canonicalServerHash, type VisualPlanningContext } from "@kf/contracts";
import { approvedEnergyVisualBlueprint } from "../../../../tests/helpers/visual-blueprint-sources.js";
// end

const directory = new URL("../../../../tests/fixtures/energy-overview-20261023/live-negative/", import.meta.url);
function readFixture(name: string): unknown { return JSON.parse(readFileSync(new URL(name, directory), "utf8")) as unknown; }
const originalBlueprint = CustomerSolutionBlueprintSchema.parse(readFixture("blueprint.json"));
const providerReply = readFixture("semantic-provider-reply.json") as { content: string };
const rawPlan = (JSON.parse(providerReply.content) as { plan: unknown }).plan;
// modified by jinlong.feng at 2026-10-26 Agent工作台迭代
function context(blueprint: CustomerSolutionBlueprint, visualReference?: VisualPlanningContext): ModelPortContext {
// end
  return { tenantId: "tenant", userId: "user", workspaceId: "workspace", conversationId: "conversation",
    generationWorkflow: "creative-v2", currentProjectKey: "kingclient", recentMessages: [], assetCatalog: [],
    confirmedSolutionBlueprint: blueprint,
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    capabilityCandidates: retrieveCapabilities({ blueprint, knowledge: getDesignKnowledgeSnapshot(), ...(visualReference === undefined ? {} : { visualReference }) }),
    ...(visualReference === undefined ? {} : { visualReference }) };
    // end
}
function focusedObservation(): CustomerSolutionBlueprint {
  const blueprint = structuredClone(originalBlueprint);
  // A focused header unit fixture, not a substitute for full-image acceptance.
  blueprint.journeys = [{ ...blueprint.journeys[0]!, steps: [{ kind: "observe", pageId: "energy-overview",
    regionId: "app-header", action: "阅读页面身份", result: "显示名称与演示标记", expectedTexts: ["能源管理系统", "演示数据"] }] }];
  return blueprint;
}
function completeObservationBlueprint(): CustomerSolutionBlueprint {
  const expected: Record<string, string[]> = {
    "app-header": ["能源管理系统", "演示数据"], "overview-intro": ["能源总览", "掌握园区用能与设备运行状态"],
    "app-sidebar": ["能源总览", "设备监测", "告警中心"],
    "kpi-cards": ["今日用电量", "12,480", "kWh", "当前总功率", "856", "kW", "设备在线率", "98.6", "%"],
    "devices-panel": ["重点设备", "1号配电室", "中央空调", "光伏逆变器", "运行正常", "待检修"],
    "summary-panel": ["运行摘要", "当前告警", "2 项", "今日能耗目标", "15,000 kWh", "数据更新时间", "14:30", "查看运行说明"],
    "page-footnote": ["仅用于界面与工程生成验收 · 所有数值均为演示数据"],
  };
  const blueprint = structuredClone(originalBlueprint);
  blueprint.journeys.forEach((journey) => {
    journey.steps = journey.steps.map((step) => ({ ...step, kind: "observe", expectedTexts: expected[step.regionId]! }));
  });
  return CustomerSolutionBlueprintSchema.parse(blueprint);
}

describe("shared semantic observation journey gate", () => {
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  it("losslessly projects repeated visual reasons so the actual over-limit request fits the unchanged 128000-byte bound", () => {
    const latestDirectory = new URL("../live-engineering-prompt-limit/", directory);
    const readLatest = (name: string): unknown => JSON.parse(readFileSync(new URL(name, latestDirectory), "utf8")) as unknown;
    const blueprint = CustomerSolutionBlueprintSchema.parse(readLatest("blueprint.json"));
    const visual = VisualPlanningContextSchema.parse({ ...(readLatest("reference-review.json") as Record<string, unknown>),
      acceptedDifferences: readLatest("accepted-differences.json") });
    const originalHash = canonicalServerHash(visual);
    const { projectionSchema, textDictionary, mappings, acceptedDifferences, ...reference } = projectVisualReferenceReasons(visual);
    expect(projectionSchema).toBe("kf-visual-reason-projection/v1");
    const restored = VisualPlanningContextSchema.parse({ ...reference,
      mappings: mappings.map(({ reasonRef, ...mapping }) => ({ ...mapping, reason: textDictionary[reasonRef] })),
      acceptedDifferences: acceptedDifferences.map(({ reasonRef, ...difference }) => ({ ...difference, reason: textDictionary[reasonRef] })) });
    expect(canonicalServerHash(restored)).toBe(originalHash);
    const messages = buildVisualSemanticMessages(context(blueprint, visual));
    expect(messages[1]!.content).toContain("visualReferenceProjection(JSON)：");
    expect(Buffer.byteLength(JSON.stringify(messages), "utf8")).toBeLessThanOrEqual(128000);
    expect(canonicalServerHash(visual)).toBe(originalHash);
    const uniqueReasons = structuredClone(visual);
    uniqueReasons.mappings.forEach((mapping, index) => { mapping.reason = `unique mapping ${index}`; });
    uniqueReasons.acceptedDifferences.forEach((difference, index) => { difference.reason = `unique decision ${index}`; });
    expect(buildVisualSemanticMessages(context(blueprint, uniqueReasons))[1]!.content).toContain("visualReference(JSON)：");
  });
  it("sends exact visual IDs and separately approved blueprint owners rather than conflating the namespaces", () => {
    const { blueprint, visual } = approvedEnergyVisualBlueprint();
    const messages = buildVisualSemanticMessages(context(blueprint, visual));
    const obligations = JSON.parse(messages[1]!.content.split("requiredVisualBindings(JSON)：\n")[1]!) as Array<{ regionId: string; pageId: string; blueprintRegionId: string; requiredCapabilityId: string }>;
    expect(obligations.find((item) => item.regionId === "navMonitor")).toEqual({ regionId: "navMonitor", pageId: "overviewPage", blueprintRegionId: "sideNav", requiredCapabilityId: "button" });
    expect(obligations.find((item) => item.regionId === "logo")?.requiredCapabilityId).toBe("richtext");
    expect(obligations.map((item) => item.regionId)).not.toContain("sideNav");
    expect(obligations).toHaveLength(visual.spec.regions.filter((region) => !visual.acceptedDifferences.some((difference) => difference.regionId === region.id && difference.disposition === "omit")).length);
    const layoutObligations = obligations as Array<typeof obligations[number] & { directLayoutKinds?: string[] }>;
    expect(layoutObligations.find(item => item.regionId === "kpiRow")?.directLayoutKinds).toEqual(["row"]);
  });
  // end
  it("keeps the original real-provider negative fixture action-gated", () => {
    expect(() => validateSemanticImplementationOutput(context(originalBlueprint), rawPlan)).toThrow("action.journeyStepRefs");
  });
  it("accepts only explicitly approved exact static header text without adding actions", () => {
    const plan = validateSemanticImplementationOutput(context(focusedObservation()), rawPlan);
    expect(plan.actions).toEqual([]);
    expect(plan.theme.fontFamily).toBe("System UI");
  });
  it.each(["missing", "region", "interact"])("rejects incomplete or changed observation: %s", (failure) => {
    const blueprint = focusedObservation();
    const step = blueprint.journeys[0]!.steps[0]!;
    if (step.kind !== "observe") throw new Error("observation fixture required");
    if (failure === "missing") step.expectedTexts.push("不存在的文字");
    if (failure === "region") step.regionId = "app-sidebar";
    if (failure === "interact") blueprint.journeys[0]!.steps[0] = { kind: "interact", pageId: step.pageId, regionId: step.regionId, action: step.action, result: step.result };
    expect(() => validateSemanticImplementationOutput(context(blueprint), rawPlan)).toThrow(failure === "interact" ? "action.journeyStepRefs" : "可读静态文字");
  });
  it("resolves a bounded string KPI through its actual repeated template", () => {
    const blueprint = focusedObservation();
    blueprint.journeys[0]!.steps[0] = { kind: "observe", pageId: "energy-overview", regionId: "kpi-cards",
      action: "阅读用电量", result: "看到演示用电量", expectedTexts: ["12,480"] };
    expect(validateSemanticImplementationOutput(context(blueprint), rawPlan).actions).toEqual([]);
  });
  it("still refuses KPI strings that are not rendered by any repeated field", () => {
    const blueprint = focusedObservation();
    blueprint.journeys[0]!.steps[0] = { kind: "observe", pageId: "energy-overview", regionId: "kpi-cards",
      action: "阅读用电量", result: "看到演示用电量", expectedTexts: ["999,999"] };
    expect(() => validateSemanticImplementationOutput(context(blueprint), rawPlan)).toThrow("可读静态文字");
  });
  it("proves all literal and repeated string observations in the retained real response under a new explicit unit blueprint", () => {
    const plan = validateSemanticImplementationOutput(context(completeObservationBlueprint()), rawPlan);
    expect(plan.actions).toEqual([]);
  });
  it("does not turn successful observation proof into authority to use an out-of-candidate sidebar button", () => {
    const input = context(completeObservationBlueprint());
    const plan = validateSemanticImplementationOutput(input, rawPlan);
    expect(() => compileSolutionImplementationWithProvenance({ plan, candidateBundle: input.capabilityCandidates!,
      moduleRegistry: createDefaultModuleRegistry(), approvedAssets: [], activeCatalogVersion: "1.0.0" })).toThrow("node-nav-selected: capability button is not a candidate");
  });
  it("keeps the second real semantic reply strict when layout capability IDs are misused as recipe IDs", () => {
    const nextDirectory = new URL("../live-semantic-layout-recipe/", directory);
    const blueprint = CustomerSolutionBlueprintSchema.parse(JSON.parse(readFileSync(new URL("blueprint.json", nextDirectory), "utf8")) as unknown);
    const reply = JSON.parse(readFileSync(new URL("provider-reply.json", nextDirectory), "utf8")) as { content: string };
    const raw = JSON.parse(reply.content) as { plan: unknown };
    expect(() => validateSemanticImplementationOutput(context(blueprint), raw.plan)).toThrow("recipeId");
  });
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  it("accepts the actual blueprint without an unused completion caption while preserving all confirmed sources", () => {
    const latestDirectory = new URL("../live-blueprint-missing-completion/", directory);
    const readLatest = (name: string): unknown => JSON.parse(readFileSync(new URL(name, latestDirectory), "utf8")) as unknown;
    const reply = readLatest("provider-reply.json") as { content: string };
    const raw: unknown = JSON.parse(reply.content) as unknown;
    const blueprint = CustomerSolutionBlueprintSchema.parse(raw);
    expect(blueprint).toEqual(raw);
    expect(Object.hasOwn(blueprint.journeys[0]!, "completion")).toBe(false);
    const visual = VisualPlanningContextSchema.parse({ ...(readLatest("reference-review.json") as Record<string, unknown>),
      acceptedDifferences: readLatest("accepted-differences.json") });
    const input = context(blueprint, visual);
    expect(input.capabilityCandidates!.detailedCapabilityIds.length).toBeLessThanOrEqual(25);
    expect(blueprint.pages.flatMap(page => page.regions.flatMap(region => region.visualRegionIds ?? []))).toHaveLength(45);
  });
  it("keeps the actual generic JSON envelope and missing event arrays as explicit semantic negatives", () => {
    const latestDirectory = new URL("../live-semantic-envelope/", directory);
    const readLatest = (name: string): unknown => JSON.parse(readFileSync(new URL(name, latestDirectory), "utf8")) as unknown;
    const blueprint = CustomerSolutionBlueprintSchema.parse(readLatest("blueprint.json"));
    const visual = VisualPlanningContextSchema.parse({ ...(readLatest("reference-review.json") as Record<string, unknown>),
      acceptedDifferences: readLatest("accepted-differences.json") });
    const reply = readLatest("provider-reply.json") as { content: string };
    const raw = JSON.parse(reply.content) as { type: string; plan: unknown; bindings: unknown };
    const input = context(blueprint, visual);
    expect(raw.type).toBe("json_object");
    expect(() => validateVisualSemanticOutput(input, raw)).toThrow("schema");
    // In-memory diagnosis only. This is not a normalized or authorized historical result.
    expect(() => validateVisualSemanticOutput(input, { schema: "kf-visual-semantic-plan/v1", plan: raw.plan, bindings: raw.bindings }))
      .toThrow("eventBindings");
  });
  // end
  // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
  it("rejects the actual fifth-version cyclic KPI grouping before publishing a new semantic result", () => {
    const latestDirectory = new URL("../live-layout-group-cycle/", directory);
    const readLatest = (name: string): unknown => JSON.parse(readFileSync(new URL(name, latestDirectory), "utf8")) as unknown;
    const blueprint = CustomerSolutionBlueprintSchema.parse(readLatest("blueprint.json"));
    const visual = VisualPlanningContextSchema.parse({ ...(readLatest("reference-review.json") as Record<string, unknown>),
      acceptedDifferences: readLatest("accepted-differences.json") });
    const reply = readLatest("provider-reply.json") as { content: string };
    const input = context(blueprint, visual);
    const raw = JSON.parse(reply.content) as { plan: unknown };
    const plan = validateSemanticImplementationOutput(input, raw.plan);
    expect(() => validateVisualSemanticOutput(input, raw)).toThrow("VISUAL_LAYOUT_GROUP_INVALID: node-kpi-energy (cycle)");
    expect(blueprint.pages.flatMap(page => page.regions).every(region => region.visualRegionIds !== undefined)).toBe(true);
    const root = plan.pages[0]!.root;
    const pending = [root];
    const groupedNodes = new Map<string, string[]>();
    while (pending.length > 0) {
      const node = pending.pop()!;
      groupedNodes.set(node.id, node.intent.groupWith);
      if (node.kind === "layout") pending.push(...node.children);
    }
    expect(groupedNodes.get("node-kpi-energy")).toContain("node-kpi-power");
    expect(groupedNodes.get("node-kpi-power")).toContain("node-kpi-energy");
    expect(() => compileSolutionImplementationWithProvenance({ plan, candidateBundle: input.capabilityCandidates!,
      moduleRegistry: createDefaultModuleRegistry(), approvedAssets: [], activeCatalogVersion: "1.0.0" }))
      .toThrow("LAYOUT_INPUT_INVALID: node-kpi-energy");
    // Counterfactual diagnosis only: removing grouping still cannot authorize the wrong emitted layout family.
    const counterfactual = structuredClone(raw) as { plan: typeof plan };
    const clearGrouping = (node: typeof plan.pages[number]["root"]): void => {
      node.intent.groupWith = [];
      if (node.kind === "layout") node.children.forEach(clearGrouping);
    };
    counterfactual.plan.pages.forEach(page => clearGrouping(page.root));
    expect(() => validateVisualSemanticOutput(input, counterfactual)).toThrow("VISUAL_BLUEPRINT_LAYOUT_CAPABILITY_MISMATCH: content");
  });
  // end
  it("rejects an action claiming an observation even when its exact content exists", () => {
    const input = context(focusedObservation());
    const plan = validateSemanticImplementationOutput(input, rawPlan);
    plan.actions = [{ id: "action-pretend-observation", kind: "show-feedback", level: "info", message: "已阅读",
      afterActionIds: [], journeyStepRefs: [{ journeyId: originalBlueprint.journeys[0]!.id, stepIndex: 0 }] }];
    const nodes = plan.pages.map((page) => page.root);
    while (nodes.length > 0) {
      const node = nodes.pop()!;
      if (node.kind === "layout") nodes.push(...node.children);
      if (node.kind === "control" && node.capabilityId === "button") {
        node.eventBindings = [{ semanticEvent: "click", actionIds: ["action-pretend-observation"] }];
        break;
      }
    }
    expect(() => validateSemanticImplementationOutput(input, plan)).toThrow("不得使用 action.journeyStepRefs");
  });
});
// end
