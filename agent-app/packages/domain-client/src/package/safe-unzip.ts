import { lstat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { Unzip, UnzipInflate } from "fflate";

/**
 * Safe ZIP-compatible handling for KF native client `.gz` packages.
 *
 * KF client exports use a `.gz` extension but the bytes are a standard ZIP
 * container. All safety checks (path traversal, absolute paths, symlinks,
 * zip-bomb size/ratio limits) are implemented here against the ZIP central
 * directory before any content is decompressed; fflate is only used as the
 * compression codec.
 */

export interface UnzipLimits {
  /** Maximum size of the compressed input itself. */
  maxCompressedBytes: number;
  /** Maximum total size of all expanded entry payloads. */
  maxExpandedBytes: number;
  /** Maximum number of entries in one archive. */
  maxFileCount: number;
  /** Maximum length of any single entry path (characters). */
  maxPathLength: number;
  /** Maximum expanded/compressed ratio per entry (zip-bomb guard). */
  maxCompressionRatio: number;
}

export const DEFAULT_UNZIP_LIMITS: UnzipLimits = {
  maxCompressedBytes: 256 * 1024 * 1024,
  maxExpandedBytes: 512 * 1024 * 1024,
  maxFileCount: 5_000,
  maxPathLength: 1_024,
  maxCompressionRatio: 50,
};

/** Error used for every rejected unpack, prefixed per the task brief. */
export class PackageUnpackError extends Error {
  constructor(message: string) {
    super(`PACKAGE_UNPACK_FAILED: ${message}`);
    this.name = "PackageUnpackError";
  }
}

export interface ParsedZipEntry {
  /** Entry name using forward slashes; directory entries end with `/`. */
  name: string;
  compressedSize: number;
  uncompressedSize: number;
  isDirectory: boolean;
  isSymlink: boolean;
}

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const S_IFLNK = 0o120000;
const S_IFDIR = 0o040000;

function readU16(data: Uint8Array, offset: number): number {
  return (data[offset] ?? 0) | ((data[offset + 1] ?? 0) << 8);
}

function readU32(data: Uint8Array, offset: number): number {
  return (
    ((data[offset] ?? 0) |
      ((data[offset + 1] ?? 0) << 8) |
      ((data[offset + 2] ?? 0) << 16) |
      ((data[offset + 3] ?? 0) << 24)) >>>
    0
  );
}

function decodeEntryName(bytes: Uint8Array): string {
  const name = new TextDecoder("utf-8").decode(bytes);
  if (name.includes("\uFFFD")) {
    throw new PackageUnpackError("unsafe entry path: non-UTF-8 filename");
  }
  return name;
}

function isAbsoluteName(name: string): boolean {
  if (name.startsWith("/") || name.startsWith("\\")) return true;
  // C:\... and drive-relative variants like C:foo are both Windows-absolute.
  return /^[A-Za-z]:/.test(name);
}

function validateEntryName(name: string, limits: UnzipLimits): void {
  if (name.length === 0) {
    throw new PackageUnpackError("unsafe entry path: empty name");
  }
  if (name.length > limits.maxPathLength) {
    throw new PackageUnpackError(
      `path length exceeds limit (${name.length} > ${limits.maxPathLength})`,
    );
  }
  if (isAbsoluteName(name)) {
    throw new PackageUnpackError("unsafe entry path: absolute path");
  }
  // eslint-disable-next-line no-control-regex
  if (name.includes("\0") || /[\x00-\x1f\x7f]/.test(name)) {
    throw new PackageUnpackError("unsafe entry path: illegal characters in name");
  }

  const segments = name.replace(/\\/g, "/").split("/");
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (seg === ".." || seg === ".") {
      throw new PackageUnpackError("unsafe entry path");
    }
    if (seg === "" && i !== segments.length - 1) {
      throw new PackageUnpackError("unsafe entry path: empty path segment");
    }
  }
}

/**
 * Parses and validates the ZIP central directory without decompressing any
 * payload. Every safety limit is enforced here so malicious archives are
 * rejected before a single entry is expanded.
 */
