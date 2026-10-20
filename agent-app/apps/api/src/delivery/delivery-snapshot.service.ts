import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { BuildJob } from "@prisma/client";
import type { ModuleArtifactAuthority } from "@kf/build-jobs";
import { buildJobBelongsToConversation, readVerifiedAcceptedBlueprintArtifact, readVerifiedModuleCompilationArtifact } from "@kf/build-jobs";
import {
  canonicalModuleCompilationHash,
  ModuleDeliveryReportSchema,
  ModuleDeliveryOwnerMappingsSchema,
  MODULE_DELIVERY_AGGREGATE_OWNER,
  ModulePlanSchema,
} from "@kf/contracts";
import type { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import pg from "pg";
import { PrismaService } from "../prisma/prisma.service.js";
import { PG_POOL, createCheckpointSaver } from "../conversations/checkpointer.js";
import { MODULE_ARTIFACT_AUTHORITY } from "../conversations/server-plan-authority.js";

export interface DeliveryResultProjection {
  modulePlanHash?: string;
  projectKey: string;
  status: "ready" | "ready_with_warnings" | "blocked";
  gaps: Array<{ moduleId: string; requirement: string; severity: "info" | "warning" | "blocking"; status: "unresolved" | "mitigated" | "accepted"; reason: string; alternatives?: string[] }>;
  implementedModules: Array<{ pageId: string; moduleId: string; kind: string }>;
  repairCount: number;
  revisionDiff: { changedModules: string[]; preservedModules: string[] };
}

export interface CreativeProjectDeliveryProjection {
  workflow: "creative-v2";
  projectKey: string;
  status: "downloadable" | "building" | "failed" | "blocked";
  artifactId: string | null;
  revisionId: string | null;
  download: {
    available: boolean;
    tokenEndpoint: string | null;
  };
  kf36RuntimeVerification: {
    status: "not_performed";
    notice: "尚未经过人工 KingFusion 3.6 运行态验证";
  };
}

export interface PersistedDeliverySnapshot {
  tenantId: string;
  workspaceId: string;
  conversationId: string;
  buildJobId: string | null;
  modulePlanHash: string | null;
  artifactId: string | null;
  revisionId: string | null;
  result: DeliveryResultProjection | null;
  projectDelivery: CreativeProjectDeliveryProjection | null;
  buildJob: { id: string; workspaceId: string; status: BuildJob["status"]; planHash: string; baseRevisionId: string; changePlanId: string; projectKey: string } | null;
  artifact: { id: string; buildJobId: string; kind: string; sizeBytes: number | null; sha256: string | null } | null;
  revision: { id: string; revisionNumber: number; kind: string; parentRevisionId: string | null } | null;
}

@Injectable()
export class DeliverySnapshotService {
  private saverPromise: Promise<PostgresSaver> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(PG_POOL) private readonly pool: pg.Pool,
    @Inject(MODULE_ARTIFACT_AUTHORITY) readonly authority: ModuleArtifactAuthority,
  ) {}

  async getForConversation(tenantId: string, conversationId: string, expectedBuildJobId?: string): Promise<PersistedDeliverySnapshot | null> {
    const conversation = await this.prisma.conversation.findFirst({ where: { id: conversationId, tenantId } });
    if (conversation === null) throw new NotFoundException("conversation");
    const workspace = await this.prisma.solutionWorkspace.findFirst({
      where: { id: conversation.workspaceId, tenantId },
      select: { generationWorkflow: true },
    });
    if (workspace === null) throw new NotFoundException("workspace");
    const values = await this.checkpointValues(conversationId);
    if (values === undefined) return null;
    if (values["tenantId"] !== tenantId || values["workspaceId"] !== conversation.workspaceId || values["conversationId"] !== conversationId) {
      return hasModuleState(values) ? failClosedSnapshot(tenantId, conversation.workspaceId, conversationId, values, "交付快照归属校验失败") : null;
    }
    const buildJobId = typeof values["buildJobId"] === "string" ? values["buildJobId"] : null;
    if (expectedBuildJobId !== undefined && buildJobId !== expectedBuildJobId) {
      throw new ConflictException("delivery snapshot does not belong to the expected build job");
    }
    const job = buildJobId === null ? null : await this.prisma.buildJob.findFirst({ where: { id: buildJobId, tenantId, workspaceId: conversation.workspaceId } });
    if (job !== null && !buildJobBelongsToConversation(job, conversationId)) {
      return hasModuleState(values) ? failClosedSnapshot(tenantId, conversation.workspaceId, conversationId, values, "构建与会话绑定校验失败") : null;
    }
    if (!hasModuleState(values)) {
      return job === null ? null : this.recoverNonModule(
        tenantId,
        conversation.workspaceId,
        conversationId,
        job,
        values,
        workspace.generationWorkflow === "creative-v2",
      );
    }
    const result = projectModuleDeliveryResult(values, this.authority, job?.baseRevisionId);
    if (result === undefined) return failClosedSnapshot(tenantId, conversation.workspaceId, conversationId, values, "交付快照校验失败", undefined, job);
    if (buildJobId === null) {
      return result.status === "blocked"
        ? snapshot(tenantId, conversation.workspaceId, conversationId, null, null, null, result)
        : failClosedSnapshot(tenantId, conversation.workspaceId, conversationId, values, "模块工程尚未进入可交付构建", result);
    }
    if (job === null || !jobMatchesCheckpoint(job, values, result.projectKey)) {
      return failClosedSnapshot(tenantId, conversation.workspaceId, conversationId, values, "构建与交付快照不匹配", result);
    }
    if (result.status === "blocked") return snapshot(tenantId, conversation.workspaceId, conversationId, job, null, null, result);
    if (job.status !== "SUCCEEDED") {
      return failClosedSnapshot(tenantId, conversation.workspaceId, conversationId, values, job.status === "FAILED" ? "工程构建失败" : "工程尚未构建完成", result, job);
    }
    const [artifact, revisions] = await Promise.all([
      this.prisma.artifact.findFirst({ where: { tenantId, buildJobId: job.id, kind: "client-package" }, orderBy: { createdAt: "desc" } }),
      this.prisma.solutionRevision.findMany({ where: { tenantId, workspaceId: job.workspaceId, changePlanId: job.changePlanId, parentRevisionId: job.baseRevisionId }, orderBy: { revisionNumber: "desc" }, take: 2 }),
    ]);
    const revision = revisions.length === 1 ? revisions[0]! : null;
    if (artifact === null || revision === null) {
      return failClosedSnapshot(tenantId, conversation.workspaceId, conversationId, values, "构建产物或修订记录缺失", result, job);
    }
    const project = await this.prisma.domainProjectRevision.findFirst({ where: { tenantId, solutionRevisionId: revision.id, projectKey: job.projectKey, domainKind: job.domainKind } });
    if (project === null || project.packageUrl !== artifact.storageKey || project.packageHash !== artifact.sha256) {
      return failClosedSnapshot(tenantId, conversation.workspaceId, conversationId, values, "构建产物与工程修订不匹配", result, job);
    }
    if (values["currentRevisionId"] !== job.baseRevisionId && values["currentRevisionId"] !== revision.id) {
      return failClosedSnapshot(tenantId, conversation.workspaceId, conversationId, values, "交付快照修订已过期", result, job);
    }
    return snapshot(tenantId, conversation.workspaceId, conversationId, job, artifact, revision, result);
  }

  /** 预览与令牌的签发/使用采用同一个持久化快照校验关卡。 */
  async assertArtifactDeliverable(tenantId: string, artifactId: string): Promise<void> {
    const artifact = await this.prisma.artifact.findFirst({ where: { OR: [{ id: artifactId }, { storageKey: artifactId }], tenantId } });
    if (artifact === null) return; // DomainProjectRevision / 源包上传的兼容性由其所属路由处理。
    const job = await this.prisma.buildJob.findFirst({ where: { id: artifact.buildJobId, tenantId } });
    if (job === null) throw new ConflictException("artifact has no trusted build binding");
    const workspace = await this.prisma.solutionWorkspace.findFirst({
      where: { id: job.workspaceId, tenantId },
      select: { generationWorkflow: true },
    });
    if (workspace === null) throw new ConflictException("artifact has no trusted workspace binding");
    if (workspace.generationWorkflow === "creative-v2"
      || artifact.creativeArtifactHash !== null
      || artifact.nativeMaterializationHash !== null) {
      await this.assertCreativeArtifactBinding(job, artifact);
    }
    const conversations = await this.prisma.conversation.findMany({ where: { tenantId, workspaceId: job.workspaceId }, select: { id: true } });
    const conversationId = conversations.find(({ id }) => buildJobBelongsToConversation(job, id))?.id ?? null;
    if (conversationId === null) return; // 由可信服务器创建的旧版/非图作业；入队能力不对外公开。
    const conversation = await this.prisma.conversation.findFirst({ where: { id: conversationId, tenantId, workspaceId: job.workspaceId } });
    if (conversation === null) throw new ConflictException("graph artifact has no trusted conversation binding");
    const values = await this.checkpointValues(conversationId);
    if (values === undefined) throw new ConflictException("module delivery status is unavailable");
    if (!hasModuleState(values)) return; // 显式持久化的旧版图检查点。
    const delivery = await this.getForConversation(tenantId, conversationId, job.id);
    if (delivery === null || delivery.result === null || delivery.result.status === "blocked" || delivery.artifactId !== artifact.id || delivery.buildJobId !== job.id) {
      throw new ConflictException("module delivery is blocked or unavailable");
    }
  }

  private async checkpointValues(conversationId: string): Promise<Record<string, unknown> | undefined> {
    this.saverPromise ??= createCheckpointSaver(this.pool);
    const tuple = await (await this.saverPromise).getTuple({ configurable: { thread_id: conversationId } });
    const values = tuple?.checkpoint.channel_values;
    return values !== null && typeof values === "object" && !Array.isArray(values) ? values : undefined;
  }

  private async recoverNonModule(
    tenantId: string,
    workspaceId: string,
    conversationId: string,
    job: BuildJob,
    values: Record<string, unknown>,
    creativeWorkspace: boolean,
  ): Promise<PersistedDeliverySnapshot> {
    if (job.status !== "SUCCEEDED") {
      return creativeWorkspace
        ? projectUnavailableSnapshot(
            tenantId,
            workspaceId,
            conversationId,
            job,
            job.status === "FAILED" ? "failed" : "building",
          )
        : snapshot(tenantId, workspaceId, conversationId, job, null, null, null);
    }
    const [artifact, revisions] = await Promise.all([
      this.prisma.artifact.findFirst({ where: { tenantId, buildJobId: job.id, kind: "client-package" }, orderBy: { createdAt: "desc" } }),
      this.prisma.solutionRevision.findMany({ where: { tenantId, workspaceId, changePlanId: job.changePlanId, parentRevisionId: job.baseRevisionId }, orderBy: { revisionNumber: "desc" }, take: 2 }),
    ]);
    const revision = revisions.length === 1 ? revisions[0]! : null;
    if (!creativeWorkspace && (artifact === null || (artifact.creativeArtifactHash === null
      && artifact.nativeMaterializationHash === null))) {
      return snapshot(tenantId, workspaceId, conversationId, job, artifact, revision, null);
    }
    if (artifact === null || revision === null || (values["currentRevisionId"] !== job.baseRevisionId
      && values["currentRevisionId"] !== revision.id)) {
      return projectUnavailableSnapshot(tenantId, workspaceId, conversationId, job, "blocked");
    }
    try {
      await this.assertCreativeArtifactBinding(job, artifact, revision);
    } catch {
      return projectUnavailableSnapshot(tenantId, workspaceId, conversationId, job, "blocked");
    }
    return snapshot(tenantId, workspaceId, conversationId, job, artifact, revision, null, {
      workflow: "creative-v2",
      projectKey: job.projectKey,
      status: "downloadable",
      artifactId: artifact.id,
      revisionId: revision.id,
      download: {
        available: true,
        tokenEndpoint: `/api/artifacts/${artifact.id}/download-token`,
      },
      kf36RuntimeVerification: {
        status: "not_performed",
        notice: "尚未经过人工 KingFusion 3.6 运行态验证",
      },
    });
  }

  private async assertCreativeArtifactBinding(
    job: BuildJob,
    artifact: {
      id: string;
      buildJobId: string;
      solutionRevisionId: string | null;
      creativeArtifactHash: string | null;
      nativeMaterializationHash: string | null;
      storageKey: string;
      sha256: string | null;
    },
    knownRevision?: { id: string; state: unknown },
  ): Promise<void> {
    if (artifact.creativeArtifactHash === null || artifact.nativeMaterializationHash === null
      || artifact.solutionRevisionId === null || artifact.sha256 === null) {
      throw new ConflictException("creative artifact has no complete delivery binding");
    }
    const [revision, changePlan] = await Promise.all([
      knownRevision === undefined
        ? this.prisma.solutionRevision.findFirst({
            where: {
              id: artifact.solutionRevisionId,
              tenantId: job.tenantId,
              workspaceId: job.workspaceId,
              changePlanId: job.changePlanId,
              parentRevisionId: job.baseRevisionId,
            },
            select: { id: true, state: true },
          })
        : Promise.resolve(knownRevision),
      this.prisma.changePlan.findFirst({
        where: {
          id: job.changePlanId,
          tenantId: job.tenantId,
          workspaceId: job.workspaceId,
          planHash: job.planHash,
        },
        select: { id: true },
      }),
    ]);
    if (changePlan === null) {
      throw new ConflictException("creative artifact change-plan binding is invalid");
    }
    if (revision === null || revision.id !== artifact.solutionRevisionId) {
      throw new ConflictException("creative artifact revision binding is invalid");
    }
    const binding = creativeBuildState(revision.state, job.projectKey);
    if (binding === undefined
      || binding.packageHash !== artifact.sha256
      || binding.creativeArtifactHash !== artifact.creativeArtifactHash
      || binding.nativeMaterializationHash !== artifact.nativeMaterializationHash) {
      throw new ConflictException("creative artifact hash binding is invalid");
    }
    const project = await this.prisma.domainProjectRevision.findFirst({
      where: {
        tenantId: job.tenantId,
        solutionRevisionId: revision.id,
        projectKey: job.projectKey,
        domainKind: job.domainKind,
      },
    });
    if (project === null || project.packageUrl !== artifact.storageKey
      || project.packageHash !== artifact.sha256) {
      throw new ConflictException("creative project package binding is invalid");
    }
  }
}

