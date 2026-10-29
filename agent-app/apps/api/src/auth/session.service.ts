import { Injectable } from "@nestjs/common";
import * as crypto from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";

/** HttpOnly 会话 cookie 的名称。 */
export const SESSION_COOKIE_NAME = "kf_session";

/**
 * 由会话守卫附加到请求上的已认证身份。tenantId 只来自服务器端会话记录。`mustChangePassword` 反映用户当前的标志，使租户守卫可以把首次登录会话限制在密码修改端点（I2）。
 */
export type SessionPrincipal = {
  userId: string;
  tenantId: string;
  role: "platform_admin" | "tenant_admin" | "member";
  sessionId: string;
  mustChangePassword: boolean;
};

/**
 * 不透明的 256 位随机会话令牌。数据库只存储每个令牌的 SHA-256 哈希，因此泄漏的记录转储无法用于重放。会话会在绝对 TTL 到期或空闲超时后失效；登录会轮换为新令牌；修改密码会撤销该用户的所有会话。
 */
@Injectable()
export class SessionService {
  private static readonly SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 天
  private static readonly IDLE_TTL_MS = 30 * 60 * 1000; // 30 分钟

  constructor(private readonly prisma: PrismaService) {}

  generateToken(): string {
    return crypto.randomBytes(32).toString("base64url");
  }

  hashToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  async createSession(userId: string): Promise<{ token: string; sessionId: string }> {
    const token = this.generateToken();
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const session = await this.prisma.userSession.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(now.getTime() + SessionService.SESSION_TTL_MS),
        lastUsedAt: now,
      },
    });
    return { token, sessionId: session.id };
  }

  async validateSession(token: string): Promise<SessionPrincipal | null> {
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const session = await this.prisma.userSession.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (!session) return null;
    if (session.revokedAt !== null) return null;
    if (session.expiresAt.getTime() <= now.getTime()) {
      await this.revokeSessionById(session.id);
      return null;
    }
    const idleMs = now.getTime() - session.lastUsedAt.getTime();
    if (idleMs > SessionService.IDLE_TTL_MS) {
      await this.revokeSessionById(session.id);
      return null;
    }
    // 滑动更新最后使用时间戳（首次使用 `createdAt` 时不写数据库）。
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: { lastUsedAt: now },
    });
    return {
      userId: session.userId,
      tenantId: session.user.tenantId,
      role: session.user.role,
      sessionId: session.id,
      mustChangePassword: session.user.mustChangePassword,
    };
  }

  async revokeByToken(token: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    await this.prisma.userSession.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
  /** SSE 心跳不是用户操作：只读复核，不滑动 lastUsedAt，且不能沿用已变更的租户/角色。 */
  async isSubscriptionActive(principal: SessionPrincipal): Promise<boolean> {
    const now = new Date();
    const session = await this.prisma.userSession.findFirst({ where: {
      id: principal.sessionId, userId: principal.userId, revokedAt: null,
      expiresAt: { gt: now }, lastUsedAt: { gte: new Date(now.getTime() - SessionService.IDLE_TTL_MS) },
      user: { tenantId: principal.tenantId, role: principal.role, mustChangePassword: false },
    }, select: { id: true } });
    return session !== null;
  }
  // end

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async revokeSessionById(sessionId: string): Promise<void> {
    await this.prisma.userSession.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
}
