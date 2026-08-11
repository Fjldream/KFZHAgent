import { z } from "zod";
import { projectKeySchema } from "./solution.js";

const stableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine((value) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));

const deliveryTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(1_000)
  .refine((value) => !/<script\b|javascript\s*:|data\s*:\s*text\s*\/\s*html/i.test(value));

const componentOutputIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*\/[A-Za-z][A-Za-z0-9_-]*$/)
  .refine((value) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));

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
            outputId: componentOutputIdSchema,
          })
          .strict(),
      )
      .max(500),
  })
  .strict()
  .superRefine((trace, ctx) => {
    const outputIds = new Set<string>();
    trace.entries.forEach((entry, index) => {
      if (outputIds.has(entry.outputId)) {
        ctx.addIssue({ code: "custom", path: ["entries", index, "outputId"], message: `duplicate output id: ${entry.outputId}` });
      }
      outputIds.add(entry.outputId);
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
  .strict()
  .superRefine((report, ctx) => {
    const unresolved = report.gaps.filter((gap) => gap.status === "unresolved");
    const unresolvedBlocking = unresolved.filter((gap) => gap.severity === "blocking");

    if (report.status === "ready" && unresolved.length > 0) {
      ctx.addIssue({ code: "custom", path: ["status"], message: "ready delivery cannot contain unresolved gaps" });
    }
    if (report.status === "ready_with_warnings" && unresolved.some((gap) => gap.severity !== "warning")) {
      ctx.addIssue({ code: "custom", path: ["status"], message: "ready_with_warnings delivery can contain only unresolved warnings" });
    }
    if (report.status === "blocked" && unresolvedBlocking.length === 0) {
      ctx.addIssue({ code: "custom", path: ["status"], message: "blocked delivery requires an unresolved blocking gap" });
    }
    if (report.status !== "blocked" && unresolvedBlocking.length > 0) {
      ctx.addIssue({ code: "custom", path: ["status"], message: "an unresolved blocking gap requires blocked delivery" });
    }
  });

export type ModuleTrace = z.infer<typeof ModuleTraceSchema>;
export type ModuleDeliveryGap = z.infer<typeof ModuleDeliveryGapSchema>;
export type ModuleDeliveryReport = z.infer<typeof ModuleDeliveryReportSchema>;
