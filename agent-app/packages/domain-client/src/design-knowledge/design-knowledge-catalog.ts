// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
import type { VisualRegion } from "@kf/contracts";
import { getControlCapability, supportsNewVisualGeneration } from "../style/control-capability-registry.js";
import { listGeneratedComponentPropertyNames } from "../implementation/component-properties.js";
// end
import { getStyleAdapter } from "../style/adapters/base-adapters.js";
import { listCompositionRecipes } from "./composition-recipe-registry.js";
import { listControlDesignProfiles } from "./control-design-registry.js";
import { listNativeActionCapabilities } from "./native-action-capability-registry.js";
import { listScriptCapabilityProfiles } from "./script-capability-registry.js";
import { listStyleCapabilityProfiles } from "./style-capability-registry.js";

export interface DesignKnowledgeSnapshot {
  readonly schema: "kf-design-knowledge-catalog/v1";
  readonly version: "1.0.0";
  readonly controlDesignProfiles: ReturnType<typeof listControlDesignProfiles>;
  readonly styleCapabilityProfiles: ReturnType<typeof listStyleCapabilityProfiles>;
  readonly scriptCapabilityProfiles: ReturnType<typeof listScriptCapabilityProfiles>;
  readonly nativeActionCapabilities: ReturnType<typeof listNativeActionCapabilities>;
  readonly compositionRecipes: ReturnType<typeof listCompositionRecipes>;
}

interface DesignKnowledgeSources {
  readonly controlDesignProfiles: ReturnType<typeof listControlDesignProfiles>;
  readonly styleCapabilityProfiles: ReturnType<typeof listStyleCapabilityProfiles>;
  readonly scriptCapabilityProfiles: ReturnType<typeof listScriptCapabilityProfiles>;
  readonly nativeActionCapabilities?: ReturnType<typeof listNativeActionCapabilities>;
  readonly compositionRecipes: ReturnType<typeof listCompositionRecipes>;
}

