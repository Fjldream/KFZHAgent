import type { ChangePlan, DesignPlan, ModulePlan, UIImplementationSpec } from "@kf/contracts";
import { solutionId } from "@kf/contracts";
import { readVerifiedAcceptedBlueprintArtifact } from "@kf/build-jobs";
import { deriveGuid } from "@kf/domain-client";
import type {
  ClassifyIntentResult,
  ModelPort,
  ModelPortContext,
  ProjectDesign,
} from "@kf/agent-orchestrator";

/**
 * 确定性演示模型（E2E / 演示环境用）。
 *
 * 生产 ModelPort 由部署方接线（Phase 3）；本实现通过环境变量
 * `MODEL_PORT_MODE=fake` 注入，使 E2E 能走完整「确定性 fake-model 请求」
 * 流程（brief Step 6）：
 *  - 需求含「新建/创建/生成/设计」→ NEW_REQUIREMENT（new 流程）
 *  - 需求含「修改/改成/颜色/按钮/添加/删除」→ MODIFY_REQUIREMENT（modify 流程）
 *  - 其余 → QUESTION（回到 idle，无副作用）
 *
 * 计划输出是固定、确定性的：new 流程修改初始 Text1 的文本；modify 流程
 * 修改上传包中 Button1（guid=button-guid-1）的背景色，customFutureField
 * 等未知字段由 patcher 无损保留。
 */
export class DeterministicFakeModelPort implements ModelPort {
  classifyIntent(input: ModelPortContext): Promise<ClassifyIntentResult> {
    const text = input.requirementText ?? "";
    if (/新建|创建|生成|设计/.test(text)) {
      return Promise.resolve({ intent: "NEW_REQUIREMENT", requestedDomains: ["kingclient"] });
    }
    if (/修改|改成|改为|颜色|按钮|添加|删除|红色/.test(text)) {
      return Promise.resolve({ intent: "MODIFY_REQUIREMENT", requestedDomains: ["kingclient"] });
    }
    return Promise.resolve({
      intent: "QUESTION",
      requestedDomains: ["kingclient"],
      reply: "（确定性演示模型）已收到你的问题，请继续描述需求。",
    });
  }

  createDesignPlan(_input: ModelPortContext): Promise<DesignPlan> {
    void _input;
    return Promise.resolve({
      schema: "kf-design-plan/v2",
      displayName: "确定性客户效果方案",
      overview: {
        objective: "完整说明客户最终可见的工程效果",
        audiences: ["业务用户"],
        scenarios: ["方案确认"],
        valueProposition: "使用具体内容和验收标准降低沟通偏差",
      },
      informationArchitecture: { narrative: "从总览到核心内容", wireframe: "总览 → 核心内容" },
      modules: [{
        id: "main",
        name: "核心内容",
        purpose: "展示工程主要信息",
        content: ["主标题", "业务说明", "关键指标"],
        sampleData: [{ label: "主标题", value: "KingFusion 智能方案" }],
        interactions: ["点击按钮查看详情"],
        presentation: "重点信息卡片",
      }],
      visualDirection: {
        tone: "专业清晰",
        colors: ["深蓝", "青绿"],
        typography: "标题与正文分层",
        spacingAndSurfaces: "卡片化大留白",
      },
      highlights: ["信息层级清晰"],
      revisionNotes: { added: ["完整核心内容"], changed: [], retained: [] },
      acceptanceCriteria: ["页面完整显示主标题、业务说明和关键指标"],
      openQuestions: [],
    });
  }

  createProjectDesign(_input: ModelPortContext): Promise<ProjectDesign> {
    void _input;
    return Promise.resolve({
      schema: "kf-solution-ir/v1",
      solutionId: solutionId("sol-e2e"),
      displayName: "确定性初始设计",
      projects: [],
      dependencies: [],
      pendingRequirements: [],
    });
  }

