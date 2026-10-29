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
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppModule } from "../app.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { SessionService, SESSION_COOKIE_NAME } from "../auth/session.service.js";
import { DeterministicFakeModelPort } from "../conversations/fake-model.js";
import { MODEL_PORT } from "../conversations/model-port.js";

let app: INestApplication;
let prisma: PrismaService;
let cookie: string;
let conversationId: string;
let tenantId: string;
beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MODEL_PORT).useValue(new DeterministicFakeModelPort()).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  prisma = app.get(PrismaService);
  const tenant = await prisma.tenant.create({ data: { name: `retired-routes-${randomUUID()}` } });
  tenantId = tenant.id;
  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  process.env.AGENT_RUNS_V2 = "true";
  process.env.AGENT_WORKBENCH_V2 = "true";
  process.env.AGENT_FEATURE_TENANT_ALLOWLIST = tenantId;
  // end
  const user = await prisma.user.create({ data: { tenantId, username: `retired-${randomUUID()}`, passwordHash: "session-only-test", role: "tenant_admin", mustChangePassword: false } });
  const session = await app.get(SessionService).createSession(user.id);
  cookie = `${SESSION_COOKIE_NAME}=${session.token}`;
  const workspace = await request(app.getHttpServer()).post("/api/workspaces").set("Cookie", cookie).send({ name: "Single execution entry" }).expect(201);
  const conversation = await request(app.getHttpServer()).post("/api/conversations").set("Cookie", cookie).send({ workspaceId: workspace.body.id }).expect(201);
  conversationId = conversation.body.id as string;
}, 30000);
afterAll(async () => { await app?.close(); });

describe("single durable execution entry", () => {
  // 重新注册旧写入口会使本测试失败；404 不能留下消息、作业或执行记录。
  it.each(["messages", "resume"])("retires POST %s without graph side effects", async path => {
    const before = {
      messages: await prisma.message.count({ where: { tenantId } }),
      builds: await prisma.buildJob.count({ where: { tenantId } }),
      runs: await prisma.agentRun.count({ where: { tenantId } }),
    };
    for (const authenticated of [true, false]) {
      const call = request(app.getHttpServer()).post(`/api/conversations/${conversationId}/${path}`);
      if (authenticated) call.set("Cookie", cookie);
      await call.send(path === "messages" ? { content: "查看工程" } : { action: "cancel", planHash: "retired" }).expect(404);
    }
    expect({
      messages: await prisma.message.count({ where: { tenantId } }),
      builds: await prisma.buildJob.count({ where: { tenantId } }),
      runs: await prisma.agentRun.count({ where: { tenantId } }),
    }).toEqual(before);
  });

  it("still queues a run and reads messages through the supported APIs", async () => {
    const response = await request(app.getHttpServer()).post(`/api/conversations/${conversationId}/runs`)
      .set("Cookie", cookie).set("Origin", "http://localhost:5174")
      .send({ clientRequestId: randomUUID(), clientMessageId: randomUUID(), mode: "discuss", action: { type: "message", text: "保留会话查询" } }).expect(202);
    expect(response.body).toMatchObject({ status: "QUEUED", conversationId });
    const messages = await request(app.getHttpServer()).get(`/api/conversations/${conversationId}/messages`).set("Cookie", cookie).expect(200);
    expect(messages.body).toEqual(expect.arrayContaining([expect.objectContaining({ content: "保留会话查询", runId: response.body.id })]));
  });
});
// end
