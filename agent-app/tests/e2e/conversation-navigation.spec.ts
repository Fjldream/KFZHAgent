// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { expect, test } from "@playwright/test";

// Frontend contract fixture: all /api calls are intercepted, so this suite performs no DB or model work.
test("conversation pages, archive management, drafts and browser navigation use the real workbench", async ({ page }) => {
  const records = [
    { id: "c1", workspaceId: "fixture-workspace", title: "第一会话", archivedAt: null as string | null, activeRunId: null, activeRunStatus: null, lastActivityAt: "2026-10-27T00:00:00.000Z" },
    { id: "c2", workspaceId: "fixture-workspace", title: "第二会话", archivedAt: null as string | null, activeRunId: null, activeRunStatus: null, lastActivityAt: "2026-10-26T00:00:00.000Z" },
  ];
  let creations = 0;
  let slowHistory = false;
  let releaseHistory: (() => void) | undefined;
  const delayedRequest = new Promise<void>(resolve => { releaseHistory = resolve; });
  let allowed = false;
  const mutations: unknown[] = [];
  await page.route("**/api/**", async route => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (value: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
    if (path === "/api/me") return json({ id: "fixture-admin", tenantId: "fixture-tenant", username: "admin", role: "tenant_admin", mustChangePassword: false });
    if (path.endsWith("/workbench-config")) return json({ schemaVersion: 1, flags: { agentRunsV2: true, agentWorkbenchV2: true, agentVisionV1: true }, imagePolicy: "explicit-consent", outboundImagesAllowed: allowed });
    if (path.endsWith("/tenant/visual-egress-policy")) {
      if (request.method() === "PATCH") { const input = request.postDataJSON() as { imageEgressAllowed: boolean }; mutations.push(input); allowed = input.imageEgressAllowed; }
      return json({ schemaVersion: 1, imageEgressAllowed: allowed, coverage: "reference-images-and-derived-structure" });
    }
    if (path === "/api/workspaces/fixture-workspace") return json({ id: "fixture-workspace", name: "会话导航验收", mode: "new", currentRevisionId: "base" });
    if (path.endsWith("/revisions")) return json([]);
    if (path.endsWith("/runs/latest")) return json(null);
    if (path === "/api/v2/conversations" && request.method() === "POST") { creations += 1; return json(records[0], 201); }
    if (path === "/api/v2/conversations") {
      const archived = url.searchParams.get("archived") === "true";
      const matches = records.filter(item => !!item.archivedAt === archived);
      const second = url.searchParams.has("cursor");
      return json({ items: second ? matches.slice(1) : matches.slice(0, 1), nextCursor: !second && matches.length > 1 ? "next-conversation" : null });
    }
    if (path.endsWith("/messages")) {
      const id = path.split("/")[4];
      if (id === "c2" && slowHistory) { await delayedRequest; }
      const older = url.searchParams.has("before");
      return json({ items: [{ id: `${id}-${older ? "old" : "new"}`, conversationId: id, role: "user", content: id === "c2" ? "第二会话慢历史" : older ? "第一会话旧历史" : "第一会话新历史", createdAt: "2026-10-27T00:00:00.000Z", runId: null, parts: [] }], nextCursor: id === "c1" && !older ? "older-message" : null });
    }
    if (path.startsWith("/api/v2/conversations/")) {
      const item = records.find(record => record.id === path.split("/")[4]);
      if (!item) return json({ message: "CONVERSATION_NOT_FOUND" }, 404);
      if (request.method() === "PATCH") {
        const input = request.postDataJSON() as { title?: string; archived?: boolean };
        if (input.title !== undefined) item.title = input.title;
        if (input.archived !== undefined) item.archivedAt = input.archived ? "2026-10-27T00:00:00.000Z" : null;
      }
      return json(item);
    }
    return json({ message: `UNEXPECTED_FIXTURE_REQUEST:${path}` }, 500);
  });
  await page.goto("/workspaces/fixture-workspace/workbench/c1");
  await expect(page.locator(".conv-name")).toHaveText("第一会话");
  await page.getByRole("button", { name: "加载更早消息", exact: true }).click();
  await expect(page.getByText("第一会话旧历史", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "加载更多会话", exact: true }).click();
  await expect(page.locator(".conv")).toHaveCount(2);
  await page.getByRole("textbox", { name: "描述你的需求", exact: true }).fill("第一会话未发送草稿");
  await page.getByRole("tab", { name: /讨论/ }).click();
  await page.locator(".conv").filter({ hasText: "第二会话" }).click();
  await expect(page).toHaveURL(/\/c2$/);
  await expect(page.getByRole("textbox", { name: "描述你的需求", exact: true })).toHaveValue("");
  await page.getByRole("textbox", { name: "描述你的需求", exact: true }).fill("第二会话草稿");
  await page.goBack();
  await expect(page.locator(".conv-name")).toHaveText("第一会话");
  await expect(page.getByRole("textbox", { name: "描述你的需求", exact: true })).toHaveValue("第一会话未发送草稿");
  await expect(page.getByRole("tab", { name: /讨论/ })).toHaveAttribute("aria-selected", "true");
  await page.goForward();
  await expect(page.getByRole("textbox", { name: "描述你的需求", exact: true })).toHaveValue("第二会话草稿");
  await page.reload();
  await expect(page.locator(".conv-name")).toHaveText("第二会话");
  await expect(page.getByRole("textbox", { name: "描述你的需求", exact: true })).toHaveValue("第二会话草稿");
  // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
  await expect(page.getByRole("textbox", { name: "新会话名称", exact: true })).toHaveCount(0);
  await page.getByLabel("会话操作", { exact: true }).click();
  await page.getByRole("button", { name: "重命名", exact: true }).click();
  // end
  await page.getByRole("textbox", { name: "新会话名称", exact: true }).fill("改名后的会话");
  // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
  await page.getByRole("button", { name: "保存", exact: true }).click();
  // end
  await expect(page.locator(".conv-name")).toHaveText("改名后的会话");
  // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
  await page.getByLabel("会话操作", { exact: true }).click();
  // end
  await page.getByRole("button", { name: "归档会话", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "描述你的需求", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "📥 归档管理", exact: true }).click();
  await expect(page.locator('.conv[data-state="archived"]')).toContainText("改名后的会话");
  // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
  await page.getByLabel("会话操作", { exact: true }).click();
  // end
  await page.getByRole("button", { name: "恢复会话", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "描述你的需求", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "返回活跃会话", exact: true }).click();
  await page.getByRole("button", { name: "加载更多会话", exact: true }).click();
  await page.locator(".conv").filter({ hasText: "第一会话" }).click();
  await expect(page).toHaveURL(/\/c1$/);
  // Let a second-conversation request arrive after browser Back returns to the first conversation.
  slowHistory = true;
  await page.locator(".conv").filter({ hasText: "改名后的会话" }).click();
  await expect(page).toHaveURL(/\/c2$/);
  await page.goBack();
  releaseHistory?.();
  await expect(page.locator(".conv-name")).toHaveText("第一会话");
  await expect(page.getByRole("textbox", { name: "描述你的需求", exact: true })).toHaveValue("第一会话未发送草稿");
  await expect(page.getByText("第二会话慢历史", { exact: true })).toHaveCount(0);
  expect(creations).toBe(0);
  expect(mutations).toEqual([]);
  // modified by jinlong.feng at 2026-10-28 Agent工作台迭代
  await expect(page.getByRole("button", { name: "授权租户图片外发", exact: true })).toHaveCount(0);
  await page.getByLabel("图片发送设置", { exact: true }).click();
  expect(mutations).toEqual([]);
  // end
  await page.getByRole("button", { name: "授权租户图片外发", exact: true }).click();
  await expect(page.getByRole("button", { name: "关闭租户图片外发", exact: true })).toBeEnabled();
  expect(mutations).toEqual([{ imageEgressAllowed: true }]);
  await page.goto("/workspaces/fixture-workspace/workbench/missing");
  await expect(page.getByRole("alert")).toContainText("CONVERSATION_NOT_FOUND");
  await expect(page.getByRole("textbox", { name: "描述你的需求", exact: true })).toBeDisabled();
  expect(creations).toBe(0);
});
// end
