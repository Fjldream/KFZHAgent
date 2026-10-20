// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// 输入区纯逻辑：可单测，不依赖 DOM 与接口。
// 附件上限/格式校验在前端先挡一层，真正的安全限制仍在服务端（T18）。
// end
import type { ComposerAttachment, ComposerDraft, WorkbenchMode } from "./workbench-types";

export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** 发送门槛：所有附件必须就绪且有 assetId；文本或附件至少有一项。 */
export function canSubmitDraft(draft: ComposerDraft): boolean {
  return draft.attachments.every((item) => item.status === "ready" && item.assetId !== null)
    && (draft.text.trim().length > 0 || draft.attachments.length > 0);
}

/** Enter 发送、Shift+Enter 换行；输入法组字期间一律不发送。 */
export function shouldSubmitOnEnter(
  event: { key: string; shiftKey: boolean; isComposing?: boolean },
  composing: boolean,
): boolean {
  if (event.key !== "Enter" || event.shiftKey) return false;
  if (composing || event.isComposing === true) return false;
  return true;
}

/** 附件预检：返回错误文案，null 表示通过。 */
export function validateAttachment(
  file: { name: string; size: number; type: string },
  existing: ComposerAttachment[],
): string | null {
  if (existing.length >= MAX_ATTACHMENTS) return `最多 ${MAX_ATTACHMENTS} 张参考图`;
  if (!ACCEPTED_IMAGE_TYPES.includes(file.type as (typeof ACCEPTED_IMAGE_TYPES)[number])) {
    return `仅支持 PNG / JPEG / WebP：${file.name}`;
  }
  if (file.size > MAX_ATTACHMENT_BYTES) return `单张不超过 10 MiB：${file.name}`;
  return null;
}

export function modeMeta(mode: WorkbenchMode): { label: string; hint: string; icon: string } {
  if (mode === "discuss") return { label: "讨论", hint: "不构建", icon: "💬" };
  if (mode === "plan") return { label: "规划", hint: "停在方案确认", icon: "🧭" };
  return { label: "生成修改", hint: "确认后构建", icon: "🛠" };
}

/** 附件用途标签：参考图不打包进工程，业务素材才进资源目录。 */
export function purposeLabel(purpose: ComposerAttachment["purpose"]): string {
  return purpose === "material" ? "业务素材" : "参考图";
}
