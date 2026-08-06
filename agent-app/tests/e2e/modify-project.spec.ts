import { expect, test } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TENANT_A } from "./helpers/config";
import { downloadArtifactBytes, listBuildArtifacts, getValidationReport, loginViaApi } from "./helpers/api";
import { fixturePath, readFileTree, unzipPackageToDir } from "./helpers/unzip";

/**
 * Brief Step 7：上传工程修改流程。上传最小原生 .gz，请求一处按钮颜色修改，
 * 批准后下载结果并字节对比：确认补丁外的所有文件字节一致，且
 * customFutureField 等未知字段无损保留。
 */
test("modify project: upload, patch one button color, byte-compare outside patch", async ({
  page,
  request,
}) => {
  test.setTimeout(240_000);

  // 0) API 上下文显式登录。
  await loginViaApi(request, TENANT_A);

  // 1) UI 登录 + 上传工程入口
  await page.goto("/login");
  await page.getByTestId("login-tenant").fill(TENANT_A.tenant);
  await page.getByTestId("login-username").fill(TENANT_A.username);
  await page.getByTestId("login-password").fill(TENANT_A.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/workspaces(\?.*)?$/);

  const wsName = `E2E Modify ${Date.now()}`;
  await page.getByTestId("workspace-name").fill(wsName);
  await page.getByTestId("upload-workspace").click();
  await page.waitForURL(/\/workspaces\/[0-9a-f-]{36}$/);

  // 2) 上传 KF 原生 .gz 源包
  //    UploadGuide 的 input 带 hidden（由 label 触发），因此只断言挂载即可。
  await expect(page.getByTestId("upload-input")).toBeAttached();
  await page.getByTestId("upload-input").setInputFiles(fixturePath("client-unknown-field.gz"));
  // 上传成功 → 产生 source revision 1（修订历史出现 R1）
  await expect(page.getByTestId("revision-list")).toContainText("R1", { timeout: 60_000 });
  await expect(page.getByTestId("revision-list")).toContainText("源包");

  // 3) UI 提交确定性 fake-model 修改需求 → 计划 → 批准
  await page.getByTestId("message-input").fill("请把按钮颜色改成红色");
  await page.getByTestId("send-message").click();
  await expect(page.getByTestId("plan-hash")).toContainText(/[0-9a-f]{64}/, {
    timeout: 60_000,
  });
  const planHash = (await page.getByTestId("plan-hash").innerText()).replace("planHash：", "").trim();
  expect(planHash).toMatch(/^[0-9a-f]{64}$/);

  const resumeResponse = page.waitForResponse(
    (res) => res.url().includes("/resume") && res.request().method() === "POST",
  );
  await page.getByTestId("approve-plan").click();
  const resumeBody = (await (await resumeResponse).json()) as { buildJobId?: string };
  const jobId = resumeBody.buildJobId;
  expect(jobId).toBeTruthy();

  // 4) worker 完成
  await expect(page.getByTestId("report-outcome")).toContainText("校验通过", {
    timeout: 120_000,
  });
  await expect(page.getByTestId("download-artifact")).toBeVisible();
  const report = await getValidationReport(request, jobId);
  expect(report.outcome).toBe("pass");

  // 5) 下载结果 .gz 并解包
  const artifacts = await listBuildArtifacts(request, jobId);
  const clientPackage = artifacts.find((artifact) => artifact.kind === "client-package");
  expect(clientPackage).toBeTruthy();
  const bytes = await downloadArtifactBytes(request, clientPackage!.storageKey);
  const destRoot = await mkdtemp(path.join(tmpdir(), "kf-e2e-modify-"));
  const unpacked = await unzipPackageToDir(bytes, destRoot);

  const resultTree = await readFileTree(unpacked);
  const sourceTree = await readFileTree(fixturePath("client-unknown-field"));

  // 6) 字节对比：补丁外所有文件必须逐字节一致
  for (const [name, sourceBytes] of sourceTree) {
    if (name.includes("Page1.json")) continue;
    const resultBytes = resultTree.get(name);
    expect(resultBytes, `missing file outside patch: ${name}`).toBeDefined();
    expect(
      Buffer.from(resultBytes!).equals(sourceBytes),
      `file changed outside the confirmed patch: ${name}`,
    ).toBe(true);
  }
  for (const name of resultTree.keys()) {
    if (name.includes("Page1.json")) continue;
    expect(sourceTree.has(name), `unexpected new file outside patch: ${name}`).toBe(true);
  }

  // 7) Page1.json 语义断言：仅 backgroundColor 改变，未知字段无损保留
  const pageName = [...resultTree.keys()].find((name) => name.endsWith("project/page/Page1.json"));
  expect(pageName).toBeTruthy();
  const pageJson = JSON.parse(resultTree.get(pageName!)!.toString("utf8")) as {
    customFutureField?: unknown;
    objects: Array<Record<string, unknown>>;
  };
  const button = pageJson.objects.find((object) => object["name"] === "Button1");
  expect(button).toBeTruthy();
  expect(button!["backgroundColor"]).toBe("rgba(255, 0, 0, 1)");
  expect(button!["type"]).toBe("primary");
  expect(button!["guid"]).toBe("button-guid-1");
  expect(button!["customFutureField"]).toEqual({ keep: true });
  expect(pageJson.customFutureField).toEqual({ keep: true });
});
