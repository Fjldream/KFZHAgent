import type {
  BuildJobPort,
  AcceptedBlueprintConfirmationPort,
  AssetCatalogPort,
  CapabilityRetrievalPort,
  CreativeCompilationDiagnostic,
  CreativeSolutionCompilerPort,
  ModulePlanCompilerPort,
  UiImplementationCompilerPort,
  WorkspaceQueryPort,
} from "@kf/agent-orchestrator";
import type { ChangePlanRepository } from "@kf/agent-orchestrator";
import type { EditableEntity } from "@kf/agent-orchestrator";
import type { GraphMessage } from "@kf/agent-orchestrator";
import {
  compileModulePlan,
  compileSolutionImplementation,
  compileUiImplementation,
  createDefaultModuleRegistry,
  deriveGuid,
  attachRuntimeCorrelation,
  compileInteractions,
  createCreativeUIImplementationV2Compiler,
  importNativeClientPackage,
  inspectClientProject,
  getDesignKnowledgeSnapshot,
  retrieveCapabilities,
  verifyExistingRuntimeCorrelation,
  SolutionCompileError,
  type InspectResult,
  type VerifiedExistingRuntimeCorrelationHandle,
} from "@kf/domain-client";
import type { ArtifactStorage } from "@kf/artifact-storage";
import {
  canonicalChangePlanHash,
  canonicalServerHash,
  type ChangePlan,
  type CustomerSolutionBlueprint,
  type ServerPlanEnvelope,
  type SolutionImplementationPlan,
  type UIImplementationSpecV2,
} from "@kf/contracts";
import {
  createHmacCreativeBuildFacade,
  decodeServerPlanHmacKey,
  type ModuleArtifactAuthority,
  type ServerPlanAuthority,
} from "@kf/build-jobs";
import { Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaService } from "../prisma/prisma.service.js";
import { BuildJobService } from "../build-jobs/build-job.service.js";
import { SERVER_PLAN_HMAC_KEY_ENV, signAcceptedBlueprintAtConfirmation } from "./server-plan-authority.js";
import type { AssetService } from "../assets/asset.service.js";
import { REVIEWED_KF36_MODULE_RUNTIME_EVIDENCE } from "./module-runtime-evidence.js";

/**
 * Real Prisma-backed ports for the solution graph (brief "Consumes" line).
 * The graph stays free of direct database access; every read/write flows
 * through these ports so it remains deterministic and resumable.
 */

/** How many recent messages are handed to the model (mirrors the graph bound). */
const RECENT_MESSAGE_LIMIT = 20;
const CREATIVE_COMPILATION_LOGGER = new Logger("CreativeSolutionCompiler");

/** Nest token for the production-local deterministic retrieval boundary. */
export const CAPABILITY_RETRIEVAL_PORT = Symbol("CAPABILITY_RETRIEVAL_PORT");

/** Nest token for the only server-owned creative compilation/persistence boundary. */
export const CREATIVE_SOLUTION_COMPILER_PORT = Symbol("CREATIVE_SOLUTION_COMPILER_PORT");

/** Pure in-process retrieval: immutable design knowledge in, bounded candidates out. */
export const LOCAL_CAPABILITY_RETRIEVAL_PORT: CapabilityRetrievalPort = Object.freeze({
  retrieve({ blueprint }: { blueprint: CustomerSolutionBlueprint }) {
    return Promise.resolve(retrieveCapabilities({
      blueprint,
      knowledge: getDesignKnowledgeSnapshot(),
    }));
  },
});

export interface GraphPorts {
  workspaceQuery: WorkspaceQueryPort;
  changePlanRepository: ChangePlanRepository;
  buildJobPort: BuildJobPort;
  uiImplementationCompiler: UiImplementationCompilerPort;
  acceptedBlueprintConfirmation: AcceptedBlueprintConfirmationPort;
  modulePlanCompiler: ModulePlanCompilerPort;
  assetCatalog: AssetCatalogPort;
  capabilityRetrieval: CapabilityRetrievalPort;
  creativeSolutionCompiler?: CreativeSolutionCompilerPort;
}

