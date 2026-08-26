import {
  canonicalServerHash,
  LEGACY_MODULE_PLAN_CANDIDATE_BUNDLE_HASH,
  type CapabilityCandidateBundle,
  type CompositionRecipe,
  type ControlCapability,
  type ControlDesignProfile,
  type CustomerSolutionBlueprint,
  type ScriptCapabilityProfile,
  type LayoutNode,
  type SolutionImplementationPlan,
  type SolutionNode,
} from "@kf/contracts";
import type { DesignKnowledgeSnapshot } from "../design-knowledge/design-knowledge-catalog.js";
import { createDefaultModuleRegistry } from "../modules/module-registry.js";
import { listControlCapabilities } from "../style/control-capability-registry.js";
import { buildBlueprintRegionQueries, type BlueprintRegionQuery } from "./blueprint-region-query.js";

const MAX_DETAILED_CAPABILITIES = 25;
const MIN_CONTROLS = 3;
const MAX_CONTROLS = 5;
const MIN_LAYOUTS = 1;
const MAX_LAYOUTS = 3;
const MAX_RECIPES = 3;
const CANDIDATE_SCORE_SIGNIFICANT_DIGITS = 12;
const NATURAL_INTERACTION_MAPPINGS: ReadonlyArray<readonly [string, RegExp]> = [
  ["navigate-page", /(?:点击|打开|进入|查看).*(?:详情|明细)|(?:详情|明细).*(?:打开|查看|进入)/],
  ["change", /筛选|过滤|搜索|检索|选择|选中|更改|变更/],
  ["tab-click", /(?:标签页?|页签).*(?:切换|点击|选择)|(?:切换|点击|选择).*(?:标签页?|页签)/],
  ["open-dialog", /(?:对话框|弹窗).*(?:打开|关闭|开关)|(?:打开|关闭).*(?:对话框|弹窗)/],
];

type RankedCandidate = CapabilityCandidateBundle["regions"][number]["controls"][number];

interface RankedRegionDraft {
  readonly query: BlueprintRegionQuery;
  readonly controls: readonly RankedCandidate[];
  readonly layouts: readonly RankedCandidate[];
  readonly recipes: readonly RankedCandidate[];
}

export interface CapabilityRetrievalInput {
  readonly blueprint: CustomerSolutionBlueprint;
  readonly knowledge: DesignKnowledgeSnapshot;
}

interface ScoreComponents {
  readonly roleOverlap: number;
  readonly dataShapeMatch: number;
  readonly regionMatch: number;
  readonly densityMatch: number;
  readonly interactionCoverage: number;
  readonly companionCompatibility: number;
  readonly avoidForMatch: number;
  readonly technicalLimitationMatch: number;
}

function compareCodePoints(left: string, right: string): number {
  const leftPoints = Array.from(left);
  const rightPoints = Array.from(right);
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const difference = leftPoints[index]!.codePointAt(0)! - rightPoints[index]!.codePointAt(0)!;
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return leftPoints.length === rightPoints.length ? 0 : leftPoints.length < rightPoints.length ? -1 : 1;
}

function canonicalHash(value: unknown): string {
  return canonicalServerHash(value);
}

function normalizeText(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase("en-US").trim();
}

/** Chinese is represented by character bigrams; ASCII-like content by lower-case words. */
function tokenize(...values: readonly string[]): ReadonlySet<string> {
  const tokens = new Set<string>();
  for (const value of values) {
    const normalized = normalizeText(value);
    for (const word of normalized.match(/[a-z0-9]+(?:[._-][a-z0-9]+)*/g) ?? []) tokens.add(word);
    for (const sequence of normalized.match(/[\p{Script=Han}]+/gu) ?? []) {
      const characters = Array.from(sequence);
      if (characters.length === 1) tokens.add(characters[0]!);
      for (let index = 0; index + 1 < characters.length; index += 1) {
        tokens.add(`${characters[index]}${characters[index + 1]}`);
      }
    }
  }
  return tokens;
}

function intersectionSize(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  let count = 0;
  for (const token of left) if (right.has(token)) count += 1;
  return count;
}

function coverage(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  return left.size === 0 ? 0 : intersectionSize(left, right) / left.size;
}

