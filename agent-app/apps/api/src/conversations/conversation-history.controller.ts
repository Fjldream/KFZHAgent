// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { Body, Controller, Get, Header, Param, Post, Req, UseGuards } from "@nestjs/common";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { MutationOriginGuard } from "../auth/mutation-origin.guard.js";
import { ConversationHistoryService } from "./conversation-history.service.js";

@Controller("api/v2/workspaces")
@UseGuards(TenantGuard)
export class RevisionHistoryController {
  constructor(private readonly history: ConversationHistoryService) {}
  @Get(":workspaceId/revisions/:revisionId")
  @Header("Cache-Control", "private, no-store")
  get(@Req() req: AuthenticatedRequest, @Param("workspaceId") workspaceId: string, @Param("revisionId") revisionId: string) {
    return this.history.revision(req.principal.tenantId, workspaceId, revisionId);
  }
}

@Controller("api/v2/conversations")
@UseGuards(TenantGuard)
export class ConversationForkController {
  constructor(private readonly history: ConversationHistoryService) {}
  @Post(":id/forks")
  @UseGuards(MutationOriginGuard)
  @Header("Cache-Control", "private, no-store")
  fork(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.history.fork(req.principal.tenantId, req.principal.userId, id, body);
  }
}
// end
