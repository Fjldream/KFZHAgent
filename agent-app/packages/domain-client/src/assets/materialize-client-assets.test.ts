import { createHash } from "node:crypto";
import { link, lstat, mkdir, mkdtemp, readFile, realpath, rename, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DomainAssetInput, InternalChangePlan } from "@kf/contracts";
import {
  applyClientPatch,
  createKingClientDomainPack,
  deriveGuid,
  importNativeClientPackage,
  inspectClientProject,
  materializeClientAssets,
  packageNativeClientProject,
  planHash,
  validateClientProject,
} from "../index.js";

const BYTES = Buffer.from("exact approved image bytes");
const SHA = createHash("sha256").update(BYTES).digest("hex");
const ASSET_ID = "asset-00000000000040008000000000000001";
const TARGET = `static/agent-assets/${SHA}.png`;

const ir = {
  schema: "kf-client-project-ir/v1" as const,
  id: "client-assets",
  name: "Client Assets",
  version: "1.0.0.1",
  pages: [{
    id: "home",
    name: "Home",
    width: 800,
    height: 600,
    controls: [{
      id: "hero/portrait",
      type: "image" as const,
      x: 20,
      y: 20,
      width: 160,
      height: 160,
      src: "asset",
    }],
  }],
};

function plan(): InternalChangePlan {
  return {
    schema: "kf-change-plan/v1",
    workspaceId: "workspace-assets",
    operations: [],
    assetBindings: [binding()],
  };
}

function binding(overrides: Partial<NonNullable<InternalChangePlan["assetBindings"]>[number]> = {}): NonNullable<InternalChangePlan["assetBindings"]>[number] {
  return {
    assetId: ASSET_ID,
    workspaceAssetId: "00000000-0000-4000-8000-000000000001",
    entityId: "hero/portrait",
    controlId: "hero/portrait",
    capabilityId: "image",
    targetPath: TARGET,
    mediaType: "image/png",
    sha256: SHA,
    sizeBytes: BYTES.byteLength,
    ...overrides,
  };
}

function asset(overrides: Partial<DomainAssetInput> = {}): DomainAssetInput {
  return {
    assetId: ASSET_ID,
    targetPath: TARGET,
    mediaType: "image/png",
    sha256: SHA,
    bytes: BYTES,
    ...overrides,
  };
}

async function workspace() {
  const pack = createKingClientDomainPack({ nativeAccepted: true });
  return pack.compile({ projectIr: ir, buildSeed: "workspace-assets" });
}

