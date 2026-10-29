// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { access, mkdir, readFile, stat, unlink, writeFile } from "node:fs/promises";
import { createServer, request as proxyRequest, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createPortProbe } from "node:net";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "@prisma/client";
import type { Client as PgClient } from "../../apps/api/node_modules/@types/pg/index.js";
import { assertTrialDatabase, trialServiceEnvironment, validateTrialConfig, type TrialConfig } from "./runtime.js";
import { claimTrialDatabase, supervisorExitCode } from "./lifecycle.js";

const root = fileURLToPath(new URL("../../", import.meta.url));
const directory = path.join(root, ".kf-trial-v1");
const configPath = path.join(directory, "config.json");
const accessPath = path.join(directory, "access.json");
const controlPath = path.join(directory, "control.json");
const requireApi = createRequire(path.join(root, "apps/api/package.json"));
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const exists = (file: string) => access(file).then(() => true, () => false);
async function privateJson(file: string, value: unknown) {
  await writeFile(file, JSON.stringify(value, null, 2) + "\n", { mode: 0o600, flag: "wx" });
}
async function readConfig() { return validateTrialConfig(JSON.parse(await readFile(configPath, "utf8"))); }
type ControlRecord = { instanceId: string; secret: string };
async function readControl(): Promise<ControlRecord> {
  const value = JSON.parse(await readFile(controlPath, "utf8")) as Record<string, unknown>;
  if (typeof value.instanceId !== "string" || typeof value.secret !== "string" || !/^[a-f0-9]{64}$/.test(value.secret)) throw new Error("TRIAL_CONTROL_INVALID");
  return { instanceId: value.instanceId, secret: value.secret };
}
type AccessRecord = { tenant: string; username: string; temporaryPassword: string; firstLoginRequiresPasswordChange: boolean };
async function readAccess(): Promise<AccessRecord> {
  const value = JSON.parse(await readFile(accessPath, "utf8")) as Record<string, unknown>;
  if (typeof value.tenant !== "string" || typeof value.username !== "string" || typeof value.temporaryPassword !== "string"
    || value.temporaryPassword.length < 16 || value.firstLoginRequiresPasswordChange !== true) throw new Error("TRIAL_ACCESS_INVALID");
  return { tenant: value.tenant, username: value.username, temporaryPassword: value.temporaryPassword, firstLoginRequiresPasswordChange: true };
}
const viteArgs = (app: string, entry: string) => ["node_modules/vite-node/dist/cli.mjs", "-r", app, "-c", "tests/e2e/vite.e2e.config.ts", entry];
async function databaseMarker(config: TrialConfig, create: boolean) {
  const { Client } = requireApi("pg") as { Client: typeof PgClient };
  const client = new Client({ connectionString: config.databaseUrl });
  await client.connect();
  try {
    if (create) {
      await client.query('CREATE TABLE "_AgentTrialOwnership" (token TEXT PRIMARY KEY)');
      await client.query('INSERT INTO "_AgentTrialOwnership" (token) VALUES ($1)', [config.ownershipToken]);
    }
    const result = await client.query<{ token: string }>('SELECT token FROM "_AgentTrialOwnership"');
    if (result.rows.length !== 1 || result.rows[0]?.token !== config.ownershipToken) throw new Error("TRIAL_DATABASE_OWNERSHIP_INVALID");
  } finally { await client.end(); }
}
async function run(args: string[], environment: NodeJS.ProcessEnv) {
  const child = spawn(process.execPath, args, { cwd: root, env: environment, stdio: "inherit" });
  await new Promise<void>((resolve, reject) => { child.once("error", reject); child.once("exit", code => code === 0 ? resolve() : reject(new Error("TRIAL_SETUP_COMMAND_FAILED"))); });
}
async function assertFree(port: number, host: string) {
  await new Promise<void>((resolve, reject) => { const probe = createPortProbe(); probe.once("error", () => reject(new Error(`TRIAL_PORT_OCCUPIED:${port}`)));
    probe.listen(port, host, () => probe.close(error => error ? reject(error) : resolve())); });
}
async function initialize() {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const resuming = await exists(configPath);
  let config: TrialConfig;
  if (resuming) config = await readConfig();
  else {
    const databaseUrl = process.env.KF_TRIAL_DATABASE_URL ?? "postgresql://postgres@127.0.0.1:5432/kf_agent_trial_v1_20261027";
    assertTrialDatabase(databaseUrl);
    config = validateTrialConfig({ schemaVersion: 1, databaseUrl, host: "127.0.0.1", apiPort: 43300, webPort: 43301,
      tenantId: randomUUID(), tenantName: "Agent 可用版试用", username: "admin", signingKey: randomBytes(32).toString("base64"),
      ownershipToken: randomBytes(32).toString("hex"),
      model: "deepseek-flash", visionModel: "deepseek-flash", baseUrl: "https://api.deepseek.com", createdAt: new Date().toISOString() });
  }
  await assertFree(config.apiPort, config.host);
  await assertFree(config.webPort, config.host);
  const adminUrl = new URL(config.databaseUrl); const databaseName = adminUrl.pathname.slice(1); adminUrl.pathname = "/postgres";
  const { Client } = requireApi("pg") as { Client: typeof PgClient };
  const admin = new Client({ connectionString: adminUrl.href });
  await admin.connect();
  try {
    await claimTrialDatabase({
      exists: async () => (await admin.query<{ datname: string }>("SELECT datname FROM pg_database WHERE datname=$1", [databaseName])).rows.length > 0,
      create: async () => { await admin.query(`CREATE DATABASE "${databaseName}"`); },
      recordMarker: () => databaseMarker(config, true), verifyMarker: () => databaseMarker(config, false),
      persistConfig: () => privateJson(configPath, config),
    }, resuming);
    // Prisma timestamp writes and raw SQL date parameters must share UTC semantics.
    // Only the database whose private marker was just verified is configured here.
    await admin.query(`ALTER DATABASE "${databaseName}" SET timezone TO 'UTC'`);
  } finally { await admin.end(); }
  const environment = trialServiceEnvironment(config, directory, process.env);
  await run(["node_modules/prisma/build/index.js", "migrate", "deploy"], environment);
  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
  try {
    const tenant = await prisma.tenant.findUnique({ where: { id: config.tenantId } });
    if (!tenant) await prisma.tenant.create({ data: { id: config.tenantId, name: config.tenantName } });
    const existing = await prisma.user.findUnique({ where: { tenantId_username: { tenantId: config.tenantId, username: config.username } } });
    if (!existing) {
      const credentials = await exists(accessPath) ? await readAccess() : {
        tenant: config.tenantName, username: config.username, temporaryPassword: randomBytes(18).toString("base64url"), firstLoginRequiresPasswordChange: true,
      };
      if (!await exists(accessPath)) await privateJson(accessPath, credentials);
      const argon2 = requireApi("argon2") as typeof import("../../apps/api/node_modules/argon2/argon2.cjs");
      await prisma.user.create({ data: { tenantId: config.tenantId, username: config.username,
        passwordHash: await argon2.hash(credentials.temporaryPassword, { type: argon2.argon2id }), role: "tenant_admin", mustChangePassword: true } });
    }
    console.log(`[trial] isolated database ready (${databaseName}); credentials: ${accessPath}`);
    console.log("[trial] tenant image egress remains disabled until its administrator explicitly enables it.");
  } finally { await prisma.$disconnect(); }
}

