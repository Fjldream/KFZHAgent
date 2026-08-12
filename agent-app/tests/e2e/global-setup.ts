import { spawn, type ChildProcess } from "node:child_process";
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API_BASE, API_PORT, E2E_DB_URL, WEB_BASE, WEB_PORT } from "./helpers/config.js";
import { assertE2eDestructiveResetAllowed } from "./helpers/destructive-reset.js";

// Guard before any API/Prisma module is imported, spawned, connected, seeded,
// or allowed to issue TRUNCATE. The seed repeats this guard independently.
assertE2eDestructiveResetAllowed({
  databaseUrl: E2E_DB_URL,
  allowDestructiveReset: process.env.KF_E2E_ALLOW_DESTRUCTIVE_RESET,
});

/**
 * Playwright globalSetup：准备 kf_agent_e2e 数据库、启动 api + worker + web
 * 三进程，等待健康后完成。pid 写入 tests/e2e/.e2e-pids.json（工作区内，
 * gitignore），由 global-teardown 停止。
 */

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));

const PID_FILE = path.join(ROOT, "tests", "e2e", ".e2e-pids.json");
const ARTIFACT_ROOT = path.join(ROOT, ".kf-e2e-artifacts");

const BASE_ENV: Record<string, string> = {
  ...process.env,
  DATABASE_URL: E2E_DB_URL,
  ARTIFACT_STORAGE_ROOT: ARTIFACT_ROOT,
  CORS_ORIGINS: WEB_BASE,
  MODEL_PORT_MODE: "fake",
  // Deterministic test-only signing authority shared by the isolated API and
  // worker. Never inherit a developer/production secret into E2E evidence.
  KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x45).toString("base64"),
  KF_E2E_ALLOW_DESTRUCTIVE_RESET: "1",
  // 本地 http 环境：Node 侧 APIRequestContext 不会把 Secure cookie 发到
  // http 目标；浏览器端仍受 HttpOnly + SameSite=strict 保护。
  COOKIE_SECURE: "false",
};

interface ProcSpec {
  label: string;
  command: string;
  args: string[];
  env?: Record<string, string>;
}

function spawnProc(spec: ProcSpec): ChildProcess {
  const child = spawn(spec.command, spec.args, {
    cwd: ROOT,
    env: { ...BASE_ENV, ...(spec.env ?? {}) },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout?.on("data", (chunk) => process.stdout.write(`[${spec.label}] ${chunk}`));
  child.stderr?.on("data", (chunk) => process.stderr.write(`[${spec.label}] ${chunk}`));
  return child;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(url, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      // 服务未就绪，继续等待。
    }
    if (Date.now() > deadline) {
      throw new Error(`service ${url} did not become ready within ${timeoutMs}ms`);
    }
    await sleep(500);
  }
}

async function runSeed(): Promise<void> {
  const child = spawnProc({
    label: "seed",
    command: "pnpm",
    args: [
      "exec",
      "vite-node",
      "-r",
      "apps/api",
      "-c",
      "tests/e2e/vite.e2e.config.ts",
      "apps/api/src/e2e-seed.ts",
    ],
  });
  const code = await new Promise<number>((resolve) => {
    child.on("exit", (code) => resolve(code ?? -1));
  });
  if (code !== 0) {
    throw new Error(`e2e seed exited with code ${code}`);
  }
}

export default async function globalSetup(): Promise<{ pids: number[] }> {
  await runSeed();

  const procs = [
    spawnProc({
      label: "api",
      command: "pnpm",
      args: [
        "exec",
        "vite-node",
        "-r",
        "apps/api",
        "-c",
        "tests/e2e/vite.e2e.config.ts",
        "apps/api/src/main.ts",
      ],
      env: { PORT: API_PORT },
    }),
    spawnProc({
      label: "worker",
      command: "pnpm",
      args: [
        "exec",
        "vite-node",
        "-r",
        "apps/worker",
        "-c",
        "tests/e2e/vite.e2e.config.ts",
        "apps/worker/src/run.ts",
      ],
    }),
    spawnProc({
      label: "web",
      command: "pnpm",
      args: ["--filter", "web", "exec", "vite", "--host", "localhost", "--port", WEB_PORT, "--strictPort"],
      env: { VITE_API_BASE: API_BASE },
    }),
  ];

  const pids = procs.map((proc) => proc.pid).filter((pid): pid is number => typeof pid === "number");
  await writeFile(PID_FILE, JSON.stringify({ pids }, null, 2), "utf8");

  try {
    await waitForHttp(`${API_BASE}/api/me`, 90_000);
    await waitForHttp(WEB_BASE, 90_000);
  } catch (error) {
    for (const pid of pids) {
      try {
        process.kill(-pid, "SIGTERM");
      } catch {
        try {
          process.kill(pid, "SIGTERM");
        } catch {
          // 已退出。
        }
      }
    }
    throw error;
  }

  console.log("[global-setup] api + worker + web are up");
  return { pids };
}
