// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { BadRequestException, Body, Controller, NotFoundException, Get, HttpCode, HttpStatus, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Response } from "express";
import { MutationOriginGuard } from "../auth/mutation-origin.guard.js";
import { TenantGuard, type AuthenticatedRequest } from "../auth/tenant.guard.js";
import { isTerminal } from "./run-state.js";
import { PrismaRunQueries, serializeRunEvent } from "./run-query.service.js";
// RunService 必须值导入：`import type` 会擦除运行时引用，Nest 解析不到 provider token
import { RunService, type StartRunBody } from "./run.service.js";

const STREAM_WINDOW_MS = 30_000;
const HEARTBEAT_MS = 15_000;
const POLL_MS = 1_000;

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
    private readonly queries: PrismaRunQueries,
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
    const principal = principalOf(req);
    const after = intParam(afterRaw, 0, "CURSOR");
    const limit = intParam(limitRaw, 100, "LIMIT");

    // 先取一页：游标非法/跨租户在这里就以 400/404 结束，不会写出半个 SSE 流。
    let cursor = after;
    try {
      const first = await this.runs.events(principal, runId, cursor, limit);
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      for (const event of first) {
        res.write(serializeRunEvent(event));
        cursor = event.seq;
      }
    } catch (error) {
      const status = error instanceof BadRequestException ? 404 : 500;
      res.status(status).json({ message: error instanceof Error ? error.message : "RUN_EVENTS_FAILED" });
      return;
    }

    const startedAt = Date.now();
    let lastWriteAt = Date.now();
    while (!res.writableEnded && Date.now() - startedAt < STREAM_WINDOW_MS) {
      const snapshot = await this.queries.snapshot(principal.tenantId, runId).catch(() => null);
      if (snapshot === null) break;
      if (cursor >= snapshot.lastSeq && isTerminal(snapshot.status)) break;

      const batch = await this.runs.events(principal, runId, cursor, limit).catch(() => []);
      for (const event of batch) {
        res.write(serializeRunEvent(event));
        cursor = event.seq;
        lastWriteAt = Date.now();
      }

      if (Date.now() - lastWriteAt >= HEARTBEAT_MS) {
        res.write(": keep-alive\n\n");
        lastWriteAt = Date.now();
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_MS));
    }
    res.end();
  }
}
// end
