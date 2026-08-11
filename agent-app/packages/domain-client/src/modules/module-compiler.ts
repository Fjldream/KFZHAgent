import {
  AcceptedBlueprintArtifactSchema,
  CustomerEffectBlueprintSchema,
  canonicalModuleCompilationHash,
  type CustomerEffectBlueprint,
  type AcceptedBlueprintArtifact,
  type ModuleCompilationArtifact,
  ModuleDeliveryGapSchema,
  type ModuleDeliveryReport,
  ModulePlanSchema,
  ModuleTraceSchema,
  ResolvedAssetSchema,
  UIImplementationSpecSchema,
  type ModuleDeliveryGap,
  type ModuleCompilationMetadata,
  type ModulePlan,
  type ModulePlanModule,
  type ModuleTrace,
  type ResolvedAsset,
  type UIComponentSpec,
  type UIImplementationSpec,
} from "@kf/contracts";
import {
  readVerifiedAcceptedBlueprintArtifact,
  readVerifiedModuleCompilationArtifact,
  readVerifiedProjectCreationSeedArtifact,
  type VerifiedAcceptedBlueprintArtifact,
  type VerifiedModuleCompilationArtifact,
  type VerifiedProjectCreationSeedArtifact,
} from "@kf/build-jobs";
import { isDeepStrictEqual } from "node:util";
import { solvePageLayout, type ModuleBounds } from "./layout/layout-engine.js";
import type { PageLayoutIssue } from "./layout/layout-errors.js";
import { ModuleRegistry } from "./module-registry.js";
import { stableModuleComponentId } from "./stable-ids.js";
import { resolveModuleComponentStyle, type ModuleThemeRole } from "./theme/module-theme.js";
import type { ModuleCompileOutput, ModuleValidationContext } from "./types.js";
import { diffModulePlans, UnexpectedModuleChangeError, type ModulePlanDiff } from "./module-diff.js";
import { evaluateModuleDelivery } from "./module-quality.js";

export interface ResolvedAssetBinding {
  readonly moduleId: string;
  readonly assetId: string;
  readonly resolvedName?: string;
}

export interface ModuleCompilationResult {
  readonly status: "compiled";
  readonly implementation: UIImplementationSpec;
  readonly metadata: ModuleCompilationMetadata;
  readonly artifactCandidate: Omit<ModuleCompilationArtifact, "signature">;
  readonly traces: readonly ModuleTrace[];
  readonly assetBindings: readonly ResolvedAssetBinding[];
  readonly gaps: readonly ModuleDeliveryGap[];
  readonly deliveryReport?: ModuleDeliveryReport;
  readonly diff?: ModulePlanDiff;
}

export interface ModuleCompilationBlockedResult {
  readonly status: "blocked";
  readonly traces: readonly ModuleTrace[];
  readonly assetBindings: readonly ResolvedAssetBinding[];
  readonly gaps: readonly ModuleDeliveryGap[];
  readonly metadata: ModuleCompilationMetadata;
  /** Diagnostic-only candidate; blocked output can never be signed or built. */
  readonly implementation?: UIImplementationSpec;
  readonly deliveryReport?: ModuleDeliveryReport;
  readonly diff?: ModulePlanDiff;
}

export type ModuleCompilationOutcome = ModuleCompilationResult | ModuleCompilationBlockedResult;

export interface CompileModulePlanInput {
  readonly plan: ModulePlan;
  /** Runtime-branded result of verifying the persisted accepted blueprint artifact. */
  readonly acceptedBlueprintArtifact: VerifiedAcceptedBlueprintArtifact;
  readonly registry: ModuleRegistry;
  /** Opaque IDs resolve to safe metadata only; paths and storage keys never enter this boundary. */
  readonly assetsById: Readonly<Record<string, ResolvedAsset>>;
  /** Required only when both previousPlan and previousImplementation form a module revision. */
  readonly previousCompilationArtifact?: VerifiedModuleCompilationArtifact;
  /** Optional server-issued project seed evidence; it reports residue and never authorizes deletion. */
  readonly projectCreationSeedArtifact?: VerifiedProjectCreationSeedArtifact;
  readonly previousPlan?: ModulePlan;
  readonly previousImplementation?: UIImplementationSpec;
  /** Trusted capability and WebContainer authorization facts. Strictly empty by default. */
  readonly validationContext?: ModuleValidationContext;
}

const EMPTY_VALIDATION_CONTEXT: ModuleValidationContext = Object.freeze({
  availableKfCapabilities: Object.freeze([]),
  approvedAuthorizationRefs: Object.freeze([]),
});
const FORBIDDEN_PROPERTY_KEY = /(?:css|native|guid|path|storagekey|styledata|script)$/i;
const FORBIDDEN_TEXT = /<\/?script\b|javascript\s*:|data\s*:\s*text\s*\/\s*html|<style\b/i;
const GUID_VALUE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;
const ABSOLUTE_PATH = /(?:^|\s)(?:[A-Za-z]:[\\/]|\\\\|\/)/;

