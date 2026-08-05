import { z } from "zod";
import { solutionId } from "./ids.js";

/**
 * Zod schema for a SolutionId. Input is a plain string; output is the branded
 * SolutionId type from ids.ts (single source of truth, reuses the solutionId
 * factory's non-empty validation). Empty/blank strings are rejected.
 */
export const solutionIdSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "solution id is required")
  .transform((value) => solutionId(value));

export const solutionProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  domain: z.string(),
  path: z.string().optional()
});
export type SolutionProject = z.infer<typeof solutionProjectSchema>;

export const solutionDependencySchema = z.object({
  from: z.string(),
  to: z.string()
});
export type SolutionDependency = z.infer<typeof solutionDependencySchema>;

export const pendingRequirementSchema = z.object({
  text: z.string(),
  requestedDomains: z.array(z.string())
});
export type PendingRequirement = z.infer<typeof pendingRequirementSchema>;

export const solutionIRSchema = z.object({
  schema: z.literal("kf-solution-ir/v1"),
  solutionId: solutionIdSchema,
  displayName: z.string(),
  projects: z.array(solutionProjectSchema),
  dependencies: z.array(solutionDependencySchema),
  pendingRequirements: z.array(pendingRequirementSchema)
});

export type SolutionIR = z.infer<typeof solutionIRSchema>;
