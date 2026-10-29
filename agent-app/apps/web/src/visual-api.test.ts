// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchVisualEgressPolicy, updateVisualEgressPolicy, uploadReferenceImage, fetchVisualReview, referenceImageUrl, reviseVisualReview } from "./visual-api.js";

afterEach(() => vi.unstubAllGlobals());
describe("private visual UI transport", () => {
  it("submits a bounded Run-scoped correction with its receipt and request identity, never the old full-spec PATCH", async () => {
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ runId: "run-1" })));
    vi.stubGlobal("fetch", transport);
    const input = { clientRequestId: "00000000-0000-4000-8000-000000000001", receipt: `vref1:${"a".repeat(64)}:${"b".repeat(64)}`,
      analysisId: "analysis", analysisHash: "c".repeat(64), regions: [{ regionId: "heading", role: "text" as const,
        text: ["修正标题"], box: { x: 0, y: 0, width: 1, height: 1 } }] };
    const signal = new AbortController().signal;
    await reviseVisualReview("run 1", input, signal);
    expect(transport).toHaveBeenCalledWith("/api/runs/run%201/visual-review/revisions", expect.objectContaining({
      method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input), signal,
    }));
  });
  it("uploads the exact file with cookie authentication, not JSON or a model URL", async () => {
    const file = new File(["fixture"], "页面 #1.png", { type: "image/png" });
    const response = { id: "asset-1", name: file.name, purpose: "reference", mimeType: "image/webp", width: 400, height: 200 };
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify(response)));
    vi.stubGlobal("fetch", transport);
    const signal = new AbortController().signal;
    expect(await uploadReferenceImage("workspace 1", file, signal)).toEqual(response);
    expect(transport).toHaveBeenCalledWith("/api/v2/workspaces/workspace%201/reference-assets?name=%E9%A1%B5%E9%9D%A2%20%231.png",
      expect.objectContaining({ method: "POST", credentials: "include", headers: { "Content-Type": "image/png" }, body: file, signal }));
    expect(referenceImageUrl("workspace 1", "asset 1")).toBe("/api/v2/workspaces/workspace%201/reference-assets/asset%201/image");
  });
  it("reads the current review without caching and surfaces a refused review", async () => {
    const transport = vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "VISUAL_REVIEW_UNAVAILABLE" }), { status: 409 }));
    vi.stubGlobal("fetch", transport);
    const signal = new AbortController().signal;
    await expect(fetchVisualReview("run 1", signal)).rejects.toThrow("VISUAL_REVIEW_UNAVAILABLE");
    expect(transport).toHaveBeenCalledWith("/api/runs/run%201/visual-review", expect.objectContaining({ credentials: "include", cache: "no-store", signal }));
  });
});
// end

// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
it("reads tenant egress without caching and mutates only the explicitly selected boolean", async () => {
  const transport = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ schemaVersion: 1, imageEgressAllowed: false }))));
  vi.stubGlobal("fetch", transport);
  await fetchVisualEgressPolicy();
  expect(transport).toHaveBeenCalledTimes(1);
  expect(transport.mock.calls[0]).toEqual(["/api/v2/tenant/visual-egress-policy", expect.objectContaining({ cache: "no-store", credentials: "include" })]);
  await updateVisualEgressPolicy(true);
  expect(transport.mock.calls[1]).toEqual(["/api/v2/tenant/visual-egress-policy", expect.objectContaining({ method: "PATCH", credentials: "include", body: JSON.stringify({ imageEgressAllowed: true }) })]);
});
// end

// end