export function createAcceptedBlueprintArtifactPayload(input: {
  readonly blueprint: CustomerEffectBlueprint;
  readonly projectKey: string;
  readonly revisionId: string;
  readonly registry: ModuleRegistry;
}): Omit<AcceptedBlueprintArtifact, "signature"> {
  const blueprint = CustomerEffectBlueprintSchema.parse(input.blueprint);
  const catalog = input.registry.listForInternalPlanning();
  const modules = blueprint.modules.map((module) => {
    if (module.expectedKind === undefined) throw new Error(`ACCEPTED_BLUEPRINT_EXPECTED_KIND_REQUIRED: ${module.id}`);
    const candidates = catalog.filter((entry) => entry.kind === module.expectedKind);
    const definitions = candidates.map((entry) => input.registry.require(entry.kind, entry.version));
    const categories = new Set(definitions.map((definition) => definition.category));
    if (candidates.length === 0 || categories.size !== 1) throw new Error(`ACCEPTED_BLUEPRINT_KIND_NOT_EXACT: ${module.id}`);
    const interactionRequirements = (module.interactionRequirements ?? []).map((requirement) => {
      if (!definitions.every((definition) => definition.layout.interactions.includes(requirement.type))) throw new Error(`ACCEPTED_BLUEPRINT_INTERACTION_UNREGISTERED: ${module.id}`);
      const actionKinds = new Set(definitions.map((definition) => definition.quality?.interactionActionKinds?.[requirement.type]));
      if (actionKinds.size !== 1 || actionKinds.has(undefined)) throw new Error(`ACCEPTED_BLUEPRINT_ACTION_UNREGISTERED: ${module.id}`);
      const actionKind = [...actionKinds][0]!;
      return { type: requirement.type, actionKind, target: requirement.target };
    }).sort(compareInteractionRequirements);
    return {
      blueprintModuleId: module.id,
      expectedKind: module.expectedKind,
      expectedCategory: definitions[0]!.category,
      interactionRequirements,
    };
  }).sort((left, right) => compareCodePoints(left.blueprintModuleId, right.blueprintModuleId));
  const parsed = AcceptedBlueprintArtifactSchema.parse({
    schema: "kf-accepted-blueprint-artifact/v1", projectKey: input.projectKey,
    revisionId: input.revisionId, blueprintHash: canonicalModuleCompilationHash(blueprint),
    modules, signature: "0".repeat(64),
  });
  const unsigned = { ...parsed };
  Reflect.deleteProperty(unsigned, "signature");
  return unsigned;
}

function compareInteractionRequirements(
  left: { type: string; actionKind: string; target: string },
  right: { type: string; actionKind: string; target: string },
): number {
  return compareCodePoints(left.type, right.type) || compareCodePoints(left.actionKind, right.actionKind) || compareCodePoints(left.target, right.target);
}

function verifiedPreviousMetadata(
  previousCompilationArtifact: VerifiedModuleCompilationArtifact | undefined,
  projectKey: string,
  previousPlan: ModulePlan | undefined,
  previousImplementation: UIImplementationSpec | undefined,
): ModuleCompilationMetadata | undefined {
  const hasModuleRevision = previousPlan !== undefined;
  if (hasModuleRevision && previousImplementation === undefined) throw new Error("INVALID_PREVIOUS_MODULE_REVISION");
  if (!hasModuleRevision) {
    if (previousCompilationArtifact !== undefined) throw new Error("UNEXPECTED_PREVIOUS_COMPILATION_ARTIFACT");
    return undefined;
  }
  if (previousCompilationArtifact === undefined) throw new Error("MISSING_VERIFIED_PREVIOUS_COMPILATION_ARTIFACT");
  const artifact = readVerifiedModuleCompilationArtifact(previousCompilationArtifact);
  if (artifact.projectKey !== projectKey
    || artifact.planHash !== canonicalModuleCompilationHash(previousPlan)
    || artifact.implementationHash !== canonicalModuleCompilationHash(previousImplementation)) {
    throw new Error("PREVIOUS_COMPILATION_ARTIFACT_BINDING_MISMATCH");
  }
  const sourceModuleIds = sourceModuleIdsFor(previousImplementation!);
  if (!isDeepStrictEqual(artifact.sourceModuleIds, sourceModuleIds)) throw new Error("PREVIOUS_COMPILATION_ARTIFACT_SOURCE_MISMATCH");
  return artifact.metadata;
}

function projectSeedResidueGaps(
  implementation: UIImplementationSpec,
  seeds: readonly { pageId: string; entityId: string; componentHash: string }[],
): ModuleDeliveryGap[] {
  return seeds.flatMap((seed) => {
    const component = implementation.pages.find((page) => page.id === seed.pageId)?.components.find((candidate) => candidate.id === seed.entityId && candidate.sourceModuleId === undefined);
    if (component === undefined || componentCanonicalHash(component) !== seed.componentHash) return [];
    return [Object.freeze({
      moduleId: seed.entityId, requirement: "Remove the verified server-created project seed before delivery.",
      severity: "blocking" as const, status: "unresolved" as const,
      reason: "VERIFIED_PROJECT_SEED_RESIDUE",
      alternatives: ["Have the project-creation service replace the seed through its owned workflow."],
    })];
  });
}

function sourceModuleIdsFor(implementation: UIImplementationSpec): readonly string[] {
  return Object.freeze([...new Set(implementation.pages.flatMap((page) => page.components.flatMap((component) => component.sourceModuleId === undefined ? [] : [component.sourceModuleId])))].sort(compareCodePoints));
}

