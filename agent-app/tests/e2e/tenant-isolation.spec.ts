// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { API_BASE, WEB_BASE, TENANT_A, TENANT_B, TENANT_C } from "./helpers/config.js";
import { createConversation, createWorkspace, events, login, loginViaApi, runBody, startRun, waitForRun } from "./helpers/api.js";
import { fixturePath } from "./helpers/unzip.js";

test("Run isolation, CSRF, idempotency, retired endpoints and hostile source uploads", async ({ browser }) => {
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  try {
    const reqA = contextA.request;
    const reqB = contextB.request;
    await loginViaApi(reqA, TENANT_A);
    await loginViaApi(reqB, TENANT_B);
    const workspace = await createWorkspace(reqA, `E2E Isolation ${Date.now()}`);
    const conversation = await createConversation(reqA, workspace.id);
    const body = runBody({ type: "message", text: "创建隔离检查页面" }, "plan");
    expect((await reqA.post(`${API_BASE}/api/conversations/${conversation.id}/runs`, { data: body })).status()).toBe(403);
    const accepted = await reqA.post(`${API_BASE}/api/conversations/${conversation.id}/runs`, { data: body, headers: { Origin: WEB_BASE } });
    expect(accepted.status()).toBe(202);
    const { id } = await accepted.json() as { id: string };
    const replay = await reqA.post(`${API_BASE}/api/conversations/${conversation.id}/runs`, { data: body, headers: { Origin: WEB_BASE } });
    expect(replay.status()).toBe(202);
    expect((await replay.json() as { id: string }).id).toBe(id);
    await waitForRun(reqA, id, "WAITING_INPUT");
    for (const url of [`workspaces/${workspace.id}`, `conversations/${conversation.id}`, `conversations/${conversation.id}/messages`, `conversations/${conversation.id}/runs/latest`, `runs/${id}`, `runs/${id}/events`, `runs/${id}/usage`]) {
      expect((await reqB.get(`${API_BASE}/api/${url}`)).status(), url).toBe(404);
    }
    for (const [url, data] of [[`runs/${id}/cancel`, {}], [`runs/${id}/retry`, { clientRequestId: "foreign-retry" }], [`conversations/${conversation.id}/runs`, runBody({ type: "message", text: "foreign" })]] as const) {
      expect((await reqB.post(`${API_BASE}/api/${url}`, { data, headers: { Origin: WEB_BASE } })).status(), url).toBe(404);
    }
    for (const req of [reqA, reqB]) {
      for (const suffix of ["messages", "resume"]) expect((await req.post(`${API_BASE}/api/conversations/${conversation.id}/${suffix}`, { data: { content: "retired" }, headers: { Origin: WEB_BASE } })).status()).toBe(404);
    }
    expect((await reqB.delete(`${API_BASE}/api/workspaces/${workspace.id}`, { data: { confirm: true } })).status()).toBe(404);
    const receipt = (await events(reqA, id)).find(event => event.type === "input.required")?.payload.receipt;
    expect(typeof receipt).toBe("string");
    const completed = await startRun(reqA, conversation.id, { type: "confirm_blueprint", expectedRunId: id, receipt: receipt as string });
    const delivered = await waitForRun(reqA, completed.id, "SUCCEEDED");
    expect(delivered.buildJobId).toBeTruthy();
    const artifacts = await reqA.get(`${API_BASE}/api/build-jobs/${delivered.buildJobId}/artifacts`);
    const artifact = (await artifacts.json() as Array<{ id: string; kind: string }>).find(item => item.kind === "client-package")!;
    for (const suffix of ["", "/artifacts", "/report"]) expect((await reqB.get(`${API_BASE}/api/build-jobs/${delivered.buildJobId}${suffix}`)).status()).toBe(404);
    expect((await reqB.post(`${API_BASE}/api/artifacts/${artifact.id}/download-token`, { headers: { Origin: WEB_BASE } })).status()).toBe(404);
    expect((await reqA.get(`${API_BASE}/api/workspaces/${workspace.id}`)).status()).toBe(200);
    const evilWorkspace = await createWorkspace(reqB, `E2E Hostile ${Date.now()}`, "upload");
    await rejectHostileUploads(reqB, evilWorkspace.id);
  } finally { await contextA.close(); await contextB.close(); }
});

test("tenant outside rollout sees a readonly workbench and cannot bypass it via Run HTTP", async ({ page }) => {
  await login(page, TENANT_C);
  const workspace = await createWorkspace(page.request, `E2E Readonly ${Date.now()}`);
  const conversation = await createConversation(page.request, workspace.id);
  await page.goto(`/workspaces/${workspace.id}/workbench/${conversation.id}`);
  await expect(page.getByRole("textbox", { name: "描述你的需求" })).toBeDisabled();
  await expect(page.getByRole("status")).toContainText("暂未开放");
  const denied = await page.request.post(`${API_BASE}/api/conversations/${conversation.id}/runs`, { data: runBody({ type: "message", text: "bypass" }), headers: { Origin: WEB_BASE } });
  expect(denied.status()).toBe(403);
  expect(await denied.json()).toMatchObject({ error: { code: "FEATURE_NOT_ENABLED" } });
  const history = await page.request.get(`${API_BASE}/api/conversations/${conversation.id}/messages`);
  expect(await history.json()).toEqual([]);
});

async function rejectHostileUploads(request: APIRequestContext, workspaceId: string) {
  for (const fixture of ["evil-path-traversal.gz", "evil-zip-bomb.gz"]) {
    const response = await request.post(`${API_BASE}/api/workspaces/${workspaceId}/uploads`, { data: await readFile(fixturePath(fixture)), headers: { "Content-Type": "application/octet-stream", Origin: WEB_BASE } });
    expect(response.status(), fixture).toBe(422);
    expect(await response.json()).toMatchObject({ error: { code: "PACKAGE_UNPACK_FAILED" } });
  }
  const revisions = await request.get(`${API_BASE}/api/workspaces/${workspaceId}/revisions`);
  expect(await revisions.json()).toEqual([]);
}
// end
