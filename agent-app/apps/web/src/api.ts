import type {
  ArtifactRow,
  BuildJob,
  BuildJobStatus,
  ChangePlanDisplay,
  LoginResult,
  MeResult,
  Revision,
  ScriptChange,
  UploadResult,
  ValidationReport,
  Workspace,
} from "./types";

/**
 * API 客户端。所有请求携带会话 Cookie（credentials: "include"）；
 * 下载只走两段式短时 token 协议（Task 11）。
 */

/**
 * API 基地址。默认走同源相对路径（dev 下由 vite proxy 转发到后端，
 * 保证无论页面从 localhost 还是 127.0.0.1 打开都同源，SameSite cookie
 * 正常携带）；生产部署可用 VITE_API_BASE 指向独立 API 域。
 */
export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? "";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

async function parseErrorBody(res: Response): Promise<ApiError> {
  let message = `请求失败（HTTP ${res.status}）`;
  let code: string | undefined;
  try {
    const body = (await res.json()) as { message?: unknown; error?: { message?: unknown; code?: unknown } };
    const nested = body.error;
    if (nested !== null && typeof nested === "object") {
      if (typeof nested.message === "string") message = nested.message;
      if (typeof nested.code === "string") code = nested.code;
    } else if (typeof body.message === "string") {
      message = body.message;
    }
  } catch {
    // 非 JSON 错误体，保留默认消息。
  }
  return new ApiError(res.status, message, code);
}

async function jsonFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    credentials: "include",
  });
  if (!res.ok) throw await parseErrorBody(res);
  return res;
}

async function jsonResponse<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await jsonFetch(path, init);
  return (await res.json()) as T;
}

async function nullableJsonResponse<T>(path: string, init: RequestInit = {}): Promise<T | null> {
  const res = await jsonFetch(path, init);
  const text = await res.text();
  return text.length === 0 ? null : JSON.parse(text) as T;
}

export const api = {
  // ---- 认证（Cookie 会话）------------------------------------------------
  async login(input: { tenant: string; username: string; password: string }): Promise<LoginResult> {
    return jsonResponse<LoginResult>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async me(): Promise<MeResult> {
    return jsonResponse<MeResult>("/api/me");
  },
  async logout(): Promise<void> {
    await jsonFetch("/api/auth/logout", { method: "POST" });
  },
  /** 首次登录强制改密：成功后返回完整会话（服务端会 set-cookie 新 token）。 */
  async changePassword(input: {
    currentPassword: string;
    newPassword: string;
  }): Promise<LoginResult> {
    return jsonResponse<LoginResult>("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  // ---- 工作区 -------------------------------------------------------------
  async listWorkspaces(): Promise<Workspace[]> {
    return jsonResponse<Workspace[]>("/api/workspaces");
  },
  async createWorkspace(input: { name: string; description?: string; mode?: "new" | "upload" }): Promise<Workspace> {
    return jsonResponse<Workspace>("/api/workspaces", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async getWorkspace(workspaceId: string): Promise<Workspace> {
    return jsonResponse<Workspace>(`/api/workspaces/${workspaceId}`);
  },
  async deleteWorkspace(workspaceId: string): Promise<void> {
    await jsonFetch(`/api/workspaces/${workspaceId}`, {
      method: "DELETE",
      body: JSON.stringify({ confirm: true }),
    });
  },
  async listRevisions(workspaceId: string): Promise<Revision[]> {
    return jsonResponse<Revision[]>(`/api/workspaces/${workspaceId}/revisions`);
  },
  async uploadSource(workspaceId: string, file: Blob): Promise<UploadResult> {
    const res = await fetch(`${API_BASE}/api/workspaces/${workspaceId}/uploads`, {
      method: "POST",
      headers: { "Content-Type": "application/octet-stream" },
      credentials: "include",
      body: file,
    });
    if (!res.ok) throw await parseErrorBody(res);
    return (await res.json()) as UploadResult;
  },

  // ---- 会话对话（SSE） -----------------------------------------------------
  async createConversation(workspaceId: string, title?: string): Promise<{ id: string; title: string }> {
    return jsonResponse<{ id: string; title: string }>("/api/conversations", {
      method: "POST",
      body: JSON.stringify({ workspaceId, ...(title !== undefined ? { title } : {}) }),
    });
  },
  /** 列出 workspace 下已有会话（最新在前），用于恢复对话历史。 */
  async listConversations(workspaceId: string): Promise<{ id: string; title: string }[]> {
    return jsonResponse<{ id: string; title: string }[]>(
      `/api/conversations?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
  },
  async getChangePlan(
    changePlanId: string,
  ): Promise<{
    id: string;
    planHash: string;
    plan: ChangePlanDisplay;
    scriptChanges: ScriptChange[];
  }> {
    return jsonResponse<{
      id: string;
      planHash: string;
      plan: ChangePlanDisplay;
      scriptChanges: ScriptChange[];
    }>(`/api/change-plans/${changePlanId}`);
  },
  async listMessages(conversationId: string): Promise<{ id: string; role: string; content: string }[]> {
    return jsonResponse<{ id: string; role: string; content: string }[]>(
      `/api/conversations/${conversationId}/messages`,
    );
  },
  async getConversationDelivery(conversationId: string, buildJobId?: string): Promise<import("./types").PersistedModuleDelivery | null> {
    const query = buildJobId === undefined ? "" : `?buildJobId=${encodeURIComponent(buildJobId)}`;
    return nullableJsonResponse<import("./types").PersistedModuleDelivery>(
      `/api/conversations/${encodeURIComponent(conversationId)}/delivery${query}`,
    );
  },
  async resume(conversationId: string, input: { action: "approve" | "revise" | "cancel"; planHash: string }): Promise<Record<string, unknown>> {
    return jsonResponse<Record<string, unknown>>(`/api/conversations/${conversationId}/resume`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  // ---- 构建 / 制品 / 下载 -------------------------------------------------
  async getLatestBuildJob(workspaceId: string): Promise<BuildJob | null> {
    const response = await jsonResponse<{ job: BuildJob | null }>(
      `/api/build-jobs?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
    return response.job;
  },
  async getBuildJob(jobId: string): Promise<BuildJob> {
    return jsonResponse<BuildJob>(`/api/build-jobs/${jobId}`);
  },
  async getBuildJobReport(jobId: string): Promise<ValidationReport> {
    return jsonResponse<ValidationReport>(`/api/build-jobs/${jobId}/report`);
  },
  async listBuildArtifacts(jobId: string): Promise<ArtifactRow[]> {
    return jsonResponse<ArtifactRow[]>(`/api/build-jobs/${jobId}/artifacts`);
  },
  async createDownloadToken(artifactId: string): Promise<{ token: string; expiresAt: string; artifactId: string }> {
    return jsonResponse<{ token: string; expiresAt: string; artifactId: string }>(
      `/api/artifacts/${artifactId}/download-token`,
      { method: "POST" },
    );
  },
  /** 预览端点 URL（iframe src 直接加载服务端渲染的 HTML）。 */
  previewUrl(artifactId: string): string {
    return `${API_BASE}/api/artifacts/${encodeURIComponent(artifactId)}/preview`;
  },
  /** 两段式下载最终 URL（GET 该地址返回制品字节流）。 */
  downloadUrl(token: string): string {
    return `${API_BASE}/api/artifacts/download/${token}`;
  },
};

export type JobStatusLike = BuildJobStatus;
