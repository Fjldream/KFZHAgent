import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { SESSION_COOKIE_NAME, SessionService } from "./session.service.js";

/**
 * Authenticated request with the server-resolved tenant context attached.
 */
export type AuthenticatedRequest = Request & {
  principal: {
    userId: string;
    tenantId: string;
    role: "platform_admin" | "tenant_admin" | "member";
    sessionId: string;
    mustChangePassword: boolean;
  };
};

/** Routes a first-login (must-change-password) session may reach. */
const FIRST_LOGIN_ALLOWED_PATHS = new Set([
  "/api/auth/change-password",
  "/api/auth/logout",
  "/api/me",
]);

/**
 * Resolves tenantId exclusively from the authenticated session cookie. No
 * tenantId from a request body is ever trusted. Invalid/expired sessions are
 * rejected with 401.
 *
 * I2: a user whose `mustChangePassword` flag is still set (temporary first
 * login password) gets a RESTRICTED session: the guard authenticates it but
 * only permits the password-change flow (change-password / logout / me).
 * Every other API route is rejected with 403 until the password is changed,
 * so the temporary password can never be used to operate the platform.
 */
@Injectable()
export class TenantGuard implements CanActivate {
  constructor(private readonly sessions: SessionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookies = request.cookies as Record<string, string> | undefined;
    const token = cookies?.[SESSION_COOKIE_NAME];
    if (typeof token !== "string" || token.length === 0) {
      throw new UnauthorizedException();
    }
    const principal = await this.sessions.validateSession(token);
    if (principal === null) {
      throw new UnauthorizedException();
    }
    if (principal.mustChangePassword && !FIRST_LOGIN_ALLOWED_PATHS.has(request.path)) {
      throw new ForbiddenException(
        "password must be changed before using the workspace",
      );
    }
    request.principal = principal;
    return true;
  }
}