export function compileModulePlan(input: CompileModulePlanInput): ModuleCompilationOutcome {
  const planInput = requiredOwnDataField(input, "plan", "INVALID_MODULE_PLAN");
  const acceptedHandle = requiredOwnDataField(input, "acceptedBlueprintArtifact", "INVALID_ACCEPTED_BLUEPRINT_ARTIFACT");
  const previousArtifactHandle = optionalOwnDataField(input, "previousCompilationArtifact", "INVALID_PREVIOUS_COMPILATION_ARTIFACT");
  const projectSeedHandle = optionalOwnDataField(input, "projectCreationSeedArtifact", "INVALID_PROJECT_CREATION_SEED_ARTIFACT");
  const parsedPlan = ModulePlanSchema.safeParse(planInput);
  if (!parsedPlan.success) throw new Error(`INVALID_MODULE_PLAN: ${parsedPlan.error.issues[0]?.message ?? "invalid plan"}`);
  const plan = parsedPlan.data;
  const acceptedBlueprint = readVerifiedAcceptedBlueprintArtifact(acceptedHandle);
  if (acceptedBlueprint.projectKey !== plan.projectKey) throw new Error("ACCEPTED_BLUEPRINT_PROJECT_MISMATCH");
  const previousPlan = input.previousPlan === undefined ? undefined : ModulePlanSchema.parse(input.previousPlan);
  const previousImplementation = parsePreviousImplementation(input.previousImplementation);
  const assetsById = parseResolvedAssets(input.assetsById);
  const validationContext = input.validationContext ?? EMPTY_VALIDATION_CONTEXT;
  const previousMetadata = verifiedPreviousMetadata(previousArtifactHandle as VerifiedModuleCompilationArtifact | undefined, plan.projectKey, previousPlan, previousImplementation);
  const projectSeeds = projectSeedHandle === undefined
    ? undefined
    : readVerifiedProjectCreationSeedArtifact(projectSeedHandle);
  if (projectSeeds !== undefined && (projectSeeds.projectKey !== plan.projectKey || projectSeeds.revisionId !== acceptedBlueprint.revisionId)) throw new Error("PROJECT_CREATION_SEED_ARTIFACT_BINDING_MISMATCH");
  const previousModules = previousModuleIndex(previousPlan);
  const previousComponents = previousComponentIndex(previousImplementation);
  const pages: UIImplementationSpec["pages"] = [];
  const traces: ModuleTrace[] = [];
  const gaps: ModuleDeliveryGap[] = [];
  const assetBindings: ResolvedAssetBinding[] = [];
  const seenIds = new Set<string>();

  for (const page of plan.pages) {
    const modules = [...page.modules].sort(compareModulePlacement);
    const validations = new Map<string, ReturnType<ModuleRegistry["validateInstance"]>>();
    for (const instance of modules) {
      const definition = input.registry.require(instance.kind, instance.templateVersion);
      if (requiredAsset(definition.assetSlots) && instance.assetId === undefined) {
        gaps.push(assetGap(instance.id, "blocking", "A required registered asset was not bound to this module."));
        continue;
      }
      const validation = validateModuleInstance(input.registry, instance, plan, validationContext, gaps);
      if (validation !== undefined) validations.set(instance.id, validation);
    }
    const layout = solvePageLayout(page, input.registry);
    const layoutIssues = new Map(layout.issues.map((entry) => [entry.moduleId, entry]));
    const pageComponents: UIComponentSpec[] = [];

    for (const instance of modules) {
      const layoutIssue = layoutIssues.get(instance.id);
      if (layoutIssue !== undefined) {
        gaps.push(layoutIssueGap(layoutIssue));
        continue;
      }
      const bounds = layout.boundsByModuleId[instance.id];
      if (bounds === undefined) {
        gaps.push(layoutGap(instance.id, "LAYOUT_UNASSIGNED", "Module cannot be placed within the page layout."));
        continue;
      }
      const validation = validations.get(instance.id);
      if (validation === undefined) continue;
      gaps.push(...validation.deliveryGaps);
      const resolvedAsset = resolveAsset(instance, assetsById, validation.definition.assetSlots, gaps);
      if (requiredAsset(validation.definition.assetSlots) && resolvedAsset === undefined) {
        continue;
      }
      if (resolvedAsset?.status === "resolved" && instance.assetId !== undefined) {
        assetBindings.push(Object.freeze({
          moduleId: instance.id,
          assetId: instance.assetId,
          ...(resolvedAsset.resolvedName === undefined ? {} : { resolvedName: resolvedAsset.resolvedName }),
        }));
      }

      const compiled = extractModuleCompileOutput(instance.id, validation.definition.compile({
        context: Object.freeze({
          definition: validation.definition,
          instance,
          content: validation.content,
          asset: resolvedAsset,
          validationContext,
          bounds,
        }),
      }));
      const translated = translateModuleOutput(instance, bounds, compiled, plan.theme, seenIds);
      const parsedGaps = parseCompilerGaps(instance, compiled.deliveryGaps);
      gaps.push(...parsedGaps);
      if (translated.length === 0) {
        gaps.push(Object.freeze({ moduleId: instance.id, requirement: "Generate required module controls.", severity: "blocking", status: "unresolved", reason: "MODULE_COMPILER_EMPTY_OUTPUT", alternatives: ["Select a supported module variant."] }));
        continue;
      }
      const prior = reusablePreviousComponents(instance, page.id, bounds, plan.theme, previousPlan?.theme, previousModules, previousComponents, translated);
      const finalComponents = prior ?? translated;
      pageComponents.push(...finalComponents);
      for (const component of finalComponents) {
        const trace = ModuleTraceSchema.parse({ schema: "kf-module-trace/v1", projectKey: plan.projectKey, entries: [{ pageId: page.id, moduleId: instance.id, outputId: component.id }] });
        traces.push(trace);
      }
    }

    if (pageComponents.length === 0) continue;
    pages.push({ id: page.id, width: layout.width, height: layout.height, components: pageComponents });
  }

  const implementation: UIImplementationSpec | undefined = pages.length === plan.pages.length
    ? { schema: "kf-ui-implementation/v1", theme: plan.theme, pages }
    : undefined;
  const parsedImplementation = implementation === undefined ? undefined : UIImplementationSpecSchema.safeParse(implementation);
  if (parsedImplementation !== undefined && !parsedImplementation.success) throw new Error(`INVALID_COMPILED_UI_IMPLEMENTATION: ${parsedImplementation.error.issues[0]?.message ?? "invalid implementation"}`);
  const canonicalImplementation = parsedImplementation === undefined ? undefined : validatePreservedImplementation(preserveLegacyComponents(reuseCanonicalPriorComponents(parsedImplementation.data, plan, previousPlan, previousComponents), previousImplementation));
  if (canonicalImplementation !== undefined && projectSeeds !== undefined) gaps.push(...projectSeedResidueGaps(canonicalImplementation, projectSeeds.seeds));
  const finalGaps = finalizeGaps(gaps);
  const metadata = buildCompilationMetadata(plan, input.registry, assetsById, canonicalImplementation, acceptedBlueprint);
  const diff = canonicalImplementation !== undefined && previousPlan !== undefined && previousImplementation !== undefined
    ? diffModulePlans({ previousPlan, plan, previousImplementation, implementation: canonicalImplementation, assetsById, previousMetadata: previousMetadata!, metadata })
    : undefined;
  if (diff !== undefined && diff.unexpectedChanges.length > 0) throw new UnexpectedModuleChangeError(diff);
  const deliveryReport = evaluateModuleDelivery({
    acceptedBlueprint,
    plan,
    ...(canonicalImplementation === undefined ? {} : { implementation: canonicalImplementation }),
    traces,
    assetBindings,
    gaps: finalGaps,
    registry: input.registry,
    assetsById,
    metadata,
  }).report;
  if (canonicalImplementation === undefined || hasUnresolvedBlockingGap(finalGaps) || deliveryReport.status === "blocked") {
    return Object.freeze({
      status: "blocked",
      traces: Object.freeze(traces),
      assetBindings: Object.freeze(assetBindings),
      gaps: finalGaps,
      metadata,
      ...(canonicalImplementation === undefined ? {} : { implementation: canonicalImplementation }),
      deliveryReport,
      ...(diff === undefined ? {} : { diff }),
    });
  }
  const sourceModuleIds = sourceModuleIdsFor(canonicalImplementation);
  const artifactCandidate = Object.freeze({
    schema: "kf-module-compilation-artifact/v1" as const,
    projectKey: plan.projectKey,
    revisionId: acceptedBlueprint.revisionId,
    acceptedBlueprintHash: acceptedBlueprint.blueprintHash,
    planHash: canonicalModuleCompilationHash(plan),
    implementationHash: canonicalModuleCompilationHash(canonicalImplementation),
    metadataHash: canonicalModuleCompilationHash(metadata),
    sourceModuleIds: [...sourceModuleIds],
    metadata,
  });
  return Object.freeze({
    status: "compiled",
    implementation: canonicalImplementation,
    metadata,
    artifactCandidate,
    traces: Object.freeze(traces),
    assetBindings: Object.freeze(assetBindings),
    gaps: finalGaps,
    deliveryReport,
    ...(diff === undefined ? {} : { diff }),
  });
}

