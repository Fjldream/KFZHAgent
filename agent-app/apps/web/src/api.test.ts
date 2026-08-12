import { afterEach, describe, expect, it, vi } from "vitest";
import { api } from "./api.js";

function emptyOk(): Response {
  return new Response(null, { status: 200 });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("API JSON response contracts", () => {
  it("treats an empty successful delivery response as no persisted delivery", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(emptyOk()));

    await expect(api.getConversationDelivery("conversation-1")).resolves.toBeNull();
  });

  it.each([
    ["login", () => api.login({ tenant: "tenant", username: "user", password: "password" })],
    ["workspace", () => api.getWorkspace("workspace-1")],
    ["build job", () => api.getBuildJob("job-1")],
  ] as const)("rejects an empty %s response instead of silently returning null", async (_name, invoke) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(emptyOk()));

    await expect(invoke()).rejects.toBeInstanceOf(SyntaxError);
  });
});
