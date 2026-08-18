import type {
  BuildJobPort,
  AcceptedBlueprintConfirmationPort,
  AssetCatalogPort,
  CapabilityRetrievalPort,
  ModulePlanCompilerPort,
  UiImplementationCompilerPort,
  WorkspaceQueryPort,
} from "@kf/agent-orchestrator";
import type { ChangePlanRepository } from "@kf/agent-orchestrator";
import type { EditableEntity } from "@kf/agent-orchestrator";
import type { GraphMessage } from "@kf/agent-orchestrator";
import {
  compileModulePlan,
  compileUiImplementation,
  createDefaultModuleRegistry,
  deriveGuid,
  importNativeClientPackage,
  inspectClientProject,
  getDesignKnowledgeSnapshot,
  retrieveCapabilities,
} from "@kf/domain-client";
import type { ArtifactStorage } from "@kf/artifact-storage";
import type { ChangePlan, CustomerSolutionBlueprint } from "@kf/contracts";
import type { ModuleArtifactAuthority } from "@kf/build-jobs";
import type { Prisma } from "@prisma/client";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaService } from "../prisma/prisma.service.js";
import { BuildJobService } from "../build-jobs/build-job.service.js";
import { signAcceptedBlueprintAtConfirmation } from "./server-plan-authority.js";
import type { AssetService } from "../assets/asset.service.js";
import { REVIEWED_KF36_MODULE_RUNTIME_EVIDENCE } from "./module-runtime-evidence.js";

/**
 * Real Prisma-backed ports for the solution graph (brief "Consumes" line).
 * The graph stays free of direct database access; every read/write flows
 * through these ports so it remains deterministic and resumable.
 */

/** How many recent messages are handed to the model (mirrors the graph bound). */
const RECENT_MESSAGE_LIMIT = 20;

/** Nest token for the production-local deterministic retrieval boundary. */
export const CAPABILITY_RETRIEVAL_PORT = Symbol("CAPABILITY_RETRIEVAL_PORT");

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
}

export function createGraphPorts(
  prisma: PrismaService,
  storage: ArtifactStorage,
  moduleArtifactAuthority?: ModuleArtifactAuthority,
  assetService?: Pick<AssetService, "list" | "resolveManyForCompilation">,
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
    async getRevisionEntities({ tenantId, revisionId, workspaceId }) {
      const revision = await prisma.solutionRevision.findFirst({
        where: { id: revisionId, tenantId },
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
          domainKind: "kingclient",
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
    async setChangeRequestStatus({ tenantId, changeRequestId, status }) {
      await prisma.changeRequest.updateMany({
        where: { id: changeRequestId, tenantId },
        data: { status },
      });
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
  };
}

function withoutUnverifiedModuleSources(spec: import("@kf/contracts").UIImplementationSpec): import("@kf/contracts").UIImplementationSpec {
  return { ...spec, pages: spec.pages.map((page) => ({ ...page, components: page.components.map((component) => { const untrusted = { ...component }; Reflect.deleteProperty(untrusted, "sourceModuleId"); return untrusted; }) })) };
}

async function inspectBuiltClientEntities(
  tenantId: string,
  storageKey: string,
  storage: ArtifactStorage,
): Promise<EditableEntity[]> {
  const stream = await storage.open(tenantId, storageKey);
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const destination = await mkdtemp(path.join(tmpdir(), "kf-graph-context-"));
  try {
    const rootDir = await importNativeClientPackage(Buffer.concat(chunks), destination);
    const inspection = await inspectClientProject(rootDir);
    const entities: EditableEntity[] = [];
    for (const page of inspection.summary.pages) {
      entities.push({
        kind: "page",
        name: page.name,
        type: "page",
        guid: page.guid,
      });
      const pageIndex = inspection.index.pages[page.guid];
      for (const controlGuid of pageIndex?.controlGuids ?? []) {
        const control = inspection.index.controls[controlGuid];
        if (control === undefined) continue;
        entities.push({
          kind: "control",
          name: control.name ?? control.id,
          type: control.capabilityId,
          guid: control.guid,
          x: control.x,
          y: control.y,
          width: control.width,
          height: control.height,
        });
      }
    }
    return entities;
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
