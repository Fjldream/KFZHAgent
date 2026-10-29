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

/** 注册的模块命名空间是语义标识符，而不是 KF ID。 */
const moduleKindSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*$/)
  .refine((value) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value));

const templateVersionSchema = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[0-9A-Za-z][0-9A-Za-z._-]*$/);

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
  z.object({ type: z.literal("submit"), action: stableIdSchema }).strict(),
  z.object({ type: z.literal("filter"), field: stableIdSchema }).strict(),
  z.object({ type: z.literal("toggle"), target: stableIdSchema }).strict(),
]);

export const ModulePlanModuleSchema = z
  .object({
    id: stableIdSchema,
    kind: moduleKindSchema,
    templateVersion: templateVersionSchema,
    variant: stableIdSchema,
    title: moduleTextSchema,
    content: moduleTextSchema.optional(),
    placement: ModulePlacementSchema,
    interactions: z.array(ModuleInteractionSchema).max(12),
    assetId: stableIdSchema.optional(),
    /** 明确的确认蓝图出处；蓝图 ID 是人类标签，可能包含空格。 */
    sourceBlueprintModuleIds: z.array(z.string().trim().min(1).max(100)).min(1).max(12).optional(),
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
    title: moduleTextSchema.optional(),
    content: moduleTextSchema.optional(),
    placement: ModulePlacementSchema.optional(),
    interactions: z.array(ModuleInteractionSchema).max(12).optional(),
    /** null 是一个明确的移除；undefined 表示此操作不会触及绑定。 */
    assetId: stableIdSchema.nullable().optional(),
    sourceBlueprintModuleIds: z.array(z.string().trim().min(1).max(100)).min(1).max(12).optional(),
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
      op: z.literal("changeVariant"),
      pageId: stableIdSchema,
      moduleId: stableIdSchema,
      /** 必须匹配持久化模块版本；升级需要新的模块计划。 */
      templateVersion: templateVersionSchema,
      variant: stableIdSchema,
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
 * 仅包含声明的模块计划。它把 LLM 输出约束为已注册的布局意图和资产 ID；具体坐标和 I/O 由编译阶段负责。
 */
export const ModulePlanSchema = z
  .object({
    schema: z.literal("kf-module-plan/v1"),
    projectKey: projectKeySchema,
    theme: ThemeSpecSchema,
    assets: z.array(AssetRecordSchema).max(100),
    pages: z.array(ModulePlanPageSchema).min(1).max(5),
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
    const moduleDefinitionsByPage = new Map<string, Map<string, ModulePlanModule>>();
    const moduleIds = new Set<string>();
    const removedOperationIds = new Set<string>();
    const addedOperationIds = new Set<string>();
    const interactionSources: Array<{ interactions: ModuleInteraction[]; path: (string | number)[] }> = [];
    plan.pages.forEach((page, pageIndex) => {
      if (pageIds.has(page.id)) {
        ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "id"], message: `duplicate page id: ${page.id}` });
      }
      pageIds.add(page.id);
      const pageModuleIds = new Set<string>();
      modulesByPage.set(page.id, pageModuleIds);
      const pageModules = new Map<string, ModulePlanModule>();
      moduleDefinitionsByPage.set(page.id, pageModules);
      page.modules.forEach((module, moduleIndex) => {
        if (pageModuleIds.has(module.id) || moduleIds.has(module.id)) {
          ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "modules", moduleIndex, "id"], message: `duplicate module id: ${module.id}` });
        }
        pageModuleIds.add(module.id);
        pageModules.set(module.id, module);
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
      const pageModules = moduleDefinitionsByPage.get(operation.pageId)!;
      if (operation.op === "add") {
        const addKey = `${operation.pageId}\u0000${operation.module.id}`;
        if (addedOperationIds.has(addKey)) {
          ctx.addIssue({ code: "custom", path: ["operations", index, "module", "id"], message: `duplicate add operation: ${operation.module.id}` });
          return;
        }
        addedOperationIds.add(addKey);
        const finalModule = pageModules.get(operation.module.id);
        if (finalModule === undefined || JSON.stringify(finalModule) !== JSON.stringify(operation.module)) {
          ctx.addIssue({ code: "custom", path: ["operations", index, "module"], message: `added module must exactly match final page snapshot: ${operation.module.id}` });
        }
        return;
      }
      if (operation.op === "remove") {
        const removalKey = `${operation.pageId}\u0000${operation.moduleId}`;
        if (removedOperationIds.has(removalKey)) {
          ctx.addIssue({ code: "custom", path: ["operations", index, "moduleId"], message: `duplicate remove operation: ${operation.moduleId}` });
          return;
        }
        removedOperationIds.add(removalKey);
        // Creation plans retain the legacy declarative operation stream where
        // a remove can target the page snapshot. Revision plans are final-page
        // authoritative and therefore legitimately omit the removed module.
        if (pageModuleIds.has(operation.moduleId)) {
          pageModuleIds.delete(operation.moduleId);
          pageModules.delete(operation.moduleId);
          moduleIds.delete(operation.moduleId);
        }
        return;
      }
      if (!pageModuleIds.has(operation.moduleId)) {
        ctx.addIssue({ code: "custom", path: ["operations", index, "moduleId"], message: `unknown module id: ${operation.moduleId}` });
        return;
      }
      if (operation.op === "changeVariant") {
        const module = pageModules.get(operation.moduleId)!;
        if (module.templateVersion !== operation.templateVersion) {
          ctx.addIssue({
            code: "custom",
            path: ["operations", index, "templateVersion"],
            message: `template version must remain pinned to module ${operation.moduleId}`,
          });
          return;
        }
        pageModules.set(operation.moduleId, { ...module, variant: operation.variant });
        return;
      }
      if (operation.op === "update") {
        if (operation.changes.assetId !== undefined && operation.changes.assetId !== null && !assetIds.has(operation.changes.assetId)) {
          ctx.addIssue({ code: "custom", path: ["operations", index, "changes", "assetId"], message: `unknown asset id: ${operation.changes.assetId}` });
        }
        if (operation.changes.interactions !== undefined) {
          interactionSources.push({ interactions: operation.changes.interactions, path: ["operations", index, "changes", "interactions"] });
        }
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
        if (interaction.type === "toggle" && !moduleIds.has(interaction.target)) {
          ctx.addIssue({ code: "custom", path: [...source.path, index, "target"], message: `unknown module id: ${interaction.target}` });
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
