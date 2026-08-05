import type { DomainKind, DomainMetadata, DomainPack } from "@kf/contracts";

type RegistryEntry =
  | { type: "pack"; pack: DomainPack }
  | { type: "metadata"; metadata: DomainMetadata };

export class DomainRegistry {
  readonly #entries = new Map<DomainKind, RegistryEntry>();

  register(pack: DomainPack): void {
    if (this.#entries.has(pack.kind)) {
      throw new Error(`domain already registered: ${pack.kind}`);
    }
    this.#entries.set(pack.kind, { type: "pack", pack });
  }

  registerMetadata(metadata: DomainMetadata): void {
    if (this.#entries.has(metadata.kind)) {
      throw new Error(`domain already registered: ${metadata.kind}`);
    }
    this.#entries.set(metadata.kind, { type: "metadata", metadata });
  }

  require(kind: DomainKind): DomainPack {
    const entry = this.#entries.get(kind);
    if (!entry) {
      throw new Error(`domain not registered: ${kind}`);
    }
    if (entry.type !== "pack") {
      throw new Error(`domain not supported: ${kind}`);
    }
    return entry.pack;
  }

  metadata(kind: DomainKind): DomainMetadata {
    const entry = this.#entries.get(kind);
    if (!entry) {
      throw new Error(`domain not registered: ${kind}`);
    }
    return entry.type === "pack" ? entry.pack : entry.metadata;
  }

  has(kind: DomainKind): boolean {
    return this.#entries.has(kind);
  }

  kinds(): DomainKind[] {
    return [...this.#entries.keys()];
  }
}
