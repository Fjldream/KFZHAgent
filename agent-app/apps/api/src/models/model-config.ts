// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { ModelRoute, ModelTask } from "@kf/contracts";
import type { ModelRouteSource, ModelRouteTable } from "./model-types.js";

/** 任务需要的能力当前路由不具备时抛出；调用方不得降级成「只发文字」继续。 */
export const MODEL_CAPABILITY_UNSUPPORTED = "MODEL_CAPABILITY_UNSUPPORTED";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
/** 保留既有文本默认模型，不因本任务更换生产模型。 */
const DEFAULT_TEXT_MODEL = "deepseek-chat";
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_CONTEXT_TOKENS = 64_000;

const trimmed = (value: string | undefined): string | null => {
  const candidate = value?.trim();
  return candidate !== undefined && candidate.length > 0 ? candidate : null;
};

const positiveInteger = (value: string | undefined, fallback: number): number => {
  const raw = trimmed(value);
  const parsed = raw === null ? Number.NaN : Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
};

/** 去掉尾部斜杠，保证 transport 用 new URL("chat/completions", baseUrl) 拼接稳定。 */
const normalizeBaseUrl = (value: string | undefined): string =>
  (trimmed(value) ?? DEFAULT_BASE_URL).replace(/\/+$/, "");

/**
 * 从服务端环境变量解析任务路由表。
 *
 * - 文本任务共用一条路由，默认 deepseek-chat
 * - 视觉任务必须显式配置 DEEPSEEK_VISION_MODEL；未配置时保留任务键但
 *   supportsVision=false，由 validateModelRoute 拒绝，绝不静默降级
 * - 超时/上下文档位非法时回落到默认值，不做放大解释
 */
export function resolveModelRoutes(source: ModelRouteSource): ModelRouteTable {
  const shared = {
    provider: "deepseek" as const,
    baseUrl: normalizeBaseUrl(source.DEEPSEEK_BASE_URL),
    supportsJson: true,
    supportsThinking: source.DEEPSEEK_THINKING === "1",
    maxContextTokens: positiveInteger(source.DEEPSEEK_MAX_CONTEXT_TOKENS, DEFAULT_MAX_CONTEXT_TOKENS),
    timeoutMs: positiveInteger(source.DEEPSEEK_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    pricingVersion: trimmed(source.DEEPSEEK_PRICING_VERSION),
  };

  const textRoute: ModelRoute = {
    ...shared,
    model: trimmed(source.DEEPSEEK_MODEL) ?? DEFAULT_TEXT_MODEL,
    supportsVision: false,
  };
  const visionModel = trimmed(source.DEEPSEEK_VISION_MODEL);
  const visionRoute: ModelRoute = {
    ...shared,
    model: visionModel ?? textRoute.model,
    supportsVision: visionModel !== null,
  };

  return {
    intent: textRoute,
    blueprint: textRoute,
    implementation: textRoute,
    repair: textRoute,
    summary: textRoute,
    vision: visionRoute,
  };
}

/**
 * 校验路由能否承担指定任务。能力不足时抛固定错误码，调用方据此拒绝请求，
 * 而不是悄悄把 vision 任务降级为纯文本。
 */
export function validateModelRoute(route: ModelRoute, task: ModelTask): ModelRoute {
  if (trimmed(route.model) === null || !route.supportsJson) {
    throw new Error(MODEL_CAPABILITY_UNSUPPORTED);
  }
  if (task === "vision" && !route.supportsVision) {
    throw new Error(MODEL_CAPABILITY_UNSUPPORTED);
  }
  return route;
}
// end
