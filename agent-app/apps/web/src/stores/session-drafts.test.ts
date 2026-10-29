// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api.js";
import { useSession } from "./session.js";
import { ensureConversationDraftOwner } from "../conversation-drafts.js";
afterEach(() => { vi.restoreAllMocks(); sessionStorage.clear(); });
describe("session draft cleanup", () => {
  it("clears saved private drafts even when logout transport fails", async () => {
    ensureConversationDraftOwner("tenant", "user");
    sessionStorage.setItem("kf-agent:draft:tenant:user:w:c", "private content");
    vi.spyOn(api, "logout").mockRejectedValue(new Error("offline"));
    await expect(useSession().logout()).rejects.toThrow("offline");
    expect(sessionStorage.getItem("kf-agent:draft:tenant:user:w:c")).toBeNull();
    expect(useSession().state.user).toBeNull();
  });
  it("clears the previous identity's drafts before accepting a new login", async () => {
    ensureConversationDraftOwner("tenant", "alice");
    sessionStorage.setItem("kf-agent:draft:tenant:alice:w:c", "alice content");
    vi.spyOn(api, "login").mockResolvedValue({ user: { id: "bob", username: "bob", tenantId: "tenant", role: "tenant_admin" }, mustChangePassword: false });
    await useSession().login({ tenant: "tenant", username: "bob", password: "fixture-only" });
    expect(sessionStorage.getItem("kf-agent:draft:tenant:alice:w:c")).toBeNull();
    useSession().state.user = null;
  });
});
// end
