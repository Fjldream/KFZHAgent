// @ts-nocheck -- Brief Step 1/2 的 API 契约测试含逐字代码（JS 风格，无类型标注），
// 因此本文件关闭类型检查，但 ESLint 静态规则与运行时断言仍然生效。
// Task 11: HTTP/SSE API, upload, confirmation, and download.
import "reflect-metadata";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@127.0.0.1:5432/kf_agent_test";
process.env.KF_SERVER_PLAN_HMAC_KEY_BASE64 ??= Buffer.alloc(32, 0x54).toString("base64");

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import type { ArtifactStorage, StoredArtifact } from "@kf/artifact-storage";
import { BuildExecutor, BuildJobService } from "@kf/build-jobs";
import { canonicalModuleCompilationHash, canonicalServerHash } from "@kf/contracts";
import { decodeBlueprintMessage, encodeBlueprintConfirmation } from "@kf/agent-orchestrator";
import {
  createKingClientDomainPack,
  importNativeClientPackage,
  inspectClientProject,
  packageNativeClientProject,
} from "@kf/domain-client";
import { DomainRegistry } from "@kf/domain-registry";
import request from "supertest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "./app.module.js";
import { PrismaService } from "./prisma/prisma.service.js";
import { PasswordService } from "./auth/password.service.js";
import { TenantsService } from "./tenants/tenants.service.js";
import { ARTIFACT_STORAGE } from "./artifacts/artifact-storage.js";
import { MODEL_PORT } from "./conversations/model-port.js";
import { DeterministicFakeModelPort } from "./conversations/fake-model.js";
import { AssetService } from "./assets/asset.service.js";
import { ConversationService, finalStateData } from "./conversations/conversation.service.js";
import { WorkspaceService } from "./workspaces/workspace.service.js";
import { MODULE_ARTIFACT_AUTHORITY, SERVER_PLAN_AUTHORITY } from "./conversations/server-plan-authority.js";

const unknownFieldClientDir = fileURLToPath(
  new URL("../../../tests/fixtures/client-unknown-field", import.meta.url),
);

const PLATFORM = { tenant: "KF Platform", username: "root", password: "TempPass-123" };
const TENANT_A = { tenant: "Acme Corp", username: "alice", password: "TempPass-123" };
const TENANT_A_MEMBER = { tenant: "Acme Corp", username: "carol", password: "CarolPass-123" };
const TENANT_B = { tenant: "Globex", username: "bob", password: "TempPass-123" };
const ASSET_PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/mXPo5QAAAABJRU5ErkJggg==",
  "base64",
);
const ASSET_JPEG_1X1 = Buffer.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0x01, 0xff, 0xd9,
]);
const ASSET_WEBP_1X1 = Buffer.from(
  "UklGRiIAAABXRUJQVlA4IBYAAABwAQCdASoBAAEAAUAmJaQAA3AA/vuU",
  "base64",
);
const ASSET_HEADER_ONLY_JPEG = Buffer.from("ffd8ffe00002ffc000080001000100ffd9", "hex");
const ASSET_JPEG_SOS_INDEX = ASSET_JPEG_1X1.indexOf(Buffer.from([0xff, 0xda]));
const ASSET_INCOMPLETE_SOS_JPEG = ASSET_JPEG_1X1.subarray(
  0,
  ASSET_JPEG_SOS_INDEX + 2 + ASSET_JPEG_1X1.readUInt16BE(ASSET_JPEG_SOS_INDEX + 2),
);
const ASSET_INVALID_VERTICAL_SAMPLING_JPEG = Buffer.from(ASSET_JPEG_1X1);
ASSET_INVALID_VERTICAL_SAMPLING_JPEG[31] = 0x10;

function assetProgressiveJpeg(scans: Array<{ components: number[]; start: number; end: number; ah: number; al: number }>): Buffer {
  const bytes = [
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
    0xff, 0xc2, 0x00, 0x0e, 0x08, 0x00, 0x01, 0x00, 0x01, 0x02, 0x01, 0x11, 0x00, 0x02, 0x11, 0x00,
  ];
  for (const scan of scans) {
    bytes.push(0xff, 0xda, 0x00, 6 + scan.components.length * 2, scan.components.length);
    for (const component of scan.components) bytes.push(component, 0x00);
    bytes.push(scan.start, scan.end, (scan.ah << 4) | scan.al, 0x01);
  }
  bytes.push(0xff, 0xd9);
  return Buffer.from(bytes);
}

const ASSET_PROGRESSIVE_AC_TWO_COMPONENTS = assetProgressiveJpeg([
  { components: [1, 2], start: 1, end: 1, ah: 0, al: 0 },
]);
const ASSET_PROGRESSIVE_REFINE_WITHOUT_INITIAL = assetProgressiveJpeg([
  { components: [1], start: 0, end: 0, ah: 1, al: 0 },
]);

let app: INestApplication;
let server: ReturnType<INestApplication["getHttpServer"]>;
let prisma: PrismaService;
let tenants: TenantsService;
let passwords: PasswordService;
let fakeModel: FakeModelPort;
let storage: ArtifactStorage;
let moduleArtifactAuthority;
let storageRoot: string;
let counter = 0;

class AdoptionGateStorage implements ArtifactStorage {
  private readonly delegate: ArtifactStorage;
  private resolveStored!: (artifact: StoredArtifact) => void;
  private resolveRelease!: () => void;
  readonly stored = new Promise<StoredArtifact>((resolve) => { this.resolveStored = resolve; });
  private readonly releaseGate = new Promise<void>((resolve) => { this.resolveRelease = resolve; });

  constructor(delegate: ArtifactStorage) {
    this.delegate = delegate;
  }

  async put(input: Parameters<ArtifactStorage["put"]>[0]): Promise<StoredArtifact> {
    const stored = await this.delegate.put(input);
    this.resolveStored(stored);
    await this.releaseGate;
    return stored;
  }

  open(tenantId: string, artifactId: string): Promise<NodeJS.ReadableStream> {
    return this.delegate.open(tenantId, artifactId);
  }

  delete(tenantId: string, artifactId: string): Promise<void> {
    return this.delegate.delete(tenantId, artifactId);
  }

  release(): void {
    this.resolveRelease();
  }
}

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
  "WorkspaceAsset",
  "SolutionWorkspace",
  "UserSession",
  "User",
  "Tenant",
];

// PostgresSaver 通过 setup() 创建这些表；每个集成套件
// 都会截断它们，因此检查点无法跨越测试泄漏。
const CHECKPOINT_TABLES = [
  "checkpoint_writes",
  "checkpoint_blobs",
  "checkpoints",
  "checkpoint_migrations",
];

/** 确定的伪模型：API 的 ModelPort 注入点（任务 11）。 */
class FakeModelPort {
  moduleDelegate = new DeterministicFakeModelPort();
  intents = [];
  requestedDomains = ["kingclient"];
  blueprintModuleIds = ["main"];
  mappedBlueprint = false;
  classificationError = undefined;
  classificationInputs = [];
  layoutModuleId = undefined;
  createCalls = [];
  reviseCalls = [];

  queueIntent(...intents) {
    this.intents.push(...intents);
  }
  async classifyIntent(input) {
    this.classificationInputs.push(input);
    if (this.classificationError !== undefined) throw new Error(String(this.classificationError));
    const intent = this.intents.shift() ?? "QUESTION";
    return {
      intent,
      requestedDomains: this.requestedDomains,
      reply: `reply:${intent}`,
    };
  }
  async createDesignPlan(input) {
    if (input.generationWorkflow === "creative-v2") {
      return {
        schema: "kf-design-plan/v3",
        displayName: "访客协同中心",
        objective: "帮助园区前台处理访客预约",
        audiences: ["园区前台"],
        scenarios: ["预约审核"],
        pages: [{
          id: "visitor-overview",
          title: "访客总览",
          purpose: "处理当日预约",
          readingOrder: ["visitor-list"],
          regions: [{
            id: "visitor-list",
            purpose: "进入访客详情",
            semanticRoles: ["primary-action"],
            dataShape: "action-list",
            density: "comfortable",
            importance: "primary",
            content: ["查看访客详情"],
            sampleData: [],
            interactions: [],
            states: ["待审核"],
            visualIntent: "清晰可信",
          }],
        }],
        journeys: [{
          id: "review-visitor",
          actor: "园区前台",
          goal: "审核预约",
          steps: [{ pageId: "visitor-overview", regionId: "visitor-list", action: "选择预约", result: "显示详情" }],
          completion: "完成预约审核",
        }],
        visualDirection: {
          tone: "专业友好",
          colors: ["深海蓝"],
          typography: "层级清晰",
          spacingAndSurfaces: "舒适留白",
        },
        acceptanceScenarios: ["可以查看并审核预约"],
        openQuestions: [],
      };
    }
    return {
      schema: "kf-design-plan/v2",
      displayName: "集成测试客户效果方案",
      overview: {
        objective: "完整说明最终效果",
        audiences: ["业务用户"],
        scenarios: ["方案确认"],
        valueProposition: "减少交付理解偏差",
      },
      informationArchitecture: { narrative: "总览到详情", wireframe: "总览 → 详情" },
      modules: this.blueprintModuleIds.map((id) => ({
        id,
        name: `${id} 模块`,
        purpose: `展示 ${id} 信息`,
        content: [`${id} 标题`, `${id} 说明`],
        sampleData: [{ label: id, value: `${id} 示例` }],
        interactions: this.mappedBlueprint ? [] : ["查看详情"],
        ...(this.mappedBlueprint ? {
          expectedKind: "content.hero",
          expectedCategory: "content",
          interactionRequirements: [],
        } : {}),
        presentation: "重点卡片",
      })),
      visualDirection: {
        tone: "专业",
        colors: ["深蓝"],
        typography: "清晰层级",
        spacingAndSurfaces: "卡片留白",
      },
      highlights: ["信息清晰"],
      revisionNotes: { added: ["完整核心内容"], changed: [], retained: [] },
      acceptanceCriteria: ["完整展示核心信息"],
      openQuestions: [],
    };
  }
  async createSolutionImplementationPlan(input) {
    const blueprint = input.confirmedSolutionBlueprint;
    const candidates = input.capabilityCandidates;
    const actionCapabilityId = candidates.regions[0].controls.find((candidate) => candidate.id === "button").id;
    const intent = {
      importance: "primary",
      visualWeight: 4,
      readingOrder: 0,
      density: "comfortable",
      groupWith: [],
      width: { mode: "fill" },
      height: { mode: "content" },
      align: "stretch",
    };
    return {
      schema: "kf-solution-implementation/v1",
      projectKey: "visitor-center",
      blueprintHash: canonicalServerHash(blueprint),
      candidateBundleHash: canonicalServerHash(candidates),
      theme: {
        background: "#f4f7fb", surface: "#ffffff", primary: "#163a5f", accent: "#e47b32",
        textPrimary: "#14212b", textSecondary: "#52616d", fontFamily: "Inter", spacingUnit: 8,
        radiusScale: { small: 4, medium: 8, large: 16 },
      },
      roleStyles: [{ role: "record-title", declarations: {}, states: {} }],
      mockData: [],
      localState: [],
      pages: [{
        id: "visitor-solution-page",
        title: "访客总览",
        purpose: "查看当日预约",
        canvas: "responsive",
        sourceBlueprintPageId: "visitor-overview",
        sourceBlueprintRegionIds: ["visitor-list"],
        initialStateIds: [],
        root: {
          kind: "control",
          id: "visitor-open-detail",
          sourceBlueprintRegionIds: ["visitor-list"],
          intent,
          capabilityId: actionCapabilityId,
          content: "查看访客详情",
          properties: [],
          tabIds: [],
          styleRole: "record-title",
          eventBindings: [{ semanticEvent: "click", actionIds: ["open-visitor-detail"] }],
        },
      }],
      overlays: [],
      actions: [{
        id: "open-visitor-detail",
        kind: "navigate-page",
        targetPageId: "visitor-solution-page",
        afterActionIds: [],
        journeyStepRefs: [{ journeyId: "review-visitor", stepIndex: 0 }],
      }],
      scripts: [],
    };
  }
  async reviseSolutionImplementationSubtree(input) {
    return this.createSolutionImplementationPlan(input);
  }
  async createProjectDesign(input) {
    void input;
    return {
      schema: "kf-solution-ir/v1",
      solutionId: "sol-1",
      displayName: "初始设计",
      projects: [],
      dependencies: [],
      pendingRequirements: [],
    };
  }
  createModulePlan(input) {
    return this.moduleDelegate.createModulePlan(input);
  }
  reviseModulePlan(input) {
    return this.moduleDelegate.reviseModulePlan(input);
  }
  async createUiImplementation(input) {
    this.createCalls.push(input);
    return this.makeImplementation(input, "new");
  }
  async reviseUiImplementation(input) {
    this.reviseCalls.push(input);
    return this.makeImplementation(input, "rev");
  }
  async createChangePlan(input) {
    this.createCalls.push(input);
    return this.makePlan(input.workspaceId, "new");
  }
  async reviseChangePlan(input) {
    this.reviseCalls.push(input);
    return this.makePlan(input.workspaceId, "rev");
  }
  async explainValidation() {
    return "校验通过";
  }
  makeImplementation(input, tag) {
    counter += 1;
    const pageId = input.editableEntities?.find((entity) => entity.kind === "page")?.name ?? "Page1";
    const sourceModuleIds = input.designPlan?.schema === "kf-design-plan/v2"
      ? input.designPlan.modules.map((module) => module.id)
      : ["main"];
    return {
      schema: "kf-ui-implementation/v1",
      theme: {
        background: "#ffffff",
        surface: "#f8fafc",
        primary: "#2563eb",
        accent: "#0ea5e9",
        textPrimary: "#0f172a",
        textSecondary: "#475569",
        fontFamily: "Arial",
        spacingUnit: 8,
        radiusScale: { small: 4, medium: 8, large: 16 },
      },
      pages: [{
        id: pageId,
        width: 1440,
        height: 900,
        components: sourceModuleIds.map((sourceModuleId, index) => ({
          id: sourceModuleId === this.layoutModuleId ? "MainLayout" : index === 0 ? "Text1" : sourceModuleId,
          role: "heading",
          sourceModuleId,
          capabilityId: sourceModuleId === this.layoutModuleId ? "layout.2" : "text",
          critical: true,
          ...(sourceModuleId === this.layoutModuleId
            ? {}
            : { content: `${sourceModuleId}-${tag}-${counter}` }),
          geometry: {
            x: 40 + (tag === "rev" ? 20 : 0),
            y: 40 + index * 100,
            width: sourceModuleId === this.layoutModuleId ? 700 : 320,
            height: sourceModuleId === this.layoutModuleId ? 80 : 48,
          },
          properties: sourceModuleId === this.layoutModuleId
            ? {
                children: [{
                  layoutType: 4,
                  objectType: 2,
                  baseProperty: {
                    name: "NestedLayout",
                    leftTopPt: { x: 0, y: 0 },
                    width: 600,
                    height: 60,
                  },
                }],
              }
            : {},
          style: { declarations: {}, states: {} },
        })),
      }],
    };
  }
  makePlan(workspaceId, tag) {
    counter += 1;
    return {
      schema: "kf-change-plan/v1",
      workspaceId,
      operations: [
        {
          op: "update",
          entityId: `text-${tag}-${counter}`,
          entityType: "text",
          changes: [{ path: "/text", value: `${tag}-${counter}` }],
        },
      ],
    };
  }
}

