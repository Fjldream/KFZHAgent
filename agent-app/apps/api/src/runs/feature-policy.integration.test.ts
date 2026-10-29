// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import "reflect-metadata";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
assertSafeTestDatabase({ url: process.env.DATABASE_URL, allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET, expectedPrefix: "kf_agent_test_" });
process.env.KF_SERVER_PLAN_HMAC_KEY_BASE64 = Buffer.alloc(32, 0x62).toString("base64");
process.env.AGENT_ALLOWED_ORIGINS = "http://localhost:5174";

import { Test } from "@nestjs/testing";
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SessionService, SESSION_COOKIE_NAME } from "../auth/session.service.js";
import { DeterministicFakeModelPort } from "../conversations/fake-model.js";
import { MODEL_PORT } from "../conversations/model-port.js";
import { ConversationService } from "../conversations/conversation.service.js";
import { PrismaRunStore } from "./run-store.js";
import { PrismaRunStepStore } from "./run-step-store.js";
import { RunExecutionService } from "./run-execution.service.js";
import { createRunHandlerRegistry } from "./run-handler-registry.js";
import type { GraphLike } from "./run-graph-runner.js";

let app: INestApplication;
let prisma: PrismaService;
let cookie: string;
let tenantId: string;
let otherCookie: string;
let otherWorkspaceId: string;
let workspaceId: string;
let conversationId: string;
let storageRoot: string | undefined;
const flagNames = ["AGENT_RUNS_V2", "AGENT_WORKBENCH_V2", "AGENT_FEATURE_TENANT_ALLOWLIST", "AGENT_USAGE_V2", "AGENT_VISION_V1", "AGENT_REGIONAL_EDIT_V1", "AGENT_NATIVE_VERIFY_V1", "AGENT_PROMPT_V2"];
beforeAll(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), "kf-run-policy-"));
  process.env.ARTIFACT_STORAGE_ROOT = storageRoot;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(MODEL_PORT).useValue(new DeterministicFakeModelPort()).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  prisma = app.get(PrismaService);
  const tenant = await prisma.tenant.create({ data: { name: `feature-policy-${randomUUID()}` } });
  tenantId = tenant.id;
  const user = await prisma.user.create({ data: { tenantId, username: `feature-${randomUUID()}`, passwordHash: "session-only-test", role: "tenant_admin", mustChangePassword: false } });
  const session = await app.get(SessionService).createSession(user.id);
  cookie = `${SESSION_COOKIE_NAME}=${session.token}`;
  const workspace = await request(app.getHttpServer()).post("/api/workspaces").set("Cookie", cookie).send({ name: "Feature admission" }).expect(201);
  workspaceId = workspace.body.id as string;
  const otherTenant = await prisma.tenant.create({ data: { name: `feature-other-${randomUUID()}` } });
  const otherUser = await prisma.user.create({ data: { tenantId: otherTenant.id, username: `other-${randomUUID()}`, passwordHash: "session-only-test", role: "tenant_admin", mustChangePassword: false } });
  const otherSession = await app.get(SessionService).createSession(otherUser.id);
  otherCookie = `${SESSION_COOKIE_NAME}=${otherSession.token}`;
  const otherWorkspace = await request(app.getHttpServer()).post("/api/workspaces").set("Cookie", otherCookie).send({ name: "Not enabled tenant" }).expect(201);
  otherWorkspaceId = otherWorkspace.body.id as string;
}, 30000);
beforeEach(async () => {
  for (const name of flagNames) vi.stubEnv(name, undefined);
  const response = await request(app.getHttpServer()).post("/api/conversations").set("Cookie", cookie).send({ workspaceId }).expect(201);
  conversationId = response.body.id as string;
});
afterEach(async () => {
  await prisma.agentRun.updateMany({ where: { tenantId, status: "QUEUED" }, data: { status: "CANCELLED" } });
  vi.unstubAllEnvs();
});
afterAll(async () => {
  await app?.close();
  if (storageRoot) await rm(storageRoot, { recursive: true, force: true });
});

