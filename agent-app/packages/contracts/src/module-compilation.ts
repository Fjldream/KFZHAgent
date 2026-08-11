import { z } from "zod";
import { projectKeySchema } from "./solution.js";

const id = z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*$/);
const kind = z.string().trim().min(1).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/);
const text = z.string().trim().min(1).max(200).refine((value) => !/<script\b|javascript\s*:|data\s*:\s*\/\s*html/i.test(value));
const fingerprint = z.string().trim().min(8).max(200).regex(/^[A-Za-z0-9._:-]+$/);

const ModuleDefinitionMetadataSchema = z.object({
  pageId: id,
  moduleId: id,
  kind,
  templateVersion: z.string().trim().min(1).max(100).regex(/^[0-9A-Za-z][0-9A-Za-z._-]*$/),
  compilerFingerprint: fingerprint,
  layoutFingerprint: fingerprint,
}).strict();

const ModuleAssetMetadataSchema = z.object({
  pageId: id,
  moduleId: id,
  assetId: id,
  status: z.enum(["resolved", "unavailable", "pending"]),
  /** Opaque canonical identity; never a path, storage key, secret, or native payload. */
  assetIdentity: text,
}).strict();

const ModuleBlueprintMappingSchema = z.object({
  blueprintModuleId: z.string().trim().min(1).max(100),
  pageId: id,
  moduleId: id,
  expectedKind: kind.optional(),
  expectedCategory: text.optional(),
  interactionBindings: z.array(z.object({
    type: z.enum(["navigate", "scroll", "open-modal", "submit", "filter", "toggle"]),
    actionKind: text,
    target: text,
    outputId: z.string().trim().min(3).max(100).regex(/^[A-Za-z][A-Za-z0-9_-]*\/[A-Za-z][A-Za-z0-9_-]*$/),
  }).strict()).max(12),
}).strict();

export const GeneratedSeedProvenanceSchema = z.object({
  pageId: id,
  entityId: id,
  generator: z.enum(["new-project", "import-inspector"]),
  schema: z.literal("kf-seed/v1"),
  componentHash: z.string().regex(/^sha256:[a-f0-9]{16,128}$/),
  projectCreationMarker: fingerprint,
}).strict();

export const ModuleCompilationMetadataSchema = z.object({
  schema: z.literal("kf-module-compilation-metadata/v1"),
  projectKey: projectKeySchema,
  moduleDefinitions: z.array(ModuleDefinitionMetadataSchema).max(250),
  assets: z.array(ModuleAssetMetadataSchema).max(250),
  blueprintMappings: z.array(ModuleBlueprintMappingSchema).max(250),
  generatedSeeds: z.array(GeneratedSeedProvenanceSchema).max(250),
}).strict().superRefine((value, ctx) => {
  const unique = (entries: readonly { pageId: string; moduleId?: string; entityId?: string }[], label: string) => {
    const seen = new Set<string>();
    entries.forEach((entry, index) => {
      const key = `${entry.pageId}\u0000${entry.moduleId ?? entry.entityId}`;
      if (seen.has(key)) ctx.addIssue({ code: "custom", path: [label, index], message: `duplicate ${label} owner` });
      seen.add(key);
    });
  };
  unique(value.moduleDefinitions, "moduleDefinitions");
  unique(value.assets, "assets");
  unique(value.generatedSeeds, "generatedSeeds");
  const blueprintIds = new Set<string>();
  value.blueprintMappings.forEach((entry, index) => {
    if (blueprintIds.has(entry.blueprintModuleId)) ctx.addIssue({ code: "custom", path: ["blueprintMappings", index, "blueprintModuleId"], message: "duplicate blueprint mapping" });
    blueprintIds.add(entry.blueprintModuleId);
  });
});

export type GeneratedSeedProvenance = z.infer<typeof GeneratedSeedProvenanceSchema>;
export type ModuleCompilationMetadata = z.infer<typeof ModuleCompilationMetadataSchema>;
