import { z } from "zod";

const id = z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_.-]*$/);
const unsafeTextPatterns = [
  /\b(?:javascript|vbscript)\s*:/i,
  /\b(?:https?|ftp):\/\//i,
  /\b[0-9A-F]{8}(?:-[0-9A-F]{4}){3}-[0-9A-F]{12}\b/i,
  /<\/?script\b/i,
  /\b(?:authorization|password|passwd|api[_-]?key|secret|token)\b\s*(?::|=)\s*\S+/i,
];
const text = z.string().trim().min(1).max(400).superRefine((value, ctx) => {
  if (unsafeTextPatterns.some((pattern) => pattern.test(value))) {
    ctx.addIssue({ code: "custom", message: "design knowledge text must be descriptive, not executable or sensitive content" });
  }
});
const textList = z.array(text).max(16);
const version = z.string().trim().regex(/^\d+\.\d+\.\d+$/);
const repositoryRef = z.string().trim().min(1).max(300).superRefine((value, ctx) => {
  const isRepositoryPath = /^(?!\/)(?!.*(?:^|\/)\.\.?($|\/))(?!.*\/\/)[^\s/\\#?:]+(?:\/[^\s/\\#?:]+)*(?:#[A-Za-z0-9_.:-]+)?$/.test(value);
  if (!isRepositoryPath) {
    ctx.addIssue({ code: "custom", message: "evidence ref must be a repository-relative path with an optional fragment" });
  }
});
const evidence = z.object({
  kind: z.enum(["template", "compiler", "fixture", "product-source"]),
  ref: repositoryRef,
}).strict();
const availability = z.enum(["supported", "planned"]);

export const DesignDensitySchema = z.enum(["compact", "comfortable", "spacious"]);
export const DesignRegionSchema = z.enum(["header", "main", "sidebar", "footer", "toolbar", "overlay", "workspace"]);
export const DesignDataShapeSchema = z.enum([
  "none", "scalar", "record", "record-list", "hierarchy", "time-series", "media-list", "action-list",
]);
export const StyleKnowledgePropertySchema = z.enum([
  "backgroundColor", "textColor", "borderColor", "borderRadius", "fontSize", "fontWeight",
  "lineHeight", "padding", "margin", "gap", "boxShadow", "opacity", "textAlign",
]);
export const StyleKnowledgeStateSchema = z.enum(["hover", "active", "focus", "disabled", "selected", "error"]);

export const ControlDesignProfileSchema = z.object({
  schema: z.literal("kf-control-design-profile/v1"),
  capabilityId: id,
  version,
  semanticRoles: z.array(id).min(1).max(16),
  useFor: textList.min(1),
  avoidFor: textList,
  dataShapes: z.array(DesignDataShapeSchema).min(1).max(8),
  densities: z.array(DesignDensitySchema).min(1).max(3),
  regions: z.array(DesignRegionSchema).min(1).max(7),
  minimumSize: z.object({ width: z.number().int().min(1).max(8192), height: z.number().int().min(1).max(8192) }).strict(),
  recommendedCompanions: z.array(id).max(16),
  alternatives: z.array(z.object({ when: text, capabilityIds: z.array(id).min(1).max(12) }).strict()).max(12),
  parentRoles: z.array(id).max(12),
  childRoles: z.array(id).max(12),
  designNotes: textList,
}).strict();

export const StyleCapabilityProfileSchema = z.object({
  schema: z.literal("kf-style-capability-profile/v1"),
  capabilityId: id,
  version,
  parts: z.array(z.object({
    id,
    availability,
    semanticRoles: z.array(id).min(1).max(12),
    properties: z.array(StyleKnowledgePropertySchema).min(1).max(13),
    states: z.array(StyleKnowledgeStateSchema).max(6),
    notes: textList,
  }).strict()).min(1).max(16),
}).strict();

const supportedMember = z.object({
  semanticEvent: id,
  kfEvent: text,
  linkId: z.number().int().min(0).max(2147483647).optional(),
  availability,
  arguments: z.array(z.object({ name: id, position: z.number().int().min(0).max(32).optional() }).strict()).max(16),
  evidence: z.array(evidence).max(8),
}).strict().superRefine((value, ctx) => {
  if (value.availability === "supported" && value.evidence.length === 0) {
    ctx.addIssue({ code: "custom", path: ["evidence"], message: "supported script event requires evidence" });
  }
});

const method = z.object({
  semanticMethod: id,
  kfMethod: text,
  availability,
  parameters: z.array(id).max(16),
  returns: z.enum(["void", "scalar", "record", "record-list", "unknown"]),
  evidence: z.array(evidence).max(8),
}).strict().superRefine((value, ctx) => {
  if (value.availability === "supported" && value.evidence.length === 0) {
    ctx.addIssue({ code: "custom", path: ["evidence"], message: "supported script method requires evidence" });
  }
});

const runtimeProperty = z.object({
  semanticProperty: id,
  kfProperty: z.string().trim().min(1).max(100).regex(/^[A-Za-z_$][A-Za-z0-9_$.-]*$/),
  readable: z.boolean(),
  writable: z.boolean(),
  availability,
  evidence: z.array(evidence).max(8),
}).strict().superRefine((value, ctx) => {
  if (!value.readable && !value.writable) {
    ctx.addIssue({ code: "custom", message: "script runtime property must be readable or writable" });
  }
  if (value.availability === "supported" && value.evidence.length === 0) {
    ctx.addIssue({ code: "custom", path: ["evidence"], message: "supported script property requires evidence" });
  }
});

const action = z.object({
  semanticAction: id,
  implementation: z.enum(["restricted-action", "event-script", "configure-data"]),
  availability,
  evidence: z.array(evidence).max(8),
}).strict().superRefine((value, ctx) => {
  if (value.availability === "supported" && value.evidence.length === 0) {
    ctx.addIssue({ code: "custom", path: ["evidence"], message: "supported script action requires evidence" });
  }
});

export const ScriptCapabilityProfileSchema = z.object({
  schema: z.literal("kf-script-capability-profile/v1"),
  capabilityId: id,
  version,
  availability,
  actions: z.array(action).max(16),
  events: z.array(supportedMember).max(32),
  methods: z.array(method).max(32),
  properties: z.array(runtimeProperty).max(32).default([]),
  initialization: z.object({ supportsConfigureData: z.boolean(), lifecycleEvents: z.array(id).max(12) }).strict(),
  limitations: textList,
}).strict().superRefine((profile, ctx) => {
  const categories = [
    ["actions", profile.actions.map((member) => member.semanticAction)],
    ["events", profile.events.map((member) => member.semanticEvent)],
    ["methods", profile.methods.map((member) => member.semanticMethod)],
    ["properties", profile.properties.map((member) => member.semanticProperty)],
  ] as const;
  categories.forEach(([field, names]) => {
    if (new Set(names).size !== names.length) {
      ctx.addIssue({ code: "custom", path: [field], message: `duplicate script capability ${field}` });
    }
  });
  const normalizedKfProperties = profile.properties.map((member) => member.kfProperty.toLowerCase());
  if (new Set(normalizedKfProperties).size !== normalizedKfProperties.length) {
    ctx.addIssue({ code: "custom", path: ["properties"], message: "duplicate case-normalized KF runtime property" });
  }
});

const recipeRole = z.object({ role: id, capabilityCandidates: z.array(id).min(1).max(16) }).strict();
export const CompositionRecipeSchema = z.object({
  schema: z.literal("kf-composition-recipe/v1"),
  id,
  version,
  purpose: text,
  useFor: textList.min(1),
  avoidFor: textList,
  requiredRoles: z.array(recipeRole).min(1).max(16),
  optionalRoles: z.array(recipeRole).max(16),
  layoutPrinciples: textList.min(1),
  interactionFlow: textList,
  substitutions: z.array(z.object({ when: text, replaceRole: id, withCapabilities: z.array(id).min(1).max(12) }).strict()).max(12),
  designNotes: textList,
}).strict();

export type ControlDesignProfile = z.infer<typeof ControlDesignProfileSchema>;
export type StyleCapabilityProfile = z.infer<typeof StyleCapabilityProfileSchema>;
export type ScriptCapabilityProfile = z.infer<typeof ScriptCapabilityProfileSchema>;
export type CompositionRecipe = z.infer<typeof CompositionRecipeSchema>;
