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
  pendingApproval: PendingApproval | null;
  lastDone: SseDonePayload | null;
  buildJobId: string | null;
  buildJobStatus: BuildJobStatus | null;
  artifacts: ArtifactRow[];
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
  pendingApproval: null,
  lastDone: null,
  buildJobId: null,
  buildJobStatus: null,
  artifacts: [],
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
      if (job.status === "SUCCEEDED") {
        state.artifacts = await api.listBuildArtifacts(jobId);
        state.validationReport = await api.getBuildJobReport(jobId);
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
    if (state.conversationId === null) {
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
  try {
    const done = await streamMessageTurn(state.conversationId, content, () => {
      // 逐帧忽略：最终状态由 done 事件携带；此处保留扩展点。
    });
    state.lastDone = done;
    await refreshMessages();
    applyDone(done);
  } catch (error) {
    state.error = errorMessage(error);
    await refreshMessages().catch(() => {});
    throw error;
  } finally {
    state.streaming = false;
  }
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
  const pending = state.pendingApproval;
  if (pending === undefined || pending === null) return;
  if (state.conversationId === null) throw new Error("对话尚未就绪");
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

/** 将预览制品经授权端点转换为 blob URL，供 sandbox iframe 加载。 */
async function createPreviewUrl(artifactId: string): Promise<string> {
  const { token } = await api.createDownloadToken(artifactId);
  const res = await fetch(api.downloadUrl(token), { credentials: "include" });
  if (!res.ok) {
    throw new Error(`预览加载失败（HTTP ${res.status}）`);
  }
  const blob = await res.blob();
  return URL.createObjectURL(blob);
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
