import { z } from "zod";
import { AssetRecordSchema } from "./asset.js";
import { projectKeySchema } from "./solution.js";
import { ThemeSpecSchema } from "./ui-style.js";

const stableIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine((value) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));

const moduleTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(2_000)
  .refine((value) => !/<script\b|javascript\s*:|data\s*:\s*text\s*\/\s*html/i.test(value));

export const ModulePlacementSchema = z
  .object({
    region: z.enum(["header", "main", "sidebar", "footer", "toolbar"]),
    order: z.number().int().min(0).max(100),
    columnSpan: z.number().int().min(1).max(12),
    preferredHeight: z.enum(["compact", "small", "medium", "large", "full"]),
    alignment: z.enum(["start", "center", "end", "stretch"]),
    emphasis: z.enum(["primary", "secondary", "subtle"]),
  })
  .strict();

export const ModuleInteractionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), pageId: stableIdSchema }).strict(),
  z.object({ type: z.literal("scroll"), moduleId: stableIdSchema }).strict(),
  z.object({ type: z.literal("open-modal"), moduleId: stableIdSchema }).strict(),
]);

export const ModulePlanModuleSchema = z
  .object({
    id: stableIdSchema,
    kind: stableIdSchema,
    title: moduleTextSchema,
    content: moduleTextSchema.optional(),
    placement: ModulePlacementSchema,
    interactions: z.array(ModuleInteractionSchema).max(12),
    assetId: stableIdSchema.optional(),
  })
  .strict();

export const ModulePlanPageSchema = z
  .object({
    id: stableIdSchema,
    title: moduleTextSchema,
    mode: z.enum(["vertical-flow", "dashboard-grid", "admin-shell"]),
    modules: z.array(ModulePlanModuleSchema).min(1).max(50),
  })
  .strict();

const moduleUpdateSchema = z
  .object({
    kind: stableIdSchema.optional(),
    title: moduleTextSchema.optional(),
    content: moduleTextSchema.optional(),
    placement: ModulePlacementSchema.optional(),
    interactions: z.array(ModuleInteractionSchema).max(12).optional(),
    assetId: stableIdSchema.optional(),
  })
  .strict();

export const ModulePlanOperationSchema = z.discriminatedUnion("op", [
  z
    .object({
      op: z.literal("add"),
      pageId: stableIdSchema,
      module: ModulePlanModuleSchema,
    })
    .strict(),
  z
    .object({
      op: z.literal("update"),
      pageId: stableIdSchema,
      moduleId: stableIdSchema,
      changes: moduleUpdateSchema,
    })
    .strict(),
  z
    .object({
      op: z.literal("move"),
      pageId: stableIdSchema,
      moduleId: stableIdSchema,
      placement: ModulePlacementSchema,
    })
    .strict(),
  z
    .object({
      op: z.literal("resize"),
      pageId: stableIdSchema,
      moduleId: stableIdSchema,
      columnSpan: z.number().int().min(1).max(12),
      preferredHeight: z.enum(["compact", "small", "medium", "large", "full"]),
    })
    .strict(),
  z
    .object({
      op: z.literal("remove"),
      pageId: stableIdSchema,
      moduleId: stableIdSchema,
    })
    .strict(),
]);

/**
 * A declaration-only module plan. It constrains LLM output to registered
 * layout intent and asset IDs; compilation owns concrete coordinates and I/O.
 */
