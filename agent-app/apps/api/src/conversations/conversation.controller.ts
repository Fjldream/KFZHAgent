import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from "@nestjs/common";
import {
  ApprovalResumeRequiredError,
} from "@kf/agent-orchestrator";
import type { Response } from "express";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { ConversationService } from "./conversation.service.js";

/**
 * Conversation endpoints behind the tenant guard. thread_id is the
 * conversation id (brief contract). POST messages streams graph updates over
 * SSE; POST resume accepts approve/revise/cancel plus the exact planHash.
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

  /**
   * SSE message turn. Returns text/event-stream; graph state updates are
   * pushed as `state` events and the final snapshot as a `done` event. When
   * an approval is pending this rejects with 409 APPROVAL_RESUME_REQUIRED
   * (the stream has not started yet).
   *
   * If the client disconnects mid-stream, the graph run is cancelled (the
   * generator is `return()`ed) so no work continues after the socket closes.
   */
  @Post(":id/messages")
  @HttpCode(HttpStatus.OK)
  async sendMessage(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { content?: string },
    @Res() res: Response,
  ): Promise<void> {
    const events = await this.safeStartTurn(req, id, body.content ?? "");
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const iterator = events[Symbol.asyncIterator]();
    let disconnected = false;
    const onClose = (): void => {
      disconnected = true;
    };
    req.on("close", onClose);

    try {
      for (;;) {
        if (disconnected) {
          await iterator.return?.(undefined);
          break;
        }
        const next = await iterator.next();
        if (next.done) break;
        res.write(`event: ${next.value.event}\n`);
        res.write(`data: ${JSON.stringify(next.value.data ?? null)}\n\n`);
        flushIfSupported(res);
      }
    } catch (error) {
      res.write(
        `event: error\ndata: ${JSON.stringify({
          code: "GRAPH_ERROR",
          message: error instanceof Error ? error.message : String(error),
        })}\n\n`,
      );
    } finally {
      req.off("close", onClose);
      res.end();
    }
  }

  /**
   * Resumes a paused approval. Result is returned as normal API data; the
   * approval interrupt payload (planHash, summary, artifact ids) is returned
   * when a revise resume stops at a fresh interrupt.
   */
  @Post(":id/resume")
  @HttpCode(HttpStatus.OK)
  async resume(
    @Param("id") id: string,
    @Req() req: AuthenticatedRequest,
    @Body() body: { action?: string; planHash?: string },
  ): Promise<Record<string, unknown>> {
    return this.conversations.resume(req.principal, id, {
      ...(typeof body.action === "string" ? { action: body.action } : {}),
      ...(typeof body.planHash === "string" ? { planHash: body.planHash } : {}),
    });
  }

  private async safeStartTurn(
    req: AuthenticatedRequest,
    conversationId: string,
    content: string,
  ) {
    try {
      return await this.conversations.startTurn(req.principal, conversationId, content);
    } catch (error) {
      if (error instanceof ApprovalResumeRequiredError) {
        throw new ConflictException({
          error: {
            code: "APPROVAL_RESUME_REQUIRED",
            message: error.message,
          },
        });
      }
      throw error;
    }
  }
}

function flushIfSupported(res: Response): void {
  const candidate = res as unknown as { flush?: () => void };
  if (typeof candidate.flush === "function") {
    candidate.flush();
  }
}
