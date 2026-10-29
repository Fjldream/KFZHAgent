// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
// 仅供历史图回归的内存 HTTP 夹具；生产 AppModule 绝不注册本 controller。
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
import { TenantGuard, type AuthenticatedRequest } from "../src/auth/tenant.guard.js";
import { LegacyConversationDriver } from "./legacy-conversation-driver.js";
import type { DisposableSseStream } from "./legacy-conversation-driver.js";
import { ConversationTurnBusyError } from "../src/conversations/conversation-turn-lease.js";

const CLIENT_DISCONNECTED = Symbol("CLIENT_DISCONNECTED");

/**
 * 租户防护后的会话端点。thread_id 是会话的会话标识符（简短合同）。POST 消息流过 SSE 进行图更新；POST 暂停接受批准的批准确认以及/revise/cancel 和planHash。
 */
@Controller("api/conversations")
@UseGuards(TenantGuard)
export class LegacyConversationController {
  constructor(private readonly conversations: LegacyConversationDriver) {}

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
  ): Promise<import("../src/delivery/delivery-snapshot.service.js").PersistedDeliverySnapshot | null> {
    return this.conversations.getDelivery(req.principal.tenantId, id, buildJobId);
  }

  /**
 * SSE 消息转码。返回 text/event-stream; 图表状态更新以 `state` 事件推送，并且最终的快照以 `done` 事件推送。当有审批在等待时，这将拒绝返回 409 APPROVAL_RESUME_REQUIRED（流尚未开始）。
 *
 * 如果客户端在流中断开连接，图表运行将被取消（生成器被 `return()` 了），因此在连接关闭后不会继续进行工作。
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

// end
