// Task 2 (browser visual preview): GET /api/artifacts/:id/preview.
// - PreviewService unit tests (mocked prisma) cover the four branches:
//   artifact missing / build job missing / no renderable IR / renders HTML.
// - One HTTP integration describe bootstraps the real AppModule and seeds a
//   built artifact + SUCCEEDED build job + solutionRevision with a
//   kf-client-project-ir/v1 state, then exercises the endpoint contract:
//   200 text/html with page name and control data-type, 401 unauthenticated,
//   cross-tenant 404, and upload-mode (source revision, no IR) 404.
import "reflect-metadata";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@127.0.0.1:5432/kf_agent_test";

import { NotFoundException } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { TenantsService } from "../tenants/tenants.service.js";
import { PreviewService } from "./preview.service.js";

const TENANT_A = { tenant: "Acme Corp", username: "alice", password: "TempPass-123" };
const TENANT_B = { tenant: "Globex", username: "bob", password: "TempPass-123" };

const IR_STATE = {
  schema: "kf-client-project-ir/v1",
  id: "w1",
  name: "监控大屏",
  pages: [
    {
      id: "p1",
      name: "首页",
      width: 1024,
      height: 768,
      controls: [
        { id: "c1", type: "text", x: 20, y: 30, width: 300, height: 40, text: "标题" },
        { id: "c2", type: "button", x: 20, y: 90, width: 120, height: 40, text: "开始运行" },
      ],
    },
  ],
  dependencies: [],
  variables: [],
  globalScripts: [],
};

// ---------------------------------------------------------------------------
// PreviewService unit tests (mocked prisma)
// ---------------------------------------------------------------------------

describe("PreviewService (unit)", () => {
  const TENANT = "tenant-1";
  const ARTIFACT_ID = "artifact-1";

  function makeService(overrides: {
    artifact?: unknown;
    buildJob?: unknown;
    revision?: unknown;
  }): PreviewService {
    const prisma = {
      artifact: { findFirst: vi.fn().mockResolvedValue(overrides.artifact) },
      buildJob: { findFirst: vi.fn().mockResolvedValue(overrides.buildJob) },
      solutionRevision: { findFirst: vi.fn().mockResolvedValue(overrides.revision) },
    };
    return new PreviewService(prisma as unknown as PrismaService);
  }

  it("throws 404 when the artifact is not in the tenant", async () => {
    const service = makeService({ artifact: null });
    await expect(service.render(TENANT, ARTIFACT_ID)).rejects.toThrow(NotFoundException);
  });

  it("throws 404 when the build job is missing", async () => {
    const service = makeService({
      artifact: { id: ARTIFACT_ID, tenantId: TENANT, buildJobId: "job-1" },
      buildJob: null,
    });
    await expect(service.render(TENANT, ARTIFACT_ID)).rejects.toThrow(NotFoundException);
  });

  it("throws 404 when no solution revision has a renderable IR", async () => {
    const service = makeService({
      artifact: { id: ARTIFACT_ID, tenantId: TENANT, buildJobId: "job-1" },
      buildJob: { id: "job-1", tenantId: TENANT, workspaceId: "ws-1", changePlanId: "cp-1" },
      // state is a source-revision summary, not a ClientProjectIR
      revision: {
        id: "rev-1",
        tenantId: TENANT,
        workspaceId: "ws-1",
        changePlanId: "cp-1",
        revisionNumber: 1,
        kind: "source",
        state: { project: { name: "UnknownFieldFixture" } },
      },
    });
    await expect(service.render(TENANT, ARTIFACT_ID)).rejects.toThrow(NotFoundException);
  });

  it("throws 404 when the latest revision has a null state", async () => {
    const service = makeService({
      artifact: { id: ARTIFACT_ID, tenantId: TENANT, buildJobId: "job-1" },
      buildJob: { id: "job-1", tenantId: TENANT, workspaceId: "ws-1", changePlanId: "cp-1" },
      revision: { id: "rev-1", tenantId: TENANT, workspaceId: "ws-1", changePlanId: "cp-1", revisionNumber: 1, kind: "built", state: null },
    });
    await expect(service.render(TENANT, ARTIFACT_ID)).rejects.toThrow(NotFoundException);
  });

  it("renders the ClientProjectIR as HTML with the page name and control types", async () => {
    const service = makeService({
      artifact: { id: ARTIFACT_ID, tenantId: TENANT, buildJobId: "job-1" },
      buildJob: { id: "job-1", tenantId: TENANT, workspaceId: "ws-1", changePlanId: "cp-1" },
      revision: {
        id: "rev-1",
        tenantId: TENANT,
        workspaceId: "ws-1",
        changePlanId: "cp-1",
        revisionNumber: 1,
        kind: "built",
        state: IR_STATE,
      },
    });
    const html = await service.render(TENANT, ARTIFACT_ID);
    expect(html.startsWith("<!DOCTYPE html>")).toBe(true);
    expect(html).toContain("监控大屏");
    expect(html).toContain("首页");
    expect(html).toContain('data-type="text"');
    expect(html).toContain('data-type="button"');
    expect(html).toContain("开始运行");
    expect(html).not.toContain("<script");
  });
});

