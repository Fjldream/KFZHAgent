// modified by jinlong.feng at 2026-10-20 Agent工作台迭代

/**
 * 跨包共享的模型调用合同：任务分类、usage 规范化结果与服务端路由。
 * 只定义数据类型，不引入 Nest/API 依赖；具体解析与调用在 apps/api/src/models 下实现。
 */

/** 一次模型请求的业务任务类型，决定提示词、输出上限与能力要求。 */
export type ModelTask = "intent" | "blueprint" | "implementation" | "repair" | "summary" | "vision";

/**
 * 规范化后的 usage。缺失字段一律为 null，绝不用 0 冒充「没花 token」；
 * source=unknown 表示 provider 没有给出可用计量，费用必须算作未知而不是免费。
 */
export type NormalizedUsage = {
  inputTokens: number | null;
  outputTokens: number | null;
  cacheHitTokens: number | null;
  cacheMissTokens: number | null;
  reasoningTokens: number | null;
  source: "provider" | "unknown";
  inconsistent: boolean;
};

/** DeepSeek / OpenAI 兼容接口的原始 usage 字段（只列会用到的部分）。 */
export type ProviderUsage = {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_cache_hit_tokens?: number;
  prompt_cache_miss_tokens?: number;
  completion_tokens_details?: { reasoning_tokens?: number };
};

/**
 * 服务端解析出的模型路由。只能由服务端配置构造，浏览器不得提供
 * baseUrl/model/价格等字段。
 */
export type ModelRoute = {
  provider: "deepseek";
  baseUrl: string;
  model: string;
  supportsVision: boolean;
  supportsJson: boolean;
  supportsThinking: boolean;
  maxContextTokens: number;
  timeoutMs: number;
  /** 价格表版本；未配置时为 null，此时费用只能记为未知。 */
  pricingVersion: string | null;
};
// end
