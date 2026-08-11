import { z } from "zod";
import { projectKeySchema } from "./solution.js";

const stableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/);

const deliveryTextSchema = z.string().trim().min(1).max(1_000);

export const ModuleTraceSchema = z
  .object({
    schema: z.literal("kf-module-trace/v1"),
    projectKey: projectKeySchema,
    entries: z
      .array(
        z
          .object({
            pageId: stableIdSchema,
            moduleId: stableIdSchema,
            outputId: stableIdSchema,
          })
          .strict(),
      )
      .max(500),
  })
  .strict()
  .superRefine((trace, ctx) => {
    const moduleIds = new Set<string>();
    trace.entries.forEach((entry, index) => {
      if (moduleIds.has(entry.moduleId)) {
        ctx.addIssue({ code: "custom", path: ["entries", index, "moduleId"], message: `duplicate module id: ${entry.moduleId}` });
      }
      moduleIds.add(entry.moduleId);
    });
  });

export const ModuleDeliveryGapSchema = z
  .object({
    moduleId: stableIdSchema,
    requirement: deliveryTextSchema,
    severity: z.enum(["info", "warning", "blocking"]),
    status: z.enum(["unresolved", "mitigated", "accepted"]),
    reason: deliveryTextSchema,
    alternatives: z.array(deliveryTextSchema).max(10).optional(),
  })
  .strict();

export const ModuleDeliveryReportSchema = z
  .object({
    schema: z.literal("kf-module-delivery/v1"),
    projectKey: projectKeySchema,
    status: z.enum(["ready", "ready_with_warnings", "blocked"]),
    gaps: z.array(ModuleDeliveryGapSchema).max(200),
  })
  .strict();

export type ModuleTrace = z.infer<typeof ModuleTraceSchema>;
export type ModuleDeliveryGap = z.infer<typeof ModuleDeliveryGapSchema>;
export type ModuleDeliveryReport = z.infer<typeof ModuleDeliveryReportSchema>;