function textAffinity(leftValues: readonly string[], rightValues: readonly string[]): number {
  const left = tokenize(...leftValues);
  const right = tokenize(...rightValues);
  if (left.size === 0 || right.size === 0) return 0;
  return intersectionSize(left, right) / Math.min(left.size, right.size);
}

function guidanceMatch(guidance: readonly string[], queryText: readonly string[]): number {
  return guidance.reduce((highest, item) => Math.max(highest, textAffinity([item], queryText)), 0);
}

function queryText(query: BlueprintRegionQuery): readonly string[] {
  return [query.purpose, query.visualIntent, ...query.semanticRoles, query.dataShape, ...query.interactions];
}

function supportedInteractionIds(profile: ScriptCapabilityProfile | undefined): ReadonlySet<string> {
  if (profile === undefined) return new Set();
  return new Set([
    ...profile.actions.filter((item) => item.availability === "supported").map((item) => item.semanticAction),
    ...profile.events.filter((item) => item.availability === "supported").map((item) => item.semanticEvent),
    ...profile.methods.filter((item) => item.availability === "supported").map((item) => item.semanticMethod),
  ]);
}

function requiredInteractionIds(
  query: BlueprintRegionQuery,
  knownInteractionIds: ReadonlySet<string>,
): readonly string[] {
  const found = new Set<string>();
  for (const interaction of query.interactions) {
    const normalized = normalizeText(interaction);
    if (/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(normalized)) found.add(normalized);
    for (const token of normalized.match(/[a-z][a-z0-9]*(?:-[a-z0-9]+)*/g) ?? []) {
      if (knownInteractionIds.has(token)) found.add(token);
    }
    for (const [semanticId, pattern] of NATURAL_INTERACTION_MAPPINGS) {
      if (knownInteractionIds.has(semanticId) && pattern.test(normalized)) found.add(semanticId);
    }
  }
  return [...found].sort(compareCodePoints);
}

function scoreValue(components: ScoreComponents): number {
  return (
    40 * components.roleOverlap
    + 25 * components.dataShapeMatch
    + 15 * components.regionMatch
    + 10 * components.densityMatch
    + 10 * components.interactionCoverage
    + 8 * components.companionCompatibility
    - 60 * components.avoidForMatch
    - 20 * components.technicalLimitationMatch
  );
}

function compareRankedCandidates(
  left: Pick<RankedCandidate, "id" | "score">,
  right: Pick<RankedCandidate, "id" | "score">,
): number {
  return right.score - left.score || compareCodePoints(left.id, right.id);
}

function quantizeCandidateScore(score: number): number {
  if (!Number.isFinite(score)) throw new Error("CAPABILITY_SCORE_INVALID: score must be finite");
  return Number(score.toPrecision(CANDIDATE_SCORE_SIGNIFICANT_DIGITS));
}

function candidateForTransport(candidate: RankedCandidate): RankedCandidate {
  return { ...candidate, score: quantizeCandidateScore(candidate.score) };
}

/** Test-only access for proving exact scoring arithmetic and ordering. */
export const __capabilityRetrievalTestHooks = Object.freeze({
  scoreValue,
  compareRankedCandidates,
  quantizeCandidateScore,
});

function scoreReasons(components: ScoreComponents): readonly string[] {
  const reasons: string[] = [];
  if (components.roleOverlap !== 0) reasons.push(`Semantic role overlap ${components.roleOverlap.toFixed(2)}.`);
  if (components.dataShapeMatch !== 0) reasons.push("Data shape matches the region.");
  if (components.regionMatch !== 0) reasons.push(`Region purpose match ${components.regionMatch.toFixed(2)}.`);
  if (components.densityMatch !== 0) reasons.push("Density matches the region.");
  if (components.interactionCoverage !== 0) reasons.push(`Required interaction coverage ${components.interactionCoverage.toFixed(2)}.`);
  if (components.companionCompatibility !== 0) reasons.push("Recommended companions fit another region need.");
  if (components.avoidForMatch !== 0) reasons.push(`Negative design guidance match ${components.avoidForMatch.toFixed(2)}.`);
  if (components.technicalLimitationMatch !== 0) reasons.push(`Technical limitation match ${components.technicalLimitationMatch.toFixed(2)}.`);
  return reasons.length > 0 ? reasons : ["Deterministic fallback after technical filtering."];
}

