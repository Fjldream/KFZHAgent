import { z } from "zod";

export const CapabilityStatusSchema = z.enum([
  "full",
  "partial",
  "preserve-only",
  "unsupported",
  "pending-verification",
]);

export const StyleDeclarationSchema = z.object({
  backgroundColor: z.string().max(128).optional(),
  textColor: z.string().max(128).optional(),
  borderColor: z.string().max(128).optional(),
  borderRadius: z.number().min(0).max(100).optional(),
  fontSize: z.number().min(8).max(200).optional(),
  fontWeight: z.number().int().min(100).max(900).optional(),
  lineHeight: z.number().min(0.5).max(4).optional(),
  padding: z.number().min(0).max(200).optional(),
  margin: z.number().min(0).max(200).optional(),
  gap: z.number().min(0).max(200).optional(),
  boxShadow: z.enum(["none", "small", "medium", "large"]).optional(),
  opacity: z.number().min(0).max(1).optional(),
  textAlign: z.enum(["left", "center", "right"]).optional(),
}).strict();

export const ComponentStyleSpecSchema = z.object({
  role: z.string().min(1).max(100).optional(),
  declarations: StyleDeclarationSchema.default({}),
  states: z.object({
    hover: StyleDeclarationSchema.optional(),
    active: StyleDeclarationSchema.optional(),
    focus: StyleDeclarationSchema.optional(),
    disabled: StyleDeclarationSchema.optional(),
    selected: StyleDeclarationSchema.optional(),
    error: StyleDeclarationSchema.optional(),
  }).strict().default({}),
}).strict();

export const ThemeSpecSchema = z.object({
  background: z.string().max(128),
  surface: z.string().max(128),
  primary: z.string().max(128),
  accent: z.string().max(128),
  textPrimary: z.string().max(128),
  textSecondary: z.string().max(128),
  fontFamily: z.string().min(1).max(200),
  spacingUnit: z.number().int().min(1).max(64),
  radiusScale: z.object({
    small: z.number().min(0).max(100),
    medium: z.number().min(0).max(100),
    large: z.number().min(0).max(100),
  }).strict(),
}).strict();

export const UIComponentSpecSchema = z.object({
  id: z.string().min(1).max(100),
  role: z.string().min(1).max(100),
  capabilityId: z.string().min(1).max(100),
  critical: z.boolean().default(true),
  fallbackCapabilityId: z.string().min(1).max(100).optional(),
  content: z.string().max(2_000).optional(),
  geometry: z.object({
    x: z.number().nonnegative(),
    y: z.number().nonnegative(),
    width: z.number().positive(),
    height: z.number().positive(),
  }).strict(),
  properties: z.record(z.string(), z.unknown()).default({}),
  style: ComponentStyleSpecSchema,
}).strict();

export const UIImplementationSpecSchema = z.object({
  schema: z.literal("kf-ui-implementation/v1"),
  theme: ThemeSpecSchema,
  pages: z.array(z.object({
    id: z.string().min(1).max(100),
    width: z.number().positive(),
    height: z.number().positive(),
    components: z.array(UIComponentSpecSchema).min(1),
  }).strict()).min(1),
}).strict();

export const CapabilityDimensionSchema = z.object({
  status: CapabilityStatusSchema,
  supported: z.array(z.string()).default([]),
  unsupported: z.array(z.string()).default([]),
}).strict();

export const ControlCapabilitySchema = z.object({
  id: z.string().min(1),
  category: z.enum(["static", "easyui", "layout", "prototype"]),
  displayName: z.string().min(1),
  generation: CapabilityDimensionSchema,
  style: CapabilityDimensionSchema.extend({ adapter: z.string().min(1).optional() }).strict(),
  preview: CapabilityDimensionSchema,
  dataBinding: CapabilityDimensionSchema,
  interaction: CapabilityDimensionSchema,
  runtimeVerification: z.object({
    status: z.enum(["unverified", "verified", "failed"]),
    runtimeFamily: z.string().optional(),
    runtimeVersion: z.string().optional(),
    baselineId: z.string().optional(),
  }).strict(),
  limitations: z.array(z.string()).default([]),
}).strict();

export const DeliveryGapSchema = z.object({
  componentId: z.string().min(1),
  capability: z.string().min(1),
  severity: z.enum(["critical", "non-critical"]),
  fallback: z.string().min(1).optional(),
  reason: z.string().min(1),
}).strict();

export const CapabilityReportSchema = z.object({
  status: z.enum(["pass", "warning", "fail"]),
  full: z.array(z.string()),
  partial: z.array(z.string()),
  unsupported: z.array(z.string()),
  deliveryGaps: z.array(DeliveryGapSchema),
}).strict();

export type CapabilityStatus = z.infer<typeof CapabilityStatusSchema>;
export type StyleDeclaration = z.infer<typeof StyleDeclarationSchema>;
export type ComponentStyleSpec = z.infer<typeof ComponentStyleSpecSchema>;
export type ThemeSpec = z.infer<typeof ThemeSpecSchema>;
export type UIComponentSpec = z.infer<typeof UIComponentSpecSchema>;
export type UIImplementationSpec = z.infer<typeof UIImplementationSpecSchema>;
export type CapabilityDimension = z.infer<typeof CapabilityDimensionSchema>;
export type ControlCapability = z.infer<typeof ControlCapabilitySchema>;
export type DeliveryGap = z.infer<typeof DeliveryGapSchema>;
export type CapabilityReport = z.infer<typeof CapabilityReportSchema>;
