// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { BadRequestException, Body, Controller, Get, Header, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { MutationOriginGuard } from "../auth/mutation-origin.guard.js";
import { ConversationQueryService } from "./conversation-query.service.js";

const limitOf = (raw: unknown): number => {
  if (raw === undefined) return 50;
  if (typeof raw !== "string" || !/^[1-9][0-9]*$/.test(raw) || Number(raw) > 100) throw new BadRequestException("INVALID_LIMIT");
  return Number(raw);
};
const cursorOf = (raw: unknown): string | null => {
  if (raw === undefined) return null;
  if (typeof raw !== "string" || !raw) throw new BadRequestException("INVALID_CURSOR");
  return raw;
};
@Controller("api/v2/conversations")
@UseGuards(TenantGuard)
export class ConversationV2Controller {
  constructor(private readonly queries: ConversationQueryService) {}

  @Get(":id")
  @Header("Cache-Control", "private, no-store")
  get(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.queries.get(req.principal.tenantId, id);
  }

  @Get()
  @Header("Cache-Control", "private, no-store")
  list(@Req() req: AuthenticatedRequest, @Query() query: Record<string, unknown>) {
    if (typeof query.workspaceId !== "string" || !query.workspaceId || (query.archived !== undefined && query.archived !== "true" && query.archived !== "false")) throw new BadRequestException("INVALID_QUERY");
    return this.queries.list(req.principal.tenantId, query.workspaceId, cursorOf(query.cursor), limitOf(query.limit), query.archived === "true");
  }

  @Get(":id/messages")
  @Header("Cache-Control", "private, no-store")
  messages(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Query() query: Record<string, unknown>) {
    return this.queries.messages(req.principal.tenantId, id, cursorOf(query.before), limitOf(query.limit));
  }

  @Post()
  @UseGuards(MutationOriginGuard)
  create(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    return this.queries.create(req.principal.tenantId, body);
  }

  @Patch(":id")
  @UseGuards(MutationOriginGuard)
  patch(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    return this.queries.patch(req.principal.tenantId, id, body);
  }
}
// end