  createUiImplementation(input: ModelPortContext): Promise<UIImplementationSpec> {
    const pageId = input.editableEntities?.find((entity) => entity.kind === "page")?.name ?? "Page1";
    const moduleId = input.designPlan?.schema === "kf-design-plan/v2"
      ? input.designPlan.modules[0]?.id ?? "main"
      : "main";
    return Promise.resolve({
      schema: "kf-ui-implementation/v1",
      theme: {
        background: "#0f172a",
        surface: "#111827",
        primary: "#2563eb",
        accent: "#38bdf8",
        textPrimary: "#f8fafc",
        textSecondary: "#cbd5e1",
        fontFamily: "Arial",
        spacingUnit: 8,
        radiusScale: { small: 4, medium: 8, large: 16 },
      },
      pages: [{
        id: pageId,
        width: 1440,
        height: 900,
        components: [{
          id: "Text1",
          role: "heading",
          sourceModuleId: moduleId,
          capabilityId: "text",
          critical: true,
          content: "由 KF Solution Agent 生成",
          geometry: { x: 40, y: 40, width: 320, height: 48 },
          properties: {},
          style: { declarations: { fontSize: 28, textColor: "{theme.textPrimary}" }, states: {} },
        }],
      }],
    });
  }

  reviseUiImplementation(input: ModelPortContext): Promise<UIImplementationSpec> {
    return input.uiImplementation !== undefined
      ? Promise.resolve(input.uiImplementation)
      : this.createUiImplementation(input);
  }

  createModulePlan(input: ModelPortContext): Promise<ModulePlan> {
    return Promise.resolve(this.deterministicModulePlan(input));
  }

  reviseModulePlan(input: ModelPortContext): Promise<ModulePlan> {
    return Promise.resolve(input.previousModulePlan ?? this.deterministicModulePlan(input));
  }

  createChangePlan(input: ModelPortContext): Promise<ChangePlan> {
    // new 流程：编译后的控件 GUID 由 build seed（=workspaceId）确定性派生，
    // 因此 fake model 用同一 seed 计算 entityId，change-scope 才能定位实体。
    const textGuid = deriveGuid({ seed: input.workspaceId }, "Text1");
    return Promise.resolve({
      schema: "kf-change-plan/v1",
      workspaceId: input.workspaceId,
      operations: [
        {
          op: "update",
          entityId: textGuid,
          entityType: "text",
          changes: [{ path: "/text", value: "由 KF Solution Agent 生成" }],
        },
      ],
    });
  }

  reviseChangePlan(input: ModelPortContext): Promise<ChangePlan> {
    const text = input.requirementText ?? "";
    // modify 流程：需求涉及按钮/颜色/红色 → 修改上传包中 Button1 的背景色
    // （customFutureField 等未知字段由 patcher 无损保留）。
    if (/按钮|颜色|红色/.test(text) && !/新建|创建|生成/.test(text)) {
      return Promise.resolve({
        schema: "kf-change-plan/v1",
        workspaceId: input.workspaceId,
        operations: [
          {
            op: "update",
            entityId: "button-guid-1",
            entityType: "button",
            changes: [{ path: "/backgroundColor", value: "rgba(255, 0, 0, 1)" }],
          },
        ],
      });
    }
    // new 流程（或 new 流程的 revise）：修改初始 Text1 控件。
    // value 与 createChangePlan 不同，保证 revise 产生新的 planHash。
    const textGuid = deriveGuid({ seed: input.workspaceId }, "Text1");
    return Promise.resolve({
      schema: "kf-change-plan/v1",
      workspaceId: input.workspaceId,
      operations: [
        {
          op: "update",
          entityId: textGuid,
          entityType: "text",
          changes: [{ path: "/text", value: "由 KF Solution Agent 修订生成" }],
        },
      ],
    });
  }

  explainValidation(): Promise<string> {
    return Promise.resolve("（确定性演示模型）校验已通过。");
  }

