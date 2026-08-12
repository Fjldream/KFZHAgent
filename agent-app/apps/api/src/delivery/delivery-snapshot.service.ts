import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { BuildJob } from "@prisma/client";
import type { ModuleArtifactAuthority } from "@kf/build-jobs";
import { readVerifiedModuleCompilationArtifact } from "@kf/build-jobs";
import {
  canonicalModuleCompilationHash,
  ModuleDeliveryReportSchema,
  ModulePlanSchema,
} from "@kf/contracts";
import type { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import pg from "pg";
import { PrismaService } from "../prisma/prisma.service.js";
import { PG_POOL, createCheckpointSaver } from "../conversations/checkpointer.js";
import { MODULE_ARTIFACT_AUTHORITY } from "../conversations/server-plan-authority.js";

export interface DeliveryResultProjection {
  modulePlanHash: string;
  projectKey: string;
  status: "ready" | "ready_with_warnings" | "blocked";
  gaps: Array<{ moduleId: string; requirement: string; severity: "info" | "warning" | "blocking"; status: "unresolved" | "mitigated" | "accepted"; reason: string; alternatives?: string[] }>;
  implementedModules: Array<{ pageId: string; moduleId: string; kind: string }>;
  repairCount: number;
  revisionDiff: { changedModules: string[]; preservedModules: string[] };
}

export interface PersistedDeliverySnapshot {
  tenantId: string;
  workspaceId: string;
  conversationId: string;
  buildJobId: string | null;
  modulePlanHash: string;
  artifactId: string | null;
  revisionId: string | null;
  result: DeliveryResultProjection;
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
    const values = await this.checkpointValues(conversationId);
    if (values === undefined || !hasModuleState(values)) return null;
    const result = projectModuleDeliveryResult(values, this.authority);
    if (result === undefined) return failClosedSnapshot(tenantId, conversation.workspaceId, conversationId, values, "交付快照校验失败");
    if (values["tenantId"] !== tenantId || values["workspaceId"] !== conversation.workspaceId || values["conversationId"] !== conversationId) {
      return failClosedSnapshot(tenantId, conversation.workspaceId, conversationId, values, "交付快照归属校验失败", result);
    }
    const buildJobId = typeof values["buildJobId"] === "string" ? values["buildJobId"] : null;
    if (expectedBuildJobId !== undefined && buildJobId !== expectedBuildJobId) {
      throw new ConflictException("delivery snapshot does not belong to the expected build job");
    }
    if (buildJobId === null) {
      return result.status === "blocked"
        ? snapshot(tenantId, conversation.workspaceId, conversationId, null, null, null, result)
        : failClosedSnapshot(tenantId, conversation.workspaceId, conversationId, values, "模块工程尚未进入可交付构建", result);
    }
    const job = await this.prisma.buildJob.findFirst({ where: { id: buildJobId, tenantId, workspaceId: conversation.workspaceId } });
    if (job === null || !jobMatchesCheckpoint(job, values, result.projectKey)) {
      return failClosedSnapshot(tenantId, conversation.workspaceId, conversationId, values, "构建与交付快照不匹配", result);
    }
    if (job.status !== "SUCCEEDED") {
      return failClosedSnapshot(tenantId, conversation.workspaceId, conversationId, values, job.status === "FAILED" ? "工程构建失败" : "工程尚未构建完成", result, job.id);
    }
    const [artifact, revision] = await Promise.all([
      this.prisma.artifact.findFirst({ where: { tenantId, buildJobId: job.id, kind: "client-package" }, orderBy: { createdAt: "desc" } }),
      this.prisma.solutionRevision.findFirst({ where: { tenantId, workspaceId: job.workspaceId, changePlanId: job.changePlanId, parentRevisionId: job.baseRevisionId }, orderBy: { revisionNumber: "desc" } }),
    ]);
    if (artifact === null || revision === null) {
      return failClosedSnapshot(tenantId, conversation.workspaceId, conversationId, values, "构建产物或修订记录缺失", result, job.id);
    }
    return snapshot(tenantId, conversation.workspaceId, conversationId, job.id, artifact.id, revision.id, result);
  }

  /** Same persisted snapshot gate for preview and token issuance/consumption. */
  async assertArtifactDeliverable(tenantId: string, artifactId: string): Promise<void> {
    const artifact = await this.prisma.artifact.findFirst({ where: { OR: [{ id: artifactId }, { storageKey: artifactId }], tenantId } });
    if (artifact === null) return; // DomainProjectRevision/source upload compatibility is handled by its owning route.
    const job = await this.prisma.buildJob.findFirst({ where: { id: artifact.buildJobId, tenantId } });
    if (job === null) throw new ConflictException("artifact has no trusted build binding");
    const conversationId = graphConversationId(job);
    if (conversationId === null) return; // Trusted server-created legacy/non-graph job; enqueue is not publicly exposed.
    const conversation = await this.prisma.conversation.findFirst({ where: { id: conversationId, tenantId, workspaceId: job.workspaceId } });
    if (conversation === null) throw new ConflictException("graph artifact has no trusted conversation binding");
    const values = await this.checkpointValues(conversationId);
    if (values === undefined) throw new ConflictException("module delivery status is unavailable");
    if (!hasModuleState(values)) return; // Explicit persisted legacy graph checkpoint.
    const delivery = await this.getForConversation(tenantId, conversationId, job.id);
    if (delivery === null || delivery.result.status === "blocked" || delivery.artifactId !== artifact.id || delivery.buildJobId !== job.id) {
      throw new ConflictException("module delivery is blocked or unavailable");
    }
  }

  private async checkpointValues(conversationId: string): Promise<Record<string, unknown> | undefined> {
    this.saverPromise ??= createCheckpointSaver(this.pool);
    const tuple = await (await this.saverPromise).getTuple({ configurable: { thread_id: conversationId } });
    const values = tuple?.checkpoint.channel_values;
    return values !== null && typeof values === "object" && !Array.isArray(values) ? values : undefined;
  }
}

