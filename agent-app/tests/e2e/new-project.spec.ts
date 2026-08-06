import { expect, test, type Page } from "@playwright/test";
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

/** 从 plan-hash 展示区提取 64 位 planHash。 */
async function extractPlanHash(page: Page): Promise<string> {
  const text = await page.getByTestId("plan-hash").innerText();
  return text.replace("planHash：", "").trim();
}

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

  // 3) 工作区 shell（新设计：情境面板随工作流 stage 切换，入口在 /workspaces 列表页）。
  //    进入后 idle：对话 + 工程树 + 修订列表可见；变更计划是弹层（ApprovalSheet）、
  //    预览条按 previewUrl 出现，二者在未发送需求时均不渲染。
  await expect(page.getByTestId("conversation-panel")).toBeVisible();
  await expect(page.getByTestId("project-tree")).toContainText("客户端工程");
  await expect(page.getByTestId("project-tree")).toContainText("计算域（未支持）");
  await expect(page.getByTestId("revision-list")).toBeVisible();
  await expect(page.getByTestId("change-plan-panel")).toHaveCount(0);
  await expect(page.getByTestId("preview-panel")).toHaveCount(0);

  // 4) 通过 UI 提交确定性 fake-model 需求 → SSE 流在浏览器内完成 → 审批中断（计划 1）
  await page.getByTestId("message-input").fill("请新建一个示例页面");
  await page.getByTestId("send-message").click();
  await expect(page.getByTestId("plan-hash")).toContainText(/[0-9a-f]{64}/, {
    timeout: 60_000,
  });
  const firstPlanHash = await extractPlanHash(page);
  expect(firstPlanHash).toMatch(/^[0-9a-f]{64}$/);
  // 变更计划以全屏弹层形式出现（ApprovalSheet），批准按钮在弹层内。
  await expect(page.getByTestId("change-plan-panel")).toContainText("确认变更计划");
  await expect(page.getByTestId("approve-plan")).toBeEnabled();
  // 若审批中断携带 previewArtifactId，预览条出现且 iframe 保持无脚本 sandbox。
  if ((await page.getByTestId("preview-panel").count()) > 0) {
    const sandbox = await page.getByTestId("preview-frame").getAttribute("sandbox");
    expect(sandbox).not.toContain("allow-scripts");
  }

  // 4.5) revise the plan（brief Step 6 要求）：UI 点「要求修改」→ 新计划展示，
  //      新 planHash 与旧的不同；批准必须使用 revise 后的 planHash。
  await page.getByTestId("revise-plan").click();
  await expect(page.getByTestId("plan-hash")).not.toContainText(firstPlanHash, {
    timeout: 60_000,
  });
  const planHash = await extractPlanHash(page);
  expect(planHash).toMatch(/^[0-9a-f]{64}$/);
  expect(planHash).not.toBe(firstPlanHash);
  await expect(page.getByTestId("approve-plan")).toBeEnabled();

  // 5) UI 批准（revise 后的计划）：拦截 resume 响应拿 buildJobId
  const resumeResponse = page.waitForResponse(
    (res) => res.url().includes("/resume") && res.request().method() === "POST",
  );
  await page.getByTestId("approve-plan").click();
  const resumeBody = (await (await resumeResponse).json()) as { buildJobId?: string };
  const jobId = resumeBody.buildJobId;
  expect(jobId).toBeTruthy();

  // 6) worker 完成：UI 自动轮询构建任务，ready 情境面板显示校验通过与下载按钮
  //    （批准后弹层关闭，download-artifact 由 ContextPanel ready 分支内联渲染）。
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

  // C1：new-flow 构建必须真正应用已确认的 ChangePlan——下载的 .gz 里
  // Page1.json 的 Text1.text 必须是 revise 后计划里的值（fake-model
  // 计划把默认 "Hello" 改为「由 KF Solution Agent 修订生成」）。
  const pageBytes = tree.get(pageFile!);
  expect(pageBytes).toBeTruthy();
  const pageText = new TextDecoder().decode(pageBytes);
  expect(pageText).toContain("由 KF Solution Agent 修订生成");
  expect(pageText).not.toContain('"text": "Hello"');
  void fixturePath;
});
