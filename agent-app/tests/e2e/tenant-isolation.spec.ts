import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { API_BASE, TENANT_A, TENANT_B } from "./helpers/config";
import {
  createConversation,
  createWorkspace,
  loginViaApi,
  resumeApproval,
  sendMessageAndGetDone,
} from "./helpers/api";
import { fixturePath } from "./helpers/unzip";

/**
 * Brief Step 8：租户隔离与上传安全。
 *  - 第二租户不能 list/view/resume/download/delete 第一租户的 workspace；
 *  - 上传 path-traversal 与 zip-bomb fixture 被拒绝且不创建 Source Revision。
 */
test("tenant isolation and upload security", async ({ browser }) => {
  test.setTimeout(180_000);
  const contextA = await browser.newContext();
  const contextB = await browser.newContext();
  const reqA = contextA.request;
  const reqB = contextB.request;

  await loginViaApi(reqA, TENANT_A);
  await loginViaApi(reqB, TENANT_B);

  // ---- 租户 A 准备资源 ------------------------------------------------
  const wsA = await createWorkspace(reqA, `Isolated WS ${Date.now()}`, "upload");
  const pkgBytes = await readFile(fixturePath("client-unknown-field.gz"));
  const upload = await reqA.post(`${API_BASE}/api/workspaces/${wsA.id}/uploads`, {
    data: Buffer.from(pkgBytes),
    headers: { "Content-Type": "application/octet-stream" },
  });
  expect(upload.status()).toBe(201);
  const packageUrl = ((await upload.json()) as { packageUrl: string }).packageUrl;

  const convA = await createConversation(reqA, wsA.id);
  const done = await sendMessageAndGetDone(reqA, convA.id, "请把按钮改成红色");
  const planHash = done.interrupt?.planHash;
  expect(planHash).toMatch(/^[0-9a-f]{64}$/);
  const changePlanId = done.changePlanId;
  expect(changePlanId).toBeTruthy();
  const resumed = await resumeApproval(reqA, convA.id, "approve", planHash!);
  const jobId = resumed.buildJobId as string;
  expect(jobId).toBeTruthy();

  // ---- 租户 B 对所有租户 A 资源一律 404（防枚举） ----------------------
  await expect404(reqB, "GET", `${API_BASE}/api/workspaces/${wsA.id}`);
  await expect404(reqB, "GET", `${API_BASE}/api/conversations/${convA.id}`);
  await expect404(reqB, "GET", `${API_BASE}/api/conversations/${convA.id}/messages`);
  await expect404(reqB, "POST", `${API_BASE}/api/conversations/${convA.id}/resume`, {
    action: "approve",
    planHash,
  });
  await expect404(reqB, "POST", `${API_BASE}/api/artifacts/${packageUrl}/download-token`);
  await expect404(reqB, "GET", `${API_BASE}/api/build-jobs/${jobId}`);
  await expect404(reqB, "GET", `${API_BASE}/api/build-jobs/${jobId}/artifacts`);
  await expect404(reqB, "GET", `${API_BASE}/api/build-jobs/${jobId}/report`);
  await expect404(reqB, "GET", `${API_BASE}/api/change-plans/${changePlanId}`);
  await expect404(reqB, "DELETE", `${API_BASE}/api/workspaces/${wsA.id}`, { confirm: true });

  // 租户 A 自己的资源仍然可达（对照证明隔离而非服务故障）
  const selfCheck = await reqA.get(`${API_BASE}/api/workspaces/${wsA.id}`);
  expect(selfCheck.status()).toBe(200);

  // ---- 上传安全：path-traversal 与 zip-bomb 均被拒绝 ------------------
  const evilWs = await createWorkspace(reqB, `Evil WS ${Date.now()}`, "upload");

  for (const fixture of ["evil-path-traversal.gz", "evil-zip-bomb.gz"]) {
    const evilBytes = await readFile(fixturePath(fixture));
    const evilUpload = await reqB.post(`${API_BASE}/api/workspaces/${evilWs.id}/uploads`, {
      data: Buffer.from(evilBytes),
      headers: { "Content-Type": "application/octet-stream" },
    });
    expect(evilUpload.status(), `fixture ${fixture} should be rejected`).toBe(422);
    const body = (await evilUpload.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe("PACKAGE_UNPACK_FAILED");
  }

  // 被拒绝的包不会创建 Source Revision，workspace 保持无修订状态。
  const revisions = await reqB.get(`${API_BASE}/api/workspaces/${evilWs.id}/revisions`);
  expect(revisions.status()).toBe(200);
  expect((await revisions.json()) as unknown[]).toHaveLength(0);

  await contextA.close();
  await contextB.close();
});

async function expect404(
  request: APIRequestContext,
  method: string,
  url: string,
  data?: unknown,
): Promise<void> {
  const res = await request.fetch(url, {
    method,
    ...(data !== undefined ? { data } : {}),
  });
  expect(res.status(), `${method} ${url} should 404 for another tenant`).toBe(404);
}
