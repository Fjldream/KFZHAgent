import {
  Controller,
  Get,
  NotFoundException,
  Param,
  Req,
  UseGuards,
} from "@nestjs/common";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { PrismaService } from "../prisma/prisma.service.js";

/**
 * 计划详情查询（Task 12 确认 UX 所需）：前端展示「精确 create/update/delete
 * 操作」必须读取规范化计划，而 SSE done / resume 载荷只携带 planHash 与
 * 摘要。计划按 tenant 隔离，跨租户 id 一律 404。
 */
@Controller("api/change-plans")
@UseGuards(TenantGuard)
export class ChangePlanController {
  constructor(private readonly prisma: PrismaService) {}

  @Get(":id")
  async get(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ id: string; planHash: string; plan: unknown }> {
    const plan = await this.prisma.changePlan.findFirst({
      where: { id, tenantId: req.principal.tenantId },
    });
    if (plan === null) {
      throw new NotFoundException();
    }
    return { id: plan.id, planHash: plan.planHash, plan: plan.plan };
  }
}
