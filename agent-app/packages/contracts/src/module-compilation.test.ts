import { describe, expect, it } from "vitest";
import { ModuleCompilationMetadataSchema } from "./module-compilation.js";

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
