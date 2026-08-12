// @ts-nocheck -- focused port test uses narrow Prisma/storage doubles.
import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { createKingClientDomainPack, deriveGuid } from "@kf/domain-client";
import { createHmacModuleArtifactAuthority } from "@kf/build-jobs";
import { createGraphPorts } from "./graph-ports.js";

describe("conversation graph workspace query", () => {
  it("keeps beta modules out of the production planning catalog", async () => {
    const ports = createGraphPorts({} as never, {} as never);
    await expect(ports.modulePlanCompiler.listPlanningCatalog()).resolves.toEqual([]);
  });

  it("lists only tenant/workspace-scoped model-safe asset metadata", async () => {
    const assets = {
      list: vi.fn().mockResolvedValue([{
        id: "00000000-0000-4000-8000-000000000001",
        modelAssetId: "asset-00000000000040008000000000000001",
        type: "image", name: "portrait.png", mediaType: "image/png",
        sizeBytes: 10, width: 1, height: 1, tags: [], createdAt: new Date(0),
      }]),
      resolveMany: vi.fn(),
    };
    const ports = createGraphPorts({} as never, {} as never, undefined, assets);
    await expect(ports.assetCatalog.list({ tenantId: "tenant", workspaceId: "workspace" })).resolves.toEqual([{
      id: "asset-00000000000040008000000000000001", kind: "image", name: "portrait.png", mimeType: "image/png", description: "Uploaded workspace image",
    }]);
    expect(assets.list).toHaveBeenCalledWith({ tenantId: "tenant", workspaceId: "workspace" });
  });

  it("resolves module assets through the tenant/workspace-scoped AssetService before compilation", async () => {
    const assetId = "asset-00000000000040008000000000000001";
    const assets = {
      list: vi.fn(),
      resolveMany: vi.fn().mockRejectedValue(new Error("catalog-only resolver must not authorize compilation")),
      resolveManyForCompilation: vi.fn().mockResolvedValue([{
        id: assetId,
        workspaceAssetId: "00000000-0000-4000-8000-000000000001",
        kind: "image",
        name: "portrait.png",
        mimeType: "image/png",
        description: "Uploaded workspace image",
        sha256: "1".repeat(64),
        sizeBytes: 128,
        targetPath: `static/agent-assets/${"1".repeat(64)}.png`,
      }]),
    };
    const authority = createHmacModuleArtifactAuthority(Buffer.alloc(32, 0x67));
    const ports = createGraphPorts({} as never, {} as never, authority, assets);
    const signedAcceptedBlueprint = await ports.acceptedBlueprintConfirmation.confirm({
      projectKey: "kingclient.portal",
      revisionId: "revision-asset",
      blueprint: {
        schema: "kf-design-plan/v2",
        displayName: "Portrait portal",
        overview: { objective: "Profile", audiences: ["Visitor"], scenarios: ["View"], valueProposition: "Clear" },
        informationArchitecture: { narrative: "Hero", wireframe: "Hero" },
        modules: [{
          id: "hero",
          name: "Hero",
          purpose: "Show profile",
          content: ["Profile"],
          sampleData: [],
          interactions: [],
          expectedKind: "content.hero",
          expectedCategory: "content",
          interactionRequirements: [],
          presentation: "Portrait hero",
        }],
        visualDirection: { tone: "Clean", colors: ["Blue"], typography: "Sans", spacingAndSurfaces: "Open" },
        highlights: ["Portrait"],
        revisionNotes: { added: [], changed: [], retained: [] },
        acceptanceCriteria: ["Portrait is visible"],
        openQuestions: [],
      },
    });
    const acceptedBlueprintArtifact = authority.verifyAcceptedBlueprint(
      JSON.parse(JSON.stringify(signedAcceptedBlueprint)),
      { projectKey: "kingclient.portal", revisionId: "revision-asset" },
    );
    const result = await ports.modulePlanCompiler.compile({
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      acceptedBlueprintArtifact,
      plan: {
        schema: "kf-module-plan/v1",
        projectKey: "kingclient.portal",
        theme: {
          background: "#101827", surface: "#1E293B", primary: "#2563EB", accent: "#38BDF8",
          textPrimary: "#F8FAFC", textSecondary: "#94A3B8", fontFamily: "Inter", spacingUnit: 8,
          radiusScale: { small: 4, medium: 8, large: 16 },
        },
        assets: [{ id: assetId, kind: "image", name: "Portrait", mimeType: "image/png", description: "Profile" }],
        pages: [{
          id: "Page1",
          title: "Home",
          mode: "vertical-flow",
          modules: [{
            id: "hero", kind: "content.hero", templateVersion: "1.0.0", variant: "portrait-right",
            title: "Hero", content: JSON.stringify({ title: "Lin" }), sourceBlueprintModuleIds: ["hero"],
            placement: { region: "main", order: 0, columnSpan: 12, preferredHeight: "large", alignment: "stretch", emphasis: "primary" },
            interactions: [], assetId,
          }],
        }],
        operations: [],
      },
    });

    expect(assets.resolveManyForCompilation).toHaveBeenCalledWith({
      tenantId: "tenant-a",
      workspaceId: "workspace-a",
      assetIds: [assetId],
    });
    expect(result.status).toBe("compiled");
    if (result.status === "compiled") {
      expect(result.metadata.assets).toContainEqual(expect.objectContaining({
        assetId,
        status: "resolved",
        approvedAsset: {
          workspaceAssetId: "00000000-0000-4000-8000-000000000001",
          targetPath: `static/agent-assets/${"1".repeat(64)}.png`,
          mediaType: "image/png",
          sha256: "1".repeat(64),
          sizeBytes: 128,
        },
      }));
    }
  });

  it("derives compile-mode page GUIDs with the native compiler's page prefix", async () => {
    const prisma = {
      solutionRevision: {
        findFirst: vi.fn().mockResolvedValue({
          state: {
            pages: [{
              id: "page-home",
              name: "Page1",
              controls: [{ id: "Text1", type: "text" }],
            }],
          },
        }),
      },
      domainProjectRevision: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    const ports = createGraphPorts(prisma, {} as never);

    const entities = await ports.workspaceQuery.getRevisionEntities({
      tenantId: "tenant-1",
      revisionId: "revision-1",
      workspaceId: "workspace-1",
    });

    expect(entities[0]).toEqual({
      kind: "page",
      name: "Page1",
      type: "page",
      guid: `k${deriveGuid({ seed: "workspace-1" }, "Page1")}`,
    });
  });

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
          }, {
            id: "MainLayout",
            type: "layout",
            layoutType: 2,
            x: 40,
            y: 140,
            width: 800,
            height: 500,
            children: [],
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
      expect.objectContaining({
        kind: "control",
        name: "MainLayout",
        type: "layout.2",
        x: 40,
        y: 140,
        width: 800,
        height: 500,
      }),
    ]);
    expect(storage.open).toHaveBeenCalledWith("tenant-1", "built-package-key");
  });

  it("compiles a traceable multi-module UI implementation with the existing KingClient tools", async () => {
    const ports = createGraphPorts({} as never, {} as never);
    const result = await ports.uiImplementationCompiler.compile({
      workspaceId: "workspace-1",
      editableEntities: [
        { kind: "page", name: "Page1", type: "page", guid: "page-guid" },
        { kind: "control", name: "Text1", type: "text", guid: "text-guid" },
      ],
      spec: {
        schema: "kf-ui-implementation/v1",
        theme: {
          background: "#0f172a",
          surface: "#111827",
          primary: "#2563eb",
          accent: "#38bdf8",
          textPrimary: "#f8fafc",
          textSecondary: "#cbd5e1",
          fontFamily: "Arial",
          spacingUnit: 8,
          radiusScale: { small: 4, medium: 8, large: 16 },
        },
        pages: [{
          id: "Page1",
          width: 1440,
          height: 900,
          components: [
            {
              id: "ProductsTitle",
              role: "section-heading",
              sourceModuleId: "products",
              capabilityId: "text",
              critical: true,
              content: "我的产品",
              geometry: { x: 60, y: 80, width: 300, height: 40 },
              properties: {},
              style: { declarations: { fontSize: 26, textColor: "{theme.textPrimary}" }, states: {} },
            },
            {
              id: "ProjectsTitle",
              role: "section-heading",
              sourceModuleId: "projects",
              capabilityId: "text",
              critical: true,
              content: "项目经历",
              geometry: { x: 60, y: 180, width: 300, height: 40 },
              properties: {},
              style: { declarations: { fontSize: 26, textColor: "{theme.textPrimary}" }, states: {} },
            },
          ],
        }],
      },
    });

    expect(result.plan.operations).toEqual([
      expect.objectContaining({ op: "create", entityId: "ProductsTitle" }),
      expect.objectContaining({ op: "create", entityId: "ProjectsTitle" }),
    ]);
    expect(result.plan.operations[0]).toMatchObject({
      properties: {
        pageId: "page-guid",
        style: { declarations: { fontSize: 26, textColor: "#f8fafc" } },
      },
    });
    expect(result.capabilityReport.status).not.toBe("fail");
  });
});
