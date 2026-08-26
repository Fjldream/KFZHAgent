// @ts-nocheck -- Golden fixtures are JSON boundary values; runtime schemas and
// integration assertions intentionally provide the authoritative checks.
import "reflect-metadata";
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres@127.0.0.1:5432/kf_agent_test";
process.env.KF_SERVER_PLAN_HMAC_KEY_BASE64 ??= Buffer.alloc(32, 0x54).toString("base64");

import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import type { ArtifactStorage } from "@kf/artifact-storage";
import {
  canonicalServerHash,
  CustomerSolutionBlueprintSchema,
  SolutionImplementationPlanSchema,
} from "@kf/contracts";
import {
  createKingClientDomainPack,
  importNativeClientPackage,
  inspectClientProject,
} from "@kf/domain-client";
import { DomainRegistry } from "@kf/domain-registry";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobRunner } from "../../worker/src/job-runner.js";
import { AppModule } from "./app.module.js";
import { ARTIFACT_STORAGE } from "./artifacts/artifact-storage.js";
import { PasswordService } from "./auth/password.service.js";
import { DeterministicFakeModelPort } from "./conversations/fake-model.js";
import { MODEL_PORT } from "./conversations/model-port.js";
import { SERVER_PLAN_AUTHORITY } from "./conversations/server-plan-authority.js";
import { PrismaService } from "./prisma/prisma.service.js";

const FIXTURE_ROOT = new URL("../../../tests/fixtures/creative-goldens/", import.meta.url);
const GOLDEN_NAMES = ["portal", "industrial-dashboard", "management-admin"];
const TEST_USER = {
  tenant: "KF Creative Golden",
  username: "golden-builder",
  password: "GoldenPass-123",
};
const FIXED_WORKSPACE_ID = "70000000-0000-4000-8000-000000000001";
const FIXED_BASE_REVISION_ID = "70000000-0000-4000-8000-000000000002";
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
const CHECKPOINT_TABLES = [
  "checkpoint_writes",
  "checkpoint_blobs",
  "checkpoints",
  "checkpoint_migrations",
];

class GoldenModelPort extends DeterministicFakeModelPort {
  fixture = undefined;
  intents = [];

  selectFixture(fixture) {
    this.fixture = fixture;
    this.intents = [];
  }

  queueIntent(...intents) {
    this.intents.push(...intents);
  }

  classifyIntent() {
    return Promise.resolve({
      intent: this.intents.shift() ?? "QUESTION",
      requestedDomains: ["kingclient"],
    });
  }

  createDesignPlan() {
    if (this.fixture === undefined) throw new Error("golden fixture is not selected");
    return Promise.resolve(structuredClone(this.fixture.blueprint));
  }

  createSolutionImplementationPlan(input) {
    if (this.fixture === undefined) throw new Error("golden fixture is not selected");
    return Promise.resolve(SolutionImplementationPlanSchema.parse({
      ...structuredClone(this.fixture.plan),
      blueprintHash: canonicalServerHash(input.confirmedSolutionBlueprint),
      candidateBundleHash: canonicalServerHash(input.capabilityCandidates),
    }));
  }

  reviseSolutionImplementationSubtree(input) {
    return this.createSolutionImplementationPlan(input);
  }
}

let app: INestApplication;
let server: ReturnType<INestApplication["getHttpServer"]>;
let prisma: PrismaService;
let passwords: PasswordService;
let storage: ArtifactStorage;
let model: GoldenModelPort;
let storageRoot = "";

beforeAll(async () => {
  storageRoot = await mkdtemp(path.join(tmpdir(), "kf-creative-goldens-"));
  process.env.ARTIFACT_STORAGE_ROOT = storageRoot;
  model = new GoldenModelPort();
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(MODEL_PORT)
    .useValue(model)
    .compile();
  app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  server = app.getHttpServer();
  prisma = moduleRef.get(PrismaService);
  passwords = moduleRef.get(PasswordService);
  storage = moduleRef.get(ARTIFACT_STORAGE);
});

afterAll(async () => {
  await app.close();
  await prisma.$disconnect();
  await rm(storageRoot, { recursive: true, force: true }).catch(() => {});
});

