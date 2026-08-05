import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma, type UserRole } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";
import { PasswordService } from "../auth/password.service.js";

/**
 * Closed account provisioning. There is no public registration route: a
 * platform admin provisions a Tenant plus its first tenant_admin with a
 * one-time password; tenant admins then create member accounts inside the
 * same tenant.
 */
@Injectable()
export class TenantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async createTenantWithAdmin(input: {
    name: string;
    username: string;
    temporaryPassword: string;
  }): Promise<{
    tenantId: string;
    tenantName: string;
    adminUserId: string;
    adminUsername: string;
    role: UserRole;
  }> {
    const passwordHash = await this.passwords.hash(input.temporaryPassword);
    try {
      const { tenant, admin } = await this.prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          const tenant = await tx.tenant.create({ data: { name: input.name } });
          const admin = await tx.user.create({
            data: {
              tenantId: tenant.id,
              username: input.username,
              passwordHash,
              role: "tenant_admin",
              mustChangePassword: true,
            },
          });
          return { tenant, admin };
        },
      );
      return {
        tenantId: tenant.id,
        tenantName: tenant.name,
        adminUserId: admin.id,
        adminUsername: admin.username,
        role: admin.role,
      };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException("Tenant name or admin username already exists");
      }
      throw error;
    }
  }

  async createMember(input: {
    tenantId: string;
    username: string;
    password: string;
    role: "member";
  }): Promise<{
    userId: string;
    tenantId: string;
    username: string;
    role: UserRole;
    mustChangePassword: boolean;
  }> {
    const passwordHash = await this.passwords.hash(input.password);
    try {
      const user = await this.prisma.user.create({
        data: {
          tenantId: input.tenantId,
          username: input.username,
          passwordHash,
          role: input.role,
          mustChangePassword: true,
        },
      });
      return {
        userId: user.id,
        tenantId: user.tenantId,
        username: user.username,
        role: user.role,
        mustChangePassword: user.mustChangePassword,
      };
    } catch (error) {
      if (this.isUniqueViolation(error)) {
        throw new ConflictException("Username already exists in this tenant");
      }
      throw error;
    }
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    );
  }
}
