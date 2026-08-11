import { describe, expect, it } from "vitest";
import {
  AcceptedBlueprintArtifactSchema,
  ModuleCompilationArtifactSchema,
  ModuleCompilationMetadataSchema,
  ProjectCreationSeedArtifactSchema,
  canonicalModuleCompilationHash,
} from "./module-compilation.js";

const metadata = {
  schema: "kf-module-compilation-metadata/v1",
  projectKey: "kingclient.portal",
  moduleDefinitions: [{ pageId: "home", moduleId: "hero", kind: "content.hero", templateVersion: "1.0.0", compilerFingerprint: "kf36-content-hero-compiler-v1", layoutFingerprint: "kf36-content-hero-layout-v1" }],
  assets: [{ pageId: "home", moduleId: "hero", assetId: "portrait", status: "resolved", assetIdentity: "portrait|resolved|Portrait" }],
  blueprintMappings: [],
  generatedSeeds: [{ pageId: "home", entityId: "Text1", generator: "new-project", schema: "kf-seed/v1", componentHash: "sha256:0123456789abcdef", projectCreationMarker: "project-create-001" }],
};

describe("ModuleCompilationMetadataSchema", () => {
  it("accepts a strict JSON-safe metadata snapshot", () => {
    expect(ModuleCompilationMetadataSchema.parse(metadata)).toEqual(metadata);
  });

  it("rejects duplicate module ownership and undeclared fields", () => {
    expect(ModuleCompilationMetadataSchema.safeParse({ ...metadata, moduleDefinitions: [...metadata.moduleDefinitions, { ...metadata.moduleDefinitions[0] }] }).success).toBe(false);
    expect(ModuleCompilationMetadataSchema.safeParse({ ...metadata, nativePath: "/tmp/kf" }).success).toBe(false);
  });
});

const sha = (value: string) => canonicalModuleCompilationHash(value);

describe("signed module artifact contracts", () => {
  const accepted = {
    schema: "kf-accepted-blueprint-artifact/v1" as const,
    projectKey: "kingclient.portal",
    revisionId: "revision-1",
    blueprintHash: sha("blueprint"),
    modules: [{
      blueprintModuleId: "hero",
      expectedKind: "content.hero",
      expectedCategory: "content",
      interactionRequirements: [{
        type: "navigate" as const,
        actionKind: "navigate",
        target: "projects",
      }],
    }],
    signature: "0".repeat(64),
  };
  const compilation = {
    schema: "kf-module-compilation-artifact/v1" as const,
    projectKey: "kingclient.portal",
    revisionId: "revision-1",
    acceptedBlueprintHash: accepted.blueprintHash,
    planHash: sha("plan"),
    implementationHash: sha("implementation"),
    metadataHash: canonicalModuleCompilationHash(metadata),
    sourceModuleIds: ["hero"],
    metadata,
    signature: "0".repeat(64),
  };

  it("stores exact accepted module and machine interaction requirements", () => {
    expect(AcceptedBlueprintArtifactSchema.parse(accepted)).toEqual(accepted);
    expect(AcceptedBlueprintArtifactSchema.safeParse({
      ...accepted,
      modules: [{ ...accepted.modules[0]!, interactionRequirementsHash: sha("hidden") }],
    }).success).toBe(false);
  });

  it("binds compilation metadata and source IDs to canonical hashes", () => {
    expect(ModuleCompilationArtifactSchema.parse(compilation)).toEqual(compilation);
    expect(ModuleCompilationArtifactSchema.safeParse({ ...compilation, metadataHash: sha("wrong") }).success).toBe(false);
    expect(ModuleCompilationArtifactSchema.safeParse({ ...compilation, sourceModuleIds: ["hero", "hero"] }).success).toBe(false);
  });

  it("represents project-creation seeds as a separate signed artifact", () => {
    const seed = {
      schema: "kf-project-creation-seed-artifact/v1" as const,
      projectKey: "kingclient.portal",
      revisionId: "revision-1",
      seeds: [{
        pageId: "home",
        entityId: "Text1",
        generator: "new-project" as const,
        schema: "kf-seed/v1" as const,
        componentHash: `sha256:${"a".repeat(64)}`,
        projectCreationMarker: "project-create-001",
      }],
      signature: "0".repeat(64),
    };
    expect(ProjectCreationSeedArtifactSchema.parse(seed)).toEqual(seed);
    expect(ProjectCreationSeedArtifactSchema.safeParse({ ...seed, seeds: [...seed.seeds, seed.seeds[0]!] }).success).toBe(false);
  });
});
