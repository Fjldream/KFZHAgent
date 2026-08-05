// @ts-nocheck -- Brief Step 2 的认证测试代码逐字保留（JS 风格，无类型标注），
// 因此本文件关闭类型检查，但 ESLint 静态规则与运行时断言仍然生效。
import "reflect-metadata";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@127.0.0.1:5432/kf_agent_test";

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../app.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PasswordService } from "./password.service.js";
import { TenantsService } from "../tenants/tenants.service.js";

const PLATFORM = { tenant: "KF Platform", username: "root", password: "TempPass-123" };
const TENANT_A = { tenant: "Acme Corp", username: "alice", password: "TempPass-123" };
const TENANT_B = { tenant: "Globex", username: "bob", password: "TempPass-123" };

let app: INestApplication;
let prisma: PrismaService;
let tenants: TenantsService;
let passwords: PasswordService;

const TABLES = [
  "AuditLog",
  "ValidationReport",
  "Artifact",
  "BuildJob",
  "DomainProjectRevision",
  "SolutionRevision",
  "ChangePlan",
  "ChangeRequest",
  "Message",
  "Conversation",
  "SolutionWorkspace",
  "UserSession",
  "User",
  "Tenant",
];

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  prisma = moduleRef.get(PrismaService);
  tenants = moduleRef.get(TenantsService);
  passwords = moduleRef.get(PasswordService);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
});

async function resetDatabase(): Promise<void> {
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
}

async function seedDatabase(): Promise<void> {
  const platformHash = await passwords.hash(PLATFORM.password);
  const platformTenant = await prisma.tenant.create({
    data: { name: PLATFORM.tenant },
  });
  await prisma.user.create({
    data: {
      tenantId: platformTenant.id,
      username: PLATFORM.username,
      passwordHash: platformHash,
      role: "platform_admin",
      mustChangePassword: true,
    },
  });
  await tenants.createTenantWithAdmin({
    name: TENANT_A.tenant,
    username: TENANT_A.username,
    temporaryPassword: TENANT_A.password,
  });
  await tenants.createTenantWithAdmin({
    name: TENANT_B.tenant,
    username: TENANT_B.username,
    temporaryPassword: TENANT_B.password,
  });
}

beforeEach(async () => {
  await resetDatabase();
  await seedDatabase();
});

async function loginWithTemporaryPassword(
  appInstance: INestApplication,
  seededUser: { tenant: string; username: string; password: string },
): Promise<string> {
  const res = await request(appInstance.getHttpServer())
    .post("/api/auth/login")
    .send({
      tenant: seededUser.tenant,
      username: seededUser.username,
      password: seededUser.password,
    })
    .expect(200);
  let cookie = (res.headers["set-cookie"] as unknown as string[])[0].split(";")[0] as string;
  if (res.body.mustChangePassword === true) {
    // I2: 首次登录会话是受限会话；激活（改密）后拿完整会话。
    const changeRes = await request(appInstance.getHttpServer())
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: seededUser.password, newPassword: seededUser.password })
      .expect(200);
    cookie = (changeRes.headers["set-cookie"] as unknown as string[])[0].split(";")[0] as string;
  }
  return cookie;
}

async function tenantIdOf(tenantName: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { name: tenantName } });
  return tenant!.id;
}

