// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { BadRequestException, Body, Controller, Get, Header, Patch, Req, UseGuards } from "@nestjs/common";
import { VisualEgressPolicyPatchSchema } from "@kf/contracts";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { MutationOriginGuard } from "../auth/mutation-origin.guard.js";
import { RolesGuard } from "../auth/roles.guard.js";
import { Roles } from "../auth/roles.decorator.js";
import { VisualEgressPolicyService } from "./visual-egress-policy.service.js";

@Controller("api/v2/tenant/visual-egress-policy")
@UseGuards(TenantGuard, RolesGuard)
export class VisualEgressPolicyController {
  constructor(private readonly policies: VisualEgressPolicyService) {}
  @Get()
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie, Origin")
  get(@Req() req: AuthenticatedRequest) { return this.policies.get(req.principal.tenantId); }

  @Patch()
  @Roles("tenant_admin")
  @UseGuards(MutationOriginGuard)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie, Origin")
  update(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = VisualEgressPolicyPatchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("VISUAL_EGRESS_POLICY_INVALID");
    return this.policies.update(req.principal.tenantId, req.principal.userId, parsed.data.imageEgressAllowed);
  }
}
// end
