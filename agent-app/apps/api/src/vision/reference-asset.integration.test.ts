// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import "reflect-metadata";
import { assertSafeTestDatabase } from "../../../../tests/helpers/database-safety.js";
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
assertSafeTestDatabase({ url: process.env.DATABASE_URL, allowReset: process.env.KF_TEST_ALLOW_DESTRUCTIVE_RESET, expectedPrefix: "kf_agent_test_" });
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import cookieParser from "cookie-parser";
import request from "supertest";
import sharp from "sharp";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppModule } from "../app.module.js";
import { SessionService, SESSION_COOKIE_NAME } from "../auth/session.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { WorkspaceService } from "../workspaces/workspace.service.js";
import { AssetService } from "../assets/asset.service.js";
import { toModelAssetId } from "../assets/model-asset-id.js";
import { ARTIFACT_STORAGE } from "../artifacts/artifact-storage.js";
import type { ArtifactStorage } from "@kf/artifact-storage";
import { ReferenceAssetService } from "./reference-asset.service.js";

let app: INestApplication;
let prisma: PrismaService;
let references: ReferenceAssetService;
let tenantId: string;
let workspaceId: string;
let otherWorkspaceId: string;
let otherTenantId: string;
let otherTenantWorkspaceId: string;
let cookie: string;
let otherCookie: string;
let root: string;
let bytes: Buffer;
const origin = "http://localhost:5174";
const endpoint = () => `/api/v2/workspaces/${workspaceId}/reference-assets`;
const upload = (body = bytes, name = "design.png") => request(app.getHttpServer()).post(endpoint()).query({ name })
  .set("Cookie", cookie).set("Origin", origin).set("Content-Type", "image/png").send(body);
