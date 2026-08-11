import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { DomainAssetInput, InternalChangePlan } from "@kf/contracts";
import {
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
    assetBindings: [{ assetId: ASSET_ID, entityId: "hero/portrait" }],
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
        { assetId: ASSET_ID, entityId: "hero/portrait" },
        { assetId: secondId, entityId: "other-image" },
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
