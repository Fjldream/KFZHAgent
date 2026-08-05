import {
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
  };
};

/**
 * Resolves tenantId exclusively from the authenticated session cookie. No
 * tenantId from a request body is ever trusted. Invalid/expired sessions are
 * rejected with 401.
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
    request.principal = principal;
    return true;
  }
}
