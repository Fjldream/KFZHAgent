// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { InvocationRecorder } from "./model-invocation.service.js";
import {
  MODEL_CANCELLED,
  MODEL_TIMEOUT,
  ModelTransportError,
  requestDeepSeekJson,
  type JsonModelRequest,
  type JsonModelResult,
} from "./deepseek-transport.js";
import { normalizeUsage } from "./normalize-usage.js";

/** 模型网关：新入口唯一允许的物理请求出口，负责作用域记账与失败分类。 */
export interface ModelGateway {
  completeJson(request: JsonModelRequest): Promise<JsonModelResult>;
}

/**
 * 记账先于外发：`recorder.start` 失败（预算拒绝、账本不可写）时直接抛出，
 * 绝不产生物理请求，避免「花了钱但没有账」。
 *
 * 失败收尾：超时记为 UNKNOWN（provider 侧结果未知，不能当免费），
 * 取消记 CANCELLED，其余记 FAILED；收尾本身失败不会覆盖原始错误。
 */
export class ModelGatewayService implements ModelGateway {
  constructor(
    private readonly recorder: InvocationRecorder,
    private readonly fetchImpl: typeof fetch,
    private readonly apiKey: string,
  ) {}

  async completeJson(request: JsonModelRequest): Promise<JsonModelResult> {
    const startedAt = Date.now();
    const invocationId = await this.recorder.start(request.scope);

    try {
      const result = await requestDeepSeekJson(request, this.fetchImpl, this.apiKey);
      await this.recorder.finish(invocationId, request.scope.tenantId, {
        status: "SUCCEEDED",
        usage: result.usage,
        actualModel: result.actualModel,
        latencyMs: Date.now() - startedAt,
        providerRequestId: result.providerRequestId,
        failureCode: null,
      });
      return result;
    } catch (error) {
      const code = error instanceof ModelTransportError ? error.code : "MODEL_UNKNOWN_ERROR";
      const status = code === MODEL_CANCELLED ? "CANCELLED" : code === MODEL_TIMEOUT ? "UNKNOWN" : "FAILED";
      await this.recorder.finish(invocationId, request.scope.tenantId, {
        status,
        usage: normalizeUsage(undefined),
        actualModel: null,
        latencyMs: Date.now() - startedAt,
        providerRequestId: null,
        failureCode: code,
      }).catch(() => undefined);
      throw error;
    }
  }
}
// end
