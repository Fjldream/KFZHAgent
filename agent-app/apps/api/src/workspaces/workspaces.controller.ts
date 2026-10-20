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
 * 位于租户守卫后的工作空间端点。tenantId 始终来自已认证会话；跨租户查询表现为 404，避免泄漏资源存在性。
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
 * 流式 source-package 上传（简要步骤 4）。请求正文会在严格字节上限和 ZIP 内容嗅探的约束下直接流入制品存储；只有导入和检查成功后才创建源修订。失败错误码：PACKAGE_UNSUPPORTED / PACKAGE_UNPACK_FAILED / PROJECT_PARSE_FAILED；正文过大时返回 413。
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
 * 破坏性工作区删除。需要一个明确的 `{ confirm: true }`
 * body; 确认本身被记录为 DESTRUCTIVE_CONFIRM，以便审计轨迹能够区分确认和删除。
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
