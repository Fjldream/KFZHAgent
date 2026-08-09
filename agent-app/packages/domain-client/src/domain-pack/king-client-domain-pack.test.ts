// @ts-nocheck -- adapter behavior is exercised through the public DomainPack boundary.
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createKingClientDomainPack } from "../index.js";
import { planHash } from "../patch/client-patcher.js";

const ir = {
  schema: "kf-client-project-ir/v1" as const,
  id: "client-1",
  name: "Client One",
  version: "1.0.0.1",
  pages: [{
    id: "page-1",
    name: "Page1",
    controls: [{
      id: "Title",
      type: "text" as const,
      x: 10,
      y: 10,
      width: 200,
      height: 40,
      text: "Title",
    }],
  }],
};

describe("KingClient domain pack", () => {
  it("creates compiled and patched workspaces inside the requested workRoot", async () => {
    const pack = createKingClientDomainPack({ nativeAccepted: true });
    const workRoot = await mkdtemp(path.join(tmpdir(), "kf-domain-pack-root-"));
    const base = await pack.compile({
      projectIr: ir,
      buildSeed: "workspace-root-test",
      workRoot,
    });
    const inspection = await pack.inspect({ workspace: base });
    const [titleGuid] = Object.keys(inspection.index.controls);
    const changePlan = {
      schema: "kf-change-plan/v1",
      workspaceId: "workspace-root-test",
      operations: [{
        op: "update",
        entityId: titleGuid,
        changes: [{ path: "/text", value: "Inside Root" }],
      }],
    };
    const candidate = await pack.patch({
      baseWorkspace: base,
      changePlan,
      expectedPlanHash: planHash(changePlan),
      workRoot,
    });

    expect(path.relative(workRoot, base.rootDir)).not.toMatch(/^\.\.(?:\/|$)/);
    expect(path.relative(workRoot, candidate.rootDir)).not.toMatch(/^\.\.(?:\/|$)/);
  });

  it("compiles, patches, validates, and packages through DomainPack", async () => {
    const pack = createKingClientDomainPack({ nativeAccepted: false });
    const base = await pack.compile({
      projectIr: ir,
      buildSeed: "workspace-1",
    });
    const inspection = await pack.inspect({ workspace: base });
    const [titleGuid] = Object.keys(inspection.index.controls);
    const changePlan = {
      schema: "kf-change-plan/v1",
      workspaceId: "workspace-1",
      operations: [{
        op: "update",
        entityId: titleGuid,
        changes: [{ path: "/text", value: "Updated Title" }],
      }],
    };
    const candidate = await pack.patch({
      baseWorkspace: base,
      changePlan,
      expectedPlanHash: planHash(changePlan),
    });
    const report = await pack.validate({
      baseWorkspace: base,
      candidateWorkspace: candidate,
      changePlan,
    });
    const artifact = await pack.package({ workspace: candidate });

    expect(pack.metadata.kind).toBe("kingclient");
    expect(pack.metadata.supported).toBe(false);
    expect(report.status).toBe("pass");
    expect(artifact.artifactKind).toBe("client-package");
    expect(artifact.domainProjectKind).toBe("client-package");
    expect(artifact.mediaType).toBe("application/zip");
    expect(artifact.fileExtension).toBe(".gz");
    expect(artifact.bytes.byteLength).toBeGreaterThan(0);
  });

  it("imports a packaged workspace that the adapter can inspect", async () => {
    const pack = createKingClientDomainPack({ nativeAccepted: true });
    const workspace = await pack.compile({
      projectIr: ir,
      buildSeed: "workspace-1",
    });
    const artifact = await pack.package({ workspace });
    const imported = await pack.importPackage({ bytes: artifact.bytes });
    const inspection = await pack.inspect({ workspace: imported });

    expect(imported).toMatchObject({ id: "imported-client", mode: "base" });
    expect(inspection.summary.pages).toHaveLength(1);
  });
});