interface DesignKnowledgeDependencies {
  readonly getControlCapability: (id: string) => unknown;
  readonly getStyleAdapter: (id: string) => unknown;
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function collectListIssues<T>(
  label: string,
  records: readonly T[],
  keyOf: (record: T) => string,
): string[] {
  const issues: string[] = [];
  const ids = records.map(keyOf);
  const seen = new Set<string>();

  for (const id of ids) {
    if (seen.has(id)) issues.push(`${label}: duplicate id ${id}`);
    seen.add(id);
  }

  for (let index = 1; index < ids.length; index += 1) {
    if (compareCodePoints(ids[index - 1]!, ids[index]!) > 0) {
      issues.push(`${label}: ids are not code-point sorted at ${ids[index - 1]} > ${ids[index]}`);
    }
  }

  return issues;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

function collectDesignKnowledgeIssues(
  sources: DesignKnowledgeSources,
  dependencies: DesignKnowledgeDependencies,
): readonly string[] {
  const controlProfiles = sources.controlDesignProfiles;
  const styleProfiles = sources.styleCapabilityProfiles;
  const scriptProfiles = sources.scriptCapabilityProfiles;
  const nativeActionCapabilities = sources.nativeActionCapabilities ?? [];
  const recipes = sources.compositionRecipes;
  const controlProfileIds = new Set(controlProfiles.map((profile) => profile.capabilityId));
  const issues: string[] = [
    ...collectListIssues("control-design", controlProfiles, (profile) => profile.capabilityId),
    ...collectListIssues("style-capability", styleProfiles, (profile) => profile.capabilityId),
    ...collectListIssues("script-capability", scriptProfiles, (profile) => profile.capabilityId),
    ...collectListIssues("native-action-capability", nativeActionCapabilities, (capability) => capability.semanticAction),
    ...collectListIssues("composition-recipe", recipes, (recipe) => recipe.id),
  ];

  for (const profile of controlProfiles) {
    if (dependencies.getControlCapability(profile.capabilityId) === undefined) {
      issues.push(`control-design ${profile.capabilityId}: technical capability not found`);
    }
    for (const companionId of profile.recommendedCompanions) {
      if (!controlProfileIds.has(companionId)) {
        issues.push(`control-design ${profile.capabilityId}: companion profile not found ${companionId}`);
      }
    }
    for (const alternative of profile.alternatives) {
      for (const alternativeId of alternative.capabilityIds) {
        if (!controlProfileIds.has(alternativeId)) {
          issues.push(`control-design ${profile.capabilityId}: alternative profile not found ${alternativeId}`);
        }
      }
    }
  }

  for (const profile of styleProfiles) {
    if (dependencies.getControlCapability(profile.capabilityId) === undefined) {
      issues.push(`style-capability ${profile.capabilityId}: technical capability not found`);
    }
    if (!controlProfileIds.has(profile.capabilityId)) {
      issues.push(`style-capability ${profile.capabilityId}: control design profile not found`);
    }
    if (
      profile.parts.some((part) => part.availability === "supported")
      && dependencies.getStyleAdapter(profile.capabilityId) === undefined
    ) {
      issues.push(`style-capability ${profile.capabilityId}: supported part has no style adapter`);
    }
  }

  for (const profile of scriptProfiles) {
    if (dependencies.getControlCapability(profile.capabilityId) === undefined) {
      issues.push(`script-capability ${profile.capabilityId}: technical capability not found`);
    }
    if (!controlProfileIds.has(profile.capabilityId)) {
      issues.push(`script-capability ${profile.capabilityId}: control design profile not found`);
    }
    for (const action of profile.actions) {
      if (action.availability === "supported" && action.evidence.length === 0) {
        issues.push(`script-capability ${profile.capabilityId}: supported action has no evidence ${action.semanticAction}`);
      }
    }
    for (const event of profile.events) {
      if (event.availability === "supported" && event.evidence.length === 0) {
        issues.push(`script-capability ${profile.capabilityId}: supported event has no evidence ${event.semanticEvent}`);
      }
    }
    for (const method of profile.methods) {
      if (method.availability === "supported" && method.evidence.length === 0) {
        issues.push(`script-capability ${profile.capabilityId}: supported method has no evidence ${method.semanticMethod}`);
      }
    }
  }

  for (const capability of nativeActionCapabilities) {
    if (capability.availability === "supported" && capability.evidence.length === 0) {
      issues.push(`native-action-capability ${capability.semanticAction}: supported action has no evidence`);
    }
  }

  for (const recipe of recipes) {
    const roles = [...recipe.requiredRoles, ...recipe.optionalRoles];
    const seenRoles = new Set<string>();
    for (const role of roles) {
      if (seenRoles.has(role.role)) {
        issues.push(`composition-recipe ${recipe.id}: duplicate role ${role.role}`);
      }
      seenRoles.add(role.role);
      for (const candidateId of role.capabilityCandidates) {
        if (!controlProfileIds.has(candidateId)) {
          issues.push(`composition-recipe ${recipe.id}: candidate profile not found ${candidateId}`);
        }
      }
    }
    for (const substitution of recipe.substitutions) {
      if (!seenRoles.has(substitution.replaceRole)) {
        issues.push(`composition-recipe ${recipe.id}: substitution role not found ${substitution.replaceRole}`);
      }
      for (const candidateId of substitution.withCapabilities) {
        if (!controlProfileIds.has(candidateId)) {
          issues.push(`composition-recipe ${recipe.id}: substitution profile not found ${candidateId}`);
        }
      }
    }
  }

  return Object.freeze([...new Set(issues)].sort(compareCodePoints));
}

function assertIntegrity(
  sources: DesignKnowledgeSources,
  dependencies: DesignKnowledgeDependencies,
): void {
  const issues = collectDesignKnowledgeIssues(sources, dependencies);
  if (issues.length > 0) {
    throw new Error(`DESIGN_KNOWLEDGE_INTEGRITY_FAILED: ${issues.join("; ")}`);
  }
}

const DEFAULT_SOURCES: DesignKnowledgeSources = Object.freeze({
  controlDesignProfiles: listControlDesignProfiles(),
  styleCapabilityProfiles: listStyleCapabilityProfiles(),
  scriptCapabilityProfiles: listScriptCapabilityProfiles(),
  nativeActionCapabilities: listNativeActionCapabilities(),
  compositionRecipes: listCompositionRecipes(),
});

const DEFAULT_DEPENDENCIES: DesignKnowledgeDependencies = Object.freeze({
  getControlCapability,
  getStyleAdapter,
});

/** Test-only access for exercising malformed source combinations without mutating registries. */
export const __designKnowledgeIntegrityTestHooks = Object.freeze({
  collectIssues: collectDesignKnowledgeIssues,
  assertIntegrity,
});

export function assertDesignKnowledgeIntegrity(): void {
  assertIntegrity(DEFAULT_SOURCES, DEFAULT_DEPENDENCIES);
}

assertDesignKnowledgeIntegrity();

const SNAPSHOT: DesignKnowledgeSnapshot = deepFreeze({
  schema: "kf-design-knowledge-catalog/v1",
  version: "1.0.0",
  controlDesignProfiles: DEFAULT_SOURCES.controlDesignProfiles,
  styleCapabilityProfiles: DEFAULT_SOURCES.styleCapabilityProfiles,
  scriptCapabilityProfiles: DEFAULT_SOURCES.scriptCapabilityProfiles,
  nativeActionCapabilities: DEFAULT_SOURCES.nativeActionCapabilities!,
  compositionRecipes: DEFAULT_SOURCES.compositionRecipes,
});

export function getDesignKnowledgeSnapshot(): DesignKnowledgeSnapshot {
  return SNAPSHOT;
}

// modified by jinlong.feng at 2026-10-21 Agent工作台迭代
/** A projection, not a change to v1 catalog content or existing signed plan hashes. */
const VISUAL_ROLE_SEMANTICS: Readonly<Record<VisualRegion["role"], readonly string[]>> = {
  header: ["row-layout"], sidebar: ["column-layout"],
  content: ["row-layout", "column-layout", "dock-layout"], card: ["row-layout", "column-layout"],
  form: ["form-input", "row-layout", "column-layout"], table: ["structured-record-list"], chart: [],
  image: ["media", "portrait", "product-visual"], text: ["heading", "body-copy", "narrative-content"],
  action: ["primary-action", "secondary-action"],
};

export function getVisualCapabilitySurface(capabilityId: string) {
  const technical = getControlCapability(capabilityId);
  if (technical === undefined) return undefined;
  const profile = SNAPSHOT.controlDesignProfiles.find(item => item.capabilityId === capabilityId);
  const style = SNAPSHOT.styleCapabilityProfiles.find(item => item.capabilityId === capabilityId);
  const script = SNAPSHOT.scriptCapabilityProfiles.find(item => item.capabilityId === capabilityId);
  const supportedRoles = (Object.keys(VISUAL_ROLE_SEMANTICS) as VisualRegion["role"][])
    .filter(role => VISUAL_ROLE_SEMANTICS[role].some(semantic => profile?.semanticRoles.includes(semantic)));
  const properties = [
    ...listGeneratedComponentPropertyNames(capabilityId).filter(name => name !== "parentId").map(name => `property:${name}`),
    ...(style?.parts.filter(part => part.availability === "supported")
      .flatMap(part => part.properties.map(property => `style:${part.id}.${property}`)) ?? []),
  ];
  const interactions = script === undefined ? [] : [
    ...script.events.filter(item => item.availability === "supported").map(item => item.semanticEvent),
    ...script.actions.filter(item => item.availability === "supported").map(item => item.semanticAction),
    ...script.methods.filter(item => item.availability === "supported").map(item => item.semanticMethod),
  ];
  return Object.freeze({
    capabilityId, controlType: capabilityId, supportedRoles: Object.freeze(supportedRoles),
    eligible: profile !== undefined && supportsNewVisualGeneration(technical),
    properties: Object.freeze([...new Set(properties)].sort()),
    interactions: Object.freeze([...new Set(interactions)].sort()),
    generationStatus: technical.generation.status, limitations: technical.limitations,
  });
}
// end
