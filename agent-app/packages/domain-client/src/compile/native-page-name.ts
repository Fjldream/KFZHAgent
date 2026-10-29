// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { createHash } from "node:crypto";
export const MAX_NATIVE_DEVELOPMENT_NAME_LENGTH = 32;
const safeNativePageName = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
/** Native page names are separate from stable semantic identities. Existing safe names retain compatibility. */
export function nativePageNameForSemanticId(semanticPageId: string): string {
  return safeNativePageName.test(semanticPageId)
    ? semanticPageId : `Page${createHash("sha256").update(semanticPageId, "utf8").digest("hex").slice(0, 28)}`;
}

// end