const files = async () => (await readdir(root, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).length;
const directUpload = (body = bytes, workspace = workspaceId) => references.upload({ tenantId, workspaceId: workspace, stream: Readable.from([body]) });

beforeAll(async () => {
  root = await mkdtemp(path.join(tmpdir(), "kf-reference-tests-"));
  process.env.ARTIFACT_STORAGE_ROOT = root;
  const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = module.createNestApplication();
  app.use(cookieParser());
  await app.init();
  prisma = app.get(PrismaService);
  references = app.get(ReferenceAssetService);
  tenantId = (await prisma.tenant.create({ data: { name: `reference-${randomUUID()}` } })).id;
  otherTenantId = (await prisma.tenant.create({ data: { name: `reference-other-${randomUUID()}` } })).id;
  for (const id of [tenantId, otherTenantId]) {
    const user = await prisma.user.create({ data: { tenantId: id, username: "reference-user", passwordHash: "session-only", role: "tenant_admin", mustChangePassword: false } });
    const session = await app.get(SessionService).createSession(user.id);
    if (id === tenantId) cookie = `${SESSION_COOKIE_NAME}=${session.token}`;
    else otherCookie = `${SESSION_COOKIE_NAME}=${session.token}`;
  }
  otherWorkspaceId = (await prisma.solutionWorkspace.create({ data: { tenantId, name: "other" } })).id;
  otherTenantWorkspaceId = (await prisma.solutionWorkspace.create({ data: { tenantId: otherTenantId, name: "other" } })).id;
  bytes = await sharp({ create: { width: 100, height: 50, channels: 4, background: "#123456" } }).png().toBuffer();
}, 30000);
beforeEach(async () => {
  vi.stubEnv("AGENT_ALLOWED_ORIGINS", origin);
  vi.stubEnv("AGENT_RUNS_V2", "true");
  vi.stubEnv("AGENT_WORKBENCH_V2", "true");
  vi.stubEnv("AGENT_FEATURE_TENANT_ALLOWLIST", tenantId);
  vi.stubEnv("AGENT_REFERENCE_UPLOADS_V1", "true");
  vi.stubEnv("AGENT_REFERENCE_QUOTA_BYTES", undefined);
  workspaceId = (await prisma.solutionWorkspace.create({ data: { tenantId, name: randomUUID() } })).id;
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
afterAll(async () => { await app?.close(); if (root) await rm(root, { recursive: true, force: true }); });

describe("private reference image ingestion (no model egress)", () => {
  it("stores the original and real derived pixels, never as client compilation material", async () => {
    const response = await upload().expect(201);
    expect(response.body).toMatchObject({ purpose: "reference", mimeType: "image/webp", width: 100, height: 50 });
    expect(JSON.stringify(response.body)).not.toMatch(/storageKey|\/Users\/|base64/);
    const resolved = await references.resolve(tenantId, workspaceId, response.body.id);
    expect(resolved).toMatchObject({ tenantId, workspaceId, assetId: response.body.id, mimeType: "image/webp" });
    expect((await sharp(resolved.bytes).metadata()).format).toBe("webp");
    expect(await app.get(AssetService).list({ tenantId, workspaceId })).toEqual([]);
    await expect(app.get(AssetService).resolveManyForCompilation({ tenantId, workspaceId, assetIds: [toModelAssetId(response.body.id as string)] }))
      .rejects.toThrow("workspace assets not found");
    const image = await request(app.getHttpServer()).get(`${endpoint()}/${response.body.id}/image`).set("Cookie", cookie).expect(200);
    expect(image.headers["cache-control"]).toContain("no-store");
    expect(image.headers["x-content-type-options"]).toBe("nosniff");
    expect(Buffer.from(image.body)).toEqual(Buffer.from(resolved.bytes));
    expect((await request(app.getHttpServer()).get("/api/v2/workbench-config").set("Cookie", cookie).expect(200)).body.outboundImagesAllowed).toBe(false);
  });
  it("requires session, mutation Origin, explicit local-upload enablement and exact tenant admission", async () => {
    await request(app.getHttpServer()).post(endpoint()).set("Content-Type", "image/png").send(bytes).expect(401);
    await request(app.getHttpServer()).post(endpoint()).set("Cookie", cookie).set("Content-Type", "image/png").send(bytes).expect(403);
    vi.stubEnv("AGENT_REFERENCE_UPLOADS_V1", undefined);
    await upload().expect(403);
    vi.stubEnv("AGENT_REFERENCE_UPLOADS_V1", "true");
    vi.stubEnv("AGENT_FEATURE_TENANT_ALLOWLIST", `${tenantId}-suffix`);
    await upload().expect(403);
    expect(await prisma.referenceAsset.count({ where: { workspaceId } })).toBe(0);
  });
  it("refuses traversal names and MIME spoofing without leaving rows or blobs", async () => {
    const before = await files();
    await upload(bytes, "../../outside.png").expect(400);
    await request(app.getHttpServer()).post(endpoint()).set("Cookie", cookie).set("Origin", origin).set("Content-Type", "image/jpeg").send(bytes).expect(422);
    expect(await files()).toBe(before);
    expect(await prisma.referenceAsset.count({ where: { workspaceId } })).toBe(0);
  });
  it("does not accept URL/path references or permit cross-workspace / cross-tenant reads", async () => {
    const asset = await directUpload();
    await expect(references.resolve(tenantId, otherWorkspaceId, asset.id)).rejects.toThrow("reference asset");
    await expect(references.resolve(otherTenantId, otherTenantWorkspaceId, asset.id)).rejects.toThrow("reference asset");
    for (const id of ["https://example.invalid/image.png", "../image.png"]) {
      await expect(references.resolve(tenantId, workspaceId, id)).rejects.toThrow("reference asset");
    }
    await request(app.getHttpServer()).get(`${endpoint()}/${asset.id}/image`).expect(401);
    await request(app.getHttpServer()).get(`${endpoint()}/${asset.id}/image`).set("Cookie", otherCookie).expect(404);
    await request(app.getHttpServer()).post(`/api/v2/workspaces/${otherTenantWorkspaceId}/reference-assets`).set("Cookie", cookie).set("Origin", origin).set("Content-Type", "image/png").send(bytes).expect(404);
  });
  it("deduplicates concurrent same-hash uploads within one workspace, not across workspaces", async () => {
    const before = await files();
    const results = await Promise.all([directUpload(), directUpload()]);
    expect(results[0]?.id).toBe(results[1]?.id);
    expect(await prisma.referenceAsset.count({ where: { workspaceId } })).toBe(1);
    expect(await files()).toBe(before + 2);
    expect((await directUpload(bytes, otherWorkspaceId)).id).not.toBe(results[0]?.id);
  });
  it("enforces source+derivative tenant quota atomically, including other workspaces", async () => {
    const first = await directUpload();
    const current = await prisma.referenceAsset.aggregate({ where: { tenantId }, _sum: { totalBytes: true } });
    vi.stubEnv("AGENT_REFERENCE_QUOTA_BYTES", String(current._sum.totalBytes));
    expect((await directUpload()).id).toBe(first.id); // dedupe does not consume more quota
    const freshWorkspace = await prisma.solutionWorkspace.create({ data: { tenantId, name: randomUUID() } });
    await expect(directUpload(bytes, freshWorkspace.id)).rejects.toThrow("REFERENCE_QUOTA_EXCEEDED");
  });
  it("serializes quota admission across concurrent uploads in different workspaces", async () => {
    const workspaces = await Promise.all([0, 1].map(() => prisma.solutionWorkspace.create({ data: { tenantId, name: randomUUID() } })));
    const prepared = await sharp(bytes).webp({ lossless: true }).toBuffer();
    const current = await prisma.referenceAsset.aggregate({ where: { tenantId }, _sum: { totalBytes: true } });
    vi.stubEnv("AGENT_REFERENCE_QUOTA_BYTES", String((current._sum.totalBytes ?? 0) + bytes.length + prepared.length));
    const before = await files();
    const results = await Promise.allSettled(workspaces.map(workspace => directUpload(bytes, workspace.id)));
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const rejected = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(rejected.reason).toHaveProperty("message", "REFERENCE_QUOTA_EXCEEDED");
    expect(await files()).toBe(before + 2);
  });
  it("rejects overlong streamed bodies and aborted uploads without persisting partials", async () => {
    const before = await files();
    await expect(references.upload({ tenantId, workspaceId, stream: Readable.from([Buffer.alloc(10 * 1024 * 1024), Buffer.from([1])]) })).rejects.toThrow("IMAGE_BYTES_EXCEEDED");
    const cancelled = Readable.from((async function* () { yield bytes.subarray(0, 10); throw new Error("client disconnected"); })());
    await expect(references.upload({ tenantId, workspaceId, stream: cancelled })).rejects.toThrow("IMAGE_UPLOAD_ABORTED");
    expect(await files()).toBe(before);
    expect(await prisma.referenceAsset.count({ where: { workspaceId } })).toBe(0);
  });
  it("accepts exactly 10MiB of a valid PNG, strips private text, and returns HTTP 413 above that boundary", async () => {
    const exact = paddedPng(bytes, 10 * 1024 * 1024);
    const accepted = await upload(exact).expect(201);
    expect((await references.resolve(tenantId, workspaceId, accepted.body.id)).bytes.length).toBeLessThan(1024);
    await upload(Buffer.concat([exact, Buffer.from([0])])).expect(413);
  });
  it("fails closed for invalid quota configuration before storage writes", async () => {
    const before = await files();
    vi.stubEnv("AGENT_REFERENCE_QUOTA_BYTES", "NaN");
    await upload().expect(503);
    expect(await files()).toBe(before);
  });
  it("reclaims the original if derivative storage fails", async () => {
    const storage = app.get<ArtifactStorage>(ARTIFACT_STORAGE);
    const put = storage.put.bind(storage);
    let calls = 0;
    vi.spyOn(storage, "put").mockImplementation(async input => {
      if (++calls === 2) throw new Error("simulated derivative disk failure");
      return put(input);
    });
    const before = await files();
    await expect(directUpload()).rejects.toThrow("simulated derivative disk failure");
    expect(await files()).toBe(before);
    expect(await prisma.referenceAsset.count({ where: { workspaceId } })).toBe(0);
  });
  it("reclaims stored bytes if the client cancels before adoption", async () => {
    const storage = app.get<ArtifactStorage>(ARTIFACT_STORAGE);
    const put = storage.put.bind(storage);
    const controller = new AbortController();
    vi.spyOn(storage, "put").mockImplementationOnce(async input => {
      const result = await put(input);
      controller.abort();
      return result;
    });
    const before = await files();
    await expect(references.upload({ tenantId, workspaceId, stream: Readable.from([bytes]), signal: controller.signal })).rejects.toThrow("IMAGE_UPLOAD_ABORTED");
    expect(await files()).toBe(before);
    expect(await prisma.referenceAsset.count({ where: { workspaceId } })).toBe(0);
  });
  it("serializes adoption against workspace deletion and leaves no unowned bytes", async () => {
    const storage = app.get<ArtifactStorage>(ARTIFACT_STORAGE);
    const put = storage.put.bind(storage);
    let calls = 0;
    vi.spyOn(storage, "put").mockImplementation(async input => {
      const result = await put(input);
      if (++calls === 2) await app.get(WorkspaceService).deleteWorkspace(tenantId, workspaceId);
      return result;
    });
    const before = await files();
    await expect(directUpload()).rejects.toThrow("workspace");
    expect(await files()).toBe(before);
    expect(await prisma.referenceAsset.count({ where: { workspaceId } })).toBe(0);
  });
  it("retains adopted bytes after an ambiguous commit acknowledgement", async () => {
    const transaction = prisma.$transaction.bind(prisma);
    vi.spyOn(prisma, "$transaction").mockImplementationOnce(async callback => {
      await transaction(callback);
      throw new Error("simulated commit acknowledgement loss");
    });
    const before = await files();
    await expect(directUpload()).rejects.toThrow("simulated commit acknowledgement loss");
    const row = await prisma.referenceAsset.findFirstOrThrow({ where: { workspaceId } });
    expect(await files()).toBe(before + 2);
    expect((await references.resolve(tenantId, workspaceId, row.id)).width).toBe(100);
  });
  it("verifies stored derivative integrity before returning pixels", async () => {
    const asset = await directUpload();
    await prisma.referenceAssetDerivative.update({ where: { assetId: asset.id }, data: { derivativeHash: "0".repeat(64) } });
    await expect(references.resolve(tenantId, workspaceId, asset.id)).rejects.toThrow("REFERENCE_INTEGRITY_FAILED");
  });
  it("workspace deletion cleans both reference blobs as well as database metadata", async () => {
    const before = await files();
    await directUpload();
    expect(await files()).toBe(before + 2);
    await app.get(WorkspaceService).deleteWorkspace(tenantId, workspaceId);
    expect(await prisma.referenceAsset.count({ where: { workspaceId } })).toBe(0);
    expect(await files()).toBe(before);
  });
});

/** Adds one valid ancillary text chunk; generated pixels stay tiny, source byte-boundary remains exact. */
function paddedPng(source: Buffer, length: number): Buffer {
  const payload = Buffer.alloc(length - source.length - 12, "x");
  payload.write("Comment\0");
  const header = Buffer.alloc(8);
  header.writeUInt32BE(payload.length);
  header.write("tEXt", 4);
  let crc = 0xffffffff;
  for (const byte of Buffer.concat([header.subarray(4), payload])) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([source.subarray(0, -12), header, payload, checksum, source.subarray(-12)]);
}
// end