export function createGraphPorts(
  prisma: PrismaService,
  storage: ArtifactStorage,
  moduleArtifactAuthority?: ModuleArtifactAuthority,
  assetService?: Pick<AssetService, "list" | "resolveManyForCompilation">,
  creativeSolutionCompiler?: CreativeSolutionCompilerPort,
  serverPlanAuthority?: ServerPlanAuthority,
): GraphPorts {
  const buildJobs = new BuildJobService(prisma);
  const moduleRegistry = createDefaultModuleRegistry(REVIEWED_KF36_MODULE_RUNTIME_EVIDENCE);

  const workspaceQuery: WorkspaceQueryPort = {
    async listRecentMessages({ tenantId, conversationId, limit }) {
      const rows = await prisma.message.findMany({
        where: { tenantId, conversationId },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: Math.min(limit, RECENT_MESSAGE_LIMIT),
      });
      return rows.reverse().map((row) => ({
        role: row.role as "user" | "assistant",
        content: row.content,
      }));
    },
    async appendMessage({ tenantId, conversationId, role, content }) {
      await prisma.message.create({ data: { tenantId, conversationId, role, content } });
    },
    async getConversationSummary({ tenantId, conversationId }) {
      const conversation = await prisma.conversation.findFirst({
        where: { id: conversationId, tenantId },
      });
      return conversation?.summary ?? undefined;
    },
    async setConversationSummary({ tenantId, conversationId, summary }) {
      await prisma.conversation.updateMany({
        where: { id: conversationId, tenantId },
        data: { summary },
      });
    },
    async getCurrentRevisionId({ tenantId, workspaceId }) {
      const workspace = await prisma.solutionWorkspace.findFirst({
        where: { id: workspaceId, tenantId },
      });
      return workspace?.currentRevisionId ?? undefined;
    },
    async getWorkspaceRouting({ tenantId, workspaceId }) {
      const workspace = await prisma.solutionWorkspace.findFirst({
        where: { id: workspaceId, tenantId },
        select: { mode: true, generationWorkflow: true },
      });
      if (workspace === null) return undefined;
      return {
        mode: workspace.mode === "upload" ? "upload" : "new",
        generationWorkflow: workspace.generationWorkflow === "module-v1"
          ? "module-v1"
          : workspace.generationWorkflow === "creative-v2" ? "creative-v2" : "legacy",
      };
    },
    async getRevisionSummary({ tenantId, revisionId }) {
      const revision = await prisma.solutionRevision.findFirst({
        where: { id: revisionId, tenantId },
      });
      if (revision === null || revision.state === null || typeof revision.state !== "object") {
        return undefined;
      }
      return makeBoundedRevisionSummary(revision.state);
    },
    async getRevisionEntities({ tenantId, revisionId, workspaceId, projectKey, domainKind }) {
      const revision = await prisma.solutionRevision.findFirst({
        where: { id: revisionId, tenantId, workspaceId },
      });
      if (revision === null || revision.state === null || typeof revision.state !== "object") {
        return [];
      }
      // 上传工程（source-package）优先从 artifact 读取真实 GUID——上传包里的
      // 控件 GUID 是 KF 原始 GUID，不是 compile 模式的 deriveGuid 推导值；
      // 用推导 GUID 会导致 update/delete 引用找不到实体（PATCH_CONFLICT）。
      const projectRevision = await prisma.domainProjectRevision.findFirst({
        where: {
          tenantId,
          solutionRevisionId: revisionId,
          projectKey: projectKey ?? domainKind ?? "kingclient",
          domainKind: domainKind ?? "kingclient",
        },
        select: { packageUrl: true },
      });
      if (projectRevision !== null && projectRevision.packageUrl !== null) {
        return inspectBuiltClientEntities(tenantId, projectRevision.packageUrl, storage);
      }
      // compile-mode revisions store the ClientProjectIR in state; its control
      // GUIDs are deterministic per workspace: deriveGuid({ seed: workspaceId }, id).
      const record = revision.state as Record<string, unknown>;
      if (!Array.isArray(record["pages"])) {
        return [];
      }
      const entities: EditableEntity[] = [];
      for (const page of record["pages"] as Record<string, unknown>[]) {
        const pageName = typeof page["name"] === "string" ? page["name"] : "";
        if (pageName !== "") {
          entities.push({
            kind: "page",
            name: pageName,
            type: "page",
            // Page compiler uses the page name and adds the native `k`
            // prefix. Missing that prefix makes every later create operation
            // target a page GUID that does not exist in the package.
            guid: `k${deriveGuid({ seed: workspaceId }, pageName)}`,
          });
        }
        const controls = Array.isArray(page["controls"]) ? page["controls"] : [];
        for (const control of controls as Record<string, unknown>[]) {
          const id = typeof control["id"] === "string" ? control["id"] : "";
          if (id === "") continue;
          entities.push({
            kind: "control",
            name: id,
            type: capabilityIdFromIrControl(control),
            guid: deriveGuid({ seed: workspaceId }, id),
            ...controlGeometry(control),
          });
        }
      }
      return entities;
    },
  };

  const changePlanRepository: ChangePlanRepository = {
    async findOpenChangeRequest({ tenantId, workspaceId, conversationId }) {
      const request = await prisma.changeRequest.findFirst({
        where: { id: `cr:${workspaceId}:${conversationId}`, tenantId, status: "OPEN" },
      });
      return request === null ? null : { id: request.id };
    },
    async saveChangeRequest({ id, tenantId, workspaceId, title, status }) {
      await prisma.changeRequest.upsert({
        where: { id },
        create: { id, tenantId, workspaceId, title, status },
        update: { title, status },
      });
    },
    async savePlan({ id, tenantId, workspaceId, changeRequestId, planHash, plan }) {
      await prisma.changePlan.upsert({
        where: { id },
        create: {
          id,
          tenantId,
          workspaceId,
          changeRequestId,
          planHash,
          plan: plan as Prisma.InputJsonValue,
        },
        update: { planHash, plan: plan as Prisma.InputJsonValue },
      });
    },
    async loadPlanHash({ tenantId, changePlanId }) {
      const plan = await prisma.changePlan.findFirst({
        where: { id: changePlanId, tenantId },
      });
      return plan?.planHash ?? undefined;
    },
    async verifyPersistedCreativePlan({ tenantId, workspaceId, changePlanId, changeRequestId, planHash, revisionId }) {
      if (serverPlanAuthority === undefined) return false;
      const { stored, request } = await prisma.$transaction(async (tx) => {
        const [persistedPlan, persistedRequest] = await Promise.all([
          tx.changePlan.findFirst({
            where: { id: changePlanId, tenantId, workspaceId, changeRequestId, planHash },
            select: { plan: true, changeRequestId: true },
          }),
          tx.changeRequest.findFirst({
            where: {
              id: changeRequestId,
              tenantId,
              workspaceId,
              status: { in: ["OPEN", "APPROVED"] },
            },
            select: { id: true, tenantId: true, workspaceId: true, status: true },
          }),
        ]);
        return { stored: persistedPlan, request: persistedRequest };
      });
      if (stored?.plan === null || stored?.plan === undefined || stored.changeRequestId !== changeRequestId
        || request === null || request.id !== changeRequestId || request.tenantId !== tenantId
        || request.workspaceId !== workspaceId
        || (request.status !== "OPEN" && request.status !== "APPROVED")) return false;
      try {
        const verified = serverPlanAuthority.verify(JSON.parse(JSON.stringify(stored.plan)), {
          expectedPlanHash: planHash,
          expectedRevisionId: revisionId,
        });
        return verified.plan.workspaceId === workspaceId
          && verified.plan.creative !== undefined
          && verified.creativeArtifact !== undefined
          && verified.trustedNativeMaterialization !== undefined;
      } catch {
        return false;
      }
    },
    async setChangeRequestStatus({ tenantId, workspaceId, changeRequestId, status }) {
      const result = await prisma.changeRequest.updateMany({
        where: { id: changeRequestId, tenantId, workspaceId },
        data: { status },
      });
      if (result.count !== 1) throw new Error("CHANGE_REQUEST_STATUS_SYNC_FAILED");
    },
  };

  const buildJobPort: BuildJobPort = {
    async enqueue(input) {
      const job = await buildJobs.enqueue(input);
      return { id: job.id, status: job.status };
    },
    async getJob({ tenantId, jobId }) {
      const job = await buildJobs.get(jobId, tenantId);
      return job === null ? null : { id: job.id, status: job.status };
    },
  };

  const uiImplementationCompiler: UiImplementationCompilerPort = {
    compile({ workspaceId, spec, previousSpec, moduleCompilationArtifact, editableEntities }) {
      // The legacy model-to-UI path may carry sourceModuleId only for coverage
      // accounting. Without a verified compilation artifact those claims are
      // deliberately erased before the security boundary; only the module
      // coordinator can retain authoritative module ownership.
      const compilableSpec = moduleCompilationArtifact === undefined ? withoutUnverifiedModuleSources(spec) : spec;
      const compilablePrevious = previousSpec === undefined
        ? undefined
        : moduleCompilationArtifact === undefined ? withoutUnverifiedModuleSources(previousSpec) : previousSpec;
      const pageGuidById: Record<string, string> = Object.create(null) as Record<string, string>;
      const existingControlGuidByComponentId: Record<string, string> = Object.create(null) as Record<string, string>;
      const existingControlCapabilityIdByComponentId: Record<string, string> = Object.create(null) as Record<string, string>;
      const existingControlGeometryByComponentId: Record<
        string,
        { x: number; y: number; width: number; height: number }
      > = Object.create(null) as Record<string, { x: number; y: number; width: number; height: number }>;
      for (const entity of editableEntities) {
        if (entity.kind === "page") {
          pageGuidById[entity.name] = entity.guid;
        } else if (entity.kind === "control") {
          existingControlGuidByComponentId[entity.name] = entity.guid;
          existingControlCapabilityIdByComponentId[entity.name] = entity.type;
          if (
            entity.x !== undefined
            && entity.y !== undefined
            && entity.width !== undefined
            && entity.height !== undefined
          ) {
            existingControlGeometryByComponentId[entity.name] = {
              x: entity.x,
              y: entity.y,
              width: entity.width,
              height: entity.height,
            };
          }
        }
      }
      return Promise.resolve(compileUiImplementation(compilableSpec, {
        workspaceId,
        pageGuidById,
        existingControlGuidByComponentId,
        existingControlCapabilityIdByComponentId,
        existingControlGeometryByComponentId,
        ...(compilablePrevious !== undefined ? { previousImplementation: compilablePrevious } : {}),
        ...(moduleCompilationArtifact !== undefined ? { moduleCompilationArtifact } : {}),
      }));
    },
  };

  const acceptedBlueprintConfirmation: AcceptedBlueprintConfirmationPort = {
    confirm(input) {
      if (moduleArtifactAuthority === undefined) throw new Error("MODULE_ARTIFACT_AUTHORITY_NOT_CONFIGURED");
      return Promise.resolve(signAcceptedBlueprintAtConfirmation({ authority: moduleArtifactAuthority, registry: moduleRegistry, ...input }));
    },
  };

  const assetCatalog: AssetCatalogPort = {
    async list({ tenantId, workspaceId }) {
      if (assetService === undefined) throw new Error("ASSET_SERVICE_NOT_CONFIGURED");
      const rows = await assetService.list({ tenantId, workspaceId });
      return rows.map((row) => {
        if (row.type !== "image" || (row.mediaType !== "image/png" && row.mediaType !== "image/jpeg" && row.mediaType !== "image/webp")) {
          throw new Error("invalid persisted workspace asset metadata");
        }
        return { id: row.modelAssetId, kind: "image" as const, name: row.name, mimeType: row.mediaType, description: "Uploaded workspace image" };
      });
    },
  };

  const modulePlanCompiler: ModulePlanCompilerPort = {
    listPlanningCatalog() {
      return Promise.resolve(moduleRegistry.listForPlanning());
    },
    async compile(input) {
      if (assetService === undefined) throw new Error("ASSET_SERVICE_NOT_CONFIGURED");
      const catalogAssets = await assetService.resolveManyForCompilation({
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        assetIds: input.plan.assets.map((asset) => asset.id),
      });
      const definitions = input.plan.pages.flatMap((page) => page.modules.map((module) => moduleRegistry.require(module.kind, module.templateVersion)));
      const availableKfCapabilities = [...new Set(definitions.flatMap((definition) => [...definition.requiredKfCapabilities]))].sort();
      const assetsById = Object.fromEntries(catalogAssets.map((asset) => [asset.id, {
        assetId: asset.id,
        status: "resolved" as const,
        resolvedName: asset.name,
      }]));
      const approvedAssetsById = Object.fromEntries(catalogAssets.map((asset) => [asset.id, {
          workspaceAssetId: asset.workspaceAssetId,
          targetPath: asset.targetPath,
          mediaType: asset.mimeType,
          sha256: asset.sha256,
          sizeBytes: asset.sizeBytes,
      }]));
      return compileModulePlan({
        ...input,
        registry: moduleRegistry,
        assetsById,
        approvedAssetsById,
        validationContext: { availableKfCapabilities, approvedAuthorizationRefs: [] },
      });
    },
  };

  return {
    workspaceQuery,
    changePlanRepository,
    buildJobPort,
    uiImplementationCompiler,
    acceptedBlueprintConfirmation,
    modulePlanCompiler,
    assetCatalog,
    capabilityRetrieval: LOCAL_CAPABILITY_RETRIEVAL_PORT,
    ...(creativeSolutionCompiler === undefined ? {} : { creativeSolutionCompiler }),
  };
}

