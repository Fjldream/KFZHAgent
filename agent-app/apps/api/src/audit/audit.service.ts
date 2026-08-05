import { Injectable } from "@nestjs/common";
import { Prisma, type AuditLog } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * Canonical audit event names (brief Step 7). Every meaningful security or
 * business action is recorded with tenantId + actor + resource so the full
 * history of a tenant can be reconstructed and reviewed by a platform admin.
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
 * Thin audit-log writer. tenantId always comes from the authenticated
 * principal or the resource itself, never from a request body.
 */
@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  record(input: AuditInput): Promise<AuditLog> {
    return this.prisma.auditLog.create({
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
