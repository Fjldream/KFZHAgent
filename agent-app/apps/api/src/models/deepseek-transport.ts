// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { ModelRoute, NormalizedUsage, ProviderUsage } from "@kf/contracts";
import type { InvocationStart } from "./model-invocation.service.js";
import { normalizeUsage } from "./normalize-usage.js";

export type ModelContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string; detail: "low" | "high" } };

export type ModelMessage = {
  role: "system" | "user" | "assistant";
  content: string | ModelContentPart[];
};

/**
 * 一次物理请求的最小输入。老入口（DeepSeekModelPort.chatJson）只传这些字段，
 * 不需要伪造 tenant/run 作用域。
 */
export type JsonModelCall = {
  route: ModelRoute;
  messages: ModelMessage[];
  maxOutputTokens: number;
  thinking: boolean;
  temperature?: number;
  /** 仅 thinking 开启时生效；保留给老入口的既有参数。 */
  reasoningEffort?: "low" | "high" | "max";
  signal?: AbortSignal;
};

/** 新入口（gateway）在此基础上附带记账作用域。 */
export type JsonModelRequest = JsonModelCall & { scope: InvocationStart };

export type JsonModelResult = {
  text: string;
  usage: NormalizedUsage;
  actualModel: string | null;
  providerRequestId: string | null;
  /** provider 报的结束原因；"length" 表示被输出上限截断，由调用方决定重试策略。 */
  finishReason: string | null;
};

export const MODEL_TIMEOUT = "MODEL_TIMEOUT";
export const MODEL_CANCELLED = "MODEL_CANCELLED";
export const MODEL_AUTH_ERROR = "MODEL_AUTH_ERROR";
export const MODEL_QUOTA_ERROR = "MODEL_QUOTA_ERROR";
export const MODEL_RATE_LIMIT = "MODEL_RATE_LIMIT";
export const MODEL_TRANSIENT = "MODEL_TRANSIENT";
export const MODEL_PROTOCOL_ERROR = "MODEL_PROTOCOL_ERROR";
export const MODEL_CAPABILITY_UNSUPPORTED = "MODEL_CAPABILITY_UNSUPPORTED";

export class ModelTransportError extends Error {
  override name = "ModelTransportError";
  constructor(readonly code: string, message: string) {
    super(message);
  }
}

/** HTTP 状态 → 错误码；401/403 不重试，429/5xx 由重试协调器决定。 */
const statusCode = (status: number): string => {
  if (status === 401 || status === 403) return MODEL_AUTH_ERROR;
  if (status === 402) return MODEL_QUOTA_ERROR;
  if (status === 429) return MODEL_RATE_LIMIT;
  if (status >= 500) return MODEL_TRANSIENT;
  return MODEL_PROTOCOL_ERROR;
};

const isAbortError = (error: unknown): boolean =>
  error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");

const containsImagePart = (messages: ModelMessage[]): boolean =>
  messages.some((message) => Array.isArray(message.content)
    && message.content.some((part) => part.type === "image_url"));

type DeepSeekPayload = {
  model?: string;
  choices?: Array<{ finish_reason?: string; message?: { content?: string } }>;
  usage?: ProviderUsage;
};

/**
 * 统一 DeepSeek 传输层。
 *
 * 关键约束：deadline 覆盖「建连 → 收 headers → 读完响应体 → JSON 解析」全过程，
 * 只在 finally 里清 timer；headers 到手就清 timer 会让慢 body 永久挂住。
 * 外部取消与自身超时必须区分：前者 MODEL_CANCELLED，后者 MODEL_TIMEOUT。
 */
export async function requestDeepSeekJson(
  call: JsonModelCall,
  fetchImpl: typeof fetch,
  apiKey: string,
): Promise<JsonModelResult> {
  if (containsImagePart(call.messages) && !call.route.supportsVision) {
    throw new ModelTransportError(MODEL_CAPABILITY_UNSUPPORTED, "route does not support image input");
  }

  const timeoutController = new AbortController();
  const timer = setTimeout(() => timeoutController.abort(MODEL_TIMEOUT), call.route.timeoutMs);
  const signal = call.signal
    ? AbortSignal.any([call.signal, timeoutController.signal])
    : timeoutController.signal;

  const body = {
    model: call.route.model,
    messages: call.messages,
    response_format: { type: "json_object" },
    max_tokens: call.maxOutputTokens,
    ...(call.route.supportsThinking ? { thinking: { type: call.thinking ? "enabled" : "disabled" } } : {}),
    ...(call.route.supportsThinking && call.thinking && call.reasoningEffort !== undefined
      ? { reasoning_effort: call.reasoningEffort }
      : {}),
    ...(call.temperature !== undefined ? { temperature: call.temperature } : {}),
  };

  try {
    const response = await fetchImpl(
      new URL("chat/completions", call.route.baseUrl.replace(/\/?$/, "/")),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
        signal,
      },
    );

    if (!response.ok) {
      // 错误体可能含内部细节，只保留前 200 字，且绝不包含 apiKey。
      const text = typeof response.text === "function"
        ? await response.text().catch(() => "")
        : "";
      throw new ModelTransportError(
        statusCode(response.status),
        `model http ${response.status}: ${text.slice(0, 200)}`,
      );
    }

    const payload = (await response.json()) as DeepSeekPayload;
    const choice = payload.choices?.[0];
    const content = choice?.message?.content;
    const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : null;
    if (typeof content !== "string") {
      throw new ModelTransportError(MODEL_PROTOCOL_ERROR, "model reply has no content");
    }
    // 被输出上限截断时允许空正文，由调用方决定重试；其余空回复属协议错误。
    if (content.length === 0 && finishReason !== "length") {
      throw new ModelTransportError(MODEL_PROTOCOL_ERROR, "model reply has no content");
    }

    return {
      text: content,
      usage: normalizeUsage(payload.usage),
      actualModel: typeof payload.model === "string" && payload.model.length > 0 ? payload.model : null,
      providerRequestId: typeof response.headers?.get === "function"
        ? response.headers.get("x-request-id")
        : null,
      finishReason,
    };
  } catch (error) {
    if (error instanceof ModelTransportError) throw error;
    if (isAbortError(error) || timeoutController.signal.aborted || call.signal?.aborted === true) {
      // 外部取消优先：调用方主动 abort 不能被当成 provider 超时。
      if (call.signal?.aborted === true) {
        throw new ModelTransportError(MODEL_CANCELLED, "model request cancelled");
      }
      throw new ModelTransportError(MODEL_TIMEOUT, "model request exceeded deadline");
    }
    throw new ModelTransportError(
      MODEL_TRANSIENT,
      `model transport failed: ${error instanceof Error ? error.name : "unknown"}`,
    );
  } finally {
    clearTimeout(timer);
  }
}
// end
