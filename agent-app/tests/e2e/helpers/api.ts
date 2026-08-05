import { API_BASE } from "./config";

/**
 * 基于 Playwright APIRequestContext 的 E2E API 客户端。
 * page.context().request 与页面共享 Cookie，因此登录后即可访问受保护端点。
 */

export interface SseFrame {
  event: string;
  data: unknown;
}

export interface ApprovalInterruptLike {
  type?: string;
  planHash?: string;
  summary?: string;
  changeRequestId?: string;
  changePlanId?: string;
  diffArtifactId?: string;
  previewArtifactId?: string;
}

export interface DonePayloadLike {
  stage?: string | null;
  planHash?: string | null;
  changePlanId?: string | null;
  changeRequestId?: string | null;
  buildJobId?: string | null;
  lastErrorCode?: string | null;
  interrupt?: ApprovalInterruptLike | null;
}

export async function loginViaApi(
  request: import("@playwright/test").APIRequestContext,
  user: { tenant: string; username: string; password: string },
): Promise<{ user: { id: string } }> {
  const res = await request.post(`${API_BASE}/api/auth/login`, {
    data: { tenant: user.tenant, username: user.username, password: user.password },
  });
  if (res.status() !== 200) {
    throw new Error(`login failed (${res.status()}): ${await res.text()}`);
  }
  return (await res.json()) as { user: { id: string } };
}

export async function createWorkspace(
  request: import("@playwright/test").APIRequestContext,
  name: string,
  mode: "new" | "upload" = "new",
): Promise<{ id: string; name: string; mode: string }> {
  const res = await request.post(`${API_BASE}/api/workspaces`, {
    data: { name, ...(mode === "upload" ? { mode } : {}) },
  });
  if (res.status() !== 201) {
    throw new Error(`create workspace failed (${res.status()}): ${await res.text()}`);
  }
  return (await res.json()) as { id: string; name: string; mode: string };
}

export async function createConversation(
  request: import("@playwright/test").APIRequestContext,
  workspaceId: string,
  title = "E2E 对话",
): Promise<{ id: string; title: string }> {
  const res = await request.post(`${API_BASE}/api/conversations`, {
    data: { workspaceId, title },
  });
  if (res.status() !== 201) {
    throw new Error(`create conversation failed (${res.status()}): ${await res.text()}`);
  }
  return (await res.json()) as { id: string; title: string };
}

export function parseSse(text: string): SseFrame[] {
  const frames: SseFrame[] = [];
  for (const block of text.split("\n\n")) {
    if (block.trim().length === 0) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice("event:".length).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trim());
    }
    if (dataLines.length > 0) {
      frames.push({ event, data: JSON.parse(dataLines.join("\n")) as unknown });
    }
  }
  return frames;
}

export function doneOf(text: string): DonePayloadLike {
  const done = parseSse(text).find((frame) => frame.event === "done");
  if (done === undefined) {
    throw new Error(`no done SSE frame in response: ${text}`);
  }
  return done.data as DonePayloadLike;
}

export async function sendMessageAndGetDone(
  request: import("@playwright/test").APIRequestContext,
  conversationId: string,
  content: string,
): Promise<DonePayloadLike> {
  const res = await request.post(`${API_BASE}/api/conversations/${conversationId}/messages`, {
    data: { content },
  });
  if (res.status() !== 200) {
    throw new Error(`send message failed (${res.status()}): ${await res.text()}`);
  }
  return doneOf(await res.text());
}

export async function resumeApproval(
  request: import("@playwright/test").APIRequestContext,
  conversationId: string,
  action: "approve" | "revise" | "cancel",
  planHash: string,
): Promise<Record<string, unknown>> {
  const res = await request.post(`${API_BASE}/api/conversations/${conversationId}/resume`, {
    data: { action, planHash },
  });
  if (res.status() !== 200) {
    throw new Error(`resume ${action} failed (${res.status()}): ${await res.text()}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

export async function waitForBuildJob(
  request: import("@playwright/test").APIRequestContext,
  jobId: string,
  timeoutMs = 120_000,
): Promise<{ id: string; status: string }> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await request.get(`${API_BASE}/api/build-jobs/${jobId}`);
    if (res.status() !== 200) {
      throw new Error(`build job fetch failed (${res.status()})`);
    }
    const job = (await res.json()) as { id: string; status: string };
    if (job.status === "SUCCEEDED") return job;
    if (job.status === "FAILED") {
      throw new Error(`build job FAILED: ${JSON.stringify(job)}`);
    }
    if (Date.now() > deadline) {
      throw new Error(`build job ${jobId} did not finish within ${timeoutMs}ms (${job.status})`);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
}

export async function listBuildArtifacts(
  request: import("@playwright/test").APIRequestContext,
  jobId: string,
): Promise<{ id: string; kind: string; storageKey: string }[]> {
  const res = await request.get(`${API_BASE}/api/build-jobs/${jobId}/artifacts`);
  if (res.status() !== 200) {
    throw new Error(`artifacts fetch failed (${res.status()})`);
  }
  return (await res.json()) as { id: string; kind: string; storageKey: string }[];
}

export async function getValidationReport(
  request: import("@playwright/test").APIRequestContext,
  jobId: string,
): Promise<{ outcome: string; summary?: string }> {
  const res = await request.get(`${API_BASE}/api/build-jobs/${jobId}/report`);
  if (res.status() !== 200) {
    throw new Error(`report fetch failed (${res.status()})`);
  }
  return (await res.json()) as { outcome: string; summary?: string };
}

/** 两段式下载：POST download-token → GET download/:token，返回原始字节。 */
export async function downloadArtifactBytes(
  request: import("@playwright/test").APIRequestContext,
  artifactId: string,
): Promise<Buffer> {
  const tokenRes = await request.post(`${API_BASE}/api/artifacts/${artifactId}/download-token`, {});
  if (tokenRes.status() !== 200) {
    throw new Error(`download-token failed (${tokenRes.status()}): ${await tokenRes.text()}`);
  }
  const { token } = (await tokenRes.json()) as { token: string };
  const res = await request.get(`${API_BASE}/api/artifacts/download/${token}`);
  if (res.status() !== 200) {
    throw new Error(`artifact download failed (${res.status()})`);
  }
  return Buffer.from(await res.body());
}
