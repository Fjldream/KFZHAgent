// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { defineConfig, devices } from "@playwright/test";
import { WEB_BASE } from "./tests/e2e/helpers/config.js";

// 显式测试运行器启用。直接种子执行仍然需要调用者自己设置这个哨兵。
process.env.KF_E2E_ALLOW_DESTRUCTIVE_RESET = "1";

/**
 * E2E 配置（Task 12）。本地运行：
 *   1) 系统需有 Google Chrome（无 Docker/浏览器下载受限环境的替代 channel）；
 *   2) PostgreSQL 运行中，显式 E2E_DATABASE_URL 指向本机 kf_agent_e2e_* 独立库；
 *      global-setup 先 migrate deploy，再受保护的 reset/seed。
 * 默认独立端口 43180/43181；不加载业务 .env。子进程复用当前 Node 可执行文件。
 */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: "*.spec.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  // globalSetup returns current-run cleanup; never kill processes from stale persisted PIDs.
  // end
  timeout: 180_000,
  expect: { timeout: 15_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: WEB_BASE,
    channel: "chrome",
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], channel: "chrome" } }],
});
// end
