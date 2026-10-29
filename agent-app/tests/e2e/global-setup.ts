// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { spawn, type ChildProcess } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API_BASE, API_PORT, E2E_DB_URL, WEB_BASE, WEB_PORT, TENANT_A_ID, TENANT_B_ID, serviceEnvironment } from "./helpers/config.js";
import { assertE2eDestructiveResetAllowed } from "./helpers/destructive-reset.js";

export const ROOT = fileURLToPath(new URL("../..", import.meta.url));
const delay = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

/** Refuse occupied ports BEFORE migrations/reset: never reuse a developer server as an E2E service. */
async function assertPortAvailable(port: string): Promise<void> {
  if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535) throw new Error("Invalid E2E service port");
  await new Promise<void>((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(Number(port), () => server.close(error => error ? reject(error) : resolve()));
  });
}

export default async function globalSetup(): Promise<() => Promise<void>> {
  assertE2eDestructiveResetAllowed({ databaseUrl: E2E_DB_URL, allowDestructiveReset: process.env.KF_E2E_ALLOW_DESTRUCTIVE_RESET });
  if (API_PORT === WEB_PORT) throw new Error("E2E API and Web ports must differ");
  await assertPortAvailable(API_PORT);
  await assertPortAvailable(WEB_PORT);
  const runtimeRoot = await mkdtemp(path.join(tmpdir(), "kf-agent-e2e-"));
  const environment = serviceEnvironment(runtimeRoot);
  const processes: Array<{ label: string; child: ChildProcess; output: string }> = [];
  const viteArgs = (root: string, entry: string) => ["node_modules/vite-node/dist/cli.mjs", "-r", root, "-c", "tests/e2e/vite.e2e.config.ts", entry];
  function launch(label: string, args: string[], extra: NodeJS.ProcessEnv = {}) {
    const child = spawn(process.execPath, args, { cwd: ROOT, env: { ...environment, ...extra }, detached: process.platform !== "win32", stdio: ["ignore", "pipe", "pipe"] });
    const record = { label, child, output: "" };
    processes.push(record);
    const append = (data: Buffer) => { record.output = (record.output + data.toString()).slice(-128_000); };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.on("error", error => { record.output += String(error); });
    return record;
  }
  function assertAlive() {
    const dead = processes.find(({ child }) => child.signalCode !== null || (child.exitCode !== null && child.exitCode !== 0));
    // Setup tools deliberately exit successfully; only a nonzero exit is a failure for them.
    if (dead && dead.child.exitCode !== 0) throw new Error(`${dead.label} exited during E2E startup: ${dead.output}`);
    const deadService = processes.find(({ label, child }) => !["migrate", "seed"].includes(label) && (child.exitCode !== null || child.signalCode !== null));
    if (deadService) throw new Error(`${deadService.label} stopped during E2E startup: ${deadService.output}`);
  }
  async function runOnce(label: string, args: string[]) {
    const record = launch(label, args);
    await new Promise<void>((resolve, reject) => {
      record.child.once("error", reject);
      record.child.once("exit", code => code === 0 ? resolve() : reject(new Error(`${label} failed: ${record.output}`)));
    });
  }
  async function cleanup() {
    for (const { child } of [...processes].reverse()) {
      if (!child.pid || child.exitCode !== null || child.signalCode !== null) continue;
      try {
        if (process.platform !== "win32") process.kill(-child.pid, "SIGTERM");
        else child.kill("SIGTERM");
      } catch { /* The current-run child already exited. No persisted PIDs are trusted. */ }
    }
    const deadline = Date.now() + 5000;
    while (processes.some(({ child }) => child.exitCode === null && child.signalCode === null) && Date.now() < deadline) await delay(50);
    for (const { label, child, output } of processes) {
      if (child.pid && child.exitCode === null && child.signalCode === null) {
        try {
          if (process.platform !== "win32") process.kill(-child.pid, "SIGKILL");
          else child.kill("SIGKILL");
        } catch { /* Already gone. */ }
      }
      await writeFile(path.join(runtimeRoot, `${label}.log`), output);
    }
    console.log(`[e2e] isolated runtime evidence retained at ${runtimeRoot}`);
  }
  async function waitForHttp(url: string) {
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      assertAlive();
      try { const response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(2000) }); if (response.status < 500) return; } catch { /* Not ready. */ }
      await delay(200);
    }
    throw new Error(`E2E service not ready: ${url}`);
  }
  try {
    await runOnce("migrate", ["node_modules/prisma/build/index.js", "migrate", "deploy"]);
    await runOnce("seed", viteArgs("apps/api", "apps/api/src/e2e-seed.ts"));
    launch("api", viteArgs("apps/api", "apps/api/src/main.ts"), { PORT: API_PORT });
    launch("build-worker", viteArgs("apps/worker", "apps/worker/src/run.ts"));
    // A: same production bootstrap, only ModelPort replaced by a fixed semantic fixture.
    launch("agent-a", viteArgs("apps/api", "apps/api/test-support/e2e-agent-worker.ts"), { AGENT_TENANT_ID: TENANT_A_ID });
    // B: unmodified production composition/entrypoint, deterministic fake model selected normally.
    launch("agent-b", viteArgs("apps/api", "apps/api/src/run-agent-worker.ts"), { AGENT_TENANT_ID: TENANT_B_ID });
    launch("web", ["node_modules/vite/bin/vite.js", "apps/web", "--host", "localhost", "--port", WEB_PORT, "--strictPort"], { VITE_API_BASE: API_BASE });
    await Promise.all([waitForHttp(`${API_BASE}/api/me`), waitForHttp(WEB_BASE)]);
    assertAlive();
    console.log("[e2e] API + build-worker + two tenant-scoped agent-workers + Web started");
    return cleanup;
  } catch (error) { await cleanup(); throw error; }
}
// end
