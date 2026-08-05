import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, open as fsOpen, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { ArtifactKind, ArtifactStorage, StoredArtifact } from "./artifact-storage.js";

const TENANT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ARTIFACT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Structured error raised by LocalArtifactStorage. */
export class ArtifactStorageError extends Error {
  constructor(message: string) {
    super(`ARTIFACT_STORAGE_ERROR: ${message}`);
    this.name = "ArtifactStorageError";
  }
}

/**
 * A tenant-scoped, filesystem-backed ArtifactStorage.
 *
 * Layout: `<root>/<tenantId>/<artifactId>` where artifactId is an opaque UUID.
 * Writes go to a create-exclusive temp file (`wx`), are fsynced, and are then
 * atomically renamed into place. Absolute filesystem paths are never exposed
 * through public return types.
 */
export class LocalArtifactStorage implements ArtifactStorage {
  constructor(private readonly rootDir: string) {}

  async put(input: {
    tenantId: string;
    kind: ArtifactKind;
    stream: NodeJS.ReadableStream;
    maxBytes: number;
  }): Promise<StoredArtifact> {
    const { tenantId, kind: _kind, stream, maxBytes } = input;
    assertTenantId(tenantId);
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
      throw new ArtifactStorageError(
        "INVALID_MAX_BYTES: maxBytes must be a positive finite number",
      );
    }

    const tenantDir = this.tenantDir(tenantId);
    await mkdir(tenantDir, { recursive: true });

    const artifactId = randomUUID();
    const tmpPath = path.join(tenantDir, `.put-${artifactId}.tmp`);
    const finalPath = path.join(tenantDir, artifactId);

    let handle: Awaited<ReturnType<typeof fsOpen>> | undefined;
    try {
      // `wx` = create-exclusive: never follows a pre-existing symlink and never
      // clobbers another writer's temp file.
      handle = await fsOpen(tmpPath, "wx", 0o600);
      const hash = createHash("sha256");
      let size = 0;

      for await (const chunk of stream as unknown as AsyncIterable<Buffer | string>) {
        const buf = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
        size += buf.length;
        if (size > maxBytes) {
          throw new ArtifactStorageError(
            `ARTIFACT_TOO_LARGE: artifact exceeds maxBytes=${maxBytes}`,
          );
        }
        hash.update(buf);
        await handle.write(buf);
      }

      await handle.sync();
      await handle.close();
      handle = undefined;
      await rename(tmpPath, finalPath);

      return { artifactId, sha256: hash.digest("hex"), size };
    } finally {
      if (handle !== undefined) {
        await handle.close().catch(() => {});
      }
      await unlink(tmpPath).catch(() => {});
    }
  }

  async open(tenantId: string, artifactId: string): Promise<NodeJS.ReadableStream> {
    const p = this.artifactPath(tenantId, artifactId);
    await stat(p);
    return createReadStream(p);
  }

  async delete(tenantId: string, artifactId: string): Promise<void> {
    const p = this.artifactPath(tenantId, artifactId);
    await unlink(p);
  }

  private tenantDir(tenantId: string): string {
    return this.resolveWithin(tenantId);
  }

  private artifactPath(tenantId: string, artifactId: string): string {
    assertTenantId(tenantId);
    if (!ARTIFACT_ID_RE.test(artifactId)) {
      throw new ArtifactStorageError(
        "INVALID_ARTIFACT_ID: artifactId must be a lowercase UUID",
      );
    }
    return this.resolveWithin(tenantId, artifactId);
  }

  /** Resolves a path and guarantees it stays inside the configured root. */
  private resolveWithin(...parts: string[]): string {
    const root = path.resolve(this.rootDir);
    const resolved = path.resolve(root, ...parts);
    const rel = path.relative(root, resolved);
    if (rel === "" || rel.startsWith("..") || path.isAbsolute(rel)) {
      throw new ArtifactStorageError("UNSAFE_PATH: path escapes the storage root");
    }
    return resolved;
  }
}

function assertTenantId(tenantId: string): void {
  if (!TENANT_ID_RE.test(tenantId)) {
    throw new ArtifactStorageError(
      "INVALID_TENANT_ID: tenantId must match [A-Za-z0-9][A-Za-z0-9._-]{0,63}",
    );
  }
}
