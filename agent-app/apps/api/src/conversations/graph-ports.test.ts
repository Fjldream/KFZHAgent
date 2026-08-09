// @ts-nocheck -- focused port test uses narrow Prisma/storage doubles.
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createKingClientDomainPack } from "@kf/domain-client";
import { createGraphPorts } from "./graph-ports.js";

describe("conversation graph workspace query", () => {
  it("loads editable page and control entities from the current built client package", async () => {
    const pack = createKingClientDomainPack({ nativeAccepted: true });
    const built = await pack.compile({
      buildSeed: "workspace-built-context",
      projectIr: {
        schema: "kf-client-project-ir/v1",
        id: "client-project",
        name: "Built Client",
        pages: [{
          id: "home",
          name: "Home",
          width: 1440,
          height: 900,
          controls: [{
            id: "HeroTitle",
            type: "text",
            x: 60,
            y: 50,
            width: 400,
            height: 60,
            text: "张伟",
          }],
        }],
      },
    });
    const artifact = await pack.package({ workspace: built });
    const prisma = {
      solutionRevision: {
        findFirst: vi.fn().mockResolvedValue({
          state: { mode: "compile", plan: { schema: "kf-change-plan/v1", operations: [] } },
        }),
      },
      domainProjectRevision: {
        findFirst: vi.fn().mockResolvedValue({ packageUrl: "built-package-key" }),
      },
    };
    const storage = {
      open: vi.fn().mockResolvedValue(Readable.from([artifact.bytes])),
    };

    const ports = createGraphPorts(prisma, storage);
    const entities = await ports.workspaceQuery.getRevisionEntities({
      tenantId: "tenant-1",
      revisionId: "revision-built",
      workspaceId: "workspace-built-context",
    });

    expect(entities).toEqual([
      expect.objectContaining({ kind: "page", name: "Home", type: "page" }),
      expect.objectContaining({ kind: "control", name: "HeroTitle", type: "text" }),
    ]);
    expect(storage.open).toHaveBeenCalledWith("tenant-1", "built-package-key");
  });
});
