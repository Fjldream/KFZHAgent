// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { API_BASE, ApiError } from "./api.js";
import { parseSseBlocks } from "./sse.js";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import type { VisualReviewAcceptance } from "@kf/contracts";
// end

export type RunStatusLike =
  | "QUEUED" | "RUNNING" | "WAITING_INPUT" | "WAITING_APPROVAL" | "BUILDING"
  | "SUCCEEDED" | "FAILED" | "CANCEL_REQUESTED" | "CANCELLED";

export type RunSnapshotLike = {
  id: string;
  status: RunStatusLike;
  lastSeq: number;
  failureCode: string | null;
  resultRevisionId: string | null;
  buildJobId?: string | null;
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  retryPolicy?: "new-run" | "new-visual-review";
  // end
};

export type RunEventLike = {
  schemaVersion: 1;
  runId: string;
  seq: number;
  type: string;
  createdAt: string;
  payload: Record<string, unknown>;
};

export const TERMINAL_RUN_STATUS: ReadonlyArray<RunStatusLike> = ["SUCCEEDED", "FAILED", "CANCELLED"];
export const isTerminalRun = (status: RunStatusLike): boolean => TERMINAL_RUN_STATUS.includes(status);

const asApiError = async (response: Response, fallback: string): Promise<ApiError> => {
  const body = await response.text().catch(() => "");
  return new ApiError(response.status, fallback, body.trim().slice(0, 200));
};

export async function fetchRunSnapshot(runId: string, init?: { signal?: AbortSignal }): Promise<RunSnapshotLike> {
  const response = await fetch(`${API_BASE}/api/runs/${encodeURIComponent(runId)}`, {
    credentials: "include",
    ...(init?.signal === undefined ? {} : { signal: init.signal }),
  });
  if (!response.ok) throw await asApiError(response, "RUN_SNAPSHOT_FAILED");
  return (await response.json()) as RunSnapshotLike;
}

export type StartRunInput = {
  clientRequestId: string;
  clientMessageId: string;
  mode: "discuss" | "plan" | "build";
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  attachmentIds?: string[];
  visualReference?: { primaryAssetId: string; sendingConsent: { noticeVersion: "visual-egress@1"; accepted: true } };
  // end
  action: { type: "message"; text: string }
    | { type: "confirm_blueprint"; expectedRunId: string; receipt: string }
    | { type: "resume_approval"; expectedRunId: string; action: "approve" | "revise" | "cancel"; planHash: string }
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    | (VisualReviewAcceptance & { type: "accept_visual_reference" });
    // end
};

export async function fetchLatestRun(conversationId: string): Promise<RunSnapshotLike | null> {
  const response = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(conversationId)}/runs/latest`, { credentials: "include" });
  if (!response.ok) throw await asApiError(response, "RUN_SNAPSHOT_FAILED");
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  const body = await response.text();
  return body.trim().length === 0 ? null : JSON.parse(body) as RunSnapshotLike | null;
  // end
}

/** 创建 run；同一 clientRequestId 重复提交会拿回同一个 run（服务端幂等）。 */
export async function startRun(conversationId: string, input: StartRunInput): Promise<RunSnapshotLike> {
  const response = await fetch(`${API_BASE}/api/conversations/${encodeURIComponent(conversationId)}/runs`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!response.ok) throw await asApiError(response, "RUN_START_FAILED");
  return (await response.json()) as RunSnapshotLike;
}

export async function cancelRun(runId: string): Promise<RunSnapshotLike> {
  const response = await fetch(`${API_BASE}/api/runs/${encodeURIComponent(runId)}/cancel`, { method: "POST", credentials: "include" });
  if (!response.ok) throw await asApiError(response, "RUN_CANCEL_FAILED");
  return await response.json() as RunSnapshotLike;
}

export async function retryRun(runId: string, clientRequestId: string): Promise<RunSnapshotLike> {
  const response = await fetch(`${API_BASE}/api/runs/${encodeURIComponent(runId)}/retry`, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientRequestId }),
  });
  if (!response.ok) throw await asApiError(response, "RUN_RETRY_FAILED");
  return await response.json() as RunSnapshotLike;
}

/**
 * 读取 run 事件流。服务端每 30 秒主动结束一次连接，因此本函数正常返回（而不是抛错）
 * 也意味着「该重连了」——调用方用最后一条 seq 作为 after 续传即可。
 */
export async function* streamRunEvents(options: {
  runId: string;
  after: number;
  signal?: AbortSignal;
}): AsyncGenerator<RunEventLike> {
  const response = await fetch(
    `${API_BASE}/api/runs/${encodeURIComponent(options.runId)}/events?after=${options.after}`,
    {
      credentials: "include",
      headers: { Accept: "text/event-stream" },
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
  );
  if (!response.ok) throw await asApiError(response, "RUN_EVENTS_FAILED");

  const reader = response.body?.getReader();
  if (reader === undefined) return;

  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  const maxFrameBytes = 65_536;
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        const block = buffer.slice(0, boundary + 2);
        if (encoder.encode(block).byteLength > maxFrameBytes) throw new Error("RUN_EVENT_FRAME_TOO_LARGE");
        buffer = buffer.slice(boundary + 2);
        // 心跳不含 data，通用解析器会跳过；网络 chunk 大小不等于单帧大小。
        for (const frame of parseSseBlocks(block)) {
          yield frame.data as RunEventLike;
        }
        boundary = buffer.indexOf("\n\n");
      }
      if (encoder.encode(buffer).byteLength > maxFrameBytes) throw new Error("RUN_EVENT_FRAME_TOO_LARGE");
    }
  } finally {
    // 正常 EOF、抛错、AbortSignal 和消费者提前 break 都释放 fetch reader。
    try { await reader.cancel(); } catch { /* 已断开的 reader 不影响清理。 */ }
    reader.releaseLock();
  }
}
// end
