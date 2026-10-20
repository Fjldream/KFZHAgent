import { z } from "zod";
import { solutionId } from "./ids.js";

/**
 * 一个 SolutionId 的 zod 模式，输入是一个纯字符串；输出是 SolutionId 类型从 ids.ts（单个源的真相，重用 solutionId 工厂的非空验证）。空/空白字符串被拒绝。
 */
export const solutionIdSchema = z
  .string()
  .refine((value) => value.trim().length > 0, "solution id is required")
  .transform((value) => solutionId(value));

const PROJECT_KEY_PATTERN = /^[\p{L}\p{N}][\p{L}\p{N}._-]*$/u;

/** 跨合同、工作和修订使用的标准稳定项目身份。 */
export const projectKeySchema = z
  .string()
  .trim()
  .min(1, "projectKey must contain 1 to 128 characters")
  .max(128, "projectKey must contain 1 to 128 characters")
  .regex(
    PROJECT_KEY_PATTERN,
    "projectKey must start with a letter or number and contain only letters, numbers, '.', '_' or '-'",
  );

export const projectBlueprintSchema = z
  .object({
    id: z.string().min(1),
    projectKey: z.string().optional(),
    name: z.string(),
    domain: z.string(),
    path: z.string().optional(),
    projectIr: z.unknown().optional(),
  })
  .transform((project, ctx) => {
    const parsedKey = projectKeySchema.safeParse(project.projectKey ?? project.id);
    if (!parsedKey.success) {
      for (const issue of parsedKey.error.issues) {
        ctx.addIssue({ code: "custom", path: ["projectKey"], message: issue.message });
      }
      return z.NEVER;
    }
    return { ...project, projectKey: parsedKey.data };
  });
export type ProjectBlueprint = z.infer<typeof projectBlueprintSchema>;

/** 为 v1 SolutionIR 使用方保留的向后兼容名称。 */
export const solutionProjectSchema = projectBlueprintSchema;
export type SolutionProject = ProjectBlueprint;

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

export const solutionRevisionProjectSchema = z
  .object({
    projectKey: projectKeySchema,
    domainKind: z.string().trim().min(1).optional(),
    domain: z.string().trim().min(1).optional(),
    projectIr: z.unknown().optional(),
    buildState: z.unknown().optional(),
  })
  .passthrough()
  .superRefine((project, ctx) => {
    if (project.domainKind === undefined && project.domain === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["domainKind"],
        message: "revision project must define domainKind or domain",
      });
    }
    if (
      project.domainKind !== undefined &&
      project.domain !== undefined &&
      project.domainKind !== project.domain
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["domainKind"],
        message: "revision project domainKind and domain must match",
      });
    }
  });
export type SolutionRevisionProject = z.infer<typeof solutionRevisionProjectSchema>;

export const solutionRevisionStateSchema = z
  .object({
    schema: z.literal("kf-solution-revision-state/v1"),
    projects: z.array(solutionRevisionProjectSchema),
  })
  .passthrough()
  .superRefine((state, ctx) => {
    const seen = new Set<string>();
    state.projects.forEach((project, index) => {
      if (seen.has(project.projectKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["projects", index, "projectKey"],
          message: `duplicate projectKey: ${project.projectKey}`,
        });
      }
      seen.add(project.projectKey);
    });
  });
export type SolutionRevisionState = z.infer<typeof solutionRevisionStateSchema>;

export const solutionIRSchema = z
  .object({
    schema: z.literal("kf-solution-ir/v1"),
    solutionId: solutionIdSchema,
    displayName: z.string(),
    projects: z.array(solutionProjectSchema),
    dependencies: z.array(solutionDependencySchema),
    pendingRequirements: z.array(pendingRequirementSchema),
  })
  .superRefine((solution, ctx) => {
    const seen = new Set<string>();
    solution.projects.forEach((project, index) => {
      if (seen.has(project.projectKey)) {
        ctx.addIssue({
          code: "custom",
          path: ["projects", index, "projectKey"],
          message: `duplicate projectKey: ${project.projectKey}`,
        });
      }
      seen.add(project.projectKey);
    });
  });

export type SolutionIR = z.infer<typeof solutionIRSchema>;
