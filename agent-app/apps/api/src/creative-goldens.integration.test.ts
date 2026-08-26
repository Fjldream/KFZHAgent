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
  workspaceAssetIdToModelId,
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
import { deflateSync } from "node:zlib";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { JobRunner } from "../../worker/src/job-runner.js";
import { encodeBlueprintConfirmation } from "@kf/agent-orchestrator";
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
const PORTAL_ASSET_SPECS = [
  { workspaceAssetId: "70000000-0000-4000-8000-000000000101", name: "coast-bookshop-dawn.png", seed: 11 },
  { workspaceAssetId: "70000000-0000-4000-8000-000000000102", name: "northern-gallery-courtyard.png", seed: 23 },
  { workspaceAssetId: "70000000-0000-4000-8000-000000000103", name: "valley-lodge-garden.png", seed: 37 },
  { workspaceAssetId: "70000000-0000-4000-8000-000000000104", name: "northern-gallery-morning.png", seed: 53 },
].map((asset) => ({
  ...asset,
  assetId: workspaceAssetIdToModelId(asset.workspaceAssetId),
  bytes: portalFixturePng(asset.seed),
}));
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

function pngCrc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ ((crc & 1) === 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const kind = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  kind.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(pngCrc32(Buffer.concat([kind, data])), 8 + data.length);
  return chunk;
}

