import { expect, test, type Page } from "@playwright/test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { API_BASE, TENANT_A } from "./helpers/config";
import { downloadArtifactBytes, loginViaApi } from "./helpers/api";
import { fixturePath, readFileTree, unzipPackageToDir } from "./helpers/unzip";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByTestId("login-tenant").fill(TENANT_A.tenant);
  await page.getByTestId("login-username").fill(TENANT_A.username);
  await page.getByTestId("login-password").fill(TENANT_A.password);
  await page.getByTestId("login-submit").click();
  await page.waitForURL(/\/workspaces(\?.*)?$/);
}

test("module generation: blueprint confirmation stays on the module path and blocks before build when no KF module is stable", async ({ page, request }) => {
  test.setTimeout(300_000);
  await loginViaApi(request, TENANT_A);
  await login(page);

  await page.getByTestId("workspace-name").fill(`E2E Module ${Date.now()}`);
  await page.getByTestId("create-workspace").click();
  await page.waitForURL(/\/workspaces\/[0-9a-f-]{36}$/);
  const workspaceId = new URL(page.url()).pathname.split("/").at(-1)!;
  let conversations: Array<{ id: string }> = [];
  await expect.poll(async () => {
    const conversationsResponse = await request.get(`${API_BASE}/api/conversations?workspaceId=${workspaceId}`);
    expect(conversationsResponse.status()).toBe(200);
    conversations = await conversationsResponse.json() as Array<{ id: string }>;
    return conversations.length;
  }).toBe(1);
  expect(conversations[0]!.id).toMatch(/^[0-9a-f-]{36}$/);

  await page.getByTestId("message-input").fill("请生成一个模块化个人门户，包含清晰的核心介绍");
  await page.getByTestId("send-message").click();
  await expect(page.getByTestId("effect-blueprint-card")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("change-plan-panel")).toHaveCount(0);

  await page.getByTestId("blueprint-confirm").click();
  await expect(page.getByTestId("shell-error")).toContainText("MODULE_STABLE_CATALOG_EMPTY", { timeout: 60_000 });
  await expect(page.getByTestId("preview-panel")).toHaveCount(0);
  await expect(page.getByTestId("download-artifact")).toHaveCount(0);
});

test("module generation: imported package modification preserves every unrelated native file and unknown field", async ({ page, request }) => {
  test.setTimeout(240_000);
  await loginViaApi(request, TENANT_A);
  await login(page);

  await page.getByTestId("workspace-name").fill(`E2E Module Import ${Date.now()}`);
  await page.getByTestId("upload-workspace").click();
  await page.waitForURL(/\/workspaces\/[0-9a-f-]{36}$/);
  await page.getByTestId("upload-input").setInputFiles(fixturePath("client-unknown-field.gz"));
  await expect(page.getByTestId("revision-list")).toContainText("R1", { timeout: 60_000 });

  await page.getByTestId("message-input").fill("请把按钮颜色改成红色");
  await page.getByTestId("send-message").click();
  await expect(page.getByTestId("effect-blueprint-card")).toBeVisible({ timeout: 60_000 });
  await page.getByTestId("blueprint-confirm").click();
  await expect(page.getByTestId("change-plan-panel")).toBeVisible({ timeout: 60_000 });
  const resume = page.waitForResponse((response) => response.url().includes("/resume") && response.request().method() === "POST");
  await page.getByTestId("approve-plan").click();
  const jobId = ((await (await resume).json()) as { buildJobId?: string }).buildJobId;
  expect(jobId).toBeTruthy();
  await expect(page.getByTestId("report-outcome")).toContainText("校验通过", { timeout: 120_000 });

  const artifactsResponse = await request.get(`${API_BASE}/api/build-jobs/${jobId}/artifacts`);
  const artifacts = await artifactsResponse.json() as Array<{ id: string; kind: string }>;
  const artifact = artifacts.find((candidate) => candidate.kind === "client-package");
  expect(artifact).toBeTruthy();
  const result = await unzipPackageToDir(await downloadArtifactBytes(request, artifact!.id), await mkdtemp(path.join(tmpdir(), "kf-module-import-")));
  const resultTree = await readFileTree(result);
  const sourceTree = await readFileTree(fixturePath("client-unknown-field"));
  for (const [name, source] of sourceTree) {
    if (name.endsWith("project/page/Page1.json")) continue;
    expect(Buffer.from(resultTree.get(name) ?? []).equals(source), `unexpected unrelated change: ${name}`).toBe(true);
  }
  const pageName = [...resultTree.keys()].find((name) => name.endsWith("project/page/Page1.json"));
  const pageJson = JSON.parse(resultTree.get(pageName!)!.toString("utf8")) as { customFutureField?: unknown; objects: Array<Record<string, unknown>> };
  expect(pageJson.customFutureField).toEqual({ keep: true });
  expect(pageJson.objects.find((object) => object["name"] === "Button1")?.["customFutureField"]).toEqual({ keep: true });
});