export function projectModuleDeliveryResult(values: Record<string, unknown>, authority: ModuleArtifactAuthority, expectedCompilationRevisionId?: string): DeliveryResultProjection | undefined {
  const report = ModuleDeliveryReportSchema.safeParse(values["moduleDeliveryReport"]);
  const plan = ModulePlanSchema.safeParse(values["modulePlan"]);
  const modulePlanHash = values["modulePlanHash"];
  const repairCount = values["moduleRepairAttempt"];
  if (!report.success || !Number.isInteger(repairCount) || (repairCount as number) < 0 || (repairCount as number) > 3) return undefined;
  if (report.data.status === "blocked" && !plan.success && values["moduleCompilationArtifact"] === undefined) {
    try {
      const revisionId = typeof values["currentRevisionId"] === "string" ? values["currentRevisionId"] : undefined;
      if (revisionId === undefined) return undefined;
      const accepted = readVerifiedAcceptedBlueprintArtifact(authority.verifyAcceptedBlueprint(values["acceptedBlueprintArtifact"], { projectKey: report.data.projectKey, revisionId }));
      if (accepted.projectKey !== report.data.projectKey) return undefined;
      const rawMappings = values["moduleDeliveryOwnerMappings"];
      if (!isDescriptorSafeJson(rawMappings, 1_000)) return undefined;
      const mappings = ModuleDeliveryOwnerMappingsSchema.parse(rawMappings);
      const acceptedModuleIds = new Set(accepted.modules.map((module) => module.blueprintModuleId));
      if (mappings.length === 0 || mappings.some((mapping) => !acceptedModuleIds.has(mapping.blueprintModuleId))) return undefined;
      const trustedOwners = new Set([MODULE_DELIVERY_AGGREGATE_OWNER, ...mappings.flatMap((mapping) => [mapping.blueprintModuleId, mapping.moduleId])]);
      if (report.data.gaps.some((gap) => !trustedOwners.has(gap.moduleId))) return undefined;
      return {
        projectKey: report.data.projectKey,
        status: "blocked",
        gaps: projectGaps(report.data.gaps),
        implementedModules: [],
        repairCount: repairCount as number,
        revisionDiff: { changedModules: [], preservedModules: [] },
      };
    } catch { return undefined; }
  }
  if (!plan.success || !isHash(modulePlanHash)) return undefined;
  if (canonicalModuleCompilationHash(plan.data) !== modulePlanHash || report.data.projectKey !== plan.data.projectKey) return undefined;
  try {
    const revisionId = expectedCompilationRevisionId ?? (typeof values["currentRevisionId"] === "string" ? values["currentRevisionId"] : undefined);
    const implementationHash = isHash(values["uiImplementationHash"]) ? values["uiImplementationHash"] : undefined;
    const verified = authority.verifyModuleCompilation(values["moduleCompilationArtifact"], {
      projectKey: plan.data.projectKey,
      planHash: modulePlanHash,
      ...(revisionId === undefined ? {} : { revisionId }),
      ...(implementationHash === undefined ? {} : { implementationHash }),
    });
    const artifact = readVerifiedModuleCompilationArtifact(verified);
    const implementedModules = artifact.metadata.moduleDefinitions.map((entry) => ({ pageId: entry.pageId, moduleId: entry.moduleId, kind: entry.kind }));
    const planModules = plan.data.pages.flatMap((page) => page.modules.map((module) => ({ pageId: page.id, moduleId: module.id, kind: module.kind })));
    implementedModules.sort(compareModule);
    planModules.sort(compareModule);
    if (canonicalModuleCompilationHash(implementedModules) !== canonicalModuleCompilationHash(planModules)) return undefined;
    const moduleIds = implementedModules.map((entry) => entry.moduleId).sort();
    if (canonicalModuleCompilationHash(moduleIds) !== canonicalModuleCompilationHash([...artifact.sourceModuleIds].sort())) return undefined;
    const changed = plan.data.operations.length === 0
      ? [...moduleIds]
      : unique(plan.data.operations.map((operation) => operation.op === "add" ? operation.module.id : operation.moduleId));
    const changedSet = new Set(changed);
    const preserved = moduleIds.filter((id) => !changedSet.has(id));
    return {
      modulePlanHash,
      projectKey: report.data.projectKey,
      status: report.data.status,
      gaps: projectGaps(report.data.gaps),
      implementedModules,
      repairCount: repairCount as number,
      revisionDiff: { changedModules: changed.slice(0, 250), preservedModules: preserved.slice(0, 250) },
    };
  } catch {
    return undefined;
  }
}

