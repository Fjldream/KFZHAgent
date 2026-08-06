import { reactive } from "vue";
import { api, ApiError } from "../api";
import { streamMessageTurn } from "../sse";
import type {
  ApprovalInterrupt,
  ArtifactRow,
  BuildJobStatus,
  ChangePlanDisplay,
  ChatMessage,
  Revision,
  ScriptChange,
  SseDonePayload,
  ValidationReport,
  Workspace,
} from "../types";

/**
 * 工作区 store：一个 workspace = 一个连续对话（conversation）+ 确认计划 +
 * 构建产物 + 修订历史 + 校验报告，全部在同屏呈现（brief Step 3）。
 *
 * 安全与 UX 规则：
 *  - 批准只发送屏幕上展示的 planHash（brief Step 4）；
 *  - 新用户需求清除本地 approval 状态（brief Step 4）；
 *  - 下载只通过授权下载端点（brief Step 5）。
 */

export interface PendingApproval {
  planHash: string;
  summary?: string;
  changeRequestId?: string;
  changePlanId?: string;
  diffArtifactId?: string;
  previewArtifactId?: string;
  plan?: ChangePlanDisplay;
  /** 计划中 linkMng（脚本类）变更，确认前单独展示（I5）。 */
  scriptChanges?: ScriptChange[];
}

export interface WorkspaceState {
  workspaceId: string | null;
  workspace: Workspace | null;
  loading: boolean;
  error: string | null;
  conversationId: string | null;
  messages: ChatMessage[];
  streaming: boolean;
  /** 节点级流式提示：LLM 回合进行中显示的阶段文案（如「正在分析需求…」）。 */
  phaseHint: string | null;
  /** 批准/改稿/取消请求进行中，防止快速双击并发重复提交（I2）。 */
  resuming: boolean;
  pendingApproval: PendingApproval | null;
  lastDone: SseDonePayload | null;
  buildJobId: string | null;
  buildJobStatus: BuildJobStatus | null;
  artifacts: ArtifactRow[];
  /** 最近一次构建产出的 client-package artifact（构建成功后供预览）。 */
  previewArtifactId: string | undefined;
  validationReport: ValidationReport | null;
  revisions: Revision[];
  currentRevisionId: string | null;
}

const state: WorkspaceState = reactive({
  workspaceId: null,
  workspace: null,
  loading: false,
  error: null,
  conversationId: null,
  messages: [],
  streaming: false,
  phaseHint: null,
  resuming: false,
  pendingApproval: null,
  lastDone: null,
  buildJobId: null,
  buildJobStatus: null,
  artifacts: [],
  previewArtifactId: undefined,
  validationReport: null,
  revisions: [],
  currentRevisionId: null,
});

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}

async function refreshMessages(): Promise<void> {
  if (state.conversationId === null) return;
  const rows = await api.listMessages(state.conversationId);
  state.messages = rows.map((row) => ({
    id: row.id,
    role: row.role === "user" ? "user" : "assistant",
    content: row.content,
  }));
}

async function refreshRevisions(): Promise<void> {
  if (state.workspaceId === null) return;
  const revisions = await api.listRevisions(state.workspaceId);
  state.revisions = [...revisions].sort((a, b) => b.revisionNumber - a.revisionNumber);
  const workspace = await api.getWorkspace(state.workspaceId);
  state.workspace = workspace;
  state.currentRevisionId = workspace.currentRevisionId ?? null;
}

