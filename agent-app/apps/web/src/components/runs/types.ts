// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
// .vue SFC 无法被 tsc 可靠地命名导出类型，共享类型统一放这里。
import type { RunStatusLike } from "../../runs-api.js";

export type { RunStatusLike };

export type TimelineStepStatus = "done" | "running" | "failed" | "pending";

export type TimelineStep = {
  stepKey: string;
  label: string;
  status: TimelineStepStatus;
  durationMs?: number;
  detail?: string;
  tags?: Array<{ text: string; tone: "cache" | "attempt" | "repair" }>;
};

export type ConversationState = "running" | "queued" | "done" | "discuss" | "archived";

export type SidebarConversation = {
  id: string;
  title: string;
  state: ConversationState;
  unread?: number;
  meta?: string;
};
