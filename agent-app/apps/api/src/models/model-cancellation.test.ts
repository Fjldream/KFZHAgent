// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { expect, it } from "vitest";
import { withAgentRunExecution } from "@kf/build-jobs";
import { DeepSeekModelPort } from "../conversations/deepseek-model.js";

it("passes the current run cancellation through the actual DeepSeek adapter to fetch", async () => {
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  let transportAborted = false;
  const fetchImpl: typeof fetch = async (_url, init) => {
    entered();
    return new Promise<Response>((resolve, reject) => {
      const timer = setTimeout(() => resolve(new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ intent: "QUESTION", requestedDomains: [], reply: "答复" }) } }] }))), 100);
      init?.signal?.addEventListener("abort", () => {
        transportAborted = true;
        clearTimeout(timer);
        reject(new DOMException("cancelled", "AbortError"));
      }, { once: true });
    });
  };
  const model = new DeepSeekModelPort({ apiKey: "test-only", fetch: fetchImpl });
  const controller = new AbortController();
  const pending = withAgentRunExecution({ runId: "run", tenantId: "tenant", ownerId: "worker", fence: 1, signal: controller.signal }, () => model.classifyIntent({ tenantId: "tenant", workspaceId: "workspace", userId: "user", conversationId: "conversation", recentMessages: [], requirementText: "解释页面" }));
  await started;
  controller.abort();
  await expect(pending).rejects.toThrow();
  expect(transportAborted).toBe(true);
});
// end