function requiredOwnDataField(input: object, key: PropertyKey, code: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  if (descriptor === undefined || !("value" in descriptor)) throw new Error(code);
  return descriptor.value;
}

function optionalOwnDataField(input: object, key: PropertyKey, code: string): unknown {
  const descriptor = Object.getOwnPropertyDescriptor(input, key);
  if (descriptor === undefined) return undefined;
  if (!("value" in descriptor)) throw new Error(code);
  return descriptor.value;
}

function buildCompilationMetadata(
  plan: ModulePlan,
  registry: ModuleRegistry,
  assetsById: Readonly<Record<string, ResolvedAsset>>,
  implementation: UIImplementationSpec | undefined,
  acceptedBlueprint: AcceptedBlueprintArtifact,
): ModuleCompilationMetadata {
  const moduleDefinitions = plan.pages.flatMap((page) => page.modules.map((module) => {
    const definition = registry.require(module.kind, module.templateVersion);
    return { pageId: page.id, moduleId: module.id, kind: module.kind, templateVersion: module.templateVersion, compilerFingerprint: definition.compilerFingerprint!, layoutFingerprint: definition.layoutFingerprint! };
  }));
  const assets = plan.pages.flatMap((page) => page.modules.flatMap((module) => {
    if (module.assetId === undefined) return [];
    const asset = assetsById[module.assetId] ?? { assetId: module.assetId, status: "unavailable" as const };
    return [{ pageId: page.id, moduleId: module.id, assetId: module.assetId, status: asset.status, assetIdentity: `${asset.assetId}|${asset.status}|${asset.resolvedName ?? ""}` }];
  }));
  const blueprintMappings = deriveBlueprintMappings(acceptedBlueprint, plan, implementation, registry);
  return {
    schema: "kf-module-compilation-metadata/v1", projectKey: plan.projectKey,
    moduleDefinitions, assets, blueprintMappings, generatedSeeds: [],
  };
}

