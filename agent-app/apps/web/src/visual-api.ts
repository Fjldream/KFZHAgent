// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import type { VisualReviewDisplay, VisualReviewRevision } from "@kf/contracts";
import { API_BASE, ApiError } from "./api.js";

export type ReferenceImage = {
  id: string; purpose: "reference"; name: string; mimeType: "image/webp"; width: number; height: number;
};
// modified by jinlong.feng at 2026-10-28 Agent工作台迭代
// Keep the frozen notice/version. Upload stores privately; model egress begins only after the user submits with consent enabled.
// end
export const VISUAL_CONSENT_NOTICE = "将所选参考图的安全派生图片发送给服务器配置的视觉模型，并将识别出的文字和结构用于后续工程规划；原参考图默认不打包进工程。";

async function readResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `请求失败（HTTP ${response.status}）`;
    try {
      const body = await response.json() as { message?: unknown };
      if (typeof body.message === "string") message = body.message;
    } catch { /* Do not display an untrusted HTML response. */ }
    throw new ApiError(response.status, message);
  }
  return await response.json() as T;
}
export async function uploadReferenceImage(workspaceId: string, file: File, signal: AbortSignal): Promise<ReferenceImage> {
  return readResponse<ReferenceImage>(await fetch(`${API_BASE}/api/v2/workspaces/${encodeURIComponent(workspaceId)}/reference-assets?name=${encodeURIComponent(file.name)}`, {
    method: "POST", credentials: "include", headers: { "Content-Type": file.type }, body: file, signal,
  }));
}
export async function fetchVisualReview(runId: string, signal: AbortSignal): Promise<VisualReviewDisplay> {
  return readResponse<VisualReviewDisplay>(await fetch(`${API_BASE}/api/runs/${encodeURIComponent(runId)}/visual-review`, {
    credentials: "include", cache: "no-store", signal,
  }));
}
export async function reviseVisualReview(runId: string, input: VisualReviewRevision, signal: AbortSignal): Promise<VisualReviewDisplay> {
  return readResponse<VisualReviewDisplay>(await fetch(`${API_BASE}/api/runs/${encodeURIComponent(runId)}/visual-review/revisions`, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal,
  }));
}
export function referenceImageUrl(workspaceId: string, assetId: string): string {
  return `${API_BASE}/api/v2/workspaces/${encodeURIComponent(workspaceId)}/reference-assets/${encodeURIComponent(assetId)}/image`;
}
// end

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
export async function fetchVisualEgressPolicy(signal?: AbortSignal): Promise<import("@kf/contracts").VisualEgressPolicy> {
  return readResponse(await fetch(`${API_BASE}/api/v2/tenant/visual-egress-policy`, { credentials: "include", cache: "no-store", ...(signal ? { signal } : {}) }));
}
export async function updateVisualEgressPolicy(imageEgressAllowed: boolean): Promise<import("@kf/contracts").VisualEgressPolicy> {
  return readResponse(await fetch(`${API_BASE}/api/v2/tenant/visual-egress-policy`, {
    method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageEgressAllowed }),
  }));
}
// end
