// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { expect, test } from "@playwright/test";
import { API_BASE, TENANT_A } from "./helpers/config.js";
import { createWorkspaceInBrowser, getValidationReport, login, sendInBrowser, submitInBrowser, waitForRun } from "./helpers/api.js";

test("module-v1: confirmed mapped blueprint builds through the reviewed catalog without legacy approval", async ({ page }) => {
  await login(page, TENANT_A);
  const response = await page.request.get(`${API_BASE}/api/workspaces`);
  const workspaces = await response.json() as Array<{ id: string; name: string }>;
  const workspace = workspaces.find(item => item.name === "E2E module-v1 fixture");
  expect(workspace).toBeTruthy();
  await page.goto(`/workspaces/${workspace!.id}/workbench`);
  const planned = await sendInBrowser(page, "请生成一个模块化个人门户，包含清晰的核心介绍");
  await waitForRun(page.request, planned.id, "WAITING_INPUT");
  const confirmed = await submitInBrowser(page, () => page.getByRole("button", { name: "确认蓝图并生成工程" }).click());
  const completed = await waitForRun(page.request, confirmed.id, "SUCCEEDED");
  expect(completed.buildJobId).toBeTruthy();
  expect(completed.resultRevisionId).toBeTruthy();
  expect((await getValidationReport(page.request, completed.buildJobId!)).outcome).toBe("pass");
  await expect(page.getByRole("button", { name: "下载工程包" })).toBeVisible();
  await expect(page.getByRole("region", { name: "方案审批" })).toHaveCount(0);
});

test("explicit model failure never builds; browser retry creates a new durable Run", async ({ page }) => {
  await login(page, TENANT_A);
  await createWorkspaceInBrowser(page, `E2E Failure ${Date.now()}`);
  const planned = await sendInBrowser(page, "创建 E2E_SCHEMA_FAILURE 故障验收页面");
  const failed = await waitForRun(page.request, planned.id, "FAILED");
  expect(failed.buildJobId).toBeNull();
  expect(failed.failureCode).toBe("INVALID_MODEL_OUTPUT");
  await expect(page.getByRole("alert")).toContainText("INVALID_MODEL_OUTPUT");
  await expect(page.getByRole("button", { name: "下载工程包" })).toHaveCount(0);
  const retryResponse = page.waitForResponse(res => res.url().endsWith(`/api/runs/${failed.id}/retry`) && res.request().method() === "POST");
  await page.getByTestId("run-retry").click();
  const retried = await retryResponse;
  expect(retried.status()).toBe(202);
  const retry = await retried.json() as { id: string };
  expect(retry.id).not.toBe(failed.id);
  const retryFailed = await waitForRun(page.request, retry.id, "FAILED");
  expect(retryFailed.buildJobId).toBeNull();
});
// end
