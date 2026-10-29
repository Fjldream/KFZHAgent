// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api.js";
afterEach(() => vi.unstubAllGlobals());
describe("conversation v2 HTTP contracts", () => {
  it("uses v2 keyset query names and cookie authentication for list and history", async () => {
    const transport = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ items: [], nextCursor: null }))));
    vi.stubGlobal("fetch", transport);
    await api.conversationPage("workspace / 1", "next+cursor", true);
    await api.messagePage("conversation / 1", "before+cursor");
    expect(transport.mock.calls[0]![0]).toBe("/api/v2/conversations?workspaceId=workspace+%2F+1&archived=true&limit=50&cursor=next%2Bcursor");
    expect(transport.mock.calls[1]![0]).toBe("/api/v2/conversations/conversation%20%2F%201/messages?limit=50&before=before%2Bcursor");
    for (const call of transport.mock.calls) expect(call[1]).toMatchObject({ credentials: "include" });
  });
  it("creates only on explicit request, looks up route identity, and PATCHes exact title/archive fields", async () => {
    const transport = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ id: "c" }))));
    vi.stubGlobal("fetch", transport);
    await api.createConversationV2("workspace");
    await api.getConversationV2("c/1");
    await api.updateConversation("c/1", { title: "人工标题", archived: true });
    expect(transport.mock.calls[0]).toEqual(["/api/v2/conversations", expect.objectContaining({ method: "POST", body: JSON.stringify({ workspaceId: "workspace" }) })]);
    expect(transport.mock.calls[1]![0]).toBe("/api/v2/conversations/c%2F1");
    expect(transport.mock.calls[2]).toEqual(["/api/v2/conversations/c%2F1", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ title: "人工标题", archived: true }) })]);
  });
});
// end
