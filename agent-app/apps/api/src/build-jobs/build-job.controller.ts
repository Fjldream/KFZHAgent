import { Controller, Get, NotFoundException, Param, Req, UseGuards } from "@nestjs/common";
import type { BuildJob } from "@prisma/client";
import { AUDIT_ACTIONS, AuditService } from "../audit/audit.service.js";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";
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