const CREATIVE_EVIDENCE_LIMITS = Object.freeze({
  maxCompressedBytes: 32 * 1024 * 1024,
  maxExpandedBytes: 128 * 1024 * 1024,
  maxFileCount: 2_500,
  maxPathLength: 512,
  maxCompressionRatio: 30,
  maxPages: 2_048,
  maxControls: 20_000,
  maxVariables: 10_000,
  maxScripts: 2_000,
  maxConcurrentInspections: 2,
});

/**
 * Production creative composition. The issuer-bound compiler and asset
 * attester are created inside this closure and never enter Nest DI, graph
 * state, controller state, or the returned narrow port.
 */
export function createCreativeSolutionCompilerFromEnvironment(
  prisma: PrismaService,
  storage: ArtifactStorage,
  assetService: Pick<AssetService, "resolveManyForCompilation">,
  environment: Readonly<Record<string, string | undefined>> = process.env,
): CreativeSolutionCompilerPort {
  const facade = createHmacCreativeBuildFacade(
    decodeServerPlanHmacKey(environment[SERVER_PLAN_HMAC_KEY_ENV]),
    createCreativeUIImplementationV2Compiler,
  );
  let inspectionsInFlight = 0;

  return Object.freeze({
    async compile(input) {
      try {
        if (input.projectKey !== input.semanticPlan.projectKey || input.domainKind !== "kingclient") {
          throw new Error("CREATIVE_PROJECT_IDENTITY_MISMATCH");
        }
        const evidence = await resolveCreativeEvidence({
          prisma,
          storage,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          baseRevisionId: input.baseRevisionId,
          projectKey: input.projectKey,
          domainKind: input.domainKind,
          enterInspection() {
            if (inspectionsInFlight >= CREATIVE_EVIDENCE_LIMITS.maxConcurrentInspections) {
              throw new Error("CREATIVE_EVIDENCE_CONCURRENCY_EXCEEDED");
            }
            inspectionsInFlight += 1;
          },
          leaveInspection() {
            inspectionsInFlight -= 1;
          },
        });
        const assetIds = collectCreativeAssetIds(input.semanticPlan);
        const resolvedAssets = await assetService.resolveManyForCompilation({
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          assetIds,
        });
        const approvedAssets = resolvedAssets.map((asset) => ({
          workspaceAssetId: asset.workspaceAssetId,
          targetPath: asset.targetPath,
          mediaType: asset.mimeType,
          sha256: asset.sha256,
          sizeBytes: asset.sizeBytes,
        }));
        const implementation = compileSolutionImplementation({
          plan: input.semanticPlan,
          candidateBundle: input.candidateBundle,
          moduleRegistry: createDefaultModuleRegistry(),
          approvedAssets,
          activeCatalogVersion: input.candidateBundle.knowledgeCatalogVersion,
        });
        const correlated = correlateCreativeImplementation({
          workspaceId: input.workspaceId,
          baseRevisionId: input.baseRevisionId,
          implementation,
          editableEntities: evidence.editableEntities,
          ...(evidence.inspection === undefined ? {} : { inspection: evidence.inspection }),
        });
        const interactions = compileInteractions({
          blueprint: input.blueprint,
          plan: input.semanticPlan,
          implementation: correlated.implementation,
        });
        const warnings = interactions.diagnostics.warnings.map((diagnostic) => ({
          code: diagnostic.code,
          nodeId: diagnostic.nodeId,
          message: "工程能力已采用受支持的兼容处理",
          phase: "interaction",
        }));
        const blocking: CreativeCompilationDiagnostic[] = [
          ...interactions.diagnostics.errors.map((diagnostic) => ({
            code: diagnostic.code,
            nodeId: diagnostic.nodeId,
            message: "交互工程能力校验未通过",
            phase: "interaction",
          })),
          ...interactions.diagnostics.requests.map((request) => ({
            code: "INTERACTION_COMPILATION_REQUEST",
            nodeId: request.actionId,
            message: "交互需要补充明确的可执行能力",
            phase: "interaction",
          })),
        ];
        if (blocking.length > 0) return { status: "blocked" as const, diagnostics: blocking, warnings };

        const verifiedAssets = resolvedAssets.map((asset) => ({
          assetId: asset.id,
          approvedAsset: {
            workspaceAssetId: asset.workspaceAssetId,
            targetPath: asset.targetPath,
            mediaType: asset.mimeType,
            sha256: asset.sha256,
            sizeBytes: asset.sizeBytes,
          },
        }));
        const assetProof = facade.compiler.assetProofResolver.attestResolvedAssets({
          workspaceId: input.workspaceId,
          assets: verifiedAssets,
        });
        const lowered = facade.compiler.compiler.compile({
          workspaceId: input.workspaceId,
          baseRevisionId: input.baseRevisionId,
          blueprint: input.blueprint,
          candidateBundle: input.candidateBundle,
          semanticPlan: input.semanticPlan,
          implementation: interactions.implementation,
          compilerVersion: "1.0.0",
          evidenceVersion: "1.0.0",
          verifiedAssets: assetProof,
          ...(correlated.verifiedExisting === undefined ? {} : { verifiedExisting: correlated.verifiedExisting }),
        });
        if (lowered.capabilityReport.status === "fail") {
          return {
            status: "blocked" as const,
            diagnostics: [{
              code: "CREATIVE_CAPABILITY_BLOCKED",
              phase: "lowering",
              nodeId: "$",
              message: "部分工程能力尚不可用",
              alternatives: lowered.capabilityReport.unsupported
                .filter((value) => /^[A-Za-z0-9_.-]{1,80}$/.test(value))
                .slice(0, 5),
            }],
            warnings,
          };
        }
        const signed = facade.authority.sign({
          plan: lowered.plan,
          revisionId: input.baseRevisionId,
          semanticOperations: [],
          creative: lowered.trustedCreativePayload,
        });
        const planHash = canonicalChangePlanHash(lowered.plan);
        const creative = lowered.plan.creative;
        if (creative === undefined) throw new Error("CREATIVE_MATERIALIZATION_INCOMPLETE");
        // Persistence accepts only a complete JSON transport value verified by
        // the exact authority that signed it. In-memory branded handles alone
        // can never authorize the durable queue.
        const verified = facade.authority.verify(JSON.parse(JSON.stringify(signed)), {
          expectedRevisionId: input.baseRevisionId,
          expectedPlanHash: planHash,
          expectedCreativeArtifactHash: creative.artifactHash,
          expectedNativeMaterializationHash: creative.materializationHash,
        });
        const confirmationId = canonicalServerHash({
          schema: "kf-creative-confirmation/v1",
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
          baseRevisionId: input.baseRevisionId,
          blueprintHash: canonicalServerHash(input.blueprint),
        });
        const persisted = await persistCreativePlan(prisma, {
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          conversationId: input.conversationId,
          baseRevisionId: input.baseRevisionId,
          confirmationId,
          planHash,
          envelope: verified,
        });
        const partial = [...new Set([
          ...lowered.capabilityReport.partial,
          ...warnings.map((warning) => `${warning.code}:${warning.nodeId}`),
        ])].slice(0, 500);
        return {
          status: "compiled" as const,
          ...persisted,
          operationCount: lowered.plan.operations.length,
          confirmationId,
          projectKey: input.projectKey,
          domainKind: input.domainKind,
          capabilityReport: {
            ...lowered.capabilityReport,
            status: warnings.length > 0 || lowered.capabilityReport.status === "warning"
              ? "warning" as const
              : "pass" as const,
            partial,
          },
          warnings,
        };
      } catch (error) {
        let diagnostic = creativeDiagnostic(error);
        if (diagnostic.code === "CREATIVE_COMPILATION_FAILED" || error instanceof SolutionCompileError) {
          const correlationId = randomUUID();
          CREATIVE_COMPILATION_LOGGER.error(
            `Creative compilation failed; correlationId=${correlationId}`,
            error instanceof Error ? error.stack ?? error.message : String(error),
          );
          diagnostic = { ...diagnostic, correlationId };
        }
        return { status: "blocked" as const, diagnostics: [diagnostic], warnings: [] };
      }
    },
  } satisfies CreativeSolutionCompilerPort);
}

