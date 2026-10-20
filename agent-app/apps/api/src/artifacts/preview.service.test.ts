// 任务2（浏览器预览）：GET /api/artifacts/:id/preview. - PreviewService单元测试（mocked存储）覆盖错误分支和渲染路径，使用真实编译的KF容器描述。- HTTP集成描述了启动真实AppModule，将真实Artifact容器种子到测试存储中，然后测试端点合同：200文本/HTML，页面名称和控制数据类型，401未认证，跨租户404。
import "reflect-metadata";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@127.0.0.1:5432/kf_agent_test";
process.env.KF_SERVER_PLAN_HMAC_KEY_BASE64 ??= Buffer.alloc(32, 0x54).toString("base64");
import { NotFoundException } from "@nestjs/common";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { Readable } from "node:stream";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { compileClientProject, packageNativeClientProject } from "@kf/domain-client";
import type { ArtifactStorage } from "@kf/artifact-storage";
import { AppModule } from "../app.module.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { TenantsService } from "../tenants/tenants.service.js";
import { ARTIFACT_STORAGE } from "./artifact-storage.js";
import { PreviewService } from "./preview.service.js";

const TENANT_A = { tenant: "Acme Corp", username: "alice", password: "TempPass-123" };
const TENANT_B = { tenant: "Globex", username: "bob", password: "TempPass-123" };
const TENANT = "tenant-a";
const ARTIFACT_ID = "artifact-1";

/** 编译一个最小 KF 容器（1 页 2 控件）作为真实预览数据源。 */
async function buildRealContainer(): Promise<Buffer> {
  const ir = {
    schema: "kf-client-project-ir/v1" as const,
    id: "w1",
    name: "监控大屏",
    pages: [
      {
        id: "p1",
        name: "首页",
        width: 1024,
        height: 768,
        controls: [
          { id: "t1", type: "text" as const, x: 20, y: 30, width: 300, height: 40, text: "生产车间实时监控" },
          { id: "b1", type: "button" as const, x: 20, y: 90, width: 120, height: 40, text: "开始运行" },
        ],
      },
    ],
    dependencies: [],
    variables: [],
    globalScripts: [],
  };
  const ws = await compileClientProject(ir, { seed: "w1" });
  return Buffer.from(await packageNativeClientProject(ws.rootDir));
}

