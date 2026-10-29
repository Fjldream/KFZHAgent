// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { BadRequestException, Body, Controller, NotFoundException, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { MutationOriginGuard } from "../auth/mutation-origin.guard.js";
import { RunControlService } from "./run-control.service.js";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { RunEventStreamService } from "./run-event-stream.service.js";
// RunService 必须值导入：`import type` 会擦除运行时引用，Nest 解析不到 provider token
import { RunService, type StartRunBody } from "./run.service.js";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import { Header } from "@nestjs/common";
// end

const principalOf = (req: AuthenticatedRequest): { tenantId: string; userId: string } => {
  const principal = req.principal as { tenantId?: string; userId?: string };
  return { tenantId: principal.tenantId ?? "", userId: principal.userId ?? "" };
};

const intParam = (raw: string | undefined, fallback: number, name: string): number => {
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 0) throw new BadRequestException(`INVALID_${name}`);
  return value;
};

/**
 * run 端点。
 *
 * 事件流按 seq 从数据库循环读取，不依赖内存通知——断线重连时带 `after` 即可补齐；
 * 每次连接最多占用 STREAM_WINDOW_MS，客户端随后重连，避免长连接堆积。
 */
@Controller("api")
@UseGuards(TenantGuard)
export class RunController {
  constructor(
    private readonly runs: RunService,
    private readonly eventStreams: RunEventStreamService,
    private readonly control?: RunControlService,
  ) {}

  @Post("conversations/:conversationId/runs")
  // 写请求：cookie 鉴权必须叠加 Origin 校验，不能只靠 CORS。
  @UseGuards(MutationOriginGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async start(
    @Req() req: AuthenticatedRequest,
    @Param("conversationId") conversationId: string,
    @Body() body: StartRunBody,
  ) {
    return this.runs.start(principalOf(req), conversationId, body);
  }

  @Get("runs/:runId")
  async snapshot(@Req() req: AuthenticatedRequest, @Param("runId") runId: string) {
    return this.runs.snapshot(principalOf(req), runId);
  }
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  @Get("runs/:runId/visual-review")
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  async visualReview(@Req() req: AuthenticatedRequest, @Param("runId") runId: string) {
    return this.runs.visualReview(principalOf(req), runId);
  }
  @Post("runs/:runId/visual-review/revisions")
  @UseGuards(MutationOriginGuard)
  @HttpCode(HttpStatus.OK)
  @Header("Cache-Control", "private, no-store")
  @Header("Vary", "Cookie")
  async reviseVisualReview(@Req() req: AuthenticatedRequest, @Param("runId") runId: string, @Body() body: unknown) {
    return this.runs.reviseVisualReview(principalOf(req), runId, body);
  }
  // end

  @Post("runs/:runId/cancel")
  @UseGuards(MutationOriginGuard)
  @HttpCode(HttpStatus.OK)
  async cancel(@Req() req: AuthenticatedRequest, @Param("runId") runId: string) {
    if (!this.control) throw new Error("RUN_CONTROL_NOT_CONFIGURED");
    return this.control.cancel(req.principal.tenantId, runId, req.principal.userId);
  }

  @Post("runs/:runId/retry")
  @UseGuards(MutationOriginGuard)
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(@Req() req: AuthenticatedRequest, @Param("runId") runId: string, @Body() body: { clientRequestId?: unknown }) {
    if (!this.control) throw new Error("RUN_CONTROL_NOT_CONFIGURED");
    return this.control.retry(req.principal.tenantId, runId, req.principal.userId, body?.clientRequestId);
  }

  @Get("conversations/:conversationId/runs/latest")
  async latest(@Req() req: AuthenticatedRequest, @Param("conversationId") conversationId: string) {
    return this.runs.latest(principalOf(req), conversationId);
  }

  // modified by jinlong.feng at 2026-10-20 Agent工作台迭代
  @Get("runs/:runId/usage")
  async usage(@Req() req: AuthenticatedRequest, @Param("runId") runId: string) {
    const found = await this.runs.usage(principalOf(req), runId);
    if (found === null) throw new NotFoundException("RUN_NOT_FOUND");
    return found;
  }

  @Get("runs/:runId/events")
  async events(
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
    @Param("runId") runId: string,
    @Query("after") afterRaw?: string,
    @Query("limit") limitRaw?: string,
  ): Promise<void> {
    const after = intParam(afterRaw, 0, "CURSOR");
    const limit = intParam(limitRaw, 100, "LIMIT");
    return this.eventStreams.stream(req, res, runId, after, limit);
  }
}
// end
