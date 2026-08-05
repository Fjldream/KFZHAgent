import { z } from "zod";
import type { DomainKind } from "./domain.js";
import type { SolutionId } from "./ids.js";

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
  solutionId: z.string(),
  displayName: z.string(),
  projects: z.array(solutionProjectSchema),
  dependencies: z.array(solutionDependencySchema),
  pendingRequirements: z.array(pendingRequirementSchema)
});

export type SolutionIR = {
  schema: "kf-solution-ir/v1";
  solutionId: SolutionId;
  displayName: string;
  projects: Array<SolutionProject & { domain: DomainKind }>;
  dependencies: SolutionDependency[];
  pendingRequirements: PendingRequirement[];
};
