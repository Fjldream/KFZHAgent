import { describe, expect, it } from "vitest";
import {
  AcceptedBlueprintArtifactSchema,
  ModuleCompilationArtifactSchema,
  ModuleCompilationMetadataSchema,
  canonicalModuleCompilationHash,
} from "./module-compilation.js";
import * as moduleCompilationContracts from "./module-compilation.js";

const metadata = {
  schema: "kf-module-compilation-metadata/v1",
  projectKey: "kingclient.portal",
  moduleDefinitions: [{ pageId: "home", moduleId: "hero", kind: "content.hero", templateVersion: "1.0.0", compilerFingerprint: "kf36-content-hero-compiler-v1", layoutFingerprint: "kf36-content-hero-layout-v1" }],
  assets: [{ pageId: "home", moduleId: "hero", assetId: "portrait", status: "resolved", assetIdentity: "portrait|resolved|Portrait" }],
  blueprintMappings: [],
};

describe("ModuleCompilationMetadataSchema", () => {
  it("accepts a strict JSON-safe metadata snapshot", () => {
    expect(ModuleCompilationMetadataSchema.parse(metadata)).toEqual(metadata);
  });

  it("retains server-approved immutable asset facts in signed compilation metadata", () => {
    const sha256 = "1".repeat(64);
    const approvedAsset = {
      workspaceAssetId: "00000000-0000-4000-8000-000000000001",
      targetPath: `project/res/images/${sha256}.png`,
      mediaType: "image/png",
      sha256,
      sizeBytes: 128,
    };
    const input = {
      ...metadata,
      assets: [{ ...metadata.assets[0], assetId: "asset-00000000000040008000000000000001", approvedAsset }],
    };
    expect(ModuleCompilationMetadataSchema.parse(input).assets[0]).toMatchObject({ approvedAsset });
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

  it("rejects duplicate accepted interaction requirements", () => {
    const requirement = accepted.modules[0]!.interactionRequirements[0]!;
    expect(AcceptedBlueprintArtifactSchema.safeParse({
      ...accepted,
      modules: [{ ...accepted.modules[0]!, interactionRequirements: [requirement, requirement] }],
    }).success).toBe(false);
  });

  it("binds compilation metadata and source IDs to canonical hashes", () => {
    expect(ModuleCompilationArtifactSchema.parse(compilation)).toEqual(compilation);
    expect(ModuleCompilationArtifactSchema.safeParse({ ...compilation, metadataHash: sha("wrong") }).success).toBe(false);
    expect(ModuleCompilationArtifactSchema.safeParse({ ...compilation, sourceModuleIds: ["hero", "hero"] }).success).toBe(false);
  });

  it("rejects two accepted requirements bound to the same implementation output", () => {
    const binding = { type: "navigate" as const, actionKind: "navigate", target: "home", outputId: "hero/action" };
    expect(ModuleCompilationMetadataSchema.safeParse({
      ...metadata,
      blueprintMappings: [{
        blueprintModuleId: "hero", pageId: "home", moduleId: "hero",
        interactionBindings: [binding, { ...binding, type: "scroll" as const, actionKind: "scroll", target: "hero" }],
      }],
    }).success).toBe(false);
    expect(ModuleCompilationMetadataSchema.safeParse({
      ...metadata,
      blueprintMappings: ["hero-a", "hero-b"].map((blueprintModuleId) => ({
        blueprintModuleId, pageId: "home", moduleId: "hero", interactionBindings: [binding],
      })),
    }).success).toBe(false);
  });

  it("does not expose project-creation seed minting contracts before the creation service owns provenance", () => {
    expect(moduleCompilationContracts).not.toHaveProperty("ProjectCreationSeedArtifactSchema");
    expect(moduleCompilationContracts).not.toHaveProperty("canonicalProjectCreationSeedArtifactSigningBytes");
    expect(moduleCompilationContracts).not.toHaveProperty("parseProjectCreationSeedArtifactData");
  });
});