function jobMatchesCheckpoint(job: BuildJob, values: Record<string, unknown>, projectKey: string): boolean {
  return values["buildJobId"] === job.id && values["changePlanId"] === job.changePlanId && values["planHash"] === job.planHash
    && projectKey === job.projectKey;
}

function hasModuleState(values: Record<string, unknown>): boolean {
  return ["modulePlan", "modulePlanHash", "moduleCompilationArtifact", "moduleDeliveryReport"].some((key) => values[key] !== undefined);
}

function snapshot(tenantId: string, workspaceId: string, conversationId: string, job: BuildJob | null, artifact: { id: string; buildJobId: string; kind: string; sizeBytes: number | null; sha256: string | null } | null, revision: { id: string; revisionNumber: number; kind: string; parentRevisionId: string | null } | null, result: DeliveryResultProjection | null, projectDelivery: CreativeProjectDeliveryProjection | null = null): PersistedDeliverySnapshot {
  return {
    tenantId, workspaceId, conversationId,
    buildJobId: job?.id ?? null,
    modulePlanHash: result?.modulePlanHash ?? null,
    artifactId: artifact?.id ?? null,
    revisionId: revision?.id ?? null,
    result,
    projectDelivery,
    buildJob: job === null ? null : { id: job.id, workspaceId: job.workspaceId, status: job.status, planHash: job.planHash, baseRevisionId: job.baseRevisionId, changePlanId: job.changePlanId, projectKey: job.projectKey },
    artifact,
    revision,
  };
}