function collectCreativeAssetIds(plan: SolutionImplementationPlan): string[] {
  const ids = new Set<string>();
  const pending: unknown[] = [plan];
  const seen = new Set<object>();
  while (pending.length > 0) {
    const value = pending.pop();
    if (value === null || typeof value !== "object" || seen.has(value)) continue;
    seen.add(value);
    if (Array.isArray(value)) {
      value.forEach((entry) => pending.push(entry));
      continue;
    }
    for (const [key, nested] of Object.entries(value)) {
      if (key === "assetId" && typeof nested === "string" && nested.startsWith("asset-")) ids.add(nested);
      else pending.push(nested);
    }
  }
  return [...ids].sort(compareCodePoints);
}

function correlateCreativeImplementation(input: {
  workspaceId: string;
  baseRevisionId: string;
  implementation: UIImplementationSpecV2;
  editableEntities: readonly EditableEntity[];
  inspection?: InspectResult;
}): { implementation: UIImplementationSpecV2; verifiedExisting?: VerifiedExistingRuntimeCorrelationHandle } {
  const derived = attachRuntimeCorrelation({
    workspaceId: input.workspaceId,
    baseRevisionId: input.baseRevisionId,
    implementation: input.implementation,
  });
  const pageEntities = uniqueEditableEntities(input.editableEntities, "page");
  const controlEntities = uniqueEditableEntities(input.editableEntities, "control");
  const implementationPages = input.implementation.pages.filter((page) => page.compatibility === "native");
  const hasExistingMatch = implementationPages.some((page) => pageEntities.has(page.id)
    || page.controls.some((control) => controlEntities.has(control.id)));
  if (!hasExistingMatch) return { implementation: derived };

  const inspected = input.inspection;
  if (inspected === undefined) throw new Error("CREATIVE_BASE_REVISION_EVIDENCE_MISSING");
  const derivedPage = new Map(derived.runtimeCorrelation!.pages.map((entry) => [entry.semanticPageId, entry.pageGuid]));
  const derivedControl = new Map(derived.runtimeCorrelation!.controls.map((entry) => [entry.semanticControlId, entry.instanceName]));
  const pages = implementationPages.map((page) => {
    const entity = pageEntities.get(page.id);
    if (entity === undefined) {
      return { source: "workspace-derived" as const, semanticPageId: page.id, pageGuid: derivedPage.get(page.id)! };
    }
    const inspectedPage = inspected.index.pages[entity.guid];
    if (inspectedPage === undefined || inspectedPage.name !== entity.name) {
      throw new Error("CREATIVE_EDITABLE_ENTITY_EVIDENCE_MISMATCH");
    }
    return { source: "uploaded-existing" as const, semanticPageId: page.id, pageGuid: entity.guid };
  });
  const pageById = new Map(pages.map((page) => [page.semanticPageId, page]));
  const controls = implementationPages.flatMap((page) => page.controls.map((control) => {
    const entity = controlEntities.get(control.id);
    if (entity === undefined) {
      return { source: "workspace-derived" as const, semanticControlId: control.id, instanceName: derivedControl.get(control.id)! };
    }
    const inspectedControl = inspected.index.controls[entity.guid];
    const owner = pageById.get(page.id);
    if (inspectedControl === undefined || inspectedControl.name !== entity.name
      || inspectedControl.capabilityId !== entity.type || owner?.source !== "uploaded-existing"
      || inspectedControl.pageGuid !== owner.pageGuid) {
      throw new Error("CREATIVE_EDITABLE_ENTITY_EVIDENCE_MISMATCH");
    }
    return { source: "uploaded-existing" as const, semanticControlId: control.id, instanceName: entity.name };
  }));
  const verifiedExisting = verifyExistingRuntimeCorrelation({
    workspaceId: input.workspaceId,
    baseRevisionId: input.baseRevisionId,
    inspection: inspected,
    correlations: { pages, controls },
  });
  return {
    verifiedExisting,
    implementation: attachRuntimeCorrelation({
      workspaceId: input.workspaceId,
      baseRevisionId: input.baseRevisionId,
      implementation: input.implementation,
      verifiedExisting,
    }),
  };
}

