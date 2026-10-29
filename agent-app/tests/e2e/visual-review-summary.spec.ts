// modified by jinlong.feng at 2026-10-28 Agent工作台迭代
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import type { VisualReviewDisplay } from "../../packages/contracts/src/visual-review.js";

test("50-region review batches normal content, explicitly resolves two exception types and preserves blueprint confirmation", async ({ page }, testInfo) => {
  const workspaceId = "summary-workspace";
  const conversationId = "summary-conversation";
  const runId = "summary-run";
  const receipt = `vref1:${"a".repeat(64)}:${"b".repeat(64)}`;
  const review: VisualReviewDisplay = { schemaVersion: 1, runId, workspaceId, conversationId, receipt,
    reference: { schemaVersion: 1, analysisId: "summary-analysis", specHash: "a".repeat(64),
      spec: { schemaVersion: 1, sourceAssetId: "summary-image", sourceHash: "c".repeat(64), viewport: { width: 1586, height: 992 },
        regions: Array.from({ length: 48 }, (_, index) => ({ id: `text-${index}`, parentId: null, role: "text" as const,
          text: [index === 0 ? "能源管理系统" : `常规文字 ${index}`], confidence: 0.9,
          box: { x: (index % 8) / 8, y: Math.floor(index / 8) / 8, width: 0.1, height: 0.1 }, interactionHint: null })),
        designTokens: { background: "#fff", foreground: "#111", accent: "#2878f0", spacing: [8, 16], radius: [8] },
        uncertainties: [{ regionId: null, question: "图中按钮的业务跳转尚未提供，不猜测业务行为。" }] },
      mappings: Array.from({ length: 48 }, (_, index) => ({ regionId: `text-${index}`, capabilityId: "richtext", controlType: "richtext",
        support: "supported_unverified" as const, reason: "pending-verification", evidenceIds: [], fallback: null })),
    } };
  for (const [id, role, label] of [["device-table", "table", "设备运行状态表格"], ["energy-chart", "chart", "今日用能趋势图"]] as const) {
    review.reference.spec.regions.push({ id, role, parentId: null, text: [label], confidence: 0.95,
      box: { x: 0.2, y: role === "table" ? 0.7 : 0.35, width: 0.7, height: 0.2 }, interactionHint: null });
    review.reference.mappings.push({ regionId: id, capabilityId: null, controlType: null, support: "unsupported", reason: "没有可生成的匹配组件", evidenceIds: [], fallback: "静态展示仅为建议，替代生成尚未开放" });
  }
  const image = await readFile(process.env.KF_REVIEW_REFERENCE_IMAGE ?? new URL("../fixtures/energy-overview-20261023/reference.png", import.meta.url));
  const evidence = process.env.KF_REVIEW_EVIDENCE_DIR ?? testInfo.outputPath("review-summary");
  await mkdir(evidence, { recursive: true });
  const writes: Array<Record<string, unknown>> = [];
  const unexpected: string[] = [];
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  const snapshot = (id: string) => ({ id, status: "WAITING_INPUT", lastSeq: 1, failureCode: null, resultRevisionId: null, buildJobId: null });
  await page.route("**/api/**", async route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/api/me") return json({ id: "summary-admin", tenantId: "summary-tenant", username: "admin", role: "tenant_admin", mustChangePassword: false });
    if (path.endsWith("/workbench-config")) return json({ schemaVersion: 1, flags: { agentRunsV2: true, agentWorkbenchV2: true, agentVisionV1: true }, imagePolicy: "explicit-consent", outboundImagesAllowed: true });
    if (path.endsWith("/tenant/visual-egress-policy")) return json({ schemaVersion: 1, imageEgressAllowed: true });
    if (path === `/api/workspaces/${workspaceId}`) return json({ id: workspaceId, name: "能源系统识别摘要测试", mode: "new", currentRevisionId: "base" });
    if (path.endsWith("/revisions")) return json([]);
    if (path.startsWith("/api/v2/conversations") && request.method() === "GET") {
      if (path.endsWith("/messages")) return json({ items: [{ id: "requirement", role: "user", content: "根据参考图生成能源管理系统客户端工程" }], nextCursor: null });
      const item = { id: conversationId, workspaceId, title: "能源管理系统图生测试", archivedAt: null, activeRunId: runId, activeRunStatus: "WAITING_INPUT" };
      return path === "/api/v2/conversations" ? json({ items: [item], nextCursor: null }) : json(item);
    }
    if (path.endsWith("/runs/latest")) return json(snapshot(writes.length ? "blueprint-run" : runId));
    if (path.endsWith("/runs") && request.method() === "POST") { writes.push(request.postDataJSON() as Record<string, unknown>); return json(snapshot("blueprint-run"), 202); }
    if (path.endsWith("/visual-review")) return json(review);
    if (path.includes("/reference-assets/") && path.endsWith("/image")) return route.fulfill({ contentType: "image/png", body: image });
    if (path.startsWith("/api/runs/") && path.endsWith("/events")) {
      const current = path.split("/")[3];
      const event = { schemaVersion: 1, runId: current, seq: 1, type: "input.required", createdAt: "2026-10-28T02:00:00.000Z",
        payload: { receipt: current === runId ? receipt : "blueprint-fixture", question: "请确认本轮方案" } };
      return route.fulfill({ contentType: "text/event-stream", body: `id: 1\ndata: ${JSON.stringify(event)}\n\n` });
    }
    if (path.startsWith("/api/runs/") && request.method() === "GET") return json(snapshot(path.split("/")[3]!));
    unexpected.push(`${request.method()} ${path}`); return json({ message: "UNEXPECTED_FIXTURE_REQUEST" }, 500);
  });
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`/workspaces/${workspaceId}/workbench/${conversationId}`);
  await expect(page.getByTestId("review-summary")).toBeVisible();
  await expect(page.getByTestId("batch-keep-supported")).toHaveCSS("background-color", "rgb(31, 111, 235)");
  await expect(page.getByTestId("batch-keep-supported")).toHaveCSS("color", "rgb(255, 255, 255)");
  await expect(page.locator(".visual-mapping select:visible")).toHaveCount(0);
  await expect(page.locator("[data-review-group]")).toHaveCount(2);
  await expect(page.getByTestId("accept-reference")).toBeDisabled();
  await page.getByTestId("review-summary").screenshot({ path: join(evidence, "summary-before.png") });
  await page.getByTestId("batch-keep-supported").click();
  await expect(page.getByTestId("accept-reference")).toBeDisabled();
  expect(writes).toHaveLength(0);
  await page.locator('[data-review-group="unsupported:table"] [data-action="omit-group"]').click();
  await expect(page.getByTestId("accept-reference")).toBeDisabled();
  await page.locator('[data-review-group="unsupported:chart"] [data-action="omit-group"]').click();
  await expect(page.getByTestId("accept-reference")).toBeEnabled();
  await page.getByTestId("review-summary").screenshot({ path: join(evidence, "summary-ready.png") });
  await page.getByTestId("undo-supported").click();
  await expect(page.getByTestId("accept-reference")).toBeDisabled();
  await page.getByTestId("batch-keep-supported").click();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")).toBe(true);
  await page.screenshot({ path: join(evidence, "summary-mobile.png") });
  await page.getByTestId("review-show-details").check();
  await expect(page.locator(".visual-mapping").first()).toBeVisible();
  await page.getByTestId("review-show-details").uncheck();
  await expect(page.locator(".visual-mapping select:visible")).toHaveCount(0);
  await page.getByTestId("accept-reference").click();
  await expect(page.getByRole("button", { name: "确认蓝图并生成工程", exact: true })).toBeVisible();
  expect(writes).toHaveLength(1);
  const action = writes[0]!.action as { type: string; acceptedDifferences: Array<{ regionId: string; disposition: string; capabilityId: string | null; reason: string }> };
  expect(action).toMatchObject({ type: "accept_visual_reference", expectedRunId: runId, analysisId: "summary-analysis", analysisHash: "a".repeat(64), receipt });
  expect(action.acceptedDifferences).toHaveLength(50);
  expect(action.acceptedDifferences.filter(item => item.disposition === "accept-unverified")).toHaveLength(48);
  expect(action.acceptedDifferences.filter(item => item.disposition === "omit").map(item => item.regionId).sort()).toEqual(["device-table", "energy-chart"]);
  expect(action.acceptedDifferences.every(item => item.reason.length > 0 && item.reason.length <= 1000)).toBe(true);
  expect(errors).toEqual([]); expect(unexpected).toEqual([]);
  await writeFile(join(evidence, "browser-verification.json"), JSON.stringify({ mode: "synthetic-50-region-browser-fixture", regions: 50, normal: 48, exceptionGroups: 2,
    acceptedDifferenceRecords: 50, normalAcknowledgements: 48, explicitOmissions: 2, blueprintStillRequiresConfirmation: true,
    undoAndDetailsToggle: true, mobileHorizontalOverflow: false, backendMutations: 0, modelCalls: 0, pageErrors: errors }, null, 2) + "\n");
});
// end
