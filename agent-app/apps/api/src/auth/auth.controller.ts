import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Response } from "express";
import { AUDIT_ACTIONS, AuditService } from "../audit/audit.service.js";
import { PrismaService } from "../prisma/prisma.service.js";
import { PasswordService } from "./password.service.js";
import { SESSION_COOKIE_NAME, SessionService } from "./session.service.js";
import { TenantGuard, type AuthenticatedRequest } from "./tenant.guard.js";
import { UsersService } from "../users/users.service.js";

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const INVALID_CREDENTIALS = "Invalid credentials";

/**
 * A real Argon2id hash of a fixed dummy password. When the submitted username
 * does not exist, the login path still runs one full Argon2 verify against it
 * so the response timing matches the existing-user path and attackers cannot
 * enumerate usernames through a timing side channel (I4). The verified value
 * is always false.
 */
const DUMMY_PASSWORD_HASH =
  "$argon2id$v=19$m=65536,p=4,t=3$A9WpYfELHo0bunkko2pKmQ$cTq4J9gHBP9/eZ9mBL/hA/IYM8yb7c0YncbeSkMohM4";

/**
 * Local username/password authentication with HttpOnly session cookies.
 * There is deliberately no registration route here.
 */
@Controller("api")
export class AuthController {
  constructor(
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Post("auth/login")
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() body: { tenant: string; username: string; password: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    user: {
      id: string;
      username: string;
      role: string;
      tenantId: string;
    };
    mustChangePassword: boolean;
  }> {
    const tenantName = typeof body.tenant === "string" ? body.tenant : "";
    const username = typeof body.username === "string" ? body.username : "";
    const password = typeof body.password === "string" ? body.password : "";
    const user = await this.users.findLoginTarget(tenantName, username);
    if (user === null) {
      // I4: burn one full Argon2 verify against a dummy hash so the
      // unknown-username path takes the same time as the known-user path.
      await this.passwords.verify(password, DUMMY_PASSWORD_HASH);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    const now = Date.now();
    if (user.lockedUntil !== null && user.lockedUntil.getTime() > now) {
      throw new UnauthorizedException("Account is locked");
    }
    const valid = await this.passwords.verify(password, user.passwordHash);
    if (!valid) {
      await this.users.recordLoginFailure(user);
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }
    await this.users.recordLoginSuccess(user);
    const { token } = await this.sessions.createSession(user.id);
    // Secure 标志默认开启（生产/测试）。E2E 通过 COOKIE_SECURE=false 在本地
    // http 环境运行（Node 侧 APIRequestContext 不会把 Secure cookie 发到
    // http 目标），浏览器端仍受 SameSite=strict + HttpOnly 保护。
    const cookieSecure = process.env.COOKIE_SECURE !== "false";
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_TTL_MS,
    });
    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId,
      },
      mustChangePassword: user.mustChangePassword,
    };
  }

  @Post("auth/logout")
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const cookies = req.cookies as Record<string, string> | undefined;
    const token = cookies?.[SESSION_COOKIE_NAME];
    if (typeof token === "string" && token.length > 0) {
      const tokenHash = this.sessions.hashToken(token);
      const session = await this.prisma.userSession.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (session !== null) {
        await this.audit.record({
          tenantId: session.user.tenantId,
          actorUserId: session.user.id,
          action: AUDIT_ACTIONS.LOGOUT,
          resourceType: "USER",
          resourceId: session.user.id,
        });
      }
      await this.sessions.revokeByToken(token);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
  }

  @Post("auth/change-password")
  @HttpCode(HttpStatus.OK)
  @UseGuards(TenantGuard)
  async changePassword(
    @Req() req: AuthenticatedRequest,
    @Body() body: { currentPassword: string; newPassword: string },
    @Res({ passthrough: true }) res: Response,
  ): Promise<{
    user: {
      id: string;
      username: string;
      role: string;
      tenantId: string;
    };
    mustChangePassword: boolean;
  }> {
    const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
    if (newPassword.length < 8) {
      throw new BadRequestException("New password must be at least 8 characters");
    }
    const changed = await this.users.changePassword(
      req.principal.userId,
      currentPassword,
      newPassword,
    );
    if (!changed) {
      throw new UnauthorizedException("Current password is incorrect");
    }
    // Password changed => revoke every session for the user (including this
    // restricted first-login one), then issue a FULL session so the user can
    // keep working without a second login (I2: first login forces the change,
    // the change hands over a complete session).
    await this.sessions.revokeAllForUser(req.principal.userId);
    const { token } = await this.sessions.createSession(req.principal.userId);
    const cookieSecure = process.env.COOKIE_SECURE !== "false";
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      secure: cookieSecure,
      sameSite: "strict",
      path: "/",
      maxAge: SESSION_TTL_MS,
    });
    const user = await this.prisma.user.findUnique({
      where: { id: req.principal.userId },
    });
    if (user === null) throw new UnauthorizedException();
    return {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        tenantId: user.tenantId,
      },
      mustChangePassword: false,
    };
  }

  @Get("me")
  @UseGuards(TenantGuard)
  async me(@Req() req: AuthenticatedRequest): Promise<{
    id: string;
    username: string;
    role: string;
    tenantId: string;
    mustChangePassword: boolean;
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: req.principal.userId },
    });
    if (user === null) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      username: user.username,
      role: user.role,
      tenantId: user.tenantId,
      mustChangePassword: user.mustChangePassword,
    };
  }
}
