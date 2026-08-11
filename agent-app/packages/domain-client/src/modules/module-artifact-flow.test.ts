import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  canonicalModuleCompilationHash,
  type CustomerEffectBlueprint,
  type ModulePlan,
  type UIComponentSpec,
  type UIImplementationSpec,
} from "@kf/contracts";
import {
  createHmacModuleArtifactAuthority,
  type VerifiedAcceptedBlueprintArtifact,
} from "@kf/build-jobs";
import { compileUiImplementation } from "../implementation/ui-implementation-compiler.js";
import { compileModulePlan, createAcceptedBlueprintArtifactPayload } from "./module-compiler.js";
import { ModuleRegistry, type ModuleDefinition } from "./module-registry.js";

const authority = createHmacModuleArtifactAuthority(Buffer.alloc(32, 0x51));
const theme = {
  background: "#101827", surface: "#1E293B", primary: "#2563EB", accent: "#38BDF8",
  textPrimary: "#F8FAFC", textSecondary: "#94A3B8", fontFamily: "Inter", spacingUnit: 8,
  radiusScale: { small: 4, medium: 8, large: 16 },
} as const;

function definition(): ModuleDefinition {
  return {
    kind: "test-panel", version: "1.0.0", category: "test", maturity: "stable",
    variants: ["default"], contentSchema: z.object({ label: z.string() }), assetSlots: [],
    requiredKfCapabilities: ["text"], compilerFingerprint: "test-panel-compiler-v1",
    layoutFingerprint: "test-panel-layout-v1",
    quality: { minimumComponentCount: 1, minimumCriticalComponentCount: 1, requiredRoles: ["title"], requiredCriticalRoles: ["title"], requiredCapabilityIds: ["text"], variantRequiredOutputs: { default: [{ outputId: "title", role: "title", capabilityId: "text", critical: true }] } },
    layout: { regions: ["main"], minColumnSpan: 1, maxColumnSpan: 12, preferredHeights: ["medium"], interactions: [], height: { min: 120, preferred: { compact: 120, small: 120, medium: 200, large: 320, full: 480 }, max: 480 } },
    compile: ({ context }) => ({ components: [{ id: "title", role: "title", capabilityId: "text", critical: true, content: String(context.content.label), geometry: { x: 10, y: 10, width: 200, height: 32 }, properties: {}, style: { declarations: {}, states: {} } }], deliveryGaps: [] }),
  };
}

function registry(): ModuleRegistry { const value = new ModuleRegistry(); value.register(definition()); return value; }

function blueprint(overrides: Partial<CustomerEffectBlueprint["modules"][number]> = {}): CustomerEffectBlueprint {
  return {
    schema: "kf-design-plan/v2", displayName: "Portal",
    overview: { objective: "Show", audiences: ["User"], scenarios: ["Browse"], valueProposition: "Clear" },
    informationArchitecture: { narrative: "Panel", wireframe: "panel" },
    modules: [{ id: "accepted-panel", name: "Panel", purpose: "Show", content: ["Label"], sampleData: [], interactions: [], expectedKind: "test-panel", expectedCategory: "model-controlled-category", presentation: "Clear", ...overrides }],
    visualDirection: { tone: "Dark", colors: ["Blue"], typography: "Modern", spacingAndSurfaces: "Comfortable" },
    highlights: ["Clear"], revisionNotes: { added: [], changed: [], retained: [] }, acceptanceCriteria: ["Works"], openQuestions: [],
  };
}

function plan(label = "Hello"): ModulePlan {
  return {
    schema: "kf-module-plan/v1", projectKey: "kingclient.portal", theme, assets: [], operations: [],
    pages: [{ id: "home", title: "Home", mode: "vertical-flow", modules: [{
      id: "panel", kind: "test-panel", templateVersion: "1.0.0", variant: "default", title: "Panel",
      content: JSON.stringify({ label }), sourceBlueprintModuleIds: ["accepted-panel"],
      placement: { region: "main", order: 0, columnSpan: 12, preferredHeight: "medium", alignment: "stretch", emphasis: "primary" }, interactions: [],
    }] }],
  };
}

function accepted(revisionId = "revision-1", effect = blueprint()): VerifiedAcceptedBlueprintArtifact {
  const unsigned = createAcceptedBlueprintArtifactPayload({
    blueprint: effect, projectKey: "kingclient.portal", revisionId, registry: registry(),
  });
  const persisted = JSON.parse(JSON.stringify(authority.signAcceptedBlueprint(unsigned)));
  return authority.verifyAcceptedBlueprint(persisted, {
    projectKey: "kingclient.portal", revisionId, blueprintHash: canonicalModuleCompilationHash(effect),
  });
}

function compileFirst(inputPlan = plan(), revisionId = "revision-1") {
  return compileModulePlan({
    plan: inputPlan, acceptedBlueprintArtifact: accepted(revisionId), registry: registry(), assetsById: {},
    validationContext: { availableKfCapabilities: ["text"], approvedAuthorizationRefs: [] },
  });
}

