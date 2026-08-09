import { describe, expect, it } from "vitest";
import {
  createWorkerDomainRegistry,
  FUTURE_DOMAIN_METADATA,
} from "./domain-packs.js";

describe("createWorkerDomainRegistry", () => {
  it.each([false, true])("forwards native acceptance as %s", (nativeAccepted) => {
    const registry = createWorkerDomainRegistry({
      kingClientNativeAccepted: nativeAccepted,
    });

    expect(registry.require("kingclient").metadata.kind).toBe("kingclient");
    expect(registry.metadata("kingclient").supported).toBe(nativeAccepted);
  });

  it("registers the real KingClient pack that validates compile input", async () => {
    const registry = createWorkerDomainRegistry({
      kingClientNativeAccepted: false,
    });

    await expect(
      registry.require("kingclient").compile({
        projectIr: {},
        buildSeed: "registry-test",
      }),
    ).rejects.toThrow();
  });

  it.each([
    "kingcalculation",
    "kingdbconnector",
    "kingioserver",
    "kingalarm",
  ])("reserves %s as unsupported metadata", (kind) => {
    const registry = createWorkerDomainRegistry({
      kingClientNativeAccepted: false,
    });

    expect(registry.metadata(kind)).toMatchObject({
      kind,
      supported: false,
      capabilities: {
        create: false,
        import: false,
        modify: false,
        validate: false,
        package: false,
      },
    });
    expect(() => registry.require(kind)).toThrow(`domain not supported: ${kind}`);
  });

  it("exports immutable future-domain metadata with no capabilities", () => {
    expect(Object.isFrozen(FUTURE_DOMAIN_METADATA)).toBe(true);
    expect(FUTURE_DOMAIN_METADATA).toHaveLength(4);
    expect(FUTURE_DOMAIN_METADATA.every(Object.isFrozen)).toBe(true);
    expect(FUTURE_DOMAIN_METADATA.every((metadata) => Object.isFrozen(metadata.capabilities)))
      .toBe(true);
  });
});
