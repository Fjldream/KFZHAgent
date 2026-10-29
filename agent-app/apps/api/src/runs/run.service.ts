// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
// end
import { RunActionSchema, type RunSnapshot } from "@kf/contracts";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { VisualRunOptionsSchema, VisualRunAdmissionRequestSchema, VisualReviewAcceptanceSchema } from "@kf/contracts";
// end
import { PrismaRunQueries, RUN_NOT_FOUND, RUN_EVENT_CURSOR_INVALID, RUN_EVENT_LIMIT_INVALID } from "./run-query.service.js";
import type { RunStore } from "./run-store.js";
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
import type { VisualReviewService } from "../vision/visual-review.service.js";
import { VisualReviewRevisionSchema } from "@kf/contracts";
import { resolveWorkbenchConfig, type WorkbenchConfig } from "./feature-policy.js";
// end

export type RunPrincipal = { tenantId: string; userId: string };

export type StartRunBody = {
  clientRequestId?: string;
  clientMessageId?: string;
  mode?: string;
  action?: unknown;
  attachmentIds?: string[];
  // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
  visualReference?: unknown;
  // end
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
    // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
    private readonly visualReviews?: Pick<VisualReviewService, "getWaitingReviewDisplay" | "reviseWaitingReview">,
    private readonly visualConfigForTenant: (tenantId: string) => WorkbenchConfig = resolveWorkbenchConfig,
    // end
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
    if (body.clientRequestId.length > 200 || body.clientMessageId.length > 200) throw new BadRequestException("RUN_ID_TOO_LONG");
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    if (action.data.type === "revise_regions") throw new BadRequestException("FEATURE_NOT_ENABLED");
    if (action.data.type === "accept_visual_reference") {
      const acceptance: Record<string, unknown> = { ...action.data }; delete acceptance.type;
      if (!VisualReviewAcceptanceSchema.safeParse(acceptance).success) throw new BadRequestException("VISUAL_ACCEPTANCE_INVALID");
    }
    // end
    if (action.data.type !== "message" && mode !== "build") throw new BadRequestException("ACTION_REQUIRES_BUILD_MODE");
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    if (body.attachmentIds !== undefined && !Array.isArray(body.attachmentIds)) throw new BadRequestException("INVALID_VISUAL_REFERENCE");
    let visualReference;
    if ((body.attachmentIds?.length ?? 0) > 0 || body.visualReference !== undefined) {
      const options = VisualRunOptionsSchema.safeParse(body.visualReference);
      if (!options.success || !VisualRunAdmissionRequestSchema.safeParse({ ...options.data, attachmentIds: body.attachmentIds }).success
        || action.data.type !== "message") throw new BadRequestException("INVALID_VISUAL_REFERENCE");
      visualReference = options.data;
    }
    // end
    if (body.expectedBaseRevisionId !== undefined && (typeof body.expectedBaseRevisionId !== "string" || !body.expectedBaseRevisionId)) throw new BadRequestException("INVALID_BASE_REVISION");

    try { return await this.store.create({
      tenantId: principal.tenantId,
      userId: principal.userId,
      conversationId,
      clientRequestId: body.clientRequestId.slice(0, 200),
      clientMessageId: body.clientMessageId.slice(0, 200),
      mode,
      action: action.data,
      attachmentIds: body.attachmentIds ?? [],
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      ...(visualReference === undefined ? {} : { visualReference }),
      // end
      ...(body.expectedBaseRevisionId === undefined
        ? {}
        : { expectedBaseRevisionId: body.expectedBaseRevisionId }),
    }); } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "RUN_CONVERSATION_NOT_FOUND") throw new NotFoundException(code);
      // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
      if (code === "FEATURE_NOT_ENABLED") throw new ForbiddenException({ error: { code, message: "当前租户未开放新的运行，请联系管理员；历史查询和停止仍可使用。" } });
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      if (["VISUAL_FLOW_NOT_CONFIGURED", "VISUAL_CONTINUATION_ACTOR_MISMATCH", "IMAGE_EGRESS_NOT_ALLOWED"].includes(code)) throw new ForbiddenException(code);
      if (["VISUAL_REVIEW_NOT_FOUND", "VISUAL_ANALYSIS_NOT_FOUND"].includes(code)) throw new NotFoundException("VISUAL_REVIEW_NOT_FOUND");
      if (code === "VISUAL_ACCEPTANCE_INVALID") throw new BadRequestException(code);
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      if (code === "VISUAL_ENGINEERING_INPUT_INVALID") throw new BadRequestException(code);
      if (code === "VISUAL_SEMANTIC_CONFIG_INVALID") throw new ForbiddenException("VISUAL_FLOW_NOT_CONFIGURED");
      if (["VISUAL_BLUEPRINT_NOT_WAITING", "VISUAL_ENGINEERING_NOT_QUEUED", "VISUAL_ENGINEERING_IDENTITY_MISMATCH",
        "VISUAL_BLUEPRINT_REVIEW_INTEGRITY_FAILED", "VISUAL_BLUEPRINT_MESSAGE_MISMATCH", "VISUAL_ENGINEERING_INTEGRITY_FAILED",
        "VISUAL_CONTINUATION_INTEGRITY_FAILED", "VISUAL_CONTINUATION_SOURCE_MISMATCH"].includes(code)) throw new ConflictException(code);
      // end
      if (["VISUAL_REVIEW_RECEIPT_MISMATCH", "VISUAL_ANALYSIS_STALE", "VISUAL_SUBSTITUTION_REQUIRES_REVIEW", "VISUAL_REVIEW_NOT_WAITING",
        "VISUAL_CONTINUATION_CONFLICT", "VISUAL_CONTINUATION_IDENTITY_MISMATCH", "VISUAL_CONTINUATION_INPUT_REQUIRED",
        "VISUAL_REVIEW_INTEGRITY_FAILED", "VISUAL_REVIEW_ADMISSION_MISMATCH", "VISUAL_ANALYSIS_INTEGRITY_FAILED",
        "VISUAL_DIFFERENCE_DUPLICATE", "UNKNOWN_VISUAL_REGION", "VISUAL_ACKNOWLEDGEMENT_REQUIRED", "VISUAL_DIFFERENCE_REQUIRED",
        "VISUAL_CAPABILITY_MISMATCH", "VISUAL_CAPABILITY_UNSUPPORTED"].includes(code)) throw new ConflictException(code);
      // end
      // end
      // modified by jinlong.feng at 2026-10-21 Agent工作台迭代
      // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
      if (["RUN_QUEUE_FULL", "RUN_CANCEL_PENDING", "VISUAL_REVIEW_ACTION_REQUIRED", "VISUAL_MULTIPLE_REFERENCES_NOT_ENABLED"].includes(code)) throw new ConflictException(code);
      // end
      // end
// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
      if (code === "CONVERSATION_ARCHIVED") throw new ConflictException(code);
      // end
      if (["IDEMPOTENCY_CONFLICT", "RUN_IN_PROGRESS", "RUN_ACTION_STALE", "BLUEPRINT_RECEIPT_MISMATCH", "PLAN_HASH_MISMATCH", "APPROVAL_RESUME_REQUIRED", "STALE_BASE_REVISION"].includes(code)) throw new ConflictException(code);
      throw error;
    }
  }

  async snapshot(principal: RunPrincipal, runId: string): Promise<RunSnapshot> {
    try {
      return await this.queries.snapshot(principal.tenantId, runId);
    } catch (error) {
      if (error instanceof Error && error.message === RUN_NOT_FOUND) throw new NotFoundException("RUN_NOT_FOUND");
      throw error;
    }
  }
  // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
  async visualReview(principal: RunPrincipal, runId: string) {
    // Scope before runtime detection: a foreign/nonexistent Run must always look absent.
    const run = await this.snapshot(principal, runId);
    if (!this.visualReviews) throw new ForbiddenException("VISUAL_FLOW_NOT_CONFIGURED");
    try {
      return await this.visualReviews.getWaitingReviewDisplay({ ...principal, workspaceId: run.workspaceId,
        conversationId: run.conversationId }, runId);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "VISUAL_REVIEW_NOT_FOUND") throw new NotFoundException("RUN_NOT_FOUND");
      if (code === "VISUAL_CONTINUATION_ACTOR_MISMATCH") throw new ForbiddenException(code);
      if (code.startsWith("VISUAL_") || code === "STALE_BASE_REVISION" || code === "IMAGE_EGRESS_NOT_ALLOWED") {
        throw new ConflictException("VISUAL_REVIEW_UNAVAILABLE");
      }
      throw error;
    }
  }
  async reviseVisualReview(principal: RunPrincipal, runId: string, body: unknown) {
    const run = await this.snapshot(principal, runId);
    const parsed = VisualReviewRevisionSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException("VISUAL_REVIEW_REVISION_INVALID");
    const config = this.visualConfigForTenant(principal.tenantId);
    if (!config.flags.agentRunsV2 || !config.flags.agentWorkbenchV2 || !config.flags.agentVisionV1
      || config.imagePolicy !== "explicit-consent" || !config.outboundImagesAllowed) throw new ForbiddenException("FEATURE_NOT_ENABLED");
    if (!this.visualReviews) throw new ForbiddenException("VISUAL_FLOW_NOT_CONFIGURED");
    try {
      return await this.visualReviews.reviseWaitingReview({ ...principal, workspaceId: run.workspaceId, conversationId: run.conversationId }, runId, parsed.data);
    } catch (error) {
      const code = error instanceof Error ? error.message : "";
      if (code === "VISUAL_REVIEW_NOT_FOUND") throw new NotFoundException("RUN_NOT_FOUND");
      if (["VISUAL_CONTINUATION_ACTOR_MISMATCH", "IMAGE_EGRESS_NOT_ALLOWED"].includes(code)) throw new ForbiddenException(code);
      // modified by jinlong.feng at 2026-10-23 Agent工作台迭代
      if (["VISUAL_REVIEW_REVISION_INVALID", "VISUAL_REVIEW_REGION_UNKNOWN", "VISUAL_REVIEW_REGION_HAS_CHILDREN", "VISUAL_REVIEW_NO_CHANGES"].includes(code)) throw new BadRequestException(code);
      // end
      if (code.startsWith("VISUAL_") || code === "STALE_BASE_REVISION") throw new ConflictException("VISUAL_REVIEW_REVISION_STALE");
      throw error;
    }
  }
  // end

  async latest(principal: RunPrincipal, conversationId: string) {
    try { return await this.queries.latest(principal.tenantId, conversationId); }
    catch (error) {
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
      if (message === RUN_NOT_FOUND) throw new NotFoundException("RUN_NOT_FOUND");
      throw error;
    }
  }
}
// end
