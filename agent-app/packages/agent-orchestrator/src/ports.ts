import type { EnqueueBuildInput, ModuleArtifactAuthority, VerifiedAcceptedBlueprintArtifact, VerifiedModuleCompilationArtifact } from "@kf/build-jobs";
import type { ModuleCompilationOutcome, ModulePlanningSummary } from "@kf/domain-client";
import type { BuildJobStatus } from "@kf/build-jobs";
import type {
  CapabilityReport,
  CapabilityCandidateBundle,
  ChangePlan,
  InternalChangePlan,
  ServerPlanEnvelope,
  TrustedSemanticOperationInput,
  UIImplementationSpec,
  AcceptedBlueprintArtifact,
  CustomerEffectBlueprint,
  CustomerSolutionBlueprint,
  SolutionImplementationPlan,
} from "@kf/contracts";
import type { ModelPort } from "./model-port.js";
import type { GraphMessage } from "./state.js";

/**
 * 解决方案图中消耗的端口（"Consumes"行）:
 *   - 工作空间查询端口：对话、消息和修订摘要。
 *   - 变更计划仓库：变更请求和变更计划。
 *   - 构建作业端口：排队和检查持久构建作业。
 *
 * 这些端口确保解决方案图不受Prisma直接访问的影响，因此单元测试仅在内存中使用假象运行，并且只有检查点集成测试才接触Postgres。
 */

export type { BuildJobStatus, EnqueueBuildInput } from "@kf/build-jobs";

export interface ListRecentMessagesInput {
  tenantId: string;
  conversationId: string;
  limit: number;
}

/**
 * 当前修订中可由模型编辑的实体。将其传给 ModelPort，使真实 LLM 能引用准确的 KF GUID，而不是凭空捏造。
 * （编译模式下的 GUID 是确定性的：deriveGuid({ seed: workspaceId }, id)。）
 */
export interface EditableEntity {
  kind: "control" | "page" | "variable";
  /** 语义 ID：控件 ID / 页面名称 / 变量名称。 */
  name: string;
  /** 控件类型（text/button/inputnumber）或 “page”/“variable”。 */
  type: string;
  /** 变更计划必须引用的KF GUID。 */
  guid: string;
  /** 当实体是控制时，当前控制几何。 */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}

export interface AppendMessageInput {
  tenantId: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
}

export interface WorkspaceQueryPort {
  /** `limit`：对话最后一条消息，按时间顺序排列。 */
  listRecentMessages(input: ListRecentMessagesInput): Promise<GraphMessage[]>;
  /** 保存一条消息；图将助手回复附加到消息中。 */
  appendMessage(input: AppendMessageInput): Promise<void>;
  getConversationSummary(input: {
    tenantId: string;
    conversationId: string;
  }): Promise<string | undefined>;
  /** 覆盖式摘要写入；图会重新计算完整字符串，因此该操作是幂等的。 */
  setConversationSummary(input: {
    tenantId: string;
    conversationId: string;
    summary: string;
  }): Promise<void>;
  getCurrentRevisionId(input: {
    tenantId: string;
    workspaceId: string;
  }): Promise<string | undefined>;
  /** 仅用于安全工作流路由的服务器拥有的工作区来源。 */
  getWorkspaceRouting?(input: {
    tenantId: string;
    workspaceId: string;
  }): Promise<{
    mode: "new" | "upload";
    generationWorkflow: "legacy" | "module-v1" | "creative-v2";
  } | undefined>;
  /** 修订的简要总结（从不包含完整的 JSON） */
  getRevisionSummary(input: {
    tenantId: string;
    revisionId: string;
  }): Promise<string | undefined>;
  /** 修订版本（控制/页面/变量的KF GUID）的可编辑实体 */
  getRevisionEntities(input: {
    tenantId: string;
    revisionId: string;
    workspaceId: string;
    projectKey?: string;
    domainKind?: string;
  }): Promise<EditableEntity[]>;
}

export interface OpenChangeRequest {
  id: string;
  changePlanId?: string;
  planHash?: string;
}

