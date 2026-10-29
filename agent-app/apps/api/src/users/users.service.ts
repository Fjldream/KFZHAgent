import { Injectable } from "@nestjs/common";
import type { User } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { PasswordService } from "../auth/password.service.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_WINDOW_MS = 15 * 60 * 1000;
const LOCK_DURATION_MS = 15 * 60 * 1000;

/**
 * 用户身份查询、密码验证和登录失败锁定。用户名以租户为作用域，因此登录以（租户，用户名）为键。
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

  /** 注册一个失败尝试；锁定账户超过阈值。 */
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

  /** 清除锁定状态并重置失败尝试计数。 */
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
 * 验证当前密码并存储新的Argon2id哈希。返回false时，当前密码不匹配。
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
