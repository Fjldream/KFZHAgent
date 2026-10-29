// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { expect, test } from "@playwright/test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { API_BASE, TENANT_A, TENANT_B } from "./helpers/config.js";
import { createWorkspaceInBrowser, downloadArtifactBytes, events, getValidationReport, listBuildArtifacts, login, sendInBrowser, submitInBrowser, waitForRun } from "./helpers/api.js";
import { readFileTree, unzipPackageToDir } from "./helpers/unzip.js";

test("creative-v2: browser requirement, durable blueprint, signed build and actual browser download", async ({ page }) => {
  const legacyWrites: string[] = [];
  page.on("request", request => { if (request.method() === "POST" && /\/conversations\/[^/]+\/(messages|resume)$/.test(request.url())) legacyWrites.push(request.url()); });
  await login(page, TENANT_A);
  const workspaceId = await createWorkspaceInBrowser(page, `E2E Creative ${Date.now()}`);
  await expect(page.getByRole("button", { name: "上传参考图或业务素材" })).toBeDisabled();
  await expect(page.getByRole("tab", { name: "用量", exact: true })).toHaveCount(0);
  const planned = await sendInBrowser(page, "创建一个中文工业生产监控大屏");
  await waitForRun(page.request, planned.id, "WAITING_INPUT");
  await expect(page.getByRole("region", { name: "等待确认" })).toBeVisible();
  await expect(page.getByRole("button", { name: /执行过程/ })).toBeVisible();
  const history = await events(page.request, planned.id);
  expect(history.map(event => event.seq)).toEqual(Array.from({ length: history.length }, (_, index) => index + 1));
  expect(history.some(event => event.type === "input.required")).toBe(true);
  await page.reload();
  await expect(page.getByRole("button", { name: "确认蓝图并生成工程" })).toBeEnabled();
  const confirmed = await submitInBrowser(page, () => page.getByRole("button", { name: "确认蓝图并生成工程" }).click());
  expect(confirmed.id).not.toBe(planned.id);
  const completed = await waitForRun(page.request, confirmed.id, "SUCCEEDED");
  expect(completed.buildJobId).toBeTruthy();
  expect(completed.resultRevisionId).toBeTruthy();
  await expect(page.getByRole("region", { name: "工程交付" })).toBeVisible({ timeout: 30_000 });
  expect((await getValidationReport(page.request, completed.buildJobId!)).outcome).toBe("pass");
  const artifact = (await listBuildArtifacts(page.request, completed.buildJobId!)).find(item => item.kind === "client-package");
  expect(artifact).toBeTruthy();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "下载工程包" }).click();
  const downloaded = await downloadEvent;
  expect(await downloaded.failure()).toBeNull();
  const bytes = await readFile(await downloaded.path());
  expect(bytes.equals(await downloadArtifactBytes(page.request, artifact!.id))).toBe(true);
  const tree = await readFileTree(await unzipPackageToDir(bytes, await mkdtemp(path.join(tmpdir(), "kf-browser-new-"))));
  expect([...tree.keys()].some(name => name.endsWith("project.json"))).toBe(true);
  expect([...tree.keys()].filter(name => /project\/page\/[^/]+\.json$/.test(name)).length).toBeGreaterThan(1);
  const delivery = await page.request.get(`${API_BASE}/api/conversations/${completed.conversationId}/delivery?buildJobId=${completed.buildJobId}`);
  expect(delivery.status()).toBe(200);
  expect(await delivery.json()).toMatchObject({ artifactId: artifact!.id, revisionId: completed.resultRevisionId, buildJobId: completed.buildJobId });
  const revisions = await page.request.get(`${API_BASE}/api/workspaces/${workspaceId}/revisions`);
  expect((await revisions.json() as unknown[]).length).toBe(2);
  expect(legacyWrites).toEqual([]);
});

test("browser SSE transport failure recovers history without duplicating the submitted message", async ({ page }) => {
  const cursors: number[] = [];
  await page.route("**/api/runs/*/events?*", async route => {
    cursors.push(Number(new URL(route.request().url()).searchParams.get("after")));
    if (cursors.length === 1) await route.abort("connectionreset");
    else await route.continue();
  });
  await login(page, TENANT_A);
  await createWorkspaceInBrowser(page, `E2E Reconnect ${Date.now()}`);
  await page.getByRole("tab", { name: /规划/ }).click();
  const planned = await sendInBrowser(page, "创建一个断线后仍可确认的示例页面");
  const waiting = await waitForRun(page.request, planned.id, "WAITING_INPUT");
  await expect(page.getByRole("button", { name: "确认蓝图并生成工程" })).toBeEnabled({ timeout: 30_000 });
  expect(cursors.length).toBeGreaterThanOrEqual(2);
  expect(cursors.slice(0, 2)).toEqual([0, 0]);
  await expect(page.locator("footer.statusbar")).toContainText(`事件 seq ${waiting.lastSeq}`);
  const suffix = await events(page.request, planned.id, 1);
  expect(suffix.map(event => event.seq)).toEqual(Array.from({ length: waiting.lastSeq - 1 }, (_, index) => index + 2));
  await page.reload();
  await expect(page.getByRole("button", { name: "确认蓝图并生成工程" })).toBeEnabled();
  const messages = await page.request.get(`${API_BASE}/api/conversations/${planned.conversationId}/messages`);
  const rows = await messages.json() as Array<{ role: string; content: string }>;
  expect(rows.filter(row => row.role === "user" && row.content === "创建一个断线后仍可确认的示例页面")).toHaveLength(1);
  const builds = await page.request.get(`${API_BASE}/api/workspaces/${planned.workspaceId}/revisions`);
  expect(await builds.json()).toHaveLength(1);
});

test("discussion mode and sidebar conversation switching preserve isolated message history", async ({ page }) => {
  await login(page, TENANT_B);
  await createWorkspaceInBrowser(page, `E2E Conversations ${Date.now()}`);
  await page.getByRole("tab", { name: /讨论/ }).click();
  const first = await sendInBrowser(page, "讨论甲：创建页面前先说明设计原则");
  await waitForRun(page.request, first.id, "SUCCEEDED");
  await page.getByRole("button", { name: /新会话/ }).click();
  await expect(page.getByRole("textbox", { name: "描述你的需求" })).toBeEnabled();
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  // Mode belongs to each conversation; a new conversation does not inherit the previous draft's mode.
  await page.getByRole("tab", { name: /讨论/ }).click();
  // end
  const second = await sendInBrowser(page, "讨论乙：只解释，不生成工程");
  await waitForRun(page.request, second.id, "SUCCEEDED");
  expect(first.conversationId).not.toBe(second.conversationId);
  await expect(page.getByLabel("对话消息")).toContainText("讨论乙");
  await expect(page.getByLabel("对话消息")).not.toContainText("讨论甲");
  await page.getByRole("complementary", { name: "会话", exact: true }).locator("button.conv").last().click();
  await expect(page.getByLabel("对话消息")).toContainText("讨论甲");
  await expect(page.getByLabel("对话消息")).not.toContainText("讨论乙");
  await expect(page.getByRole("region", { name: "工程交付" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "等待确认" })).toHaveCount(0);
});
// end
