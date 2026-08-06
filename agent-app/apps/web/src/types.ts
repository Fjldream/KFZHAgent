/**
 * 前端 API 契约类型（与 Task 11 契约一致；字段名逐字来自 API 响应）。
 */

export interface SessionUser {
  id: string;
  username: string;
  role: string;
  tenantId: string;
}

export interface LoginResult {
  user: SessionUser;
  mustChangePassword: boolean;
}

/** /api/me 响应：额外携带必须改密标志（I2 会话恢复用）。 */
export interface MeResult extends SessionUser {
  mustChangePassword: boolean;
}

export interface Workspace {
  id: string;
  name: string;
  description?: string | null;
  mode: string;
  currentRevisionId?: string | null;
  /** 后端 SolutionWorkspace 返回含这些字段（前端仅展示用）。 */
  createdAt?: string;
  updatedAt?: string;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
}

export interface ChangeOperation {
  op: "create" | "update" | "delete";
  entityId: string;
  entityType?: string;
  changes?: { path: string; value: unknown }[];
  properties?: Record<string, unknown>;
  destructiveConfirmed?: boolean;
}

/** 计划摘要：用于确认 UX 展示的规范化计划。 */
export interface ChangePlanDisplay {
  schema?: string;
  workspaceId?: string;
  operations: ChangeOperation[];
}

/**
 * 计划中涉及 linkMng（控件事件脚本）子树的变更（I5）。服务端在
 * change-plan 响应里单独标注，确认视图必须把它与普通字段变更分开展示。
 */
export interface ScriptChange {
  op: string;
  entityId: string;
  entityType?: string;
  paths: string[];
}

/** SSE done 事件中的 approval interrupt 载荷（brief Step 5 字段逐字）。 */
export interface ApprovalInterrupt {
  type: "plan-approval";
  changeRequestId?: string;
  planHash?: string;
  summary?: string;
  diffArtifactId?: string;
  previewArtifactId?: string;
}

export interface SseDonePayload {
  stage?: string | null;
  intent?: string | null;
  lastErrorCode?: string | null;
  buildJobId?: string | null;
  workspaceId?: string | null;
  conversationId?: string | null;
  planHash?: string | null;
  changePlanId?: string | null;
  changeRequestId?: string | null;
  interrupt?: ApprovalInterrupt | null;
}

export interface Revision {
  id: string;
  revisionNumber: number;
  kind: string;
  createdAt: string;
}

export type BuildJobStatus = "QUEUED" | "RUNNING" | "VALIDATING" | "SUCCEEDED" | "FAILED";

export interface BuildJob {
  id: string;
  workspaceId: string;
  status: BuildJobStatus;
  planHash: string;
  baseRevisionId: string;
  changePlanId: string;
}

export interface ArtifactRow {
  id: string;
  kind: string;
  storageKey: string;
  sizeBytes: number | null;
  sha256: string | null;
}

export interface ValidationReport {
  outcome: "pass" | "fail";
  summary?: string;
  details?: Record<string, unknown>;
}

export interface SolutionTreeNode {
  label: string;
  domain?: string;
  supported?: boolean;
  children: SolutionTreeNode[];
}

export interface UploadResult {
  revision: Revision;
  packageUrl: string;
  summary: { project?: { name?: string } };
}
