import { lstat, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { unzipSync } from "fflate";

/**
 * 对 KF 原生客户端 `.gz` 包进行安全的 ZIP 兼容处理。
 *
 * KF 客户端导出文件使用 `.gz` 扩展名，但其字节内容是标准 ZIP 容器。所有安全检查（路径穿越、绝对路径、符号链接、Zip 炸弹大小/压缩比限制）都会在解压任何内容之前，依据 ZIP 中央目录完成；fflate 只用作压缩编解码器。
 */

export interface UnzipLimits {
  /** 压缩输入本身的最大大小。 */
  maxCompressedBytes: number;
  /** 所有扩展的条目元数据总大小的最大值。 */
  maxExpandedBytes: number;
  /** 一个档案中最多可以包含的条目数量。 */
  maxFileCount: number;
  /** 任何单个条目路径的最大长度（字符）。 */
  maxPathLength: number;
  /** 每个条目的扩展/压缩比率的最大值（防止炸弹）。 */
  maxCompressionRatio: number;
}

export const DEFAULT_UNZIP_LIMITS: UnzipLimits = {
  maxCompressedBytes: 256 * 1024 * 1024,
  maxExpandedBytes: 512 * 1024 * 1024,
  maxFileCount: 5_000,
  maxPathLength: 1_024,
  maxCompressionRatio: 50,
};

/** 每个拒绝解包时使用的错误。 */
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
 * Decompresses a previously-validated archive into `destDir`, one entry at a
 * time.
 *
 * Each validated entry is expanded with a single `unzipSync(data, { filter })`
 * call that matches only that entry, written to disk, and then released before
 * the next entry is decompressed. Peak memory is therefore bounded by the
 * largest single entry (plus the input buffer) and does not grow linearly with
 * the total number of entries — unlike a batch-unzip that holds every payload
 * until the whole archive has been expanded.
 *
 * Safety model (kept intact):
 *  - `parseZipEntries` pre-validates the whole central directory (paths,
 *    symlinks, per-entry and total size, ratio, count) before any expansion;
 *  - after each real expansion the actual bytes are accumulated and re-checked
 *    against `maxExpandedBytes`, and the entry size is compared to the value
 *    declared in the central directory;
 *  - `extractedCount` must match the validated entry count;
 *  - `writeEntry` refuses any write that traverses a pre-existing symlink.
 */
export async function safeUnzip(
  data: Uint8Array,
  destDir: string,
  limits: UnzipLimits,
): Promise<void> {
  const entries = parseZipEntries(data, limits);
  await mkdir(destDir, { recursive: true });

  let expanded = 0;
  let extractedCount = 0;

  for (const entry of entries) {
    const result = unzipSync(data, {
      filter: (file) => file.name === entry.name,
    });
    const payload = result[entry.name];
    if (payload === undefined) {
      throw new PackageUnpackError(`corrupt ZIP: entry could not be extracted (${entry.name})`);
    }
    if (payload.length !== entry.uncompressedSize) {
      throw new PackageUnpackError(
        `corrupt ZIP: entry size mismatch (${entry.name})`,
      );
    }

    expanded += payload.length;
    if (expanded > limits.maxExpandedBytes) {
      throw new PackageUnpackError(
        `expanded size exceeds limit (${expanded} > ${limits.maxExpandedBytes})`,
      );
    }

    extractedCount += 1;
    await writeEntry(destDir, entry.name, payload);
  }

  if (extractedCount !== entries.length) {
    throw new PackageUnpackError("corrupt ZIP: entry count mismatch after extraction");
  }
}