async function pollBuildJob(jobId: string): Promise<BuildJobStatus> {
  state.buildJobId = jobId;
  state.buildJobStatus = "QUEUED";
  for (;;) {
    const job = await api.getBuildJob(jobId);
    state.buildJobStatus = job.status;
    if (job.status === "SUCCEEDED" || job.status === "FAILED") {
      // 终态统一加载最新校验报告：SUCCEEDED/FAILED 后端均返回 report
      // （FAILED 为 fail report，spec §7 明文缺口修复）。报告加载失败不
      // 影响 job 状态判断；此时置空以覆盖旧报告，避免残留误导。
      if (job.status === "SUCCEEDED") {
        state.artifacts = await api.listBuildArtifacts(jobId);
        const clientPackage = state.artifacts.find((a) => a.kind === "client-package");
        if (clientPackage !== undefined) {
          state.previewArtifactId = clientPackage.id;
        }
      }
      try {
        state.validationReport = await api.getBuildJobReport(jobId);
      } catch {
        state.validationReport = null;
      }
      await refreshRevisions();
      return job.status;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

async function load(workspaceId: string): Promise<void> {
  state.loading = true;
  state.error = null;
  state.workspaceId = workspaceId;
  try {
    state.workspace = await api.getWorkspace(workspaceId);
    await refreshRevisions();
    // 恢复对话历史：每次进入工作区都按 workspaceId 重新绑定会话——优先
    // 复用最新会话（消息在服务端持久化），无历史才新建。这样刷新/重进
    // 能看到旧对话，切换工程也不会残留上一个工程的 conversationId。
    const existing = await api.listConversations(workspaceId);
    const latest = existing[0];
    if (latest !== undefined) {
      state.conversationId = latest.id;
    } else {
      const conversation = await api.createConversation(workspaceId, "解决方案对话");
      state.conversationId = conversation.id;
    }
    await refreshMessages();
  } catch (error) {
    state.error = errorMessage(error);
    throw error;
  } finally {
    state.loading = false;
  }
}

async function createWorkspace(input: { name: string; mode?: "new" | "upload" }): Promise<Workspace> {
  state.error = null;
  const workspace = await api.createWorkspace({
    name: input.name,
    mode: input.mode === "upload" ? "upload" : "new",
  });
  await load(workspace.id);
  return workspace;
}

async function uploadSource(file: Blob): Promise<void> {
  if (state.workspaceId === null) throw new Error("尚未创建工作区");
  state.loading = true;
  state.error = null;
  try {
    const result = await api.uploadSource(state.workspaceId, file);
    void result;
    await refreshRevisions();
    if (state.conversationId === null) {
      const conversation = await api.createConversation(state.workspaceId, "解决方案对话");
      state.conversationId = conversation.id;
    }
  } catch (error) {
    state.error = errorMessage(error);
    throw error;
  } finally {
    state.loading = false;
  }
}

async function sendMessage(content: string): Promise<void> {
  if (state.conversationId === null) throw new Error("对话尚未就绪");
  state.error = null;
  // 新用户需求清除本地 approval 状态（brief Step 4）。
  state.pendingApproval = null;
  state.streaming = true;
  state.phaseHint = "正在提交需求…";
  // 用户消息乐观上屏（临时 id，done 后 refreshMessages 与服务器同步替换）。
  const optimisticId = `optimistic-${Date.now()}`;
  state.messages.push({ id: optimisticId, role: "user", content });
  try {
    const done = await streamMessageTurn(state.conversationId, content, (data) => {
      // 节点级流式：state 帧的键是节点名，值含 stage 等字段。
      // 用节点名映射阶段提示，让用户感知 LLM 回合进度。
      const hint = phaseHintForNode(data);
      if (hint !== null) state.phaseHint = hint;
    });
    state.lastDone = done;
    await refreshMessages();
    applyDone(done);
  } catch (error) {
    state.error = errorMessage(error);
    // 移除乐观消息（避免与服务器状态不一致的残留），再拉取真实列表。
    const idx = state.messages.findIndex((m) => m.id === optimisticId);
    if (idx >= 0) state.messages.splice(idx, 1);
    await refreshMessages().catch(() => {});
    throw error;
  } finally {
    state.streaming = false;
    state.phaseHint = null;
  }
}

/** 节点名 → 阶段提示文案（节点级流式，非 token 级）。 */
const NODE_HINTS: Record<string, string> = {
  "load-context": "正在加载工程上下文…",
  "classify-intent": "正在理解你的需求…",
  "design-plan": "正在生成设计计划…",
  "clarify": "正在确认需求细节…",
  "plan-change": "正在生成变更计划…",
  "build": "正在构建工程…",
  "validate": "正在校验工程…",
  "preview-review": "正在准备预览…",
};

/** 从 state 帧提取阶段提示；非节点帧或未知节点返回 null。 */
function phaseHintForNode(data: unknown): string | null {
  if (typeof data !== "object" || data === null) return null;
  const keys = Object.keys(data);
  for (const key of keys) {
    if (key in NODE_HINTS) return NODE_HINTS[key] ?? null;
  }
  return null;
}

/** 将 done 快照路由到审批 / 构建 / 错误等 UI 状态。 */
function applyDone(done: SseDonePayload): void {
  const interrupt = done.interrupt;
  if (interrupt !== null && interrupt !== undefined && typeof interrupt.planHash === "string") {
    const changePlanId = typeof done.changePlanId === "string" ? done.changePlanId : undefined;
    state.pendingApproval = {
      planHash: interrupt.planHash,
      ...(interrupt.summary !== undefined ? { summary: interrupt.summary } : {}),
      ...(interrupt.changeRequestId !== undefined ? { changeRequestId: interrupt.changeRequestId } : {}),
      ...(changePlanId !== undefined ? { changePlanId } : {}),
      ...(interrupt.diffArtifactId !== undefined ? { diffArtifactId: interrupt.diffArtifactId } : {}),
      ...(interrupt.previewArtifactId !== undefined ? { previewArtifactId: interrupt.previewArtifactId } : {}),
    };
    state.buildJobId = null;
    state.buildJobStatus = null;
    if (changePlanId !== undefined) {
      void loadPlanDetails(changePlanId);
    }
    return;
  }
  if (typeof done.buildJobId === "string") {
    state.buildJobId = done.buildJobId;
    void pollBuildJob(done.buildJobId);
  }
}

async function loadPlanDetails(changePlanId: string): Promise<void> {
  try {
    const plan = await api.getChangePlan(changePlanId);
    if (state.pendingApproval !== null && state.pendingApproval.changePlanId === changePlanId) {
      state.pendingApproval.plan = plan.plan;
      state.pendingApproval.scriptChanges = plan.scriptChanges;
    }
  } catch {
    // 计划详情加载失败不阻塞审批流程；summary 与 planHash 仍可用。
  }
}

async function resumeApproval(action: "approve" | "revise" | "cancel"): Promise<void> {
  // 防重入：请求进行中直接忽略，避免快速双击发出重复 /resume 请求（I2）。
  if (state.resuming) return;
  const pending = state.pendingApproval;
  if (pending === undefined || pending === null) return;
  if (state.conversationId === null) throw new Error("对话尚未就绪");
  state.resuming = true;
  state.error = null;
  try {
    const result = await api.resume(state.conversationId, { action, planHash: pending.planHash });
    state.pendingApproval = null;
    const jobId = typeof result.buildJobId === "string" ? result.buildJobId : undefined;
    const interrupt = result.interrupt as ApprovalInterrupt | null | undefined;
    if (interrupt !== null && interrupt !== undefined && typeof interrupt.planHash === "string") {
      const changePlanId = typeof result.changePlanId === "string" ? result.changePlanId : undefined;
      state.pendingApproval = {
        planHash: interrupt.planHash,
        ...(interrupt.summary !== undefined ? { summary: interrupt.summary } : {}),
        ...(interrupt.changeRequestId !== undefined ? { changeRequestId: interrupt.changeRequestId } : {}),
        ...(changePlanId !== undefined ? { changePlanId } : {}),
        ...(interrupt.diffArtifactId !== undefined ? { diffArtifactId: interrupt.diffArtifactId } : {}),
        ...(interrupt.previewArtifactId !== undefined ? { previewArtifactId: interrupt.previewArtifactId } : {}),
      };
      if (changePlanId !== undefined) {
        void loadPlanDetails(changePlanId);
      }
      return;
    }
    if (jobId !== undefined) {
      state.buildJobId = jobId;
      await pollBuildJob(jobId);
    }
    await refreshMessages();
  } catch (error) {
    state.error = errorMessage(error);
    throw error;
  } finally {
    state.resuming = false;
  }
}

async function deleteWorkspace(): Promise<void> {
  if (state.workspaceId === null) return;
  await api.deleteWorkspace(state.workspaceId);
}

/** 触发浏览器下载（两段式 token → 授权端点流式字节）。 */
async function downloadArtifact(artifactId: string): Promise<void> {
  const { token } = await api.createDownloadToken(artifactId);
  const url = api.downloadUrl(token);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${artifactId}.gz`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

/** 预览 iframe 直接加载渲染端点（服务端把 ClientProjectIR 渲染为 HTML）。 */
function createPreviewUrl(artifactId: string): string {
  return api.previewUrl(artifactId);
}

export function useWorkspace() {
  return {
    state,
    load,
    createWorkspace,
    uploadSource,
    sendMessage,
    resumeApproval,
    pollBuildJob,
    refreshRevisions,
    refreshMessages,
    downloadArtifact,
    createPreviewUrl,
    deleteWorkspace,
  };
}
