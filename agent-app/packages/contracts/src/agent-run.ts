// modified by jinlong.feng at 2026-10-20 Agent工作台迭代
import { z } from "zod";
// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { VisualAcceptedDifferencesSchema, VisualReviewReceiptSchema } from "./visual-acceptance.js";
// end

/** design §7 固定状态集合；终态不可复活。 */
export const RunStatusSchema = z.enum([
  "QUEUED",
  "RUNNING",
  "WAITING_INPUT",
  "WAITING_APPROVAL",
  "BUILDING",
  "SUCCEEDED",
  "FAILED",
  "CANCEL_REQUESTED",
  "CANCELLED",
]);
export type RunStatus = z.infer<typeof RunStatusSchema>;

export const RunModeSchema = z.enum(["discuss", "plan", "build"]);
export type RunMode = z.infer<typeof RunModeSchema>;

/** 用户动作是严格判别联合：未知 type 或多余字段一律拒绝。 */
export const RunActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("message"), text: z.string().min(1).max(20_000) }).strict(),
  z.object({
    type: z.literal("confirm_blueprint"),
    expectedRunId: z.string().min(1),
    receipt: z.string().min(1).max(4_000),
  }).strict(),
  z.object({
    type: z.literal("resume_approval"),
    expectedRunId: z.string().min(1),
    action: z.enum(["approve", "revise", "cancel"]),
    planHash: z.string().min(1),
  }).strict(),
  z.object({
    type: z.literal("accept_visual_reference"),
    expectedRunId: z.string().min(1),
    analysisId: z.string().min(1),
    analysisHash: z.string().min(1),
    // modified by jinlong.feng at 2026-10-22 Agent工作台迭代
    // Optional only for reading old internal signed actions. Public/store admission requires both.
    receipt: VisualReviewReceiptSchema.optional(),
    acceptedDifferences: VisualAcceptedDifferencesSchema.optional(),
    // end
  }).strict(),
  z.object({
    type: z.literal("revise_regions"),
    text: z.string().min(1).max(20_000),
    regionIds: z.array(z.string().min(1)).min(1).max(64),
    generationSnapshotId: z.string().min(1),
  }).strict(),
]);
export type RunAction = z.infer<typeof RunActionSchema>;

export const RunEventTypeSchema = z.enum([
  "run.queued",
  "run.started",
  "step.started",
  "step.completed",
  "step.failed",
  "decision.summary",
  "message.completed",
  "usage.updated",
  "approval.required",
  "input.required",
  "build.updated",
  "run.cancel_requested",
  "run.completed",
  "run.failed",
  "run.cancelled",
  "baseline.changed",
]);
export type RunEventType = z.infer<typeof RunEventTypeSchema>;

/**
 * 每种事件只放白名单字段，不是任意 Record：payload 里塞不下模型原始思维链，
 * 也塞不下整段工程 JSON。decision.summary 限 600 字。
 */
const StepPayload = z.object({
  stepKey: z.string().min(1).max(120),
  label: z.string().min(1).max(200),
  attempt: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative().optional(),
  safeSummary: z.string().max(600).optional(),
  failureCode: z.string().max(120).optional(),
}).strict();

const eventPayloads: Record<RunEventType, z.ZodTypeAny> = {
  "run.queued": z.object({ mode: RunModeSchema }).strict(),
  "run.started": z.object({ attempt: z.number().int().nonnegative() }).strict(),
  "step.started": StepPayload,
  "step.completed": StepPayload,
  "step.failed": StepPayload,
  "decision.summary": z.object({
    summary: z.string().min(1).max(600),
    controlIds: z.array(z.string().max(120)).max(32).optional(),
    regionIds: z.array(z.string().max(120)).max(32).optional(),
  }).strict(),
  "message.completed": z.object({ messageId: z.string().min(1) }).strict(),
  "usage.updated": z.object({
    knownInputTokens: z.number().int().nonnegative().optional(),
    knownOutputTokens: z.number().int().nonnegative().optional(),
    unknownCount: z.number().int().nonnegative().optional(),
  }).strict(),
  "approval.required": z.object({
    planHash: z.string().min(1).max(200),
    summary: z.string().max(600).optional(),
  }).strict(),
  "input.required": z.object({ question: z.string().min(1).max(600), receipt: z.string().max(4000).optional() }).strict(),
  "build.updated": z.object({
    buildJobId: z.string().min(1),
    status: z.string().min(1).max(40),
  }).strict(),
  "run.cancel_requested": z.object({ requestedAt: z.string().min(1).max(60) }).strict(),
  "run.completed": z.object({ revisionId: z.string().min(1).optional() }).strict(),
  "run.failed": z.object({ failureCode: z.string().min(1).max(120) }).strict(),
  "run.cancelled": z.object({}).strict(),
  "baseline.changed": z.object({
    fromRevisionId: z.string().max(120).nullable(),
    toRevisionId: z.string().max(120).nullable(),
  }).strict(),
};

export const RunEventSchema = z.object({
  schemaVersion: z.literal(1),
  runId: z.string().min(1),
  seq: z.number().int().positive(),
  type: RunEventTypeSchema,
  createdAt: z.string().min(1).max(60),
  payload: z.record(z.string(), z.unknown()),
}).strict().superRefine((event, ctx) => {
  const parser = eventPayloads[event.type];
  const parsed = parser.safeParse(event.payload);
  if (!parsed.success) {
    ctx.addIssue({ code: "custom", message: `payload does not match ${event.type}`, path: ["payload"] });
  }
});

export type RunEvent = {
  schemaVersion: 1;
  runId: string;
  seq: number;
  type: RunEventType;
  createdAt: string;
  payload: Record<string, unknown>;
};

/** 运行快照：前端恢复订阅时的唯一事实来源。 */
export type RunSnapshot = {
  id: string;
  tenantId: string;
  workspaceId: string;
  conversationId: string;
  status: RunStatus;
  lastSeq: number;
  baseRevisionId: string;
  buildJobId: string | null;
  resultRevisionId: string | null;
  failureCode: string | null;
  supersededByRunId: string | null;
  // modified by jinlong.feng at 2026-10-27 Agent工作台迭代
  retryPolicy?: "new-run" | "new-visual-review";
  // end
};

export type RunLease = {
  runId: string;
  ownerId: string;
  fence: number;
  expiresAt: string;
};
// end
