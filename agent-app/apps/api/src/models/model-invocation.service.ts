// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { ModelTask, NormalizedUsage } from "@kf/contracts";
import { Injectable } from "@nestjs/common";
import type { PrismaClient } from "@prisma/client";
import { estimateCostMicros, type PriceRates } from "./pricing.js";

/** 一次调用开始记账时的不可变输入（scope + 提示词版本）。 */
export type InvocationStart = {
  tenantId: string;
  workspaceId: string;
  conversationId: string | null;
  runId: string | null;
  task: ModelTask;
  provider: string;
  requestedModel: string;
  promptVersion: string;
  schemaVersion: string;
  prefixHash: string;
  inputHash: string;
  attempt: number;
};

export type InvocationStatus = "SUCCEEDED" | "FAILED" | "CANCELLED" | "UNKNOWN";

export type InvocationFinish = {
  status: InvocationStatus;
  usage: NormalizedUsage;
  actualModel: string | null;
  latencyMs: number;
  providerRequestId: string | null;
  failureCode: string | null;
};

export interface InvocationRecorder {
  start(input: InvocationStart): Promise<string>;
  finish(id: string, tenantId: string, result: InvocationFinish): Promise<void>;
}

/** 找不到调用记录（含跨租户访问，故意不区分，避免泄露存在性）。 */
export const INVOCATION_NOT_FOUND = "INVOCATION_NOT_FOUND";
/** 同一调用已以不同终态收尾，属于编程错误，不静默覆盖。 */
export const INVOCATION_STATE_CONFLICT = "INVOCATION_STATE_CONFLICT";

/**
 * 模型调用账本。写入只发生在服务端：start 落 RUNNING，finish 用
 * (tenantId,id,status=RUNNING) 做 CAS 收尾，因此并发/重复上报不会重复累计。
 *
 * 费用只在 SUCCEEDED 且 usage 完整、价格表可信时计算；其余情况
 * costMicros 保持 null 并保留 usageSource，让上层展示「未知」而不是 0。
 */
@Injectable()
export class ModelInvocationService implements InvocationRecorder {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly priceRates: PriceRates | null = null,
  ) {}

  async start(input: InvocationStart): Promise<string> {
    const record = await this.prisma.modelInvocation.create({
      data: {
        tenantId: input.tenantId,
        workspaceId: input.workspaceId,
        conversationId: input.conversationId,
        runId: input.runId,
        task: input.task,
        provider: input.provider,
        requestedModel: input.requestedModel,
        promptVersion: input.promptVersion,
        schemaVersion: input.schemaVersion,
        prefixHash: input.prefixHash,
        inputHash: input.inputHash,
        status: "RUNNING",
        attempt: input.attempt,
      },
      select: { id: true },
    });
    return record.id;
  }

  async finish(id: string, tenantId: string, result: InvocationFinish): Promise<void> {
    const costMicros = result.status === "SUCCEEDED"
      ? estimateCostMicros(result.usage, this.priceRates)
      : null;
    const priced = costMicros !== null && this.priceRates !== null;

    const updated = await this.prisma.modelInvocation.updateMany({
      where: { id, tenantId, status: "RUNNING" },
      data: {
        status: result.status,
        actualModel: result.actualModel,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        cacheHitTokens: result.usage.cacheHitTokens,
        cacheMissTokens: result.usage.cacheMissTokens,
        reasoningTokens: result.usage.reasoningTokens,
        usageSource: result.usage.source,
        costMicros,
        currency: priced ? this.priceRates!.currency : null,
        pricingVersion: priced ? this.priceRates!.version : null,
        latencyMs: result.latencyMs,
        providerRequestId: result.providerRequestId,
        failureCode: result.failureCode,
        finishedAt: new Date(),
      },
    });
    if (updated.count === 1) return;

    const existing = await this.prisma.modelInvocation.findFirst({ where: { id, tenantId } });
    if (existing === null) throw new Error(INVOCATION_NOT_FOUND);
    // 同一终态重复上报视为幂等；不同终态说明调用方状态机出错，不覆盖既有事实。
    if (existing.status === result.status) return;
    throw new Error(INVOCATION_STATE_CONFLICT);
  }
}
// end
