import { z } from 'zod'
import {
  CapabilityReportSchema,
  CapabilityCandidateBundleSchema,
  AcceptedBlueprintArtifactSchema,
  ModuleCompilationArtifactSchema,
  ModuleDeliveryReportSchema,
  ModuleDeliveryOwnerMappingsSchema,
  ModulePlanSchema,
  pendingRequirementSchema,
  DesignPlanSchema,
  UIImplementationSpecSchema,
  SolutionImplementationPlanSchema,
  type DesignPlan,
} from '@kf/contracts'
import { StateSchema } from '@langchain/langgraph'
import { IntentSchema } from './schemas/intent.js'

/**
 * 单个持久化会话消息，由角色+内容限定。从不携带原始上传的文件，秘密，完整页面JSON，
 * 或不受信任的脚本文本（简单步骤6）.
 */
export const MessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string(),
})
export type GraphMessage = z.infer<typeof MessageSchema>

/**
 * 图表所处的工作流程阶段。“approval”是中断点，
 * 图等待用户批准/修改/取消挂起的变更计划。
 * 设计流程阶段（‘澄清’…‘完成’）被附加在
 * 遗留值的顶部，以便现有路由继续工作
 */
export const StageSchema = z.enum([
  'idle',
  'planning',
  'approval',
  'building',
  'clarifying',
  'design-review',
  'design-planning',
  'implementation-planning',
  'preview-review',
  'solution-plan-ready',
  'done',
])
export type Stage = z.infer<typeof StageSchema>

/**
 * 结构化中断数据包（简要的第 5 步）。字段名称和含义来自简要：类型、 changeRequestId、 planHash、摘要、 diffArtifactId、 previewArtifactId。
 */
export const ApprovalInterruptSchema = z.object({
  type: z.literal('plan-approval'),
  changeRequestId: z.string(),
  planHash: z.string(),
  summary: z.string(),
  diffArtifactId: z.string().optional(),
  previewArtifactId: z.string().optional(),
})
export type ApprovalInterrupt = z.infer<typeof ApprovalInterruptSchema>

/**
 * API 层通过 `Command({ resume })` 返回的恢复载荷。必须包含 approve/revise/cancel 操作以及向用户展示的确切 planHash；任何不匹配都会使恢复失败，且不产生副作用。
 */
export const ApprovalResumeSchema = z.object({
  action: z.enum(['approve', 'revise', 'cancel']),
  planHash: z.string(),
})
export type ApprovalResume = z.infer<typeof ApprovalResumeSchema>

/**
 * 单 Agent 解决方案工作流状态（简要步骤 1，包含原样字段以及下方记录的辅助上下文通道）。
 *
 * 简要说明中的原样字段：
 *   tenantId, userId, workspaceId, conversationId, currentRevisionId,
 *   activeChangeRequestId, changePlanId, planHash, buildJobId, intent, stage,
 *   recentMessages, conversationSummary, lastErrorCode。
 *
 * 辅助通道（简要步骤 6 的有界上下文）：
 *   revisionSummary      — 当前修订的有界摘要（绝不包含完整页面 JSON / 项目 IR）。
 *   planSummary          — 用于审批中断的有界、可读计划摘要。
 *   diffArtifactId       — 保存计划差异的制品（生产制品管线尚未接入时为 undefined）。
 *   previewArtifactId    — 保存渲染预览的制品。
 *   pendingRequirements  — 对不受支持领域的请求；这些请求绝不会进入构建队列（简要步骤 4）。
 */
