import { ApiError, API_BASE } from "./api";
import type { SseDonePayload } from "./types";

/**
 * SSE 消息回合（Task 11 契约）：POST messages 返回 text/event-stream，
 * 每帧为 `event: <name>\ndata: <json>`。state 帧逐节点推送，done 帧携带
 * 最终状态快照（含 approval interrupt 载荷）。
 */

export interface SseFrame {
  event: string;
  data: unknown;
}

/** 解析单个 SSE 数据块（可包含多帧）。 */
export function parseSseBlocks(text: string): SseFrame[] {
  const frames: SseFrame[] = [];
  for (const block of text.split("\n\n")) {
    if (block.trim().length === 0) continue;
    let event = "message";
    const dataLines: string[] = [];
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice("event:".length).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trim());
    }
    if (dataLines.length === 0) continue;
    frames.push({ event, data: JSON.parse(dataLines.join("\n")) as unknown });
  }
  return frames;
}

/**
 * 发送一条用户消息并流式消费 SSE。返回 done 帧载荷。
 * onState 在每个 state 帧上回调（用于逐节点更新 UI）。
 */
export async function streamMessageTurn(
  conversationId: string,
  content: string,
  onState: (data: unknown) => void,
): Promise<SseDonePayload> {
  const res = await fetch(`${API_BASE}/api/conversations/${conversationId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ content }),
  });
  if (!res.ok) {
    throw await parseSseError(res);
  }
  if (res.body === null) {
    throw new ApiError(0, "SSE 响应没有响应体");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let donePayload: SseDonePayload | null = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      const frames = parseSseBlocks(block);
      for (const frame of frames) {
        if (frame.event === "state") {
          onState(frame.data);
        } else if (frame.event === "done") {
          donePayload = frame.data as SseDonePayload;
        } else if (frame.event === "error") {
          const err = frame.data as { code?: unknown; message?: unknown };
          throw new ApiError(
            0,
            typeof err.message === "string" ? err.message : "图执行错误",
            typeof err.code === "string" ? err.code : "GRAPH_ERROR",
          );
        }
      }
    }
  }
  if (donePayload === null) {
    throw new ApiError(0, "SSE 流结束但没有收到 done 事件");
  }
  return donePayload;
}

async function parseSseError(res: Response): Promise<ApiError> {
  let message = `请求失败（HTTP ${res.status}）`;
  let code: string | undefined;
  try {
    const body = (await res.json()) as {
      message?: unknown;
      error?: { code?: unknown; message?: unknown };
    };
    const nested = body.error;
    if (nested !== null && typeof nested === "object") {
      if (typeof nested.message === "string") message = nested.message;
      if (typeof nested.code === "string") code = nested.code;
    } else if (typeof body.message === "string") {
      message = body.message;
    }
  } catch {
    // 非 JSON 错误体。
  }
  return new ApiError(res.status, message, code);
}
