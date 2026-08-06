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

// ---------------------------------------------------------------------------
// 对话消息的展示层解析（Task 10）
//
// 后端 SSE 消息就是纯文本 content：澄清追问按「问题\n①选项\n②选项」写入
// （clarify 节点），设计计划按 formatDesignPlan 的「设计计划 vN\n工程名：…
// \n分区：\n  区名：控件…」写入。前端不做协议变更，而是用下面的纯函数在
// 渲染层识别文本并增强展示（可点选选项 / 结构化卡片）。返回类型仅用于展示，
// 不进入任何后端契约。
// ---------------------------------------------------------------------------

/** 澄清追问的识别结果：问题正文 + 可点选的选项文本（含前缀原样保留）。 */
export interface ClarifyingQuestionView {
  question: string;
  options: string[];
}

/** 设计计划文本（Task 6 formatDesignPlan 输出）的展示视图。 */
export interface DesignPlanView {
  /** 「设计计划 v1」中的版本号，无版本时为 null。 */
  version: string | null;
  engineeringName: string;
  summary: string;
  layout: string;
  style: string;
  sections: { label: string; controls: string }[];
  signature: string;
}

const OPTION_CIRCLED = /^[①-⑩]/;
const OPTION_NUMERIC = /^\d+[.、]/;
const MAX_OPTIONS = 5;

/**
 * 识别澄清追问文本：第一行为问题，后续连续行以 ①②③④⑤ 或 1. 2. 开头
 * 且不超过 5 个选项。未命中返回 null（调用方回退为纯文本渲染）。
 */
export function parseClarifyingQuestion(content: string): ClarifyingQuestionView | null {
  const lines = content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length < 2) return null;
  const question = lines[0]!;
  const options: string[] = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (!OPTION_CIRCLED.test(line) && !OPTION_NUMERIC.test(line)) break;
    options.push(line);
  }
  if (options.length === 0 || options.length > MAX_OPTIONS) return null;
  return { question, options };
}

const DESIGN_PLAN_HEADER = /^设计计划(?:\s*(v?\d+))?/;
const SECTION_LINE = /^\s{2,}([^：:]+)[：:]\s*(.+)$/;
const FIELD_LINE = /^([^：:]+)[：:]\s*(.*)$/;

/**
 * 识别设计计划文本（formatDesignPlan 输出）：首行以「设计计划」开头，
 * 逐行提取 工程名/摘要/布局/风格/记忆点 与「分区：」下的缩进分区。
 * 至少要提取到一个计划字段才算命中，否则返回 null。
 */
export function parseDesignPlan(content: string): DesignPlanView | null {
  const lines = content.split("\n");
  const header = lines[0]?.trim().match(DESIGN_PLAN_HEADER);
  if (header === undefined || header === null) return null;

  const view: DesignPlanView = {
    version: header[1] ?? null,
    engineeringName: "",
    summary: "",
    layout: "",
    style: "",
    sections: [],
    signature: "",
  };

  let inSections = false;
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (inSections) {
      const section = line.match(SECTION_LINE);
      if (section !== null) {
        view.sections.push({ label: section[1]!.trim(), controls: section[2]!.trim() });
        continue;
      }
      // 缩进分区段结束（记忆点/提示行不再以两个空格缩进）。
      inSections = false;
    }
    const field = line.match(FIELD_LINE);
    if (field === null) continue;
    const key = field[1]!.trim();
    const value = field[2]!.trim();
    if (key === "分区") inSections = true;
    else if (key === "工程名") view.engineeringName = value;
    else if (key === "摘要") view.summary = value;
    else if (key === "布局") view.layout = value;
    else if (key === "风格") view.style = value;
    else if (key === "记忆点") view.signature = value;
  }

  const hasPlanContent =
    view.engineeringName !== "" || view.summary !== "" || view.signature !== "";
  return hasPlanContent ? view : null;
}
