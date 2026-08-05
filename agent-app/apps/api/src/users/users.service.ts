import { Injectable } from "@nestjs/common";
import type { User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { PasswordService } from "../auth/password.service.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const LOCK_DURATION_MS = 15 * 60 * 1000;

/**
 * User identity lookups, password verification, and failed-login lockout.
 * Usernames are scoped to a tenant, so login is keyed by (tenant, username).
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async findLoginTarget(tenantName: string, username: string): Promise<User | null> {
    return this.prisma.user.findFirst({
      where: { username, tenant: { name: tenantName } },
    });
  }

  /** Registers one failed attempt; locks the account past the threshold. */
  async recordLoginFailure(user: User): Promise<void> {
    const now = new Date();
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "LOGIN_FAILED",
        resourceType: "USER",
        resourceId: user.id,
      },
    });
    const windowStart = new Date(now.getTime() - LOCK_WINDOW_MS);
    const failures = await this.prisma.auditLog.count({
      where: {
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "LOGIN_FAILED",
        createdAt: { gte: windowStart },
      },
    });
    if (failures >= MAX_FAILED_ATTEMPTS) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { lockedUntil: new Date(now.getTime() + LOCK_DURATION_MS) },
      });
    }
  }

  /** Clears lockout state and resets the failed-attempt counter. */
  async recordLoginSuccess(user: User): Promise<void> {
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lockedUntil: null },
    });
    await this.prisma.auditLog.deleteMany({
      where: {
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "LOGIN_FAILED",
      },
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId: user.tenantId,
        actorUserId: user.id,
        action: "LOGIN_SUCCESS",
        resourceType: "USER",
        resourceId: user.id,
      },
    });
  }

  /**
   * Verifies the current password and stores a fresh Argon2id hash. Returns
   * false when the current password does not match.
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<boolean> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (user === null) return false;
    const matches = await this.passwords.verify(currentPassword, user.passwordHash);
    if (!matches) return false;
    const passwordHash = await this.passwords.hash(newPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash, mustChangePassword: false },
    });
    return true;
  }
}
