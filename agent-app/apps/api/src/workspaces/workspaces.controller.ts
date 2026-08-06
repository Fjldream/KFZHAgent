import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AUDIT_ACTIONS, AuditService } from "../audit/audit.service.js";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { WorkspaceService } from "./workspace.service.js";

/**
 * Workspace endpoints behind the tenant guard. tenantId always comes from the
 * authenticated session; cross-tenant lookups surface as 404 to avoid leaking
 * that a resource exists.
 */
@Controller("api/workspaces")
@UseGuards(TenantGuard)
export class WorkspacesController {
  constructor(
    private readonly workspaces: WorkspaceService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  async listWorkspaces(@Req() req: AuthenticatedRequest): Promise<Record<string, unknown>[]> {
    return await this.workspaces.list(req.principal.tenantId);
  }

  @Get(":id")
  async getWorkspace(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Record<string, unknown>> {
    try {
      return await this.workspaces.get(req.principal.tenantId, id);
    } catch {
      throw new NotFoundException();
    }
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createWorkspace(
    @Body() body: { name?: string; description?: string; mode?: "new" | "upload" },
    @Req() req: AuthenticatedRequest,
  ): Promise<Record<string, unknown>> {
    const { workspace } = await this.workspaces.createWorkspace({
      tenantId: req.principal.tenantId,
      name: body.name ?? "",
      ...(body.description !== undefined ? { description: body.description } : {}),
      ...(body.mode === "upload" ? { mode: "upload" } : {}),
    });
    return workspace;
  }

  /**
   * Streaming source-package upload (brief Step 4). The request body is
   * streamed straight into artifact storage with a strict byte cap and ZIP
   * content sniffing; the Source Revision is created only after import +
   * inspection succeed. Failure error codes: PACKAGE_UNSUPPORTED /
   * PACKAGE_UNPACK_FAILED / PROJECT_PARSE_FAILED; 413 for oversized bodies.
   */
  @Post(":id/uploads")
  @HttpCode(HttpStatus.CREATED)
  async uploadSource(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
    @Query("maxBytes") maxBytes?: string,
  ): Promise<Record<string, unknown>> {
    const parsedMaxBytes = maxBytes !== undefined ? Number(maxBytes) : undefined;
    const result = await this.workspaces.uploadSourceRevision({
      tenantId: req.principal.tenantId,
      workspaceId: id,
      stream: req,
      ...(typeof parsedMaxBytes === "number" && Number.isFinite(parsedMaxBytes)
        ? { maxBytes: parsedMaxBytes }
        : {}),
    });
    await this.audit.record({
      tenantId: req.principal.tenantId,
      actorUserId: req.principal.userId,
      action: AUDIT_ACTIONS.UPLOAD,
      resourceType: "WORKSPACE",
      resourceId: id,
      detail: {
        revisionId: result.revision.id,
        packageUrl: result.domainProject.packageUrl,
        domainKind: result.domainProject.domainKind,
      },
    });
    return {
      revision: result.revision,
      domainProject: result.domainProject,
      summary: result.summary,
      packageUrl: result.domainProject.packageUrl,
    };
  }

  @Get(":id/revisions")
  async listRevisions(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Record<string, unknown>[]> {
    try {
      return await this.workspaces.listRevisions(req.principal.tenantId, id);
    } catch {
      throw new NotFoundException();
    }
  }

  /**
   * Destructive workspace deletion. Requires an explicit `{ confirm: true }`
   * body; the confirmation itself is recorded as DESTRUCTIVE_CONFIRM so the
   * audit trail distinguishes the confirmation from the deletion.
   */
  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteWorkspace(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { confirm?: boolean },
  ): Promise<void> {
    if (body.confirm !== true) {
      throw new BadRequestException("destructive deletion requires { confirm: true }");
    }
    await this.audit.record({
      tenantId: req.principal.tenantId,
      actorUserId: req.principal.userId,
      action: AUDIT_ACTIONS.DESTRUCTIVE_CONFIRM,
      resourceType: "WORKSPACE",
      resourceId: id,
      detail: { action: "delete-workspace" },
    });
    await this.workspaces.deleteWorkspace(req.principal.tenantId, id);
    await this.audit.record({
      tenantId: req.principal.tenantId,
      actorUserId: req.principal.userId,
      action: AUDIT_ACTIONS.WORKSPACE_DELETED,
      resourceType: "WORKSPACE",
      resourceId: id,
    });
  }
}
