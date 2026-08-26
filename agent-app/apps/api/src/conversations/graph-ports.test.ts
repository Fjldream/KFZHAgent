// @ts-nocheck -- focused port test uses narrow Prisma/storage doubles.
import { Readable } from "node:stream";
import { Logger } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import {
  createKingClientDomainPack,
  deriveGuid,
} from "@kf/domain-client";
import {
  createHmacModuleArtifactAuthority,
  createHmacServerPlanAuthority,
} from "@kf/build-jobs";
import {
  CustomerSolutionBlueprintSchema,
  CapabilityCandidateBundleSchema,
  SolutionImplementationPlanSchema,
  canonicalServerHash,
} from "@kf/contracts";
import {
  createCreativeSolutionCompilerFromEnvironment,
  createGraphPorts,
} from "./graph-ports.js";

describe("conversation graph workspace query", () => {
  it("composes the server-scoped creative compiler through lowering, signing, and verification", async () => {
    const key = Buffer.alloc(32, 0x51);
    const prisma = creativePrisma();
    const assets = {
      list: vi.fn(),
      resolveManyForCompilation: vi.fn().mockResolvedValue([]),
    };
    const compiler = createCreativeSolutionCompilerFromEnvironment(
      prisma.client,
      {} as never,
      assets,
      { KF_SERVER_PLAN_HMAC_KEY_BASE64: key.toString("base64") },
    );
    const fixture = creativeFixture();

    const outcome = await compiler.compile({
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      conversationId: "conversation-creative",
      baseRevisionId: "revision-creative",
      projectKey: fixture.plan.projectKey,
      domainKind: "kingclient",
      blueprint: fixture.blueprint,
      candidateBundle: fixture.candidates,
      semanticPlan: fixture.plan,
    });

    expect(
      outcome.status,
      outcome.status === "blocked" ? JSON.stringify(outcome.diagnostics) : undefined,
    ).toBe("compiled");
    if (outcome.status !== "compiled") return;
    expect(outcome).toMatchObject({
      changeRequestId: expect.stringContaining("conversation-creative"),
      changePlanId: expect.stringContaining(outcome.planHash),
      planHash: expect.stringMatching(/^[0-9a-f]{64}$/),
      confirmationId: expect.stringMatching(/^[0-9a-f]{64}$/),
      operationCount: expect.any(Number),
    });
    const persisted = prisma.plans.get(outcome.changePlanId)!;
    const verified = createHmacServerPlanAuthority(key).verify(JSON.parse(JSON.stringify(persisted.plan)), {
      expectedPlanHash: outcome.planHash,
      expectedRevisionId: "revision-creative",
    });
    expect(verified.creativeArtifact).toBeDefined();
    expect(verified.trustedNativeMaterialization).toBeDefined();
    expect(verified.creativeArtifactHash).toBe(verified.plan.creative!.artifactHash);
    expect(verified.nativeMaterializationHash).toBe(verified.plan.creative!.materializationHash);
    const authority = createHmacServerPlanAuthority(key);
    const persistedPorts = createGraphPorts(verificationPrisma({
      plan: persisted.plan,
      changeRequestId: persisted.changeRequestId,
    }, {
      id: outcome.changeRequestId,
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      status: "OPEN",
    }) as never, {} as never, undefined, undefined, undefined, authority);
    await expect(persistedPorts.changePlanRepository.verifyPersistedCreativePlan({
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      changePlanId: outcome.changePlanId,
      changeRequestId: outcome.changeRequestId,
      planHash: outcome.planHash,
      revisionId: "revision-creative",
    })).resolves.toBe(true);
    const approvedPorts = createGraphPorts(verificationPrisma({
      plan: persisted.plan,
      changeRequestId: persisted.changeRequestId,
    }, {
      id: outcome.changeRequestId,
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      status: "APPROVED",
    }) as never, {} as never, undefined, undefined, undefined, authority);
    await expect(approvedPorts.changePlanRepository.verifyPersistedCreativePlan({
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      changePlanId: outcome.changePlanId,
      changeRequestId: outcome.changeRequestId,
      planHash: outcome.planHash,
      revisionId: "revision-creative",
    })).resolves.toBe(true);
    const wrongOwnerPorts = createGraphPorts(verificationPrisma({
      plan: persisted.plan,
      changeRequestId: "different-request",
    }, {
      id: outcome.changeRequestId,
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      status: "OPEN",
    }) as never, {} as never, undefined, undefined, undefined, authority);
    await expect(wrongOwnerPorts.changePlanRepository.verifyPersistedCreativePlan({
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      changePlanId: outcome.changePlanId,
      changeRequestId: outcome.changeRequestId,
      planHash: outcome.planHash,
      revisionId: "revision-creative",
    })).resolves.toBe(false);
    const forgedPorts = createGraphPorts(verificationPrisma({
      plan: { ...persisted.plan, signature: "0".repeat(64) },
      changeRequestId: persisted.changeRequestId,
    }, {
      id: outcome.changeRequestId,
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      status: "OPEN",
    }) as never, {} as never, undefined, undefined, undefined, authority);
    await expect(forgedPorts.changePlanRepository.verifyPersistedCreativePlan({
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      changePlanId: outcome.changePlanId,
      changeRequestId: outcome.changeRequestId,
      planHash: outcome.planHash,
      revisionId: "revision-creative",
    })).resolves.toBe(false);
    expect(assets.resolveManyForCompilation).toHaveBeenCalledWith({
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      assetIds: [],
    });
    expect(Reflect.ownKeys(compiler)).toEqual(["compile"]);
    expect(JSON.stringify(outcome)).not.toContain("trustedCreativePayload");
    expect(JSON.stringify(outcome)).not.toMatch(/signature|creativeArtifact|materialization/i);
  });

  it.each([
    ["missing", null],
    ["wrong workspace", { tenantId: "tenant", workspaceId: "other-workspace", status: "OPEN" }],
    ["wrong tenant", { tenantId: "other-tenant", workspaceId: "workspace", status: "OPEN" }],
    ["closed", { tenantId: "tenant", workspaceId: "workspace", status: "CLOSED" }],
  ])("rejects a persisted creative plan whose ChangeRequest is %s", async (_case, requestFields) => {
    const key = Buffer.alloc(32, 0x59);
    const fixture = creativeFixture();
    const compilerPrisma = creativePrisma();
    const compiled = await createCreativeSolutionCompilerFromEnvironment(
      compilerPrisma.client,
      {} as never,
      { resolveManyForCompilation: vi.fn().mockResolvedValue([]) },
      { KF_SERVER_PLAN_HMAC_KEY_BASE64: key.toString("base64") },
    ).compile({
      tenantId: "tenant",
      workspaceId: "workspace",
      conversationId: "conversation",
      baseRevisionId: "revision-creative",
      projectKey: fixture.plan.projectKey,
      domainKind: "kingclient",
      blueprint: fixture.blueprint,
      candidateBundle: fixture.candidates,
      semanticPlan: fixture.plan,
    });
    expect(compiled.status).toBe("compiled");
    if (compiled.status !== "compiled") return;
    const row = compilerPrisma.plans.get(compiled.changePlanId)!;
    const ports = createGraphPorts(verificationPrisma({
      plan: row.plan,
      changeRequestId: compiled.changeRequestId,
    }, requestFields === null ? null : {
      id: compiled.changeRequestId,
      ...requestFields,
    }) as never, {} as never, undefined, undefined, undefined, createHmacServerPlanAuthority(key));

    await expect(ports.changePlanRepository.verifyPersistedCreativePlan({
      tenantId: "tenant",
      workspaceId: "workspace",
      changePlanId: compiled.changePlanId,
      changeRequestId: compiled.changeRequestId,
      planHash: compiled.planHash,
      revisionId: "revision-creative",
    })).resolves.toBe(false);
  });

  it("binds status updates to workspace and rejects a zero-row update", async () => {
    const updateMany = vi.fn().mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    const ports = createGraphPorts({ changeRequest: { updateMany } } as never, {} as never);
    const input = {
      tenantId: "tenant",
      workspaceId: "workspace",
      changeRequestId: "request",
      status: "APPROVED",
    };

    await expect(ports.changePlanRepository.setChangeRequestStatus(input)).resolves.toBeUndefined();
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "request", tenantId: "tenant", workspaceId: "workspace" },
      data: { status: "APPROVED" },
    });
    await expect(ports.changePlanRepository.setChangeRequestStatus(input))
      .rejects.toThrow("CHANGE_REQUEST_STATUS_SYNC_FAILED");
  });

  it("fails closed on a wrong-workspace base revision before compilation or persistence", async () => {
    const prisma = {
      solutionRevision: { findFirst: vi.fn().mockResolvedValue(null) },
      domainProjectRevision: { findMany: vi.fn() },
    };
    const assets = {
      list: vi.fn(),
      resolveManyForCompilation: vi.fn().mockResolvedValue([]),
    };
    const compiler = createCreativeSolutionCompilerFromEnvironment(
      prisma as never,
      {} as never,
      assets,
      { KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x52).toString("base64") },
    );
    const fixture = creativeFixture();

    const outcome = await compiler.compile({
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      conversationId: "conversation-creative",
      baseRevisionId: "revision-creative",
      projectKey: fixture.plan.projectKey,
      domainKind: "kingclient",
      blueprint: fixture.blueprint,
      candidateBundle: fixture.candidates,
      semanticPlan: fixture.plan,
    });

    expect(outcome).toMatchObject({
      status: "blocked",
      diagnostics: [{ code: "CREATIVE_BASE_REVISION_EVIDENCE_MISSING", phase: "composition" }],
      warnings: [],
    });
    expect(outcome).not.toHaveProperty("changePlanId");
    expect(prisma.solutionRevision.findFirst).toHaveBeenCalledWith({
      where: {
        id: "revision-creative",
        tenantId: "tenant-creative",
        workspaceId: "workspace-creative",
      },
      select: { id: true, state: true, kind: true },
    });
    expect(prisma.domainProjectRevision.findMany).not.toHaveBeenCalled();
  });

  it("rolls back request ownership when atomic creative-plan persistence fails", async () => {
    const errorLog = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const prisma = creativePrisma({ failPlanCreate: true });
    const assets = {
      list: vi.fn(),
      resolveManyForCompilation: vi.fn().mockResolvedValue([]),
    };
    const compiler = createCreativeSolutionCompilerFromEnvironment(
      prisma.client,
      {} as never,
      assets,
      { KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x53).toString("base64") },
    );
    const fixture = creativeFixture();

    const outcome = await compiler.compile({
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      conversationId: "conversation-creative",
      baseRevisionId: "revision-creative",
      projectKey: fixture.plan.projectKey,
      domainKind: "kingclient",
      blueprint: fixture.blueprint,
      candidateBundle: fixture.candidates,
      semanticPlan: fixture.plan,
    });
    errorLog.mockRestore();

    expect(outcome).toMatchObject({
      status: "blocked",
      diagnostics: [{ code: "CREATIVE_COMPILATION_FAILED", phase: "composition", nodeId: "$" }],
    });
    expect(prisma.requests.size).toBe(0);
    expect(prisma.plans.size).toBe(0);
  });

  it("reuses identical content only within the same confirmation ownership", async () => {
    const prisma = creativePrisma();
    const compiler = createCreativeSolutionCompilerFromEnvironment(
      prisma.client,
      {} as never,
      { resolveManyForCompilation: vi.fn().mockResolvedValue([]) },
      { KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x58).toString("base64") },
    );
    const fixture = creativeFixture();
    const baseInput = {
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      baseRevisionId: "revision-creative",
      projectKey: "creative",
      domainKind: "kingclient",
      blueprint: fixture.blueprint,
      candidateBundle: fixture.candidates,
      semanticPlan: fixture.plan,
    } as const;

    const first = await compiler.compile({ ...baseInput, conversationId: "conversation-a" });
    const replay = await compiler.compile({ ...baseInput, conversationId: "conversation-a" });
    const otherOwner = await compiler.compile({ ...baseInput, conversationId: "conversation-b" });

    expect(first.status).toBe("compiled");
    expect(replay).toMatchObject({
      status: "compiled",
      changePlanId: first.status === "compiled" ? first.changePlanId : "unreachable",
    });
    expect(otherOwner.status).toBe("compiled");
    if (first.status === "compiled" && otherOwner.status === "compiled") {
      expect(otherOwner.planHash).toBe(first.planHash);
      expect(otherOwner.changePlanId).not.toBe(first.changePlanId);
      expect(otherOwner.changeRequestId).not.toBe(first.changeRequestId);
    }
    expect(prisma.requests.size).toBe(2);
    expect(prisma.plans.size).toBe(2);
  });

  it("selects uploaded evidence by exact project/domain identity and inspects it once", async () => {
    const artifact = await packageForEvidence("workspace-creative");
    const prisma = creativePrisma({
      projects: [
        { projectKey: "other-project", domainKind: "kingclient", packageUrl: "wrong-package" },
        { projectKey: "creative", domainKind: "kingclient", packageUrl: "exact-package" },
      ],
    });
    const storage = {
      open: vi.fn(async (_tenantId: string, key: string) => {
        if (key !== "exact-package") throw new Error("wrong project package opened");
        return Readable.from([artifact]);
      }),
    };
    const compiler = createCreativeSolutionCompilerFromEnvironment(
      prisma.client,
      storage as never,
      { resolveManyForCompilation: vi.fn().mockResolvedValue([]) },
      { KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x54).toString("base64") },
    );
    const fixture = creativeFixture();

    const outcome = await compiler.compile({
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      conversationId: "conversation-creative",
      baseRevisionId: "revision-creative",
      projectKey: "creative",
      domainKind: "kingclient",
      blueprint: fixture.blueprint,
      candidateBundle: fixture.candidates,
      semanticPlan: fixture.plan,
    });

    expect(outcome.status, JSON.stringify(outcome)).toBe("compiled");
    expect(storage.open).toHaveBeenCalledTimes(1);
    expect(storage.open).toHaveBeenCalledWith("tenant-creative", "exact-package");
  });

  it("fails closed instead of opening another project's uploaded package", async () => {
    const prisma = creativePrisma({
      projects: [{ projectKey: "other-project", domainKind: "kingclient", packageUrl: "wrong-package" }],
    });
    const storage = { open: vi.fn() };
    const compiler = createCreativeSolutionCompilerFromEnvironment(
      prisma.client,
      storage as never,
      { resolveManyForCompilation: vi.fn().mockResolvedValue([]) },
      { KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x55).toString("base64") },
    );
    const fixture = creativeFixture();

    const outcome = await compiler.compile({
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      conversationId: "conversation-creative",
      baseRevisionId: "revision-creative",
      projectKey: "creative",
      domainKind: "kingclient",
      blueprint: fixture.blueprint,
      candidateBundle: fixture.candidates,
      semanticPlan: fixture.plan,
    });

    expect(outcome).toMatchObject({
      status: "blocked",
      diagnostics: [{ code: "CREATIVE_BASE_REVISION_EVIDENCE_MISSING" }],
    });
    expect(storage.open).not.toHaveBeenCalled();
    expect(prisma.plans.size).toBe(0);
  });

  it("redacts hostile dependency exceptions from diagnostics", async () => {
    const errorLog = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const prisma = creativePrisma();
    const compiler = createCreativeSolutionCompilerFromEnvironment(
      prisma.client,
      {} as never,
      {
        resolveManyForCompilation: vi.fn().mockRejectedValue(
          new Error("Authorization: Bearer abc /Users/customer/private.sql\nsecret=token"),
        ),
      },
      { KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x56).toString("base64") },
    );
    const fixture = creativeFixture();

    const outcome = await compiler.compile({
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      conversationId: "conversation-creative",
      baseRevisionId: "revision-creative",
      projectKey: "creative",
      domainKind: "kingclient",
      blueprint: fixture.blueprint,
      candidateBundle: fixture.candidates,
      semanticPlan: fixture.plan,
    });

    const logCalls = errorLog.mock.calls;
    errorLog.mockRestore();

    expect(outcome).toMatchObject({
      status: "blocked",
      diagnostics: [{
        code: "CREATIVE_COMPILATION_FAILED",
        message: "工程编译依赖未通过校验",
        correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      }],
    });
    const correlationId = outcome.diagnostics[0].correlationId;
    expect(logCalls).toEqual([[expect.stringContaining(correlationId), expect.stringContaining("Bearer abc")]]);
    expect(JSON.stringify(outcome)).not.toMatch(/Bearer|private|secret|token/i);
  });

  it.each([
    [
      "CREATIVE_EDITABLE_ENTITY_AMBIGUOUS",
      [{ id: "duplicate", type: "text" }, { id: "duplicate", type: "text" }],
    ],
    [
      "CREATIVE_EVIDENCE_BUDGET_EXCEEDED",
      Array.from({ length: 20_001 }, (_, index) => ({ id: `control-${index}`, type: "text" })),
    ],
  ])("fails closed on %s before creative compilation amplification", async (reasonCode, controls) => {
    const prisma = creativePrisma({
      revision: {
        id: "revision-creative",
        kind: "built",
        state: { pages: [{ name: "Page1", controls }] },
      },
    });
    const assets = { resolveManyForCompilation: vi.fn().mockResolvedValue([]) };
    const compiler = createCreativeSolutionCompilerFromEnvironment(
      prisma.client,
      {} as never,
      assets,
      { KF_SERVER_PLAN_HMAC_KEY_BASE64: Buffer.alloc(32, 0x57).toString("base64") },
    );
    const fixture = creativeFixture();

    const outcome = await compiler.compile({
      tenantId: "tenant-creative",
      workspaceId: "workspace-creative",
      conversationId: "conversation-creative",
      baseRevisionId: "revision-creative",
      projectKey: "creative",
      domainKind: "kingclient",
      blueprint: fixture.blueprint,
      candidateBundle: fixture.candidates,
      semanticPlan: fixture.plan,
    });

    expect(outcome).toMatchObject({ status: "blocked", diagnostics: [{ code: reasonCode }] });
    expect(assets.resolveManyForCompilation).not.toHaveBeenCalled();
    expect(prisma.plans.size).toBe(0);
  });

  it("round-trips creative-v2 from the persisted workspace routing field", async () => {
    const findFirst = vi.fn().mockResolvedValue({ mode: "new", generationWorkflow: "creative-v2" });
    const ports = createGraphPorts({ solutionWorkspace: { findFirst } }, {} as never);

    await expect(ports.workspaceQuery.getWorkspaceRouting({ tenantId: "tenant-1", workspaceId: "workspace-1" }))
      .resolves.toEqual({ mode: "new", generationWorkflow: "creative-v2" });
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "workspace-1", tenantId: "tenant-1" },
      select: { mode: true, generationWorkflow: true },
    });
  });

  it("retrieves creative capability candidates locally without Prisma, assets, network, or model access", async () => {
    const forbiddenAccess = new Proxy({}, {
      get(_target, property) {
        throw new Error(`unexpected external access: ${String(property)}`);
      },
    });
    const ports = createGraphPorts(forbiddenAccess as never, forbiddenAccess as never);
    const blueprint = {
      schema: "kf-design-plan/v3" as const,
      displayName: "园区访客中心",
      objective: "帮助前台审核访客预约",
      audiences: ["园区前台"],
      scenarios: ["预约审核"],
      pages: [{
        id: "visitor-overview",
        title: "访客总览",
        purpose: "处理当日预约",
        readingOrder: ["visitor-list"],
        regions: [{
          id: "visitor-list",
          purpose: "浏览访客记录",
          semanticRoles: ["record-list"],
          dataShape: "record-list",
          density: "comfortable" as const,
          importance: "primary" as const,
          content: ["访客姓名", "预约时段"],
          sampleData: [{ 访客姓名: "陈嘉宁", 预约时段: "14:30" }],
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

    const first = await ports.capabilityRetrieval.retrieve({ blueprint });
    const second = await ports.capabilityRetrieval.retrieve({ blueprint: structuredClone(blueprint) });

    expect(second).toEqual(first);
    expect(first.schema).toBe("kf-capability-candidates/v1");
    expect(first.regions).toHaveLength(1);
    expect(first.detailedCapabilityIds.length).toBeLessThanOrEqual(25);
  });

  it("returns the latest twenty persisted messages in stable chronological order", async () => {
    const sameTimestamp = new Date("2026-08-12T05:00:24.000Z");
    const rows = Array.from({ length: 25 }, (_, index) => ({
      id: `message-${String(index + 1).padStart(2, "0")}`,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `turn-${String(index + 1).padStart(2, "0")}`,
      createdAt: index >= 23 ? sameTimestamp : new Date(Date.UTC(2026, 7, 12, 5, 0, index)),
    }));
    const findMany = vi.fn().mockImplementation(({ orderBy, take }) => {
      const directions = orderBy.map((entry) => Object.values(entry)[0]);
      const sorted = [...rows].sort((left, right) =>
        right.createdAt.getTime() - left.createdAt.getTime() || right.id.localeCompare(left.id),
      );
      return Promise.resolve(directions.every((direction) => direction === "desc") ? sorted.slice(0, take) : [...rows].slice(0, take));
    });
    const ports = createGraphPorts({ message: { findMany } }, {} as never);

    const messages = await ports.workspaceQuery.listRecentMessages({
      tenantId: "tenant-1",
      conversationId: "conversation-1",
      limit: 25,
    });

    expect(findMany).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1", conversationId: "conversation-1" },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 20,
    });
    expect(messages.map((message) => message.content)).toEqual([
      "turn-06", "turn-07", "turn-08", "turn-09", "turn-10",
      "turn-11", "turn-12", "turn-13", "turn-14", "turn-15",
      "turn-16", "turn-17", "turn-18", "turn-19", "turn-20",
      "turn-21", "turn-22", "turn-23", "turn-24", "turn-25",
    ]);
    expect(messages.at(-1)?.content).toBe("turn-25");
    expect(messages.some((message) => message.content === "turn-01")).toBe(false);
  });

  it("exposes only exact modules accepted by the native KF runtime", async () => {
    const ports = createGraphPorts({} as never, {} as never);
    const catalog = await ports.modulePlanCompiler.listPlanningCatalog();

    expect(catalog.map((entry) => `${entry.kind}@${entry.version}`)).toEqual([
      "content.hero@1.0.0",
      "data.status-grid@1.0.0",
      "data.table@1.0.0",
      "feedback.alert-list@1.0.0",
      "navigation.top@1.0.0",
    ]);
    expect(catalog.map((entry) => entry.kind)).not.toEqual(expect.arrayContaining([
      "action.toolbar",
      "data.chart-panel",
      "form.record-editor",
      "interaction.tabs-filter",
      "metric.kpi-grid",
      "navigation.sidebar",
    ]));
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
        targetPath: `project/res/images/${"1".repeat(64)}.png`,
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
          targetPath: `project/res/images/${"1".repeat(64)}.png`,
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

    expect(entities).toEqual(expect.arrayContaining([
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
    ]));
    expect(storage.open).toHaveBeenCalledWith("tenant-1", "built-package-key");
  });

  it("reads the 201st page and 51st control from the full inspection index", async () => {
    const pack = createKingClientDomainPack({ nativeAccepted: true });
    const built = await pack.compile({
      buildSeed: "workspace-full-index",
      projectIr: {
        schema: "kf-client-project-ir/v1",
        id: "full-index-project",
        name: "Full Index Project",
        pages: Array.from({ length: 201 }, (_, pageIndex) => ({
          id: `page-${pageIndex + 1}`,
          name: `Page${pageIndex + 1}`,
          width: 1440,
          height: 900,
          controls: pageIndex === 0
            ? Array.from({ length: 51 }, (_, controlIndex) => ({
                id: `Control${controlIndex + 1}`,
                type: "text" as const,
                x: 10,
                y: controlIndex * 12,
                width: 100,
                height: 10,
                text: String(controlIndex + 1),
              }))
            : [],
        })),
      },
    });
    const artifact = await pack.package({ workspace: built });
    const ports = createGraphPorts({
      solutionRevision: { findFirst: vi.fn().mockResolvedValue({ state: {} }) },
      domainProjectRevision: { findFirst: vi.fn().mockResolvedValue({ packageUrl: "full-index-package" }) },
    } as never, {
      open: vi.fn().mockResolvedValue(Readable.from([artifact.bytes])),
    } as never);

    const entities = await ports.workspaceQuery.getRevisionEntities({
      tenantId: "tenant-1",
      revisionId: "revision-full-index",
      workspaceId: "workspace-full-index",
    });

    expect(entities).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "page", name: "Page201" }),
      expect.objectContaining({ kind: "control", name: "Control51" }),
    ]));
    expect(entities.filter((entity) => entity.kind === "page")).toHaveLength(201);
    expect(entities.filter((entity) => entity.kind === "control")).toHaveLength(51);
  });

  it("compiles uploaded exact-project evidence matched only at page 201/control 51 and opens once", async () => {
    const key = Buffer.alloc(32, 0x5a);
    const pack = createKingClientDomainPack({ nativeAccepted: true });
    const built = await pack.compile({
      buildSeed: "workspace",
      projectIr: {
        schema: "kf-client-project-ir/v1",
        id: "creative-full-index-project",
        name: "Creative Full Index Project",
        pages: Array.from({ length: 201 }, (_, pageIndex) => ({
          id: pageIndex === 200 ? "detail-native" : `page-${pageIndex + 1}`,
          name: pageIndex === 200 ? "detail" : `Page${pageIndex + 1}`,
          width: 1440,
          height: 900,
          controls: pageIndex === 200
            ? Array.from({ length: 51 }, (_, controlIndex) => controlIndex === 50
              ? {
                  id: "Text51",
                  type: "text" as const,
                  x: 40,
                  y: 40,
                  width: 160,
                  height: 48,
                  text: "详情内容",
                }
              : {
                  id: `hidden-${controlIndex + 1}`,
                  type: "text" as const,
                  x: 10,
                  y: controlIndex * 12,
                  width: 100,
                  height: 10,
                  text: String(controlIndex + 1),
                })
            : [],
        })),
      },
    });
    const artifact = await pack.package({ workspace: built });
    const prisma = creativePrisma({
      projects: [{ projectKey: "creative", domainKind: "kingclient", packageUrl: "full-index-package" }],
    });
    const storage = { open: vi.fn().mockResolvedValue(Readable.from([artifact.bytes])) };
    const fixture = creativeFixture();
    const semanticPlan = SolutionImplementationPlanSchema.parse({
      ...fixture.plan,
      pages: fixture.plan.pages.map((page) => page.id !== "detail" ? page : {
        ...page,
        root: { ...page.root, id: "Text51" },
      }),
    });
    const compiler = createCreativeSolutionCompilerFromEnvironment(
      prisma.client,
      storage as never,
      { resolveManyForCompilation: vi.fn().mockResolvedValue([]) },
      { KF_SERVER_PLAN_HMAC_KEY_BASE64: key.toString("base64") },
    );

    const outcome = await compiler.compile({
      tenantId: "tenant",
      workspaceId: "workspace",
      conversationId: "conversation",
      baseRevisionId: "revision-creative",
      projectKey: "creative",
      domainKind: "kingclient",
      blueprint: fixture.blueprint,
      candidateBundle: fixture.candidates,
      semanticPlan,
    });

    expect(outcome.status, JSON.stringify(outcome)).toBe("compiled");
    if (outcome.status !== "compiled") return;
    const persisted = prisma.plans.get(outcome.changePlanId)!;
    const verified = createHmacServerPlanAuthority(key).verify(persisted.plan, {
      expectedPlanHash: outcome.planHash,
      expectedRevisionId: "revision-creative",
    });
    const page = verified.trustedNativeMaterialization!.pages.find((entry) => entry.semanticPageId === "detail");
    const control = verified.trustedNativeMaterialization!.controls.find((entry) => entry.semanticControlId === "Text51");
    expect(page).toMatchObject({ source: "uploaded-existing", semanticPageId: "detail" });
    expect(control).toMatchObject({
      source: "uploaded-existing",
      semanticControlId: "Text51",
      semanticPageId: "detail",
      pageGuid: page!.pageGuid,
      nativeGuid: expect.any(String),
    });
    expect(storage.open).toHaveBeenCalledTimes(1);
    expect(prisma.plans.size).toBe(1);
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

function creativePrisma(options: {
  failPlanCreate?: boolean;
  projects?: Array<{ projectKey: string; domainKind: string; packageUrl: string | null }>;
  revision?: { id: string; kind: string; state: unknown } | null;
} = {}) {
  const requests = new Map<string, Record<string, unknown>>();
  const plans = new Map<string, Record<string, unknown>>();
  const solutionRevision = {
    findFirst: vi.fn().mockResolvedValue(options.revision === undefined ? {
      id: "revision-creative",
      kind: "built",
      state: { pages: [] },
    } : options.revision),
  };
  const domainProjectRevision = { findMany: vi.fn().mockResolvedValue(options.projects ?? []) };
  const client = {
    solutionRevision,
    domainProjectRevision,
    async $transaction(run) {
      const requestDraft = new Map([...requests].map(([key, value]) => [key, structuredClone(value)]));
      const planDraft = new Map([...plans].map(([key, value]) => [key, structuredClone(value)]));
      const tx = {
        solutionRevision,
        changeRequest: {
          findUnique: async ({ where: { id } }) => requestDraft.get(id) ?? null,
          upsert: async ({ where: { id }, create, update }) => {
            requestDraft.set(id, { ...(requestDraft.get(id) ?? create), ...update });
          },
        },
        changePlan: {
          findUnique: async ({ where: { id } }) => planDraft.get(id) ?? null,
          create: async ({ data }) => {
            if (options.failPlanCreate) throw new Error("hostile db path /private/secret token=abc");
            planDraft.set(data.id, structuredClone(data));
          },
        },
      };
      const result = await run(tx);
      requests.clear();
      plans.clear();
      requestDraft.forEach((value, key) => requests.set(key, value));
      planDraft.forEach((value, key) => plans.set(key, value));
      return result;
    },
  };
  return { client, requests, plans, solutionRevision, domainProjectRevision };
}

function verificationPrisma(plan: unknown, request: unknown) {
  const scoped = {
    changePlan: { findFirst: vi.fn().mockResolvedValue(plan) },
    changeRequest: { findFirst: vi.fn().mockResolvedValue(request) },
  };
  return {
    ...scoped,
    $transaction: vi.fn(async (run) => run(scoped)),
  };
}

async function packageForEvidence(workspaceId: string): Promise<Uint8Array> {
  const pack = createKingClientDomainPack({ nativeAccepted: true });
  const built = await pack.compile({
    buildSeed: workspaceId,
    projectIr: {
      schema: "kf-client-project-ir/v1",
      id: "creative-evidence",
      name: "Creative Evidence",
      pages: [{
        id: "existing",
        name: "Existing",
        width: 1440,
        height: 900,
        controls: [],
      }],
    },
  });
  return (await pack.package({ workspace: built })).bytes;
}

function creativeFixture() {
  const blueprint = CustomerSolutionBlueprintSchema.parse({
    schema: "kf-design-plan/v3",
    displayName: "创意工程",
    objective: "帮助客户从首页进入详情",
    audiences: ["客户"],
    scenarios: ["查看详情"],
    pages: ["home", "detail"].map((id) => ({
      id: `bp-${id}`,
      title: id === "home" ? "首页" : "详情",
      purpose: id === "home" ? "引导查看" : "展示详情",
      readingOrder: [`region-${id}`],
      regions: [{
        id: `region-${id}`,
        purpose: id === "home" ? "引导查看" : "展示详情",
        semanticRoles: [id === "home" ? "action" : "content"],
        dataShape: "content",
        density: "comfortable" as const,
        importance: "primary" as const,
        content: [id === "home" ? "打开详情" : "详情内容"],
        sampleData: [],
        interactions: id === "home" ? ["点击打开详情"] : [],
        states: ["ready"],
        visualIntent: "清晰",
      }],
    })),
    journeys: [{
      id: "open-detail",
      actor: "客户",
      goal: "查看详情",
      steps: [{ pageId: "bp-home", regionId: "region-home", action: "点击", result: "详情可见" }],
      completion: "详情可见",
    }],
    visualDirection: { tone: "专业", colors: ["蓝色"], typography: "清晰", spacingAndSurfaces: "舒适" },
    acceptanceScenarios: ["详情可见"],
    openQuestions: [],
  });
  const ranked = (id: string, score: number) => ({
    id, score, reasons: ["适用"], limitations: [], knowledgeVersion: "1.0.0",
  });
  const candidates = CapabilityCandidateBundleSchema.parse({
    schema: "kf-capability-candidates/v1",
    knowledgeCatalogVersion: "1.0.0",
    blueprintHash: canonicalServerHash(blueprint),
    regions: ["home", "detail"].map((id) => ({
      pageId: `bp-${id}`,
      regionId: `region-${id}`,
      controls: [ranked("button", 3), ranked("text", 2), ranked("image", 1)],
      layouts: [ranked("layout.4", 3)],
      recipes: [ranked("content.hero", 3)],
    })),
    detailedCapabilityIds: ["button", "image", "layout.4", "text"],
    generatedAtPolicy: "deterministic-no-timestamp",
  });
  const intent = {
    importance: "primary" as const,
    visualWeight: 3,
    readingOrder: 0,
    density: "comfortable" as const,
    groupWith: [],
    width: { mode: "fixed" as const, value: 160 },
    height: { mode: "content" as const },
    align: "start" as const,
  };
  const plan = SolutionImplementationPlanSchema.parse({
    schema: "kf-solution-implementation/v1",
    projectKey: "creative",
    blueprintHash: canonicalServerHash(blueprint),
    candidateBundleHash: canonicalServerHash(candidates),
    theme: {
      background: "#ffffff", surface: "#ffffff", primary: "#123456", accent: "#654321",
      textPrimary: "#111111", textSecondary: "#555555", fontFamily: "Inter", spacingUnit: 8,
      radiusScale: { small: 4, medium: 8, large: 16 },
    },
    roleStyles: [
      { role: "action", declarations: {}, states: {} },
      { role: "content", declarations: {}, states: {} },
    ],
    mockData: [],
    localState: [],
    pages: [{
      id: "home",
      title: "首页",
      purpose: "引导查看",
      canvas: "desktop",
      sourceBlueprintPageId: "bp-home",
      sourceBlueprintRegionIds: ["region-home"],
      initialStateIds: [],
      root: {
        id: "open",
        kind: "control",
        capabilityId: "button",
        content: "打开详情",
        properties: [],
        tabIds: [],
        styleRole: "action",
        sourceBlueprintRegionIds: ["region-home"],
        intent,
        eventBindings: [{ semanticEvent: "click", actionIds: ["navigate"] }],
      },
    }, {
      id: "detail",
      title: "详情",
      purpose: "展示详情",
      canvas: "desktop",
      sourceBlueprintPageId: "bp-detail",
      sourceBlueprintRegionIds: ["region-detail"],
      initialStateIds: [],
      root: {
        id: "detail-content",
        kind: "control",
        capabilityId: "text",
        content: "详情内容",
        properties: [],
        tabIds: [],
        styleRole: "content",
        sourceBlueprintRegionIds: ["region-detail"],
        intent,
        eventBindings: [],
      },
    }],
    overlays: [],
    actions: [{
      id: "navigate",
      kind: "navigate-page",
      targetPageId: "detail",
      afterActionIds: [],
      journeyStepRefs: [{ journeyId: "open-detail", stepIndex: 0 }],
    }],
    scripts: [],
  });
  return { blueprint, candidates, plan };
}