function deriveBlueprintMappings(accepted: AcceptedBlueprintArtifact, plan: ModulePlan, implementation: UIImplementationSpec | undefined, registry: ModuleRegistry): ModuleCompilationMetadata["blueprintMappings"] {
  return accepted.modules.flatMap((blueprintModule) => {
    const matches = plan.pages.flatMap((page) => page.modules.filter((module) => module.sourceBlueprintModuleIds?.includes(blueprintModule.blueprintModuleId)).map((module) => ({ pageId: page.id, module })));
    if (matches.length !== 1) return [];
    const match = matches[0]!;
    const definition = registry.require(match.module.kind, match.module.templateVersion);
    if (definition.kind !== blueprintModule.expectedKind || definition.category !== blueprintModule.expectedCategory) return [];
    const outputs = implementation?.pages.find((page) => page.id === match.pageId)?.components.filter((component) => component.sourceModuleId === match.module.id) ?? [];
    const interactionBindings = (blueprintModule.interactionRequirements ?? []).flatMap((requirement) => {
      const planInteraction = match.module.interactions.find((interaction) => interaction.type === requirement.type && interactionTarget(interaction) === requirement.target);
      const output = outputs.find((component) => actionMatches(component, requirement.actionKind, requirement.target));
      return planInteraction === undefined || output === undefined ? [] : [{ type: requirement.type, actionKind: requirement.actionKind, target: requirement.target, outputId: output.id }];
    });
    return [{ blueprintModuleId: blueprintModule.blueprintModuleId, pageId: match.pageId, moduleId: match.module.id, expectedKind: blueprintModule.expectedKind, expectedCategory: blueprintModule.expectedCategory, interactionBindings }];
  });
}

function interactionTarget(interaction: ModulePlanModule["interactions"][number]): string {
  if (interaction.type === "navigate") return interaction.pageId;
  if (interaction.type === "scroll" || interaction.type === "open-modal") return interaction.moduleId;
  if (interaction.type === "submit") return interaction.action;
  if (interaction.type === "filter") return interaction.field;
  return interaction.target;
}

function actionMatches(component: UIComponentSpec, actionKind: string, target: string): boolean {
  const action = component.properties.action;
  if (action === null || typeof action !== "object" || Array.isArray(action)) return false;
  const value = action as Record<string, unknown>;
  return value.kind === actionKind && (value.pageId === target || value.moduleId === target || value.action === target || value.field === target || value.target === target);
}

function componentCanonicalHash(component: UIComponentSpec): string {
  return `sha256:${canonicalModuleCompilationHash(component)}`;
}

function hasUnresolvedBlockingGap(gaps: readonly ModuleDeliveryGap[]): boolean {
  return gaps.some((gap) => gap.severity === "blocking" && gap.status === "unresolved");
}

function preserveLegacyComponents(
  implementation: UIImplementationSpec,
  previous: UIImplementationSpec | undefined,
): UIImplementationSpec {
  if (previous === undefined) return implementation;
  const pages = implementation.pages.map((page) => ({ ...page, components: [...page.components] }));
  const byPage = new Map(pages.map((page) => [page.id, page]));
  for (const priorPage of previous.pages) {
    const legacy = priorPage.components.filter((component) => component.sourceModuleId === undefined);
    if (legacy.length === 0) continue;
    const page = byPage.get(priorPage.id);
    if (page === undefined) { pages.push({ ...priorPage, components: legacy }); continue; }
    const ids = new Set(page.components.map((component) => component.id));
    for (const component of legacy) if (!ids.has(component.id)) page.components.push(component);
  }
  return { ...implementation, pages };
}

function validatePreservedImplementation(value: UIImplementationSpec): UIImplementationSpec {
  const parsed = UIImplementationSpecSchema.safeParse(value);
  if (!parsed.success) throw new Error("INVALID_PRESERVED_UI_IMPLEMENTATION");
  const ids = new Set<string>();
  for (const page of value.pages) for (const component of page.components) {
    if (ids.has(component.id)) throw new Error(`DUPLICATE_PRESERVED_COMPONENT_ID: ${component.id}`);
    ids.add(component.id);
  }
  return value;
}

function reuseCanonicalPriorComponents(
  implementation: UIImplementationSpec,
  plan: ModulePlan,
  previousPlan: ModulePlan | undefined,
  previousComponents: ReadonlyMap<string, readonly UIComponentSpec[]>,
): UIImplementationSpec {
  if (previousPlan === undefined || stableJson(plan.theme) !== stableJson(previousPlan.theme)) return implementation;
  for (const page of implementation.pages) {
    for (let index = 0; index < page.components.length; index += 1) {
      const component = page.components[index]!;
      const moduleId = component.sourceModuleId;
      if (moduleId === undefined) continue;
      const instance = plan.pages.find((candidate) => candidate.id === page.id)?.modules.find((candidate) => candidate.id === moduleId);
      if (instance === undefined || instance.assetId !== undefined || previousModuleIndex(previousPlan).get(`${page.id}\u0000${moduleId}`) !== stableJson(instance)) continue;
      const prior = previousComponents.get(`${page.id}\u0000${moduleId}`)?.find((candidate) => candidate.id === component.id);
      if (prior !== undefined && isDeepStrictEqual(prior, component)) page.components[index] = prior;
    }
  }
  return implementation;
}