async function resetDatabase() {
  for (const table of TABLES) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
  for (const table of CHECKPOINT_TABLES) {
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "${table}" CASCADE`);
  }
}

async function seedUser() {
  const tenant = await prisma.tenant.create({ data: { name: TEST_USER.tenant } });
  await prisma.user.create({
    data: {
      tenantId: tenant.id,
      username: TEST_USER.username,
      passwordHash: await passwords.hash(TEST_USER.password),
      role: "tenant_admin",
      mustChangePassword: false,
    },
  });
  return tenant.id;
}

async function login() {
  const response = await request(server).post("/api/auth/login").send(TEST_USER).expect(200);
  return response.headers["set-cookie"][0].split(";")[0];
}

async function createDeterministicWorkspace(cookie, fixtureId) {
  const created = await request(server)
    .post("/api/workspaces")
    .set("Cookie", cookie)
    .send({ name: `Golden ${fixtureId}` })
    .expect(201);
  const oldRevisionId = created.body.currentRevisionId;
  await prisma.solutionRevision.update({
    where: { id: oldRevisionId },
    data: { id: FIXED_BASE_REVISION_ID, workspaceId: FIXED_WORKSPACE_ID },
  });
  await prisma.solutionWorkspace.update({
    where: { id: created.body.id },
    data: { id: FIXED_WORKSPACE_ID, currentRevisionId: FIXED_BASE_REVISION_ID },
  });
  return FIXED_WORKSPACE_ID;
}

async function createConversation(cookie, workspaceId, fixtureId) {
  return request(server)
    .post("/api/conversations")
    .set("Cookie", cookie)
    .send({ workspaceId, title: `Golden ${fixtureId}` })
    .expect(201);
}

function parseSse(text) {
  return text.split("\n\n").flatMap((block) => {
    const lines = block.split("\n");
    const event = lines.find((line) => line.startsWith("event:"))?.slice(6).trim();
    const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("\n");
    return event === undefined || data.length === 0 ? [] : [{ event, data: JSON.parse(data) }];
  });
}

function doneEvent(text) {
  const done = parseSse(text).find((event) => event.event === "done");
  if (done === undefined) throw new Error(`missing done event: ${text}`);
  return done.data;
}

function parseBinary(response, callback) {
  const chunks = [];
  response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
  response.on("end", () => callback(null, Buffer.concat(chunks)));
}

function walkControls(value, result = []) {
  if (Array.isArray(value)) value.forEach((entry) => walkControls(entry, result));
  else if (value !== null && typeof value === "object") {
    if (typeof value.name === "string" || value.baseProperty !== undefined) result.push(value);
    for (const key of ["objects", "children", "layoutItems", "insiderObjects"]) {
      walkControls(value[key], result);
    }
  }
  return result;
}

function nativeName(control) {
  return control.name ?? control.baseProperty?.name;
}

async function loadFixture(name) {
  try {
    return JSON.parse(await readFile(new URL(`${name}.json`, FIXTURE_ROOT), "utf8"));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

function walkPlanNodes(root, result = []) {
  result.push(root);
  if (root.kind === "layout") root.children.forEach((child) => walkPlanNodes(child, result));
  else if (root.kind === "registered-module") {
    root.slots.forEach((slot) => slot.children.forEach((child) => walkPlanNodes(child, result)));
  } else if (root.kind === "repeater") walkPlanNodes(root.template, result);
  return result;
}

function designSignature(fixture) {
  const nodes = [
    ...fixture.plan.pages.flatMap((page) => walkPlanNodes(page.root)),
    ...fixture.plan.overlays.flatMap((overlay) => walkPlanNodes(overlay.root)),
  ];
  return {
    informationArchitecture: fixture.blueprint.pages.map((page) => ({
      page: page.id,
      regions: page.readingOrder,
    })),
    layoutTree: fixture.plan.pages.map((page) => walkPlanNodes(page.root)
      .filter((node) => node.kind === "layout").map((node) => node.layout)),
    density: nodes.reduce((counts, node) => ({
      ...counts,
      [node.intent.density]: (counts[node.intent.density] ?? 0) + 1,
    }), {}),
    visualRoles: fixture.plan.roleStyles.map((style) => style.role).sort(),
    interactionGraph: fixture.plan.actions.map((action) => action.kind).sort(),
  };
}

function assertGoldenThesis(fixture) {
  const blueprint = CustomerSolutionBlueprintSchema.parse(fixture.blueprint);
  const plan = SolutionImplementationPlanSchema.parse({
    ...fixture.plan,
    blueprintHash: canonicalServerHash(blueprint),
  });
  const nodes = [
    ...plan.pages.flatMap((page) => walkPlanNodes(page.root)),
    ...plan.overlays.flatMap((overlay) => walkPlanNodes(overlay.root)),
  ];
  const controls = nodes.filter((node) => node.kind === "control");
  expect(plan.pages.length, `${fixture.id}: pages`).toBeGreaterThanOrEqual(2);
  expect(plan.overlays.length, `${fixture.id}: overlay`).toBeGreaterThanOrEqual(1);
  expect(blueprint.journeys.length, `${fixture.id}: journeys`).toBeGreaterThanOrEqual(2);
  expect(plan.scripts.length, `${fixture.id}: constrained scripts`).toBeGreaterThanOrEqual(1);
  expect(plan.roleStyles.some((style) => Object.keys(style.declarations).length > 0), `${fixture.id}: structured CSS`).toBe(true);
  expect(plan.mockData.some((data) => data.records.some((record) => record.values.some((value) => /[\u3400-\u9fff]/u.test(String(value.value))))), `${fixture.id}: Chinese mock data`).toBe(true);

  if (fixture.id === "portal") {
    expect(controls.filter((node) => node.capabilityId === "image").length).toBeGreaterThanOrEqual(3);
    expect(nodes.some((node) => node.kind === "layout" && node.layout === "asymmetric-grid")).toBe(true);
    expect(nodes.filter((node) => node.intent.density === "spacious").length).toBeGreaterThan(nodes.filter((node) => node.intent.density === "compact").length);
    expect(plan.pages[0].root.layout).not.toBe("grid");
  } else if (fixture.id === "industrial-dashboard") {
    expect(controls.filter((node) => node.capabilityId === "easyui.1").length).toBeGreaterThanOrEqual(2);
    expect(nodes.filter((node) => node.intent.density === "compact").length).toBeGreaterThan(nodes.filter((node) => node.intent.density === "spacious").length);
    expect(plan.pages[0].root.layout).toBe("dock");
  } else {
    expect(nodes.some((node) => node.kind === "layout" && node.layout === "sidebar-content")).toBe(true);
    expect(nodes.some((node) => node.kind === "layout" && node.layout === "master-detail")).toBe(true);
    expect(controls.some((node) => node.capabilityId === "tabs")).toBe(true);
  }
}

async function runGoldenBuild(fixture, runNumber) {
  await resetDatabase();
  const tenantId = await seedUser();
  model.selectFixture(fixture);
  const cookie = await login();
  const workspaceId = await createDeterministicWorkspace(cookie, fixture.id);
  const conversation = await createConversation(cookie, workspaceId, fixture.id);

  model.queueIntent("NEW_REQUIREMENT");
  const proposed = await request(server)
    .post(`/api/conversations/${conversation.body.id}/messages`)
    .set("Cookie", cookie)
    .send({ content: fixture.prompt })
    .expect(200);
  expect(doneEvent(proposed.text).stage).toBe("design-review");

  model.queueIntent("CONFIRM_DESIGN");
  const confirmed = await request(server)
    .post(`/api/conversations/${conversation.body.id}/messages`)
    .set("Cookie", cookie)
    .send({ content: "确认设计并生成工程" })
    .expect(200);
  const building = doneEvent(confirmed.text);
  expect(building, confirmed.text).toMatchObject({
    stage: "building",
    buildJobId: expect.any(String),
  });

  const queuedJob = await prisma.buildJob.findUniqueOrThrow({ where: { id: building.buildJobId } });
  const persisted = await prisma.changePlan.findUniqueOrThrow({ where: { id: queuedJob.changePlanId } });
  expect(persisted.plan).toMatchObject({
    schema: "kf-server-plan-envelope/v1",
    revisionId: FIXED_BASE_REVISION_ID,
    planHash: queuedJob.planHash,
    signature: expect.stringMatching(/^[a-f0-9]{64}$/),
    creativeArtifactHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    nativeMaterializationHash: expect.stringMatching(/^[a-f0-9]{64}$/),
    creativeArtifact: { schema: "kf-creative-build-artifact/v1" },
    trustedNativeMaterialization: { schema: "kf-trusted-native-materialization/v1" },
    semanticOperations: expect.any(Array),
  });
  expect(fixture.plan).not.toHaveProperty("semanticOperations");
  const persistedSemanticOperations = persisted.plan.semanticOperations;
  const tableOperations = persisted.plan.plan.operations.filter((operation) =>
    operation.op === "create"
      ? Object.hasOwn(operation.properties, "tableData")
      : operation.changes.some((change) => change.path === "/__kfModuleTableData"));
  expect(persistedSemanticOperations.length, `${fixture.id}: compiler-owned table authorization`).toBe(tableOperations.length);
  expect(persistedSemanticOperations.length, `${fixture.id}: table authorization present`).toBeGreaterThan(0);

  const registry = new DomainRegistry();
  registry.register(createKingClientDomainPack({ nativeAccepted: true }));
  const runner = new JobRunner({
    prisma,
    storage,
    registry,
    serverPlanVerifier: app.get(SERVER_PLAN_AUTHORITY),
  });
  const built = await runner.runOnce(`${fixture.id}-${runNumber}`, new Date());
  const failedValidation = built?.status === "FAILED"
    ? await prisma.validationReport.findFirst({ where: { tenantId, buildJobId: built.id } })
    : null;
  expect(built, JSON.stringify({ built, failedValidation })).toMatchObject({
    id: building.buildJobId,
    status: "SUCCEEDED",
  });

  const artifact = await prisma.artifact.findFirstOrThrow({ where: { tenantId, buildJobId: built.id } });
  const revision = await prisma.solutionRevision.findUniqueOrThrow({ where: { id: artifact.solutionRevisionId } });
  const project = await prisma.domainProjectRevision.findFirstOrThrow({
    where: { tenantId, solutionRevisionId: revision.id, projectKey: built.projectKey },
  });
  const validation = await prisma.validationReport.findFirstOrThrow({ where: { tenantId, buildJobId: built.id } });
  const workspace = await prisma.solutionWorkspace.findUniqueOrThrow({ where: { id: workspaceId } });
  expect(validation.outcome).toBe("pass");
  expect(workspace.currentRevisionId).toBe(revision.id);
  expect(project).toMatchObject({ packageHash: artifact.sha256, packageUrl: artifact.storageKey });

  const delivered = await request(server)
    .get(`/api/conversations/${conversation.body.id}/delivery?buildJobId=${built.id}`)
    .set("Cookie", cookie);
  expect(delivered.status, `${fixture.id}: ${JSON.stringify(delivered.body)}`).toBe(200);
  expect(delivered.body.projectDelivery).toMatchObject({
    workflow: "creative-v2",
    status: "downloadable",
    artifactId: artifact.id,
    revisionId: revision.id,
    kf36RuntimeVerification: {
      status: "not_performed",
      notice: "尚未经过人工 KingFusion 3.6 运行态验证",
    },
  });
  expect(delivered.body.projectDelivery).not.toHaveProperty("preview");

  const token = await request(server)
    .post(`/api/artifacts/${artifact.id}/download-token`)
    .set("Cookie", cookie)
    .expect(200);
  const downloaded = await request(server)
    .get(`/api/artifacts/download/${token.body.token}`)
    .set("Cookie", cookie)
    .buffer(true)
    .parse(parseBinary)
    .expect(200);
  const packageHash = createHash("sha256").update(downloaded.body).digest("hex");
  expect(packageHash).toBe(artifact.sha256);

  const importRoot = await mkdtemp(path.join(tmpdir(), `kf-${fixture.id}-import-`));
  try {
    const imported = await importNativeClientPackage(downloaded.body, importRoot);
    const inspection = await inspectClientProject(imported);
    const envelope = persisted.plan;
    const materialization = envelope.trustedNativeMaterialization;
    expect(envelope.creativeArtifact.semanticPlan.candidateBundleHash,
      `${fixture.id}: PostgreSQL JSONB candidate hash round trip`)
      .toBe(canonicalServerHash(envelope.creativeArtifact.candidateBundle));
    const importedControls = Object.values(inspection.raw.pages).flatMap((page) => walkControls(page));
    const controlsByName = new Map(importedControls.map((control) => [nativeName(control), control]));
    expect(materialization.pages).toHaveLength(fixture.plan.pages.length);
    expect(materialization.pages.every((page) => inspection.index.pages[page.pageGuid] !== undefined)).toBe(true);
    expect(materialization.interactions.actions.length).toBeGreaterThanOrEqual(1);
    expect(materialization.interactions.scripts.length).toBeGreaterThanOrEqual(1);
    expect(materialization.controls.some((control) => control.overlayHost !== undefined)).toBe(true);

    const navigationActions = materialization.interactions.actions.filter((action) => action.kind === "navigate-page");
    expect(navigationActions.length, `${fixture.id}: navigation actions`).toBeGreaterThanOrEqual(1);
    navigationActions.forEach((navigation) => {
      const navigationOwner = controlsByName.get(navigation.ownerInstanceName);
      expect(navigationOwner?.linkMng?.linkList?.some((link) =>
        link.action === "navigatePage" && link.pageId === navigation.targetPageGuid),
      `${fixture.id}: packaged navigation ${navigation.sourceActionId}`).toBe(true);
    });

    const styled = materialization.stylesData.find((style) => style.compiledStyle.cssFragments.length > 0);
    expect(styled, `${fixture.id}: compiled CSS fragment`).toBeDefined();
    expect(String(controlsByName.get(styled.instanceName)?.styleDataNew)).toContain("#");

    const packagedScript = importedControls.flatMap((control) => control.linkMng?.linkList ?? [])
      .find((link) => String(link.script).includes("kf-compiled-event/v1"));
    expect(packagedScript, `${fixture.id}: packaged constrained script`).toBeDefined();

    if (fixture.id === "industrial-dashboard") {
      const source = materialization.controls.find((control) => control.semanticControlId === fixture.expect.datagridSourceId);
      const target = materialization.controls.find((control) => control.semanticControlId === fixture.expect.datagridTargetId);
      expect(source).toBeDefined();
      expect(target).toBeDefined();
      const nativeGrid = controlsByName.get(source.instanceName);
      const rowClick = nativeGrid?.linkMng?.linkList?.find((link) => link.name === "onClickRow");
      expect(rowClick).toMatchObject({ linkId: 200024, enable: true });
      expect(String(rowClick.script)).toContain("arguments[3]");
      expect(String(rowClick.script)).toContain(`${target.instanceName}.SetData(`);
      expect(String(rowClick.script)).toContain("kf-compiled-event/v1");
    }

    if (fixture.id === "management-admin") {
      const tabs = materialization.controls.find((control) => control.semanticControlId === fixture.expect.tabsId);
      const activity = materialization.controls.find((control) => control.semanticControlId === fixture.expect.activityTargetId);
      const submit = materialization.controls.find((control) => control.semanticControlId === fixture.expect.submitSourceId);
      const status = materialization.controls.find((control) => control.semanticControlId === fixture.expect.submitTargetId);
      expect(tabs).toBeDefined();
      expect(activity).toBeDefined();
      expect(submit).toBeDefined();
      expect(status).toBeDefined();
      const tabClick = controlsByName.get(tabs.instanceName)?.linkMng?.linkList?.find((link) => link.name === "Tab-click");
      expect(String(tabClick?.script)).toContain(`${activity.instanceName}.SetData(`);
      expect(String(tabClick?.script)).toContain("kf-compiled-event/v1");
      const submitClick = controlsByName.get(submit.instanceName)?.linkMng?.linkList?.find((link) => link.name === "onClick");
      expect(String(submitClick?.script)).toContain("String(name).trim()");
      expect(String(submitClick?.script)).toContain(`${status.instanceName}.SetData(`);
      expect(String(submitClick?.script)).toContain("kf-compiled-event/v1");
    }

    return {
      blueprintHash: envelope.creativeArtifact.hashes.blueprintHash,
      candidateBundleHash: envelope.creativeArtifact.hashes.candidateBundleHash,
      semanticPlanHash: envelope.creativeArtifact.hashes.semanticPlanHash,
      implementationHash: envelope.creativeArtifact.hashes.implementationHash,
      creativeArtifactHash: artifact.creativeArtifactHash,
      nativeMaterializationHash: artifact.nativeMaterializationHash,
      packageHash,
    };
  } finally {
    await rm(importRoot, { recursive: true, force: true });
  }
}

describe("KF creative golden projects", () => {
  it("builds three structurally distinct golden projects twice through graph, Worker, delivery and import", async () => {
    const loaded = await Promise.all(GOLDEN_NAMES.map(loadFixture));
    loaded.forEach((fixture, index) => {
      expect(fixture, `missing golden fixture: ${GOLDEN_NAMES[index]}.json`).not.toBeNull();
    });
    if (loaded.some((fixture) => fixture === null)) return;
    loaded.forEach(assertGoldenThesis);
    expect(new Set(loaded.map((fixture) => canonicalServerHash(designSignature(fixture))).values()).size).toBe(3);

    for (const fixture of loaded) {
      const first = await runGoldenBuild(fixture, 1);
      const second = await runGoldenBuild(fixture, 2);
      expect(second, `${fixture.id}: deterministic build hashes`).toEqual(first);
    }
  }, 300_000);
});
