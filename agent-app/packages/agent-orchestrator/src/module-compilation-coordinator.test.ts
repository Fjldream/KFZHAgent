import { describe, expect, it } from "vitest";
import { z } from "zod";
import { canonicalModuleCompilationHash, type CustomerEffectBlueprint, type ModulePlan } from "@kf/contracts";
import { createHmacModuleArtifactAuthority } from "@kf/build-jobs";
import {
  compileModulePlan,
  compileUiImplementation,
  createAcceptedBlueprintArtifactPayload,
  ModuleRegistry,
  type ModuleDefinition,
} from "@kf/domain-client";
import { ModuleCompilationCoordinator } from "./module-compilation-coordinator.js";

const authority = createHmacModuleArtifactAuthority(Buffer.alloc(32, 0x45));
const theme = { background: "#101827", surface: "#1E293B", primary: "#2563EB", accent: "#38BDF8", textPrimary: "#F8FAFC", textSecondary: "#94A3B8", fontFamily: "Inter", spacingUnit: 8, radiusScale: { small: 4, medium: 8, large: 16 } } as const;

function registry(): ModuleRegistry {
  const value = new ModuleRegistry();
  const definition: ModuleDefinition = {
    kind: "test.panel", version: "1.0.0", category: "test", maturity: "stable", variants: ["default"],
    contentSchema: z.object({ title: z.string() }), assetSlots: [], requiredKfCapabilities: ["text"],
    compilerFingerprint: "test-panel-compiler-v1", layoutFingerprint: "test-panel-layout-v1",
    layout: { regions: ["main"], minColumnSpan: 1, maxColumnSpan: 12, preferredHeights: ["medium"], interactions: [], height: { min: 120, preferred: { compact: 120, small: 160, medium: 200, large: 300, full: 400 }, max: 400 } },
    compile: ({ context }) => ({ components: [{ id: "title", role: "title", capabilityId: "text", critical: true, content: String(context.content.title), geometry: { x: 10, y: 10, width: 200, height: 32 }, properties: {}, style: { declarations: {}, states: {} } }], deliveryGaps: [] }),
  };
  value.register(definition); return value;
}

function plan(title = "First"): ModulePlan {
  return { schema: "kf-module-plan/v1", projectKey: "project", theme, assets: [], operations: [], pages: [{ id: "home", title: "Home", mode: "vertical-flow", modules: [{ id: "panel", kind: "test.panel", templateVersion: "1.0.0", variant: "default", title, content: JSON.stringify({ title }), sourceBlueprintModuleIds: ["blueprint-panel"], placement: { region: "main", order: 0, columnSpan: 12, preferredHeight: "medium", alignment: "stretch", emphasis: "primary" }, interactions: [] }] }] };
}

function blueprint(): CustomerEffectBlueprint {
  return { schema: "kf-design-plan/v2", displayName: "Test", overview: { objective: "Test", audiences: ["Tester"], scenarios: ["Compile"], valueProposition: "Safe" }, informationArchitecture: { narrative: "Panel", wireframe: "Panel" }, modules: [{ id: "blueprint-panel", name: "Panel", purpose: "Test", content: ["Title"], sampleData: [], interactions: [], expectedKind: "test.panel", expectedCategory: "model-is-not-authority", presentation: "Panel" }], visualDirection: { tone: "Test", colors: ["Blue"], typography: "Test", spacingAndSurfaces: "Test" }, highlights: ["Safe"], revisionNotes: { added: [], changed: [], retained: [] }, acceptanceCriteria: ["Compiles"], openQuestions: [] };
}

function accepted(inputRegistry: ModuleRegistry, revisionId = "revision-1") {
  const value = blueprint();
  const signed = authority.signAcceptedBlueprint(createAcceptedBlueprintArtifactPayload({ blueprint: value, projectKey: "project", revisionId, registry: inputRegistry }));
  return { signed, blueprintHash: canonicalModuleCompilationHash(value) };
}

function coordinator(inputRegistry: ModuleRegistry) {
  return new ModuleCompilationCoordinator(authority, {
    compile: async (input) => compileModulePlan({ ...input, registry: inputRegistry, assetsById: {}, validationContext: { availableKfCapabilities: ["text"], approvedAuthorizationRefs: [] } }),
  }, {
    compile: async ({ workspaceId, spec, previousSpec, moduleCompilationArtifact }) => compileUiImplementation(spec, { workspaceId, pageGuidById: { home: "page-home" }, existingControlGuidByComponentId: {}, existingControlCapabilityIdByComponentId: {}, ...(previousSpec === undefined ? {} : { previousImplementation: previousSpec }), ...(moduleCompilationArtifact === undefined ? {} : { moduleCompilationArtifact }) }),
  });
}

describe("ModuleCompilationCoordinator", () => {
  it("compiles without a current artifact, then signs, checkpoints, verifies and feeds the verified current artifact to UI compilation", async () => {
    const inputRegistry = registry(); const confirmed = accepted(inputRegistry); const currentPlan = plan();
    const result = await coordinator(inputRegistry).compile({ projectKey: "project", revisionId: "revision-1", acceptedBlueprintHash: confirmed.blueprintHash, acceptedBlueprintArtifact: confirmed.signed, plan: currentPlan, workspaceId: "workspace", editableEntities: [] });
    expect(result.status).toBe("compiled"); if (result.status !== "compiled") return;
    expect(result.moduleCompilationArtifact.planHash).toBe(canonicalModuleCompilationHash(currentPlan));
    expect(JSON.parse(JSON.stringify(result.moduleCompilationArtifact))).toEqual(result.moduleCompilationArtifact);
    expect(result.uiCompilation.plan.operations).toContainEqual(expect.objectContaining({ op: "create", entityId: "panel/title" }));
  });

  it("rejects accepted-artifact binding mismatch before invoking the compiler", async () => {
    const inputRegistry = registry(); const confirmed = accepted(inputRegistry); let calls = 0;
    const service = new ModuleCompilationCoordinator(authority, { compile: async () => { calls += 1; throw new Error("should not compile"); } }, { compile: async () => { throw new Error("should not compile UI"); } });
    await expect(service.compile({ projectKey: "project", revisionId: "wrong", acceptedBlueprintHash: confirmed.blueprintHash, acceptedBlueprintArtifact: confirmed.signed, plan: plan(), workspaceId: "workspace", editableEntities: [] })).rejects.toThrow("ACCEPTED_BLUEPRINT_BINDING_MISMATCH");
    expect(calls).toBe(0);
  });

  it("verifies a persisted previous artifact before revision compilation", async () => {
    const inputRegistry = registry(); const firstAccepted = accepted(inputRegistry); const service = coordinator(inputRegistry);
    const first = await service.compile({ projectKey: "project", revisionId: "revision-1", acceptedBlueprintHash: firstAccepted.blueprintHash, acceptedBlueprintArtifact: firstAccepted.signed, plan: plan(), workspaceId: "workspace", editableEntities: [] });
    expect(first.status).toBe("compiled"); if (first.status !== "compiled") return;
    const secondAccepted = accepted(inputRegistry, "revision-2");
    const second = await service.compile({ projectKey: "project", revisionId: "revision-2", acceptedBlueprintHash: secondAccepted.blueprintHash, acceptedBlueprintArtifact: secondAccepted.signed, plan: plan("Revised"), previousPlan: plan(), previousImplementation: first.outcome.implementation, previousCompilationArtifact: JSON.parse(JSON.stringify(first.moduleCompilationArtifact)), workspaceId: "workspace", editableEntities: [] });
    expect(second.status).toBe("compiled");
  });
});