beforeAll(async () => {
  // Give this suite its own artifact storage root so uploaded packages never
  // leak into the working tree's default `.kf-artifacts` directory.
  storageRoot = await mkdtemp(path.join(tmpdir(), "kf-api-artifacts-"));
  process.env.ARTIFACT_STORAGE_ROOT = storageRoot;
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MODEL_PORT)
    .useValue(new FakeModelPort())
    .compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  server = app.getHttpServer();
  prisma = moduleRef.get(PrismaService);
  tenants = moduleRef.get(TenantsService);
  passwords = moduleRef.get(PasswordService);
  fakeModel = moduleRef.get(MODEL_PORT);
  storage = moduleRef.get(ARTIFACT_STORAGE);
  moduleArtifactAuthority = moduleRef.get(MODULE_ARTIFACT_AUTHORITY);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  if (storageRoot.length > 0) {
    await rm(storageRoot, { recursive: true, force: true }).catch(() => {});
  }
});

async function resetDatabase(): Promise<void> {
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
  for (const table of CHECKPOINT_TABLES) {
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
  const acme = await prisma.tenant.findUnique({ where: { name: TENANT_A.tenant } });
  await prisma.user.create({
    data: {
      tenantId: acme.id,
      username: TENANT_A_MEMBER.username,
      passwordHash: await passwords.hash(TENANT_A_MEMBER.password),
      role: "member",
      mustChangePassword: true,
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
  await seedDatabase();
  fakeModel.intents = [];
  fakeModel.blueprintModuleIds = ["main"];
  fakeModel.mappedBlueprint = false;
  fakeModel.classificationError = undefined;
  fakeModel.classificationInputs = [];
  fakeModel.layoutModuleId = undefined;
  fakeModel.createCalls = [];
  fakeModel.reviseCalls = [];
});

async function login(
  user: { tenant: string; username: string; password: string },
): Promise<string> {
  const res = await request(server)
    .post("/api/auth/login")
    .send({
      tenant: user.tenant,
      username: user.username,
      password: user.password,
    })
    .expect(200);
  let cookie = (res.headers["set-cookie"] as unknown as string[])[0].split(";")[0] as string;
  if (res.body.mustChangePassword === true) {
    // I2: 首次登录会话受限；测试助手用同一密码完成强制改密换取完整会话，
    // 保持密码不变（后续断言仍可用原密码登录）。
    const changeRes = await request(server)
      .post("/api/auth/change-password")
      .set("Cookie", cookie)
      .send({ currentPassword: user.password, newPassword: user.password })
      .expect(200);
    cookie = (changeRes.headers["set-cookie"] as unknown as string[])[0].split(";")[0] as string;
  }
  return cookie;
}

async function createWorkspace(cookie: string, name: string, generationWorkflow: "legacy" | "module-v1" | "creative-v2" = "legacy") {
  const response = await request(server)
    .post("/api/workspaces")
    .set("Cookie", cookie)
    .send({ name })
    .expect(201);
  // Most historical cases in this suite model workspaces created before the
  // creative-v2 rollout. Persist historical workflow state explicitly; the
  // product creation test opts in to creative-v2 and exercises the real
  // server-owned default unchanged.
  if (generationWorkflow !== "creative-v2") {
    await prisma.solutionWorkspace.update({ where: { id: response.body.id }, data: { generationWorkflow } });
  }
  return response;
}

async function createUploadWorkspace(cookie: string, name: string) {
  return request(server)
    .post("/api/workspaces")
    .set("Cookie", cookie)
    .send({ name, mode: "upload" })
    .expect(201);
}

function uploadPackage(
  cookie: string,
  workspaceId: string,
  body: Buffer,
  query: Record<string, unknown> = {},
) {
  // Not async on purpose: returns the supertest Test so callers can chain
  // .expect() before awaiting.
  let req = request(server)
    .post(`/api/workspaces/${workspaceId}/uploads`)
    .set("Cookie", cookie)
    .set("Content-Type", "application/octet-stream");
  if (Object.keys(query).length > 0) req = req.query(query);
  return req.send(body);
}

function parseBinary(res, callback) {
  const chunks = [];
  res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  res.on("end", () => callback(null, Buffer.concat(chunks)));
}

async function createConversation(cookie: string, workspaceId: string, title: string) {
  return request(server)
    .post("/api/conversations")
    .set("Cookie", cookie)
    .send({ workspaceId, title })
    .expect(201);
}

function sendMessage(cookie: string, conversationId: string, content: string) {
  // Not async on purpose: returns the supertest Test for chaining .expect().
  return request(server)
    .post(`/api/conversations/${conversationId}/messages`)
    .set("Cookie", cookie)
    .send({ content });
}

function resume(cookie: string, conversationId: string, body: Record<string, unknown>) {
  return request(server)
    .post(`/api/conversations/${conversationId}/resume`)
    .set("Cookie", cookie)
    .send(body);
}

/** Parses the SSE frames of a message response into [event, data] pairs. */
function parseSse(text: string): { event: string; data: unknown }[] {
  const events: { event: string; data: unknown }[] = [];
  for (const block of text.split("\n\n")) {
    if (block.trim().length === 0) continue;
    const lines = block.split("\n");
    let event = "message";
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith("event:")) event = line.slice("event:".length).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice("data:".length).trim());
    }
    if (dataLines.length > 0) {
      events.push({ event, data: JSON.parse(dataLines.join("\n")) });
    }
  }
  return events;
}

function doneEvent(text: string): { data: { stage?: string; interrupt?: { planHash?: string } } } {
  const events = parseSse(text);
  const done = events.find((event) => event.event === "done");
  if (done === undefined) throw new Error(`no done SSE event in: ${text}`);
  return { data: done.data as { stage?: string; interrupt?: { planHash?: string } } };
}

async function makePackage(): Promise<Buffer> {
  return packageNativeClientProject(unknownFieldClientDir);
}

async function runNextBuild(owner: string) {
  const jobs = new BuildJobService(prisma);
  const leased = await jobs.leaseNext(owner, new Date());
  if (leased === null) throw new Error("expected a queued build job");
  const registry = new DomainRegistry();
  registry.register(createKingClientDomainPack({ nativeAccepted: true }));
  return new BuildExecutor({
    prisma,
    storage,
    registry,
    serverPlanVerifier: app.get(SERVER_PLAN_AUTHORITY),
  }).execute(leased);
}

/** Plans a NEW_REQUIREMENT turn up to the approval interrupt and returns the planHash. */
async function planRequirement(cookie: string, conversationId: string): Promise<string> {
  // 两遍流程（spec §5）：先出设计计划，再确认设计进入 plan-change。
  fakeModel.queueIntent("NEW_REQUIREMENT");
  let res = await sendMessage(cookie, conversationId, "新增一个按钮");
  expect(res.status).toBe(200);
  let done = doneEvent(res.text);
  expect(done.data.stage).toBe("design-review");
  fakeModel.queueIntent("CONFIRM_DESIGN");
  res = await sendMessage(cookie, conversationId, "确认");
  expect(res.status).toBe(200);
  done = doneEvent(res.text);
  expect(done.data.stage).toBe("approval");
  const planHash = done.data.interrupt?.planHash;
  if (typeof planHash !== "string") throw new Error("expected planHash in SSE done event");
  return planHash;
}

async function tenantIdOf(tenantName: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({ where: { name: tenantName } });
  return tenant!.id;
}

// ---------------------------------------------------------------------------
// Step 1: API contract
// ---------------------------------------------------------------------------