describe("signed module compilation flow", () => {
  it("derives accepted category and interaction action kinds from Registry, not model authority", () => {
    const payload = createAcceptedBlueprintArtifactPayload({
      blueprint: blueprint({ expectedCategory: "wrong" }), projectKey: "kingclient.portal", revisionId: "revision-1", registry: registry(),
    });
    expect(payload.modules).toEqual([{ blueprintModuleId: "accepted-panel", expectedKind: "test-panel", expectedCategory: "test", interactionRequirements: [] }]);
  });

  it("requires legacy text interactions to be reconfirmed as machine requirements", () => {
    expect(() => createAcceptedBlueprintArtifactPayload({
      blueprint: blueprint({ interactions: ["点击进入详情"], interactionRequirements: [] }),
      projectKey: "kingclient.portal", revisionId: "revision-1", registry: registry(),
    })).toThrow("ACCEPTED_BLUEPRINT_INTERACTIONS_NEED_RECONFIRM");
  });

  it("survives JSON persistence and authorizes only the exact compiled implementation", () => {
    const compiled = compileFirst();
    expect(compiled.status).toBe("compiled");
    if (compiled.status !== "compiled") return;
    const signed = authority.signModuleCompilation(compiled.artifactCandidate);
    const persistedSpec = JSON.parse(JSON.stringify(compiled.implementation)) as UIImplementationSpec;
    const verified = authority.verifyModuleCompilation(JSON.parse(JSON.stringify(signed)), {
      projectKey: "kingclient.portal", revisionId: "revision-1",
      planHash: canonicalModuleCompilationHash(plan()), implementationHash: canonicalModuleCompilationHash(persistedSpec),
    });
    expect(() => compileUiImplementation(persistedSpec, {
      workspaceId: "workspace", pageGuidById: { home: "page-guid" }, existingControlGuidByComponentId: {}, existingControlCapabilityIdByComponentId: {},
      moduleCompilationArtifact: verified,
    })).not.toThrow();
    const changed = structuredClone(persistedSpec); changed.pages[0]!.components[0]!.content = "tampered";
    expect(() => compileUiImplementation(changed, {
      workspaceId: "workspace", pageGuidById: { home: "page-guid" }, existingControlGuidByComponentId: {}, existingControlCapabilityIdByComponentId: {},
      moduleCompilationArtifact: verified,
    })).toThrow("MODULE_IMPLEMENTATION_ARTIFACT_HASH_MISMATCH");
  });

  it("requires a verified prior compilation for a revision and forbids it on first compile", () => {
    const first = compileFirst(); expect(first.status).toBe("compiled"); if (first.status !== "compiled") return;
    const previous = authority.verifyModuleCompilation(JSON.parse(JSON.stringify(authority.signModuleCompilation(first.artifactCandidate))));
    const revisedPlan = plan("Revised");
    expect(() => compileModulePlan({
      plan: revisedPlan, acceptedBlueprintArtifact: accepted("revision-2"), previousPlan: plan(), previousImplementation: first.implementation,
      registry: registry(), assetsById: {}, validationContext: { availableKfCapabilities: ["text"], approvedAuthorizationRefs: [] },
    })).toThrow("MISSING_VERIFIED_PREVIOUS_COMPILATION_ARTIFACT");
    expect(compileModulePlan({
      plan: revisedPlan, acceptedBlueprintArtifact: accepted("revision-2"), previousPlan: plan(), previousImplementation: first.implementation,
      previousCompilationArtifact: previous, registry: registry(), assetsById: {}, validationContext: { availableKfCapabilities: ["text"], approvedAuthorizationRefs: [] },
    }).status).toBe("compiled");
    expect(() => compileModulePlan({
      plan: plan(), acceptedBlueprintArtifact: accepted(), previousCompilationArtifact: previous,
      registry: registry(), assetsById: {}, validationContext: { availableKfCapabilities: ["text"], approvedAuthorizationRefs: [] },
    })).toThrow("UNEXPECTED_PREVIOUS_COMPILATION_ARTIFACT");
  });

  it("preserves every legacy control without accepting seed provenance in the V1 compiler", () => {
    const legacy: UIComponentSpec = { id: "Text1", role: "content", capabilityId: "text", critical: true, content: "__KF_SEED_PLACEHOLDER__", geometry: { x: 0, y: 0, width: 100, height: 30 }, properties: {}, style: { declarations: {}, states: {} } };
    const previous: UIImplementationSpec = { schema: "kf-ui-implementation/v1", theme, pages: [{ id: "home", width: 1440, height: 900, components: [legacy] }] };
    const outcome = compileModulePlan({
      plan: plan(), acceptedBlueprintArtifact: accepted(), previousImplementation: previous,
      registry: registry(), assetsById: {}, validationContext: { availableKfCapabilities: ["text"], approvedAuthorizationRefs: [] },
    });
    expect(outcome.gaps).not.toContainEqual(expect.objectContaining({ reason: "VERIFIED_PROJECT_SEED_RESIDUE" }));
    expect(outcome.implementation?.pages[0]!.components.find((component) => component.id === "Text1")).toEqual(legacy);
  });
});