export const AgentGraphState = new StateSchema({
  tenantId: z.string().min(1),
  userId: z.string().min(1),
  workspaceId: z.string().min(1),
  conversationId: z.string().min(1),
  currentRevisionId: z.string().optional(),
  workspaceMode: z.enum(['new', 'upload']).optional(),
  generationWorkflow: z.enum(['legacy', 'module-v1', 'creative-v2']).optional(),
  activeChangeRequestId: z.string().optional(),
  changePlanId: z.string().optional(),
  planHash: z.string().optional(),
  buildJobId: z.string().optional(),
  intent: IntentSchema.optional(),
  /**
 * 当前请求上花了多少澄清回合（最多5个；分类节点拒绝在超过这个限制后继续询问）。
 */
  clarificationCount: z.number().int().min(0).max(5).optional(),
  /**
 * 在模型能够路由前，它提出澄清问题。
 * 从分类意图到澄清节点，它将其作为助理消息并清除它。
 */
  clarifyingQuestion: z
    .object({
      question: z.string().min(1),
      options: z.array(z.string()).max(5).optional(),
    })
    .optional(),
  /** 当前回合的简短模型回复（ fallback渠道）。 */
  reply: z.string().optional(),
  /** 一旦客户端确认了构建预览（阶段=done，落地），则为真。 */
  buildConfirmed: z.boolean().optional(),
  /**
 * 设计计划，在设计规划（合同任务3）期间产生的设计计划。
 * `revising` 标记了对这个计划的在进展中的修订（由任务6使用）。
 */
  designPlan: DesignPlanSchema.optional(),
  designPlanHash: z.string().optional(),
  designRevision: z.number().int().min(0).optional(),
  revising: z.boolean().optional(),
  /** 内部使用的、由模型生成的实现意图，已在确定性编译前通过验证。 */
  uiImplementation: UIImplementationSpecSchema.optional(),
  uiImplementationHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  /** 服务器签名的模块制品以 JSON 形式持久化；每次读取检查点后都会重建运行时品牌。 */
  acceptedBlueprintArtifact: AcceptedBlueprintArtifactSchema.optional(),
  modulePlan: ModulePlanSchema.optional(),
  modulePlanHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  moduleCompilationArtifact: ModuleCompilationArtifactSchema.optional(),
  moduleDeliveryReport: ModuleDeliveryReportSchema.optional(),
  moduleDeliveryOwnerMappings: ModuleDeliveryOwnerMappingsSchema.optional(),
  moduleRepairAttempt: z.number().int().min(0).max(3).optional(),
  /** 绑定到确切规范 v3 蓝图的确定性检索输出。 */
  capabilityCandidates: CapabilityCandidateBundleSchema.optional(),
  capabilityCandidatesHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  /** 仅语义的创意计划。第二阶段在编译/构建之前停止。 */
  solutionImplementationPlan: SolutionImplementationPlanSchema.optional(),
  solutionImplementationPlanHash: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  solutionPlanRepairAttempt: z.number().int().min(0).max(1).optional(),
  /** 已经由工程生成流程使用的 v3 蓝图确认的持久化标识。 */
  creativeConfirmationId: z
    .string()
    .regex(/^[0-9a-f]{64}$/)
    .optional(),
  creativeProjectKey: z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*$/)
    .optional(),
  creativeDomainKind: z.string().trim().min(1).max(128).optional(),
  /** 服务器路由的证明，为什么当前的 ChangePlan 可以进入构建队列。 */
  buildAuthorization: z
    .enum([
      'confirmed-blueprint',
      'preview-feedback',
      'legacy-plan-approval',
      'creative-solution',
    ])
    .optional(),
  capabilityReport: CapabilityReportSchema.optional(),
  stage: StageSchema,
  recentMessages: z.array(MessageSchema),
  conversationSummary: z.string().optional(),
  lastErrorCode: z.string().optional(),
  revisionSummary: z.string().optional(),
  planSummary: z.string().optional(),
  diffArtifactId: z.string().optional(),
  previewArtifactId: z.string().optional(),
  pendingRequirements: z.array(pendingRequirementSchema).optional(),
  /** 由 approval 节点写入的恢复路由决策（内部）。 */
  resumeAction: z.enum(['approve', 'revise', 'cancel']).optional(),
})

export type AgentGraphStateValue = typeof AgentGraphState.State
export type AgentGraphUpdate = typeof AgentGraphState.Update

/**
 * 设计计划，由`AgentGraphState.designPlan`（简要任务3
 * 合同）承载。任务6的编译步骤读取此字段，以构建ClientProjectIR/ControlIR。
 */
export type DesignPlanField = DesignPlan