export const ModulePlanSchema = z
  .object({
    schema: z.literal("kf-module-plan/v1"),
    projectKey: projectKeySchema,
    theme: ThemeSpecSchema,
    assets: z.array(AssetRecordSchema).max(100),
    pages: z.array(ModulePlanPageSchema).min(1).max(20),
    operations: z.array(ModulePlanOperationSchema).max(200),
  })
  .strict()
  .superRefine((plan, ctx) => {
    const assetIds = new Set<string>();
    plan.assets.forEach((asset, index) => {
      if (assetIds.has(asset.id)) {
        ctx.addIssue({ code: "custom", path: ["assets", index, "id"], message: `duplicate asset id: ${asset.id}` });
      }
      assetIds.add(asset.id);
    });

    const pageIds = new Set<string>();
    const modulesByPage = new Map<string, Set<string>>();
    const moduleIds = new Set<string>();
    const interactionSources: Array<{ interactions: ModuleInteraction[]; path: (string | number)[] }> = [];
    plan.pages.forEach((page, pageIndex) => {
      if (pageIds.has(page.id)) {
        ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "id"], message: `duplicate page id: ${page.id}` });
      }
      pageIds.add(page.id);
      const pageModuleIds = new Set<string>();
      modulesByPage.set(page.id, pageModuleIds);
      page.modules.forEach((module, moduleIndex) => {
        if (pageModuleIds.has(module.id) || moduleIds.has(module.id)) {
          ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "modules", moduleIndex, "id"], message: `duplicate module id: ${module.id}` });
        }
        pageModuleIds.add(module.id);
        moduleIds.add(module.id);
        interactionSources.push({ interactions: module.interactions, path: ["pages", pageIndex, "modules", moduleIndex, "interactions"] });
        if (module.assetId !== undefined && !assetIds.has(module.assetId)) {
          ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "modules", moduleIndex, "assetId"], message: `unknown asset id: ${module.assetId}` });
        }
      });
    });

    plan.operations.forEach((operation, index) => {
      if (!pageIds.has(operation.pageId)) {
        ctx.addIssue({ code: "custom", path: ["operations", index, "pageId"], message: `unknown page id: ${operation.pageId}` });
        return;
      }
      const pageModuleIds = modulesByPage.get(operation.pageId)!;
      if (operation.op === "add") {
        if (moduleIds.has(operation.module.id)) {
          ctx.addIssue({ code: "custom", path: ["operations", index, "module", "id"], message: `duplicate module id: ${operation.module.id}` });
        }
        moduleIds.add(operation.module.id);
        pageModuleIds.add(operation.module.id);
        interactionSources.push({ interactions: operation.module.interactions, path: ["operations", index, "module", "interactions"] });
        if (operation.module.assetId !== undefined && !assetIds.has(operation.module.assetId)) {
          ctx.addIssue({ code: "custom", path: ["operations", index, "module", "assetId"], message: `unknown asset id: ${operation.module.assetId}` });
        }
        return;
      }
      if (!pageModuleIds.has(operation.moduleId)) {
        ctx.addIssue({ code: "custom", path: ["operations", index, "moduleId"], message: `unknown module id: ${operation.moduleId}` });
        return;
      }
      if (operation.op === "remove") {
        pageModuleIds.delete(operation.moduleId);
        moduleIds.delete(operation.moduleId);
        return;
      }
      if (operation.op === "update" && operation.changes.assetId !== undefined && !assetIds.has(operation.changes.assetId)) {
        ctx.addIssue({ code: "custom", path: ["operations", index, "changes", "assetId"], message: `unknown asset id: ${operation.changes.assetId}` });
      }
    });

    interactionSources.forEach((source) => {
      source.interactions.forEach((interaction, index) => {
        if (interaction.type === "navigate" && !pageIds.has(interaction.pageId)) {
          ctx.addIssue({ code: "custom", path: [...source.path, index, "pageId"], message: `unknown page id: ${interaction.pageId}` });
        }
        if (
          (interaction.type === "scroll" || interaction.type === "open-modal")
          && !moduleIds.has(interaction.moduleId)
        ) {
          ctx.addIssue({ code: "custom", path: [...source.path, index, "moduleId"], message: `unknown module id: ${interaction.moduleId}` });
        }
      });
    });
  });

export type ModulePlacement = z.infer<typeof ModulePlacementSchema>;
export type ModuleInteraction = z.infer<typeof ModuleInteractionSchema>;
export type ModulePlanModule = z.infer<typeof ModulePlanModuleSchema>;
export type ModulePlanPage = z.infer<typeof ModulePlanPageSchema>;
export type ModulePlanOperation = z.infer<typeof ModulePlanOperationSchema>;
export type ModulePlan = z.infer<typeof ModulePlanSchema>;
