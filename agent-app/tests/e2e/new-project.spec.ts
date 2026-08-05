import { expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TENANT_A } from "./helpers/config";
import {
  getValidationReport,
  listBuildArtifacts,
  downloadArtifactBytes,
  loginViaApi,
} from "./helpers/api";
import { fixturePath, readFileTree, unzipPackageToDir } from "./helpers/unzip";

/**
 * Brief Step 6：确定性 fake-model 新建工程流程。
 * 通过浏览器 UI 完成登录 → 新建工程 → 需求 → 计划 → 批准 → 等待 worker，
 * 再用 API 下载 .gz、解包并验证客户端工程必需文件。
 */
test("new project: plan, approve, build, download, and verify client files", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);

  // 0) API 上下文显式登录（页面 Cookie 与 Node request 不共享 Secure 会话）。
  await loginViaApi(request, TENANT_A);

  // 1) UI 登录
  await page.goto("/login");
  await page.getByTestId("login-tenant").fill(TENANT_A.tenant);
  await page.getByTestId("login-username").fill(TENANT_A.username);
  await page.getByTestId("login-password").fill(TENANT_A.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/workspaces(\?.*)?$/);

  // 2) 新建工程（确定性初始设计）
  const wsName = `E2E New ${Date.now()}`;
  await page.getByTestId("workspace-name").fill(wsName);
  await page.getByTestId("create-workspace").click();
  await page.waitForURL(/\/workspaces\/[0-9a-f-]{36}$/);

  // 3) 工作区 shell：solution tree / conversation / plan / preview / revisions /
  //    report 同屏可见，不跳转（brief Step 3）。
  await expect(page.getByTestId("project-tree")).toContainText("客户端工程");
  await expect(page.getByTestId("project-tree")).toContainText("计算域（未支持）");
  await expect(page.getByTestId("conversation-panel")).toBeVisible();
  await expect(page.getByTestId("change-plan-panel")).toBeVisible();
  await expect(page.getByTestId("preview-panel")).toBeVisible();
  await expect(page.getByTestId("revision-list")).toBeVisible();
  await expect(page.getByTestId("artifact-download")).toBeVisible();

  // 4) 通过 UI 提交确定性 fake-model 需求 → SSE 流在浏览器内完成 → 审批中断
  await page.getByTestId("message-input").fill("请新建一个示例页面");
  await page.getByTestId("send-message").click();
  await expect(page.getByTestId("plan-hash")).toContainText(/[0-9a-f]{64}/, {
    timeout: 60_000,
  });
  const planHash = (await page.getByTestId("plan-hash").innerText()).replace("planHash：", "").trim();
  expect(planHash).toMatch(/^[0-9a-f]{64}$/);
  await expect(page.getByTestId("change-plan-panel")).toContainText("计划摘要");
  await expect(page.getByTestId("approve-plan")).toBeEnabled();

  // 5) UI 批准：拦截 resume 响应拿 buildJobId
  const resumeResponse = page.waitForResponse(
    (res) => res.url().includes("/resume") && res.request().method() === "POST",
  );
  await page.getByTestId("approve-plan").click();
  const resumeBody = (await (await resumeResponse).json()) as { buildJobId?: string };
  const jobId = resumeBody.buildJobId;
  expect(jobId).toBeTruthy();

  // 6) worker 完成：UI 自动轮询构建任务，显示校验通过与下载按钮
  await expect(page.getByTestId("report-outcome")).toContainText("校验通过", {
    timeout: 120_000,
  });
  await expect(page.getByTestId("download-artifact")).toBeVisible();

  // 7) API 侧复核：校验报告 pass + 构建制品
  const report = await getValidationReport(request, jobId);
  expect(report.outcome).toBe("pass");
  const artifacts = await listBuildArtifacts(request, jobId);
  const clientPackage = artifacts.find((artifact) => artifact.kind === "client-package");
  expect(clientPackage).toBeTruthy();

  // 8) 两段式下载 .gz，解包并验证客户端工程必需文件
  const bytes = await downloadArtifactBytes(request, clientPackage!.storageKey);
  expect(bytes.length).toBeGreaterThan(0);
  const destRoot = await mkdtemp(path.join(tmpdir(), "kf-e2e-new-"));
  const unpacked = await unzipPackageToDir(bytes, destRoot);
  const tree = await readFileTree(unpacked);
  const names = [...tree.keys()];
  expect(names.some((name) => name.endsWith("project.json"))).toBe(true);
  expect(names.some((name) => name.includes("project/page/") && name.endsWith(".json"))).toBe(
    true,
  );
  const pageFile = names.find((name) => name.endsWith("project/page/Page1.json"));
  expect(pageFile).toBeTruthy();
  void fixturePath;
});