// ---------------------------------------------------------------------------
// HTTP integration: real AppModule + seeded built artifact
// ---------------------------------------------------------------------------

let app: INestApplication;
let server: ReturnType<INestApplication["getHttpServer"]>;
let prisma: PrismaService;
let tenants: TenantsService;
let counter = 0;

const TABLES = [
  "DownloadToken",
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
  server = app.getHttpServer();
  prisma = moduleRef.get(PrismaService);
  tenants = moduleRef.get(TenantsService);
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

async function login(user: { tenant: string; username: string; password: string }): Promise<string> {
  const res = await request(server)
    .post("/api/auth/login")
    .send({ tenant: user.tenant, username: user.username, password: user.password })
    .expect(200);
  const loginCookies = (res.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
  let cookie = (loginCookies[0] ?? "").split(";")[0] as string;
  if (res.body.mustChangePassword === true) {
    const changeRes = await request(server)
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: user.password, newPassword: user.password })
      .expect(200);
    const changeCookies = (changeRes.headers["set-cookie"] as unknown as string[] | undefined) ?? [];
    cookie = (changeCookies[0] ?? "").split(";")[0] as string;
  }
  return cookie;
}

async function tenantIdOf(tenantName: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { name: tenantName } });
  return tenant!.id;
}

/** Seeds a workspace + SUCCEEDED build job + solutionRevision + artifact. */
async function seedBuiltArtifact(
  tenantId: string,
  opts: { mode?: string; state?: unknown } = {},
): Promise<string> {
  counter += 1;
  const ws = await prisma.solutionWorkspace.create({
    data: {
      tenantId,
      name: `Preview WS ${Date.now()}-${counter}`,
      mode: opts.mode ?? "new",
    },
  });
  const plan = await prisma.changePlan.create({
    data: {
      tenantId,
      workspaceId: ws.id,
      planHash: "0".repeat(64),
      plan: {
        schema: "kf-change-plan/v1",
        workspaceId: ws.id,
        operations: [
          { op: "update", entityId: "c1", entityType: "text", changes: [{ path: "/text", value: "标题" }] },
        ],
      },
    },
  });
  const job = await prisma.buildJob.create({
    data: {
      tenantId,
      workspaceId: ws.id,
      baseRevisionId: `base-${counter}`,
      changePlanId: plan.id,
      planHash: plan.planHash,
      domainKind: "kingclient",
      idempotencyKey: `idem-preview-${Date.now()}-${counter}`,
      status: "SUCCEEDED",
    },
  });
  await prisma.solutionRevision.create({
    data: {
      tenantId,
      workspaceId: ws.id,
      changePlanId: plan.id,
      revisionNumber: 1,
      kind: "built",
      state: (opts.state ?? IR_STATE) as never,
    },
  });
  const artifact = await prisma.artifact.create({
    data: {
      tenantId,
      buildJobId: job.id,
      kind: "client-package",
      storageKey: `storage-key-${counter}`,
      sizeBytes: 12,
      sha256: "a".repeat(64),
    },
  });
  return artifact.id;
}

describe("preview endpoint (integration)", () => {
  it("serves rendered HTML for a built artifact to its tenant (200 text/html)", async () => {
    const cookie = await login(TENANT_A);
    const acmeId = await tenantIdOf(TENANT_A.tenant);
    const artifactId = await seedBuiltArtifact(acmeId);

    const res = await request(server)
      .get(`/api/artifacts/${artifactId}/preview`)
      .set("Cookie", cookie)
      .expect(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.headers["content-type"]).toContain("charset=utf-8");
    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.text).toContain("监控大屏");
    expect(res.text).toContain("首页");
    expect(res.text).toContain('data-type="text"');
    expect(res.text).toContain('data-type="button"');
    expect(res.text).not.toContain("<script");
  });

  it("rejects unauthenticated requests with 401", async () => {
    const acmeId = await tenantIdOf(TENANT_A.tenant);
    const artifactId = await seedBuiltArtifact(acmeId);
    await request(server).get(`/api/artifacts/${artifactId}/preview`).expect(401);
  });

  it("returns 404 when the artifact belongs to another tenant", async () => {
    const acmeId = await tenantIdOf(TENANT_A.tenant);
    const artifactId = await seedBuiltArtifact(acmeId);
    const bobCookie = await login(TENANT_B);
    await request(server)
      .get(`/api/artifacts/${artifactId}/preview`)
      .set("Cookie", bobCookie)
      .expect(404);
  });

  it("returns 404 for upload-mode artifacts with no renderable IR", async () => {
    const cookie = await login(TENANT_A);
    const acmeId = await tenantIdOf(TENANT_A.tenant);
    // Upload-mode build: the latest revision carries a source summary, not a
    // ClientProjectIR, so the preview cannot render.
    const artifactId = await seedBuiltArtifact(acmeId, {
      mode: "upload",
      state: { project: { name: "UnknownFieldFixture" } },
    });
    await request(server)
      .get(`/api/artifacts/${artifactId}/preview`)
      .set("Cookie", cookie)
      .expect(404);
  });
});