/** Shared deterministic order used for prevalidation, layout-aligned compilation and traces. */
export function compareModulePlacement(left: ModulePlanModule, right: ModulePlanModule): number {
  return compareCodePoints(left.placement.region, right.placement.region)
    || left.placement.order - right.placement.order
    || compareCodePoints(left.id, right.id);
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function requiredAsset(slots: readonly { required: boolean }[]): boolean {
  return slots.some((slot) => slot.required);
}

function resolveAsset(
  instance: ModulePlanModule,
  assetsById: Readonly<Record<string, ResolvedAsset>>,
  slots: readonly { required: boolean }[],
  gaps: ModuleDeliveryGap[],
): ResolvedAsset | undefined {
  if (instance.assetId === undefined) return undefined;
  const resolved = assetsById[instance.assetId];
  if (resolved?.assetId === instance.assetId && resolved.status === "resolved") return resolved;
  gaps.push(assetGap(instance.id, requiredAsset(slots) ? "blocking" : "warning", `Asset ${instance.assetId} is not available to the module compiler.`));
  return undefined;
}

function assetGap(moduleId: string, severity: "warning" | "blocking", reason: string): ModuleDeliveryGap {
  return Object.freeze({
    moduleId,
    requirement: severity === "blocking" ? "Resolve the required module asset." : "Resolve the optional module asset if it is needed.",
    severity,
    status: "unresolved",
    reason,
    alternatives: ["Upload or select a registered asset before building."],
  });
}

function layoutGap(moduleId: string, code: string, reason: string): ModuleDeliveryGap {
  return Object.freeze({ moduleId, requirement: "Place the module within its registered layout contract.", severity: "blocking", status: "unresolved", reason: `${code}: ${reason}`, alternatives: ["Adjust the module placement, span, or variant."] });
}

function layoutIssueGap(issue: PageLayoutIssue): ModuleDeliveryGap {
  return layoutGap(issue.moduleId, issue.code, `Layout solver reported ${issue.code}.`);
}

function translateModuleOutput(
  instance: ModulePlanModule,
  bounds: ModuleBounds,
  compiled: ModuleCompileOutput,
  theme: ModulePlan["theme"],
  seenIds: Set<string>,
): UIComponentSpec[] {
  const output: UIComponentSpec[] = [];
  const localIds = new Set(compiled.components.map((component) => component.id));
  for (const component of compiled.components) {
    assertPlainComponent(component, instance.id);
    const id = stableModuleComponentId(instance.id, component.id);
    if (seenIds.has(id)) throw new Error(`DUPLICATE_STABLE_COMPONENT_ID: ${id}`);
    seenIds.add(id);
    assertSafeComponent(component, id);
    assertLocalBounds(component, bounds, id);
    const role = component.style.role as ModuleThemeRole | undefined;
    const style = resolveModuleComponentStyle(theme, role, component.style);
    const parentId = component.properties.parentId;
    if (parentId !== undefined) {
      if (typeof parentId !== "string" || !localIds.has(parentId) || parentId === component.id) {
        throw new Error(`MODULE_COMPILER_INVALID_PARENT: ${id}`);
      }
      const parent = compiled.components.find((candidate) => candidate.id === parentId);
      if (parent === undefined || !parent.capabilityId.startsWith("layout.")) {
        throw new Error(`MODULE_COMPILER_INVALID_PARENT: ${id}`);
      }
    }
    output.push({
      ...component,
      id,
      sourceModuleId: instance.id,
      geometry: Object.freeze({
        x: bounds.x + component.geometry.x,
        y: bounds.y + component.geometry.y,
        width: component.geometry.width,
        height: component.geometry.height,
      }),
      properties: Object.freeze({
        ...component.properties,
        ...(parentId === undefined ? {} : { parentId: stableModuleComponentId(instance.id, parentId) }),
      }),
      style,
    });
  }
  return output;
}

function assertLocalBounds(component: UIComponentSpec, bounds: ModuleBounds, id: string): void {
  const { x, y, width, height } = component.geometry;
  if (![x, y, width, height].every(Number.isFinite) || x < 0 || y < 0 || width <= 0 || height <= 0 || x + width > bounds.width || y + height > bounds.height) {
    throw new Error(`MODULE_COMPILER_OUTPUT_OUT_OF_BOUNDS: ${id}`);
  }
}

function assertSafeComponent(component: UIComponentSpec, id: string): void {
  if (!component.id || component.id.includes("/") || !isPlainSafe(component) || hasForbiddenPayload(component)) {
    throw new Error(`MODULE_COMPILER_UNSAFE_OUTPUT: ${id}`);
  }
}

function assertPlainComponent(component: UIComponentSpec, id: string): void {
  if (!isPlainData(component)) throw new Error(`MODULE_COMPILER_UNSAFE_OUTPUT: ${id}`);
}

/** Extract untrusted definition output through descriptors before any field access. */
function extractModuleCompileOutput(moduleId: string, value: unknown): ModuleCompileOutput {
  if (value === null || typeof value !== "object") throw new Error(`MODULE_COMPILER_INVALID_OUTPUT: ${moduleId}`);
  const entries = strictObjectEntries(value);
  if (entries === undefined || entries.length !== 2) throw new Error(`MODULE_COMPILER_INVALID_OUTPUT: ${moduleId}`);
  const fields = new Map(entries);
  if (!fields.has("components") || !fields.has("deliveryGaps") || [...fields.keys()].some((key) => key !== "components" && key !== "deliveryGaps")) {
    throw new Error(`MODULE_COMPILER_INVALID_OUTPUT: ${moduleId}`);
  }
  const components = fields.get("components");
  const deliveryGaps = fields.get("deliveryGaps");
  if (!Array.isArray(components) || !Array.isArray(deliveryGaps)) throw new Error(`MODULE_COMPILER_INVALID_OUTPUT: ${moduleId}`);
  const componentValues = strictArrayValues(components);
  const gapValues = strictArrayValues(deliveryGaps);
  if (componentValues === undefined || gapValues === undefined) throw new Error(`MODULE_COMPILER_INVALID_OUTPUT: ${moduleId}`);
  return Object.freeze({ components: componentValues as readonly UIComponentSpec[], deliveryGaps: gapValues as readonly ModuleDeliveryGap[] });
}

function hasForbiddenPayload(value: unknown): boolean {
  if (typeof value === "string") return FORBIDDEN_TEXT.test(value) || GUID_VALUE.test(value) || ABSOLUTE_PATH.test(value);
  if (Array.isArray(value)) {
    const values = strictArrayValues(value);
    return values === undefined || values.some(hasForbiddenPayload);
  }
  if (value === null || typeof value !== "object") return false;
  const entries = strictObjectEntries(value);
  return entries === undefined || entries.some(([key, nested]) => isDangerousKey(key) || hasForbiddenPayload(nested));
}

function isDangerousKey(key: string): boolean {
  if (key === "__proto__" || key === "prototype" || key === "constructor") return true;
  const tokens = key.replace(/([a-z0-9])([A-Z])/g, "$1 $2").split(/[^A-Za-z0-9]+/).filter(Boolean).flatMap((part) => part.toLowerCase() === "styledata" ? ["style", "data"] : [part.toLowerCase()]);
  const forbidden = new Set(["css", "native", "guid", "path", "script"]);
  return tokens.some((token) => forbidden.has(token))
    || tokens.some((token, index) => token === "style" && tokens[index + 1] === "data")
    || tokens.some((token, index) => token === "storage" && tokens[index + 1] === "key")
    || FORBIDDEN_PROPERTY_KEY.test(key);
}

function isPlainObject(value: object): value is Record<string, unknown> {
  const prototype = Reflect.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isPlainSafe(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (Array.isArray(value)) {
    const values = strictArrayValues(value);
    return values !== undefined && values.every(isPlainSafe);
  }
  const entries = strictObjectEntries(value);
  return entries !== undefined && entries.every(([key, nested]) => !isDangerousKey(key) && isPlainSafe(nested));
}

function isPlainData(value: unknown): boolean {
  if (value === null || typeof value !== "object") return true;
  if (Array.isArray(value)) {
    const values = strictArrayValues(value);
    return values !== undefined && values.every(isPlainData);
  }
  const entries = strictObjectEntries(value);
  return entries !== undefined && entries.every(([, nested]) => isPlainData(nested));
}

function strictArrayValues(value: unknown[]): unknown[] | undefined {
  if (Reflect.getPrototypeOf(value) !== Array.prototype) return undefined;
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) return undefined;
  const length = Object.getOwnPropertyDescriptor(value, "length");
  if (length === undefined || length.enumerable || length.configurable || length.writable !== true || !("value" in length) || length.value !== value.length) return undefined;
  if (keys.length !== value.length + 1) return undefined;
  const output: unknown[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return undefined;
    output.push(descriptor.value);
  }
  return output;
}

function strictObjectEntries(value: object): Array<readonly [string, unknown]> | undefined {
  if (!isPlainObject(value)) return undefined;
  const output: Array<readonly [string, unknown]> = [];
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== "string") return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !descriptor.enumerable || !("value" in descriptor)) return undefined;
    output.push([key, descriptor.value]);
  }
  return output;
}