describe("materializeClientAssets", () => {
  it("writes exact bytes, rewrites the bound image, and retains both through package round-trip", async () => {
    const candidate = await workspace();
    await materializeClientAssets({ workspaceRoot: candidate.rootDir, plan: plan(), assets: [asset()] });

    const versionRoot = path.join(candidate.rootDir, "1.0.0.1");
    expect(await readFile(path.join(versionRoot, TARGET))).toEqual(BYTES);
    const inspected = await inspectClientProject(candidate.rootDir);
    const portraitGuid = deriveGuid({ seed: "workspace-assets" }, "hero/portrait");
    const rawPage = inspected.raw.pages[Object.keys(inspected.raw.pages)[0]!] as { objects: unknown[] };
    expect(rawPage.objects)
      .toEqual(expect.arrayContaining([expect.objectContaining({ guid: portraitGuid, src: TARGET })]));

    const packaged = await packageNativeClientProject(candidate.rootDir);
    const destination = await mkdtemp(path.join(tmpdir(), "kf-asset-roundtrip-"));
    const imported = await importNativeClientPackage(packaged, destination);
    expect(await readFile(path.join(imported, "1.0.0.1", TARGET))).toEqual(BYTES);
  });

  it("is idempotent only when an existing regular file has the exact approved bytes", async () => {
    const candidate = await workspace();
    await materializeClientAssets({ workspaceRoot: candidate.rootDir, plan: plan(), assets: [asset()] });
    await expect(materializeClientAssets({ workspaceRoot: candidate.rootDir, plan: plan(), assets: [asset()] })).resolves.toBeUndefined();

    await writeFile(path.join(candidate.rootDir, "1.0.0.1", TARGET), "tampered");
    await expect(materializeClientAssets({ workspaceRoot: candidate.rootDir, plan: plan(), assets: [asset()] }))
      .rejects.toThrow(/collision|checksum/i);
  });

  it.each([
    ["missing input", [], /missing/i],
    ["checksum mismatch", [asset({ sha256: "0".repeat(64) })], /checksum|sha|target/i],
    ["declared size mismatch", [asset({ bytes: Buffer.concat([BYTES, Buffer.from("x")]) })], /checksum|sha/i],
    ["traversal target", [asset({ targetPath: "static/agent-assets/../escape.png" })], /path|target/i],
  ])("rejects %s", async (_label, assets, expected) => {
    const candidate = await workspace();
    await expect(materializeClientAssets({ workspaceRoot: candidate.rootDir, plan: plan(), assets })).rejects.toThrow(expected);
  });

  it("rejects duplicate targets, oversized aggregate input, and symlink ancestors", async () => {
    const candidate = await workspace();
    const secondId = "asset-00000000000040008000000000000002";
    const duplicatePlan: InternalChangePlan = {
      ...plan(),
      assetBindings: [
        binding(),
        binding({ assetId: secondId, workspaceAssetId: "00000000-0000-4000-8000-000000000002", entityId: "other-image", controlId: "other-image" }),
      ],
    };
    await expect(materializeClientAssets({
      workspaceRoot: candidate.rootDir,
      plan: duplicatePlan,
      assets: [asset(), asset({ assetId: secondId })],
    })).rejects.toThrow(/duplicate target|collision/i);

    await expect(materializeClientAssets({
      workspaceRoot: candidate.rootDir,
      plan: plan(),
      assets: [asset()],
      maxAggregateBytes: BYTES.byteLength - 1,
    })).rejects.toThrow(/aggregate|size/i);

    const agentAssets = path.join(candidate.rootDir, "1.0.0.1", "static", "agent-assets");
    await rm(agentAssets, { recursive: true, force: true });
    await mkdir(path.dirname(agentAssets), { recursive: true });
    const outside = await mkdtemp(path.join(tmpdir(), "kf-asset-outside-"));
    await symlink(outside, agentAssets);
    expect((await lstat(agentAssets)).isSymbolicLink()).toBe(true);
    await expect(materializeClientAssets({ workspaceRoot: candidate.rootDir, plan: plan(), assets: [asset()] }))
      .rejects.toThrow(/symlink/i);
  });

  it("rejects an exact-byte existing target when it has another hard link", async () => {
    const candidate = await workspace();
    await materializeClientAssets({ workspaceRoot: candidate.rootDir, plan: plan(), assets: [asset()] });
    const target = path.join(candidate.rootDir, "1.0.0.1", TARGET);
    await link(target, path.join(candidate.rootDir, "linked-copy.png"));
    await expect(materializeClientAssets({ workspaceRoot: candidate.rootDir, plan: plan(), assets: [asset()] }))
      .rejects.toThrow(/hard.?link|link count|collision/i);
  });

  it("rejects a signed binding whose expected control identity does not match the resolved image", async () => {
    const candidate = await workspace();
    await expect(materializeClientAssets({
      workspaceRoot: candidate.rootDir,
      plan: { ...plan(), assetBindings: [binding({ controlId: "another-image" })] },
      assets: [asset()],
    })).rejects.toThrow(/control|identity|binding/i);
  });

  it("removes its exact candidate tree when a post-publication image rewrite fails", async () => {
    const base = await workspace();
    const workRoot = await mkdtemp(path.join(tmpdir(), "kf-asset-candidate-owner-"));
    const portraitGuid = deriveGuid({ seed: "workspace-assets" }, "hero/portrait");
    const change = {
      ...plan(),
      operations: [{
        op: "update" as const,
        entityType: "control",
        entityId: portraitGuid,
        changes: [{ path: "/src", value: "unapproved-local-image.png" }],
      }],
    };

    await expect(applyClientPatch(base.rootDir, change, { assets: [asset()], workRoot }))
      .rejects.toThrow(/unauthorized source/i);
    expect(await readFile(path.join(base.rootDir, "1.0.0.1", TARGET)).catch(() => undefined)).toBeUndefined();
    expect(await (await import("node:fs/promises")).readdir(workRoot)).toEqual([]);
  });

  it("detects a swapped static ancestor before publishing staged bytes", async () => {
    const candidate = await workspace();
    const versionRoot = path.join(candidate.rootDir, "1.0.0.1");
    const staticRoot = path.join(versionRoot, "static");
    await mkdir(staticRoot, { recursive: true });
    const call = materializeClientAssets as (input: Parameters<typeof materializeClientAssets>[0] & {
      hooks: { beforePublish: () => Promise<void> };
    }) => Promise<void>;
    await expect(call({
      workspaceRoot: candidate.rootDir,
      plan: plan(),
      assets: [asset()],
      hooks: { beforePublish: async () => {
        await rename(staticRoot, `${staticRoot}-swapped`);
        await mkdir(staticRoot);
      } },
    })).rejects.toThrow(/ancestor|changed|identity|race/i);
    await expect(readFile(path.join(staticRoot, TARGET))).rejects.toThrow();
  });

  it("rejects a page symlink swap after asset publication without overwriting the external file", async () => {
    const candidate = await workspace();
    const pageFile = path.join(candidate.rootDir, "1.0.0.1", "project", "page", "Home.json");
    const externalRoot = await mkdtemp(path.join(tmpdir(), "kf-page-swap-outside-"));
    const externalPage = path.join(externalRoot, "outside.json");
    const original = await readFile(pageFile);
    await writeFile(externalPage, original);
    const call = materializeClientAssets as (input: Parameters<typeof materializeClientAssets>[0] & {
      hooks: { afterPublishBeforeRewrite: () => Promise<void> };
    }) => Promise<void>;

    await expect(call({
      workspaceRoot: candidate.rootDir,
      plan: plan(),
      assets: [asset()],
      hooks: { afterPublishBeforeRewrite: async () => {
        await rename(pageFile, `${pageFile}.original`);
        await symlink(externalPage, pageFile);
      } },
    })).rejects.toThrow(/page|symlink|identity|canonical/i);
    expect(await readFile(externalPage)).toEqual(original);
  });

  it("rejects a case-aliased agent-assets directory when the filesystem aliases case", async () => {
    const candidate = await workspace();
    const staticRoot = path.join(candidate.rootDir, "1.0.0.1", "static");
    await mkdir(path.join(staticRoot, "Agent-Assets"), { recursive: true });
    let aliasesCase = false;
    try {
      aliasesCase = (await realpath(path.join(staticRoot, "agent-assets"))) !== path.join(staticRoot, "agent-assets");
    } catch { /* case-sensitive filesystem: no alias exists */ }
    if (!aliasesCase) return;
    await expect(materializeClientAssets({ workspaceRoot: candidate.rootDir, plan: plan(), assets: [asset()] }))
      .rejects.toThrow(/case|canonical|realpath|alias/i);
  });

  it("makes validation fail when an agent asset reference is absent", async () => {
    const base = await workspace();
    const portraitGuid = deriveGuid({ seed: "workspace-assets" }, "hero/portrait");
    const missingPlan = {
      schema: "kf-change-plan/v1" as const,
      workspaceId: "workspace-assets",
      operations: [{ op: "update" as const, entityId: portraitGuid, entityType: "control", changes: [{ path: "/src", value: TARGET }] }],
    };
    const pack = createKingClientDomainPack({ nativeAccepted: true });
    const candidate = await pack.patch({ baseWorkspace: base, changePlan: missingPlan, expectedPlanHash: planHash(missingPlan) });
    const report = await validateClientProject(base.rootDir, candidate.rootDir, missingPlan, { skipRoundTrip: false });
    expect(report.status).toBe("fail");
    expect(JSON.stringify(report)).toMatch(/agent-assets|resource/i);
  });
});
