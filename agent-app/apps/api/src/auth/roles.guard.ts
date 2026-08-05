import {
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { UserRole } from "@prisma/client";
import { ROLES_KEY } from "./roles.decorator.js";
import type { AuthenticatedRequest } from "./tenant.guard.js";

/**
 * Enforces @Roles(...) metadata on top of the tenant guard. Requires the
 * session principal to have already been attached by TenantGuard.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required === undefined || required.length === 0) {
      return true;
    }
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!required.includes(request.principal.role)) {
      throw new ForbiddenException();
    }
    return true;
  }
}
