import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm } from "node:fs/promises";
import path from "node:path";
import { zipSync } from "fflate";
import type { ZipOptions } from "fflate";
import {
  DEFAULT_UNZIP_LIMITS,
  PackageUnpackError,
  parseZipEntries,
  safeUnzip,
  type ParsedZipEntry,
  type UnzipLimits,
} from "./safe-unzip.js";

/**
 * KF 客户端包文件系统。
 *
 * 一个客户端`.gz` 文件是一个 ZIP 容器，包含一个精确版本目录（`x.y.z.w`）以及可选的允许列表顶部元数据。本模块提供安全导入（解压缩）和确定性包装。
 */

/** 每个条目中的标准化时间戳，以确保相同的输入打包相同的内容。 */
export const PACKAGE_FIXED_MTIME = new Date("2020-01-01T00:00:00.000Z");

const VERSION_DIR_RE = /^\d+\.\d+\.\d+\.\d+$/;

/** 允许在版本目录旁边的所有顶级元数据文件。 */
const ALLOWED_TOP_LEVEL_METADATA = new Set([
  "readme.md",
  "readme.txt",
  "description.md",
  "description.txt",
  "license",
  "license.md",
  "license.txt",
  "manifest.json",
  "metadata.json",
  "package.json",
]);

/** 打包输出中排除的路径段。 */
const EXCLUDED_PATH_SEGMENTS = new Set([
  // pagerecord 骨架（pageRecordManager.json/空 recordpages）由编译器生成、
  // KF 打开工程必需，必须打进产物；排除它会导致每次部署都要手动补。
  // （recordpages/recyclepages 在编译产物中为空目录，无历史记录内容。）
  ".kf-agent",
  ".git",
  ".svn",
  ".hg",
  "node_modules",
]);

/** 打包输出中排除的基名。 */
const EXCLUDED_BASENAMES = new Set([".ds_store", "thumbs.db"]);

const ZIP_LEVEL = 6;
const FILE_MODE = 0o644 << 16;
const DIR_MODE = 0o755 << 16;

// ZIP记录签名和DOS时间/日期布局。
const LOCAL_SIG = 0x04034b50;
const CEN_SIG = 0x02014b50;
const EOCD_SIG = 0x06054b50;
// 2020-01-01（UTC）的固定 DOS 日期：((2020-1980) << 9) | (1 << 5) | 1 = 0x5021。DOS 时间为 0（00:00:00）。按字节直接写入，避免归档结果依赖打包主机的本地时区。
const DOS_DATE_FIXED = 0x5021;

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

function writeU16(data: Uint8Array, offset: number, value: number): void {
  data[offset] = value & 0xff;
  data[offset + 1] = (value >>> 8) & 0xff;
}

function locateEndOfCentralDirectory(data: Uint8Array): number {
  const min = Math.max(0, data.length - 22 - 65535);
  for (let i = data.length - 22; i >= min; i -= 1) {
    if (readU32(data, i) === EOCD_SIG) return i;
  }
  throw new Error("not a ZIP archive (end of central directory not found)");
}

/**
 * 使用固定值覆盖每个本地文件头和中央目录项中的 DOS 时间/日期字段。fflate 通过主机本地时区对这些字段编码（参见其 wzh() 辅助函数）；如果不进行此规范化，同一输入在不同 TZ 设置下会打包成不同字节，从而破坏跨机器的 SHA-256 完整性。
 *
 * 布局说明：本地文件头将 DOS 时间存储在 +10、日期存储在 +12；中央目录项则分别存储在 +12/+14，因为它在签名后多了一个两字节的“version made by”字段。
 */
function normalizeZipTimestamps(data: Uint8Array): Uint8Array {
  const eocd = locateEndOfCentralDirectory(data);
  const count = readU16(data, eocd + 10);
  const centralOffset = readU32(data, eocd + 16);
  let pos = centralOffset;

  for (let i = 0; i < count; i += 1) {
    if (readU32(data, pos) !== CEN_SIG) {
      throw new Error("corrupt ZIP during timestamp normalization");
    }
    // 中央目录条目：+12的DOS时间，+14的DOS日期。
    writeU16(data, pos + 12, 0);
    writeU16(data, pos + 14, DOS_DATE_FIXED);

    // 与CEN条目中存储的+42相对应的本地文件头。
    const localOffset = readU32(data, pos + 42);
    if (readU32(data, localOffset) !== LOCAL_SIG) {
      throw new Error("corrupt ZIP during timestamp normalization");
    }
    // 本地文件头：+10的DOS时间，+12的DOS日期。
    writeU16(data, localOffset + 10, 0);
    writeU16(data, localOffset + 12, DOS_DATE_FIXED);

    const nameLen = readU16(data, pos + 28);
    const extraLen = readU16(data, pos + 30);
    const commentLen = readU16(data, pos + 32);
    pos += 46 + nameLen + extraLen + commentLen;
  }

  return data;
}

export interface ImportNativeClientPackageOptions {
  /** 为安全解压限制设置的覆盖值（合并到默认值中）。 */
  limits?: Partial<UnzipLimits>;
}

function topLevelSegment(name: string): string {
  return name.split("/")[0] ?? "";
}

