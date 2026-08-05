import { defineConfig, devices } from "@playwright/test";

/**
 * E2E 配置（Task 12）。本地运行：
 *   1) 系统需有 Google Chrome（无 Docker/浏览器下载受限环境的替代 channel）；
 *   2) PostgreSQL 运行中，kf_agent_e2e 数据库由 global-setup 通过
 *      `prisma migrate deploy` 之外的脚本准备（种子脚本直接建表前的表在
 *      migrate 后已存在）。
 * 平台无关：无 unix-only 命令。
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "*.spec.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
});
