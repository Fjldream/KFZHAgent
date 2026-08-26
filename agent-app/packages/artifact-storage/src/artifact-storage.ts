/**
 * Private artifact storage contract.
 *
 * Artifacts are tenant-scoped blobs identified by an opaque artifactId. The
 * storage implementation never exposes absolute paths through these public
 * return types: callers interact with opaque identifiers only.
 */

/**
 * The kind of a private artifact stored per tenant.
 *
 * Domain packs own this value, so it must remain open to future domain
 * artifact formats instead of enumerating today's client-only formats here.
 */
export type ArtifactKind = string;

/** Result of a successful artifact write. */
export type StoredArtifact = {
  artifactId: string;
  sha256: string;
  size: number;
};

export interface ArtifactStorage {
  /**
   * Writes the readable stream as a new artifact, returning an opaque
   * artifactId plus integrity metadata. The stream is rejected with
   * `ARTIFACT_TOO_LARGE` if it exceeds `maxBytes`.
   */
  put(input: {
    tenantId: string;
    kind: ArtifactKind;
    /** Optional server-issued key. Repeating it with identical bytes must be idempotent. */
    artifactId?: string;
    stream: NodeJS.ReadableStream;
    maxBytes: number;
  }): Promise<StoredArtifact>;
  /** Opens the artifact contents as a readable stream. */
  open(tenantId: string, artifactId: string): Promise<NodeJS.ReadableStream>;
  /** Deletes the artifact. */
  delete(tenantId: string, artifactId: string): Promise<void>;
}

/**
 * A client workspace is a worker-local directory containing an unpacked KF
 * client project. `rootDir` is an internal worker-only path and must never be
 * serialized into an API response or LangGraph state.
 */
export type ClientWorkspace = {
  id: string;
  rootDir: string;
  mode: "source" | "candidate";
  sourceArtifactId?: string;
};
