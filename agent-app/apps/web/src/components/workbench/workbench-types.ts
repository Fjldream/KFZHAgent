// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 工作台 UI 层类型：只服务于界面演示与组件契约，不参与后端接口。
// 后端联调时（T13/T15/T16）再替换为 @kf/contracts 的 ConversationListItem / RunEvent 等。
// end

/** 输入模式：讨论不构建、规划停在方案确认、生成修改确认后构建。 */
export type WorkbenchMode = "discuss" | "plan" | "build";

/** 运行状态：与 P2 计划中的 RunStatus 同名，便于后续平移到真实契约。 */
export type WorkbenchRunStatus =
  | "QUEUED"
  | "RUNNING"
  | "WAITING_INPUT"
  | "WAITING_APPROVAL"
  | "SUCCEEDED"
  | "FAILED"
  | "CANCELLED";

/** 控件能力证据等级：已验证 / 未验证 / 不支持。 */
export type VerificationLevel = "verified" | "unverified" | "unsupported";

/** 左侧会话条目。 */
export interface ConversationSummary {
  id: string;
  title: string;
  /** 运行态摘要文案，例如「生成组件方案中 · 12 秒」。 */
  statusText: string;
  /** 运行态：驱动状态点/转圈样式。 */
  status: WorkbenchRunStatus | null;
  unread: number;
  archived: boolean;
  updatedAt: string;
  mode: WorkbenchMode;
}

/** 时间线步骤状态。 */
export type TimelineStepState = "done" | "warn" | "run" | "pending" | "error";

/** 时间线步骤标签：缓存命中 / 第 N 次尝试 / 自动修复。 */
export type TimelineTag = "cache" | "attempt" | "repair";

export interface TimelineStep {
  id: string;
  title: string;
  detail: string;
  duration: string | null;
  state: TimelineStepState;
  tags: TimelineTag[];
}

/** 参考图区域识别结果（T22）。 */
export interface RegionMapping {
  /** 与叠层 DOM id 对应的稳定键。 */
  id: string;
  /** 显示序号。 */
  no: number;
  name: string;
  control: string;
  support: VerificationLevel;
  confidence: number;
  /** 叠层在参考图上的百分比定位。 */
  box: { left: string; top: string; width: string; height: string };
}

/** 方案确认卡（签名计划）。 */
export interface PlanSummary {
  page: string;
  controlCount: number;
  layout: string;
  baseRevision: string;
  planHash: string;
  signed: boolean;
}

/** 版本列表条目（T17）。 */
export interface RevisionSummary {
  id: string;
  version: string;
  source: string;
  isLatest: boolean;
  isCurrent: boolean;
  schemaOk: boolean;
  compiledOk: boolean;
  visualWarning: boolean;
  runtimeVerified: boolean;
  downloadAvailable: boolean;
  /** 无生成快照的历史版本：局部修改不可用。 */
  note: string | null;
}

/** 用量面板（T01/T02）。 */
export interface UsageSummaryData {
  invocations: number;
  maxInvocations: number;
  cost: string;
  inputTokens: string;
  inputBudget: string;
  outputTokens: string;
  outputBudget: string;
  cacheHitRate: number;
  repairUsed: number;
  repairMax: number;
  unknownInvocations: number;
  details: Array<{ label: string; value: string }>;
}

/** 交付卡的验证等级：runtime 未执行时必须显示「未验证」而不是「通过」。 */
export interface DeliveryBadge {
  level: "pass" | "warning" | "not-checked";
  label: string;
}

export interface DeliverySummary {
  revision: string;
  artifact: string;
  badges: DeliveryBadge[];
  note: string;
}

/** 输入区附件。 */
export type ComposerAttachmentStatus = "uploading" | "ready" | "failed";

export interface ComposerAttachment {
  clientId: string;
  assetId: string | null;
  name: string;
  purpose: "reference" | "material";
  status: ComposerAttachmentStatus;
  /** 上传进度 0–100，仅 uploading 阶段有意义。 */
  progress: number;
  error: string | null;
}

export interface ComposerDraft {
  text: string;
  mode: WorkbenchMode;
  attachments: ComposerAttachment[];
}

/** 演示场景：真实运行时由 run 状态机决定，这里手动切换以便评审各状态。 */
export type WorkbenchScenario = "running" | "waiting-input" | "approval" | "completed" | "conflict";

export interface ScenarioOption {
  value: WorkbenchScenario;
  label: string;
  hint: string;
}