/** Small deterministic scene rasters: sky, architecture, horizon and textured foreground; never baked UI. */
function portalFixturePng(seed) {
  const width = 96;
  const height = 64;
  const raw = Buffer.alloc(height * (1 + width * 4));
  for (let y = 0; y < height; y += 1) {
    const row = y * (1 + width * 4);
    raw[row] = 0;
    for (let x = 0; x < width; x += 1) {
      const offset = row + 1 + x * 4;
      const texture = (x * 17 + y * 31 + seed * 13) % 19;
      const sky = y < 31;
      const building = x > 13 + seed % 9 && x < 72 + seed % 13 && y > 20 + seed % 7 && y < 47;
      const aperture = building && ((x + seed) % 23 < 7) && y > 27 && y < 41;
      const base = sky ? 196 - Math.floor(y * 1.8) : 74 + Math.floor((y - 31) * 1.2);
      raw[offset] = aperture ? 218 : building ? 72 + seed % 36 : Math.max(0, Math.min(255, base + texture));
      raw[offset + 1] = aperture ? 173 : building ? 75 + seed % 28 : Math.max(0, Math.min(255, base + 14 + seed % 23));
      raw[offset + 2] = aperture ? 106 : building ? 70 + seed % 17 : Math.max(0, Math.min(255, sky ? base + 23 : base - 18));
      raw[offset + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr.set([8, 6, 0, 0, 0], 8);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

class GoldenModelPort extends DeterministicFakeModelPort {
  fixture = undefined;
  intents = [];
  rejections = [];

  selectFixture(fixture) {
    this.fixture = fixture;
    this.intents = [];
    this.rejections = [];
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
    this.rejections.push(...(input.solutionPlanRejectionReasons ?? []));
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

async function seedPortalAssets(cookie, tenantId, workspaceId) {
  for (const asset of PORTAL_ASSET_SPECS) {
    const uploaded = await request(server)
      .post(`/api/workspaces/${workspaceId}/assets`)
      .query({ name: asset.name })
      .set("Cookie", cookie)
      .set("Content-Type", "application/octet-stream")
      .send(asset.bytes)
      .expect(201);
    expect(uploaded.body).toMatchObject({
      type: "image", name: asset.name, mediaType: "image/png", width: 96, height: 64,
    });
    await prisma.workspaceAsset.update({
      where: { id: uploaded.body.id },
      data: { id: asset.workspaceAssetId },
    });
    const persisted = await prisma.workspaceAsset.findFirstOrThrow({
      where: { id: asset.workspaceAssetId, tenantId, workspaceId },
    });
    expect(persisted).toMatchObject({
      name: asset.name,
      sha256: createHash("sha256").update(asset.bytes).digest("hex"),
      sizeBytes: asset.bytes.byteLength,
      width: 96,
      height: 64,
    });
  }
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

function runPackagedTabsInitialization(nativeTabs) {
  const prefix = "// kf-compiled-tabs/v1 ";
  const source = nativeTabs.configureData;
  if (typeof source !== "string" || !source.startsWith(prefix)) {
    throw new Error("missing compiler-owned Tabs initialization");
  }
  const newline = source.indexOf("\n");
  const metadata = JSON.parse(Buffer.from(source.slice(prefix.length, newline), "base64url").toString("utf8"));
  const body = source.slice(newline + 1);
  if (metadata.schema !== "kf-compiled-tabs/v1"
    || metadata.uiModelType !== 47
    || metadata.ownerInstanceName !== nativeName(nativeTabs)
    || metadata.bodyByteLength !== Buffer.byteLength(body, "utf8")
    || metadata.bodySha256 !== createHash("sha256").update(body, "utf8").digest("hex")) {
    throw new Error("invalid compiler-owned Tabs initialization marker");
  }
  const match = /^this\.tabs\((\{.*\})\);\n$/.exec(body);
  if (match === null) throw new Error("invalid Tabs initialization method");
  const payload = JSON.parse(match[1]);
  const $vm = {
    activeName: "1",
    type: "card",
    tabData: [{ name: "1", label: "首页签1" }, { name: "2", label: "首页签2" }],
    closable: false,
    addable: false,
    tabPosition: "top",
    stretch: false,
  };
  // Faithful checked-in KMElementUITabs.tabs(e): changePropertyName followed
  // by assignment only when the initialized Vue key already exists.
  for (const [key, value] of Object.entries(payload)) {
    const runtimeKey = key.split("-")
      .map((part, index) => index === 0 ? part : `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join("");
    if ($vm[runtimeKey] !== undefined) $vm[runtimeKey] = value;
  }
  const componentMap = new Map((nativeTabs.insiderObjects ?? []).map((child) => [String(child.region), child]));
  return { metadata, body, $vm, componentMap, selected: componentMap.get(String($vm.activeName)) };
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

function unwrapSemanticValue(value) {
  if (value === null || typeof value !== "object") return value;
  if (value.kind === "list") return value.items.map(unwrapSemanticValue);
  if (value.kind === "record") return Object.fromEntries(value.fields.map((field) => [field.name, unwrapSemanticValue(field.value)]));
  return value;
}

function renamedFixtureIdentifiers(fixture) {
  const renamed = structuredClone(fixture);
  const allNodes = [
    ...renamed.plan.pages.flatMap((page) => walkPlanNodes(page.root)),
    ...renamed.plan.overlays.flatMap((overlay) => walkPlanNodes(overlay.root)),
  ];
  const indexed = (values, prefix) => new Map([...new Set(values)].map((value, index) => [value, `${prefix}-${index}`]));
  const blueprintPages = indexed(renamed.blueprint.pages.map((page) => page.id), "bp");
  const regions = indexed(renamed.blueprint.pages.flatMap((page) => page.regions.map((region) => region.id)), "region");
  const journeys = indexed(renamed.blueprint.journeys.map((journey) => journey.id), "journey");
  const pages = indexed(renamed.plan.pages.map((page) => page.id), "page");
  const overlays = indexed(renamed.plan.overlays.map((overlay) => overlay.id), "overlay");
  const actions = indexed(renamed.plan.actions.map((action) => action.id), "action");
  const scripts = indexed(renamed.plan.scripts.map((script) => script.id), "script");
  const states = indexed(renamed.plan.localState.map((state) => state.id), "state");
  const mockData = indexed(renamed.plan.mockData.map((data) => data.id), "data");
  const nodes = indexed(allNodes.map((node) => node.id), "node");
  const roles = indexed([
    ...renamed.plan.roleStyles.map((style) => style.role),
    ...renamed.blueprint.pages.flatMap((page) => page.regions.flatMap((region) => region.semanticRoles)),
  ], "role");
  const replace = (map, value) => map.get(value) ?? value;

  for (const page of renamed.blueprint.pages) {
    page.id = replace(blueprintPages, page.id);
    page.readingOrder = page.readingOrder.map((id) => replace(regions, id));
    for (const region of page.regions) {
      region.id = replace(regions, region.id);
      region.semanticRoles = region.semanticRoles.map((role) => replace(roles, role));
    }
  }
  for (const journey of renamed.blueprint.journeys) {
    journey.id = replace(journeys, journey.id);
    for (const step of journey.steps) {
      step.pageId = replace(blueprintPages, step.pageId);
      step.regionId = replace(regions, step.regionId);
    }
  }
  for (const style of renamed.plan.roleStyles) style.role = replace(roles, style.role);
  for (const data of renamed.plan.mockData) data.id = replace(mockData, data.id);
  for (const state of renamed.plan.localState) state.id = replace(states, state.id);
  for (const page of renamed.plan.pages) {
    page.id = replace(pages, page.id);
    page.sourceBlueprintPageId = replace(blueprintPages, page.sourceBlueprintPageId);
    page.sourceBlueprintRegionIds = page.sourceBlueprintRegionIds.map((id) => replace(regions, id));
  }
  for (const overlay of renamed.plan.overlays) {
    overlay.id = replace(overlays, overlay.id);
    overlay.hostPageId = replace(pages, overlay.hostPageId);
    overlay.sourceBlueprintPageId = replace(blueprintPages, overlay.sourceBlueprintPageId);
    overlay.sourceBlueprintRegionIds = overlay.sourceBlueprintRegionIds.map((id) => replace(regions, id));
    overlay.visibleStateId = replace(states, overlay.visibleStateId);
  }
  for (const node of allNodes) {
    node.id = replace(nodes, node.id);
    node.sourceBlueprintRegionIds = node.sourceBlueprintRegionIds.map((id) => replace(regions, id));
    node.intent.groupWith = node.intent.groupWith.map((id) => replace(nodes, id));
    if (node.kind === "control") {
      node.styleRole = replace(roles, node.styleRole);
      if (node.mockDataId !== undefined) node.mockDataId = replace(mockData, node.mockDataId);
      for (const binding of node.eventBindings) {
        binding.actionIds = binding.actionIds.map((id) => replace(actions, id));
      }
    } else if (node.kind === "registered-module") {
      node.eventBindings.forEach((binding) => {
        binding.actionIds = binding.actionIds.map((id) => replace(actions, id));
      });
    } else if (node.kind === "repeater") {
      node.mockDataId = replace(mockData, node.mockDataId);
    }
  }
  for (const action of renamed.plan.actions) {
    action.id = replace(actions, action.id);
    action.afterActionIds = action.afterActionIds.map((id) => replace(actions, id));
    action.journeyStepRefs = action.journeyStepRefs.map((ref) => ({
      ...ref,
      journeyId: replace(journeys, ref.journeyId),
    }));
    if (action.targetPageId !== undefined) action.targetPageId = replace(pages, action.targetPageId);
    if (action.overlayId !== undefined) action.overlayId = replace(overlays, action.overlayId);
    if (action.scriptId !== undefined) action.scriptId = replace(scripts, action.scriptId);
  }
  for (const script of renamed.plan.scripts) {
    script.id = replace(scripts, script.id);
    for (const ref of [...script.inputs, ...script.outputs]) {
      ref.refId = ref.refKind === "control" ? replace(nodes, ref.refId)
        : ref.refKind === "local-state" ? replace(states, ref.refId)
          : ref.refKind === "mock-data" ? replace(mockData, ref.refId) : ref.refId;
    }
  }
  return renamed;
}

function semanticValueStructure(value) {
  if (value === null) return "null";
  if (typeof value !== "object") return typeof value;
  if (value.kind === "list") return { kind: "list", items: value.items.map(semanticValueStructure) };
  if (value.kind === "record") return { kind: "record", fields: value.fields.map((field) => semanticValueStructure(field.value)) };
  if (value.kind === "repeater-field") return { kind: "repeater-field" };
  return "object";
}

function designSignature(fixture) {
  const { blueprint, plan } = fixture;
  const planPageIndex = new Map(plan.pages.map((page, index) => [page.id, index]));
  const blueprintPageIndex = new Map(blueprint.pages.map((page, index) => [page.id, index]));
  const blueprintRegionAddress = new Map(blueprint.pages.flatMap((page, pageIndex) =>
    page.regions.map((region, regionIndex) => [region.id, { page: pageIndex, region: regionIndex }])));
  const overlayIndex = new Map(plan.overlays.map((overlay, index) => [overlay.id, index]));
  const actionIndex = new Map(plan.actions.map((action, index) => [action.id, index]));
  const scriptIndex = new Map(plan.scripts.map((script, index) => [script.id, index]));
  const journeyIndex = new Map(blueprint.journeys.map((journey, index) => [journey.id, index]));
  const stateIndex = new Map(plan.localState.map((state, index) => [state.id, index]));
  const mockDataIndex = new Map(plan.mockData.map((data, index) => [data.id, index]));
  const roleStyleByName = new Map(plan.roleStyles.map((style) => [style.role, {
    declarations: style.declarations,
    states: style.states,
  }]));
  const nodeAddress = new Map();
  const nodesInStructuralOrder = [];
  const indexNode = (node, address, depth) => {
    nodeAddress.set(node.id, address);
    nodesInStructuralOrder.push({ node, address, depth });
    if (node.kind === "layout") node.children.forEach((child, index) => indexNode(child, `${address}/child:${index}`, depth + 1));
    else if (node.kind === "registered-module") node.slots.forEach((slot, slotIndex) =>
      slot.children.forEach((child, childIndex) => indexNode(child, `${address}/slot:${slotIndex}/child:${childIndex}`, depth + 1)));
    else if (node.kind === "repeater") indexNode(node.template, `${address}/template`, depth + 1);
  };
  plan.pages.forEach((page, index) => indexNode(page.root, `page:${index}/root`, 0));
  plan.overlays.forEach((overlay, index) => indexNode(overlay.root, `overlay:${index}/root`, 0));

  const regionRefs = (ids) => ids.map((id) => blueprintRegionAddress.get(id) ?? "unresolved");
  const normalizedIntent = (intent) => ({
    importance: intent.importance,
    visualWeight: intent.visualWeight,
    readingOrder: intent.readingOrder,
    density: intent.density,
    groupedWith: intent.groupWith.map((id) => nodeAddress.get(id) ?? "unresolved").sort(),
    width: intent.width,
    height: intent.height,
    align: intent.align,
  });
  const normalizedBindings = (bindings) => bindings.map((binding) => ({
    event: binding.semanticEvent,
    actions: binding.actionIds.map((id) => actionIndex.get(id) ?? "unresolved"),
  }));
  const normalizedNode = (node) => {
    const common = {
      kind: node.kind,
      blueprintRegions: regionRefs(node.sourceBlueprintRegionIds),
      intent: normalizedIntent(node.intent),
    };
    if (node.kind === "layout") return {
      ...common,
      layout: node.layout,
      children: node.children.map(normalizedNode),
    };
    if (node.kind === "control") return {
      ...common,
      capability: node.capabilityId,
      content: semanticValueStructure(node.content),
      properties: node.properties.map((property) => ({
        name: property.name,
        value: semanticValueStructure(property.value),
      })),
      tabCount: node.tabIds.length,
      dataSource: node.mockDataId === undefined ? null : mockDataIndex.get(node.mockDataId) ?? "unresolved",
      visualRole: roleStyleByName.get(node.styleRole) ?? "unresolved",
      styleOverride: node.styleOverride ?? null,
      bindings: normalizedBindings(node.eventBindings),
    };
    if (node.kind === "registered-module") return {
      ...common,
      moduleKind: node.moduleKind,
      templateVersion: node.templateVersion,
      variant: node.variant,
      content: semanticValueStructure(node.content),
      hasAsset: node.assetId !== undefined,
      bindings: normalizedBindings(node.eventBindings),
      slots: node.slots.map((slot) => slot.children.map(normalizedNode)),
    };
    return {
      ...common,
      dataSource: mockDataIndex.get(node.mockDataId) ?? "unresolved",
      maxItems: node.maxItems,
      template: normalizedNode(node.template),
    };
  };
  const refTopology = (ref) => ({
    kind: ref.refKind,
    target: ref.refKind === "control" ? nodeAddress.get(ref.refId) ?? "unresolved"
      : ref.refKind === "local-state" ? stateIndex.get(ref.refId) ?? "unresolved"
        : ref.refKind === "mock-data" ? mockDataIndex.get(ref.refId) ?? "unresolved" : "external",
  });
  const ownersByAction = plan.actions.map(() => []);
  for (const { node, address } of nodesInStructuralOrder) {
    if (node.kind !== "control" && node.kind !== "registered-module") continue;
    for (const binding of node.eventBindings) for (const actionId of binding.actionIds) {
      const index = actionIndex.get(actionId);
      if (index !== undefined) ownersByAction[index].push({ node: address, event: binding.semanticEvent });
    }
  }
  const density = nodesInStructuralOrder.reduce((counts, { node }) => ({
    ...counts,
    [node.intent.density]: (counts[node.intent.density] ?? 0) + 1,
  }), {});

  return {
    informationArchitecture: blueprint.pages.map((page) => ({
      regionReadingOrder: page.readingOrder.map((id) => blueprintRegionAddress.get(id)?.region ?? "unresolved"),
      regions: page.regions.map((region) => ({
        dataShape: region.dataShape,
        density: region.density,
        importance: region.importance,
        semanticRoleCount: region.semanticRoles.length,
        contentCount: region.content.length,
        sampleCount: region.sampleData.length,
        interactionCount: region.interactions.length,
        stateCount: region.states.length,
      })),
    })),
    layoutTree: {
      pages: plan.pages.map((page) => normalizedNode(page.root)),
      overlays: plan.overlays.map((overlay) => ({
        presentation: overlay.presentation,
        dismissible: overlay.dismissible,
        hostPage: planPageIndex.get(overlay.hostPageId) ?? "unresolved",
        visibleState: stateIndex.get(overlay.visibleStateId) ?? "unresolved",
        root: normalizedNode(overlay.root),
      })),
    },
    density,
    visualHierarchy: nodesInStructuralOrder.map(({ node, depth }) => ({
      depth,
      kind: node.kind,
      importance: node.intent.importance,
      visualWeight: node.intent.visualWeight,
      readingOrder: node.intent.readingOrder,
      density: node.intent.density,
    })),
    visualRoleSystem: plan.roleStyles.map((style) => ({
      declarations: style.declarations,
      states: style.states,
    })).sort((left, right) => canonicalServerHash(left).localeCompare(canonicalServerHash(right), "en-US")),
    interactionTopology: {
      journeys: blueprint.journeys.map((journey) => journey.steps.map((step) => ({
        page: blueprintPageIndex.get(step.pageId) ?? "unresolved",
        region: blueprintRegionAddress.get(step.regionId)?.region ?? "unresolved",
      }))),
      actions: plan.actions.map((action, index) => ({
        kind: action.kind,
        owners: ownersByAction[index],
        targetPage: action.targetPageId === undefined ? null : planPageIndex.get(action.targetPageId) ?? "unresolved",
        targetOverlay: action.overlayId === undefined ? null : overlayIndex.get(action.overlayId) ?? "unresolved",
        script: action.scriptId === undefined ? null : scriptIndex.get(action.scriptId) ?? "unresolved",
        after: action.afterActionIds.map((id) => actionIndex.get(id) ?? "unresolved"),
        journeySteps: action.journeyStepRefs.map((ref) => ({
          journey: journeyIndex.get(ref.journeyId) ?? "unresolved",
          step: ref.stepIndex,
        })),
      })),
      scripts: plan.scripts.map((script) => ({
        kind: script.kind,
        programVersion: script.programVersion,
        inputs: script.inputs.map(refTopology),
        outputs: script.outputs.map(refTopology),
      })),
    },
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
  const bindingsByAction = new Map();
  for (const node of nodes) {
    if (node.kind !== "control") continue;
    for (const binding of node.eventBindings) {
      for (const actionId of binding.actionIds) bindingsByAction.set(actionId, { nodeId: node.id, event: binding.semanticEvent });
    }
  }
  for (const overlay of plan.overlays) {
    const open = plan.actions.find((action) => action.kind === "open-overlay" && action.overlayId === overlay.id);
    const close = plan.actions.find((action) => action.kind === "close-overlay" && action.overlayId === overlay.id);
    expect(open, `${fixture.id}: real overlay open action`).toBeDefined();
    expect(close, `${fixture.id}: real overlay close action`).toBeDefined();
    expect(bindingsByAction.get(open?.id), `${fixture.id}: bound overlay open`).toBeDefined();
    expect(bindingsByAction.get(close?.id), `${fixture.id}: bound overlay close`).toBeDefined();
    expect(plan.localState.find((state) => state.id === overlay.visibleStateId)?.initialValue,
      `${fixture.id}: overlay initially hidden`).toBe(false);
  }

  if (fixture.id === "portal") {
    const images = controls.filter((node) => node.capabilityId === "image");
    expect(images).toHaveLength(4);
    const boundAssetIds = images.map((node) => node.properties.find((property) => property.name === "src")?.value);
    expect(boundAssetIds.every((assetId) => typeof assetId === "string" && assetId.startsWith("asset-")),
      `${fixture.id}: every image uses an approved asset id`).toBe(true);
    expect(new Set(boundAssetIds).size, `${fixture.id}: distinct approved media`).toBeGreaterThanOrEqual(3);
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
    const tabs = controls.find((node) => node.capabilityId === "tabs");
    expect(tabs).toBeDefined();
    const semanticTabs = unwrapSemanticValue(tabs?.properties.find((property) => property.name === "tabs")?.value);
    expect(semanticTabs, `${fixture.id}: structured tab content`).toEqual([
      { id: "profile-tab", label: "基本资料", regionId: "admin-profile-name", paneNodeId: "admin-profile-pane" },
      { id: "activity-tab", label: "操作记录", regionId: "admin-activity", paneNodeId: "admin-activity-pane" },
      { id: "permission-tab", label: "权限范围", regionId: "admin-dialog-status", paneNodeId: "admin-permission-pane" },
    ]);
    expect(tabs?.properties.find((property) => property.name === "activeId")?.value,
      `${fixture.id}: active tab`).toBe("profile-tab");
  }
}

async function runGoldenBuild(fixture, runNumber) {
  await resetDatabase();
  const tenantId = await seedUser();
  model.selectFixture(fixture);
  const cookie = await login();
  const workspaceId = await createDeterministicWorkspace(cookie, fixture.id);
  if (fixture.id === "portal") await seedPortalAssets(cookie, tenantId, workspaceId);
  const conversation = await createConversation(cookie, workspaceId, fixture.id);

  model.queueIntent("NEW_REQUIREMENT");
  const proposed = await request(server)
    .post(`/api/conversations/${conversation.body.id}/messages`)
    .set("Cookie", cookie)
    .send({ content: fixture.prompt })
    .expect(200);
  const proposal = doneEvent(proposed.text);
  expect(proposal.stage).toBe("design-review");

  const confirmed = await request(server)
    .post(`/api/conversations/${conversation.body.id}/messages`)
    .set("Cookie", cookie)
    .send({ content: encodeBlueprintConfirmation(proposal.designRevision, proposal.designPlanHash) })
    .expect(200);
  const building = doneEvent(confirmed.text);
  const diagnosticMessages = building.stage === "building" ? [] : await prisma.message.findMany({
    where: { conversationId: conversation.body.id }, orderBy: { createdAt: "asc" }, select: { role: true, content: true },
  });
  expect(building, `${confirmed.text}\nrejections: ${JSON.stringify(model.rejections)}\nmessages: ${JSON.stringify(diagnosticMessages)}`).toMatchObject({
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

    const overlayActions = materialization.interactions.actions.filter((action) =>
      action.kind === "open-overlay" || action.kind === "close-overlay");
    expect(overlayActions.filter((action) => action.kind === "open-overlay"),
      `${fixture.id}: compiled overlay open`).toHaveLength(fixture.plan.overlays.length);
    expect(overlayActions.filter((action) => action.kind === "close-overlay"),
      `${fixture.id}: compiled overlay close`).toHaveLength(fixture.plan.overlays.length);
    for (const overlayAction of overlayActions) {
      const owner = controlsByName.get(overlayAction.ownerInstanceName);
      const link = owner?.linkMng?.linkList?.find((entry) =>
        entry.kfCompilerAction?.schema === "kf-compiled-action/v3"
        && entry.kfCompilerAction?.sourceActionId === overlayAction.sourceActionId);
      expect(link, `${fixture.id}: packaged overlay binding ${overlayAction.sourceActionId}`).toMatchObject({
        script: expect.stringContaining(`${overlayAction.targetInstanceName}.setVisible(${overlayAction.kind === "open-overlay"});`),
        kfCompilerAction: {
          operation: overlayAction.kind,
          targetSemanticControlId: overlayAction.targetSemanticControlId,
          targetInstanceName: overlayAction.targetInstanceName,
          visible: overlayAction.kind === "open-overlay",
        },
      });
      expect(link).not.toHaveProperty("action");
    }
    for (const overlay of materialization.controls.filter((control) => control.overlayHost !== undefined)) {
      const rawOverlay = controlsByName.get(overlay.instanceName);
      expect(rawOverlay?.baseProperty?.visible, `${fixture.id}: packaged overlay initially hidden`).toBe(false);
    }

    const navigationActions = materialization.interactions.actions.filter((action) => action.kind === "navigate-page");
    expect(navigationActions.length, `${fixture.id}: navigation actions`).toBeGreaterThanOrEqual(1);
    navigationActions.forEach((navigation) => {
      const navigationOwner = controlsByName.get(navigation.ownerInstanceName);
      expect(navigationOwner?.linkMng?.linkList?.some((link) =>
        link.action === "navigatePage" && link.pageId === navigation.targetPageGuid),
      `${fixture.id}: packaged navigation ${navigation.sourceActionId}`).toBe(true);
    });

    if (fixture.id === "portal") {
      const bindings = envelope.plan.assetBindings ?? [];
      const expectedById = new Map(PORTAL_ASSET_SPECS.map((asset) => [asset.assetId, asset]));
      expect(bindings).toHaveLength(4);
      expect(new Set(bindings.map((binding) => binding.assetId)).size).toBe(4);
      expect(new Set(bindings.map((binding) => binding.workspaceAssetId)).size).toBe(4);
      expect(new Set(bindings.map((binding) => binding.sha256)).size).toBe(4);
      expect(new Set(bindings.map((binding) => binding.targetPath)).size).toBe(4);
      for (const binding of bindings) {
        const expected = expectedById.get(binding.assetId);
        expect(expected, `portal: approved asset ${binding.assetId}`).toBeDefined();
        expect(binding).toMatchObject({
          workspaceAssetId: expected.workspaceAssetId,
          mediaType: "image/png",
          sha256: createHash("sha256").update(expected.bytes).digest("hex"),
          sizeBytes: expected.bytes.byteLength,
        });
        expect(binding.targetPath).toBe(`project/res/images/${binding.sha256}.png`);
        expect(await readFile(path.join(imported, "1.0.0.1", binding.targetPath))).toEqual(expected.bytes);
        const compiledImage = materialization.controls.find((control) => control.semanticControlId === binding.controlId);
        expect(compiledImage?.capabilityId).toBe("image");
        expect(controlsByName.get(compiledImage.instanceName)?.src).toBe(path.basename(binding.targetPath));
        expect(materialization.stylesData.find((style) => style.semanticControlId === binding.controlId)
          ?.approvedAssets.some((approved) => approved.assetId === binding.assetId
            && approved.approvedAsset.sha256 === binding.sha256)).toBe(true);
      }
    }

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
      const profileContent = materialization.controls.find((control) => control.semanticControlId === "admin-profile-name-input");
      const activity = materialization.controls.find((control) => control.semanticControlId === fixture.expect.activityTargetId);
      const submit = materialization.controls.find((control) => control.semanticControlId === fixture.expect.submitSourceId);
      const status = materialization.controls.find((control) => control.semanticControlId === fixture.expect.submitTargetId);
      expect(tabs).toBeDefined();
      expect(profileContent).toBeDefined();
      expect(activity).toBeDefined();
      expect(submit).toBeDefined();
      expect(status).toBeDefined();
      const expectedPanes = [
        { paneId: "admin-profile-pane", tabId: "profile-tab", regionId: "admin-profile-name", contentId: "admin-profile-name-input" },
        { paneId: "admin-activity-pane", tabId: "activity-tab", regionId: "admin-activity", contentId: fixture.expect.activityTargetId },
        { paneId: "admin-permission-pane", tabId: "permission-tab", regionId: "admin-dialog-status", contentId: "admin-submit-status-grid" },
      ];
      const nativeTabs = controlsByName.get(tabs.instanceName);
      const nativePanes = nativeTabs?.insiderObjects ?? [];
      expect(nativeTabs?.uiModelType).toBe(47);
      expect(nativeTabs).not.toHaveProperty("tabData");
      expect(nativeTabs).not.toHaveProperty("activeName");
      expect(nativePanes).toHaveLength(expectedPanes.length);
      for (const expectedPane of expectedPanes) {
        const pane = materialization.controls.find((control) => control.semanticControlId === expectedPane.paneId);
        const content = materialization.controls.find((control) => control.semanticControlId === expectedPane.contentId);
        expect(pane, `management-admin: materialized pane ${expectedPane.paneId}`).toMatchObject({
          parentSemanticControlId: tabs.semanticControlId,
          parentInstanceName: tabs.instanceName,
          tabPane: {
            ownerSemanticControlId: tabs.semanticControlId,
            tabId: expectedPane.tabId,
            sourceBlueprintRegionId: expectedPane.regionId,
          },
        });
        expect(content, `management-admin: pane content ${expectedPane.contentId}`).toBeDefined();
        const nativePane = nativePanes.find((control) => nativeName(control) === pane.instanceName);
        expect(nativePane?.region, `management-admin: native pane region ${expectedPane.paneId}`).toBe(expectedPane.tabId);
        expect(walkControls(nativePane?.insiderObjects ?? []).some((control) => nativeName(control) === content.instanceName),
          `management-admin: native pane content ${expectedPane.contentId}`).toBe(true);
      }
      const tabsRuntime = runPackagedTabsInitialization(nativeTabs);
      expect(tabsRuntime.metadata).toMatchObject({
        schema: "kf-compiled-tabs/v1",
        ownerInstanceName: tabs.instanceName,
        uiModelType: 47,
        tabNames: ["profile-tab", "activity-tab", "permission-tab"],
        activeName: "profile-tab",
      });
      expect(tabsRuntime.body).toBe('this.tabs({"tabData":[{"name":"profile-tab","label":"基本资料"},{"name":"activity-tab","label":"操作记录"},{"name":"permission-tab","label":"权限范围"}],"activeName":"profile-tab"});\n');
      expect(tabsRuntime.$vm).toMatchObject({
        tabData: [
          { name: "profile-tab", label: "基本资料" },
          { name: "activity-tab", label: "操作记录" },
          { name: "permission-tab", label: "权限范围" },
        ],
        activeName: "profile-tab",
      });
      expect([...tabsRuntime.componentMap.keys()].sort()).toEqual(["activity-tab", "permission-tab", "profile-tab"]);
      expect(nativeName(tabsRuntime.selected)).toBe(
        materialization.controls.find((control) => control.semanticControlId === "admin-profile-pane").instanceName,
      );
      expect(controlsByName.get(profileContent.instanceName), "management-admin: 基本资料 tab content").toBeDefined();
      expect(controlsByName.get(activity.instanceName), "management-admin: 操作记录 tab content").toBeDefined();
      const tabClick = controlsByName.get(tabs.instanceName)?.linkMng?.linkList?.find((link) => link.name === "Tab-click");
      expect(String(tabClick?.script)).toContain(`${activity.instanceName}.SetData(`);
      expect(String(tabClick?.script)).toContain("复核部门管理员权限");
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
    for (const fixture of loaded) {
      expect(canonicalServerHash(designSignature(renamedFixtureIdentifiers(fixture))),
        `${fixture.id}: fingerprint ignores raw ids and role names`)
        .toBe(canonicalServerHash(designSignature(fixture)));
    }
    expect(new Set(loaded.map((fixture) => canonicalServerHash(designSignature(fixture))).values()).size).toBe(3);

    for (const fixture of loaded) {
      const first = await runGoldenBuild(fixture, 1);
      const second = await runGoldenBuild(fixture, 2);
      expect(second, `${fixture.id}: deterministic build hashes`).toEqual(first);
    }
  }, 300_000);
});
