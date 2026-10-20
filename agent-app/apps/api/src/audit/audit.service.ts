import { Injectable } from "@nestjs/common";
import { Prisma, type AuditLog } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * 每个有意义的安全或业务操作都记录为审计事件，tenantId + 活动执行者 + 资源，这样可以重建和审查租户的完整历史记录，供平台管理员查看。
 */
export const AUDIT_ACTIONS = {
  LOGIN_SUCCESS: "LOGIN_SUCCESS",
  LOGIN_FAILED: "LOGIN_FAILED",
  LOGOUT: "LOGOUT",
  TENANT_CREATED: "TENANT_CREATED",
  MEMBER_CREATED: "MEMBER_CREATED",
  UPLOAD: "UPLOAD",
  PLAN_CONFIRMED: "PLAN_CONFIRMED",
  PLAN_REVISED: "PLAN_REVISED",
  PLAN_CANCELLED: "PLAN_CANCELLED",
  BUILD_START: "BUILD_START",
  BUILD_RESULT: "BUILD_RESULT",
  DOWNLOAD: "DOWNLOAD",
  WORKSPACE_DELETED: "WORKSPACE_DELETED",
  DESTRUCTIVE_CONFIRM: "DESTRUCTIVE_CONFIRM",
  PLATFORM_ADMIN_CONTENT_ACCESS: "PLATFORM_ADMIN_CONTENT_ACCESS",
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export interface AuditInput {
  tenantId: string;
  actorUserId?: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  detail?: Record<string, unknown>;
}

/**
 * 轻量的审计日志写入器。tenantId 始终来自经过身份验证的主体或资源本身，绝不来自请求正文。
 *
 * 可以向 `record` 传入事务客户端，使审计记录与受保护的操作写入同一事务（用于串行化的会话恢复路径）。
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: AuditInput, client?: Prisma.TransactionClient): Promise<AuditLog> {
    const db = client ?? this.prisma;
    return db.auditLog.create({
      data: {
        tenantId: input.tenantId,
        ...(input.actorUserId !== undefined ? { actorUserId: input.actorUserId } : {}),
        action: input.action,
        ...(input.resourceType !== undefined ? { resourceType: input.resourceType } : {}),
        ...(input.resourceId !== undefined ? { resourceId: input.resourceId } : {}),
        ...(input.detail !== undefined
          ? { detail: input.detail as Prisma.InputJsonValue }
          : {}),
      },
    });
  }
}
