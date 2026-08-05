import { Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from "@nestjs/common";
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
  constructor(private readonly workspaces: WorkspaceService) {}

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
}
