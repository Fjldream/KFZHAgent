import { describe, expect, it } from "vitest";
import type { DomainMetadata, DomainPack } from "@kf/contracts";
import { DomainRegistry } from "./domain-registry.js";

const clientPack: DomainPack = {
  metadata: {
    kind: "kingclient",
    displayName: "客户端工程",
    supported: true,
    capabilities: { create: true, import: true, modify: true, validate: true, package: true },
  },
  importPackage: async () => ({ id: "workspace-1", rootDir: "/tmp/workspace-1", mode: "base" }),
  inspect: async () => ({}),
  compile: async () => ({ id: "workspace-1", rootDir: "/tmp/workspace-1", mode: "candidate" }),
  patch: async () => ({ id: "workspace-1", rootDir: "/tmp/workspace-1", mode: "candidate" }),
  validate: async () => ({
    status: "pass",
    checks: {
      packageStructure: "pass",
      jsonSchema: "pass",
      references: "pass",
      businessRules: "pass",
      changeScope: "pass",
      roundTrip: "pass"
    },
    warnings: []
  }),
  package: async () => ({
    artifactKind: "kingclient-package",
    domainProjectKind: "kingclient-project",
    mediaType: "application/octet-stream",
    fileExtension: ".zip",
    bytes: new Uint8Array(),
  }),
};

const futureCalculationMetadata: DomainMetadata = {
  kind: "kingcalculation",
  displayName: "计算工程",
  supported: false,
  capabilities: { create: false, import: false, modify: false, validate: false, package: false },
};

describe("DomainRegistry", () => {
  it("resolves a registered domain", () => {
    const registry = new DomainRegistry();
    registry.register(clientPack);
    expect(registry.require("kingclient")).toEqual(clientPack);
  });

  it("returns a registered pack even when native publication is not accepted", () => {
    const registry = new DomainRegistry();
    registry.register({
      ...clientPack,
      metadata: { ...clientPack.metadata, supported: false },
    });

    expect(registry.require("kingclient").metadata.supported).toBe(false);
  });

  it("rejects duplicate registrations", () => {
    const registry = new DomainRegistry();
    registry.register(clientPack);
    expect(() => registry.register(clientPack)).toThrow("domain already registered: kingclient");
  });

  it("reports unsupported metadata without a compiler", () => {
    const registry = new DomainRegistry();
    registry.registerMetadata(futureCalculationMetadata);
    expect(registry.metadata("kingcalculation")).toEqual(futureCalculationMetadata);
  });

  it("rejects require for metadata-only future domains", () => {
    const registry = new DomainRegistry();
    registry.registerMetadata(futureCalculationMetadata);

    expect(() => registry.require("kingcalculation"))
      .toThrow("domain not supported: kingcalculation");
  });
});
