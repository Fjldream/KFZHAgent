import { z } from "zod";
import { changePlanSchema } from "@kf/contracts";

/**
 * 由 ModelPort.createChangePlan / reviseChangePlan 产生的变更计划。
 * 该变更计划重用了 @kf/contracts 的 v1 kf-change-plan 合同。
 */
export const GraphPlanSchema = changePlanSchema;
export type GraphPlan = z.infer<typeof GraphPlanSchema>;

/**
 * 在审批中断中向用户展示的、便于阅读的有界方案摘要。它会保持为有界字符串（绝不是完整 JSON），以确保中断载荷较小且不含不受信任的脚本文本。
 */
export const PlanSummarySchema = z.string().min(1).max(2000);
export type PlanSummary = z.infer<typeof PlanSummarySchema>;