function validatePackageStructure(entries: ParsedZipEntry[]): { versionDir: string } {
  const topLevelFiles = new Map<string, ParsedZipEntry[]>();
  for (const entry of entries) {
    const seg = topLevelSegment(entry.name);
    const list = topLevelFiles.get(seg);
    if (list === undefined) topLevelFiles.set(seg, [entry]);
    else list.push(entry);
  }

  const versionDirs = [...topLevelFiles.keys()].filter((seg) => VERSION_DIR_RE.test(seg));
  if (versionDirs.length !== 1) {
    throw new PackageUnpackError(
      `expected exactly one version directory, found ${versionDirs.length}`,
    );
  }
  const versionDir = versionDirs[0] ?? "";

  for (const seg of topLevelFiles.keys()) {
    if (seg === versionDir) continue;
    if (!ALLOWED_TOP_LEVEL_METADATA.has(seg.toLowerCase())) {
      throw new PackageUnpackError(`top-level metadata not allowed: ${seg}`);
    }
    const segEntries = topLevelFiles.get(seg);
    if (segEntries !== undefined && segEntries.some((e) => e.isDirectory || e.name.endsWith("/"))) {
      throw new PackageUnpackError(`top-level metadata must be a file: ${seg}`);
    }
  }

  return { versionDir };
}

/**
 * Safely imports a native client package (ZIP container with a `.gz` extension)
 * into a fresh directory under `destDir` and returns that directory path.
 * The unpack happens into a hidden temp directory which is atomically renamed
 * only after every entry has passed validation and decompression.
 */
export async function importNativeClientPackage(
  pkg: Uint8Array,
  destDir: string,
  options?: ImportNativeClientPackageOptions,
): Promise<string> {
  const limits: UnzipLimits = { ...DEFAULT_UNZIP_LIMITS, ...options?.limits };
  const entries = parseZipEntries(pkg, limits);
  validatePackageStructure(entries);

  await mkdir(destDir, { recursive: true });
  const unpackId = randomUUID();
  const tmpDir = path.join(destDir, `.unpack-${unpackId}.tmp`);
  const finalDir = path.join(destDir, unpackId);

  try {
    await safeUnzip(pkg, tmpDir, limits);
    await rename(tmpDir, finalDir);
  } catch (err) {
    await rm(tmpDir, { recursive: true, force: true }).catch(() => {});
    throw err;
  }
  return finalDir;
}

interface CollectedFile {
  relPath: string;
  data: Uint8Array;
}

async function collectProjectFiles(projectDir: string): Promise<{
  files: CollectedFile[];
  dirs: string[];
}> {
  const files: CollectedFile[] = [];
  const dirs: string[] = [];

  async function walk(currentDir: string, rel: string): Promise<void> {
    const entries = await readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const name = entry.name;
      if (EXCLUDED_PATH_SEGMENTS.has(name.toLowerCase())) continue;
      const nextRel = rel === "" ? name : `${rel}/${name}`;
      if (entry.isDirectory()) {
        dirs.push(nextRel);
        await walk(path.join(currentDir, name), nextRel);
      } else if (entry.isFile()) {
        if (EXCLUDED_BASENAMES.has(name.toLowerCase())) continue;
        // pagerecord 的用户历史记录内容（recordpages/recyclepages 下的页面
        // 快照）不打包——骨架文件（pageRecordManager.json/recyclePageManager.json）
        // 由编译器生成且 KF 必需，必须保留。
        const recordSegs = nextRel.split("/");
        if (
          recordSegs.includes("pagerecord") &&
          (recordSegs.includes("recordpages") || recordSegs.includes("recyclepages"))
        ) {
          continue;
        }
        files.push({ relPath: nextRel, data: await readFile(path.join(currentDir, name)) });
      }
      // Symbolic links are intentionally not followed during packaging.
    }
  }

  await walk(projectDir, "");
  return { files, dirs };
}

/**
 * Deterministically packages a client project directory into a ZIP container
 * (to be stored with a `.gz` extension). Entries are sorted lexically, all
 * timestamps are normalized to PACKAGE_FIXED_MTIME, permissions are stable,
 * and Agent-private metadata is excluded. Packing the same input
 * twice yields byte-identical output.
 */
export async function packageNativeClientProject(projectDir: string): Promise<Buffer> {
  const { files, dirs } = await collectProjectFiles(projectDir);

  const sorted: Array<{ relPath: string; data: Uint8Array; isDir: boolean }> = [
    ...files.map((f) => ({ relPath: f.relPath, data: f.data, isDir: false })),
    ...dirs.map((d) => ({ relPath: `${d}/`, data: new Uint8Array(0), isDir: true })),
  ].sort((a, b) => (a.relPath < b.relPath ? -1 : a.relPath > b.relPath ? 1 : 0));

  const zippable: Record<string, Uint8Array | [Uint8Array, ZipOptions]> = {};
  for (const item of sorted) {
    zippable[item.relPath] = [
      item.data,
      {
        mtime: PACKAGE_FIXED_MTIME,
        os: 3,
        attrs: item.isDir ? DIR_MODE : FILE_MODE,
        level: ZIP_LEVEL,
      },
    ];
  }

  return Buffer.from(
    normalizeZipTimestamps(
      zipSync(zippable, {
        mtime: PACKAGE_FIXED_MTIME,
        os: 3,
        level: ZIP_LEVEL,
      }),
    ),
  );
}