export interface SaveChangeRequestInput {
  id: string;
  tenantId: string;
  workspaceId: string;
  title: string;
  status: string;
}

export interface SavePlanInput {
  id: string;
  tenantId: string;
  workspaceId: string;
  changeRequestId: string;
  planHash: string;
  /** 模型安全的计划或服务器持有的持久化信封；内部信封永远不会到达模型 */
  plan: ChangePlan | InternalChangePlan | ServerPlanEnvelope;
}

export interface ChangePlanRepository {
  findOpenChangeRequest(input: {
    tenantId: string;
    workspaceId: string;
    conversationId: string;
  }): Promise<OpenChangeRequest | null>;
  saveChangeRequest(input: SaveChangeRequestInput): Promise<void>;
  savePlan(input: SavePlanInput): Promise<void>;
  loadPlanHash(input: { tenantId: string; changePlanId: string }): Promise<string | undefined>;
  /** 在将其小队手递之前，对持久化签名的创意信封进行重新验证 */
  verifyPersistedCreativePlan(input: {
    tenantId: string;
    workspaceId: string;
    changePlanId: string;
    changeRequestId: string;
    planHash: string;
    revisionId: string;
  }): Promise<boolean>;
  setChangeRequestStatus(input: {
    tenantId: string;
    workspaceId: string;
    changeRequestId: string;
    status: string;
  }): Promise<void>;
}

export interface BuildJobInfo {
  id: string;
  status: BuildJobStatus;
}

export interface BuildJobPort {
  enqueue(input: EnqueueBuildInput): Promise<BuildJobInfo>;
  getJob(input: { tenantId: string; jobId: string }): Promise<BuildJobInfo | null>;
}

export interface PlanArtifactsInput {
  tenantId: string;
  workspaceId: string;
  changePlanId: string;
  plan: ChangePlan;
  baseRevisionId?: string;
}

export interface PlanArtifactRefs {
  diffArtifactId?: string;
  previewArtifactId?: string;
}

/**
 * 可选制品管线，用于为计划渲染差异制品和可视化预览。本任务（任务 11）尚未接入；缺失时，审批中断不携带制品 ID。
 */
export interface PlanArtifactsPort {
  create(input: PlanArtifactsInput): Promise<PlanArtifactRefs>;
}

export interface UiImplementationCompilerInput {
  workspaceId: string;
  spec: UIImplementationSpec;
  /** 最后的实现，允许编译器在本地生成差异 */
  previousSpec?: UIImplementationSpec;
  /** 验证当前模块编译；每模块拥有的组件都必须满足此条件。 */
  moduleCompilationArtifact?: VerifiedModuleCompilationArtifact;
  editableEntities: EditableEntity[];
}

/** 由领域持有的确定性实现边界；模型绝不会在这里生成 ChangePlan。 */
export interface UiImplementationCompilerPort {
  compile(input: UiImplementationCompilerInput): Promise<{
    plan: InternalChangePlan;
    capabilityReport: CapabilityReport;
    semanticOperations?: readonly TrustedSemanticOperationInput[];
  }>;
}

/** 确定性模块编译边界。注册表/资产始终在端口后方保持服务器拥有。 */
export interface ModulePlanCompilerPort {
  /** 仅包含稳定版本的有界摘要。测试版或不受支持的定义绝不会跨越此边界。 */
  listPlanningCatalog(): Promise<readonly ModulePlanningSummary[]>;
  compile(input: {
    tenantId: string;
    workspaceId: string;
    plan: import("@kf/contracts").ModulePlan;
    acceptedBlueprintArtifact: VerifiedAcceptedBlueprintArtifact;
    previousCompilationArtifact?: VerifiedModuleCompilationArtifact;
    previousPlan?: import("@kf/contracts").ModulePlan;
    previousImplementation?: UIImplementationSpec;
  }): Promise<ModuleCompilationOutcome>;
}

/** 租户/工作区范围的模型安全资产元数据。从不返回存储键或路径。 */
export interface AssetCatalogPort {
  list(input: { tenantId: string; workspaceId: string }): Promise<readonly import("@kf/contracts").AssetRecord[]>;
}

