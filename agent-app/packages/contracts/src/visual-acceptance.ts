// modified by jinlong.feng at 2026-10-22 Agent工作台迭代
import { z } from "zod";

// Leaf schemas deliberately do not import RunAction or server continuation schemas.
const identifier = z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_.-]*$/);
export const VisualReviewReceiptSchema = z.string().regex(/^vref1:[a-f0-9]{64}:[a-f0-9]{64}$/);
export const VisualAcceptedDifferencesSchema = z.array(z.object({
  regionId: identifier, disposition: z.enum(["omit", "substitute", "accept-unverified"]), capabilityId: identifier.nullable(),
  reason: z.string().trim().min(1).max(1000),
}).strict()).max(100);

/** User choices only: no server snapshots, credentials, model route or build authority. */
export const VisualReviewAcceptanceSchema = z.object({
  expectedRunId: identifier, analysisId: identifier, analysisHash: z.string().regex(/^[a-f0-9]{64}$/),
  receipt: VisualReviewReceiptSchema, acceptedDifferences: VisualAcceptedDifferencesSchema,
}).strict();
export type VisualReviewAcceptance = z.infer<typeof VisualReviewAcceptanceSchema>;
// end
