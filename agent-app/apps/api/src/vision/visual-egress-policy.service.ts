// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import type { VisualEgressPolicy } from "@kf/contracts";
import { PrismaService } from "../prisma/prisma.service.js";

const policy = (imageEgressAllowed: boolean): VisualEgressPolicy => ({ schemaVersion: 1, imageEgressAllowed, coverage: "reference-images-and-derived-structure" });

@Injectable()
export class VisualEgressPolicyService {
  constructor(private readonly prisma: PrismaService) {}
  async get(tenantId: string): Promise<VisualEgressPolicy> {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { imageEgressAllowed: true } });
    if (!tenant) throw new NotFoundException("tenant");
    return policy(tenant.imageEgressAllowed);
  }
  async update(tenantId: string, actorUserId: string, allowed: boolean): Promise<VisualEgressPolicy> {
    return this.prisma.$transaction(async tx => {
      const [tenant] = await tx.$queryRaw<{ imageEgressAllowed: boolean }[]>`SELECT "imageEgressAllowed" FROM "Tenant" WHERE "id"=${tenantId} FOR UPDATE`;
      if (!tenant) throw new NotFoundException("tenant");
      const actor = await tx.user.findFirst({ where: { id: actorUserId, tenantId, role: "tenant_admin" }, select: { id: true } });
      if (!actor) throw new ForbiddenException("VISUAL_EGRESS_ADMIN_REQUIRED");
      if (tenant.imageEgressAllowed !== allowed) {
        await tx.tenant.update({ where: { id: tenantId }, data: { imageEgressAllowed: allowed } });
        await tx.auditLog.create({ data: { tenantId, actorUserId, action: "VISUAL_EGRESS_POLICY_CHANGED", resourceType: "TENANT", resourceId: tenantId,
          detail: { previousAllowed: tenant.imageEgressAllowed, imageEgressAllowed: allowed, coverage: "reference-images-and-derived-structure" } } });
      }
      return policy(allowed);
    });
  }
}
// end
