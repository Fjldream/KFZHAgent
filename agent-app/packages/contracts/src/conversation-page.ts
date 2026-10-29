// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import type { RunStatus } from "./agent-run.js";

export type Page<T> = { items: T[]; nextCursor: string | null };
export type ConversationListItem = {
  id: string;
  workspaceId: string;
  title: string;
  archivedAt: string | null;
  lastActivityAt: string;
  activeRunId: string | null;
  activeRunStatus: RunStatus | null;
};
/** v1 of paginated history exposes text only; reserved parts stay empty. */
export type MessageView = {
  id: string;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  runId: string | null;
  parts: unknown[];
};
export interface ConversationQueries {
  list(tenantId: string, workspaceId: string, cursor: string | null, limit: number, archived: boolean): Promise<Page<ConversationListItem>>;
  messages(tenantId: string, conversationId: string, before: string | null, limit: number): Promise<Page<MessageView>>;
  rename(tenantId: string, conversationId: string, title: string): Promise<ConversationListItem>;
  archive(tenantId: string, conversationId: string, archived: boolean): Promise<ConversationListItem>;
}
// end