export function parseZipEntries(data: Uint8Array, limits: UnzipLimits): ParsedZipEntry[] {
  if (data.length > limits.maxCompressedBytes) {
    throw new PackageUnpackError(
      `compressed size exceeds limit (${data.length} > ${limits.maxCompressedBytes})`,
    );
  }

  const eocd = findEndOfCentralDirectory(data);
  const count = readU16(data, eocd + 10);
  const centralSize = readU32(data, eocd + 12);
  const centralOffset = readU32(data, eocd + 16);

  if (count === 0xffff || centralSize === 0xffffffff || centralOffset === 0xffffffff) {
    throw new PackageUnpackError("ZIP64 archives are not supported");
  }
  if (count > limits.maxFileCount) {
    throw new PackageUnpackError(
      `file count exceeds limit (${count} > ${limits.maxFileCount})`,
    );
  }
  if (centralOffset + centralSize > data.length) {
    throw new PackageUnpackError("corrupt ZIP: central directory out of bounds");
  }

  const entries: ParsedZipEntry[] = [];
  let pos = centralOffset;
  let totalExpanded = 0;

  for (let i = 0; i < count; i += 1) {
    if (pos + 46 > data.length || readU32(data, pos) !== CEN_SIG) {
      throw new PackageUnpackError("corrupt ZIP: invalid central directory entry");
    }
    const method = readU16(data, pos + 10);
    const compressedSize = readU32(data, pos + 20);
    const uncompressedSize = readU32(data, pos + 24);
    const nameLen = readU16(data, pos + 28);
    const extraLen = readU16(data, pos + 30);
    const commentLen = readU16(data, pos + 32);
    const externalAttrs = readU32(data, pos + 38);

    const nameBytes = data.subarray(pos + 46, pos + 46 + nameLen);
    pos += 46 + nameLen + extraLen + commentLen;

    const name = decodeEntryName(nameBytes);
    validateEntryName(name, limits);

    const mode = externalAttrs >>> 16;
    const isSymlink = (mode & S_IFLNK) === S_IFLNK;
    const isDirectory = name.endsWith("/") || (mode & S_IFDIR) === S_IFDIR;

    if (isSymlink) {
      throw new PackageUnpackError(`symlink entries are not allowed: ${name}`);
    }
    if (method !== 0 && method !== 8) {
      throw new PackageUnpackError(
        `unsupported compression method ${method} for entry ${name}`,
      );
    }
    if (compressedSize > 0 && uncompressedSize / compressedSize > limits.maxCompressionRatio) {
      throw new PackageUnpackError(
        `compression ratio exceeds limit for entry ${name}`,
      );
    }

    totalExpanded += uncompressedSize;
    if (totalExpanded > limits.maxExpandedBytes) {
      throw new PackageUnpackError(
        `expanded size exceeds limit (${totalExpanded} > ${limits.maxExpandedBytes})`,
      );
    }

    entries.push({
      name,
      compressedSize,
      uncompressedSize,
      isDirectory,
      isSymlink,
    });
  }

  return entries;
}

function findEndOfCentralDirectory(data: Uint8Array): number {
  // The EOCD record is 22 bytes plus an optional comment (max 65535 bytes).
  const min = Math.max(0, data.length - 22 - 65535);
  for (let i = data.length - 22; i >= min; i -= 1) {
    if (readU32(data, i) === EOCD_SIG) {
      return i;
    }
  }
  throw new PackageUnpackError("not a ZIP archive (end of central directory not found)");
}

function resolveWithin(root: string, name: string): string {
  const target = path.resolve(root, name);
  const rel = path.relative(path.resolve(root), target);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new PackageUnpackError("unsafe entry path");
  }
  return target;
}

function isErrno(err: unknown, code: string): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === code
  );
}

/**
 * Rejects writes that would traverse an already-existing symlink or file
 * component under `root`. Only components that already exist are checked; the
 * first missing component terminates the walk because nothing below it can
 * exist yet in a fresh unpack. This closes the "pre-seeded symlink directory"
 * escape (a string-level resolveWithin cannot see through symlinks).
 */