function projectUnavailableSnapshot(
  tenantId: string,
  workspaceId: string,
  conversationId: string,
  job: BuildJob,
  status: "building" | "failed" | "blocked",
): PersistedDeliverySnapshot {
  return snapshot(tenantId, workspaceId, conversationId, job, null, null, null, {
    workflow: "creative-v2",
    projectKey: job.projectKey,
    status,
    artifactId: null,
    revisionId: null,
    download: { available: false, tokenEndpoint: null },
    kf36RuntimeVerification: {
      status: "not_performed",
      notice: "尚未经过人工 KingFusion 3.6 运行态验证",
    },
  });
}

function creativeBuildState(state: unknown, projectKey: string): {
  packageHash: string;
  creativeArtifactHash: string;
  nativeMaterializationHash: string;
} | undefined {
  if (state === null || typeof state !== "object" || Array.isArray(state)) return undefined;
  const record = state as Record<string, unknown>;
  let candidate = record["build"];
  if (record["schema"] === "kf-solution-revision-state/v1" && Array.isArray(record["projects"])) {
    const projects = record["projects"] as unknown[];
    const project: unknown = projects.find((value) => value !== null && typeof value === "object"
      && !Array.isArray(value) && (value as Record<string, unknown>)["projectKey"] === projectKey);
    candidate = project !== null && typeof project === "object" && !Array.isArray(project)
      ? (project as Record<string, unknown>)["buildState"]
      : undefined;
    if (candidate !== null && typeof candidate === "object" && !Array.isArray(candidate)) {
      candidate = (candidate as Record<string, unknown>)["build"];
    }
  }
  if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) return undefined;
  const binding = candidate as Record<string, unknown>;
  return isHash(binding["packageHash"]) && isHash(binding["creativeArtifactHash"])
    && isHash(binding["nativeMaterializationHash"])
    ? {
      packageHash: binding["packageHash"],
      creativeArtifactHash: binding["creativeArtifactHash"],
      nativeMaterializationHash: binding["nativeMaterializationHash"],
    }
    : undefined;
}