function uniqueEditableEntities(
  entities: readonly EditableEntity[],
  kind: EditableEntity["kind"],
): Map<string, EditableEntity> {
  const result = new Map<string, EditableEntity>();
  for (const entity of entities.filter((candidate) => candidate.kind === kind)) {
    if (result.has(entity.name)) throw new Error("CREATIVE_EDITABLE_ENTITY_AMBIGUOUS");
    result.set(entity.name, entity);
  }
  return result;
}

async function resolveCreativeEvidence(input: {
  prisma: PrismaService;
  storage: ArtifactStorage;
  tenantId: string;
  workspaceId: string;
  baseRevisionId: string;
  projectKey: string;
  domainKind: string;
  enterInspection(): void;
  leaveInspection(): void;
}): Promise<{ editableEntities: EditableEntity[]; inspection?: InspectResult }> {
  const revision = await input.prisma.solutionRevision.findFirst({
    where: {
      id: input.baseRevisionId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
    },
    select: { id: true, state: true, kind: true },
  });
  if (revision === null) throw new Error("CREATIVE_BASE_REVISION_EVIDENCE_MISSING");
  const projects = await input.prisma.domainProjectRevision.findMany({
    where: {
      tenantId: input.tenantId,
      solutionRevisionId: input.baseRevisionId,
    },
    select: { projectKey: true, domainKind: true, packageUrl: true },
  });
  const packaged = projects.filter((project) => project.packageUrl !== null);
  if (packaged.length > 0) {
    const exact = packaged.filter((project) =>
      project.projectKey === input.projectKey && project.domainKind === input.domainKind,
    );
    if (exact.length !== 1) {
      throw new Error(exact.length > 1
        ? "CREATIVE_BASE_REVISION_EVIDENCE_AMBIGUOUS"
        : "CREATIVE_BASE_REVISION_EVIDENCE_MISSING");
    }
    const packageUrl = exact[0]?.packageUrl;
    if (packageUrl === null || packageUrl === undefined) {
      throw new Error("CREATIVE_BASE_REVISION_EVIDENCE_MISSING");
    }
    input.enterInspection();
    try {
      const bytes = await readBoundedCreativePackage(input.storage, input.tenantId, packageUrl);
      const destination = await mkdtemp(path.join(tmpdir(), "kf-creative-evidence-"));
      try {
        const rootDir = await importNativeClientPackage(bytes, destination, {
          limits: {
            maxCompressedBytes: CREATIVE_EVIDENCE_LIMITS.maxCompressedBytes,
            maxExpandedBytes: CREATIVE_EVIDENCE_LIMITS.maxExpandedBytes,
            maxFileCount: CREATIVE_EVIDENCE_LIMITS.maxFileCount,
            maxPathLength: CREATIVE_EVIDENCE_LIMITS.maxPathLength,
            maxCompressionRatio: CREATIVE_EVIDENCE_LIMITS.maxCompressionRatio,
          },
        });
        const inspection = await inspectClientProject(rootDir, {
          runtimeBinding: { workspaceId: input.workspaceId, baseRevisionId: input.baseRevisionId },
        });
        assertCreativeInspectionBudget(inspection);
        return { editableEntities: entitiesFromInspection(inspection), inspection };
      } finally {
        await rm(destination, { recursive: true, force: true });
      }
    } finally {
      input.leaveInspection();
    }
  }
  if (projects.length > 0 || revision.kind === "source") {
    throw new Error("CREATIVE_BASE_REVISION_EVIDENCE_MISSING");
  }
  const editableEntities = entitiesFromRevisionState(revision.state, input.workspaceId);
  assertEditableEntityBudgetAndAmbiguity(editableEntities);
  return { editableEntities };
}

