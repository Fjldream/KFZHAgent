// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { Controller, Get, Header, Req, UseGuards } from "@nestjs/common";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { resolveWorkbenchConfig } from "./feature-policy.js";

@Controller("api/v2/workbench-config")
@UseGuards(TenantGuard)
export class WorkbenchConfigController {
  @Get()
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie, Origin")
  get(@Req() request: AuthenticatedRequest) {
    return resolveWorkbenchConfig(request.principal.tenantId);
  }
}
// end