const enable = () => {
  vi.stubEnv("AGENT_RUNS_V2", "true");
  vi.stubEnv("AGENT_WORKBENCH_V2", "true");
  vi.stubEnv("AGENT_FEATURE_TENANT_ALLOWLIST", tenantId);
};
const body = () => ({ clientRequestId: randomUUID(), clientMessageId: randomUUID(), mode: "discuss", action: { type: "message", text: "讨论现有工程" } });
const start = (input: object) => request(app.getHttpServer()).post(`/api/conversations/${conversationId}/runs`).set("Cookie", cookie).set("Origin", "http://localhost:5174").send(input);
const config = () => request(app.getHttpServer()).get("/api/v2/workbench-config").set("Cookie", cookie);

describe("server-owned run admission", () => {
  it("protects the config endpoint with a session", async () => {
    await request(app.getHttpServer()).get("/api/v2/workbench-config").expect(401);
  });
  it("prevents shared caches from reusing another session's effective config", async () => {
    const response = await config().expect(200);
    expect(response.headers["cache-control"]).toContain("no-store");
    expect(response.headers["vary"]).toContain("Cookie");
  });
  it("defaults to disabled and ignores browser-supplied permissions without writing messages", async () => {
    const response = await config().expect(200);
    expect(response.body).toMatchObject({ flags: { agentRunsV2: false, agentWorkbenchV2: false, agentVisionV1: false, budgetGuard: false }, imagePolicy: "disabled", outboundImagesAllowed: false });
    await start({ ...body(), flags: { agentRunsV2: true }, configSnapshot: { enabled: true }, tenantId }).expect(403);
    expect(await prisma.message.count({ where: { conversationId } })).toBe(0);
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(0);
  });
  it("enforces the same admission policy at the storage boundary without a facade-supplied snapshot", async () => {
    const user = await prisma.user.findFirstOrThrow({ where: { tenantId } });
    await expect(new PrismaRunStore(prisma).create({ tenantId, userId: user.id, conversationId,
      ...body(), mode: "discuss", action: { type: "message", text: "不能绕过准入" }, attachmentIds: [],
    })).rejects.toThrow("FEATURE_NOT_ENABLED");
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(0);
  });
  it("requires an exact tenant allowlist and never returns that private list", async () => {
    enable();
    vi.stubEnv("AGENT_FEATURE_TENANT_ALLOWLIST", `${tenantId}-suffix`);
    expect((await config().expect(200)).body.flags.agentRunsV2).toBe(false);
    await start(body()).expect(403);
    vi.stubEnv("AGENT_FEATURE_TENANT_ALLOWLIST", ` other-tenant, ${tenantId} `);
    const enabled = await config().expect(200);
    expect(enabled.body.flags).toMatchObject({ agentRunsV2: true, agentWorkbenchV2: true });
    expect(JSON.stringify(enabled.body)).not.toContain(tenantId);
    expect(JSON.stringify(enabled.body)).not.toContain("other-tenant");
    await start(body()).expect(202);
  });
  it("derives feature access from the authenticated tenant, not a body tenant or workspace ID", async () => {
    enable();
    const response = await request(app.getHttpServer()).get("/api/v2/workbench-config").set("Cookie", otherCookie).expect(200);
    expect(response.body.flags.agentRunsV2).toBe(false);
    const otherConversation = await request(app.getHttpServer()).post("/api/conversations").set("Cookie", otherCookie).send({ workspaceId: otherWorkspaceId }).expect(201);
    await request(app.getHttpServer()).post(`/api/conversations/${otherConversation.body.id}/runs`).set("Cookie", otherCookie).set("Origin", "http://localhost:5174")
      .send({ ...body(), tenantId, flags: { agentRunsV2: true } }).expect(403);
    await request(app.getHttpServer()).post(`/api/conversations/${conversationId}/runs`).set("Cookie", otherCookie).set("Origin", "http://localhost:5174").send(body()).expect(404);
    expect(await prisma.agentRun.count({ where: { workspaceId: otherWorkspaceId } })).toBe(0);
  });
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  it("exposes the implemented image rollout without granting tenant egress or weakening text admission", async () => {
    enable();
    vi.stubEnv("AGENT_VISION_V1", "true");
    const response = await config().expect(200);
    expect(response.body).toMatchObject({ flags: { agentRunsV2: true, agentWorkbenchV2: true, agentVisionV1: true },
      imagePolicy: "explicit-consent", outboundImagesAllowed: true });
    expect((await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).imageEgressAllowed).toBe(false);
    const accepted = await start(body()).expect(202);
    const run = await prisma.agentRun.findUniqueOrThrow({ where: { id: accepted.body.id } });
    expect(run.configSnapshot).toMatchObject({ planVersion: "run-plan@6", flags: { agentVisionV1: true } });
    expect((await request(app.getHttpServer()).get("/api/v2/workbench-config").set("Cookie", otherCookie).expect(200)).body.flags.agentVisionV1).toBe(false);
    vi.stubEnv("AGENT_VISION_V1", "false");
    expect((await config().expect(200)).body.flags.agentVisionV1).toBe(false);
    expect((await start(body()).expect(202)).body.status).toBe("QUEUED");
  });
  // end
  it.each([
    { name: "AGENT_RUNS_V2", value: "yes" },
    { name: "AGENT_RUNS_V2", value: "false" },
    { name: "AGENT_FEATURE_TENANT_ALLOWLIST", value: "*" },
    // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
    { name: "AGENT_NATIVE_VERIFY_V1", value: "true" },
    // end
  ])("fails closed for unsupported configuration $name=$value", async ({ name, value }) => {
    enable(); vi.stubEnv(name, value);
    const response = await config().expect(200);
    expect(response.body.flags).toMatchObject({ agentRunsV2: false, agentWorkbenchV2: false, agentVisionV1: false });
    expect(response.body.outboundImagesAllowed).toBe(false);
    await start(body()).expect(403);
  });
  it("freezes accepted config and replays idempotently after disabling without admitting new work", async () => {
    enable();
    const input = body();
    const accepted = await start(input).expect(202);
    const saved = await prisma.agentRun.findUniqueOrThrow({ where: { id: accepted.body.id as string } });
    expect(saved.configSnapshot).toMatchObject({ schemaVersion: 1, planVersion: "run-plan@6", flags: { agentRunsV2: true, budgetGuard: false } });
    vi.stubEnv("AGENT_RUNS_V2", "false");
    expect((await start(input).expect(202)).body.id).toBe(accepted.body.id);
    await start(body()).expect(403);
    expect((await prisma.agentRun.findUniqueOrThrow({ where: { id: saved.id } })).configSnapshot).toEqual(saved.configSnapshot);
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
    const store = new PrismaRunStore(prisma);
    const lease = await store.claim("feature-drain", tenantId, new Date());
    expect(lease?.runId).toBe(saved.id);
    const conversations = app.get(ConversationService);
    const service = new RunExecutionService({ prisma, store, steps: new PrismaRunStepStore(prisma), handlers: createRunHandlerRegistry({ prisma,
      loadGraph: async () => await conversations.getGraph() as unknown as GraphLike,
      acquireTurn: id => conversations.acquireRunTurn(id), registerMemo: (id, memo) => conversations.registerRunMemo(id, memo),
    }) });
    expect((await service.executeLease(lease!, new AbortController().signal)).status).toBe("SUCCEEDED");
    await request(app.getHttpServer()).get(`/api/runs/${saved.id}`).set("Cookie", cookie).expect(200);
    await request(app.getHttpServer()).get(`/api/runs/${saved.id}/events`).set("Cookie", cookie).expect(200);
    await request(app.getHttpServer()).post(`/api/conversations/${conversationId}/messages`).set("Cookie", cookie).send({ content: "不能回落旧接口" }).expect(404);
  }, 30000);
  it("blocks new retries while disabled but keeps cancellation available", async () => {
    enable();
    const accepted = await start(body()).expect(202);
    await prisma.agentRun.update({ where: { id: accepted.body.id as string }, data: { status: "FAILED", failureCode: "BUILD_FAILED" } });
    vi.stubEnv("AGENT_RUNS_V2", "false");
    const retry = request(app.getHttpServer()).post(`/api/runs/${accepted.body.id}/retry`).set("Cookie", cookie).set("Origin", "http://localhost:5174").send({ clientRequestId: randomUUID() });
    await retry.expect(403);
    await request(app.getHttpServer()).post(`/api/runs/${accepted.body.id}/cancel`).set("Cookie", cookie).set("Origin", "http://localhost:5174").expect(200);
    expect(await prisma.agentRun.count({ where: { conversationId } })).toBe(1);
  });
});
// end
