import { describe, expect, it } from "vitest";
import {
  createWorkerDomainRegistry,
  FUTURE_DOMAIN_METADATA,
} from "./domain-packs.js";

describe("createWorkerDomainRegistry", () => {
  it("registers an executable KingClient pack", () => {
    const registry = createWorkerDomainRegistry({
      kingClientNativeAccepted: false,
    });

    expect(registry.require("kingclient").metadata.kind).toBe("kingclient");
    expect(registry.metadata("kingclient").supported).toBe(false);
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

    expect(registry.metadata(kind)).toMatchObject({ kind, supported: false });
    expect(() => registry.require(kind)).toThrow(`domain not supported: ${kind}`);
  });

  it("exports immutable future-domain metadata with no capabilities", () => {
    expect(Object.isFrozen(FUTURE_DOMAIN_METADATA)).toBe(true);
    expect(FUTURE_DOMAIN_METADATA).toHaveLength(4);
    expect(FUTURE_DOMAIN_METADATA).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          capabilities: {
            create: false,
            import: false,
            modify: false,
            validate: false,
            package: false,
          },
        }),
      ]),
    );
  });
});
