import { createHash } from "node:crypto";
import {
  canonicalServerHash,
  SolutionImplementationPlanSchema,
  type ActionPlan,
  type ModuleInteraction,
  type ModulePlan,
  type ModulePlanModule,
  type NodeIntent,
  type RegisteredModuleNode,
  type SemanticEventBinding,
  type SemanticValue,
  type SolutionImplementationPlan,
} from "@kf/contracts";

const LEGACY_CANDIDATE_BUNDLE_HASH = createHash("sha256")
  .update("legacy-module-plan-adapter/v1")
  .digest("hex");

const LAYOUT_BY_MODE = {
  "vertical-flow": "column",
  "dashboard-grid": "grid",
  "admin-shell": "sidebar-content",
} as const;

const EMPHASIS_INTENT = {
  primary: { importance: "primary", visualWeight: 5 },
  secondary: { importance: "secondary", visualWeight: 3 },
  subtle: { importance: "supporting", visualWeight: 1 },
} as const;

const HEIGHT_INTENT = {
  compact: { density: "compact", height: { mode: "ratio", value: 1 } },
  small: { density: "compact", height: { mode: "ratio", value: 2 } },
  medium: { density: "comfortable", height: { mode: "ratio", value: 3 } },
  large: { density: "spacious", height: { mode: "ratio", value: 4 } },
  full: { density: "spacious", height: { mode: "fill" } },
} as const;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function allocateGeneratedId(prefix: string, identity: string, usedIds: Set<string>): string {
  const base = `${prefix}-${digest(identity).slice(0, 16)}`;
  let candidate = base;
  let suffix = 2;
  while (usedIds.has(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }
  usedIds.add(candidate);
  return candidate;
}

function uniqueProvenanceIds(modules: readonly ModulePlanModule[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const module of modules) {
    for (const id of module.sourceBlueprintModuleIds ?? [module.id]) {
      if (seen.has(id)) continue;
      seen.add(id);
      result.push(id);
    }
  }
  return result;
}

function toSemanticValue(value: unknown): SemanticValue {
  if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return { kind: "list", items: value.map(toSemanticValue) };
  return {
    kind: "record",
    fields: Object.entries(value as Record<string, unknown>)
      .map(([name, fieldValue]) => ({ name, value: toSemanticValue(fieldValue) })),
  };
}

function convertContent(content: string | undefined): SemanticValue | undefined {
  if (content === undefined) return undefined;
  try {
    return toSemanticValue(JSON.parse(content) as unknown);
  } catch {
    return content;
  }
}

function moduleIntent(module: ModulePlanModule): NodeIntent {
  const emphasis = EMPHASIS_INTENT[module.placement.emphasis];
  const height = HEIGHT_INTENT[module.placement.preferredHeight];
  return {
    importance: emphasis.importance,
    visualWeight: emphasis.visualWeight,
    readingOrder: module.placement.order,
    density: height.density,
    groupWith: [],
    width: { mode: "ratio", value: module.placement.columnSpan },
    height: height.height,
    align: module.placement.alignment,
  };
}

function rootIntent(): NodeIntent {
  return {
    importance: "primary",
    visualWeight: 5,
    readingOrder: 0,
    density: "comfortable",
    groupWith: [],
    width: { mode: "fill" },
    height: { mode: "content" },
    align: "stretch",
  };
}

function convertNavigation(
  interaction: ModuleInteraction,
  identity: string,
  usedIds: Set<string>,
): ActionPlan | undefined {
  if (interaction.type !== "navigate") return undefined;
  return {
    id: allocateGeneratedId("legacy-action", identity, usedIds),
    kind: "navigate-page",
    targetPageId: interaction.pageId,
    afterActionIds: [],
  };
}

function convertModule(
  module: ModulePlanModule,
  pageId: string,
  usedIds: Set<string>,
  actions: ActionPlan[],
): RegisteredModuleNode {
  const actionIdsByEvent = new Map<string, string[]>();
  module.interactions.forEach((interaction, interactionIndex) => {
    const action = convertNavigation(
      interaction,
      `${pageId}\u0000${module.id}\u0000${interactionIndex}\u0000${interaction.type}`,
      usedIds,
    );
    if (action === undefined) return;
    actions.push(action);
    const ids = actionIdsByEvent.get(interaction.type) ?? [];
    ids.push(action.id);
    actionIdsByEvent.set(interaction.type, ids);
  });

  const eventBindings: SemanticEventBinding[] = Array.from(actionIdsByEvent, ([semanticEvent, actionIds]) => ({
    semanticEvent: semanticEvent as SemanticEventBinding["semanticEvent"],
    actionIds,
  }));
  const content = convertContent(module.content);
  return {
    id: module.id,
    kind: "registered-module",
    moduleKind: module.kind,
    templateVersion: module.templateVersion,
    variant: module.variant,
    title: module.title,
    ...(content === undefined ? {} : { content }),
    ...(module.assetId === undefined ? {} : { assetId: module.assetId }),
    sourceBlueprintRegionIds: [...(module.sourceBlueprintModuleIds ?? [module.id])],
    intent: moduleIntent(module),
    eventBindings,
    slots: [],
  };
}

/** Converts a final legacy ModulePlan snapshot into the semantic planning tree. */
export function adaptLegacyModulePlan(plan: ModulePlan): SolutionImplementationPlan {
  const usedIds = new Set([
    ...plan.pages.map((page) => page.id),
    ...plan.pages.flatMap((page) => page.modules.map((module) => module.id)),
  ]);
  const actions: ActionPlan[] = [];
  const pages = plan.pages.map((page) => {
    const sourceBlueprintRegionIds = uniqueProvenanceIds(page.modules);
    return {
      id: page.id,
      title: page.title,
      purpose: page.title,
      canvas: "responsive" as const,
      sourceBlueprintPageId: page.id,
      sourceBlueprintRegionIds,
      initialStateIds: [],
      root: {
        id: allocateGeneratedId("legacy-layout", page.id, usedIds),
        kind: "layout" as const,
        layout: LAYOUT_BY_MODE[page.mode],
        sourceBlueprintRegionIds: [...sourceBlueprintRegionIds],
        intent: rootIntent(),
        children: page.modules.map((module) => convertModule(module, page.id, usedIds, actions)),
      },
    };
  });

  return SolutionImplementationPlanSchema.parse({
    schema: "kf-solution-implementation/v1",
    projectKey: plan.projectKey,
    blueprintHash: canonicalServerHash(plan),
    candidateBundleHash: LEGACY_CANDIDATE_BUNDLE_HASH,
    theme: plan.theme,
    roleStyles: [],
    mockData: [],
    localState: [],
    pages,
    overlays: [],
    actions,
    scripts: [],
  });
}