async function control(command: "status" | "stop") {
  const config = await readConfig();
  if (!await exists(controlPath)) { console.log("[trial] stopped"); return; }
  const current = await readControl();
  const response = await fetch(`http://${config.host}:${config.webPort}/__trial/${command}`, {
    method: command === "stop" ? "POST" : "GET", headers: { "x-trial-control": current.secret }, signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`TRIAL_CONTROL_FAILED:${response.status}`);
  console.log(JSON.stringify(await response.json()));
}

async function start() {
  const config = await readConfig();
  const environment = trialServiceEnvironment(config, directory, process.env);
  await assertFree(config.apiPort, config.host); await assertFree(config.webPort, config.host);
  await databaseMarker(config, false);
  const { Client } = requireApi("pg") as { Client: typeof PgClient };
  const clock = new Client({ connectionString: config.databaseUrl });
  await clock.connect();
  try {
    const zone = await clock.query<{ TimeZone: string }>("SHOW TimeZone");
    if (zone.rows[0]?.TimeZone !== "UTC") throw new Error("TRIAL_DATABASE_TIMEZONE_INVALID_RUN_INIT");
  } finally { await clock.end(); }
  const prisma = new PrismaClient({ datasources: { db: { url: config.databaseUrl } } });
  await prisma.$connect();
  try {
    const migrations = await prisma.$queryRaw<Array<{ migration_name: string; finished_at: Date | null }>>`SELECT migration_name,finished_at FROM "_prisma_migrations" WHERE rolled_back_at IS NULL`;
    const { readdir } = await import("node:fs/promises");
    const expected = (await readdir(path.join(root, "prisma/migrations"), { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name);
    if (expected.some(name => !migrations.some(item => item.migration_name === name && item.finished_at))) throw new Error("TRIAL_MIGRATIONS_PENDING_RUN_INIT");
    if (!await prisma.user.findUnique({ where: { tenantId_username: { tenantId: config.tenantId, username: config.username } } })) throw new Error("TRIAL_ACCOUNT_MISSING_RUN_INIT");
  } finally { await prisma.$disconnect(); }
  await run(["apps/web/node_modules/vue-tsc/bin/vue-tsc.js", "--noEmit", "-p", "apps/web/tsconfig.json"], environment);
  await run(["node_modules/vite/bin/vite.js", "build", "apps/web"], { ...environment, VITE_API_BASE: "" });
  const logDirectory = path.join(directory, "logs", new Date().toISOString().replaceAll(":", "-"));
  await mkdir(logDirectory, { recursive: true, mode: 0o700 });
  const processes: Array<{ label: string; child: ChildProcess }> = [];
  let stopping = false;
  let resolveStopped!: () => void;
  const stopped = new Promise<void>(resolve => { resolveStopped = resolve; });
  const secret = randomBytes(32).toString("hex");
  const instanceId = randomUUID();
  function launch(label: string, args: string[]) {
    const log = createWriteStream(path.join(logDirectory, `${label}.log`), { mode: 0o600 });
    const child = spawn(process.execPath, args, { cwd: root, env: environment, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout?.pipe(log, { end: false }); child.stderr?.pipe(log, { end: false });
    const record = { label, child }; processes.push(record);
    child.on("error", () => { process.exitCode = supervisorExitCode(stopping, Number(process.exitCode ?? 0)); if (!stopping) { console.error(`[trial] ${label} failed; see private logs`); void shutdown(); } });
    child.once("exit", () => { log.end(); process.exitCode = supervisorExitCode(stopping, Number(process.exitCode ?? 0)); if (!stopping) { console.error(`[trial] ${label} stopped; see private logs`); void shutdown(); } });
  }
  function assertAlive() {
    if (stopping || processes.some(record => record.child.exitCode !== null || record.child.signalCode !== null)) throw new Error("TRIAL_SERVICE_STOPPED");
  }
  const web = createServer((req, res) => { void serve(req, res).catch(() => { if (!res.headersSent) res.writeHead(500); res.end("Request failed"); }); });
  async function shutdown() {
    if (stopping) return;
    stopping = true;
    if (web.listening) { web.close(); web.closeAllConnections(); }
    for (const { child } of [...processes].reverse()) if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    const deadline = Date.now() + 6000;
    while (processes.some(record => record.child.exitCode === null && record.child.signalCode === null) && Date.now() < deadline) await delay(100);
    for (const { child } of processes) if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
    try { const current = await readControl(); if (current.instanceId === instanceId) await unlink(controlPath); } catch { /* No unrelated persisted PID is signalled. */ }
    resolveStopped();
  }
  async function serve(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", `http://${config.host}:${config.webPort}`);
    if (url.pathname.startsWith("/__trial/")) {
      const received = req.headers["x-trial-control"];
      if (typeof received !== "string" || received.length !== secret.length || !timingSafeEqual(Buffer.from(received), Buffer.from(secret))) { res.writeHead(404); res.end(); return; }
      res.setHeader("Cache-Control", "no-store");
      if (url.pathname === "/__trial/status" && req.method === "GET") {
        res.setHeader("Content-Type", "application/json");
        res.end(JSON.stringify({ instanceId, url: `http://${config.host}:${config.webPort}`, modelMode: "deepseek", visionEnabled: true,
          services: processes.map(record => ({ name: record.label, running: record.child.exitCode === null && record.child.signalCode === null })) }));
      } else if (url.pathname === "/__trial/stop" && req.method === "POST") { res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ stopping: true })); setTimeout(() => { void shutdown(); }, 10); }
      else { res.writeHead(404); res.end(); }
      return;
    }
    if (url.pathname === "/api" || url.pathname.startsWith("/api/")) {
      const upstream = proxyRequest({ host: config.host, port: config.apiPort, method: req.method, path: req.url,
        headers: { ...req.headers, host: `${config.host}:${config.apiPort}` } }, response => {
        res.writeHead(response.statusCode ?? 502, response.headers); response.pipe(res);
        res.once("close", () => response.destroy());
      });
      upstream.on("error", () => { if (!res.headersSent) res.writeHead(502); res.end("API temporarily unavailable"); });
      req.once("aborted", () => upstream.destroy()); req.pipe(upstream); return;
    }
    if (!["GET", "HEAD"].includes(req.method ?? "")) { res.writeHead(405); res.end(); return; }
    const dist = path.join(root, "apps/web/dist");
    const pathname = decodeURIComponent(url.pathname);
    const candidate = path.resolve(dist, "." + pathname);
    if (!candidate.startsWith(dist + path.sep) && candidate !== dist) { res.writeHead(404); res.end(); return; }
    let file = candidate;
    try { if (!(await stat(file)).isFile()) file = path.join(dist, "index.html"); }
    catch { if (pathname.startsWith("/assets/")) { res.writeHead(404); res.end(); return; } file = path.join(dist, "index.html"); }
    const mime: Record<string, string> = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2" };
    res.setHeader("Content-Type", mime[path.extname(file)] ?? "application/octet-stream");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", path.basename(file) === "index.html" ? "no-cache" : "public,max-age=31536000,immutable");
    if (req.method === "HEAD") res.end(); else {
      const stream = createReadStream(file);
      stream.once("error", () => { if (!res.headersSent) res.writeHead(500); res.end("Resource unavailable"); });
      stream.pipe(res);
    }
  }
  process.once("SIGTERM", () => { void shutdown(); }); process.once("SIGINT", () => { void shutdown(); });
  try {
    launch("api", viteArgs("apps/api", "apps/api/src/main.ts"));
    launch("build-worker", viteArgs("apps/worker", "apps/worker/src/run.ts"));
    launch("agent-worker", viteArgs("apps/api", "apps/api/src/run-agent-worker.ts"));
    const deadline = Date.now() + 60000;
    let ready = false;
    while (Date.now() < deadline) {
      assertAlive();
      try { const response = await fetch(`http://${config.host}:${config.apiPort}/api/me`, { signal: AbortSignal.timeout(1500) }); if (response.status === 401) { ready = true; break; } } catch { /* Wait for this run's API. */ }
      await delay(200);
    }
    if (!ready) throw new Error("TRIAL_API_START_TIMEOUT");
    await new Promise<void>((resolve, reject) => { web.once("error", reject); web.listen(config.webPort, config.host, resolve); });
    if (await exists(controlPath)) await unlink(controlPath);
    await privateJson(controlPath, { instanceId, secret });
    assertAlive();
    console.log(`[trial] ready: http://${config.host}:${config.webPort}/login`);
    console.log(`[trial] initial access: ${accessPath}; private logs: ${logDirectory}`);
    await stopped;
  } catch (error) { await shutdown(); throw error; }
}

const command = process.argv.at(-1);
try {
  if (command === "init") await initialize();
  else if (command === "start") await start();
  else if (command === "status" || command === "stop") await control(command);
  else throw new Error("Usage: trial.mts init|start|status|stop");
} catch (error) {
  const message = error instanceof Error ? error.message : "TRIAL_FAILED";
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  console.error("[trial] " + (apiKey ? message.replaceAll(apiKey, "[redacted]") : message));
  process.exitCode = 1;
}
// end
