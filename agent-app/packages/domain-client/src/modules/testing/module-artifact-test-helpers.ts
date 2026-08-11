import { canonicalModuleCompilationHash, type CustomerEffectBlueprint, type ModulePlan } from "@kf/contracts";
import {
  createHmacModuleArtifactAuthority,
  type VerifiedAcceptedBlueprintArtifact,
  type VerifiedModuleCompilationArtifact,
} from "@kf/build-jobs";
import type { ModuleCompilationResult } from "../module-compiler.js";
import { createAcceptedBlueprintArtifactPayload } from "../module-compiler.js";
import type { ModuleRegistry } from "../module-registry.js";

export const TEST_MODULE_ARTIFACT_AUTHORITY = createHmacModuleArtifactAuthority(Buffer.alloc(32, 0x63));

export function acceptedArtifactForPlan(plan: ModulePlan, registry: ModuleRegistry, revisionId = "revision-test"): VerifiedAcceptedBlueprintArtifact {
  const byBlueprintId = new Map<string, ModulePlan["pages"][number]["modules"][number]>();
  for (const page of plan.pages) for (const module of page.modules) {
    for (const blueprintId of module.sourceBlueprintModuleIds ?? [module.id]) byBlueprintId.set(blueprintId, module);
  }
  const blueprint: CustomerEffectBlueprint = {
    schema: "kf-design-plan/v2", displayName: "Test blueprint",
    overview: { objective: "Exercise deterministic modules", audiences: ["Tester"], scenarios: ["Compile"], valueProposition: "Deterministic" },
    informationArchitecture: { narrative: "Registered modules", wireframe: "test" },
    modules: [...byBlueprintId.entries()].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0).map(([id, module]) => ({
      id, name: id, purpose: "Exercise module", content: ["Test content"], sampleData: [], interactions: [],
      expectedKind: module.kind, expectedCategory: registry.require(module.kind, module.templateVersion).category,
      interactionRequirements: module.interactions.map((interaction) => ({ type: interaction.type, actionKind: "model-value-is-not-authority", target: interactionTarget(interaction) })),
      presentation: "Deterministic",
    })),
    visualDirection: { tone: "Test", colors: ["Blue"], typography: "Test", spacingAndSurfaces: "Test" },
    highlights: ["Deterministic"], revisionNotes: { added: [], changed: [], retained: [] }, acceptanceCriteria: ["Compiles"], openQuestions: [],
  };
  const signed = TEST_MODULE_ARTIFACT_AUTHORITY.signAcceptedBlueprint(createAcceptedBlueprintArtifactPayload({ blueprint, projectKey: plan.projectKey, revisionId, registry }));
  return TEST_MODULE_ARTIFACT_AUTHORITY.verifyAcceptedBlueprint(JSON.parse(JSON.stringify(signed)), {
    projectKey: plan.projectKey, revisionId, blueprintHash: canonicalModuleCompilationHash(blueprint),
  });
}

export function verifiedCompilationFor(result: ModuleCompilationResult): VerifiedModuleCompilationArtifact {
  const signed = TEST_MODULE_ARTIFACT_AUTHORITY.signModuleCompilation(result.artifactCandidate);
  return TEST_MODULE_ARTIFACT_AUTHORITY.verifyModuleCompilation(JSON.parse(JSON.stringify(signed)));
}

function interactionTarget(interaction: ModulePlan["pages"][number]["modules"][number]["interactions"][number]): string {
  if (interaction.type === "navigate") return interaction.pageId;
  if (interaction.type === "scroll" || interaction.type === "open-modal") return interaction.moduleId;
  if (interaction.type === "submit") return interaction.action;
  if (interaction.type === "filter") return interaction.field;
  return interaction.target;
}
