import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Post, Req, UseGuards } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service.js";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";

/**
 * Demonstration of tenant isolation for a business resource. The tenantId is
 * resolved only from the authenticated session; a cross-tenant lookup returns
 * 404 instead of 403/401 to avoid leaking that a resource exists.
 */
@Controller("api/workspaces")
@UseGuards(TenantGuard)
export class WorkspacesController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":id")
  async getWorkspace(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const workspace = await this.prisma.solutionWorkspace.findFirst({
      where: { id, tenantId: req.principal.tenantId },
    });
    if (workspace === null) {
      throw new NotFoundException();
    }
    return workspace;
  }

  @Post()
  async createWorkspace(
    @Body() body: { name: string; description?: string },
    @Req() req: AuthenticatedRequest,
  ): Promise<{
    id: string;
    tenantId: string;
    name: string;
    description: string | null;
    createdAt: Date;
    updatedAt: Date;
  }> {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    if (name.length === 0) {
      throw new BadRequestException("name is required");
    }
    const description = typeof body.description === "string" ? body.description : null;
    return this.prisma.solutionWorkspace.create({
      data: {
        tenantId: req.principal.tenantId,
        name,
        description,
      },
    });
  }
}
