// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api.js";
afterEach(() => vi.unstubAllGlobals());
describe("revision history HTTP contract", () => {
  it("encodes exact revision/anchor identities and preserves the caller's retry UUID", async () => {
    const transport = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ id: "result" }))));
    vi.stubGlobal("fetch", transport);
    const input = { clientRequestId: "8bb8a3e2-45df-4b8e-b6f9-75d401708829", messageId: "message", revisionId: "r/2" };
    await api.revisionDetail("w/1", "r/2");
    await api.forkConversation("anchor/3", input);
    await api.forkConversation("anchor/3", input);
    expect(transport.mock.calls[0]![0]).toBe("/api/v2/workspaces/w%2F1/revisions/r%2F2");
    expect(transport.mock.calls[1]).toEqual(["/api/v2/conversations/anchor%2F3/forks", expect.objectContaining({ method: "POST", body: JSON.stringify(input), credentials: "include" })]);
    expect(transport.mock.calls[1]).toEqual(transport.mock.calls[2]);
  });
});
// end
