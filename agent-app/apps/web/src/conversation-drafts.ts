// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
const DRAFT_PREFIX = "kf-agent:draft:";
const OWNER_KEY = "kf-agent:draft-owner";
export function clearConversationDrafts(): void {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (key?.startsWith(DRAFT_PREFIX)) sessionStorage.removeItem(key);
    }
    sessionStorage.removeItem(OWNER_KEY);
  } catch { /* Storage may be unavailable; in-memory ownership still isolates the view. */ }
}
export function ensureConversationDraftOwner(tenantId?: string, userId?: string): void {
  if (!tenantId || !userId) { clearConversationDrafts(); return; }
  try {
    const owner = JSON.stringify([tenantId, userId]);
    if (sessionStorage.getItem(OWNER_KEY) !== owner) clearConversationDrafts();
    sessionStorage.setItem(OWNER_KEY, owner);
  } catch { /* Restricted storage does not prevent signed-in use. */ }
}
// end