function parseResolvedAssets(input: Readonly<Record<string, ResolvedAsset>>): Readonly<Record<string, ResolvedAsset>> {
  const entries = strictObjectEntries(input);
  if (entries === undefined) throw new Error("INVALID_RESOLVED_ASSETS");
  const output: Record<string, ResolvedAsset> = {};
  for (const [key, value] of entries) {
    if (!isPlainSafe(value) || hasForbiddenPayload(value)) throw new Error(`INVALID_RESOLVED_ASSET: ${key}`);
    const parsed = ResolvedAssetSchema.safeParse(value);
    if (!parsed.success || parsed.data.assetId !== key) throw new Error(`INVALID_RESOLVED_ASSET: ${key}`);
    output[key] = parsed.data;
  }
  return Object.freeze(output);
}

function parsePreviousImplementation(input: UIImplementationSpec | undefined): UIImplementationSpec | undefined {
  if (input === undefined) return undefined;
  if (!isPlainSafe(input) || hasForbiddenPayload(input)) throw new Error("UNSAFE_PREVIOUS_IMPLEMENTATION");
  const parsed = UIImplementationSpecSchema.safeParse(input);
  if (!parsed.success) throw new Error("UNSAFE_PREVIOUS_IMPLEMENTATION");
  // Parsing is the gate; retain the validated object so an unchanged module can
  // preserve its exact component identity instead of a schema-cloned copy.
  return input;
}

