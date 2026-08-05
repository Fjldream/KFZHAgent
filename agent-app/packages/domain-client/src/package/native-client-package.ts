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
 * KF native client package IO.
 *
 * A native client `.gz` file is a ZIP container holding exactly one version
 * directory (`x.y.z.w`) plus optional, allow-listed top-level metadata. This
 * module provides safe import (unpacking) and deterministic packaging.
 */

/** Normalized timestamp for every entry so identical inputs pack identically. */
export const PACKAGE_FIXED_MTIME = new Date("2020-01-01T00:00:00.000Z");

const VERSION_DIR_RE = /^\d+\.\d+\.\d+\.\d+$/;

/** Top-level metadata files allowed next to the version directory. */
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

/** Path segments excluded from packaged output. */
const EXCLUDED_PATH_SEGMENTS = new Set([
  "pagerecord",
  ".kf-agent",
  ".git",
  ".svn",
  ".hg",
  "node_modules",
]);

/** Basenames excluded from packaged output. */
const EXCLUDED_BASENAMES = new Set([".ds_store", "thumbs.db"]);

const ZIP_LEVEL = 6;
const FILE_MODE = 0o644 << 16;
const DIR_MODE = 0o755 << 16;

export interface ImportNativeClientPackageOptions {
  /** Overrides for the safe-unzip limits (merged over defaults). */
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
 * and pagerecord / Agent-private metadata is excluded. Packing the same input
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
    zipSync(zippable, {
      mtime: PACKAGE_FIXED_MTIME,
      os: 3,
      level: ZIP_LEVEL,
    }),
  );
}
