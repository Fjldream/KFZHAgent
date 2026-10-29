// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { ConversationService } from "./conversation.service.js";

/**
 * 保留会话创建、历史与交付查询；所有生成和审批只通过持久化 Run API。
 */
@Controller("api/conversations")
@UseGuards(TenantGuard)
export class ConversationController {
  constructor(private readonly conversations: ConversationService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() body: { workspaceId?: string; title?: string },
  ): Promise<Record<string, unknown>> {
    return this.conversations.create(
      req.principal.tenantId,
      typeof body.workspaceId === "string" ? body.workspaceId : "",
      body.title,
    );
  }

  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query("workspaceId") workspaceId?: string,
  ): Promise<Record<string, unknown>[]> {
    if (typeof workspaceId !== "string" || workspaceId.length === 0) {
      throw new BadRequestException("workspaceId query parameter is required");
    }
    return this.conversations.listByWorkspace(req.principal.tenantId, workspaceId);
  }

  @Get(":id")
  async get(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Record<string, unknown>> {
    try {
      return await this.conversations.get(req.principal.tenantId, id);
    } catch {
      throw new NotFoundException();
    }
  }

  @Get(":id/messages")
  async listMessages(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
  ): Promise<Record<string, unknown>[]> {
    try {
      return await this.conversations.listMessages(req.principal.tenantId, id);
    } catch {
      throw new NotFoundException();
    }
  }

  @Get(":id/delivery")
  async getDelivery(
    @Param("id") id: string,
    @Query("buildJobId") buildJobId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<import("../delivery/delivery-snapshot.service.js").PersistedDeliverySnapshot | null> {
    return this.conversations.getDelivery(req.principal.tenantId, id, buildJobId);
  }

}
// end