async function readBoundedCreativePackage(
  storage: ArtifactStorage,
  tenantId: string,
  storageKey: string,
): Promise<Buffer> {
  const stream = await storage.open(tenantId, storageKey);
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += bytes.length;
    if (size > CREATIVE_EVIDENCE_LIMITS.maxCompressedBytes) {
      throw new Error("CREATIVE_EVIDENCE_BUDGET_EXCEEDED");
    }
    chunks.push(bytes);
  }
  return Buffer.concat(chunks, size);
}

function assertCreativeInspectionBudget(inspection: InspectResult): void {
  const counts = {
    pages: Object.keys(inspection.index.pages).length,
    controls: Object.keys(inspection.index.controls).length,
    variables: Object.keys(inspection.index.variables).length,
    scripts: inspection.index.scripts.length,
  };
  if (counts.pages > CREATIVE_EVIDENCE_LIMITS.maxPages
    || counts.controls > CREATIVE_EVIDENCE_LIMITS.maxControls
    || counts.variables > CREATIVE_EVIDENCE_LIMITS.maxVariables
    || counts.scripts > CREATIVE_EVIDENCE_LIMITS.maxScripts
    || inspection.warnings.length > 0) {
    throw new Error("CREATIVE_EVIDENCE_BUDGET_EXCEEDED");
  }
}

function entitiesFromInspection(inspection: InspectResult): EditableEntity[] {
  const entities: EditableEntity[] = [
    ...Object.values(inspection.index.pages).map((page) => ({
      kind: "page" as const,
      name: page.name,
      type: "page",
      guid: page.guid,
    })),
    ...Object.values(inspection.index.controls).map((control) => ({
      kind: "control" as const,
      name: control.name ?? control.id,
      type: control.capabilityId,
      guid: control.guid,
      x: control.x,
      y: control.y,
      width: control.width,
      height: control.height,
    })),
    ...Object.values(inspection.index.variables).map((variable) => ({
      kind: "variable" as const,
      name: variable.name,
      type: "variable",
      guid: variable.guid,
    })),
  ];
  assertEditableEntityBudgetAndAmbiguity(entities);
  return entities;
}

