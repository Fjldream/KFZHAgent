import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { ROOT } from "./global-setup";

/**
 * Playwright globalTeardown：停止 globalSetup 启动的 api / worker / web 进程
 * 并清理 pid 文件与 E2E 制品目录。
 */
export default async function globalTeardown(): Promise<void> {
  const pidFile = path.join(ROOT, "tests", "e2e", ".e2e-pids.json");
  try {
    const raw = await readFile(pidFile, "utf8");
    const { pids } = JSON.parse(raw) as { pids: number[] };
    for (const pid of pids) {
      // detached 进程组：优先按组终止，回退单进程。
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // 进程已退出。
        }
      }
    }
  } catch {
    // pid 文件缺失：没有可清理的进程。
  }
  await rm(pidFile, { force: true }).catch(() => {});
}
