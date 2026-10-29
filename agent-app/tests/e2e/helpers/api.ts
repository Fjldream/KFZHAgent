// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import type { RunAction, RunEvent, RunSnapshot } from "../../../packages/contracts/src/agent-run.js";
import { API_BASE, WEB_BASE, type E2eUser } from "./config.js";

export async function loginViaApi(request: APIRequestContext, user: E2eUser) {
  const response = await request.post(`${API_BASE}/api/auth/login`, { data: user, headers: { Origin: WEB_BASE } });
  expect(response.status(), await response.text()).toBe(200);
  return response.json() as Promise<{ user: { id: string } }>;
}
export async function login(page: Page, user: E2eUser) {
  await page.goto("/login");
  await page.getByTestId("login-tenant").fill(user.tenant);
  await page.getByTestId("login-username").fill(user.username);
  await page.getByTestId("login-password").fill(user.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/workspaces(\?.*)?$/);
}
export async function createWorkspace(request: APIRequestContext, name: string, mode: "new" | "upload" = "new") {
  const response = await request.post(`${API_BASE}/api/workspaces`, { data: { name, mode }, headers: { Origin: WEB_BASE } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json() as Promise<{ id: string; name: string; mode: string }>;
}
export async function createWorkspaceInBrowser(page: Page, name: string, mode: "new" | "upload" = "new") {
  await page.getByTestId("workspace-name").fill(name);
  await page.getByTestId(mode === "upload" ? "upload-workspace" : "create-workspace").click();
  await page.waitForURL(/\/workspaces\/[0-9a-f-]{36}\/workbench(?:\/[^?]+)?(?:\?.*)?$/);
  await expect(page.getByRole("textbox", { name: "描述你的需求" })).toBeVisible();
  return new URL(page.url()).pathname.split("/")[2]!;
}
export async function createConversation(request: APIRequestContext, workspaceId: string, title = "E2E 对话") {
  const response = await request.post(`${API_BASE}/api/conversations`, { data: { workspaceId, title }, headers: { Origin: WEB_BASE } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json() as Promise<{ id: string; title: string }>;
}
export function runBody(action: RunAction, mode: "discuss" | "plan" | "build" = "build") {
  return { action, mode, clientRequestId: randomUUID(), clientMessageId: randomUUID() };
}
export async function startRun(request: APIRequestContext, conversationId: string, action: RunAction, mode: "discuss" | "plan" | "build" = "build") {
  const response = await request.post(`${API_BASE}/api/conversations/${conversationId}/runs`, { data: runBody(action, mode), headers: { Origin: WEB_BASE } });
  expect(response.status(), await response.text()).toBe(202);
  return response.json() as Promise<RunSnapshot>;
}
export async function snapshot(request: APIRequestContext, runId: string): Promise<RunSnapshot> {
  const response = await request.get(`${API_BASE}/api/runs/${runId}`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json() as Promise<RunSnapshot>;
}
export async function waitForRun(request: APIRequestContext, runId: string, status: RunSnapshot["status"]) {
  let result: RunSnapshot;
  await expect.poll(async () => {
    result = await snapshot(request, runId);
    if (result.status === "FAILED" && status !== "FAILED") throw new Error(`Run ${runId} failed: ${result.failureCode}`);
    return result.status;
  }, { timeout: 120_000, intervals: [100, 250, 500, 1000] }).toBe(status);
  return result!;
}
/** A real UI action; capture only the accepted Run receipt, never fabricate a job/result. */
export async function submitInBrowser(page: Page, action: () => Promise<unknown>): Promise<RunSnapshot> {
  const response = page.waitForResponse(res => /\/api\/conversations\/[^/]+\/runs$/.test(res.url()) && res.request().method() === "POST");
  await action();
  const accepted = await response;
  expect(accepted.status(), await accepted.text()).toBe(202);
  return accepted.json() as Promise<RunSnapshot>;
}
export async function sendInBrowser(page: Page, text: string) {
  await page.getByRole("textbox", { name: "描述你的需求" }).fill(text);
  return submitInBrowser(page, () => page.getByRole("button", { name: "发送", exact: true }).click());
}
export async function events(request: APIRequestContext, runId: string, after = 0): Promise<RunEvent[]> {
  const response = await request.get(`${API_BASE}/api/runs/${runId}/events?after=${after}`, { timeout: 40_000 });
  expect(response.status(), await response.text()).toBe(200);
  return (await response.text()).split("\n\n").flatMap(block => {
    const data = block.split("\n").find(line => line.startsWith("data:"));
    return data ? [JSON.parse(data.slice(5)) as RunEvent] : [];
  });
}
export async function listBuildArtifacts(request: APIRequestContext, jobId: string) {
  const response = await request.get(`${API_BASE}/api/build-jobs/${jobId}/artifacts`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json() as Promise<Array<{ id: string; kind: string; storageKey: string }>>;
}
export async function getValidationReport(request: APIRequestContext, jobId: string) {
  const response = await request.get(`${API_BASE}/api/build-jobs/${jobId}/report`);
  expect(response.status(), await response.text()).toBe(200);
  return response.json() as Promise<{ outcome: string }>;
}
export async function downloadArtifactBytes(request: APIRequestContext, artifactId: string): Promise<Buffer> {
  const tokenResponse = await request.post(`${API_BASE}/api/artifacts/${artifactId}/download-token`, { headers: { Origin: WEB_BASE } });
  expect(tokenResponse.status(), await tokenResponse.text()).toBe(200);
  const { token } = await tokenResponse.json() as { token: string };
  const response = await request.get(`${API_BASE}/api/artifacts/download/${token}`);
  expect(response.status()).toBe(200);
  return Buffer.from(await response.body());
}
// end