function entitiesFromRevisionState(state: unknown, workspaceId: string): EditableEntity[] {
  if (state === null || typeof state !== "object") return [];
  const record = state as Record<string, unknown>;
  if (!Array.isArray(record["pages"])) return [];
  const entities: EditableEntity[] = [];
  for (const page of record["pages"] as Record<string, unknown>[]) {
    const pageName = typeof page["name"] === "string" ? page["name"] : "";
    if (pageName !== "") {
      entities.push({
        kind: "page",
        name: pageName,
        type: "page",
        guid: `k${deriveGuid({ seed: workspaceId }, pageName)}`,
      });
    }
    const controls = Array.isArray(page["controls"]) ? page["controls"] : [];
    for (const control of controls as Record<string, unknown>[]) {
      const id = typeof control["id"] === "string" ? control["id"] : "";
      if (id === "") continue;
      entities.push({
        kind: "control",
        name: id,
        type: capabilityIdFromIrControl(control),
        guid: deriveGuid({ seed: workspaceId }, id),
        ...controlGeometry(control),
      });
    }
  }
  return entities;
}

function assertEditableEntityBudgetAndAmbiguity(entities: readonly EditableEntity[]): void {
  if (entities.filter((entity) => entity.kind === "page").length > CREATIVE_EVIDENCE_LIMITS.maxPages
    || entities.filter((entity) => entity.kind === "control").length > CREATIVE_EVIDENCE_LIMITS.maxControls
    || entities.filter((entity) => entity.kind === "variable").length > CREATIVE_EVIDENCE_LIMITS.maxVariables) {
    throw new Error("CREATIVE_EVIDENCE_BUDGET_EXCEEDED");
  }
  const seen = new Set<string>();
  for (const entity of entities) {
    const identity = `${entity.kind}:${entity.name.toLocaleLowerCase("en-US")}`;
    if (seen.has(identity)) throw new Error("CREATIVE_EDITABLE_ENTITY_AMBIGUOUS");
    seen.add(identity);
  }
}

async function persistCreativePlan(
  prisma: PrismaService,
  input: {
    tenantId: string;
    workspaceId: string;
    conversationId: string;
    baseRevisionId: string;
    confirmationId: string;
    planHash: string;
    envelope: ServerPlanEnvelope;
  },
): Promise<{ changeRequestId: string; changePlanId: string; planHash: string }> {
  const changeRequestId = `cr:${input.workspaceId}:${input.conversationId}:${input.confirmationId}`;
  const changePlanId = `plan:${input.workspaceId}:${input.confirmationId}:${input.planHash}`;
  return prisma.$transaction(async (tx) => {
    const revision = await tx.solutionRevision.findFirst({
      where: {
        id: input.baseRevisionId,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
      },
      select: { id: true },
    });
    if (revision === null) throw new Error("CREATIVE_BASE_REVISION_EVIDENCE_MISSING");
    const existingRequest = await tx.changeRequest.findUnique({ where: { id: changeRequestId } });
    if (existingRequest !== null
      && (existingRequest.tenantId !== input.tenantId || existingRequest.workspaceId !== input.workspaceId)) {
      throw new Error("CREATIVE_PERSISTENCE_OWNERSHIP_MISMATCH");
    }
    await tx.changeRequest.upsert({
      where: { id: changeRequestId },
      create: {
        id: changeRequestId,
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        title: `工程生成 ${input.planHash.slice(0, 8)}`,
        status: "OPEN",
      },
      update: { title: `工程生成 ${input.planHash.slice(0, 8)}`, status: "OPEN" },
    });
    const existingPlan = await tx.changePlan.findUnique({ where: { id: changePlanId } });
    if (existingPlan !== null) {
      if (existingPlan.tenantId !== input.tenantId
        || existingPlan.workspaceId !== input.workspaceId
        || existingPlan.changeRequestId !== changeRequestId
        || existingPlan.planHash !== input.planHash
        || existingPlan.plan === null
        || canonicalServerHash(existingPlan.plan) !== canonicalServerHash(input.envelope)) {
        throw new Error("CREATIVE_PERSISTENCE_OWNERSHIP_MISMATCH");
      }
    } else {
      await tx.changePlan.create({
        data: {
          id: changePlanId,
          tenantId: input.tenantId,
          workspaceId: input.workspaceId,
          changeRequestId,
          planHash: input.planHash,
          plan: input.envelope as Prisma.InputJsonValue,
        },
      });
    }
    return { changeRequestId, changePlanId, planHash: input.planHash };
  });
}

function creativeDiagnostic(error: unknown): CreativeCompilationDiagnostic {
  if (error instanceof SolutionCompileError) {
    const code = SAFE_CREATIVE_REASON_CODES.has(error.reasonCode)
      ? error.reasonCode
      : "CREATIVE_COMPILATION_FAILED";
    return {
      code,
      phase: error.phase,
      nodeId: safeDiagnosticField(error.nodeId, "$"),
      message: "工程能力校验未通过",
      alternatives: error.alternatives.filter((value) => /^[A-Za-z0-9_.-]{1,80}$/.test(value)).slice(0, 5),
    };
  }
  const raw = error instanceof Error ? error.message : "";
  const candidate = /^([A-Z][A-Z0-9_]{2,80})$/.exec(raw)?.[1];
  const code = candidate !== undefined && SAFE_CREATIVE_REASON_CODES.has(candidate)
    ? candidate
    : "CREATIVE_COMPILATION_FAILED";
  return {
    code,
    phase: "composition",
    nodeId: "$",
    message: "工程编译依赖未通过校验",
  };
}

