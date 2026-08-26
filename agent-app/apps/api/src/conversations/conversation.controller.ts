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
import type { DisposableSseStream } from "./conversation.service.js";
import { ConversationTurnBusyError } from "./conversation-turn-lease.js";

const CLIENT_DISCONNECTED = Symbol("CLIENT_DISCONNECTED");

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

  @Get(":id/delivery")
  async getDelivery(
    @Param("id") id: string,
    @Query("buildJobId") buildJobId: string | undefined,
    @Req() req: AuthenticatedRequest,
  ): Promise<import("../delivery/delivery-snapshot.service.js").PersistedDeliverySnapshot | null> {
    return this.conversations.getDelivery(req.principal.tenantId, id, buildJobId);
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
    let events: DisposableSseStream | undefined;
    let disconnected = false;
    let sseStarted = false;
    let signalDisconnected!: () => void;
    const disconnectedSignal = new Promise<typeof CLIENT_DISCONNECTED>((resolve) => {
      signalDisconnected = () => resolve(CLIENT_DISCONNECTED);
    });
    const onClose = (): void => {
      disconnected = true;
      signalDisconnected();
      void events?.dispose().catch(() => {});
    };
    res.on("close", onClose);

    try {
      events = await this.safeStartTurn(req, id, body.content ?? "");
      if (disconnected) return;
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      sseStarted = true;
      res.flushHeaders();

      for (;;) {
        if (disconnected) break;
        const pendingNext = events.next();
        const next = await Promise.race([pendingNext, disconnectedSignal]);
        if (next === CLIENT_DISCONNECTED) {
          void pendingNext.catch(() => {});
          break;
        }
        if (next.done) break;
        safeWrite(res, `event: ${next.value.event}\n`);
        safeWrite(res, `data: ${JSON.stringify(next.value.data ?? null)}\n\n`);
        flushIfSupported(res);
      }
    } catch (error) {
      if (!sseStarted) throw error;
      try {
        safeWrite(res, `event: error\ndata: ${JSON.stringify({
          code: "CONVERSATION_FAILED",
          message: "对话处理失败，请重试",
        })}\n\n`);
      } catch { /* the socket is already unusable */ }
    } finally {
      await events?.dispose().catch(() => {});
      res.off("close", onClose);
      if (sseStarted && !res.writableEnded) {
        try { res.end(); } catch { /* the socket is already unusable */ }
      }
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
    try {
      return await this.conversations.resume(req.principal, id, {
        ...(typeof body.action === "string" ? { action: body.action } : {}),
        ...(typeof body.planHash === "string" ? { planHash: body.planHash } : {}),
      });
    } catch (error) {
      this.rethrowTurnContention(error);
    }
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
      this.rethrowTurnContention(error);
    }
  }

  private rethrowTurnContention(error: unknown): never {
    if (error instanceof ConversationTurnBusyError) {
      throw new ConflictException({
        error: {
          code: "CONVERSATION_TURN_IN_PROGRESS",
          message: "当前对话已有工程生成任务处理中，请稍后重试。",
        },
      });
    }
    throw error;
  }
}

function safeWrite(res: Response, value: string): void {
  res.write(value);
}

function flushIfSupported(res: Response): void {
  const candidate = res as unknown as { flush?: () => void };
  if (typeof candidate.flush === "function") {
    candidate.flush();
  }
}
