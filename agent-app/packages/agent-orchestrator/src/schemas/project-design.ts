import type { SolutionIR } from "@kf/contracts";
import { solutionIRSchema } from "@kf/contracts";
import type { z } from "zod";

/**
 * 由 ModelPort.createProjectDesign 设计的完整解决方案设计，为一个全新的工作空间提供了一个方案。该方案复用了 @kf/contracts 中的 v1 SolutionIR 合同，因此 orchestration 层层从未定义其设计形状。
 */
export const ProjectDesignSchema = solutionIRSchema;
export type ProjectDesign = z.infer<typeof ProjectDesignSchema>;

export type { SolutionIR };
