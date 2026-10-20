import type {
  AssetRecord,
  CapabilityCandidateBundle,
  ChangePlan,
  CustomerEffectBlueprint,
  CustomerSolutionBlueprint,
  DesignPlan,
  ModulePlan,
  SolutionImplementationPlan,
  UIImplementationSpec,
  ValidationReport,
} from "@kf/contracts";
import type { VerifiedAcceptedBlueprintArtifact } from "@kf/build-jobs";
import type { ModulePlanningSummary } from "@kf/domain-client";
import type { ClassifyIntentResult, Intent } from "./schemas/intent.js";
import type { ProjectDesign } from "./schemas/project-design.js";
import type { GraphMessage } from "./state.js";
import type { EditableEntity } from "./ports.js";

/**
 * 传递给模型端口的有界且已沙箱化的上下文。它绝不包含原始上传文件、机密信息、完整页面 JSON 或不受信任的脚本文本（简述第 6 步）：recentMessages 会被裁剪，修订内容以有界摘要表示，并且机密信息根本不会进入图状态。
 */
export interface ModelPortContext {
  tenantId: string;
  userId: string;
  workspaceId: string;
  conversationId: string;
  /** 服务器拥有的受控路由鉴别器；creative-v2 是 v3 指令的唯一路径。 */
  generationWorkflow?: "legacy" | "module-v1" | "creative-v2" | undefined;
  recentMessages: GraphMessage[];
  conversationSummary?: string | undefined;
  revisionSummary?: string | undefined;
  currentRevisionId?: string | undefined;
  /** 服务器持有的项目绑定，用于已接受蓝图/模块计划制品。 */
  currentProjectKey?: string | undefined;
  /** 用户最新的回合，用作规划的要求文本。 */
  requirementText?: string | undefined;
  /** 重新设计的先前设计计划（REVISE_DESIGN / 设计迭代）。 */
  designPlan?: DesignPlan | undefined;
  /** 重新设计的内部 UI 实现（当重新设计一个已构建的预览时）。 */
  uiImplementation?: UIImplementationSpec | undefined;
  /** 客户确认的v2蓝图。仅当与acceptedBlueprintArtifact绑定时，它可用于模块规划。 */
  confirmedBlueprint?: CustomerEffectBlueprint | undefined;
  /** 经服务器校验的不透明权限句柄。绝不能用原始模型声明替代该制品。 */
  acceptedBlueprintArtifact?: VerifiedAcceptedBlueprintArtifact | undefined;
  /** 由 ModuleRegistry.listForPlanning() 提供的有界生产目录；测试版或不受支持的内容绝不能出现在此处。 */
  modulePlanningCatalog?: readonly ModulePlanningSummary[] | undefined;
  /** 由服务器持有的有界资产元数据目录。模型输出只能引用其中的逻辑 ID。 */
  assetCatalog?: readonly AssetRecord[] | undefined;
  /** 修订所需的完整先前计划。省略先前模块会被拒绝，而不会被视为删除。 */
  previousModulePlan?: ModulePlan | undefined;
  /** 单次模块方案修复尝试中出现的有界、确定性交付/编译失败。 */
  modulePlanRejectionReasons?: string[] | undefined;
  /** 单次修复尝试提供的受限制的确定性门故障。 */
  implementationRejectionReasons?: string[] | undefined;
  /** 确认了 v3 客户端语义，以解决创意 v2 解决方案规划路径。 */
  confirmedSolutionBlueprint?: CustomerSolutionBlueprint | undefined;
  /** 通过确定性方式检索并绑定哈希的候选项；绝不由模型编写。 */
  capabilityCandidates?: CapabilityCandidateBundle | undefined;
  /** 仅提供仅在本地化修复时有效的数据模型，以本地化修复。 */
  previousSolutionImplementationPlan?: SolutionImplementationPlan | undefined;
  /** 仅提供给局部修复调用的有界 schema/引用问题。 */
  solutionPlanRejectionReasons?: string[] | undefined;
  /**
 * 当前修订的模型编辑实体（控制/页面的 KF GUIDs）。一个真正的 LLM 必须在变更计划中引用这些确切的 GUIDs —— 预期的 id 是由 ModelPort 在图门之前拒绝的。
 */
  editableEntities?: EditableEntity[] | undefined;
}

/**
 * 用于有界分类、客户蓝图规划、内部 UI 实现规划和校验说明的模型抽象。旧版直接 ChangePlan 方法仍用于非蓝图兼容路径；已确认的蓝图使用 create/reviseUiImplementation 和确定性领域编译器。测试会注入 FakeModelPort；生产环境则在 API 边界接入真实 LLM 或显式存根。
 *
 * `ClassifyIntentResult` 在 schemas/intent.ts 中定义（并在运行时由 zod 设门）；这里重新导出该类型，使 ModelPort 实现者只依赖图将要校验的数据结构的单一事实来源（I1）。
 */
export interface ModelPort {
  classifyIntent(input: ModelPortContext): Promise<ClassifyIntentResult>;
  createProjectDesign(input: ModelPortContext): Promise<ProjectDesign>;
  createChangePlan(input: ModelPortContext): Promise<ChangePlan>;
  reviseChangePlan(input: ModelPortContext): Promise<ChangePlan>;
  /**
 * 根据需求规划初始页面设计；`revising` 会让提示词倾向于修改当前修订，而不是从头开始。
 */
  createDesignPlan(
    input: ModelPortContext,
    opts?: { revising?: boolean; rejectionReasons?: string[] },
  ): Promise<DesignPlan>;
  /** 将确认的客户蓝图转换为有界内部 UI 意图。 */
  createUiImplementation(input: ModelPortContext): Promise<UIImplementationSpec>;
  /** 在不暴露或直接撰写 KF JSON 的情况下修订内部 UI 意图。 */
  reviseUiImplementation(input: ModelPortContext): Promise<UIImplementationSpec>;
  /** 从确认的服务器授权的蓝图事实中规划注册的 KF 模块。 */
  createModulePlan(input: ModelPortContext): Promise<ModulePlan>;
  /** 返回完整的修订，保留所有不受影响的先前模块的原始形式。 */
  reviseModulePlan(input: ModelPortContext): Promise<ModulePlan>;
  /** 生产语义规划者；调度允许一个主要调用。 */
  createSolutionImplementationPlan(
    input: ModelPortContext,
  ): Promise<SolutionImplementationPlan>;
  /** 一个局部化的语义子树修复；调度从不循环这个调用。 */
  reviseSolutionImplementationSubtree(
    input: ModelPortContext,
  ): Promise<SolutionImplementationPlan>;
  explainValidation(input: { tenantId: string; report: ValidationReport }): Promise<string>;
}

export type { ClassifyIntentResult, Intent };
