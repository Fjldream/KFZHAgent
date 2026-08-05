import { z } from "zod";

export const checkStatusSchema = z.enum(["pass", "warn", "fail"]);
export type CheckStatus = z.infer<typeof checkStatusSchema>;

export const validationStatusSchema = z.enum(["pass", "fail"]);
export type ValidationStatus = z.infer<typeof validationStatusSchema>;

export const validationChecksSchema = z.object({
  packageStructure: checkStatusSchema,
  jsonSchema: checkStatusSchema,
  references: checkStatusSchema,
  businessRules: checkStatusSchema,
  changeScope: checkStatusSchema,
  roundTrip: checkStatusSchema
});
export type ValidationChecks = z.infer<typeof validationChecksSchema>;

export const validationReportSchema = z.object({
  status: validationStatusSchema,
  checks: validationChecksSchema,
  warnings: z.array(z.string())
});
export type ValidationReport = z.infer<typeof validationReportSchema>;