describe("api contract", () => {
  it("loads the newly persisted user turn inside the latest twenty-message model window", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Recent message window");
    const conv = await createConversation(cookie, ws.body.id, "Recent messages");
    const tenantId = await tenantIdOf(TENANT_A.tenant);
    await prisma.message.createMany({
      data: Array.from({ length: 24 }, (_, index) => ({
        id: `history-${String(index + 1).padStart(2, "0")}`,
        tenantId,
        conversationId: conv.body.id,
        role: index % 2 === 0 ? "user" : "assistant",
        content: `history-${String(index + 1).padStart(2, "0")}`,
        createdAt: new Date(Date.UTC(2020, 0, 1, 0, 0, index)),
      })),
    });
    fakeModel.queueIntent("QUESTION");

    await sendMessage(cookie, conv.body.id, "current-turn-25").expect(200);

    const recent = fakeModel.classificationInputs.at(-1)?.recentMessages;
    expect(recent).toHaveLength(20);
    expect(recent.map((message) => message.content)).toEqual([
      "history-06", "history-07", "history-08", "history-09", "history-10",
      "history-11", "history-12", "history-13", "history-14", "history-15",
      "history-16", "history-17", "history-18", "history-19", "history-20",
      "history-21", "history-22", "history-23", "history-24", "current-turn-25",
    ]);
    expect(recent.some((message) => message.content === "history-01")).toBe(false);
    await expect(prisma.message.findFirst({
      where: { tenantId, conversationId: conv.body.id, content: "current-turn-25" },
    })).resolves.not.toBeNull();
  });

  it("assigns workflow ownership on the server when creating workspaces", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const generated = await createWorkspace(cookie, "Server-owned creative workflow", "creative-v2");
    const imported = await createUploadWorkspace(cookie, "Server-owned legacy workflow");

    expect(generated.body).toMatchObject({ mode: "new", generationWorkflow: "creative-v2" });
    expect(imported.body).toMatchObject({ mode: "upload", generationWorkflow: "legacy" });
    await expect(prisma.solutionWorkspace.findUniqueOrThrow({ where: { id: generated.body.id } }))
      .resolves.toMatchObject({ generationWorkflow: "creative-v2" });
    await expect(prisma.solutionWorkspace.findUniqueOrThrow({ where: { id: imported.body.id } }))
      .resolves.toMatchObject({ generationWorkflow: "legacy" });
    await request(server)
      .post("/api/workspaces")
      .set("Cookie", cookie)
      .send({ name: "Client cannot select workflow", generationWorkflow: "legacy" })
      .expect(201)
      .expect(({ body }) => expect(body.generationWorkflow).toBe("creative-v2"));
    const initial = await prisma.solutionRevision.findFirstOrThrow({ where: { workspaceId: generated.body.id } });
    expect(initial.state).toMatchObject({ pages: [{ name: "Page1", controls: [] }] });
  });

  it("creates an upload workspace and uploads a source package", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie, "Import Workspace");
    expect(ws.body.mode).toBe("upload");
    expect(ws.body.generationWorkflow).toBe("legacy");
    expect(ws.body.currentRevisionId).toBeNull();

    const pkg = await makePackage();
    const res = await uploadPackage(cookie, ws.body.id, pkg).expect(201);
    expect(res.body.revision.kind).toBe("source");
    expect(res.body.revision.revisionNumber).toBe(1);
    expect(res.body.revision.tenantId).toBe(ws.body.tenantId);
    expect(res.body.packageUrl).toMatch(/^[0-9a-f-]{36}$/);
    expect(res.body.summary).toMatchObject({ project: { name: "UnknownFieldFixture" } });

    // The source revision is now current.
    const get = await request(server)
      .get(`/api/workspaces/${ws.body.id}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(get.body.currentRevisionId).toBe(res.body.revision.id);
  });

  it("lists workspace revisions", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie, "Revisions WS");
    await uploadPackage(cookie, ws.body.id, await makePackage()).expect(201);

    const res = await request(server)
      .get(`/api/workspaces/${ws.body.id}/revisions`)
      .set("Cookie", cookie)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].kind).toBe("source");
  });

  it("creates and lists a conversation", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Gen Workspace");

    const created = await createConversation(cookie, ws.body.id, "需求讨论");
    expect(created.body.workspaceId).toBe(ws.body.id);
    expect(created.body.title).toBe("需求讨论");

    const listed = await request(server)
      .get(`/api/conversations/${created.body.id}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(listed.body.id).toBe(created.body.id);
  });

  it("lists conversations per workspace (newest first) for history restore", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "List WS");

    await createConversation(cookie, ws.body.id, "第一轮");
    await new Promise((resolve) => setTimeout(resolve, 5));
    const conv2 = await createConversation(cookie, ws.body.id, "第二轮");

    const res = await request(server)
      .get(`/api/conversations?workspaceId=${ws.body.id}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(2);
    // Newest first：客户端直接取第一项恢复历史。
    expect(res.body[0].id).toBe(conv2.body.id);
    expect(res.body[0].title).toBe("第二轮");

    // 其它 workspace 的会话不应混入。
    const other = await createWorkspace(cookie, "List WS Other");
    const otherRes = await request(server)
      .get(`/api/conversations?workspaceId=${other.body.id}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(otherRes.body).toHaveLength(0);

    // 跨租户：别的 tenant 查不到该 workspace 的会话。
    const cookieB = await login(TENANT_B);
    await request(server)
      .get(`/api/conversations?workspaceId=${ws.body.id}`)
      .set("Cookie", cookieB)
      .expect(404);
  });

  it("streams a message turn through SSE and stops at the approval interrupt", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie, "SSE WS");
    const uploaded = await uploadPackage(cookie, ws.body.id, await makePackage()).expect(201);
    const conv = await createConversation(cookie, ws.body.id, "SSE");

    // 两遍流程（spec §5）：第一轮 NEW_REQUIREMENT → design-plan（设计计划），
    // 第二轮 CONFIRM_DESIGN → plan-change → approval 中断。
    fakeModel.queueIntent("NEW_REQUIREMENT");
    const res = await sendMessage(cookie, conv.body.id, "新增一个按钮").expect(200);
    expect(res.headers["content-type"]).toContain("text/event-stream");
    expect(res.text).toContain("event: state");
    expect(res.text).toContain("event: done");

    // Streaming is real: each graph node update is pushed as its own SSE
    // frame (load-context → classify-intent → design-plan), not collected
    // and returned as one payload.
    const events = parseSse(res.text);
    const stateFrames = events.filter((event) => event.event === "state");
    expect(stateFrames.length).toBeGreaterThanOrEqual(3);
    const progressCodes = stateFrames.map((frame) => (frame.data as { progressCode: string }).progressCode);
    expect(progressCodes).toEqual(
      expect.arrayContaining(["load-context", "classify-intent", "design-plan"]),
    );

    const done = doneEvent(res.text);
    expect(done.data.stage).toBe("design-review");
    expect(done.data.designPlanHash).toMatch(/^[0-9a-f]{64}$/);

    fakeModel.queueIntent("CONFIRM_DESIGN");
    const res2 = await sendMessage(cookie, conv.body.id, "确认").expect(200);
    const done2 = doneEvent(res2.text);
    expect(done2.data.stage).toBe("approval");
    expect(done2.data.interrupt).toMatchObject({ type: "plan-approval" });
    expect(done2.data.interrupt?.planHash).toMatch(/^[0-9a-f]{64}$/);

    // The user message and the approval interrupt payload are both durable.
    // 两遍流程消息序列：user(需求) + assistant(设计计划) + user(确认)。
    const messages = await request(server)
      .get(`/api/conversations/${conv.body.id}/messages`)
      .set("Cookie", cookie)
      .expect(200);
    expect(messages.body).toHaveLength(3);
    expect(messages.body[0].content).toBe("新增一个按钮");
    expect(decodeBlueprintMessage(messages.body[1].content)).toMatchObject({
      revision: 1,
      blueprint: {
        schema: "kf-design-plan/v2",
        overview: { objective: "完整说明最终效果" },
      },
    });
    expect(messages.body[2].content).toBe("确认");
    void uploaded;
  });

  it("requires the displayed plan hash when resuming approval", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie, "Resume WS");
    await uploadPackage(cookie, ws.body.id, await makePackage()).expect(201);
    const conv = await createConversation(cookie, ws.body.id, "Resume");
    await planRequirement(cookie, conv.body.id);

    await request(server)
      .post(`/api/conversations/${conv.body.id}/resume`)
      .set("Cookie", cookie)
      .send({ action: "approve", planHash: "wrong-hash" })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe("PLAN_HASH_MISMATCH");
      });
  });

  it("approves the plan and enqueues a durable build job", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie, "Approve WS");
    await uploadPackage(cookie, ws.body.id, await makePackage()).expect(201);
    const conv = await createConversation(cookie, ws.body.id, "Approve");
    const planHash = await planRequirement(cookie, conv.body.id);

    const res = await resume(cookie, conv.body.id, { action: "approve", planHash }).expect(200);
    expect(res.body.stage).toBe("building"); // enqueue-build only confirms durable queueing
    expect(res.body.buildJobId).toBeTruthy();

    const job = await request(server)
      .get(`/api/build-jobs/${res.body.buildJobId}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(job.body.planHash).toBe(planHash);
    expect(job.body.status).toBe("QUEUED");
  });

  it("returns the latest tenant-scoped build job for workspace restoration", async () => {
    const cookieA = await login(TENANT_A_MEMBER);
    const cookieB = await login(TENANT_B);
    const ws = await createUploadWorkspace(cookieA, "Restore Latest Build WS");
    await uploadPackage(cookieA, ws.body.id, await makePackage()).expect(201);
    const conv = await createConversation(cookieA, ws.body.id, "Restore latest build");
    const planHash = await planRequirement(cookieA, conv.body.id);
    const approved = await resume(cookieA, conv.body.id, { action: "approve", planHash }).expect(200);

    const latest = await request(server)
      .get(`/api/build-jobs?workspaceId=${encodeURIComponent(ws.body.id)}`)
      .set("Cookie", cookieA)
      .expect(200);
    expect(latest.body.job).toMatchObject({ id: approved.body.buildJobId, workspaceId: ws.body.id });

    await request(server)
      .get(`/api/build-jobs?workspaceId=${encodeURIComponent(ws.body.id)}`)
      .set("Cookie", cookieB)
      .expect(200)
      .expect(({ body }) => expect(body.job).toBeNull());
  });

  it("rejects a plain message while an approval is pending", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie, "Pending WS");
    await uploadPackage(cookie, ws.body.id, await makePackage()).expect(201);
    const conv = await createConversation(cookie, ws.body.id, "Pending");
    await planRequirement(cookie, conv.body.id);

    await sendMessage(cookie, conv.body.id, "还在吗").expect(409);
  });

  it("downloads an artifact through a short-lived single-use token", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie, "Download WS");
    const uploaded = await uploadPackage(cookie, ws.body.id, await makePackage()).expect(201);
    const packageUrl = uploaded.body.packageUrl as string;

    const tokenRes = await request(server)
      .post(`/api/artifacts/${packageUrl}/download-token`)
      .set("Cookie", cookie)
      .expect(200);
    expect(tokenRes.body).toMatchObject({
      artifactId: packageUrl,
      mediaType: "application/zip",
      fileExtension: ".zip",
      fileName: `${packageUrl}.zip`,
    });
    expect((await prisma.domainProjectRevision.findFirst({
      where: { packageUrl },
    }))?.fileExtension).toBe(".zip");
    expect(new Date(tokenRes.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const dl = await request(server)
      .get(`/api/artifacts/download/${tokenRes.body.token}`)
      .set("Cookie", cookie)
      .buffer(true)
      .parse(parseBinary)
      .expect(200);
    expect(dl.headers["content-type"]).toContain("application/zip");
    expect(dl.headers["content-disposition"]).toContain(`${packageUrl}.zip`);
    expect(dl.body.length).toBeGreaterThan(1000);

    // Single-use: the second download with the same token fails.
    await request(server)
      .get(`/api/artifacts/download/${tokenRes.body.token}`)
      .set("Cookie", cookie)
      .expect(401);

    // The file route still requires an active session.
    await request(server)
      .get(`/api/artifacts/download/${tokenRes.body.token}`)
      .expect(401);
  });

  it("corrects legacy source ZIP .gz metadata in tokens and download responses", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie, "Legacy Source Download WS");
    const uploaded = await uploadPackage(cookie, ws.body.id, await makePackage()).expect(201);
    const packageUrl = uploaded.body.packageUrl as string;
    await prisma.domainProjectRevision.updateMany({
      where: { packageUrl, kind: "source-package", mediaType: "application/zip" },
      data: { fileExtension: ".gz" },
    });

    const issued = await request(server)
      .post(`/api/artifacts/${packageUrl}/download-token`)
      .set("Cookie", cookie)
      .expect(200);
    expect(issued.body).toMatchObject({
      artifactId: packageUrl,
      mediaType: "application/zip",
      fileExtension: ".zip",
      fileName: `${packageUrl}.zip`,
    });

    const downloaded = await request(server)
      .get(`/api/artifacts/download/${issued.body.token}`)
      .set("Cookie", cookie)
      .buffer(true)
      .parse(parseBinary)
      .expect(200);
    expect(downloaded.headers["content-type"]).toContain("application/zip");
    expect(downloaded.headers["content-disposition"]).toContain(`${packageUrl}.zip`);
  });

  it("downloads a calculation ZIP with its persisted response metadata", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const tenant = await prisma.tenant.findUnique({ where: { name: TENANT_A.tenant } });
    const workspace = await createWorkspace(cookie, "Calculation Download WS");
    const revisionId = workspace.body.currentRevisionId as string;
    const packagedBytes = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xca, 0x1c]);
    const stored = await storage.put({
      tenantId: tenant.id,
      kind: "calculation-package",
      stream: Readable.from([packagedBytes]),
      maxBytes: 1024,
    });
    const job = await prisma.buildJob.create({
      data: {
        tenantId: tenant.id,
        workspaceId: workspace.body.id,
        baseRevisionId: revisionId,
        changePlanId: "calculation-download-plan",
        planHash: "c".repeat(64),
        domainKind: "kingcalculation",
        idempotencyKey: `calculation-download-${Date.now()}`,
        status: "SUCCEEDED",
      },
    });
    const artifact = await prisma.artifact.create({
      data: {
        tenantId: tenant.id,
        buildJobId: job.id,
        kind: "calculation-package",
        storageKey: stored.artifactId,
        sizeBytes: stored.size,
        sha256: stored.sha256,
        mediaType: "application/zip",
        fileExtension: ".zip",
      },
    });

    const issued = await request(server)
      .post(`/api/artifacts/${artifact.id}/download-token`)
      .set("Cookie", cookie)
      .expect(200);
    expect(issued.body).toMatchObject({
      artifactId: artifact.id,
      mediaType: "application/zip",
      fileExtension: ".zip",
      fileName: `${artifact.id}.zip`,
    });

    const downloaded = await request(server)
      .get(`/api/artifacts/download/${issued.body.token}`)
      .set("Cookie", cookie)
      .buffer(true)
      .parse(parseBinary)
      .expect(200);
    expect(downloaded.headers["content-type"]).toContain("application/zip");
    expect(downloaded.headers["content-disposition"]).toContain(`${artifact.id}.zip`);
    expect(downloaded.body).toEqual(packagedBytes);
  });

  it("deletes a workspace only after destructive confirmation", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Delete WS");

    await request(server)
      .delete(`/api/workspaces/${ws.body.id}`)
      .set("Cookie", cookie)
      .send({})
      .expect(400);

    await request(server)
      .delete(`/api/workspaces/${ws.body.id}`)
      .set("Cookie", cookie)
      .send({ confirm: true })
      .expect(204);

    await request(server)
      .get(`/api/workspaces/${ws.body.id}`)
      .set("Cookie", cookie)
      .expect(404);
  });

  it("uploads byte-sniffed workspace assets without storage-key exposure and cleans them on deletion", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Asset Catalog WS");
    const uploaded = await request(server)
      .post(`/api/workspaces/${ws.body.id}/assets`)
      .query({ name: "portrait.png" })
      .set("Cookie", cookie)
      .set("Content-Type", "text/html")
      .send(ASSET_PNG_1X1)
      .expect(201);

    expect(uploaded.body).toMatchObject({
      name: "portrait.png",
      type: "image",
      mediaType: "image/png",
      width: 1,
      height: 1,
    });
    expect(uploaded.body).not.toHaveProperty("storageKey");

    const listed = await request(server)
      .get(`/api/workspaces/${ws.body.id}/assets`)
      .set("Cookie", cookie)
      .expect(200);
    expect(listed.body).toEqual([expect.objectContaining({ id: uploaded.body.id })]);
    expect(listed.body[0]).not.toHaveProperty("storageKey");

    const persisted = await prisma.workspaceAsset.findFirstOrThrow({
      where: { id: uploaded.body.id, tenantId: ws.body.tenantId, workspaceId: ws.body.id },
    });
    await request(server)
      .delete(`/api/workspaces/${ws.body.id}`)
      .set("Cookie", cookie)
      .send({ confirm: true })
      .expect(204);
    await expect(storage.open(ws.body.tenantId, persisted.storageKey)).rejects.toThrow();
  });

  it("rejects trailing executable bytes and truncated containers through the real asset endpoint", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Asset Container Validation WS");
    for (const [name, bytes] of [
      ["trailing.png", ASSET_PNG_1X1],
      ["trailing.jpg", ASSET_JPEG_1X1],
      ["trailing.webp", ASSET_WEBP_1X1],
      ["truncated.png", ASSET_PNG_1X1.subarray(0, ASSET_PNG_1X1.length - 4)],
    ] as const) {
      const response = await request(server)
        .post(`/api/workspaces/${ws.body.id}/assets`)
        .query({ name })
        .set("Cookie", cookie)
        .set("Content-Type", "image/png")
        .send(name === "truncated.png" ? bytes : Buffer.concat([bytes, Buffer.from("<script>run()</script>")]))
        .expect(422);
      expect(response.body.message).toBe("ASSET_INVALID_CONTAINER");
    }
    expect(await prisma.workspaceAsset.count({ where: { tenantId: ws.body.tenantId, workspaceId: ws.body.id } })).toBe(0);
  });

  it("rejects header-only and incomplete-SOS JPEGs through the real asset endpoint", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Asset JPEG Validation WS");
    for (const [name, bytes] of [
      ["header-only.jpg", ASSET_HEADER_ONLY_JPEG],
      ["incomplete-sos.jpg", ASSET_INCOMPLETE_SOS_JPEG],
      ["vertical-sampling-zero.jpg", ASSET_INVALID_VERTICAL_SAMPLING_JPEG],
      ["progressive-ac-two-components.jpg", ASSET_PROGRESSIVE_AC_TWO_COMPONENTS],
      ["progressive-refine-without-initial.jpg", ASSET_PROGRESSIVE_REFINE_WITHOUT_INITIAL],
    ] as const) {
      const response = await request(server)
        .post(`/api/workspaces/${ws.body.id}/assets`)
        .query({ name })
        .set("Cookie", cookie)
        .set("Content-Type", "image/jpeg")
        .send(bytes)
        .expect(422);
      expect(response.body.message).toBe("ASSET_INVALID_CONTAINER");
    }
    expect(await prisma.workspaceAsset.count({ where: { tenantId: ws.body.tenantId, workspaceId: ws.body.id } })).toBe(0);
  });

  it("serializes workspace deletion against a stored-but-unadopted asset without orphaning a row or blob", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Asset Delete Race WS");
    const gate = new AdoptionGateStorage(storage);
    const assets = new AssetService(prisma, gate);
    const workspaces = new WorkspaceService(prisma, storage);
    const upload = assets.upload({
      tenantId: ws.body.tenantId,
      workspaceId: ws.body.id,
      name: "race.png",
      stream: Readable.from([ASSET_PNG_1X1]),
    });
    const stored = await gate.stored;

    // No sleep: the gate proves storage completed but upload has not yet
    // entered its workspace-row adoption transaction. Deletion wins the same
    // row lock, then release lets upload observe the deleted workspace.
    await workspaces.deleteWorkspace(ws.body.tenantId, ws.body.id);
    gate.release();
    await expect(upload).rejects.toThrow("workspace");
    expect(await prisma.workspaceAsset.count({ where: { tenantId: ws.body.tenantId, workspaceId: ws.body.id } })).toBe(0);
    await expect(storage.open(ws.body.tenantId, stored.artifactId)).rejects.toThrow();
  });

  it("returns one logical asset for concurrent same-checksum uploads", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Asset Concurrent Upload WS");
    const [one, two] = await Promise.all([
      request(server).post(`/api/workspaces/${ws.body.id}/assets`).query({ name: "one.png" })
        .set("Cookie", cookie).set("Content-Type", "application/octet-stream").send(ASSET_PNG_1X1),
      request(server).post(`/api/workspaces/${ws.body.id}/assets`).query({ name: "two.png" })
        .set("Cookie", cookie).set("Content-Type", "application/octet-stream").send(ASSET_PNG_1X1),
    ]);
    expect(one.status).toBe(201);
    expect(two.status).toBe(201);
    expect(one.body.id).toBe(two.body.id);
    expect(await prisma.workspaceAsset.count({ where: { tenantId: ws.body.tenantId, workspaceId: ws.body.id } })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Step 2: Security behavior
// ---------------------------------------------------------------------------

describe("api security", () => {
  it("rejects unauthenticated requests with 401", async () => {
    const pkg = await makePackage();
    await request(server).get("/api/workspaces/some-id").expect(401);
    await request(server).post("/api/workspaces").send({ name: "X" }).expect(401);
    await request(server).post("/api/conversations").send({ workspaceId: "w", title: "t" }).expect(401);
    await request(server)
      .post("/api/conversations/c1/messages")
      .send({ content: "hi" })
      .expect(401);
    await request(server)
      .post("/api/conversations/c1/resume")
      .send({ action: "approve", planHash: "h" })
      .expect(401);
    await request(server).get("/api/build-jobs/j1").expect(401);
    await request(server).post("/api/artifacts/a1/download-token").expect(401);
    await request(server).get("/api/artifacts/download/some-token").expect(401);
    await request(server).delete("/api/workspaces/w1").send({ confirm: true }).expect(401);
    await request(server)
      .post(`/api/workspaces/w1/uploads`)
      .set("Content-Type", "application/octet-stream")
      .send(pkg)
      .expect(401);
    await request(server).get("/api/workspaces/w1/assets").expect(401);
    await request(server)
      .post("/api/workspaces/w1/assets")
      .set("Content-Type", "image/png")
      .send(ASSET_PNG_1X1)
      .expect(401);
  });

  it("returns 404 for cross-tenant ids to prevent enumeration", async () => {
    const cookieA = await login(TENANT_A_MEMBER);
    const cookieB = await login(TENANT_B);

    const wsA = await createUploadWorkspace(cookieA, "Tenant A WS");
    const convA = await createConversation(cookieA, wsA.body.id, "A conv");

    // Upload the package, then issue a real token and prove tenant B cannot use it.
    const uploaded = await uploadPackage(cookieA, wsA.body.id, await makePackage()).expect(201);
    const packageUrl = uploaded.body.packageUrl as string;
    const issued = await request(server)
      .post(`/api/artifacts/${packageUrl}/download-token`)
      .set("Cookie", cookieA)
      .expect(200);
    await request(server)
      .get(`/api/artifacts/download/${issued.body.token}`)
      .set("Cookie", cookieB)
      .expect(401);

    await request(server)
      .get(`/api/workspaces/${wsA.body.id}`)
      .set("Cookie", cookieB)
      .expect(404);
    await request(server)
      .get(`/api/workspaces/${wsA.body.id}/revisions`)
      .set("Cookie", cookieB)
      .expect(404);
    await request(server)
      .get(`/api/conversations/${convA.body.id}`)
      .set("Cookie", cookieB)
      .expect(404);
    await request(server)
      .get(`/api/conversations/${convA.body.id}/messages`)
      .set("Cookie", cookieB)
      .expect(404);
    await request(server)
      .post(`/api/conversations/${convA.body.id}/messages`)
      .set("Cookie", cookieB)
      .send({ content: "hi" })
      .expect(404);
    await request(server)
      .delete(`/api/workspaces/${wsA.body.id}`)
      .set("Cookie", cookieB)
      .send({ confirm: true })
      .expect(404);

    // Cross-tenant uploads 404 too.
    const pkg = await makePackage();
    await request(server)
      .post(`/api/workspaces/${wsA.body.id}/uploads`)
      .set("Cookie", cookieB)
      .set("Content-Type", "application/octet-stream")
      .send(pkg)
      .expect(404);
    await request(server)
      .get(`/api/workspaces/${wsA.body.id}/assets`)
      .set("Cookie", cookieB)
      .expect(404);
    await request(server)
      .post(`/api/workspaces/${wsA.body.id}/assets`)
      .set("Cookie", cookieB)
      .set("Content-Type", "image/png")
      .send(ASSET_PNG_1X1)
      .expect(404);
  });

  it("lists workspaces scoped to the caller's tenant", async () => {
    const cookieA = await login(TENANT_A_MEMBER);
    const cookieB = await login(TENANT_B);

    const wsA1 = await createWorkspace(cookieA, "Tenant A list WS 1");
    const wsA2 = await createWorkspace(cookieA, "Tenant A list WS 2");
    const wsB1 = await createWorkspace(cookieB, "Tenant B list WS 1");

    const listA = await request(server)
      .get("/api/workspaces")
      .set("Cookie", cookieA)
      .expect(200);
    expect(Array.isArray(listA.body)).toBe(true);
    const idsA = listA.body.map((row: { id: string }) => row.id);
    expect(idsA).toHaveLength(2);
    expect(idsA).toContain(wsA1.body.id);
    expect(idsA).toContain(wsA2.body.id);
    expect(idsA).not.toContain(wsB1.body.id);

    const listB = await request(server)
      .get("/api/workspaces")
      .set("Cookie", cookieB)
      .expect(200);
    expect(Array.isArray(listB.body)).toBe(true);
    const idsB = listB.body.map((row: { id: string }) => row.id);
    expect(idsB).toHaveLength(1);
    expect(idsB).toContain(wsB1.body.id);
    expect(idsB).not.toContain(wsA1.body.id);
    expect(idsB).not.toContain(wsA2.body.id);
  });

  it("rejects oversized uploads with 413", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie, "Oversize WS");
    // A real (ZIP) package that exceeds the declared maxBytes: content
    // sniffing passes, then the streaming write rejects it as too large.
    const big = await makePackage();

    const res = await uploadPackage(cookie, ws.body.id, big, { maxBytes: 1024 }).expect(413);
    expect(res.body.error.code).toBe("ARTIFACT_TOO_LARGE");
  });

  it("rejects non-ZIP containers with PACKAGE_UNSUPPORTED", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie, "Bad Package WS");
    const notZip = Buffer.from("this is definitely not a zip container at all");

    const res = await uploadPackage(cookie, ws.body.id, notZip).expect(422);
    expect(res.body.error.code).toBe("PACKAGE_UNSUPPORTED");
  });

  it("rejects corrupt ZIP containers with PACKAGE_UNPACK_FAILED", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie, "Corrupt WS");
    // Valid ZIP magic but a truncated/garbage central directory.
    const corrupt = Buffer.concat([
      Buffer.from([0x50, 0x4b, 0x03, 0x04]),
      Buffer.alloc(64, 0x42),
    ]);

    const res = await uploadPackage(cookie, ws.body.id, corrupt).expect(422);
    expect(res.body.error.code).toBe("PACKAGE_UNPACK_FAILED");
  });
});

// ---------------------------------------------------------------------------
// Audit events
// ---------------------------------------------------------------------------

describe("audit events", () => {
  it("records login, logout, upload, plan confirmation, build start, download, workspace deletion", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    await request(server).post("/api/auth/logout").set("Cookie", cookie).expect(204);
    const cookie2 = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie2, "Audit WS");
    const uploaded = await uploadPackage(cookie2, ws.body.id, await makePackage()).expect(201);
    const packageUrl = uploaded.body.packageUrl as string;
    const conv = await createConversation(cookie2, ws.body.id, "Audit");
    const planHash = await planRequirement(cookie2, conv.body.id);
    await resume(cookie2, conv.body.id, { action: "approve", planHash }).expect(200);
    const issued = await request(server)
      .post(`/api/artifacts/${packageUrl}/download-token`)
      .set("Cookie", cookie2)
      .expect(200);
    await request(server)
      .get(`/api/artifacts/download/${issued.body.token}`)
      .set("Cookie", cookie2)
      .expect(200);
    await request(server)
      .delete(`/api/workspaces/${ws.body.id}`)
      .set("Cookie", cookie2)
      .send({ confirm: true })
      .expect(204);

    const acmeId = await tenantIdOf(TENANT_A.tenant);
    const actions = await prisma.auditLog.findMany({
      where: { tenantId: acmeId },
      orderBy: { createdAt: "asc" },
    });
    const names = actions.map((row) => row.action);
    expect(names).toContain("LOGIN_SUCCESS");
    expect(names).toContain("LOGOUT");
    expect(names).toContain("UPLOAD");
    expect(names).toContain("PLAN_CONFIRMED");
    expect(names).toContain("BUILD_START");
    expect(names).toContain("DOWNLOAD");
    expect(names).toContain("DESTRUCTIVE_CONFIRM");
    expect(names).toContain("WORKSPACE_DELETED");
  });

  it("records tenant creation and platform-admin content access", async () => {
    const platformCookie = await login(PLATFORM);
    const created = await request(server)
      .post("/api/tenants")
      .set("Cookie", platformCookie)
      .send({ name: "Audit Tenant", username: "auditadmin", temporaryPassword: "OneTimePass-123" })
      .expect(201);

    // The platform admin reads the new tenant's content: audit-trailed.
    await request(server)
      .get(`/api/tenants/${created.body.tenantId}`)
      .set("Cookie", platformCookie)
      .expect(200);

    // TENANT_CREATED is recorded in the new tenant's own audit context (with
    // the acting platform admin in actorUserId); content access is recorded in
    // the tenant being accessed.
    const auditTenantId = created.body.tenantId;
    const tenantActions = await prisma.auditLog.findMany({
      where: { tenantId: auditTenantId },
      orderBy: { createdAt: "asc" },
    });
    const names = tenantActions.map((row) => row.action);
    expect(names).toContain("TENANT_CREATED");
    expect(names).toContain("PLATFORM_ADMIN_CONTENT_ACCESS");
  });
});

// ---------------------------------------------------------------------------
// Hardening fixes (I1-I4) from review
// ---------------------------------------------------------------------------

describe("hardening fixes", () => {
  it("returns a fixed REST error when graph resume fails with internal details", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie, "Safe graph resume error");
    await uploadPackage(cookie, ws.body.id, await makePackage()).expect(201);
    const conv = await createConversation(cookie, ws.body.id, "Safe graph error");
    const planHash = await planRequirement(cookie, conv.body.id);
    const absolutePath = "/private/var/kf-agent/customer/workspace.kcp";
    const signature = "signature-5ad19df3c0f34819";
    const secret = "KF_SECRET_SENTINEL_9e30bd";
    const technicalPlan = JSON.stringify({ schema: "kf-module-plan/v1", signature, secret });
    const graph = await app.get(ConversationService)["getGraph"]();
    const originalStream = graph.stream.bind(graph);
    graph.stream = async () => { throw new Error(`COMPILER_BUG ${absolutePath} ${technicalPlan}`); };
    let response;
    try {
      response = await resume(cookie, conv.body.id, { action: "revise", planHash }).expect(409);
    } finally {
      graph.stream = originalStream;
    }

    expect(response.body).toEqual({
      error: { code: "GRAPH_ERROR", message: "对话处理失败，请重试" },
    });
    const serialized = JSON.stringify(response.body);
    for (const sentinel of [absolutePath, technicalPlan, signature, secret, "COMPILER_BUG"]) {
      expect(serialized).not.toContain(sentinel);
    }
  });

  it("rejects a repeated resume and never duplicates audit events (I1)", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie, "Replay WS");
    await uploadPackage(cookie, ws.body.id, await makePackage()).expect(201);
    const conv = await createConversation(cookie, ws.body.id, "Replay");
    const planHash = await planRequirement(cookie, conv.body.id);

    await resume(cookie, conv.body.id, { action: "approve", planHash }).expect(200);

    const acmeId = await tenantIdOf(TENANT_A.tenant);
    const countOf = async (action) =>
      prisma.auditLog.count({ where: { tenantId: acmeId, action } });
    expect(await countOf("PLAN_CONFIRMED")).toBe(1);
    expect(await countOf("BUILD_START")).toBe(1);

    // Second resume with the same planHash: no pending interrupt -> 409, and
    // the audit trail stays untouched (no fabricated events).
    await resume(cookie, conv.body.id, { action: "approve", planHash })
      .expect(409)
      .expect(({ body }) => {
        expect(body.error.code).toBe("NO_PENDING_APPROVAL");
      });
    expect(await countOf("PLAN_CONFIRMED")).toBe(1);
    expect(await countOf("BUILD_START")).toBe(1);
  });

  it("cleans up the temporary import directory after upload (I2)", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie, "TmpCleanup WS");
    const listImportDirs = async () =>
      (await readdir(tmpdir())).filter((name) => name.startsWith("kf-source-import-"));
    const before = await listImportDirs();

    await uploadPackage(cookie, ws.body.id, await makePackage()).expect(201);

    const after = await listImportDirs();
    expect(after.length).toBe(before.length);
  });

  it("deletes artifact storage files when the workspace is deleted (I3)", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie, "StorageCleanup WS");
    const uploaded = await uploadPackage(cookie, ws.body.id, await makePackage()).expect(201);
    const packageUrl = uploaded.body.packageUrl as string;

    // Simulate a built artifact: job + Artifact row + a real storage file.
    const job = await prisma.buildJob.create({
      data: {
        tenantId: ws.body.tenantId,
        workspaceId: ws.body.id,
        baseRevisionId: uploaded.body.revision.id,
        changePlanId: "cp-storage-cleanup",
        planHash: "0".repeat(64),
        domainKind: "kingclient",
        idempotencyKey: `idem-storage-${Date.now()}`,
        status: "QUEUED",
      },
    });
    const built = await storage.put({
      tenantId: ws.body.tenantId,
      kind: "client-package",
      stream: Readable.from(Buffer.from("built-artifact")),
      maxBytes: 1024,
    });
    await prisma.artifact.create({
      data: {
        tenantId: ws.body.tenantId,
        buildJobId: job.id,
        kind: "client-package",
        storageKey: built.artifactId,
      },
    });

    await request(server)
      .delete(`/api/workspaces/${ws.body.id}`)
      .set("Cookie", cookie)
      .send({ confirm: true })
      .expect(204);

    // Storage files for both the source package and the built artifact are gone.
    await expect(storage.open(ws.body.tenantId, packageUrl)).rejects.toThrow();
    await expect(storage.open(ws.body.tenantId, built.artifactId)).rejects.toThrow();
    // DB rows are gone too.
    expect(await prisma.artifact.count({ where: { tenantId: ws.body.tenantId } })).toBe(0);
  });

  it("maps the brief's direct download path to an explicit 404 (I4)", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const res = await request(server)
      .get("/api/artifacts/some-id/download")
      .set("Cookie", cookie)
      .expect(404);
    expect(res.body.message).toContain("download-token");
  });

  it("fences concurrent resumes: one approve wins and audit stays single (I1 concurrency)", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createUploadWorkspace(cookie, "Concurrent Resume WS");
    await uploadPackage(cookie, ws.body.id, await makePackage()).expect(201);
    const conv = await createConversation(cookie, ws.body.id, "Concurrent");
    const planHash = await planRequirement(cookie, conv.body.id);

    // Three resumes of the same conversation race at the same time. The
    // The shared durable turn lease admits exactly one graph writer. Every
    // loser fails fast before checkpoint access or audit side effects.
    const [r1, r2, r3] = await Promise.all([
      resume(cookie, conv.body.id, { action: "approve", planHash }),
      resume(cookie, conv.body.id, { action: "approve", planHash }),
      resume(cookie, conv.body.id, { action: "approve", planHash }),
    ]);

    const statuses = [r1.status, r2.status, r3.status].sort((a, b) => a - b);
    expect(statuses).toEqual([200, 409, 409]);

    const ok = [r1, r2, r3].find((r) => r.status === 200);
    expect(ok.body.stage).toBe("building"); // enqueue-build only confirms durable queueing
    expect(ok.body.buildJobId).toBeTruthy();
    const conflicts = [r1, r2, r3].filter((r) => r.status === 409);
    expect(conflicts).toHaveLength(2);
    for (const conflict of conflicts) {
      expect(conflict.body.error.code).toBe("CONVERSATION_TURN_IN_PROGRESS");
    }

    const acmeId = await tenantIdOf(TENANT_A.tenant);
    expect(
      await prisma.auditLog.count({ where: { tenantId: acmeId, action: "PLAN_CONFIRMED" } }),
    ).toBe(1);
    expect(
      await prisma.auditLog.count({ where: { tenantId: acmeId, action: "BUILD_START" } }),
    ).toBe(1);
    expect(await prisma.buildJob.count({ where: { workspaceId: ws.body.id } })).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Task 12: customer UI API surface (change-plan details, build artifacts, report)
// ---------------------------------------------------------------------------

describe("task 12 api surface", () => {
  function signedDeliveryState({ operations = [], repairAttempt = 1, modules = ["footer", "hero"], revisionId = "revision-1", projectKey = "kingclient" } = {}) {
    const planModules = modules.map((id, order) => ({
      id,
      kind: id === "footer" ? "content.contact-footer" : "content.hero",
      templateVersion: "1.0.0",
      variant: "default",
      title: id,
      sourceBlueprintModuleIds: [id],
      interactions: [],
      placement: { region: id === "footer" ? "footer" : "main", order, columnSpan: 12, preferredHeight: "medium", alignment: "stretch", emphasis: id === "hero" ? "primary" : "secondary" },
    }));
    const plan = {
      schema: "kf-module-plan/v1",
      projectKey,
      theme: { background: "#ffffff", surface: "#f8fafc", primary: "#2563eb", accent: "#0ea5e9", textPrimary: "#0f172a", textSecondary: "#475569", fontFamily: "Arial", spacingUnit: 8, radiusScale: { small: 4, medium: 8, large: 16 } },
      assets: [], pages: [{ id: "home", title: "Home", mode: "vertical-flow", modules: planModules }], operations,
    };
    const metadata = {
      schema: "kf-module-compilation-metadata/v1", projectKey,
      moduleDefinitions: planModules.map((module) => ({ pageId: "home", moduleId: module.id, kind: module.kind, templateVersion: module.templateVersion, compilerFingerprint: `${module.id}-compiler-v1`, layoutFingerprint: `${module.id}-layout-v1` })),
      assets: [], blueprintMappings: [],
    };
    const modulePlanHash = canonicalModuleCompilationHash(plan);
    const artifact = moduleArtifactAuthority.signModuleCompilation({
      schema: "kf-module-compilation-artifact/v1", projectKey, revisionId,
      acceptedBlueprintHash: "a".repeat(64), planHash: modulePlanHash, implementationHash: "b".repeat(64),
      metadataHash: canonicalModuleCompilationHash(metadata), sourceModuleIds: [...modules].sort(), metadata,
    });
    return {
      modulePlanHash, modulePlan: plan, moduleCompilationArtifact: artifact,
      moduleDeliveryReport: { schema: "kf-module-delivery/v1", projectKey, status: "ready", gaps: [] },
      moduleRepairAttempt: repairAttempt, currentRevisionId: revisionId, uiImplementationHash: "b".repeat(64),
    };
  }

  it("never exposes a technical plan approval for a confirmed mapped v2 blueprint", async () => {
    fakeModel.mappedBlueprint = true;
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Mapped Blueprint WS", "module-v1");
    const conv = await createConversation(cookie, ws.body.id, "Mapped Blueprint");

    fakeModel.queueIntent("NEW_REQUIREMENT");
    await sendMessage(cookie, conv.body.id, "生成模块化个人门户").expect(200);
    fakeModel.queueIntent("CONFIRM_DESIGN");
    const confirmed = await sendMessage(cookie, conv.body.id, "确认效果蓝图").expect(200);
    const done = doneEvent(confirmed.text);

    expect(done.data.interrupt).toBeUndefined();
    expect(done.data.stage).not.toBe("approval");
    expect(JSON.stringify(done.data)).not.toMatch(/kf-module-plan|kf-change-plan|semanticOperations|signature/);
    const stateFrames = parseSse(confirmed.text).filter((event) => event.event === "state");
    expect(stateFrames.length).toBeGreaterThan(0);
    expect(stateFrames.every((frame) => {
      const value = frame.data as Record<string, unknown>;
      return Object.keys(value).length === 1 && typeof value.progressCode === "string";
    })).toBe(true);
    expect(JSON.stringify(stateFrames)).not.toMatch(/kf-module-plan|kf-change-plan|kf-ui-implementation|signature|metadata|semanticOperations|moduleCompilationArtifact|uiImplementation/);
  });

  it("automatically builds a confirmed module blueprint after exact KF evidence is promoted", async () => {
    fakeModel.mappedBlueprint = true;
    fakeModel.blueprintModuleIds = ["main"];
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Task13 automatic module build", "module-v1");
    const conv = await createConversation(cookie, ws.body.id, "Task13 automatic module build");

    fakeModel.queueIntent("NEW_REQUIREMENT");
    const proposed = doneEvent((await sendMessage(cookie, conv.body.id, "生成模块化个人门户").expect(200)).text);
    expect(proposed.data.stage).toBe("design-review");
    expect(proposed.data.interrupt).toBeUndefined();

    fakeModel.queueIntent("CONFIRM_DESIGN");
    const confirmed = doneEvent((await sendMessage(cookie, conv.body.id, "确认效果蓝图").expect(200)).text);
    expect(confirmed.data.interrupt).toBeUndefined();
    expect(confirmed.data.stage).not.toBe("design-review");
    expect(confirmed.data.lastErrorCode).toBeNull();
    expect(confirmed.data.buildJobId).toEqual(expect.any(String));
    expect(await prisma.buildJob.count({ where: { workspaceId: ws.body.id } })).toBe(1);
  });

  it("keeps the signed base revision authoritative after a real module build advances the workspace revision", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Real module lifecycle WS");
    const conv = await createConversation(cookie, ws.body.id, "Real module lifecycle");
    fakeModel.queueIntent("NEW_REQUIREMENT");
    await sendMessage(cookie, conv.body.id, "生成个人门户").expect(200);
    fakeModel.queueIntent("CONFIRM_DESIGN");
    const confirmed = doneEvent((await sendMessage(cookie, conv.body.id, "确认效果蓝图").expect(200)).text);
    await resume(cookie, conv.body.id, { action: "approve", planHash: confirmed.data.interrupt?.planHash }).expect(200);
    const queued = await prisma.buildJob.findFirstOrThrow({ where: { workspaceId: ws.body.id }, orderBy: { createdAt: "desc" } });
    const tenantId = await tenantIdOf(TENANT_A.tenant);
    const graph = await app.get(ConversationService)["getGraph"]();
    await graph.updateState({ configurable: { thread_id: conv.body.id } }, {
      ...signedDeliveryState({ revisionId: queued.baseRevisionId }), tenantId,
      workspaceId: ws.body.id, conversationId: conv.body.id, buildJobId: queued.id,
      changePlanId: queued.changePlanId, planHash: queued.planHash, currentRevisionId: queued.baseRevisionId,
    });
    const built = await runNextBuild("task12-real-module-build");
    expect(built.status).toBe("SUCCEEDED");

    fakeModel.queueIntent("CONFIRM_BUILD");
    const landed = doneEvent((await sendMessage(cookie, conv.body.id, "确认落地").expect(200)).text);
    expect(landed.data.stage).toBe("done");
    const workspace = await request(server).get(`/api/workspaces/${ws.body.id}`).set("Cookie", cookie).expect(200);
    expect(workspace.body.currentRevisionId).not.toBe(built.baseRevisionId);

    const recovered = await request(server).get(`/api/conversations/${conv.body.id}/delivery`).set("Cookie", cookie).expect(200);
    expect(recovered.body).toMatchObject({
      conversationId: conv.body.id,
      buildJobId: queued.id,
      artifactId: expect.any(String),
      revisionId: workspace.body.currentRevisionId,
      buildJob: { id: queued.id, status: "SUCCEEDED" },
      artifact: { id: expect.any(String), buildJobId: queued.id, kind: "client-package" },
      revision: { id: workspace.body.currentRevisionId },
      result: { status: expect.stringMatching(/^ready/) },
    });
    await request(server).get(`/api/artifacts/${recovered.body.artifactId}/preview`).set("Cookie", cookie).expect(200);
    await request(server).post(`/api/artifacts/${recovered.body.artifactId}/download-token`).set("Cookie", cookie).expect(200);
  });

  it("preserves exact compiler-blocked gaps without a module plan or compilation artifact", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Compiler blocked WS");
    const conv = await createConversation(cookie, ws.body.id, "Compiler blocked");
    const tenantId = await tenantIdOf(TENANT_A.tenant);
    const accepted = moduleArtifactAuthority.signAcceptedBlueprint({
      schema: "kf-accepted-blueprint-artifact/v1",
      projectKey: "kingclient",
      revisionId: ws.body.currentRevisionId,
      blueprintHash: "f".repeat(64),
      modules: [{ blueprintModuleId: "source-panel", expectedKind: "content.hero", expectedCategory: "content", interactionRequirements: [] }],
    });
    const graph = await app.get(ConversationService)["getGraph"]();
    await graph.updateState({ configurable: { thread_id: conv.body.id } }, {
      tenantId, workspaceId: ws.body.id, conversationId: conv.body.id,
      currentRevisionId: ws.body.currentRevisionId,
      acceptedBlueprintArtifact: accepted,
      moduleDeliveryOwnerMappings: [{ blueprintModuleId: "source-panel", moduleId: "panel" }],
      moduleDeliveryReport: {
        schema: "kf-module-delivery/v1", projectKey: "kingclient", status: "blocked",
        gaps: [{ moduleId: "panel", requirement: "提供头像资源", severity: "blocking", status: "unresolved", reason: "缺少已批准头像", alternatives: ["上传头像"] }],
      },
      moduleRepairAttempt: 2,
    });

    const response = await request(server).get(`/api/conversations/${conv.body.id}/delivery`).set("Cookie", cookie).expect(200);
    expect(response.body).toMatchObject({
      buildJobId: null, artifactId: null, revisionId: null,
      result: {
        status: "blocked", repairCount: 2, implementedModules: [],
        gaps: [{ moduleId: "panel", requirement: "提供头像资源", reason: "缺少已批准头像", alternatives: ["上传头像"] }],
      },
    });

    await graph.updateState({ configurable: { thread_id: conv.body.id } }, {
      acceptedBlueprintArtifact: { ...accepted, signature: "0".repeat(64) },
    });
    const tampered = await request(server).get(`/api/conversations/${conv.body.id}/delivery`).set("Cookie", cookie).expect(200);
    expect(tampered.body).toMatchObject({
      artifactId: null, revisionId: null,
      result: { status: "blocked", gaps: [{ moduleId: "delivery", reason: "交付快照校验失败" }] },
    });

    await graph.updateState({ configurable: { thread_id: conv.body.id } }, {
      acceptedBlueprintArtifact: accepted,
      moduleDeliveryReport: {
        schema: "kf-module-delivery/v1", projectKey: "kingclient", status: "blocked",
        gaps: [{ moduleId: "unknown-owner", requirement: "未知缺口", severity: "blocking", status: "unresolved", reason: "未知 owner" }],
      },
    });
    const unknown = await request(server).get(`/api/conversations/${conv.body.id}/delivery`).set("Cookie", cookie).expect(200);
    expect(unknown.body).toMatchObject({
      result: { status: "blocked", gaps: [{ moduleId: "delivery", reason: "交付快照校验失败" }] },
    });
  });

  it("emits only a fixed customer-safe SSE error when an upstream model error contains technical JSON", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Safe SSE error WS");
    const conv = await createConversation(cookie, ws.body.id, "Safe SSE error");
    fakeModel.classificationError = new Error('DeepSeek 502 {"schema":"kf-module-plan/v1","signature":"secret","metadata":{"prompt":"raw"}}');

    const response = await sendMessage(cookie, conv.body.id, "触发上游错误").expect(200);
    const frames = parseSse(response.text);
    expect(frames.at(-1)).toEqual({
      event: "error",
      data: { code: "CONVERSATION_FAILED", message: "对话处理失败，请重试" },
    });
    expect(JSON.stringify(frames)).not.toMatch(/DeepSeek|kf-module-plan|signature|secret|metadata|prompt|raw|502/);
  });

  it("projects only bounded customer delivery fields from the technical graph state", () => {
    const values = signedDeliveryState({
      operations: [{ op: "update", pageId: "home", moduleId: "hero", changes: {} }],
      repairAttempt: 2,
    });
    values.moduleDeliveryReport = {
      schema: "kf-module-delivery/v1", projectKey: "kingclient", status: "ready_with_warnings",
      gaps: [{ moduleId: "hero", requirement: "使用轻量阴影", severity: "warning", status: "unresolved", reason: "运行时仅支持基础阴影" }],
    };
    const data = finalStateData({
      values: {
        ...values,
        stage: "building",
        secretModelPrompt: "must-not-leak",
      },
      tasks: [],
    }, moduleArtifactAuthority);

    expect(data).toMatchObject({
      modulePlanHash: values.modulePlanHash,
      moduleDeliveryResult: {
        projectKey: "kingclient",
        status: "ready_with_warnings",
        repairCount: 2,
        implementedModules: expect.arrayContaining([
          { pageId: "home", moduleId: "footer", kind: "content.contact-footer" },
          { pageId: "home", moduleId: "hero", kind: "content.hero" },
        ]),
        revisionDiff: { changedModules: ["hero"], preservedModules: ["footer"] },
      },
    });
    expect(JSON.stringify(data)).not.toMatch(/kf-module-plan|secretModelPrompt|must-not-leak|signature/);
  });

  it("rejects accessor-backed blocked owner mappings before schema projection", () => {
    const accepted = moduleArtifactAuthority.signAcceptedBlueprint({
      schema: "kf-accepted-blueprint-artifact/v1", projectKey: "kingclient", revisionId: "revision-1",
      blueprintHash: "7".repeat(64), modules: [{ blueprintModuleId: "source-panel", expectedKind: "content.hero", expectedCategory: "content", interactionRequirements: [] }],
    });
    const mappings = [];
    Object.defineProperty(mappings, "0", {
      enumerable: true,
      get: () => ({ blueprintModuleId: "source-panel", moduleId: "panel" }),
    });
    Object.defineProperty(mappings, "length", { value: 1, writable: true });
    const result = finalStateData({ values: {
      currentRevisionId: "revision-1", acceptedBlueprintArtifact: accepted,
      moduleDeliveryOwnerMappings: mappings, moduleRepairAttempt: 1,
      moduleDeliveryReport: {
        schema: "kf-module-delivery/v1", projectKey: "kingclient", status: "blocked",
        gaps: [{ moduleId: "panel", requirement: "完成模块", severity: "blocking", status: "unresolved", reason: "测试" }],
      },
    }, tasks: [] }, moduleArtifactAuthority).moduleDeliveryResult;
    expect(result).toBeUndefined();
  });

  it("does not claim a ready delivery from an invalid technical module snapshot", () => {
    const data = finalStateData({
      values: {
        modulePlanHash: "2".repeat(64),
        moduleDeliveryReport: {
          schema: "kf-module-delivery/v1",
          projectKey: "kingclient",
          status: "ready",
          gaps: [],
        },
        modulePlan: { schema: "kf-module-plan/v1", leaked: "internal" },
        moduleCompilationArtifact: { metadata: { moduleDefinitions: [] } },
      },
      tasks: [],
    }, moduleArtifactAuthority);

    expect(data.moduleDeliveryResult).toBeUndefined();
    expect(JSON.stringify(data)).not.toContain("internal");
  });

  it("rejects stale or tampered signed module artifacts and repair attempts outside the contract", () => {
    const valid = signedDeliveryState();
    const tampered = { ...valid.moduleCompilationArtifact, signature: "0".repeat(64) };
    expect(finalStateData({ values: { ...valid, moduleCompilationArtifact: tampered }, tasks: [] }, moduleArtifactAuthority).moduleDeliveryResult).toBeUndefined();
    expect(finalStateData({ values: { ...valid, currentRevisionId: "revision-stale" }, tasks: [] }, moduleArtifactAuthority).moduleDeliveryResult).toBeUndefined();
    expect(finalStateData({ values: { ...valid, moduleRepairAttempt: 4 }, tasks: [] }, moduleArtifactAuthority).moduleDeliveryResult).toBeUndefined();
  });

  it("treats an initial operations-empty module plan as entirely changed", () => {
    const values = signedDeliveryState({ operations: [] });
    const result = finalStateData({ values, tasks: [] }, moduleArtifactAuthority).moduleDeliveryResult;
    expect(result.revisionDiff).toEqual({ changedModules: ["footer", "hero"], preservedModules: [] });
  });

  it("projects exact add, remove, changed, and unchanged revision modules", () => {
    const added = {
      id: "contact", kind: "content.hero", templateVersion: "1.0.0", variant: "default", title: "contact",
      sourceBlueprintModuleIds: ["contact"], interactions: [],
      placement: { region: "main", order: 0, columnSpan: 12, preferredHeight: "medium", alignment: "stretch", emphasis: "secondary" },
    };
    const values = signedDeliveryState({
      modules: ["contact", "footer", "hero"],
      operations: [
        { op: "add", pageId: "home", module: added },
        { op: "update", pageId: "home", moduleId: "hero", changes: { title: "hero" } },
        { op: "remove", pageId: "home", moduleId: "oldModule" },
      ],
    });
    const result = finalStateData({ values, tasks: [] }, moduleArtifactAuthority).moduleDeliveryResult;
    expect(result.revisionDiff).toEqual({ changedModules: ["contact", "hero", "oldModule"], preservedModules: ["footer"] });
  });

  it("filters historical assistant technical JSON variants at the API boundary without altering user prose", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Message filter WS");
    const conv = await createConversation(cookie, ws.body.id, "Message filter");
    const tenantId = await tenantIdOf(TENANT_A.tenant);
    const contents = [
      '```json\n{"schema":"kf-module-plan/v1","pages":[]}\n```',
      '内部结果如下：\n{"schema":"kf-change-plan/v1","operations":[],"signature":"secret"}',
      '{"metadata":{"schema":"kf-module-compilation-metadata/v1"},"signature":"secret"}',
      '前置 {不是 JSON} 干扰，然后 {"schema":"kf-module-plan/v1","title":"brace } in string","pages":[]} 后置说明',
      '代码示例：```ts\nconst value = { normal: true };\n```',
      '{"kind":"customer-summary","metadata":{"label":"普通 JSON"}}',
    ];
    for (const content of contents) await prisma.message.create({ data: { tenantId, conversationId: conv.body.id, role: "assistant", content } });
    await prisma.message.create({ data: { tenantId, conversationId: conv.body.id, role: "user", content: "请解释 signature 这个普通英文词" } });

    const response = await request(server).get(`/api/conversations/${conv.body.id}/messages`).set("Cookie", cookie).expect(200);
    expect(response.body.slice(0, 4).every((row) => !/kf-module-plan|kf-change-plan|secret|signature/.test(row.content))).toBe(true);
    expect(response.body[4].content).toContain("const value");
    expect(response.body[5].content).toContain("customer-summary");
    expect(response.body[6].content).toBe("请解释 signature 这个普通英文词");
  });

  it("fails closed at direct preview and download-token routes for a non-deliverable module build", async () => {
    fakeModel.mappedBlueprint = true;
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Blocked artifact gate WS");
    const conv = await createConversation(cookie, ws.body.id, "Blocked artifact gate");
    fakeModel.queueIntent("NEW_REQUIREMENT");
    await sendMessage(cookie, conv.body.id, "生成模块门户").expect(200);
    fakeModel.queueIntent("CONFIRM_DESIGN");
    await sendMessage(cookie, conv.body.id, "确认效果蓝图").expect(200);
    const tenantId = await tenantIdOf(TENANT_A.tenant);
    const planHash = "d".repeat(64);
    const persistedJob = await prisma.buildJob.create({ data: {
      tenantId, workspaceId: ws.body.id, baseRevisionId: ws.body.currentRevisionId,
      changePlanId: "manual-module-plan", planHash, domainKind: "kingclient",
      idempotencyKey: `${conv.body.id}:manual-module-plan:${planHash}`, status: "FAILED",
    } });
    const graph = await app.get(ConversationService)["getGraph"]();
    await graph.updateState(
      { configurable: { thread_id: conv.body.id } },
      {
        ...signedDeliveryState(), tenantId, workspaceId: ws.body.id, conversationId: conv.body.id,
        buildJobId: persistedJob.id, changePlanId: persistedJob.changePlanId, planHash: persistedJob.planHash,
        currentRevisionId: persistedJob.baseRevisionId,
      },
    );
    const stored = await storage.put({ tenantId, kind: "client-package", stream: Readable.from([Buffer.from("not-renderable")]), maxBytes: 1024 });
    const artifact = await prisma.artifact.create({ data: { tenantId, buildJobId: persistedJob.id, kind: "client-package", storageKey: stored.artifactId, sizeBytes: stored.sizeBytes, sha256: stored.sha256 } });

    await request(server).post(`/api/artifacts/${artifact.id}/download-token`).set("Cookie", cookie).expect(409);
    await request(server).get(`/api/artifacts/${artifact.id}/preview`).set("Cookie", cookie).expect(409);
  });

  it("restores a tenant/workspace/job-bound warning snapshot and becomes blocked after build failure", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Persisted delivery WS");
    const conv = await createConversation(cookie, ws.body.id, "Persisted delivery");
    const tenantId = await tenantIdOf(TENANT_A.tenant);
    const buildPlanHash = "e".repeat(64);
    const job = await prisma.buildJob.create({ data: {
      tenantId, workspaceId: ws.body.id, baseRevisionId: ws.body.currentRevisionId,
      changePlanId: "persisted-module-plan", planHash: buildPlanHash, domainKind: "kingclient",
      idempotencyKey: `${conv.body.id}:persisted-module-plan:${buildPlanHash}`, status: "SUCCEEDED",
    } });
    const artifact = await prisma.artifact.create({ data: { tenantId, buildJobId: job.id, kind: "client-package", storageKey: "persisted-artifact", sha256: "c".repeat(64) } });
    const latestRevision = await prisma.solutionRevision.findFirstOrThrow({ where: { workspaceId: ws.body.id }, orderBy: { revisionNumber: "desc" } });
    const revision = await prisma.solutionRevision.create({ data: {
      tenantId, workspaceId: ws.body.id, changePlanId: job.changePlanId, revisionNumber: latestRevision.revisionNumber + 1,
      kind: "build", parentRevisionId: job.baseRevisionId, state: {},
    } });
    await prisma.domainProjectRevision.create({ data: {
      tenantId, solutionRevisionId: revision.id, projectKey: "kingclient", domainKind: "kingclient",
      kind: "client-package", packageUrl: artifact.storageKey, packageHash: artifact.sha256,
    } });
    const values = signedDeliveryState({ revisionId: job.baseRevisionId });
    values.moduleDeliveryReport = {
      schema: "kf-module-delivery/v1", projectKey: "kingclient", status: "ready_with_warnings",
      gaps: [{ moduleId: "hero", requirement: "保留轻微差异", severity: "warning", status: "unresolved", reason: "警告应在刷新后持续可见" }],
    };
    const graph = await app.get(ConversationService)["getGraph"]();
    await graph.updateState({ configurable: { thread_id: conv.body.id } }, {
      ...values, tenantId, workspaceId: ws.body.id, conversationId: conv.body.id, buildJobId: job.id,
      changePlanId: job.changePlanId, planHash: job.planHash, currentRevisionId: job.baseRevisionId,
    });

    const restored = await request(server)
      .get(`/api/conversations/${conv.body.id}/delivery?buildJobId=${job.id}`)
      .set("Cookie", cookie).expect(200);
    expect(restored.body).toMatchObject({
      tenantId, workspaceId: ws.body.id, conversationId: conv.body.id, buildJobId: job.id,
      artifactId: artifact.id, revisionId: revision.id,
      result: { status: "ready_with_warnings", gaps: [{ reason: "警告应在刷新后持续可见" }] },
    });
    const staleArtifact = await prisma.artifact.create({ data: {
      tenantId, buildJobId: job.id, kind: "client-package", storageKey: "stale-artifact", createdAt: new Date(0),
    } });
    await request(server).post(`/api/artifacts/${artifact.id}/download-token`).set("Cookie", cookie).expect(200);
    await request(server).post(`/api/artifacts/${staleArtifact.id}/download-token`).set("Cookie", cookie).expect(409);

    await prisma.buildJob.update({ where: { id: job.id }, data: { status: "FAILED" } });
    const blocked = await request(server)
      .get(`/api/conversations/${conv.body.id}/delivery?buildJobId=${job.id}`)
      .set("Cookie", cookie).expect(200);
    expect(blocked.body).toMatchObject({ artifactId: null, revisionId: null, result: { status: "blocked" } });
  });

  it("accepts the canonical conversation and non-default projectKey build identity without weakening artifact gates", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Project-key delivery WS");
    const conv = await createConversation(cookie, ws.body.id, "Project-key delivery");
    const tenantId = await tenantIdOf(TENANT_A.tenant);
    const projectKey = "kingclient.portal";
    const planHash = "9".repeat(64);
    const changePlanId = "portal-change";
    const job = await prisma.buildJob.create({ data: {
      tenantId, workspaceId: ws.body.id, baseRevisionId: ws.body.currentRevisionId,
      changePlanId, planHash, projectKey, domainKind: "kingclient",
      idempotencyKey: `${conv.body.id}:${projectKey}:${changePlanId}:${planHash}`, status: "SUCCEEDED",
    } });
    const artifact = await prisma.artifact.create({ data: {
      tenantId, buildJobId: job.id, kind: "client-package", storageKey: "portal-package", sha256: "8".repeat(64),
    } });
    const latest = await prisma.solutionRevision.findFirstOrThrow({ where: { tenantId, workspaceId: ws.body.id }, orderBy: { revisionNumber: "desc" } });
    const revision = await prisma.solutionRevision.create({ data: {
      tenantId, workspaceId: ws.body.id, changePlanId, revisionNumber: latest.revisionNumber + 1,
      kind: "built", parentRevisionId: job.baseRevisionId, state: {},
    } });
    await prisma.domainProjectRevision.create({ data: {
      tenantId, solutionRevisionId: revision.id, projectKey, domainKind: "kingclient", kind: "client-package",
      packageUrl: artifact.storageKey, packageHash: artifact.sha256,
    } });
    const graph = await app.get(ConversationService)["getGraph"]();
    await graph.updateState({ configurable: { thread_id: conv.body.id } }, {
      ...signedDeliveryState({ revisionId: job.baseRevisionId, projectKey }), tenantId,
      workspaceId: ws.body.id, conversationId: conv.body.id, buildJobId: job.id,
      changePlanId, planHash, currentRevisionId: job.baseRevisionId,
    });

    const recovered = await request(server).get(`/api/conversations/${conv.body.id}/delivery`).set("Cookie", cookie).expect(200);
    expect(recovered.body).toMatchObject({ buildJobId: job.id, artifactId: artifact.id, revisionId: revision.id, result: { projectKey, status: "ready" } });
    await request(server).post(`/api/artifacts/${artifact.id}/download-token`).set("Cookie", cookie).expect(200);
  });

  it("recovers a conversation-bound legacy build envelope without inventing module delivery state", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Legacy recovery WS");
    const conv = await createConversation(cookie, ws.body.id, "Legacy recovery");
    const planHash = await planRequirement(cookie, conv.body.id);
    await resume(cookie, conv.body.id, { action: "approve", planHash }).expect(200);
    const built = await runNextBuild("task12-legacy-recovery");
    expect(built.status).toBe("SUCCEEDED");

    const recovered = await request(server).get(`/api/conversations/${conv.body.id}/delivery`).set("Cookie", cookie).expect(200);
    expect(recovered.body).toMatchObject({
      conversationId: conv.body.id, buildJobId: built.id, artifactId: expect.any(String), revisionId: expect.any(String),
      result: null, buildJob: { id: built.id, status: "SUCCEEDED" }, artifact: { buildJobId: built.id, kind: "client-package" },
    });
  });

  it("delivers real Worker-produced creative bytes through projection, token issuance, and HTTP consumption", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Creative downloadable delivery", "creative-v2");
    const conv = await createConversation(cookie, ws.body.id, "Creative delivery");
    const tenantId = await tenantIdOf(TENANT_A.tenant);

    fakeModel.queueIntent("NEW_REQUIREMENT");
    const proposed = doneEvent((await sendMessage(cookie, conv.body.id, "创建园区访客协同中心").expect(200)).text);
    expect(proposed.data.stage).toBe("design-review");
    const confirmed = doneEvent((await sendMessage(
      cookie,
      conv.body.id,
      encodeBlueprintConfirmation(proposed.data.designRevision, proposed.data.designPlanHash),
    ).expect(200)).text);
    expect(confirmed.data).toMatchObject({ stage: "building", buildJobId: expect.any(String) });
    await request(server)
      .get(`/api/conversations/${conv.body.id}/delivery?buildJobId=${confirmed.data.buildJobId}`)
      .set("Cookie", cookie)
      .expect(200)
      .expect(({ body }) => expect(body.projectDelivery).toMatchObject({
        workflow: "creative-v2",
        status: "building",
        download: { available: false, tokenEndpoint: null },
      }));

    const built = await runNextBuild("creative-delivery-e2e");
    expect(built).toMatchObject({ id: confirmed.data.buildJobId, status: "SUCCEEDED" });
    const artifact = await prisma.artifact.findFirstOrThrow({ where: { tenantId, buildJobId: built.id } });
    const revision = await prisma.solutionRevision.findUniqueOrThrow({ where: { id: artifact.solutionRevisionId! } });
    const project = await prisma.domainProjectRevision.findFirstOrThrow({
      where: { tenantId, solutionRevisionId: revision.id, projectKey: built.projectKey, domainKind: built.domainKind },
    });

    const delivered = await request(server)
      .get(`/api/conversations/${conv.body.id}/delivery?buildJobId=${built.id}`)
      .set("Cookie", cookie).expect(200);
    expect(delivered.body).toMatchObject({
      artifactId: artifact.id,
      revisionId: revision.id,
      projectDelivery: {
        workflow: "creative-v2",
        projectKey: built.projectKey,
        status: "downloadable",
        artifactId: artifact.id,
        revisionId: revision.id,
        download: {
          available: true,
          tokenEndpoint: `/api/artifacts/${artifact.id}/download-token`,
        },
        kf36RuntimeVerification: {
          status: "not_performed",
          notice: "尚未经过人工 KingFusion 3.6 运行态验证",
        },
      },
    });
    expect(delivered.body.projectDelivery).not.toHaveProperty("preview");
    const issued = await request(server)
      .post(`/api/artifacts/${artifact.id}/download-token`)
      .set("Cookie", cookie)
      .expect(200);
    const downloaded = await request(server)
      .get(`/api/artifacts/download/${issued.body.token}`)
      .set("Cookie", cookie)
      .buffer(true)
      .parse(parseBinary)
      .expect(200);
    expect(createHash("sha256").update(downloaded.body).digest("hex")).toBe(artifact.sha256);
    expect(project).toMatchObject({ packageUrl: artifact.storageKey, packageHash: artifact.sha256 });
    const importRoot = await mkdtemp(path.join(tmpdir(), "kf-creative-http-import-"));
    try {
      const imported = await importNativeClientPackage(downloaded.body, importRoot);
      const inspection = await inspectClientProject(imported);
      expect(Object.keys(inspection.index.pages)).not.toHaveLength(0);
    } finally {
      await rm(importRoot, { recursive: true, force: true });
    }

    const issuedBeforeTamper = await request(server)
      .post(`/api/artifacts/${artifact.id}/download-token`)
      .set("Cookie", cookie)
      .expect(200);

    await prisma.artifact.update({
      where: { id: artifact.id },
      data: { creativeArtifactHash: "e".repeat(64) },
    });
    await request(server).post(`/api/artifacts/${artifact.id}/download-token`).set("Cookie", cookie).expect(409);
    await prisma.artifact.update({
      where: { id: artifact.id },
      data: { creativeArtifactHash: null },
    });
    await request(server).post(`/api/artifacts/${artifact.id}/download-token`).set("Cookie", cookie).expect(409);
    await prisma.artifact.update({
      where: { id: artifact.id },
      data: { nativeMaterializationHash: null },
    });
    await request(server).post(`/api/artifacts/${artifact.id}/download-token`).set("Cookie", cookie).expect(409);
    await request(server)
      .get(`/api/conversations/${conv.body.id}/delivery?buildJobId=${built.id}`)
      .set("Cookie", cookie)
      .expect(200)
      .expect(({ body }) => expect(body).toMatchObject({
        artifactId: null,
        revisionId: null,
        projectDelivery: {
          workflow: "creative-v2",
          status: "blocked",
          download: { available: false, tokenEndpoint: null },
        },
      }));
    await request(server)
      .get(`/api/artifacts/download/${issuedBeforeTamper.body.token}`)
      .set("Cookie", cookie)
      .expect(409);
  });

  it("compiles every confirmed blueprint module instead of persisting a Text1-only plan", async () => {
    const moduleIds = ["brand", "overview", "skills", "experience", "projects", "about", "contact"];
    fakeModel.blueprintModuleIds = moduleIds;
    try {
      const cookie = await login(TENANT_A_MEMBER);
      const ws = await createWorkspace(cookie, "Complete Blueprint WS");
      const conv = await createConversation(cookie, ws.body.id, "Complete Blueprint");

      fakeModel.queueIntent("NEW_REQUIREMENT");
      await sendMessage(cookie, conv.body.id, "生成完整的七模块个人网站").expect(200);
      fakeModel.queueIntent("CONFIRM_DESIGN");
      const confirmed = await sendMessage(cookie, conv.body.id, "确认效果蓝图").expect(200);
      const done = doneEvent(confirmed.text);
      expect(done.data.stage).toBe("approval");

      const plan = await request(server)
        .get(`/api/change-plans/${done.data.changePlanId}`)
        .set("Cookie", cookie)
        .expect(200);
      expect(plan.body.plan.operations).toHaveLength(moduleIds.length);
      expect(plan.body.plan.operations.map((operation) => operation.entityId)).toEqual(
        expect.arrayContaining(moduleIds.slice(1)),
      );
    } finally {
      fakeModel.blueprintModuleIds = ["main"];
    }
  });

  it("recompiles the complete implementation when the customer continues with a modification", async () => {
    const moduleIds = ["brand", "overview", "skills", "experience", "projects", "about", "contact"];
    fakeModel.blueprintModuleIds = moduleIds;
    fakeModel.layoutModuleId = "overview";
    try {
      const cookie = await login(TENANT_A_MEMBER);
      const ws = await createWorkspace(cookie, "Iterative Blueprint WS");
      const conv = await createConversation(cookie, ws.body.id, "Iterative Blueprint");

      fakeModel.queueIntent("NEW_REQUIREMENT");
      await sendMessage(cookie, conv.body.id, "生成完整个人网站").expect(200);
      fakeModel.queueIntent("CONFIRM_DESIGN");
      const confirmed = await sendMessage(cookie, conv.body.id, "确认效果蓝图").expect(200);
      const first = doneEvent(confirmed.text);
      await resume(cookie, conv.body.id, {
        action: "approve",
        planHash: first.data.interrupt?.planHash,
      }).expect(200);
      expect((await runNextBuild("api-mainline-first")).status).toBe("SUCCEEDED");

      fakeModel.queueIntent("MODIFY_REQUIREMENT");
      const revised = await sendMessage(cookie, conv.body.id, "把全部模块文案调整得更专业").expect(200);
      const second = doneEvent(revised.text);
      expect(second.data.stage).toBe("approval");
      const plan = await request(server)
        .get(`/api/change-plans/${second.data.changePlanId}`)
        .set("Cookie", cookie)
        .expect(200);
      expect(plan.body.plan.operations).toHaveLength(moduleIds.length);
      expect(plan.body.plan.operations.every((operation) => operation.op === "update")).toBe(true);
      const layoutUpdate = plan.body.plan.operations.find(
        (operation) => operation.entityType === "control"
          && operation.changes?.some((change) => change.path === "/x"),
      );
      expect(layoutUpdate?.changes).toEqual(expect.arrayContaining([
        { path: "/x", value: 60 },
      ]));
      expect(layoutUpdate?.changes).not.toContainEqual({ path: "/children", value: [] });
      expect(fakeModel.reviseCalls).toHaveLength(1);

      await resume(cookie, conv.body.id, {
        action: "approve",
        planHash: second.data.interrupt?.planHash,
      }).expect(200);
      const secondBuild = await runNextBuild("api-mainline-second");
      expect(secondBuild.status).toBe("SUCCEEDED");
      const artifact = await prisma.artifact.findFirstOrThrow({
        where: { buildJobId: secondBuild.id },
      });
      const stream = await storage.open(ws.body.tenantId, artifact.storageKey);
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer | string>) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
      }
      const unpacked = await importNativeClientPackage(
        Buffer.concat(chunks),
        await mkdtemp(path.join(tmpdir(), "kf-api-mainline-check-")),
      );
      const inspection = await inspectClientProject(unpacked);
      expect(Object.values(inspection.index.controls)).toHaveLength(moduleIds.length + 1);
      expect(Object.values(inspection.index.controls)).toEqual(expect.arrayContaining([
        expect.objectContaining({ id: "MainLayout", capabilityId: "layout.2", x: 60 }),
        expect.objectContaining({ id: "NestedLayout", capabilityId: "layout.4" }),
      ]));
    } finally {
      fakeModel.blueprintModuleIds = ["main"];
      fakeModel.layoutModuleId = undefined;
    }
  });

  it("serves the change-plan details shown in the confirmation UI", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "PlanDetail WS");
    const conv = await createConversation(cookie, ws.body.id, "Plan");
    fakeModel.queueIntent("NEW_REQUIREMENT");
    await sendMessage(cookie, conv.body.id, "新增一个按钮").expect(200);
    fakeModel.queueIntent("CONFIRM_DESIGN");
    const res = await sendMessage(cookie, conv.body.id, "确认").expect(200);
    const done = doneEvent(res.text);
    const changePlanId = done.data.changePlanId;
    if (typeof changePlanId !== "string") {
      throw new Error("expected changePlanId in SSE done event");
    }
    expect(done.data.interrupt?.planHash).toMatch(/^[0-9a-f]{64}$/);

    const plan = await request(server)
      .get(`/api/change-plans/${changePlanId}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(plan.body.planHash).toBe(done.data.interrupt?.planHash);
    expect(plan.body.plan.schema).toBe("kf-change-plan/v1");
    expect(Array.isArray(plan.body.plan.operations)).toBe(true);
    expect(plan.body.plan.operations.length).toBeGreaterThan(0);
    expect(JSON.stringify(plan.body)).not.toMatch(/signature|semanticOperations|sourceModuleId/);
  });

  it("fails closed for a corrupt internal or envelope-like plan without leaking server fields", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Corrupt Plan WS");
    const row = await prisma.changePlan.create({
      data: {
        tenantId: ws.body.tenantId,
        workspaceId: ws.body.id,
        planHash: "0".repeat(64),
        plan: {
          schema: "kf-server-plan-envelope/v1",
          plan: { schema: "kf-change-plan/v1", workspaceId: ws.body.id, operations: [] },
          planHash: "0".repeat(64),
          revisionId: "revision-1",
          semanticOperations: [{ sourceModuleId: "must-not-leak" }],
          signature: "0".repeat(64),
        },
      },
    });
    const result = await request(server)
      .get(`/api/change-plans/${row.id}`)
      .set("Cookie", cookie)
      .expect(500);
    expect(JSON.stringify(result.body)).not.toMatch(/must-not-leak|semanticOperations|signature/);

    const near = await prisma.changePlan.create({
      data: {
        tenantId: ws.body.tenantId,
        workspaceId: ws.body.id,
        planHash: "0".repeat(64),
        plan: {
          schema: "kf-change-plan/v1",
          workspaceId: ws.body.id,
          operations: [],
          signature: "0".repeat(64),
        },
      },
    });
    await request(server).get(`/api/change-plans/${near.id}`).set("Cookie", cookie).expect(500);
  });

  it("isolates change-plan details across tenants", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "PlanTenant WS");
    const conv = await createConversation(cookie, ws.body.id, "Plan");
    fakeModel.queueIntent("NEW_REQUIREMENT");
    const res = await sendMessage(cookie, conv.body.id, "新增一个按钮").expect(200);
    const changePlanId = doneEvent(res.text).data.changePlanId;

    const cookieB = await login(TENANT_B);
    await request(server)
      .get(`/api/change-plans/${changePlanId}`)
      .set("Cookie", cookieB)
      .expect(404);
  });

  it("marks linkMng changes as script changes in the plan detail response (I5)", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Script WS");
    const planRow = await prisma.changePlan.create({
      data: {
        tenantId: ws.body.tenantId,
        workspaceId: ws.body.id,
        planHash: "5".repeat(64),
        plan: {
          schema: "kf-change-plan/v1",
          workspaceId: ws.body.id,
          operations: [
            {
              op: "update",
              entityId: "button-guid-1",
              entityType: "button",
              changes: [{ path: "/linkMng/linkList", value: [] }],
            },
            {
              op: "update",
              entityId: "Text1",
              entityType: "text",
              changes: [{ path: "/text", value: "hello" }],
            },
          ],
        },
      },
    });

    const res = await request(server)
      .get(`/api/change-plans/${planRow.id}`)
      .set("Cookie", cookie)
      .expect(200);
    expect(res.body.scriptChanges).toEqual([
      { op: "update", entityId: "button-guid-1", entityType: "button", paths: ["/linkMng/linkList"] },
    ]);
    // 普通字段变更不进脚本类标注。
    expect(res.body.scriptChanges.length).toBe(1);
  });

  it("lists build artifacts and the validation report for a successful job", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "BuildSurface WS");
    const conv = await createConversation(cookie, ws.body.id, "Build");
    const planHash = await planRequirement(cookie, conv.body.id);
    const approved = await resume(cookie, conv.body.id, { action: "approve", planHash }).expect(200);
    const jobId = approved.body.buildJobId;

    // Simulate the worker's committed rows so the terminal job carries data.
    await prisma.artifact.create({
      data: {
        tenantId: ws.body.tenantId,
        buildJobId: jobId,
        kind: "client-package",
        storageKey: "artifact-build-surface",
        sizeBytes: 12,
        sha256: "a".repeat(64),
      },
    });
    await prisma.validationReport.create({
      data: {
        tenantId: ws.body.tenantId,
        buildJobId: jobId,
        changePlanId: "cp-build-surface",
        outcome: "pass",
        summary: "validation passed",
        details: {},
      },
    });

    const artifacts = await request(server)
      .get(`/api/build-jobs/${jobId}/artifacts`)
      .set("Cookie", cookie)
      .expect(200);
    expect(artifacts.body).toHaveLength(1);
    expect(artifacts.body[0].kind).toBe("client-package");

    const report = await request(server)
      .get(`/api/build-jobs/${jobId}/report`)
      .set("Cookie", cookie)
      .expect(200);
    expect(report.body.outcome).toBe("pass");
    expect(report.body.summary).toBe("validation passed");
  });

  it("redacts hostile private worker diagnostics from the customer report endpoint", async () => {
    const cookie = await login(TENANT_A_MEMBER);
    const ws = await createWorkspace(cookie, "Hostile Diagnostic WS");
    const conv = await createConversation(cookie, ws.body.id, "Build");
    const planHash = await planRequirement(cookie, conv.body.id);
    const approved = await resume(cookie, conv.body.id, { action: "approve", planHash }).expect(200);
    const correlationId = "11111111-2222-4333-8444-555555555555";
    await prisma.validationReport.create({
      data: {
        tenantId: ws.body.tenantId,
        buildJobId: approved.body.buildJobId,
        outcome: "fail",
        summary: "build failed at /Users/operator/private.ts with Bearer api-secret",
        details: {
          error: {
            code: "BUILD_EXECUTION_FAILED",
            message: "构建执行未完成，请使用参考编号联系管理员。",
            correlationId,
            stack: "Error: api-secret at /Users/operator/private.ts",
            cause: { password: "database-secret" },
          },
          operator: { token: "should-never-be-public" },
        },
      },
    });

    const report = await request(server)
      .get(`/api/build-jobs/${approved.body.buildJobId}/report`)
      .set("Cookie", cookie)
      .expect(200);

    expect(report.body).toMatchObject({
      outcome: "fail",
      summary: "构建执行未完成，请使用参考编号联系管理员。",
      details: {
        error: {
          code: "BUILD_EXECUTION_FAILED",
          message: "构建执行未完成，请使用参考编号联系管理员。",
          correlationId,
        },
      },
    });
    expect(report.body.details).toEqual({
      error: {
        code: "BUILD_EXECUTION_FAILED",
        message: "构建执行未完成，请使用参考编号联系管理员。",
        correlationId,
      },
    });
    expect(JSON.stringify(report.body)).not.toMatch(
      /Bearer|api-secret|\/Users|private|password|database-secret|token|stack|cause/i,
    );
  });
});
