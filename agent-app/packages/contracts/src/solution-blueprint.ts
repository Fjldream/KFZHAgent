import { z } from "zod";

const implementationFieldNames = new Set([
  "expectedkind",
  "modulekind",
  "modulekinds",
  "capabilityid",
  "capabilityids",
  "guid",
  "objecttype",
  "uimodeltype",
  "x",
  "y",
  "coordinate",
  "coordinates",
  "coords",
  "bounds",
  "rect",
  "xpos",
  "ypos",
  "geometry",
  "left",
  "top",
  "lefttoppt",
  "styledata",
  "styledatanew",
  "selector",
  "css",
  "js",
  "javascript",
  "linkid",
  "configuredata",
]);
const canonicalUuid = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;
const quotedObjectKey = /\\?["']([A-Za-z][A-Za-z0-9_. -]*)\\?["']\s*:/g;
const implementationAssignment = /\b([A-Za-z][A-Za-z0-9_. -]*)\s*(?:=|:)/g;
const dottedImplementationToken = /\b(?:content|data|feedback|form|interaction|metric|navigation)\.[A-Za-z][A-Za-z0-9_-]*(?:\.[A-Za-z][A-Za-z0-9_-]*)*\b/i;
const cssDeclaration = /(?:^|[;{]\s*)(?:color|display|position|width|height|margin(?:-[a-z]+)?|padding(?:-[a-z]+)?|background(?:-[a-z]+)?|border(?:-[a-z]+)?|font(?:-[a-z]+)?|opacity|z-index|flex(?:-[a-z]+)?|grid(?:-[a-z]+)?|transform|transition|animation)\s*:\s*[^;{}\n]+(?:;|}|$)/i;
const cssCustomProperty = /(?:^|[;{]\s*)--[A-Za-z0-9_-]+\s*:\s*[^;{}\n]+(?:;|}|$)/;
const cssPseudoElement = /(?:^|\s)(?:[.#][A-Za-z_-][A-Za-z0-9_-]*|button|input|select|textarea|a|form|table|tr|td|div|span|section|main|header|footer|nav|label)::[A-Za-z-]+(?:\([^)]*\))?/i;
const cssSelector = /(?:^|\s)(?:#[A-Za-z_-][A-Za-z0-9_-]*(?:\s*[>+~]\s*|\s*:[A-Za-z-]+|\s*\{)|\.[A-Za-z_-][A-Za-z0-9_-]*(?:\s*[>+~]\s*|\s*:[A-Za-z-]+|\s*\{)|\[[A-Za-z_-][A-Za-z0-9_-]*[~|^$*]?=[^\]]+\]|\[(?:data|aria)-[A-Za-z0-9_-]+(?:[~|^$*]?=[^\]]+)?\]|\[(?:disabled|checked|selected|readonly|required|hidden|multiple|open)\]|[A-Za-z_-][A-Za-z0-9_-]*\[(?:data|aria)-[A-Za-z0-9_-]+(?:[~|^$*]?=[^\]]+)?\]|\b(?:button|input|select|textarea|a|form|table|tr|td|div|span|section|main|header|footer|nav|label):[A-Za-z-]+)/i;
const staticModuleStatement = /(?:^|\n)\s*(?:export\s+(?:default\b|(?:const|let|var|function|class)\b|\{|\*)|import\s+(?:[A-Za-z_$*{]|["']))[^\n]*(?:$|\n)/i;
const identifierCall = /\b([A-Za-z_$][A-Za-z0-9_$]*)(\s*)\(([^()]*)\)/g;
const dangerousBuiltinNames = new Set([
  "window",
  "document",
  "globalthis",
  "eval",
  "function",
  "settimeout",
  "setinterval",
  "fetch",
  "require",
  "import",
]);

function normalizeImplementationKey(value: string): string {
  return value.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
}

function isImplementationFieldName(value: string): boolean {
  return implementationFieldNames.has(normalizeImplementationKey(value));
}

function isRawJsonPayload(value: string): boolean {
  const trimmed = value.trim();
  if (!/^[{[]/.test(trimmed)) return false;
  try {
    const parsed: unknown = JSON.parse(trimmed);
    return Array.isArray(parsed) || (typeof parsed === "object" && parsed !== null);
  } catch {
    return false;
  }
}

function containsQuotedImplementationKey(value: string): boolean {
  quotedObjectKey.lastIndex = 0;
  for (const match of value.matchAll(quotedObjectKey)) {
    if (isImplementationFieldName(match[1]!)) return true;
  }
  return false;
}

function containsImplementationAssignment(value: string): boolean {
  implementationAssignment.lastIndex = 0;
  for (const match of value.matchAll(implementationAssignment)) {
    if (isImplementationFieldName(match[1]!)) return true;
  }
  return false;
}

function isCamelOrPascalIdentifier(value: string): boolean {
  return /^[a-z]+(?:[A-Z][A-Za-z0-9_$]*)+$/.test(value)
    || /^[A-Z][a-z]+(?:[A-Z][A-Za-z0-9_$]*)+$/.test(value);
}

function containsJavascriptCall(value: string): boolean {
  identifierCall.lastIndex = 0;
  for (const match of value.matchAll(identifierCall)) {
    const name = match[1]!;
    const whitespace = match[2]!;
    const argumentsText = match[3]!;
    const uppercaseChineseLabel = /^[A-Z]{2,}$/.test(name) && /[\u3400-\u9fff]/.test(argumentsText);
    const numericVersionLabel = /^version$/i.test(name) && /^\s*\d+(?:\.\d+)+\s*$/.test(argumentsText);
    if (uppercaseChineseLabel || numericVersionLabel) continue;
    if (whitespace.length === 0) return true;
    if (isCamelOrPascalIdentifier(name) || dangerousBuiltinNames.has(name.toLowerCase())) return true;
  }
  return false;
}

function implementationTextIssue(value: string): string | undefined {
  if (canonicalUuid.test(value)) return "canonical UUID/GUID values are not allowed";
  if (isRawJsonPayload(value)) return "raw JSON payloads are not allowed";
  if (containsQuotedImplementationKey(value)) return "implementation JSON keys are not allowed";
  if (containsImplementationAssignment(value)) return "implementation assignments are not allowed";
  if (dottedImplementationToken.test(value)) return "dot-delimited implementation tokens are not allowed";
  if (cssDeclaration.test(value) || cssCustomProperty.test(value) || cssPseudoElement.test(value) || cssSelector.test(value)) return "CSS declarations and selectors are not allowed";
  if (staticModuleStatement.test(value)) return "static JavaScript module statements are not allowed";
  if (containsJavascriptCall(value)) return "JavaScript calls are not allowed";
  return undefined;
}

/** 递归地排除平台实现数据，从每个v3值中。 */
function validateImplementationFree(value: unknown, ctx: z.RefinementCtx, path: Array<string | number> = []): void {
  if (typeof value === "string") {
    const message = implementationTextIssue(value);
    if (message !== undefined) ctx.addIssue({ code: "custom", path, message });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateImplementationFree(item, ctx, [...path, index]));
    return;
  }
  if (typeof value === "object" && value !== null) {
    Object.entries(value).forEach(([key, item]) => {
      if (isImplementationFieldName(key)) {
        ctx.addIssue({ code: "custom", path: [...path, key], message: "implementation fields are not allowed" });
      }
      validateImplementationFree(item, ctx, [...path, key]);
    });
  }
}

/** 仅限客户面语言；仅限检查的实现检查在根处递归运行。 */
const blueprintText = z
  .string()
  .trim()
  .min(1)
  .max(600);

const blueprintTextList = z.array(blueprintText).max(12);

/** 稳定的语义身份，永远不是平台生成的标识符。 */
const blueprintId = z
  .string()
  .trim()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
  .refine((value) => !isImplementationFieldName(value), "implementation identifiers are not allowed");

const BlueprintSampleDataSchema = z
  .record(z.string().trim().min(1).max(100), blueprintText);

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
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    visualRegionIds: z.array(z.string().min(1).max(128).regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)).min(1).max(100)
      .refine((ids) => new Set(ids).size === ids.length, "duplicate visual region reference").optional(),
    // end
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

// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
const BlueprintJourneyStepBaseSchema = z
  .object({
    pageId: blueprintId,
    regionId: blueprintId,
    action: blueprintText,
    result: blueprintText,
  })
  .strict();

export const BlueprintJourneyStepSchema = z.union([
  BlueprintJourneyStepBaseSchema.extend({ kind: z.literal("interact").optional() }).strict(),
  BlueprintJourneyStepBaseSchema.extend({
    kind: z.literal("observe"),
    expectedTexts: blueprintTextList.min(1).refine((texts) => new Set(texts).size === texts.length, "duplicate expected text"),
  }).strict(),
]);
// end

export const BlueprintJourneySchema = z
  .object({
    id: blueprintId,
    actor: blueprintText,
    goal: blueprintText,
    steps: z.array(BlueprintJourneyStepSchema).min(1).max(12),
    // modified by jinlong.feng at 2026-10-26 Agent工作台迭代
    completion: blueprintText.optional(),
    // end
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
  .superRefine((blueprint, ctx) => {
    validateImplementationFree(blueprint, ctx);
    validateBlueprintReferences(blueprint, ctx);
  });

export type BlueprintRegion = z.infer<typeof BlueprintRegionSchema>;
export type BlueprintPage = z.infer<typeof BlueprintPageSchema>;
export type BlueprintJourney = z.infer<typeof BlueprintJourneySchema>;
export type CustomerSolutionBlueprint = z.infer<typeof CustomerSolutionBlueprintSchema>;
// modified by jinlong.feng at 2026-10-23 Agent工作台迭代
/** Structural model guidance only. Runtime validation still enforces references and implementation-free customer text. */
export function getCustomerSolutionBlueprintJsonSchema() {
  return z.toJSONSchema(CustomerSolutionBlueprintSchema, { target: "draft-7" });
}
// end
