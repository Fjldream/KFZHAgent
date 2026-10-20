// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { ModelTask } from "@kf/contracts";
import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical-json.js";
import type { ModelMessage } from "./deepseek-transport.js";

/**
 * 任务级提示词版本。本轮按「等价迁移」执行：只建立结构与版本号，
 * 不改写任何提示词文案；文案精简另起任务评审。
 */
export const PROMPT_VERSIONS: Readonly<Record<ModelTask, string>> = {
  intent: "intent@v1",
  blueprint: "blueprint@v1",
  implementation: "implementation@v1",
  repair: "repair@v1",
  summary: "summary@v1",
  vision: "vision@v1",
};

export type PromptInput = {
  task: ModelTask;
  schemaVersion: string;
  /** 稳定能力包（canonical 序列化后进入前缀）；intent 任务不要塞全量控件注册表。 */
  capabilityPack?: unknown;
  /** 稳定前缀之后的历史消息，保持原 role 顺序。 */
  history?: ModelMessage[];
  instruction: string;
  repairFeedback?: string;
  /** 等价迁移期：调用方传入现有 system 原文，保证字节不变。 */
  systemPrompt?: string;
};

export type BuiltPrompt = {
  messages: ModelMessage[];
  promptVersion: string;
  /** 稳定前缀（任务协议 + schema 版本 + 能力包）的 SHA-256。 */
  prefixHash: string;
};

const defaultProtocol = (task: ModelTask, schemaVersion: string): string =>
  `KF agent task=${task} schema=${schemaVersion}. Reply with one JSON object only, no prose.`;

/**
 * 构造任务提示词。消息顺序固定为：
 * 稳定 system 前缀 → 历史（原 role）→ 本次指令（含可选修复反馈）。
 *
 * 时间戳、requestId、随机 ID、当前错误都不得进入稳定前缀，否则前缀哈希每次
 * 变化，provider 前缀缓存直接失效。
 */
export function buildTaskPrompt(input: PromptInput): BuiltPrompt {
  const promptVersion = PROMPT_VERSIONS[input.task];
  const stableContent = [
    promptVersion,
    input.schemaVersion,
    canonicalJson(input.capabilityPack ?? null),
  ].join("|");
  const prefixHash = createHash("sha256").update(stableContent, "utf8").digest("hex");

  const systemContent = input.systemPrompt ?? defaultProtocol(input.task, input.schemaVersion);
  const userContent = input.repairFeedback === undefined
    ? input.instruction
    : canonicalJson({ instruction: input.instruction, repairFeedback: input.repairFeedback });

  return {
    messages: [
      { role: "system", content: systemContent },
      ...(input.history ?? []),
      { role: "user", content: userContent },
    ],
    promptVersion,
    prefixHash,
  };
}
// end
