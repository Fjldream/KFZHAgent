import { z } from "zod";
import { changePlanSchema } from "@kf/contracts";

/**
 * A change plan produced by ModelPort.createChangePlan / reviseChangePlan.
 * Reuses the v1 kf-change-plan contract from @kf/contracts verbatim.
 */
export const GraphPlanSchema = changePlanSchema;
export type GraphPlan = z.infer<typeof GraphPlanSchema>;

/**
 * Human-readable, bounded summary of a plan shown to the user inside the
 * approval interrupt. Kept as a bounded string (never the full JSON) so the
 * interrupt payload stays small and free of untrusted script text.
 */
export const PlanSummarySchema = z.string().min(1).max(2000);
export type PlanSummary = z.infer<typeof PlanSummarySchema>;