/** API拥有确认边界；模型字段是输入，而不是签署权限。 */
export interface AcceptedBlueprintConfirmationPort {
  confirm(input: {
    blueprint: CustomerEffectBlueprint;
    projectKey: string;
    revisionId: string;
  }): Promise<AcceptedBlueprintArtifact>;
}

/** 确定性本地检索边界。实现不调用模型。 */
export interface CapabilityRetrievalPort {
  retrieve(input: {
    blueprint: CustomerSolutionBlueprint;
  }): Promise<CapabilityCandidateBundle>;
}

export interface CreativeCompilationDiagnostic {
  code: string;
  phase?: string;
  nodeId: string;
  message: string;
  /** 安全事件标识；原始依赖细节仅在服务器日志中保留。 */
  correlationId?: string;
  alternatives?: readonly string[];
}

export interface CreativeSolutionCompilerInput {
  tenantId: string;
  workspaceId: string;
  conversationId: string;
  baseRevisionId: string;
  projectKey: string;
  domainKind: string;
  blueprint: CustomerSolutionBlueprint;
  candidateBundle: CapabilityCandidateBundle;
  semanticPlan: SolutionImplementationPlan;
}

export type CreativeSolutionCompilerOutcome =
  | {
      status: "compiled";
      /** 完整、验证、原子持久的创意包裹窄接收。 */
      changeRequestId: string;
      changePlanId: string;
      planHash: string;
      operationCount: number;
      confirmationId: string;
      projectKey: string;
      domainKind: string;
      capabilityReport: CapabilityReport;
      warnings: readonly CreativeCompilationDiagnostic[];
    }
  | {
      status: "blocked";
      diagnostics: readonly CreativeCompilationDiagnostic[];
      warnings: readonly CreativeCompilationDiagnostic[];
    };

/** 一个由服务器所有者控制的创意边界：证据、编译、验证和原子持久。 */
export interface CreativeSolutionCompilerPort {
  compile(input: CreativeSolutionCompilerInput): Promise<CreativeSolutionCompilerOutcome>;
}

/** 仅服务器端的权威端口。实现将HMAC密钥保留在图外状态。 */
export interface ServerPlanSignerPort {
  sign(input: {
    plan: InternalChangePlan;
    revisionId: string;
    semanticOperations: readonly TrustedSemanticOperationInput[];
  }): ServerPlanEnvelope;
}

/**
 * 解决方案图所需的全部依赖项。图本身不拥有任何持久性：所有副作用都通过这些端口传递，因此图本身保持确定性和可恢复性。
 */
export interface SolutionGraphDeps {
  modelPort: ModelPort;
  workspaceQuery: WorkspaceQueryPort;
  changePlanRepository: ChangePlanRepository;
  buildJobPort: BuildJobPort;
  planArtifacts?: PlanArtifactsPort;
  /** 用于蓝图确认后可通过实现规范完成编译的领域。 */
  uiImplementationCompiler?: UiImplementationCompilerPort;
  /** 在任何内部语义包体可以被持久化之前，必须存在。 */
  serverPlanSigner?: ServerPlanSignerPort;
  /** 与 ServerPlanSigner 使用相同的服务器密钥，并由制品权限主体进行域分离。 */
  moduleArtifactAuthority?: ModuleArtifactAuthority;
  /** 生成模块的执行端口；任务10可以不改变检查点状态而连接它。 */
  modulePlanCompiler?: ModulePlanCompilerPort;
  assetCatalog?: AssetCatalogPort;
  acceptedBlueprintConfirmation?: AcceptedBlueprintConfirmationPort;
  /** 仅由创意v2路由所需。 */
  capabilityRetrieval?: CapabilityRetrievalPort;
  /** 仅由创意v2路由所需；从图状态中存储。 */
  creativeSolutionCompiler?: CreativeSolutionCompilerPort;
  /** 域支持谓词（DomainRegistry在生产中后端支持） */
  isDomainSupported: (domain: string) => boolean;
  /** 构建时使用的域（默认为客户端域） */
  defaultDomainKind?: string;
  /** 默认域（默认为域类型） */
  defaultProjectKey?: string;
}