function companionCompatibility(
  profile: ControlDesignProfile,
  query: BlueprintRegionQuery,
  profilesById: ReadonlyMap<string, ControlDesignProfile>,
): number {
  const queryRoles = new Set(query.semanticRoles.map(normalizeText));
  return profile.recommendedCompanions.some((id) => {
    const companion = profilesById.get(id);
    return companion !== undefined && (
      companion.dataShapes.includes(query.dataShape as never)
      || companion.semanticRoles.some((role) => queryRoles.has(normalizeText(role)))
    );
  }) ? 1 : 0;
}

function controlComponents(
  profile: ControlDesignProfile,
  query: BlueprintRegionQuery,
  requirements: readonly string[],
  scriptProfile: ScriptCapabilityProfile | undefined,
  profilesById: ReadonlyMap<string, ControlDesignProfile>,
  limitations: readonly string[],
): ScoreComponents {
  const queryRoles = new Set(query.semanticRoles.map(normalizeText));
  const profileRoles = new Set(profile.semanticRoles.map(normalizeText));
  const supported = supportedInteractionIds(scriptProfile);
  const matchedInteractions = requirements.filter((interaction) => supported.has(interaction)).length;
  return {
    roleOverlap: coverage(queryRoles, profileRoles),
    dataShapeMatch: profile.dataShapes.includes(query.dataShape as never) ? 1 : 0,
    regionMatch: guidanceMatch(profile.useFor, [query.purpose, query.visualIntent]),
    densityMatch: profile.densities.includes(query.density) ? 1 : 0,
    interactionCoverage: requirements.length === 0 ? 0 : matchedInteractions / requirements.length,
    companionCompatibility: companionCompatibility(profile, query, profilesById),
    avoidForMatch: guidanceMatch(profile.avoidFor, queryText(query)),
    technicalLimitationMatch: guidanceMatch(limitations, query.interactions),
  };
}

function isTechnicallyGeneratable(capability: ControlCapability): boolean {
  return capability.generation.status !== "unsupported" && capability.generation.status !== "preserve-only";
}

function isGalleryNarrative(query: BlueprintRegionQuery): boolean {
  const normalized = normalizeText(queryText(query).join(" "));
  return ["gallery", "portfolio", "media", "画廊", "作品", "媒体", "图片主导", "叙事"]
    .some((term) => normalized.includes(term));
}

function rankedControls(
  query: BlueprintRegionQuery,
  knowledge: DesignKnowledgeSnapshot,
  category: "control" | "layout",
): readonly RankedCandidate[] {
  const capabilitiesById = new Map(listControlCapabilities().map((item) => [item.id, item]));
  const profilesById = new Map(knowledge.controlDesignProfiles.map((item) => [item.capabilityId, item]));
  const scriptsById = new Map(knowledge.scriptCapabilityProfiles.map((item) => [item.capabilityId, item]));
  const knownInteractionIds = new Set(knowledge.scriptCapabilityProfiles.flatMap((profile) => [
    ...profile.actions.map((item) => item.semanticAction),
    ...profile.events.map((item) => item.semanticEvent),
    ...profile.methods.map((item) => item.semanticMethod),
  ]));
  const requirements = category === "control" ? requiredInteractionIds(query, knownInteractionIds) : [];
  const candidates: RankedCandidate[] = [];

  for (const profile of knowledge.controlDesignProfiles) {
    const technical = capabilitiesById.get(profile.capabilityId);
    if (technical === undefined || !isTechnicallyGeneratable(technical)) continue;
    const isLayout = technical.category === "layout";
    if ((category === "layout") !== isLayout) continue;
    const supported = supportedInteractionIds(scriptsById.get(profile.capabilityId));
    if (requirements.some((requirement) => !supported.has(requirement))) continue;
    const components = controlComponents(
      profile,
      query,
      requirements,
      scriptsById.get(profile.capabilityId),
      profilesById,
      [...technical.limitations, ...(scriptsById.get(profile.capabilityId)?.limitations ?? [])],
    );
    if (profile.capabilityId === "easyui.1" && isGalleryNarrative(query) && components.avoidForMatch > 0) continue;
    candidates.push({
      id: profile.capabilityId,
      score: scoreValue(components),
      reasons: [...scoreReasons(components)],
      limitations: [...new Set([...technical.limitations, ...(scriptsById.get(profile.capabilityId)?.limitations ?? [])])]
        .slice(0, 8),
      knowledgeVersion: profile.version,
    });
  }

  return candidates.sort(compareRankedCandidates);
}

