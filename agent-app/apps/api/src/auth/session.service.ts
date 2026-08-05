import { Injectable } from "@nestjs/common";
import * as crypto from "node:crypto";
import { PrismaService } from "../prisma/prisma.service.js";

/** Name of the HttpOnly session cookie. */
export const SESSION_COOKIE_NAME = "kf_session";

/**
 * Authenticated identity attached to a request by the session guard.
 * tenantId comes exclusively from the server-side session record.
 * `mustChangePassword` reflects the user's current flag so the tenant guard
 * can confine a first-login session to the password-change endpoint (I2).
 */
export type SessionPrincipal = {
  userId: string;
  tenantId: string;
  role: "platform_admin" | "tenant_admin" | "member";
  sessionId: string;
  mustChangePassword: boolean;
};

/**
 * Opaque 256-bit random session tokens. The database stores only the SHA-256
 * hash of each token so a leaked row dump cannot be replayed. Sessions expire
 * after an absolute TTL and after an idle timeout; logging in rotates to a
 * fresh token; changing the password revokes every session for the user.
 */
@Injectable()
export class SessionService {
  private static readonly SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
  private static readonly IDLE_TTL_MS = 30 * 60 * 1000; // 30 minutes

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
    // Slide the last-used timestamp (no DB write on a cold `createdAt`).
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
