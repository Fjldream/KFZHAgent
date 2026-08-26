import { createHash, randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { link, mkdir, open as fsOpen, stat, unlink } from "node:fs/promises";
import path from "node:path";
import type { ArtifactKind, ArtifactStorage, StoredArtifact } from "./artifact-storage.js";

const TENANT_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const ARTIFACT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Structured error raised by LocalArtifactStorage. */
export class ArtifactStorageError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(`ARTIFACT_STORAGE_ERROR: ${message}`, options);
    this.name = "ArtifactStorageError";
  }
}

/**
 * A tenant-scoped, filesystem-backed ArtifactStorage.
 *
 * Layout: `<root>/<tenantId>/<artifactId>` where artifactId is an opaque UUID.
 * Writes go to a create-exclusive temp file (`wx`), are fsynced, and are then
 * atomically linked into place. Absolute filesystem paths are never exposed
 * through public return types.
 */
export class LocalArtifactStorage implements ArtifactStorage {
  constructor(private readonly rootDir: string) {}

  async put(input: {
    tenantId: string;
    kind: ArtifactKind;
    artifactId?: string;
    stream: NodeJS.ReadableStream;
    maxBytes: number;
  }): Promise<StoredArtifact> {
    const { tenantId, stream, maxBytes } = input;
    assertTenantId(tenantId);
    if (!Number.isFinite(maxBytes) || maxBytes <= 0) {
      throw new ArtifactStorageError(
        "INVALID_MAX_BYTES: maxBytes must be a positive finite number",
      );
    }

    const tenantDir = this.tenantDir(tenantId);
    await mkdir(tenantDir, { recursive: true });

    const artifactId = input.artifactId ?? randomUUID();
    assertArtifactId(artifactId);
    const tmpPath = path.join(tenantDir, `.put-${artifactId}-${randomUUID()}.tmp`);
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
      const sha256 = hash.digest("hex");
      try {
        // Hard-link publication is create-exclusive and atomic: an existing
        // deterministic key can never be overwritten by a retry or collision.
        await link(tmpPath, finalPath);
        await fsyncDirectory(tenantDir);
      } catch (error) {
        if (!isFileExists(error)) throw error;
        const existing = await inspectArtifact(finalPath);
        if (existing.size !== size || existing.sha256 !== sha256) {
          throw new ArtifactStorageError(
            `ARTIFACT_ID_CONFLICT: artifact ${artifactId} already contains different bytes`,
          );
        }
      }

      return { artifactId, sha256, size };
    } finally {
      if (handle !== undefined) {
        await handle.close().catch(() => {});
      }
      await unlink(tmpPath).catch(() => {});
    }
  }

  async open(tenantId: string, artifactId: string): Promise<NodeJS.ReadableStream> {
    const p = this.artifactPath(tenantId, artifactId);
    // 文件缺失必须抛可辨识的 ArtifactStorageError（而非裸 ENOENT），
    // 让上层（构建/下载）能给出明确错误而不是原始系统错误。
    await stat(p).catch((cause: unknown) => {
      throw new ArtifactStorageError(
        `ARTIFACT_NOT_FOUND: artifact ${artifactId} does not exist in storage`,
        { cause },
      );
    });
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
    assertArtifactId(artifactId);
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

function assertArtifactId(artifactId: string): void {
  if (!ARTIFACT_ID_RE.test(artifactId)) {
    throw new ArtifactStorageError(
      "INVALID_ARTIFACT_ID: artifactId must be a lowercase UUID",
    );
  }
}

function isFileExists(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && error.code === "EEXIST";
}

async function inspectArtifact(filePath: string): Promise<{ sha256: string; size: number }> {
  const metadata = await stat(filePath);
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath) as AsyncIterable<Buffer | string>) {
    hash.update(chunk);
  }
  return { sha256: hash.digest("hex"), size: metadata.size };
}

/**
 * Best-effort fsync of a directory so the publication that just landed is
 * durably recorded. Not supported on every platform, hence errors are ignored
 * (the artifact file itself was already fsynced before the rename).
 */
async function fsyncDirectory(dir: string): Promise<void> {
  let handle: Awaited<ReturnType<typeof fsOpen>> | undefined;
  try {
    handle = await fsOpen(dir, "r");
    await handle.sync();
  } catch {
    // Platform does not support directory fsync; file contents are already
    // fsynced so this is a best-effort durability improvement.
  } finally {
    await handle?.close().catch(() => {});
  }
}