function recipeComponents(
  recipe: CompositionRecipe,
  query: BlueprintRegionQuery,
  profilesById: ReadonlyMap<string, ControlDesignProfile>,
): ScoreComponents {
  const roles = [...recipe.requiredRoles, ...recipe.optionalRoles];
  const queryRoles = new Set(query.semanticRoles.map(normalizeText));
  const referencedProfiles = roles.flatMap((role) => role.capabilityCandidates)
    .map((id) => profilesById.get(id))
    .filter((profile): profile is ControlDesignProfile => profile !== undefined);
  const recipeRoles = new Set([
    ...roles.map((role) => normalizeText(role.role)),
    ...referencedProfiles.flatMap((profile) => profile.semanticRoles.map(normalizeText)),
  ]);
  return {
    roleOverlap: coverage(queryRoles, recipeRoles),
    dataShapeMatch: referencedProfiles.some((profile) => profile.dataShapes.includes(query.dataShape as never)) ? 1 : 0,
    regionMatch: guidanceMatch([recipe.purpose, ...recipe.useFor], [query.purpose, query.visualIntent]),
    densityMatch: referencedProfiles.some((profile) => profile.densities.includes(query.density)) ? 1 : 0,
    interactionCoverage: query.interactions.length === 0 ? 0 : textAffinity(recipe.interactionFlow, query.interactions),
    companionCompatibility: recipe.requiredRoles.length === 0 ? 0 : recipe.requiredRoles.filter((role) =>
      role.capabilityCandidates.some((id) => profilesById.has(id)),
    ).length / recipe.requiredRoles.length,
    avoidForMatch: guidanceMatch(recipe.avoidFor, queryText(query)),
    technicalLimitationMatch: 0,
  };
}

function rankedRecipes(
  query: BlueprintRegionQuery,
  knowledge: DesignKnowledgeSnapshot,
): readonly RankedCandidate[] {
  const profilesById = new Map(knowledge.controlDesignProfiles.map((item) => [item.capabilityId, item]));
  return knowledge.compositionRecipes.map((recipe) => {
    const components = recipeComponents(recipe, query, profilesById);
    return {
      id: recipe.id,
      score: scoreValue(components),
      reasons: [...scoreReasons(components)],
      limitations: [...recipe.designNotes].slice(0, 8),
      knowledgeVersion: recipe.version,
    };
  }).sort(compareRankedCandidates);
}