describe("PreviewService (unit)", () => {
  function makeService(open: () => Promise<NodeJS.ReadableStream>): PreviewService {
    const prisma = {
      artifact: { findFirst: async () => ({ id: ARTIFACT_ID, tenantId: TENANT, storageKey: "sk-1" }) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any;
    const storage = { open } as unknown as ArtifactStorage;
    return new PreviewService(prisma, storage, { assertArtifactDeliverable: async () => {} } as never);
  }

  it("throws 404 when the artifact row is missing", async () => {
    const prisma = { artifact: { findFirst: async () => null } } as never;
    const storage = { open: async () => Readable.from([]) } as unknown as ArtifactStorage;
    const service = new PreviewService(prisma, storage, { assertArtifactDeliverable: async () => {} } as never);
    await expect(service.render(TENANT, ARTIFACT_ID)).rejects.toThrow(NotFoundException);
  });

  it("throws 404 when the artifact cannot be opened in storage", async () => {
    const service = makeService(() => Promise.reject(new Error("ENOENT")));
    await expect(service.render(TENANT, ARTIFACT_ID)).rejects.toThrow(NotFoundException);
  });

  it("renders the compiled container as HTML with pages and controls", async () => {
    const bytes = await buildRealContainer();
    const service = makeService(() => Promise.resolve(Readable.from([bytes])));
    const html = await service.render(TENANT, ARTIFACT_ID);
    expect(html).toContain("生产车间实时监控");
    expect(html).toContain('data-type="text"');
    expect(html).toContain("开始运行");
    expect(html).not.toContain("<script");
  });
});

describe("preview endpoint (integration)", () => {
  let app: INestApplication;
  let server: ReturnType<INestApplication["getHttpServer"]>;
  let prisma: PrismaService;
  let tenants: TenantsService;
  let storage: ArtifactStorage;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    server = app.getHttpServer();
    prisma = moduleRef.get(PrismaService);
    tenants = moduleRef.get(TenantsService);
    storage = moduleRef.get(ARTIFACT_STORAGE);
  });

  afterAll(async () => {
    await prisma.$disconnect();
    await app.close();
  });

  const TABLES = [
    "DownloadToken", "AuditLog", "ValidationReport", "Artifact", "BuildJob",
    "DomainProjectRevision", "SolutionRevision", "ChangePlan",
    "SolutionWorkspace", "Conversation", "Message", "User", "Tenant",
  ] as const;

  beforeEach(async () => {
    // 清业务表 + 租户（重建种子）
    for (const table of TABLES) {
      await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
    }
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
  });

  async function login(user: { tenant: string; username: string; password: string }): Promise<string> {
    const res = await request(server)
      .post("/api/auth/login")
      .send({ tenant: user.tenant, username: user.username, password: user.password })
      .expect(200);
    let cookie = ((res.headers["set-cookie"] as unknown as string[] | undefined) ?? [])[0]?.split(";")[0] as string;
    if (res.body.mustChangePassword === true) {
      // 首次登录会话受限：用同一密码完成强制改密换取完整会话。
      await request(server)
        .post("/api/auth/change-password")
        .set("Cookie", cookie)
        .send({ currentPassword: user.password, newPassword: user.password })
        .expect(200);
      const res2 = await request(server)
        .post("/api/auth/login")
        .send({ tenant: user.tenant, username: user.username, password: user.password })
        .expect(200);
      cookie = ((res2.headers["set-cookie"] as unknown as string[] | undefined) ?? [])[0]?.split(";")[0] as string;
    }
    return cookie;
  }

  async function tenantIdOf(tenantName: string): Promise<string> {
    const row = await prisma.tenant.findFirst({ where: { name: tenantName } });
    if (row === null) throw new Error(`tenant ${tenantName} missing`);
    return row.id;
  }

  /** 真实 PUT 一个容器到测试存储 + 造 SUCCEEDED buildJob + workspace 记录。 */
  async function seedBuiltArtifact(tenantId: string): Promise<string> {
    const bytes = await buildRealContainer();
    const stored = await storage.put({
      tenantId,
      kind: "client-package",
      stream: Readable.from([bytes]),
      maxBytes: 1024 * 1024,
    });
    const ws = await prisma.solutionWorkspace.create({
      data: { tenantId, name: "preview-ws", mode: "new" },
    });
    const job = await prisma.buildJob.create({
      data: {
        tenantId,
        workspaceId: ws.id,
        baseRevisionId: "base-1",
        changePlanId: "cp-1",
        planHash: "a".repeat(64),
        domainKind: "kingclient",
        idempotencyKey: `idem-preview-${Date.now()}`,
        status: "SUCCEEDED",
      },
    });
    const artifact = await prisma.artifact.create({
      data: {
        tenantId,
        buildJobId: job.id,
        kind: "client-package",
        storageKey: stored.artifactId,
        sizeBytes: stored.size,
        sha256: stored.sha256,
      },
    });
    return artifact.id;
  }

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
    expect(res.text).toContain("生产车间实时监控");
    expect(res.text).toContain("首页");
    expect(res.text).toContain('data-type="text"');
  });

  it("rejects unauthenticated preview requests with 401", async () => {
    const acmeId = await tenantIdOf(TENANT_A.tenant);
    const artifactId = await seedBuiltArtifact(acmeId);
    await request(server).get(`/api/artifacts/${artifactId}/preview`).expect(401);
  });

  it("hides artifacts of other tenants with 404", async () => {
    const cookie = await login(TENANT_B);
    const acmeId = await tenantIdOf(TENANT_A.tenant);
    const artifactId = await seedBuiltArtifact(acmeId);
    await request(server)
      .get(`/api/artifacts/${artifactId}/preview`)
      .set("Cookie", cookie)
      .expect(404);
  });
});
