import {
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import type { CanActivate, ExecutionContext } from "@nestjs/common";
import type { Request } from "express";
import { SESSION_COOKIE_NAME, SessionService } from "./session.service.js";

/**
 * 带有服务器解析的租户上下文的认证请求。
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

/** 首次登录（必须更改密码）会话可能到达的路由。 */
const FIRST_LOGIN_ALLOWED_PATHS = new Set([
  "/api/auth/change-password",
  "/api/auth/logout",
  "/api/me",
]);

/**
 * 仅从经过身份验证的会话 Cookie 中解析 tenantId。绝不信任请求正文中的 tenantId。无效或过期的会话会以 401 拒绝。
 *
 * I2：`mustChangePassword` 标志仍为已设置状态（首次登录使用临时密码）的用户会获得 RESTRICTED 会话：守卫会验证该会话，但只允许修改密码流程（change-password / logout / me）。在密码修改前，所有其他 API 路由都会以 403 拒绝，因此临时密码绝不能用于操作平台。
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