function requireMinimumCandidates(draft: RankedRegionDraft): void {
  const issues: string[] = [];
  if (draft.controls.length < MIN_CONTROLS) issues.push(`controls=${draft.controls.length}, required=${MIN_CONTROLS}`);
  if (draft.layouts.length < MIN_LAYOUTS) issues.push(`layouts=${draft.layouts.length}, required=${MIN_LAYOUTS}`);
  if (draft.recipes.length < 1) issues.push(`recipes=${draft.recipes.length}, required=1`);
  if (issues.length > 0) {
    throw new Error(`CAPABILITY_RETRIEVAL_BLOCKED: ${draft.query.pageId}/${draft.query.regionId}: ${issues.join(", ")}`);
  }
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

export function retrieveCapabilities(input: CapabilityRetrievalInput): CapabilityCandidateBundle {
  const drafts = buildBlueprintRegionQueries(input.blueprint).map((query): RankedRegionDraft => ({
    query,
    controls: rankedControls(query, input.knowledge, "control"),
    layouts: rankedControls(query, input.knowledge, "layout"),
    recipes: rankedRecipes(query, input.knowledge),
  }));
  drafts.forEach(requireMinimumCandidates);

  const detailedIds = new Set<string>();
  const reserveMinimum = (
    draft: RankedRegionDraft,
    ranked: readonly RankedCandidate[],
    minimum: number,
    label: string,
  ): void => {
    let selected = 0;
    for (const candidate of ranked) {
      if (!detailedIds.has(candidate.id) && detailedIds.size === MAX_DETAILED_CAPABILITIES) continue;
      detailedIds.add(candidate.id);
      selected += 1;
      if (selected === minimum) return;
    }
    throw new Error(
      `CAPABILITY_RETRIEVAL_BLOCKED: ${draft.query.pageId}/${draft.query.regionId}: `
      + `${label} cannot fit the ${MAX_DETAILED_CAPABILITIES}-profile detail budget`,
    );
  };
  for (const draft of drafts) {
    reserveMinimum(draft, draft.controls, MIN_CONTROLS, "controls");
    reserveMinimum(draft, draft.layouts, MIN_LAYOUTS, "layouts");
  }

  const regions = drafts.map((draft) => {
    const select = (ranked: readonly RankedCandidate[], maximum: number): RankedCandidate[] => {
      const selected: RankedCandidate[] = [];
      for (const candidate of ranked) {
        if (selected.length === maximum) break;
        if (detailedIds.has(candidate.id) || detailedIds.size < MAX_DETAILED_CAPABILITIES) {
          detailedIds.add(candidate.id);
          selected.push(candidateForTransport(candidate));
        }
      }
      return selected;
    };
    return {
      pageId: draft.query.pageId,
      regionId: draft.query.regionId,
      controls: select(draft.controls, MAX_CONTROLS),
      layouts: select(draft.layouts, MAX_LAYOUTS),
      recipes: draft.recipes.slice(0, MAX_RECIPES).map(candidateForTransport),
    };
  });

  return deepFreeze({
    schema: "kf-capability-candidates/v1",
    knowledgeCatalogVersion: input.knowledge.version,
    blueprintHash: canonicalHash(input.blueprint),
    regions,
    detailedCapabilityIds: [...detailedIds].sort(compareCodePoints),
    generatedAtPolicy: "deterministic-no-timestamp",
  });
}

const LAYOUT_CAPABILITIES: Readonly<Record<LayoutNode["layout"], readonly string[]>> = Object.freeze({
  row: Object.freeze(["layout.2"]),
  column: Object.freeze(["layout.4"]),
  grid: Object.freeze(["layout.2", "layout.4"]),
  "asymmetric-grid": Object.freeze(["layout.2", "layout.4"]),
  split: Object.freeze(["layout.2", "layout.4"]),
  stack: Object.freeze(["layout.4"]),
  dock: Object.freeze(["layout.5"]),
  "sidebar-content": Object.freeze(["layout.5"]),
  "master-detail": Object.freeze(["layout.2", "layout.5"]),
  "scroll-region": Object.freeze(["layout.4"]),
  "overlay-anchor": Object.freeze(["layout.5"]),
});

/** The single reviewed semantic-layout compatibility lookup shared by retrieval and compilation. */
export function layoutCapabilityIdsFor(kind: LayoutNode["layout"]): readonly string[] {
  return LAYOUT_CAPABILITIES[kind];
}

function unmatchedSourcePageRegions(
  sourcePageId: string,
  sourceRegionIds: readonly string[],
  bundle: CapabilityCandidateBundle,
  category: "controls" | "layouts" | "recipes",
  acceptedIds: ReadonlySet<string>,
): readonly string[] {
  const regionsById = new Map(bundle.regions.map((region) => [`${region.pageId}\u0000${region.regionId}`, region]));
  return sourceRegionIds.filter((regionId) => {
    const region = regionsById.get(`${sourcePageId}\u0000${regionId}`);
    return region === undefined || !region[category].some((candidate) => acceptedIds.has(candidate.id));
  }).map((regionId) => `${sourcePageId}/${regionId}`);
}

function walkNode(
  node: SolutionNode,
  sourcePageId: string,
  bundle: CapabilityCandidateBundle,
  issues: string[],
  registry: ReturnType<typeof createDefaultModuleRegistry>,
): void {
  if (node.kind === "control") {
    const unmatched = unmatchedSourcePageRegions(sourcePageId, node.sourceBlueprintRegionIds, bundle, "controls", new Set([node.capabilityId]));
    if (unmatched.length > 0) issues.push(`control ${node.id}: capability ${node.capabilityId} is not a candidate for page-regions [${unmatched.join(", ")}]`);
    return;
  }
  if (node.kind === "repeater") {
    walkNode(node.template, sourcePageId, bundle, issues, registry);
    return;
  }
  if (node.kind === "registered-module") {
    try {
      const definition = registry.require(node.moduleKind, node.templateVersion);
      if (!definition.variants.includes(node.variant)) {
        issues.push(`module ${node.id}: variant ${node.variant} is not registered for ${node.moduleKind}@${node.templateVersion}`);
      }
    } catch {
      issues.push(`module ${node.id}: ${node.moduleKind}@${node.templateVersion} is not registered`);
    }
    for (const slot of node.slots) {
      issues.push(`module ${node.id}: semantic slot ${slot.slotId} cannot be proven by the module registry (NEEDS_CONTEXT/BLOCKED)`);
      slot.children.forEach((child) => walkNode(child, sourcePageId, bundle, issues, registry));
    }
    return;
  }

  const acceptedLayouts = new Set(layoutCapabilityIdsFor(node.layout));
  const unmatchedLayouts = unmatchedSourcePageRegions(sourcePageId, node.sourceBlueprintRegionIds, bundle, "layouts", acceptedLayouts);
  if (unmatchedLayouts.length > 0) {
    issues.push(`layout ${node.id}: ${node.layout} is not backed by a layout candidate for page-regions [${unmatchedLayouts.join(", ")}]`);
  }
  if (node.recipeId !== undefined) {
    const unmatchedRecipes = unmatchedSourcePageRegions(sourcePageId, node.sourceBlueprintRegionIds, bundle, "recipes", new Set([node.recipeId]));
    if (unmatchedRecipes.length > 0) issues.push(`layout ${node.id}: recipe ${node.recipeId} is not a candidate for page-regions [${unmatchedRecipes.join(", ")}]`);
  }
  node.children.forEach((child) => walkNode(child, sourcePageId, bundle, issues, registry));
}

export function assertSolutionPlanUsesCandidates(
  plan: SolutionImplementationPlan,
  bundle: CapabilityCandidateBundle,
): void {
  const issues: string[] = [];
  if (plan.blueprintHash !== bundle.blueprintHash) {
    issues.push(`blueprint hash: expected ${bundle.blueprintHash}, received ${plan.blueprintHash}`);
  }
  const expectedBundleHash = canonicalHash(bundle);
  if (plan.candidateBundleHash !== expectedBundleHash) {
    issues.push(`candidate bundle hash: expected ${expectedBundleHash}, received ${plan.candidateBundleHash}`);
  }

  if (plan.candidateBundleHash !== LEGACY_MODULE_PLAN_CANDIDATE_BUNDLE_HASH) {
    const bundleIdentities = new Set(bundle.regions.map((region) =>
      `${region.pageId}\u0000${region.regionId}`,
    ));
    const planIdentities = new Set(plan.pages.flatMap((page) =>
      page.sourceBlueprintRegionIds.map((regionId) =>
        `${page.sourceBlueprintPageId}\u0000${regionId}`,
      ),
    ));
    const displayIdentities = (identities: readonly string[]): string => identities
      .map((identity) => identity.replace("\u0000", "/"))
      .sort(compareCodePoints)
      .join(", ");
    const missing = [...bundleIdentities].filter((identity) => !planIdentities.has(identity));
    const extra = [...planIdentities].filter((identity) => !bundleIdentities.has(identity));
    if (missing.length > 0) issues.push(`missing plan page-region provenance [${displayIdentities(missing)}]`);
    if (extra.length > 0) issues.push(`extra plan page-region provenance [${displayIdentities(extra)}]`);
  }

  const registry = createDefaultModuleRegistry();
  plan.pages.forEach((page) => walkNode(page.root, page.sourceBlueprintPageId, bundle, issues, registry));
  plan.overlays.forEach((overlay) => walkNode(overlay.root, overlay.sourceBlueprintPageId, bundle, issues, registry));
  if (issues.length > 0) {
    throw new Error(`SOLUTION_PLAN_CANDIDATE_MISMATCH: ${[...new Set(issues)].sort(compareCodePoints).join("; ")}`);
  }
}
