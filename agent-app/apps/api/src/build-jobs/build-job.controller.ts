import { Controller, Get, NotFoundException, Param, Req, UseGuards } from "@nestjs/common";
import type { BuildJob, ValidationReport } from "@prisma/client";
import { AUDIT_ACTIONS, AuditService } from "../audit/audit.service.js";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { ArtifactService } from "../artifacts/artifact.service.js";
import { BuildJobService } from "./build-job.service.js";

/**
 * Durable build-job query endpoints. Jobs are tenant-scoped; cross-tenant ids
 * surface as 404. Terminal outcomes (SUCCEEDED/FAILED) are recorded once as
 * BUILD_RESULT audit events on first observation.
 */
@Controller("api/build-jobs")
@UseGuards(TenantGuard)
export class BuildJobController {
  constructor(
    private readonly jobs: BuildJobService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly artifacts: ArtifactService,
  ) {}

  @Get(":id")
  async getBuildJob(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<BuildJob> {
    const job = await this.jobs.get(id, req.principal.tenantId);
    if (job === null) {
      throw new NotFoundException();
    }
    await this.recordBuildResultOnce(job);
    return job;
  }

  /** 构建制品的 tenant 隔离列表（下载走两段式 token 协议）。 */
  @Get(":id/artifacts")
  async listArtifacts(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<import("@prisma/client").Artifact[]> {
    const job = await this.jobs.get(id, req.principal.tenantId);
    if (job === null) {
      throw new NotFoundException();
    }
    return this.artifacts.listForJob(req.principal.tenantId, id);
  }

  /** 构建的校验报告（六层校验，brief Task 7）。 */
  @Get(":id/report")
  async getReport(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<ValidationReport> {
    const job = await this.jobs.get(id, req.principal.tenantId);
    if (job === null) {
      throw new NotFoundException();
    }
    const report = await this.prisma.validationReport.findFirst({
      where: { tenantId: req.principal.tenantId, buildJobId: id },
      orderBy: { createdAt: "desc" },
    });
    if (report === null) {
      throw new NotFoundException();
    }
    return report;
  }

  /** A terminal status is irreversible, so recording once per job is enough. */
  private async recordBuildResultOnce(job: BuildJob): Promise<void> {
    if (job.status !== "SUCCEEDED" && job.status !== "FAILED") return;
    const existing = await this.prisma.auditLog.findFirst({
      where: { tenantId: job.tenantId, action: AUDIT_ACTIONS.BUILD_RESULT, resourceId: job.id },
    });
    if (existing !== null) return;
    await this.audit.record({
      tenantId: job.tenantId,
      action: AUDIT_ACTIONS.BUILD_RESULT,
      resourceType: "BUILD_JOB",
      resourceId: job.id,
      detail: { status: job.status, workspaceId: job.workspaceId },
    });
  }
}