describe("auth integration", () => {
  it("logs in with a temporary password and forces a first password change", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({
        tenant: TENANT_A.tenant,
        username: TENANT_A.username,
        password: TENANT_A.password,
      })
      .expect(200);
    expect(res.body.user.username).toBe(TENANT_A.username);
    expect(res.body.user.role).toBe("tenant_admin");
    expect(res.body.mustChangePassword).toBe(true);

    // A session with mustChangePassword still sees the flag on /api/me.
    const setCookie = (res.headers["set-cookie"] as unknown as string[])[0];
    const cookie = setCookie.split(";")[0] as string;
    const me = await request(app.getHttpServer())
      .get("/api/me")
      .set("Cookie", cookie)
      .expect(200);
    expect(me.body.mustChangePassword).toBe(true);

    // I2: 受限会话不能操作工作区，直到完成首次改密。
    await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("Cookie", cookie)
      .send({ name: "Blocked Before Password Change" })
      .expect(403);

    // First password change clears the mandatory flag and issues a FULL
    // session (fresh cookie) so no second login is needed.
    const changed = await request(app.getHttpServer())
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: TENANT_A.password, newPassword: "NewPass-456" })
      .expect(200);
    expect(changed.body.mustChangePassword).toBe(false);
    const fullCookie = (changed.headers["set-cookie"] as unknown as string[])[0].split(";")[0];
    const meAfter = await request(app.getHttpServer())
      .get("/api/me")
      .set("Cookie", fullCookie)
      .expect(200);
    expect(meAfter.body.mustChangePassword).toBe(false);

    // The full session can now operate the workspace.
    await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("Cookie", fullCookie)
      .send({ name: "Workspace After Password Change" })
      .expect(201);

    // Re-login with the new password is a normal (non-forced) login.
    const relogin = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({
        tenant: TENANT_A.tenant,
        username: TENANT_A.username,
        password: "NewPass-456",
      })
      .expect(200);
    expect(relogin.body.mustChangePassword).toBe(false);
  });

  it("stores only an Argon2id hash and verifies passwords with Argon2id", async () => {
    const user = await prisma.user.findFirst({
      where: { username: TENANT_A.username, tenant: { name: TENANT_A.tenant } },
    });
    expect(user).not.toBeNull();
    expect(user!.passwordHash.startsWith("$argon2id$")).toBe(true);
    expect(user!.passwordHash).not.toContain(TENANT_A.password);
    const valid = await passwords.verify(TENANT_A.password, user!.passwordHash);
    const invalid = await passwords.verify("wrong-password", user!.passwordHash);
    expect(valid).toBe(true);
    expect(invalid).toBe(false);
  });

  it("sets HttpOnly Secure SameSite session cookies", async () => {
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({
        tenant: TENANT_A.tenant,
        username: TENANT_A.username,
        password: TENANT_A.password,
      })
      .expect(200);
    const setCookie = res.headers["set-cookie"] as unknown as string[];
    expect(setCookie).toBeDefined();
    const joined = setCookie.join(";");
    expect(joined).toContain("HttpOnly");
    expect(joined).toContain("Secure");
    expect(joined).toContain("SameSite=Strict");
    expect(joined).toContain("Path=/");
  });

  it("revokes prior sessions after a password change", async () => {
    const cookie = await loginWithTemporaryPassword(app, TENANT_A);
    await request(app.getHttpServer())
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: "TempPass-123", newPassword: "NewPass-456" })
      .expect(200);
    await request(app.getHttpServer())
      .get("/api/me")
      .set("Cookie", cookie)
      .expect(401);
  });

  it("locks the account after repeated failed logins", async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      await request(app.getHttpServer())
        .post("/api/auth/login")
        .send({
          tenant: TENANT_A.tenant,
          username: TENANT_A.username,
          password: "wrong-password",
        })
        .expect(401);
    }
    // Even the correct password is rejected while locked.
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({
        tenant: TENANT_A.tenant,
        username: TENANT_A.username,
        password: TENANT_A.password,
      })
      .expect(401);
    const user = await prisma.user.findFirst({
      where: { username: TENANT_A.username, tenant: { name: TENANT_A.tenant } },
    });
    expect(user!.lockedUntil).not.toBeNull();
  });

  it("rejects cross-tenant object lookups with 404 to prevent enumeration", async () => {
    const cookieA = await loginWithTemporaryPassword(app, TENANT_A);
    const cookieB = await loginWithTemporaryPassword(app, TENANT_B);

    const created = await request(app.getHttpServer())
      .post("/api/workspaces")
      .set("Cookie", cookieA)
      .send({ name: "Alice Workspace" })
      .expect(201);
    const workspaceId = created.body.id;
    expect(created.body.tenantId).toBe(await tenantIdOf(TENANT_A.tenant));

    // Owner tenant can read its own workspace.
    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}`)
      .set("Cookie", cookieA)
      .expect(200);

    // A different tenant gets a 404, not a 403, for the same resource id.
    await request(app.getHttpServer())
      .get(`/api/workspaces/${workspaceId}`)
      .set("Cookie", cookieB)
      .expect(404);
  });

  it("lets a platform admin provision a tenant with a one-time password", async () => {
    const cookie = await loginWithTemporaryPassword(app, PLATFORM);
    const res = await request(app.getHttpServer())
      .post("/api/tenants")
      .set("Cookie", cookie)
      .send({ name: "NewCo", username: "newadmin", temporaryPassword: "OneTimePass-123" })
      .expect(201);
    expect(res.body.tenantName).toBe("NewCo");
    expect(res.body.role).toBe("tenant_admin");

    // The one-time password signs in the first tenant admin (forced change).
    const login = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({ tenant: "NewCo", username: "newadmin", password: "OneTimePass-123" })
      .expect(200);
    expect(login.body.mustChangePassword).toBe(true);
  });

  it("lets a tenant admin create members only inside their own tenant", async () => {
    const cookieA = await loginWithTemporaryPassword(app, TENANT_A);
    const acmeId = await tenantIdOf(TENANT_A.tenant);
    const created = await request(app.getHttpServer())
      .post(`/api/tenants/${acmeId}/members`)
      .set("Cookie", cookieA)
      .send({ username: "carol", password: "CarolPass-123" })
      .expect(201);
    expect(created.body.tenantId).toBe(acmeId);
    expect(created.body.role).toBe("member");
    expect(created.body.mustChangePassword).toBe(true);

    // The new member can log in with the assigned password.
    await request(app.getHttpServer())
      .post("/api/auth/login")
      .set("Cookie", "")
      .send({ tenant: TENANT_A.tenant, username: "carol", password: "CarolPass-123" })
      .expect(200);

    // An admin from another tenant is forbidden from creating members here.
    const cookieB = await loginWithTemporaryPassword(app, TENANT_B);
    await request(app.getHttpServer())
      .post(`/api/tenants/${acmeId}/members`)
      .set("Cookie", cookieB)
      .send({ username: "mallory", password: "MalloryPass-123" })
      .expect(403);
  });

  it("has no public registration route", async () => {
    await request(app.getHttpServer())
      .post("/api/auth/register")
      .send({ username: "nobody", password: "NeverPass-123" })
      .expect(404);
  });

  it("rejects requests without a valid session", async () => {
    await request(app.getHttpServer())
      .get("/api/me")
      .set("Cookie", "kf_session=not-a-real-token")
      .expect(401);
    await request(app.getHttpServer())
      .post("/api/tenants")
      .send({ name: "Sneaky", username: "x", temporaryPassword: "OneTimePass-123" })
      .expect(401);
  });

  it("returns the same unified error for an unknown username (I4)", async () => {
    // 未知用户名路径执行 dummy Argon2 verify 后抛出与已知用户相同的
    // "Invalid credentials"，避免通过响应差异枚举用户名。
    const res = await request(app.getHttpServer())
      .post("/api/auth/login")
      .send({
        tenant: TENANT_A.tenant,
        username: "ghost-user",
        password: "Whatever-123",
      })
      .expect(401);
    expect(res.body.message).toBe("Invalid credentials");
  });
});