function failClosedSnapshot(tenantId: string, workspaceId: string, conversationId: string, values: Record<string, unknown>, reason: string, base?: DeliveryResultProjection, job: BuildJob | null = null): PersistedDeliverySnapshot {
  const modulePlanHash = base?.modulePlanHash ?? (isHash(values["modulePlanHash"]) ? values["modulePlanHash"] : undefined);
  const result: DeliveryResultProjection = {
    ...(modulePlanHash === undefined ? {} : { modulePlanHash }),
    projectKey: base?.projectKey ?? "kingclient",
    status: "blocked",
    gaps: [{ moduleId: "delivery", requirement: "完成可信工程交付", severity: "blocking", status: "unresolved", reason }],
    implementedModules: base?.implementedModules ?? [],
    repairCount: base?.repairCount ?? 0,
    revisionDiff: base?.revisionDiff ?? { changedModules: [], preservedModules: [] },
  };
  return snapshot(tenantId, workspaceId, conversationId, job, null, null, result);
}

function projectGaps(gaps: Array<{ moduleId: string; requirement: string; severity: "info" | "warning" | "blocking"; status: "unresolved" | "mitigated" | "accepted"; reason: string; alternatives?: string[] | undefined }>): DeliveryResultProjection["gaps"] {
  return gaps.map((gap) => ({ moduleId: gap.moduleId, requirement: gap.requirement, severity: gap.severity, status: gap.status, reason: gap.reason, ...(gap.alternatives === undefined ? {} : { alternatives: [...gap.alternatives] }) }));
}

function unique(values: string[]): string[] { return [...new Set(values)].sort(); }
function compareModule(left: { pageId: string; moduleId: string }, right: { pageId: string; moduleId: string }): number {
  return left.pageId < right.pageId ? -1 : left.pageId > right.pageId ? 1 : left.moduleId < right.moduleId ? -1 : left.moduleId > right.moduleId ? 1 : 0;
}
function isHash(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value); }

function isDescriptorSafeJson(root: unknown, maxNodes: number): boolean {
  if (root === null || typeof root !== "object") return false;
  const pending: object[] = [root];
  const seen = new Set<object>();
  while (pending.length > 0) {
    const current = pending.pop()!;
    if (seen.has(current)) return false;
    seen.add(current);
    if (seen.size > maxNodes) return false;
    const prototype = Reflect.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== Array.prototype && prototype !== null) return false;
    const descriptors = Object.getOwnPropertyDescriptors(current);
    for (const [key, descriptor] of Object.entries(descriptors)) {
      if (Array.isArray(current) && key === "length") continue;
      if (!("value" in descriptor) || descriptor.enumerable !== true) return false;
      const value = descriptor.value as unknown;
      if (value !== null && typeof value === "object") pending.push(value);
    }
  }
  return true;
}
