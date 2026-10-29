// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { expect, test } from "@playwright/test";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { TENANT_A } from "./helpers/config.js";
import { createWorkspaceInBrowser, downloadArtifactBytes, events, getValidationReport, listBuildArtifacts, login, sendInBrowser, submitInBrowser, waitForRun } from "./helpers/api.js";
import { fixturePath, readFileTree, unzipPackageToDir } from "./helpers/unzip.js";

test("legacy native import: upload, revise, approve, build and preserve unrelated bytes/unknown fields", async ({ page }) => {
  await login(page, TENANT_A);
  await createWorkspaceInBrowser(page, `E2E Native ${Date.now()}`, "upload");
  await expect(page.getByRole("textbox", { name: "描述你的需求" })).toBeDisabled();
  await page.getByTestId("upload-input").setInputFiles(fixturePath("client-unknown-field.gz"));
  await expect(page.getByRole("textbox", { name: "描述你的需求" })).toBeEnabled({ timeout: 30_000 });
  const blueprint = await sendInBrowser(page, "请把按钮颜色改成红色");
  await waitForRun(page.request, blueprint.id, "WAITING_INPUT");
  const planned = await submitInBrowser(page, () => page.getByRole("button", { name: "确认蓝图并生成工程" }).click());
  await waitForRun(page.request, planned.id, "WAITING_APPROVAL");
  const originalHash = (await events(page.request, planned.id)).find(event => event.type === "approval.required")?.payload.planHash;
  await expect(page.getByRole("region", { name: "方案审批" })).toBeVisible();
  const revised = await submitInBrowser(page, () => page.getByRole("button", { name: "重新规划", exact: true }).click());
  await waitForRun(page.request, revised.id, "WAITING_APPROVAL");
  const revisedHash = (await events(page.request, revised.id)).find(event => event.type === "approval.required")?.payload.planHash;
  expect(revisedHash).toMatch(/^[0-9a-f]{64}$/);
  // A fixed model may produce an unchanged plan: it must still require a fresh real approval.
  expect(revisedHash).toBe(originalHash);
  await page.reload();
  const approved = await submitInBrowser(page, () => page.getByRole("button", { name: "批准并构建" }).click());
  const completed = await waitForRun(page.request, approved.id, "SUCCEEDED");
  expect(completed.buildJobId).toBeTruthy();
  expect((await getValidationReport(page.request, completed.buildJobId!)).outcome).toBe("pass");
  await expect(page.getByRole("button", { name: "下载工程包" })).toBeVisible({ timeout: 30_000 });
  const artifact = (await listBuildArtifacts(page.request, completed.buildJobId!)).find(item => item.kind === "client-package");
  expect(artifact).toBeTruthy();
  const resultTree = await readFileTree(await unzipPackageToDir(await downloadArtifactBytes(page.request, artifact!.id), await mkdtemp(path.join(tmpdir(), "kf-browser-native-"))));
  // The uploaded archive is authoritative; the loose fixture directory may have independent local edits.
  const sourceTree = await readFileTree(await unzipPackageToDir(await readFile(fixturePath("client-unknown-field.gz")), await mkdtemp(path.join(tmpdir(), "kf-browser-source-"))));
  expect([...resultTree.keys()].sort()).toEqual([...sourceTree.keys()].sort());
  for (const [name, sourceBytes] of sourceTree) {
    if (name.endsWith("project/page/Page1.json")) continue;
    expect(resultTree.get(name)?.equals(sourceBytes), `unrelated file changed: ${name}`).toBe(true);
  }
  const pageName = [...resultTree.keys()].find(name => name.endsWith("project/page/Page1.json"))!;
  const nativePage = JSON.parse(resultTree.get(pageName)!.toString()) as { customFutureField: unknown; objects: Array<Record<string, unknown>> };
  const button = nativePage.objects.find(object => object.name === "Button1");
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  // Native buttons consume styleData; a root backgroundColor field is ignored by the actual renderer.
  const expectedButtonStyle = "/* KF_AGENT_MANAGED_STYLE_V1_START */#domId{background-color:#ff0000}/* KF_AGENT_MANAGED_STYLE_V1_END */";
  expect(button).toMatchObject({ guid: "button-guid-1", type: "primary", styleData: expectedButtonStyle, customFutureField: { keep: true } });
  expect(button).not.toHaveProperty("backgroundColor");
  // end
  expect(nativePage.customFutureField).toEqual({ keep: true });
  const expectedPage = JSON.parse(sourceTree.get(pageName)!.toString()) as typeof nativePage;
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  expectedPage.objects.find(object => object.name === "Button1")!.styleData = expectedButtonStyle;
  // end
  expect(nativePage).toEqual(expectedPage);
});

test("native approval cancellation consumes the real interrupt without producing a build", async ({ page }) => {
  await login(page, TENANT_A);
  await createWorkspaceInBrowser(page, `E2E Native Cancel ${Date.now()}`, "upload");
  await page.getByTestId("upload-input").setInputFiles(fixturePath("client-unknown-field.gz"));
  await expect(page.getByRole("textbox", { name: "描述你的需求" })).toBeEnabled();
  const blueprint = await sendInBrowser(page, "请把按钮颜色改成红色");
  await waitForRun(page.request, blueprint.id, "WAITING_INPUT");
  const planned = await submitInBrowser(page, () => page.getByRole("button", { name: "确认蓝图并生成工程" }).click());
  await waitForRun(page.request, planned.id, "WAITING_APPROVAL");
  const cancelled = await submitInBrowser(page, () => page.getByRole("button", { name: "取消方案" }).click());
  const completed = await waitForRun(page.request, cancelled.id, "SUCCEEDED");
  expect(completed.buildJobId).toBeNull();
  expect(completed.resultRevisionId).toBeNull();
  await expect(page.getByRole("region", { name: "方案审批" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "下载工程包" })).toHaveCount(0);
});
// end