async function assertSafeAncestors(root: string, relPath: string): Promise<void> {
  const normalized = relPath.replace(/\\/g, "/").replace(/\/+$/, "");
  const segments = normalized.split("/").filter((seg) => seg.length > 0);
  let current = path.resolve(root);

  for (const seg of segments) {
    current = path.join(current, seg);
    let st;
    try {
      st = await lstat(current);
    } catch (err) {
      if (isErrno(err, "ENOENT")) return; // nothing below this can exist yet
      throw err;
    }
    if (st.isSymbolicLink()) {
      throw new PackageUnpackError(
        `unsafe entry path: symlink component in destination path (${relPath})`,
      );
    }
    if (!st.isDirectory()) {
      throw new PackageUnpackError(
        `unsafe entry path: non-directory component in destination path (${relPath})`,
      );
    }
  }
}

/**
 * Writes one entry to disk. Called serially per entry (see safeUnzip) so at
 * most one entry's payload is held in memory at a time.
 */
async function writeEntry(destDir: string, relPath: string, data: Uint8Array): Promise<void> {
  const target = resolveWithin(destDir, relPath);
  await assertSafeAncestors(destDir, relPath);
  if (relPath.endsWith("/")) {
    await mkdir(target, { recursive: true });
  } else {
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data, { mode: 0o644 });
  }
}

/**
 * Decompresses a previously-validated archive into `destDir`. Enforces the
 * expanded-size limit again against the actual decompressed bytes in case the
 * central directory sizes were tampered with. Directory entries end with `/`.
 */
export async function safeUnzip(
  data: Uint8Array,
  destDir: string,
  limits: UnzipLimits,
): Promise<void> {
  const entries = parseZipEntries(data, limits);
  await mkdir(destDir, { recursive: true });

  const unzipper = new Unzip();
  unzipper.register(UnzipInflate);
  let failed: Error | null = null;
  let expanded = 0;
  let extractedCount = 0;
  // Serial chain: entries are written to disk one after another as soon as
  // each one finishes decompressing, so peak memory is bounded by the largest
  // single entry instead of the whole archive (defends against a 512MB peak).
  let writeChain: Promise<void> = Promise.resolve();

  unzipper.onfile = (file) => {
    if (failed !== null) {
      file.terminate();
      return;
    }
    const name = file.name;
    try {
      validateEntryName(name, limits);
    } catch (err) {
      failed = err instanceof Error ? err : new PackageUnpackError("unsafe entry path");
      file.terminate();
      return;
    }

    const chunks: Uint8Array[] = [];
    file.ondata = (err, dataChunk, final) => {
      if (failed !== null) return;
      if (err !== null) {
        failed = new PackageUnpackError(`corrupt entry ${name}: ${String(err)}`);
        return;
      }
      if (dataChunk !== null) {
        expanded += dataChunk.length;
        if (expanded > limits.maxExpandedBytes) {
          failed = new PackageUnpackError(
            `expanded size exceeds limit (${expanded} > ${limits.maxExpandedBytes})`,
          );
          file.terminate();
          return;
        }
        chunks.push(dataChunk);
      }
      if (final && failed === null) {
        extractedCount += 1;
        const payload = Buffer.concat(chunks);
        writeChain = writeChain
          .then(() => writeEntry(destDir, name, payload))
          .catch((writeErr: unknown) => {
            const writeError =
              writeErr instanceof Error ? writeErr : new PackageUnpackError("write failed");
            failed = writeError;
            throw writeError;
          });
      }
    };
    file.start();
  };

  unzipper.push(data, true);
  if (failed !== null) throw failed as Error;
  await writeChain;
  if (failed !== null) throw failed as Error;

  // Sanity check: the entries we actually decoded must match the validated list.
  if (extractedCount !== entries.length) {
    throw new PackageUnpackError("corrupt ZIP: entry count mismatch after extraction");
  }
}
