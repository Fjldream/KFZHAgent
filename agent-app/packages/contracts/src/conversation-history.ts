// modified by jinlong.feng at 2026-10-27 Agent工作台迭代
import { z } from "zod";

export const ConversationForkInputSchema = z.object({
  clientRequestId: z.string().uuid(), messageId: z.string().min(1).max(128), revisionId: z.string().min(1).max(128),
  title: z.string().trim().min(1).refine(value => Array.from(value).length <= 100).optional(),
}).strict();
export type ConversationForkInput = z.infer<typeof ConversationForkInputSchema>;
export interface RevisionDetail {
  id: string;
  workspaceId: string;
  revisionNumber: number;
  parentRevisionId: string | null;
  kind: string;
  createdAt: string;
  current: boolean;
  delivery: { artifactId: string; sha256: string; buildJobId: string; runId: string | null } | null;
  forkAnchor: { conversationId: string; messageId: string } | null;
  verification: { compiled: "passed" | "unknown"; runtime: "not_performed"; visual: "not_performed" };
}
// end
