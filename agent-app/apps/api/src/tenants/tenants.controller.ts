import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import { TenantsService } from "./tenants.service.js";
import { RolesGuard } from "../auth/roles.guard.js";
import { Roles } from "../auth/roles.decorator.js";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";

const TEMP_PASSWORD_MIN_LENGTH = 12;

/**
 * Closed provisioning endpoints. No route here is reachable anonymously and
 * none creates accounts for an arbitrary requester.
 */
@Controller("api/tenants")
@UseGuards(TenantGuard, RolesGuard)
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  @Roles("platform_admin")
  async createTenant(
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
    return this.tenants.createTenantWithAdmin({
      name,
      username,
      temporaryPassword,
    });
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
    return this.tenants.createMember({
      tenantId,
      username,
      password,
      role: "member",
    });
  }
}
