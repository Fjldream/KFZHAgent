// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { Controller, Get, Header, Param, Req, UseGuards } from "@nestjs/common";
// end
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { VisualAnalysisService } from "./visual-analysis.service.js";

@Controller("api/v2/visual-analyses")
@UseGuards(TenantGuard)
export class VisualAnalysisController {
  constructor(private readonly analyses: VisualAnalysisService) {}
  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  get(@Param("id") id: string, @Req() req: AuthenticatedRequest) { return this.analyses.get(req.principal.tenantId, id); }

  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  // Mutations go through the Run-scoped signed review transaction, never an analysis-only PATCH.
  // end
}
// end
