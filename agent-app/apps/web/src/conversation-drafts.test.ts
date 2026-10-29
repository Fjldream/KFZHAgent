// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { beforeEach, describe, expect, it } from "vitest";
import { clearConversationDrafts, ensureConversationDraftOwner } from "./conversation-drafts.js";
beforeEach(() => sessionStorage.clear());
describe("conversation draft ownership", () => {
  it("retains refresh drafts for the same identity and removes them on same-tenant user change", () => {
    ensureConversationDraftOwner("tenant", "alice");
    sessionStorage.setItem("kf-agent:draft:tenant:alice:w:c", JSON.stringify({ text: "private", mode: "plan" }));
    sessionStorage.setItem("unrelated", "keep");
    ensureConversationDraftOwner("tenant", "alice");
    expect(sessionStorage.getItem("kf-agent:draft:tenant:alice:w:c")).toContain("private");
    ensureConversationDraftOwner("tenant", "bob");
    expect(sessionStorage.getItem("kf-agent:draft:tenant:alice:w:c")).toBeNull();
    expect(sessionStorage.getItem("unrelated")).toBe("keep");
  });
  it("clears every conversation draft and ownership on logout and missing identity", () => {
    ensureConversationDraftOwner("tenant", "alice");
    sessionStorage.setItem("kf-agent:draft:a", "private a");
    sessionStorage.setItem("kf-agent:draft:b", "private b");
    clearConversationDrafts();
    expect(sessionStorage.length).toBe(0);
    sessionStorage.setItem("kf-agent:draft:a", "private a");
    ensureConversationDraftOwner();
    expect(sessionStorage.length).toBe(0);
  });
});
// end
