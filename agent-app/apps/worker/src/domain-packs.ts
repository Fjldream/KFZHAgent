import { createKingClientDomainPack } from "@kf/domain-client";
import type { DomainMetadata } from "@kf/contracts";
import { DomainRegistry } from "@kf/domain-registry";

const FUTURE_DOMAIN_CAPABILITIES = Object.freeze({
  create: false,
  import: false,
  modify: false,
  validate: false,
  package: false,
});

export const FUTURE_DOMAIN_METADATA: readonly DomainMetadata[] = Object.freeze([
  Object.freeze({
    kind: "kingcalculation",
    displayName: "KingFusion Calculation",
    supported: false,
    capabilities: FUTURE_DOMAIN_CAPABILITIES,
  }),
  Object.freeze({
    kind: "kingdbconnector",
    displayName: "KingFusion DB Connector",
    supported: false,
    capabilities: FUTURE_DOMAIN_CAPABILITIES,
  }),
  Object.freeze({
    kind: "kingioserver",
    displayName: "KingFusion IO Server",
    supported: false,
    capabilities: FUTURE_DOMAIN_CAPABILITIES,
  }),
  Object.freeze({
    kind: "kingalarm",
    displayName: "KingFusion Alarm",
    supported: false,
    capabilities: FUTURE_DOMAIN_CAPABILITIES,
  }),
]);

export function createWorkerDomainRegistry(options: {
  kingClientNativeAccepted: boolean;
}): DomainRegistry {
  const registry = new DomainRegistry();
  registry.register(
    createKingClientDomainPack({
      nativeAccepted: options.kingClientNativeAccepted,
    }),
  );

  for (const metadata of FUTURE_DOMAIN_METADATA) {
    registry.registerMetadata(metadata);
  }
  return registry;
}
