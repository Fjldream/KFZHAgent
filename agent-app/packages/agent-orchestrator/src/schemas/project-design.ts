import type { SolutionIR } from "@kf/contracts";
import { solutionIRSchema } from "@kf/contracts";
import type { z } from "zod";

/**
 * A complete solution design produced by ModelPort.createProjectDesign for a
 * brand-new workspace (no current revision yet). Reuses the v1 SolutionIR
 * contract from @kf/contracts so the orchestration layer never defines its own
 * design shape.
 */
export const ProjectDesignSchema = solutionIRSchema;
export type ProjectDesign = z.infer<typeof ProjectDesignSchema>;

export type { SolutionIR };