function parseCompilerGaps(instance: ModulePlanModule, values: readonly ModuleDeliveryGap[]): ModuleDeliveryGap[] {
  return values.map((value) => {
    if (!isPlainSafe(value) || hasForbiddenPayload(value)) throw new Error(`INVALID_MODULE_DELIVERY_GAP: ${instance.id}`);
    const parsed = ModuleDeliveryGapSchema.safeParse(value);
    if (!parsed.success || parsed.data.moduleId !== instance.id) throw new Error(`INVALID_MODULE_DELIVERY_GAP: ${instance.id}`);
    return parsed.data;
  });
}

function finalizeGaps(values: readonly ModuleDeliveryGap[]): readonly ModuleDeliveryGap[] {
  const unique = new Map<string, ModuleDeliveryGap>();
  for (const value of values) {
    const parsed = ModuleDeliveryGapSchema.parse(value);
    if (parsed.status === "unresolved" && parsed.severity === "info") throw new Error(`INVALID_MODULE_DELIVERY_GAP: ${parsed.moduleId}`);
    unique.set(stableJson(parsed), parsed);
  }
  const ordered = [...unique.values()].sort((left, right) => severityRank(right.severity) - severityRank(left.severity) || compareCodePoints(left.moduleId, right.moduleId) || compareCodePoints(left.requirement, right.requirement));
  if (ordered.length <= 250) return Object.freeze(ordered);
  const firstByModule = new Map<string, ModuleDeliveryGap>();
  for (const gap of ordered) if (!firstByModule.has(gap.moduleId)) firstByModule.set(gap.moduleId, gap);
  if (firstByModule.size > 250) throw new Error("MODULE_DELIVERY_GAP_MODULE_BOUND_EXCEEDED");
  const retained = [...firstByModule.values()].sort((left, right) => compareCodePoints(left.moduleId, right.moduleId));
  return Object.freeze([...retained, ...ordered.filter((gap) => firstByModule.get(gap.moduleId) !== gap)].slice(0, 250));
}

function severityRank(severity: ModuleDeliveryGap["severity"]): number {
  return severity === "blocking" ? 3 : severity === "warning" ? 2 : 1;
}

function validateModuleInstance(
  registry: ModuleRegistry,
  instance: ModulePlanModule,
  plan: ModulePlan,
  context: ModuleValidationContext,
  gaps: ModuleDeliveryGap[],
) {
  try {
    return registry.validateInstance({ instance, assets: plan.assets, context });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MODULE_VALIDATION_FAILED";
    if (!isBlockingCapabilityError(message)) throw error;
    gaps.push(Object.freeze({
      moduleId: instance.id,
      requirement: `Provide the KF capability required by ${instance.kind}.`,
      severity: "blocking",
      status: "unresolved",
      reason: message,
      alternatives: ["Select a registered native module variant or enable the required reviewed capability."],
    }));
    return undefined;
  }
}

function isBlockingCapabilityError(message: string): boolean {
  return message.startsWith("MODULE_KF_CAPABILITY_MISSING:")
    || message.startsWith("MODULE_WEBCONTAINER_DISALLOWED:")
    || message.startsWith("MODULE_WEBCONTAINER_UNAUTHORIZED:");
}

function previousModuleIndex(plan: ModulePlan | undefined): ReadonlyMap<string, string> {
  const index = new Map<string, string>();
  for (const page of plan?.pages ?? []) {
    for (const module of page.modules) index.set(`${page.id}\u0000${module.id}`, stableJson(module));
  }
  return index;
}

function previousComponentIndex(implementation: UIImplementationSpec | undefined): ReadonlyMap<string, readonly UIComponentSpec[]> {
  const index = new Map<string, UIComponentSpec[]>();
  for (const page of implementation?.pages ?? []) {
    for (const component of page.components) {
      if (component.sourceModuleId === undefined) continue;
      const key = `${page.id}\u0000${component.sourceModuleId}`;
      const components = index.get(key) ?? [];
      components.push(component);
      index.set(key, components);
    }
  }
  return index;
}

function reusablePreviousComponents(
  instance: ModulePlanModule,
  pageId: string,
  bounds: ModuleBounds,
  currentTheme: ModulePlan["theme"],
  previousTheme: ModulePlan["theme"] | undefined,
  previousModules: ReadonlyMap<string, string>,
  previousComponents: ReadonlyMap<string, readonly UIComponentSpec[]>,
  translated: readonly UIComponentSpec[],
): readonly UIComponentSpec[] | undefined {
  const key = `${pageId}\u0000${instance.id}`;
  if (previousModules.get(key) !== stableJson(instance) || previousTheme === undefined || stableJson(previousTheme) !== stableJson(currentTheme) || instance.assetId !== undefined) return undefined;
  const prior = previousComponents.get(key);
  if (prior === undefined || prior.length !== translated.length) return undefined;
  const priorIds = prior.map((component) => component.id).sort(compareCodePoints);
  const nextIds = translated.map((component) => component.id).sort(compareCodePoints);
  if (priorIds.some((id, index) => id !== nextIds[index]) || prior.some((component) => !inBounds(component, bounds)) || !isDeepStrictEqual(prior, translated)) return undefined;
  return prior;
}

function inBounds(component: UIComponentSpec, bounds: ModuleBounds): boolean {
  const { x, y, width, height } = component.geometry;
  return x >= bounds.x && y >= bounds.y && x + width <= bounds.x + bounds.width && y + height <= bounds.y + bounds.height;
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort(compareCodePoints).map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
}
