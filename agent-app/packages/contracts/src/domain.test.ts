import { describe, expect, it } from "vitest";
import {
  normalizeArtifactFileExtension,
  normalizeArtifactMediaType,
  domainMetadataSchema,
  type DomainPack,
  type DomainWorkspace,
} from "./domain.js";

const workspace: DomainWorkspace = {
  id: "workspace-1",
  rootDir: "/tmp/workspace-1",
  mode: "candidate",
};

describe("domain execution contracts", () => {
  it("normalizes artifact response metadata without permitting unsafe extensions", () => {
    expect(normalizeArtifactMediaType("application/zip")).toBe("application/zip");
    expect(normalizeArtifactMediaType("text/plain\r\nX-Evil: injected"))
      .toBe("application/octet-stream");
    expect(normalizeArtifactFileExtension(".ZIP")).toBe(".zip");
    expect(normalizeArtifactFileExtension("../../payload.exe")).toBe(".gz");
  });

  it("accepts metadata for a reserved unsupported domain", () => {
    expect(domainMetadataSchema.parse({
      kind: "kingcalculation",
      displayName: "KingFusion Calculation",
      supported: false,
      capabilities: {
        create: false,
        import: false,
        modify: false,
        validate: false,
        package: false,
      },
    }).kind).toBe("kingcalculation");
  });

  it("defines a pack whose artifact metadata is not client-specific", async () => {
    const pack: DomainPack = {
      metadata: {
        kind: "fake",
        displayName: "Fake",
        supported: true,
        capabilities: {
          create: true,
          import: true,
          modify: true,
          validate: true,
          package: true,
        },
      },
      importPackage: async () => ({ ...workspace, mode: "base" }),
      inspect: async () => ({ entities: [] }),
      compile: async () => workspace,
      patch: async () => workspace,
      validate: async () => ({
        status: "pass",
        checks: {
          packageStructure: "pass",
          jsonSchema: "pass",
          references: "pass",
          businessRules: "pass",
          changeScope: "pass",
          roundTrip: "pass",
        },
        warnings: [],
      }),
      package: async () => ({
        artifactKind: "fake-package",
        domainProjectKind: "fake-project",
        mediaType: "application/octet-stream",
        fileExtension: ".bin",
        bytes: new Uint8Array([1, 2, 3]),
      }),
    };

    expect((await pack.package({ workspace })).artifactKind).toBe("fake-package");
  });
});