export function projectModuleDeliveryResult(values: Record<string, unknown>, authority: ModuleArtifactAuthority): DeliveryResultProjection | undefined {
  const report = ModuleDeliveryReportSchema.safeParse(values["moduleDeliveryReport"]);
  const plan = ModulePlanSchema.safeParse(values["modulePlan"]);
  const modulePlanHash = values["modulePlanHash"];
  const repairCount = values["moduleRepairAttempt"];
  if (!report.success || !plan.success || !isHash(modulePlanHash) || !Number.isInteger(repairCount) || (repairCount as number) < 0 || (repairCount as number) > 3) return undefined;
  if (canonicalModuleCompilationHash(plan.data) !== modulePlanHash || report.data.projectKey !== plan.data.projectKey) return undefined;
  try {
    const revisionId = typeof values["currentRevisionId"] === "string" ? values["currentRevisionId"] : undefined;
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
      gaps: report.data.gaps.map((gap) => ({
        moduleId: gap.moduleId,
        requirement: gap.requirement,
        severity: gap.severity,
        status: gap.status,
        reason: gap.reason,
        ...(gap.alternatives === undefined ? {} : { alternatives: [...gap.alternatives] }),
      })),
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
    && values["currentRevisionId"] === job.baseRevisionId && projectKey === job.projectKey;
}

function graphConversationId(job: BuildJob): string | null {
  const suffix = `:${job.changePlanId}:${job.planHash}`;
  if (!job.idempotencyKey.endsWith(suffix)) return null;
  const prefix = job.idempotencyKey.slice(0, -suffix.length);
  return prefix.length > 0 && !prefix.includes(":") ? prefix : null;
}

function hasModuleState(values: Record<string, unknown>): boolean {
  return ["modulePlan", "modulePlanHash", "moduleCompilationArtifact", "moduleDeliveryReport"].some((key) => values[key] !== undefined);
}

function snapshot(tenantId: string, workspaceId: string, conversationId: string, buildJobId: string | null, artifactId: string | null, revisionId: string | null, result: DeliveryResultProjection): PersistedDeliverySnapshot {
  return { tenantId, workspaceId, conversationId, buildJobId, modulePlanHash: result.modulePlanHash, artifactId, revisionId, result };
}

function failClosedSnapshot(tenantId: string, workspaceId: string, conversationId: string, values: Record<string, unknown>, reason: string, base?: DeliveryResultProjection, buildJobId = typeof values["buildJobId"] === "string" ? values["buildJobId"] : null): PersistedDeliverySnapshot {
  const modulePlanHash = base?.modulePlanHash ?? (isHash(values["modulePlanHash"]) ? values["modulePlanHash"] : "0".repeat(64));
  const result: DeliveryResultProjection = {
    modulePlanHash,
    projectKey: base?.projectKey ?? "kingclient",
    status: "blocked",
    gaps: [{ moduleId: "delivery", requirement: "完成可信工程交付", severity: "blocking", status: "unresolved", reason }],
    implementedModules: base?.implementedModules ?? [],
    repairCount: base?.repairCount ?? 0,
    revisionDiff: base?.revisionDiff ?? { changedModules: [], preservedModules: [] },
  };
  return snapshot(tenantId, workspaceId, conversationId, buildJobId, null, null, result);
}

function unique(values: string[]): string[] { return [...new Set(values)].sort(); }
function compareModule(left: { pageId: string; moduleId: string }, right: { pageId: string; moduleId: string }): number {
  return left.pageId < right.pageId ? -1 : left.pageId > right.pageId ? 1 : left.moduleId < right.moduleId ? -1 : left.moduleId > right.moduleId ? 1 : 0;
}
function isHash(value: unknown): value is string { return typeof value === "string" && /^[0-9a-f]{64}$/.test(value); }
