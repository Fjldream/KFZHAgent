// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import type { ModelMessage } from "./deepseek-transport.js";

/** 进入上下文的单条历史消息（只保留角色与正文，不带工具字段）。 */
export type ContextMessage = { id: string; role: "user" | "assistant"; content: string };

/**
 * 会话长期记忆。必须绑定生成时的 baseRevisionId——换基线后旧记忆失效，
 * 否则会把上一版工程的结论套到新版本上。
 */
export type ConversationMemory = {
  schemaVersion: 1;
  throughMessageId: string;
  requirements: string[];
  acceptedDecisions: string[];
  openQuestions: string[];
  baseRevisionId: string;
  generatedAt: string;
};

export type ContextInput = {
  messages: ContextMessage[];
  memory: ConversationMemory | null;
  baseRevisionId: string;
  instruction: string;
  budgetTokens: number;
};

export type BuiltContext = {
  history: ModelMessage[];
  memoryText: string | null;
  droppedMessageIds: string[];
  estimatedTokens: number;
  estimateKind: "upper_bound";
};

/** 连当前指令都放不进预算时抛出；调用方据此拒绝，不得截断 JSON 或悄悄丢需求。 */
export const CONTEXT_BUDGET_EXCEEDED = "CONTEXT_BUDGET_EXCEEDED";

/** 无可靠 tokenizer 时每条消息另加 64 token 协议开销，做保守上界估算。 */
const MESSAGE_OVERHEAD_TOKENS = 64;

const estimateText = (text: string): number => Buffer.byteLength(text, "utf8") + MESSAGE_OVERHEAD_TOKENS;

/**
 * 渲染长期记忆。只有 schemaVersion=1 且基线一致时才可用；
 * 记忆里只放需求、已接受决策、待澄清问题——修复堆栈与构建日志不得进入。
 */
const renderMemory = (memory: ConversationMemory | null, baseRevisionId: string): string | null => {
  if (memory === null) return null;
  if (memory.schemaVersion !== 1) return null;
  if (memory.baseRevisionId !== baseRevisionId) return null;

  const lines: string[] = [];
  if (memory.requirements.length > 0) lines.push(`已确认需求：${memory.requirements.join("；")}`);
  if (memory.acceptedDecisions.length > 0) lines.push(`已接受决策：${memory.acceptedDecisions.join("；")}`);
  if (memory.openQuestions.length > 0) lines.push(`待澄清问题：${memory.openQuestions.join("；")}`);
  return lines.length === 0 ? null : lines.join("\n");
};

/**
 * 装配一次请求的上下文。
 *
 * 优先级：当前指令与有效记忆必留 → 最近历史尽量留 → 从最旧的消息开始丢。
 * 全程使用 UTF-8 字节上界估算，宁可保守也不冒充 provider tokenizer 的精确值。
 */
export function buildContext(input: ContextInput): BuiltContext {
  const memoryText = renderMemory(input.memory, input.baseRevisionId);
  const instructionCost = estimateText(input.instruction);
  const memoryCost = memoryText === null ? 0 : estimateText(memoryText);

  if (instructionCost + memoryCost > input.budgetTokens) {
    throw new Error(CONTEXT_BUDGET_EXCEEDED);
  }

  const kept = [...input.messages];
  const droppedMessageIds: string[] = [];
  let estimatedTokens = instructionCost + memoryCost
    + kept.reduce((total, message) => total + estimateText(message.content), 0);

  while (estimatedTokens > input.budgetTokens && kept.length > 0) {
    const removed = kept.shift();
    if (removed === undefined) break;
    droppedMessageIds.push(removed.id);
    estimatedTokens -= estimateText(removed.content);
  }

  return {
    history: kept.map((message) => ({ role: message.role, content: message.content })),
    memoryText,
    droppedMessageIds,
    estimatedTokens,
    estimateKind: "upper_bound",
  };
}
// end
