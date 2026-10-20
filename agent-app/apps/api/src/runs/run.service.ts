// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { RunActionSchema, type RunAction, type RunSnapshot } from "@kf/contracts";
import { PrismaRunQueries, RUN_NOT_FOUND, RUN_EVENT_CURSOR_INVALID, RUN_EVENT_LIMIT_INVALID } from "./run-query.service.js";
import type { RunStore } from "./run-store.js";

export type RunPrincipal = { tenantId: string; userId: string };

export type StartRunBody = {
  clientRequestId?: string;
  clientMessageId?: string;
  mode?: string;
  action?: unknown;
  attachmentIds?: string[];
  expectedBaseRevisionId?: string;
};

/**
 * run 的 HTTP 门面：只做入参校验与错误映射，业务规则都在 RunStore / RunQueries 里。
 * 校验失败一律 400（而不是 500），跨租户查询映射成 404，避免泄露存在性。
 */
@Injectable()
export class RunService {
  constructor(
    private readonly store: RunStore,
    private readonly queries: PrismaRunQueries,
  ) {}

  async start(principal: RunPrincipal, conversationId: string, body: StartRunBody): Promise<RunSnapshot> {
    const action = RunActionSchema.safeParse(body.action);
    if (!action.success) throw new BadRequestException("INVALID_RUN_ACTION");

    const mode = body.mode ?? "build";
    if (mode !== "discuss" && mode !== "plan" && mode !== "build") {
      throw new BadRequestException("INVALID_RUN_MODE");
    }
    if (typeof body.clientRequestId !== "string" || body.clientRequestId.length === 0) {
      throw new BadRequestException("MISSING_CLIENT_REQUEST_ID");
    }
    if (typeof body.clientMessageId !== "string" || body.clientMessageId.length === 0) {
      throw new BadRequestException("MISSING_CLIENT_MESSAGE_ID");
    }

    return this.store.create({
      tenantId: principal.tenantId,
      userId: principal.userId,
      conversationId,
      clientRequestId: body.clientRequestId.slice(0, 200),
      clientMessageId: body.clientMessageId.slice(0, 200),
      mode,
      action: action.data as RunAction,
      attachmentIds: body.attachmentIds ?? [],
      ...(body.expectedBaseRevisionId === undefined
        ? {}
        : { expectedBaseRevisionId: body.expectedBaseRevisionId }),
    });
  }

  async snapshot(principal: RunPrincipal, runId: string): Promise<RunSnapshot> {
    try {
      return await this.queries.snapshot(principal.tenantId, runId);
    } catch (error) {
      if (error instanceof Error && error.message === RUN_NOT_FOUND) throw new NotFoundException("RUN_NOT_FOUND");
      throw error;
    }
  }

  // modified by jinlong.feng at 2026-10-20 Agent工作台迭代
  /** 预算用量；跨租户/不存在返回 null 由控制器映射 404。 */
  async usage(principal: RunPrincipal, runId: string) {
    return this.queries.usageFor(principal.tenantId, runId);
  }

  async events(principal: RunPrincipal, runId: string, after: number, limit: number) {
    try {
      return await this.queries.eventsAfter(principal.tenantId, runId, after, limit);
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (message === RUN_EVENT_CURSOR_INVALID) throw new BadRequestException("INVALID_CURSOR");
      if (message === RUN_EVENT_LIMIT_INVALID) throw new BadRequestException("INVALID_LIMIT");
      throw error;
    }
  }
}
// end
