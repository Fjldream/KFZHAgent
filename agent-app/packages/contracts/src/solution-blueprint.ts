import { z } from "zod";

const forbiddenImplementationTerm = /\b(?:expectedKind|module\s+kind|capability\s*id|guid|selector|css|js|styleDataNew|linkId|configureData)\b|坐标/i;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Customer-facing language only: it cannot carry raw JSON or implementation terms. */
const blueprintText = z
  .string()
  .trim()
  .min(1)
  .max(600)
  .refine((value) => !forbiddenImplementationTerm.test(value), "implementation details are not allowed")
  .refine((value) => !/^[{[]/.test(value), "raw JSON is not allowed");

const blueprintTextList = z.array(blueprintText).max(12);

/** Stable semantic identity, never a platform-generated identifier. */
const blueprintId = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine((value) => !uuid.test(value), "platform-generated identifiers are not allowed");

const forbiddenSampleDataKey = new Set([
  "expectedkind",
  "kind",
  "capabilityid",
  "guid",
  "coordinate",
  "coordinates",
  "selector",
  "css",
  "js",
  "styledatanew",
  "linkid",
  "configuredata",
]);

const BlueprintSampleDataSchema = z
  .record(blueprintText.max(100), blueprintText)
  .superRefine((record, ctx) => {
    Object.keys(record).forEach((key) => {
      if (forbiddenSampleDataKey.has(key.replace(/[^a-z0-9]/gi, "").toLowerCase())) {
        ctx.addIssue({ code: "custom", path: [key], message: "implementation fields are not allowed" });
      }
    });
  });

export const BlueprintRegionSchema = z
  .object({
    id: blueprintId,
    purpose: blueprintText,
    semanticRoles: blueprintTextList.min(1),
    dataShape: blueprintText,
    density: z.enum(["compact", "comfortable", "spacious"]),
    importance: z.enum(["primary", "secondary", "supporting"]),
    content: blueprintTextList.min(1),
    sampleData: z.array(BlueprintSampleDataSchema).max(12),
    interactions: blueprintTextList,
    states: blueprintTextList.min(1),
    visualIntent: blueprintText,
  })
  .strict();

export const BlueprintPageSchema = z
  .object({
    id: blueprintId,
    title: blueprintText,
    purpose: blueprintText,
    readingOrder: z.array(blueprintId).min(1).max(12),
    regions: z.array(BlueprintRegionSchema).min(1).max(12),
  })
  .strict();

export const BlueprintJourneyStepSchema = z
  .object({
    pageId: blueprintId,
    regionId: blueprintId,
    action: blueprintText,
    result: blueprintText,
  })
  .strict();

export const BlueprintJourneySchema = z
  .object({
    id: blueprintId,
    actor: blueprintText,
    goal: blueprintText,
    steps: z.array(BlueprintJourneyStepSchema).min(1).max(12),
    completion: blueprintText,
  })
  .strict();

export const BlueprintVisualDirectionSchema = z
  .object({
    tone: blueprintText,
    colors: blueprintTextList.min(1),
    typography: blueprintText,
    spacingAndSurfaces: blueprintText,
  })
  .strict();

function validateBlueprintReferences(blueprint: CustomerSolutionBlueprint, ctx: z.RefinementCtx): void {
  const pageIds = new Set<string>();
  const regionIds = new Set<string>();
  const regionsByPage = new Map<string, Set<string>>();

  blueprint.pages.forEach((page, pageIndex) => {
    if (pageIds.has(page.id)) {
      ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "id"], message: `duplicate page id: ${page.id}` });
    }
    pageIds.add(page.id);

    const pageRegionIds = new Set<string>();
    regionsByPage.set(page.id, pageRegionIds);
    page.regions.forEach((region, regionIndex) => {
      if (regionIds.has(region.id)) {
        ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "regions", regionIndex, "id"], message: `duplicate region id: ${region.id}` });
      }
      regionIds.add(region.id);
      pageRegionIds.add(region.id);
    });

    const readingOrderIds = new Set<string>();
    page.readingOrder.forEach((regionId, readingOrderIndex) => {
      if (!pageRegionIds.has(regionId)) {
        ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "readingOrder", readingOrderIndex], message: `unknown reading-order region: ${regionId}` });
      }
      if (readingOrderIds.has(regionId)) {
        ctx.addIssue({ code: "custom", path: ["pages", pageIndex, "readingOrder", readingOrderIndex], message: `duplicate reading-order region: ${regionId}` });
      }
      readingOrderIds.add(regionId);
    });
  });

  const journeyIds = new Set<string>();
  blueprint.journeys.forEach((journey, journeyIndex) => {
    if (journeyIds.has(journey.id)) {
      ctx.addIssue({ code: "custom", path: ["journeys", journeyIndex, "id"], message: `duplicate journey id: ${journey.id}` });
    }
    journeyIds.add(journey.id);

    journey.steps.forEach((step, stepIndex) => {
      if (!regionsByPage.get(step.pageId)?.has(step.regionId)) {
        ctx.addIssue({
          code: "custom",
          path: ["journeys", journeyIndex, "steps", stepIndex],
          message: `unknown page-region pair: ${step.pageId}/${step.regionId}`,
        });
      }
    });
  });
}

export const CustomerSolutionBlueprintSchema = z
  .object({
    schema: z.literal("kf-design-plan/v3"),
    displayName: blueprintText,
    objective: blueprintText,
    audiences: blueprintTextList.min(1),
    scenarios: blueprintTextList.min(1),
    pages: z.array(BlueprintPageSchema).min(1).max(8),
    journeys: z.array(BlueprintJourneySchema).min(1).max(12),
    visualDirection: BlueprintVisualDirectionSchema,
    acceptanceScenarios: blueprintTextList.min(1),
    openQuestions: blueprintTextList,
  })
  .strict()
  .superRefine(validateBlueprintReferences);

export type BlueprintRegion = z.infer<typeof BlueprintRegionSchema>;
export type BlueprintPage = z.infer<typeof BlueprintPageSchema>;
export type BlueprintJourney = z.infer<typeof BlueprintJourneySchema>;
export type CustomerSolutionBlueprint = z.infer<typeof CustomerSolutionBlueprintSchema>;