const SAFE_CREATIVE_REASON_CODES = new Set([
  "APPROVED_ASSET_INVALID",
  "BLUEPRINT_PAGE_SOURCE_MISMATCH",
  "BLUEPRINT_REGION_SOURCE_MISSING",
  "CANDIDATE_BUNDLE_HASH_MISMATCH",
  "CANDIDATE_BUNDLE_INVALID",
  "CANDIDATE_BUNDLE_REQUIRED",
  "CANDIDATE_PROVENANCE_MISMATCH",
  "CATALOG_VERSION_INVALID",
  "CATALOG_VERSION_MISMATCH",
  "COMPONENT_ASSET_BUDGET_EXCEEDED",
  "CREATIVE_BASE_REVISION_EVIDENCE_AMBIGUOUS",
  "CREATIVE_BASE_REVISION_EVIDENCE_MISSING",
  "CREATIVE_EDITABLE_ENTITY_AMBIGUOUS",
  "CREATIVE_EDITABLE_ENTITY_EVIDENCE_MISMATCH",
  "CREATIVE_EVIDENCE_BUDGET_EXCEEDED",
  "CREATIVE_EVIDENCE_CONCURRENCY_EXCEEDED",
  "CREATIVE_MATERIALIZATION_INCOMPLETE",
  "CREATIVE_PERSISTENCE_OWNERSHIP_MISMATCH",
  "CREATIVE_PROJECT_IDENTITY_MISMATCH",
  "EXPANSION_BUDGET_EXCEEDED",
  "IMPLEMENTATION_PAGE_MISSING",
  "INPUT_ACCESSOR_FORBIDDEN",
  "INPUT_CYCLE",
  "INPUT_DEPTH_EXCEEDED",
  "INPUT_FIELD_MISSING",
  "INPUT_INSPECTION_FAILED",
  "INPUT_NON_PLAIN_DATA",
  "INPUT_SHAPE_INVALID",
  "INPUT_SIZE_EXCEEDED",
  "LAYOUT_ID_DUPLICATE",
  "LEGACY_CANDIDATE_BUNDLE_FORBIDDEN",
  "OVERLAY_EXCEEDS_HOST_VIEWPORT",
  "OVERLAY_HOST_PAGE_MISSING",
  "PARENT_SOURCE_MISSING",
  "PLAN_INVALID",
  "REPEATER_DATA_NOT_FOUND",
  "REPEATER_FIELD_NON_SCALAR",
  "REPEATER_KEY_COLLISION",
  "REPEATER_KEY_MISSING",
  "REPEATER_KEY_UNSAFE",
  "REPEATER_MAX_ITEMS_EXCEEDED",
  "REPEATER_RECORD_FIELD_INVALID",
  "REPEATER_RECORD_MISSING",
  "REPEATER_ROOT_UNSUPPORTED",
  "REPEATER_SCOPE_ESCAPE",
  "UNEXPANDED_REPEATER",
]);

function safeDiagnosticField(value: string, fallback: string): string {
  return /^[A-Za-z0-9_$.-]{1,100}$/.test(value) ? value : fallback;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function withoutUnverifiedModuleSources(spec: import("@kf/contracts").UIImplementationSpec): import("@kf/contracts").UIImplementationSpec {
  return { ...spec, pages: spec.pages.map((page) => ({ ...page, components: page.components.map((component) => { const untrusted = { ...component }; Reflect.deleteProperty(untrusted, "sourceModuleId"); return untrusted; }) })) };
}

async function inspectBuiltClientEntities(
  tenantId: string,
  storageKey: string,
  storage: ArtifactStorage,
): Promise<EditableEntity[]> {
  const bytes = await readBoundedCreativePackage(storage, tenantId, storageKey);
  const destination = await mkdtemp(path.join(tmpdir(), "kf-graph-context-"));
  try {
    const rootDir = await importNativeClientPackage(bytes, destination, {
      limits: {
        maxCompressedBytes: CREATIVE_EVIDENCE_LIMITS.maxCompressedBytes,
        maxExpandedBytes: CREATIVE_EVIDENCE_LIMITS.maxExpandedBytes,
        maxFileCount: CREATIVE_EVIDENCE_LIMITS.maxFileCount,
        maxPathLength: CREATIVE_EVIDENCE_LIMITS.maxPathLength,
        maxCompressionRatio: CREATIVE_EVIDENCE_LIMITS.maxCompressionRatio,
      },
    });
    const inspection = await inspectClientProject(rootDir);
    assertCreativeInspectionBudget(inspection);
    return entitiesFromInspection(inspection);
  } finally {
    await rm(destination, { recursive: true, force: true });
  }
}

function capabilityIdFromIrControl(control: Record<string, unknown>): string {
  const type = typeof control["type"] === "string" ? control["type"] : "?";
  if (type === "easyui" && typeof control["proto"] === "number") {
    return `easyui.${control["proto"]}`;
  }
  if (type === "layout" && typeof control["layoutType"] === "number") {
    return `layout.${control["layoutType"]}`;
  }
  if (type === "prototype" && typeof control["prototypeName"] === "string") {
    return `prototype.${control["prototypeName"]}`;
  }
  return type;
}

function controlGeometry(
  control: Record<string, unknown>,
): { x?: number; y?: number; width?: number; height?: number } {
  return {
    ...(typeof control["x"] === "number" ? { x: control["x"] } : {}),
    ...(typeof control["y"] === "number" ? { y: control["y"] } : {}),
    ...(typeof control["width"] === "number" ? { width: control["width"] } : {}),
    ...(typeof control["height"] === "number" ? { height: control["height"] } : {}),
  };
}

/**
 * Bounded revision summary: names and counts only, never the full page JSON
 * or raw project IR (brief Step 6).
 */
function makeBoundedRevisionSummary(state: object): string {
  const record = state as Record<string, unknown>;
  const pages = Array.isArray(record["pages"]) ? (record["pages"] as Record<string, unknown>[]) : [];
  const names = pages
    .map((page) => {
      const name = page["name"];
      return typeof name === "string" ? name : "?";
    })
    .slice(0, 5)
    .join("、");
  return `页面 ${names.length > 0 ? names : "（无）"}；共 ${pages.length} 页`;
}

export type { ChangePlan, GraphMessage };
