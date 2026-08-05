import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { AUDIT_ACTIONS, AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { TenantsService } from "./tenants.service.js";
import { RolesGuard } from "../auth/roles.guard.js";
import { Roles } from "../auth/roles.decorator.js";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";

const TEMP_PASSWORD_MIN_LENGTH = 12;

/**
 * Closed provisioning endpoints. No route here is reachable anonymously and
 * none creates accounts for an arbitrary requester. Tenant/user creation and
 * platform-admin content access are audit-trailed (brief Step 7).
 */
@Controller("api/tenants")
@UseGuards(TenantGuard, RolesGuard)
export class TenantsController {
  constructor(
    private readonly tenants: TenantsService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @Roles("platform_admin")
  @HttpCode(HttpStatus.CREATED)
  async createTenant(
    @Req() req: AuthenticatedRequest,
    @Body() body: { name: string; username: string; temporaryPassword: string },
  ): Promise<{
    tenantId: string;
    tenantName: string;
    adminUserId: string;
    adminUsername: string;
    role: string;
  }> {
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const temporaryPassword =
      typeof body.temporaryPassword === "string" ? body.temporaryPassword : "";
    if (name.length === 0 || username.length === 0) {
      throw new BadRequestException("name and username are required");
    }
    if (temporaryPassword.length < TEMP_PASSWORD_MIN_LENGTH) {
      throw new BadRequestException(
        `temporaryPassword must be at least ${TEMP_PASSWORD_MIN_LENGTH} characters`,
      );
    }
    const created = await this.tenants.createTenantWithAdmin({
      name,
      username,
      temporaryPassword,
    });
    await this.audit.record({
      tenantId: created.tenantId,
      actorUserId: req.principal.userId,
      action: AUDIT_ACTIONS.TENANT_CREATED,
      resourceType: "TENANT",
      resourceId: created.tenantId,
      detail: { tenantName: created.tenantName, adminUserId: created.adminUserId },
    });
    return created;
  }

  @Post(":tenantId/members")
  @Roles("tenant_admin")
  @HttpCode(HttpStatus.CREATED)
  async createMember(
    @Req() req: AuthenticatedRequest,
    @Body() body: { username: string; password: string },
  ): Promise<{
    userId: string;
    tenantId: string;
    username: string;
    role: string;
    mustChangePassword: boolean;
  }> {
    const tenantId = req.params.tenantId;
    // Members can only be created inside the caller's own tenant. A body
    // tenantId is never trusted.
    if (tenantId !== req.principal.tenantId) {
      throw new ForbiddenException();
    }
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (username.length === 0) {
      throw new BadRequestException("username is required");
    }
    if (password.length < 8) {
      throw new BadRequestException("password must be at least 8 characters");
    }
    const created = await this.tenants.createMember({
      tenantId,
      username,
      password,
      role: "member",
    });
    await this.audit.record({
      tenantId,
      actorUserId: req.principal.userId,
      action: AUDIT_ACTIONS.MEMBER_CREATED,
      resourceType: "USER",
      resourceId: created.userId,
      detail: { username: created.username },
    });
    return created;
  }

  /**
   * Platform-admin content access: reading a tenant's metadata and members
   * across tenants. Every such read is audit-trailed as
   * PLATFORM_ADMIN_CONTENT_ACCESS (brief Step 7).
   */
  @Get(":tenantId")
  @Roles("platform_admin")
  async getTenant(
    @Param("tenantId") tenantId: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Record<string, unknown>> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        users: { select: { id: true, username: true, role: true, createdAt: true } },
      },
    });
    if (tenant === null) {
      throw new NotFoundException();
    }
    await this.audit.record({
      tenantId,
      actorUserId: req.principal.userId,
      action: AUDIT_ACTIONS.PLATFORM_ADMIN_CONTENT_ACCESS,
      resourceType: "TENANT",
      resourceId: tenantId,
      detail: { memberCount: tenant.users.length },
    });
    return tenant;
  }
}