  /**
   * Offline-only fixtures for portal, dashboard, and admin acceptance paths.
   * They derive the exact kind/version/variant from the server planning catalog
   * and the source IDs from the verified artifact; no network/model fallback is
   * possible in fake mode.
   */
  private deterministicModulePlan(input: ModelPortContext): ModulePlan {
    if (input.acceptedBlueprintArtifact === undefined || input.confirmedBlueprint === undefined) {
      throw new Error("fake module planning requires accepted blueprint facts");
    }
    const accepted = readVerifiedAcceptedBlueprintArtifact(input.acceptedBlueprintArtifact);
    const catalog = (input.modulePlanningCatalog ?? []).filter((entry) => entry.maturity === "stable");
    const blueprintById = new Map(input.confirmedBlueprint.modules.map((module) => [module.id, module]));
    const modules = accepted.modules.map((fact, order) => {
      const summary = catalog.find((entry) => entry.kind === fact.expectedKind);
      const blueprint = blueprintById.get(fact.blueprintModuleId);
      if (summary === undefined || blueprint === undefined) {
        throw new Error(`fake module fixture unavailable for ${fact.blueprintModuleId}`);
      }
      const variant = summary.variants[0]!;
      const region = summary.layout.regions[0]!;
      const preferredHeight = summary.layout.preferredHeights.includes("medium") ? "medium" : summary.layout.preferredHeights[0]!;
      return {
        id: `module-${fact.blueprintModuleId.replace(/[^A-Za-z0-9_-]/g, "-")}`,
        kind: summary.kind,
        templateVersion: summary.version,
        variant,
        title: blueprint.name,
        content: JSON.stringify(fakeModuleContent(summary.kind, blueprint.name)),
        sourceBlueprintModuleIds: [fact.blueprintModuleId],
        placement: {
          region,
          order,
          columnSpan: Math.min(12, summary.layout.maxColumnSpan),
          preferredHeight,
          alignment: "stretch" as const,
          emphasis: order === 0 ? "primary" as const : "secondary" as const,
        },
        interactions: [],
      };
    });
    const mode = modules.some((module) => module.kind === "navigation.sidebar")
      ? "admin-shell" as const
      : modules.some((module) => module.kind.startsWith("data."))
        ? "dashboard-grid" as const
        : "vertical-flow" as const;
    return {
      schema: "kf-module-plan/v1",
      projectKey: accepted.projectKey,
      theme: {
        background: "#0f172a", surface: "#111827", primary: "#2563eb", accent: "#38bdf8",
        textPrimary: "#f8fafc", textSecondary: "#cbd5e1", fontFamily: "Arial", spacingUnit: 8,
        radiusScale: { small: 4, medium: 8, large: 16 },
      },
      assets: [...(input.assetCatalog ?? [])],
      pages: [{ id: "Page1", title: input.confirmedBlueprint.displayName, mode, modules }],
      operations: [],
    };
  }
}

function fakeModuleContent(kind: string, title: string): Record<string, unknown> {
  const label = title.slice(0, 80) || "示例";
  switch (kind) {
    case "navigation.top": return { logo: label, items: ["首页"] };
    case "navigation.sidebar": return { groups: [{ label, items: ["总览"] }] };
    case "content.hero": return { title: label, subtitle: "KF 确定性演示" };
    case "metric.kpi-grid": return { items: [{ label, value: "98%" }] };
    case "content.card-grid": return { items: [{ title: label, summary: "确定性示例内容", tag: "示例" }] };
    case "content.timeline": return { items: [{ date: "2026", title: label, detail: "确定性示例内容" }] };
    case "interaction.tabs-filter": return { tabs: ["全部"], active: "全部" };
    case "form.record-editor": return { fields: [{ id: "name", label: "名称", placeholder: "请输入名称" }], submitLabel: "提交" };
    case "content.contact-footer": return { contacts: [{ label: "邮箱", value: "demo@example.com" }], copyright: "KF Demo" };
    case "data.chart-panel": return { chart: { kind: "line", labels: ["现在"], series: [{ name: label, values: [1] }] } };
    case "data.status-grid": return { items: [{ name: label, severity: "online" }] };
    case "data.table": return { table: { columns: [{ key: "name", label: "名称", align: "left" }], rows: [{ name: label }], pageSize: 20 } };
    case "data.detail": return { fields: [{ label: "名称", value: label }] };
    case "action.toolbar": return { actions: [{ label: "新增" }] };
    case "feedback.alert-list": return { alerts: [{ title: label, message: "确定性示例提醒", severity: "info" }] };
    default: return { title: label };
  }
}
